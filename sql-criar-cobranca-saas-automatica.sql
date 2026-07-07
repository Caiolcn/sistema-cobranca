-- ============================================================
-- COBRANÇA SAAS AUTOMÁTICA — lembretes de vencimento do plano
-- para os clientes PAGANTES do Mensalli (D-3 / no dia / D+3).
-- Espelha o padrão do alerta-despesas: view -> edge function -> pg_cron.
--
-- Aplicado em produção via migration `cobranca_saas_automatica`.
-- Este arquivo é a referência versionada. Componentes relacionados:
--   - Edge function: supabase/functions/cobranca-saas/index.ts
--   - UI: src/AdminCobrancaSaas.js  (rota /app/admin/cobranca-saas)
--   - pg_cron job: 'cobranca-saas-diaria'  (0 12 * * *  =  9h BRT)
-- ============================================================

-- 1) Tabela de config (1 linha) — liga/desliga a automação pelo painel.
CREATE TABLE IF NOT EXISTS mensalli_cobranca_saas_config (
  id BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (id),
  ativa BOOLEAN NOT NULL DEFAULT FALSE,       -- nasce DESLIGADA (rollout seguro)
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by UUID REFERENCES auth.users(id)
);
INSERT INTO mensalli_cobranca_saas_config (id, ativa)
VALUES (TRUE, FALSE)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE mensalli_cobranca_saas_config ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admin gerencia cobranca_saas_config" ON mensalli_cobranca_saas_config;
CREATE POLICY "Admin gerencia cobranca_saas_config"
  ON mensalli_cobranca_saas_config FOR ALL
  USING (is_admin()) WITH CHECK (is_admin());

-- 2) Dedup por ciclo: coluna com a data de vencimento do ciclo cobrado.
ALTER TABLE retencao_saas_envios
  ADD COLUMN IF NOT EXISTS ciclo_vencimento DATE;
CREATE INDEX IF NOT EXISTS idx_retencao_envios_dedup_ciclo
  ON retencao_saas_envios (usuario_id, tipo, ciclo_vencimento);

-- 3) Templates das 3 mensagens (reaproveita templates_admin; texto vindo do Admin.js).
--    Variáveis: {{nome}} {{plano}} {{valor}} {{vencimento}} {{dias}} {{dias_atraso}}
INSERT INTO templates_admin (tipo, titulo, mensagem) VALUES
(
  'venc_d3',
  'Cobrança SaaS — 3 dias antes do vencimento',
  E'Oi {{nome}}! 👋\n\nPassando pra lembrar que sua mensalidade do Mensalli vence em *{{dias}} dias* ({{vencimento}}).\n\n💰 *Valor:* R$ {{valor}}\n💳 *Pix:* 62981618862\n\n⚠️ Após o vencimento, os disparos automáticos para seus alunos ficam pausados — ou seja, suas cobranças param de ser enviadas e seus alunos não recebem mais as mensagens.\n\nPra manter tudo rodando, é só pagar até a data. Qualquer dúvida, é só chamar! 🙌'
),
(
  'venc_hoje',
  'Cobrança SaaS — vence hoje',
  E'Oi {{nome}}! 👋\n\nPassando pra lembrar que sua mensalidade do Mensalli *vence hoje* ({{vencimento}}).\n\n💰 *Valor:* R$ {{valor}}\n💳 *Pix:* 62981618862\n\n⚠️ A partir do vencimento, os disparos automáticos para seus alunos ficam pausados — ou seja, suas cobranças param de ser enviadas e seus alunos não recebem mais as mensagens.\n\nPra não ter interrupção, garante o pagamento ainda hoje. Qualquer dúvida, é só chamar! 🙌'
),
(
  'venc_vencido',
  'Cobrança SaaS — 3 dias após o vencimento',
  E'Oi {{nome}}! 👋\n\nSua mensalidade do Mensalli *venceu há {{dias_atraso}} dia(s)* ({{vencimento}}) e ainda não identifiquei o pagamento.\n\n💰 *Valor:* R$ {{valor}}\n💳 *Pix:* 62981618862\n\n⚠️ Enquanto está em aberto, os disparos automáticos para seus alunos seguem pausados — suas cobranças não estão sendo enviadas e seus alunos não recebem mais as mensagens.\n\nPra reativar tudo na hora, é só fazer o pagamento. Qualquer dúvida, é só chamar! 🙌'
)
ON CONFLICT (tipo) DO NOTHING;

-- 4) View dos alvos da automação: clientes PAGANTES nos 3 marcos (datas em BRT).
DROP VIEW IF EXISTS vw_mensalli_cobranca_saas;
CREATE VIEW vw_mensalli_cobranca_saas AS
WITH base AS (
  SELECT
    u.id AS usuario_id,
    COALESCE(NULLIF(TRIM(u.nome_empresa), ''), NULLIF(TRIM(u.nome_completo), ''), u.email) AS nome_cliente,
    u.telefone,
    u.plano,
    CASE lower(u.plano)
      WHEN 'starter' THEN 49.90
      WHEN 'pro'     THEN 99.90
      WHEN 'premium' THEN 149.90
      ELSE 0
    END AS valor,
    (u.plano_vencimento AT TIME ZONE 'America/Sao_Paulo')::date AS data_vencimento,
    ((u.plano_vencimento AT TIME ZONE 'America/Sao_Paulo')::date
       - (NOW() AT TIME ZONE 'America/Sao_Paulo')::date) AS dias_para_vencer
  FROM usuarios u
  WHERE u.plano_pago = TRUE
    AND u.plano_vencimento IS NOT NULL
    AND u.telefone IS NOT NULL
    AND u.telefone <> ''
    AND u.role IS DISTINCT FROM 'admin'
)
SELECT
  CASE dias_para_vencer
    WHEN 3  THEN 'venc_d3'
    WHEN 0  THEN 'venc_hoje'
    WHEN -3 THEN 'venc_vencido'
  END AS bucket,
  usuario_id,
  nome_cliente,
  telefone,
  plano,
  valor,
  data_vencimento,
  dias_para_vencer,
  GREATEST(dias_para_vencer, 0)   AS dias,          -- p/ {{dias}} (venc_d3 = 3)
  GREATEST(-dias_para_vencer, 0)  AS dias_atraso    -- p/ {{dias_atraso}} (vencido = 3)
FROM base
WHERE dias_para_vencer IN (3, 0, -3);

-- 5) Agendamento diário (9h BRT = 12h UTC). Sempre chama a função; ela faz
--    no-op quando mensalli_cobranca_saas_config.ativa = false.
-- SELECT cron.schedule(
--   'cobranca-saas-diaria',
--   '0 12 * * *',
--   $$
--   SELECT net.http_post(
--     url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'project_url') || '/functions/v1/cobranca-saas',
--     headers := jsonb_build_object(
--       'Content-Type', 'application/json',
--       'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key')
--     ),
--     body := '{}'::jsonb
--   );
--   $$
-- );
