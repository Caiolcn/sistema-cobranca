import { estadoPagante, proximaAcao, colunaDoLead, mensagensDaVez, toque } from './funilFollowup'

// Hoje fixo: 02/10/2026 (dia 2 do mês, então "parou de disparar" ainda não acusa)
const HOJE = new Date('2026-10-02T15:00:00-03:00')

const diasAtras = (n) => {
  const d = new Date() // relógio falso: acompanha jest.setSystemTime
  d.setDate(d.getDate() - n)
  return d.toISOString()
}

// Lead pagante com o uso da conta mesclado, como o useInbox entrega
const pagante = ({ dias, alunos = 0, msgs = 0, zap = false, acesso = 0, passo = null, passoHa = null }) => ({
  id: 'x', status: 'pagante', nome: 'Fulano de Tal',
  virou_pagante_em: diasAtras(dias), etapa_desde: diasAtras(dias),
  uso_alunos: alunos, uso_msgs_mes: msgs, uso_whatsapp: zap,
  uso_ultimo_acesso: acesso === null ? null : diasAtras(acesso),
  passo, passo_em: passoHa === null ? null : diasAtras(passoHa)
})

beforeAll(() => { jest.useFakeTimers().setSystemTime(HOJE) })
afterAll(() => { jest.useRealTimers() })

describe('estado do pagante pelo uso da conta', () => {
  test('pagou hoje, sem nada feito: Recém pago (não é risco)', () => {
    const l = pagante({ dias: 0, alunos: 37 })
    expect(colunaDoLead(l)).toBe('recem_pago')
    expect(estadoPagante(l).faltam).toEqual(['zap', 'disparo'])
  })

  test('pagou há 4 dias, zerado e sem entrar: ainda Recém pago, D2 atrasado', () => {
    const l = pagante({ dias: 4, acesso: null })
    expect(colunaDoLead(l)).toBe('recem_pago')
    const a = proximaAcao(l)
    expect(a.toque.id).toBe('f_d2')
    expect(a.due < '2026-10-02').toBe(true)
  })

  test('D5 depois do D2 enviado', () => {
    const l = pagante({ dias: 5, passo: 'f_d2', passoHa: 3 })
    expect(proximaAcao(l).toque.id).toBe('f_d5')
  })

  test('pagou há 12 dias, WhatsApp off: Ativando com a mensagem do WhatsApp', () => {
    const l = pagante({ dias: 12, alunos: 20, msgs: 3, zap: false })
    expect(colunaDoLead(l)).toBe('ativando')
    const a = proximaAcao(l)
    expect(a.toque.id).toBe('f_a12')
    expect(mensagensDaVez(a.toque, l)[0]).toMatch(/WhatsApp ainda não conectou/)
  })

  test('tudo certo aos 8 dias: vira Pagante e o check-in D30 fica no futuro', () => {
    const l = pagante({ dias: 8, alunos: 9, msgs: 5, zap: true })
    expect(colunaDoLead(l)).toBe('pagante')
    const a = proximaAcao(l)
    expect(a.toque.id).toBe('f_d30')
    expect(a.due > '2026-10-02').toBe(true)
  })

  test('18 dias com 2 alunos: Em risco por falta de alunos', () => {
    const l = pagante({ dias: 18, alunos: 2, zap: true })
    expect(estadoPagante(l)).toMatchObject({ estado: 'em_risco', motivo: 'sem_alunos' })
  })

  test('WhatsApp desconectado há meses: Em risco (WhatsApp)', () => {
    const l = pagante({ dias: 140, alunos: 10, zap: false, acesso: 22 })
    expect(estadoPagante(l)).toMatchObject({ estado: 'em_risco', motivo: 'zap' })
  })

  test('conectado, mas 20 dias sem entrar: Em risco (sumiu)', () => {
    const l = pagante({ dias: 100, alunos: 60, msgs: 10, zap: true, acesso: 20 })
    expect(estadoPagante(l)).toMatchObject({ estado: 'em_risco', motivo: 'sumiu' })
  })

  test('nunca entrou na plataforma: Em risco (sumiu)', () => {
    const l = pagante({ dias: 183, alunos: 66, msgs: 10, zap: true, acesso: null })
    expect(estadoPagante(l)).toMatchObject({ estado: 'em_risco', motivo: 'sumiu' })
  })

  test('mensagens do mês zeradas só acusam depois do dia 10', () => {
    expect(colunaDoLead(pagante({ dias: 191, alunos: 51, msgs: 0, zap: true, acesso: 3 }))).toBe('pagante') // hoje é dia 2
    try {
      jest.setSystemTime(new Date('2026-10-15T15:00:00-03:00'))
      // montado depois de avançar o relógio, para o "último acesso" valer 3 dias atrás
      const l = pagante({ dias: 191, alunos: 51, msgs: 0, zap: true, acesso: 3 })
      expect(estadoPagante(l)).toMatchObject({ estado: 'em_risco', motivo: 'sem_disparo' })
    } finally {
      jest.setSystemTime(HOJE)
    }
  })

  test('pagante antigo e saudável fica quieto (sem fila atrasada)', () => {
    const l = pagante({ dias: 200, alunos: 100, msgs: 80, zap: true })
    expect(colunaDoLead(l)).toBe('pagante')
    expect(proximaAcao(l)).toBeNull()
  })

  test('D30 e D60 só aparecem na janela', () => {
    expect(proximaAcao(pagante({ dias: 36, alunos: 90, msgs: 50, zap: true })).toque.id).toBe('f_d30')
    expect(proximaAcao(pagante({ dias: 50, alunos: 90, msgs: 50, zap: true })).toque.id).toBe('f_d60')
    expect(proximaAcao(pagante({ dias: 74, alunos: 90, msgs: 50, zap: true })).toque.id).toBe('f_d60')
    expect(proximaAcao(pagante({ dias: 75, alunos: 90, msgs: 50, zap: true }))).toBeNull()
    expect(proximaAcao(pagante({ dias: 70, alunos: 90, msgs: 50, zap: true, passo: 'f_d60', passoHa: 3 }))).toBeNull()
  })

  test('Em risco: 1º toque hoje, 2º cinco dias depois, depois para', () => {
    const base = { dias: 140, alunos: 10, zap: false, acesso: 22 }
    expect(proximaAcao(pagante(base)).toque.id).toBe('f_risco_1')
    const a2 = proximaAcao(pagante({ ...base, passo: 'f_risco_1', passoHa: 2 }))
    expect(a2.toque.id).toBe('f_risco_2')
    expect(a2.due).toBe('2026-10-05')
    expect(proximaAcao(pagante({ ...base, passo: 'f_risco_2', passoHa: 1 }))).toBeNull()
    // mais de 30 dias depois, recomeça
    expect(proximaAcao(pagante({ ...base, passo: 'f_risco_2', passoHa: 40 })).toque.id).toBe('f_risco_1')
  })

  test('mensagem do risco muda conforme o motivo', () => {
    const l = pagante({ dias: 140, alunos: 10, zap: false, acesso: 22 })
    expect(mensagensDaVez(toque('f_risco_1'), l)[0]).toMatch(/desconectou/)
  })

  test('sem dados de uso ninguém é acusado de risco', () => {
    const l = { id: 'y', status: 'pagante', virou_pagante_em: diasAtras(100), etapa_desde: diasAtras(100) }
    expect(colunaDoLead(l)).toBe('pagante')
  })

  test('leads que não são pagantes continuam na própria coluna', () => {
    expect(colunaDoLead({ status: 'conversando' })).toBe('conversando')
    expect(colunaDoLead({ status: 'criou_conta' })).toBe('criou_conta')
  })
})

describe('inadimplente: plano vencido e a conta ainda marcada como paga', () => {
  // venceHa = dias desde o vencimento do plano
  const inad = ({ venceHa, passo = null, passoHa = null, alunos = 66, zap = false, acesso = null }) => ({
    ...pagante({ dias: 200, alunos, zap, acesso, passo, passoHa }),
    uso_ciclo: 'inadimplente',
    uso_vencimento: diasAtras(venceHa)
  })

  test('vai pra coluna Inadimplente e não pra Em risco, mesmo sem usar nada', () => {
    const l = inad({ venceHa: 10 })
    expect(colunaDoLead(l)).toBe('inadimplente')
    expect(estadoPagante(l)).toMatchObject({ estado: 'inadimplente', diasVencido: 10, diasParaChurn: 20 })
  })

  test('vencido há mais de 30 dias: zero dias para o churn', () => {
    expect(estadoPagante(inad({ venceHa: 40 })).diasParaChurn).toBe(0)
  })

  test('conta em dia e sem uso continua em Em risco (não é inadimplente)', () => {
    const l = { ...pagante({ dias: 140, alunos: 10, zap: false, acesso: 22 }), uso_ciclo: 'ativo' }
    expect(colunaDoLead(l)).toBe('em_risco')
  })

  test('toques de renovação: 5, 12 e 22 dias depois do vencimento', () => {
    const a = proximaAcao(inad({ venceHa: 6 }))
    expect(a.toque.id).toBe('f_inad_5')
    const b = proximaAcao(inad({ venceHa: 13, passo: 'f_inad_5', passoHa: 7 }))
    expect(b.toque.id).toBe('f_inad_12')
    const c = proximaAcao(inad({ venceHa: 23, passo: 'f_inad_12', passoHa: 10 }))
    expect(c.toque.id).toBe('f_inad_22')
    expect(proximaAcao(inad({ venceHa: 25, passo: 'f_inad_22', passoHa: 2 }))).toBeNull()
  })

  test('vencido há 1 dia: o primeiro toque ainda está no futuro', () => {
    const a = proximaAcao(inad({ venceHa: 1 }))
    expect(a.toque.id).toBe('f_inad_5')
    expect(a.due > '2026-10-02').toBe(true)
  })

  test('churn de quem só venceu usa o texto "renovação", não "cancelou"', () => {
    const l = { status: 'churn', nome: 'Fulano', cancelado_em: null }
    expect(mensagensDaVez(toque('churn_1'), l)[0]).toMatch(/não foi renovado/)
    const cancelou = { status: 'churn', nome: 'Fulano', cancelado_em: diasAtras(3) }
    expect(mensagensDaVez(toque('churn_1'), cancelou)[0]).toMatch(/cancelou/)
  })
});
