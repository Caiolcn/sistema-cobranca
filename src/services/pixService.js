/**
 * Serviço para geração de PIX Copia e Cola
 * Segue o padrão EMV/BR Code do Banco Central
 * Referência: https://www.bcb.gov.br/content/estabilidadefinanceira/pix/Regulamento_Pix/II_ManualdePadroesparaIniciacaodoPix.pdf
 */

/**
 * Calcula o CRC16 (CCITT-FALSE) para validação do código PIX
 * Polynomial: 0x1021, Initial: 0xFFFF
 */
function crc16(str) {
  const polynomial = 0x1021
  let crc = 0xFFFF

  for (let i = 0; i < str.length; i++) {
    const byte = str.charCodeAt(i)
    crc ^= (byte << 8)

    for (let j = 0; j < 8; j++) {
      if ((crc & 0x8000) !== 0) {
        crc = ((crc << 1) ^ polynomial) & 0xFFFF
      } else {
        crc = (crc << 1) & 0xFFFF
      }
    }
  }

  return crc.toString(16).toUpperCase().padStart(4, '0')
}

/**
 * Remove acentos e caracteres especiais de um texto
 */
function sanitize(text) {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9 ]/g, '')
    .toUpperCase()
    .trim()
}

/**
 * Monta um campo TLV (Tag-Length-Value)
 */
function tlv(tag, value) {
  const len = value.length.toString().padStart(2, '0')
  return `${tag}${len}${value}`
}

/**
 * Formata a chave PIX conforme o tipo detectado
 * - Telefone: adiciona +55 se não tiver
 * - CPF/CNPJ: remove formatação
 * - Email: mantém como está
 * - Chave aleatória: mantém como está
 */
function formatarChavePix(chave) {
  const chaveLimpa = chave.trim()

  // Se já começa com +, é telefone formatado
  if (chaveLimpa.startsWith('+')) {
    return chaveLimpa
  }

  // Se é apenas números e tem 10-11 dígitos, é telefone brasileiro
  const apenasNumeros = chaveLimpa.replace(/\D/g, '')
  if (/^\d{10,11}$/.test(apenasNumeros)) {
    return `+55${apenasNumeros}`
  }

  // CPF (11 dígitos) ou CNPJ (14 dígitos) - retorna só números
  if (/^\d{11}$/.test(apenasNumeros) || /^\d{14}$/.test(apenasNumeros)) {
    return apenasNumeros
  }

  // Email ou chave aleatória - retorna como está
  return chaveLimpa
}

/**
 * Gera o código PIX Copia e Cola (EMV BR Code)
 *
 * @param {Object} dados - Dados do pagamento
 * @param {string} dados.chavePix - Chave PIX do recebedor
 * @param {number} dados.valor - Valor do pagamento
 * @param {string} dados.nomeRecebedor - Nome do recebedor (máx 25 caracteres)
 * @param {string} dados.cidadeRecebedor - Cidade do recebedor (máx 15 caracteres)
 * @param {string} [dados.txid] - ID da transação (máx 25 caracteres)
 * @returns {string} Código PIX Copia e Cola
 */
export function gerarPixCopiaCola({
  chavePix,
  valor,
  nomeRecebedor,
  cidadeRecebedor,
  txid = '***'
}) {
  // Validações
  if (!chavePix) throw new Error('Chave PIX é obrigatória')
  if (!valor || valor <= 0) throw new Error('Valor deve ser maior que zero')
  if (!nomeRecebedor) throw new Error('Nome do recebedor é obrigatório')
  if (!cidadeRecebedor) throw new Error('Cidade do recebedor é obrigatória')

  // Formatar chave PIX conforme o tipo
  const chave = formatarChavePix(chavePix)
  const nome = sanitize(nomeRecebedor).substring(0, 25) || 'RECEBEDOR'
  const cidade = sanitize(cidadeRecebedor).substring(0, 15) || 'CIDADE'
  const valorStr = valor.toFixed(2)
  const txidClean = txid.replace(/[^a-zA-Z0-9*]/g, '').substring(0, 25) || '***'

  // Merchant Account Information (ID 26)
  // - 00: GUI do PIX
  // - 01: Chave PIX
  const merchantAccount = tlv('00', 'br.gov.bcb.pix') + tlv('01', chave)

  // Additional Data Field (ID 62)
  // - 05: Reference Label (TXID)
  const additionalData = tlv('05', txidClean)

  // Montar payload (sem CRC)
  let payload = ''
  payload += tlv('00', '01')                      // Payload Format Indicator
  payload += tlv('26', merchantAccount)           // Merchant Account Info (PIX)
  payload += tlv('52', '0000')                    // Merchant Category Code
  payload += tlv('53', '986')                     // Transaction Currency (BRL)
  payload += tlv('54', valorStr)                  // Transaction Amount
  payload += tlv('58', 'BR')                      // Country Code
  payload += tlv('59', nome)                      // Merchant Name
  payload += tlv('60', cidade)                    // Merchant City
  payload += tlv('62', additionalData)            // Additional Data

  // Adicionar campo CRC (ID 63, tamanho 04)
  payload += '6304'

  // Calcular CRC16 e anexar
  const checksum = crc16(payload)

  return payload + checksum
}

/**
 * Valida se uma string é um código PIX válido
 */
export function validarPixCopiaCola(codigo) {
  if (!codigo || codigo.length < 50) return false

  // Verificar se começa com Payload Format Indicator
  if (!codigo.startsWith('000201')) return false

  // Verificar CRC16
  const payloadSemCRC = codigo.slice(0, -4)
  const crcInformado = codigo.slice(-4)
  const crcCalculado = crc16(payloadSemCRC + '6304')

  return crcInformado === crcCalculado
}

/**
 * Gera um TXID único para a transação (apenas alfanumérico)
 */
export function gerarTxId(mensalidadeId) {
  // Pegar apenas os primeiros 8 caracteres alfanuméricos do ID
  const idClean = mensalidadeId.toString().replace(/[^a-zA-Z0-9]/g, '').substring(0, 8)
  const timestamp = Date.now().toString(36).toUpperCase()
  return `TX${idClean}${timestamp}`.substring(0, 25)
}

export default {
  gerarPixCopiaCola,
  validarPixCopiaCola,
  gerarTxId
}
