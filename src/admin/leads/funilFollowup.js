import TOQUES from './funilFollowup.json'
import { hojeISO } from './utils'

// Motor do funil de follow-up: dado um lead, qual é a próxima ação e quando.
//
// Trilhas (funilFollowup.json):
//   a — parou de responder antes de criar conta. Cada toque é uma COLUNA
//       (a_toque_1..a_final) e estar nela quer dizer "esse já foi". O intervalo
//       até o próximo conta da data em que você arrastou (etapa_desde).
//   b — aguardando: dia combinado (retornar_em) e reforço 3 dias depois.
//   c — criou conta: dias contados do cadastro.
//   f — pagante: onboarding nos dias 2 e 7 depois de virar pagante.
//   d — churn: dias contados do cancelamento.
//   e — fora do funil: reaquecimento 30/60/90 dias depois de sair.
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
      // Sem resposta ao reforço: segue pro toque 3 da trilha A (funil 01)
      return acaoToque(toque('a_toque_3'), somarDias(feitoEm, 4), { status: 'a_toque_3' })
    }
    return acaoToque(toque('aguardando_dia'), lead.retornar_em, { passo: 'aguardando_dia' })
  }

  if (s === 'criou_conta') {
    const base = diaBRT(lead.usuario_cadastro || lead.conta_detectada_em || lead.etapa_desde)
    return proximoSubpasso(lead, daTrilha('c'), base,
      (feitoEm) => acaoMover('perdido', somarDias(feitoEm, 3), 'Sem resposta → Fora do funil'))
  }

  if (s === 'pagante') {
    const base = diaBRT(lead.virou_pagante_em || lead.pagamento_detectado_em || lead.etapa_desde)
    // Onboarding só faz sentido nas primeiras 2 semanas; pagante antigo fica quieto.
    if (diasEntre(base, hoje) > 14) return null
    return proximoSubpasso(lead, daTrilha('f'), base, null)
  }

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
