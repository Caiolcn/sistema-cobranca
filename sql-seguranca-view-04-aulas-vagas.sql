-- =====================================================================
-- Segurança das views — 04/19: vw_aulas_vagas
-- =====================================================================
-- Problema: roda como `postgres` (ignora RLS), sem filtro de dono, liberada pro
-- papel `authenticated`. Qualquer cliente logado lia as aulas (dia, horário, descrição,
-- capacidade) e a ocupação de TODAS as contas.
--
-- Correção: mesma trava das views anteriores (pode_ver_painel_admin()).
-- Cliente logado passa a receber 0 linhas; admin, service_role e SQL Editor
-- continuam vendo tudo. Definição original embrulhada sem alteração.
--
-- Quem usa: ninguém hoje. Era do agendamento online (sql-criar-agendamento-online.sql);
-- não está no app, n8n, edge functions nem em funções do banco.
-- =====================================================================

-- ---------------------------------------------------------------------
-- ROLLBACK (só se precisar voltar): rode o bloco abaixo sem os "--".
-- ---------------------------------------------------------------------
-- CREATE OR REPLACE VIEW public.vw_aulas_vagas AS
--  SELECT a.id AS aula_id,
--     a.user_id,
--     a.dia_semana,
--     a.horario,
--     a.descricao,
--     a.capacidade,
--     a.ativo,
--     d.data,
--     a.capacidade - count(ag.id) AS vagas_restantes,
--     count(ag.id) AS total_agendados
--    FROM aulas a
--      CROSS JOIN ( SELECT generate_series(CURRENT_DATE::timestamp without time zone, CURRENT_DATE + '13 days'::interval, '1 day'::interval)::date AS data) d
--      LEFT JOIN agendamentos ag ON ag.aula_id = a.id AND ag.data = d.data AND ag.status = 'confirmado'::text
--   WHERE a.ativo = true AND EXTRACT(dow FROM d.data) = a.dia_semana::numeric AND d.data >= CURRENT_DATE
--   GROUP BY a.id, a.user_id, a.dia_semana, a.horario, a.descricao, a.capacidade, a.ativo, d.data;

-- =====================================================================
-- APLICAR
-- =====================================================================

DO $$
DECLARE
  def text := pg_get_viewdef('public.vw_aulas_vagas'::regclass);
BEGIN
  IF def ILIKE '%pode_ver_painel_admin%' THEN
    RAISE NOTICE 'vw_aulas_vagas já tem a trava — nada a fazer';
    RETURN;
  END IF;

  EXECUTE format(
    'CREATE OR REPLACE VIEW public.vw_aulas_vagas AS SELECT base.* FROM (%s) base WHERE (SELECT public.pode_ver_painel_admin())',
    rtrim(btrim(def), ';')
  );
END $$;

-- Conferência: no SQL Editor (sem JWT) a trava libera, então a contagem
-- continua a de antes; trava_aplicada tem que vir true.
SELECT
  (SELECT count(*) FROM public.vw_aulas_vagas) AS linhas_visiveis_no_editor,
  pg_get_viewdef('public.vw_aulas_vagas'::regclass) ILIKE '%pode_ver_painel_admin%' AS trava_aplicada;
