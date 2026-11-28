import React, { useEffect, useState } from 'react'
import { Icon } from '@iconify/react'
import './BottomNav.css'

/* ============================================================
   BottomNav — DS Mensalli
   Menu fixo na parte de baixo do celular (até 640px).
   Funciona igual no app instalado (PWA) e no navegador:
     - altura da tela pelo `dvh`, então a barra do navegador
       (Safari/Chrome) não cobre o menu nem o fim da página;
     - respeita a borda segura do iPhone (safe-area-inset-bottom);
     - some enquanto o teclado está aberto, para não subir junto
       com ele e tapar o campo que a pessoa está digitando.

   Props:
     items: [{ key, label, icon, iconActive?, active, onClick, badge? }]
       badge: true = bolinha; número = contador
     ariaLabel: nome do menu para leitor de tela

   A página precisa reservar espaço embaixo: use a classe
   .ds-has-bottomnav no container que rola (ou padding-bottom
   com var(--app-bottomnav-h) + var(--safe-bottom)).
   ============================================================ */

// Só campos que abrem TECLADO. Lista nativa (select), data e hora abrem
// um seletor do sistema e no iPhone continuam "focados" depois da escolha —
// se entrassem aqui, o menu sumia e só voltava ao tocar fora (bug 28/11/2026).
const CAMPOS_DE_TEXTO = 'input:not([type=checkbox]):not([type=radio]):not([type=button]):not([type=submit]):not([type=reset]):not([type=range]):not([type=file]):not([type=color]):not([type=date]):not([type=time]):not([type=datetime-local]):not([type=month]):not([type=week]), textarea, [contenteditable="true"]'

export default function BottomNav({ items = [], ariaLabel = 'Menu principal' }) {
  const [tecladoAberto, setTecladoAberto] = useState(false)

  useEffect(() => {
    const aoFocar = (e) => { if (e.target?.matches?.(CAMPOS_DE_TEXTO)) setTecladoAberto(true) }
    const aoSair = (e) => { if (e.target?.matches?.(CAMPOS_DE_TEXTO)) setTecladoAberto(false) }
    document.addEventListener('focusin', aoFocar)
    document.addEventListener('focusout', aoSair)
    return () => {
      document.removeEventListener('focusin', aoFocar)
      document.removeEventListener('focusout', aoSair)
    }
  }, [])

  return (
    <nav className={`ds-bottomnav${tecladoAberto ? ' ds-bottomnav--escondido' : ''}`} aria-label={ariaLabel}>
      {items.map(item => (
        <button
          key={item.key}
          type="button"
          className={`ds-bottomnav__item${item.active ? ' ds-bottomnav__item--active' : ''}`}
          aria-current={item.active ? 'page' : undefined}
          onClick={item.onClick}
        >
          <span className="ds-bottomnav__icon" aria-hidden="true">
            <Icon icon={item.active && item.iconActive ? item.iconActive : item.icon} width="24" height="24" />
            {item.badge === true && <span className="ds-bottomnav__dot" />}
            {typeof item.badge === 'number' && item.badge > 0 && (
              <span className="ds-bottomnav__count">{item.badge > 99 ? '99+' : item.badge}</span>
            )}
          </span>
          <span className="ds-bottomnav__label">{item.label}</span>
        </button>
      ))}
    </nav>
  )
}
