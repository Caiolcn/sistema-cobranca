-- =====================================================================
-- Segurança das views — 13/19: vw_alunos_aguardando_nps
-- =====================================================================
-- Problema: roda como `postgres` (ignora RLS), sem filtro de dono, liberada pro
-- papel `authenticated`. Qualquer cliente logado lia, de TODAS as contas premium, os alunos
-- novos (nome, telefone, primeira aula) e a `evolution_api_key` global.
--
-- Correção: mesma trava das views anteriores (pode_ver_painel_admin()).
-- Cliente logado passa a receber 0 linhas; admin, service_role e SQL Editor
-- continuam vendo tudo. Definição original embrulhada sem alteração.
--
-- Quem usa: n8n (agente-nps) com a chave secreta → passa na trava. Nenhuma tela do
-- app, edge function nem função do banco usa.
--
-- CHECAR: na próxima rodada do agente-nps, alunos novos de contas premium
-- continuam recebendo a pesquisa (logs_mensagens com tipo nps).
-- =====================================================================

-- ---------------------------------------------------------------------
-- ROLLBACK (só se precisar voltar): rode o bloco abaixo sem os "--".
-- ---------------------------------------------------------------------
-- CREATE OR REPLACE VIEW public.vw_alunos_aguardando_nps AS
--  SELECT devedor_id,
--     user_id,
--     nome_cliente,
--     telefone,
--     primeira_data,
--     nome_empresa,
--     evolution_instance_name,
--     evolution_api_key,
--     evolution_api_url,
--     usage_count,
--     limite_mensal,
--     template_mensagem
--    FROM ( SELECT d.id AS devedor_id,
--             d.user_id,
--             d.nome AS nome_cliente,
--             d.telefone,
--             primeira_presenca.primeira_data,
--             u.nome_empresa,
--             mz.instance_name AS evolution_instance_name,
--             ( SELECT config.valor FROM config WHERE config.chave = 'evolution_api_key'::text LIMIT 1) AS evolution_api_key,
--             ( SELECT config.valor FROM config WHERE config.chave = 'evolution_api_url'::text LIMIT 1) AS evolution_api_url,
--             cp.usage_count,
--             cp.limite_mensal,
--             COALESCE(t.mensagem, ''::text) AS template_mensagem
--            FROM devedores d
--              JOIN usuarios u ON u.id = d.user_id
--              JOIN configuracoes_cobranca cc ON cc.user_id = d.user_id AND cc.nps_experimental_ativo = true
--              JOIN mensallizap mz ON mz.user_id = d.user_id AND mz.conectado = true
--              JOIN ( SELECT presencas.devedor_id,
--                     min(presencas.data) AS primeira_data
--                    FROM presencas
--                   WHERE presencas.presente = true
--                   GROUP BY presencas.devedor_id) primeira_presenca ON primeira_presenca.devedor_id = d.id
--              LEFT JOIN controle_planos cp ON cp.user_id = d.user_id
--              LEFT JOIN templates t ON t.user_id = d.user_id AND t.tipo = 'nps_experimental'::text AND t.ativo = true
--           WHERE (d.lixo IS NULL OR d.lixo = false) AND (d.bloquear_mensagens IS NULL OR d.bloquear_mensagens = false) AND d.telefone IS NOT NULL AND d.nps_experimental_enviado_em IS NULL AND primeira_presenca.primeira_data <= (CURRENT_DATE - '1 day'::interval) AND u.plano = 'premium'::text AND (u.plano_pago = true OR u.trial_ativo = true) AND (cp.usage_count < cp.limite_mensal OR cp.limite_mensal IS NULL) AND (( SELECT count(*) AS count
--                    FROM logs_mensagens lm
--                   WHERE lm.devedor_id = d.id AND lm.status = 'falha'::text AND (lm.tipo = 'nps'::text OR lm.tipo IS NULL AND (lm.mensagem ~~* '%0 a 10%'::text OR lm.mensagem ~~* '%primeira aula%'::text)))) < 3) _orig
--   WHERE usuario_pode_enviar(user_id) AND usuario_tem_plano(user_id, 'premium'::text);

-- =====================================================================
-- APLICAR
-- =====================================================================

DO $$
DECLARE
  def text := pg_get_viewdef('public.vw_alunos_aguardando_nps'::regclass);
BEGIN
  IF def ILIKE '%pode_ver_painel_admin%' THEN
    RAISE NOTICE 'vw_alunos_aguardando_nps já tem a trava — nada a fazer';
    RETURN;
  END IF;

  EXECUTE format(
    'CREATE OR REPLACE VIEW public.vw_alunos_aguardando_nps AS SELECT base.* FROM (%s) base WHERE (SELECT public.pode_ver_painel_admin())',
    rtrim(btrim(def), ';')
  );
END $$;

-- Conferência: no SQL Editor (sem JWT) a trava libera, então a contagem
-- continua a de antes; trava_aplicada tem que vir true.
SELECT
  (SELECT count(*) FROM public.vw_alunos_aguardando_nps) AS linhas_visiveis_no_editor,
  pg_get_viewdef('public.vw_alunos_aguardando_nps'::regclass) ILIKE '%pode_ver_painel_admin%' AS trava_aplicada;
