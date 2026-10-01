-- Tabela para rastrear leads de outbound prospecting
CREATE TABLE IF NOT EXISTS public.outbound_leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  instance_id UUID NOT NULL REFERENCES public.instancias(id) ON DELETE CASCADE,
  
  -- Dados do prospect
  nome TEXT NOT NULL,
  vertical TEXT NOT NULL CHECK (vertical IN ('pilates', 'luta', 'natacao')),
  instagram_handle TEXT,
  telefone TEXT NOT NULL,
  google_maps_url TEXT,
  
  -- Mensagem customizada
  mensagem_template TEXT NOT NULL,
  
  -- Status do prospect
  status TEXT NOT NULL DEFAULT 'novo' CHECK (
    status IN ('novo', 'abordado', 'respondeu', 'nao_respondeu', 'trial_criado', 'fechado')
  ),
  
  -- Datas importantes
  data_abordagem TIMESTAMP WITH TIME ZONE,
  data_resposta TIMESTAMP WITH TIME ZONE,
  
  -- Link para trial criado (se houver)
  trial_id UUID REFERENCES public.usuarios(id) ON DELETE SET NULL,
  
  -- Notas do sales
  notas TEXT,
  
  -- Auditoria
  criado_em TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  atualizado_em TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  
  UNIQUE(instance_id, telefone)
);

-- Índices para performance
CREATE INDEX idx_outbound_leads_instance ON public.outbound_leads(instance_id);
CREATE INDEX idx_outbound_leads_status ON public.outbound_leads(status);
CREATE INDEX idx_outbound_leads_vertical ON public.outbound_leads(vertical);
CREATE INDEX idx_outbound_leads_criado_em ON public.outbound_leads(criado_em DESC);

-- RLS: cada instância vê só seus leads
ALTER TABLE public.outbound_leads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "outbound_leads_users_can_view_own"
  ON public.outbound_leads
  FOR SELECT
  USING (
    instance_id IN (
      SELECT id FROM public.instancias 
      WHERE usuario_id = auth.uid()
    )
  );

CREATE POLICY "outbound_leads_users_can_insert_own"
  ON public.outbound_leads
  FOR INSERT
  WITH CHECK (
    instance_id IN (
      SELECT id FROM public.instancias 
      WHERE usuario_id = auth.uid()
    )
  );

CREATE POLICY "outbound_leads_users_can_update_own"
  ON public.outbound_leads
  FOR UPDATE
  USING (
    instance_id IN (
      SELECT id FROM public.instancias 
      WHERE usuario_id = auth.uid()
    )
  );

-- Trigger para atualizar atualizado_em
CREATE OR REPLACE FUNCTION public.update_outbound_leads_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.atualizado_em = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_outbound_leads_updated_at
  BEFORE UPDATE ON public.outbound_leads
  FOR EACH ROW
  EXECUTE FUNCTION public.update_outbound_leads_updated_at();
