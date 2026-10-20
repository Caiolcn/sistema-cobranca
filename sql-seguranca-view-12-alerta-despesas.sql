-- =====================================================================
-- Segurança das views — 12/19: vw_alerta_despesas
-- =====================================================================
-- Problema: roda como `postgres` (ignora RLS), sem filtro de dono, liberada pro
-- papel `authenticated`. Qualquer cliente logado lia as despesas a vencer de TODAS as contas
-- (descrição, valor, telefone do dono) e a `evolution_api_key` global.
--
-- Correção: mesma trava das views anteriores (pode_ver_painel_admin()).
-- Cliente logado passa a receber 0 linhas; admin, service_role e SQL Editor
-- continuam vendo tudo. Definição original embrulhada sem alteração.
--
-- Quem usa: edge function alerta-despesas, com SUPABASE_SERVICE_ROLE_KEY → passa na
-- trava. Nenhuma tela do app nem n8n usa.
--
-- CHECAR: no próximo alerta de despesa, o dono da conta tem que receber a
-- mensagem normalmente (logs da edge function alerta-despesas sem erro).
-- =====================================================================

-- ---------------------------------------------------------------------
-- ROLLBACK (só se precisar voltar): rode o bloco abaixo sem os "--".
-- ---------------------------------------------------------------------
-- CREATE OR REPLACE VIEW public.vw_alerta_despesas AS
--  SELECT despesa_id,
--     user_id,
--     descricao,
--     valor,
--     data_vencimento,
--     dias_restantes,
--     momento_alerta,
--     categoria_nome,
--     categoria_icone,
--     nome_empresa,
--     telefone_admin,
--     plano,
--     alertar_despesas_dias_antes,
--     evolution_instance_name,
--     evolution_api_key,
--     evolution_api_url
--    FROM ( SELECT d.id AS despesa_id,
--             d.user_id,
--             d.descricao,
--             d.valor,
--             d.data_vencimento,
--             d.data_vencimento - CURRENT_DATE AS dias_restantes,
--                 CASE
--                     WHEN d.data_vencimento = CURRENT_DATE THEN 'hoje'::text
--                     WHEN d.data_vencimento > CURRENT_DATE THEN 'antecipado'::text
--                     ELSE NULL::text
--                 END AS momento_alerta,
--             c.nome AS categoria_nome,
--             c.icone AS categoria_icone,
--             u.nome_empresa,
--             u.telefone AS telefone_admin,
--             u.plano,
--             cc.alertar_despesas_dias_antes,
--             mz.instance_name AS evolution_instance_name,
--             ( SELECT config.valor FROM config WHERE config.chave = 'evolution_api_key'::text LIMIT 1) AS evolution_api_key,
--             ( SELECT config.valor FROM config WHERE config.chave = 'evolution_api_url'::text LIMIT 1) AS evolution_api_url
--            FROM despesas d
--              JOIN usuarios u ON u.id = d.user_id
--              JOIN configuracoes_cobranca cc ON cc.user_id = d.user_id AND cc.alertar_despesas = true
--              JOIN mensallizap mz ON mz.user_id = d.user_id AND mz.conectado = true
--              LEFT JOIN categorias_despesas c ON c.id = d.categoria_id
--           WHERE d.status = 'pendente'::text AND (u.plano = ANY (ARRAY['pro'::text, 'premium'::text])) AND (u.plano_pago = true OR u.trial_ativo = true) AND u.telefone IS NOT NULL AND (d.data_vencimento = CURRENT_DATE OR d.data_vencimento = (CURRENT_DATE + cc.alertar_despesas_dias_antes))
--           ORDER BY d.user_id, d.data_vencimento) _orig
--   WHERE usuario_pode_enviar(user_id) AND usuario_tem_plano(user_id, 'pro'::text);

-- =====================================================================
-- APLICAR
-- =====================================================================

DO $$
DECLARE
  def text := pg_get_viewdef('public.vw_alerta_despesas'::regclass);
BEGIN
  IF def ILIKE '%pode_ver_painel_admin%' THEN
    RAISE NOTICE 'vw_alerta_despesas já tem a trava — nada a fazer';
    RETURN;
  END IF;

  EXECUTE format(
    'CREATE OR REPLACE VIEW public.vw_alerta_despesas AS SELECT base.* FROM (%s) base WHERE (SELECT public.pode_ver_painel_admin())',
    rtrim(btrim(def), ';')
  );
END $$;

-- Conferência: no SQL Editor (sem JWT) a trava libera, então a contagem
-- continua a de antes; trava_aplicada tem que vir true.
SELECT
  (SELECT count(*) FROM public.vw_alerta_despesas) AS linhas_visiveis_no_editor,
  pg_get_viewdef('public.vw_alerta_despesas'::regclass) ILIKE '%pode_ver_painel_admin%' AS trava_aplicada;
