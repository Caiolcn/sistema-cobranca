import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../supabaseClient'
import { Icon } from '@iconify/react'
import useWindowSize from '../hooks/useWindowSize'
import Input from '../design-system/components/Input'
import Select from '../design-system/components/Select'
import Button from '../design-system/components/Button'
import DateField from './DateField'

// Opções Sim/Não pros selects booleanos
const SIM_NAO = [
  { value: 'nao', label: 'Não' },
  { value: 'sim', label: 'Sim' },
]

// Título de seção limpo: rótulo + hairline
function Secao({ children }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
      <span style={{ fontSize: '12px', fontWeight: 700, letterSpacing: '0.5px', textTransform: 'uppercase', color: '#344848' }}>{children}</span>
      <div style={{ flex: 1, height: '1px', backgroundColor: 'var(--neutral-200, #E2E8F0)' }} />
    </div>
  )
}

// Textarea no padrão do DS (não há componente DS pra isso)
function Textarea({ label, required, rows = 2, style, ...rest }) {
  return (
    <div className="ds-input-field" style={{ minWidth: 0 }}>
      {label && (
        <label className="ds-input-label">
          {label}{required && <span style={{ color: 'var(--danger-500, #ef4444)' }}> *</span>}
        </label>
      )}
      <textarea
        rows={rows}
        {...rest}
        style={{
          width: '100%', padding: '9px 12px', border: '1px solid var(--neutral-300, #CBD5E1)',
          borderRadius: 'var(--radius-lg, 8px)', fontSize: '14px', fontFamily: 'inherit',
          resize: 'vertical', outline: 'none', boxSizing: 'border-box',
          color: 'var(--color-text-primary, #1e293b)', transition: 'border-color .15s, box-shadow .15s',
          ...style
        }}
        onFocus={(e) => { e.target.style.borderColor = 'var(--mensalli-green-500, #4CAF50)'; e.target.style.boxShadow = '0 0 0 3px rgba(76,175,80,0.15)' }}
        onBlur={(e) => { e.target.style.borderColor = 'var(--neutral-300, #CBD5E1)'; e.target.style.boxShadow = 'none' }}
      />
    </div>
  )
}

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

  const gridStyle = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '14px' }
  const gridMedidas = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '12px' }

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
                backgroundColor: '#e0e7ff',
                color: '#4f46e5',
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
              style={{ padding: '6px 12px', backgroundColor: '#4f46e5', color: 'white', border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: '600', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
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
              <Button variant="ghost" iconOnly icon="mdi:close" aria-label="Fechar" onClick={cancelar} />
            </div>

            {/* Corpo scrollável */}
            <div style={{ flex: 1, overflow: 'auto', padding: isSmallScreen ? '14px 16px' : '20px 24px' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '22px' }}>
        {/* Data */}
        <div style={{ maxWidth: '220px' }}>
          <DateField label="Data da avaliação" value={form.data_avaliacao} onChange={v => setForm({ ...form, data_avaliacao: v })} />
        </div>

        {/* SAÚDE */}
        <div>
          <Secao>Saúde</Secao>
          <div style={gridStyle}>
            <Textarea label="Tem alguma dor ou desconforto?" value={form.tem_dores || ''} onChange={e => setForm({ ...form, tem_dores: e.target.value })} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <Select label="Lesão recente?" portal value={form.lesao_recente ? 'sim' : 'nao'} options={SIM_NAO}
                onChange={v => setForm({ ...form, lesao_recente: v === 'sim' })} />
              {form.lesao_recente && (
                <Textarea value={form.lesoes_descricao || ''} placeholder="Descreva a lesão..." onChange={e => setForm({ ...form, lesoes_descricao: e.target.value })} />
              )}
            </div>
            <Textarea label="Cirurgias anteriores" value={form.cirurgias || ''} onChange={e => setForm({ ...form, cirurgias: e.target.value })} />
            <Textarea label="Doenças (hipertensão, diabetes, etc)" value={form.doencas || ''} onChange={e => setForm({ ...form, doencas: e.target.value })} />
            <Textarea label="Medicamentos em uso" value={form.medicamentos || ''} onChange={e => setForm({ ...form, medicamentos: e.target.value })} />
            <Textarea label="Alergias" value={form.alergias || ''} onChange={e => setForm({ ...form, alergias: e.target.value })} />
            <Select label="Já desmaiou durante exercício?" portal value={form.ja_desmaiou ? 'sim' : 'nao'} options={SIM_NAO}
              onChange={v => setForm({ ...form, ja_desmaiou: v === 'sim' })} />
          </div>
        </div>

        {/* HISTÓRICO */}
        <div>
          <Secao>Histórico físico</Secao>
          <div style={gridStyle}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <Select label="Já praticou atividade física antes?" portal value={form.praticou_esporte ? 'sim' : 'nao'} options={SIM_NAO}
                onChange={v => setForm({ ...form, praticou_esporte: v === 'sim' })} />
              {form.praticou_esporte && (
                <Textarea value={form.esportes_descricao || ''} placeholder="Quais atividades..." onChange={e => setForm({ ...form, esportes_descricao: e.target.value })} />
              )}
            </div>
            <Select label="Tempo parado" portal placeholder="Selecione..." value={form.tempo_parado || ''}
              options={TEMPOS_PARADO.filter(t => t.value)}
              onChange={v => setForm({ ...form, tempo_parado: v || '' })} />
          </div>
        </div>

        {/* OBJETIVO */}
        <div>
          <Secao>Objetivo</Secao>
          <div style={gridStyle}>
            <Select label="Principal objetivo" portal placeholder="Selecione..." value={form.objetivo || ''}
              options={OBJETIVOS.filter(o => o.value)}
              onChange={v => setForm({ ...form, objetivo: v || '' })} />
            <Textarea label="Detalhes / prazo" value={form.objetivo_descricao || ''} onChange={e => setForm({ ...form, objetivo_descricao: e.target.value })} />
          </div>
        </div>

        {/* MEDIDAS */}
        <div>
          <Secao>Medidas</Secao>
          <div style={gridMedidas}>
            <Input label="Peso (kg)" type="number" step="0.1" value={form.peso || ''} onChange={e => setForm({ ...form, peso: e.target.value })} />
            <Input label="Altura (m)" type="number" step="0.01" value={form.altura || ''} onChange={e => setForm({ ...form, altura: e.target.value })} />
            <Input label="Cintura (cm)" type="number" step="0.1" value={form.cintura || ''} onChange={e => setForm({ ...form, cintura: e.target.value })} />
            <Input label="Quadril (cm)" type="number" step="0.1" value={form.quadril || ''} onChange={e => setForm({ ...form, quadril: e.target.value })} />
            <Input label="Braço D. (cm)" type="number" step="0.1" value={form.braco_direito || ''} onChange={e => setForm({ ...form, braco_direito: e.target.value })} />
            <Input label="Braço E. (cm)" type="number" step="0.1" value={form.braco_esquerdo || ''} onChange={e => setForm({ ...form, braco_esquerdo: e.target.value })} />
            <Input label="Coxa D. (cm)" type="number" step="0.1" value={form.coxa_direita || ''} onChange={e => setForm({ ...form, coxa_direita: e.target.value })} />
            <Input label="Coxa E. (cm)" type="number" step="0.1" value={form.coxa_esquerda || ''} onChange={e => setForm({ ...form, coxa_esquerda: e.target.value })} />
          </div>
        </div>

        {/* CAMPOS EXTRAS (configurados pelo dono) */}
        {camposExtras.length > 0 && (
          <div>
            <Secao>Perguntas extras</Secao>
            <div style={gridStyle}>
              {camposExtras.map(campo => {
                const valor = form.campos_extras?.[campo.id] ?? ''
                if (campo.tipo === 'textarea') {
                  return <Textarea key={campo.id} label={campo.label} required={campo.obrigatorio} value={valor} onChange={e => updateExtra(campo.id, e.target.value)} />
                }
                if (campo.tipo === 'numero') {
                  return <Input key={campo.id} label={campo.label} required={campo.obrigatorio} type="number" value={valor} onChange={e => updateExtra(campo.id, e.target.value)} />
                }
                if (campo.tipo === 'sim_nao') {
                  return <Select key={campo.id} label={campo.label} required={campo.obrigatorio} portal placeholder="--"
                    value={valor === true ? 'sim' : valor === false ? 'nao' : ''} options={SIM_NAO}
                    onChange={v => updateExtra(campo.id, v === 'sim' ? true : v === 'nao' ? false : '')} />
                }
                if (campo.tipo === 'select') {
                  return <Select key={campo.id} label={campo.label} required={campo.obrigatorio} portal placeholder="Selecione..."
                    value={valor} options={(campo.opcoes || []).map(o => ({ value: o, label: o }))}
                    onChange={v => updateExtra(campo.id, v || '')} />
                }
                return <Input key={campo.id} label={campo.label} required={campo.obrigatorio} value={valor} onChange={e => updateExtra(campo.id, e.target.value)} />
              })}
            </div>
          </div>
        )}

        {/* OBSERVAÇÕES */}
        <Textarea label="Observações do professor" rows={3} value={form.observacoes || ''} onChange={e => setForm({ ...form, observacoes: e.target.value })} />
      </div>
            </div>

            {/* Footer fixo */}
            <div style={{ padding: isSmallScreen ? '12px 16px' : '16px 24px', borderTop: '1px solid #e5e7eb', display: 'flex', justifyContent: 'flex-end', gap: '8px', backgroundColor: '#fafafa' }}>
              <Button variant="outline" onClick={cancelar}>Cancelar</Button>
              <Button variant="primary" icon="mdi:content-save-outline" loading={salvando} onClick={salvar}>
                Salvar avaliação
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
