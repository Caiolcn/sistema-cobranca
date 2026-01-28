-- =============================================
-- MIGRAÇÃO: Adicionar campo modo_integracao
-- =============================================

-- Campo para definir o modo de integração do usuário
-- Valores: 'asaas' (com boletos) ou 'manual' (só PIX interno)
ALTER TABLE usuarios
ADD COLUMN IF NOT EXISTS modo_integracao TEXT DEFAULT 'manual';

-- Comentário explicativo
COMMENT ON COLUMN usuarios.modo_integracao IS 'Modo de integração: asaas (boletos + PIX Asaas) ou manual (apenas link interno PIX)';

-- Se o usuário já tem asaas_api_key configurada, definir como 'asaas'
UPDATE usuarios
SET modo_integracao = 'asaas'
WHERE asaas_api_key IS NOT NULL AND asaas_api_key != '';
