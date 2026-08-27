-- ============================================================================
-- GATE DE PLANO + PAGAMENTO NAS AUTOMAÇÕES  (aplicado em 13/07/2026)
-- ============================================================================
-- PROBLEMA QUE ISSO RESOLVE (2 vazamentos reais encontrados em produção):
--
--  1) TRIAL VENCIDO DISPARANDO: 2 views usavam a flag `usuarios.trial_ativo`,
--     que NUNCA é desligada quando o trial vence. 39 contas com trial vencido
--     (algumas há 6 meses) passavam no gate e disparavam cobrança.
--     -> O gate correto é por DATA (trial_fim), igual o front sempre fez
--        (src/contexts/UserContext.js -> trialStatus).
--
--  2) PLANO INFERIOR USANDO AUTOMAÇÃO SUPERIOR: o cadeado 🔒 PRO/PREMIUM só
--     existia no FRONT (src/hooks/useUserPlan.js -> isLocked). Ele impede
--     LIGAR o toggle, mas se a flag já está `true` e a conta faz DOWNGRADE,
--     a automação dispara mesmo assim. Casos reais: "Oficina de Aprender"
--     (starter disparando 3-dias-depois) e "Escolinha Alto Santo Antonio"
--     (starter disparando 3-dias-antes).
--
--  3) PLANO VENCIDO DISPARANDO (encontrado em 19/08/2026): o conserto de
--     13/07 acertou a metade do trial e deixou a de pagamento com o MESMO
--     defeito — `plano_pago = true` sem olhar `plano_vencimento`. Como nada
--     desliga essa flag, conta cancelada seguia cobrando de graça; a única
--     expiração era alguém editar na mão no Admin.
--     -> Agora as DUAS metades checam data. Ver vw_contas_barradas_plano
--        para quem o gate está barrando e quanto valor parou junto.
--
-- REGRA: o gate DEVE viver no banco (views), nunca só no front.
-- REGRA: todo gate expira por DATA. Flag booleana de acesso nunca desliga.
--
-- ⚠️ ATENÇÃO: rodar `criar-views-novo-fluxo.sql` ou `sql-criar-alerta-despesas.sql`
--    RECRIA as views SEM o gate e REINTRODUZ o vazamento.
--    Se rodar qualquer um deles, rode ESTE arquivo logo em seguida.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1) FUNÇÕES CANÔNICAS (fonte única de verdade do gate)
-- ----------------------------------------------------------------------------

-- Já pode enviar? (plano pago OU trial — os dois com data válida)
-- Espelha src/contexts/UserContext.js -> trialStatus (que usa data, não flag)
--
-- ⚠️ AS DUAS METADES CHECAM DATA. Não volte nenhuma delas para flag booleana:
--    nada no sistema desliga `plano_pago` quando o plano vence, então
--    `plano_pago = true` sozinho concede acesso vitalício a quem cancelou.
--    Sem carência: vence hoje, corta amanhã.
--
--    `plano_pago = true` com `plano_vencimento` nulo NÃO concede acesso
--    (fail-closed proposital). Tanto o mercadopago-webhook quanto o formulário
--    do Admin gravam os dois campos juntos — vencimento nulo é dado quebrado.
CREATE OR REPLACE FUNCTION public.usuario_pode_enviar(p_user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT COALESCE(
    (plano_pago = true
      AND plano_vencimento IS NOT NULL
      AND plano_vencimento::date >= CURRENT_DATE)
    OR (trial_fim IS NOT NULL AND trial_fim::date >= CURRENT_DATE),
    false
  )
  FROM usuarios WHERE id = p_user_id;
$$;

-- Hierarquia de planos. Espelha `planLevel` de src/hooks/useUserPlan.js
CREATE OR REPLACE FUNCTION public.nivel_plano(p_plano text)
RETURNS int
LANGUAGE sql IMMUTABLE
AS $$
  SELECT CASE lower(coalesce(p_plano,'starter'))
    WHEN 'free'       THEN 0
    WHEN 'starter'    THEN 1
    WHEN 'basico'     THEN 1   -- alias legado
    WHEN 'pro'        THEN 2
    WHEN 'premium'    THEN 3
    WHEN 'enterprise' THEN 3   -- alias legado
    WHEN 'business'   THEN 3   -- alias legado
    ELSE 1                     -- default starter (igual ao front)
  END;
$$;

-- Tem o plano mínimo exigido pela automação?
CREATE OR REPLACE FUNCTION public.usuario_tem_plano(p_user_id uuid, p_plano_minimo text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT COALESCE(nivel_plano(u.plano) >= nivel_plano(p_plano_minimo), false)
  FROM usuarios u WHERE u.id = p_user_id;
$$;


-- ----------------------------------------------------------------------------
-- 2) APLICA OS GATES NAS VIEWS DE AUTOMAÇÃO (idempotente)
--
--    Plano mínimo por automação (espelha src/WhatsAppConexao.js ~L2951-2962):
--      starter (livre): No Dia, Confirmação Pagamento, Boas-vindas
--      pro:             3 Dias Antes/Depois, Alerta Despesa, Lembrete Aula,
--                       Aniversário, Recuperação Inativos
--      premium:         Resumo do Dia, NPS
--
--    As views são ENVELOPADAS (SELECT * FROM (<original>) WHERE gates) para
--    preservar o SQL interno de cada uma.
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  alvo record;
  def_atual text;
  -- view -> plano mínimo. (vw_parcelas_no_dia é starter: só precisa do gate de pagamento)
  cfg CONSTANT jsonb := '{
    "vw_parcelas_no_dia":            "starter",
    "vw_parcelas_3dias_antes":       "pro",
    "vw_parcelas_3dias_depois":      "pro",
    "vw_parcelas_em_atraso":         "pro",
    "vw_parcelas_lembrete_3dias":    "pro",
    "vw_alerta_despesas":            "pro",
    "vw_alunos_inativos_regua":      "pro",
    "vw_aniversariantes_do_dia":     "pro",
    "vw_aulas_lembrete_1hora":       "pro",
    "vw_alunos_aguardando_nps":      "premium",
    "vw_resumo_diario_agendamento":  "premium",
    "vw_resumo_diario_completo":     "premium"
  }'::jsonb;
BEGIN
  FOR alvo IN SELECT key AS nome, value #>> '{}' AS plano FROM jsonb_each(cfg)
  LOOP
    SELECT pg_get_viewdef(c.oid, true) INTO def_atual
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'v' AND c.relname = alvo.nome;

    IF def_atual IS NULL THEN
      RAISE NOTICE 'view nao existe (pulando): %', alvo.nome;
      CONTINUE;
    END IF;

    -- idempotência: se já tem os 2 gates, não mexe
    IF position('usuario_tem_plano' in def_atual) > 0
       AND position('usuario_pode_enviar' in def_atual) > 0 THEN
      RAISE NOTICE 'ja blindada: %', alvo.nome;
      CONTINUE;
    END IF;

    EXECUTE format(
      'CREATE OR REPLACE VIEW public.%I AS SELECT * FROM (%s) AS _orig
        WHERE usuario_pode_enviar(_orig.user_id)
          AND usuario_tem_plano(_orig.user_id, %L)',
      alvo.nome, rtrim(rtrim(def_atual), ';'), alvo.plano
    );
    RAISE NOTICE 'gate aplicado: % (min: %)', alvo.nome, alvo.plano;
  END LOOP;
END $$;


-- ----------------------------------------------------------------------------
-- 3) NORMALIZA AS FLAGS (defesa em profundidade)
--    Desliga automação PRO/PREMIUM de quem não tem o plano.
--    Só a camada das views já barra o envio, mas manter a flag coerente evita
--    que um caminho novo (edge fn, n8n, query direta) reintroduza o vazamento.
-- ----------------------------------------------------------------------------
UPDATE configuracoes_cobranca c
SET
  enviar_3_dias_antes        = CASE WHEN NOT usuario_tem_plano(c.user_id,'pro')     THEN false ELSE c.enviar_3_dias_antes END,
  enviar_3_dias_depois       = CASE WHEN NOT usuario_tem_plano(c.user_id,'pro')     THEN false ELSE c.enviar_3_dias_depois END,
  alertar_despesas           = CASE WHEN NOT usuario_tem_plano(c.user_id,'pro')     THEN false ELSE c.alertar_despesas END,
  enviar_lembrete_aula       = CASE WHEN NOT usuario_tem_plano(c.user_id,'pro')     THEN false ELSE c.enviar_lembrete_aula END,
  enviar_aniversario         = CASE WHEN NOT usuario_tem_plano(c.user_id,'pro')     THEN false ELSE c.enviar_aniversario END,
  recuperacao_inativos_ativa = CASE WHEN NOT usuario_tem_plano(c.user_id,'pro')     THEN false ELSE c.recuperacao_inativos_ativa END,
  enviar_resumo_diario       = CASE WHEN NOT usuario_tem_plano(c.user_id,'premium') THEN false ELSE c.enviar_resumo_diario END,
  nps_experimental_ativo     = CASE WHEN NOT usuario_tem_plano(c.user_id,'premium') THEN false ELSE c.nps_experimental_ativo END,
  updated_at = now()
WHERE
  (NOT usuario_tem_plano(c.user_id,'pro') AND (c.enviar_3_dias_antes OR c.enviar_3_dias_depois
      OR c.alertar_despesas OR c.enviar_lembrete_aula OR c.enviar_aniversario OR c.recuperacao_inativos_ativa))
  OR
  (NOT usuario_tem_plano(c.user_id,'premium') AND (c.enviar_resumo_diario OR c.nps_experimental_ativo));


-- ----------------------------------------------------------------------------
-- 4) VISIBILIDADE DO CORTE (aplicada em 19/08/2026)
-- ----------------------------------------------------------------------------
-- Sem isto, a conta barrada apenas SOME das views vw_parcelas_*: sem envio,
-- sem log, sem alerta. É o mesmo modo de falha do incidente da instância
-- offline (Rede Fit, 04/08), que já tem a sua vw_parcelas_barradas_offline.
--
-- `motivo` distingue ex-pagante de trial expirado: quem tem plano_vencimento
-- preenchido já teve plano, mesmo com a flag plano_pago desligada na mão.

CREATE OR REPLACE VIEW public.vw_contas_barradas_plano AS
SELECT
  u.id AS user_id,
  u.nome_empresa,
  u.email,
  u.telefone,
  u.plano,
  u.plano_pago,
  u.plano_vencimento,
  u.trial_fim,
  CASE
    WHEN u.plano_pago AND u.plano_vencimento IS NULL              THEN 'pago_sem_vencimento'
    WHEN u.plano_pago AND u.plano_vencimento::date < CURRENT_DATE THEN 'plano_vencido'
    WHEN NOT u.plano_pago AND u.plano_vencimento IS NOT NULL      THEN 'ex_pagante'
    WHEN u.trial_fim IS NOT NULL AND u.trial_fim::date < CURRENT_DATE
                                                                  THEN 'trial_expirado'
    ELSE 'sem_plano'
  END AS motivo,
  GREATEST(CURRENT_DATE - COALESCE(u.plano_vencimento::date, u.trial_fim::date), 0) AS dias_barrada,
  (SELECT count(*) FROM devedores d
     WHERE d.user_id = u.id AND COALESCE(d.lixo,false) = false) AS alunos,
  (SELECT count(*) FROM mensalidades m
     JOIN devedores d ON d.id = m.devedor_id
    WHERE d.user_id = u.id
      AND COALESCE(d.lixo,false) = false
      AND COALESCE(m.lixo,false) = false
      AND m.status <> 'pago') AS parcelas_pendentes,
  (SELECT COALESCE(sum(m.valor),0) FROM mensalidades m
     JOIN devedores d ON d.id = m.devedor_id
    WHERE d.user_id = u.id
      AND COALESCE(d.lixo,false) = false
      AND COALESCE(m.lixo,false) = false
      AND m.status <> 'pago') AS valor_parado,
  (SELECT max(l.created_at) FROM logs_mensagens l WHERE l.user_id = u.id) AS ultimo_envio,
  COALESCE(mz.conectado,false) AS whatsapp_conectado
FROM usuarios u
LEFT JOIN mensallizap mz ON mz.user_id = u.id
WHERE NOT usuario_pode_enviar(u.id)
  AND EXISTS (SELECT 1 FROM devedores d
               WHERE d.user_id = u.id AND COALESCE(d.lixo,false) = false);


-- ----------------------------------------------------------------------------
-- 5) TESTE DE INVARIANTE — rodar sempre depois de mexer em view de automação.
--    As 3 colunas TÊM que dar 0. Se der > 0, alguma view perdeu o gate.
--
--    ⚠️ Valide por COMPORTAMENTO (este teste), nunca por LIKE no pg_get_viewdef:
--    o Postgres reescreve a definição ao salvar, então checagem textual dá
--    falso negativo.
-- ----------------------------------------------------------------------------
WITH todas AS (
  SELECT 'starter' p, user_id FROM vw_parcelas_no_dia
  UNION ALL SELECT 'pro',     user_id FROM vw_parcelas_3dias_antes
  UNION ALL SELECT 'pro',     user_id FROM vw_parcelas_3dias_depois
  UNION ALL SELECT 'pro',     user_id FROM vw_parcelas_em_atraso
  UNION ALL SELECT 'pro',     user_id FROM vw_parcelas_lembrete_3dias
  UNION ALL SELECT 'pro',     user_id FROM vw_alerta_despesas
  UNION ALL SELECT 'pro',     user_id FROM vw_alunos_inativos_regua
  UNION ALL SELECT 'pro',     user_id FROM vw_aniversariantes_do_dia
  UNION ALL SELECT 'pro',     user_id FROM vw_aulas_lembrete_1hora
  UNION ALL SELECT 'premium', user_id FROM vw_alunos_aguardando_nps
  UNION ALL SELECT 'premium', user_id FROM vw_resumo_diario_agendamento
  UNION ALL SELECT 'premium', user_id FROM vw_resumo_diario_completo
)
SELECT
  count(*) FILTER (WHERE NOT usuario_pode_enviar(user_id))  AS viola_gate_pagamento,  -- tem que ser 0
  count(*) FILTER (WHERE NOT usuario_tem_plano(user_id, p)) AS viola_gate_plano,      -- tem que ser 0
  count(*)                                                  AS linhas_legitimas
FROM todas;
