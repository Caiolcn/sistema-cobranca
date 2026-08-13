/**
 * Leitura dos envios de cobrança a partir de `logs_mensagens`.
 *
 * Por que o log e não as colunas de `mensalidades`: as colunas `enviado_hoje`,
 * `ultima_mensagem_enviada_em` e `total_mensagens_enviadas` só são preenchidas
 * pelo envio manual do front. As cobranças automáticas rodam no n8n, que grava
 * apenas em `logs_mensagens` — hoje 97% das mensalidades com envio confirmado
 * estão com essas colunas nulas. `logs_mensagens` é a única fonte que enxerga
 * os dois caminhos.
 */

// Tipos de log que representam uma cobrança/lembrete disparado pelo Mensalli.
// Exclui payment_confirmed (confirmação de pagamento), welcome, birthday e
// class_reminder. tipo nulo = envios diretos do CRM, que contam como cobrança.
export const TIPOS_COBRANCA = new Set(['overdue', 'due_day', 'pre_due_3days']);

export const ehLogDeCobranca = (log) => log.tipo == null || TIPOS_COBRANCA.has(log.tipo);

/**
 * Agrupa logs de envio por mensalidade.
 * @param {Array} logs registros com { mensalidade_id, tipo, enviado_em }
 * @returns {Object} mensalidade_id -> { total, primeiroISO, ultimoISO }
 */
export const agruparEnviosPorMensalidade = (logs) => {
  const porMensalidade = {};

  (logs || []).forEach((l) => {
    if (!l.mensalidade_id || !ehLogDeCobranca(l)) return;

    const atual = porMensalidade[l.mensalidade_id];
    if (!atual) {
      porMensalidade[l.mensalidade_id] = {
        total: 1,
        primeiroISO: l.enviado_em,
        ultimoISO: l.enviado_em
      };
      return;
    }

    atual.total += 1;
    if (l.enviado_em && l.enviado_em < atual.primeiroISO) atual.primeiroISO = l.enviado_em;
    if (l.enviado_em && l.enviado_em > atual.ultimoISO) atual.ultimoISO = l.enviado_em;
  });

  return porMensalidade;
};

/** Dias cheios entre o envio e hoje, no fuso local (0 = enviado hoje). */
export const diasDesdeEnvio = (isoEnvio) => {
  if (!isoEnvio) return null;
  const envio = new Date(isoEnvio);
  if (Number.isNaN(envio.getTime())) return null;
  envio.setHours(0, 0, 0, 0);
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  return Math.round((hoje - envio) / 86400000);
};

/** Rótulo curto do último envio: "Cobrado hoje", "Cobrado há 3 dias"… */
export const rotuloUltimoEnvio = (envio) => {
  if (!envio || !envio.total) return null;
  const dias = diasDesdeEnvio(envio.ultimoISO);
  if (dias === null) return 'Já cobrado';
  if (dias <= 0) return 'Cobrado hoje';
  if (dias === 1) return 'Cobrado ontem';
  return `Cobrado há ${dias} dias`;
};
