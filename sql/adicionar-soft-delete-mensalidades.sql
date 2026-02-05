-- Adicionar colunas de soft delete na tabela mensalidades
-- Executar no Supabase SQL Editor

ALTER TABLE mensalidades
ADD COLUMN IF NOT EXISTS lixo BOOLEAN DEFAULT false;

ALTER TABLE mensalidades
ADD COLUMN IF NOT EXISTS deletado_em TIMESTAMPTZ;

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_mensalidades_lixo ON mensalidades(lixo);
CREATE INDEX IF NOT EXISTS idx_mensalidades_user_lixo ON mensalidades(user_id, lixo);

-- Comentários descritivos
COMMENT ON COLUMN mensalidades.lixo IS 'Soft delete: true = na lixeira';
COMMENT ON COLUMN mensalidades.deletado_em IS 'Data/hora da exclusão';
