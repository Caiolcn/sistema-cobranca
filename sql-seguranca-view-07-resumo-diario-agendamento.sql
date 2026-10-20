-- =====================================================================
-- Segurança das views — 07/19: vw_resumo_diario_agendamento
-- =====================================================================
-- Problema: roda como `postgres` (ignora RLS), sem filtro de dono, liberada pro
-- papel `authenticated`. Qualquer cliente logado lia, de TODAS as contas premium, as aulas do dia
-- com nomes dos alunos, telefone do dono e a `evolution_api_key` global.
--
-- Correção: mesma trava das views anteriores (pode_ver_painel_admin()).
-- Cliente logado passa a receber 0 linhas; admin, service_role e SQL Editor
-- continuam vendo tudo. Definição original embrulhada sem alteração.
--
-- Quem usa: n8n (agente-resumo-diario) com a chave secreta → continua funcionando,
-- a trava libera service_role. Não está no app nem em edge functions.
-- =====================================================================

-- ---------------------------------------------------------------------
-- ROLLBACK (só se precisar voltar): rode o bloco abaixo sem os "--".
-- ---------------------------------------------------------------------
-- CREATE OR REPLACE VIEW public.vw_resumo_diario_agendamento AS
--  SELECT user_id,
--     nome_empresa,
--     telefone_admin,
--     plano,
--     aula_id,
--     horario,
--     descricao,
--     capacidade,
--     nomes_fixos,
--     total_fixos,
--     nomes_agendados,
--     total_agendados,
--     evolution_instance_name,
--     evolution_api_key,
--     evolution_api_url
--    FROM ( SELECT u.id AS user_id,
--             u.nome_empresa,
--             u.telefone AS telefone_admin,
--             u.plano,
--             a.id AS aula_id,
--             a.horario,
--             a.descricao,
--             a.capacidade,
--             COALESCE(( SELECT string_agg(d.nome, ', '::text ORDER BY d.nome) AS string_agg
--                    FROM aulas_fixos af
--                      JOIN devedores d ON d.id = af.devedor_id
--                   WHERE af.aula_id = a.id AND (af.ativo IS NULL OR af.ativo = true)), ''::text) AS nomes_fixos,
--             COALESCE(( SELECT count(*) AS count
--                    FROM aulas_fixos af
--                   WHERE af.aula_id = a.id AND (af.ativo IS NULL OR af.ativo = true)), 0::bigint)::integer AS total_fixos,
--             COALESCE(( SELECT string_agg(d.nome, ', '::text ORDER BY d.nome) AS string_agg
--                    FROM agendamentos ag
--                      JOIN devedores d ON d.id = ag.devedor_id
--                   WHERE ag.aula_id = a.id AND ag.data = CURRENT_DATE AND ag.status = 'confirmado'::text), ''::text) AS nomes_agendados,
--             COALESCE(( SELECT count(*) AS count
--                    FROM agendamentos ag
--                   WHERE ag.aula_id = a.id AND ag.data = CURRENT_DATE AND ag.status = 'confirmado'::text), 0::bigint)::integer AS total_agendados,
--             mz.instance_name AS evolution_instance_name,
--             ( SELECT config.valor FROM config WHERE config.chave = 'evolution_api_key'::text LIMIT 1) AS evolution_api_key,
--             ( SELECT config.valor FROM config WHERE config.chave = 'evolution_api_url'::text LIMIT 1) AS evolution_api_url
--            FROM aulas a
--              JOIN usuarios u ON u.id = a.user_id
--              JOIN configuracoes_cobranca cc ON cc.user_id = u.id AND cc.enviar_resumo_diario = true
--              JOIN mensallizap mz ON mz.user_id = u.id AND mz.conectado = true
--           WHERE a.ativo = true AND a.dia_semana::numeric = EXTRACT(dow FROM CURRENT_DATE) AND u.plano = 'premium'::text AND (u.plano_pago = true OR u.trial_ativo = true)
--           ORDER BY u.id, a.horario) _orig
--   WHERE usuario_pode_enviar(user_id) AND usuario_tem_plano(user_id, 'premium'::text);

-- =====================================================================
-- APLICAR
-- =====================================================================

DO $$
DECLARE
  def text := pg_get_viewdef('public.vw_resumo_diario_agendamento'::regclass);
BEGIN
  IF def ILIKE '%pode_ver_painel_admin%' THEN
    RAISE NOTICE 'vw_resumo_diario_agendamento já tem a trava — nada a fazer';
    RETURN;
  END IF;

  EXECUTE format(
    'CREATE OR REPLACE VIEW public.vw_resumo_diario_agendamento AS SELECT base.* FROM (%s) base WHERE (SELECT public.pode_ver_painel_admin())',
    rtrim(btrim(def), ';')
  );
END $$;

-- Conferência: no SQL Editor (sem JWT) a trava libera, então a contagem
-- continua a de antes; trava_aplicada tem que vir true.
SELECT
  (SELECT count(*) FROM public.vw_resumo_diario_agendamento) AS linhas_visiveis_no_editor,
  pg_get_viewdef('public.vw_resumo_diario_agendamento'::regclass) ILIKE '%pode_ver_painel_admin%' AS trava_aplicada;
