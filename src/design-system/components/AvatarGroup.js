import React from 'react'
import Avatar from './Avatar'
import './Avatar.css'

/* ============================================================
   AvatarGroup — DS Mensalli
   Avatares sobrepostos com ring branco entre cada.
   Overflow vira "+N" no fim quando passa do max.

   Props:
     avatars  — Array<{ name, src?, status?, ring? }>
     max      — número máximo visível antes do "+N" (default 4)
     size     — sm | md (default) | lg | xl (xs/2xl não recomendados em group)

   Exemplo:
     <AvatarGroup
       avatars={[
         { name: 'Joana Silva' },
         { name: 'Pedro Costa' },
         { name: 'Maria Santos' },
         { name: 'Ana Mendes' },
         { name: 'Carlos Lima' },
         { name: 'João Pereira' },
       ]}
       max={4}
     />
   ============================================================ */

export default function AvatarGroup({
  avatars = [],
  max = 4,
  size = 'md',
  className = '',
  style,
}) {
  const visible = avatars.slice(0, max)
  const overflow = avatars.length - visible.length

  const classes = [
    'ds-avatar-group',
    `ds-avatar-group--${size}`,
    className,
  ].filter(Boolean).join(' ')

  return (
    <span className={classes} style={style}>
      {visible.map((a, i) => (
        <Avatar
          key={`${a.name || 'av'}-${i}`}
          name={a.name}
          src={a.src}
          status={a.status}
          ring={a.ring}
          size={size}
        />
      ))}
      {overflow > 0 && (
        <span
          className={`ds-avatar ds-avatar--${size} ds-avatar-group__overflow`}
          aria-label={`mais ${overflow}`}
        >
          +{overflow}
        </span>
      )}
    </span>
  )
}
