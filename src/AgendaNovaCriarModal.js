import { useState } from 'react'
import { supabase } from './supabaseClient'
import { Icon } from '@iconify/react'
import { showToast } from './Toast'

// ==========================================
// Modal unificado da Agenda Nova
// Radio: "Aluno individual" (cria aula cap=1 + 1 fixo)
//     ou "Turma" (cria várias aulas dias × intervalo, lógica do AgendaAulaModal).
// Substitui a separação atual (AgendaSlotNovoModal + AgendaAulaModal-criar)
// para o usuário fazer tudo num lugar só.
// ==========================================

const DIAS_OPTS = [
  { valor: 1, abrev: 'Seg' },
  { valor: 2, abrev: 'Ter' },
  { valor: 3, abrev: 'Qua' },
  { valor: 4, abrev: 'Qui' },
  { valor: 5, abrev: 'Sex' },
  { valor: 6, abrev: 'Sáb' },
  { valor: 0, abrev: 'Dom' }
]

const gerarHorarios = (inicio, fim, intervaloMin) => {
  const out = []
  const [hI, mI] = (inicio || '').split(':').map(Number)
  const [hF, mF] = (fim || '').split(':').map(Number)
  if (Number.isNaN(hI) || Number.isNaN(hF)) return out
  let min = hI * 60 + (mI || 0)
  const max = hF * 60 + (mF || 0)
  while (min < max) {
    const h = String(Math.floor(min / 60)).padStart(2, '0')
    const m = String(min % 60).padStart(2, '0')
    out.push(`${h}:${m}`)
    min += intervaloMin
  }
  return out
}

const toHMS = (hhmm) => (hhmm && hhmm.length === 5 ? `${hhmm}:00` : hhmm)

export default function AgendaNovaCriarModal({
  userId, clientes = [], colaboradores = [],
  onClose, onSavedAluno, onSavedTurma
}) {
  const [tipo, setTipo] = useState('aluno')
  const [salvando, setSalvando] = useState(false)

  // Aluno individual
  const [aluno, setAluno] = useState({
    devedorId: '',
    diaSemana: 1,
    horario: '09:00',
    descricao: ''
  })

  // Turma
  const [turma, setTurma] = useState({
    dias: [1, 2, 3, 4, 5],
    horario: '09:00',
    horarioFim: '18:00',
    intervalo: 60,
    descricao: '',
    capacidade: 10,
    professorId: ''
  })

  const setAlunoField = (k, v) => setAluno(prev => ({ ...prev, [k]: v }))
  const setTurmaField = (k, v) => setTurma(prev => ({ ...prev, [k]: v }))

  const toggleDiaTurma = (v) => {
    setTurma(prev => {
      if (prev.dias.includes(v)) {
        if (prev.dias.length === 1) return prev
        return { ...prev, dias: prev.dias.filter(d => d !== v) }
      }
      return { ...prev, dias: [...prev.dias, v] }
    })
  }

  const previewHorarios = gerarHorarios(turma.horario, turma.horarioFim, turma.intervalo)

  // ===== Salvar aluno individual =====
  // Insere direto em `aulas` com devedor_id setado — não usa aulas_fixos.
  // Isso marca a linha como "aluno individual" (distinto de turma cap=1).
  const salvarAluno = async () => {
    if (!aluno.devedorId) { showToast('Selecione o aluno', 'warning'); return }
    if (!aluno.horario) { showToast('Informe o horário', 'warning'); return }
    setSalvando(true)

    const { data: aulaCriada, error: errAula } = await supabase.from('aulas')
      .insert({
        user_id: userId,
        dia_semana: aluno.diaSemana,
        horario: toHMS(aluno.horario),
        descricao: aluno.descricao.trim(),
        capacidade: 1,
        devedor_id: aluno.devedorId,
        ativo: true
      })
      .select('*, devedores(id, nome, telefone, foto_url)')
      .single()

    setSalvando(false)
    if (errAula) {
      showToast('Erro ao adicionar aluno: ' + errAula.message, 'error')
      return
    }

    showToast('Aluno adicionado!', 'success')
    onSavedAluno?.({ aula: aulaCriada })
    onClose()
  }

  // ===== Salvar turma =====
  const salvarTurma = async () => {
    if (!turma.horario) { showToast('Informe o horário de início', 'warning'); return }
    if (turma.dias.length === 0) { showToast('Selecione pelo menos um dia', 'warning'); return }
    if (turma.capacidade < 1) { showToast('Capacidade mínima é 1', 'warning'); return }

    const horarios = gerarHorarios(turma.horario, turma.horarioFim, turma.intervalo)
    if (horarios.length === 0) {
      showToast('Horário de início deve ser menor que o de fim', 'warning')
      return
    }

    setSalvando(true)
    const registros = []
    for (const d of turma.dias) for (const h of horarios) {
      registros.push({
        user_id: userId,
        dia_semana: d,
        horario: h,
        descricao: turma.descricao.trim(),
        capacidade: turma.capacidade,
        professor_id: turma.professorId || null
      })
    }

    const { data, error } = await supabase.from('aulas').insert(registros).select()
    setSalvando(false)
    if (error) { showToast('Erro ao criar: ' + error.message, 'error'); return }
    showToast(`${registros.length} turma(s) criada(s)!`, 'success')
    onSavedTurma?.({ inserted: data || [] })
    onClose()
  }

  return (
    <div onClick={e => { if (e.target === e.currentTarget) onClose() }}
      style={{
        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
        backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 10000,
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px'
      }}>
      <div style={{
        backgroundColor: 'white', borderRadius: '12px', padding: '24px',
        width: '100%', maxWidth: '460px', maxHeight: '90vh', overflowY: 'auto'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
          <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '600' }}>Adicionar à agenda</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px' }}>
            <Icon icon="mdi:close" width="20" style={{ color: '#999' }} />
          </button>
        </div>

        {/* Seletor de tipo */}
        <div style={{
          display: 'flex', gap: '4px', marginBottom: '20px',
          backgroundColor: '#f3f4f6', padding: '4px', borderRadius: '10px'
        }}>
          {[
            { v: 'aluno', label: 'Aluno individual', icon: 'mdi:account-clock-outline', sub: '1 aluno por horário' },
            { v: 'turma', label: 'Turma',            icon: 'mdi:account-group-outline', sub: 'várias vagas' }
          ].map(o => {
            const sel = tipo === o.v
            return (
              <button key={o.v} onClick={() => setTipo(o.v)}
                style={{
                  flex: 1, padding: '10px 8px', borderRadius: '8px', cursor: 'pointer',
                  border: 'none',
                  backgroundColor: sel ? '#fff' : 'transparent',
                  color: sel ? '#1a1a1a' : '#666',
                  boxShadow: sel ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px',
                  fontWeight: sel ? '600' : '500',
                  fontSize: '13px'
                }}>
                <Icon icon={o.icon} width="20" />
                <span>{o.label}</span>
                <span style={{ fontSize: '10px', fontWeight: '500', color: '#999' }}>{o.sub}</span>
              </button>
            )
          })}
        </div>

        {tipo === 'aluno' ? (
          <FormAluno aluno={aluno} setField={setAlunoField} clientes={clientes} />
        ) : (
          <FormTurma
            turma={turma}
            setField={setTurmaField}
            toggleDia={toggleDiaTurma}
            colaboradores={colaboradores}
            previewHorarios={previewHorarios}
          />
        )}

        <div style={{ display: 'flex', gap: '10px', marginTop: '22px' }}>
          <button onClick={onClose} disabled={salvando}
            style={{
              flex: 1, padding: '11px', backgroundColor: '#f5f5f5', color: '#333',
              border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: '600', cursor: 'pointer'
            }}>
            Cancelar
          </button>
          <button onClick={tipo === 'aluno' ? salvarAluno : salvarTurma} disabled={salvando}
            style={{
              flex: 2, padding: '11px',
              backgroundColor: salvando ? '#ccc' : '#344848', color: 'white',
              border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: '600',
              cursor: salvando ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px'
            }}>
            <Icon icon={tipo === 'aluno' ? 'mdi:account-plus' : 'mdi:plus'} width="17" />
            {salvando ? 'Salvando...' : (tipo === 'aluno' ? 'Adicionar aluno' : 'Criar turma')}
          </button>
        </div>
      </div>
    </div>
  )
}

// ===== Formulários =====

function FormAluno({ aluno, setField, clientes }) {
  return (
    <div>
      <div style={fieldBlock}>
        <label style={labelStyle}>Aluno</label>
        <select value={aluno.devedorId} onChange={e => setField('devedorId', e.target.value)}
          style={inputStyle}>
          <option value="">Selecionar...</option>
          {clientes.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
        </select>
      </div>

      <div style={fieldBlock}>
        <label style={labelStyle}>Dia da semana</label>
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
          {DIAS_OPTS.map(d => {
            const sel = aluno.diaSemana === d.valor
            return (
              <button key={d.valor} onClick={() => setField('diaSemana', d.valor)}
                style={{
                  padding: '8px 14px', borderRadius: '8px', fontSize: '13px', fontWeight: '500',
                  border: sel ? '2px solid #344848' : '1px solid #ddd',
                  backgroundColor: sel ? '#f0f4f4' : 'white',
                  color: sel ? '#344848' : '#666', cursor: 'pointer'
                }}>
                {d.abrev}
              </button>
            )
          })}
        </div>
      </div>

      <div style={fieldBlock}>
        <label style={labelStyle}>Horário</label>
        <input type="time" value={aluno.horario}
          onChange={e => setField('horario', e.target.value)}
          style={inputStyle} />
      </div>

      <div style={{ ...fieldBlock, marginBottom: 0 }}>
        <label style={labelStyle}>
          Tag/Descrição <span style={{ color: '#999', fontWeight: '400' }}>(opcional)</span>
        </label>
        <input type="text" value={aluno.descricao}
          onChange={e => setField('descricao', e.target.value)}
          placeholder="Ex: Pilates, Avaliação, Personal..."
          style={inputStyle} />
      </div>
    </div>
  )
}

function FormTurma({ turma, setField, toggleDia, colaboradores, previewHorarios }) {
  return (
    <div>
      <div style={fieldBlock}>
        <label style={labelStyle}>Dias da semana</label>
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
          {DIAS_OPTS.map(d => {
            const sel = turma.dias.includes(d.valor)
            return (
              <button key={d.valor} onClick={() => toggleDia(d.valor)}
                style={{
                  padding: '8px 14px', borderRadius: '8px', fontSize: '13px', fontWeight: '500',
                  border: sel ? '2px solid #344848' : '1px solid #ddd',
                  backgroundColor: sel ? '#f0f4f4' : 'white',
                  color: sel ? '#344848' : '#666', cursor: 'pointer'
                }}>
                {d.abrev}
              </button>
            )
          })}
        </div>
      </div>

      <div style={{ ...fieldBlock, display: 'flex', gap: '10px' }}>
        <div style={{ flex: 1 }}>
          <label style={labelStyle}>Início</label>
          <input type="time" value={turma.horario}
            onChange={e => setField('horario', e.target.value)}
            style={inputStyle} />
        </div>
        <div style={{ flex: 1 }}>
          <label style={labelStyle}>Fim</label>
          <input type="time" value={turma.horarioFim}
            onChange={e => setField('horarioFim', e.target.value)}
            style={inputStyle} />
        </div>
      </div>

      <div style={fieldBlock}>
        <label style={labelStyle}>Duração de cada aula</label>
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
          {[30, 60, 90, 120].map(min => {
            const sel = turma.intervalo === min
            return (
              <button key={min} onClick={() => setField('intervalo', min)}
                style={{
                  padding: '8px 16px', borderRadius: '8px', fontSize: '13px', fontWeight: '500',
                  border: sel ? '2px solid #344848' : '1px solid #ddd',
                  backgroundColor: sel ? '#f0f4f4' : 'white',
                  color: sel ? '#344848' : '#666', cursor: 'pointer'
                }}>
                {min >= 60 ? `${min / 60}h` : `${min}min`}
              </button>
            )
          })}
        </div>
      </div>

      {previewHorarios.length > 0 && (
        <div style={{
          ...fieldBlock,
          padding: '10px 12px', backgroundColor: '#f8fafc',
          borderRadius: '8px', border: '1px solid #e2e8f0'
        }}>
          <div style={{ fontSize: '11px', fontWeight: '600', color: '#888', marginBottom: '6px' }}>
            Turmas que serão criadas
          </div>
          <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
            {previewHorarios.map(h => (
              <span key={h} style={{
                fontSize: '11px', padding: '2px 7px', backgroundColor: '#eef2ff',
                borderRadius: '4px', color: '#4338ca', fontWeight: '600'
              }}>{h}</span>
            ))}
          </div>
        </div>
      )}

      <div style={fieldBlock}>
        <label style={labelStyle}>Nome da turma</label>
        <input type="text" value={turma.descricao}
          onChange={e => setField('descricao', e.target.value)}
          placeholder="Ex: Pilates avançado"
          style={inputStyle} />
      </div>

      <div style={fieldBlock}>
        <label style={labelStyle}>Capacidade (vagas)</label>
        <input type="number" min="1" max="100" value={turma.capacidade}
          onChange={e => setField('capacidade', parseInt(e.target.value) || 1)}
          style={inputStyle} />
      </div>

      <div style={{ ...fieldBlock, marginBottom: 0 }}>
        <label style={labelStyle}>
          Professor <span style={{ color: '#999', fontWeight: '400' }}>(opcional)</span>
        </label>
        <select value={turma.professorId}
          onChange={e => setField('professorId', e.target.value)}
          style={inputStyle}>
          <option value="">— Sem professor —</option>
          {colaboradores.map(c => (
            <option key={c.id} value={c.id}>
              {c.nome}{!c.ativo ? ' (inativo)' : ''}
            </option>
          ))}
        </select>
      </div>
    </div>
  )
}

const fieldBlock = { marginBottom: '14px' }

const labelStyle = {
  display: 'block', fontSize: '13px', fontWeight: '600', color: '#555', marginBottom: '6px'
}

const inputStyle = {
  width: '100%', padding: '10px 12px', border: '1px solid #ddd', borderRadius: '8px',
  fontSize: '14px', boxSizing: 'border-box', backgroundColor: '#fff'
}
