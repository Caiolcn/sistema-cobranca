import { useEffect, useState } from 'react'
import { gerarReciboDataURL } from '../utils/pdfGenerator'

export default function PreviewRecibo() {
  const [pdfUrl, setPdfUrl] = useState(null)

  useEffect(() => {
    const dadosExemplo = {
      nomeCliente: 'Caio Lima',
      telefoneCliente: '(11) 98765-4321',
      valor: 99.00,
      dataVencimento: '2026-05-10',
      dataPagamento: new Date().toISOString(),
      formaPagamento: 'PIX',
      nomeEmpresa: 'Studio Renovar',
      chavePix: 'contato@studiorenovar.com.br',
      cpfCnpj: '12.345.678/0001-90',
      emailEmpresa: 'contato@studiorenovar.com.br',
      telefoneEmpresa: '(11) 98765-4321',
      logoUrl: '', // coloque a URL do logo aqui pra testar
      descricao: 'Mensalidade'
    }
    gerarReciboDataURL(dadosExemplo).then(setPdfUrl)
  }, [])

  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: '#f5f5f5',
      padding: '20px',
      display: 'flex',
      flexDirection: 'column',
      gap: '12px'
    }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '12px 16px',
        backgroundColor: '#344848',
        color: 'white',
        borderRadius: '8px'
      }}>
        <strong>Preview do Recibo</strong>
        <span style={{ fontSize: '13px', opacity: 0.8 }}>
          Atualize a página (F5) após cada alteração no <code>pdfGenerator.js</code>
        </span>
      </div>

      {pdfUrl ? (
        <iframe
          title="Preview do Recibo"
          src={pdfUrl}
          style={{
            flex: 1,
            minHeight: 'calc(100vh - 80px)',
            width: '100%',
            border: '1px solid #ddd',
            borderRadius: '8px',
            backgroundColor: 'white'
          }}
        />
      ) : (
        <div style={{
          flex: 1,
          minHeight: 'calc(100vh - 80px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#666'
        }}>
          Gerando preview...
        </div>
      )}
    </div>
  )
}
