-- ==========================================
-- CORRIGIR TABELA CONTROLE_PLANOS
-- ==========================================

-- Adicionar coluna usage_count se não existir
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'controle_planos'
        AND column_name = 'usage_count'
    ) THEN
        ALTER TABLE controle_planos
        ADD COLUMN usage_count INTEGER DEFAULT 0;

        RAISE NOTICE 'Coluna usage_count adicionada com sucesso!';
    ELSE
        RAISE NOTICE 'Coluna usage_count já existe.';
    END IF;
END $$;

-- Verificar estrutura final
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'controle_planos'
ORDER BY ordinal_position;

-- Resetar contador se necessário
UPDATE controle_planos
SET usage_count = 0
WHERE usage_count IS NULL;
