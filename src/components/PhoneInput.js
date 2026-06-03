import React, { useMemo } from 'react'
import PhoneInputBase from 'react-phone-number-input'
import 'react-phone-number-input/style.css'
import ptBR from 'react-phone-number-input/locale/pt-BR.json'
import CountrySelect from './CountrySelect'

/**
 * Normaliza valores legados (sem +, sem DDI) para E.164.
 * Telefones gravados no banco antes da internacionalização vinham como
 * "(62) 98246-6639" ou "62982466639" — assumimos BR pra esses casos.
 */
export function normalizeToE164(value) {
  if (!value) return ''
  const trimmed = String(value).trim()
  if (trimmed.startsWith('+')) return trimmed
  const digits = trimmed.replace(/\D/g, '')
  if (!digits) return ''
  if (digits.startsWith('55') && digits.length >= 12) return '+' + digits
  return '+55' + digits
}

const SIZES = {
  sm: { padding: '8px 10px', fontSize: '13px', border: '1px solid #ddd' },
  lg: { padding: '10px 12px', fontSize: '16px', border: '1px solid #e0e0e0' }
}

export default function PhoneInput({
  value,
  onChange,
  disabled = false,
  placeholder,
  defaultCountry = 'BR',
  size = 'sm',
  containerStyle,
  inputStyle
}) {
  const normalized = useMemo(() => normalizeToE164(value), [value])
  const sz = SIZES[size] || SIZES.sm

  const wrapperStyle = {
    width: '100%',
    minWidth: 0,
    boxSizing: 'border-box',
    display: 'flex',
    alignItems: 'center',
    border: sz.border,
    borderRadius: '6px',
    backgroundColor: disabled ? '#f5f5f5' : 'white',
    paddingLeft: '10px',
    ...containerStyle
  }

  const innerInputStyle = {
    flex: '1 1 0%',
    minWidth: 0,
    border: 'none',
    outline: 'none',
    padding: sz.padding,
    fontSize: sz.fontSize,
    color: disabled ? '#999' : '#333',
    backgroundColor: 'transparent',
    boxSizing: 'border-box',
    width: 'auto',
    ...inputStyle
  }

  return (
    <PhoneInputBase
      defaultCountry={defaultCountry}
      labels={ptBR}
      countrySelectComponent={CountrySelect}
      value={normalized}
      onChange={(v) => onChange?.(v || '')}
      disabled={disabled}
      placeholder={placeholder}
      numberInputProps={{ size: 1, style: innerInputStyle }}
      style={wrapperStyle}
    />
  )
}
