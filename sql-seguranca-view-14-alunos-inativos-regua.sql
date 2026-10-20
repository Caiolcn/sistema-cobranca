-- =====================================================================
-- Segurança das views — 14/19: vw_alunos_inativos_regua
-- =====================================================================
-- Problema: roda como `postgres` (ignora RLS), sem filtro de dono, liberada pro
-- papel `authenticated`. Qualquer cliente logado lia, de TODAS as contas, os alunos sumidos
-- (nome, telefone, dias sem aparecer) e a `evolution_api_key` global.
--
-- Correção: mesma trava das views anteriores (pode_ver_painel_admin()).
-- Cliente logado passa a receber 0 linhas; admin, service_role e SQL Editor
-- continuam vendo tudo. Definição original embrulhada sem alteração.
--
-- Quem usa: n8n (agente-recuperacao-inativos) com a chave secreta → passa na trava.
-- Nenhuma tela do app, edge function nem função do banco usa.
--
-- CHECAR: na próxima rodada do agente-recuperacao-inativos, as mensagens de
-- 15/30/45 dias continuam saindo (devedores.recuperacao_ultimo_envio atualizando).
-- =====================================================================

-- ---------------------------------------------------------------------
-- ROLLBACK (só se precisar voltar): rode o bloco abaixo sem os "--".
-- ---------------------------------------------------------------------
-- CREATE OR REPLACE VIEW public.vw_alunos_inativos_regua AS
--  SELECT devedor_id,
--     user_id,
--     nome_cliente,
--     telefone,
--     recuperacao_status,
--     recuperacao_ultimo_envio,
--     ultima_presenca,
--     dias_sem_aparecer,
--     plano,
--     plano_pago,
--     trial_ativo,
--     nome_empresa,
--     evolution_instance_name,
--     evolution_api_key,
--     evolution_api_url,
--     usage_count,
--     limite_mensal,
--     template_15,
--     template_30,
--     template_45,
--     proxima_mensagem
--    FROM ( SELECT d.id AS devedor_id,
--             d.user_id,
--             d.nome AS nome_cliente,
--             d.telefone,
--             d.recuperacao_status,
--             d.recuperacao_ultimo_envio,
--             max(p.data) AS ultima_presenca,
--             CURRENT_DATE - max(p.data) AS dias_sem_aparecer,
--             u.plano,
--             u.plano_pago,
--             u.trial_ativo,
--             u.nome_empresa,
--             mz.instance_name AS evolution_instance_name,
--             ( SELECT config.valor FROM config WHERE config.chave = 'evolution_api_key'::text LIMIT 1) AS evolution_api_key,
--             ( SELECT config.valor FROM config WHERE config.chave = 'evolution_api_url'::text LIMIT 1) AS evolution_api_url,
--             cp.usage_count,
--             cp.limite_mensal,
--             COALESCE(t15.mensagem, ''::text) AS template_15,
--             COALESCE(t30.mensagem, ''::text) AS template_30,
--             COALESCE(t45.mensagem, ''::text) AS template_45,
--                 CASE
--                     WHEN d.recuperacao_status IS NULL AND (CURRENT_DATE - max(p.data)) >= 15 AND (CURRENT_DATE - max(p.data)) < 30 THEN '15dias'::text
--                     WHEN d.recuperacao_status = '15dias'::text AND (CURRENT_DATE - max(p.data)) >= 30 AND (CURRENT_DATE - max(p.data)) < 45 THEN '30dias'::text
--                     WHEN d.recuperacao_status = '30dias'::text AND (CURRENT_DATE - max(p.data)) >= 45 THEN '45dias'::text
--                     ELSE NULL::text
--                 END AS proxima_mensagem
--            FROM devedores d
--              JOIN usuarios u ON u.id = d.user_id
--              JOIN configuracoes_cobranca cc ON cc.user_id = d.user_id AND cc.recuperacao_inativos_ativa = true
--              JOIN mensallizap mz ON mz.user_id = d.user_id AND mz.conectado = true
--              JOIN presencas p ON p.devedor_id = d.id AND p.presente = true
--              LEFT JOIN controle_planos cp ON cp.user_id = d.user_id
--              LEFT JOIN templates t15 ON t15.user_id = d.user_id AND t15.tipo = 'recuperacao_15'::text AND t15.ativo = true
--              LEFT JOIN templates t30 ON t30.user_id = d.user_id AND t30.tipo = 'recuperacao_30'::text AND t30.ativo = true
--              LEFT JOIN templates t45 ON t45.user_id = d.user_id AND t45.tipo = 'recuperacao_45'::text AND t45.ativo = true
--           WHERE (d.lixo IS NULL OR d.lixo = false) AND (d.bloquear_mensagens IS NULL OR d.bloquear_mensagens = false) AND d.assinatura_ativa = true AND d.telefone IS NOT NULL AND (u.plano = ANY (ARRAY['pro'::text, 'premium'::text])) AND (u.plano_pago = true OR u.trial_ativo = true) AND (cp.usage_count < cp.limite_mensal OR cp.limite_mensal IS NULL) AND (d.recuperacao_ultimo_envio IS NULL OR (d.recuperacao_ultimo_envio AT TIME ZONE 'America/Sao_Paulo'::text)::date < (now() AT TIME ZONE 'America/Sao_Paulo'::text)::date) AND (d.recuperacao_status IS NULL OR (d.recuperacao_status <> ALL (ARRAY['perdido'::text, 'recuperado'::text])))
--           GROUP BY d.id, d.user_id, d.nome, d.telefone, d.recuperacao_status, d.recuperacao_ultimo_envio, u.plano, u.plano_pago, u.trial_ativo, u.nome_empresa, mz.instance_name, cp.usage_count, cp.limite_mensal, t15.mensagem, t30.mensagem, t45.mensagem
--          HAVING
--                 CASE
--                     WHEN d.recuperacao_status IS NULL AND (CURRENT_DATE - max(p.data)) >= 15 AND (CURRENT_DATE - max(p.data)) < 30 THEN '15dias'::text
--                     WHEN d.recuperacao_status = '15dias'::text AND (CURRENT_DATE - max(p.data)) >= 30 AND (CURRENT_DATE - max(p.data)) < 45 THEN '30dias'::text
--                     WHEN d.recuperacao_status = '30dias'::text AND (CURRENT_DATE - max(p.data)) >= 45 THEN '45dias'::text
--                     ELSE NULL::text
--                 END IS NOT NULL) _orig
--   WHERE usuario_pode_enviar(user_id) AND usuario_tem_plano(user_id, 'pro'::text);

-- =====================================================================
-- APLICAR
-- =====================================================================

DO $$
DECLARE
  def text := pg_get_viewdef('public.vw_alunos_inativos_regua'::regclass);
BEGIN
  IF def ILIKE '%pode_ver_painel_admin%' THEN
    RAISE NOTICE 'vw_alunos_inativos_regua já tem a trava — nada a fazer';
    RETURN;
  END IF;

  EXECUTE format(
    'CREATE OR REPLACE VIEW public.vw_alunos_inativos_regua AS SELECT base.* FROM (%s) base WHERE (SELECT public.pode_ver_painel_admin())',
    rtrim(btrim(def), ';')
  );
END $$;

-- Conferência: no SQL Editor (sem JWT) a trava libera, então a contagem
-- continua a de antes; trava_aplicada tem que vir true.
SELECT
  (SELECT count(*) FROM public.vw_alunos_inativos_regua) AS linhas_visiveis_no_editor,
  pg_get_viewdef('public.vw_alunos_inativos_regua'::regclass) ILIKE '%pode_ver_painel_admin%' AS trava_aplicada;
