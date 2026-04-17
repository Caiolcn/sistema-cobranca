-- ============================================================
-- ALERTA DE DESPESAS — WhatsApp pro gestor quando despesa vence
-- ============================================================
-- Dispara mensagem pro WhatsApp do dono quando:
--   a) despesa vence em N dias (configurável, default 3)
--   b) despesa vence hoje
-- Cron diário via pg_cron invoca a edge function alerta-despesas.
-- Dedup por logs_mensagens (user_id, despesa_id, tipo, data).
-- Disponível no plano Pro+ (requer WhatsApp conectado).
-- ============================================================

-- 1. Colunas de configuração
ALTER TABLE configuracoes_cobranca
  ADD COLUMN IF NOT EXISTS alertar_despesas BOOLEAN DEFAULT false;

ALTER TABLE configuracoes_cobranca
  ADD COLUMN IF NOT EXISTS alertar_despesas_dias_antes INT DEFAULT 3
  CHECK (alertar_despesas_dias_antes BETWEEN 1 AND 30);


-- 2. View: despesas que devem disparar alerta hoje
DROP VIEW IF EXISTS vw_alerta_despesas;

CREATE VIEW vw_alerta_despesas AS
SELECT
  d.id AS despesa_id,
  d.user_id,
  d.descricao,
  d.valor,
  d.data_vencimento,
  (d.data_vencimento - CURRENT_DATE)::INT AS dias_restantes,
  CASE
    WHEN d.data_vencimento = CURRENT_DATE THEN 'hoje'
    WHEN d.data_vencimento > CURRENT_DATE THEN 'antecipado'
  END AS momento_alerta,
  c.nome AS categoria_nome,
  c.icone AS categoria_icone,
  u.nome_empresa,
  u.telefone AS telefone_admin,
  u.plano,
  cc.alertar_despesas_dias_antes,
  mz.instance_name AS evolution_instance_name,
  (SELECT valor FROM config WHERE chave = 'evolution_api_key' LIMIT 1) AS evolution_api_key,
  (SELECT valor FROM config WHERE chave = 'evolution_api_url' LIMIT 1) AS evolution_api_url
FROM despesas d
JOIN usuarios u ON u.id = d.user_id
JOIN configuracoes_cobranca cc ON cc.user_id = d.user_id AND cc.alertar_despesas = true
JOIN mensallizap mz ON mz.user_id = d.user_id AND mz.conectado = true
LEFT JOIN categorias_despesas c ON c.id = d.categoria_id
WHERE d.status = 'pendente'
  AND u.plano IN ('pro', 'premium')
  AND (u.plano_pago = true OR u.trial_ativo = true)
  AND u.telefone IS NOT NULL
  AND (
    d.data_vencimento = CURRENT_DATE
    OR d.data_vencimento = CURRENT_DATE + cc.alertar_despesas_dias_antes
  )
ORDER BY d.user_id, d.data_vencimento;

-- 3. Remover CHECK constraint antiga de templates.tipo (lista fechada engessava)
ALTER TABLE templates DROP CONSTRAINT IF EXISTS templates_tipo_check;


-- 4. Colunas em logs_mensagens para dedup de alertas de despesas
ALTER TABLE logs_mensagens
  ADD COLUMN IF NOT EXISTS despesa_id UUID REFERENCES despesas(id) ON DELETE SET NULL;

ALTER TABLE logs_mensagens
  ADD COLUMN IF NOT EXISTS tipo TEXT;

CREATE INDEX IF NOT EXISTS idx_logs_despesa_id ON logs_mensagens(despesa_id);
CREATE INDEX IF NOT EXISTS idx_logs_tipo ON logs_mensagens(tipo);


-- 5. Agendamento diário via pg_cron (8h BRT = 11h UTC)
-- Cronologia das automações: 7h resumo diário, 8h despesas, 9h cobranças.
-- Requer: extensions pg_cron e pg_net habilitadas no Supabase.
-- Guarda o service role key e a URL no vault antes:
--   SELECT vault.create_secret('<SUA_SERVICE_ROLE_KEY>', 'service_role_key');
--   SELECT vault.create_secret('https://<PROJETO>.supabase.co', 'project_url');

-- Remove agendamento anterior, se existir
SELECT cron.unschedule('alerta-despesas-diario')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'alerta-despesas-diario');

SELECT cron.schedule(
  'alerta-despesas-diario',
  '0 11 * * *',  -- 11:00 UTC = 08:00 BRT
  $$
  SELECT net.http_post(
    url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'project_url') || '/functions/v1/alerta-despesas',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key')
    ),
    body := '{}'::jsonb
  );
  $$
);

-- ==========================================
-- VERIFICAÇÃO
-- ==========================================
-- SELECT * FROM vw_alerta_despesas LIMIT 10;
-- SELECT * FROM cron.job WHERE jobname = 'alerta-despesas-diario';
-- SELECT * FROM cron.job_run_details WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname = 'alerta-despesas-diario') ORDER BY start_time DESC LIMIT 5;
