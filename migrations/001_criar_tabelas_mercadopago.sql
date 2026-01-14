-- ========================================
-- Migration 001: Tabelas Mercado Pago
-- ========================================
-- Cria as 3 tabelas necessárias para integração com Mercado Pago

-- ========================================
-- TABELA: assinaturas_mercadopago
-- ========================================
-- Armazena dados de assinaturas recorrentes criadas no Mercado Pago

CREATE TABLE IF NOT EXISTS assinaturas_mercadopago (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- IDs do Mercado Pago
  subscription_id TEXT UNIQUE NOT NULL,
  preapproval_id TEXT,
  payer_id TEXT,
  payer_email TEXT,

  -- Dados da assinatura
  plano TEXT NOT NULL,                    -- 'premium' ou 'enterprise'
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'authorized', 'paused', 'cancelled'
  valor DECIMAL(10,2) NOT NULL,

  -- Datas
  data_inicio TIMESTAMPTZ,
  proxima_cobranca TIMESTAMPTZ,

  -- Metadados
  external_reference TEXT,
  metadata JSONB,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_assinaturas_user_id ON assinaturas_mercadopago(user_id);
CREATE INDEX IF NOT EXISTS idx_assinaturas_status ON assinaturas_mercadopago(status);
CREATE INDEX IF NOT EXISTS idx_assinaturas_subscription_id ON assinaturas_mercadopago(subscription_id);

-- ========================================
-- TABELA: pagamentos_mercadopago
-- ========================================
-- Armazena histórico de pagamentos individuais de cada assinatura

CREATE TABLE IF NOT EXISTS pagamentos_mercadopago (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  assinatura_id UUID REFERENCES assinaturas_mercadopago(id) ON DELETE SET NULL,

  -- IDs do Mercado Pago
  payment_id TEXT UNIQUE NOT NULL,
  subscription_id TEXT,

  -- Dados do pagamento
  valor DECIMAL(10,2) NOT NULL,
  status TEXT NOT NULL,                    -- 'approved', 'pending', 'rejected', 'refunded', 'cancelled'
  status_detail TEXT,

  -- Método de pagamento
  payment_type_id TEXT,                    -- 'credit_card', 'debit_card', etc.
  payment_method_id TEXT,                  -- 'visa', 'master', etc.

  -- Datas
  data_pagamento TIMESTAMPTZ,
  data_aprovacao TIMESTAMPTZ,

  -- Metadados
  external_reference TEXT,
  metadata JSONB,
  raw_webhook JSONB,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_pagamentos_user_id ON pagamentos_mercadopago(user_id);
CREATE INDEX IF NOT EXISTS idx_pagamentos_assinatura_id ON pagamentos_mercadopago(assinatura_id);
CREATE INDEX IF NOT EXISTS idx_pagamentos_payment_id ON pagamentos_mercadopago(payment_id);
CREATE INDEX IF NOT EXISTS idx_pagamentos_status ON pagamentos_mercadopago(status);

-- ========================================
-- TABELA: webhook_logs
-- ========================================
-- Log de auditoria de todos os webhooks recebidos do Mercado Pago

CREATE TABLE IF NOT EXISTS webhook_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Dados do webhook
  event_type TEXT NOT NULL,               -- 'subscription', 'payment', etc.
  resource_id TEXT,                        -- ID do recurso (subscription_id ou payment_id)
  payload JSONB NOT NULL,                  -- Payload completo do webhook

  -- Processamento
  processado BOOLEAN DEFAULT false,
  sucesso BOOLEAN,
  erro TEXT,

  -- Segurança
  signature_valida BOOLEAN,

  -- Metadados
  headers JSONB,
  ip_origem TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  processado_at TIMESTAMPTZ
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_webhook_logs_event_type ON webhook_logs(event_type);
CREATE INDEX IF NOT EXISTS idx_webhook_logs_resource_id ON webhook_logs(resource_id);
CREATE INDEX IF NOT EXISTS idx_webhook_logs_processado ON webhook_logs(processado);
CREATE INDEX IF NOT EXISTS idx_webhook_logs_created_at ON webhook_logs(created_at DESC);

-- ========================================
-- ROW LEVEL SECURITY (RLS)
-- ========================================

-- Habilitar RLS em todas as tabelas
ALTER TABLE assinaturas_mercadopago ENABLE ROW LEVEL SECURITY;
ALTER TABLE pagamentos_mercadopago ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhook_logs ENABLE ROW LEVEL SECURITY;

-- Policies: Usuários veem apenas suas próprias assinaturas
CREATE POLICY "Usuários veem próprias assinaturas"
  ON assinaturas_mercadopago
  FOR SELECT
  USING (auth.uid() = user_id);

-- Policies: Usuários veem apenas seus próprios pagamentos
CREATE POLICY "Usuários veem próprios pagamentos"
  ON pagamentos_mercadopago
  FOR SELECT
  USING (auth.uid() = user_id);

-- Policies: Service role pode fazer tudo (para Edge Functions)
-- Assinaturas
CREATE POLICY "Service role gerencia assinaturas"
  ON assinaturas_mercadopago
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Pagamentos
CREATE POLICY "Service role gerencia pagamentos"
  ON pagamentos_mercadopago
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Webhook Logs (apenas service role acessa)
CREATE POLICY "Service role gerencia webhook logs"
  ON webhook_logs
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- ========================================
-- COMENTÁRIOS PARA DOCUMENTAÇÃO
-- ========================================

COMMENT ON TABLE assinaturas_mercadopago IS 'Armazena assinaturas recorrentes criadas no Mercado Pago';
COMMENT ON TABLE pagamentos_mercadopago IS 'Histórico de pagamentos individuais de cada assinatura';
COMMENT ON TABLE webhook_logs IS 'Log de auditoria de webhooks recebidos do Mercado Pago';

COMMENT ON COLUMN assinaturas_mercadopago.subscription_id IS 'ID da assinatura no Mercado Pago (preapproval)';
COMMENT ON COLUMN assinaturas_mercadopago.external_reference IS 'Referência externa (user_id) para identificação';
COMMENT ON COLUMN pagamentos_mercadopago.payment_id IS 'ID único do pagamento no Mercado Pago';
COMMENT ON COLUMN webhook_logs.signature_valida IS 'Indica se a assinatura do webhook foi validada';

-- ========================================
-- FIM DA MIGRATION 001
-- ========================================

-- Verificar se tudo foi criado corretamente
DO $$
BEGIN
  RAISE NOTICE '✅ Migration 001 executada com sucesso!';
  RAISE NOTICE 'Tabelas criadas: assinaturas_mercadopago, pagamentos_mercadopago, webhook_logs';
  RAISE NOTICE 'Execute a query de verificação para confirmar.';
END $$;
