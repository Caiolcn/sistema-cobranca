import { useState, useMemo, useEffect } from 'react'
import { supabase } from './supabaseClient'
import { Icon } from '@iconify/react'
import { showToast } from './Toast'
import { parseISO, DIAS_LONGO, DIAS_CURTO, MESES, corDaAula } from './agendaUtils'
import Select from './design-system/components/Select'
import Button from './design-system/components/Button'

// ==========================================
// Modal de adicionar aluno a uma turma
// Fixo  → grava em aulas_fixos (volta toda semana) — agora com MULTI-SELECT
//         de turmas (mesma sessão adiciona em várias turmas).
// Avulso → grava em agendamentos (só nesta data) — comportamento inalterado.
// ==========================================

const TIPOS = [
  { v: 'fixo',   label: 'Toda semana',   icon: 'mdi:calendar-sync' },
  { v: 'avulso', label: 'Só nesta data', icon: 'mdi:calendar-today' }
]

export default function AgendaFixoModal({
  userId, aula, data, clientes,
  fixosDaAula, vagasOcupadas,
  // Novos props pra multi-select
  aulas = [], fixos = [],
  onClose, onSaved
}) {
  const podeAvulso = !!data
  const [tipo, setTipo] = useState('fixo')
  const [devedorId, setDevedorId] = useState('')
  // Conjunto de aulas onde o aluno será adicionado (default: só a origem)
  const [turmasSelecionadas, setTurmasSelecionadas] = useState(new Set([aula.id]))
  // Dias expandidos na lista. Default: todos fechados — o usuário expande o que precisar.
  const [diasExpandidos, setDiasExpandidos] = useState(new Set())
  const [salvando, setSalvando] = useState(false)

  // No avulso a lista de alunos exclui quem já é fixo dessa turma
  // (avulso só faz sentido pra quem NÃO vem fixo). No fixo deixamos a lista
  // completa porque o aluno pode estar fixo em outras turmas mas não nesta.
  const opcoesAluno = useMemo(() => {
    const base = tipo === 'avulso'
      ? clientes.filter(c => !fixosDaAula.some(f => f.devedor_id === c.id))
      : clientes
    return base.map(c => ({ value: c.id, label: c.nome }))
  }, [clientes, fixosDaAula, tipo])

  // Resetar seleção se mudar de tipo (avulso só usa a origem)
  useEffect(() => {
    if (tipo === 'avulso') setTurmasSelecionadas(new Set([aula.id]))
  }, [tipo, aula.id])

  // Quando troca de aluno, reseta as turmas pra manter só a origem
  // (evita herdar marcações que podem agora estar "Já está")
  useEffect(() => {
    setTurmasSelecionadas(new Set([aula.id]))
  }, [devedorId, aula.id])

  // Apenas turmas (devedor_id null) ativas — exclui alunos individuais
  const turmasDoUsuario = useMemo(() => (
    (aulas || []).filter(a => a.ativo !== false && !a.devedor_id)
  ), [aulas])

  // Agrupa por dia da semana. Domingo no fim. Ordena por horário dentro do dia.
  const turmasPorDia = useMemo(() => {
    const ordemDias = [1, 2, 3, 4, 5, 6, 0]
    return ordemDias
      .map(d => ({
        dia: d,
        nome: DIAS_LONGO[d],
        abrev: DIAS_CURTO[d],
        turmas: turmasDoUsuario
          .filter(t => Number(t.dia_semana) === d)
          .sort((a, b) => (a.horario || '').localeCompare(b.horario || ''))
      }))
      .filter(g => g.turmas.length > 0)
  }, [turmasDoUsuario])

  const ocupacaoDe = (aulaId) => fixos.filter(f => f.aula_id === aulaId && f.ativo !== false).length
  const alunoEhFixoEm = (aulaId) => fixos.some(f => f.aula_id === aulaId && f.devedor_id === devedorId && f.ativo !== false)

  const toggleTurma = (turmaId) => {
    setTurmasSelecionadas(prev => {
      const novo = new Set(prev)
      if (novo.has(turmaId)) novo.delete(turmaId); else novo.add(turmaId)
      return novo
    })
  }

  const toggleDia = (dia) => {
    setDiasExpandidos(prev => {
      const novo = new Set(prev)
      if (novo.has(dia)) novo.delete(dia); else novo.add(dia)
      return novo
    })
  }

  const totalSelecionado = turmasSelecionadas.size
  const podeSalvar = !!devedorId && (tipo === 'avulso' || totalSelecionado > 0)

  const dataObj = podeAvulso ? parseISO(data) : null
  const dataFmt = dataObj
    ? `${DIAS_LONGO[dataObj.getDay()]}, ${dataObj.getDate()} de ${MESES[dataObj.getMonth()]}`
    : ''

  // Adiciona um único fixo (insert ou reativação). Retorna { fixo, erro }.
  const adicionarFixoEm = async (aulaId) => {
    const { data: existente } = await supabase.from('aulas_fixos')
      .select('id, ativo')
      .eq('aula_id', aulaId)
      .eq('devedor_id', devedorId)
      .maybeSingle()

    if (existente?.ativo === true) {
      return { erro: 'já era fixo' }
    }

    if (existente?.ativo === false) {
      const { data: reativado, error } = await supabase.from('aulas_fixos')
        .update({ ativo: true })
        .eq('id', existente.id)
        .select('*, devedores(nome, telefone, foto_url)')
      if (error) return { erro: error.message }
      return { fixo: reativado?.[0] }
    }

    const { data: inserted, error } = await supabase.from('aulas_fixos')
      .insert({ aula_id: aulaId, devedor_id: devedorId, user_id: userId })
      .select('*, devedores(nome, telefone, foto_url)')
    if (error) return { erro: error.message }
    return { fixo: inserted?.[0] }
  }

  const adicionar = async () => {
    if (!devedorId) return
    setSalvando(true)

    if (tipo === 'avulso') {
      // Comportamento original
      if (vagasOcupadas >= aula.capacidade) {
        showToast('Turma lotada, sem vagas disponíveis', 'warning')
        setSalvando(false); return
      }
      const { error } = await supabase.from('agendamentos').insert({
        aula_id: aula.id, devedor_id: devedorId, user_id: userId,
        data, status: 'confirmado'
      })
      setSalvando(false)
      if (error) { showToast('Erro ao adicionar aluno: ' + error.message, 'error'); return }
      showToast('Aluno adicionado nesta data!', 'success')
      onSaved?.({ tipo: 'avulso' })
      onClose()
      return
    }

    // Fixo (multi-turma)
    const ids = Array.from(turmasSelecionadas)
    const sucessos = []
    const falhas = []

    for (const aulaId of ids) {
      const t = turmasDoUsuario.find(a => a.id === aulaId)
      // Guarda de capacidade local (UI já evita, mas dupla checagem)
      if (t && ocupacaoDe(aulaId) >= t.capacidade && !alunoEhFixoEm(aulaId)) {
        falhas.push({ aulaId, label: rotuloTurma(t), motivo: 'lotada' })
        continue
      }
      const res = await adicionarFixoEm(aulaId)
      if (res.erro) {
        falhas.push({ aulaId, label: rotuloTurma(t), motivo: res.erro })
      } else if (res.fixo) {
        sucessos.push(res.fixo)
      }
    }

    setSalvando(false)

    if (sucessos.length > 0) {
      onSaved?.({ tipo: 'fixo', fixos: sucessos })
    }

    if (falhas.length === 0) {
      showToast(
        sucessos.length === 1 ? 'Aluno adicionado à turma!' : `Aluno adicionado em ${sucessos.length} turmas!`,
        'success'
      )
      onClose()
    } else if (sucessos.length === 0) {
      showToast('Nenhuma turma adicionada. ' + (falhas[0].motivo || ''), 'error')
    } else {
      showToast(`Adicionado em ${sucessos.length}. ${falhas.length} falharam.`, 'warning')
      onClose()
    }
  }

  return (
    <div onClick={e => { if (e.target === e.currentTarget) onClose() }}
      style={{
        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
        backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 10000,
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px'
      }}>
      <div style={{
        backgroundColor: 'white', borderRadius: '12px', padding: '24px',
        width: '100%', maxWidth: '480px', maxHeight: '90vh', overflowY: 'auto'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
          <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '600' }}>Adicionar aluno</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px' }}>
            <Icon icon="mdi:close" width="20" style={{ color: '#999' }} />
          </button>
        </div>
        <p style={{ margin: '0 0 16px', fontSize: '13px', color: '#888' }}>
          {tipo === 'fixo'
            ? 'Escolha o aluno e marque todas as turmas que ele frequenta.'
            : 'O aluno será adicionado apenas nesta data.'}
        </p>

        {/* Chip da turma de origem */}
        <div style={{
          padding: '10px 14px', backgroundColor: '#f8f9fa', borderRadius: '8px', marginBottom: '16px',
          fontSize: '13px', color: '#555', display: 'flex', alignItems: 'center', gap: '8px'
        }}>
          <Icon icon="mdi:clock-outline" width={14} style={{ color: '#94a3b8' }} />
          <strong>{aula.horario?.substring(0, 5)}</strong>
          {aula.descricao && <span>· {aula.descricao}</span>}
          <span style={{ marginLeft: 'auto', color: '#888' }}>
            {vagasOcupadas}/{aula.capacidade}
          </span>
        </div>

        {podeAvulso && (
          <div style={{ marginBottom: '16px' }}>
            <label style={labelStyle}>Frequência</label>
            <div style={{
              display: 'flex', gap: '4px', backgroundColor: '#f3f4f6',
              borderRadius: '10px', padding: '4px'
            }}>
              {TIPOS.map(o => (
                <button key={o.v} onClick={() => setTipo(o.v)}
                  style={{
                    flex: 1, padding: '8px 12px', borderRadius: '8px', border: 'none', cursor: 'pointer',
                    fontSize: '13px', fontWeight: tipo === o.v ? '600' : '500',
                    backgroundColor: tipo === o.v ? '#fff' : 'transparent',
                    color: tipo === o.v ? '#1a1a1a' : '#666',
                    boxShadow: tipo === o.v ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px'
                  }}>
                  <Icon icon={o.icon} width={15} /> {o.label}
                </button>
              ))}
            </div>
            {tipo === 'avulso' && (
              <div style={{ fontSize: '12px', color: '#888', marginTop: '6px' }}>
                Será adicionado apenas em <strong style={{ color: '#344848' }}>{dataFmt}</strong>.
              </div>
            )}
          </div>
        )}

        {/* Aluno */}
        <div style={{ marginBottom: '16px' }}>
          <Select
            label="Aluno"
            options={opcoesAluno}
            value={devedorId}
            onChange={(v) => setDevedorId(v || '')}
            searchable
            clearable
            portal
            placeholder="Selecionar aluno…"
            searchPlaceholder="Buscar aluno…"
            emptyMessage="Nenhum aluno encontrado"
          />
        </div>

        {/* Multi-select de turmas (só fixo + aluno escolhido) */}
        {tipo === 'fixo' && devedorId && (
          <div style={{ marginBottom: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', marginBottom: '14px' }}>
              <div>
                <label style={{ ...labelStyle, marginBottom: '2px' }}>Turmas selecionadas</label>
                <p style={{ margin: 0, fontSize: '12px', color: '#94a3b8' }}>
                  Expanda os dias para adicionar em mais turmas.
                </p>
              </div>
              <span style={{ fontSize: '12px', color: '#94a3b8', flexShrink: 0, marginTop: '2px' }}>
                {totalSelecionado} marcada{totalSelecionado === 1 ? '' : 's'}
              </span>
            </div>
            <div style={{
              maxHeight: '260px', overflowY: 'auto',
              border: '1px solid var(--neutral-200, #e2e8f0)', borderRadius: '10px'
            }}>
              {turmasPorDia.map(grupo => {
                const expandido = diasExpandidos.has(grupo.dia)
                const marcadasNoDia = grupo.turmas.filter(t => turmasSelecionadas.has(t.id)).length
                return (
                <div key={grupo.dia}>
                  <button
                    type="button"
                    onClick={() => toggleDia(grupo.dia)}
                    style={{
                      width: '100%', padding: '8px 14px', backgroundColor: '#f8fafc',
                      fontSize: '11px', fontWeight: '700', color: '#64748b',
                      textTransform: 'uppercase', letterSpacing: '0.04em',
                      borderTop: '1px solid var(--neutral-100, #f1f5f9)',
                      borderBottom: '1px solid var(--neutral-100, #f1f5f9)',
                      border: 'none', cursor: 'pointer', textAlign: 'left',
                      display: 'flex', alignItems: 'center', gap: '8px'
                    }}>
                    <Icon
                      icon={expandido ? 'mdi:chevron-down' : 'mdi:chevron-right'}
                      width={16}
                      style={{ color: '#94a3b8', flexShrink: 0 }}
                    />
                    <span style={{ flex: 1 }}>{grupo.nome}</span>
                    {marcadasNoDia > 0 && (
                      <span style={{
                        minWidth: '18px', height: '18px', padding: '0 6px',
                        borderRadius: '9px', backgroundColor: '#16a34a', color: '#fff',
                        fontSize: '11px', fontWeight: '700',
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                        textTransform: 'none', letterSpacing: '0'
                      }}>
                        {marcadasNoDia}
                      </span>
                    )}
                    <span style={{
                      fontSize: '10px', color: '#94a3b8', textTransform: 'none',
                      letterSpacing: '0', fontWeight: '500'
                    }}>
                      {grupo.turmas.length} turma{grupo.turmas.length === 1 ? '' : 's'}
                    </span>
                  </button>
                  {expandido && grupo.turmas.map(t => {
                    const isOrigem = t.id === aula.id
                    const ocup = ocupacaoDe(t.id)
                    const lotada = ocup >= t.capacidade
                    const jaFixo = alunoEhFixoEm(t.id)
                    const marcada = turmasSelecionadas.has(t.id)
                    const disabled = jaFixo || (lotada && !marcada)
                    const corBarra = corDaAula(t.descricao)

                    return (
                      <div
                        key={t.id}
                        onClick={() => { if (!disabled) toggleTurma(t.id) }}
                        style={{
                          display: 'flex', alignItems: 'center', gap: '10px',
                          padding: '10px 14px',
                          cursor: disabled ? 'not-allowed' : 'pointer',
                          opacity: disabled ? 0.55 : 1,
                          borderLeft: `3px solid ${marcada ? corBarra : 'transparent'}`,
                          backgroundColor: marcada ? '#f0fdf4' : 'transparent',
                          transition: 'background-color 0.12s'
                        }}
                        onMouseEnter={e => { if (!disabled && !marcada) e.currentTarget.style.backgroundColor = '#f8fafc' }}
                        onMouseLeave={e => { if (!disabled && !marcada) e.currentTarget.style.backgroundColor = 'transparent' }}>
                        <div style={{
                          width: '18px', height: '18px', borderRadius: '5px',
                          border: marcada ? '2px solid #16a34a' : '1.5px solid var(--neutral-300, #cbd5e1)',
                          backgroundColor: marcada ? '#16a34a' : '#fff',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          flexShrink: 0
                        }}>
                          {marcada && <Icon icon="mdi:check" width={14} style={{ color: '#fff' }} />}
                        </div>
                        <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                          <strong style={{ fontSize: '13px', color: '#0f172a' }}>{(t.horario || '').substring(0, 5)}</strong>
                          {t.descricao && <span style={{ fontSize: '13px', color: '#475569' }}>{t.descricao}</span>}
                          {isOrigem && (
                            <span style={{
                              fontSize: '10px', padding: '1px 6px', borderRadius: '4px',
                              backgroundColor: '#dbeafe', color: '#1e40af', fontWeight: '600'
                            }}>esta</span>
                          )}
                        </div>
                        <span style={{ fontSize: '12px', color: '#64748b', flexShrink: 0 }}>
                          {ocup}/{t.capacidade}
                        </span>
                        {jaFixo && (
                          <span style={{
                            fontSize: '10px', padding: '2px 6px', borderRadius: '4px',
                            backgroundColor: '#f1f5f9', color: '#64748b', fontWeight: '600', flexShrink: 0
                          }}>Já está</span>
                        )}
                        {!jaFixo && lotada && !marcada && (
                          <span style={{
                            fontSize: '10px', padding: '2px 6px', borderRadius: '4px',
                            backgroundColor: '#fef3c7', color: '#92400e', fontWeight: '600', flexShrink: 0
                          }}>Lotada</span>
                        )}
                      </div>
                    )
                  })}
                </div>
                )
              })}
              {turmasPorDia.length === 0 && (
                <div style={{ padding: '20px', textAlign: 'center', fontSize: '13px', color: '#94a3b8' }}>
                  Nenhuma turma cadastrada.
                </div>
              )}
            </div>
          </div>
        )}

        <div style={{ display: 'flex', gap: '8px' }}>
          <Button variant="outline" onClick={onClose} disabled={salvando} style={{ flex: 1 }}>
            Cancelar
          </Button>
          <Button
            variant="primary"
            icon="mdi:account-plus"
            onClick={adicionar}
            disabled={!podeSalvar}
            loading={salvando}
            style={{ flex: 2 }}
          >
            {tipo === 'avulso'
              ? 'Adicionar'
              : totalSelecionado > 1
                ? `Adicionar em ${totalSelecionado} turmas`
                : 'Adicionar'}
          </Button>
        </div>
      </div>
    </div>
  )
}

function rotuloTurma(t) {
  if (!t) return ''
  return `${DIAS_CURTO[Number(t.dia_semana)]} ${(t.horario || '').substring(0, 5)}`
}

const labelStyle = {
  display: 'block', fontSize: '13px', fontWeight: '600',
  color: 'var(--color-text-primary, #0f172a)', marginBottom: '8px',
  fontFamily: 'var(--font-sans)'
}
