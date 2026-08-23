-- ============================================================
-- LINKS_PAGAMENTO - Links de pagamento PIX (gerados em Financeiro)
-- ============================================================
-- Fluxo:
--   1) Usuário autenticado gera o link em Financeiro.js (INSERT com user_id = auth.uid())
--   2) Aluno acessa /pagar/:token publicamente (sem auth) em PaginaPagamento.js
--      - SELECT pelo token
--      - UPDATE de visualizado_em
-- ============================================================

CREATE TABLE IF NOT EXISTS links_pagamento (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  mensalidade_id UUID,
  token TEXT NOT NULL UNIQUE,
  valor NUMERIC(10, 2) NOT NULL,
  cliente_nome TEXT,
  data_vencimento DATE,
  nome_empresa TEXT,
  chave_pix TEXT,
  visualizado_em TIMESTAMPTZ,
  pago_em TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_links_pagamento_token ON links_pagamento (token);
CREATE INDEX IF NOT EXISTS idx_links_pagamento_user ON links_pagamento (user_id);
CREATE INDEX IF NOT EXISTS idx_links_pagamento_mensalidade ON links_pagamento (mensalidade_id);

-- RLS
ALTER TABLE links_pagamento ENABLE ROW LEVEL SECURITY;

-- SELECT: dono vê os próprios + acesso público (anon) para a página de pagamento via token
DROP POLICY IF EXISTS "Usuarios veem seus links" ON links_pagamento;
CREATE POLICY "Usuarios veem seus links"
  ON links_pagamento FOR SELECT
  USING (auth.uid() = user_id OR is_admin());

DROP POLICY IF EXISTS "Publico le link por token" ON links_pagamento;
CREATE POLICY "Publico le link por token"
  ON links_pagamento FOR SELECT
  TO anon
  USING (true);

-- INSERT: usuário autenticado cria os próprios links
DROP POLICY IF EXISTS "Usuarios criam seus links" ON links_pagamento;
CREATE POLICY "Usuarios criam seus links"
  ON links_pagamento FOR INSERT
  WITH CHECK (auth.uid() = user_id OR is_admin());

-- UPDATE: dono atualiza + público pode atualizar visualizado_em/pago_em via token
DROP POLICY IF EXISTS "Usuarios atualizam seus links" ON links_pagamento;
CREATE POLICY "Usuarios atualizam seus links"
  ON links_pagamento FOR UPDATE
  USING (auth.uid() = user_id OR is_admin());

DROP POLICY IF EXISTS "Publico atualiza link por token" ON links_pagamento;
CREATE POLICY "Publico atualiza link por token"
  ON links_pagamento FOR UPDATE
  TO anon
  USING (true);

-- DELETE: somente dono
DROP POLICY IF EXISTS "Usuarios deletam seus links" ON links_pagamento;
CREATE POLICY "Usuarios deletam seus links"
  ON links_pagamento FOR DELETE
  USING (auth.uid() = user_id OR is_admin());
