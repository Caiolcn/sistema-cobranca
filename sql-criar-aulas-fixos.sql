-- ==========================================
-- CRIAR TABELA AULAS_FIXOS
-- Alunos fixos vinculados a uma aula (ocupam vaga permanente)
-- ==========================================

CREATE TABLE IF NOT EXISTS aulas_fixos (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    aula_id UUID NOT NULL REFERENCES aulas(id) ON DELETE CASCADE,
    devedor_id UUID NOT NULL REFERENCES devedores(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(aula_id, devedor_id)
);

CREATE INDEX IF NOT EXISTS idx_aulas_fixos_aula ON aulas_fixos(aula_id);
CREATE INDEX IF NOT EXISTS idx_aulas_fixos_user ON aulas_fixos(user_id);

-- RLS
ALTER TABLE aulas_fixos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own aulas_fixos" ON aulas_fixos;
CREATE POLICY "Users can view own aulas_fixos"
    ON aulas_fixos FOR SELECT
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own aulas_fixos" ON aulas_fixos;
CREATE POLICY "Users can insert own aulas_fixos"
    ON aulas_fixos FOR INSERT
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own aulas_fixos" ON aulas_fixos;
CREATE POLICY "Users can delete own aulas_fixos"
    ON aulas_fixos FOR DELETE
    USING (auth.uid() = user_id);

-- ==========================================
-- VERIFICAR
-- ==========================================
SELECT 'aulas_fixos' as tabela, column_name, data_type
FROM information_schema.columns
WHERE table_name = 'aulas_fixos'
ORDER BY ordinal_position;
