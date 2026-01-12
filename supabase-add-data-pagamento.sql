-- Migration: Adicionar coluna data_pagamento na tabela mensalidades
-- Execute este script no Supabase SQL Editor

-- Adicionar coluna data_pagamento
ALTER TABLE mensalidades ADD COLUMN IF NOT EXISTS data_pagamento DATE;

-- Adicionar comentário descritivo
COMMENT ON COLUMN mensalidades.data_pagamento IS 'Data em que o pagamento foi efetivamente realizado';

-- Verificação
SELECT
    'Coluna data_pagamento adicionada com sucesso!' as status,
    COUNT(*) as total_mensalidades
FROM mensalidades;
