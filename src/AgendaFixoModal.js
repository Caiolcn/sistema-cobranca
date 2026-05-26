import { useState } from 'react'
import { supabase } from './supabaseClient'
import { Icon } from '@iconify/react'
import { showToast } from './Toast'
import { parseISO, DIAS_LONGO, MESES } from './agendaUtils'

// ==========================================
// Modal de adicionar aluno a uma turma
// Fixo  → grava em aulas_fixos (volta toda semana)
// Avulso → grava em agendamentos (só nesta data)
// ==========================================

const TIPOS = [
  { v: 'fixo',   label: 'Toda semana',   icon: 'mdi:calendar-sync' },
  { v: 'avulso', label: 'Só nesta data', icon: 'mdi:calendar-today' }
]

export default function AgendaFixoModal({ userId, aula, data, clientes, fixosDaAula, vagasOcupadas, onClose, onSaved }) {
  const podeAvulso = !!data
  const [tipo, setTipo] = useState('fixo')
  const [devedorId, setDevedorId] = useState('')
  const [salvando, setSalvando] = useState(false)

  // Pra "fixo" filtra quem já é fixo dessa turma. Pra "avulso" mostra todos
  // (o aluno fixo continua escondido porque ele já tá garantido na turma).
  const disponiveis = clientes.filter(c => !fixosDaAula.some(f => f.devedor_id === c.id))

  const dataObj = podeAvulso ? parseISO(data) : null
  const dataFmt = dataObj
    ? `${DIAS_LONGO[dataObj.getDay()]}, ${dataObj.getDate()} de ${MESES[dataObj.getMonth()]}`
    : ''

  const adicionar = async () => {
    if (!devedorId) return
    if (vagasOcupadas >= aula.capacidade) {
      showToast('Turma lotada, sem vagas disponíveis', 'warning'); return
    }
    setSalvando(true)

    if (tipo === 'fixo') {
      const { data: inserted, error } = await supabase.from('aulas_fixos')
        .insert({ aula_id: aula.id, devedor_id: devedorId, user_id: userId })
        .select('*, devedores(nome, telefone, foto_url)')
      setSalvando(false)
      if (error) { showToast('Erro ao adicionar aluno: ' + error.message, 'error'); return }
      showToast('Aluno adicionado à turma!', 'success')
      onSaved?.({ tipo: 'fixo', fixo: inserted?.[0] })
      onClose()
    } else {
      const { error } = await supabase.from('agendamentos').insert({
        aula_id: aula.id, devedor_id: devedorId, user_id: userId,
        data, status: 'confirmado'
      })
      setSalvando(false)
      if (error) { showToast('Erro ao adicionar aluno: ' + error.message, 'error'); return }
      showToast('Aluno adicionado nesta data!', 'success')
      onSaved?.({ tipo: 'avulso' })
      onClose()
    }
  }

  return (
    <div onClick={e => { if (e.target === e.currentTarget) onClose() }}
      style={{
        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
        backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 10000,
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px'
      }}>
      <div style={{ backgroundColor: 'white', borderRadius: '12px', padding: '24px', width: '100%', maxWidth: '400px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '600' }}>Adicionar aluno</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px' }}>
            <Icon icon="mdi:close" width="20" style={{ color: '#999' }} />
          </button>
        </div>

        <div style={{
          padding: '10px 14px', backgroundColor: '#f8f9fa', borderRadius: '8px', marginBottom: '16px',
          fontSize: '13px', color: '#555'
        }}>
          <strong>{aula.horario?.substring(0, 5)}</strong>{aula.descricao && ` - ${aula.descricao}`}
          <span style={{ marginLeft: '8px', color: '#888' }}>
            ({vagasOcupadas}/{aula.capacidade} vagas)
          </span>
        </div>

        {podeAvulso && (
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#555', marginBottom: '8px' }}>
              Frequência
            </label>
            <div style={{
              display: 'flex', gap: '4px', backgroundColor: '#f3f4f6',
              borderRadius: '10px', padding: '4px'
            }}>
              {TIPOS.map(o => (
                <button key={o.v} onClick={() => setTipo(o.v)}
                  style={{
                    flex: 1, padding: '8px 12px', borderRadius: '8px', border: 'none', cursor: 'pointer',
                    fontSize: '13px', fontWeight: tipo === o.v ? '600' : '500',
                    backgroundColor: tipo === o.v ? '#fff' : 'transparent',
                    color: tipo === o.v ? '#1a1a1a' : '#666',
                    boxShadow: tipo === o.v ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px'
                  }}>
                  <Icon icon={o.icon} width={15} /> {o.label}
                </button>
              ))}
            </div>
            <div style={{ fontSize: '12px', color: '#888', marginTop: '6px' }}>
              {tipo === 'fixo'
                ? 'Aluno fica fixo nesta turma em todas as semanas.'
                : <>Será adicionado apenas em <strong style={{ color: '#344848' }}>{dataFmt}</strong>.</>}
            </div>
          </div>
        )}

        <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#555', marginBottom: '8px' }}>
          Selecione o aluno
        </label>
        <select value={devedorId} onChange={e => setDevedorId(e.target.value)}
          style={{
            width: '100%', padding: '10px 12px', border: '1px solid #ddd', borderRadius: '8px',
            fontSize: '14px', marginBottom: '20px', boxSizing: 'border-box'
          }}>
          <option value="">Selecionar aluno...</option>
          {disponiveis.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
        </select>

        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={onClose}
            style={{
              flex: 1, padding: '10px', backgroundColor: '#f3f4f6', color: '#555',
              border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '14px', fontWeight: '600'
            }}>Cancelar</button>
          <button onClick={adicionar} disabled={!devedorId || salvando}
            style={{
              flex: 1, padding: '10px',
              backgroundColor: (!devedorId || salvando) ? '#ccc' : '#344848', color: 'white',
              border: 'none', borderRadius: '8px',
              cursor: (!devedorId || salvando) ? 'not-allowed' : 'pointer',
              fontSize: '14px', fontWeight: '600', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px'
            }}>
            <Icon icon="mdi:account-plus" width="18" />
            {salvando ? 'Adicionando...' : 'Adicionar'}
          </button>
        </div>
      </div>
    </div>
  )
}
