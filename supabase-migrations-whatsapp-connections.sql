-- =========================================
-- MIGRATION: WhatsApp Connections State
-- =========================================
-- Esta migration cria uma tabela para persistir o estado da conexão WhatsApp
-- Resolve o problema de estado perdido após refresh da página

-- 1. Criar tabela whatsapp_connections
CREATE TABLE IF NOT EXISTS whatsapp_connections (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  instance_name TEXT NOT NULL,
  instance_exists BOOLEAN DEFAULT false,
  status TEXT DEFAULT 'disconnected' CHECK (status IN ('disconnected', 'connecting', 'connected')),
  last_connected_at TIMESTAMP WITH TIME ZONE,
  last_verified_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Adicionar índices para performance
CREATE INDEX IF NOT EXISTS idx_whatsapp_connections_instance_name
  ON whatsapp_connections(instance_name);

CREATE INDEX IF NOT EXISTS idx_whatsapp_connections_status
  ON whatsapp_connections(status);

CREATE INDEX IF NOT EXISTS idx_whatsapp_connections_last_verified
  ON whatsapp_connections(last_verified_at);

-- 3. Habilitar RLS (Row Level Security)
ALTER TABLE whatsapp_connections ENABLE ROW LEVEL SECURITY;

-- 4. Remover policies antigas se existirem
DROP POLICY IF EXISTS "Usuários podem ver sua própria conexão" ON whatsapp_connections;
DROP POLICY IF EXISTS "Usuários podem inserir sua própria conexão" ON whatsapp_connections;
DROP POLICY IF EXISTS "Usuários podem atualizar sua própria conexão" ON whatsapp_connections;
DROP POLICY IF EXISTS "Usuários podem deletar sua própria conexão" ON whatsapp_connections;

-- 5. Criar policies de acesso
CREATE POLICY "Usuários podem ver sua própria conexão"
  ON whatsapp_connections FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Usuários podem inserir sua própria conexão"
  ON whatsapp_connections FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Usuários podem atualizar sua própria conexão"
  ON whatsapp_connections FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Usuários podem deletar sua própria conexão"
  ON whatsapp_connections FOR DELETE
  USING (auth.uid() = user_id);

-- 6. Criar função para atualizar updated_at automaticamente
CREATE OR REPLACE FUNCTION update_whatsapp_connections_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 7. Criar trigger para updated_at
DROP TRIGGER IF EXISTS set_whatsapp_connections_updated_at ON whatsapp_connections;

CREATE TRIGGER set_whatsapp_connections_updated_at
  BEFORE UPDATE ON whatsapp_connections
  FOR EACH ROW
  EXECUTE FUNCTION update_whatsapp_connections_updated_at();

-- 8. Comentários para documentação
COMMENT ON TABLE whatsapp_connections IS 'Armazena o estado persistente das conexões WhatsApp dos usuários';
COMMENT ON COLUMN whatsapp_connections.user_id IS 'ID do usuário dono da conexão';
COMMENT ON COLUMN whatsapp_connections.instance_name IS 'Nome da instância na Evolution API (formato: instance_xxxxx)';
COMMENT ON COLUMN whatsapp_connections.instance_exists IS 'Se a instância existe na Evolution API';
COMMENT ON COLUMN whatsapp_connections.status IS 'Status da conexão: disconnected, connecting ou connected';
COMMENT ON COLUMN whatsapp_connections.last_connected_at IS 'Timestamp da última vez que conectou com sucesso';
COMMENT ON COLUMN whatsapp_connections.last_verified_at IS 'Timestamp da última verificação de status';

-- 9. Verificação de sucesso
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_name = 'whatsapp_connections'
  ) THEN
    RAISE NOTICE '✅ Migration concluída com sucesso!';
    RAISE NOTICE '✅ Tabela whatsapp_connections criada';
    RAISE NOTICE '✅ Índices criados';
    RAISE NOTICE '✅ RLS policies configuradas';
    RAISE NOTICE '✅ Trigger de updated_at configurado';
  ELSE
    RAISE EXCEPTION '❌ Erro: Tabela whatsapp_connections não foi criada';
  END IF;
END $$;
