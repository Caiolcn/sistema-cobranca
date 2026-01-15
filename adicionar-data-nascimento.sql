-- ==========================================
-- ADICIONAR CAMPO DATA DE NASCIMENTO
-- ==========================================

-- Adicionar coluna data_nascimento na tabela devedores
ALTER TABLE devedores
ADD COLUMN IF NOT EXISTS data_nascimento DATE;

-- Criar índice para buscas por data de nascimento (aniversariantes)
CREATE INDEX IF NOT EXISTS idx_devedores_data_nascimento ON devedores(data_nascimento);

-- Exemplo de query para buscar aniversariantes do mês
-- SELECT * FROM devedores
-- WHERE EXTRACT(MONTH FROM data_nascimento) = EXTRACT(MONTH FROM CURRENT_DATE);
