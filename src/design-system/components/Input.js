import React, { forwardRef, useState, useId } from 'react'
import { Icon } from '@iconify/react'
import './Input.css'

/* ============================================================
   Input — DS Mensalli

   Estrutura:
     [label]
     ┌─ row ───────────────────────────────────────────────┐
     │ [prefix tag] · 🔍 (abs) native input (abs) X ⏳ ↗ │
     │                                              [suffix tag] │
     └─────────────────────────────────────────────────────┘
     [helper | error] [counter]

   - prefix/suffix são TAGS coladas com fundo cinza claro (R$, /mês)
   - icon (esquerda) e iconRight (direita) ficam VISUALMENTE DENTRO do input
   - clearable (X) e loading viram trailing group à direita

   Props (estrutura): label, helper, error, required
   Props (affixes):   prefix, suffix, icon, iconRight, clearable, loading
   Props (forma):     size ('sm'|'md'|'lg'), fullWidth, showCounter
   Native props:      type, value, onChange, placeholder, disabled, readOnly, maxLength, etc
   ============================================================ */

function renderIcon(icon, size = 18) {
  if (!icon) return null
  if (typeof icon === 'string') return <Icon icon={icon} width={size} height={size} />
  return icon
}

const Input = forwardRef(function Input({
  label,
  helper,
  error,
  required = false,
  prefix,
  suffix,
  icon,
  iconRight,
  clearable = false,
  loading = false,
  size = 'md',
  fullWidth = true,
  showCounter = false,
  id: idProp,
  className = '',
  style,
  value,
  defaultValue,
  onChange,
  onFocus,
  onBlur,
  onClear,
  disabled = false,
  readOnly = false,
  maxLength,
  ...rest
}, ref) {
  const autoId = useId()
  const id = idProp || `ds-input-${autoId}`
  const [focused, setFocused] = useState(false)

  const isControlled = value !== undefined
  const currentValue = isControlled ? value : (defaultValue ?? '')
  const hasValue = String(currentValue ?? '').length > 0

  const messageId = error ? `${id}-error` : (helper ? `${id}-helper` : undefined)
  const iconSize = size === 'sm' ? 16 : size === 'lg' ? 20 : 18

  // Trailing group existe se tem clear+valor, loading, OU iconRight
  const showClear = clearable && hasValue && !loading && !disabled
  const hasTrailing = showClear || loading || !!iconRight

  const rowClasses = [
    'ds-input-row',
    `ds-input-row--${size}`,
    focused && 'ds-input-row--focused',
    error && 'ds-input-row--error',
    disabled && 'ds-input-row--disabled',
    readOnly && 'ds-input-row--readonly',
    icon && 'ds-input-row--has-icon-left',
    hasTrailing && 'ds-input-row--has-trailing',
  ].filter(Boolean).join(' ')

  function handleClear() {
    if (onClear) onClear()
    if (onChange) {
      const event = { target: { value: '' }, currentTarget: { value: '' } }
      onChange(event)
    }
  }

  return (
    <div
      className={`ds-input-field ${className}`}
      style={{ width: fullWidth ? '100%' : 'auto', ...style }}
    >
      {label && (
        <label htmlFor={id} className="ds-input-label">
          {label}
          {required && <span className="ds-input-label__required" aria-hidden="true">*</span>}
        </label>
      )}

      <div className={rowClasses}>
        {/* Prefix — tag colada à esquerda (R$, mensalli.com.br/) */}
        {prefix && (
          <span className="ds-input-affix ds-input-affix--prefix">
            {prefix}
          </span>
        )}

        {/* Ícone decorativo à esquerda — ABSOLUTE, dentro do input */}
        {icon && (
          <span className="ds-input-icon ds-input-icon--left" aria-hidden="true">
            {renderIcon(icon, iconSize)}
          </span>
        )}

        <input
          ref={ref}
          id={id}
          className="ds-input-native"
          value={isControlled ? value : undefined}
          defaultValue={!isControlled ? defaultValue : undefined}
          onChange={onChange}
          onFocus={(e) => { setFocused(true); onFocus?.(e) }}
          onBlur={(e) => { setFocused(false); onBlur?.(e) }}
          disabled={disabled}
          readOnly={readOnly}
          maxLength={maxLength}
          aria-invalid={error ? true : undefined}
          aria-describedby={messageId}
          aria-required={required || undefined}
          {...rest}
        />

        {/* Trailing group à direita — ABSOLUTE.
            Comporta iconRight, clear button e loading dots. */}
        {hasTrailing && (
          <div className="ds-input-trailing">
            {showClear && (
              <button
                type="button"
                className="ds-input-clear"
                onClick={handleClear}
                aria-label="Limpar"
                tabIndex={-1}
              >
                <Icon icon="mdi:close-circle" width={iconSize} height={iconSize} />
              </button>
            )}

            {loading && (
              <span className="ds-input-loading" aria-label="Carregando">
                <span className="ds-loading-dots"><span /><span /><span /></span>
              </span>
            )}

            {iconRight && (
              <span className="ds-input-trailing-icon">
                {renderIcon(iconRight, iconSize)}
              </span>
            )}
          </div>
        )}

        {/* Suffix — tag colada à direita (/mês, %) */}
        {suffix && (
          <span className="ds-input-affix ds-input-affix--suffix">
            {suffix}
          </span>
        )}
      </div>

      {(error || helper || (showCounter && maxLength)) && (
        <div className="ds-input-message-row">
          {error ? (
            <span id={`${id}-error`} className="ds-input-message ds-input-message--error" role="alert">
              {error}
            </span>
          ) : helper ? (
            <span id={`${id}-helper`} className="ds-input-message">{helper}</span>
          ) : null}
          {showCounter && maxLength && (
            <span className="ds-input-counter">
              {String(currentValue ?? '').length}/{maxLength}
            </span>
          )}
        </div>
      )}
    </div>
  )
})

export default Input
