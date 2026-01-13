-- ===================================
-- CORRIGIR POLÍTICAS RLS DA TABELA PLANOS
-- ===================================

-- Habilitar RLS na tabela planos (se ainda não estiver habilitado)
ALTER TABLE planos ENABLE ROW LEVEL SECURITY;

-- Remover políticas antigas (se existirem)
DROP POLICY IF EXISTS "Usuários podem ver seus próprios planos" ON planos;
DROP POLICY IF EXISTS "Usuários podem criar seus próprios planos" ON planos;
DROP POLICY IF EXISTS "Usuários podem atualizar seus próprios planos" ON planos;
DROP POLICY IF EXISTS "Usuários podem deletar seus próprios planos" ON planos;

-- Política para SELECT (visualizar planos)
CREATE POLICY "Usuários podem ver seus próprios planos"
ON planos
FOR SELECT
USING (auth.uid() = user_id);

-- Política para INSERT (criar planos)
CREATE POLICY "Usuários podem criar seus próprios planos"
ON planos
FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Política para UPDATE (atualizar planos)
CREATE POLICY "Usuários podem atualizar seus próprios planos"
ON planos
FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Política para DELETE (deletar planos)
CREATE POLICY "Usuários podem deletar seus próprios planos"
ON planos
FOR DELETE
USING (auth.uid() = user_id);

-- ===================================
-- VERIFICAÇÃO
-- ===================================

-- Verificar se as políticas foram criadas
SELECT
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE tablename = 'planos'
ORDER BY policyname;

-- Verificar se o RLS está habilitado
SELECT
  tablename,
  rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename = 'planos';
