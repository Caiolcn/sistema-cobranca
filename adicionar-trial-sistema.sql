-- ===================================
-- ADICIONAR SISTEMA DE TRIAL DE 3 DIAS
-- ===================================

-- 1. Adicionar colunas na tabela usuarios (SE NÃO EXISTIREM)
DO $$
BEGIN
    -- Coluna trial_ativo
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'usuarios' AND column_name = 'trial_ativo'
    ) THEN
        ALTER TABLE usuarios ADD COLUMN trial_ativo BOOLEAN DEFAULT true;
        RAISE NOTICE 'Coluna trial_ativo adicionada';
    ELSE
        RAISE NOTICE 'Coluna trial_ativo já existe';
    END IF;

    -- Coluna trial_fim
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'usuarios' AND column_name = 'trial_fim'
    ) THEN
        ALTER TABLE usuarios ADD COLUMN trial_fim TIMESTAMPTZ;
        RAISE NOTICE 'Coluna trial_fim adicionada';
    ELSE
        RAISE NOTICE 'Coluna trial_fim já existe';
    END IF;

    -- Coluna plano_pago (indica se tem assinatura ativa)
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'usuarios' AND column_name = 'plano_pago'
    ) THEN
        ALTER TABLE usuarios ADD COLUMN plano_pago BOOLEAN DEFAULT false;
        RAISE NOTICE 'Coluna plano_pago adicionada';
    ELSE
        RAISE NOTICE 'Coluna plano_pago já existe';
    END IF;
END $$;

-- 2. Atualizar usuários existentes com trial_fim = 3 dias após data_cadastro
UPDATE usuarios
SET
    trial_fim = data_cadastro + INTERVAL '3 days',
    trial_ativo = true,
    plano_pago = false
WHERE trial_fim IS NULL;

-- 3. Criar função para calcular se o trial expirou
CREATE OR REPLACE FUNCTION trial_expirado(user_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
    v_trial_fim TIMESTAMPTZ;
    v_plano_pago BOOLEAN;
BEGIN
    SELECT trial_fim, plano_pago
    INTO v_trial_fim, v_plano_pago
    FROM usuarios
    WHERE id = user_id;

    -- Se tem plano pago, nunca expira
    IF v_plano_pago = true THEN
        RETURN false;
    END IF;

    -- Se não tem trial_fim, considera expirado
    IF v_trial_fim IS NULL THEN
        RETURN true;
    END IF;

    -- Verifica se passou dos 3 dias
    RETURN NOW() > v_trial_fim;
END;
$$ LANGUAGE plpgsql;

-- 4. Criar função para calcular dias restantes do trial
CREATE OR REPLACE FUNCTION dias_restantes_trial(user_id UUID)
RETURNS INTEGER AS $$
DECLARE
    v_trial_fim TIMESTAMPTZ;
    v_plano_pago BOOLEAN;
    v_dias_restantes INTEGER;
BEGIN
    SELECT trial_fim, plano_pago
    INTO v_trial_fim, v_plano_pago
    FROM usuarios
    WHERE id = user_id;

    -- Se tem plano pago, retorna -1 (ilimitado)
    IF v_plano_pago = true THEN
        RETURN -1;
    END IF;

    -- Se não tem trial_fim, retorna 0 (expirado)
    IF v_trial_fim IS NULL THEN
        RETURN 0;
    END IF;

    -- Calcula dias restantes
    v_dias_restantes := CEIL(EXTRACT(EPOCH FROM (v_trial_fim - NOW())) / 86400)::INTEGER;

    -- Se negativo, retorna 0
    IF v_dias_restantes < 0 THEN
        RETURN 0;
    END IF;

    RETURN v_dias_restantes;
END;
$$ LANGUAGE plpgsql;

-- 5. Criar view para facilitar consultas
CREATE OR REPLACE VIEW v_status_trial AS
SELECT
    u.id as user_id,
    u.nome_completo,
    u.email,
    u.plano,
    u.plano_pago,
    u.trial_ativo,
    u.trial_fim,
    u.data_cadastro,
    dias_restantes_trial(u.id) as dias_restantes,
    trial_expirado(u.id) as trial_expirado,
    CASE
        WHEN u.plano_pago = true THEN 'Assinante'
        WHEN trial_expirado(u.id) = true THEN 'Trial Expirado'
        WHEN dias_restantes_trial(u.id) <= 1 THEN 'Trial Expirando Hoje'
        ELSE 'Trial Ativo'
    END as status_legivel
FROM usuarios u;

-- 6. Adicionar comentários
COMMENT ON COLUMN usuarios.trial_ativo IS 'Indica se o usuário está no período de trial gratuito';
COMMENT ON COLUMN usuarios.trial_fim IS 'Data/hora em que o trial de 3 dias expira';
COMMENT ON COLUMN usuarios.plano_pago IS 'Indica se o usuário tem uma assinatura paga ativa (ignora trial)';

-- ===================================
-- VERIFICAÇÃO
-- ===================================

-- Ver estrutura atualizada da tabela usuarios
SELECT
    column_name,
    data_type,
    column_default,
    is_nullable
FROM information_schema.columns
WHERE table_name = 'usuarios'
AND column_name IN ('trial_ativo', 'trial_fim', 'plano_pago', 'data_cadastro')
ORDER BY column_name;

-- Ver status do seu trial
SELECT * FROM v_status_trial WHERE user_id = auth.uid();

-- Ver todos os usuários e seus status de trial
SELECT
    nome_completo,
    email,
    plano,
    data_cadastro,
    trial_fim,
    plano_pago,
    dias_restantes_trial(id) as dias_restantes,
    trial_expirado(id) as expirado,
    CASE
        WHEN plano_pago = true THEN '✅ Assinante'
        WHEN trial_expirado(id) = true THEN '❌ Trial Expirado'
        WHEN dias_restantes_trial(id) <= 1 THEN '⚠️ Expirando Hoje'
        ELSE '✓ Trial Ativo'
    END as status
FROM usuarios
ORDER BY data_cadastro DESC;

/*
✅ RESULTADO ESPERADO:
- Coluna trial_ativo = true (para novos usuários)
- Coluna trial_fim = data_cadastro + 3 dias
- Coluna plano_pago = false (até fazer upgrade)
- Função trial_expirado() retorna true/false
- Função dias_restantes_trial() retorna número de dias
*/

-- ===================================
-- EXEMPLO: ATIVAR PLANO PAGO MANUALMENTE
-- ===================================
-- DESCOMENTE para ativar plano pago de um usuário:

-- UPDATE usuarios
-- SET
--     plano_pago = true,
--     plano = 'premium',  -- ou 'enterprise'
--     trial_ativo = false
-- WHERE email = 'usuario@exemplo.com';
