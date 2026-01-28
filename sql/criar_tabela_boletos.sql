-- =============================================
-- MIGRAÇÃO: Criar estrutura para boletos Asaas
-- =============================================

-- Tabela de boletos
CREATE TABLE IF NOT EXISTS boletos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  mensalidade_id UUID REFERENCES mensalidades(id) ON DELETE SET NULL,
  devedor_id UUID REFERENCES devedores(id) ON DELETE SET NULL,

  -- IDs do Asaas
  asaas_id TEXT UNIQUE,              -- ID da cobrança no Asaas
  asaas_customer_id TEXT,            -- ID do cliente no Asaas

  -- Dados do boleto
  valor DECIMAL(10,2) NOT NULL,
  data_vencimento DATE NOT NULL,
  status TEXT DEFAULT 'PENDING',     -- PENDING, RECEIVED, CONFIRMED, OVERDUE, REFUNDED, CANCELED

  -- Links e códigos
  boleto_url TEXT,                   -- URL para visualizar/baixar boleto PDF
  invoice_url TEXT,                  -- URL da fatura online
  linha_digitavel TEXT,              -- Código de barras em texto (linha digitável)
  nosso_numero TEXT,                 -- Nosso número do boleto

  -- PIX integrado (BolePix)
  pix_qrcode_url TEXT,               -- URL da imagem do QR Code PIX
  pix_copia_cola TEXT,               -- Código PIX copia e cola
  pix_expiration_date TIMESTAMPTZ,   -- Data de expiração do PIX

  -- Pagamento
  data_pagamento TIMESTAMPTZ,
  valor_pago DECIMAL(10,2),
  forma_pagamento TEXT,              -- BOLETO, PIX

  -- Juros e multa
  juros_valor DECIMAL(10,2),
  multa_valor DECIMAL(10,2),

  -- Metadata
  descricao TEXT,
  observacoes TEXT,

  -- Controle
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_boletos_user_id ON boletos(user_id);
CREATE INDEX IF NOT EXISTS idx_boletos_mensalidade_id ON boletos(mensalidade_id);
CREATE INDEX IF NOT EXISTS idx_boletos_devedor_id ON boletos(devedor_id);
CREATE INDEX IF NOT EXISTS idx_boletos_status ON boletos(status);
CREATE INDEX IF NOT EXISTS idx_boletos_data_vencimento ON boletos(data_vencimento);
CREATE INDEX IF NOT EXISTS idx_boletos_asaas_id ON boletos(asaas_id);

-- Adicionar campo de configuração Asaas na tabela usuarios
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS asaas_api_key TEXT;
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS asaas_ambiente TEXT DEFAULT 'sandbox'; -- 'sandbox' ou 'production'

-- Tabela para armazenar clientes cadastrados no Asaas (cache)
CREATE TABLE IF NOT EXISTS asaas_clientes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  devedor_id UUID NOT NULL REFERENCES devedores(id) ON DELETE CASCADE,
  asaas_customer_id TEXT NOT NULL,   -- ID do cliente no Asaas

  -- Dados sincronizados
  nome TEXT,
  cpf_cnpj TEXT,
  email TEXT,
  telefone TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(user_id, devedor_id)
);

CREATE INDEX IF NOT EXISTS idx_asaas_clientes_user_id ON asaas_clientes(user_id);
CREATE INDEX IF NOT EXISTS idx_asaas_clientes_devedor_id ON asaas_clientes(devedor_id);
CREATE INDEX IF NOT EXISTS idx_asaas_clientes_asaas_id ON asaas_clientes(asaas_customer_id);

-- Tabela de logs de webhooks do Asaas
CREATE TABLE IF NOT EXISTS asaas_webhook_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type TEXT NOT NULL,          -- PAYMENT_RECEIVED, PAYMENT_CONFIRMED, etc
  asaas_id TEXT,                     -- ID do pagamento no Asaas
  payload JSONB,                     -- Payload completo do webhook
  processado BOOLEAN DEFAULT FALSE,
  sucesso BOOLEAN,
  erro TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  processado_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_asaas_webhook_logs_event_type ON asaas_webhook_logs(event_type);
CREATE INDEX IF NOT EXISTS idx_asaas_webhook_logs_asaas_id ON asaas_webhook_logs(asaas_id);

-- RLS (Row Level Security)
ALTER TABLE boletos ENABLE ROW LEVEL SECURITY;
ALTER TABLE asaas_clientes ENABLE ROW LEVEL SECURITY;
ALTER TABLE asaas_webhook_logs ENABLE ROW LEVEL SECURITY;

-- Políticas de segurança para boletos
CREATE POLICY "Usuários podem ver seus próprios boletos" ON boletos
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Usuários podem criar seus próprios boletos" ON boletos
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Usuários podem atualizar seus próprios boletos" ON boletos
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Usuários podem deletar seus próprios boletos" ON boletos
  FOR DELETE USING (auth.uid() = user_id);

-- Políticas para asaas_clientes
CREATE POLICY "Usuários podem ver seus próprios clientes Asaas" ON asaas_clientes
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Usuários podem criar seus próprios clientes Asaas" ON asaas_clientes
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Usuários podem atualizar seus próprios clientes Asaas" ON asaas_clientes
  FOR UPDATE USING (auth.uid() = user_id);

-- Políticas para webhook logs (apenas insert via service role)
CREATE POLICY "Service pode inserir logs" ON asaas_webhook_logs
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Usuários podem ver logs relacionados" ON asaas_webhook_logs
  FOR SELECT USING (true);

-- Função para atualizar updated_at automaticamente
CREATE OR REPLACE FUNCTION update_boletos_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_boletos_updated_at
  BEFORE UPDATE ON boletos
  FOR EACH ROW
  EXECUTE FUNCTION update_boletos_updated_at();

CREATE TRIGGER trigger_asaas_clientes_updated_at
  BEFORE UPDATE ON asaas_clientes
  FOR EACH ROW
  EXECUTE FUNCTION update_boletos_updated_at();

-- Comentários nas tabelas
COMMENT ON TABLE boletos IS 'Boletos gerados via Asaas para cobrança de mensalidades';
COMMENT ON TABLE asaas_clientes IS 'Cache de clientes cadastrados no Asaas para cada devedor';
COMMENT ON TABLE asaas_webhook_logs IS 'Logs de webhooks recebidos do Asaas';
COMMENT ON COLUMN usuarios.asaas_api_key IS 'API Key do Asaas do usuário (sandbox ou produção)';
COMMENT ON COLUMN usuarios.asaas_ambiente IS 'Ambiente do Asaas: sandbox ou production';
