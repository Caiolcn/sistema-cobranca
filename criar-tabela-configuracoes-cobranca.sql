-- ==========================================
-- CRIAR TABELA CONFIGURAÇÕES DE COBRANÇA
-- ==========================================

-- Criar tabela configuracoes_cobranca se não existir
CREATE TABLE IF NOT EXISTS configuracoes_cobranca (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    enviar_antes_vencimento BOOLEAN DEFAULT false,
    dias_antes_vencimento INTEGER DEFAULT 3,
    enviar_3_dias_antes BOOLEAN DEFAULT false,
    enviar_5_dias_antes BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id)
);

-- Criar índice no user_id para melhor performance
CREATE INDEX IF NOT EXISTS idx_configuracoes_cobranca_user_id ON configuracoes_cobranca(user_id);

-- Habilitar RLS (Row Level Security)
ALTER TABLE configuracoes_cobranca ENABLE ROW LEVEL SECURITY;

-- Remover políticas existentes (se houver) e criar novas
DROP POLICY IF EXISTS "Users can view own billing config" ON configuracoes_cobranca;
DROP POLICY IF EXISTS "Users can insert own billing config" ON configuracoes_cobranca;
DROP POLICY IF EXISTS "Users can update own billing config" ON configuracoes_cobranca;
DROP POLICY IF EXISTS "Users can delete own billing config" ON configuracoes_cobranca;

-- Política de SELECT: usuários podem ver apenas suas próprias configurações
CREATE POLICY "Users can view own billing config"
    ON configuracoes_cobranca FOR SELECT
    USING (auth.uid() = user_id);

-- Política de INSERT: usuários podem inserir apenas suas próprias configurações
CREATE POLICY "Users can insert own billing config"
    ON configuracoes_cobranca FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- Política de UPDATE: usuários podem atualizar apenas suas próprias configurações
CREATE POLICY "Users can update own billing config"
    ON configuracoes_cobranca FOR UPDATE
    USING (auth.uid() = user_id);

-- Política de DELETE: usuários podem deletar apenas suas próprias configurações
CREATE POLICY "Users can delete own billing config"
    ON configuracoes_cobranca FOR DELETE
    USING (auth.uid() = user_id);

-- Verificar estrutura da tabela criada
SELECT
  'configuracoes_cobranca' as tabela,
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_name = 'configuracoes_cobranca'
ORDER BY ordinal_position;
