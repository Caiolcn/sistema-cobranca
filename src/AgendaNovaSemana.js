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
import { StatCard, LinhaAluno, FilaEspera, BotaoAdicionarAluno, MenuTurma } from './AgendaPartes'
import { AvatarStack } from './AgendaNovaPartes'

// ==========================================
// AgendaNovaSemana — fork de AgendaSemana para a Agenda Nova.
// Diferença chave: além dos blocos de TURMA, renderiza blocos de
// ALUNO INDIVIDUAL (aulas com `devedor_id` setado).
//
// - Bloco TURMA: comportamento idêntico ao da Semana atual (abre modal
//   de detalhe com roster, fila de espera, etc.)
// - Bloco ALUNO: card simplificado mostrando nome do aluno e status de
//   presença. Click → abre AgendaPresencaModal direto (sem detalhe).
//   Botão × inline → confirma e remove o slot do aluno (delete na aula).
// ==========================================

const COR = '#344848'
const presKey3 = (data, aulaId, devedorId) => `${data}_${aulaId}_${devedorId}`

export default function AgendaNovaSemana({
  enviarNotifPresenca, dataSel, setDataSel,
  aulas, fixos, creditos, onCredito, versao,
  onEditarAula, onToggleAtivoAula, onExcluirAula, onAddFixo, onRemoverFixo,
  onRemoverAluno
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
  const [presencas, setPresencas] = useState({})
  const [listaEspera, setListaEspera] = useState([])
  const [loadingSemana, setLoadingSemana] = useState(false)
  const [detalhe, setDetalhe] = useState(null)        // { aula, data } — só turmas
  const [modalCtx, setModalCtx] = useState(null)      // { aula, devedorId, devedores, data }
  const [confirmCancelAg, setConfirmCancelAg] = useState(null)
  const [confirmRemAluno, setConfirmRemAluno] = useState(null) // aula (individual) a remover

  // Separa aulas por tipo (turma vs aluno individual)
  const aulasTurma  = useMemo(() => aulas.filter(a => !a.devedor_id), [aulas])
  const aulasAluno  = useMemo(() => aulas.filter(a => !!a.devedor_id), [aulas])

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
  // Considera turmas E alunos individuais para determinar o range de horas.
  const horas = useMemo(() => {
    let min = 23, max = 0
    aulas.forEach(a => { const h = horaDe(a.horario); if (h < min) min = h; if (h > max) max = h })
    if (aulas.length === 0 || min > max) { min = 7; max = 21 }
    const r = []
    for (let h = min; h <= max; h++) r.push(h)
    return r
  }, [aulas])

  // Grid de turmas: key=(dia_semana, hora)
  const gridTurmas = useMemo(() => {
    const m = {}
    aulasTurma.forEach(a => {
      const k = `${a.dia_semana}_${horaDe(a.horario)}`
      ;(m[k] = m[k] || []).push(a)
    })
    Object.values(m).forEach(arr => arr.sort((x, y) => (x.horario || '').localeCompare(y.horario || '')))
    return m
  }, [aulasTurma])

  // Grid de alunos individuais
  const gridAlunos = useMemo(() => {
    const m = {}
    aulasAluno.forEach(a => {
      const k = `${a.dia_semana}_${horaDe(a.horario)}`
      ;(m[k] = m[k] || []).push(a)
    })
    Object.values(m).forEach(arr => arr.sort((x, y) => (x.horario || '').localeCompare(y.horario || '')))
    return m
  }, [aulasAluno])

  const statusAula = useCallback((aula, data) => {
    const roster = montarRoster(aula.id, data, fixos, agendamentos, ausencias)
    const marcadas = roster.filter(r => presencas[presKey3(data, aula.id, r.devedorId)]).length
    const pendente = data <= hojeRef && roster.length > 0 && marcadas < roster.length
    return { ocupadas: roster.length, marcadas, pendente, roster }
  }, [fixos, agendamentos, ausencias, presencas, hojeRef])

  // Resumo: conta turmas + alunos individuais; alunos contam como 1 vaga ocupada.
  const resumo = useMemo(() => {
    let alunos = 0, marcadas = 0
    const devSet = new Set()
    semana.forEach(d => {
      const dow = parseISO(d).getDay()
      // Turmas
      aulasTurma.filter(a => a.dia_semana === dow).forEach(aula => {
        const roster = montarRoster(aula.id, d, fixos, agendamentos, ausencias)
        alunos += roster.length
        roster.forEach(r => {
          if (presencas[presKey3(d, aula.id, r.devedorId)]) marcadas++
          devSet.add(r.devedorId)
        })
      })
      // Alunos individuais
      aulasAluno.filter(a => a.dia_semana === dow).forEach(aula => {
        alunos += 1
        if (presencas[presKey3(d, aula.id, aula.devedor_id)]) marcadas++
        devSet.add(aula.devedor_id)
      })
    })
    let creditosBaixos = 0
    devSet.forEach(id => { if (creditos[id] && creditos[id].aulas_restantes <= 2) creditosBaixos++ })
    return { aulas: aulas.length, alunos, marcadas, creditosBaixos }
  }, [semana, aulas, aulasTurma, aulasAluno, fixos, agendamentos, ausencias, presencas, creditos])

  // --- handlers do detalhe (turma) ---
  const detalheRoster = detalhe ? statusAula(detalhe.aula, detalhe.data).roster : []
  const detalheIsFuturo = detalhe ? (detalhe.data > hojeRef) : false

  const abrirPresencaModal = (aula, r, data) => {
    if (data > hojeRef) return
    setModalCtx({ aula, devedorId: r.devedorId, devedores: r.devedores, data })
  }

  // Click no bloco do aluno individual → abre presença/ações
  // Não restringe futuro: o modal traz "Remover horário" como ação acessível
  // mesmo pra slots futuros (caso o usuário queira limpar um agendamento).
  const abrirPresencaAluno = (aula, data) => {
    setModalCtx({ aula, devedorId: aula.devedor_id, devedores: aula.devedores, data })
  }

  // Acionado pelo botão "Remover horário do aluno" dentro do modal de presença.
  // Fecha o modal e abre o ConfirmModal de remoção.
  const handleRemoverSlot = () => {
    if (!modalCtx?.aula) return
    const aulaToRemove = modalCtx.aula
    setModalCtx(null)
    setConfirmRemAluno(aulaToRemove)
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

  // Mobile mostra só o dia selecionado
  const colunas = isMobile ? [dataSel] : semana
  const colW = isMobile ? '1fr' : 'minmax(120px, 1fr)'
  const gridCols = isMobile ? `52px 1fr` : `52px repeat(7, ${colW})`

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

      {/* Mobile: faixa de 7 dias clicáveis */}
      {isMobile && (
        <div style={{ display: 'flex', gap: '3px', marginBottom: '12px' }}>
          {semana.map(d => {
            const dObj = parseISO(d)
            const sel = d === dataSel
            const ehHoje = d === hojeRef
            return (
              <button key={d} onClick={() => setDataSel(d)}
                style={{
                  flex: 1, padding: '6px 2px', borderRadius: '9px', cursor: 'pointer',
                  border: ehHoje && !sel ? `1px solid ${COR}` : '1px solid transparent',
                  backgroundColor: sel ? COR : '#f3f4f6', color: sel ? '#fff' : '#444',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px', transition: 'all 0.15s'
                }}>
                <span style={{ fontSize: '10px', fontWeight: '600', opacity: 0.85 }}>{DIAS_CURTO[dObj.getDay()]}</span>
                <span style={{ fontSize: '14px', fontWeight: '700' }}>{dObj.getDate()}</span>
              </button>
            )
          })}
        </div>
      )}

      {/* Grade */}
      {loadingSemana ? (
        <SkeletonList count={4} />
      ) : (
        <div style={{ border: '1px solid #eee', borderRadius: '12px', overflow: 'hidden' }}>
          <div>
            {/* Cabeçalho de dias só no desktop */}
            {!isMobile && (
            <div style={{ display: 'grid', gridTemplateColumns: gridCols, borderBottom: '1px solid #eee' }}>
              <div style={{ backgroundColor: '#fafafa' }} />
              {colunas.map(d => {
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
            )}

            {horas.map(h => (
              <div key={h} style={{ display: 'grid', gridTemplateColumns: gridCols, borderBottom: '1px solid #f3f4f6' }}>
                <div style={{
                  fontSize: '11px', color: '#aaa', textAlign: 'right', padding: '6px 8px 0 0',
                  backgroundColor: '#fafafa'
                }}>{String(h).padStart(2, '0')}h</div>
                {colunas.map(d => {
                  const dObj = parseISO(d)
                  const turmas = gridTurmas[`${dObj.getDay()}_${h}`] || []
                  const alunos = gridAlunos[`${dObj.getDay()}_${h}`] || []
                  const sel = d === dataSel
                  return (
                    <div key={d} style={{
                      borderLeft: '1px solid #f3f4f6', minHeight: '46px', padding: '3px',
                      display: 'flex', flexDirection: 'column', gap: '3px',
                      backgroundColor: sel ? '#f8f9ff' : '#fff'
                    }}>
                      {/* Turmas */}
                      {turmas.map(aula => {
                        const cor = corDaAula(aula.descricao)
                        const st = statusAula(aula, d)
                        return (
                          <BlocoTurma
                            key={aula.id}
                            aula={aula}
                            cor={cor}
                            st={st}
                            onClick={() => setDetalhe({ aula, data: d })}
                          />
                        )
                      })}

                      {/* Alunos individuais */}
                      {alunos.map(aula => {
                        const pres = presencas[presKey3(d, aula.id, aula.devedor_id)]
                        const isFuturo = d > hojeRef
                        return (
                          <BlocoAluno
                            key={aula.id}
                            aula={aula}
                            pres={pres}
                            isFuturo={isFuturo}
                            onClick={() => abrirPresencaAluno(aula, d)}
                          />
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
          Nenhuma turma ou aluno ainda — clique em "+ Nova" para começar.
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
          <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <Icon icon="mdi:account-clock-outline" width="13" style={{ color: '#7c3aed' }} /> aluno individual
          </span>
        </div>
      )}

      {/* ===== Modal Detalhe da TURMA ===== */}
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

      {/* Modal de presença (turma ou aluno individual) */}
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

// ===== Bloco de TURMA (desktop) =====
// Segue a mesma estética clean do BlocoAluno:
//   • Card branco, borda fina, faixa lateral 3px colorida (cor da aula)
//   • Hover com leve elevação por shadow
//   • Footer: pilha de avatares dos alunos + ícone de status
// A cor da aula (corDaAula) deixa de pintar o card inteiro e vira só acento.
function BlocoTurma({ aula, cor, st, onClick }) {
  return (
    <div onClick={onClick}
      style={{
        backgroundColor: '#fff',
        border: '1px solid #eef0f3',
        borderLeft: `3px solid ${cor.border}`,
        borderRadius: '8px',
        padding: '5px 7px 5px 6px',
        cursor: 'pointer',
        opacity: aula.ativo ? 1 : 0.55,
        transition: 'box-shadow 0.15s ease, transform 0.15s ease'
      }}
      onMouseEnter={e => {
        e.currentTarget.style.boxShadow = '0 4px 10px rgba(15,23,42,0.08)'
        e.currentTarget.style.transform = 'translateY(-1px)'
      }}
      onMouseLeave={e => {
        e.currentTarget.style.boxShadow = 'none'
        e.currentTarget.style.transform = 'translateY(0)'
      }}>
      {/* Header: hora + professor */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '4px' }}>
        <div style={{ fontSize: '11px', fontWeight: '700', color: '#0f172a' }}>
          {aula.horario?.substring(0, 5)}
        </div>
        {aula.colaboradores?.nome && (
          <div title={`Prof. ${aula.colaboradores.nome}`}
            style={{
              height: '16px', padding: '0 6px',
              borderRadius: '8px', backgroundColor: '#344848', color: '#fff',
              fontSize: '9px', fontWeight: '700',
              lineHeight: '16px', textAlign: 'center',
              display: 'inline-block', flexShrink: 0
            }}>
            {iniciaisDe(aula.colaboradores.nome)}
          </div>
        )}
      </div>
      {/* Descrição (em cor sutil da aula, pra dar agrupamento visual) */}
      {aula.descricao && (
        <div style={{
          fontSize: '10px', color: cor.text, fontWeight: '600',
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          marginTop: '1px'
        }}>
          {aula.descricao}
        </div>
      )}
      {/* Footer linha 1: ocupação X/Y + ícone de status */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        gap: '4px', marginTop: '3px'
      }}>
        <span style={{
          fontSize: '10px', fontWeight: '700', color: cor.text,
          display: 'inline-flex', alignItems: 'center', gap: '3px'
        }}>
          <Icon icon="mdi:account-multiple-outline" width="11" style={{ opacity: 0.7 }} />
          {st.ocupadas}/{aula.capacidade}
        </span>
        {st.pendente
          ? <Icon icon="mdi:alert-circle" width="12" style={{ color: '#f59e0b', flexShrink: 0 }} />
          : st.ocupadas > 0 && st.marcadas === st.ocupadas
            ? <Icon icon="mdi:check-circle" width="12" style={{ color: '#16a34a', flexShrink: 0 }} />
            : null}
      </div>
      {/* Footer linha 2: pilha de avatares (só se houver aluno) */}
      {st.roster.length > 0 && (
        <div style={{ marginTop: '3px' }}>
          <AvatarStack roster={st.roster} max={3} capacidade={aula.capacidade} />
        </div>
      )}
    </div>
  )
}

// ===== Bloco de aluno individual (desktop) =====
// Card compacto, moderno e clean. Sem botões inline — todo o ação fica no
// modal que abre ao clicar. Visual:
//   • Avatar (foto do aluno OU iniciais em círculo discreto)
//   • Nome em destaque (1º nome, truncado)
//   • Horário · tag (linha secundária)
//   • Pequena faixa lateral colorida indicando status de presença
//   • Hover: leve elevação por sombra
function BlocoAluno({ aula, pres, isFuturo, onClick }) {
  const nome = aula.devedores?.nome || 'Aluno'
  const primeiroNome = nome.split(' ')[0]
  const foto = aula.devedores?.foto_url
  const inicial = nome.charAt(0).toUpperCase()

  // Status determina apenas o acento (faixa lateral + dot). O corpo fica
  // sempre branco pra dar essa pegada mais clean / "card" moderno.
  const status = pres
    ? (pres.presente ? 'presente' : 'falta')
    : (isFuturo ? 'futuro' : 'pendente')
  const acento = {
    presente: '#16a34a',
    falta:    '#ef4444',
    pendente: '#f59e0b',
    futuro:   '#8b5cf6'
  }[status]

  return (
    <div onClick={onClick}
      style={{
        backgroundColor: '#fff',
        border: '1px solid #eef0f3',
        borderLeft: `3px solid ${acento}`,
        borderRadius: '8px',
        padding: '5px 7px 5px 6px',
        cursor: 'pointer',
        opacity: aula.ativo ? 1 : 0.55,
        transition: 'box-shadow 0.15s ease, transform 0.15s ease, border-color 0.15s'
      }}
      onMouseEnter={e => {
        e.currentTarget.style.boxShadow = '0 4px 10px rgba(15, 23, 42, 0.08)'
        e.currentTarget.style.transform = 'translateY(-1px)'
      }}
      onMouseLeave={e => {
        e.currentTarget.style.boxShadow = 'none'
        e.currentTarget.style.transform = 'translateY(0)'
      }}>
      {/* Linha 1: avatar + nome + dot de status */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
        <div style={{
          width: '20px', height: '20px', borderRadius: '50%', flexShrink: 0,
          overflow: 'hidden',
          backgroundColor: '#eef2ff', color: '#4338ca',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '10px', fontWeight: '700'
        }}>
          {foto
            ? <img src={foto} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                onError={e => { e.target.style.display = 'none'; e.target.parentElement.textContent = inicial }} />
            : inicial}
        </div>
        <div style={{
          flex: 1, minWidth: 0,
          fontSize: '11px', fontWeight: '600', color: '#0f172a',
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'
        }}>
          {primeiroNome}
        </div>
        <div style={{
          width: '6px', height: '6px', borderRadius: '50%',
          backgroundColor: acento, flexShrink: 0
        }} />
      </div>
      {/* Linha 2: horário + descricao */}
      <div style={{
        fontSize: '10px', color: '#94a3b8',
        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        marginTop: '1px', paddingLeft: '25px'
      }}>
        {aula.horario?.substring(0, 5)}
        {aula.descricao && ` · ${aula.descricao}`}
      </div>
    </div>
  )
}

const navBtn = {
  height: '36px', minWidth: '36px', borderRadius: '8px', flexShrink: 0,
  border: '1px solid #e5e7eb', backgroundColor: '#fff', color: '#344848',
  cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center'
}
