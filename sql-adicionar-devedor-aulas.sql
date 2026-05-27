-- ==========================================
-- ADICIONA coluna `devedor_id` em `aulas` para suportar "aluno individual"
-- como entidade distinta de turma na Agenda Nova.
--
-- - devedor_id IS NULL     → linha representa uma TURMA
--   (capacidade > 1, alunos fixos via `aulas_fixos`)
-- - devedor_id IS NOT NULL → linha representa um ALUNO INDIVIDUAL
--   (capacidade=1 implícito; sem `aulas_fixos`; aluno direto na linha)
--
-- Retrocompatível: aulas existentes ficam com devedor_id=NULL (= turmas).
-- O menu "Horários" (AgendaCalendario) deve filtrar `devedor_id IS NULL`
-- para não mostrar os alunos individuais (isolamento da Agenda Nova).
--
-- ON DELETE CASCADE: se o aluno for removido, a linha individual dele
-- também é apagada automaticamente.
--
-- TODO futuro: lembretes/notificações que hoje varrem `aulas_fixos` NÃO
-- disparam pra alunos individuais (eles não estão em aulas_fixos). Avaliar
-- adaptação dos jobs quando o modelo estabilizar.
-- ==========================================

ALTER TABLE aulas
  ADD COLUMN IF NOT EXISTS devedor_id UUID
  REFERENCES devedores(id) ON DELETE CASCADE;

-- Índice parcial: só indexa linhas individuais (a maioria das aulas será turma).
CREATE INDEX IF NOT EXISTS idx_aulas_devedor_id
  ON aulas(devedor_id) WHERE devedor_id IS NOT NULL;

-- Diagnóstico
SELECT 'Total aulas' AS info, COUNT(*) AS total FROM aulas;
SELECT 'Aulas-turma (devedor_id NULL)' AS info, COUNT(*) AS total
FROM aulas WHERE devedor_id IS NULL;
SELECT 'Aulas-aluno individual (devedor_id NOT NULL)' AS info, COUNT(*) AS total
FROM aulas WHERE devedor_id IS NOT NULL;
