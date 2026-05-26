import { useState, useEffect } from 'react'
import { supabase } from './supabaseClient'
import { Icon } from '@iconify/react'
import { showToast } from './Toast'
import { exportarPresencas, exportarPresencasPDF } from './utils/exportUtils'
import { isoDate, addDias } from './agendaUtils'

// ==========================================
// Modal de exportação de presenças
// Filtros: período (com presets), professor, aluno.
// Saída: CSV ou PDF.
// ==========================================

const PRESETS = [
  { v: 'tudo',   label: 'Tudo' },
  { v: '7d',     label: 'Últimos 7 dias' },
  { v: '30d',    label: 'Últimos 30 dias' },
  { v: 'custom', label: 'Personalizado' }
]

const formatarBR = (iso) => {
  if (!iso) return ''
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

export default function AgendaExportarModal({ userId, colaboradores = [], clientes = [], onClose }) {
  const [preset, setPreset] = useState('tudo')
  const [dataIni, setDataIni] = useState('')
  const [dataFim, setDataFim] = useState('')
  const [colaboradorId, setColaboradorId] = useState('')
  const [devedorId, setDevedorId] = useState('')
  const [exportando, setExportando] = useState(false)

  // Atualiza datas conforme preset
  useEffect(() => {
    if (preset === 'custom') return
    const hojeISO = isoDate(new Date())
    if (preset === 'tudo') { setDataIni(''); setDataFim(''); return }
    if (preset === '30d') { setDataIni(addDias(hojeISO, -30)); setDataFim(hojeISO); return }
    if (preset === '7d')  { setDataIni(addDias(hojeISO, -7));  setDataFim(hojeISO); return }
  }, [preset])

  const buscarPresencas = async () => {
    let query = supabase
      .from('presencas')
      .select(`
        id, data, presente, observacao, aula_id, devedor_id,
        devedores(nome, telefone),
        aulas(horario, descricao, dia_semana, professor_id, colaboradores(nome))
      `)
      .eq('user_id', userId)
      .not('aula_id', 'is', null)
      .order('data', { ascending: false })

    if (dataIni) query = query.gte('data', dataIni)
    if (dataFim) query = query.lte('data', dataFim)
    if (devedorId) query = query.eq('devedor_id', devedorId)

    const { data, error } = await query
    if (error) throw error

    // Filtro de professor é client-side (PostgREST não tem nested filter direto)
    let res = data || []
    if (colaboradorId) res = res.filter(p => p.aulas?.professor_id === colaboradorId)

    return res.map(p => ({
      data: p.data,
      diaSemana: p.aulas?.dia_semana ?? null,
      horario: p.aulas?.horario || '',
      turma: p.aulas?.descricao || '',
      professor: p.aulas?.colaboradores?.nome || '',
      aluno: p.devedores?.nome || '',
      telefone: p.devedores?.telefone || '',
      presente: p.presente,
      observacao: p.observacao || ''
    }))
  }

  const construirSubtitulo = () => {
    const partes = []
    if (dataIni && dataFim) partes.push(`${formatarBR(dataIni)} a ${formatarBR(dataFim)}`)
    else if (dataIni) partes.push(`a partir de ${formatarBR(dataIni)}`)
    else if (dataFim) partes.push(`até ${formatarBR(dataFim)}`)
    else partes.push('Todo o período')
    if (colaboradorId) {
      const c = colaboradores.find(x => x.id === colaboradorId)
      if (c) partes.push(`Prof. ${c.nome}`)
    }
    if (devedorId) {
      const a = clientes.find(x => x.id === devedorId)
      if (a) partes.push(`Aluno: ${a.nome}`)
    }
    return partes.join('  •  ')
  }

  const handleExport = async (formato) => {
    setExportando(true)
    try {
      const dados = await buscarPresencas()
      if (dados.length === 0) {
        showToast('Nenhuma presença para esse filtro.', 'warning')
        setExportando(false); return
      }
      if (formato === 'csv') exportarPresencas(dados)
      else await exportarPresencasPDF(dados, { subtitulo: construirSubtitulo() })
      showToast(`${dados.length} presença(s) exportada(s)!`, 'success')
      onClose()
    } catch (e) {
      showToast('Erro ao exportar: ' + (e.message || e), 'error')
    }
    setExportando(false)
  }

  return (
    <div onClick={e => { if (e.target === e.currentTarget) onClose() }}
      style={{
        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
        backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 10000,
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px'
      }}>
      <div style={{ backgroundColor: 'white', borderRadius: '12px', padding: '24px', width: '100%', maxWidth: '460px', maxHeight: '90vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
          <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '600' }}>Exportar presenças</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px' }}>
            <Icon icon="mdi:close" width="20" style={{ color: '#999' }} />
          </button>
        </div>
        <p style={{ margin: '0 0 18px', fontSize: '13px', color: '#888' }}>
          Filtre por período, professor e/ou aluno e baixe em CSV ou PDF.
        </p>

        {/* Período */}
        <div style={{ marginBottom: '16px' }}>
          <label style={labelStyle}>Período</label>
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '8px' }}>
            {PRESETS.map(p => {
              const sel = preset === p.v
              return (
                <button key={p.v} onClick={() => setPreset(p.v)}
                  style={{
                    padding: '7px 12px', borderRadius: '8px', fontSize: '12px', fontWeight: '500',
                    border: sel ? '2px solid #344848' : '1px solid #ddd',
                    backgroundColor: sel ? '#f0f4f4' : 'white',
                    color: sel ? '#344848' : '#666', cursor: 'pointer'
                  }}>
                  {p.label}
                </button>
              )
            })}
          </div>
          {preset !== 'tudo' && (
            <div style={{ display: 'flex', gap: '8px' }}>
              <div style={{ flex: 1 }}>
                <div style={miniLabel}>De</div>
                <input type="date" value={dataIni}
                  onChange={e => { setPreset('custom'); setDataIni(e.target.value) }}
                  style={inputStyle} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={miniLabel}>Até</div>
                <input type="date" value={dataFim}
                  onChange={e => { setPreset('custom'); setDataFim(e.target.value) }}
                  style={inputStyle} />
              </div>
            </div>
          )}
        </div>

        {/* Professor */}
        <div style={{ marginBottom: '16px' }}>
          <label style={labelStyle}>Professor</label>
          <select value={colaboradorId} onChange={e => setColaboradorId(e.target.value)} style={inputStyle}>
            <option value="">Todos</option>
            {colaboradores.map(c => (
              <option key={c.id} value={c.id}>{c.nome}{!c.ativo ? ' (inativo)' : ''}</option>
            ))}
          </select>
        </div>

        {/* Aluno */}
        <div style={{ marginBottom: '20px' }}>
          <label style={labelStyle}>Aluno</label>
          <select value={devedorId} onChange={e => setDevedorId(e.target.value)} style={inputStyle}>
            <option value="">Todos</option>
            {clientes.map(c => (
              <option key={c.id} value={c.id}>{c.nome}</option>
            ))}
          </select>
        </div>

        {/* Botões */}
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={onClose} disabled={exportando}
            style={{
              padding: '11px 16px', backgroundColor: '#f3f4f6', color: '#555',
              border: 'none', borderRadius: '8px', cursor: 'pointer',
              fontSize: '14px', fontWeight: '600'
            }}>
            Cancelar
          </button>
          <button onClick={() => handleExport('csv')} disabled={exportando}
            style={{
              flex: 1, padding: '11px',
              backgroundColor: exportando ? '#ccc' : '#16a34a', color: 'white',
              border: 'none', borderRadius: '8px',
              cursor: exportando ? 'not-allowed' : 'pointer',
              fontSize: '14px', fontWeight: '600',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px'
            }}>
            <Icon icon="mdi:file-excel-outline" width="17" /> CSV
          </button>
          <button onClick={() => handleExport('pdf')} disabled={exportando}
            style={{
              flex: 1, padding: '11px',
              backgroundColor: exportando ? '#ccc' : '#dc2626', color: 'white',
              border: 'none', borderRadius: '8px',
              cursor: exportando ? 'not-allowed' : 'pointer',
              fontSize: '14px', fontWeight: '600',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px'
            }}>
            <Icon icon="mdi:file-pdf-box" width="17" /> PDF
          </button>
        </div>
      </div>
    </div>
  )
}

const labelStyle = {
  display: 'block', fontSize: '13px', fontWeight: '600', color: '#555', marginBottom: '8px'
}
const miniLabel = {
  fontSize: '11px', color: '#888', marginBottom: '3px'
}
const inputStyle = {
  width: '100%', padding: '9px 12px', border: '1px solid #ddd', borderRadius: '8px',
  fontSize: '14px', boxSizing: 'border-box', backgroundColor: '#fff'
}
