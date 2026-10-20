-- =====================================================================
-- Segurança das views — 02/19: vw_regua_cobranca
-- =====================================================================
-- Problema: roda como `postgres` (ignora RLS), sem filtro de dono, liberada pro
-- papel `authenticated`. Qualquer cliente logado lia, de TODAS as contas: aluno,
-- responsável, telefones, valor total vencido e portal_token (link do portal
-- de pagamento do aluno).
--
-- Correção: mesma trava de vw_admin_contas / vw_central_mensagens / 01.
-- Cliente logado passa a receber 0 linhas; admin, service_role e SQL Editor
-- continuam vendo tudo. Definição original embrulhada sem alteração.
--
-- Quem usa: ninguém hoje. Foi criada pra aba "Régua de Cobrança" do CRM
-- (commit 9bc2d0c, jun/2026), que saiu do app depois. Não está no n8n, em edge
-- functions nem em funções do banco.
-- =====================================================================

-- ---------------------------------------------------------------------
-- ROLLBACK (só se precisar voltar): rode o bloco abaixo sem os "--".
-- ---------------------------------------------------------------------
-- CREATE OR REPLACE VIEW public.vw_regua_cobranca AS
--  WITH agregado AS (
--          SELECT m.devedor_id,
--             min(m.data_vencimento) AS venc_mais_antigo,
--             sum(m.valor) AS valor_total_vencido,
--             count(*) AS qtd_parcelas_vencidas
--            FROM mensalidades m
--           WHERE (m.lixo IS NULL OR m.lixo = false) AND (m.status = ANY (ARRAY['pendente'::text, 'atrasado'::text])) AND m.data_vencimento < CURRENT_DATE
--           GROUP BY m.devedor_id
--         ), mais_antiga AS (
--          SELECT DISTINCT ON (m.devedor_id) m.devedor_id,
--             m.id AS mensalidade_id
--            FROM mensalidades m
--           WHERE (m.lixo IS NULL OR m.lixo = false) AND (m.status = ANY (ARRAY['pendente'::text, 'atrasado'::text])) AND m.data_vencimento < CURRENT_DATE
--           ORDER BY m.devedor_id, m.data_vencimento, m.created_at
--         ), ultima_cobranca AS (
--          SELECT l.devedor_id,
--             max(l.enviado_em) AS ultima_cobranca_em
--            FROM logs_mensagens l
--           WHERE l.status = 'enviado'::text AND (l.tipo IS NULL OR (l.tipo = ANY (ARRAY['overdue'::text, 'due_day'::text, 'pre_due_3days'::text])))
--           GROUP BY l.devedor_id
--         )
--  SELECT d.id AS devedor_id,
--     d.user_id,
--     d.nome,
--     d.responsavel_nome,
--     d.telefone,
--     d.responsavel_telefone,
--     d.portal_token,
--     d.bloquear_mensagens,
--     d.comunicacoes_ativas,
--     d.cobranca_snooze_until,
--     ma.mensalidade_id,
--     a.valor_total_vencido,
--     a.qtd_parcelas_vencidas,
--     CURRENT_DATE - a.venc_mais_antigo AS dias_atraso,
--     uc.ultima_cobranca_em,
--         CASE
--             WHEN uc.ultima_cobranca_em IS NOT NULL THEN CURRENT_DATE - uc.ultima_cobranca_em::date
--             ELSE NULL::integer
--         END AS ultima_cobranca_dias
--    FROM agregado a
--      JOIN devedores d ON d.id = a.devedor_id
--      JOIN mais_antiga ma ON ma.devedor_id = a.devedor_id
--      LEFT JOIN ultima_cobranca uc ON uc.devedor_id = a.devedor_id
--   WHERE (d.lixo IS NULL OR d.lixo = false) AND (d.bloquear_mensagens IS NULL OR d.bloquear_mensagens = false) AND (d.comunicacoes_ativas IS NULL OR d.comunicacoes_ativas = true) AND (d.cobranca_snooze_until IS NULL OR d.cobranca_snooze_until <= CURRENT_DATE);

-- =====================================================================
-- APLICAR
-- =====================================================================

DO $$
DECLARE
  def text := pg_get_viewdef('public.vw_regua_cobranca'::regclass);
BEGIN
  IF def ILIKE '%pode_ver_painel_admin%' THEN
    RAISE NOTICE 'vw_regua_cobranca já tem a trava — nada a fazer';
    RETURN;
  END IF;

  EXECUTE format(
    'CREATE OR REPLACE VIEW public.vw_regua_cobranca AS SELECT base.* FROM (%s) base WHERE (SELECT public.pode_ver_painel_admin())',
    rtrim(btrim(def), ';')
  );
END $$;

-- Conferência: no SQL Editor (sem JWT) a trava libera, então a contagem
-- continua a de antes; trava_aplicada tem que vir true.
SELECT
  (SELECT count(*) FROM public.vw_regua_cobranca) AS linhas_visiveis_no_editor,
  pg_get_viewdef('public.vw_regua_cobranca'::regclass) ILIKE '%pode_ver_painel_admin%' AS trava_aplicada;
