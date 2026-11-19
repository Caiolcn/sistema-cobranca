// Edge Function: Conciliação do cartão recorrente (Mercado Pago)
//
// POR QUE ISTO EXISTE: o MP debita o cartão das assinaturas (preapproval) mas
// NÃO avisa a gente. O `notification_url` que create-subscription manda no
// /preapproval é ignorado pelo MP (volta null na assinatura), e o webhook do
// painel nunca entregou um evento real de assinatura nem de cobrança de cartão
// — só a simulação de 14/10. Resultado: toda baixa de cartão até 19/10/2026 foi
// feita à mão em /admin/assinaturas, e o cliente ficava com o plano vencido
// (cobranças dos alunos pausadas) entre o vencimento e o lançamento manual.
//
// Em vez de depender do webhook, esta função PERGUNTA ao MP, de hora em hora:
//   1. atualiza status e próxima cobrança das assinaturas que conhecemos;
//   2. registra as cobranças recorrentes aprovadas que ainda não estão no banco;
//   3. renova a conta: plano_vencimento = próxima cobrança do MP + TOLERANCIA_DIAS.
//
// O vencimento passa a seguir o calendário do MP (mesmo dia todo mês), não
// "+30 dias". A tolerância cobre o horário do débito e as retentativas do MP:
// a conta não pausa enquanto o cartão ainda está sendo cobrado.
// ⚠️ vw_mensalli_cobranca_saas conta com esses mesmos 3 dias (data do débito =
// vencimento − 3). Mudou aqui, muda lá.
//
// Chamada:
//  - pg_cron de hora em hora (header x-cron-secret, body {})
//  - admin logado, com body opcional { dias?: number } (janela de pagamentos)
//  - { dryRun: true } -> só lê o MP e devolve o que faria; não grava nada
// Auth em _shared/cron-auth.ts. Publicar com --no-verify-jwt.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { cronOuAdmin, CABECALHOS_CORS_CRON } from '../_shared/cron-auth.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const MP_ACCESS_TOKEN = Deno.env.get('MERCADOPAGO_ACCESS_TOKEN')!

const TOLERANCIA_DIAS = 3
const DIA_MS = 24 * 60 * 60 * 1000

// Cobrança aprovada só renova se for do ciclo atual: aprovada no máximo 35 dias
// antes da próxima cobrança. Sem isso, uma assinatura que continua
// "authorized" mas com o cartão recusando ganharia mês de graça.
const JANELA_CICLO_DIAS = 35

const MAX_PAGINAS = 10

const LIMITE_POR_PLANO: Record<string, number> = { starter: 200, pro: 600, premium: 3000 }

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': CABECALHOS_CORS_CRON,
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

// Mesma régua do webhook e do /admin/assinaturas: o plano sai do valor.
function planoPorValor(valor: number): string {
  if (valor >= 149) return 'premium'
  if (valor >= 99) return 'pro'
  return 'starter'
}

function preapprovalDoPagamento(p: any): string | null {
  const id = p.metadata?.preapproval_id || p.point_of_interaction?.transaction_data?.subscription_id || null
  return id ? String(id) : null
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

  // ---- Auth: cron (x-cron-secret) OU admin logado ----
  if (!(await cronOuAdmin(req))) return json({ error: 'Unauthorized — admin ou cron' }, 401)

  let body: any = {}
  try { body = await req.json() } catch { /* cron manda {} */ }
  const dias = Math.min(Math.max(Number(body?.dias) || 10, 1), 90)
  const dryRun = body?.dryRun === true

  try {
    return json(await conciliar(supabase, dias, dryRun))
  } catch (error) {
    console.error('❌ conciliar-cartao-mp:', error)
    return json({ error: error.message }, 500)
  }
})

async function conciliar(supabase: any, dias: number, dryRun = false) {
  const fim = new Date()
  const inicio = new Date(fim.getTime() - dias * DIA_MS)

  const [preapprovals, pagamentosMP] = await Promise.all([
    buscarTodos('/preapproval/search'),
    buscarTodos(
      `/v1/payments/search?sort=date_created&criteria=desc&range=date_created` +
      `&begin_date=${encodeURIComponent(inicio.toISOString())}&end_date=${encodeURIComponent(fim.toISOString())}`
    ),
  ])

  // Vínculo assinatura → conta: o NOSSO banco manda (ver handleSubscriptionWebhook).
  // Assinatura que não está no banco fica de fora: quem decide o dono é o admin,
  // em /admin/assinaturas → Vincular.
  const { data: linhas } = await supabase
    .from('assinaturas_mercadopago')
    .select('id, subscription_id, user_id, status, proxima_cobranca, updated_at')
    .order('updated_at', { ascending: true })
  const nossa = new Map<string, any>()
  for (const l of (linhas || [])) {
    if (l.subscription_id && l.user_id) nossa.set(String(l.subscription_id), l)
  }

  const simulacao: unknown[] = []

  // ---- 1. Status e próxima cobrança ----
  let assinaturasAtualizadas = 0
  const prePorId = new Map<string, any>()
  for (const pre of preapprovals) {
    const id = String(pre.id)
    prePorId.set(id, pre)
    const linha = nossa.get(id)
    if (!linha) continue

    const mudouStatus = pre.status && pre.status !== linha.status
    const mudouProxima = (pre.next_payment_date || null) &&
      new Date(pre.next_payment_date).getTime() !== new Date(linha.proxima_cobranca || 0).getTime()
    if (!mudouStatus && !mudouProxima) continue

    if (dryRun) {
      assinaturasAtualizadas++
      simulacao.push({ passo: 'status', assinatura: id, user_id: linha.user_id, de: linha.status, para: pre.status, proxima: pre.next_payment_date })
      linha.status = pre.status
      continue
    }

    const { error } = await supabase
      .from('assinaturas_mercadopago')
      .update({
        status: pre.status,
        proxima_cobranca: pre.next_payment_date,
        metadata: pre,
        updated_at: new Date().toISOString(),
      })
      .eq('subscription_id', id)
    if (error) {
      console.error(`⚠️ Não atualizei a assinatura ${id}:`, error.message)
    } else {
      assinaturasAtualizadas++
      if (mudouStatus) console.log(`🔄 Assinatura ${id}: ${linha.status} → ${pre.status}`)
      linha.status = pre.status
    }
  }

  // ---- 2. Cobranças recorrentes aprovadas que o banco não conhece ----
  const recorrentes = pagamentosMP.filter((p) =>
    p.status === 'approved' && preapprovalDoPagamento(p) && nossa.has(preapprovalDoPagamento(p)!)
  )
  const idsRecorrentes = recorrentes.map((p) => String(p.id))
  const jaNoBanco = new Set<string>()
  if (idsRecorrentes.length) {
    const { data } = await supabase
      .from('pagamentos_mercadopago').select('payment_id').in('payment_id', idsRecorrentes)
    for (const r of (data || [])) jaNoBanco.add(String(r.payment_id))
  }

  const pagamentosNovos: string[] = []
  for (const p of recorrentes) {
    if (jaNoBanco.has(String(p.id))) continue
    const preId = preapprovalDoPagamento(p)!
    const linha = nossa.get(preId)
    if (dryRun) {
      pagamentosNovos.push(String(p.id))
      simulacao.push({ passo: 'pagamento', payment_id: String(p.id), assinatura: preId, user_id: linha.user_id, valor: p.transaction_amount, aprovado_em: p.date_approved })
      continue
    }
    const { error } = await supabase.from('pagamentos_mercadopago').insert({
      user_id: linha.user_id,
      assinatura_id: linha.id,
      payment_id: String(p.id),
      subscription_id: preId,
      valor: Number(p.transaction_amount || 0),
      status: p.status,
      status_detail: p.status_detail,
      payment_type_id: p.payment_type_id,
      payment_method_id: p.payment_method_id,
      data_pagamento: p.date_created,
      data_aprovacao: p.date_approved,
      external_reference: p.external_reference || null,
      metadata: { origem: 'conciliacao' },
    })
    if (error) {
      console.error(`⚠️ Não registrei o pagamento ${p.id}:`, error.message)
      continue
    }
    pagamentosNovos.push(String(p.id))
    console.log(`💳 Cobrança ${p.id} (assinatura ${preId}) registrada para ${linha.user_id}`)
  }

  // ---- 3. Renovação: vencimento = próxima cobrança do MP + tolerância ----
  // Também realinha quem foi renovado por "+30 dias" (webhook, tela de retorno
  // ou lançamento manual), que deixava o vencimento 1 dia antes do débito.
  const renovadas: unknown[] = []
  for (const [preId, linha] of nossa) {
    const pre = prePorId.get(preId)
    if (pre?.status !== 'authorized' || !pre.next_payment_date) continue

    const proxima = new Date(pre.next_payment_date)
    const { data: ultimo } = await supabase
      .from('pagamentos_mercadopago')
      .select('data_aprovacao, data_pagamento, valor')
      .eq('subscription_id', preId)
      .eq('status', 'approved')
      .order('data_pagamento', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (!ultimo) continue

    const pagoEm = new Date(ultimo.data_aprovacao || ultimo.data_pagamento)
    if (pagoEm.getTime() < proxima.getTime() - JANELA_CICLO_DIAS * DIA_MS) continue

    const alvo = new Date(proxima.getTime() + TOLERANCIA_DIAS * DIA_MS)

    const { data: conta } = await supabase
      .from('usuarios').select('id, plano_vencimento, virou_pagante_em').eq('id', linha.user_id).maybeSingle()
    if (!conta) continue
    const vencAtual = conta.plano_vencimento ? new Date(conta.plano_vencimento) : null
    // Só estende. Uma diferença de minutos não vale um update.
    if (vencAtual && vencAtual.getTime() >= alvo.getTime() - 60 * 60 * 1000) continue

    const plano = planoPorValor(Number(pre.auto_recurring?.transaction_amount ?? ultimo.valor ?? 0))
    const atualizacao: Record<string, unknown> = {
      plano_pago: true,
      plano,
      limite_mensal: LIMITE_POR_PLANO[plano],
      plano_vencimento: alvo.toISOString(),
      cancelado_em: null,
      cancelado_motivo: null,
      updated_at: new Date().toISOString(),
    }
    if (!conta.virou_pagante_em) atualizacao.virou_pagante_em = pagoEm.toISOString()

    if (dryRun) {
      renovadas.push({ user_id: conta.id, assinatura: preId, de: conta.plano_vencimento, para: alvo.toISOString(), plano, simulado: true })
      continue
    }

    const { error: errUser } = await supabase.from('usuarios').update(atualizacao).eq('id', conta.id)
    if (errUser) {
      console.error(`⚠️ Não renovei ${conta.id}:`, errUser.message)
      continue
    }
    // Alterar plano exige as DUAS tabelas (usuarios + controle_planos)
    await supabase.from('controle_planos').update({
      plano,
      limite_mensal: LIMITE_POR_PLANO[plano],
      status: 'ativo',
      updated_at: new Date().toISOString(),
    }).eq('user_id', conta.id)

    renovadas.push({ user_id: conta.id, assinatura: preId, de: conta.plano_vencimento, para: alvo.toISOString() })
    console.log(`✅ ${conta.id} renovado até ${alvo.toISOString()} (assinatura ${preId})`)
  }

  return {
    dryRun,
    simulacao: dryRun ? simulacao : undefined,
    assinaturas_mp: preapprovals.length,
    assinaturas_atualizadas: assinaturasAtualizadas,
    pagamentos_novos: pagamentosNovos,
    renovadas,
    janela_dias: dias,
    gerado_em: new Date().toISOString(),
  }
}
