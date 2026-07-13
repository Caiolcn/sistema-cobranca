#!/usr/bin/env node
/**
 * backfill-mensalli-leads.mjs — Puxa o histórico de conversas do WhatsApp
 * comercial do Mensalli (instância master) e monta os leads retroativos do CRM
 * de campanha (/app/admin/leads).
 *
 * Daqui pra frente a captura é em tempo real (edge function whatsapp-bot). Este
 * script existe só pra trazer quem já tinha conversado ANTES do CRM existir.
 *
 * NÃO ESCREVE NO BANCO. Ele lê a Evolution, monta o payload e cospe um JSON +
 * um .sql pra você revisar antes de aplicar. Se a Evolution já tiver descartado
 * o histórico, isso aparece aqui (0 chats) em vez de virar surpresa em produção.
 *
 * Uso:
 *   EVOLUTION_URL="https://..." EVOLUTION_KEY="xxxx" node scripts/backfill-mensalli-leads.mjs
 *   # opcional: INSTANCE=instance_c93b3e8d  LOOKBACK_DAYS=90  OUT=./backfill.json
 *
 * NUNCA commitar a apikey neste arquivo — passe sempre por variável de ambiente.
 * Requer Node 18+ (usa fetch nativo).
 */

import { writeFileSync } from 'node:fs'

const API = (process.env.EVOLUTION_URL || '').replace(/\/+$/, '')
const KEY = process.env.EVOLUTION_KEY || ''
const INSTANCE = process.env.INSTANCE || 'instance_c93b3e8d'
const LOOKBACK_DAYS = Number(process.env.LOOKBACK_DAYS) || 90
const OUT = process.env.OUT || 'backfill-mensalli-leads.json'
const OUT_SQL = OUT.replace(/\.json$/, '') + '.sql'
const TIMEOUT_MS = Number(process.env.TIMEOUT_MS) || 60000

if (!API || !KEY) {
  console.error('Faltam EVOLUTION_URL e/ou EVOLUTION_KEY no ambiente.')
  process.exit(2)
}

const CORTE = Date.now() - LOOKBACK_DAYS * 24 * 3600 * 1000

async function api(path, init = {}) {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(`${API}${path}`, {
      ...init,
      signal: ctrl.signal,
      headers: { apikey: KEY, 'Content-Type': 'application/json', ...(init.headers || {}) },
    })
    const txt = await res.text()
    if (!res.ok) throw new Error(`${res.status} ${txt.slice(0, 200)}`)
    return txt ? JSON.parse(txt) : null
  } finally {
    clearTimeout(t)
  }
}

// A Evolution mudou a forma dessas rotas entre versões (ora array na raiz, ora
// { messages: { records: [...] } }). Normaliza os dois formatos.
function comoLista(resp, ...caminhos) {
  if (Array.isArray(resp)) return resp
  for (const c of caminhos) {
    const v = c.split('.').reduce((o, k) => (o == null ? o : o[k]), resp)
    if (Array.isArray(v)) return v
  }
  return []
}

function extrairTexto(message = {}) {
  return (
    message.conversation ||
    message.extendedTextMessage?.text ||
    message.imageMessage?.caption ||
    message.videoMessage?.caption ||
    ''
  ).trim()
}

function extrairTipo(message = {}) {
  if (message.audioMessage || message.pttMessage) return 'audio'
  if (message.imageMessage) return 'imagem'
  if (message.videoMessage) return 'video'
  if (message.documentMessage) return 'documento'
  if (message.stickerMessage) return 'sticker'
  return 'texto'
}

const ROTULO = {
  audio: '🎤 Áudio',
  imagem: '📷 Imagem',
  video: '🎬 Vídeo',
  documento: '📎 Documento',
  sticker: '💬 Figurinha',
}

const sql = (v) => (v == null ? 'NULL' : `'${String(v).replace(/'/g, "''")}'`)

async function main() {
  console.log(`🔎 Instância: ${INSTANCE} | janela: ${LOOKBACK_DAYS} dias\n`)

  // 1. Puxa as mensagens da instância (a Evolution guarda o histórico que o
  //    Baileys sincronizou; quanto ela retém varia por versão/config).
  let msgsRaw = []
  try {
    const resp = await api(`/chat/findMessages/${INSTANCE}`, {
      method: 'POST',
      body: JSON.stringify({ where: {}, limit: 5000 }),
    })
    msgsRaw = comoLista(resp, 'messages.records', 'messages', 'records')
  } catch (e) {
    console.error(`❌ /chat/findMessages falhou: ${e.message}`)
    console.error('   (versões antigas da Evolution usam outro contrato — dá pra ajustar o body)')
    process.exit(1)
  }

  console.log(`📥 ${msgsRaw.length} mensagens brutas retornadas pela Evolution`)
  if (msgsRaw.length === 0) {
    console.log('\n⚠️  A Evolution não devolveu histórico. Nada a importar — o CRM começa a partir de agora.')
    return
  }

  // 2. Filtra e agrupa por contato
  const leads = new Map()
  let descartadas = 0

  for (const m of msgsRaw) {
    const jid = m.key?.remoteJid || ''
    if (!jid || jid.endsWith('@g.us') || jid.includes('broadcast')) { descartadas++; continue }

    const ts = Number(m.messageTimestamp?.low ?? m.messageTimestamp ?? 0)
    const enviadoEm = ts > 0 ? new Date(ts * 1000) : null
    if (!enviadoEm || enviadoEm.getTime() < CORTE) { descartadas++; continue }

    const tipo = extrairTipo(m.message || {})
    const texto = extrairTexto(m.message || {}) || ROTULO[tipo] || ''
    if (!texto) { descartadas++; continue }  // reação, protocolo, etc

    if (!leads.has(jid)) {
      leads.set(jid, {
        remote_jid: jid,
        telefone: jid.includes('@lid') ? null : jid.split('@')[0].split(':')[0].replace(/\D/g, ''),
        nome: null,
        mensagens: [],
      })
    }
    const lead = leads.get(jid)
    if (!lead.nome && m.pushName && !m.key?.fromMe) lead.nome = String(m.pushName).trim()
    lead.mensagens.push({
      wa_message_id: m.key?.id || null,
      direcao: m.key?.fromMe ? 'out' : 'in',
      texto,
      tipo,
      enviado_em: enviadoEm.toISOString(),
    })
  }

  // 3. Deriva o estado de cada lead a partir da conversa
  const saida = []
  for (const lead of leads.values()) {
    lead.mensagens.sort((a, b) => a.enviado_em.localeCompare(b.enviado_em))
    const ultima = lead.mensagens[lead.mensagens.length - 1]
    const teveInbound = lead.mensagens.some(m => m.direcao === 'in')
    if (!teveInbound) continue  // só mensagem nossa = não é lead que chegou por campanha

    saida.push({
      ...lead,
      // Sem resposta minha = ainda 'novo'; se eu já respondi, a conversa começou.
      status: ultima.direcao === 'in' && lead.mensagens.every(m => m.direcao === 'in') ? 'novo' : 'conversando',
      origem: 'backfill',
      ultima_mensagem: ultima.texto,
      ultima_direcao: ultima.direcao,
      ultima_interacao: ultima.enviado_em,
    })
  }

  saida.sort((a, b) => b.ultima_interacao.localeCompare(a.ultima_interacao))

  const totalMsgs = saida.reduce((s, l) => s + l.mensagens.length, 0)
  const semNumero = saida.filter(l => !l.telefone).length
  const maisAntiga = saida.length ? saida[saida.length - 1].ultima_interacao.slice(0, 10) : '—'
  const maisNova = saida.length ? saida[0].ultima_interacao.slice(0, 10) : '—'

  console.log(`🗑️  ${descartadas} descartadas (grupo, broadcast, fora da janela, sem texto)`)
  console.log(`\n✅ ${saida.length} leads · ${totalMsgs} mensagens · janela real ${maisAntiga} → ${maisNova}`)
  if (semNumero) console.log(`   ⚠️  ${semNumero} sem telefone (contas @lid) — entram no board, mas sem match automático com usuarios`)
  console.log('\nTop 10 por recência:')
  for (const l of saida.slice(0, 10)) {
    console.log(`  ${(l.nome || '(sem nome)').padEnd(24)} ${(l.telefone || '@lid').padEnd(14)} ${l.mensagens.length}msg  ${l.ultima_interacao.slice(0, 10)}  ${l.status}`)
  }

  // 4. Escreve JSON + SQL pra revisão. NADA vai pro banco daqui.
  writeFileSync(OUT, JSON.stringify(saida, null, 2), 'utf8')

  const linhas = ['BEGIN;', '']
  for (const l of saida) {
    linhas.push(
      `INSERT INTO mensalli_leads (remote_jid, telefone, nome, status, origem, ultima_mensagem, ultima_direcao, ultima_interacao)`,
      `VALUES (${sql(l.remote_jid)}, ${sql(l.telefone)}, ${sql(l.nome)}, ${sql(l.status)}, 'backfill', ${sql(l.ultima_mensagem)}, ${sql(l.ultima_direcao)}, ${sql(l.ultima_interacao)}::timestamptz)`,
      `ON CONFLICT (remote_jid) DO NOTHING;`,
      ''
    )
    for (const m of l.mensagens) {
      linhas.push(
        `INSERT INTO mensalli_lead_mensagens (lead_id, wa_message_id, direcao, texto, tipo, enviado_em)`,
        `SELECT id, ${sql(m.wa_message_id)}, ${sql(m.direcao)}, ${sql(m.texto)}, ${sql(m.tipo)}, ${sql(m.enviado_em)}::timestamptz`,
        `  FROM mensalli_leads WHERE remote_jid = ${sql(l.remote_jid)}`,
        `ON CONFLICT (wa_message_id) DO NOTHING;`
      )
    }
    linhas.push('')
  }
  linhas.push('SELECT * FROM sync_mensalli_leads();', 'COMMIT;')
  writeFileSync(OUT_SQL, linhas.join('\n'), 'utf8')

  console.log(`\n📄 JSON:  ${OUT}`)
  console.log(`📄 SQL:   ${OUT_SQL}  (revise e só então aplique)`)
}

main().catch(e => {
  console.error('❌ Falhou:', e.message)
  process.exit(1)
})
