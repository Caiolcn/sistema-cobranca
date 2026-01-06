-- ==========================================
-- ADICIONAR TODAS AS COLUNAS FALTANTES NA TABELA parcelas
-- ==========================================

-- 1. Coluna total_parcelas (para saber quantas parcelas no total do parcelamento)
ALTER TABLE parcelas
ADD COLUMN IF NOT EXISTS total_parcelas INTEGER;

-- 2. Coluna is_mensalidade (indica se é mensalidade recorrente)
ALTER TABLE parcelas
ADD COLUMN IF NOT EXISTS is_mensalidade BOOLEAN DEFAULT false;

-- 3. Coluna recorrencia (armazena dados de recorrência em JSON)
ALTER TABLE parcelas
ADD COLUMN IF NOT EXISTS recorrencia JSONB;

-- 4. Verificar se enviado_hoje, data_ultimo_envio e total_envios existem
ALTER TABLE parcelas
ADD COLUMN IF NOT EXISTS enviado_hoje BOOLEAN DEFAULT false;

ALTER TABLE parcelas
ADD COLUMN IF NOT EXISTS data_ultimo_envio DATE;

ALTER TABLE parcelas
ADD COLUMN IF NOT EXISTS total_envios INTEGER DEFAULT 0;

-- ==========================================
-- CRIAR ÍNDICES PARA PERFORMANCE
-- ==========================================
CREATE INDEX IF NOT EXISTS idx_parcelas_is_mensalidade ON parcelas(is_mensalidade);
CREATE INDEX IF NOT EXISTS idx_parcelas_enviado_hoje ON parcelas(enviado_hoje);
CREATE INDEX IF NOT EXISTS idx_parcelas_total_parcelas ON parcelas(total_parcelas);

-- ==========================================
-- ADICIONAR COMENTÁRIOS PARA DOCUMENTAÇÃO
-- ==========================================
COMMENT ON COLUMN parcelas.total_parcelas IS 'Total de parcelas do parcelamento (ex: 1/10, 2/10... total_parcelas = 10). NULL para mensalidades.';
COMMENT ON COLUMN parcelas.is_mensalidade IS 'Indica se é uma mensalidade recorrente (true) ou parcela única/parcelamento (false)';
COMMENT ON COLUMN parcelas.recorrencia IS 'Dados de recorrência em JSON: {isRecurring, recurrenceType, startDate, dayOfMonth}';
COMMENT ON COLUMN parcelas.enviado_hoje IS 'Indica se já foi enviada mensagem hoje para esta parcela';
COMMENT ON COLUMN parcelas.data_ultimo_envio IS 'Data do último envio de mensagem de cobrança';
COMMENT ON COLUMN parcelas.total_envios IS 'Contador total de mensagens enviadas para esta parcela';

-- ==========================================
-- VERIFICAR ESTRUTURA FINAL
-- ==========================================
SELECT
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_name = 'parcelas'
  AND column_name IN (
    'total_parcelas',
    'is_mensalidade',
    'recorrencia',
    'enviado_hoje',
    'data_ultimo_envio',
    'total_envios'
  )
ORDER BY column_name;

-- ==========================================
-- SUCESSO!
-- ==========================================
-- Se a query acima retornar 6 linhas, está tudo certo!
-- ==========================================
