-- ==========================================
-- FICHA DO COLABORADOR: dados pessoais + endereço
-- Espelha os campos de cadastro do aluno (devedores), mas SEM responsável.
-- Todos opcionais (ficha cadastral). Se virar contrato, torne obrigatórios depois.
-- Idempotente: pode rodar várias vezes.
-- ==========================================

ALTER TABLE colaboradores
  ADD COLUMN IF NOT EXISTS email           TEXT,
  ADD COLUMN IF NOT EXISTS cpf             TEXT,
  ADD COLUMN IF NOT EXISTS data_nascimento DATE,
  ADD COLUMN IF NOT EXISTS cep             TEXT,
  ADD COLUMN IF NOT EXISTS endereco        TEXT,
  ADD COLUMN IF NOT EXISTS numero          TEXT,
  ADD COLUMN IF NOT EXISTS complemento     TEXT,
  ADD COLUMN IF NOT EXISTS bairro          TEXT,
  ADD COLUMN IF NOT EXISTS cidade          TEXT,
  ADD COLUMN IF NOT EXISTS estado          TEXT;

-- ==========================================
-- VERIFICAÇÃO
-- ==========================================
SELECT 'colaboradores' AS tabela, column_name, data_type
FROM information_schema.columns WHERE table_name = 'colaboradores' ORDER BY ordinal_position;
