/**
 * Helpers de busca textual para listas do app.
 */

/**
 * Normaliza texto para comparação: minúsculo e sem acentos.
 * @param {*} value
 * @returns {string}
 */
export function normalizarTexto(value) {
  if (value === null || value === undefined) return ''
  return String(value)
    .normalize('NFD')
    // U+0300-U+036F = acentos combinantes que o NFD separa da letra. Escapado de
    // propósito: com os caracteres literais, o range fica invisível no editor e
    // qualquer conversão de encoding do arquivo quebra a busca em silêncio.
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}

/**
 * Cria um matcher para um termo de busca.
 *
 * O termo casa se aparecer no texto de qualquer campo (ignorando acentos) ou,
 * quando tem ao menos 3 dígitos, nos dígitos de qualquer campo. A comparação
 * por dígitos existe porque telefone é gravado ora com máscara
 * ("(62) 98246-6639"), ora cru ("62982466639"), dependendo do caminho de
 * cadastro (formulário x importação de CSV x onboarding).
 *
 * @param {string} termo
 * @returns {(...campos: any[]) => boolean}
 */
export function criarMatcherBusca(termo) {
  const texto = normalizarTexto(termo)
  const digitos = String(termo || '').replace(/\D/g, '')

  return (...campos) => {
    if (!texto) return true

    if (campos.some(campo => normalizarTexto(campo).includes(texto))) return true

    if (digitos.length >= 3) {
      return campos.some(campo => String(campo ?? '').replace(/\D/g, '').includes(digitos))
    }

    return false
  }
}
