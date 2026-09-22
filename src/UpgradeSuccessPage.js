import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Icon } from '@iconify/react'
import { mercadoPagoService } from './services/mercadoPagoService'

// Quantas vezes pergunto ao MP antes de desistir. O cartão costuma autorizar
// em segundos, mas a preapproval pode ficar `pending` uns instantes.
const TENTATIVAS = 6
const INTERVALO = 3000

export default function UpgradeSuccessPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [status, setStatus] = useState('checking') // checking, success, pending, indefinido, error
  const [mensagem, setMensagem] = useState('Confirmando seu pagamento com o Mercado Pago...')
  const [duplicada, setDuplicada] = useState(false)

  useEffect(() => {
    verificarStatusPagamento()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const verificarStatusPagamento = async () => {
    // O retorno do checkout de ASSINATURA não traz `status`/`collection_status`
    // — traz `preapproval_id`. Ler só a URL foi exatamente o que fez a tela
    // estampar "Pagamento Não Aprovado" pra quem tinha acabado de pagar: sem
    // parâmetro, caía no else. Agora a URL é só uma dica; quem responde é o MP.
    const preapprovalId =
      searchParams.get('preapproval_id') || searchParams.get('preapproval')
    const paymentStatus = searchParams.get('status') || searchParams.get('collection_status')

    console.log('📊 Retorno do checkout:', { preapprovalId, paymentStatus })

    for (let tentativa = 1; tentativa <= TENTATIVAS; tentativa++) {
      try {
        const r = await mercadoPagoService.confirmarAssinaturaCartao(preapprovalId)
        console.log(`🔍 Tentativa ${tentativa}:`, r)

        if (r.status === 'authorized' || r.plano_pago) {
          const temDuplicada = !!r.duplicadas?.length
          setDuplicada(temDuplicada)
          setStatus('success')
          setMensagem(
            temDuplicada
              ? 'Pagamento aprovado e conta ativada! Só que encontramos mais de uma assinatura ativa no seu cartão — chama a gente no WhatsApp pra cancelar a duplicada e devolver o valor.'
              : 'Pagamento aprovado! Sua conta foi ativada com sucesso.'
          )
          // Com assinatura duplicada a pessoa precisa LER o aviso: jogar ela
          // pro dashboard em 3 segundos esconderia justamente o que importa.
          if (!temDuplicada) setTimeout(() => navigate('/app/home'), 3000)
          return
        }

        // Cancelada/pausada no MP é a única situação em que dá pra dizer que
        // não passou. Qualquer outra coisa é "ainda não sei".
        if (r.status === 'cancelled' || paymentStatus === 'rejected') {
          setStatus('error')
          setMensagem('O pagamento não foi concluído. Nada foi cobrado do seu cartão.')
          return
        }
      } catch (e) {
        console.error('Erro ao confirmar assinatura:', e)
      }

      if (tentativa < TENTATIVAS) {
        await new Promise((resolve) => setTimeout(resolve, INTERVALO))
      }
    }

    // Acabaram as tentativas sem resposta do MP. Isto NÃO é reprovação — e a
    // tela não pode sugerir que seja, nem oferecer "tentar de novo": foi assim
    // que uma cliente acabou com duas assinaturas criadas em 23 segundos.
    setStatus('indefinido')
    setMensagem(
      'Ainda não consegui confirmar o pagamento com o Mercado Pago. Se o valor foi debitado do seu cartão, ele está valendo: é só abrir "Minha assinatura" daqui a pouco que a conta libera sozinha. Não pague de novo — se preferir, chama a gente no WhatsApp.'
    )
  }

  const getIconAndColor = () => {
    switch (status) {
      case 'success':
        return { icon: 'mdi:check-circle', color: '#4caf50', bg: '#e8f5e9' }
      case 'pending':
      case 'indefinido':
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
          {status === 'indefinido' && '⏳ Confirmando o pagamento'}
          {status === 'error' && '❌ Pagamento Não Concluído'}
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
        {status === 'success' && !duplicada && (
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
                onClick={() => navigate('/app/assinatura')}
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
        {(status === 'pending' || status === 'error' || status === 'indefinido' || duplicada) && (
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
                href="https://wa.me/5562981618862"
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  color: '#25D366',
                  textDecoration: 'none',
                  fontWeight: '600'
                }}
              >
                (62) 98161-8862
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
