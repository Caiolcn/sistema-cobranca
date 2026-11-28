-- ============================================================
-- Rastreamento de leads: conta e pagamento marcados na hora (30/10/2026)
-- Rodar inteiro no SQL Editor do Supabase, DEPOIS de publicar meta-ads-sync
-- e whatsapp-bot.
--
-- PROBLEMA
--   conta_detectada_em e pagamento_detectado_em so eram gravados pelo
--   sync_mensalli_leads, que roda quando o admin abre o Funil. Resultado: pagante
--   aparecia como "sem pagamento" e as datas saiam em lote (ex.: 22/10).
--
-- O QUE FAZ
--   1. Vinculo por telefone no cadastro ja marca conta_detectada_em.
--   2. Trigger novo: plano_pago virando true marca pagamento_detectado_em.
--   3. Retroativo: pagos sem marca e conversas de anuncio sem marca (o bot
--      publicado nao marcava; so o UPDATE de 29/10 tinha marcado).
--   4. Recarrega o gasto de 14 dias (o cron dava 401).
--
-- REVERTER
--   DROP TRIGGER mensalli_lead_pagante ON usuarios;
--   DROP FUNCTION trg_mensalli_lead_pagante();
--   e recriar trg_vincular_mensalli_lead de sql-meta-ads-cron-e-funil-whatsapp.sql
-- ============================================================

-- ---------- 1. Conta detectada no vinculo ----------
CREATE OR REPLACE FUNCTION public.trg_vincular_mensalli_lead()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF tel_chave(NEW.telefone) IS NOT NULL THEN
    UPDATE mensalli_leads
       SET usuario_id = NEW.id,
           status = CASE WHEN status = ANY (ARRAY['conversando','aguardando','a_toque_1','a_toque_2','a_toque_3',
                                                  'a_toque_4','a_toque_5','a_final','perdido'])
                         THEN 'criou_conta' ELSE status END,
           conta_detectada_em = COALESCE(conta_detectada_em, NOW()),
           updated_at = NOW()
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

-- ---------- 2. Pagamento detectado na hora ----------
CREATE OR REPLACE FUNCTION public.trg_mensalli_lead_pagante()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.plano_pago IS TRUE AND COALESCE(OLD.plano_pago, false) IS FALSE THEN
    UPDATE mensalli_leads
       SET status = CASE WHEN status = ANY (ARRAY['conversando','aguardando','a_toque_1','a_toque_2','a_toque_3',
                                                  'a_toque_4','a_toque_5','a_final','perdido','criou_conta'])
                         THEN 'pagante' ELSE status END,
           conta_detectada_em = COALESCE(conta_detectada_em, NOW()),
           pagamento_detectado_em = NOW(),
           updated_at = NOW()
     WHERE usuario_id = NEW.id
       AND pagamento_detectado_em IS NULL;
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Nunca derruba o pagamento por causa do CRM
  RAISE LOG 'trg_mensalli_lead_pagante erro: % (%)', SQLERRM, SQLSTATE;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS mensalli_lead_pagante ON usuarios;
CREATE TRIGGER mensalli_lead_pagante
  AFTER UPDATE OF plano_pago ON usuarios
  FOR EACH ROW EXECUTE FUNCTION trg_mensalli_lead_pagante();

-- ---------- 3. Retroativo ----------
UPDATE mensalli_leads l
   SET status = CASE WHEN l.status = ANY (ARRAY['conversando','aguardando','a_toque_1','a_toque_2','a_toque_3',
                                                'a_toque_4','a_toque_5','a_final','perdido','criou_conta'])
                     THEN 'pagante' ELSE l.status END,
       pagamento_detectado_em = COALESCE(u.virou_pagante_em, NOW()),
       updated_at = NOW()
  FROM usuarios u
 WHERE u.id = l.usuario_id
   AND u.plano_pago = TRUE
   AND l.pagamento_detectado_em IS NULL;

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

-- ---------- 4. Recarrega o gasto ----------
SELECT net.http_post(
  url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'project_url') || '/functions/v1/meta-ads-sync',
  headers := jsonb_build_object(
    'Content-Type', 'application/json',
    'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key')
  ),
  body := '{"dias": 14}'::jsonb,
  timeout_milliseconds := 60000
);

-- Conferência: pagos sem marca deve dar 0
SELECT count(*) FILTER (WHERE u.plano_pago AND l.pagamento_detectado_em IS NULL) AS pagos_sem_marca,
       count(*) FILTER (WHERE l.veio_de_anuncio AND l.created_at >= '2026-10-29') AS anuncio_desde_29_10
  FROM mensalli_leads l
  LEFT JOIN usuarios u ON u.id = l.usuario_id;
