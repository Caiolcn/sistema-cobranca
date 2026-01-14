-- ============================================
-- MIGRATION: Criar tabelas para integração Mercado Pago
-- Descrição: Tabelas para assinaturas, pagamentos e logs de webhooks
-- Data: 2026-01-14
-- ============================================

-- Tabela de Assinaturas do Mercado Pago
CREATE TABLE IF NOT EXISTS assinaturas_mercadopago (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- IDs do Mercado Pago
  subscription_id TEXT UNIQUE,
  preapproval_id TEXT,
  payer_id TEXT,
  payer_email TEXT,

  -- Dados da assinatura
  plano TEXT NOT NULL, -- 'premium' ou 'enterprise'
  status TEXT NOT NULL DEFAULT 'pending', -- pending, authorized, paused, cancelled
  valor DECIMAL(10,2) NOT NULL,

  -- Datas importantes
  data_inicio TIMESTAMPTZ,
  proxima_cobranca TIMESTAMPTZ,

  -- Metadados
  external_reference TEXT,
  metadata JSONB,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabela de Pagamentos do Mercado Pago
CREATE TABLE IF NOT EXISTS pagamentos_mercadopago (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  assinatura_id UUID REFERENCES assinaturas_mercadopago(id) ON DELETE SET NULL,

  -- IDs do Mercado Pago
  payment_id TEXT UNIQUE NOT NULL,
  subscription_id TEXT,

  -- Dados do pagamento
  valor DECIMAL(10,2) NOT NULL,
  status TEXT NOT NULL, -- approved, pending, rejected, refunded, cancelled
  status_detail TEXT,

  -- Método de pagamento
  payment_type_id TEXT, -- credit_card, debit_card, pix, etc
  payment_method_id TEXT, -- visa, mastercard, etc

  -- Datas
  data_pagamento TIMESTAMPTZ,
  data_aprovacao TIMESTAMPTZ,

  -- Metadados
  external_reference TEXT,
  metadata JSONB,
  raw_webhook JSONB, -- Payload completo do webhook para debug

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabela de Logs de Webhooks
CREATE TABLE IF NOT EXISTS webhook_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Identificação do webhook
  event_type TEXT NOT NULL, -- subscription, payment, etc
  resource_id TEXT, -- ID do recurso (subscription_id ou payment_id)
  payload JSONB NOT NULL, -- Payload completo recebido

  -- Status de processamento
  processado BOOLEAN DEFAULT false,
  sucesso BOOLEAN,
  erro TEXT,
  tentativas INTEGER DEFAULT 0,

  -- Validação
  signature_valida BOOLEAN,

  -- Metadados
  ip_origem TEXT,
  headers JSONB,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  processado_at TIMESTAMPTZ
);

-- ============================================
-- ÍNDICES para performance
-- ============================================

CREATE INDEX IF NOT EXISTS idx_assinaturas_user_id ON assinaturas_mercadopago(user_id);
CREATE INDEX IF NOT EXISTS idx_assinaturas_subscription_id ON assinaturas_mercadopago(subscription_id);
CREATE INDEX IF NOT EXISTS idx_assinaturas_status ON assinaturas_mercadopago(status);

CREATE INDEX IF NOT EXISTS idx_pagamentos_user_id ON pagamentos_mercadopago(user_id);
CREATE INDEX IF NOT EXISTS idx_pagamentos_payment_id ON pagamentos_mercadopago(payment_id);
CREATE INDEX IF NOT EXISTS idx_pagamentos_assinatura_id ON pagamentos_mercadopago(assinatura_id);
CREATE INDEX IF NOT EXISTS idx_pagamentos_status ON pagamentos_mercadopago(status);

CREATE INDEX IF NOT EXISTS idx_webhook_logs_event_type ON webhook_logs(event_type);
CREATE INDEX IF NOT EXISTS idx_webhook_logs_resource_id ON webhook_logs(resource_id);
CREATE INDEX IF NOT EXISTS idx_webhook_logs_processado ON webhook_logs(processado);
CREATE INDEX IF NOT EXISTS idx_webhook_logs_created_at ON webhook_logs(created_at DESC);

-- ============================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================

-- Habilitar RLS em todas as tabelas
ALTER TABLE assinaturas_mercadopago ENABLE ROW LEVEL SECURITY;
ALTER TABLE pagamentos_mercadopago ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhook_logs ENABLE ROW LEVEL SECURITY;

-- Policies para assinaturas_mercadopago
DROP POLICY IF EXISTS "Usuários veem próprias assinaturas" ON assinaturas_mercadopago;
CREATE POLICY "Usuários veem próprias assinaturas"
  ON assinaturas_mercadopago FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Usuários inserem próprias assinaturas" ON assinaturas_mercadopago;
CREATE POLICY "Usuários inserem próprias assinaturas"
  ON assinaturas_mercadopago FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Service role gerencia todas assinaturas" ON assinaturas_mercadopago;
CREATE POLICY "Service role gerencia todas assinaturas"
  ON assinaturas_mercadopago FOR ALL
  USING (true);

-- Policies para pagamentos_mercadopago
DROP POLICY IF EXISTS "Usuários veem próprios pagamentos" ON pagamentos_mercadopago;
CREATE POLICY "Usuários veem próprios pagamentos"
  ON pagamentos_mercadopago FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Service role gerencia todos pagamentos" ON pagamentos_mercadopago;
CREATE POLICY "Service role gerencia todos pagamentos"
  ON pagamentos_mercadopago FOR ALL
  USING (true);

-- Policies para webhook_logs
-- Apenas service_role pode acessar logs (segurança)
DROP POLICY IF EXISTS "Service role gerencia webhook logs" ON webhook_logs;
CREATE POLICY "Service role gerencia webhook logs"
  ON webhook_logs FOR ALL
  USING (true);

-- ============================================
-- COMENTÁRIOS nas tabelas
-- ============================================

COMMENT ON TABLE assinaturas_mercadopago IS 'Armazena todas as assinaturas recorrentes do Mercado Pago';
COMMENT ON TABLE pagamentos_mercadopago IS 'Histórico de pagamentos individuais das assinaturas';
COMMENT ON TABLE webhook_logs IS 'Log de todos os webhooks recebidos do Mercado Pago para auditoria';

COMMENT ON COLUMN assinaturas_mercadopago.subscription_id IS 'ID da assinatura no Mercado Pago (preapproval)';
COMMENT ON COLUMN assinaturas_mercadopago.status IS 'Status: pending, authorized, paused, cancelled';
COMMENT ON COLUMN pagamentos_mercadopago.payment_id IS 'ID único do pagamento no Mercado Pago';
COMMENT ON COLUMN webhook_logs.signature_valida IS 'Se a assinatura do webhook foi validada com sucesso';
