import { useMemo, useState, useEffect } from 'react'
import { Icon } from '@iconify/react'
import { supabase } from '../../supabaseClient'
import SearchInput from '../../design-system/components/SearchInput'
import EmptyState from '../../design-system/components/EmptyState'
import Modal from '../../design-system/components/Modal'
import Button from '../../design-system/components/Button'
import Input from '../../design-system/components/Input'
import Select from '../../design-system/components/Select'
import {
  COLUNAS, COLUNAS_ETAPA, MOTIVOS_SAIDA, formatarTelefone, tempoDesde, formatarDataCurta, hojeISO, dataLocal,
  resolverVariaveis, planoPara
} from './utils'
import {
  proximaAcao, diasNaEtapa, diasEntre, ehAudio, semMarcaAudio,
  colunaDoLead, estadoPagante, estadoConta, mensagensDaVez, MOTIVOS_RISCO, DIAS_PARA_CHURN, DIAS_BASE_ANTIGA
} from './funilFollowup'
import { estiloColuna, ESTILO_CARD, ESTILO_TITULO_COLUNA, ESTILO_HINT_COLUNA } from '../kanbanEstilo'
import { ehOutbound } from './ListaConversas'
import { ESTAGIOS, ORDEM_ESTAGIOS } from './estagioConversa'

// Funil de follow-up (funilFollowup.json + funilFollowup.js).
// Coluna de toque = "esse já foi". O card mostra há quantos dias está ali e
// qual é a próxima ação; a coluna ordena pela ação mais urgente / mais antigo
// no topo. Clicar abre a ficha com a mensagem da vez pronta pra copiar e o
// botão "Enviei", que avança a etapa (ou o sub-passo) sozinho.

const addDias = (n) => {
  const d = dataLocal(hojeISO())
  d.setDate(d.getDate() + n)
  return d.toISOString().slice(0, 10)
}

const proximaSegunda = () => {
  const d = dataLocal(hojeISO())
  const faltam = ((8 - d.getDay()) % 7) || 7
  d.setDate(d.getDate() + faltam)
  return d.toISOString().slice(0, 10)
}

const ATALHOS_DATA = [
  { label: 'Amanhã',        valor: () => addDias(1) },
  { label: '+3 dias',       valor: () => addDias(3) },
  { label: '+1 semana',     valor: () => addDias(7) },
  { label: 'Próx. segunda', valor: proximaSegunda },
  { label: '+15 dias',      valor: () => addDias(15) }
]

const ETAPAS_CLIENTE = ['criou_conta', 'pagante', 'churn']

const tituloColuna = (id) => COLUNAS.find(c => c.id === id)?.titulo || id

// Campo que sobrou pra preencher à mão: {{var}} sem valor ou [colchete]
const pendencias = (texto) => [
  ...[...texto.matchAll(/\{\{(\w+)\}\}/g)].map(m => m[1]),
  ...[...texto.matchAll(/\[([^\]]+)\]/g)].map(m => m[1])
]

function Tag({ bg, cor, icon, children, title, forte }) {
  return (
    <span title={title} style={{
      display: 'inline-flex', alignItems: 'center', gap: '3px',
      fontSize: '10.5px', backgroundColor: bg, color: cor, borderRadius: '5px',
      padding: '1px 6px', fontWeight: forte ? 700 : 600, whiteSpace: 'nowrap'
    }}>
      {icon && <Icon icon={icon} width="11" />}
      {children}
    </span>
  )
}

// "Toque 3 hoje" / "Toque 3 em 2d" / "Toque 3 · atrasado 4d"
function TagAcao({ acao }) {
  if (!acao) return null
  const hoje = hojeISO()
  const falta = diasEntre(hoje, acao.due)
  const icon = acao.tipo === 'toque' ? 'mdi:send-outline'
    : acao.tipo === 'data' ? 'mdi:calendar-question'
    : acao.tipo === 'arquivar' ? 'mdi:archive-outline'
    : 'mdi:arrow-right-bold-outline'
  if (falta < 0) {
    return <Tag bg="#fee2e2" cor="#b91c1c" icon={icon} forte title={`Era pra ${formatarDataCurta(acao.due)}`}>
      {acao.label} · atrasado {-falta > 7 ? '+7d' : `${-falta}d`}
    </Tag>
  }
  if (falta === 0) {
    return <Tag bg="#fef3c7" cor="#92400e" icon={icon} forte title="Fazer hoje">{acao.label} · hoje</Tag>
  }
  return <Tag bg="#f1f5f9" cor="#475569" icon={icon} title={`Em ${formatarDataCurta(acao.due)}`}>
    {acao.label} · em {falta}d
  </Tag>
}

const ROTULO_MARCO = { zap: 'WhatsApp', alunos: 'alunos', disparo: '1ª cobrança' }

// Estado calculado pelo uso: pagante (Recém pago, Ativando, Pagante, Em risco) ou
// conta em teste (Trial, Sem conectar, Trial vencido). Outros status: null.
const estadoDoLead = (lead) =>
  lead.status === 'pagante' ? estadoPagante(lead)
    : lead.status === 'criou_conta' ? estadoConta(lead)
    : null

const fraseTrial = (n) => n > 1 ? `teste acaba em ${n}d` : n === 1 ? 'teste acaba amanhã' : n === 0 ? 'teste acaba hoje' : `teste venceu há ${-n}d`

// Números de uso da conta no cartão do pagante: dá pra decidir o toque sem abrir a ficha
function UsoTags({ info }) {
  const { uso } = info
  if (!uso.tem) return null
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginBottom: '6px' }}>
      {info.estado === 'em_risco' && (
        <Tag bg="#fee2e2" cor="#b91c1c" icon="mdi:alert-outline" forte title="Por que está em risco">{MOTIVOS_RISCO[info.motivo]}</Tag>
      )}
      {info.estado === 'inadimplente' && (
        <>
          <Tag bg="#fee2e2" cor="#b91c1c" icon="mdi:cash-remove" forte title="O plano venceu e a conta ainda está marcada como paga">
            {info.diasVencido === null ? 'Plano vencido (sem data)' : `Plano venceu há ${info.diasVencido}d`}
          </Tag>
          {info.diasParaChurn !== null && (
            <Tag bg="#ffedd5" cor="#9a3412" icon="mdi:timer-sand" title={`Passando de ${DIAS_PARA_CHURN} dias vencido, vira Churn sozinho`}>
              {info.diasParaChurn === 0 ? 'vira Churn hoje' : `vira Churn em ${info.diasParaChurn}d`}
            </Tag>
          )}
        </>
      )}
      {info.estado === 'sem_conectar' && (
        <Tag bg="#fef3c7" cor="#92400e" icon="mdi:whatsapp" forte title="Criou a conta há mais de 24h e não conectou o WhatsApp: mandar áudio">
          Sem WhatsApp há {Math.floor(info.horas / 24) >= 1 ? `${Math.floor(info.horas / 24)}d` : `${Math.floor(info.horas)}h`}
        </Tag>
      )}
      {info.trialRestante !== undefined && (
        <Tag bg={info.trialRestante < 0 ? '#f1f5f9' : '#e0f2fe'} cor={info.trialRestante < 0 ? '#64748b' : '#075985'} icon="mdi:timer-sand" title="Prazo do teste de 3 dias">
          {fraseTrial(info.trialRestante)}
        </Tag>
      )}
      {info.avisoFimEm && (
        <Tag bg="#ede9fe" cor="#5b21b6" icon="mdi:robot-outline" title="O aviso automático de fim de teste já foi enviado: o CRM pula o D2">
          aviso de fim de teste (auto) enviado
        </Tag>
      )}
      {info.estado === 'ativando' && info.faltam.length > 0 && (
        <Tag bg="#fef3c7" cor="#92400e" icon="mdi:progress-wrench" forte title="O que ainda falta para a conta rodar">
          Falta: {info.faltam.map(m => ROTULO_MARCO[m]).join(' · ')}
        </Tag>
      )}
      <Tag bg="#f1f5f9" cor="#475569" icon="mdi:account-multiple-outline" title="Alunos cadastrados">{uso.alunos}</Tag>
      <Tag bg="#f1f5f9" cor="#475569" icon="mdi:send-check-outline" title="Mensagens enviadas neste mês">{uso.msgsMes}</Tag>
      <Tag bg={uso.zap ? '#dcfce7' : '#fee2e2'} cor={uso.zap ? '#166534' : '#b91c1c'} icon="mdi:whatsapp" title={uso.zap ? 'WhatsApp conectado' : 'WhatsApp desconectado'}>
        {uso.zap ? 'ok' : 'off'}
      </Tag>
      {(uso.nuncaEntrou || (uso.diasSemAcesso !== null && uso.diasSemAcesso >= 3)) && (
        <Tag bg="#fef3c7" cor="#92400e" icon="mdi:clock-outline" title="Último acesso ao Mensalli">
          {uso.nuncaEntrou ? 'nunca entrou' : `${uso.diasSemAcesso}d sem entrar`}
        </Tag>
      )}
    </div>
  )
}

// Linha do painel "Uso da conta" na ficha
function LinhaUso({ ok, children }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '7px', fontSize: '12.5px', color: ok ? '#166534' : '#b91c1c' }}>
      <Icon icon={ok ? 'mdi:check-circle' : 'mdi:close-circle'} width="16" />
      <span style={{ color: '#334155' }}>{children}</span>
    </div>
  )
}

function PainelUso({ info }) {
  const { uso } = info
  if (!uso.tem) return null
  const titulos = {
    recem_pago: 'Recém pago', ativando: 'Ativando', pagante: 'Pagante', em_risco: 'Em risco',
    criou_conta: 'Trial', sem_conectar: 'Sem conectar', trial_vencido: 'Trial vencido', inadimplente: 'Inadimplente'
  }
  return (
    <div style={{ backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '10px 12px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '7px' }}>
        <strong style={{ fontSize: '13px', color: '#0f172a' }}>Uso da conta</strong>
        <span style={{ fontSize: '11.5px', fontWeight: 700, color: info.estado === 'em_risco' ? '#b91c1c' : '#475569' }}>
          {titulos[info.estado]} · {info.estado === 'inadimplente'
            ? (info.diasVencido === null ? 'sem data de vencimento' : `venceu há ${info.diasVencido}d`)
            : info.trialRestante !== undefined
            ? (info.dias === 0 ? 'criou hoje' : `criou há ${info.dias}d`)
            : (info.dias === 0 ? 'pagou hoje' : `pagou há ${info.dias}d`)}
        </span>
      </div>
      <div style={{ display: 'grid', gap: '5px' }}>
        <LinhaUso ok={uso.zap}>WhatsApp {uso.zap ? 'conectado' : 'desconectado'}</LinhaUso>
        <LinhaUso ok={uso.alunos >= 5}>{uso.alunos} {uso.alunos === 1 ? 'aluno cadastrado' : 'alunos cadastrados'}</LinhaUso>
        <LinhaUso ok={uso.msgsMes > 0}>{uso.msgsMes} {uso.msgsMes === 1 ? 'mensagem enviada' : 'mensagens enviadas'} neste mês</LinhaUso>
        <LinhaUso ok={!uso.nuncaEntrou && (uso.diasSemAcesso === null || uso.diasSemAcesso < 14)}>
          {uso.nuncaEntrou ? 'Nunca entrou na plataforma' : uso.diasSemAcesso === 0 ? 'Entrou hoje' : `Último acesso há ${uso.diasSemAcesso}d`}
        </LinhaUso>
      </div>
      {info.estado === 'inadimplente' && info.diasParaChurn !== null && (
        <div style={{ marginTop: '8px', fontSize: '12px', color: '#9a3412', fontWeight: 600 }}>
          {info.diasParaChurn === 0 ? 'Vira Churn hoje, na próxima atualização' : `Vira Churn sozinho em ${info.diasParaChurn} dias (${DIAS_PARA_CHURN} dias de atraso)`}
        </div>
      )}
      {info.estado === 'em_risco' && (
        <div style={{ marginTop: '8px', fontSize: '12px', color: '#b91c1c', fontWeight: 600 }}>
          Motivo: {MOTIVOS_RISCO[info.motivo]}
        </div>
      )}
    </div>
  )
}

function CardLead({ lead, acao, estado, onAbrir, onDragStart, onDragEnd }) {
  const dias = diasNaEtapa(lead)

  return (
    <div
      draggable
      onDragStart={(e) => { e.dataTransfer.setData('leadId', lead.id); onDragStart() }}
      onDragEnd={onDragEnd}
      onClick={onAbrir}
      style={ESTILO_CARD}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '6px' }}>
        <div style={{ minWidth: 0 }}>
          <strong style={{ display: 'block', fontSize: '13px', color: '#1e293b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {lead.nome || lead.usuario_nome || 'Sem nome'}
          </strong>
          <div style={{ fontSize: '11px', color: '#94a3b8' }}>
            {lead.telefone ? formatarTelefone(lead.telefone) : 'sem número (LID)'}
          </div>
        </div>
        <div title="Dias nesta etapa" style={{
          flexShrink: 0, textAlign: 'center', minWidth: '34px', borderRadius: '7px', padding: '2px 5px',
          backgroundColor: dias >= 7 ? '#fef3c7' : '#f1f5f9', color: dias >= 7 ? '#92400e' : '#475569'
        }}>
          <div style={{ fontSize: '14px', fontWeight: 800, lineHeight: 1.1 }}>{dias === 0 ? 'hoje' : dias}</div>
          {dias > 0 && <div style={{ fontSize: '9px', fontWeight: 600 }}>{dias === 1 ? 'dia' : 'dias'}</div>}
        </div>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', margin: '6px 0' }}>
        <TagAcao acao={acao} />
        {lead.estagio_conversa && ESTAGIOS[lead.estagio_conversa] && (
          <Tag bg={ESTAGIOS[lead.estagio_conversa].bg} cor={ESTAGIOS[lead.estagio_conversa].cor} icon="mdi:chat-processing-outline"
            forte={lead.estagio_conversa === 'D'} title={'Onde a conversa parou: ' + ESTAGIOS[lead.estagio_conversa].dica}>
            {ESTAGIOS[lead.estagio_conversa].sigla} · {ESTAGIOS[lead.estagio_conversa].titulo}
          </Tag>
        )}
        {['base_antiga', 'puxar_conversa'].includes(colunaDoLead(lead)) && lead.ultima_interacao && (() => {
          const parado = diasEntre(new Date(lead.ultima_interacao).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }), hojeISO())
          const faltam = DIAS_BASE_ANTIGA - parado + 1
          return (
            <>
              <Tag bg="#fce7f3" cor="#9d174d" icon="mdi:history" title="Há quanto tempo a conversa parou">parado há {parado}d</Tag>
              {colunaDoLead(lead) === 'puxar_conversa' && (
                <Tag bg="#f3e8ff" cor="#6b21a8" icon="mdi:timer-sand" title={'Passando de ' + DIAS_BASE_ANTIGA + ' dias parado, vai pro Reaquecimento sozinho'}>
                  reaquece em {faltam}d
                </Tag>
              )}
            </>
          )
        })()}
        {lead.esperando_resposta && lead.status === 'conversando' && (
          <Tag bg="#fee2e2" cor="#b91c1c" icon="mdi:message-reply-text-outline" title="A última mensagem foi dele — falta você responder">Responder</Tag>
        )}
        {lead.status === 'aguardando' && lead.retornar_em && (
          <Tag bg="#e0f2fe" cor="#075985" icon="mdi:calendar-clock" title="Dia combinado">Combinado {formatarDataCurta(lead.retornar_em)}</Tag>
        )}
        {lead.status === 'aguardando' && lead.remarcacoes >= 2 && (
          <Tag bg="#ffedd5" cor="#9a3412" title="Já remarcou 2x: pergunte 'quando eu te chamo de verdade?'">{lead.remarcacoes}ª remarcação</Tag>
        )}
        {lead.status === 'perdido' && lead.motivo_saida && lead.motivo_saida !== 'esgotou' && (
          <Tag bg="#f1f5f9" cor="#64748b">
            {lead.motivo_saida === 'preco_timing' ? 'Preço/momento' : lead.motivo_saida === 'sem_fit' ? 'Sem perfil' : 'Disse não'}
          </Tag>
        )}
        {ehOutbound(lead) && (
          <Tag bg="#e0e7ff" cor="#3730a3" icon="mdi:phone-outgoing" title="Veio do Outbound Prospecting (fora das métricas da campanha)">Outbound</Tag>
        )}
        {lead.vinculo_manual && (
          <Tag bg="#eef2ff" cor="#3730a3" icon="mdi:link-variant" title="Contato extra de uma conta (fora das métricas)">
            {lead.usuario_empresa || lead.usuario_nome || 'conta'}
          </Tag>
        )}
        {lead.status !== 'pagante' && lead.status !== 'churn' && lead.plano_pago && (
          <Tag bg="#dcfce7" cor="#166534">PAGANTE</Tag>
        )}
      </div>

      {estado && <UsoTags info={estado} />}

      {lead.observacoes && (
        <div title={lead.observacoes} style={{
          fontSize: '11.5px', color: '#78350f', backgroundColor: '#fffbeb', borderRadius: '5px',
          padding: '4px 6px', marginBottom: '6px', lineHeight: 1.3,
          display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden'
        }}>
          📝 {lead.observacoes}
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '10.5px', color: '#94a3b8' }}>
        <span title={`Você mandou ${lead.enviadas || 0} · Ele mandou ${lead.recebidas || 0}`} style={{ display: 'inline-flex', gap: '7px' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '2px' }}>
            <Icon icon="mdi:arrow-top-right" width="11" />{lead.enviadas || 0}
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '2px' }}>
            <Icon icon="mdi:arrow-bottom-left" width="11" />{lead.recebidas || 0}
          </span>
        </span>
        {lead.nicho || lead.alunos
          ? <span>{[lead.nicho, lead.alunos ? `${lead.alunos} alunos` : null].filter(Boolean).join(' · ')}</span>
          : <span>chegou {tempoDesde(lead.created_at)}</span>}
      </div>
    </div>
  )
}

function MensagemDaVez({ texto, lead }) {
  const [copiado, setCopiado] = useState(false)
  const audio = ehAudio(texto)
  const final = resolverVariaveis(semMarcaAudio(texto), lead)
  const faltando = pendencias(final)

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(final)
      setCopiado(true)
      setTimeout(() => setCopiado(false), 1500)
    } catch {
      window.prompt('Copie a mensagem:', final)
    }
  }

  return (
    <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', padding: '9px 10px', backgroundColor: '#fff' }}>
      {audio && (
        <div style={{ fontSize: '10.5px', fontWeight: 700, color: '#7c3aed', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
          <Icon icon="mdi:microphone" width="12" /> Roteiro de áudio (20 a 40 s)
        </div>
      )}
      <div style={{ fontSize: '12.5px', color: '#1e293b', whiteSpace: 'pre-wrap', lineHeight: 1.4 }}>{final}</div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', marginTop: '7px' }}>
        <span style={{ fontSize: '11px', color: faltando.length ? '#b45309' : '#94a3b8' }}>
          {faltando.length ? `Preencher: ${faltando.join(', ')}` : ''}
        </span>
        <Button variant="outline" size="sm" icon={copiado ? 'mdi:check' : 'mdi:content-copy'} onClick={copiar}>
          {copiado ? 'Copiado' : 'Copiar'}
        </Button>
      </div>
    </div>
  )
}

// Conta do Mensalli ligada ao lead. Ligada pelo telefone (sync) não dá pra
// desfazer aqui — o sync religaria no próximo load. Ligada à mão, dá.
function ContaVinculada({ lead, onVincular }) {
  const [aberto, setAberto] = useState(false)
  const [termo, setTermo] = useState('')
  const [resultados, setResultados] = useState([])
  const [buscando, setBuscando] = useState(false)
  const [salvando, setSalvando] = useState(false)

  useEffect(() => {
    // Vírgula e parênteses quebram o filtro .or() do PostgREST
    const t = termo.trim().replace(/[,()%*]/g, ' ').trim()
    if (!aberto || t.length < 2) { setResultados([]); return }
    let vivo = true
    setBuscando(true)
    const timer = setTimeout(async () => {
      const { data, error } = await supabase
        .from('usuarios')
        .select('id, nome_completo, nome_empresa, email, telefone, plano_pago, virou_pagante_em, cancelado_em')
        .or(`nome_completo.ilike.%${t}%,nome_empresa.ilike.%${t}%,email.ilike.%${t}%`)
        .neq('role', 'admin')
        .order('nome_empresa', { ascending: true })
        .limit(8)
      if (!vivo) return
      if (error) console.warn('[funil] busca de contas:', error.message)
      setResultados(data || [])
      setBuscando(false)
    }, 300)
    return () => { vivo = false; clearTimeout(timer) }
  }, [termo, aberto])

  const vincular = async (conta) => {
    setSalvando(true)
    try {
      await onVincular(conta)
      setAberto(false)
      setTermo('')
    } catch (e) {
      window.alert('Não consegui vincular: ' + e.message)
    } finally {
      setSalvando(false)
    }
  }

  const situacao = (c) => c.cancelado_em || (!c.plano_pago && c.virou_pagante_em)
    ? { txt: 'Churn', bg: '#fee2e2', cor: '#b91c1c' }
    : c.plano_pago ? { txt: 'Pagante', bg: '#dcfce7', cor: '#166534' }
    : { txt: 'Trial', bg: '#cffafe', cor: '#155e75' }

  if (lead.usuario_id) {
    const s = situacao(lead)
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '9px 11px' }}>
        <div style={{ minWidth: 0, fontSize: '12.5px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Icon icon="mdi:link-variant" width="14" color="#64748b" />
            <strong style={{ color: '#0f172a' }}>{lead.usuario_empresa || lead.usuario_nome || 'Conta'}</strong>
            <Tag bg={s.bg} cor={s.cor}>{s.txt}</Tag>
          </div>
          <div style={{ fontSize: '11.5px', color: '#64748b', marginTop: '2px' }}>
            {[lead.usuario_nome, lead.usuario_email].filter(Boolean).join(' · ')}
            {' · '}{lead.vinculo_manual ? 'vinculada à mão (contato extra)' : 'ligada pelo telefone'}
          </div>
        </div>
        {lead.vinculo_manual && (
          <Button variant="ghost" size="sm" icon="mdi:link-variant-off" loading={salvando}
            onClick={() => { if (window.confirm('Desvincular este lead da conta?')) vincular(null) }}>
            Desvincular
          </Button>
        )}
      </div>
    )
  }

  if (!aberto) {
    return (
      <Button variant="outline" size="sm" icon="mdi:link-variant-plus" onClick={() => setAberto(true)}>
        Vincular a uma conta
      </Button>
    )
  }

  return (
    <div style={{ border: '1px solid #e2e8f0', borderRadius: '10px', padding: '10px' }}>
      <div style={{ fontSize: '11.5px', color: '#64748b', marginBottom: '7px' }}>
        Pra quem fala por uma conta que já existe com outro número (gestor, sócio, recepção).
        O lead passa a seguir a conta: pagante, churn e reativação automáticos.
      </div>
      <SearchInput value={termo} onChange={(e) => setTermo(e.target.value)} autoFocus
        placeholder="Nome, empresa ou e-mail da conta..." size="sm" fullWidth />
      <div style={{ marginTop: '6px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
        {buscando && <span style={{ fontSize: '11.5px', color: '#94a3b8' }}>Buscando…</span>}
        {!buscando && termo.trim().length >= 2 && resultados.length === 0 && (
          <span style={{ fontSize: '11.5px', color: '#94a3b8' }}>Nenhuma conta encontrada</span>
        )}
        {resultados.map(c => {
          const s = situacao(c)
          return (
            <div key={c.id} role="button" tabIndex={0}
              onClick={() => !salvando && vincular(c)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !salvando) vincular(c) }}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', padding: '7px 8px', borderRadius: '7px', border: '1px solid #f1f5f9', cursor: salvando ? 'wait' : 'pointer', backgroundColor: '#fff' }}>
              <div style={{ minWidth: 0, fontSize: '12.5px' }}>
                <strong style={{ color: '#0f172a' }}>{c.nome_empresa || c.nome_completo || 'Sem nome'}</strong>
                <div style={{ fontSize: '11px', color: '#64748b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {[c.nome_completo, c.email, c.telefone ? formatarTelefone(c.telefone) : null].filter(Boolean).join(' · ')}
                </div>
              </div>
              <Tag bg={s.bg} cor={s.cor}>{s.txt}</Tag>
            </div>
          )
        })}
      </div>
      <div style={{ marginTop: '7px', textAlign: 'right' }}>
        <Button variant="ghost" size="sm" onClick={() => { setAberto(false); setTermo('') }}>Cancelar</Button>
      </div>
    </div>
  )
}

function FichaLead({ lead, foco, onFechar, onSalvar, onVincular, onAbrirConversa }) {
  const [status, setStatus] = useState(lead.status)
  const [retornar, setRetornar] = useState(lead.retornar_em || '')
  const [nota, setNota] = useState(lead.observacoes || '')
  const [nicho, setNicho] = useState(lead.nicho || '')
  const [alunos, setAlunos] = useState(lead.alunos ?? '')
  const [motivo, setMotivo] = useState(lead.motivo_saida || 'esgotou')
  const [salvando, setSalvando] = useState(false)
  const [telCopiado, setTelCopiado] = useState(false)

  const copiarTelefone = async () => {
    try {
      await navigator.clipboard.writeText(String(lead.telefone))
      setTelCopiado(true)
      setTimeout(() => setTelCopiado(false), 1500)
    } catch {
      window.prompt('Copie o telefone:', String(lead.telefone))
    }
  }

  const acao = proximaAcao(lead)
  // As variáveis usam o que está digitado agora, mesmo antes de salvar
  const leadVivo = { ...lead, nicho, alunos: alunos === '' ? null : Number(alunos) }
  const plano = planoPara(leadVivo.alunos)

  const camposEditados = () => {
    const patch = {
      status,
      retornar_em: retornar || null,
      observacoes: nota.trim() || null,
      nicho: nicho.trim() || null,
      alunos: alunos === '' ? null : Number(alunos)
    }
    if (status === 'perdido') patch.motivo_saida = motivo
    // Nova data no mesmo "Aguardando" = remarcação: recomeça o dia combinado
    if (status === 'aguardando' && lead.status === 'aguardando' && lead.retornar_em && retornar && retornar !== lead.retornar_em) {
      patch.remarcacoes = (lead.remarcacoes || 0) + 1
      patch.passo = null
      patch.passo_em = null
    }
    return patch
  }

  const executar = async (extra) => {
    setSalvando(true)
    try {
      await onSalvar({ ...camposEditados(), ...extra })
      onFechar()
    } catch (e) {
      window.alert('Não consegui salvar: ' + e.message)
    } finally {
      setSalvando(false)
    }
  }

  const enviei = () => {
    if (acao.aoEnviar.status) return executar({ status: acao.aoEnviar.status })
    return executar({ status: lead.status, passo: acao.aoEnviar.passo, passo_em: new Date().toISOString() })
  }

  return (
    <Modal isOpen onClose={onFechar} size="md" centered style={{ marginTop: 0 }}
      title={lead.nome || lead.usuario_nome || 'Sem nome'}
      subtitle={
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', flexWrap: 'wrap' }}>
          {lead.telefone ? formatarTelefone(lead.telefone) : 'sem número (LID)'}
          {lead.telefone && (
            <button type="button" onClick={copiarTelefone} title="Copiar telefone" aria-label="Copiar telefone"
              style={{ display: 'inline-flex', alignItems: 'center', gap: '2px', border: 'none', background: 'none', cursor: 'pointer', padding: '2px 4px', borderRadius: '4px', color: telCopiado ? '#16a34a' : '#64748b', fontSize: 'inherit' }}>
              <Icon icon={telCopiado ? 'mdi:check' : 'mdi:content-copy'} width="14" />
              {telCopiado && 'Copiado'}
            </button>
          )}
          {` · ${diasNaEtapa(lead) === 0 ? 'entrou hoje' : `${diasNaEtapa(lead)} dias`} em ${tituloColuna(colunaDoLead(lead))}`}
        </span>
      }>
      <Modal.Body>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '11px' }}>

          <ContaVinculada lead={lead} onVincular={onVincular} />

          {estadoDoLead(lead) && <PainelUso info={estadoDoLead(lead)} />}

          {lead.estagio_conversa && ESTAGIOS[lead.estagio_conversa] && (
            <div style={{
              backgroundColor: ESTAGIOS[lead.estagio_conversa].bg, color: ESTAGIOS[lead.estagio_conversa].cor,
              borderRadius: '10px', padding: '8px 12px', fontSize: '12.5px', lineHeight: 1.4
            }}>
              <strong>Estágio {ESTAGIOS[lead.estagio_conversa].sigla} · {ESTAGIOS[lead.estagio_conversa].titulo}.</strong>{' '}
              {ESTAGIOS[lead.estagio_conversa].dica}. As mensagens abaixo seguem esse estágio.
            </div>
          )}

          {acao?.tipo === 'toque' && (
            <div style={{ backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', marginBottom: '4px' }}>
                <strong style={{ fontSize: '13px', color: '#0f172a' }}>Próximo: {acao.toque.titulo}</strong>
                <TagAcao acao={acao} />
              </div>
              <div style={{ fontSize: '11.5px', color: '#64748b', marginBottom: '8px' }}>{acao.toque.objetivo}</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '7px' }}>
                {mensagensDaVez(acao.toque, lead).map((m, i) => <MensagemDaVez key={i} texto={m} lead={leadVivo} />)}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', marginTop: '10px' }}>
                <span style={{ fontSize: '11px', color: '#64748b' }}>
                  {acao.aoEnviar.status
                    ? `Ao marcar, vai pra coluna ${tituloColuna(acao.aoEnviar.status)}`
                    : 'Ao marcar, fica registrado e o próximo passo é agendado'}
                </span>
                <Button variant="primary" size="sm" icon="mdi:check" loading={salvando} onClick={enviei}>Enviei</Button>
              </div>
            </div>
          )}

          {(acao?.tipo === 'mover' || acao?.tipo === 'arquivar') && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '10px' }}>
              <TagAcao acao={acao} />
              {acao.tipo === 'mover'
                ? <Button variant="primary" size="sm" loading={salvando}
                    onClick={() => executar(acao.para === 'perdido' ? { status: 'perdido', motivo_saida: 'esgotou' } : { status: acao.para })}>
                    Mover pra {tituloColuna(acao.para)}
                  </Button>
                : <Button variant="primary" size="sm" icon="mdi:archive-outline" loading={salvando}
                    onClick={() => executar({ arquivado: true })}>Arquivar</Button>}
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '150px 1fr 84px', gap: '10px', alignItems: 'start' }}>
            <Select label="Etapa" size="sm" fullWidth value={status} onChange={setStatus}
              options={COLUNAS_ETAPA.map(c => ({ value: c.id, label: c.auto ? `${c.titulo} (auto)` : c.titulo }))} />
            <Input label="Nicho" size="sm" fullWidth value={nicho} onChange={(e) => setNicho(e.target.value)} placeholder="CT de luta, personal…" />
            <Input label="Alunos" type="number" min="0" size="sm" fullWidth value={alunos} onChange={(e) => setAlunos(e.target.value)} placeholder="—" />
          </div>
          {status === 'perdido' && (
            <Select label="Motivo da saída" size="sm" fullWidth value={motivo} onChange={setMotivo} options={MOTIVOS_SAIDA} />
          )}
          {plano && (
            <div style={{ fontSize: '11.5px', color: '#1d4ed8', marginTop: '-8px' }}>
              Plano da faixa: <strong>{plano.nome} · R$ {plano.preco}/mês</strong>
            </div>
          )}

          <div>
            <Input type="date" label={status === 'aguardando' ? 'Dia combinado' : 'Chamar em (opcional)'} size="sm" fullWidth value={retornar}
              autoFocus={foco === 'data'} onChange={(e) => setRetornar(e.target.value)} />
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '7px' }}>
              {ATALHOS_DATA.map(a => (
                <Button key={a.label} variant="outline" size="sm" onClick={() => setRetornar(a.valor())}>{a.label}</Button>
              ))}
              {retornar && <Button variant="ghost" size="sm" icon="mdi:close" onClick={() => setRetornar('')}>Limpar</Button>}
            </div>
            {status === 'aguardando' && lead.remarcacoes >= 2 && (
              <div style={{ fontSize: '11.5px', color: '#9a3412', marginTop: '6px' }}>
                Já remarcou {lead.remarcacoes}x. Na próxima, pergunte: "quando eu te chamo de verdade?"
              </div>
            )}
          </div>

          <div>
            <label style={{ display: 'block', marginBottom: '5px', fontSize: '12.5px', fontWeight: 600, color: '#334155' }}>Anotação</label>
            <textarea value={nota} onChange={(e) => setNota(e.target.value)} rows={2}
              placeholder="80 alunos / CT luta / usa planilha / pediu após dia 10"
              style={{ width: '100%', padding: '9px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '12.5px', fontFamily: 'inherit', resize: 'vertical', boxSizing: 'border-box' }} />
          </div>

          <div style={{ fontSize: '11.5px', color: '#64748b', display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
            <span>Você mandou <strong>{lead.enviadas || 0}</strong></span>
            <span>Ele mandou <strong>{lead.recebidas || 0}</strong></span>
            {lead.ultima_direcao === 'out' && Number(lead.chamadas_sem_retorno) > 0 && (
              <span>Chamei <strong>{lead.chamadas_sem_retorno}x</strong> sem retorno</span>
            )}
            <span>Chegou {tempoDesde(lead.created_at)}</span>
          </div>
        </div>
      </Modal.Body>
      <Modal.Footer align="between">
        <div style={{ display: 'flex', gap: '6px' }}>
          <Button variant="ghost" size="sm" icon="mdi:message-text-outline" onClick={onAbrirConversa}>Abrir conversa</Button>
          {lead.status === 'perdido' && !lead.arquivado && (
            <Button variant="ghost" size="sm" icon="mdi:archive-outline" onClick={() => executar({ arquivado: true })}>Arquivar</Button>
          )}
          {lead.arquivado && (
            <Button variant="ghost" size="sm" icon="mdi:archive-arrow-up-outline" onClick={() => executar({ arquivado: false })}>Desarquivar</Button>
          )}
        </div>
        <Button variant="primary" loading={salvando} onClick={() => executar({})}>Salvar</Button>
      </Modal.Footer>
    </Modal>
  )
}

export default function AbaFunil({ inbox, onAbrirConversa }) {
  const { leads, salvarLead, vincularConta } = inbox
  const [busca, setBusca] = useState('')
  const [soHoje, setSoHoje] = useState(false)
  const [estagioFiltro, setEstagioFiltro] = useState(null)
  const [verArquivados, setVerArquivados] = useState(false)
  const [ficha, setFicha] = useState(null) // { id, foco }
  const [arrastando, setArrastando] = useState(false)
  const [sobre, setSobre] = useState(null)

  const hoje = hojeISO()

  // Próxima ação calculada uma vez por lead. Quem veio do Outbound fica fora
  // enquanto é prospect (o follow-up dele é no CRM do Outbound); depois que
  // cria conta vira cliente como qualquer outro e entra no Funil — mas segue
  // fora das métricas da campanha (vw_mensalli_lead_metricas).
  const comAcao = useMemo(
    () => leads
      .filter(l => !ehOutbound(l) || ETAPAS_CLIENTE.includes(l.status))
      .map(l => ({ lead: l, acao: proximaAcao(l), coluna: colunaDoLead(l) })),
    [leads]
  )

  const emRisco = comAcao.filter(x => x.coluna === 'em_risco')
  const semConectar = comAcao.filter(x => x.coluna === 'sem_conectar')
  const inadimplentes = comAcao.filter(x => x.coluna === 'inadimplente')
  const fila = comAcao.filter(x => x.acao && x.acao.due <= hoje)
  const atrasados = fila.filter(x => x.acao.due < hoje).length
  const arquivados = comAcao.filter(x => x.lead.arquivado).length
  const contagemEstagios = {}
  comAcao.forEach(x => {
    if (x.lead.estagio_conversa && !x.lead.arquivado) contagemEstagios[x.lead.estagio_conversa] = (contagemEstagios[x.lead.estagio_conversa] || 0) + 1
  })

  const filtrados = useMemo(() => {
    let lista = comAcao.filter(x => verArquivados || !x.lead.arquivado)
    if (soHoje) lista = lista.filter(x => x.acao && x.acao.due <= hoje)
    if (estagioFiltro) lista = lista.filter(x => x.lead.estagio_conversa === estagioFiltro)
    const termo = busca.trim().toLowerCase()
    if (!termo) return lista
    const digitos = termo.replace(/\D/g, '')
    return lista.filter(({ lead: l }) =>
      (l.nome || '').toLowerCase().includes(termo) ||
      (l.usuario_nome || '').toLowerCase().includes(termo) ||
      (l.observacoes || '').toLowerCase().includes(termo) ||
      (l.nicho || '').toLowerCase().includes(termo) ||
      (digitos && String(l.telefone || '').includes(digitos))
    )
  }, [comAcao, busca, soHoje, verArquivados, hoje, estagioFiltro])

  // Prioridade: ação mais vencida em cima; sem ação vai pro fim; empate = mais
  // tempo na etapa primeiro.
  const porColuna = useMemo(() => {
    const mapa = {}
    COLUNAS.forEach(c => { mapa[c.id] = [] })
    filtrados.forEach(x => { if (mapa[x.coluna]) mapa[x.coluna].push(x) })
    Object.values(mapa).forEach(lista => lista.sort((a, b) => {
      const da = a.acao?.due || '9999-12-31'
      const db = b.acao?.due || '9999-12-31'
      if (da !== db) return da.localeCompare(db)
      const ra = ORDEM_ESTAGIOS.indexOf(a.lead.estagio_conversa)
      const rb = ORDEM_ESTAGIOS.indexOf(b.lead.estagio_conversa)
      if (ra !== rb) return (ra === -1 ? 9 : ra) - (rb === -1 ? 9 : rb)
      return String(a.lead.etapa_desde || '').localeCompare(String(b.lead.etapa_desde || ''))
    }))
    return mapa
  }, [filtrados])

  const mover = async (leadId, status) => {
    const lead = leads.find(l => l.id === leadId)
    if (!lead || lead.status === status) return
    try {
      await salvarLead(leadId, status === 'perdido' ? { status, motivo_saida: 'esgotou' } : { status })
    } catch (e) {
      window.alert('Não consegui mover o lead: ' + e.message)
      return
    }
    if (status === 'aguardando' && !lead.retornar_em) setFicha({ id: leadId, foco: 'data' })
    if (status === 'perdido') setFicha({ id: leadId, foco: 'motivo' })
  }

  const leadFicha = ficha && leads.find(l => l.id === ficha.id)

  if (leads.length === 0) {
    return (
      <EmptyState
        icon="mdi:whatsapp"
        title="Nenhum lead ainda"
        description="Assim que alguém mandar mensagem pro WhatsApp do Mensalli, o card aparece aqui automaticamente."
      />
    )
  }

  return (
    <div>
      {emRisco.length > 0 && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '12px',
          backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: '10px', padding: '8px 12px'
        }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '13px', fontWeight: 800, color: '#b91c1c' }}>
            <Icon icon="mdi:alert-circle" width="18" />
            {emRisco.length} {emRisco.length === 1 ? 'cliente em risco' : 'clientes em risco'}
          </span>
          {emRisco.map(({ lead }) => {
            const info = estadoPagante(lead)
            return (
              <button key={lead.id} type="button" onClick={() => setFicha({ id: lead.id, foco: null })}
                title="Abrir a ficha"
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontFamily: 'inherit',
                  backgroundColor: '#fff', border: '1px solid #fca5a5', borderRadius: '999px', padding: '3px 10px', fontSize: '12px', color: '#7f1d1d'
                }}>
                <strong>{lead.nome || lead.usuario_nome || 'Sem nome'}</strong>
                <span style={{ color: '#b91c1c' }}>· {MOTIVOS_RISCO[info.motivo]}</span>
              </button>
            )
          })}
        </div>
      )}

      {inadimplentes.length > 0 && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '12px',
          backgroundColor: '#fff7ed', border: '1px solid #fed7aa', borderRadius: '10px', padding: '8px 12px'
        }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '13px', fontWeight: 800, color: '#9a3412' }}>
            <Icon icon="mdi:cash-remove" width="18" />
            {inadimplentes.length} {inadimplentes.length === 1 ? 'cliente inadimplente' : 'clientes inadimplentes'}
          </span>
          {inadimplentes.map(({ lead }) => {
            const info = estadoPagante(lead)
            return (
              <button key={lead.id} type="button" onClick={() => setFicha({ id: lead.id, foco: null })}
                title="Abrir a ficha"
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontFamily: 'inherit',
                  backgroundColor: '#fff', border: '1px solid #fdba74', borderRadius: '999px', padding: '3px 10px', fontSize: '12px', color: '#7c2d12'
                }}>
                <strong>{lead.nome || lead.usuario_nome || 'Sem nome'}</strong>
                <span style={{ color: '#c2410c' }}>
                  · {info.diasVencido === null ? 'sem data' : `${info.diasVencido}d vencido`}
                  {info.diasParaChurn !== null ? ` · churn em ${info.diasParaChurn}d` : ''}
                </span>
              </button>
            )
          })}
        </div>
      )}

      {semConectar.length > 0 && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '12px',
          backgroundColor: '#fffbeb', border: '1px solid #fde68a', borderRadius: '10px', padding: '8px 12px'
        }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '13px', fontWeight: 800, color: '#92400e' }}>
            <Icon icon="mdi:whatsapp" width="18" />
            {semConectar.length} {semConectar.length === 1 ? 'conta sem conectar o WhatsApp' : 'contas sem conectar o WhatsApp'}
          </span>
          {semConectar.map(({ lead }) => (
            <button key={lead.id} type="button" onClick={() => setFicha({ id: lead.id, foco: null })}
              title="Abrir a ficha"
              style={{
                display: 'inline-flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontFamily: 'inherit',
                backgroundColor: '#fff', border: '1px solid #fcd34d', borderRadius: '999px', padding: '3px 10px', fontSize: '12px', color: '#78350f'
              }}>
              <strong>{lead.nome || lead.usuario_nome || 'Sem nome'}</strong>
              <span style={{ color: '#b45309' }}>· {fraseTrial(estadoConta(lead).trialRestante)}</span>
            </button>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', marginBottom: '14px' }}>
        <div style={{ width: '280px', maxWidth: '100%' }}>
          <SearchInput value={busca} onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar nome, telefone, nicho ou anotação..." size="sm" fullWidth />
        </div>
        <Button
          variant="outline" size="sm" icon="mdi:calendar-today"
          selected={soHoje} selectedTone="warning"
          onClick={() => setSoHoje(v => !v)}
        >
          Fila de hoje ({fila.length})
          {atrasados > 0 && <span style={{ color: '#b91c1c', marginLeft: '4px' }}>· {atrasados} atrasados</span>}
        </Button>
        {ORDEM_ESTAGIOS.some(k => contagemEstagios[k]) && (
          <>
            <span style={{ fontSize: '12px', color: '#64748b', fontWeight: 600 }}>Estágio:</span>
            {ORDEM_ESTAGIOS.filter(k => contagemEstagios[k]).map(k => (
              <Button key={k} variant="outline" size="sm" selected={estagioFiltro === k} selectedTone="info"
                title={ESTAGIOS[k].dica}
                onClick={() => setEstagioFiltro(v => (v === k ? null : k))}>
                {ESTAGIOS[k].sigla} · {ESTAGIOS[k].titulo} ({contagemEstagios[k]})
              </Button>
            ))}
          </>
        )}
        {arquivados > 0 && (
          <Button variant="ghost" size="sm" icon="mdi:archive-outline"
            selected={verArquivados} selectedTone="info"
            onClick={() => setVerArquivados(v => !v)}>
            Arquivados ({arquivados})
          </Button>
        )}
      </div>

      <div style={{ display: 'flex', gap: '10px', overflowX: 'auto', paddingBottom: '12px', alignItems: 'flex-start' }}>
        {COLUNAS.map(col => {
          const ativo = arrastando && sobre === col.id
          const lista = porColuna[col.id]
          const vencidos = lista.filter(x => x.acao && x.acao.due <= hoje).length
          return (
            <div
              key={col.id}
              onDragOver={(e) => e.preventDefault()}
              onDragEnter={() => setSobre(col.id)}
              onDrop={(e) => {
                e.preventDefault()
                setArrastando(false)
                setSobre(null)
                const leadId = e.dataTransfer.getData('leadId')
                if (leadId) {
                  // Coluna calculada: o lead continua com o status que já tem (pagante ou criou_conta)
                  const lead = leads.find(l => l.id === leadId)
                  const alvo = !col.derivada ? col.id
                    : ['base_antiga', 'puxar_conversa'].includes(col.id) ? 'conversando'
                    : ['sem_conectar', 'trial_vencido'].includes(col.id) ? 'criou_conta'
                    : 'pagante'
                  if (lead && lead.status !== alvo) mover(leadId, alvo)
                }
              }}
              style={estiloColuna(col, ativo)}
            >
              <div style={ESTILO_TITULO_COLUNA}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: col.cor }} />
                  <strong style={{ fontSize: '13px', color: '#334155' }}>{col.titulo}</strong>
                  {col.auto && (
                    <span
                      title="Preenchida automaticamente pelo estado da conta no Mensalli"
                      style={{ fontSize: '9.5px', color: col.cor, border: `1px solid ${col.cor}`, borderRadius: '4px', padding: '0 4px', fontWeight: 600 }}
                    >
                      AUTO
                    </span>
                  )}
                </div>
                <span style={{ fontSize: '12px', color: '#64748b', fontWeight: 700 }}>
                  {vencidos > 0 && <span title="Pra fazer hoje ou atrasados" style={{ color: '#b45309', marginRight: '5px' }}>{vencidos}!</span>}
                  {lista.length}
                </span>
              </div>
              <div style={ESTILO_HINT_COLUNA}>{col.hint}</div>

              {lista.map(({ lead, acao }) => (
                <CardLead
                  key={lead.id}
                  lead={lead}
                  acao={acao}
                  estado={estadoDoLead(lead)}
                  onAbrir={() => setFicha({ id: lead.id, foco: null })}
                  onDragStart={() => setArrastando(true)}
                  onDragEnd={() => { setArrastando(false); setSobre(null) }}
                />
              ))}
            </div>
          )
        })}
      </div>

      {leadFicha && (
        <FichaLead
          // Remonta quando a etapa ou a conta mudam por fora (vincular, sync):
          // senão o formulário guardaria a etapa antiga e o Salvar desfaria.
          key={`${leadFicha.id}:${leadFicha.status}:${leadFicha.usuario_id || ''}`}
          lead={leadFicha}
          foco={ficha.foco}
          onFechar={() => setFicha(null)}
          onSalvar={(patch) => salvarLead(leadFicha.id, patch)}
          onVincular={(conta) => vincularConta(leadFicha.id, conta)}
          onAbrirConversa={() => { setFicha(null); onAbrirConversa(leadFicha.id) }}
        />
      )}
    </div>
  )
}
