// Autenticação das chamadas do pg_cron às edge functions.
// ---------------------------------------------------------------------------
// Até 02/11/2026 o cron mandava a service_role LEGADA (JWT) no Authorization.
// As chaves legadas estão desligadas desde jun/2026 (vazamento), e na noite de
// 02/11 o gateway passou a recusá-las também nas edge functions: 401 "Legacy
// API keys are disabled" em todas as crons.
//
// Agora o cron manda um segredo próprio no header x-cron-secret. O valor fica em
// dois lugares e só neles: Vault (name = 'cron_secret') e segredo da função
// (CRON_SECRET). Nunca vai para o front. Vazou? Troca nos dois.
//
// As funções que usam isto são publicadas com --no-verify-jwt (o gateway não
// sabe validar esse segredo). Por isso NADA aqui confia em JWT só decodificado:
// admin é validado no Auth (getUser) + papel na tabela usuarios.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CRON_SECRET = Deno.env.get('CRON_SECRET') || ''

function igualSemVazarTempo(a: string, b: string): boolean {
  const ea = new TextEncoder().encode(a)
  const eb = new TextEncoder().encode(b)
  if (ea.length !== eb.length) return false
  let dif = 0
  for (let i = 0; i < ea.length; i++) dif |= ea[i] ^ eb[i]
  return dif === 0
}

// true quando quem chama é o pg_cron (x-cron-secret certo).
export function ehCron(req: Request): boolean {
  if (CRON_SECRET.length < 32) {
    console.error('[cron-auth] CRON_SECRET ausente ou curto demais — chamada do cron recusada')
    return false
  }
  const recebido = req.headers.get('x-cron-secret') || ''
  return recebido.length > 0 && igualSemVazarTempo(recebido, CRON_SECRET)
}

// userId do admin logado (JWT de sessão validado no Auth) ou null.
export async function adminLogado(req: Request): Promise<string | null> {
  const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '').trim()
  if (!token || token.split('.').length !== 3) return null
  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const { data } = await sb.auth.getUser(token)
  const uid = data?.user?.id
  if (!uid) return null
  const { data: perfil } = await sb.from('usuarios').select('role').eq('id', uid).maybeSingle()
  return perfil?.role === 'admin' ? uid : null
}

export async function cronOuAdmin(req: Request): Promise<boolean> {
  return ehCron(req) || (await adminLogado(req)) !== null
}

// Cabeçalho do CORS: o painel não manda x-cron-secret, mas deixa listado.
export const CABECALHOS_CORS_CRON = 'authorization, x-client-info, apikey, content-type, x-cron-secret'
