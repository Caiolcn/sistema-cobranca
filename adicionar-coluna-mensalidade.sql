-- ==========================================
-- ADICIONAR COLUNA is_mensalidade NA TABELA parcelas
-- ==========================================

-- Adicionar coluna is_mensalidade
ALTER TABLE parcelas
ADD COLUMN IF NOT EXISTS is_mensalidade BOOLEAN DEFAULT false;

-- Adicionar coluna recorrencia para armazenar dados de recorrência
ALTER TABLE parcelas
ADD COLUMN IF NOT EXISTS recorrencia JSONB;

-- Criar índice para facilitar busca de mensalidades
CREATE INDEX IF NOT EXISTS idx_parcelas_is_mensalidade ON parcelas(is_mensalidade);

-- Adicionar comentários para documentação
COMMENT ON COLUMN parcelas.is_mensalidade IS 'Indica se é uma mensalidade recorrente (true) ou parcela única/parcelamento (false)';
COMMENT ON COLUMN parcelas.recorrencia IS 'Dados de recorrência em JSON: {isRecurring, recurrenceType, startDate, dayOfMonth}';

-- Verificar se foi criada
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'parcelas'
  AND column_name IN ('is_mensalidade', 'recorrencia')
ORDER BY column_name;

-- ==========================================
-- INSTRUÇÕES:
-- ==========================================
-- 1. Copie TODO este arquivo
-- 2. Vá no Supabase → SQL Editor
-- 3. Cole o conteúdo
-- 4. Clique em RUN
-- 5. Verifique se as colunas foram criadas
-- ==========================================
