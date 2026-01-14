-- ========================================
-- Script de Verificação: Setup Completo
-- ========================================
-- Execute este script no SQL Editor do Supabase
-- para verificar se tudo está configurado

-- ========================================
-- 1. VERIFICAR TABELAS CRIADAS
-- ========================================

SELECT '=== TABELAS ===' AS verificacao;

SELECT
  table_name,
  CASE
    WHEN table_name = 'assinaturas_mercadopago' THEN '✅'
    WHEN table_name = 'pagamentos_mercadopago' THEN '✅'
    WHEN table_name = 'webhook_logs' THEN '✅'
    ELSE '❌'
  END AS status
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('assinaturas_mercadopago', 'pagamentos_mercadopago', 'webhook_logs')
ORDER BY table_name;

-- Esperado: 3 linhas com status ✅

-- ========================================
-- 2. VERIFICAR FUNÇÕES SQL CRIADAS
-- ========================================

SELECT '=== FUNÇÕES SQL ===' AS verificacao;

SELECT
  routine_name,
  CASE
    WHEN routine_name IN (
      'ativar_assinatura_usuario',
      'desativar_assinatura_usuario',
      'definir_grace_period',
      'limpar_grace_period'
    ) THEN '✅'
    ELSE '❌'
  END AS status
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name LIKE '%assinatura%' OR routine_name LIKE '%grace%'
ORDER BY routine_name;

-- Esperado: 4 linhas com status ✅

-- ========================================
-- 3. VERIFICAR COLUNAS DA TABELA USUARIOS
-- ========================================

SELECT '=== COLUNAS TABELA USUARIOS ===' AS verificacao;

SELECT
  column_name,
  data_type,
  CASE
    WHEN column_name IN ('plano_pago', 'trial_ativo', 'trial_fim', 'plano', 'limite_mensal', 'status_conta', 'grace_period_until') THEN '✅'
    ELSE '⚠️'
  END AS status
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'usuarios'
  AND column_name IN ('plano_pago', 'trial_ativo', 'trial_fim', 'plano', 'limite_mensal', 'status_conta', 'grace_period_until')
ORDER BY column_name;

-- Esperado: Pelo menos 6 colunas com status ✅ ou ⚠️

-- ========================================
-- 4. VERIFICAR ÍNDICES
-- ========================================

SELECT '=== ÍNDICES ===' AS verificacao;

SELECT
  indexname,
  tablename,
  CASE
    WHEN indexname LIKE '%assinaturas%' OR indexname LIKE '%pagamentos%' OR indexname LIKE '%webhook%' THEN '✅'
    ELSE '⚠️'
  END AS status
FROM pg_indexes
WHERE schemaname = 'public'
  AND (
    tablename = 'assinaturas_mercadopago'
    OR tablename = 'pagamentos_mercadopago'
    OR tablename = 'webhook_logs'
  )
ORDER BY tablename, indexname;

-- Esperado: Alguns índices criados

-- ========================================
-- 5. VERIFICAR RLS (Row Level Security)
-- ========================================

SELECT '=== RLS POLICIES ===' AS verificacao;

SELECT
  tablename,
  CASE
    WHEN rowsecurity THEN '✅ RLS Ativo'
    ELSE '❌ RLS Inativo'
  END AS status
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('assinaturas_mercadopago', 'pagamentos_mercadopago', 'webhook_logs')
ORDER BY tablename;

-- Esperado: 3 tabelas com RLS Ativo

-- ========================================
-- 6. VERIFICAR POLICIES CRIADAS
-- ========================================

SELECT '=== POLICIES ===' AS verificacao;

SELECT
  tablename,
  policyname,
  '✅' AS status
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('assinaturas_mercadopago', 'pagamentos_mercadopago', 'webhook_logs')
ORDER BY tablename, policyname;

-- Esperado: Pelo menos 6 policies

-- ========================================
-- 7. TESTAR FUNÇÃO: ativar_assinatura_usuario
-- ========================================

SELECT '=== TESTE DE FUNÇÃO ===' AS verificacao;

-- Criar usuário fake para teste (se não existir)
DO $$
DECLARE
  v_test_user_id UUID;
BEGIN
  -- Pegar qualquer usuário existente
  SELECT id INTO v_test_user_id FROM usuarios LIMIT 1;

  IF v_test_user_id IS NULL THEN
    RAISE NOTICE '❌ Nenhum usuário encontrado. Crie um usuário primeiro!';
  ELSE
    RAISE NOTICE '✅ Usuário de teste encontrado: %', v_test_user_id;

    -- Testar função de ativação (mas reverter depois)
    BEGIN
      -- Salvar estado anterior
      DECLARE
        v_plano_anterior TEXT;
        v_plano_pago_anterior BOOLEAN;
      BEGIN
        SELECT plano, plano_pago INTO v_plano_anterior, v_plano_pago_anterior
        FROM usuarios WHERE id = v_test_user_id;

        -- Testar ativação
        PERFORM ativar_assinatura_usuario(v_test_user_id, 'premium');

        -- Verificar se funcionou
        DECLARE
          v_plano_novo TEXT;
          v_plano_pago_novo BOOLEAN;
        BEGIN
          SELECT plano, plano_pago INTO v_plano_novo, v_plano_pago_novo
          FROM usuarios WHERE id = v_test_user_id;

          IF v_plano_novo = 'premium' AND v_plano_pago_novo = true THEN
            RAISE NOTICE '✅ Função ativar_assinatura_usuario funcionando!';
          ELSE
            RAISE NOTICE '❌ Função ativar_assinatura_usuario com problema!';
          END IF;

          -- Reverter para estado anterior
          UPDATE usuarios
          SET
            plano = v_plano_anterior,
            plano_pago = v_plano_pago_anterior
          WHERE id = v_test_user_id;

          RAISE NOTICE '✅ Estado do usuário revertido';
        END;
      END;
    END;
  END IF;
END $$;

-- ========================================
-- 8. RESUMO FINAL
-- ========================================

SELECT '=== RESUMO FINAL ===' AS verificacao;

SELECT
  'Tabelas' AS componente,
  (SELECT COUNT(*) FROM information_schema.tables
   WHERE table_schema = 'public'
     AND table_name IN ('assinaturas_mercadopago', 'pagamentos_mercadopago', 'webhook_logs')) AS criados,
  3 AS esperados,
  CASE
    WHEN (SELECT COUNT(*) FROM information_schema.tables
          WHERE table_schema = 'public'
            AND table_name IN ('assinaturas_mercadopago', 'pagamentos_mercadopago', 'webhook_logs')) = 3
    THEN '✅ OK'
    ELSE '❌ FALTANDO'
  END AS status

UNION ALL

SELECT
  'Funções SQL',
  (SELECT COUNT(*) FROM information_schema.routines
   WHERE routine_schema = 'public'
     AND routine_name IN ('ativar_assinatura_usuario', 'desativar_assinatura_usuario', 'definir_grace_period', 'limpar_grace_period')),
  4,
  CASE
    WHEN (SELECT COUNT(*) FROM information_schema.routines
          WHERE routine_schema = 'public'
            AND routine_name IN ('ativar_assinatura_usuario', 'desativar_assinatura_usuario', 'definir_grace_period', 'limpar_grace_period')) = 4
    THEN '✅ OK'
    ELSE '❌ FALTANDO'
  END

UNION ALL

SELECT
  'RLS Policies',
  (SELECT COUNT(*) FROM pg_policies
   WHERE schemaname = 'public'
     AND tablename IN ('assinaturas_mercadopago', 'pagamentos_mercadopago', 'webhook_logs')),
  6,
  CASE
    WHEN (SELECT COUNT(*) FROM pg_policies
          WHERE schemaname = 'public'
            AND tablename IN ('assinaturas_mercadopago', 'pagamentos_mercadopago', 'webhook_logs')) >= 6
    THEN '✅ OK'
    ELSE '❌ FALTANDO'
  END;

-- ========================================
-- FIM DO SCRIPT
-- ========================================

SELECT '
========================================
✅ VERIFICAÇÃO COMPLETA!
========================================

Se todos os itens acima estão com status ✅ OK,
você está pronto para testar o fluxo de pagamento!

Próximo passo:
1. Configurar Edge Functions no Supabase Dashboard
2. Configurar Secrets (MERCADOPAGO_ACCESS_TOKEN, etc.)
3. Configurar Webhook no Mercado Pago
4. Seguir o GUIA-TESTE-COMPLETO.md

Bom teste! 🚀
' AS resultado;
