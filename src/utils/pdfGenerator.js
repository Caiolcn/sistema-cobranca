/**
 * Gerador de recibos em PDF
 * Usa jsPDF para gerar PDFs reais
 */
import { jsPDF } from 'jspdf'

/**
 * Carrega imagem como data URL (para uso com jsPDF addImage).
 * Retorna null se a imagem não puder ser carregada (CORS, 404, etc).
 */
function loadImageAsDataURL(url) {
  return new Promise((resolve) => {
    if (!url) { resolve(null); return }
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas')
        canvas.width = img.naturalWidth
        canvas.height = img.naturalHeight
        const ctx = canvas.getContext('2d')
        ctx.drawImage(img, 0, 0)
        resolve({ dataUrl: canvas.toDataURL('image/png'), width: img.naturalWidth, height: img.naturalHeight })
      } catch (e) {
        resolve(null)
      }
    }
    img.onerror = () => resolve(null)
    img.src = url
  })
}

/**
 * Gera um recibo de pagamento em PDF
 * @param {Object} dados - Dados do recibo
 * @param {Object|null} logo - { dataUrl, width, height } pré-carregado
 * @returns {jsPDF} - Documento PDF
 */
function criarReciboPDF(dados, logo = null) {
  const {
    nomeCliente,
    telefoneCliente,
    valor,
    dataVencimento,
    dataPagamento,
    formaPagamento,
    nomeEmpresa,
    chavePix,
    cpfCnpj,
    emailEmpresa,
    telefoneEmpresa,
    descricao
  } = dados

  // Período de referência: se descrição for "Mensalidade" e houver vencimento,
  // anexa "- Mês/Ano" (ex: "Mensalidade - Maio/2026")
  const MESES_PT = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
                    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']
  let descricaoFinal = descricao || ''
  if (descricao && descricao.toLowerCase().startsWith('mensalidade') && dataVencimento && !descricao.includes('/')) {
    const dv = new Date(dataVencimento + 'T00:00:00')
    if (!isNaN(dv)) {
      descricaoFinal = `${descricao} - ${MESES_PT[dv.getMonth()]}/${dv.getFullYear()}`
    }
  }

  // Criar PDF (A5 landscape para recibo compacto)
  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a5'
  })

  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const margin = 15
  const contentWidth = pageWidth - (margin * 2)

  // Número do recibo
  const numeroRecibo = `REC-${Date.now().toString(36).toUpperCase()}`

  // ============ HEADER ============
  // Fundo do header
  doc.setFillColor(52, 72, 72) // #344848
  doc.rect(0, 0, pageWidth, 25, 'F')

  // Título
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(18)
  doc.setFont('helvetica', 'bold')
  doc.text('RECIBO DE PAGAMENTO', pageWidth / 2, 12, { align: 'center' })

  // Subtítulo com número
  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  doc.text(numeroRecibo, pageWidth / 2, 19, { align: 'center' })

  // Linha decorativa verde
  doc.setFillColor(76, 175, 80) // #4CAF50
  doc.rect(0, 25, pageWidth, 2, 'F')

  // ============ LOGO + NOME DA EMPRESA (centralizados como grupo) ============
  doc.setTextColor(52, 72, 72)
  doc.setFontSize(12)
  doc.setFont('helvetica', 'bold')

  const empresaTexto = nomeEmpresa || 'Empresa'
  const nomeWidth = doc.getTextWidth(empresaTexto)

  if (logo?.dataUrl) {
    const logoSize = 9 // mm (compacto pra ficar junto do texto)
    const aspect = logo.width / logo.height
    const logoW = aspect >= 1 ? logoSize : logoSize * aspect
    const logoH = aspect >= 1 ? logoSize / aspect : logoSize
    const gap = 3
    const groupWidth = logoW + gap + nomeWidth
    const startX = (pageWidth - groupWidth) / 2
    const logoY = 35 - logoH / 2 - 1 // centraliza vertical com o texto

    doc.addImage(logo.dataUrl, 'PNG', startX, logoY, logoW, logoH, undefined, 'FAST')
    doc.text(empresaTexto, startX + logoW + gap, 35)
  } else {
    doc.text(empresaTexto, pageWidth / 2, 35, { align: 'center' })
  }

  // Linha de dados do emissor (CNPJ/CPF + chave PIX)
  const dadosEmissor = []
  if (cpfCnpj) dadosEmissor.push(`CNPJ/CPF: ${cpfCnpj}`)
  if (chavePix) dadosEmissor.push(`Chave PIX: ${chavePix}`)

  if (dadosEmissor.length > 0) {
    doc.setFontSize(8)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(100, 100, 100)
    doc.text(dadosEmissor.join('  •  '), pageWidth / 2, 40, { align: 'center' })
  }

  // Linha separadora
  doc.setDrawColor(220, 220, 220)
  doc.setLineWidth(0.3)
  doc.line(margin, 45, pageWidth - margin, 45)

  // ============ CORPO DO RECIBO ============
  let yPos = 55

  // Layout em duas colunas alinhado com padding interno do valor box
  const col1X = margin + 5
  const col2X = pageWidth - margin - 50

  // === COLUNA 1: Dados do Cliente ===
  doc.setTextColor(100, 100, 100)
  doc.setFontSize(8)
  doc.setFont('helvetica', 'normal')
  doc.text('CLIENTE', col1X, yPos)

  doc.setTextColor(51, 51, 51)
  doc.setFontSize(11)
  doc.setFont('helvetica', 'bold')
  doc.text(nomeCliente || 'N/A', col1X, yPos + 6)

  if (telefoneCliente) {
    doc.setFontSize(9)
    doc.setFont('helvetica', 'normal')
    doc.text(telefoneCliente, col1X, yPos + 12)
  }

  // === COLUNA 2: Datas ===
  doc.setTextColor(100, 100, 100)
  doc.setFontSize(8)
  doc.setFont('helvetica', 'normal')
  doc.text('VENCIMENTO', col2X, yPos)

  const vencFormatado = dataVencimento
    ? new Date(dataVencimento + 'T00:00:00').toLocaleDateString('pt-BR')
    : 'N/A'
  doc.setTextColor(51, 51, 51)
  doc.setFontSize(10)
  doc.setFont('helvetica', 'bold')
  doc.text(vencFormatado, col2X, yPos + 6)

  doc.setTextColor(100, 100, 100)
  doc.setFontSize(8)
  doc.setFont('helvetica', 'normal')
  doc.text('PAGAMENTO', col2X, yPos + 12)

  const pagFormatado = dataPagamento
    ? new Date(dataPagamento).toLocaleDateString('pt-BR')
    : new Date().toLocaleDateString('pt-BR')
  doc.setTextColor(51, 51, 51)
  doc.setFontSize(10)
  doc.setFont('helvetica', 'bold')
  doc.text(pagFormatado, col2X, yPos + 18)

  // ============ VALOR EM DESTAQUE ============
  yPos = 88

  // Box do valor
  doc.setFillColor(232, 245, 233) // Verde claro
  doc.roundedRect(margin, yPos - 8, contentWidth, 25, 3, 3, 'F')

  doc.setTextColor(100, 100, 100)
  doc.setFontSize(9)
  doc.setFont('helvetica', 'bold')
  doc.text('VALOR PAGO', margin + 5, yPos)

  const valorFormatado = `R$ ${parseFloat(valor || 0).toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`

  doc.setTextColor(46, 125, 50) // Verde escuro
  doc.setFontSize(22)
  doc.setFont('helvetica', 'bold')
  doc.text(valorFormatado, margin + 5, yPos + 12)

  // Forma de pagamento à direita
  doc.setTextColor(100, 100, 100)
  doc.setFontSize(8)
  doc.setFont('helvetica', 'normal')
  doc.text('FORMA DE PAGAMENTO', pageWidth - margin - 50, yPos)

  doc.setTextColor(51, 51, 51)
  doc.setFontSize(11)
  doc.setFont('helvetica', 'bold')
  doc.text(formaPagamento || 'Não informado', pageWidth - margin - 50, yPos + 8)

  // ============ DESCRIÇÃO ============
  if (descricaoFinal) {
    yPos = 115
    doc.setTextColor(100, 100, 100)
    doc.setFontSize(8)
    doc.setFont('helvetica', 'normal')
    doc.text('DESCRIÇÃO', margin, yPos)

    doc.setTextColor(51, 51, 51)
    doc.setFontSize(10)
    doc.setFont('helvetica', 'normal')
    doc.text(descricaoFinal, margin, yPos + 6)
  }

  // ============ SELO "PAGO" (canto superior direito) ============
  const seloW = 30
  const seloH = 11
  const seloX = pageWidth - margin - seloW
  const seloY = 31

  // Fundo verde claro com borda verde
  doc.setFillColor(232, 245, 233)
  doc.setDrawColor(76, 175, 80)
  doc.setLineWidth(0.8)
  doc.roundedRect(seloX, seloY, seloW, seloH, 2, 2, 'FD')

  // Texto "PAGO"
  doc.setTextColor(46, 125, 50)
  doc.setFontSize(13)
  doc.setFont('helvetica', 'bold')
  doc.text('PAGO', seloX + seloW / 2, seloY + seloH / 2 + 1.5, { align: 'center' })

  // ============ FOOTER ============
  // Fundo do footer
  doc.setFillColor(245, 245, 245)
  doc.rect(0, pageHeight - 22, pageWidth, 22, 'F')

  // Linha de contato do emissor
  const contato = []
  if (emailEmpresa) contato.push(emailEmpresa)
  if (telefoneEmpresa) contato.push(telefoneEmpresa)

  doc.setTextColor(80, 80, 80)
  doc.setFontSize(8)
  doc.setFont('helvetica', 'bold')
  if (contato.length > 0) {
    doc.text(contato.join('  •  '), pageWidth / 2, pageHeight - 15, { align: 'center' })
  }

  // Texto do footer
  doc.setTextColor(100, 100, 100)
  doc.setFontSize(8)
  doc.setFont('helvetica', 'normal')
  doc.text(
    'Este recibo comprova o pagamento referente ao serviço prestado.',
    pageWidth / 2,
    pageHeight - 10,
    { align: 'center' }
  )

  doc.setFontSize(7)
  doc.text(
    `Gerado em ${new Date().toLocaleString('pt-BR')}`,
    pageWidth / 2,
    pageHeight - 5,
    { align: 'center' }
  )

  return doc
}

/**
 * Gera e baixa o recibo como PDF
 * @param {Object} dados - Dados do recibo
 */
export async function baixarRecibo(dados) {
  const logo = await loadImageAsDataURL(dados.logoUrl)
  const doc = criarReciboPDF(dados, logo)
  const nomeArquivo = `recibo_${dados.nomeCliente?.replace(/\s+/g, '_') || 'cliente'}_${new Date().toISOString().split('T')[0]}.pdf`
  doc.save(nomeArquivo)
}

/**
 * Abre o recibo em nova aba para impressão
 * @param {Object} dados - Dados do recibo
 */
export async function imprimirRecibo(dados) {
  const logo = await loadImageAsDataURL(dados.logoUrl)
  const doc = criarReciboPDF(dados, logo)

  // Abrir PDF em nova aba
  const pdfBlob = doc.output('blob')
  const pdfUrl = URL.createObjectURL(pdfBlob)

  const printWindow = window.open(pdfUrl, '_blank')
  if (printWindow) {
    printWindow.onload = () => {
      setTimeout(() => {
        printWindow.print()
      }, 500)
    }
  }
}

/**
 * Retorna o PDF como Blob (para enviar por WhatsApp ou email)
 * @param {Object} dados - Dados do recibo
 * @returns {Promise<Blob>} - PDF como Blob
 */
export async function gerarReciboBlob(dados) {
  const logo = await loadImageAsDataURL(dados.logoUrl)
  const doc = criarReciboPDF(dados, logo)
  return doc.output('blob')
}

/**
 * Retorna o PDF como Data URL (para preview)
 * @param {Object} dados - Dados do recibo
 * @returns {string} - Data URL do PDF
 */
export async function gerarReciboDataURL(dados) {
  const logo = await loadImageAsDataURL(dados.logoUrl)
  const doc = criarReciboPDF(dados, logo)
  return doc.output('dataurlstring')
}

/**
 * Gera relatório de despesas em PDF (formato tabular)
 * @param {Array} despesas - Lista de despesas
 * @param {Object} resumo - Resumo com totais
 * @param {string} nomeEmpresa - Nome da empresa
 */
export function gerarRelatorioDespesasPDF(despesas, resumo, nomeEmpresa) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const margin = 15
  const contentWidth = pageWidth - margin * 2

  // ============ HEADER ============
  doc.setFillColor(52, 72, 72) // #344848
  doc.rect(0, 0, pageWidth, 22, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(16)
  doc.setFont('helvetica', 'bold')
  doc.text('RELATÓRIO DE DESPESAS', pageWidth / 2, 14, { align: 'center' })

  // Linha decorativa
  doc.setFillColor(76, 175, 80)
  doc.rect(0, 22, pageWidth, 2, 'F')

  // Empresa e data
  doc.setTextColor(52, 72, 72)
  doc.setFontSize(11)
  doc.setFont('helvetica', 'bold')
  doc.text(nomeEmpresa || 'Empresa', margin, 32)
  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(100, 100, 100)
  doc.text(`Gerado em ${new Date().toLocaleString('pt-BR')}`, margin, 38)

  // ============ RESUMO ============
  let yPos = 46

  const formatarMoeda = (valor) => {
    return `R$ ${parseFloat(valor || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  }

  // Caixas de resumo
  const boxWidth = (contentWidth - 10) / 3
  const boxes = [
    { label: 'Pendente', valor: formatarMoeda(resumo.totalPendente), cor: [244, 67, 54] },
    { label: 'Pago no mês', valor: formatarMoeda(resumo.totalPagoMes), cor: [76, 175, 80] },
    { label: 'Total do mês', valor: formatarMoeda(resumo.totalMes), cor: [33, 150, 243] }
  ]

  boxes.forEach((box, i) => {
    const x = margin + (boxWidth + 5) * i
    doc.setFillColor(245, 245, 245)
    doc.roundedRect(x, yPos, boxWidth, 18, 2, 2, 'F')
    doc.setFillColor(...box.cor)
    doc.rect(x, yPos, 2, 18, 'F')

    doc.setFontSize(8)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(100, 100, 100)
    doc.text(box.label, x + 6, yPos + 7)

    doc.setFontSize(11)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(26, 26, 26)
    doc.text(box.valor, x + 6, yPos + 14)
  })

  yPos += 26

  // ============ TABELA ============
  // Header da tabela
  const colWidths = [65, 35, 28, 30, 22]
  const colHeaders = ['Descrição', 'Categoria', 'Vencimento', 'Valor', 'Status']
  const colAligns = ['left', 'left', 'left', 'right', 'center']

  doc.setFillColor(52, 72, 72)
  doc.rect(margin, yPos, contentWidth, 8, 'F')
  doc.setFontSize(8)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(255, 255, 255)

  let colX = margin + 3
  colHeaders.forEach((header, i) => {
    const align = colAligns[i]
    const textX = align === 'right' ? colX + colWidths[i] - 3 : align === 'center' ? colX + colWidths[i] / 2 : colX
    doc.text(header, textX, yPos + 5.5, { align })
    colX += colWidths[i]
  })

  yPos += 8

  // Linhas da tabela
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)

  despesas.forEach((despesa, index) => {
    // Verificar se precisa nova página
    if (yPos > pageHeight - 25) {
      doc.addPage()
      yPos = 15

      // Repetir header da tabela
      doc.setFillColor(52, 72, 72)
      doc.rect(margin, yPos, contentWidth, 8, 'F')
      doc.setFontSize(8)
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(255, 255, 255)

      colX = margin + 3
      colHeaders.forEach((header, i) => {
        const align = colAligns[i]
        const textX = align === 'right' ? colX + colWidths[i] - 3 : align === 'center' ? colX + colWidths[i] / 2 : colX
        doc.text(header, textX, yPos + 5.5, { align })
        colX += colWidths[i]
      })

      yPos += 8
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(8)
    }

    // Fundo alternado
    if (index % 2 === 0) {
      doc.setFillColor(250, 250, 250)
      doc.rect(margin, yPos, contentWidth, 7, 'F')
    }

    doc.setTextColor(51, 51, 51)
    colX = margin + 3

    // Descrição
    const descricao = (despesa.descricao || '').substring(0, 35)
    doc.text(descricao, colX, yPos + 5)
    colX += colWidths[0]

    // Categoria
    const categoria = (despesa.categorias_despesas?.nome || '-').substring(0, 18)
    doc.text(categoria, colX, yPos + 5)
    colX += colWidths[1]

    // Vencimento
    const venc = despesa.data_vencimento
      ? new Date(despesa.data_vencimento + 'T00:00:00').toLocaleDateString('pt-BR')
      : '-'
    doc.text(venc, colX, yPos + 5)
    colX += colWidths[2]

    // Valor
    const valorStr = formatarMoeda(despesa.valor)
    doc.text(valorStr, colX + colWidths[3] - 3, yPos + 5, { align: 'right' })
    colX += colWidths[3]

    // Status
    const statusText = despesa.status === 'pago' ? 'Pago' : despesa.status === 'pendente' ? 'Pendente' : 'Cancelado'
    if (despesa.status === 'pago') doc.setTextColor(76, 175, 80)
    else if (despesa.status === 'pendente') doc.setTextColor(33, 150, 243)
    else doc.setTextColor(158, 158, 158)
    doc.text(statusText, colX + colWidths[4] / 2, yPos + 5, { align: 'center' })

    doc.setTextColor(51, 51, 51)
    yPos += 7
  })

  // ============ FOOTER ============
  const totalPages = doc.internal.getNumberOfPages()
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i)
    doc.setFillColor(245, 245, 245)
    doc.rect(0, pageHeight - 12, pageWidth, 12, 'F')
    doc.setTextColor(100, 100, 100)
    doc.setFontSize(7)
    doc.setFont('helvetica', 'normal')
    doc.text(
      `${despesas.length} despesa(s) | Página ${i} de ${totalPages}`,
      pageWidth / 2,
      pageHeight - 5,
      { align: 'center' }
    )
  }

  doc.save(`relatorio_despesas_${new Date().toISOString().split('T')[0]}.pdf`)
}
