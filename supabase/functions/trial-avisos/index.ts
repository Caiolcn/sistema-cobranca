// Edge Function: avisos automaticos do periodo de teste (Mensalli -> conta em trial)
// ---------------------------------------------------------------------------
// Dois marcos, pela instancia MASTER, assinados pelo Caio:
//
//  1. ATIVACAO 24h -- DESLIGADA POR PADRAO desde 03/10/2026. Esse toque agora e
//     manual: coluna "Sem conectar" do CRM (/admin > Leads > Funil), onde o gestor
//     manda um audio explicando. Para religar o automatico:
//     update config set valor = 'true' where chave = 'trial_ativacao_24h_ativo';
//     24h depois do cadastro, SO pra quem ainda nao conectou o
//     WhatsApp. Base (75 dias ate 01/10/2026): quem conecta vira pagante em ~50%,
//     quem nao conecta em ~7%; e 9 de 14 conexoes aconteceram nas primeiras 24h.
//     Quem passou de 24h sem conectar quase nunca conecta sozinho.
//       trial_24h_sem_alunos / trial_24h_com_alunos
//
//  2. FIM DO TESTE -- quando faltam <= 30h pro trial_fim (trial e de 3 dias).
//       trial_d1_sem_whatsapp / trial_d1_sem_alunos / trial_d1_ativo
//
// Textos em templates_admin (editaveis no /admin > Retencao > Editar mensagens).
// Template ausente = nao envia (melhor nada do que mensagem vazia).
//
// Dedup: carimba usuarios.retencao_d_enviado_em (marco 1) e
// retencao_a_enviado_em (marco 2) -- as MESMAS flags do painel manual de
// retencao, entao quem recebeu o automatico some de la e nao leva repetido.
// Log em retencao_saas_envios com canal 'trial_auto'.
//
// Chamada:
//  - pg_cron de hora em hora, 9h-20h BRT, sem body -> respeita config.trial_avisos_ativo
//  - admin/service_role com { dryRun:true } -> devolve quem receberia e o texto, nao envia
//  - admin/service_role com { force:true }  -> envia mesmo com a flag desligada

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

// Fallback de config.evolution_master_instance -- ver incidente da master renomeada.
const INSTANCIA_MASTER_FALLBACK = 'mensalli_master'

// Marco 1 so vale pra conta com 24h a 72h de vida. Fora disso a mensagem
// "criou sua conta ontem" fica mentirosa.
const ATIVACAO_MIN_H = 24
const ATIVACAO_MAX_H = 72
// Marco 2 abre quando faltam 30h pro fim (cobre o trial_fim de madrugada,
// ja que o cron so roda em horario comercial) e fecha 2h antes.
const FIM_JANELA_MAX_H = 30
const FIM_JANELA_MIN_H = 2
// Nao manda o aviso de fim colado no de ativacao.
const ESPACO_ENTRE_MARCOS_H = 6
// Falhou isso tudo nas ultimas 24h? Para de tentar essa conta (numero invalido etc.).
const MAX_FALHAS_24H = 3

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

const HORA = 3600000

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

// "amanha" / "hoje as 22h", no fuso de Brasilia. O cron so roda em horario
// comercial, entao um trial_fim de madrugada pode cair no "amanha" ou no "hoje".
function quandoTermina(trialFim: Date): string {
  const brt = (d: Date) => new Date(d.getTime() - 3 * HORA)
  const fim = brt(trialFim)
  const hoje = brt(new Date())
  const mesmoDia = fim.toISOString().slice(0, 10) === hoje.toISOString().slice(0, 10)
  return mesmoDia ? `hoje às ${fim.getUTCHours()}h` : 'amanhã'
}

function interpolar(template: string, vars: Record<string, string>): string {
  let out = template
  for (const [k, v] of Object.entries(vars)) out = out.replaceAll(`{{${k}}}`, v)
  return out
}

// ---------------------------------------------------------------------------
// Numero -- mesmo porte do signup-boas-vindas: conta BR antiga pode existir no
// WhatsApp sem o nono digito.
// ---------------------------------------------------------------------------
function variantes(telefone: string): string[] {
  let n = (telefone || '').replace(/\D/g, '')
  if (!n) return []
  if (!n.startsWith('55')) n = '55' + n

  const lista = [n]
  if (n.length >= 12) {
    const ddd = n.substring(2, 4)
    const resto = n.substring(4)
    if (resto.length === 9 && resto.startsWith('9')) lista.push('55' + ddd + resto.substring(1))
    else if (resto.length === 8) lista.push('55' + ddd + '9' + resto)
  }
  return lista
}

async function resolverJid(apiUrl: string, apiKey: string, instancia: string, telefone: string) {
  const lista = variantes(telefone)
  if (lista.length === 0) return null
  if (lista.length === 1) return lista[0] + '@s.whatsapp.net'

  try {
    const r = await fetch(`${apiUrl}/chat/whatsappNumbers/${instancia}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: apiKey },
      body: JSON.stringify({ numbers: lista.map((n) => n + '@s.whatsapp.net') }),
      signal: AbortSignal.timeout(10000),
    })
    if (r.ok) {
      const dados = await r.json()
      const achados = Array.isArray(dados) ? dados : (dados?.response || [])
      const valido = achados.find((x: Record<string, unknown>) => x?.exists === true)
      if (valido) {
        const jid = String(valido.jid || valido.number)
        return jid.includes('@') ? jid : jid + '@s.whatsapp.net'
      }
    }
  } catch (_e) {
    // Verificacao e melhoria, nao pre-requisito: cai no numero original.
  }
  return lista[0] + '@s.whatsapp.net'
}

async function enviar(apiUrl: string, apiKey: string, instancia: string, jid: string, texto: string) {
  try {
    const r = await fetch(`${apiUrl}/message/sendText/${instancia}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: apiKey },
      body: JSON.stringify({ number: jid, text: texto }),
      signal: AbortSignal.timeout(30000),
    })
    const bruto = await r.text()
    if (!r.ok) return { ok: false, erro: bruto.slice(0, 300), http: r.status }
    return { ok: true, http: r.status }
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : String(e), http: 0 }
  }
}

interface Conta {
  id: string
  nome_completo: string | null
  telefone: string | null
  created_at: string
  trial_fim: string | null
  role: string | null
  plano_pago: boolean | null
  virou_pagante_em: string | null
  retencao_a_enviado_em: string | null
  retencao_d_enviado_em: string | null
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

  // ---- Auth: service_role (cron) ou admin logado ----
  const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '').trim()
  let autorizado = decodeRole(token) === 'service_role'
  if (!autorizado && token) {
    const { data: userData } = await supabase.auth.getUser(token)
    const uid = userData?.user?.id
    if (uid) {
      const { data: perfil } = await supabase.from('usuarios').select('role').eq('id', uid).maybeSingle()
      autorizado = perfil?.role === 'admin'
    }
  }
  if (!autorizado) return json({ error: 'Unauthorized — admin ou service role' }, 401)

  let body: { dryRun?: boolean; force?: boolean } = {}
  try { body = await req.json() } catch { /* cron manda {} */ }
  const dryRun = body.dryRun === true
  const force = body.force === true

  // ---- Config: flag on/off + Evolution ----
  const { data: cfgRows } = await supabase
    .from('config').select('chave, valor')
    .in('chave', ['trial_avisos_ativo', 'trial_ativacao_24h_ativo', 'evolution_api_url', 'evolution_api_key', 'evolution_master_instance'])
  const cfg: Record<string, string> = {}
  for (const r of cfgRows || []) cfg[r.chave] = r.valor

  if (!dryRun && !force && cfg.trial_avisos_ativo !== 'true') {
    return json({ skipped: 'automacao_desligada', sent: 0 })
  }

  const apiUrl = (cfg.evolution_api_url || '').replace(/\/+$/, '')
  const apiKey = cfg.evolution_api_key
  const instancia = cfg.evolution_master_instance || INSTANCIA_MASTER_FALLBACK
  // O aviso das 24h (marco 1) e manual no CRM; so sai daqui com a chave propria ligada.
  const ativacao24hLigada = cfg.trial_ativacao_24h_ativo === 'true'
  if (!dryRun && (!apiUrl || !apiKey)) return json({ error: 'Evolution nao configurada' }, 500)

  // ---- Candidatas: contas em trial, nunca pagaram, com telefone ----
  const agora = Date.now()
  const { data: contasRaw, error: errContas } = await supabase
    .from('usuarios')
    .select('id, nome_completo, telefone, created_at, trial_fim, role, plano_pago, virou_pagante_em, retencao_a_enviado_em, retencao_d_enviado_em')
    .gte('created_at', new Date(agora - 10 * 24 * HORA).toISOString())
    .not('telefone', 'is', null)
  if (errContas) return json({ error: errContas.message }, 500)

  const contas = ((contasRaw || []) as Conta[]).filter((c) =>
    c.telefone && c.telefone.replace(/\D/g, '').length >= 10 &&
    c.role !== 'admin' && !c.plano_pago && !c.virou_pagante_em
  )
  if (contas.length === 0) return json({ dryRun, total: 0, sent: 0 })

  const ids = contas.map((c) => c.id)

  // ---- Sinais: WhatsApp (agora OU ja conectou alguma vez) e alunos ----
  const [{ data: zap }, { data: falhasRows }, { data: tmpls }] = await Promise.all([
    supabase.from('mensallizap').select('user_id, conectado').in('user_id', ids),
    supabase.from('retencao_saas_envios').select('usuario_id')
      .in('usuario_id', ids).eq('canal', 'trial_auto').eq('status', 'falha')
      .gte('created_at', new Date(agora - 24 * HORA).toISOString()),
    supabase.from('templates_admin').select('tipo, mensagem').like('tipo', 'trial_%'),
  ])

  const conectou = new Set<string>()
  for (const z of zap || []) if (z.conectado) conectou.add(z.user_id)

  // Contagens por conta (head:true), nao .in() + contar linhas: logs_conexao tem
  // ~100k linhas e o PostgREST corta em 1000 -- quem conectou sairia como
  // "nao conectou" e levaria a mensagem errada. Sao poucas contas por rodada.
  const alunos: Record<string, number> = {}
  await Promise.all(contas.map(async (c) => {
    const [{ count: nCon }, { count: nAlunos }] = await Promise.all([
      conectou.has(c.id)
        ? Promise.resolve({ count: 1 })
        : supabase.from('logs_conexao').select('id', { count: 'exact', head: true })
            .eq('user_id', c.id).eq('status', 'conectado'),
      supabase.from('devedores').select('id', { count: 'exact', head: true })
        .eq('user_id', c.id).or('lixo.is.null,lixo.eq.false'),
    ])
    if ((nCon || 0) > 0) conectou.add(c.id)
    alunos[c.id] = nAlunos || 0
  }))

  const falhas: Record<string, number> = {}
  for (const f of falhasRows || []) falhas[f.usuario_id] = (falhas[f.usuario_id] || 0) + 1

  const templates: Record<string, string> = {}
  for (const t of tmpls || []) templates[t.tipo] = t.mensagem

  // ---- Decide o marco de cada conta (no maximo 1 por rodada) ----
  type Alvo = { conta: Conta; tipo: string; flag: 'retencao_d_enviado_em' | 'retencao_a_enviado_em' }
  const alvos: Alvo[] = []

  for (const c of contas) {
    if ((falhas[c.id] || 0) >= MAX_FALHAS_24H) continue

    const idadeH = (agora - new Date(c.created_at).getTime()) / HORA
    const fimEmH = c.trial_fim ? (new Date(c.trial_fim).getTime() - agora) / HORA : null
    const nAlunos = alunos[c.id] || 0
    const conectado = conectou.has(c.id)

    // Marco 2 -- fim do teste. Checado primeiro: se as duas janelas coincidirem,
    // o aviso de fim e o que importa.
    const fimNaJanela = fimEmH !== null && fimEmH <= FIM_JANELA_MAX_H && fimEmH >= FIM_JANELA_MIN_H
    const fimJaEnviado = c.retencao_a_enviado_em &&
      new Date(c.retencao_a_enviado_em).getTime() > agora - 7 * 24 * HORA
    const ativacaoRecente = c.retencao_d_enviado_em &&
      new Date(c.retencao_d_enviado_em).getTime() > agora - ESPACO_ENTRE_MARCOS_H * HORA
    if (fimNaJanela && !fimJaEnviado) {
      if (ativacaoRecente) continue // espera a proxima rodada
      const tipo = !conectado ? 'trial_d1_sem_whatsapp' : nAlunos === 0 ? 'trial_d1_sem_alunos' : 'trial_d1_ativo'
      alvos.push({ conta: c, tipo, flag: 'retencao_a_enviado_em' })
      continue
    }

    // Marco 1 -- ativacao 24h, so pra quem nao conectou e com trial ainda de pe.
    const naJanelaAtivacao = idadeH >= ATIVACAO_MIN_H && idadeH <= ATIVACAO_MAX_H
    const trialDePe = fimEmH === null || fimEmH > FIM_JANELA_MIN_H
    if (ativacao24hLigada && naJanelaAtivacao && trialDePe && !conectado && !c.retencao_d_enviado_em && !fimJaEnviado) {
      const tipo = nAlunos === 0 ? 'trial_24h_sem_alunos' : 'trial_24h_com_alunos'
      alvos.push({ conta: c, tipo, flag: 'retencao_d_enviado_em' })
    }
  }

  // ---- Envio ----
  let sent = 0, errors = 0, semTemplate = 0
  const simulacao: unknown[] = []
  const detalhes: unknown[] = []

  for (const { conta, tipo, flag } of alvos) {
    const template = templates[tipo]
    if (!template) { semTemplate++; detalhes.push({ usuario_id: conta.id, motivo: `template ${tipo} ausente` }); continue }

    const nAlunos = alunos[conta.id] || 0
    const mensagem = interpolar(template, {
      nome: String(conta.nome_completo || '').trim().split(/\s+/)[0] || 'tudo bem',
      alunos: String(nAlunos),
      fim: conta.trial_fim ? quandoTermina(new Date(conta.trial_fim)) : 'amanhã',
    })

    if (dryRun) {
      simulacao.push({ usuario_id: conta.id, nome: conta.nome_completo, telefone: conta.telefone, tipo, mensagem })
      continue
    }

    const jid = await resolverJid(apiUrl, apiKey!, instancia, conta.telefone!)
    const r = jid
      ? await enviar(apiUrl, apiKey!, instancia, jid, mensagem)
      : { ok: false, erro: 'telefone invalido', http: 0 }

    await supabase.from('retencao_saas_envios').insert({
      usuario_id: conta.id,
      tipo,
      mensagem,
      canal: 'trial_auto',
      status: r.ok ? 'enviado' : 'falha',
      erro: r.ok ? null : `${r.http} ${r.erro}`,
    })

    if (r.ok) {
      await supabase.from('usuarios').update({ [flag]: new Date().toISOString() }).eq('id', conta.id)
      sent++
    } else {
      errors++
      detalhes.push({ usuario_id: conta.id, tipo, jid, ...r })
      console.error('[trial-avisos] falha', { usuario_id: conta.id, tipo, jid, r })
    }

    // Intervalo anti-bloqueio entre envios da master.
    await new Promise((res) => setTimeout(res, 1500))
  }

  return json({
    dryRun, force,
    candidatas: contas.length,
    alvos: alvos.length,
    sent, errors, semTemplate,
    simulacao: dryRun ? simulacao : undefined,
    detalhes: detalhes.slice(0, 10),
  })
})
