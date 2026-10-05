// Temas e fontes do "link na bio" da academia.
// Cada tema já traz fundo, cor do botão de destaque, cards e texto combinando e
// com contraste legível, então o cliente só escolhe a bolinha.
// O tema 'marca' deriva tudo da cor principal que o cliente já tem no site.

export const FONTES_BIO = [
  { id: 'inter',      label: 'Inter',      stack: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif", google: 'Inter:wght@400;500;600;700;800;900' },
  { id: 'poppins',    label: 'Poppins',    stack: "'Poppins', sans-serif",                                   google: 'Poppins:wght@400;500;600;700;800' },
  { id: 'montserrat', label: 'Montserrat', stack: "'Montserrat', sans-serif",                                google: 'Montserrat:wght@400;500;600;700;800' },
  { id: 'oswald',     label: 'Oswald',     stack: "'Oswald', sans-serif",                                    google: 'Oswald:wght@400;500;600;700' },
  { id: 'bebas',      label: 'Bebas Neue', stack: "'Bebas Neue', sans-serif",                                google: 'Bebas+Neue' },
  { id: 'playfair',   label: 'Playfair',   stack: "'Playfair Display', serif",                               google: 'Playfair+Display:wght@500;600;700;800' }
]

export const FONTE_PADRAO = 'inter'
export const TEMA_PADRAO = 'marca'

export const getFonteBio = (id) => FONTES_BIO.find(f => f.id === id) || FONTES_BIO[0]

// Carrega as fontes do Google sob demanda (Inter sempre: os botões a usam)
export function carregarFontesBio(ids) {
  if (typeof document === 'undefined') return
  const todas = new Set(['inter', ...ids.filter(Boolean)])
  todas.forEach(id => {
    const f = FONTES_BIO.find(x => x.id === id)
    if (!f) return
    const elId = 'bio-font-' + f.id
    if (document.getElementById(elId)) return
    const link = document.createElement('link')
    link.id = elId
    link.rel = 'stylesheet'
    link.href = `https://fonts.googleapis.com/css2?family=${f.google}&display=swap`
    document.head.appendChild(link)
  })
}

// ---------- utilidades de cor ----------

function rgb(hex) {
  const h = String(hex || '').replace('#', '')
  if (h.length !== 6) return [52, 72, 72]
  return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16))
}

function paraHex([r, g, b]) {
  return '#' + [r, g, b].map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('')
}

export function misturar(a, b, p) {
  const A = rgb(a), B = rgb(b)
  return paraHex(A.map((v, i) => v + (B[i] - v) * p))
}

export function luminancia(hex) {
  const [r, g, b] = rgb(hex)
  return (r * 299 + g * 587 + b * 114) / 1000
}

// Texto legível sobre uma cor
export function textoSobre(hex) {
  return luminancia(hex) > 150 ? '#18181b' : '#ffffff'
}

// ---------- temas ----------

// escuro: texto claro sobre fundo escuro. cards translúcidos ganham desfoque.
const ESCURO = { texto: '#ffffff', textoSuave: 'rgba(255,255,255,0.74)', card: 'rgba(255,255,255,0.10)', cardBorda: 'rgba(255,255,255,0.18)', cardTexto: '#ffffff' }
const CLARO = { texto: '#18181b', textoSuave: '#52525b', card: '#ffffff', cardBorda: 'rgba(0,0,0,0.07)', cardTexto: '#18181b' }

export const TEMAS_FIXOS = [
  { id: 'noite',   nome: 'Noite',   fundo: ['#0b1220', '#1e293b'], destaque: '#22c55e', destaqueTexto: '#052e16', ...ESCURO },
  { id: 'fogo',    nome: 'Fogo',    fundo: ['#1a0707', '#7f1d1d'], destaque: '#f97316', destaqueTexto: '#1c0a02', ...ESCURO },
  { id: 'oceano',  nome: 'Oceano',  fundo: ['#082f49', '#0369a1'], destaque: '#ffffff', destaqueTexto: '#082f49', ...ESCURO },
  { id: 'roxo',    nome: 'Roxo',    fundo: ['#1e0a4a', '#6d28d9'], destaque: '#fde047', destaqueTexto: '#2e1065', ...ESCURO },
  { id: 'areia',   nome: 'Areia',   fundo: ['#fbf3e4', '#f1d9ae'], destaque: '#1c1917', destaqueTexto: '#ffffff', ...CLARO },
  { id: 'rosa',    nome: 'Rosa',    fundo: ['#fff1f2', '#fda4af'], destaque: '#e11d48', destaqueTexto: '#ffffff', ...CLARO }
]

// Tema derivado da cor principal do cliente
export function temaDaMarca(cor) {
  const base = cor || '#344848'
  const escuro = luminancia(base) < 150
  const claroBase = !escuro
  // fundo sempre escuro, tingido pela cor da marca
  const f1 = misturar(base, '#000000', claroBase ? 0.82 : 0.78)
  const f2 = misturar(base, '#000000', claroBase ? 0.5 : 0.35)
  // destaque: a própria cor se tiver brilho; marca escura vira botão branco
  // (uma versão clara de uma cor escura sai acinzentada)
  const brilhante = luminancia(base) > 90
  const destaque = brilhante ? base : '#ffffff'
  const destaqueTexto = brilhante ? textoSobre(base) : misturar(base, '#000000', 0.45)
  return {
    id: 'marca', nome: 'Minha cor', fundo: [f1, f2],
    destaque, destaqueTexto, ...ESCURO
  }
}

export function resolverTema(id, corMarca) {
  if (id && id !== 'marca') {
    const t = TEMAS_FIXOS.find(x => x.id === id)
    if (t) return t
  }
  return temaDaMarca(corMarca)
}

export function todosOsTemas(corMarca) {
  return [temaDaMarca(corMarca), ...TEMAS_FIXOS]
}

// ---------- mídia ----------

const EXT_VIDEO = /\.(mp4|webm|mov|m4v)(\?.*)?$/i

export function youtubeId(url) {
  if (!url) return null
  const m = String(url).match(/(?:youtube\.com\/watch\?(?:.*&)?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/)
  return m ? m[1] : null
}

export function tipoDaMidia(url) {
  if (youtubeId(url)) return 'youtube'
  if (EXT_VIDEO.test(String(url || ''))) return 'video'
  return 'foto'
}

// ---------- configuração ----------

export const BIO_PADRAO = {
  tema: TEMA_PADRAO,
  fonte: FONTE_PADRAO,
  frase: undefined,
  redes: {},
  links: [],
  midias: undefined,
  mostrar: {}
}

// A bio está no ar? Ligada de propósito no editor (bio.publicada) ou, pra quem nunca mexeu,
// herda o estado do site. A edge landing-dados (modo=bio) aplica a mesma regra.
export const bioPublicada = (bio, landingAtivo) =>
  bio && typeof bio.publicada === 'boolean' ? bio.publicada : !!landingAtivo

const pegar = (obj, chave, fallback) => (obj && chave in obj ? obj[chave] : fallback)

// Junta o que o cliente configurou na bio com o que já tinha preenchido no site,
// para quem já tem site não precisar digitar nada de novo.
export function resolverBio(empresa, bio) {
  const b = bio || {}
  const redesSalvas = b.redes || {}
  const redes = {
    instagram: pegar(redesSalvas, 'instagram', empresa.instagram_url) || '',
    tiktok: pegar(redesSalvas, 'tiktok', empresa.tiktok_url) || '',
    facebook: pegar(redesSalvas, 'facebook', empresa.facebook_url) || '',
    youtube: pegar(redesSalvas, 'youtube', empresa.youtube_url) || '',
    site: pegar(redesSalvas, 'site', empresa.site) || ''
  }
  const galeria = Array.isArray(empresa.galeria) ? empresa.galeria.filter(Boolean) : []
  const midias = Array.isArray(b.midias)
    ? b.midias.filter(m => m && m.url)
    : galeria.map(url => ({ tipo: 'foto', url }))
  const mostrar = b.mostrar || {}
  // capa: se o cliente escolheu uma na bio (ou removeu: ''), vale; senão herda a do site
  const primeiraFoto = midias.find(m => (m.tipo || tipoDaMidia(m.url)) === 'foto')?.url || ''
  const capa = 'capa' in b ? (b.capa || '') : (empresa.foto_capa_url || primeiraFoto)
  return {
    capa,
    tema: b.tema || TEMA_PADRAO,
    fonte: b.fonte || FONTE_PADRAO,
    frase: pegar(b, 'frase', (empresa.hero_subtitulo || empresa.descricao || '').trim()) || '',
    redes,
    links: Array.isArray(b.links) ? b.links.filter(l => l && l.titulo && l.url) : [],
    midias,
    mostrar: {
      agendar: mostrar.agendar !== false,
      whatsapp: mostrar.whatsapp !== false,
      mapa: mostrar.mapa !== false
    }
  }
}
