// Edge Function: Meta Conversions API
//
// Manda eventos de conversão pro Meta pelo SERVIDOR. É o que faltava pro
// Facebook saber quem virou pagante — antes só o cadastro chegava lá (pelo
// pixel, no navegador), e o algoritmo otimizava pra cadastro barato em vez
// de cliente que paga.
//
// Duas portas de entrada:
//   1. front (Signup.js)  → CompleteRegistration, com o mesmo event_id do
//      pixel pra deduplicar
//   2. triggers do banco  → Purchase e AtivouWhatsApp, que acontecem sem
//      navegador nenhum aberto
//
// Segredos necessários (Supabase → Edge Functions → Secrets):
//   META_PIXEL_ID           id do pixel da conta de anúncios
//   META_CAPI_ACCESS_TOKEN  token de acesso da CAPI (Eventos → Configurar)
//   META_TEST_EVENT_CODE    opcional; enquanto validar em "Testar eventos"

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const META_PIXEL_ID = Deno.env.get('META_PIXEL_ID') ?? ''
const META_CAPI_ACCESS_TOKEN = Deno.env.get('META_CAPI_ACCESS_TOKEN') ?? ''
const META_TEST_EVENT_CODE = Deno.env.get('META_TEST_EVENT_CODE') ?? ''

const GRAPH_VERSION = 'v21.0'

// Espelha os preços de UpgradePage.js. Se mudar lá, muda aqui — é o valor que
// o Meta usa pra calcular ROAS.
const PRECOS: Record<string, number> = { starter: 49.90, pro: 99.90, premium: 149.90 }

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// ============================================
// Normalização + hash (exigência do Meta)
// ============================================

async function sha256(valor: string): Promise<string> {
  const bytes = new TextEncoder().encode(valor)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

const normalizarEmail = (email?: string | null) =>
  email ? email.trim().toLowerCase() : null

// O Meta espera E.164 sem o "+". O banco guarda só DDD+número (10 ou 11
// dígitos), então o 55 entra aqui.
function normalizarTelefone(telefone?: string | null): string | null {
  if (!telefone) return null
  const digitos = telefone.replace(/\D/g, '')
  if (!digitos) return null
  if (digitos.length === 10 || digitos.length === 11) return `55${digitos}`
  if (digitos.startsWith('55') && (digitos.length === 12 || digitos.length === 13)) return digitos
  return digitos
}

// ============================================
// Handler
// ============================================

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

  try {
    const body = await req.json()
    const eventName: string = body.event_name
    const eventId: string = body.event_id

    if (!eventName || !eventId) {
      return json({ ok: false, erro: 'event_name e event_id são obrigatórios' }, 400)
    }

    // Se os segredos ainda não foram configurados, não é erro: só não há pra
    // onde mandar. Responder 200 evita que o trigger fique reenfileirando.
    if (!META_PIXEL_ID || !META_CAPI_ACCESS_TOKEN) {
      console.warn('⚠️ META_PIXEL_ID/META_CAPI_ACCESS_TOKEN ausentes — evento descartado')
      return json({ ok: false, pulado: 'segredos não configurados' })
    }

    // Quem chama com JWT de usuário só pode falar de si mesmo. O service_role
    // (triggers do banco) manda o user_id que quiser.
    const userId = resolverUserId(req, body.user_id)
    if (!userId) {
      return json({ ok: false, erro: 'user_id não identificado' }, 400)
    }

    const { data: usuario } = await supabase
      .from('usuarios')
      .select('email, telefone, plano')
      .eq('id', userId)
      .maybeSingle()

    // fbp/fbc vêm do corpo (chamada do front, dado fresco) ou da tabela de
    // atribuição (chamada do trigger, dias depois do clique).
    const { data: atribuicao } = await supabase
      .from('meta_atribuicao')
      .select('fbp, fbc, user_agent, landing_url')
      .eq('user_id', userId)
      .maybeSingle()

    const fbp = body.fbp || atribuicao?.fbp || null
    const fbc = body.fbc || atribuicao?.fbc || null
    const userAgent = body.user_agent || atribuicao?.user_agent || null
    const sourceUrl = body.event_source_url || atribuicao?.landing_url || 'https://mensalli.com.br'

    const userData: Record<string, unknown> = {
      external_id: [await sha256(userId)],
    }

    const email = normalizarEmail(body.email || usuario?.email)
    if (email) userData.em = [await sha256(email)]

    const telefone = normalizarTelefone(body.telefone || usuario?.telefone)
    if (telefone) userData.ph = [await sha256(telefone)]

    if (fbp) userData.fbp = fbp
    if (fbc) userData.fbc = fbc
    if (userAgent) userData.client_user_agent = userAgent

    const customData: Record<string, unknown> = {}
    const plano = body.plano || usuario?.plano
    const valor = body.valor ?? (eventName === 'Purchase' ? (PRECOS[plano] ?? PRECOS.pro) : null)
    if (valor != null) {
      customData.value = valor
      customData.currency = 'BRL'
    }
    if (plano) customData.content_name = plano

    const payload: Record<string, unknown> = {
      data: [
        {
          event_name: eventName,
          event_time: Math.floor(Date.now() / 1000),
          event_id: eventId,
          action_source: 'website',
          event_source_url: sourceUrl,
          user_data: userData,
          custom_data: customData,
        },
      ],
    }
    if (META_TEST_EVENT_CODE) payload.test_event_code = META_TEST_EVENT_CODE

    const resposta = await fetch(
      `https://graph.facebook.com/${GRAPH_VERSION}/${META_PIXEL_ID}/events?access_token=${META_CAPI_ACCESS_TOKEN}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }
    )

    const resultado = await resposta.json()
    const sucesso = resposta.ok && !resultado.error

    // Auditoria. O event_id é UNIQUE: se o trigger já criou a linha, isto só
    // completa com a resposta do Meta.
    await supabase
      .from('meta_capi_eventos')
      .upsert(
        {
          user_id: userId,
          event_name: eventName,
          event_id: eventId,
          valor,
          origem: body.origem || 'front',
          resposta: resultado,
          enviado_em: new Date().toISOString(),
        },
        { onConflict: 'event_id' }
      )

    if (!sucesso) {
      console.error('❌ Meta recusou o evento:', JSON.stringify(resultado))
      return json({ ok: false, resposta: resultado }, 200)
    }

    console.log(`✅ ${eventName} enviado — user=${userId} event_id=${eventId}`)
    return json({ ok: true, resposta: resultado })
  } catch (error) {
    console.error('❌ Erro na meta-capi:', error)
    // 200 de propósito: medição nunca derruba quem chamou (webhook de
    // pagamento, cadastro). O erro fica no log.
    return json({ ok: false, erro: String(error) }, 200)
  }
})

function json(corpo: unknown, status = 200) {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

/**
 * JWT já foi validado pelo gateway (verify_jwt = true), então aqui só lemos as
 * claims. `service_role` = trigger do banco, confia no user_id do corpo.
 * Qualquer outro papel = navegador, força o `sub` do próprio token.
 */
function resolverUserId(req: Request, userIdDoCorpo?: string): string | null {
  try {
    const token = req.headers.get('Authorization')?.replace('Bearer ', '')
    if (!token) return userIdDoCorpo ?? null

    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')))
    if (payload.role === 'service_role') return userIdDoCorpo ?? null
    return payload.sub ?? null
  } catch {
    return userIdDoCorpo ?? null
  }
}
