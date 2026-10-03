import { classificarEstagio, ESTAGIOS, ORDEM_ESTAGIOS } from './estagioConversa'
import { proximaAcao, mensagensDaVez, toque } from './funilFollowup'

const dele = (texto = 'oi', tipo = 'texto') => ({ direcao: 'in', tipo, texto })
const meu = (texto = 'olá', tipo = 'texto') => ({ direcao: 'out', tipo, texto })

describe('estágio da conversa (A, B, C, D)', () => {
  test('A: ele mandou só a primeira mensagem', () => {
    expect(classificarEstagio([dele('oi, quero saber do sistema'), meu('Oi! Tudo bem?')])).toBe('A')
    expect(classificarEstagio([dele('oi')])).toBe('A')
    expect(classificarEstagio([])).toBe('A')
  })

  test('B: conversaram, mas o preço não apareceu', () => {
    expect(classificarEstagio([
      dele('oi'), meu('Oi, como posso ajudar?'), dele('tenho uma escolinha'), meu('Legal, quantos alunos?'), dele('uns 80')
    ])).toBe('B')
  })

  test('C: o preço apareceu e não houve vídeo', () => {
    expect(classificarEstagio([
      dele('oi'), meu('Oi!'), dele('quanto custa?'), meu('O plano Pro sai R$ 99/mês')
    ])).toBe('C')
    // só ele perguntou o preço
    expect(classificarEstagio([dele('qual o valor?'), meu('Já te explico')])).toBe('C')
  })

  test('D: recebeu o vídeo e o preço', () => {
    expect(classificarEstagio([
      dele('oi'), meu('Oi!'), meu('Olha como funciona', 'video'), dele('legal'), meu('O plano Pro sai R$ 99/mês')
    ])).toBe('D')
  })

  test('D: vídeo enviado por link também conta', () => {
    expect(classificarEstagio([
      dele('quanto é?'), meu('R$ 99/mês. Veja: https://youtu.be/abc123')
    ])).toBe('D')
  })

  test('vídeo sem preço não é D: continua B ou A', () => {
    expect(classificarEstagio([dele('oi'), meu('veja', 'video'), dele('legal'), dele('e como funciona')])).toBe('B')
    expect(classificarEstagio([dele('oi'), meu('veja', 'video')])).toBe('A')
  })

  test('a ordem de prioridade põe o mais quente primeiro', () => {
    expect(ORDEM_ESTAGIOS).toEqual(['D', 'C', 'B', 'A'])
    ORDEM_ESTAGIOS.forEach(k => expect(ESTAGIOS[k].titulo).toBeTruthy())
  })
})

describe('Toque 1 e Toque 2 por estágio', () => {
  const lead = (estagio, extra = {}) => ({ id: 'l', status: 'conversando', nome: 'Fulano', estagio_conversa: estagio, ...extra })

  test('o Toque 1 usa o texto do estágio', () => {
    const t = toque('a_toque_1')
    expect(mensagensDaVez(t, lead('A'))[0]).toMatch(/Você me chamou/)
    expect(mensagensDaVez(t, lead('B'))[0]).toMatch(/lembrei de você/)
    expect(mensagensDaVez(t, lead('C'))[0]).toMatch(/Depois que te passei o valor/)
    expect(mensagensDaVez(t, lead('D'))[0]).toMatch(/^\[ÁUDIO\]/)
    expect(mensagensDaVez(t, lead('D'))).toHaveLength(3)
  })

  test('sem estágio conhecido, cai no texto padrão do toque', () => {
    const t = toque('a_toque_1')
    expect(mensagensDaVez(t, lead(undefined))).toEqual(t.mensagens)
  })

  test('o Reaquecimento (30+ dias) usa os mesmos textos por estágio', () => {
    expect(mensagensDaVez(toque('reaq_30'), lead('C'))[0]).toMatch(/Depois que te passei o valor/)
  })

  test('o Toque 2 é um texto só, igual pra todos os estágios', () => {
    const t = toque('a_toque_2')
    expect(t.variantes).toBeUndefined()
    expect(mensagensDaVez(t, lead('D'))).toEqual(t.mensagens)
    expect(t.mensagens[0]).toMatch(/última por aqui/)
  })

  test('a sequência é Toque 1 → (5 a 7 dias) → Toque 2 → Fora do funil', () => {
    expect(toque('a_toque_3')).toBeNull()
    const etapaDesde = '2026-10-01T12:00:00-03:00'
    const apos1 = proximaAcao({ id: 'l', status: 'a_toque_1', etapa_desde: etapaDesde, ultima_direcao: 'out', ultima_interacao: etapaDesde })
    expect(apos1.toque.id).toBe('a_toque_2')
    const apos2 = proximaAcao({ id: 'l', status: 'a_toque_2', etapa_desde: etapaDesde, ultima_direcao: 'out', ultima_interacao: etapaDesde })
    expect(apos2.tipo).toBe('mover')
    expect(apos2.para).toBe('perdido')
  })

  test('Aguardando sem resposta ao reforço cai no Toque 2', () => {
    const a = proximaAcao({
      id: 'l', status: 'aguardando', retornar_em: '2026-09-20', passo: 'aguardando_reforco',
      passo_em: '2026-09-25T12:00:00-03:00', ultima_direcao: 'out'
    })
    expect(a.toque.id).toBe('a_toque_2')
    expect(a.aoEnviar.status).toBe('a_toque_2')
  })
})
