-- ==========================================
-- CRIAR TABELAS DE CONFIGURAÇÃO
-- ==========================================

-- Tabela de Configurações da Empresa
CREATE TABLE IF NOT EXISTS configuracoes_empresa (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  nome_empresa VARCHAR(255),
  cnpj VARCHAR(18),
  endereco TEXT,
  cidade VARCHAR(100),
  estado VARCHAR(2),
  cep VARCHAR(9),
  telefone VARCHAR(20),
  email VARCHAR(255),
  site VARCHAR(255),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id)
);

-- Tabela de Configurações de Cobrança
CREATE TABLE IF NOT EXISTS configuracoes_cobranca (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  enviar_antes_vencimento BOOLEAN DEFAULT false,
  dias_antes_vencimento INTEGER DEFAULT 3 CHECK (dias_antes_vencimento IN (3, 5)),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id)
);

-- Adicionar coluna de ciclo de cobrança na tabela planos
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'planos'
        AND column_name = 'ciclo_cobranca'
    ) THEN
        ALTER TABLE planos
        ADD COLUMN ciclo_cobranca VARCHAR(20) DEFAULT 'mensal'
        CHECK (ciclo_cobranca IN ('mensal', 'trimestral', 'anual'));

        RAISE NOTICE 'Coluna ciclo_cobranca adicionada com sucesso!';
    ELSE
        RAISE NOTICE 'Coluna ciclo_cobranca já existe.';
    END IF;
END $$;

-- Criar índices para performance
CREATE INDEX IF NOT EXISTS idx_configuracoes_empresa_user_id ON configuracoes_empresa(user_id);
CREATE INDEX IF NOT EXISTS idx_configuracoes_cobranca_user_id ON configuracoes_cobranca(user_id);

-- Habilitar RLS (Row Level Security)
ALTER TABLE configuracoes_empresa ENABLE ROW LEVEL SECURITY;
ALTER TABLE configuracoes_cobranca ENABLE ROW LEVEL SECURITY;

-- Policies para configuracoes_empresa
DROP POLICY IF EXISTS "Users can manage own company settings" ON configuracoes_empresa;
CREATE POLICY "Users can manage own company settings" ON configuracoes_empresa
  FOR ALL USING (user_id = auth.uid());

-- Policies para configuracoes_cobranca
DROP POLICY IF EXISTS "Users can manage own billing settings" ON configuracoes_cobranca;
CREATE POLICY "Users can manage own billing settings" ON configuracoes_cobranca
  FOR ALL USING (user_id = auth.uid());

-- Verificar estrutura final
SELECT 'configuracoes_empresa' as tabela, column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'configuracoes_empresa'
ORDER BY ordinal_position;

SELECT 'configuracoes_cobranca' as tabela, column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'configuracoes_cobranca'
ORDER BY ordinal_position;

SELECT 'planos' as tabela, column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'planos'
AND column_name = 'ciclo_cobranca'
ORDER BY ordinal_position;
