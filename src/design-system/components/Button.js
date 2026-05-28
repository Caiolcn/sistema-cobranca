import React, { forwardRef } from 'react'
import { Icon } from '@iconify/react'
import './Button.css'

/* ============================================================
   Button — DS Mensalli

   Variants:
     primary       — CTA principal (verde marca)
     secondary     — CTA alternativa (dark)
     outline       — Cancelar, Voltar
     ghost         — ícones, ações terciárias
     gray          — chip/filtro neutro
     danger        — destrutivo DEFINITIVO (vermelho sólido)
     danger-outline — delete leve em listas (fundo branco + border vermelho)
     danger-soft   — remover tag, desativar (vermelho claro)
     whatsapp      — CTA específico do WhatsApp

   Sizes: xs (24px), sm (32), md (40, DEFAULT), lg (48)

   Props:
     icon          — string iconify ("mdi:plus") ou ReactNode (esquerda)
     iconRight     — string ou ReactNode (direita)
     iconOnly      — botão quadrado só com ícone (aria-label OBRIGATÓRIO)
     loading       — substitui label por LoadingDots preservando dimensão
     fullWidth     — width 100% (use só em forms/mobile)
     shape         — 'default' | 'pill' | 'circle'
     elevated      — adiciona shadow (pra FAB)
     selected      — para padrão "Choice pair" (Presente/Falta)
     selectedTone  — 'success' | 'danger' | 'warning' | 'info' (cor do selected)
     as            — 'button' (default) ou 'a' pra link

   Exemplos:
     <Button variant="primary">Salvar</Button>
     <Button variant="ghost" icon="mdi:close" iconOnly aria-label="Fechar" />
     <Button variant="outline" selected selectedTone="success">Presente</Button>
     <Button shape="circle" elevated icon="mdi:plus" iconOnly aria-label="Novo" />
   ============================================================ */

const ICON_SIZE_BY_BUTTON = {
  xs: 14,
  sm: 16,
  md: 16,
  lg: 18,
}

function renderIcon(icon, size) {
  if (!icon) return null
  if (typeof icon === 'string') return <Icon icon={icon} width={size} height={size} />
  return icon
}

const Button = forwardRef(function Button({
  variant = 'primary',
  size = 'md',
  icon,
  iconRight,
  iconOnly = false,
  loading = false,
  fullWidth = false,
  shape = 'default',
  elevated = false,
  selected = false,
  selectedTone = 'success',
  as: Component = 'button',
  className = '',
  children,
  disabled,
  type,
  ...rest
}, ref) {
  const classes = [
    'ds-btn',
    `ds-btn--${variant}`,
    `ds-btn--${size}`,
    shape !== 'default' && `ds-btn--shape-${shape}`,
    iconOnly && 'ds-btn--icon-only',
    fullWidth && 'ds-btn--full',
    loading && 'ds-btn--loading',
    elevated && 'ds-btn--elevated',
    selected && 'ds-btn--selected',
    selected && `ds-btn--tone-${selectedTone}`,
    className,
  ].filter(Boolean).join(' ')

  const iconSize = ICON_SIZE_BY_BUTTON[size]
  const buttonType = Component === 'button' ? (type || 'button') : type

  return (
    <Component
      ref={ref}
      className={classes}
      disabled={Component === 'button' ? (disabled || loading) : undefined}
      aria-disabled={disabled || loading ? true : undefined}
      aria-pressed={selected || undefined}
      type={buttonType}
      {...rest}
    >
      <span className="ds-btn__label" style={{ display: 'inline-flex', alignItems: 'center', gap: 'inherit' }}>
        {renderIcon(icon, iconSize)}
        {!iconOnly && children}
        {renderIcon(iconRight, iconSize)}
      </span>
      {loading && (
        <span className="ds-btn__loading-overlay" aria-hidden="true">
          <span className="ds-loading-dots"><span /><span /><span /></span>
        </span>
      )}
    </Component>
  )
})

export default Button
