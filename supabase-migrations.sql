-- ========================================
-- MIGRATIONS PARA SISTEMA DE COBRANÇA
-- ========================================

-- 0. Criar tabela de configurações (se não existir)
CREATE TABLE IF NOT EXISTS config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  chave TEXT NOT NULL,
  valor TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, chave)
);

-- Index para buscar configurações do usuário
CREATE INDEX IF NOT EXISTS idx_config_user_id ON config(user_id);
CREATE INDEX IF NOT EXISTS idx_config_chave ON config(chave);

-- RLS (Row Level Security) para config
ALTER TABLE config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Usuários podem ver suas próprias configurações" ON config;
CREATE POLICY "Usuários podem ver suas próprias configurações"
  ON config FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Usuários podem criar suas próprias configurações" ON config;
CREATE POLICY "Usuários podem criar suas próprias configurações"
  ON config FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Usuários podem atualizar suas próprias configurações" ON config;
CREATE POLICY "Usuários podem atualizar suas próprias configurações"
  ON config FOR UPDATE
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Usuários podem deletar suas próprias configurações" ON config;
CREATE POLICY "Usuários podem deletar suas próprias configurações"
  ON config FOR DELETE
  USING (auth.uid() = user_id);

-- ========================================

-- 1. Criar tabela de templates de mensagens
CREATE TABLE IF NOT EXISTS templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  titulo TEXT NOT NULL,
  mensagem TEXT NOT NULL,
  ativo BOOLEAN DEFAULT true,
  is_padrao BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index para buscar templates do usuário
CREATE INDEX IF NOT EXISTS idx_templates_user_id ON templates(user_id);
CREATE INDEX IF NOT EXISTS idx_templates_ativo ON templates(ativo);

-- RLS (Row Level Security) para templates
ALTER TABLE templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Usuários podem ver seus próprios templates" ON templates;
CREATE POLICY "Usuários podem ver seus próprios templates"
  ON templates FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Usuários podem criar seus próprios templates" ON templates;
CREATE POLICY "Usuários podem criar seus próprios templates"
  ON templates FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Usuários podem atualizar seus próprios templates" ON templates;
CREATE POLICY "Usuários podem atualizar seus próprios templates"
  ON templates FOR UPDATE
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Usuários podem deletar seus próprios templates" ON templates;
CREATE POLICY "Usuários podem deletar seus próprios templates"
  ON templates FOR DELETE
  USING (auth.uid() = user_id);

-- ========================================

-- 2. Criar tabela de logs de mensagens
CREATE TABLE IF NOT EXISTS logs_mensagens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  devedor_id UUID REFERENCES devedores(id) ON DELETE SET NULL,
  parcela_id UUID REFERENCES parcelas(id) ON DELETE SET NULL,
  telefone TEXT NOT NULL,
  mensagem TEXT NOT NULL,
  valor_parcela NUMERIC(10, 2),
  status TEXT DEFAULT 'pendente' CHECK (status IN ('pendente', 'enviado', 'entregue', 'lido', 'erro')),
  erro TEXT,
  enviado_em TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  entregue_em TIMESTAMP WITH TIME ZONE,
  lido_em TIMESTAMP WITH TIME ZONE,
  message_id TEXT,
  instance_name TEXT
);

-- Indexes para logs_mensagens
CREATE INDEX IF NOT EXISTS idx_logs_user_id ON logs_mensagens(user_id);
CREATE INDEX IF NOT EXISTS idx_logs_devedor_id ON logs_mensagens(devedor_id);
CREATE INDEX IF NOT EXISTS idx_logs_parcela_id ON logs_mensagens(parcela_id);
CREATE INDEX IF NOT EXISTS idx_logs_status ON logs_mensagens(status);
CREATE INDEX IF NOT EXISTS idx_logs_enviado_em ON logs_mensagens(enviado_em DESC);

-- RLS para logs_mensagens
ALTER TABLE logs_mensagens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Usuários podem ver seus próprios logs" ON logs_mensagens;
CREATE POLICY "Usuários podem ver seus próprios logs"
  ON logs_mensagens FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Usuários podem criar seus próprios logs" ON logs_mensagens;
CREATE POLICY "Usuários podem criar seus próprios logs"
  ON logs_mensagens FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Usuários podem atualizar seus próprios logs" ON logs_mensagens;
CREATE POLICY "Usuários podem atualizar seus próprios logs"
  ON logs_mensagens FOR UPDATE
  USING (auth.uid() = user_id);

-- ========================================

-- 3. Adicionar campos faltantes na tabela parcelas
ALTER TABLE parcelas
  ADD COLUMN IF NOT EXISTS enviado_hoje BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS ultima_mensagem_enviada_em TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS total_mensagens_enviadas INTEGER DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_parcelas_enviado_hoje ON parcelas(enviado_hoje);
CREATE INDEX IF NOT EXISTS idx_parcelas_status_vencimento ON parcelas(status, data_vencimento);

-- ========================================

-- 4. Função para resetar enviado_hoje diariamente
CREATE OR REPLACE FUNCTION reset_enviado_hoje()
RETURNS void AS $$
BEGIN
  UPDATE parcelas
  SET enviado_hoje = false
  WHERE enviado_hoje = true;
END;
$$ LANGUAGE plpgsql;

-- ========================================
-- FIM DAS MIGRATIONS
-- ========================================
