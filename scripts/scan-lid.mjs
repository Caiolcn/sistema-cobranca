#!/usr/bin/env node
/**
 * scan-lid.mjs — Detector de instâncias da Evolution que "viraram LID".
 *
 * Contexto: após a conta de WhatsApp migrar para o endereçamento LID, a Evolution
 * 2.3.7 não resolve mais telefone -> LID. Todo envio do SISTEMA (JID
 * `{numero}@s.whatsapp.net`) passa a terminar em MessageUpdate.status = ERROR,
 * enquanto as conversas pessoais da conta (JID `@lid`) continuam sendo entregues.
 * Este script varre as instâncias `open` e sinaliza quem está nesse estado.
 * Ver docs/runbook-lid-whatsapp.md.
 *
 * Uso:
 *   EVOLUTION_URL="https://..." EVOLUTION_KEY="xxxx" node scripts/scan-lid.mjs
 *   # opcional: LOOKBACK_HOURS=48 (janela analisada), SAMPLE=80 (msgs por instância)
 *
 * NUNCA commitar a apikey neste arquivo — passe sempre por variável de ambiente.
 * Requer Node 18+ (usa fetch nativo).
 */

const API = (process.env.EVOLUTION_URL || '').replace(/\/+$/, '')
const KEY = process.env.EVOLUTION_KEY || ''
const LOOKBACK = (Number(process.env.LOOKBACK_HOURS) || 48) * 3600 * 1000
const SAMPLE = Number(process.env.SAMPLE) || 80
const CONCURRENCY = Number(process.env.CONCURRENCY) || 3
const TIMEOUT_MS = Number(process.env.TIMEOUT_MS) || 40000
const RETRIES = 1

if (!API || !KEY) {
  console.error('Faltam EVOLUTION_URL e/ou EVOLUTION_KEY no ambiente.')
  process.exit(2)
}

const DELIVERED = new Set(['SERVER_ACK', 'DELIVERY_ACK', 'READ', 'PLAYED'])

async function api(path, init = {}) {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(`${API}${path}`, {
      ...init,
      signal: ctrl.signal,
      headers: { 'Content-Type': 'application/json', apikey: KEY, ...(init.headers || {}) },
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return await res.json()
  } finally {
    clearTimeout(t)
  }
}

function classify(records, now) {
  let pnErr = 0, pnOk = 0, lidOk = 0
  for (const r of records) {
    const ts = Number(r.messageTimestamp || 0) * 1000
    if (now - ts > LOOKBACK) continue
    const jid = r.key?.remoteJid || ''
    const ups = r.MessageUpdate || []
    const st = ups.length ? ups[ups.length - 1].status : 'NO_UPDATE'
    if (jid.endsWith('@s.whatsapp.net')) {
      if (st === 'ERROR') pnErr++
      else if (DELIVERED.has(st)) pnOk++
    } else if (jid.endsWith('@lid') && DELIVERED.has(st)) {
      lidOk++
    }
  }
  const pn = pnErr + pnOk
  let verdict = 'sem-trafego-pn'
  if (pn > 0) {
    const frac = pnErr / pn
    verdict = frac >= 0.8 ? 'LID-QUEBRADO' : frac >= 0.3 ? 'suspeito' : 'ok'
  }
  return { pnErr, pn, lidOk, verdict }
}

async function scanInstance(name) {
  let lastErr
  for (let attempt = 0; attempt <= RETRIES; attempt++) {
    try {
      const data = await api(`/chat/findMessages/${name}`, {
        method: 'POST',
        body: JSON.stringify({ where: { key: { fromMe: true } }, limit: SAMPLE }),
      })
      const records = data?.messages?.records || []
      return { name, ...classify(records, Date.now()) }
    } catch (e) {
      lastErr = e
    }
  }
  return { name, error: lastErr?.message || 'falha' }
}

async function pool(items, worker, size) {
  const out = []
  let i = 0
  const runners = Array.from({ length: size }, async () => {
    while (i < items.length) {
      const idx = i++
      out[idx] = await worker(items[idx])
    }
  })
  await Promise.all(runners)
  return out
}

async function main() {
  const list = await api('/instance/fetchInstances')
  const arr = Array.isArray(list) ? list : list.instances || []
  const open = arr
    .map((it) => it.instance || it)
    .filter((i) => (i.connectionStatus || i.state || i.status) === 'open')
    .map((i) => i.instanceName || i.name)
    .filter(Boolean)

  const results = await pool(open, scanInstance, CONCURRENCY)

  const broken = [], suspeito = [], ok = [], semTrafego = [], erro = []
  for (const r of results) {
    if (r.error) erro.push(r)
    else if (r.verdict === 'LID-QUEBRADO') broken.push(r)
    else if (r.verdict === 'suspeito') suspeito.push(r)
    else if (r.verdict === 'ok') ok.push(r)
    else semTrafego.push(r)
  }

  const line = (r) => `  ${r.name.padEnd(24)} pn_ERROR=${r.pnErr}/${r.pn}  lid_ok=${r.lidOk}`
  console.log(`\nEvolution: ${API}`)
  console.log(`Instâncias open: ${open.length} | janela: ${LOOKBACK / 3600000}h\n`)
  console.log(`>>> LID QUEBRADO (${broken.length}):`); broken.forEach((r) => console.log(line(r)))
  console.log(`\nSUSPEITO / parcial (${suspeito.length}):`); suspeito.forEach((r) => console.log(line(r)))
  console.log(`\nSem tráfego p/ telefone nas ${LOOKBACK / 3600000}h — sem sinal (${semTrafego.length}):`)
  semTrafego.forEach((r) => console.log(line(r)))
  console.log(`\nOK (${ok.length}):`); ok.forEach((r) => console.log(line(r)))
  if (erro.length) { console.log(`\nERRO ao consultar (${erro.length}):`); erro.forEach((r) => console.log(`  ${r.name}: ${r.error}`)) }

  // exit 1 se houver instância quebrada — permite usar em alerta/cron
  process.exit(broken.length ? 1 : 0)
}

main().catch((e) => { console.error(e); process.exit(2) })
