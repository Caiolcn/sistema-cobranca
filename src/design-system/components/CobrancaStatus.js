import React from 'react'
import Badge from './Badge'

/* ============================================================
   CobrancaStatus — DS Mensalli (Padrão de domínio)

   Badge semântico de cobrança com REGRAS DE NEGÓCIO embutidas:
     - "Pago" simples
     - "Atrasado N dias" — calcula label automático
     - "Pendente" com vencimento próximo (warning) vs longe (info)
     - "Cancelado" com motivo opcional via title (tooltip)

   Props:
     status      — 'pago' | 'pendente' | 'atrasado' | 'cancelado'
     diasAtraso  — number (só usado em 'atrasado' — gera label "Atrasado X dias")
     diasParaVencer — number (só usado em 'pendente' — destaca se ≤ 3)
     motivo      — string (cancelado: vira tooltip)
     size        — 'xs' | 'sm' (default) | 'md'
     solid       — boolean: usa Badge solid
     icon        — boolean (default true): mostra ícone

   Exemplo:
     <CobrancaStatus status="pago" />
     <CobrancaStatus status="atrasado" diasAtraso={5} />
     <CobrancaStatus status="pendente" diasParaVencer={2} />
     <CobrancaStatus status="cancelado" motivo="Plano cancelado pelo aluno" />
   ============================================================ */

const ICON_BY_STATUS = {
  pago:      'mdi:check-circle',
  pendente:  'mdi:clock-outline',
  atrasado:  'mdi:alert-circle',
  cancelado: 'mdi:close-circle',
}

export default function CobrancaStatus({
  status,
  diasAtraso,
  diasParaVencer,
  motivo,
  size = 'sm',
  solid = false,
  icon = true,
  ...rest
}) {
  let variant = 'default'
  let label = ''
  let title = motivo

  switch (status) {
    case 'pago':
      variant = 'success'
      label = 'Pago'
      break
    case 'pendente':
      // Vence em ≤ 3 dias → warning. Caso contrário → info.
      if (typeof diasParaVencer === 'number' && diasParaVencer <= 3) {
        variant = 'warning'
        label = diasParaVencer <= 0
          ? 'Vence hoje'
          : diasParaVencer === 1
            ? 'Vence amanhã'
            : `Vence em ${diasParaVencer} dias`
      } else {
        variant = 'info'
        label = 'Em aberto'
      }
      break
    case 'atrasado':
      variant = 'danger'
      if (typeof diasAtraso === 'number' && diasAtraso > 0) {
        label = diasAtraso === 1 ? 'Atrasado 1 dia' : `Atrasado ${diasAtraso} dias`
      } else {
        label = 'Atrasado'
      }
      break
    case 'cancelado':
      variant = 'default'
      label = 'Cancelado'
      if (motivo) title = motivo
      break
    default:
      label = status || '—'
  }

  return (
    <Badge
      variant={variant}
      solid={solid}
      size={size}
      icon={icon ? ICON_BY_STATUS[status] : undefined}
      title={title}
      {...rest}
    >
      {label}
    </Badge>
  )
}
