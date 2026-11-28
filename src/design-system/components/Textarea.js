import React, { forwardRef, useState, useId, useRef, useLayoutEffect, useImperativeHandle } from 'react'
import './Input.css'
import './Textarea.css'

/* ============================================================
   Textarea — DS Mensalli
   Mesma anatomia do Input (label, borda, foco, erro, ajuda,
   contador) para texto de várias linhas: mensagens de WhatsApp,
   observação do aluno, descrição de plano.

   Props: label, helper, error, required, rows (padrão 4),
          autoResize (cresce com o texto até maxRows),
          maxRows (padrão 12), showCounter, maxLength
   + todas as props nativas de <textarea>.
   No celular a fonte é 16px (o iPhone não dá zoom).
   ============================================================ */

const Textarea = forwardRef(function Textarea({
  label,
  helper,
  error,
  required = false,
  rows = 4,
  autoResize = false,
  maxRows = 12,
  showCounter = false,
  maxLength,
  id: idProp,
  className = '',
  style,
  value,
  defaultValue,
  onChange,
  onFocus,
  onBlur,
  disabled = false,
  readOnly = false,
  ...rest
}, ref) {
  const autoId = useId()
  const id = idProp || `ds-textarea-${autoId}`
  const [focused, setFocused] = useState(false)
  const innerRef = useRef(null)
  useImperativeHandle(ref, () => innerRef.current)

  const isControlled = value !== undefined
  const [uncontrolledLen, setUncontrolledLen] = useState(String(defaultValue ?? '').length)
  const length = isControlled ? String(value ?? '').length : uncontrolledLen

  const messageId = error ? `${id}-error` : (helper ? `${id}-helper` : undefined)

  // Cresce com o conteúdo: zera a altura, mede o scrollHeight e limita a maxRows.
  useLayoutEffect(() => {
    if (!autoResize || !innerRef.current) return
    const el = innerRef.current
    const lineHeight = parseFloat(getComputedStyle(el).lineHeight) || 20
    const paddingY = parseFloat(getComputedStyle(el).paddingTop) + parseFloat(getComputedStyle(el).paddingBottom)
    el.style.height = 'auto'
    const max = lineHeight * maxRows + paddingY
    el.style.height = `${Math.min(el.scrollHeight, max)}px`
    el.style.overflowY = el.scrollHeight > max ? 'auto' : 'hidden'
  }, [value, autoResize, maxRows])

  const rowClasses = [
    'ds-input-row',
    'ds-textarea-row',
    focused && 'ds-input-row--focused',
    error && 'ds-input-row--error',
    disabled && 'ds-input-row--disabled',
    readOnly && 'ds-input-row--readonly',
  ].filter(Boolean).join(' ')

  return (
    <div className={`ds-input-field ${className}`} style={{ width: '100%', ...style }}>
      {label && (
        <label htmlFor={id} className="ds-input-label">
          {label}
          {required && <span className="ds-input-label__required" aria-hidden="true">*</span>}
        </label>
      )}

      <div className={rowClasses}>
        <textarea
          ref={innerRef}
          id={id}
          className="ds-textarea-native"
          rows={rows}
          value={isControlled ? value : undefined}
          defaultValue={!isControlled ? defaultValue : undefined}
          onChange={(e) => {
            if (!isControlled) setUncontrolledLen(e.target.value.length)
            onChange?.(e)
          }}
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
      </div>

      {(error || helper || (showCounter && maxLength)) && (
        <div className="ds-input-message-row">
          {error ? (
            <span id={`${id}-error`} className="ds-input-message ds-input-message--error" role="alert">{error}</span>
          ) : helper ? (
            <span id={`${id}-helper`} className="ds-input-message">{helper}</span>
          ) : null}
          {showCounter && maxLength && (
            <span className="ds-input-counter">{length}/{maxLength}</span>
          )}
        </div>
      )}
    </div>
  )
})

export default Textarea
