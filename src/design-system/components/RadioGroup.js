import React, { useId } from 'react'
import Radio from './Radio'
import './Radio.css'

/* ============================================================
   RadioGroup — DS Mensalli
   Wrapper que controla o estado de escolha exclusiva e renderiza N Radios.

   Props:
     label, helper, error, required — igual aos outros átomos
     value         — valor atualmente selecionado
     onChange(v)   — recebe novo valor
     options       — Array<{ value, label, description?, disabled? }>
     name          — nome do group (gerado automaticamente se omitido)
     orientation   — 'vertical' (default) | 'horizontal'
     disabled      — desabilita todos

   Exemplo:
     <RadioGroup
       label="Tipo de aluno"
       value={tipo}
       onChange={setTipo}
       options={[
         { value: 'turma',      label: 'Aluno em turma',     description: 'Aulas regulares com horário fixo' },
         { value: 'individual', label: 'Aluno individual',   description: 'Horário próprio' },
       ]}
     />
   ============================================================ */

export default function RadioGroup({
  label,
  helper,
  error,
  required = false,
  value,
  onChange,
  options = [],
  name: nameProp,
  orientation = 'vertical',
  disabled = false,
  id: idProp,
  className = '',
  style,
}) {
  const autoId = useId()
  const id = idProp || `ds-radio-group-${autoId}`
  const name = nameProp || id

  const groupClasses = [
    'ds-radio-group',
    orientation === 'horizontal' && 'ds-radio-group--horizontal',
    className,
  ].filter(Boolean).join(' ')

  const messageId = error ? `${id}-error` : (helper ? `${id}-helper` : undefined)

  return (
    <div
      className={groupClasses}
      style={style}
      role="radiogroup"
      aria-labelledby={label ? `${id}-label` : undefined}
      aria-describedby={messageId}
      aria-invalid={error ? true : undefined}
      aria-required={required || undefined}
    >
      {label && (
        <span id={`${id}-label`} className="ds-radio-group__label">
          {label}
          {required && <span className="ds-radio-group__required" aria-hidden="true">*</span>}
        </span>
      )}

      <div className="ds-radio-group__items">
        {options.map(opt => (
          <Radio
            key={opt.value}
            name={name}
            value={opt.value}
            checked={value === opt.value}
            onChange={(e) => {
              if (e.target.checked) onChange?.(opt.value)
            }}
            label={opt.label}
            description={opt.description}
            disabled={disabled || opt.disabled}
            error={error ? '' : undefined}  /* só aplica visual de erro, sem mensagem repetida */
          />
        ))}
      </div>

      {(error || helper) && (
        error ? (
          <span id={messageId} className="ds-radio-group__message ds-radio-group__message--error" role="alert">
            {error}
          </span>
        ) : (
          <span id={messageId} className="ds-radio-group__message">{helper}</span>
        )
      )}
    </div>
  )
}
