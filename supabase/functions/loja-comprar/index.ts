// Edge Function: Loja - Comprar
// POST { slug, produto_id, variacao?, metodo, website (isca), origem_link?, aluno_token?,
//        ficha: { nome, telefone, cpf, email?, data_nascimento?, responsavel_nome?,
//                 responsavel_telefone?, responsavel_cpf?, respostas? } }
//
// 1) valida item, estoque/vagas e ficha  2) acha ou cria o aluno (devedores, origem 'loja')
// 3) reserva estoque  4) cria loja_pedidos  5) cria cobrança no Asaas do gestor e grava
// em `boletos` com pedido_id (é por aí que o webhook reconhece a venda)
// 6) devolve token do pedido + dados de pagamento (QR Pix inline ou invoice_url).
// Acesso PÚBLICO (sem autenticação).

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
  corsHeaders, json, erro, soDigitos, texto, dataNascimentoValida, idadeEmAnos, isValidCpf, hojeISO,
  novoToken, hashIp, carregarEmpresaPorSlug, gateLoja, asaasCtx, ensureWebhook, fetchPixQrCode,
  garantirCustomer, criarCobrancaAsaas, pedidoPublico,
} from '../_shared/loja.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const LIMITE_CONTA_HORA = 30
const LIMITE_TELEFONE_HORA = 5
const LIMITE_IP_HORA = 10
const VALOR_MINIMO_ASAAS = 5

const normalizarNome = (s: string) => String(s || '').trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return erro('metodo', 'Método não permitido', 405)

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

  try {
    const body = await req.json().catch(() => ({}))
    const { slug, produto_id, website } = body
    const ficha = body.ficha || {}

    // Isca preenchida: finge sucesso
    if (website) return json({ sucesso: true, token: novoToken() }, 201)
    if (!slug || !produto_id) return erro('dados', 'Link inválido', 400)

    // 1. Empresa + gate (compra exige Asaas)
    const empresa = await carregarEmpresaPorSlug(supabase, slug)
    const gate = await gateLoja(supabase, empresa, { exigirAsaas: true })
    if (!gate.ok) return erro(gate.code === 'asaas' ? 'asaas_indisponivel' : gate.code, gate.motivo, gate.code === 'nao_encontrada' ? 404 : 403)

    // 2. Item
    const { data: produto } = await supabase
      .from('loja_produtos')
      .select('*, planos(id, nome, valor, ciclo_cobranca, tipo, numero_aulas, ativo)')
      .eq('id', produto_id)
      .eq('user_id', empresa.id)
      .maybeSingle()
    if (!produto || !produto.ativo) return erro('produto_inativo', 'Este item não está mais disponível', 404)
    if ((produto.tipo === 'plano' || produto.tipo === 'pacote') && !produto.planos) return erro('produto_inativo', 'Este plano não está mais disponível', 404)
    if (produto.tipo === 'evento' && produto.data_evento && new Date(produto.data_evento) < new Date()) return erro('produto_inativo', 'Este evento já aconteceu', 410)

    // Valor sempre do servidor (plano/pacote: do plano de origem)
    const valor = Number(produto.tipo === 'plano' || produto.tipo === 'pacote' ? (produto.planos?.valor ?? produto.valor) : produto.valor)
    if (!(valor > 0)) return erro('valor', 'Item sem preço válido', 400)
    // O Asaas recusa cobrança abaixo de R$ 5,00 (valor - desconto >= 5). Barrar aqui evita
    // criar aluno e pedido para depois falhar na cobrança.
    if (valor < VALOR_MINIMO_ASAAS) return erro('valor_minimo', `O valor mínimo para pagamento online é R$ ${VALOR_MINIMO_ASAAS.toFixed(2).replace('.', ',')}. Fale com a academia.`, 400)

    // Variação
    const variacoes = Array.isArray(produto.variacoes) ? produto.variacoes.filter((v: any) => v && v.nome) : []
    let variacao: string | null = null
    if (produto.tipo === 'produto' && variacoes.length) {
      variacao = texto(body.variacao, 60)
      const escolhida = variacoes.find((v: any) => String(v.nome) === variacao)
      if (!escolhida) return erro('variacao', 'Escolha uma opção (tamanho/variação)', 400)
      if (escolhida.estoque != null && Number(escolhida.estoque) <= 0) return erro('esgotado', 'Esta opção está esgotada', 409)
    } else if (produto.tipo === 'produto' && produto.estoque != null && Number(produto.estoque) <= 0) {
      return erro('esgotado', 'Este item está esgotado', 409)
    }
    if (produto.tipo === 'evento' && produto.vagas != null) {
      const { data: vagas } = await supabase.rpc('loja_vagas_evento', { p_produto_id: produto.id })
      if (vagas != null && vagas <= 0) return erro('lotado', 'As vagas deste evento acabaram', 409)
    }

    // Método de pagamento liberado pelo gestor (Pix sempre)
    const metodo = String(body.metodo || 'pix').toLowerCase()
    const formas = empresa.asaas_formas_pagamento || {}
    const liberado: Record<string, boolean> = { pix: true, cartao: formas.cartao === true, boleto: formas.boleto === true }
    if (!liberado[metodo]) return erro('metodo', 'Forma de pagamento indisponível', 400)

    // 3. Ficha
    const nome = texto(ficha.nome, 120)
    if (!nome || nome.length < 2) return erro('nome', 'Digite o nome completo', 400)

    const exigeNascimento = produto.tipo === 'plano' || produto.tipo === 'pacote'
    const dataNascimento = String(ficha.data_nascimento || '')
    if (exigeNascimento && !dataNascimentoValida(dataNascimento)) return erro('nascimento', 'Data de nascimento inválida', 400)
    if (!exigeNascimento && dataNascimento && !dataNascimentoValida(dataNascimento)) return erro('nascimento', 'Data de nascimento inválida', 400)

    const menor = dataNascimentoValida(dataNascimento) ? idadeEmAnos(dataNascimento) < 18 : false
    const telefone = soDigitos(ficha.telefone)
    const respNome = menor ? texto(ficha.responsavel_nome, 120) : null
    const respTelefone = menor ? soDigitos(ficha.responsavel_telefone) : ''
    const respCpf = menor ? soDigitos(ficha.responsavel_cpf) : ''
    const cpf = soDigitos(ficha.cpf)

    if (menor) {
      if (!respNome) return erro('menor_sem_responsavel', 'Informe o nome do responsável', 400)
      if (respTelefone.length < 10) return erro('telefone_invalid', 'WhatsApp do responsável inválido', 400)
      if (!isValidCpf(respCpf)) return erro('cpf_invalid', 'CPF do responsável inválido', 400)
    } else {
      if (telefone.length < 10) return erro('telefone_invalid', 'WhatsApp inválido', 400)
      if (!isValidCpf(cpf)) return erro('cpf_invalid', 'CPF inválido', 400)
    }
    const telefonePrincipal = menor ? respTelefone : telefone
    const cpfPagador = menor ? respCpf : cpf
    const email = texto(ficha.email, 120)

    // Campos extras obrigatórios
    const extras = Array.isArray(produto.campos_extras) ? produto.campos_extras : []
    const respostas: Record<string, string> = {}
    for (const c of extras) {
      if (!c || !c.chave) continue
      const v = texto((ficha.respostas || {})[c.chave], 200)
      if (c.obrigatorio && !v) return erro('campo_extra', `Preencha: ${c.rotulo || c.chave}`, 400, { campo: c.chave })
      if (v) respostas[c.chave] = v
    }

    // 4. Limites (conta, telefone, IP)
    const umaHoraAtras = new Date(Date.now() - 3600_000).toISOString()
    const ipHash = await hashIp(req)
    const [{ count: porConta }, { count: porTelefone }, { count: porIp }] = await Promise.all([
      supabase.from('loja_pedidos').select('id', { count: 'exact', head: true }).eq('user_id', empresa.id).gte('created_at', umaHoraAtras),
      supabase.from('loja_pedidos').select('id', { count: 'exact', head: true }).eq('user_id', empresa.id).eq('telefone', telefonePrincipal).gte('created_at', umaHoraAtras),
      supabase.from('loja_pedidos').select('id', { count: 'exact', head: true }).eq('ip_hash', ipHash).gte('created_at', umaHoraAtras),
    ])
    if ((porConta || 0) >= LIMITE_CONTA_HORA || (porTelefone || 0) >= LIMITE_TELEFONE_HORA || (porIp || 0) >= LIMITE_IP_HORA) {
      return erro('rate_limit', 'Muitas tentativas agora. Tente de novo em alguns minutos.', 429)
    }

    // 5. Aluno: por token do portal (link pré-preenchido) ou por telefone + nome
    let devedor: any = null
    if (body.aluno_token) {
      const { data } = await supabase.from('devedores').select('*').eq('portal_token', String(body.aluno_token)).eq('user_id', empresa.id).or('lixo.is.null,lixo.eq.false').maybeSingle()
      devedor = data
    }
    if (!devedor) {
      const { data: existentes } = await supabase
        .from('devedores')
        .select('id, nome, telefone, responsavel_telefone, cpf, portal_token, experimental, assinatura_ativa, plano_id, data_inicio_assinatura, comunicacoes_ativas, bloquear_mensagens, responsavel_nome')
        .eq('user_id', empresa.id)
        .or('lixo.is.null,lixo.eq.false')
      const nomeNorm = normalizarNome(nome)
      const primeiro = nomeNorm.split(' ')[0]
      const candidatos = (existentes || []).filter((d: any) =>
        soDigitos(d.telefone) === telefonePrincipal || soDigitos(d.responsavel_telefone) === telefonePrincipal)
      devedor = candidatos.find((d: any) => normalizarNome(d.nome) === nomeNorm)
        || candidatos.find((d: any) => normalizarNome(d.nome).split(' ')[0] === primeiro)
        || null
    }

    if (!devedor) {
      const { data: novo, error: insertError } = await supabase
        .from('devedores')
        .insert({
          user_id: empresa.id,
          nome,
          telefone: telefonePrincipal,
          data_nascimento: dataNascimentoValida(dataNascimento) ? dataNascimento : null,
          email,
          cpf: cpfPagador,
          responsavel_nome: respNome,
          responsavel_telefone: menor ? respTelefone : null,
          valor_devido: 0,
          data_vencimento: hojeISO(),
          status: 'pendente',
          assinatura_ativa: false,
          origem: 'loja',
          experimental: true,  // vira false quando o pagamento de plano/pacote confirma
          portal_token: novoToken(),
        })
        .select('*')
        .single()
      if (insertError || !novo) {
        console.error('Erro ao criar aluno:', insertError)
        return erro('interno', 'Erro ao criar cadastro', 500)
      }
      devedor = novo
    } else {
      // Completa o que estiver vazio na ficha existente (nunca sobrescreve)
      const patch: Record<string, unknown> = {}
      if (!devedor.cpf) patch.cpf = cpfPagador
      if (email && !devedor.email) patch.email = email
      if (menor && respNome && !devedor.responsavel_nome) { patch.responsavel_nome = respNome; patch.responsavel_telefone = respTelefone }
      if (!devedor.portal_token) patch.portal_token = novoToken()
      if (Object.keys(patch).length) {
        await supabase.from('devedores').update(patch).eq('id', devedor.id)
        devedor = { ...devedor, ...patch }
      }
    }

    // 6. Reserva de estoque (só produto com estoque finito)
    let reservou = false
    if (produto.tipo === 'produto') {
      const { data: ok } = await supabase.rpc('loja_reservar_estoque', { p_produto_id: produto.id, p_variacao: variacao })
      if (ok === false) return erro('esgotado', 'Este item acabou de esgotar', 409)
      const finito = variacao
        ? variacoes.find((v: any) => String(v.nome) === variacao)?.estoque != null
        : produto.estoque != null
      reservou = !!finito
    }

    // 7. Pedido
    const itemNome = produto.tipo === 'plano' || produto.tipo === 'pacote' ? (produto.nome || produto.planos?.nome) : produto.nome
    const { data: pedido, error: pedidoError } = await supabase
      .from('loja_pedidos')
      .insert({
        user_id: empresa.id, produto_id: produto.id, devedor_id: devedor.id,
        token: novoToken(), status: 'aguardando_pagamento',
        tipo: produto.tipo, item_nome: itemNome,
        nome, telefone: telefonePrincipal, cpf: cpfPagador, email,
        data_nascimento: dataNascimentoValida(dataNascimento) ? dataNascimento : null,
        responsavel_nome: respNome, responsavel_telefone: menor ? respTelefone : null, responsavel_cpf: menor ? respCpf : null,
        variacao, respostas: Object.keys(respostas).length ? respostas : null,
        valor, metodo, reservou_estoque: reservou,
        origem_link: texto(body.origem_link, 20), ip_hash: ipHash,
      })
      .select('*')
      .single()
    if (pedidoError || !pedido) {
      console.error('Erro ao criar pedido:', pedidoError)
      if (reservou) await supabase.rpc('loja_devolver_estoque', { p_produto_id: produto.id, p_variacao: variacao })
      return erro('interno', 'Erro ao registrar pedido', 500)
    }

    // 8. Cobrança no Asaas do gestor
    const ctx = asaasCtx(empresa, SUPABASE_URL)
    await ensureWebhook(ctx)

    const customer = await garantirCustomer(supabase, ctx, { id: devedor.id, user_id: empresa.id, nome: devedor.nome, telefone: devedor.telefone }, cpfPagador)
    if (!customer.id) {
      await desfazer(supabase, pedido.id, reservou, produto.id, variacao)
      return erro('asaas_indisponivel', customer.erro || 'Pagamento indisponível no momento', 502)
    }

    const descricao = `${itemNome}${variacao ? ` (${variacao})` : ''} - ${empresa.nome_empresa || 'Mensalli'}`
    const cobranca = await criarCobrancaAsaas(ctx, {
      customer: customer.id, metodo, valor, dueDate: hojeISO(), descricao, externalReference: `loja:${pedido.id}`,
    })
    if (!cobranca.payment) {
      await desfazer(supabase, pedido.id, reservou, produto.id, variacao)
      return erro('asaas_indisponivel', cobranca.erro || 'Erro ao gerar pagamento', 502)
    }
    const payment = cobranca.payment

    await supabase.from('boletos').insert({
      user_id: empresa.id, devedor_id: devedor.id, pedido_id: pedido.id,
      asaas_id: payment.id, asaas_customer_id: customer.id,
      valor, data_vencimento: hojeISO(), status: payment.status, forma_pagamento: metodo,
      boleto_url: payment.bankSlipUrl || null, invoice_url: payment.invoiceUrl || null, descricao,
    })
    await supabase.from('loja_pedidos').update({ asaas_payment_id: payment.id, invoice_url: payment.invoiceUrl || null }).eq('id', pedido.id)

    const pixQr = metodo === 'pix' ? await fetchPixQrCode(ctx, payment.id) : null

    console.log('🛒 Pedido criado:', pedido.id, produto.tipo, metodo, valor)
    return json({
      sucesso: true,
      token: pedido.token,
      pedido: pedidoPublico({ ...pedido, asaas_payment_id: payment.id, invoice_url: payment.invoiceUrl }),
      pagamento: {
        metodo, valor,
        invoice_url: payment.invoiceUrl || null,
        boleto_url: payment.bankSlipUrl || null,
        pix_qr_code: pixQr?.encodedImage || null,
        pix_copia_cola: pixQr?.payload || null,
      },
    }, 201)
  } catch (err) {
    console.error('Erro loja-comprar:', err)
    return erro('interno', 'Erro interno do servidor', 500)
  }
})

async function desfazer(supabase: any, pedidoId: string, reservou: boolean, produtoId: string, variacao: string | null) {
  try {
    await supabase.from('loja_pedidos').update({ status: 'cancelado', cancelado_em: new Date().toISOString(), reservou_estoque: false }).eq('id', pedidoId)
    if (reservou) await supabase.rpc('loja_devolver_estoque', { p_produto_id: produtoId, p_variacao: variacao })
  } catch (e) {
    console.error('⚠️ desfazer pedido:', e)
  }
}
