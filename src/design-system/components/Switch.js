import React, { forwardRef, useId } from 'react'
import './Switch.css'

/* ============================================================
   Switch — DS Mensalli

   Pra LIGAR ou DESLIGAR algo (feature, modo, setting).
   Diferente de Checkbox — que é pra escolher item de uma lista.

   Props:
     checked        — boolean (controlled)
     defaultChecked — boolean (uncontrolled)
     onChange(e)    — recebe ChangeEvent nativo
     disabled, name, value
     size           — 'sm' | 'md' (default, 36×20) | 'lg'

     label          — texto principal (filho de <label>)
     description    — texto cinza embaixo (opcional)

     labelPosition  — 'right' (default — switch esquerda) | 'left' (label esquerda, switch direita — pattern SettingRow)

   Exemplos:
     <Switch
       checked={notif}
       onChange={e => setNotif(e.target.checked)}
       label="Notificar aluno"
     />

     <Switch
       checked={ia}
       onChange={e => setIa(e.target.checked)}
       label="Habilitar IA"
       description="Ativa respostas automáticas no WhatsApp"
       size="lg"
     />
   ============================================================ */

const Switch = forwardRef(function Switch({
  checked,
  defaultChecked,
  onChange,
  disabled = false,
  name,
  value,
  size = 'md',
  label,
  description,
  labelPosition = 'right',
  id: idProp,
  className = '',
  style,
  ...rest
}, ref) {
  const autoId = useId()
  const id = idProp || `ds-switch-${autoId}`

  const wrapperClasses = [
    'ds-switch',
    `ds-switch--${size}`,
    disabled && 'ds-switch--disabled',
    className,
  ].filter(Boolean).join(' ')

  const text = (label || description) && (
    <span className="ds-switch__text">
      {label && <span className="ds-switch__label">{label}</span>}
      {description && (
        <span id={`${id}-desc`} className="ds-switch__description">{description}</span>
      )}
    </span>
  )

  const control = (
    <>
      <input
        ref={ref}
        id={id}
        type="checkbox"
        role="switch"
        className="ds-switch__input"
        checked={checked}
        defaultChecked={defaultChecked}
        onChange={onChange}
        disabled={disabled}
        name={name}
        value={value}
        aria-describedby={description ? `${id}-desc` : undefined}
        {...rest}
      />
      <span className="ds-switch__track" aria-hidden="true" />
    </>
  )

  // labelPosition controla qual lado o texto fica
  return (
    <label
      className={wrapperClasses}
      style={labelPosition === 'left' ? { width: '100%', justifyContent: 'space-between', ...style } : style}
      htmlFor={id}
    >
      {labelPosition === 'left' ? (
        <>
          {text}
          <span style={{ display: 'inline-flex', alignItems: 'center' }}>{control}</span>
        </>
      ) : (
        <>
          {control}
          {text}
        </>
      )}
    </label>
  )
})

export default Switch
