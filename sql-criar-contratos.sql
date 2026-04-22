-- ============================================================
-- CONTRATOS — Templates + envio + assinatura digital simples
-- ============================================================
-- Fluxo:
--   1. Dono cria templates em Configuração > Contratos
--   2. Na ficha do aluno, clica "Enviar contrato" → gera token → envia link no WhatsApp
--   3. Aluno abre link /contrato/:token → lê → digita nome → escolhe fonte cursiva → assina
--   4. Dono vê status 'assinado' na ficha do aluno
-- Disponível no plano Pro+ (requer WhatsApp pro envio).
-- ============================================================

-- 1. Templates de contratos (criados pelo dono)
CREATE TABLE IF NOT EXISTS contratos_templates (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  titulo TEXT NOT NULL,
  conteudo TEXT NOT NULL,
  ativo BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_contratos_templates_user_id ON contratos_templates(user_id);
CREATE INDEX IF NOT EXISTS idx_contratos_templates_ativo ON contratos_templates(ativo);

ALTER TABLE contratos_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Usuarios gerenciam proprios templates contratos" ON contratos_templates;
CREATE POLICY "Usuarios gerenciam proprios templates contratos"
  ON contratos_templates FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);


-- 2. Contratos enviados (um por envio — snapshot do conteúdo na hora do envio)
CREATE TABLE IF NOT EXISTS contratos_enviados (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  devedor_id UUID REFERENCES devedores(id) ON DELETE CASCADE NOT NULL,
  template_id UUID REFERENCES contratos_templates(id) ON DELETE SET NULL,

  -- Snapshot no momento do envio (imutável após assinatura)
  titulo TEXT NOT NULL,
  conteudo TEXT NOT NULL,

  -- Token pra acesso público (link /contrato/:token)
  link_token TEXT UNIQUE NOT NULL,

  -- Status do fluxo
  status TEXT DEFAULT 'enviado' CHECK (status IN ('enviado', 'assinado', 'cancelado')),

  -- Dados da assinatura
  assinatura_nome TEXT,
  assinatura_fonte TEXT,  -- Ex: 'Dancing Script', 'Great Vibes', etc.
  aceitou_termos BOOLEAN DEFAULT false,
  ip_assinatura TEXT,
  user_agent_assinatura TEXT,
  assinado_em TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_contratos_enviados_user_id ON contratos_enviados(user_id);
CREATE INDEX IF NOT EXISTS idx_contratos_enviados_devedor_id ON contratos_enviados(devedor_id);
CREATE INDEX IF NOT EXISTS idx_contratos_enviados_link_token ON contratos_enviados(link_token);
CREATE INDEX IF NOT EXISTS idx_contratos_enviados_status ON contratos_enviados(status);

ALTER TABLE contratos_enviados ENABLE ROW LEVEL SECURITY;

-- Dono vê só os próprios
DROP POLICY IF EXISTS "Dono gerencia proprios contratos enviados" ON contratos_enviados;
CREATE POLICY "Dono gerencia proprios contratos enviados"
  ON contratos_enviados FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Acesso público via token (pra página /contrato/:token funcionar sem login)
DROP POLICY IF EXISTS "Acesso publico por token contrato" ON contratos_enviados;
CREATE POLICY "Acesso publico por token contrato"
  ON contratos_enviados FOR SELECT
  USING (true);  -- filtra pelo token na query do cliente

-- Permitir UPDATE público só pra assinar (status precisa estar 'enviado' e mudar pra 'assinado')
DROP POLICY IF EXISTS "Assinatura publica contrato" ON contratos_enviados;
CREATE POLICY "Assinatura publica contrato"
  ON contratos_enviados FOR UPDATE
  USING (status = 'enviado')
  WITH CHECK (status = 'assinado');


-- 3. View com dados do aluno agregados (pra listagem na ficha)
DROP VIEW IF EXISTS vw_contratos_enviados;
CREATE VIEW vw_contratos_enviados AS
SELECT
  c.id,
  c.user_id,
  c.devedor_id,
  c.template_id,
  c.titulo,
  c.link_token,
  c.status,
  c.assinatura_nome,
  c.assinado_em,
  c.created_at,
  d.nome AS devedor_nome,
  d.telefone AS devedor_telefone
FROM contratos_enviados c
JOIN devedores d ON d.id = c.devedor_id
ORDER BY c.created_at DESC;


-- 4. Função pra gerar token único (32 chars hex)
CREATE OR REPLACE FUNCTION gerar_token_contrato()
RETURNS TEXT AS $$
DECLARE
  novo_token TEXT;
  existe BOOLEAN;
BEGIN
  LOOP
    novo_token := encode(gen_random_bytes(16), 'hex');
    SELECT EXISTS(SELECT 1 FROM contratos_enviados WHERE link_token = novo_token) INTO existe;
    EXIT WHEN NOT existe;
  END LOOP;
  RETURN novo_token;
END;
$$ LANGUAGE plpgsql;


-- 5. Trigger pra manter updated_at atualizado
CREATE OR REPLACE FUNCTION update_contratos_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_contratos_templates_updated_at ON contratos_templates;
CREATE TRIGGER trg_contratos_templates_updated_at
  BEFORE UPDATE ON contratos_templates
  FOR EACH ROW EXECUTE FUNCTION update_contratos_updated_at();

DROP TRIGGER IF EXISTS trg_contratos_enviados_updated_at ON contratos_enviados;
CREATE TRIGGER trg_contratos_enviados_updated_at
  BEFORE UPDATE ON contratos_enviados
  FOR EACH ROW EXECUTE FUNCTION update_contratos_updated_at();


-- ==========================================
-- VERIFICAÇÃO
-- ==========================================
-- SELECT gerar_token_contrato();
-- SELECT * FROM contratos_templates;
-- SELECT * FROM vw_contratos_enviados LIMIT 10;
