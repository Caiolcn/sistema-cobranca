-- ==========================================
-- MIGRATION: Adicionar Flags de Controle de Envio
-- MensalliZap - Sistema de Cobrança Automatizada
-- ==========================================
-- Esta migration adiciona colunas booleanas para controle
-- granular de envio de mensagens por tipo.
--
-- REGRA DE NEGÓCIO:
-- - Cada mensalidade pode receber no máximo 3 mensagens
-- - 1x lembrete 5 dias antes (PRO+)
-- - 1x lembrete 3 dias antes (PRO+)
-- - 1x cobrança no/após vencimento (TODOS)
-- ==========================================

-- ==========================================
-- 1. Adicionar novas colunas de controle
-- ==========================================
ALTER TABLE mensalidades
ADD COLUMN IF NOT EXISTS enviado_5dias BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS enviado_3dias BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS enviado_vencimento BOOLEAN DEFAULT false;

-- ==========================================
-- 2. Índices para performance nas buscas
-- ==========================================
-- Os agentes n8n vão filtrar por essas colunas
CREATE INDEX IF NOT EXISTS idx_mensalidades_enviado_5dias
ON mensalidades(enviado_5dias) WHERE enviado_5dias = false;

CREATE INDEX IF NOT EXISTS idx_mensalidades_enviado_3dias
ON mensalidades(enviado_3dias) WHERE enviado_3dias = false;

CREATE INDEX IF NOT EXISTS idx_mensalidades_enviado_vencimento
ON mensalidades(enviado_vencimento) WHERE enviado_vencimento = false;

-- Índice composto para queries comuns
CREATE INDEX IF NOT EXISTS idx_mensalidades_pendentes_envio
ON mensalidades(status, data_vencimento, enviado_5dias, enviado_3dias, enviado_vencimento)
WHERE status = 'pendente';

-- ==========================================
-- 3. Comentários nas colunas
-- ==========================================
COMMENT ON COLUMN mensalidades.enviado_5dias IS
'Flag: Lembrete 5 dias antes já foi enviado. Só marca true após envio bem-sucedido.';

COMMENT ON COLUMN mensalidades.enviado_3dias IS
'Flag: Lembrete 3 dias antes já foi enviado. Só marca true após envio bem-sucedido.';

COMMENT ON COLUMN mensalidades.enviado_vencimento IS
'Flag: Cobrança de atraso (no dia ou após vencimento) já foi enviada. Só marca true após envio bem-sucedido.';

-- ==========================================
-- 4. Adicionar chave_pix na tabela usuarios
-- ==========================================
ALTER TABLE usuarios
ADD COLUMN IF NOT EXISTS chave_pix TEXT;

COMMENT ON COLUMN usuarios.chave_pix IS
'Chave PIX do usuário para receber pagamentos (CPF, CNPJ, email, telefone ou aleatória)';

-- ==========================================
-- 5. Remover views e colunas antigas
-- ==========================================
-- Remover view antiga que dependia de enviado_hoje
DROP VIEW IF EXISTS vw_parcelas_para_enviar CASCADE;

-- A coluna enviado_hoje não é mais necessária com a nova lógica
ALTER TABLE mensalidades DROP COLUMN IF EXISTS enviado_hoje;

-- ==========================================
-- 6. Verificação
-- ==========================================
-- Listar mensalidades pendentes e seus estados de envio
SELECT
  id,
  devedor_id,
  valor,
  data_vencimento,
  status,
  enviado_5dias,
  enviado_3dias,
  enviado_vencimento
FROM mensalidades
WHERE status = 'pendente'
ORDER BY data_vencimento
LIMIT 10;
