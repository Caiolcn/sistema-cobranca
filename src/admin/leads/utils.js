// Helpers compartilhados pelo inbox de leads.
// Mantidos aqui (e não em cada componente) porque a caixa, o kanban e a fila
// de follow-up formatam as mesmas coisas do mesmo jeito.

// Colunas do funil de follow-up (sql-funil-leads-v3.sql, funilFollowup.json).
// Coluna de toque = "esse toque JÁ FOI ENVIADO"; o board calcula o próximo.
// criou_conta / pagante / churn são automáticas (sync_mensalli_leads).
// 'perdido' é o id histórico da coluna "Fora do funil".
export const COLUNAS = [
  { id: 'conversando', titulo: 'Conversando',   cor: '#8b5cf6', bg: '#f5f3ff', hint: 'Papo em andamento' },
  // Duas colunas calculadas do mesmo status 'conversando' (funilFollowup.ehPuxarConversa / ehBaseAntiga):
  //   Puxar conversa  parado de 8 a 30 dias: tentar retomar (sugere o Toque 1)
  //   Reaquecimento   parado há mais de 30 dias: toques 30/60/90, contados da última conversa
  { id: 'puxar_conversa', titulo: 'Puxar conversa', cor: '#9333ea', bg: '#faf5ff', hint: 'Parado de 8 a 30 dias · tente retomar', auto: true, derivada: true },
  { id: 'base_antiga', titulo: 'Reaquecimento', cor: '#be185d', bg: '#fdf2f8', hint: 'Parado há 30+ dias · toques 30/60/90', auto: true, derivada: true },
  { id: 'aguardando',  titulo: 'Aguardando',    cor: '#f59e0b', bg: '#fffbeb', hint: 'Pediu pra chamar outro dia' },
  { id: 'a_toque_1',   titulo: 'Toque 1',       cor: '#0ea5e9', bg: '#f0f9ff', hint: 'Enviado · Toque 2 em 6 dias' },
  { id: 'a_toque_2',   titulo: 'Toque 2',       cor: '#0284c7', bg: '#f0f9ff', hint: 'Enviado · sem resposta vai pro Fora do funil' },
  // criou_conta, sem_conectar e trial_vencido são o mesmo status 'criou_conta' no banco:
  // a coluna é calculada pelo uso da conta e pelo prazo do teste (funilFollowup.estadoConta).
  { id: 'criou_conta',   titulo: 'Trial',          cor: '#06b6d4', bg: '#ecfeff', hint: 'Teste de 3 dias · D0, D1, D2', auto: true },
  { id: 'sem_conectar',  titulo: 'Sem conectar',   cor: '#d97706', bg: '#fffbeb', hint: '24h+ sem WhatsApp · mandar áudio', auto: true, derivada: true },
  { id: 'trial_vencido', titulo: 'Trial vencido',  cor: '#64748b', bg: '#f1f5f9', hint: 'Teste acabou · D4, D8, D15, D30', auto: true, derivada: true },
  // As quatro colunas abaixo são do mesmo status 'pagante' no banco: o estado é
  // calculado pelo uso da conta (funilFollowup.estadoPagante). Não aceitam arrastar.
  { id: 'recem_pago',  titulo: 'Recém pago',    cor: '#0d9488', bg: '#f0fdfa', hint: 'Até 7 dias · conferir D2 e D5', auto: true, derivada: true },
  { id: 'ativando',    titulo: 'Ativando',      cor: '#d97706', bg: '#fffbeb', hint: 'Pagou, falta conectar, cadastrar ou disparar', auto: true, derivada: true },
  { id: 'pagante',     titulo: 'Pagante',       cor: '#16a34a', bg: '#f0fdf4', hint: 'Usando · check-in D30 e D60', auto: true, derivada: true },
  { id: 'inadimplente', titulo: 'Inadimplente', cor: '#ea580c', bg: '#fff7ed', hint: 'Plano vencido · vira Churn depois de 30 dias', auto: true, derivada: true },
  { id: 'em_risco',    titulo: 'Em risco',      cor: '#dc2626', bg: '#fef2f2', hint: 'Pagou e parou de usar · prioridade', auto: true, derivada: true },
  { id: 'churn',       titulo: 'Churn',         cor: '#dc2626', bg: '#fef2f2', hint: 'Pagou e cancelou', auto: true },
  { id: 'perdido',     titulo: 'Fora do funil', cor: '#94a3b8', bg: '#f8fafc', hint: 'Reaquecimento 30/60/90' }
]

// Etapas que o gestor escolhe à mão (sem as colunas calculadas pelo uso da conta)
export const COLUNAS_ETAPA = COLUNAS.filter(c => !c.derivada || c.id === 'pagante')
// (criou_conta não é derivada: é a coluna "Trial", que o gestor também escolhe à mão)

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
    preco: plano ? plano.preco : '',
    // Uso real da conta (vem da vw_admin_contas, mesclado em useInbox)
    alunos_conta: lead?.uso_alunos ? String(lead.uso_alunos) : '',
    msgs_mes: lead?.uso_msgs_mes ? String(lead.uso_msgs_mes) : ''
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
