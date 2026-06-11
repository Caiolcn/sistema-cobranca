import { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from './supabaseClient'
import { Icon } from '@iconify/react'
import { showToast } from './Toast'
import ConfirmModal from './ConfirmModal'
import { SkeletonList } from './components/Skeleton'
import useWindowSize from './hooks/useWindowSize'
import { useUser } from './contexts/UserContext'
import { isoDate, parseISO, addDias, inicioSemana, MESES } from './agendaUtils'
import AgendaNovaDia from './AgendaNovaDia'
import AgendaNovaSemana from './AgendaNovaSemana'
import AgendaAulaModal from './AgendaAulaModal'
import AgendaFixoModal from './AgendaFixoModal'
import AgendaDatePicker from './AgendaDatePicker'
import AgendaExportarModal from './AgendaExportarModal'
import AgendaNovaCriarModal from './AgendaNovaCriarModal'
import Select from './design-system/components/Select'

// ==========================================
// Agenda NOVA — container experimental (rota /app/agenda-nova).
// Visão única responsiva:
//   - Desktop → AgendaSemana (grade 7d × hora, igual modo "Semana" atual)
//   - Mobile  → AgendaDia    (uma data por vez, igual modo "Dia" atual)
// Toggle de modos foi removido — voltará quando definirmos os layouts futuros.
// Botão "Nova" abre o AgendaNovaCriarModal (radio: Aluno individual | Turma).
// ==========================================

export default function AgendaNovaContainer() {
  const { userId } = useUser()
  const { isMobile } = useWindowSize()

  const [dataSel, setDataSel] = useState(() => isoDate(new Date()))

  // Notificação WhatsApp (toggle global)
  const [enviarNotifPresenca, setEnviarNotifPresenca] = useState(false)
  useEffect(() => {
    if (!userId) return
    supabase.from('config').select('valor')
      .eq('chave', `${userId}_notif_presenca_whatsapp`).maybeSingle()
      .then(({ data }) => setEnviarNotifPresenca(data?.valor === 'true'))
  }, [userId])
  const toggleNotif = async (novo) => {
    setEnviarNotifPresenca(novo)
    await supabase.from('config').upsert({
      chave: `${userId}_notif_presenca_whatsapp`,
      valor: novo ? 'true' : 'false',
      user_id: userId
    }, { onConflict: 'chave' })
  }

  // Base
  const [aulas, setAulas] = useState([])
  const [fixos, setFixos] = useState([])
  const [clientes, setClientes] = useState([])
  const [colaboradores, setColaboradores] = useState([])
  const [creditos, setCreditos] = useState({})
  const [loadingBase, setLoadingBase] = useState(true)
  const [versao, setVersao] = useState(0)

  // Modais
  const [criarAberto, setCriarAberto] = useState(false)
  const [aulaModal, setAulaModal] = useState(null) // { aula } — para editar turma existente
  const [fixoModal, setFixoModal] = useState(null) // { aula, data }
  const [exportarAberto, setExportarAberto] = useState(false)
  const [confirmExcluirAula, setConfirmExcluirAula] = useState(null)
  const [confirmRemoverFixo, setConfirmRemoverFixo] = useState(null)

  // Filtro de aluno (esconde tudo que não tem o aluno selecionado)
  const [filtroAlunoId, setFiltroAlunoId] = useState('')
  const [filtroAberto, setFiltroAberto] = useState(false)

  // Menu kebab de ações secundárias (mobile)
  const [acoesMobAberto, setAcoesMobAberto] = useState(false)

  // --- carregar base ---
  const carregarBase = useCallback(async () => {
    if (!userId) return
    setLoadingBase(true)
    const [aulasRes, fixosRes, clientesRes, colabRes] = await Promise.all([
      // Agenda Nova vê AMBOS: turmas (devedor_id NULL) e alunos individuais
      // (devedor_id setado). O join `devedores` traz o aluno quando é individual;
      // pra turmas o campo vem null e os alunos seguem via `aulas_fixos`.
      supabase.from('aulas')
        .select('*, colaboradores(id, nome), devedores(id, nome, telefone, foto_url)')
        .eq('user_id', userId).eq('ativo', true).order('horario'),
      supabase.from('aulas_fixos').select('*, devedores(nome, telefone, foto_url)').eq('user_id', userId),
      supabase.from('devedores')
        .select('id, nome, telefone, foto_url, aulas_restantes, aulas_total')
        .eq('user_id', userId)
        .or('lixo.is.null,lixo.eq.false')
        .order('nome'),
      supabase.from('colaboradores')
        .select('id, nome, cargo, ativo')
        .eq('user_id', userId)
        .order('nome')
    ])
    if (aulasRes.data) setAulas(aulasRes.data)
    if (fixosRes.data) setFixos(fixosRes.data.filter(f => f.ativo !== false))
    if (colabRes.data) setColaboradores(colabRes.data)
    if (clientesRes.data) {
      setClientes(clientesRes.data)
      const m = {}
      clientesRes.data.forEach(d => {
        if (d.aulas_restantes !== null && d.aulas_restantes !== undefined) {
          m[d.id] = { aulas_restantes: d.aulas_restantes, aulas_total: d.aulas_total, nome: d.nome }
        }
      })
      setCreditos(m)
    }
    setLoadingBase(false)
  }, [userId])

  useEffect(() => { carregarBase() }, [carregarBase])

  // realtime: agendamentos online (link público)
  useEffect(() => {
    if (!userId) return
    const channel = supabase
      .channel(`agenda-nova-rt-${userId}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'agendamentos', filter: `user_id=eq.${userId}` },
        () => setVersao(v => v + 1))
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [userId])

  const aplicarCredito = useCallback((devedorId, novoRestante) => {
    setCreditos(prev => prev[devedorId]
      ? { ...prev, [devedorId]: { ...prev[devedorId], aulas_restantes: novoRestante } }
      : prev)
  }, [])

  // --- CRUD AULAS (edição/exclusão de turma existente) ---
  const abrirEditarAula = (aula) => setAulaModal({ aula })

  const attachProf = useCallback((aula) => {
    if (!aula.professor_id) return { ...aula, colaboradores: null }
    const prof = colaboradores.find(c => c.id === aula.professor_id)
    return { ...aula, colaboradores: prof ? { id: prof.id, nome: prof.nome } : null }
  }, [colaboradores])

  const onAulaSalva = ({ inserted, updated }) => {
    if (inserted) setAulas(prev => [...prev, ...inserted.map(attachProf)].sort((a, b) => (a.horario || '').localeCompare(b.horario || '')))
    if (updated) setAulas(prev => prev.map(a => a.id === updated.id ? attachProf({ ...a, ...updated }) : a))
    setVersao(v => v + 1)
  }

  const toggleAtivoAula = async (aula) => {
    const { error } = await supabase.from('aulas')
      .update({ ativo: !aula.ativo, updated_at: new Date().toISOString() })
      .eq('id', aula.id)
    if (error) { showToast('Erro ao alternar turma: ' + error.message, 'error'); return }
    setAulas(prev => prev.map(a => a.id === aula.id ? { ...a, ativo: !a.ativo } : a))
    setVersao(v => v + 1)
  }

  const excluirAula = async (aula) => {
    const { error } = await supabase.from('aulas').delete().eq('id', aula.id)
    if (error) { showToast('Erro ao excluir turma: ' + error.message, 'error'); return }
    showToast('Turma removida!', 'success')
    setAulas(prev => prev.filter(a => a.id !== aula.id))
    setFixos(prev => prev.filter(f => f.aula_id !== aula.id))
    setVersao(v => v + 1)
    setConfirmExcluirAula(null)
  }

  // --- FIXOS / AVULSOS (adicionar aluno a turma existente) ---
  const abrirAddFixo = (aula, data) => setFixoModal({ aula, data })
  const onAlunoAdicionado = (res) => {
    if (!res) return
    if (res.tipo === 'fixo' && res.fixo) setFixos(prev => [...prev, res.fixo])
    if (res.tipo === 'avulso') setVersao(v => v + 1)
  }

  const removerFixo = async (fixo) => {
    const { error } = await supabase.from('aulas_fixos').delete().eq('id', fixo.id)
    if (error) { showToast('Erro ao remover fixo: ' + error.message, 'error'); return }
    const primeiroNome = fixo?.devedores?.nome?.split(' ')[0] || 'Aluno'
    showToast(`${primeiroNome} removido dos fixos`, 'success')
    setFixos(prev => prev.filter(f => f.id !== fixo.id))
    setConfirmRemoverFixo(null)
  }

  // --- handlers do modal "Nova" ---
  // Aluno individual: 1+ aulas (uma por dia da semana escolhido) vêm com
  // `devedores` já joined (inseridas com devedor_id setado). Não usa aulas_fixos.
  const onAlunoIndividualCriado = ({ aulas }) => {
    if (!aulas?.length) return
    const completas = aulas.map(a => ({ ...a, colaboradores: null }))
    setAulas(prev => [...prev, ...completas]
      .sort((a, b) => (a.horario || '').localeCompare(b.horario || '')))
    setVersao(v => v + 1)
  }

  // Remoção do horário de um aluno individual (delete na linha de aulas).
  // CASCADE não dispara aqui (deletamos a aula, não o devedor), então não
  // afeta dados do aluno em si — apenas o slot na agenda.
  const removerAlunoIndividual = async (aula) => {
    const { error } = await supabase.from('aulas').delete().eq('id', aula.id)
    if (error) { showToast('Erro ao remover: ' + error.message, 'error'); return }
    const primeiroNome = aula?.devedores?.nome?.split(' ')[0] || 'Aluno'
    showToast(`Horário de ${primeiroNome} removido`, 'success')
    setAulas(prev => prev.filter(a => a.id !== aula.id))
    setVersao(v => v + 1)
  }

  // --- créditos baixos ---
  const lowCredit = useMemo(() => {
    const lista = []
    Object.entries(creditos).forEach(([id, c]) => {
      if (c.aulas_restantes !== null && c.aulas_restantes !== undefined && c.aulas_restantes <= 2) {
        lista.push({ id, ...c })
      }
    })
    return lista
  }, [creditos])

  const totalOcupado = useCallback((aulaId) => fixos.filter(f => f.aula_id === aulaId).length, [fixos])

  // Opções pro Select de filtro (memo precisa vir ANTES de qualquer early return)
  const opcoesAlunos = useMemo(() =>
    clientes.map(c => ({ value: c.id, label: c.nome }))
  , [clientes])

  if (loadingBase) {
    return <div style={{ paddingTop: '12px' }}><SkeletonList count={5} /></div>
  }

  const subProps = {
    enviarNotifPresenca, dataSel, setDataSel,
    aulas, fixos, creditos, onCredito: aplicarCredito,
    versao,
    filtroAlunoId,
    onEditarAula: abrirEditarAula,
    onToggleAtivoAula: toggleAtivoAula,
    onExcluirAula: (aula) => setConfirmExcluirAula(aula),
    onAddFixo: abrirAddFixo,
    onRemoverFixo: (fixo) => setConfirmRemoverFixo(fixo),
    onRemoverAluno: removerAlunoIndividual,
    // Recarrega base após mudança de horário no AgendaAlunoModal
    onRecarregarBase: carregarBase
  }

  const alunoFiltrado = filtroAlunoId
    ? clientes.find(c => c.id === filtroAlunoId)
    : null

  // Label do range de datas baseado no modo (mobile=Dia, desktop=Semana)
  const labelRange = (() => {
    const d = parseISO(dataSel)
    if (isMobile) {
      return `${d.getDate()} de ${MESES[d.getMonth()].slice(0, 3)}. de ${d.getFullYear()}`
    }
    const ini = parseISO(inicioSemana(dataSel))
    const fim = parseISO(addDias(inicioSemana(dataSel), 6))
    if (ini.getMonth() === fim.getMonth()) {
      return `${ini.getDate()} - ${fim.getDate()} de ${MESES[fim.getMonth()].slice(0, 3)}. de ${fim.getFullYear()}`
    }
    return `${ini.getDate()} de ${MESES[ini.getMonth()].slice(0, 3)}. - ${fim.getDate()} de ${MESES[fim.getMonth()].slice(0, 3)}. de ${fim.getFullYear()}`
  })()

  return (
    <div>
      {/* Banner quando filtro ativo */}
      {alunoFiltrado && (
        <div style={{
          backgroundColor: '#eef2ff', border: '1px solid #c7d2fe', borderRadius: '8px',
          padding: '8px 12px', marginBottom: '12px',
          display: 'flex', alignItems: 'center', gap: '8px',
          fontSize: '13px', color: '#3730a3'
        }}>
          <Icon icon="mdi:filter-variant" width="16" style={{ color: '#4338ca', flexShrink: 0 }} />
          <span style={{ flex: 1 }}>
            Mostrando só horários de <strong>{alunoFiltrado.nome}</strong>.
          </span>
          <button onClick={() => setFiltroAlunoId('')}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: '#4338ca', fontSize: '12px', fontWeight: '600',
              display: 'inline-flex', alignItems: 'center', gap: '4px',
              padding: '4px 8px', borderRadius: '6px'
            }}
            onMouseEnter={e => e.currentTarget.style.backgroundColor = '#e0e7ff'}
            onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}>
            <Icon icon="mdi:close" width="13" /> Limpar
          </button>
        </div>
      )}

      {/* Header: navegação à esquerda + ações à direita (linha única no mobile) */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        gap: isMobile ? '6px' : '10px', marginBottom: '14px',
        flexWrap: isMobile ? 'nowrap' : 'wrap'
      }}>
        {/* Navegação de data: ←  Hoje  → */}
        <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? '2px' : '4px', flexShrink: 0 }}>
          <button onClick={() => setDataSel(addDias(dataSel, isMobile ? -1 : -7))}
            title={isMobile ? 'Dia anterior' : 'Semana anterior'}
            style={{
              width: '32px', height: '32px', borderRadius: '8px',
              border: '1px solid #e5e7eb', backgroundColor: '#fff', color: '#475569',
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}
            onMouseEnter={e => e.currentTarget.style.backgroundColor = '#f8fafc'}
            onMouseLeave={e => e.currentTarget.style.backgroundColor = '#fff'}>
            <Icon icon="mdi:chevron-left" width="18" />
          </button>
          <button onClick={() => setDataSel(isoDate(new Date()))}
            title="Ir pra hoje"
            style={{
              height: '32px', padding: '0 14px', borderRadius: '8px',
              border: '1px solid #e5e7eb', backgroundColor: '#fff', color: '#344848',
              fontSize: '13px', fontWeight: '600', cursor: 'pointer',
              display: 'flex', alignItems: 'center'
            }}
            onMouseEnter={e => e.currentTarget.style.backgroundColor = '#f8fafc'}
            onMouseLeave={e => e.currentTarget.style.backgroundColor = '#fff'}>
            Hoje
          </button>
          <button onClick={() => setDataSel(addDias(dataSel, isMobile ? 1 : 7))}
            title={isMobile ? 'Próximo dia' : 'Próxima semana'}
            style={{
              width: '32px', height: '32px', borderRadius: '8px',
              border: '1px solid #e5e7eb', backgroundColor: '#fff', color: '#475569',
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}
            onMouseEnter={e => e.currentTarget.style.backgroundColor = '#f8fafc'}
            onMouseLeave={e => e.currentTarget.style.backgroundColor = '#fff'}>
            <Icon icon="mdi:chevron-right" width="18" />
          </button>

          {/* Botão de data: ícone + range. Click abre o calendário via AgendaDatePicker */}
          <AgendaDatePicker
            value={dataSel}
            onChange={setDataSel}
            align={isMobile ? 'left' : 'right'}
            renderTrigger={({ aberto, abrir }) => (
              <button onClick={abrir}
                title={isMobile ? `Data: ${labelRange}` : 'Selecionar data'}
                style={{
                  height: '32px', padding: isMobile ? '0 8px' : '0 12px', marginLeft: isMobile ? '2px' : '6px',
                  borderRadius: '8px',
                  border: '1px solid transparent',
                  backgroundColor: aberto ? '#f1f5f9' : 'transparent',
                  color: '#344848', fontSize: '13px', fontWeight: '500',
                  cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: isMobile ? '0' : '8px',
                  transition: 'background-color 0.12s, border-color 0.12s'
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.backgroundColor = '#f1f5f9'
                  e.currentTarget.style.borderColor = '#e2e8f0'
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.backgroundColor = aberto ? '#f1f5f9' : 'transparent'
                  e.currentTarget.style.borderColor = aberto ? '#e2e8f0' : 'transparent'
                }}>
                <Icon icon="mdi:calendar-blank-outline" width="16" />
                {!isMobile && labelRange}
              </button>
            )}
          />
        </div>

        {/* Ações à direita */}
        <div style={{
          display: 'flex', alignItems: 'center',
          gap: isMobile ? '6px' : '10px',
          flexWrap: isMobile ? 'nowrap' : 'wrap',
          flexShrink: 0
        }}>
        {/* Toggle notificação WhatsApp — escondido no mobile, vai pro kebab */}
        {!isMobile && (
          <label style={{
            display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer',
            fontSize: '12px', color: enviarNotifPresenca ? '#16a34a' : '#999', fontWeight: '500'
          }}>
            <div onClick={() => toggleNotif(!enviarNotifPresenca)}
              style={{
                width: '36px', height: '20px', borderRadius: '10px',
                backgroundColor: enviarNotifPresenca ? '#16a34a' : '#d1d5db',
                position: 'relative', transition: 'background-color 0.2s', cursor: 'pointer', flexShrink: 0
              }}>
              <div style={{
                width: '16px', height: '16px', borderRadius: '50%', backgroundColor: 'white',
                position: 'absolute', top: '2px',
                left: enviarNotifPresenca ? '18px' : '2px',
                transition: 'left 0.2s', boxShadow: '0 1px 2px rgba(0,0,0,0.2)'
              }} />
            </div>
            <Icon icon="mdi:whatsapp" width={16} style={{ color: enviarNotifPresenca ? '#25D366' : '#999' }} />
            {enviarNotifPresenca ? 'Notificar aluno' : 'Notificação off'}
          </label>
        )}

        {/* Botão Filtrar (popup com Select de aluno) */}
        <div style={{ position: 'relative' }}>
          <button onClick={() => setFiltroAberto(v => !v)}
            title="Filtrar por aluno"
            style={{
              padding: isMobile ? '8px 10px' : '9px 11px',
              backgroundColor: filtroAlunoId ? '#eef2ff' : '#fff',
              color: filtroAlunoId ? '#4338ca' : '#344848',
              border: `1px solid ${filtroAlunoId ? '#c7d2fe' : '#d1d5db'}`,
              borderRadius: '8px',
              fontSize: '13px', fontWeight: '600', cursor: 'pointer',
              display: 'flex', alignItems: 'center', position: 'relative'
            }}>
            <Icon icon="mdi:filter-variant" width="16" />
            {filtroAlunoId && (
              <div style={{
                position: 'absolute', top: '6px', right: '6px',
                width: '7px', height: '7px', borderRadius: '50%',
                backgroundColor: '#4338ca'
              }} />
            )}
          </button>
          {filtroAberto && (
            <>
              <div onClick={() => setFiltroAberto(false)}
                style={{ position: 'fixed', inset: 0, zIndex: 99 }} />
              <div style={{
                position: 'absolute', top: 'calc(100% + 6px)', right: 0,
                width: '280px', zIndex: 100,
                backgroundColor: '#fff', borderRadius: '10px',
                border: '1px solid #e5e7eb', boxShadow: '0 8px 20px rgba(0,0,0,0.12)',
                padding: '10px'
              }}>
                <Select
                  options={opcoesAlunos}
                  value={filtroAlunoId}
                  onChange={(v) => { setFiltroAlunoId(v); if (v) setFiltroAberto(false) }}
                  searchable
                  clearable
                  placeholder="Selecione um aluno…"
                  searchPlaceholder="Buscar aluno…"
                  emptyMessage="Nenhum aluno encontrado"
                />
              </div>
            </>
          )}
        </div>

        {/* Exportar — só desktop. No mobile vai pro kebab */}
        {!isMobile && (
          <button onClick={() => setExportarAberto(true)} title="Exportar presenças"
            style={{
              padding: '9px 11px',
              backgroundColor: '#fff', color: '#344848',
              border: '1px solid #d1d5db', borderRadius: '8px',
              fontSize: '13px', fontWeight: '600', cursor: 'pointer',
              display: 'flex', alignItems: 'center'
            }}>
            <Icon icon="fluent:arrow-download-24-regular" width="16" />
          </button>
        )}

        {/* Kebab de ações secundárias — só mobile */}
        {isMobile && (
          <div style={{ position: 'relative' }}>
            <button onClick={() => setAcoesMobAberto(v => !v)}
              title="Mais opções"
              style={{
                padding: '8px 10px',
                backgroundColor: '#fff', color: '#344848',
                border: '1px solid #d1d5db', borderRadius: '8px',
                cursor: 'pointer', display: 'flex', alignItems: 'center'
              }}>
              <Icon icon="mdi:dots-vertical" width="18" />
            </button>
            {acoesMobAberto && (
              <>
                <div onClick={() => setAcoesMobAberto(false)}
                  style={{ position: 'fixed', inset: 0, zIndex: 99 }} />
                <div style={{
                  position: 'absolute', top: 'calc(100% + 6px)', right: 0,
                  minWidth: '220px', zIndex: 100,
                  backgroundColor: '#fff', borderRadius: '10px',
                  border: '1px solid #e5e7eb', boxShadow: '0 8px 20px rgba(0,0,0,0.12)',
                  padding: '4px 0', overflow: 'hidden'
                }}>
                  <button onClick={() => { toggleNotif(!enviarNotifPresenca); setAcoesMobAberto(false) }}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '10px',
                      width: '100%', padding: '10px 14px',
                      background: 'none', border: 'none', cursor: 'pointer',
                      fontSize: '13px', fontWeight: '500', color: '#344848', textAlign: 'left'
                    }}>
                    <Icon icon="mdi:whatsapp" width="16"
                      style={{ color: enviarNotifPresenca ? '#25D366' : '#999' }} />
                    <span style={{ flex: 1 }}>Notificar aluno</span>
                    <span style={{
                      fontSize: '11px', fontWeight: '700',
                      color: enviarNotifPresenca ? '#16a34a' : '#999'
                    }}>
                      {enviarNotifPresenca ? 'On' : 'Off'}
                    </span>
                  </button>
                  <button onClick={() => { setExportarAberto(true); setAcoesMobAberto(false) }}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '10px',
                      width: '100%', padding: '10px 14px',
                      background: 'none', border: 'none', cursor: 'pointer',
                      fontSize: '13px', fontWeight: '500', color: '#344848', textAlign: 'left'
                    }}>
                    <Icon icon="fluent:arrow-download-24-regular" width="16" />
                    Exportar presenças
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        <button onClick={() => setCriarAberto(true)}
          style={{
            padding: isMobile ? '8px 14px' : '9px 18px',
            backgroundColor: '#333', color: 'white', border: 'none', borderRadius: '8px',
            fontSize: '13px', fontWeight: '600', cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: '6px'
          }}>
          <Icon icon="mdi:plus" width="16" /> {!isMobile && 'Adicionar'}
        </button>
        </div>
      </div>

      {/* Alerta créditos baixos */}
      {lowCredit.length > 0 && (
        <div style={{
          backgroundColor: '#fffbeb', border: '1px solid #fde68a', borderRadius: '8px',
          padding: '10px 14px', marginBottom: '14px',
          display: 'flex', alignItems: 'center', gap: '8px'
        }}>
          <Icon icon="mdi:alert" width="18" style={{ color: '#d97706', flexShrink: 0 }} />
          <span style={{ fontSize: '13px', color: '#92400e' }}>
            {lowCredit.length} aluno{lowCredit.length > 1 ? 's' : ''} com poucas aulas restantes:{' '}
            <strong>{lowCredit.slice(0, 3).map(c => `${(c.nome || '').split(' ')[0]} (${c.aulas_restantes})`).join(', ')}</strong>
            {lowCredit.length > 3 && ` +${lowCredit.length - 3}`}
          </span>
        </div>
      )}

      {/* Visão única responsiva: mobile=Dia, desktop=Semana */}
      {isMobile ? <AgendaNovaDia {...subProps} /> : <AgendaNovaSemana {...subProps} />}

      {/* ===== Modais ===== */}
      {criarAberto && (
        <AgendaNovaCriarModal
          userId={userId}
          clientes={clientes}
          colaboradores={colaboradores}
          onSavedAluno={onAlunoIndividualCriado}
          onSavedTurma={onAulaSalva}
          onClose={() => setCriarAberto(false)}
        />
      )}

      {aulaModal && (
        <AgendaAulaModal
          userId={userId}
          editandoAula={aulaModal.aula}
          colaboradores={colaboradores}
          onSaved={onAulaSalva}
          onClose={() => setAulaModal(null)}
        />
      )}

      {fixoModal && (
        <AgendaFixoModal
          userId={userId}
          aula={fixoModal.aula}
          data={fixoModal.data}
          clientes={clientes}
          fixosDaAula={fixos.filter(f => f.aula_id === fixoModal.aula.id)}
          vagasOcupadas={totalOcupado(fixoModal.aula.id)}
          onSaved={onAlunoAdicionado}
          onClose={() => setFixoModal(null)}
        />
      )}

      {exportarAberto && (
        <AgendaExportarModal
          userId={userId}
          colaboradores={colaboradores}
          clientes={clientes}
          onClose={() => setExportarAberto(false)}
        />
      )}

      <ConfirmModal
        isOpen={!!confirmExcluirAula}
        onClose={() => setConfirmExcluirAula(null)}
        onConfirm={() => excluirAula(confirmExcluirAula)}
        title="Excluir turma"
        message="Tem certeza que deseja excluir esta turma? Alunos fixos e agendamentos futuros serão removidos."
        confirmText="Excluir"
        confirmColor="#ef4444"
      />

      <ConfirmModal
        isOpen={!!confirmRemoverFixo}
        onClose={() => setConfirmRemoverFixo(null)}
        onConfirm={() => removerFixo(confirmRemoverFixo)}
        title="Remover aluno fixo"
        message={`Tem certeza que deseja remover ${confirmRemoverFixo?.devedores?.nome?.split(' ')[0] || 'este aluno'} dos fixos desta aula?`}
        confirmText="Remover"
        confirmColor="#ef4444"
      />
    </div>
  )
}
