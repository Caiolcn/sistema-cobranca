// ==========================================
// Helpers compartilhados pelas views da Agenda
// (AgendaCalendario / AgendaDia / AgendaSemana / AgendaPresencaModal)
// ==========================================

export const DIAS_CURTO = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
export const DIAS_LONGO = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado']
export const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']

// --- datas (sempre horário local — nunca toISOString para a data) ---
export const isoDate = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
export const hojeISO = () => isoDate(new Date())
export const parseISO = (s) => new Date(s + 'T12:00:00') // meio-dia evita borda de fuso
export const addDias = (s, n) => { const d = parseISO(s); d.setDate(d.getDate() + n); return isoDate(d) }

// segunda-feira da semana que contém `s`
export const inicioSemana = (s) => {
  const d = parseISO(s)
  const dow = d.getDay() // 0=Dom
  d.setDate(d.getDate() + (dow === 0 ? -6 : 1 - dow))
  return isoDate(d)
}

// data formatada curta: "12/05"
export const dataCurta = (s) => { const d = parseISO(s); return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}` }

export const presKey = (aulaId, devedorId) => `${aulaId}_${devedorId}`

// Cores de bloco por descrição (cicla na paleta)
export const CORES_AULA = [
  { bg: '#ede9fe', border: '#8b5cf6', text: '#5b21b6' },
  { bg: '#e0f2fe', border: '#0ea5e9', text: '#0369a1' },
  { bg: '#fce7f3', border: '#ec4899', text: '#be185d' },
  { bg: '#d1fae5', border: '#10b981', text: '#065f46' },
  { bg: '#fef3c7', border: '#f59e0b', text: '#92400e' },
  { bg: '#fee2e2', border: '#ef4444', text: '#991b1b' },
  { bg: '#e0e7ff', border: '#6366f1', text: '#3730a3' }
]
export const corDaAula = (descricao) => {
  const key = (descricao || '').toLowerCase().trim()
  let hash = 0
  for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) | 0
  return CORES_AULA[Math.abs(hash) % CORES_AULA.length]
}

// hora inteira de um horário "HH:MM[:SS]"
export const horaDe = (horario) => parseInt((horario || '0').substring(0, 2), 10)

// "João da Silva" → "JS", "Maria" → "M", "Pedro Henrique Costa" → "PC"
export const iniciaisDe = (nome) => {
  if (!nome) return ''
  const partes = nome.trim().split(/\s+/).filter(Boolean)
  if (partes.length === 1) return partes[0].charAt(0).toUpperCase()
  return (partes[0].charAt(0) + partes[partes.length - 1].charAt(0)).toUpperCase()
}

// Monta o elenco de uma aula numa data concreta:
// alunos fixos (com flag de ausência avisada) + agendados daquela data, sem duplicar.
export function montarRoster(aulaId, data, fixos, agendamentos, ausencias) {
  const fixosAula = fixos.filter(f => f.aula_id === aulaId)
  const agAula = agendamentos.filter(ag => ag.aula_id === aulaId && ag.data === data)
  const ausAula = ausencias.filter(au => au.aula_id === aulaId && au.data === data)
  return [
    ...fixosAula.map(f => ({
      tipo: 'fixo',
      devedorId: f.devedor_id,
      devedores: f.devedores,
      ausente: ausAula.some(au => au.devedor_id === f.devedor_id)
    })),
    ...agAula
      .filter(ag => !fixosAula.some(f => f.devedor_id === ag.devedor_id))
      .map(ag => ({
        tipo: 'agendado',
        devedorId: ag.devedor_id,
        devedores: ag.devedores,
        experimental: ag.devedores?.origem === 'agendamento' && !ag.devedores?.assinatura_ativa && !ag.devedores?.plano_id
      }))
  ]
}
