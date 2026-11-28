import React from 'react'
import { Icon } from '@iconify/react'
import './ChoiceCard.css'

/* ============================================================
   ChoiceCard — DS Mensalli
   Cartão de escolha única (funciona como um radio grande).
   Use dentro de um <div role="radiogroup" aria-label="...">.

   Props:
     selected    — boolean
     onSelect    — () => void
     icon        — string iconify
     title       — texto principal
     description — linha de apoio
     badge       — ReactNode no canto (ex.: <Badge>Recomendado</Badge>)
     disabled, loading
   ============================================================ */

export default function ChoiceCard({
  selected = false,
  onSelect,
  icon,
  title,
  description,
  badge,
  disabled = false,
  loading = false,
  className = '',
  style,
}) {
  const classes = [
    'ds-choice',
    selected && 'ds-choice--selected',
    (disabled || loading) && 'ds-choice--disabled',
    className,
  ].filter(Boolean).join(' ')

  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      disabled={disabled}
      aria-busy={loading || undefined}
      className={classes}
      style={style}
      onClick={() => { if (!selected && !loading) onSelect?.() }}
    >
      {icon && (
        <span className="ds-choice__icon" aria-hidden="true">
          <Icon icon={icon} width="22" height="22" />
        </span>
      )}
      <span className="ds-choice__text">
        <span className="ds-choice__title">
          {title}
          {badge}
        </span>
        {description && <span className="ds-choice__desc">{description}</span>}
      </span>
      <span className="ds-choice__radio" aria-hidden="true" />
    </button>
  )
}
