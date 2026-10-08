// Processamento de um pedido da Loja depois que o pagamento confirma.
// Chamado pelo asaas-webhook (PAYMENT_RECEIVED/CONFIRMED com boletos.pedido_id)
// e por loja-pedido-status?force=1 (consulta direta ao Asaas).
//
// Idempotente: a transição aguardando_pagamento -> pago é feita com UPDATE
// condicional. Segunda chamada não encontra linha e sai sem efeito.

import {
  calcularProximoVencimento, hojeISO, fmtBRL, fmtData, soDigitos,
  enviarWhatsAppConta, avisarGestor, carregarTemplate, aplicarVariaveis,
} from './loja.ts'

const FORMA_PAGAMENTO: Record<string, string> = {
  PIX: 'PIX', CREDIT_CARD: 'Cartão de crédito', DEBIT_CARD: 'Cartão de débito', BOLETO: 'Boleto', UNDEFINED: 'Boleto',
}

const TEMPLATE_PADRAO_PEDIDO =
`Olá, {{nomeCliente}}! ✅

Recebemos seu pagamento de *{{item}}* ({{valor}}) na *{{nomeEmpresa}}*.

{{detalhes}}

Qualquer dúvida é só responder por aqui. Obrigado! 🙌`

function formatarDataHora(iso: string | null | undefined) {
  if (!iso) return ''
  const d = new Date(iso)
  return d.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }) + ' às ' +
    d.toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' })
}

// Porte de ContratosSection.substituirVariaveis (só o que a loja tem à mão).
function substituirVariaveisContrato(conteudo: string, devedor: any, empresa: any, plano: any) {
  const fmtVal = (v: any) => fmtBRL(v)
  const enderecoEmpresa = [empresa?.endereco && `${empresa.endereco}${empresa.numero ? ', ' + empresa.numero : ''}`, empresa?.bairro,
    empresa?.cidade && empresa?.estado ? `${empresa.cidade}/${empresa.estado}` : empresa?.cidade].filter(Boolean).join(', ')
  const dadosEmpresa = [empresa?.nome_empresa, empresa?.cpf_cnpj, enderecoEmpresa, empresa?.telefone, empresa?.email_empresa || empresa?.email].filter(Boolean).join(', ')
  const dadosCliente = [devedor?.nome, devedor?.cpf && `CPF ${devedor.cpf}`, devedor?.telefone, devedor?.email].filter(Boolean).join(', ')
  const pares: Record<string, string> = {
    dadosCliente, dadosEmpresa,
    nomeCliente: devedor?.nome || '', cpfCliente: devedor?.cpf || '', telefoneCliente: devedor?.telefone || '',
    emailCliente: devedor?.email || '', dataNascimento: fmtData(devedor?.data_nascimento),
    nomeResponsavel: devedor?.responsavel_nome || '', telefoneResponsavel: devedor?.responsavel_telefone || '',
    enderecoCompletoCliente: [devedor?.endereco, devedor?.numero, devedor?.bairro, devedor?.cidade].filter(Boolean).join(', '),
    enderecoCliente: devedor?.endereco || '', numeroCliente: devedor?.numero || '', complementoCliente: devedor?.complemento || '',
    bairroCliente: devedor?.bairro || '', cidadeCliente: devedor?.cidade || '', estadoCliente: devedor?.estado || '', cepCliente: devedor?.cep || '',
    nomePlano: plano?.nome || '', valorPlano: fmtVal(plano?.valor),
    nomeEmpresa: empresa?.nome_empresa || '', dataAtual: new Date().toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }),
  }
  let out = conteudo
  for (const [k, v] of Object.entries(pares)) out = out.split(`{{${k}}}`).join(v)
  return out
}

export interface ResultadoProcessamento {
  processado: boolean
  motivo?: string
  status?: string
}

export async function processarPedidoLoja(supabase: any, pedidoId: string, payment: any, origem: 'webhook' | 'consulta'): Promise<ResultadoProcessamento> {
  const agora = new Date().toISOString()
  const dataPagamento = (payment?.paymentDate || payment?.confirmedDate || agora).slice(0, 10)
  const valorPago = payment?.value != null ? Number(payment.value) : null
  const formaPagamento = FORMA_PAGAMENTO[payment?.billingType] || payment?.billingType || 'PIX'

  // 1. Transição idempotente
  const { data: pedido } = await supabase
    .from('loja_pedidos')
    .update({ status: 'pago', pago_em: agora, asaas_payment_id: payment?.id || undefined })
    .eq('id', pedidoId)
    .eq('status', 'aguardando_pagamento')
    .select('*')
    .maybeSingle()

  if (!pedido) {
    const { data: atual } = await supabase.from('loja_pedidos').select('status').eq('id', pedidoId).maybeSingle()
    return { processado: false, motivo: 'ja_processado', status: atual?.status }
  }
  console.log(`🛒 Pedido ${pedido.id} pago (${origem}) — tipo ${pedido.tipo}`)

  // A cobrança em `boletos` também vira paga aqui, para o caminho da consulta direta
  // ("Já paguei") ficar igual ao do webhook.
  if (payment?.id) {
    await supabase.from('boletos').update({
      status: payment.status || 'RECEIVED',
      data_pagamento: payment.paymentDate || agora,
      valor_pago: valorPago ?? Number(pedido.valor),
      forma_pagamento: payment.billingType || undefined,
      updated_at: agora,
    }).eq('asaas_id', payment.id)
  }

  const [{ data: produto }, { data: devedor }, { data: empresa }] = await Promise.all([
    supabase.from('loja_produtos').select('*, planos(id, nome, valor, ciclo_cobranca, tipo, numero_aulas)').eq('id', pedido.produto_id).maybeSingle(),
    supabase.from('devedores').select('*').eq('id', pedido.devedor_id).maybeSingle(),
    supabase.from('usuarios').select('id, nome_empresa, telefone, email, email_empresa, cpf_cnpj, endereco, numero, bairro, cidade, estado').eq('id', pedido.user_id).maybeSingle(),
  ])

  const valor = valorPago ?? Number(pedido.valor)
  let statusFinal = 'concluido'
  const detalhes: string[] = []
  let mensalidadeId: string | null = null
  let cobrancaId: string | null = null
  let contratoId: string | null = null

  try {
    // 2. Materializar por tipo
    if (pedido.tipo === 'plano' && devedor) {
      const plano = produto?.planos
      const hoje = hojeISO()
      const proximo = calcularProximoVencimento(hoje, plano?.ciclo_cobranca)

      await supabase.from('devedores').update({
        assinatura_ativa: true,
        plano_id: plano?.id || produto?.plano_id || devedor.plano_id,
        experimental: false,
        data_inicio_assinatura: devedor.data_inicio_assinatura || hoje,
      }).eq('id', devedor.id)

      // Última mensalidade do aluno para numerar a sequência
      const { data: ultima } = await supabase
        .from('mensalidades')
        .select('numero_mensalidade')
        .eq('devedor_id', devedor.id)
        .or('lixo.is.null,lixo.eq.false')
        .order('numero_mensalidade', { ascending: false })
        .limit(1)
        .maybeSingle()
      const n = (ultima?.numero_mensalidade || 0) + 1

      const { data: paga } = await supabase.from('mensalidades').insert({
        user_id: pedido.user_id, devedor_id: devedor.id,
        valor: Number(pedido.valor), valor_pago: valor,
        data_vencimento: hoje, data_pagamento: dataPagamento,
        status: 'pago', forma_pagamento: formaPagamento,
        is_mensalidade: true, numero_mensalidade: n,
        descricao: `Loja: ${pedido.item_nome}`,
      }).select('id').single()
      mensalidadeId = paga?.id || null

      // Próxima mensalidade pendente no ciclo do plano (se ainda não houver)
      const { data: jaExiste } = await supabase
        .from('mensalidades')
        .select('id')
        .eq('devedor_id', devedor.id)
        .eq('data_vencimento', proximo)
        .or('lixo.is.null,lixo.eq.false')
        .limit(1)
        .maybeSingle()
      if (!jaExiste) {
        await supabase.from('mensalidades').insert({
          user_id: pedido.user_id, devedor_id: devedor.id,
          valor: Number(plano?.valor ?? pedido.valor), data_vencimento: proximo,
          status: 'pendente', is_mensalidade: true, numero_mensalidade: n + 1,
          recorrencia: { isRecurring: true, recurrenceType: 'monthly', startDate: hoje },
        })
      }

      detalhes.push(`📅 Próximo vencimento: ${fmtData(proximo)}`)
      statusFinal = produto?.exigir_turma ? 'turma_pendente' : 'concluido'
      if (statusFinal === 'turma_pendente') detalhes.push('🗓️ Falta escolher seu horário. Use o link do pedido para escolher a turma.')
    } else if (pedido.tipo === 'pacote' && devedor) {
      const plano = produto?.planos
      const aulas = plano?.numero_aulas || null
      await supabase.from('devedores').update({
        assinatura_ativa: true,
        plano_id: plano?.id || produto?.plano_id || devedor.plano_id,
        experimental: false,
        aulas_restantes: aulas, aulas_total: aulas,
        data_inicio_assinatura: devedor.data_inicio_assinatura || hojeISO(),
      }).eq('id', devedor.id)

      const { data: cob } = await supabase.from('cobrancas_avulsas').insert({
        user_id: pedido.user_id, devedor_id: devedor.id,
        descricao: pedido.item_nome, valor: Number(pedido.valor), categoria: 'pacote',
        data_vencimento: hojeISO(), status: 'pago', forma_pagamento: formaPagamento,
        data_pagamento: dataPagamento, origem: 'loja', pedido_id: pedido.id,
      }).select('id').single()
      cobrancaId = cob?.id || null
      if (aulas) detalhes.push(`🎟️ Você tem ${aulas} aulas disponíveis.`)
    } else {
      // produto ou evento
      const descricao = pedido.variacao ? `${pedido.item_nome} (${pedido.variacao})` : pedido.item_nome
      const { data: cob } = await supabase.from('cobrancas_avulsas').insert({
        user_id: pedido.user_id, devedor_id: devedor?.id || null,
        descricao, valor: Number(pedido.valor),
        categoria: pedido.tipo === 'evento' ? 'evento' : (produto?.categoria_avulsa || 'outros'),
        data_vencimento: hojeISO(), status: 'pago', forma_pagamento: formaPagamento,
        data_pagamento: dataPagamento, origem: 'loja', pedido_id: pedido.id,
      }).select('id').single()
      cobrancaId = cob?.id || null

      if (pedido.tipo === 'evento') {
        await supabase.from('loja_inscricoes').insert({
          user_id: pedido.user_id, pedido_id: pedido.id, produto_id: pedido.produto_id, devedor_id: devedor?.id || null,
        })
        if (produto?.data_evento) detalhes.push(`📅 ${formatarDataHora(produto.data_evento)}${produto.local_evento ? ' · ' + produto.local_evento : ''}`)
      } else if (produto?.retirada_presencial) {
        statusFinal = 'aguardando_retirada'
        const ret = (await supabase.from('usuarios').select('loja_config').eq('id', pedido.user_id).maybeSingle()).data?.loja_config?.retirada
        const onde = [ret?.endereco, ret?.horario].filter(Boolean).join(' · ')
        detalhes.push(`📦 Retirada presencial${onde ? ': ' + onde : ' na academia'}.`)
      }
    }

    // 3. Contrato pós-compra
    if (produto?.contrato_template_id && devedor) {
      const { data: tpl } = await supabase.from('contratos_templates').select('id, titulo, conteudo').eq('id', produto.contrato_template_id).maybeSingle()
      if (tpl) {
        const { data: tokenContrato } = await supabase.rpc('gerar_token_contrato')
        const conteudo = substituirVariaveisContrato(tpl.conteudo, devedor, empresa, produto?.planos)
        const { data: env } = await supabase.from('contratos_enviados').insert({
          user_id: pedido.user_id, devedor_id: devedor.id, template_id: tpl.id,
          titulo: tpl.titulo, conteudo, link_token: tokenContrato, status: 'enviado',
        }).select('id, link_token').single()
        if (env) {
          contratoId = env.id
          detalhes.push(`📝 Assine seu contrato: ${appUrl()}/contrato/${env.link_token}`)
        }
      }
    }

    // 4. Grava o resultado no pedido e liga boleto <-> mensalidade
    await supabase.from('loja_pedidos').update({
      status: statusFinal, mensalidade_id: mensalidadeId, cobranca_avulsa_id: cobrancaId,
      contrato_enviado_id: contratoId, metodo: pedido.metodo, reservou_estoque: false,
    }).eq('id', pedido.id)
    if (mensalidadeId && payment?.id) {
      await supabase.from('boletos').update({ mensalidade_id: mensalidadeId }).eq('asaas_id', payment.id)
    }
  } catch (e) {
    console.error('❌ Erro ao materializar pedido (status fica "pago" para reprocessar):', e)
    return { processado: true, motivo: 'erro_materializacao', status: 'pago' }
  }

  // 5. Mensagens (best-effort)
  try {
    if (devedor) {
      if (devedor.portal_token) detalhes.unshift(`🔗 Seu portal: ${appUrl()}/portal/${devedor.portal_token}`)
      const bloqueado = devedor.comunicacoes_ativas === false || devedor.bloquear_mensagens === true
      const { data: cfg } = await supabase.from('configuracoes_cobranca').select('enviar_confirmacao_pagamento').eq('user_id', pedido.user_id).maybeSingle()
      if (!bloqueado && cfg?.enviar_confirmacao_pagamento !== false) {
        const telefone = devedor.responsavel_telefone || devedor.telefone || pedido.telefone
        const primeiroNome = ((devedor.responsavel_nome || devedor.nome || pedido.nome).trim().split(' ')[0]) || 'Cliente'
        const template = (await carregarTemplate(supabase, pedido.user_id, 'loja_pedido_confirmado')) || TEMPLATE_PADRAO_PEDIDO
        const mensagem = aplicarVariaveis(template, {
          nomeCliente: primeiroNome, nomeAluno: (devedor.nome || pedido.nome).split(' ')[0],
          item: pedido.item_nome + (pedido.variacao ? ` (${pedido.variacao})` : ''),
          valor: fmtBRL(valor), nomeEmpresa: empresa?.nome_empresa || '',
          detalhes: detalhes.join('\n'),
          linkPortal: devedor.portal_token ? `${appUrl()}/portal/${devedor.portal_token}` : '',
        })
        await enviarWhatsAppConta(supabase, {
          userId: pedido.user_id, devedorId: devedor.id, mensalidadeId, tipo: 'loja_pedido', telefone, mensagem,
        })
      }
    }

    const telCompra = soDigitos(pedido.telefone)
    await avisarGestor(supabase, pedido.user_id, empresa?.telefone,
      `🛒 *Nova venda na loja*\n\n${pedido.nome} comprou *${pedido.item_nome}${pedido.variacao ? ` (${pedido.variacao})` : ''}* por ${fmtBRL(valor)} (${formaPagamento}).\n` +
      (telCompra ? `WhatsApp: ${telCompra}\n` : '') +
      (statusFinal === 'turma_pendente' ? '\nO aluno ainda vai escolher a turma.' : '') +
      (statusFinal === 'aguardando_retirada' ? '\nProduto aguardando retirada.' : '') +
      `\n\nVeja em Marketing › Loja › Pedidos.`)
  } catch (e) {
    console.error('⚠️ Mensagens do pedido falharam (não afeta a venda):', e)
  }

  return { processado: true, status: statusFinal }
}

// Estorno/cancelamento depois de pago: desfaz os efeitos.
export async function estornarPedidoLoja(supabase: any, pedidoId: string, novoStatus: 'estornado' | 'cancelado') {
  const { data: pedido } = await supabase.from('loja_pedidos').select('*').eq('id', pedidoId).maybeSingle()
  if (!pedido) return
  if (['estornado', 'cancelado', 'expirado'].includes(pedido.status)) return

  const foiPago = !['aguardando_pagamento'].includes(pedido.status)
  await supabase.from('loja_pedidos').update({ status: novoStatus, cancelado_em: new Date().toISOString() }).eq('id', pedidoId)

  if (pedido.reservou_estoque && pedido.produto_id) {
    await supabase.rpc('loja_devolver_estoque', { p_produto_id: pedido.produto_id, p_variacao: pedido.variacao })
  }
  if (!foiPago) return

  if (pedido.cobranca_avulsa_id) {
    await supabase.from('cobrancas_avulsas').update({ status: 'cancelado' }).eq('id', pedido.cobranca_avulsa_id)
  }
  if (pedido.mensalidade_id) {
    await supabase.from('mensalidades').update({ status: 'pendente', data_pagamento: null, valor_pago: null }).eq('id', pedido.mensalidade_id)
  }
  if (pedido.tipo === 'evento') {
    await supabase.from('loja_inscricoes').update({ status: 'cancelada' }).eq('pedido_id', pedidoId)
  }
  if (pedido.tipo === 'produto' && pedido.produto_id && !pedido.reservou_estoque) {
    // estoque foi abatido na reserva; devolve ao estornar
    await supabase.rpc('loja_devolver_estoque', { p_produto_id: pedido.produto_id, p_variacao: pedido.variacao })
  }
  if (Array.isArray(pedido.aula_ids) && pedido.aula_ids.length && pedido.devedor_id) {
    await supabase.from('aulas_fixos').update({ ativo: false }).eq('devedor_id', pedido.devedor_id).in('aula_id', pedido.aula_ids)
  }
}

function appUrl() {
  return Deno.env.get('APP_URL') || 'https://www.mensalli.com.br'
}
