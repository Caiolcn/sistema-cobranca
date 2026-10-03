import { colunaDoLead, proximaAcao, ehBaseAntiga, ehPuxarConversa, mensagensDaVez } from './funilFollowup'

// Hoje fixo: 03/10/2026 às 15h (Brasília)
const HOJE = new Date('2026-10-03T15:00:00-03:00')
const diasAtras = (n) => new Date(Date.now() - n * 86400000).toISOString()

// Lead em 'conversando' cuja última interação foi há `parado` dias
const conversando = ({ parado, direcao = 'out', passo = null, passoHa = null, arquivado = false }) => ({
  id: 'l', status: 'conversando', nome: 'Fulano', arquivado,
  ultima_interacao: diasAtras(parado), ultima_direcao: direcao,
  etapa_desde: diasAtras(parado + 5),
  passo, passo_em: passoHa === null ? null : diasAtras(passoHa)
})

beforeAll(() => { jest.useFakeTimers().setSystemTime(HOJE) })
afterAll(() => { jest.useRealTimers() })

describe('conversando parado: Puxar conversa (8 a 30 dias) e Reaquecimento (30+)', () => {
  test('conversa de até 7 dias continua em Conversando', () => {
    expect(colunaDoLead(conversando({ parado: 3 }))).toBe('conversando')
    expect(colunaDoLead(conversando({ parado: 7 }))).toBe('conversando')
  })

  test('de 8 a 30 dias vai pra Puxar conversa, com o Toque 1 pra hoje', () => {
    const l = conversando({ parado: 20 })
    expect(colunaDoLead(l)).toBe('puxar_conversa')
    const a = proximaAcao(l)
    expect(a.toque.id).toBe('a_toque_1')
    expect(a.due).toBe('2026-10-03')
    expect(colunaDoLead(conversando({ parado: 8 }))).toBe('puxar_conversa')
    expect(colunaDoLead(conversando({ parado: 30 }))).toBe('puxar_conversa')
  })

  test('passou de 30 dias: vai sozinho pro Reaquecimento', () => {
    expect(colunaDoLead(conversando({ parado: 31 }))).toBe('base_antiga')
    expect(colunaDoLead(conversando({ parado: 45 }))).toBe('base_antiga')
  })

  test('se a última mensagem foi dele, você ainda deve a resposta: fica em Conversando', () => {
    expect(colunaDoLead(conversando({ parado: 15, direcao: 'in' }))).toBe('conversando')
  })

  test('arquivado nunca entra nas colunas calculadas', () => {
    expect(ehBaseAntiga(conversando({ parado: 50, arquivado: true }))).toBe(false)
    expect(ehPuxarConversa(conversando({ parado: 15, arquivado: true }))).toBe(false)
  })

  test('outros status não mudam', () => {
    expect(colunaDoLead({ status: 'a_toque_1', ultima_interacao: diasAtras(50) })).toBe('a_toque_1')
  })
})

describe('Reaquecimento: toques 30, 60 e 90', () => {
  test('primeiro toque combina com o tempo de silêncio e já é pra hoje', () => {
    const a = proximaAcao(conversando({ parado: 45 }))
    expect(a.toque.id).toBe('reaq_30')
    expect(a.due).toBe('2026-10-03')
    expect(proximaAcao(conversando({ parado: 70 })).toque.id).toBe('reaq_60')
    expect(proximaAcao(conversando({ parado: 120 })).toque.id).toBe('reaq_90')
  })

  test('depois que você manda o toque, o lead FICA no Reaquecimento (a última conversa virou agora)', () => {
    // você enviou o reaq_30 hoje: ultima_interacao = agora, passo gravado
    const l = conversando({ parado: 0, direcao: 'out', passo: 'reaq_30', passoHa: 0 })
    expect(colunaDoLead(l)).toBe('base_antiga')
    const a = proximaAcao(l)
    expect(a.toque.id).toBe('reaq_60')
    expect(a.due).toBe('2026-11-02') // 30 dias depois do toque
  })

  test('reaq_60 → reaq_90 → arquivar', () => {
    const a60 = proximaAcao(conversando({ parado: 1, passo: 'reaq_60', passoHa: 1 }))
    expect(a60.toque.id).toBe('reaq_90')
    const a90 = proximaAcao(conversando({ parado: 1, passo: 'reaq_90', passoHa: 1 }))
    expect(a90.tipo).toBe('arquivar')
  })

  test('se ele responde, sai do Reaquecimento e volta pro papo', () => {
    // toque há 5 dias; ele respondeu há 2
    const l = { ...conversando({ parado: 2, direcao: 'in', passo: 'reaq_30', passoHa: 5 }) }
    expect(colunaDoLead(l)).toBe('conversando')
    expect(proximaAcao(l)).toBeNull() // falta você responder
  })

  test('se você conversa com ele depois do toque, também sai', () => {
    const l = conversando({ parado: 2, direcao: 'out', passo: 'reaq_30', passoHa: 6 })
    expect(colunaDoLead(l)).toBe('conversando')
  })

  test('passo velho de um ciclo anterior é ignorado numa nova fase de silêncio', () => {
    // reaq_30 enviado há 100 dias, conversa retomada há 50 dias e parada de novo
    const l = conversando({ parado: 50, passo: 'reaq_30', passoHa: 100 })
    expect(colunaDoLead(l)).toBe('base_antiga')
    expect(proximaAcao(l).toque.id).toBe('reaq_30')
  })

  test('o texto do reaquecimento vem do funil (reaq_30)', () => {
    const a = proximaAcao(conversando({ parado: 45 }))
    expect(mensagensDaVez(a.toque, conversando({ parado: 45 }))[0]).toMatch(/faz um mês/)
  })
})
