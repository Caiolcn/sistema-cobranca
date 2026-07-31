import React, { useState, useRef, useEffect, useLayoutEffect } from 'react'
import { createPortal } from 'react-dom'
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

   O painel é renderizado em portal no body com position:fixed — senão
   qualquer container com overflow (Table, cards com overflow-x) corta o menu.
   Ele se ancora no trigger e vira pra cima quando não cabe embaixo.
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
  const [posicao, setPosicao] = useState(null)
  const wrapperRef = useRef(null)
  const panelRef = useRef(null)

  useEffect(() => {
    if (!isOpen) {
      setPosicao(null)
      return
    }
    function handleClickOutside(e) {
      // O painel vive em portal: precisa entrar na conta, senão o mousedown
      // fecha o menu antes do click chegar no item
      const dentroDoTrigger = wrapperRef.current?.contains(e.target)
      const dentroDoPainel = panelRef.current?.contains(e.target)
      if (!dentroDoTrigger && !dentroDoPainel) setIsOpen(false)
    }
    function handleEsc(e) {
      if (e.key === 'Escape') setIsOpen(false)
    }
    // Painel é fixed: rolar a página descolaria ele do trigger
    function fechar() { setIsOpen(false) }
    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleEsc)
    window.addEventListener('scroll', fechar, true)
    window.addEventListener('resize', fechar)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleEsc)
      window.removeEventListener('scroll', fechar, true)
      window.removeEventListener('resize', fechar)
    }
  }, [isOpen])

  // Ancora o painel no trigger antes da pintura (vira pra cima se não couber)
  useLayoutEffect(() => {
    if (!isOpen || !wrapperRef.current || !panelRef.current) return
    const trigger = wrapperRef.current.getBoundingClientRect()
    const altura = panelRef.current.offsetHeight
    const largura = panelRef.current.offsetWidth
    const cabeEmbaixo = window.innerHeight - trigger.bottom >= altura + 12
    const cabeEmCima = trigger.top >= altura + 12
    const paraCima = !cabeEmbaixo && cabeEmCima

    const proximo = { top: paraCima ? trigger.top - altura - 6 : trigger.bottom + 6 }
    if (align === 'start') {
      proximo.left = Math.max(8, Math.min(trigger.left, window.innerWidth - largura - 8))
    } else {
      proximo.left = Math.max(8, Math.min(trigger.right - largura, window.innerWidth - largura - 8))
    }
    setPosicao(proximo)
  }, [isOpen, align])

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
      {isOpen && createPortal(
        <div
          ref={panelRef}
          className={panelClasses}
          role="menu"
          style={{
            position: 'fixed',
            top: posicao?.top ?? 0,
            left: posicao?.left ?? 0,
            right: 'auto',
            zIndex: 1000,
            // sem medida ainda: renderiza invisível pra não piscar no canto
            visibility: posicao ? 'visible' : 'hidden'
          }}
        >
          {items}
        </div>,
        document.body
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
