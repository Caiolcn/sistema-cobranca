// Código comum das edge functions do Orgânico (organico-importar,
// organico-coletar, organico-publicar).
//
// Regra de ouro: o token da Meta NUNCA sai daqui. Ele vai no header
// Authorization das chamadas à Graph, nunca na URL que a gente monta, e as
// mensagens de erro devolvidas para o front/log levam só error.message da Meta.
// Os links "next" de paginação da Graph podem conter o access_token: eles só
// são usados dentro da função e nunca são logados ou devolvidos.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { ehCron } from './cron-auth.ts'

export const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
export const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
export const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!
// A Meta já devolve links em v25.0; dá para trocar pelo segredo sem redeploy de código.
export const GRAPH = `https://graph.facebook.com/${Deno.env.get('META_GRAPH_VERSION') || 'v25.0'}`

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-organico-token, x-cron-secret',
}

export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })

export const adminClient = () => createClient(SUPABASE_URL, SERVICE_KEY)

// Cron (x-cron-secret, ver _shared/cron-auth.ts) ou admin logado. O admin é
// validado pelo banco (rpc is_admin confere a assinatura do JWT), então as
// funções que usam isto são publicadas COM --no-verify-jwt.
export async function autorizadoAdminOuCron(req: Request): Promise<{ ok: boolean; userId?: string }> {
  if (ehCron(req)) return { ok: true }
  const bearer = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '')
  if (!bearer) return { ok: false }
  const cli = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${bearer}` } },
  })
  const { data, error } = await cli.rpc('is_admin')
  if (error || data !== true) return { ok: false }
  const { data: u } = await cli.auth.getUser()
  return { ok: true, userId: u?.user?.id }
}

// Só aceita nomes de segredo do Orgânico — impede que uma linha da tabela
// aponte para SUPABASE_SERVICE_ROLE_KEY ou outro segredo.
export function tokenDaMarca(marca: { token_segredo?: string | null }): string | null {
  const nome = marca?.token_segredo || 'META_IG_TOKEN'
  if (!/^META_IG_TOKEN(_[A-Z0-9]+)?$/.test(nome)) return null
  return Deno.env.get(nome) || null
}

export class ErroGraph extends Error {
  codigo?: number
  subcodigo?: number
  constructor(msg: string, codigo?: number, subcodigo?: number) {
    super(msg)
    this.codigo = codigo
    this.subcodigo = subcodigo
  }
}

// GET/POST na Graph com o token no header. `caminho` pode ser relativo
// ("/123/insights?metric=...") ou um link "next" completo da própria Graph.
export async function graph(token: string, caminho: string, opts: { method?: 'GET' | 'POST'; form?: Record<string, string> } = {}) {
  const url = caminho.startsWith('https://graph.facebook.com/') ? caminho : `${GRAPH}${caminho}`
  const init: RequestInit = {
    method: opts.method || 'GET',
    headers: { Authorization: `Bearer ${token}` },
  }
  if (opts.form) {
    init.body = new URLSearchParams(opts.form)
    ;(init.headers as Record<string, string>)['Content-Type'] = 'application/x-www-form-urlencoded'
  }
  const r = await fetch(url, init)
  let j: any = null
  try { j = await r.json() } catch { /* corpo vazio */ }
  if (!r.ok || j?.error) {
    throw new ErroGraph(j?.error?.message || `HTTP ${r.status}`, j?.error?.code, j?.error?.error_subcode)
  }
  return j
}

// Texto para comparar legenda: minúsculo, sem acento, sem pontuação/emoji.
export function normalizar(s: string | null | undefined): string {
  return (s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9#\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// Data (YYYY-MM-DD) em BRT. O Brasil não tem horário de verão desde 2019: UTC-3 fixo.
export function dataBRT(iso: string | Date): string {
  const d = new Date(new Date(iso).getTime() - 3 * 3600 * 1000)
  return d.toISOString().slice(0, 10)
}

export async function registrarExecucao(
  sb: ReturnType<typeof adminClient>,
  marcaId: string | null,
  tipo: string,
  iniciado: Date,
  ok: boolean,
  erro: string | null,
  resumo: unknown,
) {
  await sb.from('organico_execucoes').insert({
    marca_id: marcaId,
    tipo,
    iniciado_em: iniciado.toISOString(),
    terminado_em: new Date().toISOString(),
    ok,
    erro: erro ? String(erro).slice(0, 1000) : null,
    resumo,
  })
}
