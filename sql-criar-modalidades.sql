-- ==========================================
-- CRIAR MODALIDADES DE TURMA (Pilates, Yoga, Musculação...)
-- Mensalli — tag estruturada por turma, usada no relatório de frequência
-- ==========================================

-- ==========================================
-- 1. TABELA: MODALIDADES (categoria da turma, por conta)
-- ==========================================
CREATE TABLE IF NOT EXISTS modalidades (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    nome TEXT NOT NULL,
    cor TEXT DEFAULT '#8b5cf6',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Nome único por conta (case-insensitive) — evita "Pilates" vs "pilates"
CREATE UNIQUE INDEX IF NOT EXISTS idx_modalidades_user_nome
    ON modalidades(user_id, lower(nome));
CREATE INDEX IF NOT EXISTS idx_modalidades_user ON modalidades(user_id);

-- RLS
ALTER TABLE modalidades ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own modalidades" ON modalidades;
CREATE POLICY "Users can view own modalidades"
    ON modalidades FOR SELECT
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own modalidades" ON modalidades;
CREATE POLICY "Users can insert own modalidades"
    ON modalidades FOR INSERT
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own modalidades" ON modalidades;
CREATE POLICY "Users can update own modalidades"
    ON modalidades FOR UPDATE
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own modalidades" ON modalidades;
CREATE POLICY "Users can delete own modalidades"
    ON modalidades FOR DELETE
    USING (auth.uid() = user_id);

-- ==========================================
-- 2. NOVA COLUNA EM AULAS: modalidade_id (FK opcional)
-- ON DELETE SET NULL: apagar a modalidade não apaga a turma, só desvincula
-- ==========================================
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'aulas' AND column_name = 'modalidade_id'
    ) THEN
        ALTER TABLE aulas ADD COLUMN modalidade_id UUID
            REFERENCES modalidades(id) ON DELETE SET NULL;
        RAISE NOTICE 'Coluna modalidade_id adicionada em aulas';
    ELSE
        RAISE NOTICE 'Coluna modalidade_id ja existe em aulas';
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_aulas_modalidade ON aulas(modalidade_id);

COMMENT ON COLUMN aulas.modalidade_id IS 'Modalidade/categoria da turma (FK modalidades). NULL = sem modalidade.';

-- ==========================================
-- VERIFICAR RESULTADO
-- ==========================================
SELECT 'modalidades' as tabela, column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'modalidades'
ORDER BY ordinal_position;

SELECT 'aulas.modalidade_id' as info, column_name, data_type
FROM information_schema.columns
WHERE table_name = 'aulas' AND column_name = 'modalidade_id';
