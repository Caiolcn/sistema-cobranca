-- ============================================================================
-- Crons -> edge functions: troca a service_role LEGADA por um segredo próprio
-- ----------------------------------------------------------------------------
-- Por quê: desde 02/11/2026 ~21h toda chamada do pg_cron às edge functions
-- volta 401 "Legacy API keys are disabled" (o Supabase passou a recusar a
-- service_role legada também nas funções). Parou: cobrança SaaS, trial-avisos,
-- lembrete de aula 24h, Meta Ads, orgânico, relatórios, alerta de despesas,
-- zumbi. Ver _shared/cron-auth.ts.
--
-- NÃO MEXE em:
--   * fila-worker (mensagens-worker): está 401 também, mas quem envia a fila
--     hoje é o n8n. Consertar o worker poderia mandar mensagem em dobro.
--   * whatsapp-health-check-diario: desligado de propósito.
--   * nada do disparo de cobrança dos alunos (n8n + fila), que segue normal.
--
-- ORDEM (rode em partes, no SQL Editor):
--   PARTE 1  -> cria o segredo no Vault e mostra o valor
--   (terminal) npx supabase secrets set CRON_SECRET=<valor da parte 1>
--   (terminal) deploy das 9 funções com --no-verify-jwt
--   PARTE 2  -> troca o cabeçalho das 11 crons
--   PARTE 3  -> teste: chama a coleta do orgânico e confere a resposta
-- ============================================================================


-- ======================= PARTE 1: segredo no Vault ==========================
-- Idempotente: se já existir, não cria outro.
SELECT vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'cron_secret', 'x-cron-secret das crons -> edge functions')
 WHERE NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'cron_secret');

-- Copie o valor (64 caracteres) para o comando "supabase secrets set".
SELECT decrypted_secret AS cron_secret FROM vault.decrypted_secrets WHERE name = 'cron_secret';


-- ======================= PARTE 2: cabeçalho das crons =======================
-- Troca  'Authorization','Bearer ' || <service_role_key do Vault>
-- por    'x-cron-secret', <cron_secret do Vault>
-- Resto do comando (URL, body, horário) fica igual.
SELECT j.jobname,
       cron.alter_job(
         j.jobid,
         command := regexp_replace(
           j.command,
           '''Authorization''\s*,\s*''Bearer ''\s*\|\|\s*\(SELECT decrypted_secret FROM vault\.decrypted_secrets WHERE name = ''service_role_key''\)',
           '''x-cron-secret'', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = ''cron_secret'')',
           'i'
         )
       ) AS alterado
  FROM cron.job j
 WHERE j.jobname IN (
   'alerta-despesas-diario', 'cobranca-saas-diaria', 'lembrete-aula-24h',
   'meta-ads-sync-diario', 'organico-coletar-dia', 'organico-coletar-hora',
   'organico-publicar', 'relatorio-mensagens-diario', 'relatorio-mensagens-whatsapp',
   'trial-avisos', 'whatsapp-zumbi-diario'
 );

-- Conferência: as 11 devem dizer "cron_secret"; fila-worker e health-check continuam "legado".
SELECT jobname, active,
       CASE WHEN command ILIKE '%cron_secret%' THEN 'cron_secret'
            WHEN command ILIKE '%service_role_key%' THEN 'legado'
            ELSE '-' END AS auth
  FROM cron.job
 WHERE command ILIKE '%net.http_post%'
 ORDER BY auth, jobname;


-- ======================= PARTE 3: teste ======================================
-- Chama a coleta de hora do orgânico (só lê métricas do Instagram, não publica
-- nem manda mensagem). Espere uns 10 segundos e rode o SELECT de baixo.
SELECT net.http_post(
  url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'project_url') || '/functions/v1/organico-coletar',
  headers := jsonb_build_object(
    'Content-Type', 'application/json',
    'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_secret')
  ),
  body := '{"modo":"hora"}'::jsonb,
  timeout_milliseconds := 120000
) AS request_id;

-- Esperado: status_code 200 e "ok". 401 = CRON_SECRET da função diferente do Vault
-- (ou função ainda sem --no-verify-jwt).
SELECT id, status_code, left(content::text, 200) AS resposta
  FROM net._http_response
 ORDER BY id DESC
 LIMIT 3;
