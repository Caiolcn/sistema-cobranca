import { validarTelefone, validarCPF } from './validators'

/**
 * Parseia texto CSV em array de arrays
 * Suporte a: BOM UTF-8, delimitador ; (Excel BR) e ,, campos entre aspas
 */
export function parseCSV(text) {
  if (!text || !text.trim()) return { headers: [], rows: [] }

  // Remove BOM se presente
  if (text.charCodeAt(0) === 0xFEFF) {
    text = text.slice(1)
  }

  // Detectar delimitador (Excel BR usa ;)
  const firstLine = text.split(/\r?\n/)[0]
  const semicolonCount = (firstLine.match(/;/g) || []).length
  const commaCount = (firstLine.match(/,/g) || []).length
  const delimiter = semicolonCount > commaCount ? ';' : ','

  const rows = []
  let currentRow = []
  let currentField = ''
  let inQuotes = false

  for (let i = 0; i < text.length; i++) {
    const char = text[i]

    if (char === '"') {
      if (inQuotes && text[i + 1] === '"') {
        currentField += '"'
        i++
      } else {
        inQuotes = !inQuotes
      }
    } else if (char === delimiter && !inQuotes) {
      currentRow.push(currentField.trim())
      currentField = ''
    } else if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && text[i + 1] === '\n') i++
      currentRow.push(currentField.trim())
      if (currentRow.some(f => f !== '')) {
        rows.push(currentRow)
      }
      currentRow = []
      currentField = ''
    } else {
      currentField += char
    }
  }

  // Ultima linha (se nao terminar com newline)
  if (currentField || currentRow.length > 0) {
    currentRow.push(currentField.trim())
    if (currentRow.some(f => f !== '')) {
      rows.push(currentRow)
    }
  }

  if (rows.length === 0) return { headers: [], rows: [] }

  return {
    headers: rows[0],
    rows: rows.slice(1)
  }
}

/**
 * Detecta mapeamento de colunas baseado nos headers
 * Retorna: { nome: indexColuna, telefone: indexColuna, cpf: indexColuna, plano: indexColuna }
 */
export function detectColumnMapping(headers) {
  const mapping = {}
  const lowerHeaders = headers.map(h => h.toLowerCase().trim())

  const namePatterns = ['nome', 'name', 'nome_completo', 'nome completo', 'cliente', 'aluno']
  const phonePatterns = ['telefone', 'phone', 'celular', 'whatsapp', 'tel', 'fone', 'numero']
  const cpfPatterns = ['cpf', 'documento', 'cpf_cnpj', 'doc']
  const planPatterns = ['plano', 'plan', 'plano nome', 'assinatura']

  lowerHeaders.forEach((header, index) => {
    if (!mapping.nome && namePatterns.some(p => header.includes(p))) {
      mapping.nome = index
    }
    if (!mapping.telefone && phonePatterns.some(p => header.includes(p))) {
      mapping.telefone = index
    }
    if (!mapping.cpf && cpfPatterns.some(p => header.includes(p))) {
      mapping.cpf = index
    }
    if (!mapping.plano && planPatterns.some(p => header.includes(p))) {
      mapping.plano = index
    }
  })

  return mapping
}

/**
 * Valida uma linha do CSV
 * Retorna: { valid: boolean, errors: string[], data: { nome, telefone, cpf, plano } }
 */
export function validateRow(row, mapping, existingPhones, planos) {
  const errors = []
  const data = {}

  // Nome (obrigatorio)
  if (mapping.nome !== undefined && mapping.nome < row.length) {
    data.nome = row[mapping.nome]?.trim()
  }
  if (!data.nome || data.nome.length < 2) {
    errors.push('Nome obrigatório (mín. 2 caracteres)')
  }

  // Telefone (obrigatorio)
  if (mapping.telefone !== undefined && mapping.telefone < row.length) {
    const rawPhone = row[mapping.telefone]?.trim() || ''
    data.telefone = rawPhone.replace(/\D/g, '')
  }
  if (!data.telefone) {
    errors.push('Telefone obrigatório')
  } else if (!validarTelefone(data.telefone)) {
    errors.push('Telefone inválido')
  } else if (existingPhones.has(data.telefone)) {
    errors.push('Telefone já cadastrado')
  }

  // CPF (opcional)
  if (mapping.cpf !== undefined && mapping.cpf < row.length) {
    const rawCpf = row[mapping.cpf]?.trim() || ''
    if (rawCpf) {
      data.cpf = rawCpf.replace(/\D/g, '')
      if (!validarCPF(data.cpf)) {
        errors.push('CPF inválido')
      }
    }
  }

  // Plano (opcional)
  if (mapping.plano !== undefined && mapping.plano < row.length) {
    const planoNome = row[mapping.plano]?.trim() || ''
    if (planoNome && planos?.length > 0) {
      const planoEncontrado = planos.find(p =>
        p.nome.toLowerCase() === planoNome.toLowerCase()
      )
      if (planoEncontrado) {
        data.plano_id = planoEncontrado.id
        data.plano_nome = planoEncontrado.nome
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    data
  }
}
