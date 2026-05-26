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
  isoDate, parseISO, addDias, inicioSemana, montarRoster, horaDe, corDaAula, iniciaisDe
} from './agendaUtils'
import { cancelarAgendamento, marcarPresencaRapida } from './agendaActions'
import { StatCard, AcoesAula, LinhaAluno, FilaEspera, BotaoAdicionarAluno, MenuTurma } from './AgendaPartes'

// ==========================================
// Layout Semana — grade 7 dias × horários (estilo Google Agenda).
// Clicar num bloco abre o elenco daquela aula naquela data, com as
// mesmas ações da view Dia (1-tap presença, +fixo, cancelar agendamento, etc.).
// ==========================================

const COR = '#344848'
const presKey3 = (data, aulaId, devedorId) => `${data}_${aulaId}_${devedorId}`

export default function AgendaSemana({
  enviarNotifPresenca, dataSel, setDataSel,
  aulas, fixos, creditos, onCredito, versao,
  onEditarAula, onToggleAtivoAula, onExcluirAula, onAddFixo, onRemoverFixo
}) {
  const { isMobile } = useWindowSize()
  const { userId } = useUser()

  const hojeRef = useMemo(() => isoDate(new Date()), [])
  const semana = useMemo(() => {
    const ini = inicioSemana(dataSel)
    return Array.from({ length: 7 }, (_, i) => addDias(ini, i))
  }, [dataSel])
  const iniSem = semana[0]
  const fimSem = semana[6]

  const [agendamentos, setAgendamentos] = useState([])
  const [ausencias, setAusencias] = useState([])
  const [presencas, setPresencas] = useState({}) // { presKey3: presenca }
  const [listaEspera, setListaEspera] = useState([])
  const [loadingSemana, setLoadingSemana] = useState(false)
  const [detalhe, setDetalhe] = useState(null) // { aula, data }
  const [modalCtx, setModalCtx] = useState(null) // { aula, devedorId, devedores, data }
  const [confirmCancelAg, setConfirmCancelAg] = useState(null)

  const carregarSemana = useCallback(async () => {
    if (!userId) return
    setLoadingSemana(true)
    const [agRes, ausRes, presRes, filaRes] = await Promise.all([
      supabase.from('agendamentos')
        .select('*, devedores(nome, telefone, foto_url, origem, assinatura_ativa, plano_id)')
        .eq('user_id', userId).gte('data', iniSem).lte('data', fimSem).eq('status', 'confirmado'),
      supabase.from('ausencias_fixos')
        .select('aula_id, devedor_id, data, motivo').eq('user_id', userId).gte('data', iniSem).lte('data', fimSem),
      supabase.from('presencas')
        .select('*').eq('user_id', userId).gte('data', iniSem).lte('data', fimSem).not('aula_id', 'is', null),
      supabase.from('lista_espera')
        .select('*, devedores(nome, telefone)')
        .eq('user_id', userId).gte('data', iniSem).lte('data', fimSem).eq('status', 'aguardando').order('posicao')
    ])
    setAgendamentos(agRes.data || [])
    setAusencias(ausRes.data || [])
    const m = {}
    ;(presRes.data || []).forEach(p => { if (p.aula_id && p.devedor_id) m[presKey3(p.data, p.aula_id, p.devedor_id)] = p })
    setPresencas(m)
    setListaEspera(filaRes.data || [])
    setLoadingSemana(false)
  }, [userId, iniSem, fimSem])

  useEffect(() => { carregarSemana() }, [carregarSemana, versao])

  // --- faixa de horas e grade ---
  const horas = useMemo(() => {
    let min = 23, max = 0
    aulas.forEach(a => { const h = horaDe(a.horario); if (h < min) min = h; if (h > max) max = h })
    if (aulas.length === 0 || min > max) { min = 7; max = 21 }
    const r = []
    for (let h = min; h <= max; h++) r.push(h)
    return r
  }, [aulas])

  const gridMap = useMemo(() => {
    const m = {}
    aulas.forEach(a => {
      const k = `${a.dia_semana}_${horaDe(a.horario)}`
      ;(m[k] = m[k] || []).push(a)
    })
    Object.values(m).forEach(arr => arr.sort((x, y) => (x.horario || '').localeCompare(y.horario || '')))
    return m
  }, [aulas])

  const statusAula = useCallback((aula, data) => {
    const roster = montarRoster(aula.id, data, fixos, agendamentos, ausencias)
    const marcadas = roster.filter(r => presencas[presKey3(data, aula.id, r.devedorId)]).length
    const pendente = data <= hojeRef && roster.length > 0 && marcadas < roster.length
    return { ocupadas: roster.length, marcadas, pendente, roster }
  }, [fixos, agendamentos, ausencias, presencas, hojeRef])

  // resumo da semana (para os stat cards no topo)
  const resumo = useMemo(() => {
    let alunos = 0, marcadas = 0
    const devSet = new Set()
    semana.forEach(d => {
      const dow = parseISO(d).getDay()
      const aulasDia = aulas.filter(a => a.dia_semana === dow)
      aulasDia.forEach(aula => {
        const roster = montarRoster(aula.id, d, fixos, agendamentos, ausencias)
        alunos += roster.length
        roster.forEach(r => {
          if (presencas[presKey3(d, aula.id, r.devedorId)]) marcadas++
          devSet.add(r.devedorId)
        })
      })
    })
    let creditosBaixos = 0
    devSet.forEach(id => { if (creditos[id] && creditos[id].aulas_restantes <= 2) creditosBaixos++ })
    return { aulas: aulas.length, alunos, marcadas, creditosBaixos }
  }, [semana, aulas, fixos, agendamentos, ausencias, presencas, creditos])

  // --- handlers do detalhe ---
  const detalheRoster = detalhe ? statusAula(detalhe.aula, detalhe.data).roster : []
  const detalheIsFuturo = detalhe ? (detalhe.data > hojeRef) : false

  const abrirPresencaModal = (aula, r, data) => {
    if (data > hojeRef) return
    setModalCtx({ aula, devedorId: r.devedorId, devedores: r.devedores, data })
  }

  const handleMarcarDetalhe = async (aula, r, data, presente) => {
    if (data > hojeRef) return
    const res = await marcarPresencaRapida({
      aula, devedorId: r.devedorId, devedores: r.devedores,
      data, userId, credito: creditos[r.devedorId], enviarNotifPresenca, presente
    })
    if (res.ok) {
      setPresencas(prev => ({ ...prev, [presKey3(data, aula.id, r.devedorId)]: res.presenca }))
      if (res.novoCredito !== undefined) onCredito(r.devedorId, res.novoCredito)
    }
  }

  const handlePresencaChange = ({ presenca, novoCredito, removida }) => {
    if (!modalCtx) return
    const key = presKey3(modalCtx.data, modalCtx.aula.id, modalCtx.devedorId)
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

  // rótulo da semana
  const a0 = parseISO(iniSem), a6 = parseISO(fimSem)
  const labelSemana = a0.getMonth() === a6.getMonth()
    ? `${a0.getDate()} – ${a6.getDate()} de ${MESES[a6.getMonth()]}`
    : `${a0.getDate()} de ${MESES[a0.getMonth()].slice(0, 3)} – ${a6.getDate()} de ${MESES[a6.getMonth()].slice(0, 3)}`

  const colW = isMobile ? '104px' : 'minmax(120px, 1fr)'

  return (
    <div>
      {/* Stats */}
      {aulas.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px', marginBottom: '14px' }}>
          <StatCard icon="mdi:calendar-clock" cor="#4338ca" bg="#eef2ff" label="Aulas" valor={resumo.aulas} />
          <StatCard icon="mdi:check-circle-outline" cor="#16a34a" bg="#f0fdf4" label="Presenças (semana)" valor={`${resumo.marcadas}/${resumo.alunos}`} />
          <StatCard icon="mdi:alert-circle-outline" cor={resumo.creditosBaixos > 0 ? '#d97706' : '#9ca3af'} bg={resumo.creditosBaixos > 0 ? '#fffbeb' : '#f8f9fa'} label="Créditos baixos" valor={resumo.creditosBaixos} />
        </div>
      )}

      {/* Navegação semana */}
      <div style={{
        border: '1px solid #eee', borderRadius: '12px', padding: isMobile ? '10px 12px' : '10px 16px',
        marginBottom: '12px', backgroundColor: '#fff',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px'
      }}>
        <button onClick={() => setDataSel(addDias(dataSel, -7))} title="Semana anterior" style={navBtn}>
          <Icon icon="mdi:chevron-left" width="22" />
        </button>
        <div style={{ textAlign: 'center', flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: isMobile ? '14px' : '16px', fontWeight: '700', color: COR }}>{labelSemana}</div>
          <div style={{ fontSize: '12px', color: '#888' }}>{a6.getFullYear()}</div>
        </div>
        <button onClick={() => setDataSel(hojeRef)} title="Semana atual" style={{ ...navBtn, width: 'auto', padding: '0 12px', gap: '5px', fontSize: '13px', fontWeight: '600' }}>
          <Icon icon="mdi:calendar-today" width="16" /> {!isMobile && 'Hoje'}
        </button>
        <button onClick={() => setDataSel(addDias(dataSel, 7))} title="Próxima semana" style={navBtn}>
          <Icon icon="mdi:chevron-right" width="22" />
        </button>
      </div>

      {/* Grade */}
      {loadingSemana ? (
        <SkeletonList count={4} />
      ) : (
        <div style={{ overflowX: 'auto', border: '1px solid #eee', borderRadius: '12px' }}>
          <div style={{ minWidth: isMobile ? '780px' : 'auto' }}>
            <div style={{ display: 'grid', gridTemplateColumns: `52px repeat(7, ${colW})`, borderBottom: '1px solid #eee' }}>
              <div style={{ backgroundColor: '#fafafa' }} />
              {semana.map(d => {
                const dObj = parseISO(d)
                const ehHoje = d === hojeRef
                const sel = d === dataSel
                return (
                  <div key={d} onClick={() => setDataSel(d)}
                    style={{
                      padding: '8px 4px', textAlign: 'center', cursor: 'pointer',
                      backgroundColor: sel ? '#eef2ff' : '#fafafa',
                      borderLeft: '1px solid #f0f0f0'
                    }}>
                    <div style={{ fontSize: '11px', fontWeight: '600', color: ehHoje ? '#16a34a' : '#888' }}>
                      {DIAS_CURTO[dObj.getDay()]}
                    </div>
                    <div style={{
                      fontSize: '15px', fontWeight: '700', color: ehHoje ? '#16a34a' : '#1a1a1a',
                      width: '26px', height: '26px', lineHeight: '26px', margin: '2px auto 0', borderRadius: '50%',
                      backgroundColor: ehHoje ? '#dcfce7' : 'transparent'
                    }}>
                      {dObj.getDate()}
                    </div>
                  </div>
                )
              })}
            </div>

            {horas.map(h => (
              <div key={h} style={{ display: 'grid', gridTemplateColumns: `52px repeat(7, ${colW})`, borderBottom: '1px solid #f3f4f6' }}>
                <div style={{
                  fontSize: '11px', color: '#aaa', textAlign: 'right', padding: '6px 8px 0 0',
                  backgroundColor: '#fafafa'
                }}>{String(h).padStart(2, '0')}h</div>
                {semana.map(d => {
                  const dObj = parseISO(d)
                  const blocos = gridMap[`${dObj.getDay()}_${h}`] || []
                  const sel = d === dataSel
                  return (
                    <div key={d} style={{
                      borderLeft: '1px solid #f3f4f6', minHeight: '46px', padding: '3px',
                      display: 'flex', flexDirection: 'column', gap: '3px',
                      backgroundColor: sel ? '#f8f9ff' : '#fff'
                    }}>
                      {blocos.map(aula => {
                        const cor = corDaAula(aula.descricao)
                        const st = statusAula(aula, d)
                        return (
                          <div key={aula.id} onClick={() => setDetalhe({ aula, data: d })}
                            style={{
                              backgroundColor: cor.bg, borderLeft: `3px solid ${cor.border}`,
                              borderRadius: '5px', padding: '3px 6px', cursor: 'pointer',
                              opacity: aula.ativo ? 1 : 0.55
                            }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '4px' }}>
                              <div style={{ fontSize: '11px', fontWeight: '700', color: cor.text }}>
                                {aula.horario?.substring(0, 5)}
                              </div>
                              {aula.colaboradores?.nome && (
                                <div title={`Prof. ${aula.colaboradores.nome}`}
                                  style={{
                                    height: '18px', padding: '0 6px',
                                    borderRadius: '9px', backgroundColor: '#344848', color: '#fff',
                                    fontSize: '10px', fontWeight: '700',
                                    lineHeight: '18px', textAlign: 'center',
                                    display: 'inline-block', flexShrink: 0
                                  }}>
                                  {iniciaisDe(aula.colaboradores.nome)}
                                </div>
                              )}
                            </div>
                            {aula.descricao && (
                              <div style={{ fontSize: '10px', color: cor.text, opacity: 0.85, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                {aula.descricao}
                              </div>
                            )}
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '10px', color: cor.text, opacity: 0.75 }}>
                              <span>{st.ocupadas}/{aula.capacidade}</span>
                              {st.pendente
                                ? <Icon icon="mdi:alert-circle" width="12" style={{ color: '#f59e0b' }} />
                                : st.ocupadas > 0 && st.marcadas === st.ocupadas
                                  ? <Icon icon="mdi:check-circle" width="12" style={{ color: '#16a34a' }} />
                                  : null}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )
                })}
              </div>
            ))}
          </div>
        </div>
      )}

      {aulas.length === 0 && !loadingSemana && (
        <p style={{ textAlign: 'center', fontSize: '13px', color: '#999', marginTop: '14px' }}>
          Nenhuma turma cadastrada — clique em "+ Nova turma" para começar.
        </p>
      )}
      {aulas.length > 0 && !loadingSemana && (
        <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap', fontSize: '11px', color: '#888', marginTop: '10px' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <Icon icon="mdi:alert-circle" width="13" style={{ color: '#f59e0b' }} /> presença pendente
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <Icon icon="mdi:check-circle" width="13" style={{ color: '#16a34a' }} /> todas marcadas
          </span>
          <span>Clique num bloco para ver alunos e marcar presença.</span>
        </div>
      )}

      {/* ===== Modal Detalhe da Aula ===== */}
      {detalhe && (() => {
        const { aula, data } = detalhe
        const dObj = parseISO(data)
        const fila = listaEspera.filter(f => f.aula_id === aula.id && f.data === data)
        const ocupadas = detalheRoster.length
        const marcadas = detalheRoster.filter(r => presencas[presKey3(data, aula.id, r.devedorId)]).length
        return (
          <div onClick={e => { if (e.target === e.currentTarget) setDetalhe(null) }}
            style={{
              position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 10000,
              backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center',
              justifyContent: 'center', padding: '20px'
            }}>
            <div style={{ backgroundColor: 'white', borderRadius: '16px', width: '100%', maxWidth: '460px', maxHeight: '85vh', display: 'flex', flexDirection: 'column' }}>
              <div style={{ padding: '16px 18px 14px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '6px' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '15px', fontWeight: '700', color: '#1a1a1a' }}>
                      {aula.horario?.substring(0, 5)}{aula.descricao ? ` · ${aula.descricao}` : ''}
                    </div>
                    <div style={{ fontSize: '12px', color: '#888', marginTop: '2px' }}>
                      {DIAS_LONGO[dObj.getDay()]}, {dObj.getDate()} de {MESES[dObj.getMonth()]}
                      {aula.colaboradores?.nome && <span style={{ color: '#4338ca', fontWeight: '600' }}> · Prof. {aula.colaboradores.nome}</span>}
                      {' · '}{ocupadas}/{aula.capacidade} vagas
                      {marcadas > 0 && <span style={{ color: '#16a34a', fontWeight: '600' }}> · {marcadas} marcada(s)</span>}
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '2px', flexShrink: 0 }}>
                    <MenuTurma aula={aula}
                      onToggle={() => onToggleAtivoAula(aula)}
                      onEdit={() => { onEditarAula(aula); setDetalhe(null) }}
                      onDelete={() => { onExcluirAula(aula); setDetalhe(null) }} />
                    <button onClick={() => setDetalhe(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px' }}>
                      <Icon icon="mdi:close" width="20" style={{ color: '#999' }} />
                    </button>
                  </div>
                </div>
                <div style={{ marginTop: '14px' }}>
                  <BotaoAdicionarAluno onClick={() => { onAddFixo(aula, data); setDetalhe(null) }} />
                </div>
              </div>

              <div style={{ overflowY: 'auto', padding: '4px 0' }}>
                {detalheRoster.length === 0 ? (
                  <div style={{ padding: '24px 18px', fontSize: '13px', color: '#aaa', textAlign: 'center' }}>
                    Nenhum aluno nesta turma.
                  </div>
                ) : detalheRoster.map(r => {
                  const pres = presencas[presKey3(data, aula.id, r.devedorId)]
                  const fixoObj = r.tipo === 'fixo' ? fixos.find(f => f.aula_id === aula.id && f.devedor_id === r.devedorId) : null
                  const agObj = r.tipo === 'agendado' ? agendamentos.find(a => a.aula_id === aula.id && a.devedor_id === r.devedorId && a.data === data) : null
                  return (
                    <LinhaAluno key={r.tipo + r.devedorId}
                      r={r} pres={pres} isFuturo={detalheIsFuturo}
                      onMarcar={(presente) => handleMarcarDetalhe(aula, r, data, presente)}
                      onAbrirEdicao={() => abrirPresencaModal(aula, r, data)}
                      onRemove={
                        fixoObj ? (e) => { e.stopPropagation(); onRemoverFixo(fixoObj); setDetalhe(null) }
                        : agObj ? (e) => { e.stopPropagation(); setConfirmCancelAg(agObj) }
                        : null
                      }
                    />
                  )
                })}
                <FilaEspera fila={fila} />
                {detalheIsFuturo && detalheRoster.length > 0 && (
                  <div style={{ padding: '10px 18px', fontSize: '11px', color: '#aaa', textAlign: 'center' }}>
                    Aula futura — a presença é marcada no dia ou depois.
                  </div>
                )}
              </div>
            </div>
          </div>
        )
      })()}

      {/* Modal de presença */}
      {modalCtx && (
        <AgendaPresencaModal
          userId={userId}
          aula={modalCtx.aula}
          devedorId={modalCtx.devedorId}
          devedores={modalCtx.devedores}
          data={modalCtx.data}
          presencaExistente={presencas[presKey3(modalCtx.data, modalCtx.aula.id, modalCtx.devedorId)]}
          credito={creditos[modalCtx.devedorId]}
          enviarNotifPresenca={enviarNotifPresenca}
          onChange={handlePresencaChange}
          onClose={() => setModalCtx(null)}
        />
      )}

      {/* Confirmar cancelar agendamento */}
      <ConfirmModal
        isOpen={!!confirmCancelAg}
        onClose={() => setConfirmCancelAg(null)}
        onConfirm={() => handleCancelarAg(confirmCancelAg)}
        title="Remover aluno do horário"
        message={`Tem certeza que deseja remover ${confirmCancelAg?.devedores?.nome?.split(' ')[0] || 'este aluno'} deste horário? O crédito é devolvido e o próximo da fila é notificado.`}
        confirmText="Remover"
        confirmColor="#ef4444"
      />
    </div>
  )
}

const navBtn = {
  height: '36px', minWidth: '36px', borderRadius: '8px', flexShrink: 0,
  border: '1px solid #e5e7eb', backgroundColor: '#fff', color: '#344848',
  cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center'
}
