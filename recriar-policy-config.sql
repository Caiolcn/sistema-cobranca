-- ===================================
-- RECRIAR POLICY DA TABELA CONFIG (CORRIGIDO)
-- ===================================

-- 1. Remover policy INSERT antiga se existir
DROP POLICY IF EXISTS "Permitir insert config" ON config;
DROP POLICY IF EXISTS "Usuarios podem inserir próprias configs" ON config;
DROP POLICY IF EXISTS "Users can insert own config" ON config;

-- 2. Criar policy INSERT correta (usando WITH CHECK ao invés de USING)
CREATE POLICY "Permitir insert config"
ON config FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- 3. Verificar se a policy UPDATE existe, se não criar
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE tablename = 'config'
        AND cmd = 'UPDATE'
    ) THEN
        CREATE POLICY "Permitir update config"
        ON config FOR UPDATE
        USING (auth.uid() = user_id)
        WITH CHECK (auth.uid() = user_id);

        RAISE NOTICE 'Policy UPDATE criada';
    ELSE
        RAISE NOTICE 'Policy UPDATE já existe';
    END IF;
END $$;

-- 4. Verificar se a policy SELECT existe, se não criar
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE tablename = 'config'
        AND cmd = 'SELECT'
    ) THEN
        CREATE POLICY "Permitir select config"
        ON config FOR SELECT
        USING (auth.uid() = user_id);

        RAISE NOTICE 'Policy SELECT criada';
    ELSE
        RAISE NOTICE 'Policy SELECT já existe';
    END IF;
END $$;

-- 5. Verificar RLS está ativo
ALTER TABLE config ENABLE ROW LEVEL SECURITY;

-- ===================================
-- VERIFICAÇÃO
-- ===================================

-- Listar todas as policies
SELECT
    policyname,
    cmd,
    permissive,
    CASE
        WHEN qual IS NOT NULL THEN 'USING presente'
        ELSE 'Sem USING'
    END as tem_using,
    CASE
        WHEN with_check IS NOT NULL THEN 'WITH CHECK presente'
        ELSE 'Sem WITH CHECK'
    END as tem_with_check
FROM pg_policies
WHERE tablename = 'config'
ORDER BY cmd, policyname;

-- Verificar RLS
SELECT tablename, rowsecurity
FROM pg_tables
WHERE tablename = 'config';

/*
✅ RESULTADO ESPERADO:
INSERT: Apenas WITH CHECK (sem USING)
UPDATE: USING e WITH CHECK
SELECT: Apenas USING (sem WITH CHECK)
*/
