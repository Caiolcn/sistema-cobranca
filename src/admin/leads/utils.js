// Helpers compartilhados pelo inbox de leads.
// Mantidos aqui (e não em cada componente) porque a caixa, o kanban e a fila
// de follow-up formatam as mesmas coisas do mesmo jeito.

// Colunas do funil de follow-up (sql-funil-leads-v3.sql, funilFollowup.json).
// Coluna de toque = "esse toque JÁ FOI ENVIADO"; o board calcula o próximo.
// criou_conta / pagante / churn são automáticas (sync_mensalli_leads).
// 'perdido' é o id histórico da coluna "Fora do funil".
export const COLUNAS = [
  { id: 'conversando', titulo: 'Conversando',   cor: '#8b5cf6', bg: '#f5f3ff', hint: 'Papo em andamento' },
  { id: 'aguardando',  titulo: 'Aguardando',    cor: '#f59e0b', bg: '#fffbeb', hint: 'Pediu pra chamar outro dia' },
  { id: 'a_toque_1',   titulo: 'Toque 1',       cor: '#0ea5e9', bg: '#f0f9ff', hint: 'Enviado · próximo no D3' },
  { id: 'a_toque_2',   titulo: 'Toque 2',       cor: '#0ea5e9', bg: '#f0f9ff', hint: 'Enviado · próximo no D7' },
  { id: 'a_toque_3',   titulo: 'Toque 3',       cor: '#0284c7', bg: '#f0f9ff', hint: 'Enviado · próximo no D14' },
  { id: 'a_toque_4',   titulo: 'Toque 4',       cor: '#0369a1', bg: '#f0f9ff', hint: 'Enviado · próximo no D24' },
  { id: 'a_toque_5',   titulo: 'Toque 5',       cor: '#075985', bg: '#f0f9ff', hint: 'Enviado · despedida no D36' },
  { id: 'a_final',     titulo: 'Despedida',     cor: '#64748b', bg: '#f1f5f9', hint: 'Enviada · 3 dias e sai' },
  { id: 'criou_conta', titulo: 'Criou conta',   cor: '#06b6d4', bg: '#ecfeff', hint: 'Teste e ativação', auto: true },
  { id: 'pagante',     titulo: 'Pagante',       cor: '#16a34a', bg: '#f0fdf4', hint: 'Virou cliente', auto: true },
  { id: 'churn',       titulo: 'Churn',         cor: '#dc2626', bg: '#fef2f2', hint: 'Pagou e cancelou', auto: true },
  { id: 'perdido',     titulo: 'Fora do funil', cor: '#94a3b8', bg: '#f8fafc', hint: 'Reaquecimento 30/60/90' }
]

export const MOTIVOS_SAIDA = [
  { value: 'esgotou',      label: 'Esgotou a sequência (reaquece 30/60/90)' },
  { value: 'preco_timing', label: 'Não agora: preço ou momento (só o de 90 dias)' },
  { value: 'nao_claro',    label: 'Disse não / pediu pra parar (nada mais)' },
  { value: 'sem_fit',      label: 'Não tem perfil (nada mais)' }
]

// As quatro filas de silêncio do playbook (docs/playbook-leads-campanha.html).
// Os dias são absolutos, contados do início do silêncio; a edge function
// mensalli-lead-send agenda pelos intervalos entre eles.
export const FILAS = [
  { id: 'A', titulo: 'A · Sumiu sem qualificar',        dias: [1, 4, 8],      cor: '#0ea5e9' },
  { id: 'B', titulo: 'B · Ouviu a oferta e não mandou', dias: [2, 5, 9],      cor: '#f59e0b' },
  { id: 'C', titulo: 'C · Conta montada, não conectou', dias: [1, 3, 7, 15],  cor: '#dc2626' },
  { id: 'D', titulo: 'D · Testou e não virou plano',    dias: [3, 6, 10],     cor: '#8b5cf6' }
]

// Faixas de plano — conferidas em criar-planos-sistema.sql.
export const PLANOS = [
  { ate: 50,  nome: 'Starter', preco: '49,90' },
  { ate: 150, nome: 'Pro',     preco: '99,90' },
  { ate: 500, nome: 'Premium', preco: '149,90' }
]

export function planoPara(alunos) {
  const n = Number(alunos)
  if (!n || Number.isNaN(n)) return null
  return PLANOS.find(p => n <= p.ate) || PLANOS[PLANOS.length - 1]
}

export const formatarTelefone = (tel) => {
  const d = String(tel || '').replace(/\D/g, '')
  const local = d.startsWith('55') && d.length >= 12 ? d.slice(2) : d
  if (local.length === 11) return `(${local.slice(0, 2)}) ${local.slice(2, 7)}-${local.slice(7)}`
  if (local.length === 10) return `(${local.slice(0, 2)}) ${local.slice(2, 6)}-${local.slice(6)}`
  return tel || '—'
}

export const tempoDesde = (iso) => {
  if (!iso) return '—'
  const min = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (min < 1) return 'agora'
  if (min < 60) return `há ${min}min`
  const h = Math.floor(min / 60)
  if (h < 24) return `há ${h}h`
  const d = Math.floor(h / 24)
  if (d < 30) return `há ${d}d`
  return new Date(iso).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })
}

export const formatarDataHora = (iso) => iso
  ? new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
  : '—'

export const formatarHora = (iso) => iso
  ? new Date(iso).toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' })
  : ''

// Data no fuso local. `new Date('YYYY-MM-DD')` lê como UTC e volta um dia no BRT.
export const dataLocal = (d) => d ? new Date(d + 'T00:00:00') : null

export const formatarDataCurta = (d) => {
  const dt = dataLocal(d)
  return dt ? dt.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) : '—'
}

export const hojeISO = () => {
  const agora = new Date()
  const off = agora.getTimezoneOffset() * 60000
  return new Date(agora.getTime() - off).toISOString().slice(0, 10)
}

export const duracaoAudio = (seg) => {
  if (!seg && seg !== 0) return ''
  const m = Math.floor(seg / 60)
  const s = Math.floor(seg % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

const ROTULO_TIPO = {
  audio: 'Áudio', imagem: 'Imagem', video: 'Vídeo',
  documento: 'Documento', sticker: 'Figurinha', outro: 'Anexo'
}
export const rotuloTipo = (tipo) => ROTULO_TIPO[tipo] || 'Anexo'

// ---------------------------------------------------------------
// Variáveis das respostas rápidas
// ---------------------------------------------------------------
// O que não conseguir resolver fica com o {{...}} na tela de propósito: é o
// aviso visual de que falta preencher antes de enviar. O playbook manda variar
// o texto de qualquer forma — nada aqui envia sozinho.
export function resolverVariaveis(texto, lead) {
  if (!texto) return ''
  const plano = planoPara(lead?.alunos)
  const primeiroNome = String(lead?.nome || lead?.usuario_nome || '').trim().split(/\s+/)[0] || ''

  const valores = {
    seu_nome: 'Caio',
    nome: primeiroNome,
    alunos: lead?.alunos ? String(lead.alunos) : '',
    nicho: lead?.nicho || '',
    plano: plano ? plano.nome : '',
    preco: plano ? plano.preco : ''
  }

  return texto.replace(/\{\{(\w+)\}\}/g, (original, chave) => {
    const v = valores[chave]
    return v ? v : original
  })
}

// Campos que sobraram para preencher a mão: {{var}} não resolvida ou [colchete]
// deixado de propósito na semente (ex.: "[N] alunos em atraso").
export function pendenciasDoTexto(texto) {
  if (!texto) return []
  const chaves = [...texto.matchAll(/\{\{(\w+)\}\}/g)].map(m => m[1])
  const colchetes = [...texto.matchAll(/\[([^\]]{1,20})\]/g)].map(m => m[1])
  return [...new Set([...chaves, ...colchetes])]
}
