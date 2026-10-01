// Edge Function: sincroniza o gasto do Meta Ads com meta_ads_gasto
// ---------------------------------------------------------------------------
// Puxa da Insights API, nivel anuncio, um registro por dia, e grava por upsert
// (data, ad_id). Re-rodar o mesmo periodo e seguro: o Meta corrige numeros dos
// ultimos dias (atribuicao tardia), entao o cron sempre reprocessa uma janela.
//
// Segredo: META_ADS_TOKEN (usuario do sistema "claude-leitura", so ads_read).
// O token nunca sai daqui -- o navegador le so a tabela, protegida por RLS.
//
// Chamada:
//   - pg_cron (Bearer service_role), sem body -> ultimos 7 dias
//   - admin logado (botao "Atualizar")        -> ultimos 7 dias
//   - { "dias": 90 }                          -> janela maior (carga inicial)
//   - { "dryRun": true }                      -> devolve o que gravaria

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!
const META_TOKEN = Deno.env.get('META_ADS_TOKEN')
const AD_ACCOUNT = Deno.env.get('META_AD_ACCOUNT_ID') || 'act_1625789468703809'
const GRAPH = 'https://graph.facebook.com/v21.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })

const iso = (d: Date) => d.toISOString().slice(0, 10)

// Tipos de acao do Meta que viram as nossas duas metricas de resultado.
const ACAO_CADASTRO = ['complete_registration', 'offsite_conversion.fb_pixel_complete_registration']
const ACAO_CONVERSA = ['onsite_conversion.messaging_conversation_started_7d']

const somaAcoes = (acoes: any[] | undefined, tipos: string[]) => {
  // Pega o primeiro tipo presente. Somar os dois contaria o mesmo evento 2x
  // (o Meta repete a acao sob nomes diferentes).
  for (const t of tipos) {
    const a = (acoes || []).find((x) => x.action_type === t)
    if (a) return Math.round(Number(a.value) || 0)
  }
  return 0
}

async function autorizado(req: Request): Promise<boolean> {
  const bearer = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '')
  if (!bearer) return false
  if (bearer === SERVICE_KEY) return true
  const cli = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${bearer}` } },
  })
  const { data, error } = await cli.rpc('is_admin')
  return !error && data === true
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (!(await autorizado(req))) return json({ erro: 'nao autorizado' }, 401)
  if (!META_TOKEN) return json({ erro: 'segredo META_ADS_TOKEN ausente' }, 500)

  let body: any = {}
  try { body = await req.json() } catch { /* sem body */ }
  const dias = Math.min(Math.max(Number(body.dias) || 7, 1), 365)
  const dryRun = body.dryRun === true

  const fim = new Date()
  const ini = new Date(Date.now() - (dias - 1) * 86400000)

  const params = new URLSearchParams({
    level: 'ad',
    time_increment: '1',
    time_range: JSON.stringify({ since: iso(ini), until: iso(fim) }),
    fields: 'date_start,ad_id,ad_name,adset_id,adset_name,campaign_id,campaign_name,spend,impressions,reach,inline_link_clicks,actions',
    limit: '500',
    access_token: META_TOKEN,
  })

  const linhas: any[] = []
  let url: string | null = `${GRAPH}/${AD_ACCOUNT}/insights?${params}`
  let paginas = 0
  while (url && paginas < 40) {
    const r = await fetch(url)
    const j = await r.json()
    if (!r.ok || j.error) {
      // Nunca devolve o token: a mensagem do Meta nao o inclui, mas a URL sim.
      return json({ erro: 'falha na Insights API', meta: j.error?.message, codigo: j.error?.code }, 502)
    }
    for (const x of j.data || []) {
      linhas.push({
        data: x.date_start,
        ad_id: x.ad_id,
        ad_name: x.ad_name,
        adset_id: x.adset_id,
        adset_name: x.adset_name,
        campaign_id: x.campaign_id,
        campaign_name: x.campaign_name,
        gasto: Number(x.spend) || 0,
        impressoes: Number(x.impressions) || 0,
        alcance: Number(x.reach) || 0,
        cliques: Number(x.inline_link_clicks) || 0,
        cadastros_site: somaAcoes(x.actions, ACAO_CADASTRO),
        conversas_whatsapp: somaAcoes(x.actions, ACAO_CONVERSA),
        atualizado_em: new Date().toISOString(),
      })
    }
    url = j.paging?.next || null
    paginas++
  }

  const totalGasto = linhas.reduce((s, l) => s + l.gasto, 0)
  if (dryRun) return json({ dryRun: true, linhas: linhas.length, totalGasto, amostra: linhas.slice(0, 5) })

  const admin = createClient(SUPABASE_URL, SERVICE_KEY)
  for (let i = 0; i < linhas.length; i += 500) {
    const { error } = await admin.from('meta_ads_gasto').upsert(linhas.slice(i, i + 500), { onConflict: 'data,ad_id' })
    if (error) return json({ erro: 'falha ao gravar', detalhe: error.message }, 500)
  }
  return json({ ok: true, linhas: linhas.length, totalGasto: Math.round(totalGasto * 100) / 100, de: iso(ini), ate: iso(fim) })
})
