import React, { forwardRef, useEffect, useRef, useId } from 'react'
import './Checkbox.css'

/* ============================================================
   Checkbox — DS Mensalli

   Props:
     checked        — boolean (controlled)
     defaultChecked — boolean (uncontrolled)
     indeterminate  — boolean (props-driven; força estado visual de traço)
     onChange(e)    — recebe ChangeEvent nativo
     disabled, name, value, required — passam pro input

     label          — texto principal (filho de <label>)
     description    — texto secundário cinza embaixo
     error          — string com mensagem (marca como inválido visualmente)

   Composição:
     <Checkbox
       checked={aceitouTermos}
       onChange={e => setAceitouTermos(e.target.checked)}
       label="Aceito os termos"
       description="Você pode revogar a qualquer momento"
     />

     <Checkbox indeterminate checked label="Selecionar tudo" />
   ============================================================ */

const Checkbox = forwardRef(function Checkbox({
  checked,
  defaultChecked,
  indeterminate = false,
  onChange,
  disabled = false,
  required = false,
  name,
  value,
  label,
  description,
  error,
  id: idProp,
  className = '',
  style,
  ...rest
}, externalRef) {
  const autoId = useId()
  const id = idProp || `ds-checkbox-${autoId}`

  // Ref interna pra setar indeterminate (atributo só-JS)
  const innerRef = useRef(null)
  function setRef(node) {
    innerRef.current = node
    if (typeof externalRef === 'function') externalRef(node)
    else if (externalRef) externalRef.current = node
  }

  useEffect(() => {
    if (innerRef.current) {
      innerRef.current.indeterminate = indeterminate
    }
  }, [indeterminate])

  const wrapperClasses = [
    'ds-checkbox',
    disabled && 'ds-checkbox--disabled',
    error && 'ds-checkbox--error',
    className,
  ].filter(Boolean).join(' ')

  return (
    <label className={wrapperClasses} style={style} htmlFor={id}>
      <input
        ref={setRef}
        id={id}
        type="checkbox"
        className="ds-checkbox__input"
        checked={checked}
        defaultChecked={defaultChecked}
        onChange={onChange}
        disabled={disabled}
        name={name}
        value={value}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : (description ? `${id}-desc` : undefined)}
        {...rest}
      />
      <span className="ds-checkbox__control" aria-hidden="true" />
      {(label || description || error) && (
        <span className="ds-checkbox__text">
          {label && <span className="ds-checkbox__label">{label}</span>}
          {description && !error && (
            <span id={`${id}-desc`} className="ds-checkbox__description">{description}</span>
          )}
          {error && (
            <span id={`${id}-error`} className="ds-checkbox__description" role="alert" style={{ color: 'var(--danger-700)' }}>
              {error}
            </span>
          )}
        </span>
      )}
    </label>
  )
})

export default Checkbox
