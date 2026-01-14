-- ========================================
-- Script de Limpeza: Remove Tabelas Mercado Pago
-- ========================================
-- Use este script apenas se precisar recomeçar do zero

-- Remover policies (se existirem)
DROP POLICY IF EXISTS "Usuários veem próprias assinaturas" ON assinaturas_mercadopago;
DROP POLICY IF EXISTS "Usuários veem próprios pagamentos" ON pagamentos_mercadopago;
DROP POLICY IF EXISTS "Service role gerencia assinaturas" ON assinaturas_mercadopago;
DROP POLICY IF EXISTS "Service role gerencia pagamentos" ON pagamentos_mercadopago;
DROP POLICY IF EXISTS "Service role gerencia webhook logs" ON webhook_logs;

-- Remover tabelas (CASCADE remove constraints)
DROP TABLE IF EXISTS webhook_logs CASCADE;
DROP TABLE IF EXISTS pagamentos_mercadopago CASCADE;
DROP TABLE IF EXISTS assinaturas_mercadopago CASCADE;

-- Remover funções (se existirem da migration 002)
DROP FUNCTION IF EXISTS ativar_assinatura_usuario(UUID, TEXT);
DROP FUNCTION IF EXISTS desativar_assinatura_usuario(UUID);
DROP FUNCTION IF EXISTS definir_grace_period(UUID, INTEGER);
DROP FUNCTION IF EXISTS limpar_grace_period(UUID);

-- Remover coluna grace_period_until (se existir)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'usuarios'
      AND column_name = 'grace_period_until'
  ) THEN
    ALTER TABLE usuarios DROP COLUMN grace_period_until;
    RAISE NOTICE '✅ Coluna grace_period_until removida';
  END IF;
END $$;

-- Confirmação
DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '========================================';
  RAISE NOTICE '✅ Limpeza completa!';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Tabelas removidas: assinaturas_mercadopago, pagamentos_mercadopago, webhook_logs';
  RAISE NOTICE 'Funções removidas: ativar_assinatura_usuario, desativar_assinatura_usuario, etc.';
  RAISE NOTICE '';
  RAISE NOTICE 'Agora você pode executar as migrations 001 e 002 novamente.';
  RAISE NOTICE '========================================';
END $$;
