import { useState } from 'react'
import { supabase } from './supabaseClient'
import { Icon } from '@iconify/react'
import { showToast } from './Toast'
import { DIAS_LONGO, parseISO, MESES } from './agendaUtils'

// ==========================================
// Modal de criar um slot individual (capacidade=1)
// Pra view "Personal". Cria em 1 passo: aulas (cap=1) + aulas_fixos.
// ==========================================

export default function AgendaSlotNovoModal({
  userId, data, diaSemana, horario, clientes = [],
  onSaved, onClose
}) {
  const [devedorId, setDevedorId] = useState('')
  const [salvando, setSalvando] = useState(false)

  const dObj = parseISO(data)
  const horarioFmt = (horario || '').substring(0, 5)

  const salvar = async () => {
    if (!devedorId) return
    setSalvando(true)

    // 1) Cria a turma individual (capacidade=1)
    const { data: aulaCriada, error: errAula } = await supabase.from('aulas')
      .insert({
        user_id: userId,
        dia_semana: diaSemana,
        horario,
        descricao: '',
        capacidade: 1,
        ativo: true
      })
      .select()
      .single()

    if (errAula) {
      showToast('Erro ao criar slot: ' + errAula.message, 'error')
      setSalvando(false); return
    }

    // 2) Adiciona o aluno como fixo
    const { data: fixoCriado, error: errFixo } = await supabase.from('aulas_fixos')
      .insert({
        user_id: userId,
        aula_id: aulaCriada.id,
        devedor_id: devedorId
      })
      .select('*, devedores(nome, telefone, foto_url)')
      .single()

    setSalvando(false)
    if (errFixo) {
      showToast('Erro ao vincular aluno: ' + errFixo.message, 'error')
      return
    }

    showToast('Slot criado!', 'success')
    onSaved?.({ aula: aulaCriada, fixo: fixoCriado })
    onClose()
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
          <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '600' }}>Novo horário</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px' }}>
            <Icon icon="mdi:close" width="20" style={{ color: '#999' }} />
          </button>
        </div>

        <div style={{
          padding: '10px 14px', backgroundColor: '#eef2ff', borderRadius: '8px', marginBottom: '16px',
          fontSize: '13px', color: '#3730a3', display: 'flex', alignItems: 'center', gap: '8px'
        }}>
          <Icon icon="mdi:clock-outline" width="18" />
          <strong>{horarioFmt}</strong> · {DIAS_LONGO[diaSemana]}, {dObj.getDate()} de {MESES[dObj.getMonth()]}
        </div>

        <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#555', marginBottom: '8px' }}>
          Selecione o aluno
        </label>
        <select value={devedorId} onChange={e => setDevedorId(e.target.value)}
          style={{
            width: '100%', padding: '10px 12px', border: '1px solid #ddd', borderRadius: '8px',
            fontSize: '14px', marginBottom: '20px', boxSizing: 'border-box'
          }}>
          <option value="">Selecionar aluno...</option>
          {clientes.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
        </select>

        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={onClose}
            style={{
              flex: 1, padding: '10px', backgroundColor: '#f3f4f6', color: '#555',
              border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '14px', fontWeight: '600'
            }}>Cancelar</button>
          <button onClick={salvar} disabled={!devedorId || salvando}
            style={{
              flex: 1, padding: '10px',
              backgroundColor: (!devedorId || salvando) ? '#ccc' : '#344848', color: 'white',
              border: 'none', borderRadius: '8px',
              cursor: (!devedorId || salvando) ? 'not-allowed' : 'pointer',
              fontSize: '14px', fontWeight: '600',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px'
            }}>
            <Icon icon="mdi:check" width="18" />
            {salvando ? 'Criando...' : 'Criar slot'}
          </button>
        </div>
      </div>
    </div>
  )
}
