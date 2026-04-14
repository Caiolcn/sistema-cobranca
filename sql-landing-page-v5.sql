-- ============================================================
-- LANDING PAGE V5 - Botao da CTA final independente da secao
-- ============================================================
-- Permite mostrar a secao "Bora comecar?" sem o botao,
-- ou vice-versa.
-- ============================================================

ALTER TABLE usuarios
  ADD COLUMN IF NOT EXISTS landing_cta_final_mostrar_botao BOOLEAN DEFAULT true;

SELECT column_name, data_type FROM information_schema.columns
WHERE table_name = 'usuarios' AND column_name = 'landing_cta_final_mostrar_botao';
