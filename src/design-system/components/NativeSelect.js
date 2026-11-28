import React, { forwardRef, useState, useId } from 'react'
import { Icon } from '@iconify/react'
import './Input.css'
import './NativeSelect.css'

/* ============================================================
   NativeSelect — DS Mensalli
   <select> do próprio navegador com a cara do Input.
   Quando usar no lugar do Select do DS:
     - lista curta (até ~15 opções), sem busca
     - formulário que precisa ser leve no celular: no iPhone e no
       Android abre a roda/lista do próprio sistema, que é o que a
       pessoa já sabe usar com o dedo.
   Para busca, várias escolhas ou opção com ícone/descrição, use Select.

   Props: label, helper, error, required, size ('sm'|'md'|'lg'),
          placeholder (vira a primeira opção vazia),
          options [{ value, label, disabled }] OU children <option>
   + props nativas de <select> (value, onChange, name, disabled...).
   ============================================================ */

const NativeSelect = forwardRef(function NativeSelect({
  label,
  helper,
  error,
  required = false,
  size = 'md',
  placeholder,
  options,
  children,
  fullWidth = true,
  id: idProp,
  className = '',
  style,
  onFocus,
  onBlur,
  disabled = false,
  ...rest
}, ref) {
  const autoId = useId()
  const id = idProp || `ds-nselect-${autoId}`
  const [focused, setFocused] = useState(false)
  const messageId = error ? `${id}-error` : (helper ? `${id}-helper` : undefined)

  const rowClasses = [
    'ds-input-row',
    `ds-input-row--${size}`,
    'ds-nselect-row',
    focused && 'ds-input-row--focused',
    error && 'ds-input-row--error',
    disabled && 'ds-input-row--disabled',
  ].filter(Boolean).join(' ')

  return (
    <div className={`ds-input-field ${className}`} style={{ width: fullWidth ? '100%' : 'auto', ...style }}>
      {label && (
        <label htmlFor={id} className="ds-input-label">
          {label}
          {required && <span className="ds-input-label__required" aria-hidden="true">*</span>}
        </label>
      )}

      <div className={rowClasses}>
        <select
          ref={ref}
          id={id}
          className="ds-nselect-native"
          onFocus={(e) => { setFocused(true); onFocus?.(e) }}
          onBlur={(e) => { setFocused(false); onBlur?.(e) }}
          disabled={disabled}
          required={required}
          aria-invalid={error ? true : undefined}
          aria-describedby={messageId}
          {...rest}
        >
          {placeholder !== undefined && <option value="" disabled={required}>{placeholder}</option>}
          {options
            ? options.map(opt => (
                <option key={String(opt.value)} value={opt.value} disabled={opt.disabled}>{opt.label}</option>
              ))
            : children}
        </select>
        <span className="ds-nselect-chevron" aria-hidden="true">
          <Icon icon="mdi:chevron-down" width={18} height={18} />
        </span>
      </div>

      {(error || helper) && (
        <div className="ds-input-message-row">
          {error
            ? <span id={`${id}-error`} className="ds-input-message ds-input-message--error" role="alert">{error}</span>
            : <span id={`${id}-helper`} className="ds-input-message">{helper}</span>}
        </div>
      )}
    </div>
  )
})

export default NativeSelect
