import { useState, useMemo, useEffect } from 'react'
import { supabase } from './supabaseClient'
import { Icon } from '@iconify/react'
import { showToast } from './Toast'
import Modal from './design-system/components/Modal'
import Button from './design-system/components/Button'
import Input from './design-system/components/Input'
import Select from './design-system/components/Select'
import Avatar from './design-system/components/Avatar'
import { DIAS_LONGO, corDaAula, iniciaisDe } from './agendaUtils'

// ==========================================
// AgendaMudarHorarioModal — modal dedicado pra mudar horário de aluno.
//
// Fluxos por tipo de aluno:
//   • fixo (em turma) → escolhe DIA + clica numa TURMA existente daquele dia
//   • individual (cap=1 + devedor_id) → inputs livres (dia + horário + descrição)
//   • avulso (em agendamentos) → inputs livres
// ==========================================

const DIAS_OPCOES = [
  { value: '1', label: 'Segunda-feira' },
  { value: '2', label: 'Terça-feira' },
  { value: '3', label: 'Quarta-feira' },
  { value: '4', label: 'Quinta-feira' },
  { value: '5', label: 'Sexta-feira' },
  { value: '6', label: 'Sábado' },
  { value: '0', label: 'Domingo' }
]

export default function AgendaMudarHorarioModal({
  userId,
  aula,
  devedorId,
  devedores,
  data,
  tipoAluno,
  fixoEntry,
  agendamentoAvulso,
  aulasDisponiveis = [],
  fixos = [],
  onMudancaConcluida,
  onClose
}) {
  const isFluxoTurma = tipoAluno === 'fixo'

  // ===== State comum =====
  // novoDia começa VAZIO — usuário escolhe explicitamente o novo dia (evita
  // pré-selecionar o dia atual e parecer "já decidido")
  const [novoDia, setNovoDia] = useState('')
  const [salvando, setSalvando] = useState(false)

  // ===== State pro fluxo de turma (cards) =====
  const [turmaSelecionadaId, setTurmaSelecionadaId] = useState(null)

  // ===== State pro fluxo livre (individual / avulso) =====
  const [novoHorario, setNovoHorario] = useState((aula?.horario || '').substring(0, 5))
  const [novaDescricao, setNovaDescricao] = useState(aula?.descricao || '')

  // Reset turma selecionada quando troca dia
  useEffect(() => { setTurmaSelecionadaId(null) }, [novoDia])

  const nome = devedores?.nome || 'Aluno'
  const horarioAtual = (aula?.horario || '').substring(0, 5)
  const diaAtualLabel = DIAS_LONGO[aula?.dia_semana ?? 0]

  // ===== Turmas do dia (pra fluxo fixo) =====
  const turmasDoDia = useMemo(() => {
    if (!novoDia) return []
    return aulasDisponiveis
      .filter(a => String(a.dia_semana) === novoDia && !a.devedor_id && a.ativo !== false)
      .sort((a, b) => (a.horario || '').localeCompare(b.horario || ''))
  }, [aulasDisponiveis, novoDia])

  const ocupacaoDe = (aulaId) =>
    fixos.filter(f => f.aula_id === aulaId && f.ativo !== false).length

  // ===== Turma destino pra fluxo livre =====
  const turmaDestinoLivre = useMemo(() => {
    if (isFluxoTurma) return null
    if (!novoDia || !novoHorario) return null
    return aulasDisponiveis.find(a =>
      String(a.dia_semana) === novoDia
      && (a.horario || '').substring(0, 5) === novoHorario
      && !a.devedor_id
      && a.id !== aula?.id
      && (a.descricao || '') === (novaDescricao || '')
    )
  }, [novoDia, novoHorario, novaDescricao, aulasDisponiveis, aula, isFluxoTurma])

  const slotLivreMudou = (
    String(aula?.dia_semana ?? '') !== novoDia
    || horarioAtual !== novoHorario
    || (aula?.descricao || '') !== (novaDescricao || '')
  )

  // ===== Pode confirmar? =====
  const podeConfirmar = isFluxoTurma
    ? !!turmaSelecionadaId && turmaSelecionadaId !== aula?.id
    : slotLivreMudou && !!novoDia && !!novoHorario

  // ===== Submit =====
  const confirmar = async () => {
    if (!podeConfirmar) return
    setSalvando(true)
    try {
      if (isFluxoTurma) {
        // === FLUXO FIXO: move pra turma selecionada ===
        const turmaDestino = aulasDisponiveis.find(a => a.id === turmaSelecionadaId)
        if (!turmaDestino) throw new Error('Turma destino não encontrada')

        const { data: existente } = await supabase.from('aulas_fixos')
          .select('id, ativo')
          .eq('aula_id', turmaDestino.id)
          .eq('devedor_id', devedorId)
          .maybeSingle()

        if (existente?.ativo === true) {
          showToast('Aluno já é fixo da turma destino', 'warning')
          setSalvando(false); return
        }

        const { error: errDel } = await supabase.from('aulas_fixos').delete().eq('id', fixoEntry.id)
        if (errDel) throw errDel

        if (existente?.ativo === false) {
          await supabase.from('aulas_fixos').update({ ativo: true }).eq('id', existente.id)
        } else {
          const { error: errIns } = await supabase.from('aulas_fixos')
            .insert({ aula_id: turmaDestino.id, devedor_id: devedorId, user_id: userId })
          if (errIns) throw errIns
        }

        showToast('Aluno movido pra outra turma!', 'success')
        onMudancaConcluida?.({ novaAulaId: turmaDestino.id, tipo: 'fixo-turma' })
        onClose?.()
        return
      }

      // === FLUXO LIVRE (individual / avulso) ===
      const horarioFull = novoHorario.length === 5 ? `${novoHorario}:00` : novoHorario
      const diaNum = parseInt(novoDia, 10)
      const descFinal = novaDescricao.trim() || null

      if (tipoAluno === 'individual') {
        const { data: novaAula, error: errCreate } = await supabase.from('aulas')
          .insert({
            user_id: userId,
            dia_semana: diaNum,
            horario: horarioFull,
            descricao: descFinal || '',
            capacidade: 1,
            devedor_id: devedorId,
            ativo: true
          })
          .select().single()
        if (errCreate) throw errCreate

        const { error: errOld } = await supabase.from('aulas')
          .update({ ativo: false, updated_at: new Date().toISOString() })
          .eq('id', aula.id)
        if (errOld) throw errOld

        showToast('Horário do aluno alterado!', 'success')
        onMudancaConcluida?.({ novaAulaId: novaAula.id, tipo: 'individual' })
      }

      else if (tipoAluno === 'avulso') {
        let aulaDestinoId = turmaDestinoLivre?.id
        if (!aulaDestinoId) {
          const { data: novaAula, error: errCreate } = await supabase.from('aulas')
            .insert({
              user_id: userId,
              dia_semana: diaNum,
              horario: horarioFull,
              descricao: descFinal || '',
              capacidade: 1,
              devedor_id: devedorId,
              ativo: true
            })
            .select().single()
          if (errCreate) throw errCreate
          aulaDestinoId = novaAula.id
        }

        const { error: errCancel } = await supabase.from('agendamentos')
          .update({ status: 'cancelado', cancelado_em: new Date().toISOString() })
          .eq('id', agendamentoAvulso.id)
        if (errCancel) throw errCancel

        const { error: errIns } = await supabase.from('agendamentos').insert({
          user_id: userId,
          aula_id: aulaDestinoId,
          devedor_id: devedorId,
          data,
          status: 'confirmado'
        })
        if (errIns) throw errIns

        showToast('Agendamento avulso movido!', 'success')
        onMudancaConcluida?.({ novaAulaId: aulaDestinoId, tipo: 'avulso' })
      }

      onClose?.()
    } catch (err) {
      console.error('Erro ao mudar horário:', err)
      showToast('Erro ao mudar horário: ' + (err.message || err), 'error')
    }
    setSalvando(false)
  }

  return (
    <Modal isOpen={true} onClose={onClose} size="md" hideHeader centered>
      <div style={{
        padding: '20px 24px 16px',
        borderBottom: '1px solid #e4e4e7',
        display: 'flex', alignItems: 'center', gap: '14px'
      }}>
        <Avatar name={nome} src={devedores?.foto_url} size="md" />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: '16px', fontWeight: '700', color: '#0f172a' }}>
            Mudar horário
          </div>
          <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>
            <strong>{nome}</strong> · hoje em {diaAtualLabel} {horarioAtual}
            {aula?.descricao && ` · ${aula.descricao}`}
          </div>
        </div>
        <button onClick={onClose}
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', borderRadius: '6px' }}>
          <Icon icon="mdi:close" width="20" style={{ color: '#94a3b8' }} />
        </button>
      </div>

      <Modal.Body>
        {/* Step 1: dia (comum a todos os fluxos) */}
        <div style={{ marginBottom: '14px' }}>
          <Select
            label="Novo dia"
            placeholder="Selecione o novo dia"
            options={DIAS_OPCOES}
            value={novoDia}
            onChange={setNovoDia}
          />
        </div>

        {/* Step 2: fluxo condicional */}
        {isFluxoTurma ? (
          <ListaTurmasDestino
            novoDia={novoDia}
            turmas={turmasDoDia}
            aulaAtualId={aula?.id}
            turmaSelecionadaId={turmaSelecionadaId}
            onSelecionar={setTurmaSelecionadaId}
            ocupacaoDe={ocupacaoDe}
            diaLabel={DIAS_OPCOES.find(d => d.value === novoDia)?.label}
          />
        ) : (
          <FluxoLivre
            novoHorario={novoHorario}
            setNovoHorario={setNovoHorario}
            novaDescricao={novaDescricao}
            setNovaDescricao={setNovaDescricao}
            slotMudou={slotLivreMudou}
            turmaDestino={turmaDestinoLivre}
            tipoAluno={tipoAluno}
          />
        )}
      </Modal.Body>

      <Modal.Footer align="between">
        <Button variant="outline" onClick={onClose}>Cancelar</Button>
        <Button
          variant="primary"
          icon="mdi:swap-horizontal"
          onClick={confirmar}
          loading={salvando}
          disabled={!podeConfirmar}
        >
          Confirmar mudança
        </Button>
      </Modal.Footer>
    </Modal>
  )
}

// ===== Lista de cards de turma (fluxo fixo) =====
function ListaTurmasDestino({ novoDia, turmas, aulaAtualId, turmaSelecionadaId, onSelecionar, ocupacaoDe, diaLabel }) {
  // Estado inicial: usuário ainda não escolheu o dia → instrução amigável
  if (!novoDia) {
    return (
      <div style={{
        padding: '24px 18px', textAlign: 'center',
        border: '1px dashed #cbd5e1', borderRadius: '10px',
        backgroundColor: '#f8fafc'
      }}>
        <Icon icon="mdi:arrow-up" width={22} style={{ color: '#94a3b8' }} />
        <p style={{ fontSize: '13px', color: '#475569', margin: '6px 0 0', fontWeight: '500' }}>
          Escolha um dia acima pra ver as turmas disponíveis
        </p>
      </div>
    )
  }
  if (turmas.length === 0) {
    return (
      <div style={{
        padding: '32px 18px', textAlign: 'center',
        border: '1px dashed #e5e7eb', borderRadius: '10px',
        backgroundColor: '#fafafa'
      }}>
        <Icon icon="mdi:calendar-blank-outline" width={36} style={{ color: '#cbd5e1' }} />
        <p style={{ fontSize: '13px', color: '#64748b', margin: '8px 0 2px', fontWeight: '500' }}>
          Sem turmas {diaLabel ? `na ${diaLabel.toLowerCase()}` : 'nesse dia'}
        </p>
        <p style={{ fontSize: '12px', color: '#94a3b8', margin: 0 }}>
          Crie uma turma neste dia antes de mover o aluno.
        </p>
      </div>
    )
  }

  return (
    <div>
      <div style={{
        fontSize: '11px', fontWeight: '700', color: '#475569',
        textTransform: 'uppercase', letterSpacing: '0.5px',
        marginBottom: '8px'
      }}>
        Selecione a turma destino
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {turmas.map(t => {
          const ocupadas = ocupacaoDe(t.id)
          const lotada = ocupadas >= t.capacidade
          const ehAtual = t.id === aulaAtualId
          const selecionada = t.id === turmaSelecionadaId
          const disabled = lotada || ehAtual
          const cor = corDaAula(t.descricao)
          return (
            <CardTurmaDestino
              key={t.id}
              turma={t}
              cor={cor}
              ocupadas={ocupadas}
              lotada={lotada}
              ehAtual={ehAtual}
              selecionada={selecionada}
              disabled={disabled}
              onClick={() => !disabled && onSelecionar(t.id)}
            />
          )
        })}
      </div>
    </div>
  )
}

function CardTurmaDestino({ turma, cor, ocupadas, lotada, ehAtual, selecionada, disabled, onClick }) {
  const baseStyle = {
    backgroundColor: '#fff',
    border: `1px solid ${selecionada ? '#16a34a' : '#e4e4e7'}`,
    borderLeft: `3px solid ${selecionada ? '#16a34a' : cor.border}`,
    borderRadius: '10px',
    padding: '10px 12px',
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.55 : 1,
    display: 'flex', alignItems: 'center', gap: '10px',
    transition: 'box-shadow 0.12s ease, border-color 0.12s'
  }
  return (
    <div onClick={onClick}
      style={baseStyle}
      onMouseEnter={e => { if (!disabled) e.currentTarget.style.boxShadow = '0 2px 8px rgba(15,23,42,0.06)' }}
      onMouseLeave={e => { e.currentTarget.style.boxShadow = 'none' }}>
      {/* Radio visual */}
      <div style={{
        width: '18px', height: '18px', borderRadius: '50%',
        border: `2px solid ${selecionada ? '#16a34a' : '#cbd5e1'}`,
        flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center'
      }}>
        {selecionada && (
          <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#16a34a' }} />
        )}
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: '8px',
          fontSize: '14px', fontWeight: '700', color: '#0f172a'
        }}>
          {(turma.horario || '').substring(0, 5)}
          {turma.descricao && (
            <span style={{ fontWeight: '500', color: cor.text }}>· {turma.descricao}</span>
          )}
        </div>
        <div style={{
          fontSize: '12px', color: '#64748b', marginTop: '2px',
          display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap'
        }}>
          {turma.colaboradores?.nome && (
            <>
              <span style={{
                height: '17px', padding: '0 6px',
                borderRadius: '8px', backgroundColor: '#344848', color: '#fff',
                fontSize: '9px', fontWeight: '700',
                lineHeight: '17px',
                display: 'inline-block', flexShrink: 0
              }}>{iniciaisDe(turma.colaboradores.nome)}</span>
              <span>Prof. {turma.colaboradores.nome.split(' ')[0]}</span>
              <span style={{ color: '#cbd5e1' }}>·</span>
            </>
          )}
          <Icon icon="mdi:account-multiple-outline" width={13} />
          <span style={{ fontWeight: '600' }}>{ocupadas}/{turma.capacidade} vagas</span>
        </div>
      </div>

      {/* Badges de estado */}
      {ehAtual && <BadgeMini cor="#475569" bg="#f1f5f9">Atual</BadgeMini>}
      {!ehAtual && lotada && <BadgeMini cor="#9a3412" bg="#fed7aa">Lotada</BadgeMini>}
    </div>
  )
}

function BadgeMini({ cor, bg, children }) {
  return (
    <span style={{
      padding: '2px 8px', borderRadius: '999px',
      fontSize: '10px', fontWeight: '700',
      backgroundColor: bg, color: cor, flexShrink: 0
    }}>
      {children}
    </span>
  )
}

// ===== Fluxo livre (individual / avulso) =====
function FluxoLivre({ novoHorario, setNovoHorario, novaDescricao, setNovaDescricao, slotMudou, turmaDestino, tipoAluno }) {
  // Texto do preview muda conforme o tipo de aluno e se há turma destino
  const preview = (() => {
    if (!slotMudou) {
      return { icon: 'mdi:information-outline', cor: '#0369a1', bg: '#f0f9ff', borda: '#bae6fd',
        texto: 'Selecione um novo dia/horário pra continuar.' }
    }
    if (tipoAluno === 'avulso') {
      if (turmaDestino) {
        return { icon: 'mdi:account-multiple', cor: '#4338ca', bg: '#eef2ff', borda: '#c7d2fe',
          texto: <>Vai agendar este dia na turma <strong>{turmaDestino.descricao || 'sem nome'}</strong>.</> }
      }
      return { icon: 'mdi:calendar-today', cor: '#0369a1', bg: '#f0f9ff', borda: '#bae6fd',
        texto: <>Vai criar um <strong>agendamento avulso</strong> no novo slot (só nesta data).</> }
    }
    // individual: sempre cria nova aula cap=1 (não vira fixo de turma)
    return { icon: 'mdi:account-clock-outline', cor: '#7c3aed', bg: '#f5f3ff', borda: '#ddd6fe',
      texto: <>Vai mudar o <strong>horário individual</strong> deste aluno. O slot atual será desativado (histórico preservado).</> }
  })()

  return (
    <div>
      <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
        <div style={{ flex: 1 }}>
          <Input
            label="Novo horário"
            type="time"
            value={novoHorario}
            onChange={e => setNovoHorario(e.target.value)}
          />
        </div>
        <div style={{ flex: 2 }}>
          <Input
            label="Descrição"
            placeholder="Ex: Pilates (opcional)"
            value={novaDescricao}
            onChange={e => setNovaDescricao(e.target.value)}
          />
        </div>
      </div>

      <div style={{
        marginTop: '4px', padding: '12px 14px', borderRadius: '10px',
        backgroundColor: preview.bg,
        border: `1px solid ${preview.borda}`,
        fontSize: '13px', color: '#1e3a8a',
        display: 'flex', alignItems: 'flex-start', gap: '10px'
      }}>
        <Icon icon={preview.icon} width={18}
          style={{ color: preview.cor, marginTop: '1px', flexShrink: 0 }} />
        <span>{preview.texto}</span>
      </div>
    </div>
  )
}
