// Edge Function: Cobrança SaaS Automática
// Lembretes de vencimento do PLANO para os clientes pagantes do Mensalli.
// 3 marcos: venc_d3 (3 dias antes) / venc_hoje (no dia) / venc_vencido (3 dias depois).
//
// Chamada:
//  - pelo pg_cron todo dia às 9h BRT (12h UTC), SEM body -> só dispara se a flag estiver ativa.
//  - pelo painel /admin (admin logado) com body { force:true } -> dispara ignorando a flag.
//  - pelo painel com body { dryRun:true } -> só simula (não envia), retorna quem receberia.
//
// Envia pela instância MASTER do Mensalli (mesma do /admin) via Evolution API.
// Dedup por (usuario_id, tipo, ciclo_vencimento) em retencao_saas_envios.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

// Instância master do Mensalli (mesma usada nos disparos manuais do /admin).
const INSTANCIA_MASTER = 'instance_c93b3e8d'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const NOMES_PLANO: Record<string, string> = {
  starter: 'Starter', pro: 'Pro', premium: 'Premium'
}

interface AlvoRow {
  bucket: string
  usuario_id: string
  nome_cliente: string
  telefone: string
  plano: string
  valor: number | string
  data_vencimento: string   // YYYY-MM-DD
  dias_para_vencer: number
  dias: number
  dias_atraso: number
}

function formatarValor(valor: number | string): string {
  const n = typeof valor === 'string' ? parseFloat(valor) : valor
  return (n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function formatarData(iso: string): string {
  const [ano, mes, dia] = iso.split('-')
  return `${dia}/${mes}/${ano}`
}

function primeiroNome(nome: string): string {
  return (nome || 'Cliente').trim().split(/\s+/)[0]
}

function interpolar(template: string, alvo: AlvoRow): string {
  return template
    .replaceAll('{{nome}}', primeiroNome(alvo.nome_cliente))
    .replaceAll('{{plano}}', NOMES_PLANO[String(alvo.plano).toLowerCase()] || alvo.plano || '')
    .replaceAll('{{valor}}', formatarValor(alvo.valor))
    .replaceAll('{{vencimento}}', formatarData(alvo.data_vencimento))
    .replaceAll('{{dias}}', String(alvo.dias))
    .replaceAll('{{dias_atraso}}', String(alvo.dias_atraso))
}

function normalizarTelefone(telefone: string): string {
  const apenas = String(telefone || '').replace(/\D/g, '')
  return apenas.startsWith('55') ? apenas : `55${apenas}`
}

function decodeRole(token: string): string | null {
  try {
    const part = token.split('.')[1]
    if (!part) return null
    const normalized = part.replace(/-/g, '+').replace(/_/g, '/')
    const padded = normalized + '='.repeat((4 - normalized.length % 4) % 4)
    return JSON.parse(atob(padded))?.role ?? null
  } catch {
    return null
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

  // ---- Auth: aceita service_role (cron) OU um admin logado (painel) ----
  const authHeader = req.headers.get('Authorization') || ''
  const token = authHeader.replace(/^Bearer\s+/i, '').trim()

  let autorizado = false
  if (decodeRole(token) === 'service_role') {
    autorizado = true
  } else if (token) {
    const { data: userData } = await supabase.auth.getUser(token)
    const uid = userData?.user?.id
    if (uid) {
      const { data: perfil } = await supabase
        .from('usuarios').select('role').eq('id', uid).maybeSingle()
      autorizado = perfil?.role === 'admin'
    }
  }

  if (!autorizado) {
    return new Response(JSON.stringify({ error: 'Unauthorized — admin ou service role' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }

  // ---- Body / modos ----
  let body: { force?: boolean; dryRun?: boolean; testTo?: string; testNome?: string } = {}
  try { body = await req.json() } catch { /* sem body = execução do cron */ }
  const force = body.force === true
  const dryRun = body.dryRun === true

  // ---- Credenciais da Evolution (usadas por teste e envio real) ----
  const { data: cfgEvo } = await supabase
    .from('config').select('chave, valor').in('chave', ['evolution_api_key', 'evolution_api_url'])
  const evoMap: Record<string, string> = {}
  ;(cfgEvo || []).forEach((c: { chave: string; valor: string }) => { evoMap[c.chave] = c.valor })
  const apiKeyEvo = evoMap.evolution_api_key
  const apiUrlEvo = evoMap.evolution_api_url || 'https://service-evolution-api.tnvro1.easypanel.host'

  // ---- Modo TESTE: envia os 3 modelos pra um número avulso, sem tocar em clientes nem logar ----
  if (body.testTo) {
    if (!apiKeyEvo) {
      return new Response(JSON.stringify({ error: 'Evolution API key não configurada em config' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }
    const { data: tmplsTeste } = await supabase
      .from('templates_admin').select('tipo, mensagem').in('tipo', ['venc_d3', 'venc_hoje', 'venc_vencido'])
    const tmap: Record<string, string> = {}
    ;(tmplsTeste || []).forEach((t: { tipo: string; mensagem: string }) => { tmap[t.tipo] = t.mensagem })

    const exemplo: AlvoRow = {
      bucket: '', usuario_id: '', nome_cliente: body.testNome || 'Fulano (teste)',
      telefone: body.testTo, plano: 'pro', valor: 99.90,
      data_vencimento: new Date().toISOString().slice(0, 10),
      dias_para_vencer: 3, dias: 3, dias_atraso: 3
    }
    const numeroTeste = normalizarTelefone(body.testTo)
    let enviados = 0
    const falhas: unknown[] = []
    for (const tipo of ['venc_d3', 'venc_hoje', 'venc_vencido']) {
      const tmpl = tmap[tipo]
      if (!tmpl) { falhas.push({ tipo, motivo: 'template ausente' }); continue }
      const msg = `🧪 [TESTE — ${tipo}]\n\n` + interpolar(tmpl, exemplo)
      const resp = await fetch(`${apiUrlEvo}/message/sendText/${INSTANCIA_MASTER}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'apikey': apiKeyEvo },
        body: JSON.stringify({ number: numeroTeste, text: msg })
      })
      if (resp.ok) { enviados++ } else { falhas.push({ tipo, status: resp.status, body: await resp.json().catch(() => null) }) }
      await new Promise((r) => setTimeout(r, 1200))
    }
    return new Response(JSON.stringify({ teste: true, para: numeroTeste, enviados, falhas }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }

  // ---- Gate on/off (cron respeita a flag; force/dryRun ignoram) ----
  if (!force && !dryRun) {
    const { data: cfg } = await supabase
      .from('mensalli_cobranca_saas_config').select('ativa').eq('id', true).maybeSingle()
    if (!cfg?.ativa) {
      return new Response(JSON.stringify({ skipped: 'automacao_desligada', sent: 0 }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }
  }

  // ---- Credenciais da Evolution (já lidas no topo) ----
  const apiKey = apiKeyEvo
  const apiUrl = apiUrlEvo

  if (!dryRun && !apiKey) {
    return new Response(JSON.stringify({ error: 'Evolution API key não configurada em config' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }

  // ---- Alvos ----
  const { data: alvos, error: viewErr } = await supabase
    .from('vw_mensalli_cobranca_saas').select('*')
  if (viewErr) {
    return new Response(JSON.stringify({ error: viewErr.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }

  // ---- Templates ----
  const { data: tmpls } = await supabase
    .from('templates_admin').select('tipo, mensagem').in('tipo', ['venc_d3', 'venc_hoje', 'venc_vencido'])
  const templateMap: Record<string, string> = {}
  ;(tmpls || []).forEach((t: { tipo: string; mensagem: string }) => { templateMap[t.tipo] = t.mensagem })

  let sent = 0, skipped = 0, errors = 0
  const detalhes: unknown[] = []
  const simulacao: unknown[] = []

  for (const alvo of (alvos || []) as AlvoRow[]) {
    try {
      const template = templateMap[alvo.bucket]
      if (!template) { errors++; detalhes.push({ usuario_id: alvo.usuario_id, motivo: `template ${alvo.bucket} ausente` }); continue }

      // Dedup por ciclo (mesmo cliente + tipo + data de vencimento já enviado)
      const { data: jaEnviado } = await supabase
        .from('retencao_saas_envios')
        .select('id')
        .eq('usuario_id', alvo.usuario_id)
        .eq('tipo', alvo.bucket)
        .eq('ciclo_vencimento', alvo.data_vencimento)
        .eq('status', 'enviado')
        .maybeSingle()

      if (jaEnviado) { skipped++; continue }

      const mensagem = interpolar(template, alvo)
      const numero = normalizarTelefone(alvo.telefone)

      if (dryRun) {
        simulacao.push({ nome: alvo.nome_cliente, telefone: numero, bucket: alvo.bucket, mensagem })
        continue
      }

      const resp = await fetch(`${apiUrl}/message/sendText/${INSTANCIA_MASTER}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'apikey': apiKey },
        body: JSON.stringify({ number: numero, text: mensagem })
      })
      const respBody = await resp.json().catch(() => null)

      await supabase.from('retencao_saas_envios').insert({
        usuario_id: alvo.usuario_id,
        tipo: alvo.bucket,
        mensagem,
        canal: 'crm_auto',
        status: resp.ok ? 'enviado' : 'falha',
        erro: resp.ok ? null : JSON.stringify(respBody),
        ciclo_vencimento: alvo.data_vencimento
      })

      if (resp.ok) { sent++ } else { errors++; detalhes.push({ usuario_id: alvo.usuario_id, status: resp.status, body: respBody }) }

      // Intervalo anti-bloqueio entre envios
      await new Promise((r) => setTimeout(r, 1200))
    } catch (err) {
      errors++
      detalhes.push({ usuario_id: alvo.usuario_id, err: String(err) })
    }
  }

  return new Response(
    JSON.stringify({
      dryRun, force,
      total: (alvos || []).length,
      sent, skipped, errors,
      simulacao: dryRun ? simulacao : undefined,
      detalhes: detalhes.slice(0, 10)
    }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  )
})
