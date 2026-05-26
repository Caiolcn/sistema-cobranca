import { useState, useEffect, useRef } from 'react'
import { Icon } from '@iconify/react'

// ==========================================
// Pedacinhos visuais reutilizados entre AgendaDia e AgendaSemana
// (card de stat, barra de ações da aula, linha de aluno do elenco)
// ==========================================

export const badge = (color, bg) => ({
  padding: '1px 7px', borderRadius: '10px', fontSize: '10px', fontWeight: '700', color, backgroundColor: bg
})

export function StatCard({ icon, cor, bg, label, valor }) {
  return (
    <div style={{
      backgroundColor: bg, borderRadius: '10px', padding: '12px',
      border: `1px solid ${bg === '#f8f9fa' ? '#e5e7eb' : 'transparent'}`,
      display: 'flex', alignItems: 'center', gap: '10px'
    }}>
      <Icon icon={icon} width={22} style={{ color: cor }} />
      <div>
        <div style={{ fontSize: '17px', fontWeight: '700', color: cor }}>{valor}</div>
        <div style={{ fontSize: '11px', color: '#666' }}>{label}</div>
      </div>
    </div>
  )
}

export function AcoesAula({ aula, onAdd, onToggle, onEdit, onDelete }) {
  // Variante compacta (4 ícones) — usada no card do Dia onde o espaço é apertado.
  const toggleIcon = aula.ativo ? 'mdi:pause-circle-outline' : 'mdi:play-circle-outline'
  const toggleLabel = aula.ativo ? 'Pausar' : 'Retomar'
  const btn = (icon, color, title, action) => (
    <button onClick={action} title={title}
      style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '5px', borderRadius: '6px', display: 'flex' }}>
      <Icon icon={icon} width="17" style={{ color }} />
    </button>
  )
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '2px', flexShrink: 0 }}>
      {btn('mdi:account-plus', '#b45309', 'Adicionar aluno', onAdd)}
      {btn(toggleIcon, aula.ativo ? '#16a34a' : '#aaa', `${toggleLabel} turma`, onToggle)}
      {btn('mdi:pencil', '#666', 'Editar turma', onEdit)}
      {btn('mdi:delete-outline', '#ef4444', 'Excluir turma', onDelete)}
    </div>
  )
}

// Botão primário "Adicionar aluno" usado no modal de detalhe da Semana.
export function BotaoAdicionarAluno({ onClick }) {
  return (
    <button onClick={onClick}
      style={{
        width: '100%',
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
        padding: '11px 14px', borderRadius: '10px', cursor: 'pointer',
        fontSize: '14px', fontWeight: '600',
        backgroundColor: '#344848', color: '#fff', border: 'none'
      }}>
      <Icon icon="mdi:account-plus" width="18" /> Adicionar aluno
    </button>
  )
}

// Menu kebab (⋮) para as ações secundárias da turma (pausar / editar / excluir).
// Fica no header do modal de detalhe da Semana, ao lado do X.
export function MenuTurma({ aula, onToggle, onEdit, onDelete }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const toggleIcon = aula.ativo ? 'mdi:pause-circle-outline' : 'mdi:play-circle-outline'
  const toggleLabel = aula.ativo ? 'Pausar turma' : 'Retomar turma'

  useEffect(() => {
    if (!open) return
    const onClickOut = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    const onEsc = (e) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onClickOut)
    document.addEventListener('keydown', onEsc)
    return () => {
      document.removeEventListener('mousedown', onClickOut)
      document.removeEventListener('keydown', onEsc)
    }
  }, [open])

  const item = (icon, label, action, color = '#444') => (
    <button onClick={() => { setOpen(false); action() }}
      style={{
        display: 'flex', alignItems: 'center', gap: '10px',
        width: '100%', padding: '9px 14px',
        background: 'none', border: 'none', cursor: 'pointer',
        fontSize: '13px', fontWeight: '500', color, textAlign: 'left'
      }}
      onMouseEnter={e => e.currentTarget.style.backgroundColor = color === '#dc2626' ? '#fef2f2' : '#f3f4f6'}
      onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}>
      <Icon icon={icon} width="16" /> {label}
    </button>
  )

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button onClick={() => setOpen(v => !v)} title="Opções da turma"
        style={{
          background: 'none', border: 'none', cursor: 'pointer',
          padding: '4px', borderRadius: '6px', display: 'flex',
          alignItems: 'center', justifyContent: 'center'
        }}>
        <Icon icon="mdi:dots-vertical" width="22" style={{ color: '#666' }} />
      </button>
      {open && (
        <div style={{
          position: 'absolute', top: '100%', right: 0, marginTop: '4px',
          minWidth: '190px', backgroundColor: '#fff',
          borderRadius: '10px', border: '1px solid #e5e7eb',
          boxShadow: '0 8px 20px rgba(0,0,0,0.12)',
          zIndex: 1100, overflow: 'hidden', padding: '4px 0'
        }}>
          {item(toggleIcon, toggleLabel, onToggle)}
          {item('mdi:pencil', 'Editar turma', onEdit)}
          <div style={{ height: '1px', backgroundColor: '#f0f0f0', margin: '4px 0' }} />
          {item('mdi:delete-outline', 'Excluir turma', onDelete, '#dc2626')}
        </div>
      )}
    </div>
  )
}

export function LinhaAluno({ r, pres, isFuturo, onMarcar, onAbrirEdicao, onRemove }) {
  const nome = r.devedores?.nome || 'Aluno'
  const rowClickable = !!pres && !isFuturo
  return (
    <div onClick={rowClickable ? onAbrirEdicao : undefined}
      style={{
        display: 'flex', alignItems: 'center', gap: '10px', padding: '9px 14px',
        borderTop: '1px solid #f5f5f5', cursor: rowClickable ? 'pointer' : 'default'
      }}>
      <div style={{
        width: '30px', height: '30px', borderRadius: '50%', flexShrink: 0, overflow: 'hidden',
        backgroundColor: '#344848', color: '#fff', display: 'flex',
        alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: '600'
      }}>
        {r.devedores?.foto_url
          ? <img src={r.devedores.foto_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              onError={e => { e.target.style.display = 'none'; e.target.parentElement.textContent = nome.charAt(0).toUpperCase() }} />
          : nome.charAt(0).toUpperCase()}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: '14px', fontWeight: '500', color: '#1a1a1a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {nome}
        </div>
        <div style={{ fontSize: '11px', color: '#aaa', display: 'flex', gap: '6px', alignItems: 'center' }}>
          {r.tipo === 'fixo' ? 'Aluno fixo' : 'Agendado'}
          {r.experimental && <span style={badge('#fff', '#f59e0b')}>Exp</span>}
          {r.ausente && !pres && <span style={{ color: '#b45309' }}>· avisou ausência</span>}
        </div>
      </div>

      {!isFuturo && (pres ? (
        <PillStatus pres={pres} onClick={(e) => { e.stopPropagation(); onAbrirEdicao() }} />
      ) : (
        <BotoesMarcar
          onPresente={(e) => { e.stopPropagation(); onMarcar(true) }}
          onFalta={(e) => { e.stopPropagation(); onMarcar(false) }}
        />
      ))}

      {onRemove && (
        <button onClick={onRemove} title="Remover deste horário"
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', color: '#ef4444', display: 'flex' }}>
          <Icon icon="mdi:close" width="16" />
        </button>
      )}
    </div>
  )
}

function PillStatus({ pres, onClick }) {
  const cfg = pres.presente
    ? { bg: '#dcfce7', color: '#16a34a', text: 'Presente', icon: 'mdi:check-circle' }
    : { bg: '#fee2e2', color: '#dc2626', text: 'Falta', icon: 'mdi:close-circle' }
  return (
    <div onClick={onClick} title="Editar / observação"
      style={{
        display: 'flex', alignItems: 'center', gap: '5px', padding: '5px 10px', borderRadius: '20px',
        backgroundColor: cfg.bg, color: cfg.color, fontSize: '12px', fontWeight: '600', cursor: 'pointer'
      }}>
      <Icon icon={cfg.icon} width="15" />
      {cfg.text}
    </div>
  )
}

function BotoesMarcar({ onPresente, onFalta }) {
  const base = {
    width: '34px', height: '32px', borderRadius: '8px', border: 'none', cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'background-color 0.15s'
  }
  return (
    <div style={{ display: 'flex', gap: '4px' }}>
      <button onClick={onPresente} title="Marcar presente"
        style={{ ...base, backgroundColor: '#f0fdf4', color: '#16a34a' }}
        onMouseEnter={e => e.currentTarget.style.backgroundColor = '#dcfce7'}
        onMouseLeave={e => e.currentTarget.style.backgroundColor = '#f0fdf4'}>
        <Icon icon="mdi:thumb-up" width="17" />
      </button>
      <button onClick={onFalta} title="Marcar falta"
        style={{ ...base, backgroundColor: '#fef2f2', color: '#dc2626' }}
        onMouseEnter={e => e.currentTarget.style.backgroundColor = '#fee2e2'}
        onMouseLeave={e => e.currentTarget.style.backgroundColor = '#fef2f2'}>
        <Icon icon="mdi:thumb-down" width="17" />
      </button>
    </div>
  )
}

export function FilaEspera({ fila }) {
  if (!fila || fila.length === 0) return null
  return (
    <div style={{ padding: '8px 14px 12px', borderTop: '1px solid #f5f5f5', backgroundColor: '#fffdf5' }}>
      <div style={{ fontSize: '11px', fontWeight: '600', color: '#b45309', marginBottom: '6px', textTransform: 'uppercase' }}>
        Lista de espera ({fila.length})
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
        {fila.map(f => (
          <div key={f.id} style={{
            fontSize: '12px', padding: '4px 10px', backgroundColor: '#fef3c7',
            borderRadius: '6px', color: '#92400e', fontWeight: '500',
            display: 'flex', alignItems: 'center', gap: '4px'
          }}>
            <Icon icon="mdi:clock-outline" width="12" style={{ color: '#f59e0b' }} />
            <span>{f.posicao}º</span>
            <span>{f.devedores?.nome?.split(' ')[0] || 'Aluno'}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
