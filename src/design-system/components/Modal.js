import React, { useEffect, useRef, useCallback, useId } from 'react'
import { createPortal } from 'react-dom'
import { Icon } from '@iconify/react'
import Button from './Button'
import './Modal.css'

/* ============================================================
   Modal — DS Mensalli

   Renderizado via React Portal no body — z-index independente
   da hierarquia do componente pai.

   Props:
     isOpen           — boolean (controla abertura)
     onClose          — função chamada quando user fecha (X, ESC, click backdrop)
     title            — string ou ReactNode (vai pro Modal.Header)
     subtitle         — string (vai pro Modal.Header)
     size             — 'sm' | 'md' (default) | 'lg' | 'xl' | 'fullscreen'
     position         — 'center' (default) | 'aside' (slide lateral direito)
     closeOnBackdrop  — boolean (default true)
     closeOnEsc       — boolean (default true)
     showClose        — boolean (default true): mostra X no header
     hideHeader       — boolean: renderiza só children, sem Header automático

   Sub-componentes:
     <Modal.Header title="..." subtitle="..." actions={...} />
     <Modal.Body>...</Modal.Body>
     <Modal.Footer align="end | start | between">...</Modal.Footer>

   Uso simples (com auto-header):
     <Modal isOpen={open} onClose={fecha} title="Editar cliente" size="md">
       <Modal.Body>conteúdo do form</Modal.Body>
       <Modal.Footer>
         <Button variant="outline" onClick={fecha}>Cancelar</Button>
         <Button variant="primary" onClick={salvar}>Salvar</Button>
       </Modal.Footer>
     </Modal>

   Aside (drawer lateral direito):
     <Modal isOpen={open} onClose={fecha} title="Detalhes" position="aside" size="md">
       ...
     </Modal>
   ============================================================ */

function focusableSelectors() {
  return [
    'a[href]',
    'button:not([disabled])',
    'input:not([disabled]):not([type="hidden"])',
    'textarea:not([disabled])',
    'select:not([disabled])',
    '[tabindex]:not([tabindex="-1"])',
  ].join(',')
}

export default function Modal({
  isOpen,
  onClose,
  title,
  subtitle,
  size = 'md',
  position = 'center',
  centered = false,
  closeOnBackdrop = true,
  closeOnEsc = true,
  showClose = true,
  hideHeader = false,
  children,
  className = '',
  style,
  ...rest
}) {
  const autoId = useId()
  const titleId = `ds-modal-title-${autoId}`
  const modalRef = useRef(null)
  const previousActiveElement = useRef(null)

  // ESC fecha
  useEffect(() => {
    if (!isOpen || !closeOnEsc) return
    function handleKeyDown(e) {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose?.()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, closeOnEsc, onClose])

  // Scroll lock no body
  useEffect(() => {
    if (!isOpen) return
    document.body.classList.add('ds-modal-open')
    return () => {
      document.body.classList.remove('ds-modal-open')
    }
  }, [isOpen])

  // Focus management — guarda foco anterior, foca o modal, restaura ao fechar
  useEffect(() => {
    if (!isOpen) return
    previousActiveElement.current = document.activeElement
    // Foca o primeiro elemento focusável dentro do modal (ou o próprio modal)
    const timer = setTimeout(() => {
      const m = modalRef.current
      if (!m) return
      const focusables = m.querySelectorAll(focusableSelectors())
      if (focusables.length > 0) {
        focusables[0].focus()
      } else {
        m.focus()
      }
    }, 50)
    return () => {
      clearTimeout(timer)
      // Restaura foco ao elemento anterior quando fecha
      if (previousActiveElement.current && typeof previousActiveElement.current.focus === 'function') {
        previousActiveElement.current.focus()
      }
    }
  }, [isOpen])

  // Focus trap — Tab/Shift+Tab cicla entre elementos focusáveis do modal
  const handleKeyDown = useCallback((e) => {
    if (e.key !== 'Tab') return
    const m = modalRef.current
    if (!m) return
    const focusables = m.querySelectorAll(focusableSelectors())
    if (focusables.length === 0) return
    const first = focusables[0]
    const last = focusables[focusables.length - 1]
    if (e.shiftKey) {
      if (document.activeElement === first) {
        e.preventDefault()
        last.focus()
      }
    } else {
      if (document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
  }, [])

  function handleBackdropClick(e) {
    if (e.target === e.currentTarget && closeOnBackdrop) {
      onClose?.()
    }
  }

  if (!isOpen) return null

  const modalClasses = [
    'ds-modal',
    `ds-modal--${size}`,
    position === 'aside' && 'ds-modal--aside',
    centered && position !== 'aside' && 'ds-modal--centered',
    className,
  ].filter(Boolean).join(' ')

  const backdropClasses = [
    'ds-modal-backdrop',
    position === 'aside' && 'ds-modal-backdrop--aside',
    centered && position !== 'aside' && 'ds-modal-backdrop--centered',
  ].filter(Boolean).join(' ')

  // Auto-header se title estiver passado
  const autoHeader = !hideHeader && (title || subtitle) && (
    <Modal.Header title={title} subtitle={subtitle} onClose={showClose ? onClose : undefined} titleId={titleId} />
  )

  return createPortal(
    <div className={backdropClasses} onClick={handleBackdropClick}>
      <div
        ref={modalRef}
        className={modalClasses}
        style={style}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        tabIndex={-1}
        onKeyDown={handleKeyDown}
        {...rest}
      >
        {autoHeader}
        {children}
      </div>
    </div>,
    document.body
  )
}

/* ----- Sub-componentes ----- */

Modal.Header = function ModalHeader({ title, subtitle, actions, onClose, titleId, children, className = '', style }) {
  return (
    <div className={`ds-modal__header ${className}`} style={style}>
      {(title || subtitle) ? (
        <div className="ds-modal__header-text">
          {title && <div id={titleId} className="ds-modal__title">{title}</div>}
          {subtitle && <div className="ds-modal__subtitle">{subtitle}</div>}
        </div>
      ) : children}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {actions}
        {onClose && (
          <button
            type="button"
            className="ds-modal__close"
            onClick={onClose}
            aria-label="Fechar"
          >
            <Icon icon="mdi:close" width={20} height={20} />
          </button>
        )}
      </div>
    </div>
  )
}

Modal.Body = function ModalBody({ padding, children, className = '', style, ...rest }) {
  const cls = [
    'ds-modal__body',
    padding && `ds-modal__body--${padding}`,
    className,
  ].filter(Boolean).join(' ')
  return <div className={cls} style={style} {...rest}>{children}</div>
}

Modal.Footer = function ModalFooter({ align = 'end', children, className = '', style, ...rest }) {
  const cls = [
    'ds-modal__footer',
    align !== 'end' && `ds-modal__footer--${align}`,
    className,
  ].filter(Boolean).join(' ')
  return <div className={cls} style={style} {...rest}>{children}</div>
}

/* ============================================================
   ConfirmDialog — preset baseado em Modal
   Substitui o pattern de ConfirmModal.js do projeto.
   ============================================================ */

const CONFIRM_VARIANT_CONFIG = {
  danger:  { icon: 'mdi:alert-circle', buttonVariant: 'danger' },
  warning: { icon: 'mdi:alert', buttonVariant: 'primary' },
  info:    { icon: 'mdi:information', buttonVariant: 'primary' },
  success: { icon: 'mdi:check-circle', buttonVariant: 'primary' },
}

export function ConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  variant = 'danger',
  loading = false,
  size = 'sm',
}) {
  const config = CONFIRM_VARIANT_CONFIG[variant] || CONFIRM_VARIANT_CONFIG.danger

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size={size}
      showClose={false}
      hideHeader
      closeOnBackdrop={!loading}
      closeOnEsc={!loading}
    >
      <Modal.Body padding="spacious">
        <div className="ds-confirm">
          <span className={`ds-confirm__icon ds-confirm__icon--${variant}`}>
            <Icon icon={config.icon} width={28} height={28} />
          </span>
          {title && <div className="ds-confirm__title">{title}</div>}
          {description && <div className="ds-confirm__description">{description}</div>}
        </div>
      </Modal.Body>
      <Modal.Footer align="between">
        <Button variant="outline" onClick={onClose} disabled={loading} fullWidth>
          {cancelLabel}
        </Button>
        <Button
          variant={config.buttonVariant}
          onClick={onConfirm}
          loading={loading}
          fullWidth
        >
          {confirmLabel}
        </Button>
      </Modal.Footer>
    </Modal>
  )
}
