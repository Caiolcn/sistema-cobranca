import { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from './supabaseClient'
import { Icon } from '@iconify/react'
import { showToast } from './Toast'
import ConfirmModal from './ConfirmModal'
import { SkeletonList } from './components/Skeleton'
import useWindowSize from './hooks/useWindowSize'
import { useUser } from './contexts/UserContext'
import { isoDate } from './agendaUtils'
import AgendaNovaDia from './AgendaNovaDia'
import AgendaNovaSemana from './AgendaNovaSemana'
import AgendaAulaModal from './AgendaAulaModal'
import AgendaFixoModal from './AgendaFixoModal'
import AgendaDatePicker from './AgendaDatePicker'
import AgendaExportarModal from './AgendaExportarModal'
import AgendaNovaCriarModal from './AgendaNovaCriarModal'

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
  // Aluno individual: aula vem com `devedores` já joined (foi inserido com
  // devedor_id setado). Não cria entrada em aulas_fixos.
  const onAlunoIndividualCriado = ({ aula }) => {
    if (!aula) return
    const aulaCompleta = { ...aula, colaboradores: null }
    setAulas(prev => [...prev, aulaCompleta]
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

  if (loadingBase) {
    return <div style={{ paddingTop: '12px' }}><SkeletonList count={5} /></div>
  }

  const subProps = {
    enviarNotifPresenca, dataSel, setDataSel,
    aulas, fixos, creditos, onCredito: aplicarCredito,
    versao,
    onEditarAula: abrirEditarAula,
    onToggleAtivoAula: toggleAtivoAula,
    onExcluirAula: (aula) => setConfirmExcluirAula(aula),
    onAddFixo: abrirAddFixo,
    onRemoverFixo: (fixo) => setConfirmRemoverFixo(fixo),
    onRemoverAluno: removerAlunoIndividual
  }

  return (
    <div>
      {/* Header: ações alinhadas à direita (toggle de modos virá depois) */}
      <div style={{
        display: 'flex', justifyContent: 'flex-end', alignItems: 'center',
        gap: '10px', marginBottom: '14px', flexWrap: 'wrap'
      }}>
        {/* Toggle notificação WhatsApp */}
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
          {!isMobile && (enviarNotifPresenca ? 'Notificar aluno' : 'Notificação off')}
        </label>

        <AgendaDatePicker value={dataSel} onChange={setDataSel} />

        <button onClick={() => setExportarAberto(true)} title="Exportar presenças"
          style={{
            padding: isMobile ? '8px 12px' : '9px 14px',
            backgroundColor: '#fff', color: '#344848',
            border: '1px solid #d1d5db', borderRadius: '8px',
            fontSize: '13px', fontWeight: '600', cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: '6px'
          }}>
          <Icon icon="mdi:download" width="15" /> {!isMobile && 'Exportar'}
        </button>

        <button onClick={() => setCriarAberto(true)}
          style={{
            padding: isMobile ? '8px 14px' : '9px 18px',
            backgroundColor: '#333', color: 'white', border: 'none', borderRadius: '8px',
            fontSize: '13px', fontWeight: '600', cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: '6px'
          }}>
          <Icon icon="mdi:plus" width="16" /> Nova
        </button>
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
