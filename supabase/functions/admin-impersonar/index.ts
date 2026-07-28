// Edge Function: Ver como cliente (gerar link)
//
// O seletor admin do Dashboard só troca o user_id usado nas queries — o JWT
// continua sendo o do admin, então toda tabela precisa de OR is_admin() na
// policy e, onde falta, a tela vem VAZIA sem erro. Aqui a gente resolve por
// baixo: gera um magic link do cliente, e quem abre passa a rodar com a sessao
// dele, sob a RLS dele.
//
// Só admin chama (verify_jwt = true + checagem de role).
// Devolve uma URL de uso unico, valida por 15 minutos, para abrir no anonimo.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

// Janela curta de propósito: o link é para uso imediato no navegador anônimo.
const VALIDADE_MINUTOS = 15

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

function tokenAleatorio(): string {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

  // ---- Auth: só admin logado ----
  const authHeader = req.headers.get('Authorization') || ''
  const jwt = authHeader.replace(/^Bearer\s+/i, '').trim()
  if (!jwt) return json({ error: 'Unauthorized' }, 401)

  const { data: authData } = await supabase.auth.getUser(jwt)
  const adminId = authData?.user?.id
  if (!adminId) return json({ error: 'Unauthorized' }, 401)

  const { data: perfilAdmin } = await supabase
    .from('usuarios').select('role').eq('id', adminId).maybeSingle()

  if (perfilAdmin?.role !== 'admin') {
    return json({ error: 'Unauthorized — apenas admin' }, 403)
  }

  // ---- Alvo ----
  let body: { targetUserId?: string }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Body inválido' }, 400)
  }

  const targetUserId = body.targetUserId
  if (!targetUserId) return json({ error: 'targetUserId é obrigatório' }, 400)
  if (targetUserId === adminId) {
    return json({ error: 'Você já está na sua própria conta' }, 400)
  }

  const { data: alvo } = await supabase
    .from('usuarios')
    .select('id, email, nome_empresa, nome_completo, role')
    .eq('id', targetUserId)
    .maybeSingle()

  if (!alvo) return json({ error: 'Conta não encontrada' }, 404)
  if (!alvo.email) return json({ error: 'Conta sem e-mail — impossível gerar link' }, 400)
  // Impersonar outro admin nao tem caso de uso e so aumenta o estrago possivel.
  if (alvo.role === 'admin') {
    return json({ error: 'Não é possível ver como outro admin' }, 400)
  }

  // ---- Magic link (NAO dispara e-mail: generateLink so devolve o token) ----
  const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
    type: 'magiclink',
    email: alvo.email,
  })

  const hashedToken = linkData?.properties?.hashed_token
  if (linkError || !hashedToken) {
    return json({ error: `Falha ao gerar link: ${linkError?.message || 'sem hashed_token'}` }, 500)
  }

  // ---- Token proprio (curto, uso unico, revogavel) ----
  const token = tokenAleatorio()
  const expiraEm = new Date(Date.now() + VALIDADE_MINUTOS * 60 * 1000).toISOString()

  const { error: insertError } = await supabase
    .from('admin_impersonation_tokens')
    .insert({
      token_hash: await sha256(token),
      magic_token_hash: hashedToken,
      target_user_id: targetUserId,
      admin_user_id: adminId,
      expira_em: expiraEm,
    })

  if (insertError) {
    return json({ error: `Falha ao salvar token: ${insertError.message}` }, 500)
  }

  const nomeConta = alvo.nome_empresa || alvo.nome_completo || alvo.email

  await supabase.from('log_auditoria').insert({
    user_id: adminId,
    acao: 'impersonation_gerada',
    campo: 'sessao_espelho',
    valor_anterior: null,
    valor_novo: targetUserId,
    detalhes: `Link "ver como" gerado para ${nomeConta} (expira em ${VALIDADE_MINUTOS} min)`,
  })

  const appUrl = (Deno.env.get('APP_URL') || req.headers.get('origin') || '').replace(/\/$/, '')

  return json({
    url: `${appUrl}/ver-como/${token}`,
    expiraEm,
    validadeMinutos: VALIDADE_MINUTOS,
    conta: nomeConta,
  })
})
