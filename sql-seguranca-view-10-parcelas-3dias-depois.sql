-- =====================================================================
-- Segurança das views — 10/19: vw_parcelas_3dias_depois
-- =====================================================================
-- Problema: roda como `postgres` (ignora RLS), sem filtro de dono, liberada pro
-- papel `authenticated`. Qualquer cliente logado lia, de TODAS as contas: aluno,
-- telefone, valor com multa/juros, chave PIX, portal_token e a `evolution_api_key` global.
--
-- Correção: mesma trava das views anteriores (pode_ver_painel_admin()).
-- Cliente logado passa a receber 0 linhas; admin, service_role e SQL Editor
-- continuam vendo tudo. Definição original embrulhada sem alteração.
--
-- Quem usa: funções do banco materializar_fila_dia (cron fila-materializar,
-- 8h30 BRT, como postgres sem JWT) e reivindicar_fila_lote (edge mensagens-worker,
-- service_role) e n8n (cobrancas-3em1) com a chave secreta. Todos passam na trava. Nenhuma tela do app usa.
-- A conferência abaixo roda no MESMO contexto do cron (postgres, sem JWT): se a
-- contagem bater, o cron enxerga igual.
--
-- CHECAR NO DIA SEGUINTE (depois das 8h30 BRT, quando o cron fila-materializar
-- roda): a fila do dia tem que ter sido montada normalmente.
--   SELECT tipo, estado, count(*) FROM mensagens_fila
--   WHERE (criado_em AT TIME ZONE 'America/Sao_Paulo')::date = (now() AT TIME ZONE 'America/Sao_Paulo')::date
--   GROUP BY tipo, estado ORDER BY tipo, estado;
-- =====================================================================

-- ---------------------------------------------------------------------
-- ROLLBACK (só se precisar voltar): rode o bloco abaixo sem os "--".
-- ---------------------------------------------------------------------
-- CREATE OR REPLACE VIEW public.vw_parcelas_3dias_depois AS
--  SELECT parcela_id,
--     valor_em_aberto,
--     data_vencimento,
--     status,
--     enviado_3dias_depois,
--     total_envios,
--     dias_atraso,
--     devedor_id,
--     nome_cliente,
--     telefone,
--     user_id,
--     nome_empresa,
--     chave_pix,
--     template_mensagem,
--     evolution_instance_name,
--     evolution_api_key,
--     evolution_api_url,
--     portal_token,
--     metodo_pagamento,
--     valor_multa,
--     valor_juros,
--     valor_total,
--     nome_aluno_real,
--     nome_responsavel
--    FROM ( SELECT m.id AS parcela_id,
--             m.valor AS valor_em_aberto,
--             m.data_vencimento,
--             m.status,
--             m.enviado_3dias_depois,
--             m.total_envios,
--             3 AS dias_atraso,
--             d.id AS devedor_id,
--             d.nome AS nome_cliente,
--             COALESCE(d.responsavel_telefone, d.telefone) AS telefone,
--             d.user_id,
--             u.nome_empresa,
--             u.chave_pix,
--             COALESCE(t.mensagem, ''::text) AS template_mensagem,
--             mz.instance_name AS evolution_instance_name,
--             ( SELECT config.valor FROM config WHERE config.chave = 'evolution_api_key'::text LIMIT 1) AS evolution_api_key,
--             ( SELECT config.valor FROM config WHERE config.chave = 'evolution_api_url'::text LIMIT 1) AS evolution_api_url,
--             d.portal_token,
--             ( SELECT config.valor FROM config WHERE config.chave = (d.user_id::text || '_metodo_pagamento_whatsapp'::text) LIMIT 1) AS metodo_pagamento,
--                 CASE
--                     WHEN COALESCE((u.asaas_multa_juros ->> 'ativo'::text)::boolean, false) THEN round(m.valor * COALESCE((u.asaas_multa_juros ->> 'multa_percent'::text)::numeric, 0::numeric) / 100::numeric, 2)
--                     ELSE 0::numeric
--                 END AS valor_multa,
--                 CASE
--                     WHEN COALESCE((u.asaas_multa_juros ->> 'ativo'::text)::boolean, false) THEN round(m.valor * COALESCE((u.asaas_multa_juros ->> 'juros_mes_percent'::text)::numeric, 0::numeric) / 100::numeric * (GREATEST(0, CURRENT_DATE - m.data_vencimento)::numeric / 30::numeric), 2)
--                     ELSE 0::numeric
--                 END AS valor_juros,
--                 CASE
--                     WHEN COALESCE((u.asaas_multa_juros ->> 'ativo'::text)::boolean, false) THEN round(m.valor + m.valor * COALESCE((u.asaas_multa_juros ->> 'multa_percent'::text)::numeric, 0::numeric) / 100::numeric + m.valor * COALESCE((u.asaas_multa_juros ->> 'juros_mes_percent'::text)::numeric, 0::numeric) / 100::numeric * (GREATEST(0, CURRENT_DATE - m.data_vencimento)::numeric / 30::numeric), 2)
--                     ELSE m.valor
--                 END AS valor_total,
--             d.nome AS nome_aluno_real,
--             NULLIF(TRIM(BOTH FROM d.responsavel_nome), ''::text) AS nome_responsavel
--            FROM mensalidades m
--              JOIN devedores d ON m.devedor_id = d.id
--              JOIN usuarios u ON d.user_id = u.id
--              JOIN configuracoes_cobranca c ON c.user_id = d.user_id
--              LEFT JOIN mensallizap mz ON mz.user_id = d.user_id
--              LEFT JOIN templates t ON t.user_id = d.user_id AND t.tipo = 'overdue'::text AND t.ativo = true
--           WHERE (m.data_vencimento = (CURRENT_DATE - '3 days'::interval) OR EXTRACT(dow FROM CURRENT_DATE) = 1::numeric AND c.enviar_domingo = false AND m.data_vencimento = (CURRENT_DATE - '4 days'::interval)) AND m.status <> 'pago'::text AND (m.enviado_3dias_depois IS NULL OR m.enviado_3dias_depois = false) AND c.enviar_3_dias_depois = true AND NOT (EXTRACT(dow FROM CURRENT_DATE) = 0::numeric AND c.enviar_domingo = false) AND (d.lixo IS NULL OR d.lixo = false) AND (d.bloquear_mensagens IS NULL OR d.bloquear_mensagens = false) AND (d.comunicacoes_ativas IS NULL OR d.comunicacoes_ativas = true) AND d.assinatura_ativa = true AND (u.plano_pago = true OR u.trial_ativo = true AND u.trial_fim::date >= CURRENT_DATE) AND mz.conectado = true AND (m.lixo IS NULL OR m.lixo = false) AND usuario_tem_plano(d.user_id, 'pro'::text)) _orig
--   WHERE usuario_pode_enviar(user_id) AND usuario_tem_plano(user_id, 'pro'::text);

-- =====================================================================
-- APLICAR
-- =====================================================================

DO $$
DECLARE
  def text := pg_get_viewdef('public.vw_parcelas_3dias_depois'::regclass);
BEGIN
  IF def ILIKE '%pode_ver_painel_admin%' THEN
    RAISE NOTICE 'vw_parcelas_3dias_depois já tem a trava — nada a fazer';
    RETURN;
  END IF;

  EXECUTE format(
    'CREATE OR REPLACE VIEW public.vw_parcelas_3dias_depois AS SELECT base.* FROM (%s) base WHERE (SELECT public.pode_ver_painel_admin())',
    rtrim(btrim(def), ';')
  );
END $$;

-- Conferência: no SQL Editor (sem JWT) a trava libera, então a contagem
-- continua a de antes; trava_aplicada tem que vir true.
SELECT
  (SELECT count(*) FROM public.vw_parcelas_3dias_depois) AS linhas_visiveis_no_editor,
  pg_get_viewdef('public.vw_parcelas_3dias_depois'::regclass) ILIKE '%pode_ver_painel_admin%' AS trava_aplicada;
