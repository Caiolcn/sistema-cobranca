-- ===================================
-- CORRIGIR POLICY DA TABELA CONFIG
-- ===================================
-- O erro acontece porque a tabela 'config' não permite INSERT com a policy atual
-- Vamos adicionar a policy correta

-- 1. Ver policies atuais da tabela config
SELECT policyname, cmd, permissive
FROM pg_policies
WHERE tablename = 'config'
ORDER BY cmd, policyname;

-- 2. Adicionar policy INSERT se não existir
DO $$
BEGIN
    -- Verificar se a policy INSERT já existe
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE tablename = 'config'
        AND policyname = 'Permitir insert config'
        AND cmd = 'INSERT'
    ) THEN
        -- Criar policy para permitir INSERT
        CREATE POLICY "Permitir insert config"
        ON config FOR INSERT
        WITH CHECK (auth.uid() = user_id);

        RAISE NOTICE 'Policy INSERT criada na tabela config';
    ELSE
        RAISE NOTICE 'Policy INSERT já existe na tabela config';
    END IF;
END $$;

-- 3. Verificar se RLS está ativo
SELECT tablename, rowsecurity
FROM pg_tables
WHERE tablename = 'config';

-- 4. Listar todas as policies após criação
SELECT policyname, cmd, permissive, qual, with_check
FROM pg_policies
WHERE tablename = 'config'
ORDER BY cmd, policyname;

/*
RESULTADO ESPERADO:
- Policy "Permitir insert config" deve existir para INSERT
- Deve ter também policies para SELECT e UPDATE
- RLS deve estar ativo (rowsecurity = true)
*/

-- 5. Teste rápido - Ver suas configurações
SELECT chave, valor, descricao
FROM config
WHERE user_id = auth.uid()
ORDER BY chave;
