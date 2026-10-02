-- ============================================================
-- Separar outbound dos leads de campanha (02/10/26)
--
-- Prospect abordado no Outbound que responde no WhatsApp do Mensalli virava
-- card em Leads de campanha como se fosse do anúncio: entrava no Funil (com os
-- toques da campanha) e nas métricas da campanha paga.
--
-- Agora o lead nasce com origem = 'outbound' quando o telefone bate com um
-- contato do outbound_leads. Ele continua na Caixa (é onde se responde), com
-- lista e etiqueta próprias, mas sai do Funil, da aba Hoje e das métricas.
--
-- E o Outbound fica 100% manual (pedido do Caio): sai o sync_outbound_leads().
-- O trigger de etapa do outbound continua — só registra datas, não move card.
-- ============================================================

ALTER TABLE mensalli_leads DROP CONSTRAINT IF EXISTS mensalli_leads_origem_check;
ALTER TABLE mensalli_leads ADD CONSTRAINT mensalli_leads_origem_check
  CHECK (origem = ANY (ARRAY['whatsapp', 'backfill', 'manual', 'outbound']));

CREATE OR REPLACE FUNCTION mensalli_leads_marcar_outbound()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $$
BEGIN
  IF tel_chave(NEW.telefone) IS NOT NULL AND EXISTS (
    SELECT 1 FROM outbound_leads o WHERE tel_chave(o.telefone) = tel_chave(NEW.telefone)
  ) THEN
    NEW.origem := 'outbound';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_mensalli_leads_marcar_outbound ON mensalli_leads;
CREATE TRIGGER trg_mensalli_leads_marcar_outbound
  BEFORE INSERT ON mensalli_leads
  FOR EACH ROW EXECUTE FUNCTION mensalli_leads_marcar_outbound();

-- Quem já chegou depois de ser importado no outbound
UPDATE mensalli_leads l SET origem = 'outbound'
 WHERE l.origem <> 'outbound'
   AND tel_chave(l.telefone) IS NOT NULL
   AND EXISTS (SELECT 1 FROM outbound_leads o
                WHERE tel_chave(o.telefone) = tel_chave(l.telefone)
                  AND l.created_at > (o.criado_em AT TIME ZONE 'UTC'));

-- Métricas da campanha sem outbound
DO $$
DECLARE
  v_def TEXT := pg_get_viewdef('vw_mensalli_lead_metricas'::regclass);
  v_novo TEXT;
BEGIN
  IF position('outbound' IN v_def) = 0 THEN
    v_novo := replace(v_def, 'AND (l.vinculo_manual = false));',
                             'AND (l.vinculo_manual = false) AND (l.origem <> ''outbound''::text));');
    IF v_novo = v_def THEN
      RAISE EXCEPTION 'não achei o WHERE final de vw_mensalli_lead_metricas';
    END IF;
    EXECUTE 'CREATE OR REPLACE VIEW vw_mensalli_lead_metricas AS ' || v_novo;
  END IF;
END $$;
ALTER VIEW vw_mensalli_lead_metricas SET (security_invoker = true);

-- Outbound manual
DROP FUNCTION IF EXISTS public.sync_outbound_leads();
