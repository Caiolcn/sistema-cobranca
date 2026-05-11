-- ==========================================
-- TAGS DE ALUNOS
-- Tags reutilizáveis para alunos (turmas, categorias)
-- devedores.tags = text[] de nomes; tabela tags guarda config (cor)
-- ==========================================

-- 1) Coluna tags em devedores
ALTER TABLE devedores
ADD COLUMN IF NOT EXISTS tags text[] DEFAULT '{}'::text[];

CREATE INDEX IF NOT EXISTS idx_devedores_tags
ON devedores USING GIN (tags);

-- 2) Tabela tags (config: nome + cor)
CREATE TABLE IF NOT EXISTS tags (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    nome TEXT NOT NULL,
    cor TEXT NOT NULL DEFAULT '#3B82F6',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, nome)
);

CREATE INDEX IF NOT EXISTS idx_tags_user ON tags(user_id);

-- RLS
ALTER TABLE tags ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own tags" ON tags;
CREATE POLICY "Users can view own tags"
    ON tags FOR SELECT
    USING (auth.uid() = user_id OR is_admin());

DROP POLICY IF EXISTS "Users can insert own tags" ON tags;
CREATE POLICY "Users can insert own tags"
    ON tags FOR INSERT
    WITH CHECK (auth.uid() = user_id OR is_admin());

DROP POLICY IF EXISTS "Users can update own tags" ON tags;
CREATE POLICY "Users can update own tags"
    ON tags FOR UPDATE
    USING (auth.uid() = user_id OR is_admin());

DROP POLICY IF EXISTS "Users can delete own tags" ON tags;
CREATE POLICY "Users can delete own tags"
    ON tags FOR DELETE
    USING (auth.uid() = user_id OR is_admin());

-- ==========================================
-- BACKFILL: criar tags na nova tabela a partir das tags já existentes em devedores
-- (caso o usuário já tenha cadastrado tags antes desta tabela existir)
-- ==========================================
INSERT INTO tags (user_id, nome, cor)
SELECT DISTINCT d.user_id, unnest(d.tags) AS nome, '#3B82F6' AS cor
FROM devedores d
WHERE d.tags IS NOT NULL AND array_length(d.tags, 1) > 0
ON CONFLICT (user_id, nome) DO NOTHING;

-- ==========================================
-- VERIFICAR
-- ==========================================
SELECT 'tags' as tabela, column_name, data_type
FROM information_schema.columns
WHERE table_name = 'tags'
ORDER BY ordinal_position;
