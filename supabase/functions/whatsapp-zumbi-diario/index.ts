// Edge Function: varredura diária de ZUMBI
// ============================================================
// Zumbi = a Evolution reporta `open`, a tela do cliente diz "Conectado", e
// NENHUMA mensagem sai. Foi a reclamação nº 1 do fim de semana de 15-16/08:
// 8 contas apareciam conectadas e 104 mensagens não saíram; a PAINEIRAS estava
// assim desde 31/07 e a GR Esperança desde 22/07, sem ninguém ver.
//
// POR QUE ESTA FUNÇÃO É DIFERENTE DA ANTIGA (whatsapp-health-check)
//
// A varredura antiga perguntava para a Evolution o estado de TODO mundo, o
// tempo todo — e era ela a maior causa das quedas que estávamos investigando:
//   - sonda `onWhatsApp` em número FAKE, 48x/dia → o WhatsApp deslogava as
//     sessões (22 de 22 quedas com statusCode 401). Média subiu de 2,0 para
//     12,3 quedas/dia quando a cadência virou 30 min.
//   - `/instance/connect` usado como "teste de QR" DERRUBOU cliente saudável:
//     em 13/08 a Machado black team caiu 8 segundos depois da nossa chamada.
//   - rodando de 30 em 30 min, cada erro de diagnóstico virava ação repetida:
//     contas restauradas às 15h eram reflagradas e mexidas de novo às 16h45.
//
// Aqui a regra é oposta: **a detecção não custa NADA à Evolution**. Quem denuncia
// o zumbi é o resultado dos envios REAIS, já gravado em logs_mensagens. Só
// tocamos numa instância que já provou estar quebrada — e no máximo 1x por dia.
//
// ESCADA (do mais barato ao irreversível):
//   1. sonda de socket (1 chamada, com o número DO PRÓPRIO cliente) para
//      confirmar. Falso alarme para aqui.
//   2. restart — reconecta reusando a credencial, sem QR, sem o cliente saber.
//      Em 17/08 curou 3 de 9.
//   3. delete + create(qrcode:false) — última saída, IRREVERSÍVEL. Só quando o
//      restart falhou. Apaga o espelho de mensagens da Evolution daquela
//      instância; decisão explícita do dono do produto: "os logs de mensagens
//      não é tão importante quanto a pessoa conseguir reconectar".
//   4. avisa o gestor, porque depois do passo 3 só ele resolve, escaneando o QR.
//
// Liga/desliga e tetos vivem em whatsapp_recovery_cfg (dado, não deploy).
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

// A edge function é encerrada pelo runtime em ~2 min (medido em 17/08: shutdown
// 2s depois do primeiro candidato). Tudo aqui é dimensionado para caber nisso —
// por isso poucos alvos por rodada, e o cron roda algumas vezes ao dia. Como
// cada instância só pode ser tocada 1x a cada 24h, as rodadas se revezam entre
// os candidatos em vez de repetir intervenção na mesma conta.
const ORCAMENTO_MS = 105000

// Socket morto responde rápido (Boom 428) ou trava; 8s já separa os dois casos.
const TIMEOUT_MS = 8000
const APP_URL = 'https://www.mensalli.com.br'
const WEBHOOK_BOT_URL = `${SUPABASE_URL}/functions/v1/whatsapp-bot`

// Janela de evidência: falhas do último dia de disparos.
const JANELA_EVIDENCIA_H = 26

// Quantas falhas com assinatura de socket morto exigimos. 1 sozinha pode ser o
// número do aluno; 2 já é o socket.
const MIN_FALHAS = 2

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function fetchTimeout(url: string, opts: RequestInit, ms = TIMEOUT_MS): Promise<Response> {
  const c = new AbortController()
  const id = setTimeout(() => c.abort(), ms)
  try {
    return await fetch(url, { ...opts, signal: c.signal })
  } finally {
    clearTimeout(id)
  }
}

/**
 * O socket está vivo? Round-trip real ao WhatsApp com o número DO PRÓPRIO
 * cliente (nunca um número inventado — foi consultar número fake em massa que
 * fez o WhatsApp deslogar a base). Socket morto responde Boom 428
 * "Connection Closed"; vivo responde 200.
 */
async function socketVivo(apiUrl: string, apiKey: string, instance: string, numero: string): Promise<boolean> {
  try {
    const r = await fetchTimeout(`${apiUrl}/chat/whatsappNumbers/${instance}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: apiKey },
      body: JSON.stringify({ numbers: [numero] }),
    })
    return r.ok
  } catch (_e) {
    return false
  }
}

/**
 * Número para a sonda, tirado SÓ do banco.
 *
 * Nada de /instance/fetchInstances aqui. Medido em 17/08, com a Evolution já
 * degradada: connectionState 0,1s, sonda 7s, fetchInstances de UMA instância
 * 32s, e da frota inteira 52,8s — ele agrega contagem de mensagens/contatos/
 * chats de 57 instâncias. Foi essa chamada que a primeira versão desta função
 * usou, e ela estourou o timeout em 8 de 8 candidatos.
 *
 * Qualquer número REAL do próprio cliente serve para exercitar o socket; o que
 * não pode é número inventado em massa, que foi o que derrubou a base em agosto.
 */
function numeroParaSonda(
  zap: { whatsapp_numero: string | null; gestor_jid: string | null },
  telefone: string | null | undefined,
): string | null {
  if (zap.whatsapp_numero) return zap.whatsapp_numero
  if (zap.gestor_jid) return zap.gestor_jid.split('@')[0]
  const n = String(telefone || '').replace(/\D/g, '')
  if (n.length < 10) return null
  return n.startsWith('55') ? n : '55' + n
}

/** Estado da instância. 0,1s — o fetchInstances leva 32s e não é necessário aqui. */
async function estadoInstancia(apiUrl: string, apiKey: string, instance: string): Promise<string> {
  try {
    const r = await fetchTimeout(`${apiUrl}/instance/connectionState/${instance}`, { headers: { apikey: apiKey } })
    if (r.status === 404) return 'inexistente'
    if (!r.ok) return 'erro'
    const d = await r.json()
    return d?.instance?.state || 'erro'
  } catch (_e) {
    return 'erro'
  }
}

/** POST — o PUT devolve 404 nesta versão da Evolution (medido em 11/08/26). */
async function restart(apiUrl: string, apiKey: string, instance: string): Promise<boolean> {
  try {
    const r = await fetchTimeout(`${apiUrl}/instance/restart/${instance}`, {
      method: 'POST', headers: { apikey: apiKey },
    })
    return r.ok
  } catch (_e) {
    return false
  }
}

async function garantirWebhook(apiUrl: string, apiKey: string, instance: string, botAtivo: boolean): Promise<void> {
  try {
    await fetchTimeout(`${apiUrl}/webhook/set/${instance}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: apiKey },
      body: JSON.stringify({
        webhook: {
          enabled: true, url: WEBHOOK_BOT_URL, webhookByEvents: false, webhookBase64: false,
          events: botAtivo ? ['MESSAGES_UPSERT', 'CONNECTION_UPDATE'] : ['CONNECTION_UPDATE'],
        },
      }),
    })
  } catch (_e) { /* best-effort */ }
}

/**
 * Apaga e recria limpa. IRREVERSÍVEL: destrói a credencial e o espelho de
 * mensagens da Evolution. `qrcode:false` faz a instância nascer em 'close' sem
 * queimar tentativas de QR — assim o QR sai de primeira quando o cliente abrir
 * a tela (verificado: 13 min depois seguia em 'close', e o connect devolveu QR
 * com o contador em 1).
 */
async function recriar(
  apiUrl: string, apiKey: string, instance: string, botAtivo: boolean,
): Promise<{ ok: boolean; detalhe: string }> {
  await fetchTimeout(`${apiUrl}/instance/logout/${instance}`, {
    method: 'DELETE', headers: { apikey: apiKey },
  }).catch(() => {})

  try {
    await fetchTimeout(`${apiUrl}/instance/delete/${instance}`, {
      method: 'DELETE', headers: { apikey: apiKey },
    })
  } catch (_e) {
    return { ok: false, detalhe: 'delete não respondeu' }
  }

  // O delete não é instantâneo; recriar cedo demais ressuscita a instância presa.
  // Confirmamos pelo connectionState (0,1s) e não pelo fetchInstances (32s) —
  // os dois devolvem 404 para instância inexistente, mas só um é barato.
  let sumiu = false
  for (let i = 0; i < 5; i++) {
    await sleep(1200)
    const r = await fetchTimeout(
      `${apiUrl}/instance/connectionState/${instance}`,
      { headers: { apikey: apiKey } },
    ).catch(() => null)
    if (r && r.status === 404) { sumiu = true; break }
  }
  if (!sumiu) return { ok: false, detalhe: 'instância não sumiu após o delete' }

  const criar = await fetchTimeout(`${apiUrl}/instance/create`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: apiKey },
    body: JSON.stringify({ instanceName: instance, qrcode: false, integration: 'WHATSAPP-BAILEYS' }),
  })
  if (!criar.ok && ![403, 409].includes(criar.status)) {
    return { ok: false, detalhe: `create HTTP ${criar.status} — instância ficou apagada!` }
  }

  // Sem isto a instância nova nasce sem webhook e some do rastreio em tempo real.
  await garantirWebhook(apiUrl, apiKey, instance, botAtivo)
  return { ok: true, detalhe: 'recriada limpa (qrcode:false) — QR liberado para o cliente' }
}

async function avisarGestor(
  apiUrl: string, apiKey: string, master: string, jid: string, nome: string,
): Promise<boolean> {
  const destino = jid.includes('@') ? jid : `${jid}@s.whatsapp.net`
  const texto =
    `⚠️ *MensalliZap — ação necessária*\n\n` +
    `Olá${nome ? `, ${nome}` : ''}! O WhatsApp da sua conta parou de enviar mensagens ` +
    `e precisa ser reconectado — suas cobranças e lembretes não estão saindo.\n\n` +
    `👉 Escaneie o QR Code aqui:\n${APP_URL}/app/whatsapp\n\n` +
    `Leva menos de 1 minuto. Já deixamos tudo pronto do nosso lado.`
  try {
    const r = await fetchTimeout(`${apiUrl}/message/sendText/${master}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: apiKey },
      body: JSON.stringify({ number: destino, text: texto }),
    })
    return r.ok
  } catch (_e) {
    return false
  }
}

async function executar(): Promise<Record<string, unknown>> {
  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

  const { data: cfg } = await admin
    .from('whatsapp_recovery_cfg')
    .select('ativo, restart_ativo, recriar_ativo, max_recriacoes_dia, max_recuperacoes_rodada')
    .eq('id', true)
    .maybeSingle()

  if (!cfg?.ativo) return { pulado: 'whatsapp_recovery_cfg.ativo = false' }

  const { data: configs } = await admin
    .from('config')
    .select('chave, valor')
    .in('chave', ['evolution_api_key', 'evolution_api_url', 'evolution_master_instance'])
  const cm: Record<string, string> = {}
  configs?.forEach((c: { chave: string; valor: string }) => { cm[c.chave] = c.valor })
  const apiKey = cm.evolution_api_key
  const apiUrl = cm.evolution_api_url || 'https://service-evolution-api.tnvro1.easypanel.host'
  const master = cm.evolution_master_instance || 'mensalli_master'
  if (!apiKey) throw new Error('evolution_api_key não configurada')

  // ---------- DETECÇÃO: 100% no banco, zero chamadas à Evolution ----------
  const desde = new Date(Date.now() - JANELA_EVIDENCIA_H * 3600 * 1000).toISOString()

  const { data: falhas } = await admin
    .from('logs_mensagens')
    .select('user_id, erro_codigo, erro, created_at')
    .eq('status', 'falha')
    .gte('created_at', desde)

  const { data: oks } = await admin
    .from('logs_mensagens')
    .select('user_id, created_at')
    .eq('status', 'enviado')
    .gte('created_at', desde)

  const ultimoOk = new Map<string, string>()
  for (const o of (oks || []) as { user_id: string; created_at: string }[]) {
    const a = ultimoOk.get(o.user_id)
    if (!a || o.created_at > a) ultimoOk.set(o.user_id, o.created_at)
  }

  // Assinatura de SOCKET morto — não de número errado do aluno.
  const contagem = new Map<string, { n: number; ultima: string }>()
  for (const f of (falhas || []) as { user_id: string; erro_codigo: string | null; erro: string | null; created_at: string }[]) {
    // 'evolution_db_pool' NÃO é socket morto: é o pool do Prisma da Evolution
    // estourando DEPOIS da entrega. Contar isso como prova levaria a varredura a
    // destruir instância saudável (medido em 18/08 na AD Lions, que entregou as
    // três mensagens do teste — inclusive a que devolveu 500).
    const socketMorto =
      f.erro_codigo === 'instance_500' ||
      (f.erro || '').includes('Connection Closed') ||
      (f.erro || '').includes('não foi possível enviar')
    if (f.erro_codigo === 'evolution_db_pool') continue
    if (!socketMorto) continue
    const c = contagem.get(f.user_id) || { n: 0, ultima: '' }
    c.n++
    if (f.created_at > c.ultima) c.ultima = f.created_at
    contagem.set(f.user_id, c)
  }

  const suspeitos: string[] = []
  for (const [uid, c] of contagem) {
    if (c.n < MIN_FALHAS) continue
    const ok = ultimoOk.get(uid)
    // Envio bem-sucedido DEPOIS da última falha = socket voltou sozinho.
    if (ok && ok > c.ultima) continue
    suspeitos.push(uid)
  }

  if (!suspeitos.length) return { candidatos: 0, mensagem: 'nenhum zumbi suspeito' }

  // Já mexemos nesta instância nas últimas 24h? Então não mexe de novo. Esta
  // trava é o que impede o laço que aconteceu em 13/08 (mexe → gera evento →
  // detecta de novo → mexe).
  const { data: mexidas } = await admin
    .from('whatsapp_recovery_log')
    .select('instance_name')
    .gte('criado_em', new Date(Date.now() - 24 * 3600 * 1000).toISOString())
  const jaMexidas = new Set((mexidas || []).map((m: { instance_name: string }) => m.instance_name))

  const { data: zaps } = await admin
    .from('mensallizap')
    .select('user_id, instance_name, whatsapp_numero, gestor_jid, pareamento_ate, conectado')
    .in('user_id', suspeitos)

  const { data: usuarios } = await admin
    .from('usuarios')
    .select('id, nome_empresa, telefone')
    .in('id', suspeitos)
  const userPorId = new Map((usuarios || []).map((u: { id: string }) => [u.id, u]))

  const { data: bots } = await admin
    .from('configuracoes_cobranca')
    .select('user_id, bot_ativo')
    .in('user_id', suspeitos)
  const botPorUser = new Map((bots || []).map((b: { user_id: string; bot_ativo: boolean }) => [b.user_id, !!b.bot_ativo]))

  const INICIO = Date.now()
  const semTempo = () => Date.now() - INICIO > ORCAMENTO_MS

  const agora = Date.now()
  const teto = cfg.max_recuperacoes_rodada ?? 3
  let recriacoes = 0
  const relatorio: Record<string, string>[] = []

  const registrar = async (uid: string, inst: string, conta: string, acao: string, sucesso: boolean, detalhe: string) => {
    await admin.from('whatsapp_recovery_log').insert({ user_id: uid, instance_name: inst, acao, sucesso, detalhe })
    relatorio.push({ conta, acao, resultado: sucesso ? 'ok' : 'falhou', detalhe })
  }

  // Elegíveis, depois das travas.
  type Alvo = { uid: string; inst: string; conta: string; nome: string; numero: string; jid: string; bot: boolean }
  const alvos: Alvo[] = []
  for (const z of (zaps || []) as {
    user_id: string; instance_name: string | null; whatsapp_numero: string | null
    gestor_jid: string | null; pareamento_ate: string | null; conectado: boolean | null
  }[]) {
    if (alvos.length >= teto) break
    const inst = z.instance_name
    if (!inst) continue
    if (inst === master) continue                       // nunca a master: CRM de leads + canal de aviso
    if (jaMexidas.has(inst)) continue                   // 1 intervenção por dia
    if (z.pareamento_ate && Date.parse(z.pareamento_ate) > agora) continue // cliente com o QR na tela

    // SÓ mexemos em quem o sistema ACHA que está conectado. Zumbi é exatamente
    // isso: "acreditamos que está conectado e não está". Se conectado = false,
    // o sistema já sabe da queda e quem resolve é o cliente escaneando — não há
    // nada a recuperar, e agir aqui só destrói.
    //
    // Sem esta condição, em 17/08 às 16:21 a varredura apagou as instâncias
    // NOVAS da GR Esperança e da Team Juliana: recém-criadas, aguardando o
    // pareamento, elas respondem à sonda igual a uma quebrada. A escada leu
    // zumbi, tentou restart (não havia sessão para reiniciar), foi ao delete e
    // deixou os dois clientes sem instância nenhuma.
    if (z.conectado === false) continue

    const u = userPorId.get(z.user_id) as { nome_empresa?: string; telefone?: string } | undefined
    const conta = u?.nome_empresa || inst
    const numero = numeroParaSonda(z, u?.telefone)
    if (!numero) { await registrar(z.user_id, inst, conta, 'sonda', false, 'sem número no cadastro para sondar'); continue }

    alvos.push({
      uid: z.user_id, inst, conta,
      nome: (u?.nome_empresa || '').trim().split(' ')[0] || '',
      numero,
      jid: z.gestor_jid || (u?.telefone ? `55${String(u.telefone).replace(/\D/g, '').replace(/^55/, '')}` : ''),
      bot: botPorUser.get(z.user_id) || false,
    })
  }

  // ---- PASSADAS ----
  // Antes isto era um laço por conta que ESPERAVA ~48s cada uma para ver se o
  // restart pegou. Com 8 candidatos dava ~7 min e o runtime cortava a função na
  // primeira conta (17/08: processou 1 de 8). Agora reiniciamos todas de uma vez
  // e esperamos UMA vez só, em bloco.

  // 1) Confirmar quem está mesmo morto.
  const mortos: Alvo[] = []
  for (const a of alvos) {
    if (semTempo()) break

    // Zumbi é 'open' com socket morto. Se a instância NÃO está 'open', ela está
    // desconectada ou aguardando pareamento — nos dois casos quem resolve é o
    // cliente, e mexer aqui é destruir o que está esperando por ele.
    // connectionState custa 0,1s, contra 32s do fetchInstances.
    const estado = await estadoInstancia(apiUrl, apiKey, a.inst)
    if (estado !== 'open') {
      await registrar(a.uid, a.inst, a.conta, 'sonda', true,
        `instância em '${estado}' — não é zumbi, aguarda o cliente escanear`)
      continue
    }

    if (await socketVivo(apiUrl, apiKey, a.inst, a.numero)) {
      await registrar(a.uid, a.inst, a.conta, 'sonda', true, 'socket vivo — as falhas tinham outra causa, nada a fazer')
    } else {
      mortos.push(a)
    }
  }

  // 2) Restart em todos os mortos, sem esperar um por um.
  const reiniciados: Alvo[] = []
  if (cfg.restart_ativo) {
    for (const a of mortos) {
      if (await restart(apiUrl, apiKey, a.inst)) reiniciados.push(a)
      else await registrar(a.uid, a.inst, a.conta, 'restart', false, 'a Evolution recusou o restart')
    }
    if (reiniciados.length) await sleep(30000) // uma espera só, para o lote todo
  }

  // 3) Quem voltou? Quem não voltou vai para o irreversível.
  const persistentes: Alvo[] = []
  for (const a of reiniciados) {
    const curado = await socketVivo(apiUrl, apiKey, a.inst, a.numero)
    await registrar(a.uid, a.inst, a.conta, 'restart', curado,
      curado ? 'voltou a enviar sem novo pareamento' : 'não voltou depois do restart')
    if (!curado) persistentes.push(a)
  }
  // Antes: sem restart, todos os mortos iam DIRETO para o delete+create — o
  // interruptor que parece o mais seguro era o mais destrutivo. Agora desligar
  // o restart desliga a escada inteira: sem tentar o barato, não se faz o caro.
  if (!cfg.restart_ativo) {
    for (const a of mortos) {
      await registrar(a.uid, a.inst, a.conta, 'restart', false,
        'restart desligado na configuração — nada a fazer sem tentar o passo não-destrutivo')
    }
  }

  // 4) Recriar + avisar. Só aqui se destrói credencial.
  for (const a of persistentes) {
    if (semTempo()) break // o que sobrar sai na próxima rodada
    if (!cfg.recriar_ativo || recriacoes >= (cfg.max_recriacoes_dia ?? 5)) {
      await registrar(a.uid, a.inst, a.conta, 'recriar', false, 'bloqueado por configuração/teto — precisa de intervenção manual')
      continue
    }
    const r = await recriar(apiUrl, apiKey, a.inst, a.bot)
    recriacoes++
    await registrar(a.uid, a.inst, a.conta, 'recriar', r.ok, r.detalhe)

    // Depois do recriar SÓ o cliente resolve, escaneando o QR.
    if (r.ok) {
      // A instância nova não tem pareamento: marcar a queda tira a conta das
      // vw_parcelas_* (parar de disparar contra um socket que não existe) e,
      // pela trava do topo, faz a própria varredura nunca mais tocar nela até
      // o cliente reconectar.
      await admin
        .from('mensallizap')
        .update({ conectado: false, ultima_desconexao: new Date().toISOString() })
        .eq('user_id', a.uid)
    }
    if (r.ok && a.jid) {
      const avisou = await avisarGestor(apiUrl, apiKey, master, a.jid, a.nome)
      await registrar(a.uid, a.inst, a.conta, 'aviso', avisou, avisou ? 'gestor avisado' : 'aviso não saiu (master fora?)')
    }
  }

  const resumo = { candidatos: suspeitos.length, tratados: relatorio.length, recriacoes, detalhes: relatorio }
  console.log('✅ Varredura de zumbi:', JSON.stringify(resumo))
  return resumo
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  // @ts-ignore — EdgeRuntime é injetado pelo runtime do Supabase
  EdgeRuntime.waitUntil(
    executar().catch((e) => console.error('❌ Erro na varredura de zumbi:', e instanceof Error ? e.message : String(e))),
  )
  return new Response(
    JSON.stringify({ success: true, message: 'Varredura de zumbi iniciada em background.' }),
    { status: 202, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  )
})
