// Edge Function: Asaas Webhook
// Recebe notificações de pagamento do Asaas

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, asaas-access-token',
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

  try {
    // Parse webhook payload
    const payload = await req.json()

    console.log('🔔 Webhook Asaas recebido:', payload.event)
    console.log('📦 Payload:', JSON.stringify(payload, null, 2))

    // Salvar log do webhook
    await supabase
      .from('asaas_webhook_logs')
      .insert({
        event_type: payload.event,
        asaas_id: payload.payment?.id || payload.id,
        payload: payload,
        processado: false
      })

    // Extrair dados do pagamento
    const payment = payload.payment || payload
    const event = payload.event

    if (!payment?.id) {
      console.log('⚠️ Webhook sem ID de pagamento, ignorando')
      return new Response(JSON.stringify({ received: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Buscar boleto no banco de dados
    const { data: boleto, error: boletoError } = await supabase
      .from('boletos')
      .select('*, mensalidade:mensalidades(*)')
      .eq('asaas_id', payment.id)
      .single()

    if (boletoError || !boleto) {
      console.log('⚠️ Boleto não encontrado para asaas_id:', payment.id)
      // Atualizar log como processado mas sem ação
      await supabase
        .from('asaas_webhook_logs')
        .update({
          processado: true,
          sucesso: false,
          erro: 'Boleto não encontrado',
          processado_at: new Date().toISOString()
        })
        .eq('asaas_id', payment.id)
        .order('created_at', { ascending: false })
        .limit(1)

      return new Response(JSON.stringify({ received: true, message: 'Boleto não encontrado' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    console.log('📄 Boleto encontrado:', boleto.id)

    // Processar baseado no evento
    switch (event) {
      case 'PAYMENT_RECEIVED':
      case 'PAYMENT_CONFIRMED':
        console.log('✅ Pagamento confirmado!')

        // Atualizar boleto
        await supabase
          .from('boletos')
          .update({
            status: payment.status || 'RECEIVED',
            data_pagamento: payment.paymentDate || new Date().toISOString(),
            valor_pago: payment.value || boleto.valor,
            forma_pagamento: payment.billingType || 'BOLETO',
            updated_at: new Date().toISOString()
          })
          .eq('id', boleto.id)

        // Atualizar mensalidade como paga
        if (boleto.mensalidade_id) {
          await supabase
            .from('mensalidades')
            .update({
              status: 'pago',
              data_pagamento: payment.paymentDate || new Date().toISOString(),
              forma_pagamento: payment.billingType === 'PIX' ? 'PIX' : 'Boleto',
              // O portal cobra base + multa/juros (portal-pagar). Sem gravar o que entrou,
              // o Financeiro e o recibo mostrariam so o valor da mensalidade.
              valor_pago: payment.value || boleto.valor
            })
            .eq('id', boleto.mensalidade_id)

          console.log('✅ Mensalidade marcada como paga:', boleto.mensalidade_id)

          // --- Enviar WhatsApp de confirmacao ao cliente ---
          // Espelha src/services/whatsappService.js -> enviarConfirmacaoPagamento
          // (o caminho da baixa manual, que sempre funcionou). Runtime Deno nao
          // compartilha codigo com o front: mudou template/trava la, reflita aqui.
          await enviarConfirmacaoPagamento(supabase, {
            userId: boleto.user_id,
            devedorId: boleto.devedor_id,
            mensalidadeId: boleto.mensalidade_id,
            mensalidade: boleto.mensalidade,
            valorPago: payment.value ?? boleto.valor,
            dataPagamento: (payment.paymentDate || new Date().toISOString()).split('T')[0]
          })

          // Criar próxima mensalidade se for recorrente
          if (boleto.mensalidade?.is_mensalidade) {
            const dataVencimentoAtual = new Date(boleto.mensalidade.data_vencimento)
            const proximoVencimento = new Date(dataVencimentoAtual)
            proximoVencimento.setMonth(proximoVencimento.getMonth() + 1)

            // Verificar se já existe mensalidade para o próximo mês
            const { data: existente } = await supabase
              .from('mensalidades')
              .select('id')
              .eq('devedor_id', boleto.devedor_id)
              .eq('user_id', boleto.user_id)
              .gte('data_vencimento', proximoVencimento.toISOString().split('T')[0])
              .single()

            if (!existente) {
              // Criar próxima mensalidade
              await supabase
                .from('mensalidades')
                .insert({
                  user_id: boleto.user_id,
                  devedor_id: boleto.devedor_id,
                  valor: boleto.mensalidade.valor,
                  data_vencimento: proximoVencimento.toISOString().split('T')[0],
                  status: 'pendente',
                  is_mensalidade: true,
                  numero_mensalidade: (boleto.mensalidade.numero_mensalidade || 0) + 1
                })

              console.log('📅 Próxima mensalidade criada para:', proximoVencimento.toISOString().split('T')[0])
            }
          }
        }
        break

      case 'PAYMENT_OVERDUE':
        console.log('⚠️ Pagamento vencido')

        await supabase
          .from('boletos')
          .update({
            status: 'OVERDUE',
            updated_at: new Date().toISOString()
          })
          .eq('id', boleto.id)
        break

      case 'PAYMENT_DELETED':
      case 'PAYMENT_REFUNDED':
        console.log('🔄 Pagamento cancelado/estornado')

        await supabase
          .from('boletos')
          .update({
            status: event === 'PAYMENT_REFUNDED' ? 'REFUNDED' : 'CANCELED',
            updated_at: new Date().toISOString()
          })
          .eq('id', boleto.id)

        // Se tinha mensalidade, voltar para pendente
        if (boleto.mensalidade_id) {
          await supabase
            .from('mensalidades')
            .update({
              status: 'pendente',
              data_pagamento: null
            })
            .eq('id', boleto.mensalidade_id)
        }
        break

      case 'PAYMENT_UPDATED':
        console.log('🔄 Pagamento atualizado')

        await supabase
          .from('boletos')
          .update({
            status: payment.status,
            valor: payment.value || boleto.valor,
            data_vencimento: payment.dueDate || boleto.data_vencimento,
            updated_at: new Date().toISOString()
          })
          .eq('id', boleto.id)
        break

      default:
        console.log('ℹ️ Evento não processado:', event)
    }

    // Atualizar log como processado com sucesso
    await supabase
      .from('asaas_webhook_logs')
      .update({
        processado: true,
        sucesso: true,
        processado_at: new Date().toISOString()
      })
      .eq('asaas_id', payment.id)
      .order('created_at', { ascending: false })
      .limit(1)

    return new Response(
      JSON.stringify({ received: true, processed: true }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )

  } catch (error) {
    console.error('❌ Erro no webhook:', error)

    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  }
})

// ============================================================================
// Confirmacao de pagamento no WhatsApp
// ============================================================================
// Porte Deno de src/services/whatsappService.js -> enviarConfirmacaoPagamento.
// O front cuida da baixa manual; aqui cuidamos da baixa que vem do Asaas. Os
// dois precisam mandar a MESMA mensagem, com as MESMAS travas — antes daqui a
// confirmacao pelo Asaas nunca saiu (lia `config` por colunas que nao existem)
// e o gestor so descobria pelo aluno reclamando.

const EVOLUTION_URL_FALLBACK = 'https://service-evolution-api.tnvro1.easypanel.host'

// Credenciais da Evolution moram em linhas GLOBAIS de `config` (chave/valor),
// sem dono — mesmo padrao de cobranca-saas e whatsapp-health-check. Filtrar por
// user_id aqui devolvia zero linhas para todo mundo.
async function carregarCredenciaisEvolution(supabase: any) {
  const { data, error } = await supabase
    .from('config')
    .select('chave, valor')
    .in('chave', ['evolution_api_key', 'evolution_api_url'])

  if (error) console.error('⚠️ Erro ao ler credenciais Evolution:', error.message)

  const mapa: Record<string, string> = {}
  for (const linha of data || []) mapa[linha.chave] = linha.valor

  return {
    apiKey: mapa.evolution_api_key || '',
    apiUrl: mapa.evolution_api_url || EVOLUTION_URL_FALLBACK
  }
}

function formatarTelefoneBase(telefone: string) {
  let numero = String(telefone || '').replace(/\D/g, '')
  if (numero && !numero.startsWith('55')) numero = '55' + numero
  return numero
}

// Conta BR pre-2014 pode ter JID canonico SEM o 9 mesmo depois da Anatel: por
// isso testamos as duas variantes na Evolution antes de mandar.
function gerarVariantesNumero(telefone: string) {
  const numero = formatarTelefoneBase(telefone)
  const variantes = [numero]

  if (numero.startsWith('55') && numero.length >= 12) {
    const ddd = numero.substring(2, 4)
    const restante = numero.substring(4)

    if (restante.length === 9 && restante.startsWith('9')) {
      variantes.push('55' + ddd + restante.substring(1))
    } else if (restante.length === 8) {
      variantes.push('55' + ddd + '9' + restante)
    }
  }

  return variantes
}

async function resolverNumeroWhatsApp(apiUrl: string, apiKey: string, instanceName: string, telefone: string) {
  const variantes = gerarVariantesNumero(telefone)
  if (variantes.length === 1) return variantes[0] + '@s.whatsapp.net'

  try {
    const response = await fetch(
      `${apiUrl}/chat/whatsappNumbers/${instanceName}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'apikey': apiKey },
        body: JSON.stringify({ numbers: variantes.map((n) => n + '@s.whatsapp.net') }),
        signal: AbortSignal.timeout(10000)
      }
    )

    if (response.ok) {
      const resultado = await response.json()
      const encontrados = Array.isArray(resultado) ? resultado : (resultado?.response || [])
      const valido = encontrados.find((r: any) => r.exists === true)
      if (valido) {
        const numeroValido = valido.jid || valido.number
        return String(numeroValido).includes('@') ? numeroValido : numeroValido + '@s.whatsapp.net'
      }
    }
  } catch (error) {
    console.warn('⚠️ Falha ao verificar variantes do numero:', (error as Error).message)
  }

  return variantes[0] + '@s.whatsapp.net'
}

// Responsavel cadastrado recebe no lugar do aluno (e vira o {{nomeCliente}}).
function resolverDestinatario(devedor: any) {
  const nomeAluno = devedor?.nome || ''
  const primeiroNomeAluno = nomeAluno.split(' ')[0] || ''

  const respNome = (devedor?.responsavel_nome || '').trim()
  const respTelefone = (devedor?.responsavel_telefone || '').trim()
  const ehResponsavel = Boolean(respNome)

  return {
    primeiroNome: ehResponsavel ? (respNome.split(' ')[0] || '') : primeiroNomeAluno,
    primeiroNomeAluno,
    telefone: respTelefone || devedor?.telefone || '',
    ehResponsavel
  }
}

// Copia da formula de src/utils/multaJuros.js (e de portal-pagar). Mudou la,
// muda aqui — senao o recibo diverge do que o portal cobrou.
function calcularMultaJuros(valorBase: any, dataVencimento: any, config: any, hoje: any) {
  const base = parseFloat(String(valorBase)) || 0
  const mj = config || {}

  const hojeMs = hoje ? Date.parse(hoje) : Date.parse(new Date().toISOString().split('T')[0])
  const vencMs = Date.parse(dataVencimento)
  const diasAtraso = Number.isNaN(vencMs)
    ? 0
    : Math.max(0, Math.floor((hojeMs - vencMs) / 86400000))

  let multa = 0
  let juros = 0
  if (mj.ativo && diasAtraso > 0) {
    multa = base * (Number(mj.multa_percent || 0) / 100)
    juros = base * (Number(mj.juros_mes_percent || 0) / 100) * (diasAtraso / 30)
  }

  multa = Math.round(multa * 100) / 100
  juros = Math.round(juros * 100) / 100

  return { diasAtraso, multa, juros, total: Math.round((base + multa + juros) * 100) / 100 }
}

function valorEfetivoMensalidade(mensalidade: any, config: any, hoje: any) {
  const base = parseFloat(String(mensalidade?.valor)) || 0

  const paga = mensalidade?.status === 'pago'
  const semRegistro = paga && mensalidade?.valor_pago == null
  const referencia = semRegistro ? (mensalidade?.data_pagamento || hoje) : hoje

  if (paga && !semRegistro) {
    const multa = parseFloat(String(mensalidade.valor_multa)) || 0
    const juros = parseFloat(String(mensalidade.valor_juros)) || 0
    const pago = parseFloat(String(mensalidade.valor_pago))
    const total = Number.isFinite(pago) && pago > 0
      ? Math.round(pago * 100) / 100
      : Math.round((base + multa + juros) * 100) / 100
    const acrescimo = Math.round((total - base) * 100) / 100
    return { base, multa, juros, acrescimo, total, temAcrescimo: acrescimo > 0.005 }
  }

  const mj = calcularMultaJuros(base, mensalidade?.data_vencimento, config, referencia)
  const acrescimo = Math.round((mj.multa + mj.juros) * 100) / 100
  return { base, multa: mj.multa, juros: mj.juros, acrescimo, total: mj.total, temAcrescimo: acrescimo > 0.005 }
}

// Mesmo mapa de erro_codigo do front: a trigger `classificar_falha` do banco le
// esse codigo para decidir falha_classe (e a Central, o que pode ser reenviado).
async function enviarTexto(apiUrl: string, apiKey: string, instanceName: string, numeroJid: string, texto: string) {
  try {
    const response = await fetch(
      `${apiUrl}/message/sendText/${instanceName}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'apikey': apiKey },
        body: JSON.stringify({ number: numeroJid, text: texto }),
        signal: AbortSignal.timeout(30000)
      }
    )

    if (response.ok) {
      const dados = await response.json()
      return { sucesso: true, httpStatus: response.status, responseApi: dados }
    }

    const errorText = await response.text()
    let errorData: any = {}
    try { errorData = JSON.parse(errorText) } catch { /* nao e JSON */ }
    const responseApi = Object.keys(errorData).length ? errorData : { raw: errorText }
    const httpStatus = response.status

    if (errorData.response?.message === 'Connection Closed' || errorText.includes('Connection Closed')) {
      return { sucesso: false, erro: 'WhatsApp desconectado (Connection Closed)', erroCodigo: 'connection_closed', httpStatus, responseApi }
    }

    // 500 por pool do Prisma esgotado: a Evolution JA entregou e so falhou ao
    // gravar. Marcar como desconexao aqui faria a varredura de zumbi destruir
    // instancia saudavel.
    const corpo500 = `${errorText || ''} ${JSON.stringify(responseApi || {})}`
    if (httpStatus === 500 && /connection pool|PrismaClient|pris\.ly/i.test(corpo500)) {
      return { sucesso: false, erro: 'Evolution sem conexao de banco (pool esgotado) — mensagem provavelmente ENTREGUE', erroCodigo: 'evolution_db_pool', httpStatus, responseApi }
    }

    if (httpStatus === 500) {
      return { sucesso: false, erro: 'Instancia retornou 500 (provavel desconexao)', erroCodigo: 'instance_500', httpStatus, responseApi }
    }

    if (Array.isArray(errorData.response?.message)) {
      const naoExiste = errorData.response.message.some((m: any) => m.exists === false)
      if (naoExiste) {
        return { sucesso: false, erro: 'Numero nao existe no WhatsApp', erroCodigo: 'numero_inexistente', httpStatus, responseApi }
      }
    }

    if (httpStatus === 404) {
      return { sucesso: false, erro: 'Instancia nao encontrada na Evolution API', erroCodigo: 'instance_not_found', httpStatus, responseApi }
    }

    if (httpStatus === 401 || httpStatus === 403) {
      return { sucesso: false, erro: 'Credencial Evolution API invalida', erroCodigo: 'auth_failed', httpStatus, responseApi }
    }

    if (httpStatus === 400) {
      const msg = errorData?.response?.message || errorData?.message || errorText
      return { sucesso: false, erro: `Requisicao invalida (400): ${typeof msg === 'string' ? msg : JSON.stringify(msg)}`, erroCodigo: 'bad_request', httpStatus, responseApi }
    }

    return { sucesso: false, erro: errorData.message || errorText || `Erro HTTP ${httpStatus}`, erroCodigo: `http_${httpStatus}`, httpStatus, responseApi }
  } catch (error) {
    const err = error as Error
    if (err.name === 'AbortError' || err.name === 'TimeoutError') {
      return { sucesso: false, erro: 'Tempo limite excedido — Evolution API nao respondeu em 30s', erroCodigo: 'timeout', responseApi: { name: err.name, message: err.message } }
    }
    return { sucesso: false, erro: err.message, erroCodigo: 'exception', responseApi: { name: err.name, message: err.message } }
  }
}

async function enviarConfirmacaoPagamento(supabase: any, ctx: any) {
  const { userId, devedorId, mensalidadeId, mensalidade, valorPago, dataPagamento } = ctx

  // Toda saida por infra (sem telefone, conta caida, credencial faltando) grava
  // log de falha. Foi a AUSENCIA disso que escondeu o bug: o insert vivia dentro
  // do if, entao pular o envio nao deixava rastro nenhum.
  const logar = async (status: string, mensagemTexto: string, telefone: string, extra: any = {}) => {
    const { error } = await supabase.from('logs_mensagens').insert({
      user_id: userId,
      devedor_id: devedorId,
      mensalidade_id: mensalidadeId,
      tipo: 'payment_confirmed',
      mensagem: mensagemTexto,
      status,
      telefone,
      erro: extra.erro || null,
      erro_codigo: extra.erroCodigo || (status === 'falha' ? 'unknown' : null),
      http_status: extra.httpStatus || null,
      response_api: extra.responseApi || null
    })
    if (error) console.error('⚠️ Erro ao gravar logs_mensagens:', error.message)
  }

  try {
    const { data: devedor } = await supabase
      .from('devedores')
      .select('id, nome, telefone, responsavel_nome, responsavel_telefone, comunicacoes_ativas')
      .eq('id', devedorId)
      .single()

    // Master switch do aluno: silencio pedido pelo gestor nao e falha, nao loga.
    if (devedor?.comunicacoes_ativas === false) {
      console.log('⏩ Confirmacao: comunicacoes desativadas para este aluno')
      return
    }

    const { data: configCobranca } = await supabase
      .from('configuracoes_cobranca')
      .select('enviar_confirmacao_pagamento')
      .eq('user_id', userId)
      .maybeSingle()

    if (configCobranca?.enviar_confirmacao_pagamento === false) {
      console.log('⏩ Confirmacao: automacao desligada pelo gestor')
      return
    }

    const destinatario = resolverDestinatario(devedor)
    if (!destinatario.telefone) {
      console.log('⏩ Confirmacao: aluno sem telefone')
      await logar('falha', '(confirmacao nao enviada: aluno sem telefone cadastrado)', '', { erro: 'Aluno sem telefone cadastrado', erroCodigo: 'sem_telefone' })
      return
    }

    const [{ data: usuario }, { data: template }, { data: whatsapp }, credenciais] = await Promise.all([
      supabase.from('usuarios').select('nome_empresa, asaas_multa_juros').eq('id', userId).single(),
      supabase.from('templates').select('mensagem').eq('user_id', userId).eq('tipo', 'payment_confirmed').eq('ativo', true).maybeSingle(),
      supabase.from('mensallizap').select('instance_name, conectado').eq('user_id', userId).maybeSingle(),
      carregarCredenciaisEvolution(supabase)
    ])

    const fmtBRL = (v: any) => (parseFloat(String(v)) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

    // O que o aluno pagou de fato — o Asaas ja nos diz, entao o recibo nao
    // precisa estimar multa/juros pela config.
    const mensalidadePaga = { ...(mensalidade || {}), status: 'pago', valor_pago: valorPago, data_pagamento: dataPagamento }
    const mj = valorEfetivoMensalidade(mensalidadePaga, usuario?.asaas_multa_juros, dataPagamento)

    const valorFormatado = fmtBRL(mj.base)
    const valorTotalFormatado = fmtBRL(mj.total)
    const valorPrincipalFormatado = mj.temAcrescimo ? valorTotalFormatado : valorFormatado

    const dataVenc = mensalidade?.data_vencimento
    const vencimentoFormatado = dataVenc
      ? new Date(dataVenc + 'T12:00:00').toLocaleDateString('pt-BR')
      : ''

    const empresa = usuario?.nome_empresa || ''
    const nomeAluno = destinatario.primeiroNome || 'Cliente'
    const nomeCliente = nomeAluno
    const nomeAlunoReal = destinatario.primeiroNomeAluno || ''
    const nomeResponsavel = destinatario.ehResponsavel ? destinatario.primeiroNome : ''

    let mensagemTexto: string
    if (template?.mensagem) {
      mensagemTexto = template.mensagem
        .replace(/\{\{nomeCliente\}\}/g, nomeCliente)
        .replace(/\{\{nomeAlunoReal\}\}/g, nomeAlunoReal)
        .replace(/\{\{nomeAluno\}\}/g, nomeAluno)
        .replace(/\{\{nomeResponsavel\}\}/g, nomeResponsavel)
        .replace(/\{\{valorMensalidade\}\}/g, valorPrincipalFormatado)
        .replace(/\{\{valorBase\}\}/g, valorFormatado)
        .replace(/\{\{valorMulta\}\}/g, fmtBRL(mj.multa))
        .replace(/\{\{valorJuros\}\}/g, fmtBRL(mj.juros))
        .replace(/\{\{valorTotal\}\}/g, valorTotalFormatado)
        .replace(/\{\{dataVencimento\}\}/g, vencimentoFormatado)
        .replace(/\{\{nomeEmpresa\}\}/g, empresa)

      const detalhaAcrescimo = /\{\{(valorMulta|valorJuros|valorTotal|valorBase)\}\}/.test(template.mensagem)
      if (mj.temAcrescimo && !detalhaAcrescimo) {
        mensagemTexto += `\n\n_(mensalidade ${valorFormatado} + ${fmtBRL(mj.acrescimo)} de multa/juros por atraso)_`
      }
    } else {
      const linhaValor = mj.temAcrescimo
        ? `💰 Valor pago: ${valorTotalFormatado}\n   (mensalidade ${valorFormatado} + multa/juros ${fmtBRL(mj.acrescimo)})`
        : `💰 Valor: ${valorFormatado}`
      mensagemTexto = `Olá, ${nomeCliente}! ✅\n\nConfirmamos o recebimento do seu pagamento.\n\n${linhaValor}\n📅 Vencimento: ${vencimentoFormatado}\n\nObrigado pela pontualidade! - ${empresa}`
    }

    if (!whatsapp?.instance_name || whatsapp.conectado !== true) {
      console.log('⏩ Confirmacao: WhatsApp da conta desconectado')
      await logar('falha', mensagemTexto, destinatario.telefone, {
        erro: 'WhatsApp da conta desconectado na hora do pagamento',
        erroCodigo: 'conta_desconectada'
      })
      return
    }

    if (!credenciais.apiKey) {
      console.error('❌ Confirmacao: credencial da Evolution ausente em `config`')
      await logar('falha', mensagemTexto, destinatario.telefone, {
        erro: 'Credencial da Evolution ausente na tabela config',
        erroCodigo: 'auth_failed'
      })
      return
    }

    const numeroJid = await resolverNumeroWhatsApp(
      credenciais.apiUrl,
      credenciais.apiKey,
      whatsapp.instance_name,
      destinatario.telefone
    )

    const resultado = await enviarTexto(
      credenciais.apiUrl,
      credenciais.apiKey,
      whatsapp.instance_name,
      numeroJid,
      mensagemTexto
    )

    console.log('📱 Confirmacao de pagamento:', resultado.sucesso ? 'enviada' : `falha (${resultado.erroCodigo})`)

    await logar(resultado.sucesso ? 'enviado' : 'falha', mensagemTexto, destinatario.telefone, resultado)
  } catch (error) {
    // Confirmacao nunca derruba o webhook: a baixa do pagamento e o que importa.
    console.error('⚠️ Erro na confirmacao de pagamento (nao afeta a baixa):', error)
    try {
      await logar('falha', '(confirmacao falhou antes de montar a mensagem)', '', { erro: (error as Error).message, erroCodigo: 'exception' })
    } catch { /* log e best-effort */ }
  }
}
