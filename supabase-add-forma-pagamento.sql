-- Migration: Adicionar coluna forma_pagamento na tabela mensalidades
-- Execute este script no Supabase SQL Editor

-- Adicionar coluna forma_pagamento
ALTER TABLE mensalidades ADD COLUMN IF NOT EXISTS forma_pagamento VARCHAR(50);

-- Adicionar comentário descritivo
COMMENT ON COLUMN mensalidades.forma_pagamento IS 'Forma de pagamento utilizada (PIX, Dinheiro, Cartão de Crédito, Cartão de Débito, Transferência, Boleto)';

-- Verificação
SELECT
    'Coluna forma_pagamento adicionada com sucesso!' as status,
    COUNT(*) as total_mensalidades
FROM mensalidades;
