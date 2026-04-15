-- ============================================================
-- LANDING PAGE V3 - Secao Rodape e toggles de CTA
-- ============================================================
-- Adiciona: toggles pros botoes do hero, texto custom do rodape,
-- redes sociais adicionais (Facebook, TikTok).
-- ============================================================

ALTER TABLE usuarios
  ADD COLUMN IF NOT EXISTS landing_mostrar_cta_whatsapp BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS landing_mostrar_cta_agendar BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS landing_rodape_texto TEXT,
  ADD COLUMN IF NOT EXISTS facebook_url TEXT,
  ADD COLUMN IF NOT EXISTS tiktok_url TEXT;

-- Verificacao
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name = 'usuarios'
  AND (column_name LIKE 'landing_mostrar_cta%' OR column_name IN ('landing_rodape_texto', 'facebook_url', 'tiktok_url'))
ORDER BY column_name;
