-- ============================================================
-- LANDING PAGE V2 - Campos customizaveis
-- ============================================================
-- Adiciona: headline/subtitulo customizaveis, CTA custom,
-- galeria de fotos, FAQ, depoimentos manuais, ordem das secoes.
-- ============================================================

ALTER TABLE usuarios
  ADD COLUMN IF NOT EXISTS landing_hero_titulo TEXT,
  ADD COLUMN IF NOT EXISTS landing_hero_subtitulo TEXT,
  ADD COLUMN IF NOT EXISTS landing_cta_texto TEXT,
  ADD COLUMN IF NOT EXISTS landing_galeria JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS landing_faq JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS landing_depoimentos_manuais JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS landing_ordem_secoes JSONB DEFAULT '["sobre","planos","galeria","horarios","depoimentos","faq","mapa"]'::jsonb,
  ADD COLUMN IF NOT EXISTS landing_mostrar_galeria BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS landing_mostrar_faq BOOLEAN DEFAULT true;

-- Estrutura esperada dos JSONBs:
--   landing_galeria: ["url1", "url2", ...]  (max 6)
--   landing_faq: [{"pergunta": "...", "resposta": "..."}]
--   landing_depoimentos_manuais: [{"nome": "Joao", "comentario": "...", "nota": 10}]
--   landing_ordem_secoes: ["sobre","planos","galeria","horarios","depoimentos","faq","mapa"]

-- Verificacao
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name = 'usuarios' AND column_name LIKE 'landing_%'
ORDER BY column_name;
