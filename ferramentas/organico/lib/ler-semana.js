// Lê uma pasta de semana do Instagram e devolve os posts no formato que a
// edge function organico-importar espera.
//
// Pasta esperada (padrão do roteirista-reels):
//   Semana 02-08 nov\
//     02-seg-reel-dia5.mp4, 04-qua-carrossel-a-conta-01.png ...   (criativos do feed)
//     Stories\story-01-seg-enquete.png ...                         (artes dos stories)
//     Legendas\Legendas - Semana 02-08 nov.docx                    (fonte da verdade)
//
// No Word, cada dia começa com "Segunda, 2/11 · 10h", depois o título
// ("Reel ...", "Carrossel ...", "Post ...", "Só stories"), "Arquivo: ...",
// "Dica: ...", "LEGENDA" (texto + linha de hashtags), "TEXTO ALTERNATIVO" e
// "STORIES DO DIA" (uma tabela por story: Arte, Figurinha, Texto da figurinha,
// Opções ou botão, DM para quem responder, Depois). "Story 2 · 14h" antes da
// tabela dá o horário do story.
//
// Capa de reel (opcional): um arquivo "<nome-do-video>-capa.jpg" (ou .png) na mesma pasta.
'use strict'
const fs = require('fs')
const path = require('path')
const { lerArquivoDoZip } = require('./zip')

const EXT_VIDEO = ['.mp4', '.mov']
const EXT_IMAGEM = ['.png', '.jpg', '.jpeg', '.webp']
const CONTENT_TYPE = { '.mp4': 'video/mp4', '.mov': 'video/quicktime', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' }

const DIAS = { segunda: 1, terca: 2, quarta: 3, quinta: 4, sexta: 5, sabado: 6, domingo: 0 }

const semAcento = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '')

function decodificar(s) {
  return s
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&amp;/g, '&')
}

function textoParagrafo(xml) {
  let out = ''
  const re = /<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>|<w:tab\/>|<w:br\/>|<w:cr\/>/g
  let m
  while ((m = re.exec(xml))) {
    if (m[1] !== undefined) out += decodificar(m[1])
    else if (m[0] === '<w:tab/>') out += '\t'
    else out += '\n'
  }
  return out.trim()
}

// Sequência de blocos do corpo do Word: { p: 'texto' } ou { tabela: [[celula, celula], ...] }
function blocosDoDocx(caminhoDocx) {
  const xml = lerArquivoDoZip(caminhoDocx, 'word/document.xml').toString('utf8')
  const corpo = (xml.match(/<w:body>([\s\S]*)<\/w:body>/) || [])[1] || ''
  const blocos = []
  const re = /<w:tbl>[\s\S]*?<\/w:tbl>|<w:p[ >][\s\S]*?<\/w:p>/g
  let m
  while ((m = re.exec(corpo))) {
    const b = m[0]
    if (b.startsWith('<w:tbl>')) {
      const linhas = (b.match(/<w:tr[ >][\s\S]*?<\/w:tr>/g) || []).map((tr) =>
        (tr.match(/<w:tc>[\s\S]*?<\/w:tc>/g) || []).map((tc) =>
          (tc.match(/<w:p[ >][\s\S]*?<\/w:p>/g) || []).map(textoParagrafo).filter(Boolean).join('\n'),
        ),
      )
      blocos.push({ tabela: linhas })
    } else {
      const t = textoParagrafo(b)
      if (t) blocos.push({ p: t })
    }
  }
  return blocos
}

// "Semana 02-08 nov" / "Semana 28 out-01 nov"
const MESES = { jan: 1, fev: 2, mar: 3, abr: 4, mai: 5, jun: 6, jul: 7, ago: 8, set: 9, out: 10, nov: 11, dez: 12 }

const pad = (n) => String(n).padStart(2, '0')
const isoData = (a, m, d) => `${a}-${pad(m)}-${pad(d)}`

function segundaDaSemana(iso) {
  const d = new Date(`${iso}T12:00:00Z`)
  const dow = d.getUTCDay() // 0 = domingo
  d.setUTCDate(d.getUTCDate() - ((dow + 6) % 7))
  return d.toISOString().slice(0, 10)
}

const RE_DIA = /^(segunda|terca|quarta|quinta|sexta|sabado|domingo)(?:-feira)?\s*,\s*(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?(?:\s*[·•\-]\s*(\d{1,2})\s*h\s*(\d{2})?)?/i
const RE_STORY = /^story\s*(\d+)\s*(?:[·•\-]\s*(.*))?$/i

function tipoDoTitulo(titulo, arquivos) {
  const t = semAcento(titulo || '').toLowerCase()
  if (/^reel/.test(t)) return 'reel'
  if (/^carrossel/.test(t)) return 'carrossel'
  if (/^(post|foto|estatico)/.test(t)) return 'foto'
  if (arquivos.some((a) => EXT_VIDEO.includes(path.extname(a).toLowerCase()))) return 'reel'
  if (arquivos.length > 1) return 'carrossel'
  return 'foto'
}

// "Arquivo: 04-qua-carrossel-a-conta-01 a 06.png" -> [..-01.png ... ..-06.png]
// "Arquivo: Plano B: 05-qui-planoB-reel.mp4"      -> [05-qui-planoB-reel.mp4]
function nomesDoArquivo(linha) {
  let resto = linha.replace(/^arquivos?\s*:\s*/i, '').trim()
  if (resto.includes(':')) resto = resto.slice(resto.lastIndexOf(':') + 1).trim()
  const faixa = resto.match(/^(.*?)(\d+)\s+a\s+(\d+)(\.[a-z0-9]+)$/i)
  if (faixa) {
    const [, prefixo, ini, fim, ext] = faixa
    const largura = ini.length
    const out = []
    for (let n = Number(ini); n <= Number(fim); n++) out.push(`${prefixo}${String(n).padStart(largura, '0')}${ext}`)
    return out
  }
  return resto.split(/\s*(?:,|;|\|| e )\s*/).map((s) => s.trim()).filter((s) => /\.[a-z0-9]{3,4}$/i.test(s))
}

// Acha o arquivo na pasta ignorando maiúsculas e acentos.
function localizar(pastaSemana, relativo) {
  const direto = path.join(pastaSemana, relativo)
  if (fs.existsSync(direto)) return direto
  const partes = relativo.split(/[\\/]+/)
  let atual = pastaSemana
  for (const parte of partes) {
    if (!fs.existsSync(atual)) return null
    const alvo = semAcento(parte).toLowerCase()
    const achado = fs.readdirSync(atual).find((n) => semAcento(n).toLowerCase() === alvo)
    if (!achado) return null
    atual = path.join(atual, achado)
  }
  return atual
}

function lerSemana(pastaSemana, { ano } = {}) {
  const avisos = []
  const nomePasta = path.basename(pastaSemana)
  const pastaLeg = localizar(pastaSemana, 'Legendas')
  const docx = pastaLeg && fs.readdirSync(pastaLeg).find((n) => /\.docx$/i.test(n) && !n.startsWith('~$'))
  if (!docx) throw new Error(`Não achei o Word de legendas em "${path.join(pastaSemana, 'Legendas')}"`)
  const blocos = blocosDoDocx(path.join(pastaLeg, docx))

  const anoBase = Number(ano) || new Date().getFullYear()
  const dias = []
  let dia = null
  let modo = null
  let storyPendente = null

  const novoStory = (rotulo) => {
    const n = dia.stories.length + 1
    const hora = rotulo && rotulo.match(/(\d{1,2})\s*h\s*(\d{2})?/)
    return { n, rotulo: rotulo || '', hora: hora ? `${pad(hora[1])}:${hora[2] || '00'}` : null }
  }

  for (const b of blocos) {
    if (b.p !== undefined) {
      const t = b.p
      const tn = semAcento(t).toLowerCase()
      const md = semAcento(t).match(RE_DIA)
      if (md) {
        const d = Number(md[2]); const m = Number(md[3])
        const a = md[4] ? Number(md[4].length === 2 ? `20${md[4]}` : md[4]) : anoBase
        dia = {
          data: isoData(a, m, d),
          diaSemanaEsperado: DIAS[md[1].toLowerCase()],
          hora: md[5] ? `${pad(md[5])}:${md[6] || '00'}` : null,
          titulo: null, arquivos: [], dica: [], legenda: [], hashtags: [], alt: [], extras: [], stories: [],
        }
        dias.push(dia)
        modo = 'titulo'
        storyPendente = null
        continue
      }
      if (!dia) continue // cabeçalho do documento
      if (/^stories do dia/.test(tn)) { modo = 'stories'; continue }
      if (/^legenda\b/.test(tn) && t === t.toUpperCase()) { modo = 'legenda'; continue }
      if (/^texto alternativo/.test(tn)) { modo = 'alt'; continue }
      if (modo === 'stories') {
        const ms = t.match(RE_STORY)
        if (ms) storyPendente = novoStory(ms[2] || '')
        else if (dia.stories.length) {
          const ult = dia.stories[dia.stories.length - 1]
          ult.depois = [ult.depois, t].filter(Boolean).join('\n')
        }
        continue
      }
      if (/^arquivos?\s*:/i.test(t)) { dia.arquivos.push(...nomesDoArquivo(t)); continue }
      if (/^dica\s*:/i.test(t)) { dia.dica.push(t.replace(/^dica\s*:\s*/i, '')); continue }
      if (modo === 'titulo' && !dia.titulo) { dia.titulo = t; continue }
      if (modo === 'legenda') {
        if (/^#/.test(t)) dia.hashtags.push(t)
        else dia.legenda.push(t)
        continue
      }
      if (modo === 'alt') { dia.alt.push(t); continue }
      dia.extras.push(t)
    } else if (b.tabela && dia) {
      const s = storyPendente || novoStory('')
      storyPendente = null
      for (const linha of b.tabela) {
        if (linha.length < 2) continue
        const chave = semAcento(linha[0]).toLowerCase().trim()
        const valor = linha.slice(1).join('\n').trim()
        const v = valor === '—' || valor === '-' ? '' : valor
        if (chave.startsWith('arte')) s.arte = v
        else if (chave.startsWith('figurinha')) s.figurinha = v
        else if (chave.startsWith('texto da figurinha')) s.texto_figurinha = v
        else if (chave.startsWith('opcoes')) s.opcoes = v
        else if (chave.startsWith('dm')) s.dm = v
        else if (chave.startsWith('depois')) s.depois = v
      }
      dia.stories.push(s)
    }
  }
  if (!dias.length) throw new Error('Nenhum dia encontrado no Word (esperava linhas como "Segunda, 2/11 · 10h").')

  // Virada de ano (semana de dezembro para janeiro).
  const meses = dias.map((d) => Number(d.data.slice(5, 7)))
  if (meses.includes(12) && meses.includes(1)) {
    for (const d of dias) if (d.data.slice(5, 7) === '01') d.data = `${Number(d.data.slice(0, 4)) + 1}${d.data.slice(4)}`
  }
  for (const d of dias) {
    const dow = new Date(`${d.data}T12:00:00Z`).getUTCDay()
    if (dow !== d.diaSemanaEsperado) avisos.push(`${d.data}: o Word diz um dia da semana diferente da data (confira o ano com --ano).`)
  }

  const semanaInicio = segundaDaSemana(dias.map((d) => d.data).sort()[0])
  const usados = new Set()
  const posts = []

  const arquivo = (relativo, tipo, ordem, contexto) => {
    const local = localizar(pastaSemana, relativo)
    if (!local) { avisos.push(`${contexto}: arquivo "${relativo}" não está na pasta.`); return null }
    usados.add(path.resolve(local))
    const ext = path.extname(local).toLowerCase()
    return {
      local,
      nome_relativo: path.relative(pastaSemana, local).split(path.sep).join('/'),
      tipo,
      ordem,
      tamanho_bytes: fs.statSync(local).size,
      content_type: CONTENT_TYPE[ext] || 'application/octet-stream',
    }
  }

  for (const d of dias) {
    const soStories = d.titulo && /^so stories/.test(semAcento(d.titulo).toLowerCase())
    if (d.titulo && !soStories) {
      const tipo = tipoDoTitulo(d.titulo, d.arquivos)
      const arqs = []
      d.arquivos.forEach((nome, i) => {
        const ext = path.extname(nome).toLowerCase()
        const a = arquivo(nome, EXT_VIDEO.includes(ext) ? 'video' : 'imagem', i + 1, `${d.data} ${d.titulo}`)
        if (a) arqs.push(a)
      })
      if (tipo === 'reel') {
        const video = arqs.find((a) => a.tipo === 'video')
        if (video) {
          const base = video.nome_relativo.replace(/\.[^.]+$/, '')
          for (const ext of ['.jpg', '.jpeg', '.png']) {
            const local = localizar(pastaSemana, `${base}-capa${ext}`)
            if (local) { arqs.push(arquivo(`${base}-capa${ext}`, 'capa', 99, d.data)); break }
          }
        }
      }
      if (!d.arquivos.length) avisos.push(`${d.data} ${d.titulo}: sem linha "Arquivo:" no Word.`)
      if (!d.legenda.length) avisos.push(`${d.data} ${d.titulo}: sem LEGENDA no Word.`)
      if (!d.hora) avisos.push(`${d.data} ${d.titulo}: sem horário (não dá para publicar sozinho).`)
      posts.push({
        chave: `${d.data}|feed|1`,
        tipo,
        ordem: 1,
        data: d.data,
        hora: d.hora,
        titulo: d.titulo,
        legenda: d.legenda.join('\n\n') || null,
        hashtags: d.hashtags.join(' ') || null,
        texto_alt: d.alt.join('\n\n') || null,
        dica: [...d.dica, ...d.extras].join('\n') || null,
        arquivos: arqs,
      })
    }
    for (const s of d.stories) {
      const arqs = []
      if (s.arte) {
        const ext = path.extname(s.arte).toLowerCase()
        const a = arquivo(s.arte, EXT_VIDEO.includes(ext) ? 'video' : 'imagem', 1, `${d.data} story ${s.n}`)
        if (a) arqs.push(a)
      }
      posts.push({
        chave: `${d.data}|story|${s.n}`,
        tipo: 'story',
        ordem: s.n,
        data: d.data,
        hora: s.hora,
        titulo: `Story ${s.n}${s.figurinha ? ` · ${s.figurinha}` : ''}`,
        story: {
          rotulo: s.rotulo || '',
          figurinha: s.figurinha || '',
          texto_figurinha: s.texto_figurinha || '',
          opcoes: s.opcoes || '',
          dm: s.dm || '',
          depois: s.depois || '',
          arte: s.arte || '',
        },
        arquivos: arqs,
      })
    }
  }

  // Criativos da pasta que o Word não cita (versões antigas, extras).
  const sobras = []
  const varrer = (pasta) => {
    for (const n of fs.readdirSync(pasta)) {
      const full = path.join(pasta, n)
      const st = fs.statSync(full)
      if (st.isDirectory()) { if (!/^legendas$/i.test(n)) varrer(full); continue }
      const ext = path.extname(n).toLowerCase()
      if ([...EXT_VIDEO, ...EXT_IMAGEM].includes(ext) && !usados.has(path.resolve(full))) {
        sobras.push(path.relative(pastaSemana, full))
      }
    }
  }
  varrer(pastaSemana)

  return { semana: { inicio: semanaInicio, nome: nomePasta }, posts, avisos, sobras, docx: path.join(pastaLeg, docx) }
}

module.exports = { lerSemana, nomesDoArquivo, blocosDoDocx }
