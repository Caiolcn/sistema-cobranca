/**
 * Gerador de recibos em PDF
 * Usa jsPDF para gerar PDFs reais
 */
import { jsPDF } from 'jspdf'

/**
 * Gera um recibo de pagamento em PDF
 * @param {Object} dados - Dados do recibo
 * @returns {jsPDF} - Documento PDF
 */
function criarReciboPDF(dados) {
  const {
    nomeCliente,
    telefoneCliente,
    valor,
    dataVencimento,
    dataPagamento,
    formaPagamento,
    nomeEmpresa,
    chavePix,
    descricao
  } = dados

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

  // ============ DADOS DA EMPRESA ============
  doc.setTextColor(52, 72, 72)
  doc.setFontSize(12)
  doc.setFont('helvetica', 'bold')
  doc.text(nomeEmpresa || 'Empresa', pageWidth / 2, 35, { align: 'center' })

  if (chavePix) {
    doc.setFontSize(8)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(100, 100, 100)
    doc.text(`Chave PIX: ${chavePix}`, pageWidth / 2, 40, { align: 'center' })
  }

  // Linha separadora
  doc.setDrawColor(220, 220, 220)
  doc.setLineWidth(0.3)
  doc.line(margin, 45, pageWidth - margin, 45)

  // ============ CORPO DO RECIBO ============
  let yPos = 55

  // Layout em duas colunas
  const col1X = margin
  const col2X = pageWidth / 2 + 10

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
  doc.text('PAGAMENTO', col2X, yPos + 16)

  const pagFormatado = dataPagamento
    ? new Date(dataPagamento).toLocaleDateString('pt-BR')
    : new Date().toLocaleDateString('pt-BR')
  doc.setTextColor(51, 51, 51)
  doc.setFontSize(10)
  doc.setFont('helvetica', 'bold')
  doc.text(pagFormatado, col2X, yPos + 22)

  // ============ VALOR EM DESTAQUE ============
  yPos = 90

  // Box do valor
  doc.setFillColor(232, 245, 233) // Verde claro
  doc.roundedRect(margin, yPos - 8, contentWidth, 25, 3, 3, 'F')

  doc.setTextColor(100, 100, 100)
  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
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
  if (descricao) {
    yPos = 120
    doc.setTextColor(100, 100, 100)
    doc.setFontSize(8)
    doc.setFont('helvetica', 'normal')
    doc.text('DESCRIÇÃO', margin, yPos)

    doc.setTextColor(51, 51, 51)
    doc.setFontSize(10)
    doc.setFont('helvetica', 'normal')
    doc.text(descricao, margin, yPos + 6)
  }

  // ============ MARCA D'ÁGUA "PAGO" ============
  doc.setTextColor(76, 175, 80, 30) // Verde com transparência
  doc.setFontSize(50)
  doc.setFont('helvetica', 'bold')

  // Rotacionar e posicionar
  const centerX = pageWidth / 2
  const centerY = pageHeight / 2

  doc.saveGraphicsState()
  doc.text('PAGO', centerX + 30, centerY + 10, {
    align: 'center',
    angle: -25
  })
  doc.restoreGraphicsState()

  // ============ FOOTER ============
  // Fundo do footer
  doc.setFillColor(245, 245, 245)
  doc.rect(0, pageHeight - 18, pageWidth, 18, 'F')

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
  const doc = criarReciboPDF(dados)
  const nomeArquivo = `recibo_${dados.nomeCliente?.replace(/\s+/g, '_') || 'cliente'}_${new Date().toISOString().split('T')[0]}.pdf`
  doc.save(nomeArquivo)
}

/**
 * Abre o recibo em nova aba para impressão
 * @param {Object} dados - Dados do recibo
 */
export async function imprimirRecibo(dados) {
  const doc = criarReciboPDF(dados)

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
 * @returns {Blob} - PDF como Blob
 */
export function gerarReciboBlob(dados) {
  const doc = criarReciboPDF(dados)
  return doc.output('blob')
}

/**
 * Retorna o PDF como Data URL (para preview)
 * @param {Object} dados - Dados do recibo
 * @returns {string} - Data URL do PDF
 */
export function gerarReciboDataURL(dados) {
  const doc = criarReciboPDF(dados)
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
