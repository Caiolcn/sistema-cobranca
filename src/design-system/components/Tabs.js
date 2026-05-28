import React from 'react'
import { Icon } from '@iconify/react'
import './Tabs.css'

/* ============================================================
   Tabs — DS Mensalli

   3 variants:
     - underline   (default) — seções de página
     - pills                 — filtros de lista (com count opcional)
     - segmented             — view switcher iOS-style

   Props:
     items     — Array<{ value, label, icon?, count?, disabled? }>
     value     — valor atualmente selecionado
     onChange  — (value) → void
     variant   — 'underline' | 'pills' | 'segmented'
     size      — 'sm' | 'md' (default) | 'lg'
     fullWidth — boolean

   Exemplo:
     <Tabs
       variant="underline"
       value={tab}
       onChange={setTab}
       items={[
         { value: 'dados',    label: 'Dados', icon: 'mdi:account' },
         { value: 'hist',     label: 'Histórico', count: 24 },
         { value: 'arq',      label: 'Arquivos', count: 3 },
       ]}
     />
   ============================================================ */

export default function Tabs({
  items = [],
  value,
  onChange,
  variant = 'underline',
  size = 'md',
  fullWidth = false,
  className = '',
  style,
  ...rest
}) {
  const classes = [
    'ds-tabs',
    `ds-tabs--${variant}`,
    `ds-tabs--${size}`,
    fullWidth && 'ds-tabs--full',
    className,
  ].filter(Boolean).join(' ')

  return (
    <div role="tablist" className={classes} style={style} {...rest}>
      {items.map(item => {
        const isActive = item.value === value
        const itemClasses = [
          'ds-tabs__item',
          isActive && 'ds-tabs__item--active',
        ].filter(Boolean).join(' ')

        return (
          <button
            key={item.value}
            type="button"
            role="tab"
            aria-selected={isActive}
            disabled={item.disabled}
            className={itemClasses}
            onClick={() => onChange?.(item.value)}
          >
            {item.icon && (
              <Icon icon={item.icon} width={16} height={16} />
            )}
            {item.label}
            {item.count !== undefined && (
              <span className="ds-tabs__count">{item.count}</span>
            )}
          </button>
        )
      })}
    </div>
  )
}
