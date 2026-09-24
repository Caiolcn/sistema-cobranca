/* ============================================================
   Mapa do /admin — fonte única da sidebar, dos títulos e dos redirects

   Antes o admin vivia dentro do layout do cliente (/app/admin) e tinha três
   navegações empilhadas: a sidebar do app, sete abas no topo (?aba=) e seis
   cards de "Outros painéis" no rodapé. Agora cada destino é uma rota em
   /admin/<slug>, agrupada por assunto numa sidebar só.
   ============================================================ */

export const GRUPOS_ADMIN = [
  {
    grupo: 'Negócio',
    itens: [
      { slug: 'visao-geral', label: 'Visão Geral', descricao: 'Como está o Mensalli hoje', icon: 'mdi:view-dashboard-outline' },
      { slug: 'contas', label: 'Contas', descricao: 'Todas as contas e o ciclo de vida de cada uma', icon: 'mdi:account-group-outline' },
      { slug: 'financeiro', label: 'Financeiro', descricao: 'MRR real × estimado e receita por plano', icon: 'mdi:hand-coin-outline' },
      { slug: 'retencao', label: 'Retenção', descricao: 'Quem lembrar, quem recuperar', icon: 'mdi:account-heart-outline' },
      { slug: 'cobranca-saas', label: 'Cobrança SaaS', icon: 'mdi:cash-clock' },
    ],
  },
  {
    grupo: 'Aquisição',
    itens: [
      { slug: 'leads', label: 'Leads', icon: 'mdi:account-multiple-plus-outline' },
      { slug: 'prospeccao', label: 'Prospecção', icon: 'mdi:map-search-outline' },
    ],
  },
  {
    grupo: 'Operação',
    itens: [
      { slug: 'mensagens', label: 'Central de mensagens', icon: 'mdi:message-alert-outline' },
      { slug: 'whatsapp-saude', label: 'Saúde do WhatsApp', icon: 'mdi:heart-pulse' },
      { slug: 'whatsapp-master', label: 'WhatsApp Master', icon: 'mdi:whatsapp' },
      { slug: 'cron', label: 'Cron', icon: 'mdi:clock-outline' },
    ],
  },
  {
    grupo: 'Produto',
    itens: [
      { slug: 'atualizacoes', label: 'Atualizações', icon: 'mdi:bullhorn-outline' },
    ],
  },
]

export const ITENS_ADMIN = GRUPOS_ADMIN.flatMap(g => g.itens)

// Slug da primeira parte do caminho (/admin/contas?x=1 -> 'contas')
export function slugDoCaminho(pathname) {
  return (pathname.split('/')[2] || '').toLowerCase()
}

export function grupoDoCaminho(pathname) {
  const slug = slugDoCaminho(pathname)
  const g = GRUPOS_ADMIN.find(gr => gr.itens.some(i => i.slug === slug))
  return g ? g.grupo : null
}

export function itemDoCaminho(pathname) {
  const slug = slugDoCaminho(pathname)
  return ITENS_ADMIN.find(i => i.slug === slug) || null
}

// Valores antigos de ?aba= no /app/admin. Os links velhos estão em favorito,
// em comentário de SQL e em mensagem de WhatsApp — precisam continuar abrindo.
const ABA_LEGADA = {
  visao: 'visao-geral',
  contas: 'contas',
  financeiro: 'financeiro',
  retencao: 'retencao',
  mensagens: 'mensagens',
  novidades: 'atualizacoes',
  prospeccao: 'prospeccao',
}

// /app/admin[/sub][?aba=x&...] -> /admin/<slug>[?...]
export function destinoAdminLegado(pathname, search) {
  const params = new URLSearchParams(search)
  const sub = pathname.replace(/^\/app\/admin\/?/, '').replace(/\/$/, '')
  let slug = sub
  if (!slug) {
    slug = ABA_LEGADA[params.get('aba')] || 'visao-geral'
    params.delete('aba')
  }
  const resto = params.toString()
  return `/admin/${slug}${resto ? `?${resto}` : ''}`
}
