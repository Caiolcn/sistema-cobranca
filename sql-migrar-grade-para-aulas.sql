-- ==========================================
-- MIGRAÇÃO: grade_horarios → aulas + aulas_fixos
-- Roda DEPOIS de sql-atualizar-presencas-aulas-fixos.sql
-- ==========================================

-- 1. CRIAR AULAS a partir dos horários únicos da grade
-- Agrupa por (user_id, dia_semana, horario, descricao)
INSERT INTO aulas (user_id, dia_semana, horario, descricao, capacidade, ativo)
SELECT
    gh.user_id,
    gh.dia_semana,
    gh.horario,
    COALESCE(gh.descricao, ''),
    GREATEST(COUNT(gh.id) + 2, 10) AS capacidade, -- alunos existentes + 2 vagas extras, mínimo 10
    true
FROM grade_horarios gh
WHERE NOT EXISTS (
    -- Não duplicar se já existe aula igual
    SELECT 1 FROM aulas a
    WHERE a.user_id = gh.user_id
    AND a.dia_semana = gh.dia_semana
    AND a.horario = gh.horario
    AND COALESCE(a.descricao, '') = COALESCE(gh.descricao, '')
)
GROUP BY gh.user_id, gh.dia_semana, gh.horario, COALESCE(gh.descricao, '')
ORDER BY gh.user_id, gh.dia_semana, gh.horario;

-- 2. CRIAR ALUNOS FIXOS a partir da grade
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
WHERE NOT EXISTS (
    -- Não duplicar se já existe fixo
    SELECT 1 FROM aulas_fixos af
    WHERE af.aula_id = a.id
    AND af.devedor_id = gh.devedor_id
)
AND gh.devedor_id IS NOT NULL;

-- 3. MIGRAR PRESENÇAS: preencher aula_id e devedor_id
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
-- VERIFICAR RESULTADO
-- ==========================================
SELECT 'Aulas criadas' as info, COUNT(*) as total FROM aulas;
SELECT 'Fixos criados' as info, COUNT(*) as total FROM aulas_fixos;
SELECT 'Presencas migradas' as info, COUNT(*) as total FROM presencas WHERE aula_id IS NOT NULL;
SELECT 'Presencas pendentes' as info, COUNT(*) as total FROM presencas WHERE aula_id IS NULL AND grade_horario_id IS NOT NULL;
