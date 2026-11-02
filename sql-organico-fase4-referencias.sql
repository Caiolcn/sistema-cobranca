-- ============================================================================
-- Orgânico (Instagram) — FASE 4: referências de outros perfis
-- ----------------------------------------------------------------------------
-- Por quê: o dono buscava arte de concorrente/inspiração tirando print um a um.
-- Agora ele cadastra o @ na aba "Referências" de /admin/organico e a edge
-- function organico-referencias lê os posts públicos daquele perfil pela Graph
-- API (business_discovery, com o mesmo token META_IG_TOKEN da marca), guarda os
-- números e baixa as imagens dos melhores posts para o bucket "organico"
-- (pasta referencias/<username>/). O link da CDN do Instagram expira; a cópia não.
--
-- Limite da Meta: só perfil COMERCIAL ou de CRIADOR. Não há alcance/views de
-- perfil alheio — só curtidas e comentários (e curtidas somem se o perfil esconde).
--
-- Sem cron: a coleta só roda quando alguém adiciona ou clica "Atualizar"
-- (ou pelo script), para não pesar quando houver muitas referências.
--
-- RLS: admin lê; admin pode mudar a nota do perfil. O resto só pela função.
-- Rodar DEPOIS das fases 1 a 3. Idempotente.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.organico_ref_perfis (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  marca_id         uuid NOT NULL REFERENCES public.organico_marcas(id) ON DELETE CASCADE,
  username         text NOT NULL,           -- sem @, minúsculo
  nome             text,
  foto_url         text,                    -- link da CDN (expira; só para a tela)
  seguidores       int,
  total_posts      int,
  nota             text,                    -- por que seguir esse perfil (livre)
  coletado_em      timestamptz,
  coleta_erro      text,
  criado_em        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (marca_id, username)
);

ALTER TABLE public.organico_ref_perfis ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS organico_ref_perfis_admin_le ON public.organico_ref_perfis;
CREATE POLICY organico_ref_perfis_admin_le ON public.organico_ref_perfis
  FOR SELECT USING (is_admin());
DROP POLICY IF EXISTS organico_ref_perfis_admin_atualiza ON public.organico_ref_perfis;
CREATE POLICY organico_ref_perfis_admin_atualiza ON public.organico_ref_perfis
  FOR UPDATE USING (is_admin()) WITH CHECK (is_admin());

CREATE TABLE IF NOT EXISTS public.organico_ref_posts (
  ig_media_id        text PRIMARY KEY,
  perfil_id          uuid NOT NULL REFERENCES public.organico_ref_perfis(id) ON DELETE CASCADE,
  media_type         text,          -- IMAGE | VIDEO | CAROUSEL_ALBUM
  media_product_type text,          -- FEED | REELS
  publicado_em       timestamptz,
  legenda            text,
  permalink          text,
  curtidas           int,           -- null = perfil esconde curtidas
  comentarios        int,
  -- (curtidas + comentários) / seguidores, em %. Compara perfis de tamanhos diferentes.
  engajamento        numeric(8,3),
  destaque           boolean NOT NULL DEFAULT false,  -- entre os melhores do perfil (tem imagem guardada)
  -- Imagens guardadas no bucket "organico": [{ caminho, ordem }] (capa do reel ou slides do carrossel)
  imagens            jsonb NOT NULL DEFAULT '[]'::jsonb,
  coletado_em        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS organico_ref_posts_perfil_idx
  ON public.organico_ref_posts (perfil_id, publicado_em DESC);

ALTER TABLE public.organico_ref_posts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS organico_ref_posts_admin_le ON public.organico_ref_posts;
CREATE POLICY organico_ref_posts_admin_le ON public.organico_ref_posts
  FOR SELECT USING (is_admin());

-- ---------- Conferência ----------
SELECT c.relname AS tabela, c.relrowsecurity AS rls_ligado
  FROM pg_class c
 WHERE c.relname IN ('organico_ref_perfis', 'organico_ref_posts')
 ORDER BY 1;
