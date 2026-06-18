import { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from './supabaseClient'
import { Icon } from '@iconify/react'
import { SkeletonList } from './components/Skeleton'
import ConfirmModal from './ConfirmModal'
import useWindowSize from './hooks/useWindowSize'
import { useUser } from './contexts/UserContext'
import AgendaPresencaModal from './AgendaPresencaModal'
import AgendaMudarHorarioModal from './AgendaMudarHorarioModal'
import {
  DIAS_CURTO, DIAS_LONGO, MESES,
  isoDate, parseISO, addDias, inicioSemana, presKey, montarRoster,
  corDaAula, iniciaisDe
} from './agendaUtils'
import { cancelarAgendamento, marcarPresencaRapida } from './agendaActions'
import { StatCard, AcoesAula, LinhaAluno, FilaEspera, badge } from './AgendaPartes'
import { AvatarStack } from './AgendaNovaPartes'

// ==========================================
// AgendaNovaDia — fork de AgendaDia para a Agenda Nova.
// Renderiza turmas (cards existentes) E alunos individuais (cards próprios).
// Aluno individual aparece como linha simples no topo do dia, antes das turmas.
// ==========================================

const COR = '#344848'

export default function AgendaNovaDia({
  enviarNotifPresenca, dataSel, setDataSel,
  aulas, fixos, creditos, onCredito, versao,
  filtroAlunoId,
  onEditarAula, onToggleAtivoAula, onExcluirAula, onAddFixo, onRemoverFixo,
  onRemoverAluno, onRecarregarBase
}) {
  const { isMobile } = useWindowSize()
  const { userId } = useUser()
  const navigate = useNavigate()

  const hojeRef = useMemo(() => isoDate(new Date()), [])
  const [agendamentos, setAgendamentos] = useState([])
  const [ausencias, setAusencias] = useState([])
  const [presencas, setPresencas] = useState({})
  const [listaEspera, setListaEspera] = useState([])
  const [loadingDia, setLoadingDia] = useState(false)
  const [modalCtx, setModalCtx] = useState(null)
  const [mudarHorarioCtx, setMudarHorarioCtx] = useState(null) // ctx pra AgendaMudarHorarioModal
  const [confirmCancelAg, setConfirmCancelAg] = useState(null)
  const [confirmRemAluno, setConfirmRemAluno] = useState(null) // aula (individual) a remover

  const carregarDia = useCallback(async () => {
    if (!userId) return
    setLoadingDia(true)
    const [agRes, ausRes, presRes, filaRes] = await Promise.all([
      // !inner + filtro de lixo: agendamento de aluno em lixeira não renderiza
      supabase.from('agendamentos')
        .select('*, devedores!inner(nome, telefone, foto_url, origem, assinatura_ativa, plano_id, lixo)')
        .eq('user_id', userId).eq('data', dataSel).eq('status', 'confirmado')
        .or('lixo.is.null,lixo.eq.false', { referencedTable: 'devedores' }),
      supabase.from('ausencias_fixos')
        .select('aula_id, devedor_id, data, motivo').eq('user_id', userId).eq('data', dataSel),
      supabase.from('presencas')
        .select('*').eq('user_id', userId).eq('data', dataSel).not('aula_id', 'is', null),
      supabase.from('lista_espera')
        .select('*, devedores(nome, telefone)')
        .eq('user_id', userId).eq('data', dataSel).eq('status', 'aguardando').order('posicao')
    ])
    setAgendamentos(agRes.data || [])
    setAusencias(ausRes.data || [])
    const m = {}
    ;(presRes.data || []).forEach(p => { if (p.aula_id && p.devedor_id) m[presKey(p.aula_id, p.devedor_id)] = p })
    setPresencas(m)
    setListaEspera(filaRes.data || [])
    setLoadingDia(false)
  }, [userId, dataSel])

  useEffect(() => { carregarDia() }, [carregarDia, versao])

  const dataObj = useMemo(() => parseISO(dataSel), [dataSel])
  const diaSemana = dataObj.getDay()
  const isFuturo = dataSel > hojeRef
  const isHoje = dataSel === hojeRef

  const semana = useMemo(() => {
    const ini = inicioSemana(dataSel)
    return Array.from({ length: 7 }, (_, i) => addDias(ini, i))
  }, [dataSel])

  // Separa aulas do dia: turmas vs alunos individuais
  // Aplica filtro de aluno se ativo (esconde turmas/aulas que não têm o aluno)
  const aulasTurmaDia = useMemo(() => {
    return aulas
      .filter(a => !a.devedor_id && a.dia_semana === diaSemana)
      .sort((a, b) => (a.horario || '').localeCompare(b.horario || ''))
      .map(aula => ({ aula, roster: montarRoster(aula.id, dataSel, fixos, agendamentos, ausencias) }))
      .filter(({ roster }) => {
        if (!filtroAlunoId) return true
        return roster.some(r => r.devedorId === filtroAlunoId)
      })
  }, [aulas, fixos, agendamentos, ausencias, diaSemana, dataSel, filtroAlunoId])

  const aulasAlunoDia = useMemo(() => {
    return aulas
      .filter(a => !!a.devedor_id && a.dia_semana === diaSemana)
      // esconde aula individual cujo aluno foi pra lixeira (devedor null/lixo=true)
      .filter(a => a.devedores && !a.devedores.lixo)
      .filter(a => !filtroAlunoId || a.devedor_id === filtroAlunoId)
      .sort((a, b) => (a.horario || '').localeCompare(b.horario || ''))
  }, [aulas, diaSemana, filtroAlunoId])

  const resumo = useMemo(() => {
    let alunos = 0, marcadas = 0
    const devSet = new Set()
    aulasTurmaDia.forEach(({ aula, roster }) => {
      alunos += roster.length
      roster.forEach(r => {
        if (presencas[presKey(aula.id, r.devedorId)]) marcadas++
        devSet.add(r.devedorId)
      })
    })
    aulasAlunoDia.forEach(aula => {
      alunos += 1
      if (presencas[presKey(aula.id, aula.devedor_id)]) marcadas++
      devSet.add(aula.devedor_id)
    })
    let creditosBaixos = 0
    devSet.forEach(id => { if (creditos[id] && creditos[id].aulas_restantes <= 2) creditosBaixos++ })
    return { aulas: aulasTurmaDia.length + aulasAlunoDia.length, alunos, marcadas, creditosBaixos }
  }, [aulasTurmaDia, aulasAlunoDia, presencas, creditos])

  // Detecta tipo de aluno e abre AgendaAlunoModal com o contexto certo.
  // Aluno individual (aula.devedor_id) → tipoAluno='individual'.
  // Caso contrário, descobre se é fixo (em aulas_fixos) ou avulso (em agendamentos).
  const abrirEdicaoAluno = (aula, devedorId, devedores) => {
    let tipoAluno = 'individual'
    let fixoEntry, agendamentoAvulso
    if (!aula.devedor_id) {
      fixoEntry = fixos.find(f => f.aula_id === aula.id && f.devedor_id === devedorId)
      if (fixoEntry) tipoAluno = 'fixo'
      else {
        agendamentoAvulso = agendamentos.find(a => a.aula_id === aula.id && a.devedor_id === devedorId)
        if (agendamentoAvulso) tipoAluno = 'avulso'
      }
    }
    setModalCtx({ aula, devedorId, devedores, tipoAluno, fixoEntry, agendamentoAvulso })
  }

  // Atalhos pros 2 casos de click (mantém API antiga, mas internamente unifica)
  const abrirModal = (aula, devedorId, devedores) => abrirEdicaoAluno(aula, devedorId, devedores)
  const abrirAlunoModal = (aula) => abrirEdicaoAluno(aula, aula.devedor_id, aula.devedores)

  // Abre modal dedicado de mudança de horário (separado do modal de presença)
  const abrirMudarHorario = (aula, devedorId, devedores) => {
    let tipoAluno = 'individual'
    let fixoEntry, agendamentoAvulso
    if (!aula.devedor_id) {
      fixoEntry = fixos.find(f => f.aula_id === aula.id && f.devedor_id === devedorId)
      if (fixoEntry) tipoAluno = 'fixo'
      else {
        agendamentoAvulso = agendamentos.find(a => a.aula_id === aula.id && a.devedor_id === devedorId)
        if (agendamentoAvulso) tipoAluno = 'avulso'
      }
    }
    setMudarHorarioCtx({ aula, devedorId, devedores, tipoAluno, fixoEntry, agendamentoAvulso })
  }

  // Disparado pelo botão "Remover horário do aluno" no AgendaAlunoModal.
  const handleRemoverSlot = () => {
    if (!modalCtx?.aula) return
    const aulaToRemove = modalCtx.aula
    setModalCtx(null)
    setConfirmRemAluno(aulaToRemove)
  }

  // Disparado após mudança de horário concluída — recarrega base no container
  // (AgendaNovaContainer expõe carregarBase via prop onRecarregarBase)
  const handleMudancaConcluida = () => {
    setModalCtx(null)
    onRecarregarBase?.()
  }

  const handleMarcar = async (aula, r, presente) => {
    if (isFuturo) return
    const res = await marcarPresencaRapida({
      aula, devedorId: r.devedorId, devedores: r.devedores,
      data: dataSel, userId,
      credito: creditos[r.devedorId], enviarNotifPresenca, presente
    })
    if (res.ok) {
      setPresencas(prev => ({ ...prev, [presKey(aula.id, r.devedorId)]: res.presenca }))
      if (res.novoCredito !== undefined) onCredito(r.devedorId, res.novoCredito)
    }
  }

  const handlePresencaChange = ({ presenca, novoCredito, removida }) => {
    if (!modalCtx) return
    const key = presKey(modalCtx.aula.id, modalCtx.devedorId)
    setPresencas(prev => {
      const n = { ...prev }
      if (removida) delete n[key]
      else n[key] = presenca
      return n
    })
    if (novoCredito !== undefined) onCredito(modalCtx.devedorId, novoCredito)
  }

  const handleCancelarAg = async (ag) => {
    const { ok } = await cancelarAgendamento({
      agendamento: ag, userId,
      devedoresCredito: creditos, onCreditoChange: onCredito
    })
    if (ok) setAgendamentos(prev => prev.filter(a => a.id !== ag.id))
    setConfirmCancelAg(null)
  }

  const totalNoDia = aulasTurmaDia.length + aulasAlunoDia.length

  return (
    <div>

      {/* Aulas do dia */}
      {loadingDia ? (
        <SkeletonList count={3} />
      ) : totalNoDia === 0 ? (
        <div style={{ textAlign: 'center', padding: '48px 20px', color: '#999' }}>
          <Icon icon="mdi:calendar-blank-outline" width="44" style={{ color: '#ddd' }} />
          <p style={{ fontSize: '14px', fontWeight: '500', color: '#666', margin: '10px 0 2px' }}>
            Nenhuma aula nesta {DIAS_LONGO[diaSemana].toLowerCase()}
          </p>
          <p style={{ fontSize: '13px', margin: 0 }}>
            {aulas.length === 0 ? 'Clique em "+ Nova" para começar.' : 'Navegue para outro dia na faixa acima.'}
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {/* Cards de aluno individual */}
          {aulasAlunoDia.map(aula => {
            const pres = presencas[presKey(aula.id, aula.devedor_id)]
            return (
              <CardAluno
                key={aula.id}
                aula={aula}
                pres={pres}
                isFuturo={isFuturo}
                onClick={() => abrirAlunoModal(aula)}
              />
            )
          })}

          {/* Cards de turma */}
          {aulasTurmaDia.map(({ aula, roster }) => {
            const marcadas = roster.filter(r => presencas[presKey(aula.id, r.devedorId)]).length
            const fila = listaEspera.filter(f => f.aula_id === aula.id)
            const cor = corDaAula(aula.descricao)
            // Status da turma define o acento da pill à direita
            const cfgTurma = isFuturo
              ? { label: 'Em breve', bg: '#ede9fe', txt: '#6b21a8', icon: 'mdi:calendar-clock-outline' }
              : roster.length === 0
                ? { label: 'Sem alunos', bg: '#f1f5f9', txt: '#64748b', icon: 'mdi:account-off-outline' }
                : marcadas === roster.length
                  ? { label: 'Tudo marcado', bg: '#dcfce7', txt: '#15803d', icon: 'mdi:check-circle' }
                  : { label: `${marcadas}/${roster.length}`, bg: '#fef3c7', txt: '#92400e', icon: 'mdi:clock-outline' }
            return (
              <div key={aula.id} style={{
                backgroundColor: '#fff',
                border: '1px solid #eef0f3',
                borderLeft: `4px solid ${cor.border}`,
                borderRadius: '14px',
                overflow: 'hidden',
                opacity: aula.ativo ? 1 : 0.55,
                transition: 'box-shadow 0.18s ease'
              }}
              onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 6px 16px rgba(15,23,42,0.06)' }}
              onMouseLeave={e => { e.currentTarget.style.boxShadow = 'none' }}>
                {/* Header */}
                <div style={{
                  display: 'flex', alignItems: 'center', gap: '12px',
                  padding: '12px 14px'
                }}>
                  {/* Avatar/ícone da turma */}
                  <div style={{
                    width: '48px', height: '48px', borderRadius: '12px', flexShrink: 0,
                    background: `linear-gradient(135deg, ${cor.bg}, ${cor.border}33)`,
                    color: cor.text,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    boxShadow: 'inset 0 0 0 1px rgba(15,23,42,0.04)'
                  }}>
                    <Icon icon="mdi:account-multiple" width="22" />
                  </div>

                  {/* Info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontSize: '15px', fontWeight: '700', color: '#0f172a',
                      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'
                    }}>
                      {aula.horario?.substring(0, 5)}{aula.descricao ? ` · ${aula.descricao}` : ''}
                    </div>
                    <div style={{
                      fontSize: '12px', color: '#64748b', marginTop: '2px',
                      display: 'flex', alignItems: 'center', gap: '6px',
                      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'
                    }}>
                      {aula.colaboradores?.nome && (
                        <>
                          <span style={{
                            height: '17px', padding: '0 6px',
                            borderRadius: '8px', backgroundColor: '#344848', color: '#fff',
                            fontSize: '9px', fontWeight: '700',
                            lineHeight: '17px',
                            display: 'inline-block', flexShrink: 0
                          }}>{iniciaisDe(aula.colaboradores.nome)}</span>
                          <span style={{ color: '#475569', fontWeight: '600', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            Prof. {aula.colaboradores.nome.split(' ')[0]}
                          </span>
                          <span style={{ color: '#cbd5e1' }}>·</span>
                        </>
                      )}
                      <Icon icon="mdi:account-multiple-outline" width="13" style={{ flexShrink: 0 }} />
                      <span style={{ fontWeight: '600' }}>{roster.length}/{aula.capacidade}</span>
                      {fila.length > 0 && (
                        <>
                          <span style={{ color: '#cbd5e1' }}>·</span>
                          <span style={{ color: '#b45309', fontWeight: '600' }}>{fila.length} na fila</span>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Status pill */}
                  <div style={{
                    flexShrink: 0,
                    display: 'inline-flex', alignItems: 'center', gap: '5px',
                    padding: '5px 10px', borderRadius: '999px',
                    backgroundColor: cfgTurma.bg, color: cfgTurma.txt,
                    fontSize: '11px', fontWeight: '700'
                  }}>
                    <Icon icon={cfgTurma.icon} width="13" />
                    {cfgTurma.label}
                  </div>
                </div>

                {/* Avatares + ações (estilo footer secundário) */}
                <div style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '0 14px 10px 14px', gap: '8px'
                }}>
                  <AvatarStack roster={roster} max={6} capacidade={aula.capacidade} size={22} />
                  <AcoesAula aula={aula}
                    onAdd={() => onAddFixo(aula, dataSel)}
                    onToggle={() => onToggleAtivoAula(aula)}
                    onEdit={() => onEditarAula(aula)}
                    onDelete={() => onExcluirAula(aula)} />
                </div>

                {/* Roster expandido (lista de alunos) */}
                {roster.length === 0 ? (
                  <div style={{
                    padding: '12px 16px', fontSize: '12px', color: '#94a3b8',
                    borderTop: '1px solid #f1f5f9'
                  }}>Nenhum aluno nesta turma.</div>
                ) : <div style={{ borderTop: '1px solid #f1f5f9' }}>{roster.map(r => {
                  const pres = presencas[presKey(aula.id, r.devedorId)]
                  const fixoObj = r.tipo === 'fixo' ? fixos.find(f => f.aula_id === aula.id && f.devedor_id === r.devedorId) : null
                  const agObj = r.tipo === 'agendado' ? agendamentos.find(a => a.aula_id === aula.id && a.devedor_id === r.devedorId) : null
                  return (
                    <LinhaAluno key={r.tipo + r.devedorId}
                      r={r} pres={pres} isFuturo={isFuturo}
                      onMarcar={(presente) => handleMarcar(aula, r, presente)}
                      onAbrirEdicao={() => abrirModal(aula, r.devedorId, r.devedores)}
                      onMudarHorario={() => abrirMudarHorario(aula, r.devedorId, r.devedores)}
                      onAbrirFicha={() => navigate(`/app/clientes?abrir=${r.devedorId}`)}
                      onRemove={
                        fixoObj ? (e) => { e.stopPropagation(); onRemoverFixo(fixoObj) }
                        : agObj ? (e) => { e.stopPropagation(); setConfirmCancelAg(agObj) }
                        : null
                      }
                    />
                  )
                })}</div>}

                <FilaEspera fila={fila} />
              </div>
            )
          })}
        </div>
      )}

      {/* Modal de presença/falta */}
      {modalCtx && (
        <AgendaPresencaModal
          userId={userId}
          aula={modalCtx.aula}
          devedorId={modalCtx.devedorId}
          devedores={modalCtx.devedores}
          data={dataSel}
          presencaExistente={presencas[presKey(modalCtx.aula.id, modalCtx.devedorId)]}
          credito={creditos[modalCtx.devedorId]}
          enviarNotifPresenca={enviarNotifPresenca}
          onChange={handlePresencaChange}
          onClose={() => setModalCtx(null)}
          // Alterar horário: fecha esse modal e abre o de mudança
          onAlterarHorario={() => {
            const ctx = modalCtx
            setModalCtx(null)
            abrirMudarHorario(ctx.aula, ctx.devedorId, ctx.devedores)
          }}
          // Aluno individual ganha botão "Remover horário" dentro do modal
          onRemoverSlot={modalCtx.tipoAluno === 'individual' ? handleRemoverSlot : undefined}
        />
      )}

      {/* Modal dedicado de mudança de horário */}
      {mudarHorarioCtx && (
        <AgendaMudarHorarioModal
          userId={userId}
          aula={mudarHorarioCtx.aula}
          devedorId={mudarHorarioCtx.devedorId}
          devedores={mudarHorarioCtx.devedores}
          data={dataSel}
          tipoAluno={mudarHorarioCtx.tipoAluno}
          fixoEntry={mudarHorarioCtx.fixoEntry}
          agendamentoAvulso={mudarHorarioCtx.agendamentoAvulso}
          aulasDisponiveis={aulas}
          fixos={fixos}
          onMudancaConcluida={() => { setMudarHorarioCtx(null); onRecarregarBase?.() }}
          onClose={() => setMudarHorarioCtx(null)}
        />
      )}

      {/* Confirmar cancelar agendamento (turma) */}
      <ConfirmModal
        isOpen={!!confirmCancelAg}
        onClose={() => setConfirmCancelAg(null)}
        onConfirm={() => handleCancelarAg(confirmCancelAg)}
        title="Remover aluno do horário"
        message={`Tem certeza que deseja remover ${confirmCancelAg?.devedores?.nome?.split(' ')[0] || 'este aluno'} deste horário? O crédito é devolvido e o próximo da fila é notificado.`}
        confirmText="Remover"
        confirmColor="#ef4444"
      />

      {/* Confirmar remover aluno individual */}
      <ConfirmModal
        isOpen={!!confirmRemAluno}
        onClose={() => setConfirmRemAluno(null)}
        onConfirm={() => { onRemoverAluno?.(confirmRemAluno); setConfirmRemAluno(null) }}
        title="Remover horário do aluno"
        message={`Tem certeza que deseja remover este horário${confirmRemAluno?.devedores?.nome ? ` de ${confirmRemAluno.devedores.nome.split(' ')[0]}` : ''}?`}
        confirmText="Remover"
        confirmColor="#ef4444"
      />
    </div>
  )
}

// ===== Card de aluno individual (mobile/lista) =====
// Card limpo focado no aluno. Sem botões inline — click abre o modal com
// todas as ações (presença, falta, remover horário).
// Visual:
//   • Avatar 48px (foto ou inicial em círculo gradiente)
//   • Nome em destaque + linha secundária com horário/tag
//   • Status pill à direita (Presente / Falta / Pendente / Em breve)
//   • Faixa lateral colorida discreta indicando status
//   • Hover: leve elevação por sombra
function CardAluno({ aula, pres, isFuturo, onClick }) {
  const nome = aula.devedores?.nome || 'Aluno'
  const foto = aula.devedores?.foto_url
  const inicial = nome.charAt(0).toUpperCase()

  const status = pres
    ? (pres.presente ? 'presente' : 'falta')
    : (isFuturo ? 'futuro' : 'pendente')

  const cfgStatus = {
    presente: { accent: '#16a34a', pillBg: '#dcfce7', pillTxt: '#15803d', label: 'Presente', icon: 'mdi:check-circle' },
    falta:    { accent: '#ef4444', pillBg: '#fee2e2', pillTxt: '#b91c1c', label: 'Falta',    icon: 'mdi:close-circle' },
    pendente: { accent: '#f59e0b', pillBg: '#fef3c7', pillTxt: '#92400e', label: 'Pendente', icon: 'mdi:clock-outline' },
    futuro:   { accent: '#8b5cf6', pillBg: '#ede9fe', pillTxt: '#6b21a8', label: 'Em breve', icon: 'mdi:calendar-clock-outline' }
  }[status]

  return (
    <div onClick={onClick}
      style={{
        backgroundColor: '#fff',
        border: '1px solid #eef0f3',
        borderLeft: `4px solid ${cfgStatus.accent}`,
        borderRadius: '14px',
        padding: '12px 14px',
        cursor: 'pointer',
        display: 'flex', alignItems: 'center', gap: '12px',
        opacity: aula.ativo ? 1 : 0.55,
        transition: 'box-shadow 0.18s ease, transform 0.18s ease'
      }}
      onMouseEnter={e => {
        e.currentTarget.style.boxShadow = '0 6px 16px rgba(15,23,42,0.08)'
        e.currentTarget.style.transform = 'translateY(-1px)'
      }}
      onMouseLeave={e => {
        e.currentTarget.style.boxShadow = 'none'
        e.currentTarget.style.transform = 'translateY(0)'
      }}>

      {/* Avatar */}
      <div style={{
        width: '48px', height: '48px', borderRadius: '50%', flexShrink: 0,
        overflow: 'hidden',
        background: foto ? '#eef2ff' : `linear-gradient(135deg, ${cfgStatus.accent}22, ${cfgStatus.accent}55)`,
        color: cfgStatus.accent,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: '18px', fontWeight: '700',
        boxShadow: 'inset 0 0 0 1px rgba(15,23,42,0.04)'
      }}>
        {foto
          ? <img src={foto} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              onError={e => { e.target.style.display = 'none'; e.target.parentElement.textContent = inicial }} />
          : inicial}
      </div>

      {/* Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: '15px', fontWeight: '700', color: '#0f172a',
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'
        }}>
          {nome}
        </div>
        <div style={{
          fontSize: '12px', color: '#64748b', marginTop: '2px',
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          display: 'flex', alignItems: 'center', gap: '6px'
        }}>
          <Icon icon="mdi:clock-outline" width="13" style={{ flexShrink: 0 }} />
          <span style={{ fontWeight: '600', color: '#475569' }}>
            {aula.horario?.substring(0, 5)}
          </span>
          {aula.descricao && (
            <>
              <span style={{ color: '#cbd5e1' }}>·</span>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{aula.descricao}</span>
            </>
          )}
        </div>
      </div>

      {/* Status pill */}
      <div style={{
        flexShrink: 0,
        display: 'inline-flex', alignItems: 'center', gap: '5px',
        padding: '5px 10px', borderRadius: '999px',
        backgroundColor: cfgStatus.pillBg, color: cfgStatus.pillTxt,
        fontSize: '11px', fontWeight: '700',
        textTransform: 'none'
      }}>
        <Icon icon={cfgStatus.icon} width="13" />
        {cfgStatus.label}
      </div>
    </div>
  )
}

const navBtn = {
  width: '36px', height: '36px', borderRadius: '8px', flexShrink: 0,
  border: '1px solid #e5e7eb', backgroundColor: '#fff', color: '#344848',
  cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center'
}
