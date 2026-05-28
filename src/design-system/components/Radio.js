import React, { forwardRef, useId } from 'react'
import './Radio.css'

/* ============================================================
   Radio — DS Mensalli
   Igual ao Checkbox em estrutura, mas:
   - Não tem indeterminate
   - Visual circular com ponto centralizado
   - Geralmente usado em grupo via <RadioGroup>

   Uso isolado:
     <Radio name="genero" value="m" label="Masculino" checked={...} onChange={...} />

   Uso em grupo (recomendado):
     <RadioGroup
       label="Tipo de aluno"
       value={tipo}
       onChange={setTipo}
       options={[
         { value: 'turma',      label: 'Aluno em turma' },
         { value: 'individual', label: 'Aluno individual' },
       ]}
     />
   ============================================================ */

const Radio = forwardRef(function Radio({
  checked,
  defaultChecked,
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
}, ref) {
  const autoId = useId()
  const id = idProp || `ds-radio-${autoId}`

  const wrapperClasses = [
    'ds-radio',
    disabled && 'ds-radio--disabled',
    error && 'ds-radio--error',
    className,
  ].filter(Boolean).join(' ')

  return (
    <label className={wrapperClasses} style={style} htmlFor={id}>
      <input
        ref={ref}
        id={id}
        type="radio"
        className="ds-radio__input"
        checked={checked}
        defaultChecked={defaultChecked}
        onChange={onChange}
        disabled={disabled}
        name={name}
        value={value}
        required={required}
        aria-describedby={error ? `${id}-error` : (description ? `${id}-desc` : undefined)}
        {...rest}
      />
      <span className="ds-radio__control" aria-hidden="true" />
      {(label || description || error) && (
        <span className="ds-radio__text">
          {label && <span className="ds-radio__label">{label}</span>}
          {description && !error && (
            <span id={`${id}-desc`} className="ds-radio__description">{description}</span>
          )}
          {error && (
            <span id={`${id}-error`} className="ds-radio__description" role="alert" style={{ color: 'var(--danger-700)' }}>
              {error}
            </span>
          )}
        </span>
      )}
    </label>
  )
})

export default Radio
