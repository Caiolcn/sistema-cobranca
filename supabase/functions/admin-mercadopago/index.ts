// Edge Function: Assinaturas e recebimentos no Mercado Pago (tela /admin/assinaturas)
//
// POR QUE ISTO EXISTE: o extrato do MP só mostra "Liberação de dinheiro", sem
// dizer de quem é. E o nosso banco (pagamentos_mercadopago) só conhece o que
// chegou por webhook — o cartão recorrente nunca chegou (os tópicos de
// assinatura não estão marcados no painel) e quem pagou por um link fora do
// nosso checkout nem tem external_reference. Então esta função pergunta ao MP,
// que é a fonte de verdade, e cruza cada pagamento com a conta do Mensalli.
//
// Só admin chama (verify_jwt = true + checagem de role).
//
// POST { acao: 'listar', dias?: number }
//   → { pagamentos[], assinaturas[], gerado_em }
// POST { acao: 'lancar', payment_id: string, user_id: string, plano?: string }
//   → registra o pagamento na conta e renova +30 dias (idempotente por payment_id)
// POST { acao: 'vincular', preapproval_id: string, user_id: string }
//   → diz de qual conta é a assinatura de cartão (banco + external_reference no MP)

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const MP_ACCESS_TOKEN = Deno.env.get('MERCADOPAGO_ACCESS_TOKEN')!

// Teto de páginas por consulta: 100 por página. Sobra para o volume atual.
const MAX_PAGINAS = 10

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

async function mpGet(path: string) {
  const r = await fetch(`https://api.mercadopago.com${path}`, {
    headers: { 'Authorization': `Bearer ${MP_ACCESS_TOKEN}` },
  })
  if (!r.ok) {
    const txt = await r.text()
    console.error(`❌ MP ${path} → ${r.status}`, txt)
    throw new Error(`Mercado Pago respondeu ${r.status} em ${path.split('?')[0]}`)
  }
  return await r.json()
}

// Mesma régua do webhook: o plano sai do valor.
function planoPorValor(valor: number): string {
  if (valor >= 149) return 'premium'
  if (valor >= 99) return 'pro'
  return 'starter'
}

const LIMITE_POR_PLANO: Record<string, number> = { starter: 200, pro: 600, premium: 3000 }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// external_reference vem de dois jeitos: o user_id puro (assinatura de cartão)
// ou um JSON { user_id, plano, tipo } (Pix do checkout). Links criados à mão no
// painel do MP não têm nada.
function userIdDaReferencia(ref: unknown): string | null {
  if (!ref || typeof ref !== 'string') return null
  if (UUID.test(ref.trim())) return ref.trim()
  try {
    const obj = JSON.parse(ref)
    if (obj?.user_id && UUID.test(String(obj.user_id))) return String(obj.user_id)
  } catch { /* não é JSON */ }
  return null
}

async function buscarTodos(pathBase: string) {
  const todos: any[] = []
  for (let pagina = 0; pagina < MAX_PAGINAS; pagina++) {
    const sep = pathBase.includes('?') ? '&' : '?'
    const res = await mpGet(`${pathBase}${sep}limit=100&offset=${pagina * 100}`)
    const lote = res?.results || []
    todos.push(...lote)
    const total = res?.paging?.total ?? 0
    if (lote.length < 100 || todos.length >= total) break
  }
  return todos
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

  // ---- Auth: só admin logado ----
  const jwt = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '').trim()
  if (!jwt) return json({ error: 'Unauthorized' }, 401)

  const { data: authData } = await supabase.auth.getUser(jwt)
  const adminId = authData?.user?.id
  if (!adminId) return json({ error: 'Unauthorized' }, 401)

  const { data: perfilAdmin } = await supabase
    .from('usuarios').select('role').eq('id', adminId).maybeSingle()
  if (perfilAdmin?.role !== 'admin') {
    return json({ error: 'Unauthorized — apenas admin' }, 403)
  }

  let body: any = {}
  try { body = await req.json() } catch { /* body vazio = listar */ }

  try {
    if (body?.acao === 'lancar') return json(await lancar(supabase, body))
    if (body?.acao === 'vincular') {
      const preId = String(body?.preapproval_id || '').trim()
      const uid = String(body?.user_id || '').trim()
      if (!preId || !UUID.test(uid)) throw new Error('preapproval_id e user_id são obrigatórios')
      return json(await vincularAssinatura(supabase, preId, uid))
    }
    return json(await listar(supabase, Number(body?.dias) || 60))
  } catch (error) {
    console.error('❌ admin-mercadopago:', error)
    return json({ error: error.message }, 400)
  }
})

// ============================================
// listar: pagamentos + assinaturas, cruzados com as contas
// ============================================

async function listar(supabase: any, dias: number) {
  const fim = new Date()
  const inicio = new Date(fim.getTime() - Math.min(dias, 365) * 24 * 60 * 60 * 1000)

  const [pagamentosMP, preapprovals] = await Promise.all([
    buscarTodos(
      `/v1/payments/search?sort=date_created&criteria=desc&range=date_created` +
      `&begin_date=${encodeURIComponent(inicio.toISOString())}&end_date=${encodeURIComponent(fim.toISOString())}`
    ),
    buscarTodos('/preapproval/search'),
  ])

  // Vínculo assinatura → conta do NOSSO banco. Manda mais que o
  // external_reference do MP: a pessoa pode ter assinado logada numa conta
  // velha (caso Paloma: assinou em "Minha Empresa", usa "Bem Estar Fisio"), e
  // o admin corrige aqui com o botão "Vincular".
  const vinculo = new Map<string, string>()
  const { data: linhas } = await supabase
    .from('assinaturas_mercadopago')
    .select('subscription_id, user_id, updated_at')
    .order('updated_at', { ascending: true })
  for (const l of (linhas || [])) {
    if (l.subscription_id && l.user_id) vinculo.set(String(l.subscription_id), l.user_id)
  }
  const donoDaAssinatura = (p: any) =>
    vinculo.get(String(p.id)) || userIdDaReferencia(p.external_reference)

  // Índices para achar o dono de um pagamento sem external_reference
  const prePorId = new Map<string, any>()
  const userPorPayer = new Map<string, string>()
  for (const p of preapprovals) {
    prePorId.set(String(p.id), p)
    const uid = donoDaAssinatura(p)
    if (uid && p.payer_id) userPorPayer.set(String(p.payer_id), uid)
  }

  const { data: contas } = await supabase
    .from('usuarios')
    .select('id, nome_empresa, nome_completo, email, telefone, plano, plano_pago, plano_vencimento')
  const contaPorId = new Map<string, any>()
  const contaPorEmail = new Map<string, any>()
  for (const c of (contas || [])) {
    contaPorId.set(c.id, c)
    if (c.email) contaPorEmail.set(String(c.email).trim().toLowerCase(), c)
  }

  // O que já foi lançado no sistema (webhook do Pix ou botão "Lançar")
  const ids = pagamentosMP.map((p) => String(p.id))
  const lancados = new Map<string, any>()
  for (let i = 0; i < ids.length; i += 200) {
    const { data } = await supabase
      .from('pagamentos_mercadopago')
      .select('payment_id, user_id, status')
      .in('payment_id', ids.slice(i, i + 200))
    for (const l of (data || [])) lancados.set(String(l.payment_id), l)
  }

  const resumoConta = (c: any) => c ? {
    id: c.id,
    nome: c.nome_empresa || c.nome_completo || c.email,
    email: c.email,
    telefone: c.telefone,
    plano: c.plano,
    plano_pago: c.plano_pago,
    plano_vencimento: c.plano_vencimento,
  } : null

  const pagamentos = pagamentosMP.map((p) => {
    const preapprovalId =
      p.metadata?.preapproval_id ||
      p.point_of_interaction?.transaction_data?.subscription_id ||
      null
    const pre = preapprovalId ? prePorId.get(String(preapprovalId)) : null
    const emailPagador = (p.payer?.email || '').trim().toLowerCase()

    // Ordem de confiança: vínculo da assinatura no nosso banco → referência do
    // próprio pagamento → referência da assinatura → mesmo pagador de uma
    // assinatura conhecida → email igual ao da conta. O vínculo vem primeiro
    // porque a cobrança recorrente herda o external_reference da assinatura,
    // que pode estar apontando para a conta errada.
    let userId: string | null = preapprovalId ? vinculo.get(String(preapprovalId)) || null : null
    let como = userId ? 'vinculo' : null
    if (!userId) { userId = userIdDaReferencia(p.external_reference); if (userId) como = 'referencia' }
    if (!userId && pre) { userId = userIdDaReferencia(pre.external_reference); if (userId) como = 'assinatura' }
    if (!userId && p.payer?.id && userPorPayer.has(String(p.payer.id))) {
      userId = userPorPayer.get(String(p.payer.id))!; como = 'pagador'
    }
    let conta = userId ? contaPorId.get(userId) : null
    if (!conta && emailPagador && contaPorEmail.has(emailPagador)) {
      conta = contaPorEmail.get(emailPagador); como = 'email'
    }
    if (userId && !conta) como = null

    const taxa = (p.fee_details || []).reduce((s: number, f: any) => s + Number(f.amount || 0), 0)
    const nomePagador = [p.payer?.first_name, p.payer?.last_name].filter(Boolean).join(' ')
      || p.card?.cardholder?.name || null
    const lancado = lancados.get(String(p.id))

    return {
      id: String(p.id),
      data: p.date_created,
      data_aprovacao: p.date_approved,
      liberacao: p.money_release_date,
      liberacao_status: p.money_release_status,
      status: p.status,
      status_detalhe: p.status_detail,
      valor: Number(p.transaction_amount || 0),
      liquido: Number(p.transaction_details?.net_received_amount ?? 0),
      taxa,
      tipo: p.payment_type_id,
      metodo: p.payment_method_id,
      parcelas: p.installments,
      cartao_final: p.card?.last_four_digits || null,
      titular_cartao: p.card?.cardholder?.name || null,
      pagador_nome: nomePagador,
      pagador_email: p.payer?.email || null,
      pagador_doc: p.payer?.identification?.number || p.card?.cardholder?.identification?.number || null,
      descricao: p.description,
      recorrente: p.operation_type === 'recurring_payment' || !!preapprovalId,
      preapproval_id: preapprovalId,
      plano_sugerido: planoPorValor(Number(p.transaction_amount || 0)),
      identificado_por: conta ? como : null,
      conta: resumoConta(conta),
      lancado: !!lancado,
    }
  })

  const assinaturas = preapprovals.map((p) => {
    const conta = contaPorId.get(donoDaAssinatura(p) || '')
      || contaPorEmail.get((p.payer_email || '').trim().toLowerCase())
    const valor = Number(p.auto_recurring?.transaction_amount ?? 0)
    return {
      id: String(p.id),
      vinculada: vinculo.has(String(p.id)),
      status: p.status,
      criada_em: p.date_created,
      atualizada_em: p.last_modified,
      proxima_cobranca: p.next_payment_date,
      valor,
      plano: planoPorValor(valor),
      motivo: p.reason,
      pagador_email: p.payer_email || null,
      cobrancas_ok: p.summarized?.charged_quantity ?? null,
      ultima_cobranca: p.summarized?.last_charged_date ?? null,
      ultima_cobranca_valor: p.summarized?.last_charged_amount ?? null,
      conta: resumoConta(conta),
    }
  })

  // Lista enxuta para escolher a conta à mão quando o pagamento não se identifica
  const opcoesContas = (contas || [])
    .map((c: any) => ({ id: c.id, nome: c.nome_empresa || c.nome_completo || c.email, email: c.email }))
    .sort((a: any, b: any) => String(a.nome || '').localeCompare(String(b.nome || ''), 'pt-BR'))

  return { pagamentos, assinaturas, contas: opcoesContas, gerado_em: new Date().toISOString() }
}

// ============================================
// lancar: registra o pagamento e renova a conta +30 dias
// ============================================
// A data nova parte do MAIOR entre o vencimento atual e a data do pagamento:
// quem paga adiantado não perde dia, quem paga atrasado não ganha os dias que
// ficou sem pagar.

async function lancar(supabase: any, body: any) {
  const paymentId = String(body?.payment_id || '').trim()
  const userId = String(body?.user_id || '').trim()
  if (!paymentId || !UUID.test(userId)) throw new Error('payment_id e user_id são obrigatórios')

  const { data: jaLancado } = await supabase
    .from('pagamentos_mercadopago').select('id, user_id').eq('payment_id', paymentId).maybeSingle()
  if (jaLancado) throw new Error('Esse pagamento já foi lançado no sistema')

  const p = await mpGet(`/v1/payments/${paymentId}`)
  if (p.status !== 'approved') throw new Error(`Pagamento está "${p.status}" no Mercado Pago, não aprovado`)

  const preapprovalId = p.metadata?.preapproval_id || p.point_of_interaction?.transaction_data?.subscription_id || null
  const valor = Number(p.transaction_amount || 0)
  const plano = ['starter', 'pro', 'premium'].includes(body?.plano) ? body.plano : planoPorValor(valor)

  const { data: conta } = await supabase
    .from('usuarios').select('id, plano_vencimento, virou_pagante_em').eq('id', userId).maybeSingle()
  if (!conta) throw new Error('Conta não encontrada')

  const dataPagamento = new Date(p.date_approved || p.date_created)
  const vencAtual = conta.plano_vencimento ? new Date(conta.plano_vencimento) : null
  const base = vencAtual && vencAtual > dataPagamento ? vencAtual : dataPagamento
  const novoVencimento = new Date(base.getTime() + 30 * 24 * 60 * 60 * 1000)

  const { error: errPag } = await supabase.from('pagamentos_mercadopago').insert({
    user_id: userId,
    payment_id: paymentId,
    subscription_id: preapprovalId ? String(preapprovalId) : null,
    valor,
    status: p.status,
    status_detail: p.status_detail,
    payment_type_id: p.payment_type_id,
    payment_method_id: p.payment_method_id,
    data_pagamento: p.date_created,
    data_aprovacao: p.date_approved,
    external_reference: p.external_reference || null,
    metadata: { lancado_manual: true, plano },
  })
  if (errPag) throw new Error('Não consegui registrar o pagamento: ' + errPag.message)

  const atualizacao: Record<string, unknown> = {
    plano_pago: true,
    plano,
    limite_mensal: LIMITE_POR_PLANO[plano],
    plano_vencimento: novoVencimento.toISOString(),
    cancelado_em: null,
    cancelado_motivo: null,
    updated_at: new Date().toISOString(),
  }
  if (!conta.virou_pagante_em) atualizacao.virou_pagante_em = dataPagamento.toISOString()

  const { error: errUser } = await supabase.from('usuarios').update(atualizacao).eq('id', userId)
  if (errUser) throw new Error('Pagamento registrado, mas a conta não renovou: ' + errUser.message)

  // Alterar plano exige as DUAS tabelas (usuarios + controle_planos)
  await supabase.from('controle_planos').update({
    plano,
    limite_mensal: LIMITE_POR_PLANO[plano],
    status: 'ativo',
    updated_at: new Date().toISOString(),
  }).eq('user_id', userId)

  // Cobrança de assinatura lançada numa conta = essa assinatura é dessa conta.
  // Vincula junto, senão o mês que vem cai de novo na conta errada.
  let vinculo = null
  if (preapprovalId) {
    try {
      vinculo = await vincularAssinatura(supabase, String(preapprovalId), userId)
    } catch (e) {
      console.error('⚠️ Lançado, mas não consegui vincular a assinatura:', e.message)
    }
  }

  console.log(`✅ Pagamento ${paymentId} lançado em ${userId} — ${plano} até ${novoVencimento.toISOString()}`)
  return { ok: true, plano, plano_vencimento: novoVencimento.toISOString(), vinculo }
}

// ============================================
// vincular: diz de qual conta é uma assinatura de cartão
// ============================================
// Grava em DOIS lugares:
//   1. assinaturas_mercadopago.user_id — é o que o webhook e esta tela leem
//      primeiro. É o vínculo de verdade.
//   2. external_reference da assinatura no MP — para as cobranças futuras já
//      nascerem com a conta certa, e para a confirmação da tela Minha
//      Assinatura (que busca por external_reference) achar a conta certa.
// Se o passo 2 falhar, o 1 já resolve: tudo no nosso lado lê o banco antes.

async function vincularAssinatura(supabase: any, preapprovalId: string, userId: string) {
  const { data: conta } = await supabase
    .from('usuarios').select('id').eq('id', userId).maybeSingle()
  if (!conta) throw new Error('Conta não encontrada')

  const pre = await mpGet(`/preapproval/${preapprovalId}`)
  const valor = Number(pre.auto_recurring?.transaction_amount ?? 0)

  const dados = {
    user_id: userId,
    subscription_id: preapprovalId,
    preapproval_id: preapprovalId,
    payer_id: pre.payer_id,
    payer_email: pre.payer_email,
    plano: planoPorValor(valor),
    status: pre.status || 'pending',
    valor,
    data_inicio: pre.date_created,
    proxima_cobranca: pre.next_payment_date,
    external_reference: userId,
    metadata: pre,
    updated_at: new Date().toISOString(),
  }

  const { data: existentes } = await supabase
    .from('assinaturas_mercadopago').select('id').eq('subscription_id', preapprovalId)
  if (existentes?.length) {
    const { error } = await supabase.from('assinaturas_mercadopago').update(dados).eq('subscription_id', preapprovalId)
    if (error) throw new Error('Não consegui salvar o vínculo: ' + error.message)
  } else {
    const { error } = await supabase.from('assinaturas_mercadopago').insert(dados)
    if (error) throw new Error('Não consegui salvar o vínculo: ' + error.message)
  }

  // Cobranças dessa assinatura já registradas passam para a conta certa
  await supabase.from('pagamentos_mercadopago').update({ user_id: userId }).eq('subscription_id', preapprovalId)

  let mpAtualizado = false
  if (pre.external_reference !== userId) {
    const r = await fetch(`https://api.mercadopago.com/preapproval/${preapprovalId}`, {
      method: 'PUT',
      headers: { 'Authorization': `Bearer ${MP_ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ external_reference: userId }),
    })
    mpAtualizado = r.ok
    if (!r.ok) console.error(`⚠️ MP recusou trocar external_reference de ${preapprovalId}:`, r.status, await r.text())
  } else {
    mpAtualizado = true
  }

  console.log(`🔗 Assinatura ${preapprovalId} vinculada a ${userId} (MP ${mpAtualizado ? 'ok' : 'não atualizou'})`)
  return { ok: true, preapproval_id: preapprovalId, user_id: userId, status: dados.status, mp_atualizado: mpAtualizado }
}
