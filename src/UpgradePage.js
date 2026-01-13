import { Icon } from '@iconify/react'
import { useNavigate } from 'react-router-dom'
import { useTrialStatus } from './useTrialStatus'

export default function UpgradePage() {
  const navigate = useNavigate()
  const { diasRestantes, isExpired } = useTrialStatus()

  const planos = [
    {
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

            <a
              href={`https://wa.me/5562982466639?text=Olá! Gostaria de fazer upgrade para o plano ${plano.nome} (${plano.preco}/mês)`}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'block',
                width: '100%',
                padding: '16px',
                backgroundColor: plano.cor,
                color: 'white',
                border: 'none',
                borderRadius: '10px',
                fontSize: '16px',
                fontWeight: '600',
                textAlign: 'center',
                textDecoration: 'none',
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
              onMouseOver={(e) => {
                e.target.style.transform = 'translateY(-2px)'
                e.target.style.boxShadow = `0 4px 12px ${plano.cor}80`
              }}
              onMouseOut={(e) => {
                e.target.style.transform = 'translateY(0)'
                e.target.style.boxShadow = 'none'
              }}
            >
              <Icon icon="mdi:whatsapp" width="20" style={{ marginRight: '8px', verticalAlign: 'middle' }} />
              Contratar via WhatsApp
            </a>
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
          Como Funciona o Upgrade?
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
              <Icon icon="mdi:whatsapp" width="32" style={{ color: '#2196F3' }} />
            </div>
            <h4 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '8px', color: '#333' }}>
              1. Entre em Contato
            </h4>
            <p style={{ fontSize: '14px', color: '#666', lineHeight: '1.6' }}>
              Clique no botão "Contratar via WhatsApp" e envie uma mensagem
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
              <Icon icon="mdi:credit-card" width="32" style={{ color: '#9C27B0' }} />
            </div>
            <h4 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '8px', color: '#333' }}>
              2. Faça o Pagamento
            </h4>
            <p style={{ fontSize: '14px', color: '#666', lineHeight: '1.6' }}>
              Te enviaremos as instruções de pagamento via PIX ou cartão
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
              <Icon icon="mdi:check-circle" width="32" style={{ color: '#4CAF50' }} />
            </div>
            <h4 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '8px', color: '#333' }}>
              3. Ativação Imediata
            </h4>
            <p style={{ fontSize: '14px', color: '#666', lineHeight: '1.6' }}>
              Sua conta será ativada em até 5 minutos após confirmação
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
