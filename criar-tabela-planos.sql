-- ==========================================
-- CRIAR TABELA DE PLANOS
-- ==========================================

-- Criar tabela de planos se não existir
CREATE TABLE IF NOT EXISTS planos (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  nome VARCHAR(255) NOT NULL,
  valor DECIMAL(10, 2) NOT NULL,
  descricao TEXT,
  ativo BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Adicionar índice para melhorar performance
CREATE INDEX IF NOT EXISTS idx_planos_user_id ON planos(user_id);
CREATE INDEX IF NOT EXISTS idx_planos_ativo ON planos(ativo);

-- Adicionar coluna cpf na tabela devedores se não existir
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'devedores'
        AND column_name = 'cpf'
    ) THEN
        ALTER TABLE devedores
        ADD COLUMN cpf VARCHAR(14);

        RAISE NOTICE 'Coluna cpf adicionada com sucesso!';
    ELSE
        RAISE NOTICE 'Coluna cpf já existe.';
    END IF;
END $$;

-- Adicionar coluna plano_id na tabela devedores se não existir
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'devedores'
        AND column_name = 'plano_id'
    ) THEN
        ALTER TABLE devedores
        ADD COLUMN plano_id UUID REFERENCES planos(id) ON DELETE SET NULL;

        RAISE NOTICE 'Coluna plano_id adicionada com sucesso!';
    ELSE
        RAISE NOTICE 'Coluna plano_id já existe.';
    END IF;
END $$;

-- Adicionar coluna assinatura_ativa na tabela devedores se não existir
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'devedores'
        AND column_name = 'assinatura_ativa'
    ) THEN
        ALTER TABLE devedores
        ADD COLUMN assinatura_ativa BOOLEAN DEFAULT false;

        RAISE NOTICE 'Coluna assinatura_ativa adicionada com sucesso!';
    ELSE
        RAISE NOTICE 'Coluna assinatura_ativa já existe.';
    END IF;
END $$;

-- Adicionar coluna data_inicio_assinatura na tabela devedores se não existir
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'devedores'
        AND column_name = 'data_inicio_assinatura'
    ) THEN
        ALTER TABLE devedores
        ADD COLUMN data_inicio_assinatura DATE;

        RAISE NOTICE 'Coluna data_inicio_assinatura adicionada com sucesso!';
    ELSE
        RAISE NOTICE 'Coluna data_inicio_assinatura já existe.';
    END IF;
END $$;

-- Verificar estrutura
SELECT
  'devedores' as tabela,
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_name = 'devedores'
ORDER BY ordinal_position;

SELECT
  'planos' as tabela,
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_name = 'planos'
ORDER BY ordinal_position;
