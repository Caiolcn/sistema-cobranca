-- =====================================================================
-- Segurança das views — 05/19: vw_contas_barradas_plano
-- =====================================================================
-- Problema: roda como `postgres` (ignora RLS), sem filtro de dono, liberada pro
-- papel `authenticated`. Qualquer cliente logado lia a lista de contas da Mensalli com plano
-- vencido/trial expirado: empresa, e-mail, telefone, alunos e valor parado.
--
-- Correção: mesma trava das views anteriores (pode_ver_painel_admin()).
-- Cliente logado passa a receber 0 linhas; admin, service_role e SQL Editor
-- continuam vendo tudo. Definição original embrulhada sem alteração.
--
-- Quem usa: diagnóstico de admin (citado em docs/plano-6-meses.html). Não está no
-- app, n8n, edge functions nem em funções do banco.
-- =====================================================================

-- ---------------------------------------------------------------------
-- ROLLBACK (só se precisar voltar): rode o bloco abaixo sem os "--".
-- ---------------------------------------------------------------------
-- CREATE OR REPLACE VIEW public.vw_contas_barradas_plano AS
--  SELECT u.id AS user_id,
--     u.nome_empresa,
--     u.email,
--     u.telefone,
--     u.plano,
--     u.plano_pago,
--     u.plano_vencimento,
--     u.trial_fim,
--         CASE
--             WHEN u.plano_pago AND u.plano_vencimento IS NULL THEN 'pago_sem_vencimento'::text
--             WHEN u.plano_pago AND u.plano_vencimento::date < CURRENT_DATE THEN 'plano_vencido'::text
--             WHEN NOT u.plano_pago AND u.plano_vencimento IS NOT NULL THEN 'ex_pagante'::text
--             WHEN u.trial_fim IS NOT NULL AND u.trial_fim::date < CURRENT_DATE THEN 'trial_expirado'::text
--             ELSE 'sem_plano'::text
--         END AS motivo,
--     GREATEST(CURRENT_DATE - COALESCE(u.plano_vencimento::date, u.trial_fim::date), 0) AS dias_barrada,
--     ( SELECT count(*) AS count
--            FROM devedores d
--           WHERE d.user_id = u.id AND COALESCE(d.lixo, false) = false) AS alunos,
--     ( SELECT count(*) AS count
--            FROM mensalidades m
--              JOIN devedores d ON d.id = m.devedor_id
--           WHERE d.user_id = u.id AND COALESCE(d.lixo, false) = false AND COALESCE(m.lixo, false) = false AND m.status <> 'pago'::text) AS parcelas_pendentes,
--     ( SELECT COALESCE(sum(m.valor), 0::numeric) AS "coalesce"
--            FROM mensalidades m
--              JOIN devedores d ON d.id = m.devedor_id
--           WHERE d.user_id = u.id AND COALESCE(d.lixo, false) = false AND COALESCE(m.lixo, false) = false AND m.status <> 'pago'::text) AS valor_parado,
--     ( SELECT max(l.created_at) AS max
--            FROM logs_mensagens l
--           WHERE l.user_id = u.id) AS ultimo_envio,
--     COALESCE(mz.conectado, false) AS whatsapp_conectado
--    FROM usuarios u
--      LEFT JOIN mensallizap mz ON mz.user_id = u.id
--   WHERE NOT usuario_pode_enviar(u.id) AND (EXISTS ( SELECT 1
--            FROM devedores d
--           WHERE d.user_id = u.id AND COALESCE(d.lixo, false) = false));

-- =====================================================================
-- APLICAR
-- =====================================================================

DO $$
DECLARE
  def text := pg_get_viewdef('public.vw_contas_barradas_plano'::regclass);
BEGIN
  IF def ILIKE '%pode_ver_painel_admin%' THEN
    RAISE NOTICE 'vw_contas_barradas_plano já tem a trava — nada a fazer';
    RETURN;
  END IF;

  EXECUTE format(
    'CREATE OR REPLACE VIEW public.vw_contas_barradas_plano AS SELECT base.* FROM (%s) base WHERE (SELECT public.pode_ver_painel_admin())',
    rtrim(btrim(def), ';')
  );
END $$;

-- Conferência: no SQL Editor (sem JWT) a trava libera, então a contagem
-- continua a de antes; trava_aplicada tem que vir true.
SELECT
  (SELECT count(*) FROM public.vw_contas_barradas_plano) AS linhas_visiveis_no_editor,
  pg_get_viewdef('public.vw_contas_barradas_plano'::regclass) ILIKE '%pode_ver_painel_admin%' AS trava_aplicada;
