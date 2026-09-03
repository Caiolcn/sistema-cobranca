/**
 * Cálculo de multa e juros por atraso de mensalidade.
 *
 * FONTE ÚNICA no front-end (baixa manual, mensagens). A edge function
 * `supabase/functions/portal-pagar/index.ts` mantém uma cópia desta mesma
 * fórmula (runtime Deno, não compartilha código) — qualquer mudança aqui
 * precisa ser refletida lá para o portal não divergir.
 *
 * Regra:
 *   - Só aplica se a config estiver ativa E houver atraso (diasAtraso > 0).
 *   - Multa: percentual único sobre o valor base.
 *   - Juros: percentual ao mês, pró-rata por dia de atraso (diasAtraso / 30).
 *
 * @param {number|string} valorBase    - valor da mensalidade
 * @param {string|Date}   dataVencimento - data de vencimento (ISO yyyy-mm-dd)
 * @param {object} config - { ativo, multa_percent, juros_mes_percent } (usuarios.asaas_multa_juros)
 * @param {string|Date} [hoje] - data de referência; default: hoje
 * @returns {{ diasAtraso: number, multa: number, juros: number, total: number }}
 */
export function calcularMultaJuros(valorBase, dataVencimento, config, hoje) {
  const base = parseFloat(String(valorBase)) || 0
  const mj = config || {}

  const hojeMs = hoje ? Date.parse(hoje) : Date.parse(new Date().toISOString().split('T')[0])
  const vencMs = Date.parse(dataVencimento)
  const diasAtraso = Number.isNaN(vencMs)
    ? 0
    : Math.max(0, Math.floor((hojeMs - vencMs) / 86400000))

  let multa = 0
  let juros = 0
  if (mj.ativo && diasAtraso > 0) {
    multa = base * (Number(mj.multa_percent || 0) / 100)
    juros = base * (Number(mj.juros_mes_percent || 0) / 100) * (diasAtraso / 30)
  }

  multa = Math.round(multa * 100) / 100
  juros = Math.round(juros * 100) / 100
  const total = Math.round((base + multa + juros) * 100) / 100

  return { diasAtraso, multa, juros, total }
}

/**
 * Valor que a mensalidade realmente representa hoje, já com multa/juros e desconto.
 *
 * Fonte da verdade por estado:
 *   - PAGA com valor_pago gravado → o que foi recebido de fato (baixa manual ou webhook
 *             do Asaas). O gestor pode ter editado os valores na baixa, então recalcular
 *             pela config mentiria sobre o recibo. Pagamento pelo portal grava só o total:
 *             sem quebra multa×juros, o acréscimo vem inteiro em `acrescimo`.
 *   - PAGA sem valor_pago → nada foi registrado; estima pela config na data da baixa.
 *   - ABERTA/ATRASADA → projeção pela config (é o que o portal vai cobrar se pagar hoje).
 *
 * `acrescimo` é SÓ a parte que soma (multa + juros) e `desconto` só a que abate — as duas
 * sempre positivas, pra nenhuma tela escrever "+ R$ -20,00 multa/juros". Quem quer o efeito
 * líquido usa `ajuste` (com sinal) ou direto o `total`.
 *
 * Desconto só existe em parcela paga: é concedido na baixa manual, então projeção de parcela
 * aberta nunca desconta nada (o portal e o gateway cobram o valor cheio).
 *
 * @param {object} mensalidade - linha de `mensalidades`
 * @param {object} config - usuarios.asaas_multa_juros
 * @param {string|Date} [hoje] - data de referência da projeção
 * @returns {{ base:number, multa:number, juros:number, acrescimo:number, desconto:number, ajuste:number, total:number, temAcrescimo:boolean, temDesconto:boolean, projetado:boolean }}
 */
export function valorEfetivoMensalidade(mensalidade, config, hoje) {
  const base = parseFloat(String(mensalidade?.valor)) || 0

  // Paga sem NADA gravado (baixa antiga, baixa pela tela de Clientes, webhook do Asaas):
  // não dá pra saber o que entrou, então projeta pela config na data da baixa.
  const paga = mensalidade?.status === 'pago'
  const semRegistro = paga && mensalidade.valor_pago == null
  const referencia = semRegistro ? (mensalidade.data_pagamento || hoje) : hoje

  if (paga && !semRegistro) {
    const multa = parseFloat(String(mensalidade.valor_multa)) || 0
    const juros = parseFloat(String(mensalidade.valor_juros)) || 0
    const desconto = Math.max(0, parseFloat(String(mensalidade.valor_desconto)) || 0)
    const pago = parseFloat(String(mensalidade.valor_pago))
    // Cortesia (desconto de 100%) grava valor_pago = 0: aí o zero é o valor real,
    // não "não registrado", senão o recibo voltaria a mostrar a mensalidade cheia.
    const total = Number.isFinite(pago) && (pago > 0 || desconto > 0)
      ? Math.round(pago * 100) / 100
      : Math.round((base + multa + juros - desconto) * 100) / 100
    // Pagamento pelo portal grava só o total (sem quebra): o que passou da base é acréscimo.
    const acrescimo = (multa + juros) > 0.005
      ? Math.round((multa + juros) * 100) / 100
      : Math.max(0, Math.round((total - base + desconto) * 100) / 100)
    return {
      base,
      multa,
      juros,
      acrescimo,
      desconto,
      ajuste: Math.round((acrescimo - desconto) * 100) / 100,
      total,
      temAcrescimo: acrescimo > 0.005,
      temDesconto: desconto > 0.005,
      projetado: false
    }
  }

  const mj = calcularMultaJuros(base, mensalidade?.data_vencimento, config, referencia)
  const acrescimo = Math.round((mj.multa + mj.juros) * 100) / 100
  return {
    base,
    multa: mj.multa,
    juros: mj.juros,
    acrescimo,
    desconto: 0,
    ajuste: acrescimo,
    total: mj.total,
    temAcrescimo: acrescimo > 0.005,
    temDesconto: false,
    // Já paga = valor fechado (estimado pela config), não "cresce mais"
    projetado: !paga
  }
}

/**
 * Linha de detalhe do valor: de onde saiu o total que a tela está mostrando.
 *
 * Fonte única das 4 telas que exibem valor de mensalidade (lista e modal do Financeiro,
 * card mobile, histórico da ficha do aluno) pra nenhuma delas divergir na redação.
 *
 * @param {object} efetivo - retorno de valorEfetivoMensalidade
 * @param {(v:number)=>string} fmt - formatador de moeda da tela chamadora
 * @returns {string|null} null quando não há nada a explicar (total = base)
 */
export function resumoValorEfetivo(efetivo, fmt) {
  if (!efetivo) return null

  // Parcela em aberto: o acréscimo é projeção, ainda não aconteceu.
  if (efetivo.projetado) {
    return efetivo.temAcrescimo ? `+ ${fmt(efetivo.acrescimo)} se pagar hoje` : null
  }

  const partes = []
  if (efetivo.temAcrescimo) partes.push(`+ ${fmt(efetivo.acrescimo)} multa/juros`)
  if (efetivo.temDesconto) partes.push(`− ${fmt(efetivo.desconto)} desconto`)
  if (!partes.length) return null

  return `${fmt(efetivo.base)} ${partes.join(' ')}`
}

/**
 * Cor do detalhe: âmbar quando o aluno pagou mais que a base, verde quando pagou menos.
 * @param {object} efetivo - retorno de valorEfetivoMensalidade
 */
export function corValorEfetivo(efetivo) {
  return efetivo?.temAcrescimo ? '#b45309' : '#0f766e'
}
