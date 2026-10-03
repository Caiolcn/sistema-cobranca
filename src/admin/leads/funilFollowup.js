import TOQUES from './funilFollowup.json'
import { hojeISO } from './utils'

// Motor do funil de follow-up: dado um lead, qual é a próxima ação e quando.
//
// Trilhas (funilFollowup.json):
//   a — parou de responder antes de criar conta. Só 2 toques, cada um é uma COLUNA e
//       estar nela quer dizer "esse já foi" (o intervalo conta de etapa_desde). O Toque 1
//       muda de texto conforme o ESTÁGIO da conversa (estagioConversa.js: A, B, C ou D);
//       o Toque 2 é igual pra todos e, sem resposta, o lead vai pro Fora do funil.
//   b — aguardando: dia combinado (retornar_em) e reforço 3 dias depois.
//   c — criou conta: D0, D1, D2, D4, D8, D15, D30 contados do cadastro. O status é um
//       só ('criou_conta'), mas a COLUNA é calculada (estadoConta): Trial, Sem conectar
//       (24h+ sem WhatsApp, pra mandar áudio) ou Trial vencido. O aviso de fim de
//       teste sai sozinho (edge trial-avisos); o CRM não repete o D2 quando ele foi.
//   f — pagante: o status é um só ('pagante'), mas a COLUNA é calculada pelo uso da
//       conta (estadoPagante): Recém pago, Ativando, Pagante ou Em risco. Os toques
//       continuam manuais; só a coluna muda sozinha.
//   d — churn: dias contados do cancelamento.
//   e — fora do funil: reaquecimento 30/60/90 dias depois de sair. Os mesmos toques valem
//       para a BASE ANTIGA: lead 'conversando' parado há mais de 30 dias (coluna calculada).
// Em b/c/f/d/e o toque enviado fica em `passo` (zerado na troca de etapa).

const porId = Object.fromEntries(TOQUES.map(t => [t.id, t]))
const daTrilha = (t) => TOQUES.filter(x => x.trilha === t)

export const toque = (id) => porId[id] || null

// ---------- datas (sempre 'YYYY-MM-DD' no fuso de Brasília) ----------
const diaBRT = (iso) => iso
  ? new Date(iso).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
  : null

const somarDias = (dia, n) => {
  const d = new Date(dia + 'T12:00:00Z')
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

// "24h úteis": o próximo dia útil depois da última mensagem
const proximoDiaUtil = (dia) => {
  let d = somarDias(dia, 1)
  while ([0, 6].includes(new Date(d + 'T12:00:00Z').getUTCDay())) d = somarDias(d, 1)
  return d
}

export const diasEntre = (de, ate) =>
  Math.round((new Date(ate + 'T12:00:00Z') - new Date(de + 'T12:00:00Z')) / 86400000)

export const diasNaEtapa = (lead) => {
  const base = diaBRT(lead.etapa_desde)
  return base ? Math.max(0, diasEntre(base, hojeISO())) : 0
}

// ---------- ações ----------
// { tipo: 'toque' | 'mover' | 'data' | 'arquivar', due, label, toque?, aoEnviar?, para? }
const acaoToque = (t, due, aoEnviar) => ({ tipo: 'toque', toque: t, due, label: t.titulo, aoEnviar })
const acaoMover = (para, due, label) => ({ tipo: 'mover', para, due, label })

// Sub-passos por data-base. Conta atrasada (backlog) cai no passo que combina
// com a idade dela, não no primeiro — é a regra do funil 01 para as 21 contas
// paradas. Nunca dois toques no mesmo dia.
function proximoSubpasso(lead, passos, base, fim) {
  const hoje = hojeISO()
  const idxFeito = passos.findIndex(p => p.id === lead.passo)
  const restantes = passos.slice(idxFeito + 1)
  const feitoEm = diaBRT(lead.passo_em)

  if (restantes.length === 0) return fim ? fim(feitoEm || hoje) : null

  const idade = diasEntre(base, hoje)
  const elegiveis = restantes.filter(p => p.dia <= idade)
  const prox = elegiveis.length ? elegiveis[elegiveis.length - 1] : restantes[0]
  let due = somarDias(base, prox.dia)
  if (feitoEm && due <= feitoEm) due = somarDias(feitoEm, 1)
  return acaoToque(prox, due, { passo: prox.id })
}

export function proximaAcao(lead) {
  const hoje = hojeISO()
  const s = lead.status

  // Em qualquer etapa de follow-up: se ele respondeu, volta pra conversa.
  const respondeu = lead.ultima_direcao === 'in'

  if (s === 'conversando') {
    if (ehBaseAntiga(lead)) return acaoBaseAntiga(lead)
    // Parado de 8 a 30 dias: sugere o Toque 1 pra hoje (sem fila vermelha de atraso)
    if (ehPuxarConversa(lead)) return acaoToque(toque('a_toque_1'), hoje, { status: 'a_toque_1' })
    if (respondeu || !lead.ultima_interacao) return null
    return acaoToque(toque('a_toque_1'), proximoDiaUtil(diaBRT(lead.ultima_interacao)), { status: 'a_toque_1' })
  }

  if (s.startsWith('a_toque_') || s === 'a_final') {
    if (respondeu) return acaoMover('conversando', hoje, 'Respondeu → Conversando')
    const trilha = daTrilha('a')
    const i = trilha.findIndex(t => t.id === s)
    const atual = trilha[i]
    const base = diaBRT(lead.etapa_desde) || hoje
    const prox = trilha[i + 1]
    if (!prox) return acaoMover('perdido', somarDias(base, 3), 'Sem resposta → Fora do funil')
    return acaoToque(prox, somarDias(base, prox.dia - atual.dia), { status: prox.id })
  }

  if (s === 'aguardando') {
    if (!lead.retornar_em) return { tipo: 'data', due: hoje, label: 'Definir o dia de chamar' }
    const feitoEm = diaBRT(lead.passo_em)
    if (lead.passo === 'aguardando_dia') {
      return acaoToque(toque('aguardando_reforco'), somarDias(feitoEm, 3), { passo: 'aguardando_reforco' })
    }
    if (lead.passo === 'aguardando_reforco') {
      // Sem resposta ao reforço: segue pro Toque 2 (a sequência A tem 2 toques)
      return acaoToque(toque('a_toque_2'), somarDias(feitoEm, 4), { status: 'a_toque_2' })
    }
    return acaoToque(toque('aguardando_dia'), lead.retornar_em, { passo: 'aguardando_dia' })
  }

  if (s === 'criou_conta') return acaoDaConta(lead)

  if (s === 'pagante') return acaoDoPagante(lead)

  if (s === 'churn') {
    const base = diaBRT(lead.cancelado_em || lead.etapa_desde)
    return proximoSubpasso(lead, daTrilha('d'), base,
      (feitoEm) => acaoMover('perdido', somarDias(feitoEm, 3), 'Sem resposta → Fora do funil'))
  }

  if (s === 'perdido') {
    if (lead.arquivado) return null
    if (respondeu) return acaoMover('conversando', hoje, 'Respondeu → Conversando')
    if (lead.motivo_saida === 'nao_claro' || lead.motivo_saida === 'sem_fit') return null
    const passos = lead.motivo_saida === 'preco_timing'
      ? daTrilha('e').filter(t => t.dia === 90)
      : daTrilha('e')
    return proximoSubpasso(lead, passos, diaBRT(lead.etapa_desde) || hoje,
      (feitoEm) => ({ tipo: 'arquivar', due: somarDias(feitoEm, 7), label: 'Sem resposta → arquivar' }))
  }

  return null
}

// Texto do toque: [ÁUDIO] no começo vira roteiro (copia sem a marca)
export const ehAudio = (msg) => /^\s*\[ÁUDIO\]/i.test(msg)
export const semMarcaAudio = (msg) => msg.replace(/^\s*\[ÁUDIO\]\s*/i, '')


// ---------- pagante: estado pelo uso da conta ----------
// Os sinais vêm da vw_admin_contas (useInbox mescla em lead.uso_*). Sem esses
// dados (view fora do ar) ninguém é acusado de risco: cai em Recém pago/Pagante.

const MARCO_ALUNOS = 5        // "já cadastrou gente de verdade"
const JANELA_RECEM = 7        // dias: Recém pago
const JANELA_ATIVANDO = 21    // dias: depois disso, marco faltando já é risco
const DIAS_SEM_ACESSO = 14
export const DIAS_PARA_CHURN = 30   // plano vencido há mais que isso = churn (ver sql-sync-leads-inadimplente-churn.sql)

export function usoDaConta(lead) {
  const tem = lead.uso_alunos !== undefined && lead.uso_alunos !== null
  const ultimo = lead.uso_ultimo_acesso || lead.uso_ultima_acao_em || null
  const hoje = hojeISO()
  return {
    tem,
    alunos: Number(lead.uso_alunos || 0),
    msgsMes: Number(lead.uso_msgs_mes || 0),
    zap: lead.uso_whatsapp === true,
    nuncaEntrou: tem && !ultimo,
    diasSemAcesso: ultimo ? Math.max(0, diasEntre(diaBRT(ultimo), hoje)) : null
  }
}

// Marcos de ativação que ainda faltam, na ordem em que travam
export const marcosFaltando = (uso) => [
  !uso.zap && 'zap',
  uso.alunos < MARCO_ALUNOS && 'alunos',
  uso.msgsMes === 0 && 'disparo'
].filter(Boolean)

// Por que está em risco (ou null). Ordem = o que é mais acionável primeiro.
function motivoRisco(uso, dias) {
  if (!uso.tem || dias <= JANELA_RECEM) return null
  const diaDoMes = Number(hojeISO().slice(8, 10))
  if (dias > 14 && uso.alunos <= 2) return 'sem_alunos'
  if (dias > 14 && !uso.zap) return 'zap'
  if (uso.nuncaEntrou || (uso.diasSemAcesso !== null && uso.diasSemAcesso >= DIAS_SEM_ACESSO)) return 'sumiu'
  // mensagens_mes zera no dia 1: só acusa depois do dia 10 para não alarmar à toa
  if (dias > JANELA_ATIVANDO && uso.alunos > 0 && uso.msgsMes === 0 && diaDoMes >= 10) return 'sem_disparo'
  return null
}

export const MOTIVOS_RISCO = {
  zap: 'WhatsApp desconectado',
  sem_alunos: 'Sem alunos cadastrados',
  sumiu: 'Sumiu da plataforma',
  sem_disparo: 'Parou de disparar'
}

export function estadoPagante(lead) {
  const hoje = hojeISO()
  const base = diaBRT(lead.virou_pagante_em || lead.pagamento_detectado_em || lead.etapa_desde) || hoje
  const dias = Math.max(0, diasEntre(base, hoje))
  const uso = usoDaConta(lead)
  const faltam = uso.tem ? marcosFaltando(uso) : []

  // Plano vencido e a conta ainda marcada como paga (ciclo da vw_admin_contas): é problema
  // de pagamento, não de uso. Vira Churn sozinho depois de DIAS_PARA_CHURN (sync_mensalli_leads).
  if (lead.uso_ciclo === 'inadimplente') {
    const venc = lead.uso_vencimento ? diaBRT(lead.uso_vencimento) : null
    const diasVencido = venc ? Math.max(0, diasEntre(venc, hoje)) : null
    return {
      estado: 'inadimplente', dias, faltam, uso, diasVencido,
      diasParaChurn: diasVencido === null ? null : Math.max(0, DIAS_PARA_CHURN - diasVencido)
    }
  }

  if (dias <= JANELA_RECEM) return { estado: 'recem_pago', dias, faltam, uso }
  const motivo = motivoRisco(uso, dias)
  if (motivo) return { estado: 'em_risco', dias, motivo, faltam, uso }
  if (dias <= JANELA_ATIVANDO && faltam.length) return { estado: 'ativando', dias, faltam, uso }
  return { estado: 'pagante', dias, faltam, uso }
}

// Em qual coluna do board o lead aparece (só o pagante é calculado)
export const colunaDoLead = (lead) => {
  if (lead.status === 'pagante') return estadoPagante(lead).estado
  if (lead.status === 'criou_conta') return estadoConta(lead).estado
  if (ehBaseAntiga(lead)) return 'base_antiga'
  if (ehPuxarConversa(lead)) return 'puxar_conversa'
  return lead.status
}

// Mensagens do toque, trocando pela variante do marco que falta (ou do motivo
// do risco). Sem variante, vale o texto padrão do toque.
export function mensagensDaVez(t, lead) {
  if (!t) return []
  if (!t.variantes) return t.mensagens
  let chave = null
  if (lead.status === 'pagante') {
    const { estado, faltam, motivo } = estadoPagante(lead)
    chave = estado === 'em_risco' ? motivo : faltam[0]
  } else if (lead.status === 'criou_conta') {
    chave = estadoConta(lead).faltam[0]
  } else if (lead.status === 'churn') {
    chave = lead.cancelado_em ? null : 'venceu'
  } else {
    // conversa parada (A, B, C ou D), vinda do histórico de mensagens (estagioConversa.js)
    chave = lead.estagio_conversa || null
  }
  return t.variantes[chave] || t.mensagens
}

// Toques manuais do pagante. D30/D60 só aparecem numa janela de 15 dias, senão a
// base inteira de pagantes antigos viraria uma fila atrasada de uma vez.
function acaoDoPagante(lead) {
  const hoje = hojeISO()
  const { estado, dias } = estadoPagante(lead)
  const base = diaBRT(lead.virou_pagante_em || lead.pagamento_detectado_em || lead.etapa_desde) || hoje
  const feitoEm = diaBRT(lead.passo_em)

  if (estado === 'inadimplente') {
    const venc = lead.uso_vencimento ? diaBRT(lead.uso_vencimento) : null
    if (!venc) return null
    return proximoSubpasso(lead, ['f_inad_5', 'f_inad_12', 'f_inad_22'].map(toque), venc, null)
  }
  if (estado === 'recem_pago') {
    return proximoSubpasso(lead, ['f_d2', 'f_d5'].map(toque), base, null)
  }
  if (estado === 'ativando') {
    return proximoSubpasso(lead, ['f_a8', 'f_a12', 'f_a18'].map(toque), base, null)
  }

  if (estado === 'em_risco') {
    // Recomeça se o último toque de risco foi há mais de 30 dias
    const recente = feitoEm && diasEntre(feitoEm, hoje) <= 30
    if (recente && lead.passo === 'f_risco_1') {
      return acaoToque(toque('f_risco_2'), somarDias(feitoEm, toque('f_risco_2').dia), { passo: 'f_risco_2' })
    }
    if (recente && lead.passo === 'f_risco_2') return null
    return acaoToque(toque('f_risco_1'), hoje, { passo: 'f_risco_1' })
  }

  // pagante usando: check-ins de 1 e 2 meses
  if (lead.passo === 'f_d60') return null
  if (lead.passo === 'f_d30') {
    return dias <= 74 ? acaoToque(toque('f_d60'), somarDias(base, 60), { passo: 'f_d60' }) : null
  }
  if (dias < 45) return acaoToque(toque('f_d30'), somarDias(base, 30), { passo: 'f_d30' })
  if (dias <= 74) return acaoToque(toque('f_d60'), somarDias(base, 60), { passo: 'f_d60' })
  return null
}


// ---------- conta em teste (criou_conta): estado pelo uso ----------
// O teste dura 3 dias. Colunas calculadas (o status no banco continua 'criou_conta'):
//   criou_conta    Trial: teste vigente, dentro de 24h ou já conectado
//   sem_conectar   teste vigente, 24h+ de conta e WhatsApp desconectado
//   trial_vencido  o teste acabou e não pagou (D4, D8, D15, D30)
const HORAS_SEM_CONECTAR = 24

export function estadoConta(lead) {
  const hoje = hojeISO()
  const cadastro = lead.usuario_cadastro || lead.conta_detectada_em || lead.etapa_desde
  const base = diaBRT(cadastro) || hoje
  const dias = Math.max(0, diasEntre(base, hoje))
  const horas = cadastro ? (Date.now() - new Date(cadastro).getTime()) / 3600000 : dias * 24
  const uso = usoDaConta(lead)
  const faltam = uso.tem ? marcosFaltando(uso) : []
  const fimDia = lead.trial_fim ? diaBRT(lead.trial_fim) : somarDias(base, 3)
  const trialRestante = diasEntre(hoje, fimDia) // negativo = venceu há N dias

  let estado = 'criou_conta'
  if (trialRestante < 0) estado = 'trial_vencido'
  else if (uso.tem && !uso.zap && horas >= HORAS_SEM_CONECTAR) estado = 'sem_conectar'

  return { estado, dias, horas, faltam, uso, trialRestante, avisoFimEm: lead.uso_aviso_fim_em || null }
}

// Toques manuais da conta em teste. O D2 é o aviso de "teste termina amanhã" que a
// edge trial-avisos já manda sozinha: se ela foi, o CRM pula o D2 pra não repetir.
function acaoDaConta(lead) {
  const base = diaBRT(lead.usuario_cadastro || lead.conta_detectada_em || lead.etapa_desde)
  const passos = daTrilha('c').filter(t => !(t.id === 'c_d2' && lead.uso_aviso_fim_em))
  return proximoSubpasso(lead, passos, base,
    (feitoEm) => acaoMover('perdido', somarDias(feitoEm, 3), 'Sem resposta → Fora do funil'))
}


// ---------- base antiga: conversando parado há mais de 30 dias ----------
// O status continua 'conversando'. A coluna é calculada e os toques são os de
// reaquecimento (trilha e), contados da última conversa. Depois que você manda o
// toque, a "última conversa" vira agora; por isso o lead FICA na base antiga
// enquanto o último movimento for o seu toque. Se ele responder (ou você
// conversar com ele), sai e volta pro papo normal.
export const DIAS_BASE_ANTIGA = 30
const ESPACO_REAQUECIMENTO = 30 // dias entre um toque de reaquecimento e o seguinte

// O último toque de reaquecimento vale se foi enviado em torno da última interação
// (a própria mensagem do toque é a última interação). Passo velho de um ciclo
// anterior de silêncio é ignorado.
function reaquecimentoVigente(lead) {
  if (!lead.passo || !lead.passo.startsWith('reaq_') || !lead.passo_em || !lead.ultima_interacao) return false
  return new Date(lead.passo_em).getTime() >= new Date(lead.ultima_interacao).getTime() - 24 * 3600000
}

export function ehBaseAntiga(lead) {
  if (lead.status !== 'conversando' || lead.arquivado || !lead.ultima_interacao) return false
  if (reaquecimentoVigente(lead)) return true
  return diasEntre(diaBRT(lead.ultima_interacao), hojeISO()) > DIAS_BASE_ANTIGA
}

// Parado de 8 a 30 dias e a última mensagem foi sua (se foi dele, você ainda
// deve a resposta: continua em Conversando). Aos 30 dias vira Reaquecimento.
export const DIAS_PUXAR_CONVERSA = 7
export function ehPuxarConversa(lead) {
  if (lead.status !== 'conversando' || lead.arquivado || !lead.ultima_interacao) return false
  if (lead.ultima_direcao === 'in' || ehBaseAntiga(lead)) return false
  return diasEntre(diaBRT(lead.ultima_interacao), hojeISO()) > DIAS_PUXAR_CONVERSA
}

function acaoBaseAntiga(lead) {
  const hoje = hojeISO()
  const reaq = daTrilha('e')

  if (reaquecimentoVigente(lead)) {
    const feitoEm = diaBRT(lead.passo_em)
    const prox = reaq[reaq.findIndex(t => t.id === lead.passo) + 1]
    if (!prox) return { tipo: 'arquivar', due: somarDias(feitoEm, 7), label: 'Sem resposta → arquivar' }
    return acaoToque(prox, somarDias(feitoEm, ESPACO_REAQUECIMENTO), { passo: prox.id })
  }

  // Primeiro toque: o que combina com o tempo de silêncio, pra hoje (sem fila vermelha de atraso)
  const idade = diasEntre(diaBRT(lead.ultima_interacao), hoje)
  const primeiro = idade >= 90 ? toque('reaq_90') : idade >= 60 ? toque('reaq_60') : toque('reaq_30')
  return acaoToque(primeiro, hoje, { passo: primeiro.id })
}
