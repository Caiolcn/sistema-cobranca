import React, { useState, useRef, useEffect, useMemo } from 'react'
import { getCountries, getCountryCallingCode } from 'react-phone-number-input/input'
import flags from 'react-phone-number-input/flags'
import ptBR from 'react-phone-number-input/locale/pt-BR.json'

const PRIORITY = ['BR', 'US', 'PT', 'ES', 'FR', 'DE', 'IT', 'GB', 'AR', 'CL', 'CO', 'MX']

export default function CountrySelect({ value, onChange, disabled }) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const rootRef = useRef(null)

  useEffect(() => {
    if (!open) return
    const handler = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) {
        setOpen(false)
        setSearch('')
      }
    }
    const esc = (e) => { if (e.key === 'Escape') { setOpen(false); setSearch('') } }
    document.addEventListener('mousedown', handler)
    document.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('mousedown', handler)
      document.removeEventListener('keydown', esc)
    }
  }, [open])

  const items = useMemo(() => {
    const all = getCountries().map(c => ({
      code: c,
      name: ptBR[c] || c,
      dial: '+' + getCountryCallingCode(c)
    }))
    return all.sort((a, b) => {
      const ai = PRIORITY.indexOf(a.code)
      const bi = PRIORITY.indexOf(b.code)
      if (ai !== -1 && bi !== -1) return ai - bi
      if (ai !== -1) return -1
      if (bi !== -1) return 1
      return a.name.localeCompare(b.name, 'pt-BR')
    })
  }, [])

  const filtered = useMemo(() => {
    if (!search) return items
    const q = search.toLowerCase()
    return items.filter(c =>
      c.name.toLowerCase().includes(q) || c.dial.includes(q)
    )
  }, [items, search])

  const CurrentFlag = flags[value]
  const currentName = value ? (ptBR[value] || value) : ''

  return (
    <div
      ref={rootRef}
      style={{
        position: 'relative',
        display: 'inline-flex',
        alignItems: 'center',
        alignSelf: 'stretch'
      }}
    >
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(o => !o)}
        title={currentName}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '4px',
          border: 'none',
          background: 'transparent',
          padding: '2px 4px',
          cursor: disabled ? 'not-allowed' : 'pointer',
          opacity: disabled ? 0.6 : 1,
          borderRadius: '4px'
        }}
      >
        <span style={{
          width: 22,
          height: 22,
          borderRadius: '50%',
          overflow: 'hidden',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#f3f4f6',
          flexShrink: 0
        }}>
          {CurrentFlag ? <CurrentFlag title={currentName} preserveAspectRatio="xMidYMid slice" style={{ width: '100%', height: '100%', display: 'block' }} /> : <span style={{ fontSize: 10 }}>?</span>}
        </span>
        <span style={{ fontSize: 9, color: '#6b7280', lineHeight: 1 }}>▼</span>
      </button>

      {open && (
        <div style={{
          position: 'absolute',
          top: 'calc(100% + 8px)',
          left: '-10px',
          zIndex: 1100,
          width: 300,
          maxHeight: 320,
          background: 'white',
          border: '1px solid #e5e7eb',
          borderRadius: '12px',
          boxShadow: '0 10px 30px rgba(0,0,0,0.12)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden'
        }}>
          <div style={{ padding: '10px', borderBottom: '1px solid #f3f4f6' }}>
            <input
              type="text"
              autoFocus
              placeholder="Buscar país..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{
                width: '100%',
                padding: '8px 12px',
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
                fontSize: '13px',
                outline: 'none',
                background: '#f9fafb',
                boxSizing: 'border-box'
              }}
            />
          </div>
          <div style={{ overflowY: 'auto', flex: 1, padding: '4px 0' }}>
            {filtered.map(c => {
              const Flag = flags[c.code]
              const selected = c.code === value
              return (
                <button
                  key={c.code}
                  type="button"
                  onClick={() => {
                    onChange(c.code)
                    setOpen(false)
                    setSearch('')
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    width: '100%',
                    padding: '8px 14px',
                    border: 'none',
                    background: selected ? '#f0f9ff' : 'transparent',
                    cursor: 'pointer',
                    textAlign: 'left',
                    fontSize: '13px',
                    color: '#1f2937'
                  }}
                  onMouseEnter={(e) => { if (!selected) e.currentTarget.style.background = '#f9fafb' }}
                  onMouseLeave={(e) => { if (!selected) e.currentTarget.style.background = selected ? '#f0f9ff' : 'transparent' }}
                >
                  <span style={{
                    width: 22,
                    height: 22,
                    borderRadius: '50%',
                    overflow: 'hidden',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: '#f3f4f6',
                    flexShrink: 0
                  }}>
                    {Flag && <Flag title={c.name} preserveAspectRatio="xMidYMid slice" style={{ width: '100%', height: '100%', display: 'block' }} />}
                  </span>
                  <span style={{ flex: 1 }}>{c.name}</span>
                  <span style={{ color: '#9ca3af', fontSize: '12px' }}>{c.dial}</span>
                </button>
              )
            })}
            {filtered.length === 0 && (
              <div style={{ padding: '20px', textAlign: 'center', color: '#9ca3af', fontSize: '13px' }}>
                Nenhum país encontrado
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
