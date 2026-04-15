-- ============================================================
-- LANDING PAGE V4 - Secao "Bora comecar?" (CTA final) editavel
-- ============================================================
-- Deixa o dono customizar titulo/subtitulo da CTA final
-- e controlar visibilidade dela independente do botao do hero.
-- ============================================================

ALTER TABLE usuarios
  ADD COLUMN IF NOT EXISTS landing_cta_final_titulo TEXT,
  ADD COLUMN IF NOT EXISTS landing_cta_final_subtitulo TEXT,
  ADD COLUMN IF NOT EXISTS landing_mostrar_cta_final BOOLEAN DEFAULT true;

-- Verificacao
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name = 'usuarios' AND column_name LIKE 'landing_cta_final%'
ORDER BY column_name;
