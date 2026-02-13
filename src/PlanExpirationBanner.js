import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useUser } from './contexts/UserContext'
import { Icon } from '@iconify/react'

export default function PlanExpirationBanner() {
  const navigate = useNavigate()
  const { trialStatus, userData } = useUser()
  const [dismissed, setDismissed] = useState(() => {
    const stored = sessionStorage.getItem('banner_dismissed_days')
    return stored ? parseInt(stored) : null
  })

  if (!userData || !trialStatus) return null

  const { diasRestantes, planoPago, isExpired } = trialStatus

  // Expirado = TrialExpiredModal cuida; >3 dias = sem banner
  if (isExpired || diasRestantes <= 0 || diasRestantes > 3) return null

  // Trial: mostrar só a partir do 2o dia (pra não entrar já com cobrança na cara)
  if (!planoPago && diasRestantes >= 3) return null

  // Se o usuario fechou este nivel, nao mostrar (exceto 1 dia que nao fecha)
  if (dismissed === diasRestantes && diasRestantes > 1) return null

  const configs = {
    3: {
      bg: '#2563eb',
      bgLight: '#eff6ff',
      border: '#93c5fd',
      text: '#1e40af',
      icon: 'mdi:information-outline',
      canClose: true,
    },
    2: {
      bg: '#f59e0b',
      bgLight: '#fffbeb',
      border: '#fcd34d',
      text: '#92400e',
      icon: 'mdi:alert-outline',
      canClose: true,
    },
    1: {
      bg: '#dc2626',
      bgLight: '#fef2f2',
      border: '#fca5a5',
      text: '#991b1b',
      icon: 'mdi:alert-circle-outline',
      canClose: false,
    },
  }

  const config = configs[diasRestantes] || configs[3]

  const mensagem = planoPago
    ? diasRestantes === 1
      ? 'Sua assinatura expira amanhã!'
      : `Sua assinatura vence em ${diasRestantes} dias`
    : diasRestantes === 1
      ? 'Seu período de teste expira amanhã!'
      : `Seu período de teste expira em ${diasRestantes} dias`

  const handleDismiss = () => {
    sessionStorage.setItem('banner_dismissed_days', diasRestantes.toString())
    setDismissed(diasRestantes)
  }

  return (
    <div style={{
      width: '100%',
      padding: '10px 20px',
      backgroundColor: config.bgLight,
      borderBottom: `2px solid ${config.border}`,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '12px',
      flexShrink: 0,
      flexWrap: 'wrap',
    }}>
      <Icon icon={config.icon} width="20" style={{ color: config.bg, flexShrink: 0 }} />

      <span style={{
        fontSize: '14px',
        fontWeight: '600',
        color: config.text,
      }}>
        {mensagem}
      </span>

      <button
        onClick={() => navigate(planoPago ? `/app/upgrade?plano=${userData.plano}` : '/app/upgrade')}
        style={{
          padding: '6px 18px',
          backgroundColor: config.bg,
          color: 'white',
          border: 'none',
          borderRadius: '6px',
          fontSize: '13px',
          fontWeight: '600',
          cursor: 'pointer',
          whiteSpace: 'nowrap',
          transition: 'opacity 0.2s',
        }}
        onMouseEnter={(e) => e.target.style.opacity = '0.85'}
        onMouseLeave={(e) => e.target.style.opacity = '1'}
      >
        Efetuar Pagamento
      </button>

      {config.canClose && (
        <button
          onClick={handleDismiss}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: '4px',
            display: 'flex',
            alignItems: 'center',
            opacity: 0.5,
            transition: 'opacity 0.2s',
          }}
          onMouseEnter={(e) => e.currentTarget.style.opacity = '1'}
          onMouseLeave={(e) => e.currentTarget.style.opacity = '0.5'}
        >
          <Icon icon="mdi:close" width="18" style={{ color: config.text }} />
        </button>
      )}
    </div>
  )
}
