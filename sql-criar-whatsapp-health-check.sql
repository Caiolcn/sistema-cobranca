-- ============================================================
-- WHATSAPP HEALTH CHECK — teste profundo de conexão Evolution
-- ============================================================
-- O painel da Evolution (connectionState) mente: fica "open" mesmo
-- com o socket morto por baixo. Resultado: cliente "conectado" mas
-- envio falha com Connection Closed.
--
-- Este cron roda diário e, pra cada cliente PAGO, força um round-trip
-- até o WhatsApp (POST /chat/whatsappNumbers). Se o socket está morto,
-- desloga a instância (libera o QR Code) e registra no relatório.
--
-- Motor: edge function whatsapp-health-check.
-- Esta migration cria a tabela de relatório, RLS, a RPC de leitura
-- (admin) e o agendamento pg_cron.
-- ============================================================

-- 1. Tabela de relatório (1 linha por cliente por execução)
CREATE TABLE IF NOT EXISTS whatsapp_health_checks (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  nome_empresa  TEXT,
  plano         TEXT,
  instance_name TEXT,
  estado_painel TEXT,                 -- o que o connectionState reportou (open/close/timeout/inexistente)
  probe_ok      BOOLEAN DEFAULT false, -- a sonda profunda respondeu sem erro?
  saudavel      BOOLEAN DEFAULT false, -- open + sonda ok = realmente conectado
  acao          TEXT DEFAULT 'nenhuma',-- 'nenhuma' | 'logout' | 'logout_falhou'
  erro          TEXT,
  checado_em    TIMESTAMPTZ DEFAULT NOW(),
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_whc_checado_em ON whatsapp_health_checks(checado_em DESC);
CREATE INDEX IF NOT EXISTS idx_whc_user_id ON whatsapp_health_checks(user_id);
CREATE INDEX IF NOT EXISTS idx_whc_saudavel ON whatsapp_health_checks(saudavel);

COMMENT ON TABLE whatsapp_health_checks IS 'Relatório diário do teste profundo de conexão WhatsApp (Evolution) por cliente pago';

-- 2. RLS — só admin lê (a edge function usa service_role e ignora RLS)
ALTER TABLE whatsapp_health_checks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin lê health checks" ON whatsapp_health_checks;
CREATE POLICY "admin lê health checks" ON whatsapp_health_checks
  FOR SELECT USING (is_admin());

-- 3. RPC: última execução do relatório (consumida pela página /app/admin/whatsapp-saude)
DROP FUNCTION IF EXISTS admin_whatsapp_saude();
CREATE OR REPLACE FUNCTION admin_whatsapp_saude()
RETURNS TABLE (
  user_id       UUID,
  nome_empresa  TEXT,
  plano         TEXT,
  instance_name TEXT,
  estado_painel TEXT,
  probe_ok      BOOLEAN,
  saudavel      BOOLEAN,
  acao          TEXT,
  erro          TEXT,
  checado_em    TIMESTAMPTZ
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  -- Pega só a execução mais recente (mesmo lote = mesmo checado_em)
  SELECT w.user_id, w.nome_empresa, w.plano, w.instance_name, w.estado_painel,
         w.probe_ok, w.saudavel, w.acao, w.erro, w.checado_em
  FROM whatsapp_health_checks w
  WHERE is_admin()
    AND w.checado_em = (SELECT MAX(checado_em) FROM whatsapp_health_checks)
  ORDER BY w.saudavel ASC, w.nome_empresa ASC;
$$;

GRANT EXECUTE ON FUNCTION admin_whatsapp_saude() TO authenticated;

-- 4. Agendamento diário via pg_cron — 8h BRT (11h UTC), 1h antes das automações
--    de envio (9h BRT). Folga pro gestor reconectar o QR após o aviso de queda,
--    e perto o bastante das cobranças pra pegar a desconexão real.
--    Requer pg_cron + pg_net habilitados e os secrets no vault:
--      SELECT vault.create_secret('<SERVICE_ROLE_KEY>', 'service_role_key');
--      SELECT vault.create_secret('https://<PROJETO>.supabase.co', 'project_url');
--    (já criados se o cron de alerta-despesas estiver rodando)

SELECT cron.unschedule('whatsapp-health-check-diario')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'whatsapp-health-check-diario');

SELECT cron.schedule(
  'whatsapp-health-check-diario',
  '0 11 * * *',  -- 11:00 UTC = 08:00 BRT
  $$
  SELECT net.http_post(
    url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'project_url') || '/functions/v1/whatsapp-health-check',
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
-- SELECT * FROM cron.job WHERE jobname = 'whatsapp-health-check-diario';
-- SELECT * FROM admin_whatsapp_saude();
-- SELECT * FROM cron.job_run_details
--   WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname = 'whatsapp-health-check-diario')
--   ORDER BY start_time DESC LIMIT 5;
--
-- Rodar manualmente agora (sem esperar o cron):
--   SELECT net.http_post(
--     url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'project_url') || '/functions/v1/whatsapp-health-check',
--     headers := jsonb_build_object('Content-Type','application/json',
--       'Authorization','Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key')),
--     body := '{}'::jsonb);
