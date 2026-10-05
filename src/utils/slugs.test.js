import { slugEhReservado, slugificar, validarSlug } from './slugs'

describe('endereço da academia', () => {
  test('rotas fixas do app são reservadas (inclusive as que faltavam)', () => {
    ;['login', 'app', 'admin', 'agendar', 'links', 'cadastro', 'contrato', 'ver-como', 'bio',
      'sistema-para-escolinhas', 'sistema-para-academia-de-luta'].forEach(s => {
      expect(slugEhReservado(s)).toBe(true)
    })
    expect(slugEhReservado('  LINKS ')).toBe(true)
    expect(slugEhReservado('studioblackbelt')).toBe(false)
  })

  test('slugificar tira acento, espaço e símbolo', () => {
    expect(slugificar('Studio Black Belt!')).toBe('studio-black-belt')
    expect(slugificar('  Escolinha São João  ')).toBe('escolinha-sao-joao')
    expect(slugificar('CT Soares — Artes Marciais')).toBe('ct-soares-artes-marciais')
    expect(slugificar('')).toBe('')
  })

  test('validação com mensagem pronta', () => {
    expect(validarSlug('ab').ok).toBe(false)
    expect(validarSlug('meu site').ok).toBe(false)
    expect(validarSlug('Academia_X').ok).toBe(false)
    expect(validarSlug('-comeca-com-hifen').ok).toBe(false)
    expect(validarSlug('termina-hifen-').ok).toBe(false)
    expect(validarSlug('links')).toMatchObject({ ok: false })
    expect(validarSlug('links').erro).toMatch(/reservada/)
    expect(validarSlug('a'.repeat(41)).ok).toBe(false)
    expect(validarSlug('muaythaischool').ok).toBe(true)
    expect(validarSlug('ct-soares-artes-marciais').ok).toBe(true)
  })
})
