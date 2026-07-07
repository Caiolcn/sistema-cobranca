// Edge Function: WhatsApp Health Check
// ============================================================
// Testa DE VERDADE se a conexão Evolution de cada cliente pago
// está viva — não confia só no painel (connectionState mente:
// fica "open" mesmo com o socket morto por baixo).
//
// Teste profundo: além do connectionState, força um round-trip
// até o servidor do WhatsApp via POST /chat/whatsappNumbers.
// Se o socket estiver morto isso estoura "Connection Closed" /
// 500 / timeout, mesmo com state === "open".
//
// Saudável = state "open" E a sonda respondeu sem erro.
// Não-saudável => DELETE /instance/logout (libera o QR Code:
// enquanto a Evolution achar que está conectado, o cliente não
// consegue gerar QR novo).
//
// Grava um relatório (1 linha por cliente) em whatsapp_health_checks.
// Disparada diariamente pelo pg_cron (ver sql-criar-whatsapp-health-check.sql).
// ============================================================

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Número de descarte só pra exercitar o socket quando o cliente não
// tem o próprio número salvo. Não recebe nada — é só uma consulta de
// existência (onWhatsApp). Qualquer número em formato válido serve.
const NUMERO_SONDA_FALLBACK = '5511999999999'

// Timeout curto: socket vivo responde rápido; morto trava.
const PROBE_TIMEOUT_MS = 12000

// Anti-spam do aviso de desconexão (Canal C): re-avisa no máximo a cada 3 dias.
const REAVISO_INTERVALO_MS = 3 * 24 * 60 * 60 * 1000

// URL do app pro link de reconexão na mensagem
const APP_URL = 'https://www.mensalli.com.br'

// Receiver do webhook (a mesma edge function whatsapp-bot trata MESSAGES_UPSERT
// E connection.update). O health-check (re)afirma esse webhook em cada cliente —
// é o que liga o rastreio de queda em tempo real pra toda a base, sem ninguém
// precisar reconectar.
const WEBHOOK_BOT_URL = `${SUPABASE_URL}/functions/v1/whatsapp-bot`

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function fetchComTimeout(url: string, options: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController()
  const id = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { ...options, signal: controller.signal })
  } finally {
    clearTimeout(id)
  }
}

// Lê o connectionState (o que o painel mostra). Não é confiável sozinho.
async function lerEstado(apiUrl: string, apiKey: string, instance: string): Promise<string> {
  try {
    const res = await fetchComTimeout(
      `${apiUrl}/instance/connectionState/${instance}`,
      { headers: { apikey: apiKey } },
      PROBE_TIMEOUT_MS,
    )
    if (!res.ok) return res.status === 404 ? 'inexistente' : 'erro'
    const data = await res.json()
    return data?.instance?.state || 'close'
  } catch (_e) {
    return 'timeout'
  }
}

// Sonda profunda: força round-trip ao WhatsApp. Retorna se o socket
// está REALMENTE vivo + o erro bruto (pra registrar no relatório).
async function sondarSocket(
  apiUrl: string,
  apiKey: string,
  instance: string,
  numero: string,
): Promise<{ vivo: boolean; erro: string | null }> {
  try {
    const res = await fetchComTimeout(
      `${apiUrl}/chat/whatsappNumbers/${instance}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: apiKey },
        body: JSON.stringify({ numbers: [numero] }),
      },
      PROBE_TIMEOUT_MS,
    )

    if (res.ok) {
      // 200 = o Baileys conseguiu consultar o WhatsApp => socket vivo.
      // Não importa se o número existe ou não.
      await res.json().catch(() => null)
      return { vivo: true, erro: null }
    }

    const texto = await res.text().catch(() => '')
    // Connection Closed / 500 = socket morto apesar do state "open".
    if (texto.includes('Connection Closed') || res.status === 500) {
      return { vivo: false, erro: `socket morto (HTTP ${res.status}: Connection Closed)` }
    }
    if (res.status === 404) {
      return { vivo: false, erro: 'instância não encontrada (404)' }
    }
    return { vivo: false, erro: `HTTP ${res.status}: ${texto.slice(0, 200)}` }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { vivo: false, erro: msg.includes('abort') ? 'timeout na sonda (socket travado)' : msg }
  }
}

// Desloga a instância => libera o QR Code pro cliente reconectar.
async function deslogar(apiUrl: string, apiKey: string, instance: string): Promise<boolean> {
  try {
    const res = await fetchComTimeout(
      `${apiUrl}/instance/logout/${instance}`,
      { method: 'DELETE', headers: { apikey: apiKey } },
      PROBE_TIMEOUT_MS,
    )
    return res.ok
  } catch (_e) {
    return false
  }
}

// (Re)afirma o webhook da instância apontando pro whatsapp-bot. Mantém
// CONNECTION_UPDATE sempre; adiciona MESSAGES_UPSERT só se o bot estiver ativo
// (o /webhook/set substitui a config inteira, então mandamos a lista completa).
async function garantirWebhook(
  apiUrl: string,
  apiKey: string,
  instance: string,
  botAtivo: boolean,
): Promise<void> {
  const events = botAtivo ? ['MESSAGES_UPSERT', 'CONNECTION_UPDATE'] : ['CONNECTION_UPDATE']
  try {
    await fetchComTimeout(
      `${apiUrl}/webhook/set/${instance}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: apiKey },
        body: JSON.stringify({
          webhook: { enabled: true, url: WEBHOOK_BOT_URL, webhookByEvents: false, webhookBase64: false, events },
        }),
      },
      PROBE_TIMEOUT_MS,
    )
  } catch (_e) {
    // best-effort: se falhar, a próxima varredura tenta de novo
  }
}

// Telefone do gestor pro padrão internacional (55…), só dígitos.
function formatarTelefone(telefone: string): string | null {
  let n = (telefone || '').replace(/\D/g, '')
  if (!n) return null
  if (!n.startsWith('55')) n = '55' + n
  return n
}

// Canal C: envia o aviso pela instância MASTER da Mensalli ao gestor.
// (O WhatsApp do próprio cliente está fora, então usamos o número da plataforma.)
async function avisarPeloMaster(
  apiUrl: string,
  apiKey: string,
  masterInstance: string,
  telefoneGestor: string,
  texto: string,
): Promise<boolean> {
  const numero = formatarTelefone(telefoneGestor)
  if (!numero) return false
  try {
    const res = await fetchComTimeout(
      `${apiUrl}/message/sendText/${masterInstance}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: apiKey },
        body: JSON.stringify({ number: `${numero}@s.whatsapp.net`, text: texto }),
      },
      PROBE_TIMEOUT_MS,
    )
    return res.ok
  } catch (_e) {
    return false
  }
}

// Master está conectado? Só tenta o Canal C se sim (senão sobra o Canal A).
async function masterConectado(apiUrl: string, apiKey: string, masterInstance: string): Promise<boolean> {
  return (await lerEstado(apiUrl, apiKey, masterInstance)) === 'open'
}

// Faz o trabalho pesado. Roda em background (EdgeRuntime.waitUntil),
// desacoplado de quem chamou — o pg_net tem timeout de 5s e a varredura
// de todos os clientes demora bem mais. Grava o relatório em lotes pra
// não perder o progresso caso o tempo de execução estoure.
async function executarVarredura(): Promise<Record<string, unknown>> {
  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

  // Credenciais globais da Evolution (mesma config usada no app)
  const { data: configs } = await admin
    .from('config')
    .select('chave, valor')
    .in('chave', ['evolution_api_key', 'evolution_api_url', 'evolution_master_instance'])

  const configMap: Record<string, string> = {}
  configs?.forEach((c: { chave: string; valor: string }) => {
    configMap[c.chave] = c.valor
  })
  const apiKey = configMap.evolution_api_key
  const apiUrl = configMap.evolution_api_url || 'https://service-evolution-api.tnvro1.easypanel.host'
  const masterInstance = configMap.evolution_master_instance || 'mensalli_master'

  if (!apiKey) {
    throw new Error('evolution_api_key não configurada na tabela config')
  }

  // Canal C só funciona se o WhatsApp master da Mensalli estiver conectado.
  // Checa uma vez; se estiver fora, cai só no Canal A (banner in-app).
  const masterOk = await masterConectado(apiUrl, apiKey, masterInstance)
  if (!masterOk) console.warn('⚠️ Instância master não conectada — avisos do Canal C serão pulados.')

  // Clientes com assinatura paga. Junta o número/instância já conhecidos
  // (mensallizap) pra usar o próprio número como sonda quando houver.
  const { data: usuarios, error: usuariosError } = await admin
    .from('usuarios')
    .select('id, nome_empresa, email, plano, plano_pago, telefone')
    .eq('plano_pago', true)

  if (usuariosError) throw usuariosError

  const userIds = (usuarios || []).map((u: { id: string }) => u.id)
  const { data: zaps } = await admin
    .from('mensallizap')
    .select('user_id, instance_name, whatsapp_numero, conectado, ultima_conexao, ultimo_aviso_desconexao')
    .in('user_id', userIds.length ? userIds : ['00000000-0000-0000-0000-000000000000'])

  type ZapInfo = {
    instance_name: string | null
    whatsapp_numero: string | null
    ultima_conexao: string | null
    ultimo_aviso_desconexao: string | null
  }
  const zapPorUser = new Map<string, ZapInfo>()
  zaps?.forEach((z: ZapInfo & { user_id: string }) => {
    zapPorUser.set(z.user_id, {
      instance_name: z.instance_name,
      whatsapp_numero: z.whatsapp_numero,
      ultima_conexao: z.ultima_conexao,
      ultimo_aviso_desconexao: z.ultimo_aviso_desconexao,
    })
  })

  // bot_ativo por usuário — define se o webhook leva MESSAGES_UPSERT junto.
  const { data: cfgs } = await admin
    .from('configuracoes_cobranca')
    .select('user_id, bot_ativo')
    .in('user_id', userIds.length ? userIds : ['00000000-0000-0000-0000-000000000000'])
  const botPorUser = new Map<string, boolean>()
  cfgs?.forEach((c: { user_id: string; bot_ativo: boolean }) => botPorUser.set(c.user_id, !!c.bot_ativo))

  const checadoEm = new Date().toISOString()
  const agora = Date.now()
  let total = 0
  let saudaveis = 0
  let mortos = 0
  let deslogados = 0
  let avisados = 0
  let buffer: Record<string, unknown>[] = []

  // Grava o buffer acumulado (lote). Chamado a cada N clientes e no fim,
  // pra que o relatório sobreviva mesmo se a execução for interrompida.
  const flush = async () => {
    if (!buffer.length) return
    const { error: insErr } = await admin.from('whatsapp_health_checks').insert(buffer)
    if (insErr) console.error('Erro ao gravar lote do relatório:', insErr.message)
    buffer = []
  }

  for (const u of usuarios || []) {
    const zap = zapPorUser.get(u.id)
    const instance = zap?.instance_name || `instance_${u.id.substring(0, 8)}`
    const numeroSonda = (zap?.whatsapp_numero || '').replace(/\D/g, '') || NUMERO_SONDA_FALLBACK

    const estado = await lerEstado(apiUrl, apiKey, instance)

    // Self-heal: garante o webhook de connection.update enquanto a instância existir.
    if (estado !== 'inexistente') {
      await garantirWebhook(apiUrl, apiKey, instance, botPorUser.get(u.id) || false)
    }

    let probeOk = false
    let probeErro: string | null = null
    let saudavel = false

    if (estado === 'inexistente') {
      // Instância nem existe na Evolution — nada a deslogar.
      probeErro = 'instância não existe na Evolution'
    } else if (estado === 'open') {
      // Só vale a pena sondar quando o painel diz "open" — é justamente
      // o caso que mente. Se já está close/connecting, não está saudável.
      const sonda = await sondarSocket(apiUrl, apiKey, instance, numeroSonda)
      probeOk = sonda.vivo
      probeErro = sonda.erro
      saudavel = sonda.vivo
    } else {
      probeErro = `estado "${estado}" (painel já indica não-conectado)`
    }

    let acao = 'nenhuma'
    // Derruba quando o painel diz "open" mas a sonda provou que está morto.
    if (!saudavel && estado === 'open') {
      const ok = await deslogar(apiUrl, apiKey, instance)
      acao = ok ? 'logout' : 'logout_falhou'
      if (ok) deslogados++
    }

    // ============ AVISO DE DESCONEXÃO (Canais A + C) ============
    // Só avisa quem JÁ tinha conectado um dia (ultima_conexao != null) —
    // não enche quem nunca configurou. Instância inexistente também não avisa.
    const jaConectouAlgumDia = !!zap?.ultima_conexao
    if (saudavel) {
      // Reconectou: garante conectado=true e ZERA o anti-spam, pra que a
      // próxima queda avise imediatamente.
      if (zap?.ultimo_aviso_desconexao) {
        await admin
          .from('mensallizap')
          .update({ conectado: true, ultimo_aviso_desconexao: null, updated_at: checadoEm })
          .eq('user_id', u.id)
      }
    } else if (estado !== 'inexistente' && jaConectouAlgumDia) {
      // Canal A: reflete a queda no mensallizap (o banner in-app lê isso)
      const ultimoAviso = zap?.ultimo_aviso_desconexao ? Date.parse(zap.ultimo_aviso_desconexao) : 0
      const podeReavisar = !ultimoAviso || (agora - ultimoAviso) >= REAVISO_INTERVALO_MS

      // Canal C: WhatsApp da plataforma → telefone do gestor (anti-spam 3 dias)
      let avisouAgora = false
      if (masterOk && podeReavisar && u.telefone) {
        const nome = (u.nome_empresa || '').trim().split(' ')[0] || 'tudo bem'
        const texto =
          `⚠️ *MensalliZap — atenção*\n\n` +
          `Olá${nome ? `, ${nome}` : ''}! Detectamos que o *WhatsApp da sua conta desconectou* ` +
          `e suas mensagens automáticas (cobranças, lembretes) não estão saindo.\n\n` +
          `👉 Reconecte agora escaneando o QR Code:\n${APP_URL}/app/whatsapp\n\n` +
          `É rápido e leva menos de 1 minuto. Qualquer dúvida, é só chamar a gente por aqui!`
        avisouAgora = await avisarPeloMaster(apiUrl, apiKey, masterInstance, u.telefone, texto)
        if (avisouAgora) avisados++
      }

      await admin
        .from('mensallizap')
        .update({
          conectado: false,
          ultima_desconexao: checadoEm,
          updated_at: checadoEm,
          ...(avisouAgora ? { ultimo_aviso_desconexao: checadoEm } : {}),
        })
        .eq('user_id', u.id)

      if (avisouAgora) acao = acao === 'nenhuma' ? 'avisado' : `${acao}+avisado`
    }

    total++
    if (saudavel) saudaveis++
    else if (estado === 'open') mortos++

    buffer.push({
      user_id: u.id,
      nome_empresa: u.nome_empresa || u.email || '—',
      plano: u.plano || null,
      instance_name: instance,
      estado_painel: estado,
      probe_ok: probeOk,
      saudavel,
      acao,
      erro: probeErro,
      checado_em: checadoEm,
    })

    // Grava em lotes de 10 pra não perder progresso se o tempo estourar
    if (buffer.length >= 10) await flush()

    // Throttle leve pra não martelar a Evolution
    await sleep(400)
  }

  await flush()

  const resumo = { total, saudaveis, mortos_detectados: mortos, deslogados, avisados, checado_em: checadoEm }
  console.log('✅ Health check concluído:', JSON.stringify(resumo))
  return resumo
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  // Roda a varredura em background: responde 200 na hora (o pg_net tem
  // timeout de 5s) e deixa o trabalho pesado terminar desacoplado.
  // @ts-ignore — EdgeRuntime é injetado pelo runtime do Supabase
  EdgeRuntime.waitUntil(
    executarVarredura().catch((e) => {
      const msg = e instanceof Error ? e.message : String(e)
      console.error('❌ Erro no health check:', msg)
    }),
  )

  return new Response(
    JSON.stringify({ success: true, message: 'Varredura iniciada em background. Consulte admin_whatsapp_saude() em alguns segundos.' }),
    { status: 202, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  )
})
