-- ============================================================================
-- Orgânico (Instagram) — crons de coleta de métricas e de publicação
-- ----------------------------------------------------------------------------
-- RODAR SÓ DEPOIS de:
--   1. sql-organico-fase1/2/3 rodados;
--   2. supabase functions deploy organico-coletar e organico-publicar.
-- Mesmo padrão do sql-meta-ads-cron-e-funil-whatsapp.sql: URL e service_role
-- lidos do Vault (project_url, service_role_key). Nada de chave aqui.
--
--   organico-coletar-hora : de hora em hora (min 7). Stories no ar + posts
--                           dos últimos 3 dias + liga planejado <-> publicado.
--   organico-coletar-dia  : 06h30 BRT (09h30 UTC). Posts de até 30 dias + conta.
--   organico-publicar     : a cada 5 min. Não faz nada enquanto o interruptor
--                           "Publicação automática" da marca estiver DESLIGADO
--                           (nasce desligado) ou sem post aprovado no horário.
--
-- Para desligar um: SELECT cron.unschedule('<nome>');
-- Idempotente: apaga e recria.
-- ============================================================================

SELECT cron.unschedule(jobname) FROM cron.job
 WHERE jobname IN ('organico-coletar-hora', 'organico-coletar-dia', 'organico-publicar');

SELECT cron.schedule(
  'organico-coletar-hora',
  '7 * * * *',
  $$
  SELECT net.http_post(
    url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'project_url') || '/functions/v1/organico-coletar',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key')
    ),
    body := '{"modo":"hora"}'::jsonb,
    timeout_milliseconds := 120000
  );
  $$
);

SELECT cron.schedule(
  'organico-coletar-dia',
  '30 9 * * *',
  $$
  SELECT net.http_post(
    url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'project_url') || '/functions/v1/organico-coletar',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key')
    ),
    body := '{"modo":"dia"}'::jsonb,
    timeout_milliseconds := 120000
  );
  $$
);

SELECT cron.schedule(
  'organico-publicar',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'project_url') || '/functions/v1/organico-publicar',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
  $$
);

-- ---------- Conferência ----------
SELECT jobname, schedule, active FROM cron.job WHERE jobname LIKE 'organico-%' ORDER BY jobname;
