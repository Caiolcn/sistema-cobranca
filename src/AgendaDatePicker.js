import { useState, useEffect, useRef } from 'react'
import { Icon } from '@iconify/react'
import { isoDate, parseISO, MESES } from './agendaUtils'

// ==========================================
// AgendaDatePicker — chip "Ir para data" que abre um calendário custom.
// Substitui o <input type="date"> nativo por algo mais clicável.
// ==========================================

const DIAS_HEADER = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
const COR = '#344848'
const SEL = '#16a34a'

export default function AgendaDatePicker({ value, onChange, renderTrigger, align = 'right', popupZIndex = 1100 }) {
  const [aberto, setAberto] = useState(false)
  // Se value vier vazio (ex: filtro "Tudo"), navega a partir de hoje
  const valorObj = value ? parseISO(value) : new Date()
  // navegação interna do calendário (independente do value até o usuário clicar num dia)
  const [mes, setMes] = useState(valorObj.getMonth())
  const [ano, setAno] = useState(valorObj.getFullYear())
  const containerRef = useRef(null)
  const popupRef = useRef(null)
  // posição calculada do popup (position: fixed) — sempre dentro da viewport
  const [popupPos, setPopupPos] = useState({ top: 0, left: 0 })

  const recalcularPos = () => {
    if (!containerRef.current) return
    const rect = containerRef.current.getBoundingClientRect()
    const popupWidth = 290
    // altura real do popup (já montado); fallback enquanto não mediu
    const popupHeight = popupRef.current ? popupRef.current.offsetHeight : 360
    const margin = 8
    const vw = window.innerWidth
    const vh = window.innerHeight
    // base: alinha pela esquerda do trigger se align=left; pela direita se align=right
    let left = align === 'left' ? rect.left : rect.right - popupWidth
    // clamp pra ficar dentro da viewport
    if (left + popupWidth > vw - margin) left = vw - popupWidth - margin
    if (left < margin) left = margin
    // vertical: abre pra baixo; se não couber, vira pra cima (colado no campo); senão gruda na viewport
    let top = rect.bottom + 6
    if (top + popupHeight > vh - margin) {
      const acima = rect.top - 6 - popupHeight
      top = acima >= margin ? acima : Math.max(margin, vh - popupHeight - margin)
    }
    setPopupPos({ top, left })
  }

  useEffect(() => { if (aberto) recalcularPos() // eslint-disable-next-line
  }, [aberto, align, mes, ano])
  useEffect(() => {
    if (!aberto) return
    window.addEventListener('scroll', recalcularPos, true)
    window.addEventListener('resize', recalcularPos)
    return () => {
      window.removeEventListener('scroll', recalcularPos, true)
      window.removeEventListener('resize', recalcularPos)
    }
    // eslint-disable-next-line
  }, [aberto])

  // re-sincroniza navegação interna sempre que o popup abre
  useEffect(() => {
    if (aberto) {
      const d = value ? parseISO(value) : new Date()
      setMes(d.getMonth())
      setAno(d.getFullYear())
    }
  }, [aberto, value])

  // fecha ao clicar fora
  useEffect(() => {
    if (!aberto) return
    const onClick = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) setAberto(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [aberto])

  // fecha no Esc
  useEffect(() => {
    if (!aberto) return
    const onKey = (e) => { if (e.key === 'Escape') setAberto(false) }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [aberto])

  // monta grade do mês: cabeça de células vazias até o 1º cair no dia da semana certo
  const primeiroDiaSemana = new Date(ano, mes, 1).getDay() // 0=Dom..6=Sáb
  const totalDias = new Date(ano, mes + 1, 0).getDate()
  const celulas = []
  for (let i = 0; i < primeiroDiaSemana; i++) celulas.push(null)
  for (let d = 1; d <= totalDias; d++) celulas.push(d)
  while (celulas.length % 7 !== 0) celulas.push(null)

  const hojeRef = isoDate(new Date())
  const valorFmt = `${String(valorObj.getDate()).padStart(2, '0')}/${String(valorObj.getMonth() + 1).padStart(2, '0')}/${valorObj.getFullYear()}`

  const selecionar = (dia) => {
    if (!dia) return
    const novo = `${ano}-${String(mes + 1).padStart(2, '0')}-${String(dia).padStart(2, '0')}`
    onChange(novo)
    setAberto(false)
  }

  const irMes = (delta) => {
    let m = mes + delta
    let a = ano
    if (m < 0) { m = 11; a -= 1 }
    if (m > 11) { m = 0; a += 1 }
    setMes(m); setAno(a)
  }

  const irHoje = () => {
    const h = new Date()
    setMes(h.getMonth())
    setAno(h.getFullYear())
    onChange(hojeRef)
    setAberto(false)
  }

  // anos: ±5 ao redor do ano atual (ou do ano selecionado)
  const anoBase = new Date().getFullYear()
  const min = Math.min(anoBase, ano) - 5
  const max = Math.max(anoBase, ano) + 5
  const anos = []
  for (let a = min; a <= max; a++) anos.push(a)

  return (
    <div ref={containerRef} style={{ position: 'relative', display: 'inline-block' }}>
      {/* Trigger (custom via renderTrigger ou padrão) */}
      {renderTrigger ? (
        renderTrigger({ aberto, abrir: () => setAberto(v => !v), valorFmt })
      ) : (
        <button onClick={() => setAberto(v => !v)} title="Selecionar data"
          style={{
            display: 'flex', alignItems: 'center', gap: '6px',
            padding: '8px 12px', borderRadius: '8px',
            border: `1px solid ${aberto ? COR : '#ddd'}`,
            cursor: 'pointer', fontSize: '13px',
            backgroundColor: '#fff'
          }}>
          <Icon icon="mdi:calendar-blank-outline" width="16" style={{ color: COR }} />
          <span style={{ color: '#555', fontWeight: '500' }}>Data</span>
          <span style={{ color: '#1a1a1a', fontWeight: '600' }}>{valorFmt}</span>
        </button>
      )}

      {/* Popup — position: fixed com coordenadas calculadas (sempre na viewport) */}
      {aberto && (
        <div ref={popupRef} style={{
          position: 'fixed', top: popupPos.top, left: popupPos.left,
          zIndex: popupZIndex,
          backgroundColor: '#fff', borderRadius: '12px', border: '1px solid #e5e7eb',
          boxShadow: '0 12px 32px rgba(0,0,0,0.12)',
          width: '290px', maxWidth: 'calc(100vw - 16px)', padding: '14px',
          maxHeight: 'calc(100vh - 16px)', overflowY: 'auto'
        }}>
          {/* Header: ‹ mês ano › */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '12px' }}>
            <button onClick={() => irMes(-1)} title="Mês anterior" style={navBtn}>
              <Icon icon="mdi:chevron-left" width="20" />
            </button>
            <select value={mes} onChange={e => setMes(Number(e.target.value))} style={selectStyle}>
              {MESES.map((m, i) => (
                <option key={i} value={i}>{m.charAt(0).toUpperCase() + m.slice(1)}</option>
              ))}
            </select>
            <select value={ano} onChange={e => setAno(Number(e.target.value))} style={selectStyle}>
              {anos.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
            <button onClick={() => irMes(1)} title="Próximo mês" style={navBtn}>
              <Icon icon="mdi:chevron-right" width="20" />
            </button>
          </div>

          {/* Cabeçalho dos dias da semana */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', marginBottom: '2px' }}>
            {DIAS_HEADER.map(d => (
              <div key={d} style={{
                textAlign: 'center', fontSize: '11px', fontWeight: '600', color: '#999', padding: '4px 0'
              }}>{d}</div>
            ))}
          </div>

          {/* Grade */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }}>
            {celulas.map((dia, i) => {
              if (!dia) return <div key={i} />
              const iso = `${ano}-${String(mes + 1).padStart(2, '0')}-${String(dia).padStart(2, '0')}`
              const ehHoje = iso === hojeRef
              const ehSel = iso === value
              return (
                <button key={i} onClick={() => selecionar(dia)}
                  style={{
                    width: '32px', height: '32px', margin: '2px auto', borderRadius: '50%',
                    border: ehHoje && !ehSel ? `1px solid ${COR}` : 'none',
                    backgroundColor: ehSel ? SEL : 'transparent',
                    color: ehSel ? '#fff' : '#1a1a1a',
                    fontSize: '13px', fontWeight: ehHoje || ehSel ? '700' : '500',
                    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    transition: 'background-color 0.15s'
                  }}
                  onMouseEnter={e => { if (!ehSel) e.currentTarget.style.backgroundColor = '#f3f4f6' }}
                  onMouseLeave={e => { if (!ehSel) e.currentTarget.style.backgroundColor = 'transparent' }}>
                  {dia}
                </button>
              )
            })}
          </div>

          {/* Footer */}
          <div style={{
            display: 'flex', justifyContent: 'space-between',
            marginTop: '8px', paddingTop: '10px', borderTop: '1px solid #f0f0f0'
          }}>
            <button onClick={() => setAberto(false)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#888', fontSize: '13px', fontWeight: '500' }}>
              Cancelar
            </button>
            <button onClick={irHoje}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: SEL, fontSize: '13px', fontWeight: '600' }}>
              Hoje
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

const navBtn = {
  width: '28px', height: '28px', borderRadius: '6px', border: 'none', cursor: 'pointer',
  backgroundColor: 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center',
  color: '#666', flexShrink: 0
}

const selectStyle = {
  flex: 1, padding: '5px 8px', border: '1px solid #ddd', borderRadius: '8px',
  fontSize: '13px', cursor: 'pointer', backgroundColor: '#fff', color: '#1a1a1a'
}
