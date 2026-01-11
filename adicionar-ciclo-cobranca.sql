-- ==========================================
-- ADICIONAR COLUNA CICLO_COBRANCA NA TABELA PLANOS
-- ==========================================

-- Adicionar coluna ciclo_cobranca na tabela planos se não existir
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

-- Verificar estrutura da tabela planos
SELECT
  'planos' as tabela,
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_name = 'planos'
ORDER BY ordinal_position;
