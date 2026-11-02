// Leitor mínimo de .zip (o .docx é um zip) usando só o Node, sem dependência.
// Lê o diretório central e descompacta um arquivo pelo nome.
'use strict'
const fs = require('fs')
const zlib = require('zlib')

function lerArquivoDoZip(caminhoZip, nomeInterno) {
  const buf = fs.readFileSync(caminhoZip)
  // Fim do diretório central (assinatura 0x06054b50), procurado de trás pra frente.
  let eocd = -1
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break }
  }
  if (eocd < 0) throw new Error(`${caminhoZip} não parece um .docx/.zip válido`)
  const total = buf.readUInt16LE(eocd + 10)
  let p = buf.readUInt32LE(eocd + 16)
  for (let n = 0; n < total; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) break
    const metodo = buf.readUInt16LE(p + 10)
    const tamComp = buf.readUInt32LE(p + 20)
    const lenNome = buf.readUInt16LE(p + 28)
    const lenExtra = buf.readUInt16LE(p + 30)
    const lenComent = buf.readUInt16LE(p + 32)
    const offLocal = buf.readUInt32LE(p + 42)
    const nome = buf.slice(p + 46, p + 46 + lenNome).toString('utf8')
    if (nome === nomeInterno) {
      const lnNome = buf.readUInt16LE(offLocal + 26)
      const lnExtra = buf.readUInt16LE(offLocal + 28)
      const ini = offLocal + 30 + lnNome + lnExtra
      const dados = buf.slice(ini, ini + tamComp)
      if (metodo === 0) return dados
      if (metodo === 8) return zlib.inflateRawSync(dados)
      throw new Error(`compressão ${metodo} não suportada`)
    }
    p += 46 + lenNome + lenExtra + lenComent
  }
  throw new Error(`${nomeInterno} não encontrado em ${caminhoZip}`)
}

module.exports = { lerArquivoDoZip }
