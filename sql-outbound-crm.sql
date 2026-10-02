-- ============================================================
-- Outbound: CRM em kanban (02/10/26)
--
-- 1) SEGURANÇA: outbound_leads estava com RLS DESLIGADO e grant total pra anon
--    (qualquer um com a chave pública lia/apagava/truncava). A importação é
--    feita pela tela, logado como admin; o workflow n8n em uso
--    (n8n-workflow-outbound-export-excel.json) não grava no banco. O antigo
--    n8n-workflow-outbound-daily-list*.json (POST com anon key) pararia —
--    se um dia for religado, usar a secret key.
-- 2) Etapas do kanban + etapa_desde (contador de dias na etapa).
-- 3) sync_outbound_leads(): Respondeu / Criou conta / Fechado automáticos.
-- ============================================================

ALTER TABLE outbound_leads ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admin gerencia outbound_leads" ON outbound_leads;
CREATE POLICY "Admin gerencia outbound_leads" ON outbound_leads
  FOR ALL USING (is_admin()) WITH CHECK (is_admin());
REVOKE ALL ON outbound_leads FROM anon;

ALTER TABLE outbound_leads DROP CONSTRAINT IF EXISTS outbound_leads_status_check;
ALTER TABLE outbound_leads ADD CONSTRAINT outbound_leads_status_check
  CHECK (status IN ('novo','abordado','follow_up','respondeu','nao_respondeu','trial_criado','fechado','descartado'));

ALTER TABLE outbound_leads ADD COLUMN IF NOT EXISTS etapa_desde TIMESTAMPTZ;
-- criado_em/data_* são timestamp SEM fuso, gravados em UTC
UPDATE outbound_leads
   SET etapa_desde = COALESCE(data_resposta, data_abordagem, criado_em) AT TIME ZONE 'UTC'
 WHERE etapa_desde IS NULL;
ALTER TABLE outbound_leads ALTER COLUMN etapa_desde SET DEFAULT NOW();

CREATE OR REPLACE FUNCTION outbound_leads_etapa()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path TO 'public', 'pg_temp' AS $$
BEGIN
  IF TG_OP = 'INSERT' OR NEW.status IS DISTINCT FROM OLD.status THEN
    NEW.etapa_desde := NOW();
    IF NEW.status IN ('abordado', 'follow_up') AND NEW.data_abordagem IS NULL THEN
      NEW.data_abordagem := NOW() AT TIME ZONE 'UTC';
    END IF;
    IF NEW.status = 'respondeu' AND NEW.data_resposta IS NULL THEN
      NEW.data_resposta := NOW() AT TIME ZONE 'UTC';
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_outbound_leads_etapa ON outbound_leads;
CREATE TRIGGER trg_outbound_leads_etapa
  BEFORE INSERT OR UPDATE ON outbound_leads
  FOR EACH ROW EXECUTE FUNCTION outbound_leads_etapa();

-- Automáticos. Casa telefone com tel_chave() (DDD + 8 últimos, imune ao 9).
--   Respondeu:   chegou mensagem dele no WhatsApp do Mensalli DEPOIS da abordagem
--   Criou conta: telefone bate com uma conta
--   Fechado:     essa conta virou pagante
-- Descartado nunca é tocado.
CREATE OR REPLACE FUNCTION public.sync_outbound_leads()
RETURNS TABLE(responderam integer, criaram_conta integer, fecharam integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_resp INT := 0;
  v_conta INT := 0;
  v_fech INT := 0;
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'apenas admin';
  END IF;

  UPDATE outbound_leads o
     SET trial_id = (SELECT u.id FROM usuarios u
                      WHERE tel_chave(u.telefone) = tel_chave(o.telefone)
                      ORDER BY u.data_cadastro NULLS LAST LIMIT 1)
   WHERE o.trial_id IS NULL
     AND tel_chave(o.telefone) IS NOT NULL
     AND EXISTS (SELECT 1 FROM usuarios u WHERE tel_chave(u.telefone) = tel_chave(o.telefone));

  WITH r AS (
    SELECT o.id, min(m.enviado_em) AS primeira
      FROM outbound_leads o
      JOIN mensalli_leads l ON tel_chave(l.telefone) = tel_chave(o.telefone)
      JOIN mensalli_lead_mensagens m ON m.lead_id = l.id AND m.direcao = 'in'
                                    AND m.enviado_em > (o.data_abordagem AT TIME ZONE 'UTC')
     WHERE o.status IN ('abordado', 'follow_up', 'nao_respondeu')
       AND o.data_abordagem IS NOT NULL
       AND tel_chave(o.telefone) IS NOT NULL
     GROUP BY o.id
  )
  UPDATE outbound_leads o
     SET status = 'respondeu',
         data_resposta = COALESCE(o.data_resposta, r.primeira AT TIME ZONE 'UTC')
    FROM r WHERE o.id = r.id;
  GET DIAGNOSTICS v_resp = ROW_COUNT;

  UPDATE outbound_leads o SET status = 'trial_criado'
   WHERE o.trial_id IS NOT NULL
     AND o.status IN ('novo', 'abordado', 'follow_up', 'respondeu', 'nao_respondeu');
  GET DIAGNOSTICS v_conta = ROW_COUNT;

  UPDATE outbound_leads o SET status = 'fechado'
    FROM usuarios u
   WHERE u.id = o.trial_id
     AND (u.plano_pago = TRUE OR u.virou_pagante_em IS NOT NULL)
     AND o.status IN ('novo', 'abordado', 'follow_up', 'respondeu', 'nao_respondeu', 'trial_criado');
  GET DIAGNOSTICS v_fech = ROW_COUNT;

  RETURN QUERY SELECT v_resp, v_conta, v_fech;
END $$;
