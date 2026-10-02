-- ============================================================
-- Funil de leads v4 (02/10/26) — vincular lead a uma conta à mão
--
-- Caso: o William é gestor de um cliente que já paga. O telefone dele não é o
-- da conta, então o sync (que casa por telefone) nunca liga os dois. Pela
-- ficha do lead dá pra escolher a conta; o lead passa a seguir o estado dela
-- (pagante/churn automáticos) e fica marcado como vinculo_manual.
--
-- vinculo_manual = contato EXTRA de uma conta: sai das métricas do funil, pra
-- um cliente com dois números não contar como dois pagantes.
-- ============================================================

ALTER TABLE mensalli_leads ADD COLUMN IF NOT EXISTS vinculo_manual BOOLEAN NOT NULL DEFAULT false;

-- Métricas: mesma view, só com o filtro a mais no WHERE final
DO $$
DECLARE
  v_def TEXT := pg_get_viewdef('vw_mensalli_lead_metricas'::regclass);
  v_novo TEXT;
BEGIN
  IF position('vinculo_manual' IN v_def) = 0 THEN
    v_novo := replace(v_def, 'WHERE (l.ignorado = false);',
                             'WHERE ((l.ignorado = false) AND (l.vinculo_manual = false));');
    IF v_novo = v_def THEN
      RAISE EXCEPTION 'não achei o WHERE final de vw_mensalli_lead_metricas';
    END IF;
    EXECUTE 'CREATE OR REPLACE VIEW vw_mensalli_lead_metricas AS ' || v_novo;
  END IF;
END $$;
ALTER VIEW vw_mensalli_lead_metricas SET (security_invoker = true);

-- Board: + vinculo_manual e nome da empresa (colunas novas no fim)
CREATE OR REPLACE VIEW vw_mensalli_leads WITH (security_invoker = true) AS
 SELECT l.id, l.remote_jid, l.telefone, l.nome, l.status, l.origem, l.usuario_id,
    l.conta_detectada_em, l.pagamento_detectado_em, l.ultima_mensagem, l.ultima_direcao,
    l.ultima_interacao, l.observacoes, l.retornar_em, l.created_at, l.updated_at, l.ignorado,
    l.nicho, l.alunos, l.fila, l.toque_num, l.proximo_toque_em, l.nao_lidas, l.lido_em,
    u.nome_completo AS usuario_nome, u.email AS usuario_email, u.plano_pago, u.trial_ativo,
    u.trial_fim, u.data_cadastro AS usuario_cadastro,
    ( SELECT count(*) FROM mensalli_lead_mensagens m WHERE m.lead_id = l.id) AS total_mensagens,
    COALESCE(l.ultima_direcao = 'in' AND l.status <> 'perdido', false) AS esperando_resposta,
    round(EXTRACT(epoch FROM now() - l.ultima_interacao) / 60)::integer AS minutos_parado,
    COALESCE(l.proximo_toque_em <= CURRENT_DATE, false) AS toque_vencido,
    l.etapa_desde,
    mc.enviadas,
    mc.recebidas,
    mc.ultima_recebida_em,
    ( SELECT count(*) FROM mensalli_lead_mensagens m
       WHERE m.lead_id = l.id AND m.direcao = 'out'
         AND (mc.ultima_recebida_em IS NULL OR m.enviado_em > mc.ultima_recebida_em)) AS enviadas_sem_resposta,
    u.virou_pagante_em,
    u.cancelado_em,
    ( SELECT count(DISTINCT (m.enviado_em AT TIME ZONE 'America/Sao_Paulo')::date)
        FROM mensalli_lead_mensagens m
       WHERE m.lead_id = l.id AND m.direcao = 'out'
         AND (mc.ultima_recebida_em IS NULL
              OR (m.enviado_em AT TIME ZONE 'America/Sao_Paulo')::date
                 > (mc.ultima_recebida_em AT TIME ZONE 'America/Sao_Paulo')::date)) AS chamadas_sem_retorno,
    l.passo,
    l.passo_em,
    l.remarcacoes,
    l.arquivado,
    l.motivo_saida,
    l.vinculo_manual,
    u.nome_empresa AS usuario_empresa
   FROM mensalli_leads l
     LEFT JOIN usuarios u ON u.id = l.usuario_id
     LEFT JOIN LATERAL (
       SELECT count(*) FILTER (WHERE m.direcao = 'out') AS enviadas,
              count(*) FILTER (WHERE m.direcao = 'in')  AS recebidas,
              max(m.enviado_em) FILTER (WHERE m.direcao = 'in') AS ultima_recebida_em
         FROM mensalli_lead_mensagens m
        WHERE m.lead_id = l.id
     ) mc ON true
  WHERE l.ignorado = false;
