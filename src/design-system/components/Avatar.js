import React, { forwardRef, useState, useMemo } from 'react'
import './Avatar.css'

/* ============================================================
   Avatar — DS Mensalli

   Iniciais derivadas do nome (1ª palavra + última, ou só 1ª se for único).
   Cor de fundo derivada via hash → 1 das 8 cores da paleta.
   Mesma pessoa sempre tem a mesma cor.

   Props:
     name           — string (gera iniciais + cor)
     src            — string: URL de imagem; se carrega, sobrepõe iniciais; se falha, mostra iniciais
     size           — 'xs' | 'sm' | 'md' (default) | 'lg' | 'xl' | '2xl'
     status         — 'online' | 'away' | 'busy' | 'offline'
     ring           — 'success' | 'warning' | 'danger' | 'info' | 'primary' | 'neutral'
     blocked        — boolean: grayscale + opacity, comunica indisponibilidade
     onClick        — torna clicável (cursor pointer); usado como popover trigger

   Exemplos:
     <Avatar name="Maria Silva" />
     <Avatar name="João" src="/joao.jpg" status="online" />
     <Avatar name="Pedro" ring="success" />                    // Cliente
     <Avatar name="Ana" ring="warning" size="lg" />            // Lead
   ============================================================ */

/* Iniciais: 1 palavra → 1ª letra; 2+ palavras → 1ª + última 1ª letra */
export function iniciaisDe(nome) {
  if (!nome || typeof nome !== 'string') return '?'
  const partes = nome.trim().split(/\s+/).filter(Boolean)
  if (partes.length === 0) return '?'
  if (partes.length === 1) return partes[0][0].toUpperCase()
  return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase()
}

/* Hash determinístico do nome → índice na paleta (8 cores) */
export function paletaIndex(nome) {
  if (!nome) return 0
  let hash = 0
  const s = nome.trim().toLowerCase()
  for (let i = 0; i < s.length; i++) {
    hash = (hash * 31 + s.charCodeAt(i)) | 0  // 32-bit truncate
  }
  return Math.abs(hash) % 8
}

const Avatar = forwardRef(function Avatar({
  name = '',
  src,
  size = 'md',
  status,
  ring,
  blocked = false,
  onClick,
  className = '',
  style,
  ...rest
}, ref) {
  const [imgError, setImgError] = useState(false)
  const iniciais = useMemo(() => iniciaisDe(name), [name])
  const paleta = useMemo(() => paletaIndex(name), [name])

  const showImage = src && !imgError

  const classes = [
    'ds-avatar',
    `ds-avatar--${size}`,
    !showImage && `ds-avatar--palette-${paleta}`,
    ring && `ds-avatar--ringed ds-avatar--ring-${ring}`,
    blocked && 'ds-avatar--blocked',
    className,
  ].filter(Boolean).join(' ')

  return (
    <span
      ref={ref}
      className={classes}
      style={{
        cursor: onClick ? 'pointer' : undefined,
        ...style,
      }}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      aria-label={name || undefined}
      {...rest}
    >
      {showImage ? (
        <img
          className="ds-avatar__img"
          src={src}
          alt={name || ''}
          onError={() => setImgError(true)}
        />
      ) : (
        iniciais
      )}
      {status && (
        <span
          className={`ds-avatar__status ds-avatar__status--${status}`}
          aria-label={status}
          title={status}
        />
      )}
    </span>
  )
})

export default Avatar
