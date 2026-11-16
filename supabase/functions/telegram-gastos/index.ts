// Edge Function: telegram-gastos
// Bot pessoal do dono no Telegram para registrar gastos.
//
//   "45 mercado"          → grava R$ 45,00, categoria Alimentação
//   "uber 23,90"          → valor pode vir antes ou depois
//   "120 presente #lazer" → #categoria força a categoria
//   "30 farmácia ontem"   → "ontem" lança no dia anterior
//   "apagar"              → apaga o último lançamento
//   "resumo"              → total do mês por categoria
//   "hoje"                → gastos de hoje
//
// Segredos (supabase secrets set):
//   TELEGRAM_GASTOS_BOT_TOKEN   token do @BotFather
//   TELEGRAM_GASTOS_SECRET      texto aleatório; o Telegram manda de volta no header
//   TELEGRAM_GASTOS_CHAT_ID     seu id no Telegram (o bot informa se estiver vazio)
//   GASTOS_USER_ID              seu user_id no Supabase (a página /admin/financas mostra)
//   GROQ_API_KEY                chave do console.groq.com (transcreve os áudios, grátis)
//
// Áudio: o Groq (Whisper) transcreve e o texto segue o mesmo caminho.
//   "gastei trinta e cinco reais no mercado" → R$ 35,00 · mercado
//
// Deploy: supabase functions deploy telegram-gastos --no-verify-jwt
// (o Telegram não manda JWT; a proteção é o header secreto + o chat_id)

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const BOT_TOKEN = Deno.env.get('TELEGRAM_GASTOS_BOT_TOKEN') || ''
const SEGREDO = Deno.env.get('TELEGRAM_GASTOS_SECRET') || ''
// Limpa espaço, aspas e afins que vêm junto ao colar no terminal
const CHAT_ID = (Deno.env.get('TELEGRAM_GASTOS_CHAT_ID') || '').replace(/[^\d-]/g, '')
const USER_ID = (Deno.env.get('GASTOS_USER_ID') || '').trim().replace(/^["']|["']$/g, '')
const GROQ_KEY = (Deno.env.get('GROQ_API_KEY') || '').trim()

const TZ = 'America/Sao_Paulo'

// Palavra (sem acento, minúscula) → categoria. A primeira que bater ganha.
const CATEGORIAS: Array<[string, string[]]> = [
  ['Alimentação', ['mercado', 'supermercado', 'padaria', 'acougue', 'feira', 'hortifruti', 'atacadao', 'assai', 'sacolao']],
  ['Restaurante', ['restaurante', 'almoco', 'janta', 'jantar', 'lanche', 'ifood', 'pizza', 'hamburguer', 'burguer', 'cafe', 'sorvete', 'acai', 'marmita', 'bar', 'cerveja', 'delivery']],
  ['Transporte', ['uber', '99', 'gasolina', 'combustivel', 'posto', 'etanol', 'alcool', 'onibus', 'metro', 'estacionamento', 'pedagio', 'taxi', 'oficina', 'mecanico', 'ipva', 'lavagem', 'lava']],
  ['Casa', ['aluguel', 'condominio', 'luz', 'energia', 'agua', 'internet', 'gas', 'iptu', 'faxina', 'diarista', 'moveis', 'reforma']],
  ['Saúde', ['farmacia', 'remedio', 'medico', 'consulta', 'dentista', 'exame', 'plano de saude', 'hospital', 'psicologo', 'academia', 'suplemento']],
  ['Assinaturas', ['netflix', 'spotify', 'amazon', 'prime', 'youtube', 'disney', 'hbo', 'max', 'icloud', 'google', 'celular', 'claro', 'vivo', 'tim', 'chatgpt', 'claude']],
  ['Lazer', ['cinema', 'show', 'viagem', 'hotel', 'passeio', 'festa', 'jogo', 'ingresso', 'praia']],
  ['Compras', ['roupa', 'tenis', 'shopping', 'loja', 'presente', 'mercadolivre', 'shopee', 'shein', 'eletronico']],
  ['Educação', ['curso', 'livro', 'escola', 'faculdade', 'mensalidade']],
  ['Pet', ['pet', 'racao', 'veterinario', 'petshop']],
]
const NOMES_CATEGORIA = [...CATEGORIAS.map(([c]) => c), 'Outros']

// Entradas (dinheiro que entrou) têm categorias próprias
const CATEGORIAS_ENTRADA: Array<[string, string[]]> = [
  ['Salário', ['salario', 'pro labore', 'prolabore', 'pagamento', 'mensalli', 'retirada']],
  ['Freela', ['freela', 'freelance', 'extra', 'bico', 'servico', 'job', 'site', 'projeto', 'cliente']],
  ['Vendas', ['venda', 'vendas', 'vendi']],
  ['Rendimentos', ['rendimento', 'rendimentos', 'juros', 'dividendo', 'dividendos', 'cdb', 'investimento', 'cashback', 'tesouro']],
]
const NOMES_CATEGORIA_ENTRADA = [...CATEGORIAS_ENTRADA.map(([c]) => c), 'Outros']
// Primeira palavra que transforma a mensagem em entrada
const GATILHOS_ENTRADA = ['recebi', 'entrou', 'entraram', 'ganhei', 'caiu', 'cairam', 'recebimento', 'entrada']

type Tipo = 'gasto' | 'entrada'

const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

function categorizar(descricao: string, tipo: Tipo = 'gasto'): string {
  const palavras = ' ' + semAcento(descricao).replace(/[^a-z0-9 ]/g, ' ') + ' '
  for (const [cat, chaves] of (tipo === 'entrada' ? CATEGORIAS_ENTRADA : CATEGORIAS)) {
    if (chaves.some((k) => palavras.includes(' ' + k + ' '))) return cat
  }
  return 'Outros'
}

// "45" "45,90" "45.90" "1.200" "1.200,50" "R$45" → número
const RE_VALOR = /^(r\$)?(\d{1,3}(\.\d{3})+(,\d{1,2})?|\d+([.,]\d{1,2})?)$/i
function lerValor(token: string): number | null {
  const t = token.replace(/^r\$/i, '')
  if (!RE_VALOR.test(token) || !t) return null
  let n: string
  if (t.includes(',')) n = t.replace(/\./g, '').replace(',', '.')
  else if (/^\d{1,3}(\.\d{3})+$/.test(t)) n = t.replace(/\./g, '')
  else n = t
  const v = Number(n)
  return Number.isFinite(v) && v > 0 ? Math.round(v * 100) / 100 : null
}

function hojeISO(deslocDias = 0): string {
  const d = new Date(Date.now() + deslocDias * 86400000)
  return d.toLocaleDateString('en-CA', { timeZone: TZ }) // AAAA-MM-DD
}

const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

type Gasto = { tipo: Tipo; valor: number; descricao: string; categoria: string; data: string }

// ---------- Fala → texto que o leitor entende ----------

const UNIDADES: Record<string, number> = {
  um: 1, uma: 1, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5, seis: 6, sete: 7, oito: 8, nove: 9,
  dez: 10, onze: 11, doze: 12, treze: 13, quatorze: 14, catorze: 14, quinze: 15, dezesseis: 16,
  dezessete: 17, dezoito: 18, dezenove: 19, vinte: 20, trinta: 30, quarenta: 40, cinquenta: 50,
  sessenta: 60, setenta: 70, oitenta: 80, noventa: 90, cem: 100, cento: 100, duzentos: 200,
  duzentas: 200, trezentos: 300, quatrocentos: 400, quinhentos: 500, seiscentos: 600,
  setecentos: 700, oitocentos: 800, novecentos: 900,
}
const PALAVRAS_DE_DINHEIRO = ['real', 'reais', 'conto', 'contos', 'pila', 'pilas', 'mil']

// "trinta e cinco" → "35", "mil e duzentos" → "1200". "um"/"uma" sozinho é
// artigo ("um lanche"), só vira número se vier antes de reais/mil/conto.
function numerosPorExtenso(texto: string): string {
  const tks = texto.split(/\s+/)
  const saida: string[] = []
  let i = 0
  while (i < tks.length) {
    const w = semAcento(tks[i]).replace(/[.,!?;:]+$/, '')
    if (!(w in UNIDADES) && w !== 'mil') { saida.push(tks[i]); i++; continue }
    let total = 0, atual = 0, j = i, usadas = 0
    while (j < tks.length) {
      const p = semAcento(tks[j]).replace(/[.,!?;:]+$/, '')
      if (p === 'mil') { total += (atual || 1) * 1000; atual = 0 }
      else if (p in UNIDADES) atual += UNIDADES[p]
      else if (p === 'e' && usadas > 0 && j + 1 < tks.length) {
        const prox = semAcento(tks[j + 1]).replace(/[.,!?;:]+$/, '')
        if (!(prox in UNIDADES) && prox !== 'mil') break
      } else break
      if (p !== 'e') usadas++
      j++
    }
    const seguinte = semAcento(tks[j] || '').replace(/[.,!?;:]+$/, '')
    if (usadas === 1 && (w === 'um' || w === 'uma') && !PALAVRAS_DE_DINHEIRO.includes(seguinte)) {
      saida.push(tks[i]); i++; continue
    }
    saida.push(String(total + atual))
    i = j
  }
  return saida.join(' ')
}

// Palavras de fala que não são a descrição do gasto
const ENCHIMENTO = new Set(['gastei', 'paguei', 'comprei', 'foi', 'foram', 'deu', 'dei', 'botei', 'coloquei',
  ...GATILHOS_ENTRADA, 'referente', 'ref',
  'no', 'na', 'nos', 'nas', 'em', 'de', 'do', 'da', 'dos', 'das', 'com', 'pra', 'para', 'pro', 'o', 'a', 'os', 'as',
  'um', 'uma', 'e', 'hoje', 'agora', 'ai', 'la', 'so'])
const MOEDA = new Set(['real', 'reais', 'conto', 'contos', 'pila', 'pilas', 'centavo', 'centavos'])

function limparDescricao(palavras: string[]): string {
  const p = palavras.filter((w) => !MOEDA.has(semAcento(w)))
  while (p.length && ENCHIMENTO.has(semAcento(p[0]))) p.shift()
  while (p.length && ENCHIMENTO.has(semAcento(p[p.length - 1]))) p.pop()
  return p.join(' ')
}

function prepararFala(texto: string): string {
  let t = numerosPorExtenso(texto)
  // "35 reais e 50 centavos" → "35,50"
  t = t.replace(/(\d+)\s*(reais|real|contos?)\s*e\s*(\d{1,2})\s*centavos?/gi,
    (_m, r, _u, c) => `${r},${String(c).padStart(2, '0')}`)
  return t
}

function interpretar(texto: string): Gasto | null {
  // "R$ 45" vira "R$45" pra ficar num token só; pontuação de fim de palavra sai
  const tokens = prepararFala(texto).replace(/r\$\s+/gi, 'R$').split(/\s+/)
    .map((t) => t.replace(/[.,!?;:"“”]+$/, '').replace(/^["“”]+/, ''))
    .filter(Boolean)

  // Entrada: começa com "+" ou com recebi/entrou/ganhei/caiu...
  let tipo: Tipo = 'gasto'
  if (tokens[0]?.startsWith('+')) {
    tipo = 'entrada'
    tokens[0] = tokens[0].slice(1)
    if (!tokens[0]) tokens.shift()
  } else if (tokens[0] && GATILHOS_ENTRADA.includes(semAcento(tokens[0]))) {
    tipo = 'entrada'
  }
  const nomesCat = tipo === 'entrada' ? NOMES_CATEGORIA_ENTRADA : NOMES_CATEGORIA

  let valor: number | null = null
  let catForcada: string | null = null
  let data = hojeISO()
  const resto: string[] = []
  for (const tk of tokens) {
    const v = valor === null ? lerValor(tk) : null
    if (v !== null) { valor = v; continue }
    if (tk.startsWith('#') && tk.length > 1) {
      const alvo = semAcento(tk.slice(1))
      catForcada = nomesCat.find((c) => semAcento(c).startsWith(alvo)) || null
      if (catForcada) continue
    }
    const sa = semAcento(tk)
    if (sa === 'ontem') { data = hojeISO(-1); continue }
    if (sa === 'anteontem') { data = hojeISO(-2); continue }
    resto.push(tk)
  }
  if (valor === null) return null
  const descricao = limparDescricao(resto) || 'sem descrição'
  return { tipo, valor, descricao, categoria: catForcada || categorizar(descricao, tipo), data }
}

async function responder(chatId: number | string, texto: string) {
  if (!BOT_TOKEN) { console.error('TELEGRAM_GASTOS_BOT_TOKEN não configurado'); return }
  if (!BOT_TOKEN.includes(':')) console.error('TELEGRAM_GASTOS_BOT_TOKEN incompleto: falta o "número:" do início')
  try {
    const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: texto, parse_mode: 'HTML' }),
    })
    if (!res.ok) console.error('Telegram recusou a resposta:', res.status, await res.text())
  } catch (e) {
    console.error('Falha ao responder no Telegram:', e)
  }
}

// Baixa o áudio do Telegram e manda pro Groq (Whisper) transcrever
async function transcrever(fileId: string): Promise<string> {
  if (!GROQ_KEY) throw new Error('GROQ_API_KEY não configurado')
  const info = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getFile?file_id=${encodeURIComponent(fileId)}`)
    .then((r) => r.json())
  const caminho = info?.result?.file_path
  if (!caminho) throw new Error('Telegram não devolveu o arquivo: ' + JSON.stringify(info))
  const audio = await fetch(`https://api.telegram.org/file/bot${BOT_TOKEN}/${caminho}`).then((r) => r.blob())

  const form = new FormData()
  form.append('file', audio, 'audio.ogg')
  form.append('model', 'whisper-large-v3-turbo')
  form.append('language', 'pt')
  form.append('response_format', 'json')
  // Dica de estilo: puxa o Whisper a escrever valores em algarismos
  form.append('prompt', 'Gastei 35 reais no mercado. Uber 23,90. Paguei 120 de luz.')

  const res = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${GROQ_KEY}` },
    body: form,
  })
  if (!res.ok) throw new Error(`Groq ${res.status}: ${await res.text()}`)
  const { text } = await res.json()
  return String(text || '').trim()
}

const AJUDA = [
  '<b>Como usar</b>',
  '• <code>45 mercado</code> — registra o gasto',
  '• <code>recebi 3000 pró-labore</code> ou <code>+500 freela</code> — registra entrada',
  '• <code>uber 23,90 ontem</code> — lança no dia anterior',
  '• <code>120 presente #lazer</code> — força a categoria',
  '• <code>apagar</code> — apaga o último',
  '• <code>hoje</code> — lançamentos de hoje',
  '• <code>resumo</code> — entrou, saiu, saldo e gastos por categoria',
  '• 🎤 áudio também vale: "gastei trinta e cinco no mercado"',
  '',
  'Gastos: ' + NOMES_CATEGORIA.join(', '),
  'Entradas: ' + NOMES_CATEGORIA_ENTRADA.join(', '),
].join('\n')

// Entrou × saiu no mês que começa em `inicio` (AAAA-MM-01)
async function saldoDoMes(supabase: any, inicio: string) {
  const [a, m] = inicio.split('-').map(Number)
  const fim = m === 12 ? `${a + 1}-01-01` : `${a}-${String(m + 1).padStart(2, '0')}-01`
  const { data } = await supabase.from('gastos_pessoais')
    .select('valor, tipo, categoria').eq('user_id', USER_ID).gte('data', inicio).lt('data', fim)
  let entrou = 0, saiu = 0
  const porCat: Record<string, number> = {}
  for (const g of data || []) {
    const v = Number(g.valor)
    if (g.tipo === 'entrada') entrou += v
    else { saiu += v; porCat[g.categoria] = (porCat[g.categoria] || 0) + v }
  }
  return { entrou, saiu, saldo: entrou - saiu, porCat }
}

const linhaSaldo = (s: { entrou: number; saiu: number; saldo: number }) =>
  `Mês: entrou ${brl(s.entrou)} · saiu ${brl(s.saiu)} · ` +
  (s.saldo >= 0 ? `<b>sobrou ${brl(s.saldo)}</b>` : `<b>faltou ${brl(-s.saldo)}</b>`)

const ok = () => new Response('ok', { status: 200 })

serve(async (req) => {
  if (req.method !== 'POST') return ok()

  // Só aceita chamadas do Telegram (header configurado no setWebhook)
  if (!SEGREDO || req.headers.get('x-telegram-bot-api-secret-token') !== SEGREDO) {
    return new Response('forbidden', { status: 403 })
  }

  let update: any
  try { update = await req.json() } catch { return ok() }

  const msg = update?.message
  let texto: string = (msg?.text || '').trim()
  const chatId = msg?.chat?.id
  if (!msg || !chatId) return ok()

  // Primeira configuração: ainda não sabemos seu chat_id
  if (!CHAT_ID) {
    await responder(chatId, `Seu chat_id é <code>${chatId}</code>.\nColoque no segredo TELEGRAM_GASTOS_CHAT_ID e me mande de novo.`)
    return ok()
  }
  // Qualquer outra pessoa que achar o bot é ignorada em silêncio
  if (String(chatId) !== CHAT_ID) {
    console.warn(`Mensagem ignorada: chat_id ${chatId} não é o configurado (termina em ...${CHAT_ID.slice(-3)})`)
    return ok()
  }

  if (!USER_ID) {
    await responder(chatId, 'Falta o segredo GASTOS_USER_ID (seu id aparece na página /admin/financas).')
    return ok()
  }
  // Áudio (gravado ou arquivo) → texto
  let ouvi = ''
  const midia = msg.voice || msg.audio
  if (!texto && midia) {
    if ((midia.duration || 0) > 60) {
      await responder(chatId, 'Áudio muito longo. Manda um gasto por áudio, curtinho 🙂')
      return ok()
    }
    try {
      texto = await transcrever(midia.file_id)
    } catch (e) {
      console.error('Falha ao transcrever:', e)
      await responder(chatId, '⚠️ Não consegui ouvir o áudio. Manda por texto: <code>45 mercado</code>')
      return ok()
    }
    if (!texto) {
      await responder(chatId, 'Não entendi nada no áudio. Tenta de novo ou manda por texto.')
      return ok()
    }
    ouvi = `🎤 <i>"${texto.replace(/[<>&]/g, '')}"</i>\n`
  }

  if (!texto) {
    await responder(chatId, 'Mande texto ou áudio. Ex.: <code>45 mercado</code>')
    return ok()
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY)
  const comando = semAcento(texto).replace(/^\//, '').replace(/[.,!?]+$/, '').split(/[\s@.,!?]/)[0]

  try {
    if (['start', 'ajuda', 'help'].includes(comando)) {
      await responder(chatId, AJUDA)
      return ok()
    }

    if (['apagar', 'desfazer', 'excluir'].includes(comando)) {
      const { data: ultimo } = await supabase.from('gastos_pessoais')
        .select('id, valor, descricao, tipo').eq('user_id', USER_ID)
        .order('created_at', { ascending: false }).limit(1).maybeSingle()
      if (!ultimo) { await responder(chatId, 'Não tem nada pra apagar.'); return ok() }
      await supabase.from('gastos_pessoais').delete().eq('id', ultimo.id)
      const oque = ultimo.tipo === 'entrada' ? 'entrada' : 'gasto'
      await responder(chatId, `🗑️ Apagado (${oque}): ${brl(Number(ultimo.valor))} · ${ultimo.descricao}`)
      return ok()
    }

    if (comando === 'resumo' || comando === 'mes') {
      const s = await saldoDoMes(supabase, hojeISO().slice(0, 8) + '01')
      if (!s.entrou && !s.saiu) { await responder(chatId, 'Nada lançado neste mês ainda.'); return ok() }
      const linhas = Object.entries(s.porCat).sort((a, b) => b[1] - a[1])
        .map(([c, v]) => `• ${c}: ${brl(v)} (${Math.round((v / s.saiu) * 100)}%)`)
      await responder(chatId, [
        '📊 <b>Mês até agora</b>',
        `💰 Entrou: ${brl(s.entrou)}`,
        `💸 Saiu: ${brl(s.saiu)}`,
        s.saldo >= 0 ? `✅ <b>Sobrou: ${brl(s.saldo)}</b>` : `🔴 <b>Faltou: ${brl(-s.saldo)}</b>`,
        ...(linhas.length ? ['', '<b>Gastos por categoria</b>', ...linhas] : []),
      ].join('\n'))
      return ok()
    }

    if (comando === 'hoje') {
      const { data: lista } = await supabase.from('gastos_pessoais')
        .select('valor, descricao, tipo').eq('user_id', USER_ID).eq('data', hojeISO())
        .order('created_at')
      const saiu = (lista || []).filter((g) => g.tipo !== 'entrada').reduce((s, g) => s + Number(g.valor), 0)
      const entrou = (lista || []).filter((g) => g.tipo === 'entrada').reduce((s, g) => s + Number(g.valor), 0)
      await responder(chatId, lista?.length
        ? `📅 <b>Hoje: saiu ${brl(saiu)}</b>${entrou ? ` · entrou ${brl(entrou)}` : ''}\n` +
          lista.map((g) => `${g.tipo === 'entrada' ? '💰 +' : '• '}${brl(Number(g.valor))} · ${g.descricao}`).join('\n')
        : 'Nada lançado hoje.')
      return ok()
    }

    const gasto = interpretar(texto)
    if (!gasto) {
      await responder(chatId, ouvi + 'Não achei o valor. Manda assim: <code>45 mercado</code>\n(mande <code>ajuda</code> pra ver tudo)')
      return ok()
    }

    const { error } = await supabase.from('gastos_pessoais').insert({
      user_id: USER_ID, ...gasto, origem: 'telegram', telegram_message_id: msg.message_id,
    })
    if (error) {
      // 23505 = Telegram reenviou a mesma mensagem; já está gravada
      if (error.code === '23505') return ok()
      throw error
    }

    const inicio = gasto.data.slice(0, 8) + '01'
    const s = await saldoDoMes(supabase, inicio)
    const quando = gasto.data === hojeISO() ? '' : ` · ${gasto.data.split('-').reverse().slice(0, 2).join('/')}`
    const icone = gasto.tipo === 'entrada' ? '💰 +' : '✅ '

    await responder(chatId, ouvi +
      `${icone}${brl(gasto.valor)} · ${gasto.descricao} · <i>${gasto.categoria}</i>${quando}\n${linhaSaldo(s)}`)
  } catch (e) {
    console.error('telegram-gastos erro:', e)
    await responder(chatId, '⚠️ Deu erro ao gravar. Tenta de novo em instantes.')
  }
  return ok()
})
