-- ==========================================
-- MIGRAR GRADE_HORARIOS → AULAS (capacidade=1) + AULAS_FIXOS
--
-- Pra clientes que nunca usaram "turma" e sempre trabalharam com
-- "1 aluno por horário" (modelo antigo da grade_horarios). Cada
-- registro de grade_horarios (devedor + dia + horario + descricao)
-- vira sua PRÓPRIA aula com capacidade=1 e o aluno como fixo único.
--
-- Diferente da migração anterior (sql-consolidar-agenda.sql) que
-- agrupava por (dia, horario, descricao) criando turmas. Aqui cada
-- aluno fica isolado em seu slot.
--
-- IDEMPOTENTE: pode rodar várias vezes. O NOT EXISTS evita criar
-- duplicatas de aulas individuais com o mesmo aluno no mesmo slot.
--
-- NÃO MEXE nas turmas legadas (capacidade > 1) já criadas — se quiser
-- limpar essas turmas depois, rode o SQL de limpeza opcional no final.
-- ==========================================

-- Diagnóstico ANTES
SELECT 'ANTES — registros em grade_horarios com aluno' AS info, COUNT(*) AS total
FROM grade_horarios WHERE devedor_id IS NOT NULL;

SELECT 'ANTES — aulas individuais (cap=1) já existentes' AS info, COUNT(*) AS total
FROM aulas WHERE capacidade = 1;

-- ------------------------------------------
-- MIGRAÇÃO
-- Pra cada registro de grade_horarios ainda não migrado pra cap=1,
-- cria 1 aula com capacidade=1 + 1 aulas_fixos linkando o aluno.
-- ------------------------------------------
DO $$
DECLARE
    rec RECORD;
    nova_aula_id UUID;
    contador INTEGER := 0;
BEGIN
    FOR rec IN
        SELECT g.* FROM grade_horarios g
        WHERE g.devedor_id IS NOT NULL
          AND NOT EXISTS (
              SELECT 1 FROM aulas a
              JOIN aulas_fixos af ON af.aula_id = a.id
              WHERE a.user_id = g.user_id
                AND a.dia_semana = g.dia_semana
                AND a.horario = g.horario
                AND a.capacidade = 1
                AND af.devedor_id = g.devedor_id
          )
    LOOP
        -- Cria a aula individual
        INSERT INTO aulas (user_id, dia_semana, horario, descricao, capacidade, ativo)
        VALUES (rec.user_id, rec.dia_semana, rec.horario, COALESCE(rec.descricao, ''), 1, true)
        RETURNING id INTO nova_aula_id;

        -- Vincula o aluno como fixo (único, já que cap=1)
        INSERT INTO aulas_fixos (aula_id, devedor_id, user_id, ativo)
        VALUES (nova_aula_id, rec.devedor_id, rec.user_id, COALESCE(rec.ativo, true));

        contador := contador + 1;
    END LOOP;

    RAISE NOTICE 'Slots individuais criados nesta execução: %', contador;
END $$;

-- Diagnóstico DEPOIS
SELECT 'DEPOIS — aulas individuais (cap=1)' AS info, COUNT(*) AS total
FROM aulas WHERE capacidade = 1;

SELECT 'DEPOIS — fixos vinculados a aulas individuais' AS info, COUNT(*) AS total
FROM aulas_fixos af JOIN aulas a ON a.id = af.aula_id WHERE a.capacidade = 1;

SELECT 'DEPOIS — alunos da grade legada SEM migração (deveria ser 0)' AS info, COUNT(*) AS total
FROM grade_horarios gh
WHERE gh.devedor_id IS NOT NULL
  AND NOT EXISTS (
      SELECT 1 FROM aulas a
      JOIN aulas_fixos af ON af.aula_id = a.id
      WHERE a.user_id = gh.user_id
        AND a.dia_semana = gh.dia_semana
        AND a.horario = gh.horario
        AND a.capacidade = 1
        AND af.devedor_id = gh.devedor_id
  );

-- ==========================================
-- LIMPEZA OPCIONAL — só rode SE quiser apagar as turmas legadas
-- (capacidade > 1) que foram criadas erroneamente pela migração anterior.
-- Ative removendo o /* */ abaixo. Risco: se houver turmas REAIS (grupo),
-- elas serão apagadas também. Use com cuidado.
-- ==========================================
/*
DELETE FROM aulas WHERE capacidade > 1;
SELECT 'Turmas (cap>1) restantes — esperado 0' AS info, COUNT(*) AS total
FROM aulas WHERE capacidade > 1;
*/
