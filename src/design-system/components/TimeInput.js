import React, { useState, useRef, useEffect, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { Icon } from '@iconify/react'
import Input from './Input'

/* ============================================================
   TimeInput — DS Mensalli

   Input de horário moderno: textbox formatada HH:MM + dropdown com
   sugestões de horários comuns (de 30 em 30 min por padrão).

   Props:
     label, helper, error, required
     value (string "HH:MM"), onChange(valor)
     placeholder         — default "00:00"
     stepMinutes         — granularidade do dropdown (default 30)
     range               — { start: 6, end: 22 } (default 0–23) horas no dropdown
     portal              — quando true, renderiza dropdown via createPortal
     size                — 'sm' | 'md' | 'lg' (mesma do Input)

   - Digitar formata automaticamente: "9" → "09:", "930" → "09:30"
   - Focus no input abre o dropdown
   - Click numa opção fecha e seta o valor
   - Permite digitação livre fora das sugestões
   ============================================================ */

const SUGESTOES_DEFAULT_START = 0
const SUGESTOES_DEFAULT_END = 23

function gerarHorarios(start, end, step) {
  const arr = []
  for (let h = start; h <= end; h++) {
    for (let m = 0; m < 60; m += step) {
      arr.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`)
    }
  }
  return arr
}

function formatarEntrada(raw) {
  // Mantém só dígitos e ":", limita a 4 dígitos + ":"
  const digits = (raw || '').replace(/[^\d]/g, '').slice(0, 4)
  if (digits.length === 0) return ''
  if (digits.length <= 2) return digits
  return `${digits.slice(0, 2)}:${digits.slice(2)}`
}

export default function TimeInput({
  label,
  helper,
  error,
  required = false,
  value = '',
  onChange,
  placeholder = '00:00',
  stepMinutes = 30,
  range = { start: SUGESTOES_DEFAULT_START, end: SUGESTOES_DEFAULT_END },
  portal = false,
  size = 'md',
  disabled = false,
  fullWidth = true,
  ...rest
}) {
  const [aberto, setAberto] = useState(false)
  // Filtra a lista só quando o usuário está digitando ativamente.
  // Ao focar/clicar (sem digitar), mostra todos os horários.
  const [filtrar, setFiltrar] = useState(false)
  const containerRef = useRef(null)
  const [pos, setPos] = useState({ top: 0, left: 0, width: 0 })

  const sugestoes = useMemo(
    () => gerarHorarios(range.start, range.end, stepMinutes),
    [range.start, range.end, stepMinutes]
  )

  const sugestoesFiltradas = useMemo(() => {
    if (!filtrar || !value) return sugestoes
    const prefixo = value.replace(/[^\d:]/g, '')
    return sugestoes.filter(h => h.startsWith(prefixo))
  }, [sugestoes, value, filtrar])

  // Recalcula posição quando portal (igual o Select)
  const recalcPos = () => {
    if (!portal || !containerRef.current) return
    const rect = containerRef.current.getBoundingClientRect()
    const margin = 8
    const vw = window.innerWidth
    const width = Math.max(220, rect.width)
    let left = rect.left
    if (left + width > vw - margin) left = vw - width - margin
    if (left < margin) left = margin
    setPos({ top: rect.bottom + 4, left, width })
  }

  useEffect(() => {
    if (!aberto) return
    recalcPos()
    if (!portal) return
    window.addEventListener('scroll', recalcPos, true)
    window.addEventListener('resize', recalcPos)
    return () => {
      window.removeEventListener('scroll', recalcPos, true)
      window.removeEventListener('resize', recalcPos)
    }
    // eslint-disable-next-line
  }, [aberto, portal])

  // Click fora fecha
  useEffect(() => {
    if (!aberto) return
    const handler = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        // Se foi click numa opção do dropdown portal, o panelRef interceptaria;
        // como portal renderiza fora, verifica se é dentro do panel via data-attr.
        const isPanel = e.target.closest?.('[data-ds-timeinput-panel]')
        if (!isPanel) setAberto(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [aberto])

  // Scroll até o valor atual quando abre
  const panelRef = useRef(null)
  useEffect(() => {
    if (!aberto || !panelRef.current) return
    // Pequeno timeout pra garantir que o panel já está mounted
    const t = setTimeout(() => {
      const el = panelRef.current?.querySelector(`[data-time="${value}"]`)
      if (el) el.scrollIntoView({ block: 'nearest' })
    }, 30)
    return () => clearTimeout(t)
  }, [aberto, value])

  const handleChange = (e) => {
    setFiltrar(true)
    const formatado = formatarEntrada(e.target.value)
    onChange?.(formatado)
  }

  // Focus (incluindo via click no label) só seleciona o texto.
  // O dropdown abre apenas em click direto no input (handleClick).
  const handleFocus = (e) => {
    setFiltrar(false)
    requestAnimationFrame(() => { try { e.target.select() } catch (_) {} })
  }

  const handleClick = (e) => {
    setAberto(true)
    setFiltrar(false)
    try { e.target.select() } catch (_) {}
  }

  const selecionar = (h) => {
    onChange?.(h)
    setFiltrar(false)
    setAberto(false)
  }

  const dropdown = aberto && (
    <div
      ref={panelRef}
      data-ds-timeinput-panel
      style={{
        ...(portal
          ? {
              position: 'fixed', top: pos.top, left: pos.left, width: pos.width,
              zIndex: 10100
            }
          : {
              position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0,
              zIndex: 100
            }),
        backgroundColor: '#fff',
        border: '1px solid var(--neutral-200, #e2e8f0)',
        borderRadius: '10px',
        boxShadow: '0 8px 24px rgba(15,23,42,0.12)',
        maxHeight: '260px', overflowY: 'auto',
        padding: '6px 0'
      }}>
      {sugestoesFiltradas.length === 0 ? (
        <div style={{
          padding: '12px 14px', fontSize: '12px', color: '#94a3b8', textAlign: 'center'
        }}>
          Nenhum horário corresponde
        </div>
      ) : (
        sugestoesFiltradas.map(h => {
          const ehAtual = h === value
          return (
            <button
              type="button"
              key={h}
              data-time={h}
              onMouseDown={(e) => e.preventDefault() /* não perder foco do input */}
              onClick={() => selecionar(h)}
              style={{
                width: '100%', padding: '8px 14px',
                background: ehAtual ? '#f1f5f9' : 'none',
                border: 'none', cursor: 'pointer',
                fontFamily: 'var(--font-sans)',
                fontSize: '13px',
                fontWeight: ehAtual ? '700' : '500',
                color: ehAtual ? '#0f172a' : '#475569',
                textAlign: 'left',
                display: 'flex', alignItems: 'center', gap: '8px'
              }}
              onMouseEnter={e => { if (!ehAtual) e.currentTarget.style.backgroundColor = '#f8fafc' }}
              onMouseLeave={e => { if (!ehAtual) e.currentTarget.style.backgroundColor = 'transparent' }}>
              <Icon icon="mdi:clock-outline" width={14} style={{ color: '#94a3b8' }} />
              {h}
            </button>
          )
        })
      )}
    </div>
  )

  return (
    <div ref={containerRef} style={{ position: 'relative', width: fullWidth ? '100%' : 'auto' }}>
      <Input
        label={label}
        helper={helper}
        error={error}
        required={required}
        value={value}
        onChange={handleChange}
        onFocus={handleFocus}
        onClick={handleClick}
        icon="mdi:clock-outline"
        placeholder={placeholder}
        disabled={disabled}
        size={size}
        fullWidth={fullWidth}
        maxLength={5}
        inputMode="numeric"
        {...rest}
      />
      {dropdown && (portal ? createPortal(dropdown, document.body) : dropdown)}
    </div>
  )
}
