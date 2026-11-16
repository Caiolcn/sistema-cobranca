-- ============================================================
-- GASTOS PESSOAIS — entradas (dinheiro que entrou)
-- ============================================================
-- "recebi 3000 pró-labore" no bot vira tipo = 'entrada'.
-- Tudo que já existe fica como 'gasto' (default).
-- Rodar ANTES de publicar a nova versão da função telegram-gastos.
-- ============================================================

ALTER TABLE gastos_pessoais
  ADD COLUMN IF NOT EXISTS tipo TEXT NOT NULL DEFAULT 'gasto';

ALTER TABLE gastos_pessoais DROP CONSTRAINT IF EXISTS gastos_pessoais_tipo_check;
ALTER TABLE gastos_pessoais
  ADD CONSTRAINT gastos_pessoais_tipo_check CHECK (tipo IN ('gasto', 'entrada'));

SELECT tipo, count(*) FROM gastos_pessoais GROUP BY tipo;
