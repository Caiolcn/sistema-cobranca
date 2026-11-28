import React, { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { Icon } from '@iconify/react'
import './NavSheet.css'

/* ============================================================
   NavSheet — DS Mensalli
   Folha que sobe de baixo com uma lista de destinos. É o "Mais"
   do BottomNav, mas serve para qualquer menu de navegação no
   celular. Fecha tocando fora, no X ou com Esc.

   Props:
     open, onClose
     title         — texto do topo da folha
     onBack        — se vier, mostra a seta de voltar (subnível)
     header        — conteúdo livre acima da lista (ex.: conta)
     sections: [{ key, label?, items: [{ key, label, icon, description?,
                  active?, onClick, tone?: 'default'|'danger'|'admin',
                  trailing?, chevron? }] }]
   ============================================================ */

export default function NavSheet({ open, onClose, title, onBack, header, sections = [] }) {
  const painelRef = useRef(null)

  useEffect(() => {
    if (!open) return
    const aoTeclar = (e) => { if (e.key === 'Escape') onClose?.() }
    document.addEventListener('keydown', aoTeclar)
    // Trava a rolagem da página enquanto a folha está aberta
    const overflowAntes = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    painelRef.current?.focus()
    return () => {
      document.removeEventListener('keydown', aoTeclar)
      document.body.style.overflow = overflowAntes
    }
  }, [open, onClose])

  if (!open) return null

  return createPortal(
    <>
      <div className="ds-navsheet-backdrop" onClick={onClose} aria-hidden="true" />
      <div
        ref={painelRef}
        className="ds-navsheet"
        role="dialog"
        aria-modal="true"
        aria-label={title || 'Menu'}
        tabIndex={-1}
      >
        <div className="ds-navsheet__handle" aria-hidden="true" />
        <div className="ds-navsheet__header">
          {onBack ? (
            <button type="button" className="ds-navsheet__icon-btn" onClick={onBack} aria-label="Voltar">
              <Icon icon="mdi:arrow-left" width="22" height="22" />
            </button>
          ) : <span className="ds-navsheet__icon-spacer" />}
          <span className="ds-navsheet__title">{title}</span>
          <button type="button" className="ds-navsheet__icon-btn" onClick={onClose} aria-label="Fechar menu">
            <Icon icon="mdi:close" width="22" height="22" />
          </button>
        </div>

        <div className="ds-navsheet__body">
          {header}
          {sections.map(section => (
            <div key={section.key} className="ds-navsheet__section">
              {section.label && <div className="ds-navsheet__section-label">{section.label}</div>}
              {section.items.map(item => (
                <button
                  key={item.key}
                  type="button"
                  className={[
                    'ds-navsheet__item',
                    item.active && 'ds-navsheet__item--active',
                    item.tone && item.tone !== 'default' && `ds-navsheet__item--${item.tone}`,
                  ].filter(Boolean).join(' ')}
                  aria-current={item.active ? 'page' : undefined}
                  onClick={item.onClick}
                >
                  <span className="ds-navsheet__item-icon" aria-hidden="true">
                    {typeof item.icon === 'string' ? <Icon icon={item.icon} width="22" height="22" /> : item.icon}
                  </span>
                  <span className="ds-navsheet__item-text">
                    <span className="ds-navsheet__item-label">{item.label}</span>
                    {item.description && <span className="ds-navsheet__item-desc">{item.description}</span>}
                  </span>
                  {item.trailing}
                  {item.chevron && <Icon icon="mdi:chevron-right" width="20" height="20" className="ds-navsheet__chevron" aria-hidden="true" />}
                </button>
              ))}
            </div>
          ))}
        </div>
      </div>
    </>,
    document.body
  )
}
