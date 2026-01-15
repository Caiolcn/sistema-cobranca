-- ==========================================
-- IMPLEMENTAR SOFT DELETE (EXCLUSÃO LÓGICA)
-- ==========================================

-- Adicionar coluna lixo na tabela devedores
-- lixo = 0 (ou false) = ativo
-- lixo = 1 (ou true) = deletado
ALTER TABLE devedores
ADD COLUMN IF NOT EXISTS lixo BOOLEAN DEFAULT false;

-- Adicionar coluna para registrar quando foi deletado
ALTER TABLE devedores
ADD COLUMN IF NOT EXISTS deletado_em TIMESTAMPTZ;

-- Criar índice para filtrar rapidamente os registros ativos
CREATE INDEX IF NOT EXISTS idx_devedores_lixo ON devedores(lixo);

-- Índice composto para queries comuns (user_id + lixo)
CREATE INDEX IF NOT EXISTS idx_devedores_user_lixo ON devedores(user_id, lixo);

-- Atualizar registros existentes para lixo = false (caso a coluna seja criada como NULL)
UPDATE devedores SET lixo = false WHERE lixo IS NULL;
