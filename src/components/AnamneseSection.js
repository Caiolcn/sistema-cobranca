import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../supabaseClient'
import { Icon } from '@iconify/react'
import useWindowSize from '../hooks/useWindowSize'

const OBJETIVOS = [
  { value: '', label: 'Selecione...' },
  { value: 'emagrecer', label: 'Emagrecer' },
  { value: 'hipertrofia', label: 'Hipertrofia / Ganho de massa' },
  { value: 'condicionamento', label: 'Condicionamento físico' },
  { value: 'reabilitacao', label: 'Reabilitação' },
  { value: 'qualidade_vida', label: 'Qualidade de vida' },
  { value: 'outro', label: 'Outro' }
]

const TEMPOS_PARADO = [
  { value: '', label: 'Selecione...' },
  { value: 'nunca_parou', label: 'Nunca parou' },
  { value: 'ate_3m', label: 'Até 3 meses' },
  { value: '3a6m', label: '3 a 6 meses' },
  { value: '6ma1ano', label: '6 meses a 1 ano' },
  { value: 'mais_1ano', label: 'Mais de 1 ano' }
]

const FORM_VAZIO = {
  data_avaliacao: new Date().toISOString().slice(0, 10),
  tem_dores: '',
  lesao_recente: false,
  lesoes_descricao: '',
  cirurgias: '',
  doencas: '',
  medicamentos: '',
  alergias: '',
  ja_desmaiou: false,
  praticou_esporte: false,
  esportes_descricao: '',
  tempo_parado: '',
  objetivo: '',
  objetivo_descricao: '',
  peso: '',
  altura: '',
  cintura: '',
  quadril: '',
  braco_direito: '',
  braco_esquerdo: '',
  coxa_direita: '',
  coxa_esquerda: '',
  campos_extras: {},
  observacoes: ''
}

export default function AnamneseSection({ clienteId, userId, isLocked }) {
  const { isSmallScreen } = useWindowSize()
  const [anamneses, setAnamneses] = useState([])
  const [camposExtras, setCamposExtras] = useState([])
  const [loading, setLoading] = useState(true)
  const [salvando, setSalvando] = useState(false)
  const [modo, setModo] = useState('lista') // 'lista' | 'form'
  const [editandoId, setEditandoId] = useState(null)
  const [form, setForm] = useState(FORM_VAZIO)
  const [mostrarAnamnese, setMostrarAnamnese] = useState(false)

  const podeUsar = !isLocked || !isLocked('pro')

  const carregar = useCallback(async () => {
    if (!clienteId || !userId || !podeUsar) {
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      // Carrega anamneses do aluno + config dos campos extras do dono
      const [anamResult, userResult] = await Promise.all([
        supabase
          .from('anamneses')
          .select('*')
          .eq('devedor_id', clienteId)
          .order('data_avaliacao', { ascending: false }),
        supabase
          .from('usuarios')
          .select('anamnese_campos_extras')
          .eq('id', userId)
          .maybeSingle()
      ])

      setAnamneses(anamResult.data || [])
      setCamposExtras(
        Array.isArray(userResult.data?.anamnese_campos_extras)
          ? userResult.data.anamnese_campos_extras
          : []
      )
    } catch (err) {
      console.error('Erro ao carregar anamneses:', err)
    } finally {
      setLoading(false)
    }
  }, [clienteId, userId, podeUsar])

  useEffect(() => {
    carregar()
  }, [carregar])

  const abrirNova = () => {
    setForm({ ...FORM_VAZIO, data_avaliacao: new Date().toISOString().slice(0, 10) })
    setEditandoId(null)
    setModo('form')
  }

  const abrirEdicao = (anamnese) => {
    setForm({
      ...FORM_VAZIO,
      ...anamnese,
      data_avaliacao: anamnese.data_avaliacao || new Date().toISOString().slice(0, 10),
      campos_extras: anamnese.campos_extras || {}
    })
    setEditandoId(anamnese.id)
    setModo('form')
  }

  const cancelar = () => {
    setModo('lista')
    setEditandoId(null)
    setForm(FORM_VAZIO)
  }

  const updateExtra = (campoId, valor) => {
    setForm(prev => ({
      ...prev,
      campos_extras: { ...(prev.campos_extras || {}), [campoId]: valor }
    }))
  }

  const salvar = async () => {
    // Validação dos campos extras obrigatórios
    for (const c of camposExtras) {
      if (c.obrigatorio) {
        const v = form.campos_extras?.[c.id]
        if (v === undefined || v === null || v === '') {
          alert(`Campo "${c.label}" é obrigatório`)
          return
        }
      }
    }

    setSalvando(true)
    try {
      // Limpa números vazios pra null
      const numericFields = ['peso', 'altura', 'cintura', 'quadril', 'braco_direito', 'braco_esquerdo', 'coxa_direita', 'coxa_esquerda']
      const payload = { ...form }
      for (const f of numericFields) {
        if (payload[f] === '' || payload[f] === null || payload[f] === undefined) {
          payload[f] = null
        } else {
          payload[f] = parseFloat(payload[f])
        }
      }

      if (editandoId) {
        const { id, created_at, updated_at, user_id, devedor_id, ...resto } = payload
        const { error } = await supabase
          .from('anamneses')
          .update(resto)
          .eq('id', editandoId)
        if (error) throw error
      } else {
        const { error } = await supabase
          .from('anamneses')
          .insert({ ...payload, user_id: userId, devedor_id: clienteId })
        if (error) throw error
      }

      await carregar()
      cancelar()
    } catch (err) {
      alert('Erro ao salvar: ' + err.message)
    } finally {
      setSalvando(false)
    }
  }

  const excluir = async (id) => {
    if (!window.confirm('Excluir esta avaliação?')) return
    try {
      await supabase.from('anamneses').delete().eq('id', id)
      await carregar()
    } catch (err) {
      alert('Erro ao excluir: ' + err.message)
    }
  }

  // ============================================================
  // RENDER: Bloqueado
  // ============================================================
  if (!podeUsar) {
    return (
      <div style={{ backgroundColor: '#fff7ed', border: '1px solid #fed7aa', borderRadius: '10px', padding: '14px 16px', display: 'flex', alignItems: 'center', gap: '12px' }}>
        <Icon icon="mdi:lock" width="22" style={{ color: '#ea580c', flexShrink: 0 }} />
        <div style={{ flex: 1, fontSize: '13px', color: '#9a3412' }}>
          <strong>Anamnese</strong> está disponível no plano <strong>Pro</strong>. Faça upgrade para cadastrar fichas de avaliação física dos alunos.
        </div>
      </div>
    )
  }

  if (loading) {
    return <div style={{ textAlign: 'center', padding: '20px', color: '#999' }}>Carregando...</div>
  }

  // Helpers pra renderizar respostas
  const labelObjetivo = (v) => OBJETIVOS.find(o => o.value === v)?.label || v
  const labelTempoParado = (v) => TEMPOS_PARADO.find(t => t.value === v)?.label || v

  // Renderiza "label: valor" só se valor existir
  const renderLinha = (label, valor) => {
    if (valor === null || valor === undefined || valor === '' || valor === false) return null
    const display = typeof valor === 'boolean' ? 'Sim' : String(valor)
    return (
      <div style={{
        display: 'flex',
        flexDirection: isSmallScreen ? 'column' : 'row',
        gap: isSmallScreen ? '2px' : '8px',
        fontSize: '12px',
        lineHeight: '1.5'
      }}>
        <span style={{
          color: '#6b7280',
          fontWeight: '500',
          minWidth: isSmallScreen ? 'auto' : '140px',
          flexShrink: 0
        }}>{label}:</span>
        <span style={{ color: '#1a1a1a', flex: 1, whiteSpace: 'pre-wrap' }}>{display}</span>
      </div>
    )
  }

  const renderSecao = (titulo, linhas) => {
    const validas = linhas.filter(Boolean)
    if (validas.length === 0) return null
    return (
      <div style={{ marginBottom: '12px' }}>
        <div style={{ fontSize: '11px', fontWeight: '700', color: '#7c3aed', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px' }}>{titulo}</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>{validas}</div>
      </div>
    )
  }

  const renderDetalhes = (a) => {
    const imc = a.peso && a.altura ? (parseFloat(a.peso) / (parseFloat(a.altura) ** 2)).toFixed(1) : null
    return (
      <div>
        {renderSecao('Saúde', [
          renderLinha('Dores', a.tem_dores),
          a.lesao_recente && renderLinha('Lesão', a.lesoes_descricao || 'Sim'),
          renderLinha('Cirurgias', a.cirurgias),
          renderLinha('Doenças', a.doencas),
          renderLinha('Medicamentos', a.medicamentos),
          renderLinha('Alergias', a.alergias),
          a.ja_desmaiou && renderLinha('Desmaiou em exercício', true),
        ])}

        {renderSecao('Histórico físico', [
          a.praticou_esporte && renderLinha('Praticou esporte', a.esportes_descricao || 'Sim'),
          renderLinha('Tempo parado', labelTempoParado(a.tempo_parado)),
        ])}

        {renderSecao('Objetivo', [
          renderLinha('Principal', labelObjetivo(a.objetivo)),
          renderLinha('Detalhes', a.objetivo_descricao),
        ])}

        {renderSecao('Medidas', [
          renderLinha('Peso', a.peso ? `${a.peso} kg` : null),
          renderLinha('Altura', a.altura ? `${a.altura} m` : null),
          imc && renderLinha('IMC', imc),
          renderLinha('Cintura', a.cintura ? `${a.cintura} cm` : null),
          renderLinha('Quadril', a.quadril ? `${a.quadril} cm` : null),
          renderLinha('Braço direito', a.braco_direito ? `${a.braco_direito} cm` : null),
          renderLinha('Braço esquerdo', a.braco_esquerdo ? `${a.braco_esquerdo} cm` : null),
          renderLinha('Coxa direita', a.coxa_direita ? `${a.coxa_direita} cm` : null),
          renderLinha('Coxa esquerda', a.coxa_esquerda ? `${a.coxa_esquerda} cm` : null),
        ])}

        {camposExtras.length > 0 && renderSecao('Perguntas extras',
          camposExtras.map(c => renderLinha(c.label, a.campos_extras?.[c.id]))
        )}

        {renderSecao('Observações', [renderLinha('Notas', a.observacoes)])}
      </div>
    )
  }

  // ============================================================
  // Estilos comuns do form
  // ============================================================
  const inputStyle = {
    width: '100%',
    padding: '8px 12px',
    borderRadius: '6px',
    border: '1px solid #d1d5db',
    fontSize: '14px',
    fontFamily: 'inherit',
    boxSizing: 'border-box'
  }

  const labelStyle = { fontSize: '12px', color: '#666', display: 'block', marginBottom: '4px', fontWeight: '500' }

  const sectionTitle = { fontSize: '13px', fontWeight: '600', color: '#7c3aed', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.5px' }

  return (
    <>
      {/* ============================================================ */}
      {/* CONTAINER COLAPSÁVEL (estilo igual à Frequência)              */}
      {/* ============================================================ */}
      <div style={{
        backgroundColor: '#f8f9fa',
        borderRadius: '10px',
        padding: '16px',
        border: '1px solid #e9ecef'
      }}>
        {/* Header clicável */}
        <div
          onClick={() => setMostrarAnamnese(!mostrarAnamnese)}
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            cursor: 'pointer',
            gap: '8px',
            flexWrap: 'wrap'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Icon icon="mdi:clipboard-text-outline" width="20" style={{ color: '#344848' }} />
            <span style={{ fontSize: '15px', fontWeight: '600', color: '#344848' }}>
              Anamnese
            </span>
            {anamneses.length > 0 && (
              <span style={{
                fontSize: '12px',
                fontWeight: '600',
                backgroundColor: '#ede9fe',
                color: '#7c3aed',
                padding: '2px 8px',
                borderRadius: '10px'
              }}>
                {anamneses.length} {anamneses.length === 1 ? 'avaliação' : 'avaliações'}
              </span>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              onClick={(e) => { e.stopPropagation(); abrirNova() }}
              style={{ padding: isSmallScreen ? '8px 14px' : '6px 12px', backgroundColor: '#7c3aed', color: 'white', border: 'none', borderRadius: '6px', fontSize: isSmallScreen ? '13px' : '12px', fontWeight: '600', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', minHeight: isSmallScreen ? '40px' : 'auto' }}
            >
              <Icon icon="mdi:plus" width="14" /> {isSmallScreen ? 'Nova' : 'Nova avaliação'}
            </button>
            <Icon icon={mostrarAnamnese ? 'mdi:chevron-up' : 'mdi:chevron-down'} width="20" color="#888" />
          </div>
        </div>

        {/* Conteúdo expandido */}
        {mostrarAnamnese && (
          <div style={{ marginTop: '16px' }}>
            {anamneses.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '24px 16px', color: '#9ca3af' }}>
                <Icon icon="mdi:clipboard-text-outline" width="32" style={{ opacity: 0.5 }} />
                <p style={{ margin: '8px 0 0', fontSize: '13px' }}>Nenhuma avaliação cadastrada</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {anamneses.map(a => {
                  const data = new Date(a.data_avaliacao + 'T00:00:00').toLocaleDateString('pt-BR')
                  const imc = a.peso && a.altura ? (parseFloat(a.peso) / (parseFloat(a.altura) ** 2)).toFixed(1) : null
                  return (
                    <div key={a.id} style={{ border: '1px solid #e9ecef', borderRadius: '8px', backgroundColor: 'white', overflow: 'hidden' }}>
                      {/* Sub-header do card */}
                      <div style={{ padding: '10px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', flexWrap: 'wrap', borderBottom: '1px solid #e9ecef' }}>
                        <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <Icon icon="mdi:calendar-check" width="14" style={{ color: '#7c3aed' }} />
                            <span style={{ fontSize: '13px', fontWeight: '600', color: '#333' }}>{data}</span>
                          </div>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', fontSize: '11px', color: '#666' }}>
                            {a.peso && <span>⚖️ {a.peso} kg</span>}
                            {a.altura && <span>📏 {a.altura} m</span>}
                            {imc && <span>📊 IMC {imc}</span>}
                            {a.objetivo && <span>🎯 {OBJETIVOS.find(o => o.value === a.objetivo)?.label || a.objetivo}</span>}
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                          <button onClick={() => abrirEdicao(a)} style={{ padding: isSmallScreen ? '8px 12px' : '6px 10px', backgroundColor: 'white', color: '#7c3aed', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '12px', fontWeight: '500', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', minHeight: isSmallScreen ? '40px' : 'auto' }}>
                            <Icon icon="mdi:pencil" width="14" /> Editar
                          </button>
                          <button onClick={() => excluir(a.id)} style={{ padding: isSmallScreen ? '8px 12px' : '6px 10px', backgroundColor: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca', borderRadius: '6px', fontSize: '12px', fontWeight: '500', cursor: 'pointer', minHeight: isSmallScreen ? '40px' : 'auto', minWidth: isSmallScreen ? '40px' : 'auto', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <Icon icon="mdi:delete-outline" width="14" />
                          </button>
                        </div>
                      </div>

                      {/* Detalhes (sempre visíveis quando o container pai está aberto) */}
                      <div style={{ padding: '10px 14px 14px 14px' }}>
                        {renderDetalhes(a)}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ============================================================ */}
      {/* MODAL DO FORMULÁRIO (overlay por cima do modal do cliente)   */}
      {/* ============================================================ */}
      {modo === 'form' && (
        <div
          onClick={cancelar}
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0,0,0,0.6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10000,
            padding: '16px'
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              backgroundColor: 'white',
              borderRadius: '14px',
              width: '100%',
              maxWidth: '780px',
              maxHeight: '90vh',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '0 24px 48px rgba(0,0,0,0.2)'
            }}
          >
            {/* Header fixo */}
            <div style={{ padding: isSmallScreen ? '14px 16px' : '20px 24px', borderBottom: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontSize: isSmallScreen ? '16px' : '18px', fontWeight: '600', color: '#1a1a1a' }}>
                {editandoId ? 'Editar avaliação' : 'Nova avaliação'}
              </h3>
              <button onClick={cancelar} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '8px', display: 'flex', minWidth: '44px', minHeight: '44px', alignItems: 'center', justifyContent: 'center' }}>
                <Icon icon="mdi:close" width="22" style={{ color: '#666' }} />
              </button>
            </div>

            {/* Corpo scrollável */}
            <div style={{ flex: 1, overflow: 'auto', padding: isSmallScreen ? '14px 16px' : '20px 24px' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        {/* Data */}
        <div style={{ maxWidth: '200px' }}>
          <label style={labelStyle}>Data da avaliação</label>
          <input type="date" value={form.data_avaliacao} onChange={e => setForm({ ...form, data_avaliacao: e.target.value })} style={inputStyle} />
        </div>

        {/* SAÚDE */}
        <div>
          <div style={sectionTitle}>Saúde</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '12px' }}>
            <div>
              <label style={labelStyle}>Tem alguma dor ou desconforto?</label>
              <textarea value={form.tem_dores || ''} onChange={e => setForm({ ...form, tem_dores: e.target.value })} rows={2} style={{ ...inputStyle, resize: 'vertical' }} />
            </div>
            <div>
              <label style={labelStyle}>Lesão recente?</label>
              <select value={form.lesao_recente ? 'sim' : 'nao'} onChange={e => setForm({ ...form, lesao_recente: e.target.value === 'sim' })} style={{ ...inputStyle, backgroundColor: 'white' }}>
                <option value="nao">Não</option>
                <option value="sim">Sim</option>
              </select>
              {form.lesao_recente && (
                <textarea value={form.lesoes_descricao || ''} onChange={e => setForm({ ...form, lesoes_descricao: e.target.value })} rows={2} placeholder="Descreva a lesão..." style={{ ...inputStyle, marginTop: '6px', resize: 'vertical' }} />
              )}
            </div>
            <div>
              <label style={labelStyle}>Cirurgias anteriores</label>
              <textarea value={form.cirurgias || ''} onChange={e => setForm({ ...form, cirurgias: e.target.value })} rows={2} style={{ ...inputStyle, resize: 'vertical' }} />
            </div>
            <div>
              <label style={labelStyle}>Doenças (hipertensão, diabetes, etc)</label>
              <textarea value={form.doencas || ''} onChange={e => setForm({ ...form, doencas: e.target.value })} rows={2} style={{ ...inputStyle, resize: 'vertical' }} />
            </div>
            <div>
              <label style={labelStyle}>Medicamentos em uso</label>
              <textarea value={form.medicamentos || ''} onChange={e => setForm({ ...form, medicamentos: e.target.value })} rows={2} style={{ ...inputStyle, resize: 'vertical' }} />
            </div>
            <div>
              <label style={labelStyle}>Alergias</label>
              <textarea value={form.alergias || ''} onChange={e => setForm({ ...form, alergias: e.target.value })} rows={2} style={{ ...inputStyle, resize: 'vertical' }} />
            </div>
            <div>
              <label style={labelStyle}>Já desmaiou durante exercício?</label>
              <select value={form.ja_desmaiou ? 'sim' : 'nao'} onChange={e => setForm({ ...form, ja_desmaiou: e.target.value === 'sim' })} style={{ ...inputStyle, backgroundColor: 'white' }}>
                <option value="nao">Não</option>
                <option value="sim">Sim</option>
              </select>
            </div>
          </div>
        </div>

        {/* HISTÓRICO */}
        <div>
          <div style={sectionTitle}>Histórico físico</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '12px' }}>
            <div>
              <label style={labelStyle}>Já praticou atividade física antes?</label>
              <select value={form.praticou_esporte ? 'sim' : 'nao'} onChange={e => setForm({ ...form, praticou_esporte: e.target.value === 'sim' })} style={{ ...inputStyle, backgroundColor: 'white' }}>
                <option value="nao">Não</option>
                <option value="sim">Sim</option>
              </select>
              {form.praticou_esporte && (
                <textarea value={form.esportes_descricao || ''} onChange={e => setForm({ ...form, esportes_descricao: e.target.value })} rows={2} placeholder="Quais atividades..." style={{ ...inputStyle, marginTop: '6px', resize: 'vertical' }} />
              )}
            </div>
            <div>
              <label style={labelStyle}>Tempo parado</label>
              <select value={form.tempo_parado || ''} onChange={e => setForm({ ...form, tempo_parado: e.target.value })} style={{ ...inputStyle, backgroundColor: 'white' }}>
                {TEMPOS_PARADO.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
          </div>
        </div>

        {/* OBJETIVO */}
        <div>
          <div style={sectionTitle}>Objetivo</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '12px' }}>
            <div>
              <label style={labelStyle}>Principal objetivo</label>
              <select value={form.objetivo || ''} onChange={e => setForm({ ...form, objetivo: e.target.value })} style={{ ...inputStyle, backgroundColor: 'white' }}>
                {OBJETIVOS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Detalhes / prazo</label>
              <textarea value={form.objetivo_descricao || ''} onChange={e => setForm({ ...form, objetivo_descricao: e.target.value })} rows={2} style={{ ...inputStyle, resize: 'vertical' }} />
            </div>
          </div>
        </div>

        {/* MEDIDAS */}
        <div>
          <div style={sectionTitle}>Medidas</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '12px' }}>
            <div>
              <label style={labelStyle}>Peso (kg)</label>
              <input type="number" step="0.1" value={form.peso || ''} onChange={e => setForm({ ...form, peso: e.target.value })} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Altura (m)</label>
              <input type="number" step="0.01" value={form.altura || ''} onChange={e => setForm({ ...form, altura: e.target.value })} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Cintura (cm)</label>
              <input type="number" step="0.1" value={form.cintura || ''} onChange={e => setForm({ ...form, cintura: e.target.value })} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Quadril (cm)</label>
              <input type="number" step="0.1" value={form.quadril || ''} onChange={e => setForm({ ...form, quadril: e.target.value })} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Braço D. (cm)</label>
              <input type="number" step="0.1" value={form.braco_direito || ''} onChange={e => setForm({ ...form, braco_direito: e.target.value })} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Braço E. (cm)</label>
              <input type="number" step="0.1" value={form.braco_esquerdo || ''} onChange={e => setForm({ ...form, braco_esquerdo: e.target.value })} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Coxa D. (cm)</label>
              <input type="number" step="0.1" value={form.coxa_direita || ''} onChange={e => setForm({ ...form, coxa_direita: e.target.value })} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Coxa E. (cm)</label>
              <input type="number" step="0.1" value={form.coxa_esquerda || ''} onChange={e => setForm({ ...form, coxa_esquerda: e.target.value })} style={inputStyle} />
            </div>
          </div>
        </div>

        {/* CAMPOS EXTRAS (configurados pelo dono) */}
        {camposExtras.length > 0 && (
          <div>
            <div style={sectionTitle}>Perguntas extras</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '12px' }}>
              {camposExtras.map(campo => {
                const valor = form.campos_extras?.[campo.id] ?? ''
                return (
                  <div key={campo.id}>
                    <label style={labelStyle}>
                      {campo.label}
                      {campo.obrigatorio && <span style={{ color: '#dc2626' }}> *</span>}
                    </label>
                    {campo.tipo === 'texto' && (
                      <input type="text" value={valor} onChange={e => updateExtra(campo.id, e.target.value)} style={inputStyle} />
                    )}
                    {campo.tipo === 'textarea' && (
                      <textarea value={valor} onChange={e => updateExtra(campo.id, e.target.value)} rows={2} style={{ ...inputStyle, resize: 'vertical' }} />
                    )}
                    {campo.tipo === 'numero' && (
                      <input type="number" value={valor} onChange={e => updateExtra(campo.id, e.target.value)} style={inputStyle} />
                    )}
                    {campo.tipo === 'sim_nao' && (
                      <select value={valor === true ? 'sim' : valor === false ? 'nao' : ''} onChange={e => updateExtra(campo.id, e.target.value === 'sim' ? true : e.target.value === 'nao' ? false : '')} style={{ ...inputStyle, backgroundColor: 'white' }}>
                        <option value="">--</option>
                        <option value="sim">Sim</option>
                        <option value="nao">Não</option>
                      </select>
                    )}
                    {campo.tipo === 'select' && (
                      <select value={valor} onChange={e => updateExtra(campo.id, e.target.value)} style={{ ...inputStyle, backgroundColor: 'white' }}>
                        <option value="">Selecione...</option>
                        {(campo.opcoes || []).map(o => <option key={o} value={o}>{o}</option>)}
                      </select>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* OBSERVAÇÕES */}
        <div>
          <label style={labelStyle}>Observações do professor</label>
          <textarea value={form.observacoes || ''} onChange={e => setForm({ ...form, observacoes: e.target.value })} rows={3} style={{ ...inputStyle, resize: 'vertical' }} />
        </div>
      </div>
            </div>

            {/* Footer fixo */}
            <div style={{ padding: isSmallScreen ? '12px 16px' : '16px 24px', borderTop: '1px solid #e5e7eb', display: 'flex', justifyContent: 'flex-end', gap: '8px', backgroundColor: '#fafafa' }}>
              <button onClick={cancelar} style={{ padding: '12px 18px', backgroundColor: 'white', color: '#666', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '14px', fontWeight: '500', cursor: 'pointer', minHeight: '44px' }}>
                Cancelar
              </button>
              <button onClick={salvar} disabled={salvando} style={{ padding: '12px 24px', backgroundColor: '#7c3aed', color: 'white', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: '600', cursor: salvando ? 'not-allowed' : 'pointer', opacity: salvando ? 0.6 : 1, minHeight: '44px' }}>
                {salvando ? 'Salvando...' : 'Salvar avaliação'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
