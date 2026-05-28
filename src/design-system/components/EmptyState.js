import React from 'react'
import { Icon } from '@iconify/react'
import './EmptyState.css'

/* ============================================================
   EmptyState — DS Mensalli

   5 variants por INTENÇÃO (não por aparência):
     - first-use       : nunca criou nada (CTA verde)
     - no-results      : busca não encontrou
     - no-matches      : filtros zeraram a lista
     - forbidden       : sem permissão
     - requires-setup  : depende de outra config
     - error           : carregamento falhou

   Sizes: compact (em card/widget), default, large (página inteira)

   Props:
     variant     — string (acima)
     icon        — string iconify (override do default)
     title       — string ou ReactNode
     description — string ou ReactNode
     action      — ReactNode (CTA principal)
     secondary   — ReactNode (ação secundária)
     size        — 'compact' | 'default' | 'large'

   Exemplo:
     <EmptyState
       variant="first-use"
       title="Nenhum cliente cadastrado"
       description="Comece cadastrando seu primeiro cliente ou importando uma planilha."
       action={<Button variant="primary" icon="mdi:plus">Cadastrar cliente</Button>}
       secondary={<Button variant="ghost">Importar CSV</Button>}
     />
   ============================================================ */

const DEFAULT_ICONS = {
  'first-use':      'mdi:sparkles',
  'no-results':     'mdi:magnify',
  'no-matches':     'mdi:filter-variant',
  'forbidden':      'mdi:lock-outline',
  'requires-setup': 'mdi:link-variant',
  'error':          'mdi:alert-circle-outline',
}

export default function EmptyState({
  variant = 'no-results',
  icon,
  title,
  description,
  action,
  secondary,
  size = 'default',
  className = '',
  style,
}) {
  const finalIcon = icon || DEFAULT_ICONS[variant] || 'mdi:tray'

  const classes = [
    'ds-empty-state',
    `ds-empty-state--${variant}`,
    `ds-empty-state--${size}`,
    className,
  ].filter(Boolean).join(' ')

  const iconSize = size === 'compact' ? 22 : size === 'large' ? 36 : 28

  return (
    <div className={classes} style={style}>
      <div className="ds-empty-state__icon">
        <Icon icon={finalIcon} width={iconSize} height={iconSize} />
      </div>
      {title && <div className="ds-empty-state__title">{title}</div>}
      {description && <div className="ds-empty-state__description">{description}</div>}
      {(action || secondary) && (
        <div className="ds-empty-state__actions">
          {action}
          {secondary}
        </div>
      )}
    </div>
  )
}
