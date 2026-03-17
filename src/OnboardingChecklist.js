import { useState } from 'react'
import { Icon } from '@iconify/react'
import { useNavigate } from 'react-router-dom'
import './OnboardingChecklist.css'

const STEPS = [
  {
    key: 'empresa',
    title: 'Configure sua empresa',
    description: 'Adicione o nome da sua empresa para aparecer nas cobranças',
    icon: 'mdi:office-building-outline',
    actionLabel: 'Ir para Configurações',
    route: '/app/configuracao?aba=empresa'
  },
  {
    key: 'pix',
    title: 'Configure sua chave PIX',
    description: 'Adicione sua chave PIX para receber pagamentos',
    icon: 'mdi:qrcode',
    actionLabel: 'Configurar PIX',
    route: '/app/whatsapp?aba=templates&config=abrir'
  },
  {
    key: 'whatsapp',
    title: 'Conecte seu WhatsApp',
    description: 'Conecte seu WhatsApp para enviar cobranças automaticamente',
    icon: 'mdi:whatsapp',
    actionLabel: 'Conectar WhatsApp',
    route: '/app/whatsapp'
  },
  {
    key: 'cliente',
    title: 'Adicione seu primeiro aluno',
    description: 'Cadastre um aluno para começar a cobrar',
    icon: 'mdi:account-plus-outline',
    actionLabel: 'Adicionar Aluno',
    route: '/app/clientes'
  }
]

export default function OnboardingChecklist({ completedSteps }) {
  const navigate = useNavigate()
  const [collapsed, setCollapsed] = useState(false)

  const completedCount = STEPS.filter(s => completedSteps[s.key]).length
  const allCompleted = completedCount === STEPS.length

  if (allCompleted) return null

  const percent = Math.round((completedCount / STEPS.length) * 100)

  // Botão flutuante minimizado
  if (collapsed) {
    return (
      <button className="onboarding-fab" onClick={() => setCollapsed(false)}>
        <span className="onboarding-fab-text">{completedCount}/{STEPS.length} concluído</span>
        <span className="onboarding-fab-badge">{percent}%</span>
      </button>
    )
  }

  // Painel flutuante expandido
  return (
    <div className="onboarding-panel">
      {/* Header com progresso dentro */}
      <div className="onboarding-panel-header">
        <div className="onboarding-panel-header-top">
          <h3 className="onboarding-panel-title">Primeiros Passos</h3>
          <button className="onboarding-panel-close" onClick={() => setCollapsed(true)}>
            <Icon icon="mdi:close" width="18" />
          </button>
        </div>
        <div className="onboarding-panel-header-progress">
          <div className="onboarding-panel-progress-track">
            <div
              className="onboarding-panel-progress-fill"
              style={{ width: `${(completedCount / STEPS.length) * 100}%` }}
            />
          </div>
          <span className="onboarding-panel-count">{completedCount}/{STEPS.length}</span>
        </div>
      </div>

      {/* Steps como cards */}
      <div className="onboarding-panel-steps">
        {STEPS.map((step) => {
          const done = completedSteps[step.key]
          return (
            <div key={step.key} className={`onboarding-panel-card ${done ? 'done' : ''}`}>
              <div className={`onboarding-panel-circle ${done ? 'done' : ''}`}>
                {done ? (
                  <Icon icon="mdi:check" width="16" color="white" />
                ) : (
                  <Icon icon={step.icon} width="16" color="#9ca3af" />
                )}
              </div>
              <div className="onboarding-panel-card-content">
                <p className={`onboarding-panel-card-title ${done ? 'done' : ''}`}>
                  {step.title}
                </p>
                {!done && (
                  <>
                    <p className="onboarding-panel-card-desc">{step.description}</p>
                    <button
                      className="onboarding-panel-card-btn"
                      onClick={() => navigate(step.route)}
                    >
                      {step.actionLabel} <Icon icon="mdi:chevron-right" width="16" />
                    </button>
                  </>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
