import { useState, useEffect, useCallback } from 'react'
import { supabase } from './supabaseClient'
import { Icon } from '@iconify/react'
import { showToast } from './Toast'
import ConfirmModal from './ConfirmModal'
import { SkeletonList } from './components/Skeleton'
import useWindowSize from './hooks/useWindowSize'
import { useUser } from './contexts/UserContext'

const DIAS_SEMANA = [
  { valor: 1, label: 'Segunda', abrev: 'Seg' },
  { valor: 2, label: 'Terça', abrev: 'Ter' },
  { valor: 3, label: 'Quarta', abrev: 'Qua' },
  { valor: 4, label: 'Quinta', abrev: 'Qui' },
  { valor: 5, label: 'Sexta', abrev: 'Sex' },
  { valor: 6, label: 'Sábado', abrev: 'Sáb' },
  { valor: 0, label: 'Domingo', abrev: 'Dom' }
]

const getDiaLabel = (dia) => DIAS_SEMANA.find(d => d.valor === dia)?.label || ''
const getDiaAbrev = (dia) => DIAS_SEMANA.find(d => d.valor === dia)?.abrev || ''

export default function GradeHorarios() {
  const { isMobile } = useWindowSize()
  const { userId } = useUser()

  // Dados
  const [horarios, setHorarios] = useState([])
  const [clientes, setClientes] = useState([])
  const [loading, setLoading] = useState(true)

  // Filtros
  const [filtroDia, setFiltroDia] = useState('todos')
  const [busca, setBusca] = useState('')

  // Modal add/edit
  const [mostrarModal, setMostrarModal] = useState(false)
  const [editando, setEditando] = useState(null)

  // Form fields
  const [formClienteId, setFormClienteId] = useState('')
  const [formDiasSemana, setFormDiasSemana] = useState([1])
  const [formHorario, setFormHorario] = useState('09:00')
  const [formDescricao, setFormDescricao] = useState('')

  // Confirmação de exclusão
  const [confirmDelete, setConfirmDelete] = useState({ show: false, horario: null })

  // Salvando
  const [salvando, setSalvando] = useState(false)

  // Carregar dados
  const carregarDados = useCallback(async () => {
    if (!userId) return
    setLoading(true)

    const [horariosRes, clientesRes] = await Promise.all([
      supabase
        .from('grade_horarios')
        .select('*, devedores(nome, telefone)')
        .eq('user_id', userId)
        .order('dia_semana')
        .order('horario'),
      supabase
        .from('devedores')
        .select('id, nome, telefone')
        .eq('user_id', userId)
        .or('lixo.is.null,lixo.eq.false')
        .order('nome')
    ])

    if (horariosRes.data) setHorarios(horariosRes.data)
    if (clientesRes.data) setClientes(clientesRes.data)
    setLoading(false)
  }, [userId])

  useEffect(() => {
    carregarDados()
  }, [carregarDados])

  // Filtrar horários
  const horariosFiltrados = horarios.filter(h => {
    if (filtroDia !== 'todos' && h.dia_semana !== Number(filtroDia)) return false
    if (busca) {
      const termo = busca.toLowerCase()
      const nomeCliente = h.devedores?.nome?.toLowerCase() || ''
      const descricao = h.descricao?.toLowerCase() || ''
      if (!nomeCliente.includes(termo) && !descricao.includes(termo)) return false
    }
    return true
  })

  // Agrupar por dia da semana
  const horariosAgrupados = DIAS_SEMANA.reduce((acc, dia) => {
    const dodia = horariosFiltrados.filter(h => h.dia_semana === dia.valor)
    if (dodia.length > 0) acc.push({ dia, horarios: dodia })
    return acc
  }, [])

  // Abrir modal para novo
  const abrirModalNovo = () => {
    setEditando(null)
    setFormClienteId('')
    setFormDiasSemana([1])
    setFormHorario('09:00')
    setFormDescricao('')
    setMostrarModal(true)
  }

  // Abrir modal para editar
  const abrirModalEditar = (h) => {
    setEditando(h)
    setFormClienteId(h.devedor_id)
    setFormDiasSemana([h.dia_semana])
    setFormHorario(h.horario?.substring(0, 5) || '09:00')
    setFormDescricao(h.descricao || '')
    setMostrarModal(true)
  }

  // Toggle dia no array (multi-select para novo)
  const toggleDiaSemana = (valor) => {
    if (editando) {
      setFormDiasSemana([valor])
      return
    }
    setFormDiasSemana(prev => {
      if (prev.includes(valor)) {
        if (prev.length === 1) return prev // manter pelo menos 1
        return prev.filter(d => d !== valor)
      }
      return [...prev, valor]
    })
  }

  // Salvar (criar ou atualizar)
  const salvarHorario = async () => {
    if (!formClienteId) {
      showToast('Selecione um aluno', 'warning')
      return
    }
    if (!formHorario) {
      showToast('Informe o horário', 'warning')
      return
    }
    if (formDiasSemana.length === 0) {
      showToast('Selecione pelo menos um dia', 'warning')
      return
    }

    setSalvando(true)

    if (editando) {
      const { error } = await supabase
        .from('grade_horarios')
        .update({
          devedor_id: formClienteId,
          dia_semana: formDiasSemana[0],
          horario: formHorario,
          descricao: formDescricao.trim(),
          updated_at: new Date().toISOString()
        })
        .eq('id', editando.id)

      if (error) {
        showToast('Erro ao atualizar: ' + error.message, 'error')
      } else {
        showToast('Horário atualizado!', 'success')
        setMostrarModal(false)
        carregarDados()
      }
    } else {
      // Criar um registro para cada dia selecionado
      const registros = formDiasSemana.map(dia => ({
        user_id: userId,
        devedor_id: formClienteId,
        dia_semana: dia,
        horario: formHorario,
        descricao: formDescricao.trim()
      }))

      const { error } = await supabase
        .from('grade_horarios')
        .insert(registros)

      if (error) {
        showToast('Erro ao criar: ' + error.message, 'error')
      } else {
        const diasLabel = formDiasSemana.map(d => getDiaAbrev(d)).join(', ')
        showToast(formDiasSemana.length > 1
          ? `${formDiasSemana.length} horários adicionados (${diasLabel})!`
          : 'Horário adicionado!', 'success')
        setMostrarModal(false)
        carregarDados()
      }
    }

    setSalvando(false)
  }

  // Excluir
  const excluirHorario = async (id) => {
    const { error } = await supabase
      .from('grade_horarios')
      .delete()
      .eq('id', id)

    if (error) {
      showToast('Erro ao excluir: ' + error.message, 'error')
    } else {
      showToast('Horário removido!', 'success')
      setHorarios(prev => prev.filter(h => h.id !== id))
    }
    setConfirmDelete({ show: false, horario: null })
  }

  // Toggle ativo
  const toggleAtivo = async (h) => {
    const { error } = await supabase
      .from('grade_horarios')
      .update({ ativo: !h.ativo, updated_at: new Date().toISOString() })
      .eq('id', h.id)

    if (!error) {
      setHorarios(prev => prev.map(item =>
        item.id === h.id ? { ...item, ativo: !item.ativo } : item
      ))
    }
  }

  // Contadores
  const totalHorarios = horarios.length
  const totalAtivos = horarios.filter(h => h.ativo).length
  const totalAlunos = new Set(horarios.map(h => h.devedor_id)).size

  if (loading) {
    return (
      <div style={{ flex: 1, padding: isMobile ? '16px' : '25px 30px', backgroundColor: '#ffffff', minHeight: '100vh' }}>
        <SkeletonList count={6} />
      </div>
    )
  }

  // Cores por tipo de aula (baseado na descricao, cicla entre cores)
  const CORES_AULA = [
    { bg: '#ede9fe', border: '#8b5cf6', text: '#5b21b6' },
    { bg: '#e0f2fe', border: '#0ea5e9', text: '#0369a1' },
    { bg: '#fce7f3', border: '#ec4899', text: '#be185d' },
    { bg: '#d1fae5', border: '#10b981', text: '#065f46' },
    { bg: '#fef3c7', border: '#f59e0b', text: '#92400e' },
    { bg: '#fee2e2', border: '#ef4444', text: '#991b1b' },
    { bg: '#e0e7ff', border: '#6366f1', text: '#3730a3' }
  ]

  const descricoesCores = {}
  let corIndex = 0
  const getCorAula = (descricao) => {
    const key = (descricao || '').toLowerCase().trim() || '_default'
    if (!descricoesCores[key]) {
      descricoesCores[key] = CORES_AULA[corIndex % CORES_AULA.length]
      corIndex++
    }
    return descricoesCores[key]
  }

  // Dia de hoje (para destaque)
  const hoje = new Date().getDay() // 0=Dom, 1=Seg...

  // Grid: todos os dias (para visão calendário)
  const diasParaGrid = filtroDia === 'todos'
    ? DIAS_SEMANA
    : DIAS_SEMANA.filter(d => d.valor === Number(filtroDia))

  return (
    <div style={{ flex: 1, padding: isMobile ? '16px' : '25px 30px', backgroundColor: '#ffffff', minHeight: '100vh' }}>
      {/* Header - padrão Clientes */}
      <div style={{
        backgroundColor: 'white',
        borderRadius: '8px',
        padding: isMobile ? '16px' : '20px',
        marginBottom: isMobile ? '16px' : '25px',
        border: '1px solid #e5e7eb',
        boxShadow: 'none'
      }}>
        <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', justifyContent: 'space-between', alignItems: isMobile ? 'stretch' : 'flex-start', marginBottom: '16px', gap: isMobile ? '16px' : '0' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: isMobile ? '16px' : '18px', fontWeight: '600', color: '#344848' }}>
              Grade de Horários
            </h2>
            <p style={{ margin: '5px 0 0 0', fontSize: isMobile ? '13px' : '14px', color: '#666' }}>
              {horariosFiltrados.length} de {totalHorarios} aula(s)
              <span style={{
                marginLeft: '10px',
                padding: '2px 8px',
                backgroundColor: '#e8f5e9',
                color: '#2e7d32',
                borderRadius: '10px',
                fontSize: '11px',
                fontWeight: '600'
              }}>
                {totalAtivos} ativas
              </span>
              <span style={{
                marginLeft: '6px',
                padding: '2px 8px',
                backgroundColor: '#eef2ff',
                color: '#4338ca',
                borderRadius: '10px',
                fontSize: '11px',
                fontWeight: '600'
              }}>
                {totalAlunos} aluno{totalAlunos !== 1 ? 's' : ''}
              </span>
            </p>
          </div>

          {/* Botões */}
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={abrirModalNovo}
              style={{
                padding: isMobile ? '10px 14px' : '10px 20px',
                backgroundColor: '#344848',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                fontSize: '14px',
                fontWeight: '500',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                transition: 'background-color 0.2s',
                flex: isMobile ? 1 : 'none'
              }}
              onMouseEnter={e => e.currentTarget.style.backgroundColor = '#283838'}
              onMouseLeave={e => e.currentTarget.style.backgroundColor = '#344848'}
            >
              <Icon icon="mdi:plus" width="18" />
              {!isMobile && 'Adicionar'}
            </button>
          </div>
        </div>

        {/* Busca + filtros de dia */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '12px'
        }}>
          {/* Busca */}
          <div style={{ position: 'relative', flex: isMobile ? '1 1 100%' : '0 0 auto' }}>
            <Icon icon="mdi:magnify" width="18" style={{
              position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#999'
            }} />
            <input
              type="text"
              placeholder="Buscar por nome ou aula..."
              value={busca}
              onChange={e => setBusca(e.target.value)}
              style={{
                width: isMobile ? '100%' : '260px',
                padding: '9px 12px 9px 34px',
                border: '1px solid #ddd',
                borderRadius: '8px',
                fontSize: '14px',
                boxSizing: 'border-box'
              }}
            />
          </div>

        {/* Pills de dia */}
        <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
          <button
            onClick={() => setFiltroDia('todos')}
            style={{
              padding: '5px 12px',
              borderRadius: '20px',
              border: filtroDia === 'todos' ? 'none' : '1px solid #ddd',
              backgroundColor: filtroDia === 'todos' ? '#344848' : '#f5f5f5',
              color: filtroDia === 'todos' ? 'white' : '#666',
              fontSize: '12px',
              fontWeight: '500',
              cursor: 'pointer'
            }}
          >
            Todos
          </button>
          {DIAS_SEMANA.map(dia => (
            <button
              key={dia.valor}
              onClick={() => setFiltroDia(dia.valor.toString())}
              style={{
                padding: '5px 12px',
                borderRadius: '20px',
                border: filtroDia === dia.valor.toString() ? 'none' : '1px solid #ddd',
                backgroundColor: filtroDia === dia.valor.toString() ? '#344848' : '#f5f5f5',
                color: filtroDia === dia.valor.toString() ? 'white' : '#666',
                fontSize: '12px',
                fontWeight: '500',
                cursor: 'pointer'
              }}
            >
              {dia.abrev}
            </button>
          ))}
        </div>
      </div>
      </div>{/* Fim header card */}

      {/* Conteúdo principal */}
      <div style={{
        backgroundColor: 'white',
        borderRadius: '8px',
        padding: isMobile ? '16px' : '20px',
        border: '1px solid #e5e7eb',
        boxShadow: 'none'
      }}>

      {/* Estado vazio */}
      {horariosFiltrados.length === 0 && (
        <div style={{
          textAlign: 'center',
          padding: '60px 20px',
          backgroundColor: '#f8f8f8',
          borderRadius: '12px',
          border: '1px solid #ebebeb'
        }}>
          <Icon icon="mdi:calendar-blank-outline" width="48" style={{ color: '#ccc', marginBottom: '16px' }} />
          <h3 style={{ color: '#666', marginBottom: '8px', fontWeight: '600' }}>
            {busca || filtroDia !== 'todos' ? 'Nenhum horário encontrado' : 'Nenhum horário cadastrado'}
          </h3>
          <p style={{ color: '#999', fontSize: '14px', marginBottom: '20px' }}>
            {busca || filtroDia !== 'todos'
              ? 'Tente alterar os filtros'
              : 'Cadastre os horários de aula dos seus alunos para enviar lembretes automáticos'}
          </p>
          {!busca && filtroDia === 'todos' && (
            <button
              onClick={abrirModalNovo}
              style={{
                padding: '10px 24px',
                backgroundColor: '#344848',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                fontSize: '14px',
                fontWeight: '600',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px'
              }}
            >
              <Icon icon="mdi:plus" width="18" />
              Adicionar Primeiro Horário
            </button>
          )}
        </div>
      )}

      {/* Grade semanal (calendário) */}
      {horariosFiltrados.length > 0 && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: isMobile
            ? '1fr'
            : diasParaGrid.length <= 3
              ? `repeat(${diasParaGrid.length}, 1fr)`
              : `repeat(${Math.min(diasParaGrid.length, 7)}, minmax(130px, 1fr))`,
          gap: isMobile ? '12px' : '10px',
          alignItems: 'start',
          overflowX: !isMobile && diasParaGrid.length > 5 ? 'auto' : 'visible',
          paddingBottom: !isMobile && diasParaGrid.length > 5 ? '4px' : '0'
        }}>
          {diasParaGrid.map(dia => {
            const aulasDoDia = horariosFiltrados.filter(h => h.dia_semana === dia.valor)
            const isHoje = dia.valor === hoje

            return (
              <div
                key={dia.valor}
                style={{
                  backgroundColor: isHoje ? '#f0f7f7' : '#f8f8f8',
                  borderRadius: '12px',
                  border: isHoje ? '2px solid #344848' : '1px solid #ebebeb',
                  overflow: 'hidden',
                  minHeight: isMobile ? 'auto' : '200px'
                }}
              >
                {/* Header do dia */}
                <div style={{
                  padding: '10px 14px',
                  backgroundColor: isHoje ? '#344848' : '#f0f0f0',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{
                      fontSize: '13px',
                      fontWeight: '700',
                      color: isHoje ? 'white' : '#444'
                    }}>
                      {isMobile ? dia.label : dia.abrev}
                    </span>
                    {isHoje && (
                      <span style={{
                        fontSize: '10px',
                        backgroundColor: 'rgba(255,255,255,0.25)',
                        padding: '1px 8px',
                        borderRadius: '10px',
                        color: 'white',
                        fontWeight: '600'
                      }}>
                        HOJE
                      </span>
                    )}
                  </div>
                  <span style={{
                    fontSize: '11px',
                    fontWeight: '600',
                    color: isHoje ? 'rgba(255,255,255,0.7)' : '#999'
                  }}>
                    {aulasDoDia.length} {aulasDoDia.length === 1 ? 'aula' : 'aulas'}
                  </span>
                </div>

                {/* Aulas do dia */}
                <div style={{ padding: '8px' }}>
                  {aulasDoDia.length === 0 ? (
                    <div style={{
                      textAlign: 'center',
                      padding: '20px 8px',
                      color: '#ccc',
                      fontSize: '12px'
                    }}>
                      Sem aulas
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      {aulasDoDia.map(h => {
                        const cor = getCorAula(h.descricao)
                        return (
                          <div
                            key={h.id}
                            onClick={() => abrirModalEditar(h)}
                            style={{
                              backgroundColor: h.ativo ? cor.bg : '#f5f5f5',
                              borderLeft: `3px solid ${h.ativo ? cor.border : '#ccc'}`,
                              borderRadius: '6px',
                              padding: '8px 10px',
                              cursor: 'pointer',
                              transition: 'all 0.15s',
                              opacity: h.ativo ? 1 : 0.5,
                              position: 'relative'
                            }}
                            onMouseEnter={e => { if (!isMobile) { e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.1)'; e.currentTarget.querySelector('.aula-acoes').style.opacity = '1' }}}
                            onMouseLeave={e => { if (!isMobile) { e.currentTarget.style.boxShadow = 'none'; e.currentTarget.querySelector('.aula-acoes').style.opacity = '0' }}}
                          >
                            {/* Badge pausado */}
                            {!h.ativo && (
                              <div style={{
                                position: 'absolute',
                                top: '4px',
                                left: '14px',
                                fontSize: '9px',
                                fontWeight: '700',
                                color: '#ef4444',
                                backgroundColor: '#fef2f2',
                                padding: '1px 6px',
                                borderRadius: '4px',
                                border: '1px solid #fecaca',
                                letterSpacing: '0.5px',
                                textTransform: 'uppercase'
                              }}>
                                Pausado
                              </div>
                            )}
                            {/* Horário */}
                            <div style={{
                              fontSize: '14px',
                              fontWeight: '700',
                              color: h.ativo ? cor.text : '#999',
                              marginBottom: '2px',
                              marginTop: !h.ativo ? '14px' : '0'
                            }}>
                              {h.horario?.substring(0, 5)}
                            </div>
                            {/* Nome */}
                            <div style={{
                              fontSize: '12px',
                              fontWeight: '600',
                              color: h.ativo ? '#333' : '#999',
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis'
                            }}>
                              {h.devedores?.nome || 'Aluno'}
                            </div>
                            {/* Tipo de aula */}
                            {h.descricao && (
                              <div style={{
                                fontSize: '11px',
                                color: h.ativo ? cor.text : '#bbb',
                                marginTop: '1px',
                                whiteSpace: 'nowrap',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis'
                              }}>
                                {h.descricao}
                              </div>
                            )}

                            {/* Ações hover (sempre visíveis no mobile) */}
                            <div
                              className="aula-acoes"
                              onClick={e => e.stopPropagation()}
                              style={{
                                position: 'absolute',
                                top: '3px',
                                right: '3px',
                                display: 'flex',
                                gap: '3px',
                                opacity: isMobile ? 1 : 0,
                                transition: 'opacity 0.15s'
                              }}
                            >
                              <button
                                onClick={() => toggleAtivo(h)}
                                title={h.ativo ? 'Desativar' : 'Ativar'}
                                style={{
                                  padding: '5px',
                                  backgroundColor: 'white',
                                  border: '1px solid #e0e0e0',
                                  borderRadius: '6px',
                                  cursor: 'pointer',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  lineHeight: 1,
                                  minWidth: '28px',
                                  minHeight: '28px'
                                }}
                              >
                                <Icon icon={h.ativo ? 'mdi:pause' : 'mdi:play'} width="14" color="#666" />
                              </button>
                              <button
                                onClick={() => setConfirmDelete({ show: true, horario: h })}
                                title="Excluir"
                                style={{
                                  padding: '5px',
                                  backgroundColor: 'white',
                                  border: '1px solid #e0e0e0',
                                  borderRadius: '6px',
                                  cursor: 'pointer',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  lineHeight: 1,
                                  minWidth: '28px',
                                  minHeight: '28px'
                                }}
                              >
                                <Icon icon="mdi:close" width="14" color="#ef4444" />
                              </button>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      </div>{/* Fim card conteúdo */}

      {/* Modal de confirmação de exclusão */}
      <ConfirmModal
        isOpen={confirmDelete.show}
        onClose={() => setConfirmDelete({ show: false, horario: null })}
        onConfirm={() => excluirHorario(confirmDelete.horario?.id)}
        title="Excluir Horário"
        message={`Tem certeza que deseja excluir o horário de ${confirmDelete.horario?.devedores?.nome || 'este aluno'}?`}
        confirmText="Excluir"
        confirmColor="#ef4444"
      />

      {/* Modal de criar/editar */}
      {mostrarModal && (
        <div
          onClick={(e) => { if (e.target === e.currentTarget) setMostrarModal(false) }}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '16px'
          }}
        >
          <div style={{
            backgroundColor: 'white',
            borderRadius: '14px',
            padding: '28px',
            maxWidth: '480px',
            width: '100%',
            maxHeight: '90vh',
            overflow: 'auto'
          }}>
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '24px'
            }}>
              <h2 style={{ fontSize: '20px', fontWeight: '700', color: '#1a1a1a', margin: 0 }}>
                {editando ? 'Editar Horário' : 'Novo Horário'}
              </h2>
              <button
                onClick={() => setMostrarModal(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px' }}
              >
                <Icon icon="mdi:close" width="22" color="#666" />
              </button>
            </div>

            {/* Cliente */}
            <div style={{ marginBottom: '18px' }}>
              <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', color: '#333', marginBottom: '6px' }}>
                Aluno
              </label>
              <select
                value={formClienteId}
                onChange={e => setFormClienteId(e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  border: '1px solid #ddd',
                  borderRadius: '8px',
                  fontSize: '14px',
                  boxSizing: 'border-box',
                  backgroundColor: 'white'
                }}
              >
                <option value="">Selecione um aluno</option>
                {clientes.map(c => (
                  <option key={c.id} value={c.id}>{c.nome}</option>
                ))}
              </select>
            </div>

            {/* Dia da semana */}
            <div style={{ marginBottom: '18px' }}>
              <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', color: '#333', marginBottom: '6px' }}>
                {editando ? 'Dia da Semana' : 'Dias da Semana'}
                {!editando && (
                  <span style={{ fontWeight: '400', color: '#888', fontSize: '12px', marginLeft: '6px' }}>
                    (selecione um ou mais)
                  </span>
                )}
              </label>
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                {DIAS_SEMANA.map(dia => {
                  const selecionado = formDiasSemana.includes(dia.valor)
                  return (
                    <button
                      key={dia.valor}
                      type="button"
                      onClick={() => toggleDiaSemana(dia.valor)}
                      style={{
                        padding: '8px 14px',
                        borderRadius: '8px',
                        border: selecionado ? 'none' : '1px solid #ddd',
                        backgroundColor: selecionado ? '#344848' : 'white',
                        color: selecionado ? 'white' : '#333',
                        fontSize: '13px',
                        fontWeight: '500',
                        cursor: 'pointer',
                        transition: 'all 0.2s'
                      }}
                    >
                      {isMobile ? dia.abrev : dia.label}
                    </button>
                  )
                })}
              </div>
              {!editando && formDiasSemana.length > 1 && (
                <div style={{
                  marginTop: '8px',
                  fontSize: '12px',
                  color: '#16a34a',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px'
                }}>
                  <Icon icon="mdi:information-outline" width="14" />
                  {formDiasSemana.length} dias selecionados — será criado um horário para cada dia
                </div>
              )}
            </div>

            {/* Horário e Descrição */}
            <div style={{ display: 'flex', gap: '12px', marginBottom: '18px' }}>
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', color: '#333', marginBottom: '6px' }}>
                  Horário
                </label>
                <input
                  type="time"
                  value={formHorario}
                  onChange={e => setFormHorario(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    border: '1px solid #ddd',
                    borderRadius: '8px',
                    fontSize: '14px',
                    boxSizing: 'border-box'
                  }}
                />
              </div>
              <div style={{ flex: 2 }}>
                <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', color: '#333', marginBottom: '6px' }}>
                  Tipo de Aula
                </label>
                <input
                  type="text"
                  value={formDescricao}
                  onChange={e => setFormDescricao(e.target.value)}
                  placeholder="Ex: Pilates, Yoga, Funcional"
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    border: '1px solid #ddd',
                    borderRadius: '8px',
                    fontSize: '14px',
                    boxSizing: 'border-box'
                  }}
                />
              </div>
            </div>

            {/* Dica */}
            <div style={{
              backgroundColor: '#f0fdf4',
              border: '1px solid #bbf7d0',
              borderRadius: '8px',
              padding: '12px',
              marginBottom: '24px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}>
              <Icon icon="mdi:information-outline" width="18" color="#16a34a" />
              <span style={{ fontSize: '13px', color: '#166534' }}>
                O lembrete será enviado automaticamente 1 hora antes da aula via WhatsApp.
              </span>
            </div>

            {/* Botões */}
            <div style={{ display: 'flex', gap: '12px' }}>
              <button
                onClick={() => setMostrarModal(false)}
                style={{
                  flex: 1,
                  padding: '12px',
                  backgroundColor: '#f5f5f5',
                  color: '#333',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '14px',
                  fontWeight: '600',
                  cursor: 'pointer'
                }}
              >
                Cancelar
              </button>
              <button
                onClick={salvarHorario}
                disabled={salvando}
                style={{
                  flex: 2,
                  padding: '12px',
                  backgroundColor: salvando ? '#ccc' : '#344848',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '14px',
                  fontWeight: '600',
                  cursor: salvando ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px'
                }}
              >
                {salvando ? 'Salvando...' : (
                  <>
                    <Icon icon="mdi:check" width="18" />
                    {editando ? 'Salvar Alterações' : (
                      formDiasSemana.length > 1 ? `Adicionar ${formDiasSemana.length} Horários` : 'Adicionar Horário'
                    )}
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
