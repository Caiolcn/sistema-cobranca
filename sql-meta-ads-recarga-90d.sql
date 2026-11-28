-- ============================================================
-- Meta Ads: recarga de 90 dias do gasto (meta_ads_gasto)
-- Rodar SÓ DEPOIS de publicar a meta-ads-sync nova (com verify_jwt ligado):
--   npx supabase functions deploy meta-ads-sync
-- A versão publicada antes (v4) respondia 401 ao cron, porque comparava o
-- service_role do vault como texto com o do env. O gasto parou em 29/10.
-- ============================================================

-- 1. Dispara a carga (assíncrona, via pg_net)
SELECT net.http_post(
  url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'project_url') || '/functions/v1/meta-ads-sync',
  headers := jsonb_build_object(
    'Content-Type', 'application/json',
    'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key')
  ),
  body := '{"dias": 90}'::jsonb,
  timeout_milliseconds := 60000
) AS request_id;

-- 2. Uns 10 segundos depois, rode só este SELECT para ver a resposta.
--    200 + "ok":true = gravou. 502 com "meta" = problema no token do Meta.
-- SELECT id, status_code, content::text, created
--   FROM net._http_response ORDER BY created DESC LIMIT 3;

-- 3. Conferência: o gasto tem que ir até ontem/hoje
-- SELECT max(data), sum(gasto) FILTER (WHERE data >= '2026-11-01') FROM meta_ads_gasto;
