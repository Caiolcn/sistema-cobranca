-- ============================================================
-- GERADOR DE POSTS IA — Histórico + controle de uso
-- ============================================================
-- Salva posts gerados pra histórico e controla limite mensal
-- Pro: 6/mês, Premium: 25/mês
-- ============================================================

CREATE TABLE IF NOT EXISTS posts_gerados (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL,           -- motivacional, dica, promocao, aula, depoimento
  tom TEXT DEFAULT 'informal',  -- informal, profissional, divertido
  prompt TEXT,                  -- o que o dono digitou
  titulo TEXT,                  -- título gerado pela IA (overlay da imagem)
  legenda TEXT,                 -- legenda completa gerada
  hashtags TEXT,                -- hashtags geradas
  template TEXT DEFAULT 'classico', -- classico, moderno, clean, bold
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_posts_user ON posts_gerados(user_id, created_at DESC);

-- RLS
ALTER TABLE posts_gerados ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users veem seus posts" ON posts_gerados;
CREATE POLICY "Users veem seus posts"
  ON posts_gerados FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users criam seus posts" ON posts_gerados;
CREATE POLICY "Users criam seus posts"
  ON posts_gerados FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Service role full access posts" ON posts_gerados;
CREATE POLICY "Service role full access posts"
  ON posts_gerados FOR ALL
  USING (true);

-- ==========================================
-- FUNÇÃO: contar posts do mês atual
-- ==========================================
CREATE OR REPLACE FUNCTION contar_posts_mes(p_user_id UUID)
RETURNS INT AS $$
  SELECT COUNT(*)::INT
  FROM posts_gerados
  WHERE user_id = p_user_id
    AND created_at >= DATE_TRUNC('month', CURRENT_DATE)
$$ LANGUAGE sql STABLE;

-- Verificação
SELECT 'posts_gerados criada' AS status;
