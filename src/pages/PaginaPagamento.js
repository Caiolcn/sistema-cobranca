import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { Icon } from '@iconify/react'
import { QRCodeSVG } from 'qrcode.react'
import { gerarPixCopiaCola, gerarTxId } from '../services/pixService'

export default function PaginaPagamento() {
  const { token } = useParams()
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState(null)
  const [dados, setDados] = useState(null)
  const [pixCopied, setPixCopied] = useState(false)
  const [pixCode, setPixCode] = useState('')

  useEffect(() => {
    carregarDados()
  }, [token])

  const carregarDados = async () => {
    try {
      // Buscar link de pagamento pelo token (dados armazenados diretamente)
      const { data: link, error: linkError } = await supabase
        .from('links_pagamento')
        .select('*')
        .eq('token', token)
        .single()

      if (linkError || !link) {
        console.error('Erro ao buscar link:', linkError)
        setErro('Link de pagamento não encontrado ou expirado.')
        setLoading(false)
        return
      }

      // Verificar expiração (24 horas)
      const criado = new Date(link.created_at)
      const agora = new Date()
      const horasDecorridas = (agora - criado) / (1000 * 60 * 60)

      if (horasDecorridas > 24) {
        setErro('Este link de pagamento expirou. Solicite um novo link.')
        setLoading(false)
        return
      }

      // Verificar se tem chave PIX
      if (!link.chave_pix) {
        setErro('Chave PIX não configurada. Entre em contato com o estabelecimento.')
        setLoading(false)
        return
      }

      // Gerar código PIX usando dados armazenados no link
      const codigoPix = gerarPixCopiaCola({
        chavePix: link.chave_pix,
        valor: parseFloat(link.valor),
        nomeRecebedor: link.nome_empresa || 'Empresa',
        cidadeRecebedor: 'SAO PAULO', // Cidade padrão para PIX
        txid: gerarTxId(link.mensalidade_id)
      })

      setPixCode(codigoPix)
      setDados(link)
      setLoading(false)

      // Registrar visualização
      await supabase
        .from('links_pagamento')
        .update({ visualizado_em: new Date().toISOString() })
        .eq('id', link.id)

    } catch (error) {
      console.error('Erro ao carregar dados:', error)
      setErro('Erro ao carregar dados do pagamento.')
      setLoading(false)
    }
  }

  const copiarPix = async () => {
    try {
      await navigator.clipboard.writeText(pixCode)
      setPixCopied(true)
      setTimeout(() => setPixCopied(false), 3000)
    } catch (error) {
      // Fallback para navegadores que não suportam clipboard API
      const textArea = document.createElement('textarea')
      textArea.value = pixCode
      document.body.appendChild(textArea)
      textArea.select()
      document.execCommand('copy')
      document.body.removeChild(textArea)
      setPixCopied(true)
      setTimeout(() => setPixCopied(false), 3000)
    }
  }

  const formatarValor = (valor) => {
    return parseFloat(valor).toLocaleString('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    })
  }

  const formatarData = (data) => {
    return new Date(data + 'T00:00:00').toLocaleDateString('pt-BR')
  }

  if (loading) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#f5f5f5'
      }}>
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '16px'
        }}>
          <Icon icon="mdi:loading" width="48" height="48" style={{ animation: 'spin 1s linear infinite' }} />
          <p style={{ color: '#666' }}>Carregando dados do pagamento...</p>
        </div>
      </div>
    )
  }

  if (erro) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#f5f5f5',
        padding: '20px'
      }}>
        <div style={{
          backgroundColor: 'white',
          borderRadius: '16px',
          padding: '32px',
          maxWidth: '400px',
          width: '100%',
          textAlign: 'center',
          boxShadow: '0 4px 20px rgba(0,0,0,0.1)'
        }}>
          <Icon icon="mdi:alert-circle" width="64" height="64" color="#f44336" />
          <h2 style={{ margin: '16px 0', color: '#333' }}>Ops!</h2>
          <p style={{ color: '#666', lineHeight: 1.6 }}>{erro}</p>
        </div>
      </div>
    )
  }

  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: '#f5f5f5',
      padding: '20px'
    }}>
      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>

      <div style={{
        maxWidth: '400px',
        margin: '0 auto'
      }}>
        {/* Header */}
        <div style={{
          backgroundColor: '#344848',
          borderRadius: '16px 16px 0 0',
          padding: '24px',
          textAlign: 'center',
          color: 'white'
        }}>
          <Icon icon="mdi:store" width="40" height="40" />
          <h1 style={{ margin: '12px 0 4px', fontSize: '20px', fontWeight: '600' }}>
            {dados?.nome_empresa || 'Pagamento'}
          </h1>
          <p style={{ margin: 0, opacity: 0.8, fontSize: '14px' }}>
            Pagamento via PIX
          </p>
        </div>

        {/* Detalhes */}
        <div style={{
          backgroundColor: 'white',
          padding: '24px',
          borderBottom: '1px solid #eee'
        }}>
          <div style={{ marginBottom: '16px' }}>
            <p style={{ margin: 0, fontSize: '13px', color: '#888' }}>Cliente</p>
            <p style={{ margin: '4px 0 0', fontSize: '16px', fontWeight: '500', color: '#333' }}>
              {dados?.cliente_nome}
            </p>
          </div>

          <div style={{ display: 'flex', gap: '24px' }}>
            <div style={{ flex: 1 }}>
              <p style={{ margin: 0, fontSize: '13px', color: '#888' }}>Valor</p>
              <p style={{ margin: '4px 0 0', fontSize: '24px', fontWeight: '700', color: '#4CAF50' }}>
                {formatarValor(dados?.valor)}
              </p>
            </div>
            <div>
              <p style={{ margin: 0, fontSize: '13px', color: '#888' }}>Vencimento</p>
              <p style={{ margin: '4px 0 0', fontSize: '16px', fontWeight: '500', color: '#333' }}>
                {formatarData(dados?.data_vencimento)}
              </p>
            </div>
          </div>
        </div>

        {/* QR Code */}
        <div style={{
          backgroundColor: 'white',
          padding: '24px',
          textAlign: 'center'
        }}>
          <p style={{ margin: '0 0 16px', fontSize: '14px', color: '#666' }}>
            Escaneie o QR Code com seu app de banco
          </p>

          <div style={{
            display: 'inline-block',
            padding: '16px',
            backgroundColor: 'white',
            borderRadius: '12px',
            border: '2px solid #eee'
          }}>
            <QRCodeSVG
              value={pixCode}
              size={200}
              level="M"
              includeMargin={false}
            />
          </div>

          <p style={{ margin: '16px 0 0', fontSize: '12px', color: '#888' }}>
            Ou copie o código PIX abaixo
          </p>
        </div>

        {/* Botão Copiar */}
        <div style={{
          backgroundColor: 'white',
          padding: '0 24px 24px',
          borderRadius: '0 0 16px 16px'
        }}>
          <button
            onClick={copiarPix}
            style={{
              width: '100%',
              padding: '16px',
              backgroundColor: pixCopied ? '#4CAF50' : '#344848',
              color: 'white',
              border: 'none',
              borderRadius: '12px',
              fontSize: '16px',
              fontWeight: '600',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              transition: 'all 0.3s ease'
            }}
          >
            <Icon
              icon={pixCopied ? 'mdi:check' : 'mdi:content-copy'}
              width="24"
              height="24"
            />
            {pixCopied ? 'Copiado!' : 'Copiar Pix Copia e Cola'}
          </button>

          {/* Código PIX (texto) */}
          <div style={{
            marginTop: '16px',
            padding: '12px',
            backgroundColor: '#f5f5f5',
            borderRadius: '8px',
            wordBreak: 'break-all',
            fontSize: '11px',
            color: '#666',
            fontFamily: 'monospace',
            maxHeight: '80px',
            overflow: 'auto'
          }}>
            {pixCode}
          </div>
        </div>

        {/* Instruções */}
        <div style={{
          marginTop: '16px',
          padding: '20px',
          backgroundColor: 'white',
          borderRadius: '12px'
        }}>
          <h3 style={{ margin: '0 0 12px', fontSize: '14px', color: '#333' }}>
            <Icon icon="mdi:information" width="18" height="18" style={{ verticalAlign: 'middle', marginRight: '6px' }} />
            Como pagar
          </h3>
          <ol style={{ margin: 0, padding: '0 0 0 20px', fontSize: '13px', color: '#666', lineHeight: 1.8 }}>
            <li>Abra o app do seu banco</li>
            <li>Escolha pagar com PIX</li>
            <li>Escaneie o QR Code ou cole o código</li>
            <li>Confirme o pagamento</li>
          </ol>
        </div>

        {/* Footer */}
        <p style={{
          textAlign: 'center',
          fontSize: '12px',
          color: '#999',
          marginTop: '24px'
        }}>
          Link válido por 24 horas
        </p>
      </div>
    </div>
  )
}
