import React, { forwardRef } from 'react'
import './Card.css'

/* ============================================================
   Card — DS Mensalli

   Props:
     elevation  — 'flat' (default) | 'elevated' (shadow-sm) | 'floating' (shadow-lg)
     padding    — 'tight' | 'default' | 'spacious' | 'none' (quando usar Card.Header/Body/Footer)
     accent     — 'success' | 'warning' | 'danger' | 'info' | 'primary' | 'neutral'
                  (adiciona barra lateral colorida 3px à esquerda)
     tinted     — boolean: usa bg colorido pastel combinando com accent (opt-in)
     clickable  — vira <button> com hover/active states
     onClick    — handler (com clickable=true)
     as         — 'div' (default) | 'article' | 'section' | 'button'

   Children livre — use Card.Header, Card.Body, Card.Footer, Card.Divider
   pra estrutura semântica, OU passe qualquer JSX direto.

   Exemplos:
     <Card>Conteúdo simples</Card>

     <Card elevation="elevated" accent="success" tinted>
       Recebido este mês: R$ 42.000
     </Card>

     <Card padding="none" elevation="elevated">
       <Card.Header
         title="Joana Silva"
         subtitle="Cliente desde mai/2024"
         actions={<Button variant="ghost" iconOnly icon="mdi:dots-vertical" />}
       />
       <Card.Body>...</Card.Body>
       <Card.Footer>
         <Button variant="outline">Cancelar</Button>
         <Button variant="primary">Salvar</Button>
       </Card.Footer>
     </Card>

     <Card clickable onClick={() => navegar()}>
       <Card.Header title="Lista de cobranças" subtitle="42 ativas" />
     </Card>
   ============================================================ */

const Card = forwardRef(function Card({
  elevation = 'flat',
  padding = 'default',
  accent,
  tinted = false,
  clickable = false,
  as,
  className = '',
  style,
  children,
  ...rest
}, ref) {
  const Component = as || (clickable ? 'button' : 'div')

  const classes = [
    'ds-card',
    `ds-card--${elevation}`,
    `ds-card--padding-${padding}`,
    accent && `ds-card--accent ds-card--accent-${accent}`,
    accent && tinted && 'ds-card--tinted',
    clickable && 'ds-card--clickable',
    className,
  ].filter(Boolean).join(' ')

  // type=button quando vira button (evita submit acidental em forms)
  const extra = Component === 'button' ? { type: rest.type || 'button' } : {}

  return (
    <Component ref={ref} className={classes} style={style} {...extra} {...rest}>
      {children}
    </Component>
  )
})

/* ----- Sub-componentes (Card.Header / Body / Footer / Divider) ----- */

Card.Header = function CardHeader({ title, subtitle, actions, children, className = '', style, ...rest }) {
  return (
    <div className={`ds-card__header ${className}`} style={style} {...rest}>
      {(title || subtitle) ? (
        <div className="ds-card__header-text">
          {title && <div className="ds-card__title">{title}</div>}
          {subtitle && <div className="ds-card__subtitle">{subtitle}</div>}
        </div>
      ) : null}
      {children && !title && !subtitle && children}
      {actions && <div className="ds-card__header-actions">{actions}</div>}
    </div>
  )
}

Card.Body = function CardBody({ padding, children, className = '', style, ...rest }) {
  const cls = [
    'ds-card__body',
    padding && `ds-card__body--${padding}`,
    className,
  ].filter(Boolean).join(' ')
  return <div className={cls} style={style} {...rest}>{children}</div>
}

Card.Footer = function CardFooter({ align = 'end', children, className = '', style, ...rest }) {
  const cls = [
    'ds-card__footer',
    align !== 'end' && `ds-card__footer--${align}`,
    className,
  ].filter(Boolean).join(' ')
  return <div className={cls} style={style} {...rest}>{children}</div>
}

Card.Divider = function CardDivider({ className = '', style }) {
  return <hr className={`ds-card__divider ${className}`} style={style} />
}

export default Card
