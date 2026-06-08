import { useState, useEffect } from 'react'
import { supabase } from './supabaseClient'
import { Icon } from '@iconify/react'
import { showToast } from './Toast'
import { exportarPresencas, exportarPresencasPDF } from './utils/exportUtils'
import { isoDate, addDias } from './agendaUtils'
import Select from './design-system/components/Select'
import Button from './design-system/components/Button'
import AgendaDatePicker from './AgendaDatePicker'

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
  const [formato, setFormato] = useState('csv')
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

  const handleExport = async () => {
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
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${PRESETS.length}, 1fr)`, gap: '6px', marginBottom: '8px' }}>
            {PRESETS.map(p => {
              const sel = preset === p.v
              return (
                <button key={p.v} onClick={() => setPreset(p.v)}
                  style={{
                    padding: '8px 0', borderRadius: '8px', fontSize: '12px', fontWeight: '500',
                    fontFamily: 'var(--font-sans)',
                    border: sel ? '2px solid #344848' : '1px solid var(--neutral-300, #CBD5E1)',
                    backgroundColor: sel ? '#f0f4f4' : 'var(--color-bg-surface, #fff)',
                    color: sel ? '#344848' : 'var(--color-text-muted, #64748B)', cursor: 'pointer'
                  }}>
                  {p.label}
                </button>
              )
            })}
          </div>
          {preset !== 'tudo' && (
            <div style={{ display: 'flex', gap: '8px' }}>
              <DateField
                label="De"
                value={dataIni}
                onChange={(v) => { setPreset('custom'); setDataIni(v) }}
              />
              <DateField
                label="Até"
                value={dataFim}
                onChange={(v) => { setPreset('custom'); setDataFim(v) }}
              />
            </div>
          )}
        </div>

        {/* Professor */}
        <div style={{ marginBottom: '16px' }}>
          <Select
            label="Professor"
            options={colaboradores.map(c => ({
              value: c.id,
              label: `${c.nome}${!c.ativo ? ' (inativo)' : ''}`
            }))}
            value={colaboradorId}
            onChange={(v) => setColaboradorId(v)}
            searchable
            clearable
            portal
            placeholder="Todos"
            searchPlaceholder="Buscar professor…"
            emptyMessage="Nenhum professor encontrado"
          />
        </div>

        {/* Aluno */}
        <div style={{ marginBottom: '16px' }}>
          <Select
            label="Aluno"
            options={clientes.map(c => ({ value: c.id, label: c.nome }))}
            value={devedorId}
            onChange={(v) => setDevedorId(v)}
            searchable
            clearable
            portal
            placeholder="Todos"
            searchPlaceholder="Buscar aluno…"
            emptyMessage="Nenhum aluno encontrado"
          />
        </div>

        {/* Formato */}
        <div style={{ marginBottom: '20px' }}>
          <Select
            label="Formato"
            options={[
              { value: 'csv', label: 'CSV (planilha)' },
              { value: 'pdf', label: 'PDF (documento)' }
            ]}
            value={formato}
            onChange={(v) => setFormato(v || 'csv')}
            portal
          />
        </div>

        {/* Botões */}
        <div style={{ display: 'flex', gap: '8px' }}>
          <Button variant="outline" onClick={onClose} disabled={exportando} style={{ flex: 1 }}>
            Cancelar
          </Button>
          <Button
            variant="primary"
            icon={formato === 'pdf' ? 'mdi:file-pdf-box' : 'mdi:file-excel-outline'}
            onClick={handleExport}
            loading={exportando}
            style={{ flex: 2 }}
          >
            Exportar
          </Button>
        </div>
      </div>
    </div>
  )
}

const labelStyle = {
  display: 'block', fontSize: '13px', fontWeight: '600', color: 'var(--color-text-primary, #0f172a)', marginBottom: '8px',
  fontFamily: 'var(--font-sans)'
}

// Trigger usa as MESMAS classes do Select DS pra garantir visual idêntico
function DateField({ label, value, onChange }) {
  const valorFmt = value
    ? (() => { const [y, m, d] = value.split('-'); return `${d}/${m}/${y}` })()
    : ''
  return (
    <div className="ds-input-field" style={{ flex: 1, minWidth: 0 }}>
      {label && (
        <label className="ds-input-label" style={{ marginBottom: 0 }}>{label}</label>
      )}
      <AgendaDatePicker
        value={value}
        onChange={onChange}
        align="left"
        popupZIndex={10100}
        renderTrigger={({ aberto, abrir }) => (
          <button
            type="button"
            onClick={abrir}
            className={`ds-select-trigger ds-select-trigger--md${aberto ? ' ds-select-trigger--open' : ''}`}>
            <span className="ds-select-content">
              {valorFmt
                ? <span className="ds-select-value-text">{valorFmt}</span>
                : <span className="ds-select-placeholder">dd/mm/aaaa</span>}
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', paddingRight: '12px', color: 'var(--color-text-muted, #94a3b8)' }}>
              <Icon icon="mdi:calendar-blank-outline" width={18} />
            </span>
          </button>
        )}
      />
    </div>
  )
}
