-- ============================================================
-- LANDING PAGE PUBLICA POR ACADEMIA
-- ============================================================
-- Cria pagina publica em /academia/:slug com hero, sobre, planos,
-- horarios, depoimentos (NPS >= 9), mapa e CTA WhatsApp.
-- ============================================================

ALTER TABLE usuarios
  ADD COLUMN IF NOT EXISTS landing_ativo BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS landing_slug TEXT,
  ADD COLUMN IF NOT EXISTS landing_descricao TEXT,
  ADD COLUMN IF NOT EXISTS landing_cor_primaria TEXT DEFAULT '#344848',
  ADD COLUMN IF NOT EXISTS landing_foto_capa_url TEXT,
  ADD COLUMN IF NOT EXISTS instagram_url TEXT,
  ADD COLUMN IF NOT EXISTS landing_mostrar_depoimentos BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS landing_mostrar_planos BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS landing_mostrar_horarios BOOLEAN DEFAULT true;

-- Unicidade do slug (so entre quem tem landing ativo)
CREATE UNIQUE INDEX IF NOT EXISTS idx_usuarios_landing_slug_unico
  ON usuarios(landing_slug)
  WHERE landing_slug IS NOT NULL;

-- Verificacao
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name = 'usuarios'
  AND column_name LIKE 'landing_%' OR column_name = 'instagram_url'
ORDER BY column_name;
