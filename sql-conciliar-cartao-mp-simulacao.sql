-- ============================================================================
-- conciliar-cartao-mp — SIMULAÇÃO (dryRun): lê o Mercado Pago e diz o que faria,
-- sem gravar nada. Rodar depois de publicar a função e ANTES do
-- sql-cobranca-saas-cartao-recorrente.sql (que liga a cron de hora em hora).
-- ============================================================================

-- 1) Dispara a simulação (janela de 45 dias de pagamentos).
SELECT net.http_post(
  url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'project_url') || '/functions/v1/conciliar-cartao-mp',
  headers := jsonb_build_object(
    'Content-Type', 'application/json',
    'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_secret')
  ),
  body := '{"dryRun": true, "dias": 45}'::jsonb,
  timeout_milliseconds := 120000
) AS request_id;

-- 2) Espere uns 15 segundos e rode isto. Esperado: status 200 e "dryRun": true.
SELECT id, status_code, content::jsonb AS resposta
  FROM net._http_response
 ORDER BY id DESC
 LIMIT 1;
