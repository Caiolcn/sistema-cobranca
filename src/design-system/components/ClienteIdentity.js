import React from 'react'
import { Icon } from '@iconify/react'
import Avatar from './Avatar'
import Badge from './Badge'

/* ============================================================
   ClienteIdentity — DS Mensalli (Padrão de domínio)

   Bloco visual canônico pra identificar cliente/aluno.
   Aparece em 15+ lugares (tabela de clientes, header de perfil,
   chat, ChatArea, modal de detalhes).

   3 layouts pela INTENÇÃO da tela:
     compact       → 1 linha (lista, tabela)
     stacked       → 2 linhas com header (página de cliente, modal)
     contact-focus → telefone destacado (chat/comunicação)

   Carrega 3 camadas semânticas:
     identidade  → nome + foto/iniciais (com cor pelo hash)
     comercial   → ring colorido pelo status (lead/prospect/cliente/bloqueado)
     pertencimento → tags do cliente (cadastro/CRM)

   Props:
     cliente — { nome, telefone?, status?, tags?, avatarSrc?, onlineStatus?, statusLabel? }
                status: 'lead' | 'prospect' | 'cliente' | 'bloqueado'
     layout  — 'compact' (default) | 'stacked' | 'contact-focus'
     maxTags — max chips visíveis (overflow vira "+N", default 3)
     onClick — torna a área clicável (popover trigger)
     actions — ReactNode (à direita, opcional)
   ============================================================ */

const RING_BY_STATUS = {
  lead:      'warning',
  prospect:  'info',
  cliente:   'success',
  bloqueado: 'danger',
}

const STATUS_LABEL = {
  lead:      'Lead',
  prospect:  'Prospect',
  cliente:   'Cliente',
  bloqueado: 'Bloqueado',
}

function Tags({ tags = [], maxTags = 3, size = 'xs' }) {
  if (!tags || tags.length === 0) return null
  const visible = tags.slice(0, maxTags)
  const overflow = tags.length - visible.length
  return (
    <>
      {visible.map((t, i) => (
        <Badge key={typeof t === 'string' ? t : t.label || i} variant={typeof t === 'string' ? 'default' : (t.variant || 'default')} customColor={typeof t === 'object' ? t.color : undefined} customTextColor={typeof t === 'object' ? t.textColor : undefined} size={size}>
          {typeof t === 'string' ? t : t.label}
        </Badge>
      ))}
      {overflow > 0 && <Badge variant="outline" size={size}>+{overflow}</Badge>}
    </>
  )
}

function FoneInline({ telefone, sizeIcon = 14 }) {
  if (!telefone) return null
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--color-text-secondary)' }}>
      <Icon icon="mdi:phone" width={sizeIcon} height={sizeIcon} />
      {telefone}
    </span>
  )
}

export default function ClienteIdentity({
  cliente = {},
  layout = 'compact',
  maxTags = 3,
  onClick,
  actions,
  className = '',
  style,
}) {
  const { nome, telefone, status, statusLabel, tags = [], avatarSrc, onlineStatus, blocked } = cliente
  const ring = status ? RING_BY_STATUS[status] : undefined
  const label = statusLabel || STATUS_LABEL[status]

  const interactive = !!onClick
  const baseStyle = {
    display: 'flex',
    alignItems: layout === 'stacked' ? 'flex-start' : 'center',
    gap: layout === 'stacked' ? 14 : 10,
    cursor: interactive ? 'pointer' : 'default',
    fontFamily: 'var(--font-sans)',
    ...style,
  }

  /* ===== COMPACT — 1 linha ===== */
  if (layout === 'compact') {
    return (
      <div className={className} style={baseStyle} onClick={onClick}>
        <Avatar name={nome} src={avatarSrc} size="sm" ring={ring} status={onlineStatus} blocked={blocked || status === 'bloqueado'} />
        <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {nome}
          </span>
          <Tags tags={tags} maxTags={maxTags} size="xs" />
          {telefone && (
            <span style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--color-text-muted)' }}>
              · {telefone}
            </span>
          )}
        </div>
        {actions}
      </div>
    )
  }

  /* ===== STACKED — 2 linhas (header de página/modal) ===== */
  if (layout === 'stacked') {
    return (
      <div className={className} style={baseStyle} onClick={onClick}>
        <Avatar name={nome} src={avatarSrc} size="lg" ring={ring} status={onlineStatus} blocked={blocked || status === 'bloqueado'} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
            <span style={{ fontSize: 18, fontWeight: 700, color: 'var(--color-text-primary)' }}>{nome}</span>
            {label && status && (
              <Badge variant={RING_BY_STATUS[status] === 'success' ? 'success' : RING_BY_STATUS[status] === 'warning' ? 'warning' : RING_BY_STATUS[status] === 'info' ? 'info' : 'danger'} size="sm">
                {label}
              </Badge>
            )}
            <Tags tags={tags} maxTags={maxTags} size="sm" />
          </div>
          {telefone && <FoneInline telefone={telefone} sizeIcon={16} />}
        </div>
        {actions}
      </div>
    )
  }

  /* ===== CONTACT-FOCUS — chat/comunicação, telefone em destaque ===== */
  if (layout === 'contact-focus') {
    return (
      <div className={className} style={baseStyle} onClick={onClick}>
        <Avatar name={nome} src={avatarSrc} size="md" ring={ring} status={onlineStatus} blocked={blocked || status === 'bloqueado'} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text-primary)' }}>{nome}</span>
            {label && status && <Badge variant="default" size="xs" dot>{label}</Badge>}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
            <FoneInline telefone={telefone} />
          </div>
          {tags.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
              <Tags tags={tags} maxTags={maxTags} size="xs" />
            </div>
          )}
        </div>
        {actions}
      </div>
    )
  }

  return null
}
