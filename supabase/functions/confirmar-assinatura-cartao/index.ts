// Edge Function: Confirmar Assinatura (cartão)
//
// Pergunta ao Mercado Pago, na hora, se a assinatura de cartão da pessoa foi
// autorizada — e ativa a conta se foi.
//
// POR QUE ISTO EXISTE: a ativação do cartão dependia 100% do webhook
// `subscription_preapproval`, que NUNCA chegou uma vez sequer (webhook_logs
// não tem um único evento de assinatura desde que o projeto existe). O
// `notification_url` que create-subscription manda no corpo do /preapproval é
// ignorado pelo MP: assinatura só notifica na URL cadastrada no painel da
// aplicação, com os tópicos de assinatura marcados. Resultado: a cliente
// pagava, o dinheiro caía na conta, e a tela de retorno dizia "Pagamento Não
// Aprovado" porque lia o NOSSO banco, que continuava `pending`.
//
// Mesmo com o painel arrumado, webhook é entrega best-effort. Aqui a conta
// destrava perguntando, que é o caminho que não tem como não chegar.
//
// POST { preapproval_id?: string }
//   → { status, plano, plano_vencimento, ativou, duplicadas[] }
//
// `status` é o do MP: authorized | pending | paused | cancelled | nenhuma.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const MP_ACCESS_TOKEN = Deno.env.get('MERCADOPAGO_ACCESS_TOKEN')!

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Mesma régua do webhook: o plano sai do valor, não de quem chamou.
function planoPorValor(valor: number): string {
  if (valor >= 149) return 'premium'
  if (valor >= 99) return 'pro'
  return 'starter'
}

async function mpGet(path: string) {
  const r = await fetch(`https://api.mercadopago.com${path}`, {
    headers: { 'Authorization': `Bearer ${MP_ACCESS_TOKEN}` },
  })
  if (!r.ok) {
    console.error(`❌ MP ${path} → ${r.status}`, await r.text())
    return null
  }
  return await r.json()
}

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) throw new Error('Authorization header missing')

    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    })

    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) throw new Error('Unauthorized')

    // Escritas vão pela service_role: ativar_assinatura_usuario mexe em
    // usuarios/controle_planos, que a pessoa não escreve sozinha.
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    let body: any = {}
    try { body = await req.json() } catch { /* body vazio é legítimo */ }

    console.log('👤 Confirmando assinatura de', user.id, '| preapproval:', body?.preapproval_id || '(nenhum)')

    // ---- 1. Quais preapprovals olhar ----
    // O id que volta na URL do checkout é o caminho rápido. A busca por
    // external_reference é a rede de segurança: cobre quem fechou o navegador
    // na volta, quem voltou por outro aparelho e quem clicou duas vezes.
    const ids = new Set<string>()
    if (typeof body?.preapproval_id === 'string' && body.preapproval_id.trim()) {
      ids.add(body.preapproval_id.trim())
    }

    const busca = await mpGet(`/preapproval/search?external_reference=${encodeURIComponent(user.id)}&limit=20`)
    for (const r of (busca?.results || [])) {
      if (r?.id) ids.add(String(r.id))
    }

    // E o que já está no nosso banco — inclusive tentativas antigas, de antes
    // desta função existir, que ficaram penduradas em `pending`.
    const { data: pendentes } = await admin
      .from('assinaturas_mercadopago')
      .select('subscription_id')
      .eq('user_id', user.id)
      .neq('status', 'cancelled')
    for (const p of (pendentes || [])) {
      if (p?.subscription_id) ids.add(String(p.subscription_id))
    }

    if (ids.size === 0) {
      return json({ status: 'nenhuma', ativou: false, duplicadas: [] })
    }

    // ---- 2. Perguntar ao MP o estado real de cada uma ----
    const autorizadas: string[] = []
    let melhorStatus = 'nenhuma'
    let ativou = false

    for (const id of ids) {
      const pre = await mpGet(`/preapproval/${id}`)
      if (!pre) continue

      // Trava de dono: só encosto em preapproval cujo external_reference é
      // esta pessoa. Sem isto, mandar um id alheio ativaria a conta errada.
      if (pre.external_reference !== user.id) {
        console.warn('⚠️ preapproval', id, 'não pertence a', user.id, '— ignorado')
        continue
      }

      const valor = parseFloat(
        pre.auto_recurring?.transaction_amount ?? pre.transaction_amount ?? 0
      )
      const plano = planoPorValor(valor)
      const status = pre.status || 'pending'

      if (status === 'authorized') autorizadas.push(String(id))
      if (status === 'authorized' || melhorStatus === 'nenhuma') melhorStatus = status

      const dados = {
        user_id: user.id,
        subscription_id: String(id),
        preapproval_id: String(id),
        payer_id: pre.payer_id,
        payer_email: pre.payer_email,
        plano,
        status,
        valor,
        data_inicio: pre.date_created,
        proxima_cobranca: pre.next_payment_date,
        external_reference: pre.external_reference,
        metadata: pre,
        updated_at: new Date().toISOString(),
      }

      const { data: existente } = await admin
        .from('assinaturas_mercadopago')
        .select('id, status')
        .eq('subscription_id', String(id))
        .maybeSingle()

      if (existente) {
        await admin.from('assinaturas_mercadopago').update(dados).eq('id', existente.id)
      } else {
        await admin.from('assinaturas_mercadopago').insert(dados)
      }

      // ---- 3. Ativar, uma vez só ----
      // ativar_assinatura_usuario joga o vencimento pra now()+30 TODA vez que
      // roda. Como a tela de retorno chama isto em loop, a ativação tem que
      // acontecer só na virada pending → authorized: se a linha já estava
      // authorized, o dia de vencimento fica onde está.
      if (status === 'authorized' && existente?.status !== 'authorized') {
        const { error: rpcErro } = await admin.rpc('ativar_assinatura_usuario', {
          p_user_id: user.id,
          p_plano: plano,
        })
        if (rpcErro) {
          console.error('❌ ativar_assinatura_usuario falhou:', rpcErro.message)
        } else {
          ativou = true
          console.log(`✅ ${user.id} ativado no plano ${plano} pela confirmação ativa (preapproval ${id})`)
        }
      }
    }

    // Duas assinaturas autorizadas = cartão debitado duas vezes por mês. Não
    // cancelo sozinho (é dinheiro da pessoa), mas devolvo pra quem chamou ver
    // e deixo o log gritando.
    const duplicadas = autorizadas.length > 1 ? autorizadas : []
    if (duplicadas.length) {
      console.error('🚨 ASSINATURAS DUPLICADAS para', user.id, '→', duplicadas.join(', '))
    }

    const { data: usuario } = await admin
      .from('usuarios')
      .select('plano, plano_pago, plano_vencimento')
      .eq('id', user.id)
      .maybeSingle()

    return json({
      status: melhorStatus,
      ativou,
      plano: usuario?.plano || null,
      plano_pago: usuario?.plano_pago ?? false,
      plano_vencimento: usuario?.plano_vencimento || null,
      duplicadas,
    })

  } catch (error) {
    console.error('❌ Erro ao confirmar assinatura:', error)
    return json({ error: error.message }, 400)
  }
})
