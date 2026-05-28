import React, { forwardRef } from 'react'
import { Icon } from '@iconify/react'
import './Badge.css'

/* ============================================================
   Badge — DS Mensalli

   Pill / chip semântico. Para status, contadores, tags, indicadores.

   Props:
     variant   — 'default' | 'primary' | 'success' | 'warning' | 'danger' | 'info' | 'outline'
     solid     — boolean: troca o modo soft (default) por sólido (bg saturado + texto branco)
     size      — 'xs' | 'sm' (default) | 'md'
     shape     — 'pill' (default — radius full) | 'rounded' (radius médio)

     dot       — boolean: bolinha indicadora à esquerda (cor herdada do texto)
     icon      — string iconify ou ReactNode (esquerda, decorativo)
     onRemove  — função: ativa botão X à direita (chip removível)

     customColor      — hex livre pra background (sobrescreve variant)
     customTextColor  — hex livre pra texto (sobrescreve variant)

     children  — label do badge

   Exemplos:
     <Badge variant="success">Pago</Badge>
     <Badge variant="success" solid>Pago</Badge>
     <Badge variant="success" dot>Online</Badge>
     <Badge variant="warning" icon="mdi:clock-outline">Pendente</Badge>
     <Badge variant="primary" onRemove={() => removeTag(id)}>VIP</Badge>
     <Badge customColor="#8867A1" customTextColor="#FFFFFF">Custom</Badge>
   ============================================================ */

function renderIcon(icon, size) {
  if (!icon) return null
  if (typeof icon === 'string') return <Icon icon={icon} width={size} height={size} />
  return icon
}

const ICON_SIZE_BY_BADGE = {
  xs: 10,
  sm: 12,
  md: 14,
}

const Badge = forwardRef(function Badge({
  variant = 'default',
  solid = false,
  size = 'sm',
  shape = 'pill',
  dot = false,
  icon,
  onRemove,
  customColor,
  customTextColor,
  children,
  className = '',
  style,
  ...rest
}, ref) {
  const classes = [
    'ds-badge',
    `ds-badge--${variant}`,
    `ds-badge--${size}`,
    shape === 'rounded' && 'ds-badge--rounded',
    solid && 'ds-badge--solid',
    className,
  ].filter(Boolean).join(' ')

  // Override custom color via inline style
  const customStyle = customColor || customTextColor ? {
    ...(customColor ? { backgroundColor: customColor, borderColor: customColor } : {}),
    ...(customTextColor ? { color: customTextColor } : {}),
    ...style,
  } : style

  const iconSize = ICON_SIZE_BY_BADGE[size]

  return (
    <span ref={ref} className={classes} style={customStyle} {...rest}>
      {dot && <span className="ds-badge__dot" aria-hidden="true" />}
      {icon && <span className="ds-badge__icon">{renderIcon(icon, iconSize)}</span>}
      {children}
      {onRemove && (
        <button
          type="button"
          className="ds-badge__remove"
          onClick={onRemove}
          aria-label="Remover"
        >
          <Icon icon="mdi:close" width={iconSize} height={iconSize} />
        </button>
      )}
    </span>
  )
})

export default Badge
