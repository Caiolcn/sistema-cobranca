import React from 'react'
import { Icon } from '@iconify/react'
import './WizardStepper.css'

/* ============================================================
   WizardStepper — DS Mensalli (Padrão de domínio)

   Indicador de progresso de wizard. Usado em onboarding,
   signup, criação de funil, importação de CSV.

   3 layouts:
     horizontal (default) — linha com bubbles + labels
     vertical             — empilhado com descrição (onboarding detalhado)
     compact              — só dots + label do current (header de modal)

   5 estados por step:
     pending     — cinza, ainda não chegou
     active      — verde com ring, step atual
     done        — verde sólido + check
     processing  — info azul + spinner (assíncrono)
     error       — vermelho + X

   Props:
     steps   — Array<{ label, description?, state? }>
               state: 'pending' (default) | 'active' | 'done' | 'processing' | 'error'
               Se omitir state em cada item, infere pelo current.
     current — index do step atual (0-based) — usado se steps não têm state explícito
     layout  — 'horizontal' (default) | 'vertical' | 'compact'

   Exemplo (simples):
     <WizardStepper
       current={2}
       steps={[
         { label: 'Dados' },
         { label: 'Canal' },
         { label: 'Equipe' },
         { label: 'Funil' },
       ]}
     />

   Exemplo (states custom):
     <WizardStepper
       layout="vertical"
       steps={[
         { label: 'Dados', state: 'done', description: 'Empresa cadastrada' },
         { label: 'Canal', state: 'processing', description: 'Conectando WhatsApp...' },
         { label: 'Funil', state: 'error', description: 'Falha — verifique permissões' },
       ]}
     />
   ============================================================ */

function getStateForIndex(steps, current, index) {
  // Se o step tem state explícito, usa
  if (steps[index].state) return steps[index].state
  if (typeof current !== 'number') return 'pending'
  if (index < current) return 'done'
  if (index === current) return 'active'
  return 'pending'
}

function renderBubble(state, indexLabel) {
  const cls = `ds-stepper__bubble ds-stepper__bubble--${state}`
  switch (state) {
    case 'done':
      return <span className={cls}><Icon icon="mdi:check" width={14} height={14} /></span>
    case 'error':
      return <span className={cls}><Icon icon="mdi:close" width={14} height={14} /></span>
    case 'processing':
      return <span className={cls}><span className="ds-loading-dots"><span /><span /><span /></span></span>
    case 'active':
      return <span className={cls}>{indexLabel}</span>
    case 'pending':
    default:
      return <span className={cls}>{indexLabel}</span>
  }
}

export default function WizardStepper({
  steps = [],
  current = 0,
  layout = 'horizontal',
  className = '',
  style,
}) {
  const total = steps.length

  /* ===== COMPACT — só dots + label do current ===== */
  if (layout === 'compact') {
    const activeStep = steps[current]
    return (
      <div className={`ds-stepper ds-stepper--compact ${className}`} style={style}>
        {steps.map((_, i) => (
          <span
            key={i}
            className={`ds-stepper__dot ${i < current ? 'ds-stepper__dot--done' : i === current ? 'ds-stepper__dot--active' : ''}`}
          />
        ))}
        <span style={{ color: 'var(--color-text-secondary)', marginLeft: 6 }}>
          {current + 1} de {total}
        </span>
        {activeStep?.label && (
          <span style={{ marginLeft: 4, fontWeight: 600, color: 'var(--color-text-primary)' }}>
            · {activeStep.label}
          </span>
        )}
      </div>
    )
  }

  /* ===== HORIZONTAL — bubbles + labels + linhas conectoras ===== */
  if (layout === 'horizontal') {
    return (
      <div className={`ds-stepper ds-stepper--horizontal ${className}`} style={style}>
        {steps.map((step, i) => {
          const state = getStateForIndex(steps, current, i)
          const isLast = i === total - 1
          const nextState = !isLast ? getStateForIndex(steps, current, i + 1) : null
          const lineDone = state === 'done' || (state === 'active' && nextState && (nextState === 'done' || nextState === 'active'))
          return (
            <React.Fragment key={i}>
              <div className="ds-stepper__step">
                {renderBubble(state, i + 1)}
                <span className={`ds-stepper__label ds-stepper__label--${state}`}>
                  {step.label}
                </span>
              </div>
              {!isLast && (
                <div className={`ds-stepper__line ${state === 'done' || lineDone ? 'ds-stepper__line--done' : ''}`} />
              )}
            </React.Fragment>
          )
        })}
      </div>
    )
  }

  /* ===== VERTICAL — empilhado com descrição ===== */
  return (
    <div className={`ds-stepper ds-stepper--vertical ${className}`} style={style}>
      {steps.map((step, i) => {
        const state = getStateForIndex(steps, current, i)
        const isLast = i === total - 1
        return (
          <div key={i} className="ds-stepper__step">
            {!isLast && (
              <div className={`ds-stepper__line ${state === 'done' ? 'ds-stepper__line--done' : ''}`} />
            )}
            {renderBubble(state, i + 1)}
            <div className="ds-stepper__item" style={{ flex: 1 }}>
              <div className={`ds-stepper__label ds-stepper__label--${state}`}>
                {step.label}
              </div>
              {step.description && (
                <div className="ds-stepper__description">{step.description}</div>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
