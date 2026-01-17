/**
 * Validadores para formulários
 * Inclui validação de CPF, CNPJ, telefone e outros campos
 */

/**
 * Valida CPF brasileiro
 * @param {string} cpf - CPF com ou sem formatação
 * @returns {boolean} - true se válido
 */
export function validarCPF(cpf) {
  if (!cpf) return false

  // Remove caracteres não numéricos
  cpf = cpf.replace(/\D/g, '')

  // Verifica se tem 11 dígitos
  if (cpf.length !== 11) return false

  // Verifica se todos os dígitos são iguais
  if (/^(\d)\1{10}$/.test(cpf)) return false

  // Validação do primeiro dígito verificador
  let soma = 0
  for (let i = 0; i < 9; i++) {
    soma += parseInt(cpf.charAt(i)) * (10 - i)
  }
  let resto = (soma * 10) % 11
  if (resto === 10 || resto === 11) resto = 0
  if (resto !== parseInt(cpf.charAt(9))) return false

  // Validação do segundo dígito verificador
  soma = 0
  for (let i = 0; i < 10; i++) {
    soma += parseInt(cpf.charAt(i)) * (11 - i)
  }
  resto = (soma * 10) % 11
  if (resto === 10 || resto === 11) resto = 0
  if (resto !== parseInt(cpf.charAt(10))) return false

  return true
}

/**
 * Valida CNPJ brasileiro
 * @param {string} cnpj - CNPJ com ou sem formatação
 * @returns {boolean} - true se válido
 */
export function validarCNPJ(cnpj) {
  if (!cnpj) return false

  // Remove caracteres não numéricos
  cnpj = cnpj.replace(/\D/g, '')

  // Verifica se tem 14 dígitos
  if (cnpj.length !== 14) return false

  // Verifica se todos os dígitos são iguais
  if (/^(\d)\1{13}$/.test(cnpj)) return false

  // Validação do primeiro dígito verificador
  let tamanho = cnpj.length - 2
  let numeros = cnpj.substring(0, tamanho)
  const digitos = cnpj.substring(tamanho)
  let soma = 0
  let pos = tamanho - 7

  for (let i = tamanho; i >= 1; i--) {
    soma += numeros.charAt(tamanho - i) * pos--
    if (pos < 2) pos = 9
  }

  let resultado = soma % 11 < 2 ? 0 : 11 - soma % 11
  if (resultado !== parseInt(digitos.charAt(0))) return false

  // Validação do segundo dígito verificador
  tamanho = tamanho + 1
  numeros = cnpj.substring(0, tamanho)
  soma = 0
  pos = tamanho - 7

  for (let i = tamanho; i >= 1; i--) {
    soma += numeros.charAt(tamanho - i) * pos--
    if (pos < 2) pos = 9
  }

  resultado = soma % 11 < 2 ? 0 : 11 - soma % 11
  if (resultado !== parseInt(digitos.charAt(1))) return false

  return true
}

/**
 * Valida CPF ou CNPJ
 * @param {string} documento - CPF ou CNPJ
 * @returns {boolean} - true se válido
 */
export function validarCPFouCNPJ(documento) {
  if (!documento) return false
  const limpo = documento.replace(/\D/g, '')
  if (limpo.length === 11) return validarCPF(limpo)
  if (limpo.length === 14) return validarCNPJ(limpo)
  return false
}

/**
 * Valida telefone brasileiro (fixo ou celular)
 * Aceita formatos: (XX) XXXXX-XXXX, (XX) XXXX-XXXX, ou apenas números
 * @param {string} telefone - Telefone com ou sem formatação
 * @returns {boolean} - true se válido
 */
export function validarTelefone(telefone) {
  if (!telefone) return false

  // Remove caracteres não numéricos
  const limpo = telefone.replace(/\D/g, '')

  // Telefone brasileiro: 10 dígitos (fixo) ou 11 dígitos (celular)
  if (limpo.length < 10 || limpo.length > 11) return false

  // DDD válido (11-99)
  const ddd = parseInt(limpo.substring(0, 2))
  if (ddd < 11 || ddd > 99) return false

  // Celular começa com 9
  if (limpo.length === 11 && limpo.charAt(2) !== '9') return false

  return true
}

/**
 * Formata CPF para exibição
 * @param {string} cpf - CPF apenas números
 * @returns {string} - CPF formatado (XXX.XXX.XXX-XX)
 */
export function formatarCPF(cpf) {
  if (!cpf) return ''
  const limpo = cpf.replace(/\D/g, '')
  if (limpo.length !== 11) return cpf
  return limpo.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')
}

/**
 * Formata CNPJ para exibição
 * @param {string} cnpj - CNPJ apenas números
 * @returns {string} - CNPJ formatado (XX.XXX.XXX/XXXX-XX)
 */
export function formatarCNPJ(cnpj) {
  if (!cnpj) return ''
  const limpo = cnpj.replace(/\D/g, '')
  if (limpo.length !== 14) return cnpj
  return limpo.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5')
}

/**
 * Formata telefone para exibição
 * @param {string} telefone - Telefone apenas números
 * @returns {string} - Telefone formatado ((XX) XXXXX-XXXX ou (XX) XXXX-XXXX)
 */
export function formatarTelefone(telefone) {
  if (!telefone) return ''
  const limpo = telefone.replace(/\D/g, '')

  if (limpo.length === 11) {
    return limpo.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3')
  } else if (limpo.length === 10) {
    return limpo.replace(/(\d{2})(\d{4})(\d{4})/, '($1) $2-$3')
  }

  return telefone
}

/**
 * Máscara de CPF enquanto digita
 * @param {string} value - Valor atual
 * @returns {string} - Valor com máscara
 */
export function mascaraCPF(value) {
  if (!value) return ''
  return value
    .replace(/\D/g, '')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d{1,2})/, '$1-$2')
    .replace(/(-\d{2})\d+?$/, '$1')
}

/**
 * Máscara de CNPJ enquanto digita
 * @param {string} value - Valor atual
 * @returns {string} - Valor com máscara
 */
export function mascaraCNPJ(value) {
  if (!value) return ''
  return value
    .replace(/\D/g, '')
    .replace(/(\d{2})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1/$2')
    .replace(/(\d{4})(\d{1,2})/, '$1-$2')
    .replace(/(-\d{2})\d+?$/, '$1')
}

/**
 * Máscara de telefone enquanto digita
 * @param {string} value - Valor atual
 * @returns {string} - Valor com máscara
 */
export function mascaraTelefone(value) {
  if (!value) return ''
  const limpo = value.replace(/\D/g, '')

  if (limpo.length <= 10) {
    return limpo
      .replace(/(\d{2})(\d)/, '($1) $2')
      .replace(/(\d{4})(\d)/, '$1-$2')
      .replace(/(-\d{4})\d+?$/, '$1')
  } else {
    return limpo
      .replace(/(\d{2})(\d)/, '($1) $2')
      .replace(/(\d{5})(\d)/, '$1-$2')
      .replace(/(-\d{4})\d+?$/, '$1')
  }
}

/**
 * Remove formatação de documento/telefone
 * @param {string} value - Valor formatado
 * @returns {string} - Apenas números
 */
export function removerFormatacao(value) {
  if (!value) return ''
  return value.replace(/\D/g, '')
}
