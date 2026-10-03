// Estágio da conversa de um lead parado: em que ponto ela morreu.
// Define qual texto de follow-up faz sentido (funilFollowup.json: variantes A, B, C e D).
//
//   A  Sumiu na 1ª mensagem    ele mandou só a mensagem que abriu o contato
//   B  Parou antes do valor    conversaram, mas o preço nunca apareceu
//   C  Parou no valor          o preço apareceu e a conversa morreu (sem vídeo)
//   D  Viu valor e vídeo       recebeu o vídeo e o preço, e sumiu: o mais quente
//
// Vem do histórico de mensagens (mensalli_lead_mensagens), por palavras-chave. Pode errar
// em casos de borda; o estágio é só uma sugestão de texto, nada é movido por ele.

export const ESTAGIOS = {
  D: { sigla: 'D', titulo: 'Viu valor e vídeo', dica: 'Recebeu o vídeo e o preço e sumiu: o mais quente', cor: '#b45309', bg: '#fef3c7' },
  C: { sigla: 'C', titulo: 'Parou no valor', dica: 'O preço apareceu e a conversa parou', cor: '#9a3412', bg: '#ffedd5' },
  B: { sigla: 'B', titulo: 'Parou antes do valor', dica: 'Conversaram, mas o preço não chegou a aparecer', cor: '#075985', bg: '#e0f2fe' },
  A: { sigla: 'A', titulo: 'Sumiu na 1ª mensagem', dica: 'Só mandou a mensagem que abriu o contato', cor: '#475569', bg: '#f1f5f9' }
}

// Ordem de prioridade (mais quente primeiro)
export const ORDEM_ESTAGIOS = ['D', 'C', 'B', 'A']

const RE_VIDEO = /(youtu|vimeo|drive\.google|loom\.com|v[ií]deo)/i
// Valor falado por você: preço em reais, "por mês", nome de plano
const RE_VALOR_SAIDA = /(R\$\s?\d|\/mês|por mês|plano (starter|pro|premium)|pre[çc]o|\bvalor)/i
// Valor perguntado por ele
const RE_VALOR_ENTRADA = /(quanto|pre[çc]o|\bvalor|custa)/i

// mensagens: [{ direcao: 'in' | 'out', tipo, texto }]
export function classificarEstagio(mensagens) {
  const msgs = mensagens || []
  const dele = msgs.filter(m => m.direcao === 'in').length
  const mandeiVideo = msgs.some(m => m.direcao === 'out' && (m.tipo === 'video' || RE_VIDEO.test(m.texto || '')))
  const falouValor = msgs.some(m =>
    (m.direcao === 'out' && RE_VALOR_SAIDA.test(m.texto || '')) ||
    (m.direcao === 'in' && RE_VALOR_ENTRADA.test(m.texto || ''))
  )

  if (falouValor && mandeiVideo) return 'D'
  if (falouValor) return 'C'
  if (dele <= 1) return 'A'
  return 'B'
}
