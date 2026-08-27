import React, { forwardRef } from 'react'
import { Icon } from '@iconify/react'
import './StatCard.css'

/* ============================================================
   StatCard — DS Mensalli

   Cartão de métrica. Um número que importa, com contexto opcional.

   Existia à mão em pelo menos 4 telas (Admin, Financeiro, Home, Relatórios),
   sempre o mesmo desenho e sempre com hex cravado. Aqui é uma peça só.

   Props:
     label     — o que o número mede ("MRR", "Contas ativas")
     value     — o número já formatado (string ou node). Formatação é do chamador:
                 o card não sabe se são reais, contas ou porcentagem.
     icon      — string iconify ou ReactNode
     accent    — 'primary' (default) | 'success' | 'warning' | 'danger' | 'info' | 'neutral'
     tinted    — boolean: fundo pastel da cor do accent (use com moderação, um por tela)

     delta     — { value, direction, label }
                 value     — string já formatada ("+12%", "3 a menos")
                 direction — 'up' | 'down' | 'flat'. É a DIREÇÃO, não o juízo.
                 tone      — opcional: 'positive' | 'negative' | 'neutral'.
                             Sem tone, up=positive e down=negative. Passe tone
                             quando subir for ruim (churn, inadimplência).
                 label     — contexto curto ("vs. mês anterior")

     hint      — linha de apoio abaixo do valor
     footer    — node livre no rodapé (barra de progresso, mini-lista)
     loading   — boolean: shimmer no lugar do valor
     onClick   — torna o card clicável (vira <button>)
     size      — 'sm' | 'md' (default)

   Exemplos:
     <StatCard label="MRR" value="R$ 4.280" icon="mdi:cash-multiple" accent="success"
               delta={{ value: '+12%', direction: 'up', label: 'vs. mês anterior' }} />

     <StatCard label="Churn" value={13} icon="mdi:account-off" accent="danger"
               delta={{ value: '+3', direction: 'up', tone: 'negative' }}
               onClick={() => irPara('churn')} />

     <StatCard label="Faturamento" value="R$ 12.400" loading={carregando} />
   ============================================================ */

function renderIcon(icon, size) {
  if (!icon) return null
  if (typeof icon === 'string') return <Icon icon={icon} width={size} height={size} />
  return icon
}

const SETA_POR_DIRECAO = {
  up: 'mdi:arrow-up',
  down: 'mdi:arrow-down',
  flat: 'mdi:minus',
}

// Sem `tone` explícito, subir é bom. Quem mede churn ou inadimplência
// passa tone: 'negative' — a seta continua pra cima, só a cor muda.
function tomDoDelta({ direction, tone }) {
  if (tone) return tone
  if (direction === 'up') return 'positive'
  if (direction === 'down') return 'negative'
  return 'neutral'
}

const StatCard = forwardRef(function StatCard({
  label,
  value,
  icon,
  accent = 'primary',
  tinted = false,
  delta,
  hint,
  footer,
  loading = false,
  onClick,
  size = 'md',
  className = '',
  style,
  ...rest
}, ref) {
  const clickable = typeof onClick === 'function'

  const classes = [
    'ds-statcard',
    `ds-statcard--${size}`,
    `ds-statcard--accent-${accent}`,
    tinted && 'ds-statcard--tinted',
    clickable && 'ds-statcard--clickable',
    loading && 'ds-statcard--loading',
    className,
  ].filter(Boolean).join(' ')

  const Tag = clickable ? 'button' : 'div'
  const iconSize = size === 'sm' ? 16 : 18

  return (
    <Tag
      ref={ref}
      className={classes}
      style={style}
      {...(clickable ? { type: 'button', onClick } : {})}
      {...rest}
    >
      <div className="ds-statcard__topo">
        <span className="ds-statcard__label">{label}</span>
        {icon && (
          <span className="ds-statcard__icon" aria-hidden="true">
            {renderIcon(icon, iconSize)}
          </span>
        )}
      </div>

      {loading ? (
        <div className="ds-statcard__skeleton" aria-hidden="true" />
      ) : (
        <div className="ds-statcard__value">{value}</div>
      )}

      {!loading && delta && (
        <div className={`ds-statcard__delta ds-statcard__delta--${tomDoDelta(delta)}`}>
          <Icon
            icon={SETA_POR_DIRECAO[delta.direction] || SETA_POR_DIRECAO.flat}
            width={12}
            height={12}
            aria-hidden="true"
          />
          <span className="ds-statcard__delta-valor">{delta.value}</span>
          {delta.label && <span className="ds-statcard__delta-label">{delta.label}</span>}
        </div>
      )}

      {!loading && hint && <div className="ds-statcard__hint">{hint}</div>}
      {!loading && footer && <div className="ds-statcard__footer">{footer}</div>}
    </Tag>
  )
})

export default StatCard
