-- ===================================
-- ADICIONAR CONFIGURAÇÃO: Automação Em Atraso
-- ===================================
-- Esta automação vem ATIVA por padrão (true)
-- O cliente pode desativar se não quiser enviar cobranças automáticas para mensalidades em atraso

DO $$
DECLARE
    v_user_id UUID;
BEGIN
    -- Buscar o primeiro user_id da tabela auth.users
    SELECT id INTO v_user_id
    FROM auth.users
    LIMIT 1;

    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Nenhum usuário encontrado na tabela auth.users. Crie um usuário primeiro.';
    END IF;

    RAISE NOTICE 'Usando user_id: %', v_user_id;

    -- Inserir configuração de automação "Em Atraso" (ATIVA por padrão)
    INSERT INTO config (user_id, chave, valor, descricao)
    VALUES (
        v_user_id,
        'automacao_ematraso_ativa',
        'true',  -- ATIVA por padrão
        'Automação de mensagens para mensalidades em atraso'
    )
    ON CONFLICT (user_id, chave) DO UPDATE SET
        descricao = EXCLUDED.descricao,
        updated_at = NOW();

    RAISE NOTICE 'Configuração automacao_ematraso_ativa adicionada (ativa por padrão)';
END $$;

-- ===================================
-- VERIFICAÇÃO
-- ===================================

-- Listar todas as configurações de automação
SELECT
    chave,
    valor,
    descricao,
    created_at,
    updated_at
FROM config
WHERE chave IN ('automacao_3dias_ativa', 'automacao_5dias_ativa', 'automacao_ematraso_ativa')
ORDER BY chave;

/*
RESULTADO ESPERADO:
- automacao_3dias_ativa: false (desativada por padrão)
- automacao_5dias_ativa: false (desativada por padrão)
- automacao_ematraso_ativa: true (ATIVA por padrão)
*/
