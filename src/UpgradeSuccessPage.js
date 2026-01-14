import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Icon } from '@iconify/react'
import { mercadoPagoService } from './services/mercadoPagoService'

export default function UpgradeSuccessPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [status, setStatus] = useState('checking') // checking, success, pending, error
  const [mensagem, setMensagem] = useState('Verificando status do pagamento...')

  useEffect(() => {
    verificarStatusPagamento()
  }, [])

  const verificarStatusPagamento = async () => {
    // Mercado Pago redireciona com esses parâmetros:
    // ?status=approved ou ?status=pending ou ?status=rejected
    // &external_reference=user_id
    // &payment_id=123456
    // &preference_id=xxx
    // &collection_status=approved

    const paymentStatus = searchParams.get('status') || searchParams.get('collection_status')
    const externalReference = searchParams.get('external_reference')
    const paymentId = searchParams.get('payment_id') || searchParams.get('collection_id')
    const preferenceId = searchParams.get('preference_id')

    console.log('📊 Parâmetros recebidos:', {
      paymentStatus,
      externalReference,
      paymentId,
      preferenceId
    })

    // Aguardar 3 segundos para dar tempo do webhook processar
    await new Promise(resolve => setTimeout(resolve, 3000))

    // Verificar se assinatura foi ativada
    const assinatura = await mercadoPagoService.verificarAssinaturaAtiva()

    console.log('🔍 Assinatura encontrada:', assinatura)

    if (paymentStatus === 'approved' || assinatura) {
      setStatus('success')
      setMensagem('Pagamento aprovado! Sua conta foi ativada com sucesso.')

      // Redirecionar para dashboard após 3 segundos
      setTimeout(() => {
        navigate('/app/home')
      }, 3000)

    } else if (paymentStatus === 'pending') {
      setStatus('pending')
      setMensagem('Pagamento pendente. Você receberá um email quando for aprovado.')

    } else {
      setStatus('error')
      setMensagem('Houve um problema com o pagamento. Tente novamente.')
    }
  }

  const getIconAndColor = () => {
    switch (status) {
      case 'success':
        return { icon: 'mdi:check-circle', color: '#4caf50', bg: '#e8f5e9' }
      case 'pending':
        return { icon: 'mdi:clock-alert', color: '#ff9800', bg: '#fff3e0' }
      case 'error':
        return { icon: 'mdi:alert-circle', color: '#f44336', bg: '#ffebee' }
      default:
        return { icon: 'mdi:loading', color: '#2196F3', bg: '#e3f2fd' }
    }
  }

  const { icon, color, bg } = getIconAndColor()

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: '#f5f7fa',
      padding: '24px'
    }}>
      <div style={{
        backgroundColor: 'white',
        borderRadius: '20px',
        padding: '60px 40px',
        maxWidth: '550px',
        width: '100%',
        textAlign: 'center',
        boxShadow: '0 8px 32px rgba(0,0,0,0.12)'
      }}>
        {/* Ícone animado */}
        <div style={{
          width: '120px',
          height: '120px',
          borderRadius: '50%',
          backgroundColor: bg,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          margin: '0 auto 32px',
          position: 'relative'
        }}>
          <Icon
            icon={icon}
            width="70"
            style={{
              color,
              animation: status === 'checking' ? 'spin 1s linear infinite' : 'none'
            }}
          />
          {status === 'checking' && (
            <div style={{
              position: 'absolute',
              width: '100%',
              height: '100%',
              border: `4px solid ${color}40`,
              borderTop: `4px solid ${color}`,
              borderRadius: '50%',
              animation: 'spin 1s linear infinite'
            }} />
          )}
        </div>

        {/* Título */}
        <h1 style={{
          fontSize: '32px',
          fontWeight: 'bold',
          marginBottom: '16px',
          color: '#333'
        }}>
          {status === 'success' && '✨ Pagamento Aprovado!'}
          {status === 'pending' && '⏳ Pagamento Pendente'}
          {status === 'error' && '❌ Pagamento Não Aprovado'}
          {status === 'checking' && '🔄 Processando...'}
        </h1>

        {/* Mensagem */}
        <p style={{
          fontSize: '16px',
          color: '#666',
          lineHeight: '1.6',
          marginBottom: '32px',
          padding: '0 20px'
        }}>
          {mensagem}
        </p>

        {/* Informação adicional para sucesso */}
        {status === 'success' && (
          <div style={{
            backgroundColor: '#f0f9ff',
            padding: '20px',
            borderRadius: '12px',
            marginBottom: '32px',
            border: '1px solid #e0f2fe'
          }}>
            <p style={{
              fontSize: '14px',
              color: '#0369a1',
              margin: 0,
              lineHeight: '1.5'
            }}>
              <Icon icon="mdi:information" width="18" style={{ verticalAlign: 'middle', marginRight: '8px' }} />
              Você será redirecionado automaticamente para o dashboard em alguns segundos...
            </p>
          </div>
        )}

        {/* Botões */}
        {status !== 'checking' && (
          <div style={{
            display: 'flex',
            gap: '12px',
            justifyContent: 'center',
            flexWrap: 'wrap'
          }}>
            <button
              onClick={() => navigate('/app/home')}
              style={{
                padding: '14px 32px',
                backgroundColor: '#667eea',
                color: 'white',
                border: 'none',
                borderRadius: '10px',
                fontSize: '16px',
                fontWeight: '600',
                cursor: 'pointer',
                transition: 'all 0.2s',
                boxShadow: '0 2px 8px rgba(102, 126, 234, 0.3)'
              }}
              onMouseOver={(e) => {
                e.target.style.transform = 'translateY(-2px)'
                e.target.style.boxShadow = '0 4px 12px rgba(102, 126, 234, 0.4)'
              }}
              onMouseOut={(e) => {
                e.target.style.transform = 'translateY(0)'
                e.target.style.boxShadow = '0 2px 8px rgba(102, 126, 234, 0.3)'
              }}
            >
              <Icon icon="mdi:home" width="20" style={{ marginRight: '8px', verticalAlign: 'middle' }} />
              Ir para Dashboard
            </button>

            {status === 'error' && (
              <button
                onClick={() => navigate('/app/upgrade')}
                style={{
                  padding: '14px 32px',
                  backgroundColor: 'transparent',
                  color: '#667eea',
                  border: '2px solid #667eea',
                  borderRadius: '10px',
                  fontSize: '16px',
                  fontWeight: '600',
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
                onMouseOver={(e) => {
                  e.target.style.backgroundColor = '#f0f4ff'
                }}
                onMouseOut={(e) => {
                  e.target.style.backgroundColor = 'transparent'
                }}
              >
                <Icon icon="mdi:refresh" width="20" style={{ marginRight: '8px', verticalAlign: 'middle' }} />
                Tentar Novamente
              </button>
            )}
          </div>
        )}

        {/* Info de suporte */}
        {(status === 'pending' || status === 'error') && (
          <div style={{
            marginTop: '32px',
            paddingTop: '24px',
            borderTop: '1px solid #e0e0e0'
          }}>
            <p style={{
              fontSize: '13px',
              color: '#999',
              margin: 0
            }}>
              Precisa de ajuda? Entre em contato pelo WhatsApp: <br />
              <a
                href="https://wa.me/5562982466639"
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  color: '#25D366',
                  textDecoration: 'none',
                  fontWeight: '600'
                }}
              >
                (62) 98246-6639
              </a>
            </p>
          </div>
        )}
      </div>

      {/* CSS para animação de loading */}
      <style>{`
        @keyframes spin {
          from {
            transform: rotate(0deg);
          }
          to {
            transform: rotate(360deg);
          }
        }
      `}</style>
    </div>
  )
}
