import { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from './supabaseClient'
import { Icon } from '@iconify/react'
import { SkeletonList } from './components/Skeleton'
import ConfirmModal from './ConfirmModal'
import useWindowSize from './hooks/useWindowSize'
import { useUser } from './contexts/UserContext'
import AgendaPresencaModal from './AgendaPresencaModal'
import {
  DIAS_CURTO, DIAS_LONGO, MESES,
  isoDate, parseISO, addDias, inicioSemana, presKey, montarRoster
} from './agendaUtils'
import { cancelarAgendamento, marcarPresencaRapida } from './agendaActions'
import { StatCard, AcoesAula, LinhaAluno, FilaEspera, badge } from './AgendaPartes'

// ==========================================
// AgendaNovaDia — fork de AgendaDia para a Agenda Nova.
// Renderiza turmas (cards existentes) E alunos individuais (cards próprios).
// Aluno individual aparece como linha simples no topo do dia, antes das turmas.
// ==========================================

const COR = '#344848'

export default function AgendaNovaDia({
  enviarNotifPresenca, dataSel, setDataSel,
  aulas, fixos, creditos, onCredito, versao,
  onEditarAula, onToggleAtivoAula, onExcluirAula, onAddFixo, onRemoverFixo,
  onRemoverAluno
}) {
  const { isMobile } = useWindowSize()
  const { userId } = useUser()

  const hojeRef = useMemo(() => isoDate(new Date()), [])
  const [agendamentos, setAgendamentos] = useState([])
  const [ausencias, setAusencias] = useState([])
  const [presencas, setPresencas] = useState({})
  const [listaEspera, setListaEspera] = useState([])
  const [loadingDia, setLoadingDia] = useState(false)
  const [modalCtx, setModalCtx] = useState(null)
  const [confirmCancelAg, setConfirmCancelAg] = useState(null)
  const [confirmRemAluno, setConfirmRemAluno] = useState(null) // aula (individual) a remover

  const carregarDia = useCallback(async () => {
    if (!userId) return
    setLoadingDia(true)
    const [agRes, ausRes, presRes, filaRes] = await Promise.all([
      supabase.from('agendamentos')
        .select('*, devedores(nome, telefone, foto_url, origem, assinatura_ativa, plano_id)')
        .eq('user_id', userId).eq('data', dataSel).eq('status', 'confirmado'),
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
  const aulasTurmaDia = useMemo(() => {
    return aulas
      .filter(a => !a.devedor_id && a.dia_semana === diaSemana)
      .sort((a, b) => (a.horario || '').localeCompare(b.horario || ''))
      .map(aula => ({ aula, roster: montarRoster(aula.id, dataSel, fixos, agendamentos, ausencias) }))
  }, [aulas, fixos, agendamentos, ausencias, diaSemana, dataSel])

  const aulasAlunoDia = useMemo(() => {
    return aulas
      .filter(a => !!a.devedor_id && a.dia_semana === diaSemana)
      .sort((a, b) => (a.horario || '').localeCompare(b.horario || ''))
  }, [aulas, diaSemana])

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

  const abrirModal = (aula, devedorId, devedores) => {
    if (isFuturo) return
    setModalCtx({ aula, devedorId, devedores })
  }

  // Aluno individual: abre o modal mesmo quando futuro (pra dar acesso ao
  // botão "Remover horário"). O modal sabe lidar com data futura.
  const abrirAlunoModal = (aula) => {
    setModalCtx({ aula, devedorId: aula.devedor_id, devedores: aula.devedores })
  }

  // Disparado pelo botão "Remover horário do aluno" no AgendaPresencaModal.
  const handleRemoverSlot = () => {
    if (!modalCtx?.aula) return
    const aulaToRemove = modalCtx.aula
    setModalCtx(null)
    setConfirmRemAluno(aulaToRemove)
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
      {/* Stats */}
      {totalNoDia > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px', marginBottom: '14px' }}>
          <StatCard icon="mdi:calendar-check" cor="#3b82f6" bg="#eff6ff" label="Aulas" valor={resumo.aulas} />
          <StatCard icon="mdi:check-circle-outline" cor="#16a34a" bg="#f0fdf4" label="Presenças" valor={`${resumo.marcadas}/${resumo.alunos}`} />
          <StatCard icon="mdi:alert-circle-outline" cor={resumo.creditosBaixos > 0 ? '#d97706' : '#9ca3af'} bg={resumo.creditosBaixos > 0 ? '#fffbeb' : '#f8f9fa'} label="Créditos baixos" valor={resumo.creditosBaixos} />
        </div>
      )}

      {/* Navegação de data */}
      <div style={{
        border: '1px solid #eee', borderRadius: '12px', padding: isMobile ? '12px' : '14px 16px',
        marginBottom: '14px', backgroundColor: '#fff'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
          <button onClick={() => setDataSel(addDias(dataSel, -1))} title="Dia anterior" style={navBtn}>
            <Icon icon="mdi:chevron-left" width="22" />
          </button>
          <div style={{ textAlign: 'center', flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: isMobile ? '15px' : '17px', fontWeight: '700', color: COR }}>
              {DIAS_LONGO[diaSemana]}
            </div>
            <div style={{ fontSize: '12px', color: '#888', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
              {dataObj.getDate()} de {MESES[dataObj.getMonth()]} de {dataObj.getFullYear()}
              {isHoje && <span style={badge('#16a34a', '#dcfce7')}>Hoje</span>}
              {isFuturo && <span style={badge('#4338ca', '#eef2ff')}>Futuro</span>}
            </div>
          </div>
          <button onClick={() => setDataSel(addDias(dataSel, 1))} title="Próximo dia" style={navBtn}>
            <Icon icon="mdi:chevron-right" width="22" />
          </button>
        </div>

        <div style={{ display: 'flex', gap: isMobile ? '3px' : '6px', marginTop: '12px' }}>
          {semana.map(d => {
            const dObj = parseISO(d)
            const sel = d === dataSel
            const ehHoje = d === hojeRef
            return (
              <button key={d} onClick={() => setDataSel(d)}
                style={{
                  flex: 1, padding: isMobile ? '6px 2px' : '8px 4px', borderRadius: '9px', cursor: 'pointer',
                  border: ehHoje && !sel ? `1px solid ${COR}` : '1px solid transparent',
                  backgroundColor: sel ? COR : '#f3f4f6', color: sel ? '#fff' : '#444',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px', transition: 'all 0.15s'
                }}>
                <span style={{ fontSize: '10px', fontWeight: '600', opacity: 0.85 }}>{DIAS_CURTO[dObj.getDay()]}</span>
                <span style={{ fontSize: isMobile ? '14px' : '15px', fontWeight: '700' }}>{dObj.getDate()}</span>
              </button>
            )
          })}
        </div>
      </div>

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
            return (
              <div key={aula.id} style={{ border: '1px solid #eee', borderRadius: '12px', overflow: 'hidden' }}>
                <div style={{
                  display: 'flex', alignItems: 'center', gap: '10px',
                  padding: '10px 14px', backgroundColor: '#fafafa', borderBottom: '1px solid #f0f0f0'
                }}>
                  <div style={{
                    width: '40px', height: '40px', borderRadius: '10px', flexShrink: 0,
                    backgroundColor: '#eef2ff', display: 'flex', alignItems: 'center', justifyContent: 'center'
                  }}>
                    <Icon icon="mdi:clock-outline" width="20" style={{ color: '#4338ca' }} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '15px', fontWeight: '700', color: '#1a1a1a' }}>
                      {aula.horario?.substring(0, 5)}{aula.descricao ? ` · ${aula.descricao}` : ''}
                    </div>
                    <div style={{ fontSize: '12px', color: '#888' }}>
                      {aula.colaboradores?.nome && <span style={{ color: '#4338ca', fontWeight: '600' }}>Prof. {aula.colaboradores.nome} · </span>}
                      {roster.length}/{aula.capacidade} vagas
                      {marcadas > 0 && <span style={{ color: '#16a34a', fontWeight: '600' }}> · {marcadas} marcada(s)</span>}
                      {fila.length > 0 && <span style={{ color: '#f59e0b', fontWeight: '600' }}> · {fila.length} na fila</span>}
                    </div>
                  </div>
                  <AcoesAula aula={aula}
                    onAdd={() => onAddFixo(aula, dataSel)}
                    onToggle={() => onToggleAtivoAula(aula)}
                    onEdit={() => onEditarAula(aula)}
                    onDelete={() => onExcluirAula(aula)} />
                </div>

                {roster.length === 0 ? (
                  <div style={{ padding: '14px 16px', fontSize: '13px', color: '#aaa' }}>Nenhum aluno nesta turma.</div>
                ) : roster.map(r => {
                  const pres = presencas[presKey(aula.id, r.devedorId)]
                  const fixoObj = r.tipo === 'fixo' ? fixos.find(f => f.aula_id === aula.id && f.devedor_id === r.devedorId) : null
                  const agObj = r.tipo === 'agendado' ? agendamentos.find(a => a.aula_id === aula.id && a.devedor_id === r.devedorId) : null
                  return (
                    <LinhaAluno key={r.tipo + r.devedorId}
                      r={r} pres={pres} isFuturo={isFuturo}
                      onMarcar={(presente) => handleMarcar(aula, r, presente)}
                      onAbrirEdicao={() => abrirModal(aula, r.devedorId, r.devedores)}
                      onRemove={
                        fixoObj ? (e) => { e.stopPropagation(); onRemoverFixo(fixoObj) }
                        : agObj ? (e) => { e.stopPropagation(); setConfirmCancelAg(agObj) }
                        : null
                      }
                    />
                  )
                })}

                <FilaEspera fila={fila} />
              </div>
            )
          })}
        </div>
      )}

      {/* Modal de presença */}
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
          // Aluno individual ganha botão "Remover horário" dentro do modal
          onRemoverSlot={modalCtx.aula?.devedor_id ? handleRemoverSlot : undefined}
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
