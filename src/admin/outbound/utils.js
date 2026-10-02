// Etapas do CRM de outbound (sql-outbound-crm.sql). Criou conta e Fechado são
// automáticos (sync_outbound_leads); Respondeu também, quando a resposta chega
// no WhatsApp do Mensalli — senão é arrasto.
export const COLUNAS_OUTBOUND = [
  { id: 'novo',          titulo: 'A abordar',    cor: '#64748b', bg: '#f8fafc', hint: 'Veio na lista do dia' },
  { id: 'abordado',      titulo: 'Abordado',     cor: '#0ea5e9', bg: '#f0f9ff', hint: '1ª mensagem enviada · follow-up em 2 dias' },
  { id: 'follow_up',     titulo: 'Follow-up',    cor: '#6366f1', bg: '#eef2ff', hint: 'Follow-up enviado · 3 dias e encerra' },
  { id: 'respondeu',     titulo: 'Respondeu',    cor: '#8b5cf6', bg: '#f5f3ff', hint: 'Conversa aberta', auto: true },
  { id: 'nao_respondeu', titulo: 'Sem resposta', cor: '#f59e0b', bg: '#fffbeb', hint: 'Não respondeu a nada' },
  { id: 'trial_criado',  titulo: 'Criou conta',  cor: '#06b6d4', bg: '#ecfeff', hint: 'Telefone bateu com uma conta', auto: true },
  { id: 'fechado',       titulo: 'Fechado',      cor: '#16a34a', bg: '#f0fdf4', hint: 'Virou pagante', auto: true },
  { id: 'descartado',    titulo: 'Descartado',   cor: '#94a3b8', bg: '#f8fafc', hint: 'Sem interesse ou sem perfil' }
]

export const tituloEtapa = (id) => COLUNAS_OUTBOUND.find(c => c.id === id)?.titulo || id

// O botão principal da ficha: o passo natural de cada etapa
export const PROXIMO_PASSO = {
  novo:      { para: 'abordado',      label: 'Abordei',          icon: 'mdi:send-outline' },
  abordado:  { para: 'follow_up',     label: 'Mandei follow-up', icon: 'mdi:send-clock-outline' },
  follow_up: { para: 'nao_respondeu', label: 'Sem resposta',     icon: 'mdi:clock-alert-outline' }
}

// Telefone do Google vem sem DDI: "(62) 98565-3317"
export const linkWhatsApp = (telefone) => {
  const d = String(telefone || '').replace(/\D/g, '')
  if (!d) return null
  return `https://wa.me/${d.startsWith('55') && d.length >= 12 ? d : '55' + d}`
}

export const linkInstagram = (handle) =>
  handle ? `https://instagram.com/${String(handle).replace('@', '')}` : null

// Bloco de texto pra colar na IA e gerar a abordagem personalizada
export function textoParaIA(lead) {
  const g = lead.dados_google || {}
  const linhas = [
    `Nome: ${lead.nome}`,
    `Nicho: ${lead.vertical}`,
    g.endereco && `Endereço: ${g.endereco}`,
    g.nota && `Nota no Google: ${g.nota} (${g.avaliacoes || 0} avaliações)`,
    g.resumo && `Descrição: ${g.resumo}`,
    g.site && `Site: ${g.site}`,
    lead.instagram_handle && `Instagram: @${lead.instagram_handle}`,
    ...(g.reviews || []).map(r => `Avaliação (${r.nota}★): ${r.texto}`)
  ]
  return linhas.filter(Boolean).join('\n')
}
