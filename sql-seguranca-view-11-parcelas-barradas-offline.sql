-- =====================================================================
-- Segurança das views — 11/19: vw_parcelas_barradas_offline
-- =====================================================================
-- Problema: roda como `postgres` (ignora RLS), sem filtro de dono, liberada pro
-- papel `authenticated`. Qualquer cliente logado lia, de TODAS as contas, as cobranças que
-- não saíram por WhatsApp desconectado: aluno, telefone, valor e empresa.
--
-- Correção: mesma trava das views anteriores (pode_ver_painel_admin()).
-- Cliente logado passa a receber 0 linhas; admin, service_role e SQL Editor
-- continuam vendo tudo. Definição original embrulhada sem alteração.
--
-- Quem usa: funções do banco materializar_fila_dia (cron fila-materializar,
-- 8h30 BRT, como postgres sem JWT) e relatorio_mensagens_dia (edge
-- relatorio-mensagens, service_role). Ambos passam na trava. Nenhuma tela do app usa.
-- A conferência abaixo roda no MESMO contexto do cron (postgres, sem JWT).
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
-- CREATE OR REPLACE VIEW public.vw_parcelas_barradas_offline AS
--  SELECT 'pre_due_3days'::text AS janela,
--     m.id AS parcela_id,
--     m.data_vencimento,
--     m.valor AS valor_em_aberto,
--     d.id AS devedor_id,
--     COALESCE(NULLIF(TRIM(BOTH FROM d.responsavel_nome), ''::text), d.nome) AS nome_cliente,
--     COALESCE(d.responsavel_telefone, d.telefone) AS telefone,
--     d.user_id,
--     u.nome_empresa,
--     mz.instance_name,
--     mz.conectado,
--     mz.ultima_desconexao,
--     mz.ultima_conexao
--    FROM mensalidades m
--      JOIN devedores d ON m.devedor_id = d.id
--      JOIN usuarios u ON d.user_id = u.id
--      JOIN configuracoes_cobranca c ON c.user_id = d.user_id
--      LEFT JOIN mensallizap mz ON mz.user_id = d.user_id
--   WHERE (m.data_vencimento = (CURRENT_DATE + 3) OR EXTRACT(dow FROM CURRENT_DATE) = 1::numeric AND c.enviar_domingo = false AND m.data_vencimento = (CURRENT_DATE + 2)) AND m.status <> 'pago'::text AND (m.enviado_3dias IS NULL OR m.enviado_3dias = false) AND c.enviar_3_dias_antes = true AND NOT (EXTRACT(dow FROM CURRENT_DATE) = 0::numeric AND c.enviar_domingo = false) AND (d.lixo IS NULL OR d.lixo = false) AND (d.bloquear_mensagens IS NULL OR d.bloquear_mensagens = false) AND (d.comunicacoes_ativas IS NULL OR d.comunicacoes_ativas = true) AND d.assinatura_ativa = true AND (m.lixo IS NULL OR m.lixo = false) AND mz.conectado IS DISTINCT FROM true AND usuario_pode_enviar(d.user_id) AND usuario_tem_plano(d.user_id, 'pro'::text)
-- UNION ALL
--  SELECT 'due_day'::text AS janela,
--     m.id AS parcela_id,
--     m.data_vencimento,
--     m.valor AS valor_em_aberto,
--     d.id AS devedor_id,
--     COALESCE(NULLIF(TRIM(BOTH FROM d.responsavel_nome), ''::text), d.nome) AS nome_cliente,
--     d.telefone,
--     d.user_id,
--     u.nome_empresa,
--     mz.instance_name,
--     mz.conectado,
--     mz.ultima_desconexao,
--     mz.ultima_conexao
--    FROM mensalidades m
--      JOIN devedores d ON m.devedor_id = d.id
--      JOIN usuarios u ON d.user_id = u.id
--      JOIN configuracoes_cobranca cc ON cc.user_id = d.user_id AND cc.enviar_no_dia = true
--      LEFT JOIN mensallizap mz ON mz.user_id = d.user_id
--      LEFT JOIN controle_planos cp ON cp.user_id = d.user_id
--   WHERE m.status = 'pendente'::text AND m.enviado_no_dia = false AND m.data_vencimento = CURRENT_DATE AND d.assinatura_ativa = true AND (d.lixo IS NULL OR d.lixo = false) AND (d.bloquear_mensagens IS NULL OR d.bloquear_mensagens = false) AND (d.comunicacoes_ativas IS NULL OR d.comunicacoes_ativas = true) AND (cp.usage_count < cp.limite_mensal OR cp.limite_mensal IS NULL) AND (m.lixo IS NULL OR m.lixo = false) AND mz.conectado IS DISTINCT FROM true AND usuario_pode_enviar(d.user_id) AND usuario_tem_plano(d.user_id, 'starter'::text)
-- UNION ALL
--  SELECT 'overdue'::text AS janela,
--     m.id AS parcela_id,
--     m.data_vencimento,
--     m.valor AS valor_em_aberto,
--     d.id AS devedor_id,
--     COALESCE(NULLIF(TRIM(BOTH FROM d.responsavel_nome), ''::text), d.nome) AS nome_cliente,
--     COALESCE(d.responsavel_telefone, d.telefone) AS telefone,
--     d.user_id,
--     u.nome_empresa,
--     mz.instance_name,
--     mz.conectado,
--     mz.ultima_desconexao,
--     mz.ultima_conexao
--    FROM mensalidades m
--      JOIN devedores d ON m.devedor_id = d.id
--      JOIN usuarios u ON d.user_id = u.id
--      JOIN configuracoes_cobranca c ON c.user_id = d.user_id
--      LEFT JOIN mensallizap mz ON mz.user_id = d.user_id
--   WHERE (m.data_vencimento = (CURRENT_DATE - 3) OR EXTRACT(dow FROM CURRENT_DATE) = 1::numeric AND c.enviar_domingo = false AND m.data_vencimento = (CURRENT_DATE - 4)) AND m.status <> 'pago'::text AND (m.enviado_3dias_depois IS NULL OR m.enviado_3dias_depois = false) AND c.enviar_3_dias_depois = true AND NOT (EXTRACT(dow FROM CURRENT_DATE) = 0::numeric AND c.enviar_domingo = false) AND (d.lixo IS NULL OR d.lixo = false) AND (d.bloquear_mensagens IS NULL OR d.bloquear_mensagens = false) AND (d.comunicacoes_ativas IS NULL OR d.comunicacoes_ativas = true) AND d.assinatura_ativa = true AND (m.lixo IS NULL OR m.lixo = false) AND mz.conectado IS DISTINCT FROM true AND usuario_pode_enviar(d.user_id) AND usuario_tem_plano(d.user_id, 'pro'::text);

-- =====================================================================
-- APLICAR
-- =====================================================================

DO $$
DECLARE
  def text := pg_get_viewdef('public.vw_parcelas_barradas_offline'::regclass);
BEGIN
  IF def ILIKE '%pode_ver_painel_admin%' THEN
    RAISE NOTICE 'vw_parcelas_barradas_offline já tem a trava — nada a fazer';
    RETURN;
  END IF;

  EXECUTE format(
    'CREATE OR REPLACE VIEW public.vw_parcelas_barradas_offline AS SELECT base.* FROM (%s) base WHERE (SELECT public.pode_ver_painel_admin())',
    rtrim(btrim(def), ';')
  );
END $$;

-- Conferência: no SQL Editor (sem JWT) a trava libera, então a contagem
-- continua a de antes; trava_aplicada tem que vir true.
SELECT
  (SELECT count(*) FROM public.vw_parcelas_barradas_offline) AS linhas_visiveis_no_editor,
  pg_get_viewdef('public.vw_parcelas_barradas_offline'::regclass) ILIKE '%pode_ver_painel_admin%' AS trava_aplicada;
