-- ==========================================
-- COLABORADORES (professores, coordenadores, recepcionistas)
-- + vínculo aula → professor (coluna professor_id em aulas)
-- Idempotente: pode rodar várias vezes.
-- ==========================================

-- 1. Tabela colaboradores
CREATE TABLE IF NOT EXISTS colaboradores (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  telefone TEXT,
  cargo TEXT NOT NULL,
  ativo BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_colaboradores_user ON colaboradores(user_id);
CREATE INDEX IF NOT EXISTS idx_colaboradores_user_ativo ON colaboradores(user_id, ativo);

ALTER TABLE colaboradores ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own colaboradores" ON colaboradores;
CREATE POLICY "Users can view own colaboradores"
  ON colaboradores FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own colaboradores" ON colaboradores;
CREATE POLICY "Users can insert own colaboradores"
  ON colaboradores FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own colaboradores" ON colaboradores;
CREATE POLICY "Users can update own colaboradores"
  ON colaboradores FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own colaboradores" ON colaboradores;
CREATE POLICY "Users can delete own colaboradores"
  ON colaboradores FOR DELETE USING (auth.uid() = user_id);

-- 2. Vincular aula a um colaborador (professor opcional, 1 por aula)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'aulas' AND column_name = 'professor_id'
  ) THEN
    ALTER TABLE aulas ADD COLUMN professor_id UUID REFERENCES colaboradores(id) ON DELETE SET NULL;
    RAISE NOTICE 'Coluna professor_id adicionada em aulas';
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_aulas_professor ON aulas(professor_id) WHERE professor_id IS NOT NULL;

-- ==========================================
-- VERIFICAÇÃO
-- ==========================================
SELECT 'colaboradores' AS tabela, column_name, data_type
FROM information_schema.columns WHERE table_name = 'colaboradores' ORDER BY ordinal_position;

SELECT 'aulas.professor_id' AS info, column_name, data_type
FROM information_schema.columns WHERE table_name = 'aulas' AND column_name = 'professor_id';
