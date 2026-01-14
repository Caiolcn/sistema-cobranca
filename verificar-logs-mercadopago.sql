-- Verificar últimas tentativas de assinatura
SELECT
  id,
  user_id,
  subscription_id,
  plano,
  status,
  valor,
  external_reference,
  created_at,
  metadata
FROM assinaturas_mercadopago
ORDER BY created_at DESC
LIMIT 5;

-- Verificar logs de webhook (se houver)
SELECT
  id,
  event_type,
  resource_id,
  processado,
  sucesso,
  erro,
  signature_valida,
  created_at
FROM webhook_logs
ORDER BY created_at DESC
LIMIT 10;

-- Verificar status do usuário testuser999
SELECT
  id,
  email,
  nome_completo,
  plano,
  plano_pago,
  trial_ativo,
  trial_fim,
  status_conta,
  limite_mensal
FROM usuarios
WHERE email = 'testuser999@testuser.com';
