import { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from './supabaseClient'
import { Icon } from '@iconify/react'
import { SkeletonList } from './components/Skeleton'
import { showToast } from './Toast'
import ConfirmModal from './ConfirmModal'
import useWindowSize from './hooks/useWindowSize'
import { useUser } from './contexts/UserContext'
import AgendaPresencaModal from './AgendaPresencaModal'
import AgendaSlotNovoModal from './AgendaSlotNovoModal'
import {
  DIAS_CURTO, MESES,
  isoDate, parseISO, addDias, inicioSemana
} from './agendaUtils'
import { marcarPresencaRapida } from './agendaActions'

// ==========================================
// Modo "Personal" — view focada em aulas individuais (capacidade = 1).
// Layout: dias da semana nas colunas, horários nas linhas, célula = aluno do slot.
// Filtra: só mostra `aulas` com capacidade = 1.
// Click numa célula vazia: cria slot (aula cap=1 + fixo).
// Click numa célula com aluno: abre modal de presença.
// ==========================================

const COR = '#344848'
const presKey = (data, aulaId, devedorId) => `${data}_${aulaId}_${devedorId}`

export default function AgendaPersonal({
  enviarNotifPresenca, dataSel, setDataSel,
  creditos, onCredito
}) {
  const { isMobile } = useWindowSize()
  const { userId } = useUser()
  const hojeRef = useMemo(() => isoDate(new Date()), [])

  const semana = useMemo(() => {
    const ini = inicioSemana(dataSel)
    return Array.from({ length: 7 }, (_, i) => addDias(ini, i))
  }, [dataSel])
  const iniSem = semana[0], fimSem = semana[6]

  const [aulasInd, setAulasInd] = useState([])
  const [fixos, setFixos] = useState([])
  const [clientes, setClientes] = useState([])
  const [presencas, setPresencas] = useState({})
  const [loading, setLoading] = useState(true)

  const [novoSlot, setNovoSlot] = useState(null)        // { data, diaSemana, horario }
  const [presencaCtx, setPresencaCtx] = useState(null)  // { aula, devedorId, devedores, data }
  const [confirmRemover, setConfirmRemover] = useState(null) // { aula, fixo, dia, hora }

  const carregar = useCallback(async () => {
    if (!userId) return
    setLoading(true)
    const [aulasRes, fixosRes, presRes, clientesRes] = await Promise.all([
      supabase.from('aulas')
        .select('*')
        // Isola Agenda Nova: aulas com devedor_id setado pertencem ao novo modelo
        // de "aluno individual" e não devem aparecer no modo Individual antigo.
        .eq('user_id', userId).eq('capacidade', 1).eq('ativo', true)
        .is('devedor_id', null)
        .order('horario'),
      supabase.from('aulas_fixos')
        .select('*, devedores(nome, telefone, foto_url, lixo)')
        .eq('user_id', userId),
      supabase.from('presencas')
        .select('*').eq('user_id', userId).gte('data', iniSem).lte('data', fimSem).not('aula_id', 'is', null),
      supabase.from('devedores')
        .select('id, nome, telefone')
        .eq('user_id', userId)
        .or('lixo.is.null,lixo.eq.false')
        .order('nome')
    ])
    setAulasInd(aulasRes.data || [])
    // Mantem só fixos vinculados a aulas individuais e devedor não-lixo
    const aulasIds = new Set((aulasRes.data || []).map(a => a.id))
    setFixos((fixosRes.data || []).filter(f =>
      aulasIds.has(f.aula_id) && f.ativo !== false && !f.devedores?.lixo
    ))
    const m = {}
    ;(presRes.data || []).forEach(p => {
      if (p.aula_id && p.devedor_id) m[presKey(p.data, p.aula_id, p.devedor_id)] = p
    })
    setPresencas(m)
    setClientes(clientesRes.data || [])
    setLoading(false)
  }, [userId, iniSem, fimSem])

  useEffect(() => { carregar() }, [carregar])

  // Faixa de slots (linhas) em "HH:MM".
  // Granularidade base 30min, com inserção dos minutos exatos das aulas existentes
  // (suporta :15, :45 ou outros valores customizados). Fallback 07:00–21:00 se vazio.
  const slots = useMemo(() => {
    const horariosAulas = []
    aulasInd.forEach(a => {
      if (!a.horario) return
      const [h, m] = a.horario.split(':').map(Number)
      horariosAulas.push(h * 60 + m)
    })
    let minMin, maxMin
    if (horariosAulas.length === 0) { minMin = 7 * 60; maxMin = 21 * 60 }
    else { minMin = Math.min(...horariosAulas); maxMin = Math.max(...horariosAulas) }

    // Slots de 30min entre min e max + os minutos exatos das aulas (Set evita duplicata)
    const setMin = new Set()
    const inicio = Math.floor(minMin / 30) * 30
    const fim    = Math.ceil(maxMin / 30) * 30
    for (let m = inicio; m <= fim; m += 30) setMin.add(m)
    horariosAulas.forEach(m => setMin.add(m))

    return Array.from(setMin).sort((a, b) => a - b).map(m => {
      const h = Math.floor(m / 60)
      const mm = m % 60
      return `${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}`
    })
  }, [aulasInd])

  // Map de aulas por (dia_semana, slot "HH:MM")
  const aulaDoSlot = useCallback((diaSemana, slotHHMM) => {
    return aulasInd.find(a =>
      a.dia_semana === diaSemana &&
      (a.horario || '').substring(0, 5) === slotHHMM
    )
  }, [aulasInd])

  // Fixo da aula
  const fixoDe = useCallback((aulaId) => {
    return fixos.find(f => f.aula_id === aulaId)
  }, [fixos])

  // Click em célula
  const handleClickCelula = (data, slotHHMM) => {
    const dObj = parseISO(data)
    const diaSemana = dObj.getDay()
    const aula = aulaDoSlot(diaSemana, slotHHMM)

    if (!aula) {
      // Slot vazio — abre modal de criar (horario formato HH:MM:SS)
      const horario = `${slotHHMM}:00`
      setNovoSlot({ data, diaSemana, horario })
      return
    }

    const fixo = fixoDe(aula.id)
    if (!fixo) {
      // Aula existe mas sem aluno — abre modal de criar pra adicionar
      setNovoSlot({ data, diaSemana: aula.dia_semana, horario: aula.horario, aulaExistente: aula })
      return
    }

    // Tem aluno — abre modal de presença
    if (data > hojeRef) return  // futuro: não permite marcar presença ainda
    setPresencaCtx({ aula, devedorId: fixo.devedor_id, devedores: fixo.devedores, data })
  }

  const handlePresencaChange = ({ presenca, novoCredito, removida }) => {
    if (!presencaCtx) return
    const key = presKey(presencaCtx.data, presencaCtx.aula.id, presencaCtx.devedorId)
    setPresencas(prev => {
      const n = { ...prev }
      if (removida) delete n[key]
      else n[key] = presenca
      return n
    })
    if (novoCredito !== undefined) onCredito(presencaCtx.devedorId, novoCredito)
  }

  const handleSlotCriado = ({ aula, fixo }) => {
    if (aula) setAulasInd(prev => [...prev, aula])
    if (fixo) setFixos(prev => [...prev, fixo])
  }

  // Marca/troca presença/falta direto pelo botão da célula (sem abrir modal).
  // Cria a presença se não existir; se existir, faz UPDATE e ajusta crédito conforme transição.
  const marcarRapido = async (aula, fixo, data, presente) => {
    if (data > hojeRef) return
    const key = presKey(data, aula.id, fixo.devedor_id)
    const existente = presencas[key]
    if (existente && existente.presente === presente) return // já tá marcado igual

    if (!existente) {
      const res = await marcarPresencaRapida({
        aula, devedorId: fixo.devedor_id, devedores: fixo.devedores,
        data, userId, credito: creditos[fixo.devedor_id],
        enviarNotifPresenca, presente
      })
      if (res.ok) {
        setPresencas(prev => ({ ...prev, [key]: res.presenca }))
        if (res.novoCredito !== undefined) onCredito(fixo.devedor_id, res.novoCredito)
      }
      return
    }

    // Atualiza presença existente
    const { data: updated, error } = await supabase.from('presencas')
      .update({ presente, updated_at: new Date().toISOString() })
      .eq('id', existente.id).select()
    if (error) { showToast('Erro ao atualizar: ' + error.message, 'error'); return }

    // Ajusta crédito conforme transição (presente→falta devolve, falta→presente consome)
    const credito = creditos[fixo.devedor_id]
    if (credito) {
      let novo = credito.aulas_restantes
      if (existente.presente && !presente) novo = novo + 1
      else if (!existente.presente && presente) novo = Math.max(novo - 1, 0)
      if (novo !== credito.aulas_restantes) {
        await supabase.from('devedores').update({ aulas_restantes: novo }).eq('id', fixo.devedor_id)
        onCredito(fixo.devedor_id, novo)
      }
    }

    showToast(presente ? 'Presença registrada!' : 'Falta registrada!', 'success')
    setPresencas(prev => ({ ...prev, [key]: updated[0] }))
  }

  const handleRemoverSlot = async (aula) => {
    // Remove a aula inteira (cascade nos aulas_fixos)
    const { error } = await supabase.from('aulas').delete().eq('id', aula.id)
    if (error) { showToast('Erro ao remover: ' + error.message, 'error'); return }
    showToast('Horário removido', 'success')
    setAulasInd(prev => prev.filter(a => a.id !== aula.id))
    setFixos(prev => prev.filter(f => f.aula_id !== aula.id))
    setConfirmRemover(null)
  }

  // Navegação
  const labelSemana = (() => {
    const a0 = parseISO(iniSem), a6 = parseISO(fimSem)
    return a0.getMonth() === a6.getMonth()
      ? `${a0.getDate()} – ${a6.getDate()} de ${MESES[a6.getMonth()]}`
      : `${a0.getDate()} de ${MESES[a0.getMonth()].slice(0,3)} – ${a6.getDate()} de ${MESES[a6.getMonth()].slice(0,3)}`
  })()

  if (loading) return <div style={{ paddingTop: '12px' }}><SkeletonList count={5} /></div>

  return (
    <div>
      {/* Banner */}
      <div style={{
        backgroundColor: '#eef2ff', border: '1px solid #c7d2fe', borderRadius: '8px',
        padding: '10px 14px', marginBottom: '14px',
        fontSize: '12px', color: '#3730a3',
        display: 'flex', alignItems: 'center', gap: '8px'
      }}>
        <Icon icon="mdi:account-clock-outline" width="18" />
        <span>
          Modo <strong>Individual</strong> — 1 aluno por slot. Clique numa célula vazia
          pra adicionar. Turmas com mais alunos aparecem em <strong>Semana</strong>.
        </span>
      </div>

      {/* Navegação semana */}
      <div style={{
        border: '1px solid #eee', borderRadius: '12px', padding: '10px 16px',
        marginBottom: '12px', backgroundColor: '#fff',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px'
      }}>
        <button onClick={() => setDataSel(addDias(dataSel, -7))} style={navBtn}>
          <Icon icon="mdi:chevron-left" width="22" />
        </button>
        <div style={{ flex: 1, textAlign: 'center', fontSize: isMobile ? '14px' : '16px', fontWeight: '700', color: COR }}>
          {labelSemana}
        </div>
        <button onClick={() => setDataSel(hojeRef)}
          style={{ ...navBtn, width: 'auto', padding: '0 12px', gap: '5px', fontSize: '13px', fontWeight: '600' }}>
          <Icon icon="mdi:calendar-today" width="16" /> {!isMobile && 'Hoje'}
        </button>
        <button onClick={() => setDataSel(addDias(dataSel, 7))} style={navBtn}>
          <Icon icon="mdi:chevron-right" width="22" />
        </button>
      </div>

      {/* Mobile: faixa de 7 dias clicáveis (substitui o cabeçalho horizontal da grade) */}
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
      {(() => {
        const colunas = isMobile ? [dataSel] : semana
        const gridCols = isMobile
          ? `52px 1fr`
          : `60px repeat(7, minmax(110px, 1fr))`
        return (
      <div style={{ border: '1px solid #eee', borderRadius: '12px', overflow: 'hidden' }}>
          {/* Cabeçalho dias (só desktop; mobile usa a faixa de pills acima) */}
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
                    padding: '10px 4px', textAlign: 'center', cursor: 'pointer',
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

          {/* Linhas de horário (slots de 30 em 30 min, ou granularidade exata das aulas) */}
          {slots.map(slot => {
            // Linha da meia-hora (:30) com fonte mais discreta pra dar ritmo visual
            const isMeiaHora = slot.endsWith(':30')
            const isOutroMinuto = !slot.endsWith(':00') && !slot.endsWith(':30')
            return (
              <div key={slot} style={{
                display: 'grid', gridTemplateColumns: gridCols,
                borderBottom: '1px solid #f3f4f6'
              }}>
                <div style={{
                  fontSize: '12px',
                  color: isOutroMinuto ? '#4338ca' : (isMeiaHora ? '#aaa' : '#666'),
                  textAlign: 'center', padding: '12px 4px',
                  backgroundColor: '#fafafa',
                  fontWeight: isOutroMinuto ? '700' : (isMeiaHora ? '500' : '600')
                }}>
                  {slot}
                </div>
                {colunas.map(d => {
                  const dObj = parseISO(d)
                  const diaSemana = dObj.getDay()
                  const aula = aulaDoSlot(diaSemana, slot)
                  const fixo = aula ? fixoDe(aula.id) : null
                  const pres = (aula && fixo) ? presencas[presKey(d, aula.id, fixo.devedor_id)] : null
                  const isFuturo = d > hojeRef
                  const sel = d === dataSel

                  return (
                    <Celula key={d + slot}
                      onClick={() => handleClickCelula(d, slot)}
                      onRemove={aula ? (e) => { e.stopPropagation(); setConfirmRemover({ aula, fixo }) } : null}
                      onMarcar={(aula && fixo) ? ((presente) => marcarRapido(aula, fixo, d, presente)) : null}
                      aluno={fixo?.devedores}
                      presenca={pres}
                      isFuturo={isFuturo}
                      temAula={!!aula}
                      selecionado={sel}
                    />
                  )
                })}
              </div>
            )
          })}
      </div>
      )
      })()}

      {aulasInd.length === 0 && (
        <p style={{ textAlign: 'center', fontSize: '13px', color: '#999', marginTop: '14px' }}>
          Nenhum slot individual ainda — clique em qualquer célula vazia pra criar o primeiro.
        </p>
      )}

      {/* Modais */}
      {novoSlot && (
        <AgendaSlotNovoModal
          userId={userId}
          data={novoSlot.data}
          diaSemana={novoSlot.diaSemana}
          horario={novoSlot.horario}
          clientes={clientes}
          onSaved={handleSlotCriado}
          onClose={() => setNovoSlot(null)}
        />
      )}
      {presencaCtx && (
        <AgendaPresencaModal
          userId={userId}
          aula={presencaCtx.aula}
          devedorId={presencaCtx.devedorId}
          devedores={presencaCtx.devedores}
          data={presencaCtx.data}
          presencaExistente={presencas[presKey(presencaCtx.data, presencaCtx.aula.id, presencaCtx.devedorId)]}
          credito={creditos[presencaCtx.devedorId]}
          enviarNotifPresenca={enviarNotifPresenca}
          onChange={handlePresencaChange}
          onClose={() => setPresencaCtx(null)}
        />
      )}
      <ConfirmModal
        isOpen={!!confirmRemover}
        onClose={() => setConfirmRemover(null)}
        onConfirm={() => handleRemoverSlot(confirmRemover.aula)}
        title="Remover horário"
        message={`Tem certeza que deseja remover este horário${confirmRemover?.fixo?.devedores?.nome ? ` de ${confirmRemover.fixo.devedores.nome.split(' ')[0]}` : ''}?`}
        confirmText="Remover"
        confirmColor="#ef4444"
      />
    </div>
  )
}

// ===== Célula =====
function Celula({ aluno, presenca, isFuturo, temAula, onClick, onRemove, onMarcar, selecionado }) {
  const bgColuna = selecionado ? '#f8f9ff' : 'transparent'
  const hoverColuna = selecionado ? '#eef2ff' : '#f9fafb'

  // Vazio
  if (!aluno) {
    return (
      <div onClick={onClick}
        style={{
          minHeight: '54px', borderLeft: '1px solid #f3f4f6',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#cbd5e1', cursor: 'pointer',
          backgroundColor: bgColuna,
          transition: 'background-color 0.15s'
        }}
        onMouseEnter={e => e.currentTarget.style.backgroundColor = hoverColuna}
        onMouseLeave={e => e.currentTarget.style.backgroundColor = bgColuna}>
        <Icon icon="mdi:plus" width="16" />
      </div>
    )
  }

  // Com aluno
  const corBg = presenca
    ? (presenca.presente ? '#f0fdf4' : '#fef2f2')
    : (isFuturo ? '#eef2ff' : '#fffbeb')
  const corBorda = presenca
    ? (presenca.presente ? '#86efac' : '#fca5a5')
    : (isFuturo ? '#c7d2fe' : '#fde68a')
  const corTexto = presenca
    ? (presenca.presente ? '#15803d' : '#b91c1c')
    : (isFuturo ? '#3730a3' : '#92400e')

  const nome = aluno.nome || 'Aluno'
  const primeiroNome = nome.split(' ')[0]

  const btnAcao = {
    background: 'none', border: 'none', cursor: 'pointer',
    padding: '2px', borderRadius: '4px',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    transition: 'background-color 0.12s'
  }

  return (
    <div onClick={onClick}
      style={{
        minHeight: '54px', borderLeft: '1px solid #f3f4f6', padding: '4px',
        cursor: 'pointer', position: 'relative',
        backgroundColor: bgColuna
      }}>
      <div style={{
        backgroundColor: corBg, borderLeft: `3px solid ${corBorda}`,
        borderRadius: '5px', padding: '4px 5px',
        display: 'flex', alignItems: 'center', gap: '3px',
        height: '100%', boxSizing: 'border-box'
      }}>
        {/* Nome (trunca) */}
        <div style={{
          minWidth: 0, flex: 1,
          fontSize: '11px', fontWeight: '600', color: corTexto,
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'
        }}>
          {primeiroNome}
        </div>

        {/* Ações inline */}
        {!isFuturo && onMarcar && (
          <>
            <button onClick={(e) => { e.stopPropagation(); onMarcar(true) }}
              title="Marcar presença" style={btnAcao}
              onMouseEnter={e => e.currentTarget.style.backgroundColor = '#dcfce7'}
              onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}>
              <Icon icon="mdi:thumb-up" width="13"
                style={{ color: presenca?.presente ? '#15803d' : '#9ca3af' }} />
            </button>
            <button onClick={(e) => { e.stopPropagation(); onMarcar(false) }}
              title="Marcar falta" style={btnAcao}
              onMouseEnter={e => e.currentTarget.style.backgroundColor = '#fee2e2'}
              onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}>
              <Icon icon="mdi:thumb-down" width="13"
                style={{ color: (presenca && !presenca.presente) ? '#b91c1c' : '#9ca3af' }} />
            </button>
          </>
        )}
        {onRemove && (
          <button onClick={onRemove} title="Remover horário" style={btnAcao}
            onMouseEnter={e => e.currentTarget.style.backgroundColor = '#fee2e2'}
            onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}>
            <Icon icon="mdi:close" width="12" style={{ color: '#ef4444' }} />
          </button>
        )}
      </div>
    </div>
  )
}

const navBtn = {
  height: '36px', minWidth: '36px', borderRadius: '8px', flexShrink: 0,
  border: '1px solid #e5e7eb', backgroundColor: '#fff', color: '#344848',
  cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center'
}
