import { useState, useEffect } from 'react'
import { supabase } from './supabaseClient'
import { Icon } from '@iconify/react'
import { showToast } from './Toast'
import ModalidadePicker from './AgendaModalidadePicker'

// ==========================================
// Modal de criar/editar turma
// Criar: gera várias turmas (cada dia × cada horário no intervalo)
// Editar: atualiza apenas a turma selecionada
// ==========================================

const DIAS_OPTS = [
  { valor: 1, abrev: 'Seg' }, { valor: 2, abrev: 'Ter' }, { valor: 3, abrev: 'Qua' },
  { valor: 4, abrev: 'Qui' }, { valor: 5, abrev: 'Sex' }, { valor: 6, abrev: 'Sáb' },
  { valor: 0, abrev: 'Dom' }
]

const gerarHorarios = (inicio, fim, intervaloMin) => {
  const out = []
  const [hI, mI] = inicio.split(':').map(Number)
  const [hF, mF] = fim.split(':').map(Number)
  let min = hI * 60 + mI
  const max = hF * 60 + mF
  while (min < max) {
    const h = String(Math.floor(min / 60)).padStart(2, '0')
    const m = String(min % 60).padStart(2, '0')
    out.push(`${h}:${m}`)
    min += intervaloMin
  }
  return out
}

export default function AgendaAulaModal({ userId, editandoAula, colaboradores = [], modalidades = [], onModalidadeCriada, onClose, onSaved }) {
  const ehEdicao = !!editandoAula

  const [dias, setDias] = useState([1, 2, 3, 4, 5])
  const [horario, setHorario] = useState('09:00')
  const [horarioFim, setHorarioFim] = useState('18:00')
  const [intervalo, setIntervalo] = useState(60)
  const [descricao, setDescricao] = useState('')
  const [capacidade, setCapacidade] = useState(10)
  const [professorId, setProfessorId] = useState('')
  const [modalidadeId, setModalidadeId] = useState('')
  const [salvando, setSalvando] = useState(false)

  useEffect(() => {
    if (ehEdicao) {
      setDias([editandoAula.dia_semana])
      setHorario(editandoAula.horario?.substring(0, 5) || '09:00')
      setDescricao(editandoAula.descricao || '')
      setCapacidade(editandoAula.capacidade || 10)
      setProfessorId(editandoAula.professor_id || '')
      setModalidadeId(editandoAula.modalidade_id || '')
    }
  }, [editandoAula, ehEdicao])

  const toggleDia = (valor) => {
    if (ehEdicao) { setDias([valor]); return }
    setDias(prev => {
      if (prev.includes(valor)) {
        if (prev.length === 1) return prev
        return prev.filter(d => d !== valor)
      }
      return [...prev, valor]
    })
  }

  const salvar = async () => {
    if (!horario) { showToast('Informe o horário', 'warning'); return }
    if (dias.length === 0) { showToast('Selecione pelo menos um dia', 'warning'); return }
    if (capacidade < 1) { showToast('Capacidade mínima é 1', 'warning'); return }

    setSalvando(true)

    const profPayload = professorId || null

    if (ehEdicao) {
      const { data, error } = await supabase.from('aulas')
        .update({
          dia_semana: dias[0], horario, descricao: descricao.trim(),
          capacidade, professor_id: profPayload, modalidade_id: modalidadeId || null,
          updated_at: new Date().toISOString()
        })
        .eq('id', editandoAula.id).select()

      setSalvando(false)
      if (error) { showToast('Erro ao atualizar: ' + error.message, 'error'); return }
      showToast('Turma atualizada!', 'success')
      onSaved?.({ updated: data?.[0] })
      onClose()
    } else {
      const horarios = gerarHorarios(horario, horarioFim, intervalo)
      if (horarios.length === 0) {
        showToast('Horário de início deve ser menor que o de fim', 'warning')
        setSalvando(false); return
      }
      const registros = []
      for (const d of dias) for (const h of horarios) {
        registros.push({
          user_id: userId, dia_semana: d, horario: h,
          descricao: descricao.trim(), capacidade, professor_id: profPayload,
          modalidade_id: modalidadeId || null
        })
      }
      const { data, error } = await supabase.from('aulas').insert(registros).select()
      setSalvando(false)
      if (error) { showToast('Erro ao criar: ' + error.message, 'error'); return }
      showToast(`${registros.length} turmas criadas! (${dias.length} dia(s) × ${horarios.length} horário(s))`, 'success')
      onSaved?.({ inserted: data || [] })
      onClose()
    }
  }

  const previewHorarios = ehEdicao ? [] : gerarHorarios(horario, horarioFim, intervalo)

  return (
    <div onClick={e => { if (e.target === e.currentTarget) onClose() }}
      style={{
        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
        backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 10000,
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px'
      }}>
      <div style={{
        backgroundColor: 'white', borderRadius: '12px', padding: '24px',
        width: '100%', maxWidth: '440px', maxHeight: '90vh', overflowY: 'auto'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '600' }}>
            {ehEdicao ? 'Editar turma' : 'Nova turma'}
          </h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px' }}>
            <Icon icon="mdi:close" width="20" style={{ color: '#999' }} />
          </button>
        </div>

        {/* Dias da semana */}
        <div style={{ marginBottom: '16px' }}>
          <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#555', marginBottom: '8px' }}>
            Dia(s) da semana
          </label>
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            {DIAS_OPTS.map(dia => {
              const sel = dias.includes(dia.valor)
              return (
                <button key={dia.valor} onClick={() => toggleDia(dia.valor)}
                  style={{
                    padding: '8px 14px', borderRadius: '8px', fontSize: '13px', fontWeight: '500',
                    border: sel ? '2px solid #344848' : '1px solid #ddd',
                    backgroundColor: sel ? '#f0f4f4' : 'white',
                    color: sel ? '#344848' : '#666', cursor: 'pointer'
                  }}>
                  {dia.abrev}
                </button>
              )
            })}
          </div>
        </div>

        {/* Horário */}
        {ehEdicao ? (
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#555', marginBottom: '8px' }}>
              Horário
            </label>
            <input type="time" value={horario} onChange={e => setHorario(e.target.value)}
              style={{ width: '100%', padding: '10px 12px', border: '1px solid #ddd', borderRadius: '8px', fontSize: '16px', boxSizing: 'border-box' }} />
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', gap: '10px', marginBottom: '16px' }}>
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#555', marginBottom: '8px' }}>Início</label>
                <input type="time" value={horario} onChange={e => setHorario(e.target.value)}
                  style={{ width: '100%', padding: '10px 12px', border: '1px solid #ddd', borderRadius: '8px', fontSize: '16px', boxSizing: 'border-box' }} />
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#555', marginBottom: '8px' }}>Fim</label>
                <input type="time" value={horarioFim} onChange={e => setHorarioFim(e.target.value)}
                  style={{ width: '100%', padding: '10px 12px', border: '1px solid #ddd', borderRadius: '8px', fontSize: '16px', boxSizing: 'border-box' }} />
              </div>
            </div>

            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#555', marginBottom: '8px' }}>
                Duração das aulas
              </label>
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                {[30, 60, 90, 120].map(min => (
                  <button key={min} onClick={() => setIntervalo(min)}
                    style={{
                      padding: '8px 16px', borderRadius: '8px', fontSize: '13px', fontWeight: '500',
                      border: intervalo === min ? '2px solid #344848' : '1px solid #ddd',
                      backgroundColor: intervalo === min ? '#f0f4f4' : 'white',
                      color: intervalo === min ? '#344848' : '#666', cursor: 'pointer'
                    }}>
                    {min >= 60 ? `${min / 60}h` : `${min}min`}
                  </button>
                ))}
              </div>
            </div>

            {previewHorarios.length > 0 && (
              <div style={{ marginBottom: '16px', padding: '12px', backgroundColor: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                <div style={{ fontSize: '12px', fontWeight: '600', color: '#888', marginBottom: '6px' }}>
                  Turmas que serão criadas
                </div>
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                  {previewHorarios.map(h => (
                    <span key={h} style={{
                      fontSize: '12px', padding: '3px 8px', backgroundColor: '#eef2ff',
                      borderRadius: '4px', color: '#4338ca', fontWeight: '600'
                    }}>{h}</span>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {/* Descrição */}
        <div style={{ marginBottom: '16px' }}>
          <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#555', marginBottom: '8px' }}>
            Descrição (ex: Pilates, Yoga, Musculação)
          </label>
          <input type="text" value={descricao} onChange={e => setDescricao(e.target.value)}
            placeholder="Ex: Pilates avançado"
            style={{ width: '100%', padding: '10px 12px', border: '1px solid #ddd', borderRadius: '8px', fontSize: '14px', boxSizing: 'border-box' }} />
        </div>

        {/* Modalidade */}
        <div style={{ marginBottom: '16px' }}>
          <ModalidadePicker
            userId={userId}
            modalidades={modalidades}
            value={modalidadeId}
            onChange={setModalidadeId}
            onCriada={onModalidadeCriada}
          />
        </div>

        {/* Capacidade */}
        <div style={{ marginBottom: '16px' }}>
          <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#555', marginBottom: '8px' }}>
            Capacidade (vagas)
          </label>
          <input type="number" min="1" max="100" value={capacidade}
            onChange={e => setCapacidade(parseInt(e.target.value) || 1)}
            style={{ width: '100%', padding: '10px 12px', border: '1px solid #ddd', borderRadius: '8px', fontSize: '16px', boxSizing: 'border-box' }} />
        </div>

        {/* Professor */}
        <div style={{ marginBottom: '20px' }}>
          <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#555', marginBottom: '8px' }}>
            Professor <span style={{ color: '#999', fontWeight: '400' }}>(opcional)</span>
          </label>
          <select value={professorId} onChange={e => setProfessorId(e.target.value)}
            style={{ width: '100%', padding: '10px 12px', border: '1px solid #ddd', borderRadius: '8px', fontSize: '14px', boxSizing: 'border-box', backgroundColor: '#fff' }}>
            <option value="">— Sem professor —</option>
            {colaboradores.map(c => (
              <option key={c.id} value={c.id}>
                {c.nome}{!c.ativo ? ' (inativo)' : ''}
              </option>
            ))}
          </select>
          {colaboradores.length === 0 && (
            <p style={{ margin: '6px 0 0', fontSize: '12px', color: '#888' }}>
              Cadastre colaboradores em <em>Configurações &gt; Colaboradores</em>.
            </p>
          )}
        </div>

        <div style={{ display: 'flex', gap: '10px' }}>
          <button onClick={onClose} style={{
            flex: 1, padding: '12px', backgroundColor: '#f5f5f5', color: '#333',
            border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: '600', cursor: 'pointer'
          }}>Cancelar</button>
          <button onClick={salvar} disabled={salvando}
            style={{
              flex: 2, padding: '12px',
              backgroundColor: salvando ? '#ccc' : '#344848', color: 'white',
              border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: '600',
              cursor: salvando ? 'not-allowed' : 'pointer'
            }}>
            {salvando ? 'Salvando...' : (ehEdicao ? 'Salvar' : 'Criar')}
          </button>
        </div>
      </div>
    </div>
  )
}
