-- =====================================================================
-- Segurança das views — 01/19: vw_parcelas_em_atraso
-- =====================================================================
-- Problema: a view roda como `postgres` (ignora RLS), não filtra por dono e
-- está liberada pro papel `authenticated`. Qualquer cliente logado lia, de
-- TODAS as contas: nome/telefone do aluno, valor em atraso, chave PIX e a
-- `evolution_api_key` global.
--
-- Correção: mesma trava que vw_admin_contas e vw_central_mensagens já usam.
-- pode_ver_painel_admin() libera admin, service_role (n8n / edge functions)
-- e conexão sem JWT (SQL Editor / cron). Cliente logado passa a receber 0 linhas.
-- A definição original é embrulhada sem alteração: mesmas colunas e filtros.
--
-- Quem usa: só o n8n (agente-cobrancas-atraso / agente-cobrancas-unificado),
-- com a chave secreta → continua funcionando. Nenhuma tela do app usa.
-- =====================================================================

-- ---------------------------------------------------------------------
-- ROLLBACK (só se precisar voltar): rode o bloco abaixo sem os "--".
-- ---------------------------------------------------------------------
-- CREATE OR REPLACE VIEW public.vw_parcelas_em_atraso AS
--  SELECT m.id AS parcela_id,
--     m.devedor_id,
--     m.valor AS valor_em_aberto,
--     m.data_vencimento,
--     m.descricao,
--     m.total_envios,
--     3 AS dias_atraso,
--     COALESCE(NULLIF(TRIM(BOTH FROM d.responsavel_nome), ''::text), d.nome) AS nome_cliente,
--     COALESCE(NULLIF(TRIM(BOTH FROM d.responsavel_telefone), ''::text), d.telefone) AS telefone,
--     d.user_id,
--     u.plano,
--     mz.instance_name AS evolution_instance_name,
--     ( SELECT config.valor FROM config WHERE config.chave = 'evolution_api_key'::text LIMIT 1) AS evolution_api_key,
--     ( SELECT config.valor FROM config WHERE config.chave = 'evolution_api_url'::text LIMIT 1) AS evolution_api_url,
--     u.chave_pix,
--     u.nome_empresa,
--     cp.usage_count,
--     cp.limite_mensal,
--     COALESCE(t.mensagem, ''::text) AS template_mensagem,
--     d.portal_token,
--     ( SELECT config.valor FROM config WHERE config.chave = (d.user_id::text || '_metodo_pagamento_whatsapp'::text) LIMIT 1) AS metodo_pagamento,
--     d.nome AS nome_aluno_real,
--     NULLIF(TRIM(BOTH FROM d.responsavel_nome), ''::text) AS nome_responsavel
--    FROM mensalidades m
--      JOIN devedores d ON m.devedor_id = d.id
--      JOIN usuarios u ON d.user_id = u.id
--      JOIN mensallizap mz ON mz.user_id = d.user_id AND mz.conectado = true
--      JOIN configuracoes_cobranca cc ON cc.user_id = d.user_id AND cc.enviar_3_dias_depois = true
--      LEFT JOIN controle_planos cp ON cp.user_id = d.user_id
--      LEFT JOIN templates t ON t.user_id = d.user_id AND t.tipo = 'overdue'::text AND t.ativo = true
--   WHERE m.status = 'pendente'::text AND m.enviado_vencimento = false AND m.data_vencimento = (CURRENT_DATE - '3 days'::interval) AND d.assinatura_ativa = true AND (d.lixo IS NULL OR d.lixo = false) AND (d.bloquear_mensagens IS NULL OR d.bloquear_mensagens = false) AND (d.comunicacoes_ativas IS NULL OR d.comunicacoes_ativas = true) AND (cp.usage_count < cp.limite_mensal OR cp.limite_mensal IS NULL) AND usuario_pode_enviar(u.id) AND (m.lixo IS NULL OR m.lixo = false) AND usuario_tem_plano(d.user_id, 'pro'::text);

-- =====================================================================
-- APLICAR
-- =====================================================================

DO $$
DECLARE
  def text := pg_get_viewdef('public.vw_parcelas_em_atraso'::regclass);
BEGIN
  IF def ILIKE '%pode_ver_painel_admin%' THEN
    RAISE NOTICE 'vw_parcelas_em_atraso já tem a trava — nada a fazer';
    RETURN;
  END IF;

  EXECUTE format(
    'CREATE OR REPLACE VIEW public.vw_parcelas_em_atraso AS SELECT base.* FROM (%s) base WHERE (SELECT public.pode_ver_painel_admin())',
    rtrim(btrim(def), ';')
  );
END $$;

-- Conferência (no SQL Editor, sem JWT, a trava libera — deve trazer a mesma
-- contagem de antes e confirmar que a trava entrou):
SELECT
  (SELECT count(*) FROM public.vw_parcelas_em_atraso) AS linhas_visiveis_no_editor,
  pg_get_viewdef('public.vw_parcelas_em_atraso'::regclass) ILIKE '%pode_ver_painel_admin%' AS trava_aplicada;
