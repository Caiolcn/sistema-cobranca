import React, { forwardRef, useState } from 'react'
import { Icon } from '@iconify/react'
import Input from './Input'

/* ============================================================
   PasswordInput — DS Mensalli
   Composição sobre Input com eye-toggle automático.

   Uso:
     <PasswordInput
       label="Senha"
       value={senha}
       onChange={e => setSenha(e.target.value)}
     />
   ============================================================ */

const PasswordInput = forwardRef(function PasswordInput({
  ...rest
}, ref) {
  const [visivel, setVisivel] = useState(false)
  const iconSize = rest.size === 'sm' ? 16 : rest.size === 'lg' ? 20 : 18

  // Botão eye fica no iconRight via componente customizado
  const toggleButton = (
    <button
      type="button"
      onClick={() => setVisivel(v => !v)}
      aria-label={visivel ? 'Esconder senha' : 'Mostrar senha'}
      tabIndex={-1}
      style={{
        border: 'none',
        background: 'transparent',
        color: 'var(--color-text-muted)',
        cursor: 'pointer',
        padding: 0,
        display: 'inline-flex',
        alignItems: 'center',
      }}
    >
      <Icon icon={visivel ? 'mdi:eye-off-outline' : 'mdi:eye-outline'} width={iconSize} height={iconSize} />
    </button>
  )

  return (
    <Input
      ref={ref}
      type={visivel ? 'text' : 'password'}
      iconRight={toggleButton}
      autoComplete="current-password"
      {...rest}
    />
  )
})

export default PasswordInput
