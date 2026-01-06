-- ==========================================
-- SETUP COMPLETO DO SUPABASE
-- Sistema de Cobrança com Parcelas
-- ==========================================

-- ==========================================
-- 1. ADICIONAR COLUNAS FALTANTES EM PARCELAS
-- ==========================================
ALTER TABLE parcelas
ADD COLUMN IF NOT EXISTS enviado_hoje BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS data_ultimo_envio DATE,
ADD COLUMN IF NOT EXISTS total_envios INTEGER DEFAULT 0;

-- ==========================================
-- 2. CRIAR TABELA DE CONTROLE DE PLANOS
-- ==========================================
CREATE TABLE IF NOT EXISTS controle_planos (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id TEXT UNIQUE NOT NULL,
  plano TEXT DEFAULT 'basico',
  limite_mensal INTEGER DEFAULT 100,
  usage_count INTEGER DEFAULT 0,
  mes_referencia TEXT,
  status TEXT DEFAULT 'ativo',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ==========================================
-- 3. INSERIR REGISTRO PADRÃO
-- ==========================================
-- IMPORTANTE: Substitua 'BW5T2hYLtVwv4IBU' pelo ID do seu workflow do n8n
INSERT INTO controle_planos (user_id, plano, limite_mensal, usage_count, mes_referencia)
VALUES (
  'BW5T2hYLtVwv4IBU', -- ID do workflow n8n
  'basico',
  100,
  0,
  TO_CHAR(NOW(), 'YYYY-MM')
)
ON CONFLICT (user_id) DO NOTHING;

-- ==========================================
-- 4. ROW LEVEL SECURITY (RLS)
-- ==========================================
ALTER TABLE controle_planos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Acesso total controle" ON controle_planos;
CREATE POLICY "Acesso total controle" ON controle_planos FOR ALL USING (true);

-- ==========================================
-- 5. CRIAR VIEW PARA FACILITAR QUERY DO N8N
-- ==========================================
DROP VIEW IF EXISTS vw_parcelas_para_enviar;
CREATE OR REPLACE VIEW vw_parcelas_para_enviar AS
SELECT
  p.id as parcela_id,
  p.numero_parcela,
  p.valor as valor_em_aberto,
  p.data_vencimento,
  p.descricao,
  p.status as status_pagamento,
  p.data_ultimo_envio as ultimo_envio,
  p.enviado_hoje,
  p.total_envios,
  d.nome as nome_cliente,
  d.telefone,
  d.user_id,
  cp.plano as plano_contratado,
  cp.usage_count,
  cp.limite_mensal
FROM parcelas p
INNER JOIN devedores d ON p.devedor_id = d.id
LEFT JOIN controle_planos cp ON cp.user_id = d.user_id::text
WHERE p.status = 'pendente';

-- ==========================================
-- 6. FUNÇÃO PARA RESETAR CONTADOR MENSAL
-- ==========================================
CREATE OR REPLACE FUNCTION resetar_contador_mensal()
RETURNS void AS $$
DECLARE
  mes_atual TEXT;
BEGIN
  mes_atual := TO_CHAR(NOW(), 'YYYY-MM');

  UPDATE controle_planos
  SET
    usage_count = 0,
    mes_referencia = mes_atual,
    status = 'ativo',
    updated_at = NOW()
  WHERE mes_referencia IS NULL
     OR mes_referencia != mes_atual;

  RAISE NOTICE 'Contador mensal resetado para o mês: %', mes_atual;
END;
$$ LANGUAGE plpgsql;

-- ==========================================
-- 7. FUNÇÃO PARA RESETAR ENVIOS DIÁRIOS
-- ==========================================
CREATE OR REPLACE FUNCTION resetar_envios_diarios()
RETURNS void AS $$
DECLARE
  total_resetado INTEGER;
BEGIN
  UPDATE parcelas
  SET enviado_hoje = false
  WHERE enviado_hoje = true;

  GET DIAGNOSTICS total_resetado = ROW_COUNT;

  RAISE NOTICE 'Envios diários resetados. Total: %', total_resetado;
END;
$$ LANGUAGE plpgsql;

-- ==========================================
-- 8. TRIGGER PARA UPDATED_AT
-- ==========================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_controle_updated_at ON controle_planos;
CREATE TRIGGER update_controle_updated_at
  BEFORE UPDATE ON controle_planos
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ==========================================
-- 9. ÍNDICES PARA PERFORMANCE
-- ==========================================
CREATE INDEX IF NOT EXISTS idx_parcelas_data_vencimento ON parcelas(data_vencimento);
CREATE INDEX IF NOT EXISTS idx_parcelas_enviado_hoje ON parcelas(enviado_hoje);
CREATE INDEX IF NOT EXISTS idx_parcelas_status ON parcelas(status);
CREATE INDEX IF NOT EXISTS idx_controle_user_id ON controle_planos(user_id);

-- ==========================================
-- 10. VERIFICAR ESTRUTURA CRIADA
-- ==========================================
-- Esta query mostra todas as colunas da tabela parcelas
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'parcelas'
ORDER BY ordinal_position;

-- ==========================================
-- FIM DO SETUP
-- ==========================================
-- Execute este arquivo completo no SQL Editor do Supabase
-- Depois, importe o workflow corrigido no n8n
-- ==========================================
