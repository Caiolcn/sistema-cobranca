-- ========================================
-- Verificar e Forçar Trial Expirado
-- ========================================

-- PASSO 1: Ver todos os usuários
SELECT
  id,
  email,
  trial_fim,
  trial_ativo,
  plano_pago,
  plano,
  status_conta,
  limite_mensal
FROM usuarios
ORDER BY created_at DESC;

-- ========================================
-- PASSO 2: Forçar trial expirado
-- ========================================
-- Substitua 'SEU_EMAIL_AQUI' pelo email do usuário

UPDATE usuarios
SET
  trial_fim = NOW() - INTERVAL '1 day',
  trial_ativo = false,
  plano_pago = false,
  plano = 'basico',
  status_conta = 'trial_expirado'
WHERE email = 'SEU_EMAIL_AQUI';

-- ========================================
-- PASSO 3: Verificar se funcionou
-- ========================================

SELECT
  email,
  trial_fim,
  trial_ativo,
  plano_pago,
  plano,
  status_conta,
  -- Verificar se trial realmente expirou
  CASE
    WHEN trial_fim < NOW() THEN '✅ Trial expirado'
    ELSE '❌ Trial ainda ativo'
  END as verificacao
FROM usuarios
WHERE email = 'SEU_EMAIL_AQUI';
