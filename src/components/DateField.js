import { useState, useEffect } from 'react'
import { Icon } from '@iconify/react'
import AgendaDatePicker from '../AgendaDatePicker'

// ============================================================
// DateField — campo de data do DS, híbrido:
//  - clicar abre o calendário (AgendaDatePicker)
//  - também dá pra DIGITAR dd/mm/aaaa direto (com máscara)
//
// value: 'YYYY-MM-DD' | ''      onChange: (iso | '') => void
// Auto-contido (estilo via inline + tokens), não depende de Input.css.
// ============================================================

function isoParaBR(iso) {
  if (!iso) return ''
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

export default function DateField({ value, onChange, label, required, placeholder = 'dd/mm/aaaa', style }) {
  const [texto, setTexto] = useState(isoParaBR(value))
  const [focado, setFocado] = useState(false)

  // Sincroniza o texto quando o value externo muda (calendário, auto-preencher, etc.)
  useEffect(() => { setTexto(isoParaBR(value)) }, [value])

  const handleInput = (e) => {
    const digitos = e.target.value.replace(/\D/g, '').slice(0, 8)
    let out = digitos
    if (digitos.length > 4) out = `${digitos.slice(0, 2)}/${digitos.slice(2, 4)}/${digitos.slice(4)}`
    else if (digitos.length > 2) out = `${digitos.slice(0, 2)}/${digitos.slice(2)}`
    setTexto(out)

    if (digitos.length === 8) {
      const d = +digitos.slice(0, 2), m = +digitos.slice(2, 4), y = +digitos.slice(4)
      const dt = new Date(y, m - 1, d)
      // valida data real (ex.: 31/02 não passa)
      if (y > 1900 && dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d) {
        onChange(`${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`)
      }
    } else if (digitos.length === 0) {
      onChange('')
    }
  }

  const handleBlur = () => {
    setFocado(false)
    // se ficou incompleto/inválido, reverte pro value atual
    if (texto.length !== 10) setTexto(isoParaBR(value))
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', flex: 1, minWidth: 0, ...style }}>
      {label && (
        <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-text-primary, #0f172a)' }}>
          {label}{required && <span style={{ color: 'var(--danger-500, #ef4444)' }}> *</span>}
        </label>
      )}
      <AgendaDatePicker
        value={value}
        onChange={onChange}
        align="left"
        popupZIndex={10100}
        renderTrigger={({ aberto, abrir }) => (
          <div style={{
            display: 'flex', alignItems: 'center', width: '100%', boxSizing: 'border-box',
            border: `1px solid ${(focado || aberto) ? 'var(--mensalli-green-500, #4CAF50)' : 'var(--neutral-300, #CBD5E1)'}`,
            borderRadius: 'var(--radius-lg, 8px)', backgroundColor: '#fff',
            boxShadow: (focado || aberto) ? '0 0 0 3px rgba(76,175,80,0.15)' : 'none',
            transition: 'border-color .15s, box-shadow .15s'
          }}>
            <input
              type="text"
              inputMode="numeric"
              className="ds-datefield-input"
              value={texto}
              onChange={handleInput}
              onFocus={() => { setFocado(true); if (!aberto) abrir() }}
              onBlur={handleBlur}
              placeholder={placeholder}
              style={{
                flex: 1, minWidth: 0, border: 'none', outline: 'none', background: 'transparent',
                padding: '0 12px', height: '38px', fontSize: '14px', fontFamily: 'inherit',
                color: 'var(--color-text-primary, #1e293b)'
              }}
            />
            <button
              type="button"
              onClick={abrir}
              aria-label="Abrir calendário"
              style={{
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                background: 'none', border: 'none', cursor: 'pointer', height: '38px',
                padding: '0 10px 0 6px', color: 'var(--color-text-muted, #94a3b8)'
              }}
            >
              <Icon icon="mdi:calendar-blank-outline" width={18} />
            </button>
          </div>
        )}
      />
    </div>
  )
}
