import { forwardRef } from 'react'
import DatePicker, { registerLocale } from 'react-datepicker'
import { ptBR } from 'date-fns/locale'
import useWindowSize from '../hooks/useWindowSize'
import 'react-datepicker/dist/react-datepicker.css'
import './DateInput.css'

// Registrar locale português
registerLocale('pt-BR', ptBR)

/**
 * Componente de input de data com calendário
 * Permite tanto digitar quanto clicar para abrir o calendário
 */
export default function DateInput({
  value,
  onChange,
  placeholder = 'dd/mm/aaaa',
  style = {},
  onFocus,
  onBlur,
  disabled = false,
  minDate,
  ...props
}) {
  const { isSmallScreen } = useWindowSize()

  // Converter string YYYY-MM-DD para Date object
  const dateValue = value ? new Date(value + 'T00:00:00') : null
  const minDateValue = minDate ? new Date(minDate + 'T00:00:00') : null

  // Handler para quando a data muda
  const handleChange = (date) => {
    if (date) {
      // Converter Date para string YYYY-MM-DD
      const year = date.getFullYear()
      const month = String(date.getMonth() + 1).padStart(2, '0')
      const day = String(date.getDate()).padStart(2, '0')
      onChange(`${year}-${month}-${day}`)
    } else {
      onChange('')
    }
  }

  // Custom input para manter o estilo consistente
  const CustomInput = forwardRef(({ value, onClick, onChange: inputOnChange }, ref) => (
    <input
      ref={ref}
      type="text"
      inputMode="none"
      value={value}
      onClick={onClick}
      onTouchEnd={(e) => { e.preventDefault(); onClick?.(e) }}
      onChange={inputOnChange}
      onKeyDown={(e) => e.preventDefault()}
      placeholder={placeholder}
      disabled={disabled}
      style={{
        width: '100%',
        padding: '12px',
        border: '1px solid #ddd',
        borderRadius: '6px',
        fontSize: '14px',
        backgroundColor: disabled ? '#f5f5f5' : 'white',
        color: disabled ? '#999' : undefined,
        cursor: disabled ? 'not-allowed' : 'pointer',
        boxSizing: 'border-box',
        outline: 'none',
        transition: 'border-color 0.2s',
        caretColor: 'transparent',
        ...style
      }}
      onFocus={(e) => {
        e.target.style.borderColor = '#2196F3'
        onFocus?.(e)
      }}
      onBlur={(e) => {
        e.target.style.borderColor = '#ddd'
        onBlur?.(e)
      }}
      {...props}
    />
  ))

  return (
    <DatePicker
      selected={dateValue}
      onChange={handleChange}
      locale="pt-BR"
      dateFormat="dd/MM/yyyy"
      customInput={<CustomInput />}
      showPopperArrow={false}
      withPortal={isSmallScreen}
      disabled={disabled}
      minDate={minDateValue}
      popperPlacement="bottom-start"
      popperModifiers={[
        {
          name: 'offset',
          options: {
            offset: [0, 4]
          }
        }
      ]}
    />
  )
}
