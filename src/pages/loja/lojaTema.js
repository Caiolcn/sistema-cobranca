import { FUNCTIONS_URL, SUPABASE_ANON_KEY } from '../../supabaseClient'
import { resolverTema, getFonteBio, resolverBio, TEMA_PADRAO, FONTE_PADRAO, luminancia, misturar, textoSobre } from '../../data/bioTemas'

// Utilidades da Loja pública (/loja/:slug): chamadas às edge functions,
// aparência (tema claro de loja por padrão; pode herdar a bio ou usar tema
// próprio), formatação e o `montarEmpresaPreview` que o editor usa.

export const headersPublicos = {
  'Content-Type': 'application/json',
  'apikey': SUPABASE_ANON_KEY,
  'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
}

async function chamar(url, opts = {}) {
  const res = await fetch(url, { headers: headersPublicos, ...opts })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) {
    const e = new Error(json.error || 'Algo deu errado. Tente de novo.')
    e.code = json.code || `http_${res.status}`
    e.status = res.status
    e.extra = json
    throw e
  }
  return json
}

export const lojaApi = {
  vitrine: (slug) => chamar(`${FUNCTIONS_URL}/loja-dados?slug=${encodeURIComponent(slug)}`),
  item: (slug, produtoId) => chamar(`${FUNCTIONS_URL}/loja-dados?slug=${encodeURIComponent(slug)}&produto=${encodeURIComponent(produtoId)}`),
  turmas: (slug, produtoId) => chamar(`${FUNCTIONS_URL}/loja-dados?slug=${encodeURIComponent(slug)}&produto=${encodeURIComponent(produtoId)}&turmas=1`),
  comprar: (body) => chamar(`${FUNCTIONS_URL}/loja-comprar`, { method: 'POST', body: JSON.stringify(body) }),
  pagar: (token, metodo) => chamar(`${FUNCTIONS_URL}/loja-pagar`, { method: 'POST', body: JSON.stringify({ token, metodo }) }),
  status: (token, force = false) => chamar(`${FUNCTIONS_URL}/loja-pedido-status?token=${encodeURIComponent(token)}${force ? '&force=1' : ''}`),
  escolherTurma: (token, aulaIds) => chamar(`${FUNCTIONS_URL}/loja-escolher-turma`, { method: 'POST', body: JSON.stringify({ token, aula_ids: aulaIds }) }),
}

// ---------- aparência ----------

// Tema CLARO de loja, derivado da cor da marca. Mesmas chaves do tema da bio
// (fundo, card, destaque...) para item e pedido funcionarem com qualquer um,
// mais alguns tokens só da loja (claro, erro, aviso*, sutil, header).
export function temaLojaClaro(cor) {
  const base = cor || '#344848'
  // destaque precisa segurar texto branco; marca muito clara escurece um pouco
  const destaque = luminancia(base) > 170 ? misturar(base, '#000000', 0.35) : base
  return {
    id: 'claro', nome: 'Loja clara', claro: true,
    fundo: ['#f6f7f9', '#f6f7f9'],
    header: 'rgba(246,247,249,0.92)',
    card: '#ffffff', cardBorda: 'rgba(17,24,39,0.09)', cardTexto: '#111827',
    sutil: '#eef0f3',
    texto: '#111827', textoSuave: '#5b6472',
    destaque, destaqueTexto: textoSobre(destaque),
    destaqueSuave: misturar(destaque, '#ffffff', 0.88),
    erro: '#b91c1c', avisoBg: '#fffbeb', avisoBorda: '#fde68a', avisoTexto: '#92400e',
    sombra: '0 1px 2px rgba(17,24,39,0.05), 0 8px 24px -16px rgba(17,24,39,0.25)',
  }
}

// A loja é sempre clara. O "tema" escolhido (mesma lista de bolinhas da bio) só
// define a COR de destaque: 'marca' usa a cor da marca; os temas fixos usam a
// cor de destaque deles, ou a cor de fundo quando o destaque é claro demais
// para segurar texto branco (oceano = branco, roxo = amarelo).
export function corDaLoja(temaBio, corMarca) {
  if (!temaBio || temaBio.id === 'marca') return corMarca || '#344848'
  return luminancia(temaBio.destaque) > 170 ? temaBio.fundo[1] : temaBio.destaque
}

export function resolverAparenciaLoja(empresa) {
  const ap = empresa?.loja?.aparencia || {}
  const bio = resolverBio(empresa || {}, empresa?.bio || {})
  const corMarca = empresa?.cor_primaria
  const temaEscolhido = resolverTema(ap.tema || TEMA_PADRAO, corMarca)
  const tema = temaLojaClaro(corDaLoja(temaEscolhido, corMarca))
  const fonteId = ap.fonte || bio.fonte || FONTE_PADRAO

  return {
    estilo: 'claro',
    tema,
    fonte: getFonteBio(fonteId),
    fonteId,
    capa: bio.capa || empresa?.foto_capa_url || '',
    frase: empresa?.loja?.frase || bio.frase || '',
    titulo: empresa?.loja?.titulo || empresa?.nome_empresa || 'Loja',
  }
}

// ---------- seções da página ----------

export const PASSOS_PADRAO = [
  'Escolha o plano ou o produto',
  'Preencha seus dados e pague por Pix ou cartão',
  'Pronto: você já é aluno e escolhe seu horário',
]

// Espelho de normalizarSecoes() em supabase/functions/_shared/loja.ts
export function normalizarSecoes(raw) {
  const s = (raw && typeof raw === 'object') ? raw : {}
  const lista = (v, n) => (Array.isArray(v) ? v.slice(0, n) : [])
  return {
    como_funciona: s.como_funciona !== false,
    passos: [0, 1, 2].map((i) => String(s.passos?.[i] || '').trim()),
    resultados: s.resultados !== false,
    depoimentos: s.depoimentos !== false,
    depoimentos_manuais: lista(s.depoimentos_manuais, 3).filter((d) => d && d.texto),
    horarios: s.horarios !== false,
    faq: s.faq !== false,
    faq_itens: lista(s.faq_itens, 6).filter((f) => f && f.pergunta && f.resposta),
    sobre: s.sobre !== false,
    chamada_final: s.chamada_final !== false,
    chamada_titulo: String(s.chamada_titulo || '').trim(),
    chamada_texto: String(s.chamada_texto || '').trim(),
  }
}

// Conteúdo das seções para o PREVIEW do editor, a partir da linha de `usuarios`
// (espelho de conteudoHerdado() + montagem de `secoes` em loja-dados, sem NPS nem grade).
export function montarSecoesPreview(userRow = {}, lojaConfig) {
  const cfg = lojaConfig || userRow.loja_config || {}
  const sec = normalizarSecoes(cfg.secoes)
  const bio = userRow.bio_config && typeof userRow.bio_config === 'object' ? userRow.bio_config : {}
  const midias = Array.isArray(bio.midias) ? bio.midias : null
  const galeriaBio = midias ? midias.filter((m) => m && m.url && (m.tipo || 'foto') === 'foto').map((m) => m.url) : null
  const galeria = (galeriaBio && galeriaBio.length ? galeriaBio : (Array.isArray(userRow.landing_galeria) ? userRow.landing_galeria : [])).filter(Boolean).slice(0, 8)
  const faqHerdado = (Array.isArray(userRow.landing_faq) ? userRow.landing_faq : [])
    .filter((f) => f && (f.pergunta || f.q) && (f.resposta || f.a))
    .map((f) => ({ pergunta: f.pergunta || f.q, resposta: f.resposta || f.a })).slice(0, 6)
  const manuaisHerdados = (Array.isArray(userRow.landing_depoimentos_manuais) ? userRow.landing_depoimentos_manuais : [])
    .filter((d) => d && d.comentario)
    .map((d) => ({ nome: d.nome || 'Aluno(a)', texto: d.comentario, nota: d.nota || null })).slice(0, 3)
  const manuais = sec.depoimentos_manuais.length ? sec.depoimentos_manuais : manuaisHerdados
  return {
    aulas: [],
    avaliacao: null,
    galeria,
    faq: sec.faq_itens.length ? sec.faq_itens : faqHerdado,
    depoimentos: manuais.map((d) => ({ nome: d.nome || 'Aluno(a)', comentario: d.texto, nota: d.nota || null })),
    cta_titulo: sec.chamada_titulo || userRow.landing_cta_final_titulo || null,
    cta_texto: sec.chamada_texto || userRow.landing_cta_final_subtitulo || null,
  }
}

// Monta o objeto `empresa` público a partir da linha de `usuarios` (editor/preview).
// Espelha empresaPublica() em supabase/functions/_shared/loja.ts.
export function montarEmpresaPreview({ userRow = {}, bioConfig, lojaConfig }) {
  const cfg = lojaConfig || userRow.loja_config || {}
  const partes = [userRow.endereco, userRow.numero, userRow.bairro, userRow.cidade, userRow.estado].filter(Boolean)
  return {
    nome_empresa: userRow.nome_empresa || 'Minha academia',
    logo_url: userRow.logo_url || null,
    telefone: userRow.telefone || null,
    cor_primaria: userRow.landing_cor_primaria || '#344848',
    foto_capa_url: userRow.landing_foto_capa_url || null,
    descricao: userRow.landing_descricao || null,
    hero_subtitulo: userRow.landing_hero_subtitulo || null,
    instagram_url: userRow.instagram_url || null,
    endereco_completo: partes.join(', '),
    bairro: userRow.bairro || null,
    cidade: userRow.cidade || null,
    agendamento_slug: userRow.agendamento_slug || null,
    agendamento_ativo: !!userRow.agendamento_ativo && String(userRow.plano || '').toLowerCase() === 'premium',
    bio: bioConfig !== undefined ? bioConfig : (userRow.bio_config || null),
    loja: {
      titulo: cfg.titulo || null,
      frase: cfg.frase || null,
      boas_vindas: cfg.boas_vindas || null,
      suporte_whatsapp: cfg.suporte_whatsapp || userRow.telefone || null,
      retirada: cfg.retirada || null,
      aparencia: cfg.aparencia || { estilo: 'claro' },
      mostrar_experimental: cfg.mostrar_experimental !== false,
      secoes: normalizarSecoes(cfg.secoes),
    },
    formas_pagamento: { pix: true, cartao: false, boleto: false },
  }
}

// ---------- formatação ----------

export const fmtBRL = (v) => (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

export const CICLO_LABEL = { mensal: '/mês', trimestral: '/trimestre', semestral: '/semestre', anual: '/ano' }
export const CICLO_NOME = { mensal: 'Mensal', trimestral: 'Trimestral', semestral: 'Semestral', anual: 'Anual' }

export function sufixoPreco(produto) {
  if (produto?.tipo === 'plano') return CICLO_LABEL[produto?.plano?.ciclo_cobranca] || '/mês'
  return ''
}

export function fmtDataHora(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  return d.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' }).replace('.', '') +
    ' · ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

export const TIPO_LABEL = { plano: 'Plano', pacote: 'Pacote', produto: 'Produto', evento: 'Evento' }
export const TIPO_ICONE = { plano: 'mdi:calendar-sync', pacote: 'mdi:ticket-confirmation-outline', produto: 'mdi:tshirt-crew-outline', evento: 'mdi:calendar-star' }
export const TIPO_CTA = { plano: 'Matricular', pacote: 'Comprar pacote', produto: 'Comprar', evento: 'Inscrever-se' }

export function telefoneWa(tel) {
  let t = String(tel || '').replace(/\D/g, '')
  if (!t) return ''
  if (!t.startsWith('55')) t = '55' + t
  return t
}

export async function copiarTexto(texto) {
  try {
    await navigator.clipboard.writeText(texto)
    return true
  } catch {
    try {
      const ta = document.createElement('textarea')
      ta.value = texto; document.body.appendChild(ta); ta.select()
      document.execCommand('copy'); document.body.removeChild(ta)
      return true
    } catch { return false }
  }
}
