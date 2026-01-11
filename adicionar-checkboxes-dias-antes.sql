-- ==========================================
-- ATUALIZAR CONFIGURAÇÕES DE COBRANÇA
-- ==========================================

-- Adicionar colunas para checkboxes individuais de envio pré-vencimento
DO $$
BEGIN
    -- Adicionar coluna enviar_3_dias_antes se não existir
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'configuracoes_cobranca'
        AND column_name = 'enviar_3_dias_antes'
    ) THEN
        ALTER TABLE configuracoes_cobranca
        ADD COLUMN enviar_3_dias_antes BOOLEAN DEFAULT false;

        RAISE NOTICE 'Coluna enviar_3_dias_antes adicionada com sucesso!';
    ELSE
        RAISE NOTICE 'Coluna enviar_3_dias_antes já existe.';
    END IF;

    -- Adicionar coluna enviar_5_dias_antes se não existir
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'configuracoes_cobranca'
        AND column_name = 'enviar_5_dias_antes'
    ) THEN
        ALTER TABLE configuracoes_cobranca
        ADD COLUMN enviar_5_dias_antes BOOLEAN DEFAULT false;

        RAISE NOTICE 'Coluna enviar_5_dias_antes adicionada com sucesso!';
    ELSE
        RAISE NOTICE 'Coluna enviar_5_dias_antes já existe.';
    END IF;
END $$;

-- Migrar dados existentes (se enviar_antes_vencimento estava ativo, migrar para o checkbox correspondente)
UPDATE configuracoes_cobranca
SET
    enviar_3_dias_antes = CASE WHEN enviar_antes_vencimento = true AND dias_antes_vencimento = 3 THEN true ELSE false END,
    enviar_5_dias_antes = CASE WHEN enviar_antes_vencimento = true AND dias_antes_vencimento = 5 THEN true ELSE false END
WHERE enviar_3_dias_antes IS NULL OR enviar_5_dias_antes IS NULL;

-- Verificar estrutura da tabela configuracoes_cobranca
SELECT
  'configuracoes_cobranca' as tabela,
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_name = 'configuracoes_cobranca'
ORDER BY ordinal_position;
