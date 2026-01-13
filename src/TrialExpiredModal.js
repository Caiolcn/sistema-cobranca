import { Icon } from '@iconify/react'
import { useNavigate } from 'react-router-dom'

export default function TrialExpiredModal({ diasRestantes, onClose, onUpgrade }) {
  const navigate = useNavigate()

  const isExpired = diasRestantes <= 0
  const isExpiringSoon = diasRestantes === 1

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.7)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 9999,
      padding: '20px'
    }}>
      <div style={{
        backgroundColor: 'white',
        borderRadius: '16px',
        maxWidth: '500px',
        width: '100%',
        padding: '40px',
        boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
        position: 'relative',
        textAlign: 'center'
      }}>
        {/* Ícone de alerta */}
        <div style={{
          width: '80px',
          height: '80px',
          borderRadius: '50%',
          backgroundColor: isExpired ? '#ffebee' : '#fff3e0',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          margin: '0 auto 24px'
        }}>
          <Icon
            icon={isExpired ? 'mdi:lock-alert' : 'mdi:timer-alert'}
            width="48"
            style={{ color: isExpired ? '#f44336' : '#ff9800' }}
          />
        </div>

        {/* Título */}
        <h2 style={{
          fontSize: '28px',
          fontWeight: 'bold',
          marginBottom: '16px',
          color: '#333'
        }}>
          {isExpired ? 'Trial Expirado' : isExpiringSoon ? 'Seu Trial Expira Amanhã!' : `Faltam ${diasRestantes} Dias`}
        </h2>

        {/* Descrição */}
        <p style={{
          fontSize: '16px',
          color: '#666',
          lineHeight: '1.6',
          marginBottom: '32px'
        }}>
          {isExpired ? (
            <>
              Seu período de teste de 3 dias terminou. Para continuar usando o MensalliZap e todas as suas funcionalidades, faça upgrade para um plano pago.
            </>
          ) : (
            <>
              Seu trial de 3 dias está chegando ao fim. Faça upgrade agora e continue automatizando suas cobranças sem interrupções!
            </>
          )}
        </p>

        {/* Features do plano pago */}
        <div style={{
          backgroundColor: '#f8f9fa',
          borderRadius: '12px',
          padding: '20px',
          marginBottom: '32px',
          textAlign: 'left'
        }}>
          <p style={{
            fontSize: '14px',
            fontWeight: '600',
            color: '#333',
            marginBottom: '16px',
            textAlign: 'center'
          }}>
            Com o plano pago você tem:
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <Icon icon="mdi:check-circle" width="20" style={{ color: '#4caf50', flexShrink: 0 }} />
              <span style={{ fontSize: '14px', color: '#666' }}>Até 500 mensagens por mês (Premium)</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <Icon icon="mdi:check-circle" width="20" style={{ color: '#4caf50', flexShrink: 0 }} />
              <span style={{ fontSize: '14px', color: '#666' }}>Automação completa de cobranças</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <Icon icon="mdi:check-circle" width="20" style={{ color: '#4caf50', flexShrink: 0 }} />
              <span style={{ fontSize: '14px', color: '#666' }}>Relatórios avançados</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <Icon icon="mdi:check-circle" width="20" style={{ color: '#4caf50', flexShrink: 0 }} />
              <span style={{ fontSize: '14px', color: '#666' }}>Suporte prioritário</span>
            </div>
          </div>
        </div>

        {/* Botões */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <button
            onClick={onUpgrade}
            style={{
              width: '100%',
              padding: '16px',
              backgroundColor: '#667eea',
              color: 'white',
              border: 'none',
              borderRadius: '10px',
              fontSize: '16px',
              fontWeight: '600',
              cursor: 'pointer',
              transition: 'all 0.2s',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px'
            }}
            onMouseOver={(e) => {
              e.target.style.backgroundColor = '#5568d3'
              e.target.style.transform = 'translateY(-2px)'
            }}
            onMouseOut={(e) => {
              e.target.style.backgroundColor = '#667eea'
              e.target.style.transform = 'translateY(0)'
            }}
          >
            <Icon icon="mdi:crown" width="20" />
            Fazer Upgrade Agora
          </button>

          {!isExpired && (
            <button
              onClick={onClose}
              style={{
                width: '100%',
                padding: '12px',
                backgroundColor: 'transparent',
                color: '#666',
                border: '1px solid #e0e0e0',
                borderRadius: '10px',
                fontSize: '14px',
                fontWeight: '500',
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
              onMouseOver={(e) => {
                e.target.style.backgroundColor = '#f5f5f5'
              }}
              onMouseOut={(e) => {
                e.target.style.backgroundColor = 'transparent'
              }}
            >
              Continuar usando (ainda tenho {diasRestantes} {diasRestantes === 1 ? 'dia' : 'dias'})
            </button>
          )}
        </div>

        {isExpired && (
          <p style={{
            marginTop: '20px',
            fontSize: '13px',
            color: '#999'
          }}>
            Não consegue acessar o sistema até fazer upgrade
          </p>
        )}
      </div>
    </div>
  )
}
