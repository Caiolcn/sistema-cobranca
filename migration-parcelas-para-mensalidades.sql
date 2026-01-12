-- Migration: Renomear sistema de Parcelas para Mensalidades
-- Execute este script no seu Supabase SQL Editor
-- IMPORTANTE: Faça backup antes de executar!

-- 1. Renomear tabela parcelas para mensalidades
ALTER TABLE parcelas RENAME TO mensalidades;

-- 2. Renomear campos relacionados
-- Renomear coluna parcela_id nas tabelas relacionadas
ALTER TABLE logs_mensagens RENAME COLUMN parcela_id TO mensalidade_id;

-- 3. Renomear campo valor_parcela
ALTER TABLE logs_mensagens RENAME COLUMN valor_parcela TO valor_mensalidade;

-- 4. Renomear campo numero_parcela para numero_mensalidade (se existir)
ALTER TABLE mensalidades RENAME COLUMN numero_parcela TO numero_mensalidade;

-- 5. Atualizar comentários da tabela
COMMENT ON TABLE mensalidades IS 'Mensalidades dos clientes assinantes';

-- 6. Verificar e recriar políticas RLS (Row Level Security)
-- Dropar políticas antigas
DROP POLICY IF EXISTS "Usuários podem ver suas próprias parcelas" ON mensalidades;
DROP POLICY IF EXISTS "Usuários podem inserir suas próprias parcelas" ON mensalidades;
DROP POLICY IF EXISTS "Usuários podem atualizar suas próprias parcelas" ON mensalidades;
DROP POLICY IF EXISTS "Usuários podem deletar suas próprias parcelas" ON mensalidades;

-- Criar novas políticas
CREATE POLICY "Usuários podem ver suas próprias mensalidades"
  ON mensalidades FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Usuários podem inserir suas próprias mensalidades"
  ON mensalidades FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Usuários podem atualizar suas próprias mensalidades"
  ON mensalidades FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Usuários podem deletar suas próprias mensalidades"
  ON mensalidades FOR DELETE
  USING (auth.uid() = user_id);

-- 7. Atualizar índices (se existirem)
-- Renomear índices para refletir nova nomenclatura
DO $$
BEGIN
    -- Verificar se índices existem e renomear
    IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_parcelas_user_id') THEN
        ALTER INDEX idx_parcelas_user_id RENAME TO idx_mensalidades_user_id;
    END IF;

    IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_parcelas_devedor_id') THEN
        ALTER INDEX idx_parcelas_devedor_id RENAME TO idx_mensalidades_devedor_id;
    END IF;

    IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_parcelas_status') THEN
        ALTER INDEX idx_parcelas_status RENAME TO idx_mensalidades_status;
    END IF;

    IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_parcelas_data_vencimento') THEN
        ALTER INDEX idx_parcelas_data_vencimento RENAME TO idx_mensalidades_data_vencimento;
    END IF;
END $$;

-- 8. Verificação final
SELECT
    'Tabela mensalidades criada com sucesso!' as status,
    COUNT(*) as total_mensalidades
FROM mensalidades;

SELECT
    'Logs atualizados!' as status,
    COUNT(*) as total_logs
FROM logs_mensagens;

-- Script concluído!
-- Próximos passos: Atualizar código React para usar nova nomenclatura
