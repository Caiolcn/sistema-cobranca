// Endereço público da academia (mensalli.com.br/<slug>): regras compartilhadas pela aba
// Site e pelo editor da bio, pra uma só lista de nomes reservados valer nos dois.

// Slugs que conflitam com rotas do sistema: não podem ser usados. A rota dinâmica
// /:slug é a última do App.js, então qualquer nome igual a uma rota fixa nunca seria alcançado.
export const SLUGS_RESERVADOS = new Set([
  'login', 'signup', 'logout', 'reset-password', 'reset',
  'pagar', 'portal', 'agendar', 'academia', 'app', 'admin', 'api',
  'www', 'assets', 'static', 'public', 'img', 'images', 'css', 'js',
  'help', 'ajuda', 'home', 'sobre', 'about', 'contact', 'contato',
  'upgrade', 'success', 'onboarding', 'configuracao', 'dashboard',
  'mensalli', 'suporte', 'termos', 'privacidade', 'financeiro',
  'clientes', 'horarios', 'relatorios', 'whatsapp', 'crm', 'avisos',
  'null', 'undefined', 'index', 'root',
  // Landings de nicho (rotas de campanha). Sem isso um cliente pode registrar
  // o site dele em /escolinha e tomar a URL que está rodando em anúncio.
  'escolinha', 'escolinhas', 'futebol',
  // Demais rotas fixas do App.js
  'cadastro', 'contrato', 'links', 'preview-recibo', 'ver-como', 'bio',
  'sistema-para-academia-de-luta', 'sistema-para-escola-natacao',
  'sistema-para-escolinhas', 'sistema-para-estudio-pilates'
])

export const slugEhReservado = (slug) => {
  const s = String(slug || '').trim().toLowerCase()
  return SLUGS_RESERVADOS.has(s)
}

// "Studio Black Belt!" -> "studio-black-belt"
export function slugificar(texto) {
  return String(texto || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
}

// { ok: true } ou { ok: false, erro: 'texto pronto pra mostrar' }
export function validarSlug(slug) {
  const s = String(slug || '').trim().toLowerCase()
  if (s.length < 3) return { ok: false, erro: 'O endereço precisa ter pelo menos 3 caracteres.' }
  if (s.length > 40) return { ok: false, erro: 'O endereço pode ter no máximo 40 caracteres.' }
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(s)) {
    return { ok: false, erro: 'Use só letras minúsculas, números e hífen (sem espaço ou acento).' }
  }
  if (slugEhReservado(s)) return { ok: false, erro: `"${s}" é uma palavra reservada do sistema. Escolha outro endereço.` }
  return { ok: true }
}
