-- ============================================================
-- LEADS - CRM de captação (clientes em potencial)
-- ============================================================

CREATE TABLE IF NOT EXISTS leads (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  telefone TEXT,
  email TEXT,
  origem TEXT DEFAULT 'manual',
  -- origens possíveis: manual, whatsapp_bot, landing_page, indicacao
  interesse TEXT,
  -- ex: 'Conhecer aulas', 'Valores', 'Aula experimental'
  status TEXT NOT NULL DEFAULT 'novo',
  -- status: novo, em_contato, experimental, convertido, perdido
  observacoes TEXT,
  ultima_mensagem TEXT,
  ultima_interacao TIMESTAMPTZ DEFAULT NOW(),
  convertido_em_devedor_id UUID REFERENCES devedores(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_leads_user_status ON leads (user_id, status);
CREATE INDEX IF NOT EXISTS idx_leads_telefone ON leads (telefone);

-- RLS
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Usuarios veem seus leads" ON leads;
CREATE POLICY "Usuarios veem seus leads"
  ON leads FOR SELECT
  USING (auth.uid() = user_id OR is_admin());

DROP POLICY IF EXISTS "Usuarios criam seus leads" ON leads;
CREATE POLICY "Usuarios criam seus leads"
  ON leads FOR INSERT
  WITH CHECK (auth.uid() = user_id OR is_admin());

DROP POLICY IF EXISTS "Usuarios atualizam seus leads" ON leads;
CREATE POLICY "Usuarios atualizam seus leads"
  ON leads FOR UPDATE
  USING (auth.uid() = user_id OR is_admin());

DROP POLICY IF EXISTS "Usuarios deletam seus leads" ON leads;
CREATE POLICY "Usuarios deletam seus leads"
  ON leads FOR DELETE
  USING (auth.uid() = user_id OR is_admin());

-- Service role pode tudo (pro bot inserir)
DROP POLICY IF EXISTS "Service role insere leads" ON leads;
CREATE POLICY "Service role insere leads"
  ON leads FOR INSERT
  WITH CHECK (true);

DROP POLICY IF EXISTS "Service role atualiza leads" ON leads;
CREATE POLICY "Service role atualiza leads"
  ON leads FOR UPDATE
  USING (true);

-- Trigger updated_at
CREATE OR REPLACE FUNCTION update_leads_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS leads_updated_at ON leads;
CREATE TRIGGER leads_updated_at
  BEFORE UPDATE ON leads
  FOR EACH ROW
  EXECUTE FUNCTION update_leads_updated_at();
