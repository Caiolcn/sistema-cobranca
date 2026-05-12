-- ==========================================
-- ADICIONAR CICLO 'SEMESTRAL' NA TABELA PLANOS
-- ==========================================
-- Atualiza o CHECK constraint da coluna planos.ciclo_cobranca
-- para aceitar o novo valor 'semestral' (6 meses).

DO $$
DECLARE
  v_constraint_name TEXT;
BEGIN
  -- Localiza o nome real do CHECK constraint (pode variar por ambiente)
  SELECT conname INTO v_constraint_name
  FROM pg_constraint
  WHERE conrelid = 'planos'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) ILIKE '%ciclo_cobranca%';

  IF v_constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE planos DROP CONSTRAINT %I', v_constraint_name);
    RAISE NOTICE 'Constraint antiga removida: %', v_constraint_name;
  ELSE
    RAISE NOTICE 'Nenhum CHECK em ciclo_cobranca encontrado — criando do zero.';
  END IF;

  ALTER TABLE planos
    ADD CONSTRAINT planos_ciclo_cobranca_check
    CHECK (ciclo_cobranca IN ('mensal', 'trimestral', 'semestral', 'anual'));

  RAISE NOTICE 'Constraint atualizada: agora aceita mensal, trimestral, semestral, anual.';
END $$;

-- Verificar
SELECT conname, pg_get_constraintdef(oid) AS definicao
FROM pg_constraint
WHERE conrelid = 'planos'::regclass AND contype = 'c';
