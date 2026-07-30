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
 * Valor que a mensalidade realmente representa hoje, já com multa/juros.
 *
 * Fonte da verdade por estado:
 *   - PAGA com valor_pago gravado → o que foi recebido de fato (baixa manual ou webhook
 *             do Asaas). O gestor pode ter editado os valores na baixa, então recalcular
 *             pela config mentiria sobre o recibo. Pagamento pelo portal grava só o total:
 *             sem quebra multa×juros, o acréscimo vem inteiro em `acrescimo`.
 *   - PAGA sem valor_pago → nada foi registrado; estima pela config na data da baixa.
 *   - ABERTA/ATRASADA → projeção pela config (é o que o portal vai cobrar se pagar hoje).
 *
 * @param {object} mensalidade - linha de `mensalidades`
 * @param {object} config - usuarios.asaas_multa_juros
 * @param {string|Date} [hoje] - data de referência da projeção
 * @returns {{ base:number, multa:number, juros:number, acrescimo:number, total:number, temAcrescimo:boolean, projetado:boolean }}
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
    const pago = parseFloat(String(mensalidade.valor_pago))
    const total = Number.isFinite(pago) && pago > 0
      ? Math.round(pago * 100) / 100
      : Math.round((base + multa + juros) * 100) / 100
    const acrescimo = Math.round((total - base) * 100) / 100
    return {
      base,
      multa,
      juros,
      acrescimo,
      total,
      temAcrescimo: acrescimo > 0.005,
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
    total: mj.total,
    temAcrescimo: acrescimo > 0.005,
    // Já paga = valor fechado (estimado pela config), não "cresce mais"
    projetado: !paga
  }
}
