import React from 'react'
import { Icon } from '@iconify/react'
import './Alert.css'

/* ============================================================
   Alert — DS Mensalli
   Faixa de aviso dentro da página (não some sozinha, ao
   contrário do Toast). Para situação da conta, dica, erro de
   configuração.

   Props:
     variant  — 'info' (padrão) | 'success' | 'warning' | 'danger' | 'neutral'
     title    — texto em negrito (opcional)
     children — texto do aviso
     icon     — string iconify; false esconde; sem prop usa o da variante
     action   — ReactNode à direita (ex.: <Button size="sm">)
     onClose  — mostra o X para fechar
   ============================================================ */

const ICONES = {
  info: 'mdi:information-outline',
  success: 'mdi:check-circle-outline',
  warning: 'mdi:alert-outline',
  danger: 'mdi:alert-circle-outline',
  neutral: 'mdi:lightbulb-on-outline',
}

export default function Alert({
  variant = 'info',
  title,
  children,
  icon,
  action,
  onClose,
  className = '',
  style,
  ...rest
}) {
  const iconeFinal = icon === false ? null : (icon || ICONES[variant] || ICONES.info)
  const role = variant === 'danger' || variant === 'warning' ? 'alert' : 'status'

  return (
    <div className={`ds-alert ds-alert--${variant} ${className}`.trim()} role={role} style={style} {...rest}>
      {iconeFinal && (
        <span className="ds-alert__icon" aria-hidden="true">
          {typeof iconeFinal === 'string' ? <Icon icon={iconeFinal} width="20" height="20" /> : iconeFinal}
        </span>
      )}
      <div className="ds-alert__body">
        {title && <div className="ds-alert__title">{title}</div>}
        {children && <div className="ds-alert__text">{children}</div>}
      </div>
      {action && <div className="ds-alert__action">{action}</div>}
      {onClose && (
        <button type="button" className="ds-alert__close" onClick={onClose} aria-label="Fechar aviso">
          <Icon icon="mdi:close" width="18" height="18" />
        </button>
      )}
    </div>
  )
}
