-- ==========================================
-- CONSOLIDAR AGENDA
-- Garante o schema do modelo novo (aulas / aulas_fixos / agendamentos /
-- ausencias_fixos / presencas) e migra os dados do modelo legado
-- (grade_horarios) para ele, trazendo inclusive o histórico de presenças.
--
-- IDEMPOTENTE: pode rodar quantas vezes quiser, sem duplicar nada.
-- Rode UMA vez no SQL Editor do Supabase antes de usar a nova Agenda.
-- ==========================================

-- ------------------------------------------
-- 1. presencas: garantir aula_id + devedor_id
-- ------------------------------------------
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'presencas' AND column_name = 'aula_id'
    ) THEN
        ALTER TABLE presencas ADD COLUMN aula_id UUID REFERENCES aulas(id) ON DELETE SET NULL;
        RAISE NOTICE 'Coluna aula_id adicionada em presencas';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'presencas' AND column_name = 'devedor_id'
    ) THEN
        ALTER TABLE presencas ADD COLUMN devedor_id UUID REFERENCES devedores(id) ON DELETE SET NULL;
        RAISE NOTICE 'Coluna devedor_id adicionada em presencas';
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_presencas_aula_devedor ON presencas(aula_id, devedor_id, data);

-- ------------------------------------------
-- 2. aulas_fixos: garantir coluna ativo (pausar aluno sem remover)
-- ------------------------------------------
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'aulas_fixos' AND column_name = 'ativo'
    ) THEN
        ALTER TABLE aulas_fixos ADD COLUMN ativo BOOLEAN DEFAULT true;
        RAISE NOTICE 'Coluna ativo adicionada em aulas_fixos';
    END IF;
END $$;

-- ------------------------------------------
-- 3. MIGRAR grade_horarios -> aulas
-- Agrupa os horários únicos da grade legada (user, dia, horário, descrição).
-- ------------------------------------------
INSERT INTO aulas (user_id, dia_semana, horario, descricao, capacidade, ativo)
SELECT
    gh.user_id,
    gh.dia_semana,
    gh.horario,
    COALESCE(gh.descricao, ''),
    GREATEST(COUNT(gh.id) + 2, 10) AS capacidade, -- alunos existentes + 2 vagas, mínimo 10
    true
FROM grade_horarios gh
WHERE NOT EXISTS (
    SELECT 1 FROM aulas a
    WHERE a.user_id = gh.user_id
      AND a.dia_semana = gh.dia_semana
      AND a.horario = gh.horario
      AND COALESCE(a.descricao, '') = COALESCE(gh.descricao, '')
)
GROUP BY gh.user_id, gh.dia_semana, gh.horario, COALESCE(gh.descricao, '')
ORDER BY gh.user_id, gh.dia_semana, gh.horario;

-- ------------------------------------------
-- 4. MIGRAR grade_horarios -> aulas_fixos
-- Cada aluno da grade legada vira aluno fixo da aula correspondente.
-- ------------------------------------------
INSERT INTO aulas_fixos (aula_id, devedor_id, user_id, ativo)
SELECT DISTINCT
    a.id AS aula_id,
    gh.devedor_id,
    gh.user_id,
    gh.ativo
FROM grade_horarios gh
JOIN aulas a ON (
    a.user_id = gh.user_id
    AND a.dia_semana = gh.dia_semana
    AND a.horario = gh.horario
    AND COALESCE(a.descricao, '') = COALESCE(gh.descricao, '')
)
WHERE gh.devedor_id IS NOT NULL
  AND NOT EXISTS (
      SELECT 1 FROM aulas_fixos af
      WHERE af.aula_id = a.id
        AND af.devedor_id = gh.devedor_id
  );

-- ------------------------------------------
-- 5. BACKFILL presencas: preencher aula_id + devedor_id no histórico
-- Liga cada presença antiga (grade_horario_id) à aula nova equivalente.
-- ------------------------------------------
UPDATE presencas p
SET
    aula_id = a.id,
    devedor_id = gh.devedor_id
FROM grade_horarios gh
JOIN aulas a ON (
    a.user_id = gh.user_id
    AND a.dia_semana = gh.dia_semana
    AND a.horario = gh.horario
    AND COALESCE(a.descricao, '') = COALESCE(gh.descricao, '')
)
WHERE p.grade_horario_id = gh.id
  AND p.aula_id IS NULL;

-- ==========================================
-- VERIFICAÇÃO
-- ==========================================
SELECT 'Aulas (modelo novo)'        AS info, COUNT(*) AS total FROM aulas;
SELECT 'Alunos fixos'               AS info, COUNT(*) AS total FROM aulas_fixos;
SELECT 'Presenças migradas (ok)'    AS info, COUNT(*) AS total FROM presencas WHERE aula_id IS NOT NULL;
SELECT 'Presenças pendentes (!=0 indica problema)' AS info, COUNT(*) AS total
  FROM presencas WHERE aula_id IS NULL AND grade_horario_id IS NOT NULL;
