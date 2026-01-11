-- ==========================================
-- ADICIONAR COLUNA TIPO NA TABELA TEMPLATES
-- ==========================================

-- Adicionar coluna tipo na tabela templates se não existir
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'templates'
        AND column_name = 'tipo'
    ) THEN
        ALTER TABLE templates
        ADD COLUMN tipo VARCHAR(20) DEFAULT 'overdue'
        CHECK (tipo IN ('overdue', 'pre_due_3days', 'pre_due_5days'));

        RAISE NOTICE 'Coluna tipo adicionada com sucesso!';
    ELSE
        RAISE NOTICE 'Coluna tipo já existe.';
    END IF;
END $$;

-- Atualizar templates existentes para tipo 'overdue'
UPDATE templates SET tipo = 'overdue' WHERE tipo IS NULL;

-- Verificar estrutura da tabela templates
SELECT
  'templates' as tabela,
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_name = 'templates'
ORDER BY ordinal_position;
