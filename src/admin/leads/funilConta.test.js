import { estadoConta, proximaAcao, colunaDoLead, mensagensDaVez, toque } from './funilFollowup'

// Hoje fixo: 03/10/2026 às 15h (Brasília)
const HOJE = new Date('2026-10-03T15:00:00-03:00')

const horasAtras = (h) => new Date(Date.now() - h * 3600000).toISOString()

// Lead em teste (criou_conta) com o uso mesclado, como o useInbox entrega.
// O teste dura 3 dias: trial_fim = cadastro + 3 dias.
const conta = ({ horas, alunos = 0, msgs = 0, zap = false, passo = null, passoHa = null, avisoFim = false }) => ({
  id: 'c', status: 'criou_conta', nome: 'Fulano de Tal',
  usuario_cadastro: horasAtras(horas),
  trial_fim: horasAtras(horas - 72),
  etapa_desde: horasAtras(horas),
  uso_alunos: alunos, uso_msgs_mes: msgs, uso_whatsapp: zap,
  uso_aviso_fim_em: avisoFim ? horasAtras(2) : null,
  passo, passo_em: passoHa === null ? null : horasAtras(passoHa * 24)
})

beforeAll(() => { jest.useFakeTimers().setSystemTime(HOJE) })
afterAll(() => { jest.useRealTimers() })

describe('conta em teste: colunas calculadas', () => {
  test('criou agora, sem nada: Trial', () => {
    expect(colunaDoLead(conta({ horas: 2 }))).toBe('criou_conta')
  })

  test('23h sem WhatsApp ainda é Trial; 25h vira Sem conectar', () => {
    expect(colunaDoLead(conta({ horas: 23 }))).toBe('criou_conta')
    expect(colunaDoLead(conta({ horas: 25 }))).toBe('sem_conectar')
  })

  test('24h+ mas já conectou: continua Trial', () => {
    expect(colunaDoLead(conta({ horas: 30, zap: true }))).toBe('criou_conta')
  })

  test('teste de 3 dias acabou: Trial vencido (conectado ou não)', () => {
    expect(colunaDoLead(conta({ horas: 24 * 5 }))).toBe('trial_vencido')
    expect(colunaDoLead(conta({ horas: 24 * 5, zap: true, alunos: 30 }))).toBe('trial_vencido')
  })

  test('último dia do teste ainda é teste vigente', () => {
    const l = conta({ horas: 24 * 2 + 10 })
    expect(estadoConta(l).trialRestante).toBeGreaterThanOrEqual(0)
    expect(colunaDoLead(l)).toBe('sem_conectar')
  })

  test('sem dados de uso ninguém vai pra Sem conectar', () => {
    const l = conta({ horas: 30 })
    delete l.uso_alunos
    expect(colunaDoLead(l)).toBe('criou_conta')
  })

  test('outros status não mudam', () => {
    expect(colunaDoLead({ status: 'conversando' })).toBe('conversando')
  })
})

describe('conta em teste: sequência D0, D1, D2, D4, D8, D15, D30', () => {
  const sequencia = (lead) => {
    const vistos = []
    let l = { ...lead }
    for (let i = 0; i < 10; i++) {
      const a = proximaAcao(l)
      if (!a || a.tipo !== 'toque') break
      vistos.push(a.toque.id)
      l = { ...l, passo: a.toque.id, passo_em: horasAtras(0) }
    }
    return vistos
  }

  test('os dias dos toques', () => {
    const dias = ['c_d0', 'c_d1', 'c_d2', 'c_d4', 'c_d8', 'c_d15', 'c_d30'].map(id => toque(id).dia)
    expect(dias).toEqual([0, 1, 2, 4, 8, 15, 30])
  })

  test('conta nova percorre D0 → D1 → D2 → D4 → D8 → D15 → D30', () => {
    expect(sequencia(conta({ horas: 1 }))).toEqual(['c_d0', 'c_d1', 'c_d2', 'c_d4', 'c_d8', 'c_d15', 'c_d30'])
  })

  test('se o aviso automático de fim de teste saiu, o CRM pula o D2', () => {
    expect(sequencia(conta({ horas: 1, avisoFim: true }))).toEqual(['c_d0', 'c_d1', 'c_d4', 'c_d8', 'c_d15', 'c_d30'])
  })

  test('conta de 25h sem WhatsApp: o D1 é o áudio de conectar', () => {
    const l = conta({ horas: 25 })
    const a = proximaAcao(l)
    expect(a.toque.id).toBe('c_d1')
    const msgs = mensagensDaVez(a.toque, l)
    expect(msgs[0]).toMatch(/^\[ÁUDIO\]/)
    expect(msgs[0]).toMatch(/QR Code/)
  })

  test('conectou mas sem alunos: o D1 pede a lista', () => {
    const l = conta({ horas: 25, zap: true })
    const msgs = mensagensDaVez(toque('c_d1'), l)
    expect(msgs[0]).toMatch(/lista/)
  })

  test('D4 muda conforme o que faltou', () => {
    const semZap = conta({ horas: 24 * 4 + 2 })
    expect(proximaAcao(semZap).toque.id).toBe('c_d4')
    expect(mensagensDaVez(toque('c_d4'), semZap)[0]).toMatch(/conectar o WhatsApp/)
    const semAlunos = conta({ horas: 24 * 4 + 2, zap: true })
    expect(mensagensDaVez(toque('c_d4'), semAlunos)[0]).toMatch(/sem alunos/)
  })

  test('depois do D30 sem resposta sugere mover para Fora do funil', () => {
    const a = proximaAcao(conta({ horas: 24 * 31, passo: 'c_d30', passoHa: 1 }))
    expect(a.tipo).toBe('mover')
    expect(a.para).toBe('perdido')
  })
})
