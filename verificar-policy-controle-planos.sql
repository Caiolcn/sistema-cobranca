-- ===================================
-- VERIFICAR E ADICIONAR POLICY INSERT EM CONTROLE_PLANOS
-- ===================================
-- Esta policy é necessária para permitir que novos usuários
-- sejam criados durante o signup

-- 1. Verificar policies existentes
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies
WHERE tablename = 'controle_planos'
ORDER BY policyname;

-- 2. Adicionar policy INSERT se não existir
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE tablename = 'controle_planos'
        AND policyname = 'Permitir insert ao criar conta'
    ) THEN
        -- Criar policy para permitir INSERT
        EXECUTE 'CREATE POLICY "Permitir insert ao criar conta"
        ON controle_planos FOR INSERT
        WITH CHECK (true)';

        RAISE NOTICE 'Policy INSERT criada com sucesso em controle_planos';
    ELSE
        RAISE NOTICE 'Policy INSERT já existe em controle_planos';
    END IF;
END $$;

-- 3. Verificar RLS está ativo
SELECT tablename, rowsecurity
FROM pg_tables
WHERE tablename = 'controle_planos';

-- 4. Listar todas as policies após criação
SELECT policyname, cmd, permissive
FROM pg_policies
WHERE tablename = 'controle_planos'
ORDER BY cmd, policyname;

/*
RESULTADO ESPERADO:
- Policy "Permitir insert ao criar conta" deve existir
- RLS deve estar ativo (rowsecurity = true)
- Devem existir policies para SELECT, INSERT, UPDATE
*/
