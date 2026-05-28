import React, { useState, useRef, useEffect } from 'react'
import { Icon } from '@iconify/react'
import './Dropdown.css'

/* ============================================================
   Dropdown — DS Mensalli

   Composição declarativa:
     <Dropdown trigger={<Button icon="..." iconOnly />} align="end">
       <Dropdown.Item icon="mdi:pencil" onClick={...}>Editar</Dropdown.Item>
       <Dropdown.Item icon="mdi:archive" onClick={...}>Arquivar</Dropdown.Item>
       <Dropdown.Divider />
       <Dropdown.Item icon="mdi:trash" danger onClick={...}>Excluir</Dropdown.Item>
     </Dropdown>

   Props (Dropdown):
     trigger    — ReactNode clicável que abre o menu
     align      — 'start' (esquerda) | 'end' (default — direita)
     width      — 'auto' (default) | 'md' (240) | 'lg' (320)
     closeOnSelect — boolean (default true)

   Props (Dropdown.Item):
     icon       — string iconify
     shortcut   — string (ex.: "⌘+S")
     danger     — boolean: cor vermelha
     disabled   — boolean
     onClick    — handler

   Sub-componentes: Dropdown.Item, Dropdown.Divider, Dropdown.Group
   ============================================================ */

export default function Dropdown({
  trigger,
  align = 'end',
  width = 'auto',
  closeOnSelect = true,
  children,
  className = '',
  style,
}) {
  const [isOpen, setIsOpen] = useState(false)
  const wrapperRef = useRef(null)

  useEffect(() => {
    if (!isOpen) return
    function handleClickOutside(e) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) {
        setIsOpen(false)
      }
    }
    function handleEsc(e) {
      if (e.key === 'Escape') setIsOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleEsc)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleEsc)
    }
  }, [isOpen])

  // Injeta close em todos os Dropdown.Item filhos
  const items = React.Children.map(children, child => {
    if (!React.isValidElement(child)) return child
    if (child.type === DropdownItem) {
      const originalOnClick = child.props.onClick
      return React.cloneElement(child, {
        onClick: (e) => {
          originalOnClick?.(e)
          if (closeOnSelect) setIsOpen(false)
        },
      })
    }
    return child
  })

  const panelClasses = [
    'ds-dropdown-panel',
    `ds-dropdown-panel--align-${align}`,
    width !== 'auto' && `ds-dropdown-panel--width-${width}`,
    className,
  ].filter(Boolean).join(' ')

  return (
    <span ref={wrapperRef} className="ds-dropdown-wrapper" style={style}>
      <span onClick={() => setIsOpen(o => !o)}>
        {trigger}
      </span>
      {isOpen && (
        <div className={panelClasses} role="menu">
          {items}
        </div>
      )}
    </span>
  )
}

/* ----- Sub-componentes ----- */

function DropdownItem({
  icon,
  shortcut,
  danger = false,
  disabled = false,
  onClick,
  children,
  className = '',
  ...rest
}) {
  const classes = [
    'ds-dropdown-item',
    danger && 'ds-dropdown-item--danger',
    className,
  ].filter(Boolean).join(' ')
  return (
    <button
      type="button"
      role="menuitem"
      className={classes}
      onClick={onClick}
      disabled={disabled}
      {...rest}
    >
      {icon && (
        <span className="ds-dropdown-item__icon">
          {typeof icon === 'string' ? <Icon icon={icon} width={16} height={16} /> : icon}
        </span>
      )}
      <span className="ds-dropdown-item__label">{children}</span>
      {shortcut && <span className="ds-dropdown-item__shortcut">{shortcut}</span>}
    </button>
  )
}

Dropdown.Item = DropdownItem

Dropdown.Divider = function DropdownDivider() {
  return <hr className="ds-dropdown-divider" />
}

Dropdown.Group = function DropdownGroup({ label, children }) {
  return (
    <>
      {label && <div className="ds-dropdown-group-label">{label}</div>}
      {children}
    </>
  )
}
