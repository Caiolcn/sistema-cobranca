#!/usr/bin/env node
/**
 * snapshot-instancias.mjs — Retrato da saúde REAL de todas as instâncias da Evolution,
 * feito pra comparar antes/depois de uma intervenção (restart de container, upgrade,
 * migração). Responde "quem voltou e quem não voltou" sem esperar o cliente reclamar.
 *
 * Por que não basta o connectionState: ele fica `open` com o socket Baileys morto
 * ("zumbi"). Em 2.3.7 o estado vem de waMonitor.waInstances (memória), não do banco.
 * Só o round-trip via POST /chat/whatsappNumbers distingue vivo de zumbi — é o mesmo
 * teste que a edge function whatsapp-health-check faz.
 * Ver docs/runbook-lid-whatsapp.md e a memória zumbi_evolution_deadlock_irrecuperavel.
 *
 * Classificação:
 *   conectado    open + sonda 200            -> envia de verdade
 *   zumbi        open + sonda falhou         -> NÃO envia, e a UI/painel mentem
 *   desconectado close/connecting            -> não envia, mas o QR está livre
 *   inexistente  404                         -> instância não existe na Evolution
 *   indeterminado timeout/erro de API        -> não dá pra concluir nada (não é queda)
 *
 * Uso:
 *   EVOLUTION_URL="https://..." EVOLUTION_KEY="xxxx" \
 *     node scripts/snapshot-instancias.mjs --out antes.json [--nomes nomes.json]
 *
 *   # depois da intervenção, compara com o retrato anterior:
 *   EVOLUTION_URL="https://..." EVOLUTION_KEY="xxxx" \
 *     node scripts/snapshot-instancias.mjs --out depois.json --diff antes.json
 *
 * Sai com código 1 se houver REGRESSÃO (quem estava conectado e não está mais),
 * pra poder plugar em alerta. "Continua zumbi" não é regressão, é falha de conserto.
 *
 * NUNCA commitar a apikey neste arquivo — sempre por variável de ambiente.
 * Requer Node 18+ (fetch nativo).
 */

import { readFileSync, writeFileSync } from 'node:fs'

const API = (process.env.EVOLUTION_URL || '').replace(/\/+$/, '')
const KEY = process.env.EVOLUTION_KEY || ''
const CONCURRENCY = Number(process.env.CONCURRENCY) || 4
const TIMEOUT_MS = Number(process.env.TIMEOUT_MS) || 12000
const THROTTLE_MS = Number(process.env.THROTTLE_MS) || 250

// Número usado pra exercitar o socket (consulta de existência, não envia nada).
// SEM DEFAULT de propósito: o default era 5511999999999, e consultar em massa um
// número inexistente foi o que fez o WhatsApp invalidar as sessões da base
// (ver o topo de supabase/functions/whatsapp-health-check/index.ts). Se for
// sondar, informe um número REAL em NUMERO_SONDA e rode com parcimônia.
const NUMERO_SONDA = process.env.NUMERO_SONDA || ''

if (!API || !KEY) {
  console.error('Faltam EVOLUTION_URL e/ou EVOLUTION_KEY no ambiente.')
  process.exit(2)
}

function arg(nome) {
  const i = process.argv.indexOf(nome)
  return i > -1 ? process.argv[i + 1] : null
}

const OUT = arg('--out')
const DIFF = arg('--diff')
const NOMES_FILE = arg('--nomes')

const nomes = NOMES_FILE ? JSON.parse(readFileSync(NOMES_FILE, 'utf8')) : {}
const rotulo = (n) => nomes[n] ? `${nomes[n]} (${n})` : n

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function req(path, init = {}) {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(`${API}${path}`, {
      ...init,
      signal: ctrl.signal,
      headers: { 'Content-Type': 'application/json', apikey: KEY, ...(init.headers || {}) },
    })
    return { ok: res.ok, status: res.status, texto: await res.text().catch(() => '') }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { ok: false, status: 0, texto: msg.includes('abort') ? 'timeout' : msg }
  } finally {
    clearTimeout(t)
  }
}

async function lerEstado(inst) {
  const r = await req(`/instance/connectionState/${inst}`)
  if (r.status === 404) return 'inexistente'
  if (!r.ok) return 'erro'
  try {
    return JSON.parse(r.texto)?.instance?.state || 'close'
  } catch {
    return 'erro'
  }
}

async function sondar(inst) {
  // Sem NUMERO_SONDA não sonda: dá o estado do painel e admite que não sabe.
  if (!NUMERO_SONDA) return { vivo: null, erro: 'sonda desligada (defina NUMERO_SONDA com um número real)' }

  const r = await req(`/chat/whatsappNumbers/${inst}`, {
    method: 'POST',
    body: JSON.stringify({ numbers: [NUMERO_SONDA] }),
  })
  // 200 = o Baileys falou com o WhatsApp. Se o número existe é irrelevante.
  if (r.ok) return { vivo: true, erro: null }
  return { vivo: false, erro: `HTTP ${r.status}: ${r.texto.slice(0, 120)}` }
}

async function avaliar(inst) {
  const estado = await lerEstado(inst)

  if (estado === 'inexistente') return { instancia: inst, estado, veredito: 'inexistente', erro: null }
  if (estado === 'erro') return { instancia: inst, estado, veredito: 'indeterminado', erro: 'API não respondeu' }
  if (estado !== 'open') return { instancia: inst, estado, veredito: 'desconectado', erro: null }

  const s = await sondar(inst)
  return {
    instancia: inst,
    estado,
    // vivo === null: sonda desligada, então o máximo que dá pra afirmar é o painel.
    veredito: s.vivo === null ? 'open_nao_sondado' : s.vivo ? 'conectado' : 'zumbi',
    erro: s.erro,
  }
}

// Roda em lotes pra não martelar a Evolution (o mesmo cuidado do health-check).
async function emLotes(itens, fn) {
  const out = []
  for (let i = 0; i < itens.length; i += CONCURRENCY) {
    const lote = itens.slice(i, i + CONCURRENCY)
    out.push(...(await Promise.all(lote.map(fn))))
    process.stderr.write(`  ...${Math.min(i + CONCURRENCY, itens.length)}/${itens.length}\r`)
    if (i + CONCURRENCY < itens.length) await sleep(THROTTLE_MS)
  }
  process.stderr.write('\n')
  return out
}

async function listarInstancias() {
  const r = await req('/instance/fetchInstances')
  if (!r.ok) throw new Error(`fetchInstances falhou: HTTP ${r.status} ${r.texto.slice(0, 200)}`)
  const data = JSON.parse(r.texto)
  // 2.3.7 devolve a lista achatada ({ name }); versões antigas aninhavam em .instance
  return (Array.isArray(data) ? data : [])
    .map((i) => i.name || i.instance?.instanceName)
    .filter(Boolean)
    .sort()
}

const ICONE = {
  conectado: '✅', zumbi: '🧟', desconectado: '⭕',
  inexistente: '👻', indeterminado: '❔',
}

function imprimirResumo(reg) {
  const porVeredito = {}
  for (const r of reg) (porVeredito[r.veredito] ||= []).push(r)

  console.log('\n=== RESUMO ===')
  for (const v of ['conectado', 'zumbi', 'desconectado', 'inexistente', 'indeterminado']) {
    if (porVeredito[v]?.length) console.log(`${ICONE[v]} ${v.padEnd(14)} ${porVeredito[v].length}`)
  }

  for (const v of ['zumbi', 'desconectado', 'inexistente', 'indeterminado']) {
    if (!porVeredito[v]?.length) continue
    console.log(`\n--- ${v.toUpperCase()} ---`)
    for (const r of porVeredito[v]) console.log(`  ${rotulo(r.instancia)}${r.erro ? ` — ${r.erro}` : ''}`)
  }
}

function compararComAnterior(antes, depois) {
  const mapaAntes = new Map(antes.registros.map((r) => [r.instancia, r.veredito]))
  const mapaDepois = new Map(depois.registros.map((r) => [r.instancia, r.veredito]))
  const todas = [...new Set([...mapaAntes.keys(), ...mapaDepois.keys()])].sort()

  const regressoes = [], recuperadas = [], persistentes = [], outras = []

  for (const inst of todas) {
    const a = mapaAntes.get(inst) ?? '(ausente)'
    const d = mapaDepois.get(inst) ?? '(ausente)'
    if (a === d) {
      if (d !== 'conectado') persistentes.push({ inst, a, d })
      continue
    }
    if (a === 'conectado' && d !== 'conectado') regressoes.push({ inst, a, d })
    else if (a !== 'conectado' && d === 'conectado') recuperadas.push({ inst, a, d })
    else outras.push({ inst, a, d })
  }

  const linha = ({ inst, a, d }) => `  ${rotulo(inst)}: ${a} -> ${d}`

  console.log(`\n=== COMPARAÇÃO com ${DIFF} ===`)
  console.log(`antes:  ${antes.gerado_em}`)
  console.log(`depois: ${depois.gerado_em}`)

  console.log(`\n🟢 RECUPERADAS (${recuperadas.length})`)
  recuperadas.forEach((r) => console.log(linha(r)))

  console.log(`\n🔴 REGRESSÕES (${regressoes.length}) — estavam conectadas e não estão mais`)
  regressoes.forEach((r) => console.log(linha(r)))

  console.log(`\n🟡 SEGUEM QUEBRADAS (${persistentes.length}) — sem mudança`)
  persistentes.forEach((r) => console.log(`  ${rotulo(r.inst)}: ${r.d}`))

  if (outras.length) {
    console.log(`\n⚪ OUTRAS MUDANÇAS (${outras.length})`)
    outras.forEach((r) => console.log(linha(r)))
  }

  return regressoes.length
}

const instancias = await listarInstancias()
console.error(`Sondando ${instancias.length} instâncias em ${API} ...`)

const registros = await emLotes(instancias, avaliar)
const snapshot = { gerado_em: new Date().toISOString(), api: API, registros }

imprimirResumo(registros)

if (OUT) {
  writeFileSync(OUT, JSON.stringify(snapshot, null, 2))
  console.log(`\nRetrato salvo em ${OUT}`)
}

let regressoes = 0
if (DIFF) {
  regressoes = compararComAnterior(JSON.parse(readFileSync(DIFF, 'utf8')), snapshot)
}

process.exit(regressoes > 0 ? 1 : 0)
