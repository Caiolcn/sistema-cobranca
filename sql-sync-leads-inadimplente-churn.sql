-- ============================================================
-- sync_mensalli_leads: inadimplente vira churn depois de 30 dias (03/10/2026)
--
-- PROBLEMA
--   Conta INADIMPLENTE = plano_pago = true com o vencimento no passado (nada
--   derruba isso sozinho: cobranca-saas so avisa). O sync mandava todo lead em
--   churn de volta para 'pagante' se plano_pago = true, entao arrastar um
--   inadimplente de meses para Churn era desfeito na carga seguinte.
--
-- REGRAS NOVAS (so as marcadas com >>>)
--   >>> pagante/criou_conta com plano vencido ha MAIS DE 30 DIAS  -> 'churn'
--   >>> churn so volta a 'pagante' se o plano estiver EM DIA
--       (vencimento hoje ou no futuro). Antes bastava plano_pago = true.
--   Ate 30 dias de atraso o lead continua 'pagante' no banco e o CRM mostra na
--   coluna "Inadimplente" (calculada na tela), com os toques de renovacao.
--   Sem plano_vencimento (dado quebrado) nao vira churn sozinho: fail-closed,
--   igual ao ciclo de vida da view vw_admin_contas.
--
-- DEPOIS DE RODAR: nada a fazer. O sync roda quando o admin abre o Funil.
--
-- REVERTER: recriar a funcao sem os dois trechos novos (marcados com NOVO no corpo).
-- VERSAO ANTERIOR (para reverter) -- so troca estes dois trechos:
--
--   churn:       sem a linha  OR (u.plano_pago = TRUE AND u.plano_vencimento IS NOT NULL
--                                 AND u.plano_vencimento < NOW() - INTERVAL '30 days')
--   reativacao:  sem as linhas  AND u.plano_vencimento IS NOT NULL
--                               AND u.plano_vencimento::date >= CURRENT_DATE
-- ============================================================

CREATE OR REPLACE FUNCTION public.sync_mensalli_leads()
 RETURNS TABLE(vinculados integer, viraram_conta integer, viraram_pagante integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_vinc INT := 0;
  v_conta INT := 0;
  v_pag INT := 0;
  v_pre TEXT[] := ARRAY['conversando','aguardando','a_toque_1','a_toque_2','a_toque_3',
                        'a_toque_4','a_toque_5','a_final','perdido'];
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'apenas admin';
  END IF;

  WITH match AS (
    SELECT l.id AS lead_id,
           (SELECT u.id FROM usuarios u
             WHERE tel_chave(u.telefone) = tel_chave(l.telefone)
             ORDER BY u.data_cadastro NULLS LAST LIMIT 1) AS usuario_id
      FROM mensalli_leads l
     WHERE l.usuario_id IS NULL AND tel_chave(l.telefone) IS NOT NULL
  )
  UPDATE mensalli_leads l SET usuario_id = m.usuario_id, updated_at = NOW()
    FROM match m WHERE l.id = m.lead_id AND m.usuario_id IS NOT NULL;
  GET DIAGNOSTICS v_vinc = ROW_COUNT;

  UPDATE mensalli_leads l
     SET status = CASE WHEN l.status = ANY (v_pre) THEN 'criou_conta' ELSE l.status END,
         conta_detectada_em = NOW(), updated_at = NOW()
   WHERE l.usuario_id IS NOT NULL AND l.conta_detectada_em IS NULL;
  GET DIAGNOSTICS v_conta = ROW_COUNT;

  UPDATE mensalli_leads l
     SET status = CASE WHEN l.status = ANY (v_pre || 'criou_conta'::text) THEN 'pagante' ELSE l.status END,
         pagamento_detectado_em = NOW(), updated_at = NOW()
    FROM usuarios u
   WHERE u.id = l.usuario_id AND u.plano_pago = TRUE AND l.pagamento_detectado_em IS NULL;
  GET DIAGNOSTICS v_pag = ROW_COUNT;

  -- Churn: cancelou, deixou de ser pagante, ou (NOVO) plano vencido ha mais de 30 dias.
  UPDATE mensalli_leads l SET status = 'churn', updated_at = NOW()
    FROM usuarios u
   WHERE u.id = l.usuario_id
     AND l.status IN ('criou_conta', 'pagante')
     AND (u.cancelado_em IS NOT NULL
          OR (COALESCE(u.plano_pago, false) = false AND u.virou_pagante_em IS NOT NULL)
          OR (u.plano_pago = TRUE
              AND u.plano_vencimento IS NOT NULL
              AND u.plano_vencimento < NOW() - INTERVAL '30 days'));

  -- Reativacao: so volta a pagante quem esta com o plano EM DIA (NOVO: vencimento valido).
  UPDATE mensalli_leads l SET status = 'pagante', updated_at = NOW()
    FROM usuarios u
   WHERE u.id = l.usuario_id AND l.status = 'churn'
     AND u.plano_pago = TRUE AND u.cancelado_em IS NULL
     AND u.plano_vencimento IS NOT NULL
     AND u.plano_vencimento::date >= CURRENT_DATE;

  RETURN QUERY SELECT v_vinc, v_conta, v_pag;
END;
$function$;
