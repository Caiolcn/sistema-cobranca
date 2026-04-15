-- ============================================================
-- SITE DA EMPRESA - Migration completa (v1 + v2 + v3 + v4 + v5)
-- ============================================================
-- Roda tudo de uma vez. Usa ADD COLUMN IF NOT EXISTS, entao eh
-- seguro rodar varias vezes sem quebrar nada.
--
-- O que inclui:
--   v1 - Estrutura base da landing (slug, ativo, cor, descricao, toggles)
--   v2 - Hero, galeria, FAQ, depoimentos manuais, ordem das secoes
--   v3 - Toggles dos CTAs, rodape custom, Facebook, TikTok
--   v4 - Secao "Bora comecar?" editavel (titulo, subtitulo, toggle)
--   v5 - Botao da CTA final independente da secao
-- ============================================================

ALTER TABLE usuarios
  -- v1: Base
  ADD COLUMN IF NOT EXISTS landing_ativo BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS landing_slug TEXT,
  ADD COLUMN IF NOT EXISTS landing_descricao TEXT,
  ADD COLUMN IF NOT EXISTS landing_cor_primaria TEXT DEFAULT '#344848',
  ADD COLUMN IF NOT EXISTS landing_foto_capa_url TEXT,
  ADD COLUMN IF NOT EXISTS instagram_url TEXT,
  ADD COLUMN IF NOT EXISTS landing_mostrar_depoimentos BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS landing_mostrar_planos BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS landing_mostrar_horarios BOOLEAN DEFAULT true,

  -- v2: Hero custom, galeria, FAQ, depoimentos manuais, ordem
  ADD COLUMN IF NOT EXISTS landing_hero_titulo TEXT,
  ADD COLUMN IF NOT EXISTS landing_hero_subtitulo TEXT,
  ADD COLUMN IF NOT EXISTS landing_cta_texto TEXT,
  ADD COLUMN IF NOT EXISTS landing_galeria JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS landing_faq JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS landing_depoimentos_manuais JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS landing_ordem_secoes JSONB DEFAULT '["sobre","planos","galeria","horarios","depoimentos","faq","mapa"]'::jsonb,
  ADD COLUMN IF NOT EXISTS landing_mostrar_galeria BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS landing_mostrar_faq BOOLEAN DEFAULT true,

  -- v3: Toggles dos CTAs + rodape + redes sociais
  ADD COLUMN IF NOT EXISTS landing_mostrar_cta_whatsapp BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS landing_mostrar_cta_agendar BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS landing_rodape_texto TEXT,
  ADD COLUMN IF NOT EXISTS facebook_url TEXT,
  ADD COLUMN IF NOT EXISTS tiktok_url TEXT,

  -- v4: Secao "Bora comecar?" editavel
  ADD COLUMN IF NOT EXISTS landing_cta_final_titulo TEXT,
  ADD COLUMN IF NOT EXISTS landing_cta_final_subtitulo TEXT,
  ADD COLUMN IF NOT EXISTS landing_mostrar_cta_final BOOLEAN DEFAULT true,

  -- v5: Botao da CTA final independente da secao
  ADD COLUMN IF NOT EXISTS landing_cta_final_mostrar_botao BOOLEAN DEFAULT true;

-- ============================================================
-- Indice unico pra evitar 2 clientes com o mesmo slug
-- ============================================================
CREATE UNIQUE INDEX IF NOT EXISTS idx_usuarios_landing_slug_unico
  ON usuarios(landing_slug)
  WHERE landing_slug IS NOT NULL;

-- ============================================================
-- Verificacao - lista todas as colunas criadas
-- ============================================================
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'usuarios'
  AND (column_name LIKE 'landing_%'
       OR column_name IN ('instagram_url', 'facebook_url', 'tiktok_url'))
ORDER BY column_name;

-- Quantidade esperada: 26 colunas
--   landing_ativo, landing_slug, landing_descricao, landing_cor_primaria,
--   landing_foto_capa_url, landing_mostrar_depoimentos, landing_mostrar_planos,
--   landing_mostrar_horarios, landing_hero_titulo, landing_hero_subtitulo,
--   landing_cta_texto, landing_galeria, landing_faq, landing_depoimentos_manuais,
--   landing_ordem_secoes, landing_mostrar_galeria, landing_mostrar_faq,
--   landing_mostrar_cta_whatsapp, landing_mostrar_cta_agendar, landing_rodape_texto,
--   landing_cta_final_titulo, landing_cta_final_subtitulo, landing_mostrar_cta_final,
--   landing_cta_final_mostrar_botao, instagram_url, facebook_url, tiktok_url
