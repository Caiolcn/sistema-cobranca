-- ==========================================
-- ATUALIZAR TABELAS PARA UNIFICAÇÃO
-- presencas: adicionar aula_id + devedor_id
-- aulas_fixos: adicionar ativo
-- ==========================================

-- 1. PRESENCAS: adicionar aula_id e devedor_id
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'presencas' AND column_name = 'aula_id'
    ) THEN
        ALTER TABLE presencas ADD COLUMN aula_id UUID REFERENCES aulas(id) ON DELETE SET NULL;
        RAISE NOTICE 'Coluna aula_id adicionada em presencas';
    ELSE
        RAISE NOTICE 'Coluna aula_id ja existe em presencas';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'presencas' AND column_name = 'devedor_id'
    ) THEN
        ALTER TABLE presencas ADD COLUMN devedor_id UUID REFERENCES devedores(id) ON DELETE SET NULL;
        RAISE NOTICE 'Coluna devedor_id adicionada em presencas';
    ELSE
        RAISE NOTICE 'Coluna devedor_id ja existe em presencas';
    END IF;
END $$;

-- Index para lookup por aula + aluno + data
CREATE INDEX IF NOT EXISTS idx_presencas_aula_devedor ON presencas(aula_id, devedor_id, data);

-- 2. AULAS_FIXOS: adicionar ativo (pausar aluno sem remover)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'aulas_fixos' AND column_name = 'ativo'
    ) THEN
        ALTER TABLE aulas_fixos ADD COLUMN ativo BOOLEAN DEFAULT true;
        RAISE NOTICE 'Coluna ativo adicionada em aulas_fixos';
    ELSE
        RAISE NOTICE 'Coluna ativo ja existe em aulas_fixos';
    END IF;
END $$;

-- ==========================================
-- VERIFICAR
-- ==========================================
SELECT 'presencas - novas colunas' as info, column_name, data_type
FROM information_schema.columns
WHERE table_name = 'presencas'
AND column_name IN ('aula_id', 'devedor_id')
ORDER BY column_name;

SELECT 'aulas_fixos - nova coluna' as info, column_name, data_type
FROM information_schema.columns
WHERE table_name = 'aulas_fixos'
AND column_name = 'ativo';
