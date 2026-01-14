-- ============================================
-- MIGRATION: Funções SQL para ativação/desativação de assinaturas
-- Descrição: Funções que atualizam o status do usuário quando assinatura muda
-- Data: 2026-01-14
-- ============================================

-- ============================================
-- FUNÇÃO: Ativar Assinatura do Usuário
-- ============================================

CREATE OR REPLACE FUNCTION ativar_assinatura_usuario(
  p_user_id UUID,
  p_plano TEXT
)
RETURNS VOID AS $$
DECLARE
  v_limite_mensal INTEGER;
BEGIN
  -- Determinar limite baseado no plano
  CASE p_plano
    WHEN 'premium' THEN v_limite_mensal := 500;
    WHEN 'enterprise' THEN v_limite_mensal := -1; -- -1 = ilimitado
    ELSE v_limite_mensal := 100; -- basico (fallback)
  END CASE;

  -- Atualizar dados do usuário
  UPDATE usuarios
  SET
    plano_pago = true,
    plano = p_plano,
    limite_mensal = v_limite_mensal,
    trial_ativo = false,
    status_conta = 'ativo',
    updated_at = NOW()
  WHERE id = p_user_id;

  -- Atualizar controle_planos se existir
  UPDATE controle_planos
  SET
    plano = p_plano,
    limite_mensal = v_limite_mensal,
    status = 'ativo',
    updated_at = NOW()
  WHERE user_id::uuid = p_user_id
    AND mes_referencia = TO_CHAR(NOW(), 'YYYY-MM');

  -- Log de sucesso
  RAISE NOTICE 'Assinatura ativada: user_id=%, plano=%, limite=%', p_user_id, p_plano, v_limite_mensal;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- FUNÇÃO: Desativar Assinatura do Usuário
-- ============================================

CREATE OR REPLACE FUNCTION desativar_assinatura_usuario(
  p_user_id UUID
)
RETURNS VOID AS $$
BEGIN
  -- Bloquear acesso do usuário
  UPDATE usuarios
  SET
    plano_pago = false,
    plano = 'basico',
    limite_mensal = 0, -- Bloqueia envios
    status_conta = 'bloqueado',
    updated_at = NOW()
  WHERE id = p_user_id;

  -- Atualizar controle_planos
  UPDATE controle_planos
  SET
    status = 'bloqueado',
    limite_mensal = 0,
    updated_at = NOW()
  WHERE user_id::uuid = p_user_id
    AND mes_referencia = TO_CHAR(NOW(), 'YYYY-MM');

  -- Log de sucesso
  RAISE NOTICE 'Assinatura desativada: user_id=%', p_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- FUNÇÃO: Verificar Status da Assinatura
-- ============================================

CREATE OR REPLACE FUNCTION verificar_status_assinatura(
  p_user_id UUID
)
RETURNS TABLE(
  tem_assinatura BOOLEAN,
  plano_atual TEXT,
  status_assinatura TEXT,
  proxima_cobranca TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    (a.status = 'authorized') as tem_assinatura,
    a.plano as plano_atual,
    a.status as status_assinatura,
    a.proxima_cobranca
  FROM assinaturas_mercadopago a
  WHERE a.user_id = p_user_id
  ORDER BY a.created_at DESC
  LIMIT 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- FUNÇÃO: Adicionar Grace Period
-- ============================================

-- Adicionar coluna grace_period_until se não existir
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS grace_period_until TIMESTAMPTZ;

CREATE OR REPLACE FUNCTION definir_grace_period(
  p_user_id UUID,
  p_dias INTEGER DEFAULT 3
)
RETURNS VOID AS $$
BEGIN
  -- Define período de carência para pagamento falhado
  UPDATE usuarios
  SET
    grace_period_until = NOW() + (p_dias || ' days')::INTERVAL,
    updated_at = NOW()
  WHERE id = p_user_id;

  RAISE NOTICE 'Grace period definido: user_id=%, até=%', p_user_id, NOW() + (p_dias || ' days')::INTERVAL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION limpar_grace_period(
  p_user_id UUID
)
RETURNS VOID AS $$
BEGIN
  -- Remove período de carência quando pagamento é aprovado
  UPDATE usuarios
  SET
    grace_period_until = NULL,
    updated_at = NOW()
  WHERE id = p_user_id;

  RAISE NOTICE 'Grace period limpo: user_id=%', p_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- COMENTÁRIOS nas funções
-- ============================================

COMMENT ON FUNCTION ativar_assinatura_usuario IS 'Ativa assinatura do usuário após pagamento aprovado no Mercado Pago';
COMMENT ON FUNCTION desativar_assinatura_usuario IS 'Desativa assinatura e bloqueia acesso do usuário';
COMMENT ON FUNCTION verificar_status_assinatura IS 'Verifica status atual da assinatura de um usuário';
COMMENT ON FUNCTION definir_grace_period IS 'Define período de carência após pagamento falhado';
COMMENT ON FUNCTION limpar_grace_period IS 'Remove período de carência após pagamento aprovado';

-- ============================================
-- TESTES das funções (comentados - descomentar para testar)
-- ============================================

/*
-- Teste 1: Ativar assinatura premium
SELECT ativar_assinatura_usuario('SEU_USER_ID_AQUI'::uuid, 'premium');

-- Teste 2: Verificar status
SELECT * FROM verificar_status_assinatura('SEU_USER_ID_AQUI'::uuid);

-- Teste 3: Definir grace period
SELECT definir_grace_period('SEU_USER_ID_AQUI'::uuid, 3);

-- Teste 4: Desativar assinatura
SELECT desativar_assinatura_usuario('SEU_USER_ID_AQUI'::uuid);
*/
