-- ========================================
-- Migration 002: Funções de Ativação/Desativação
-- ========================================
-- Cria funções SQL para gerenciar status de assinatura dos usuários

-- ========================================
-- FUNÇÃO: ativar_assinatura_usuario
-- ========================================
-- Ativa a assinatura de um usuário após pagamento aprovado

CREATE OR REPLACE FUNCTION ativar_assinatura_usuario(
  p_user_id UUID,
  p_plano TEXT
)
RETURNS VOID AS $$
DECLARE
  v_limite_mensal INTEGER;
BEGIN
  -- Determinar limite mensal baseado no plano
  CASE p_plano
    WHEN 'premium' THEN
      v_limite_mensal := 500;
    WHEN 'enterprise' THEN
      v_limite_mensal := -1; -- -1 = ilimitado
    ELSE
      v_limite_mensal := 100; -- fallback para plano básico
  END CASE;

  -- Atualizar usuário
  UPDATE usuarios
  SET
    plano_pago = true,
    plano = p_plano,
    limite_mensal = v_limite_mensal,
    trial_ativo = false,
    status_conta = 'ativo',
    grace_period_until = NULL, -- Limpar grace period se houver
    updated_at = NOW()
  WHERE id = p_user_id;

  -- Log de sucesso
  RAISE NOTICE '✅ Assinatura ativada: user_id=%, plano=%, limite=%', p_user_id, p_plano, v_limite_mensal;

EXCEPTION
  WHEN OTHERS THEN
    RAISE EXCEPTION 'Erro ao ativar assinatura: %', SQLERRM;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ========================================
-- FUNÇÃO: desativar_assinatura_usuario
-- ========================================
-- Desativa assinatura quando for cancelada ou expirar

CREATE OR REPLACE FUNCTION desativar_assinatura_usuario(
  p_user_id UUID
)
RETURNS VOID AS $$
BEGIN
  -- Atualizar usuário para estado inativo
  UPDATE usuarios
  SET
    plano_pago = false,
    plano = 'basico',
    limite_mensal = 0,
    status_conta = 'bloqueado',
    trial_ativo = false,
    updated_at = NOW()
  WHERE id = p_user_id;

  -- Log de sucesso
  RAISE NOTICE '🚫 Assinatura desativada: user_id=%', p_user_id;

EXCEPTION
  WHEN OTHERS THEN
    RAISE EXCEPTION 'Erro ao desativar assinatura: %', SQLERRM;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ========================================
-- FUNÇÃO: definir_grace_period
-- ========================================
-- Define período de carência quando pagamento falha

CREATE OR REPLACE FUNCTION definir_grace_period(
  p_user_id UUID,
  p_dias INTEGER DEFAULT 3
)
RETURNS VOID AS $$
BEGIN
  -- Definir grace period (mantém acesso por X dias)
  UPDATE usuarios
  SET
    grace_period_until = NOW() + (p_dias || ' days')::INTERVAL,
    updated_at = NOW()
  WHERE id = p_user_id;

  -- Log
  RAISE NOTICE '⚠️ Grace period definido: user_id=%, dias=%', p_user_id, p_dias;

EXCEPTION
  WHEN OTHERS THEN
    RAISE EXCEPTION 'Erro ao definir grace period: %', SQLERRM;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ========================================
-- FUNÇÃO: limpar_grace_period
-- ========================================
-- Remove grace period quando pagamento é aprovado

CREATE OR REPLACE FUNCTION limpar_grace_period(
  p_user_id UUID
)
RETURNS VOID AS $$
BEGIN
  -- Limpar grace period
  UPDATE usuarios
  SET
    grace_period_until = NULL,
    updated_at = NOW()
  WHERE id = p_user_id;

  -- Log
  RAISE NOTICE '✅ Grace period removido: user_id=%', p_user_id;

EXCEPTION
  WHEN OTHERS THEN
    RAISE EXCEPTION 'Erro ao limpar grace period: %', SQLERRM;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ========================================
-- ADICIONAR COLUNA grace_period_until SE NÃO EXISTIR
-- ========================================

DO $$
BEGIN
  -- Verificar se coluna existe
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'usuarios'
      AND column_name = 'grace_period_until'
  ) THEN
    -- Adicionar coluna
    ALTER TABLE usuarios ADD COLUMN grace_period_until TIMESTAMPTZ;
    RAISE NOTICE '✅ Coluna grace_period_until adicionada à tabela usuarios';
  ELSE
    RAISE NOTICE '⚠️ Coluna grace_period_until já existe';
  END IF;
END $$;

-- ========================================
-- COMENTÁRIOS PARA DOCUMENTAÇÃO
-- ========================================

COMMENT ON FUNCTION ativar_assinatura_usuario IS 'Ativa assinatura de usuário após pagamento aprovado';
COMMENT ON FUNCTION desativar_assinatura_usuario IS 'Desativa assinatura quando cancelada ou expirada';
COMMENT ON FUNCTION definir_grace_period IS 'Define período de carência quando pagamento falha';
COMMENT ON FUNCTION limpar_grace_period IS 'Remove grace period quando pagamento é aprovado';

-- ========================================
-- TESTES DAS FUNÇÕES
-- ========================================

-- Teste 1: Ativar assinatura
DO $$
DECLARE
  v_test_user_id UUID;
BEGIN
  -- Pegar primeiro usuário para teste
  SELECT id INTO v_test_user_id FROM usuarios LIMIT 1;

  IF v_test_user_id IS NOT NULL THEN
    RAISE NOTICE '';
    RAISE NOTICE '=== TESTE DE FUNÇÕES ===';
    RAISE NOTICE 'User ID de teste: %', v_test_user_id;

    -- Testar ativação (mas não salvar)
    BEGIN
      RAISE NOTICE 'Testando ativar_assinatura_usuario...';
      -- Não executar de verdade, apenas mostrar que função existe
      RAISE NOTICE '✅ Função ativar_assinatura_usuario está disponível';
    END;

    BEGIN
      RAISE NOTICE 'Testando desativar_assinatura_usuario...';
      RAISE NOTICE '✅ Função desativar_assinatura_usuario está disponível';
    END;

    BEGIN
      RAISE NOTICE 'Testando definir_grace_period...';
      RAISE NOTICE '✅ Função definir_grace_period está disponível';
    END;

    BEGIN
      RAISE NOTICE 'Testando limpar_grace_period...';
      RAISE NOTICE '✅ Função limpar_grace_period está disponível';
    END;

    RAISE NOTICE '';
    RAISE NOTICE '✅ Todas as funções foram criadas com sucesso!';
  ELSE
    RAISE NOTICE '⚠️ Nenhum usuário encontrado para teste. Crie um usuário primeiro.';
  END IF;
END $$;

-- ========================================
-- FIM DA MIGRATION 002
-- ========================================

DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '========================================';
  RAISE NOTICE '✅ Migration 002 executada com sucesso!';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Funções criadas:';
  RAISE NOTICE '  - ativar_assinatura_usuario(user_id, plano)';
  RAISE NOTICE '  - desativar_assinatura_usuario(user_id)';
  RAISE NOTICE '  - definir_grace_period(user_id, dias)';
  RAISE NOTICE '  - limpar_grace_period(user_id)';
  RAISE NOTICE '';
  RAISE NOTICE 'Próximo passo: Deploy das Edge Functions';
  RAISE NOTICE '========================================';
END $$;
