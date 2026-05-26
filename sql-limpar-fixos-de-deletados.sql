-- ==========================================
-- LIMPAR AULAS_FIXOS DE ALUNOS DELETADOS (lixo=true)
--
-- Por algum tempo o sistema permitiu marcar um aluno como excluído (lixo=true)
-- sem removê-lo das turmas fixas (aulas_fixos). Isso fazia ele continuar
-- aparecendo na agenda e quebrava filtros que dependem de `lixo=false`
-- (ex.: select de Aluno no Exportar de presenças).
--
-- A partir de agora a UI já remove de aulas_fixos junto com o soft delete.
-- Este script é para limpar os dados legados. IDEMPOTENTE — pode rodar quantas
-- vezes quiser.
--
-- Rode UMA vez no SQL Editor do Supabase.
-- ==========================================

-- Diagnóstico: quantos fixos órfãos existem antes
SELECT 'Fixos órfãos (devedor em lixo) ANTES da limpeza' AS info, COUNT(*) AS total
FROM aulas_fixos af
JOIN devedores d ON d.id = af.devedor_id
WHERE d.lixo = true;

-- Limpeza
DELETE FROM aulas_fixos
WHERE devedor_id IN (SELECT id FROM devedores WHERE lixo = true);

-- Verificação
SELECT 'Fixos órfãos (devedor em lixo) APÓS limpeza (deveria ser 0)' AS info, COUNT(*) AS total
FROM aulas_fixos af
JOIN devedores d ON d.id = af.devedor_id
WHERE d.lixo = true;
