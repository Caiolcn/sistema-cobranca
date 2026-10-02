ALTER TABLE public.outbound_leads
  ADD COLUMN IF NOT EXISTS place_id TEXT,
  ADD COLUMN IF NOT EXISTS dados_google JSONB,
  ALTER COLUMN telefone DROP NOT NULL,
  ALTER COLUMN mensagem_template DROP NOT NULL;

ALTER TABLE public.outbound_leads DROP CONSTRAINT IF EXISTS outbound_leads_vertical_check;
ALTER TABLE public.outbound_leads DROP CONSTRAINT IF EXISTS outbound_leads_instance_id_telefone_key;

-- Dedupe por lugar do Google: reimportar o mesmo place_id não cria card repetido
CREATE UNIQUE INDEX IF NOT EXISTS outbound_leads_instance_place_uniq
  ON public.outbound_leads(instance_id, place_id);
