-- ============================================================
-- Meta Ads: gasto diário + funil do anúncio de WhatsApp
-- Rodar inteiro no SQL Editor do Supabase.
--
-- 1. Cron diário da edge function meta-ads-sync (gasto do Meta → meta_ads_gasto)
--    + uma carga agora de 90 dias, que o gasto estava parado desde 01/10.
-- 2. mensalli_leads ganha a marca "veio_de_anuncio" (+ dados do anúncio).
--    Retroativo: a conversa cuja 1ª mensagem é o texto pronto do anúncio
--    ("Oi! Vi o vídeo e quero saber mais sobre o Mensalli.").
--    Daqui pra frente o whatsapp-bot também marca pelo externalAdReply.
-- 3. Vínculo conversa → conta por telefone na hora do cadastro (trigger em
--    usuarios). Antes só acontecia quando o admin abria a caixa de leads.
-- ============================================================

-- ---------- 1. Cron do gasto ----------
SELECT cron.unschedule('meta-ads-sync-diario')
 WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'meta-ads-sync-diario');

-- 07h BRT. Sem body = últimos 7 dias (o Meta corrige os dias recentes).
SELECT cron.schedule(
  'meta-ads-sync-diario',
  '0 10 * * *',
  $$
  SELECT net.http_post(
    url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'project_url') || '/functions/v1/meta-ads-sync',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  $$
);

-- Carga agora: 90 dias (preenche outubro inteiro)
SELECT net.http_post(
  url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'project_url') || '/functions/v1/meta-ads-sync',
  headers := jsonb_build_object(
    'Content-Type', 'application/json',
    'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key')
  ),
  body := '{"dias": 90}'::jsonb,
  timeout_milliseconds := 60000
);

-- ---------- 2. Marca de anúncio nas conversas ----------
ALTER TABLE mensalli_leads
  ADD COLUMN IF NOT EXISTS veio_de_anuncio boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS anuncio_id text,
  ADD COLUMN IF NOT EXISTS anuncio_titulo text,
  ADD COLUMN IF NOT EXISTS ctwa_clid text;

CREATE INDEX IF NOT EXISTS idx_mensalli_leads_anuncio
  ON mensalli_leads (created_at) WHERE veio_de_anuncio;

WITH primeira AS (
  SELECT DISTINCT ON (lead_id) lead_id, texto
    FROM mensalli_lead_mensagens
   WHERE direcao = 'in'
   ORDER BY lead_id, enviado_em
)
UPDATE mensalli_leads l
   SET veio_de_anuncio = true
  FROM primeira p
 WHERE p.lead_id = l.id
   AND p.texto ILIKE 'Oi! Vi o vídeo e quero saber mais sobre o Mensalli%'
   AND NOT l.veio_de_anuncio;

-- ---------- 3. Vínculo por telefone no cadastro ----------
CREATE OR REPLACE FUNCTION public.trg_vincular_mensalli_lead()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF tel_chave(NEW.telefone) IS NOT NULL THEN
    UPDATE mensalli_leads
       SET usuario_id = NEW.id, updated_at = NOW()
     WHERE usuario_id IS NULL
       AND NOT COALESCE(vinculo_manual, false)
       AND tel_chave(telefone) = tel_chave(NEW.telefone);
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Nunca derruba o cadastro por causa do CRM
  RAISE LOG 'trg_vincular_mensalli_lead erro: % (%)', SQLERRM, SQLSTATE;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS vincular_mensalli_lead ON usuarios;
CREATE TRIGGER vincular_mensalli_lead
  AFTER INSERT OR UPDATE OF telefone ON usuarios
  FOR EACH ROW EXECUTE FUNCTION trg_vincular_mensalli_lead();

-- Recupera quem já se cadastrou e ficou sem vínculo
WITH match AS (
  SELECT l.id AS lead_id,
         (SELECT u.id FROM usuarios u
           WHERE tel_chave(u.telefone) = tel_chave(l.telefone)
           ORDER BY u.data_cadastro NULLS LAST LIMIT 1) AS usuario_id
    FROM mensalli_leads l
   WHERE l.usuario_id IS NULL
     AND NOT COALESCE(l.vinculo_manual, false)
     AND tel_chave(l.telefone) IS NOT NULL
)
UPDATE mensalli_leads l SET usuario_id = m.usuario_id, updated_at = NOW()
  FROM match m WHERE l.id = m.lead_id AND m.usuario_id IS NOT NULL;

-- Conferência: conversas do anúncio no mês → conta → pagante
SELECT count(*) AS conversas_anuncio,
       count(l.usuario_id) AS criaram_conta,
       count(*) FILTER (WHERE u.plano_pago) AS pagantes
  FROM mensalli_leads l
  LEFT JOIN usuarios u ON u.id = l.usuario_id
 WHERE l.veio_de_anuncio
   AND l.created_at >= date_trunc('month', now() AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'America/Sao_Paulo';
