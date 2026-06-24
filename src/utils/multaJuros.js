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
