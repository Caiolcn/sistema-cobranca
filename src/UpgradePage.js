import { useState, useEffect } from 'react'
import { Icon } from '@iconify/react'
import { useNavigate } from 'react-router-dom'
import { useTrialStatus } from './useTrialStatus'
import { mercadoPagoService } from './services/mercadoPagoService'

export default function UpgradePage() {
  const navigate = useNavigate()
  const { diasRestantes, isExpired } = useTrialStatus()
  const [loading, setLoading] = useState(false)
  const [assinaturaAtiva, setAssinaturaAtiva] = useState(null)
  const [erro, setErro] = useState(null)

  // Verificar se já tem assinatura ativa
  useEffect(() => {
    verificarAssinatura()
  }, [])

  const verificarAssinatura = async () => {
    const assinatura = await mercadoPagoService.verificarAssinaturaAtiva()
    setAssinaturaAtiva(assinatura)
  }

  const handleContratarPlano = async (planoId) => {
    try {
      setLoading(true)
      setErro(null)

      console.log('🚀 Criando assinatura para plano:', planoId)

      // Criar assinatura via Edge Function
      const { init_point, subscription_id } = await mercadoPagoService.criarAssinatura(planoId)

      console.log('✅ Assinatura criada:', subscription_id)
      console.log('🔗 Redirecionando para:', init_point)

      // Redirecionar para checkout do Mercado Pago
      window.location.href = init_point

    } catch (error) {
      console.error('❌ Erro ao contratar plano:', error)
      setErro(error.message || 'Erro ao processar pagamento. Tente novamente.')
      setLoading(false)
    }
  }

  const handleCancelarAssinatura = async () => {
    if (!window.confirm('Tem certeza que deseja cancelar sua assinatura?')) {
      return
    }

    try {
      setLoading(true)
      await mercadoPagoService.cancelarAssinatura()
      window.alert('Assinatura cancelada com sucesso!')
      setAssinaturaAtiva(null)
      setLoading(false)
    } catch (error) {
      window.alert(`Erro ao cancelar: ${error.message}`)
      setLoading(false)
    }
  }

  const planos = [
    {
      id: 'premium',
      nome: 'Premium',
      preco: 'R$ 49,90',
      periodo: '/mês',
      limite: '500 mensagens/mês',
      features: [
        'Até 500 mensagens por mês',
        'Gestão de clientes ilimitada',
        'Automação completa de cobranças',
        'Templates personalizados',
        'Relatórios avançados',
        'Suporte prioritário por email'
      ],
      destaque: true,
      cor: '#667eea'
    },
    {
      id: 'enterprise',
      nome: 'Enterprise',
      preco: 'R$ 149,90',
      periodo: '/mês',
      limite: 'Mensagens ilimitadas',
      features: [
        'Mensagens ilimitadas',
        'Tudo do plano Premium',
        'API de integração',
        'Webhooks personalizados',
        'Suporte 24/7',
        'Gerente de conta dedicado',
        'Treinamento personalizado'
      ],
      destaque: false,
      cor: '#764ba2'
    }
  ]

  return (
    <div style={{
      padding: '40px 24px',
      maxWidth: '1200px',
      margin: '0 auto',
      minHeight: '100vh'
    }}>
      {/* Header */}
      <div style={{ textAlign: 'center', marginBottom: '60px' }}>
        <div style={{
          display: 'inline-block',
          padding: '8px 20px',
          backgroundColor: isExpired ? '#ffebee' : '#fff3e0',
          borderRadius: '20px',
          marginBottom: '20px'
        }}>
          <span style={{
            fontSize: '14px',
            fontWeight: '600',
            color: isExpired ? '#f44336' : '#ff9800'
          }}>
            {isExpired ? '⚠️ Trial Expirado' : `⏰ ${diasRestantes} ${diasRestantes === 1 ? 'dia' : 'dias'} restantes`}
          </span>
        </div>

        <h1 style={{
          fontSize: '40px',
          fontWeight: 'bold',
          marginBottom: '16px',
          color: '#333'
        }}>
          Faça Upgrade e Continue Usando
        </h1>
        <p style={{
          fontSize: '18px',
          color: '#666',
          maxWidth: '600px',
          margin: '0 auto'
        }}>
          Escolha o plano ideal para o seu negócio e automatize suas cobranças sem limites
        </p>
      </div>

      {/* Mensagem de Erro */}
      {erro && (
        <div style={{
          backgroundColor: '#ffebee',
          color: '#c62828',
          padding: '16px 24px',
          borderRadius: '8px',
          marginBottom: '32px',
          textAlign: 'center',
          fontSize: '15px'
        }}>
          <Icon icon="mdi:alert-circle" width="20" style={{ marginRight: '8px', verticalAlign: 'middle' }} />
          {erro}
        </div>
      )}

      {/* Assinatura Ativa */}
      {assinaturaAtiva && (
        <div style={{
          backgroundColor: '#e8f5e9',
          padding: '32px',
          borderRadius: '16px',
          marginBottom: '40px',
          textAlign: 'center',
          border: '2px solid #4caf50'
        }}>
          <Icon icon="mdi:check-circle" width="48" style={{ color: '#4caf50', marginBottom: '16px' }} />
          <h3 style={{ fontSize: '24px', fontWeight: '600', marginBottom: '12px', color: '#333' }}>
            Você já tem uma assinatura ativa!
          </h3>
          <p style={{ fontSize: '16px', color: '#666', marginBottom: '8px' }}>
            Plano: <strong style={{ color: '#333' }}>{assinaturaAtiva.plano.charAt(0).toUpperCase() + assinaturaAtiva.plano.slice(1)}</strong>
          </p>
          <p style={{ fontSize: '14px', color: '#666', marginBottom: '24px' }}>
            Status: <span style={{ color: '#4caf50', fontWeight: '600' }}>Ativo</span>
          </p>
          <button
            onClick={handleCancelarAssinatura}
            disabled={loading}
            style={{
              padding: '12px 32px',
              backgroundColor: loading ? '#ccc' : '#f44336',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              fontSize: '15px',
              fontWeight: '600',
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.6 : 1,
              transition: 'all 0.2s'
            }}
          >
            {loading ? 'Processando...' : 'Cancelar Assinatura'}
          </button>
        </div>
      )}

      {/* Cards de Planos */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))',
        gap: '32px',
        marginBottom: '60px'
      }}>
        {planos.map((plano, index) => (
          <div
            key={index}
            style={{
              backgroundColor: 'white',
              padding: '40px',
              borderRadius: '16px',
              border: plano.destaque ? `3px solid ${plano.cor}` : '2px solid #e0e0e0',
              boxShadow: plano.destaque ? `0 8px 32px ${plano.cor}40` : '0 4px 12px rgba(0,0,0,0.08)',
              transform: plano.destaque ? 'scale(1.05)' : 'scale(1)',
              position: 'relative'
            }}
          >
            {plano.destaque && (
              <div style={{
                position: 'absolute',
                top: '-12px',
                left: '50%',
                transform: 'translateX(-50%)',
                backgroundColor: plano.cor,
                color: 'white',
                padding: '6px 20px',
                borderRadius: '20px',
                fontSize: '12px',
                fontWeight: '600',
                textTransform: 'uppercase',
                letterSpacing: '0.5px'
              }}>
                Mais Popular
              </div>
            )}

            <h3 style={{
              fontSize: '28px',
              fontWeight: '600',
              marginBottom: '12px',
              color: '#333'
            }}>
              {plano.nome}
            </h3>

            <div style={{ marginBottom: '24px' }}>
              <span style={{ fontSize: '48px', fontWeight: 'bold', color: '#333' }}>
                {plano.preco}
              </span>
              <span style={{ fontSize: '18px', color: '#666' }}>
                {plano.periodo}
              </span>
            </div>

            <p style={{
              fontSize: '16px',
              color: '#666',
              marginBottom: '32px',
              paddingBottom: '24px',
              borderBottom: '1px solid #e0e0e0'
            }}>
              {plano.limite}
            </p>

            <ul style={{
              listStyle: 'none',
              padding: 0,
              marginBottom: '32px'
            }}>
              {plano.features.map((feature, i) => (
                <li key={i} style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  marginBottom: '16px',
                  fontSize: '15px',
                  color: '#666'
                }}>
                  <Icon
                    icon="mdi:check-circle"
                    width="20"
                    style={{ color: '#4CAF50', flexShrink: 0 }}
                  />
                  <span>{feature}</span>
                </li>
              ))}
            </ul>

            <button
              onClick={() => handleContratarPlano(plano.id)}
              disabled={loading || assinaturaAtiva}
              style={{
                display: 'block',
                width: '100%',
                padding: '16px',
                backgroundColor: (loading || assinaturaAtiva) ? '#ccc' : plano.cor,
                color: 'white',
                border: 'none',
                borderRadius: '10px',
                fontSize: '16px',
                fontWeight: '600',
                textAlign: 'center',
                cursor: (loading || assinaturaAtiva) ? 'not-allowed' : 'pointer',
                transition: 'all 0.2s',
                opacity: (loading || assinaturaAtiva) ? 0.6 : 1
              }}
              onMouseOver={(e) => {
                if (!loading && !assinaturaAtiva) {
                  e.target.style.transform = 'translateY(-2px)'
                  e.target.style.boxShadow = `0 4px 12px ${plano.cor}80`
                }
              }}
              onMouseOut={(e) => {
                if (!loading && !assinaturaAtiva) {
                  e.target.style.transform = 'translateY(0)'
                  e.target.style.boxShadow = 'none'
                }
              }}
            >
              <Icon icon="mdi:credit-card" width="20" style={{ marginRight: '8px', verticalAlign: 'middle' }} />
              {loading ? 'Processando...' : assinaturaAtiva ? 'Já Assinante' : 'Assinar Agora'}
            </button>
          </div>
        ))}
      </div>

      {/* Informações adicionais */}
      <div style={{
        backgroundColor: 'white',
        padding: '40px',
        borderRadius: '16px',
        border: '1px solid #e0e0e0',
        marginBottom: '40px'
      }}>
        <h3 style={{
          fontSize: '24px',
          fontWeight: '600',
          marginBottom: '24px',
          color: '#333',
          textAlign: 'center'
        }}>
          Pagamento Seguro via Mercado Pago
        </h3>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
          gap: '32px'
        }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{
              width: '60px',
              height: '60px',
              borderRadius: '50%',
              backgroundColor: '#e3f2fd',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 16px'
            }}>
              <Icon icon="mdi:shield-check" width="32" style={{ color: '#2196F3' }} />
            </div>
            <h4 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '8px', color: '#333' }}>
              100% Seguro
            </h4>
            <p style={{ fontSize: '14px', color: '#666', lineHeight: '1.6' }}>
              Pagamentos processados pelo Mercado Pago com criptografia SSL
            </p>
          </div>

          <div style={{ textAlign: 'center' }}>
            <div style={{
              width: '60px',
              height: '60px',
              borderRadius: '50%',
              backgroundColor: '#f3e5f5',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 16px'
            }}>
              <Icon icon="mdi:credit-card-multiple" width="32" style={{ color: '#9C27B0' }} />
            </div>
            <h4 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '8px', color: '#333' }}>
              Várias Formas de Pagamento
            </h4>
            <p style={{ fontSize: '14px', color: '#666', lineHeight: '1.6' }}>
              Cartão de crédito, débito, PIX e boleto bancário
            </p>
          </div>

          <div style={{ textAlign: 'center' }}>
            <div style={{
              width: '60px',
              height: '60px',
              borderRadius: '50%',
              backgroundColor: '#e8f5e9',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 16px'
            }}>
              <Icon icon="mdi:autorenew" width="32" style={{ color: '#4CAF50' }} />
            </div>
            <h4 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '8px', color: '#333' }}>
              Cobrança Recorrente
            </h4>
            <p style={{ fontSize: '14px', color: '#666', lineHeight: '1.6' }}>
              Renovação automática mensal. Cancele quando quiser
            </p>
          </div>
        </div>
      </div>

      {/* Botão Voltar */}
      {!isExpired && (
        <div style={{ textAlign: 'center' }}>
          <button
            onClick={() => navigate('/app/home')}
            style={{
              padding: '12px 32px',
              backgroundColor: 'transparent',
              color: '#667eea',
              border: '2px solid #667eea',
              borderRadius: '8px',
              fontSize: '15px',
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
            ← Voltar ao Dashboard
          </button>
        </div>
      )}
    </div>
  )
}
