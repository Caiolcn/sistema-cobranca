-- Adicionar coluna forma_pagamento na tabela parcelas se não existir
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'parcelas'
        AND column_name = 'forma_pagamento'
    ) THEN
        ALTER TABLE parcelas
        ADD COLUMN forma_pagamento VARCHAR(50);

        RAISE NOTICE 'Coluna forma_pagamento adicionada com sucesso!';
    ELSE
        RAISE NOTICE 'Coluna forma_pagamento já existe.';
    END IF;
END $$;

-- Verificar estrutura da tabela parcelas
SELECT
  'parcelas' as tabela,
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_name = 'parcelas'
ORDER BY ordinal_position;
