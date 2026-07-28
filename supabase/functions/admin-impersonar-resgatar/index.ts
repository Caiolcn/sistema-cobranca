// Edge Function: Ver como cliente (resgatar link)
//
// Roda SEM JWT (verify_jwt = false) de propósito: quem abre a URL está num
// navegador anônimo, sem sessão nenhuma. A autorização é o próprio token —
// aleatório de 32 bytes, guardado como sha256, uso único e validade de 15 min,
// emitido por admin em admin-impersonar.
//
// Devolve o hashed_token do magic link; o front chama verifyOtp com ele e
// vira o cliente. Este endpoint NAO cria a sessao — ela nasce no browser.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

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

async function sha256(valor: string): Promise<string> {
  const bytes = new TextEncoder().encode(valor)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

  let body: { token?: string }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Body inválido' }, 400)
  }

  const token = (body.token || '').trim()
  if (!token) return json({ error: 'Token ausente' }, 400)

  const { data: registro } = await supabase
    .from('admin_impersonation_tokens')
    .select('id, magic_token_hash, target_user_id, admin_user_id, expira_em, usado_em')
    .eq('token_hash', await sha256(token))
    .maybeSingle()

  // Mesma resposta para token inexistente, ja usado e expirado: nao entregamos
  // pista nenhuma pra quem estiver chutando token.
  const invalido = () => json({ error: 'Link inválido, expirado ou já utilizado' }, 401)

  if (!registro) return invalido()
  if (registro.usado_em) return invalido()
  if (new Date(registro.expira_em) < new Date()) return invalido()

  // Marca como usado ANTES de devolver, e so segue se esta chamada foi quem
  // marcou (usado_em is null no filtro): dois cliques simultaneos, um perde.
  const { data: consumido } = await supabase
    .from('admin_impersonation_tokens')
    .update({
      usado_em: new Date().toISOString(),
      ip_resgate: req.headers.get('x-forwarded-for') || null,
    })
    .eq('id', registro.id)
    .is('usado_em', null)
    .select('id')
    .maybeSingle()

  if (!consumido) return invalido()

  const { data: alvo } = await supabase
    .from('usuarios')
    .select('id, email, nome_empresa, nome_completo')
    .eq('id', registro.target_user_id)
    .maybeSingle()

  const nomeConta = alvo?.nome_empresa || alvo?.nome_completo || alvo?.email || 'Conta'

  await supabase.from('log_auditoria').insert({
    user_id: registro.admin_user_id,
    acao: 'impersonation_usada',
    campo: 'sessao_espelho',
    valor_anterior: null,
    valor_novo: registro.target_user_id,
    detalhes: `Sessão espelho aberta em ${nomeConta}`,
  })

  return json({
    hashedToken: registro.magic_token_hash,
    email: alvo?.email,
    targetUserId: registro.target_user_id,
    conta: nomeConta,
  })
})
