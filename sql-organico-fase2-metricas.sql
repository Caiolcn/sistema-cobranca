-- ============================================================================
-- Orgânico (Instagram) — FASE 2: métricas vindas direto da Meta (Graph API)
-- ----------------------------------------------------------------------------
-- Por quê: o dono quer ver alcance, views, curtidas, comentários, salvamentos,
-- compartilhamentos e seguidores numa tela nossa, sem Metricool.
-- A edge function organico-coletar (token META_IG_TOKEN, usuário do sistema
-- claude-organico) grava aqui:
--   - organico_ig_midias: tudo que saiu no Instagram (planejado ou não),
--     com os últimos números de cada mídia;
--   - organico_metricas_snapshots: uma "foto" por coleta (curva dos 1os dias);
--   - organico_conta_diaria: números da conta por dia.
-- Stories só têm métrica enquanto estão no ar (24h) — por isso a coleta de hora em hora.
--
-- RLS: admin só lê. Escrita só pela edge function (service_role).
-- Rodar DEPOIS de sql-organico-fase1-conteudo.sql. Idempotente.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.organico_ig_midias (
  ig_media_id          text PRIMARY KEY,
  marca_id             uuid NOT NULL REFERENCES public.organico_marcas(id) ON DELETE CASCADE,
  post_id              uuid REFERENCES public.organico_posts(id) ON DELETE SET NULL,
  media_type           text,          -- IMAGE | VIDEO | CAROUSEL_ALBUM
  media_product_type   text,          -- FEED | REELS | STORY
  publicado_em         timestamptz,
  legenda              text,
  permalink            text,
  -- Últimos números (null = a Meta não devolve essa métrica para esse tipo)
  views                int,
  alcance              int,
  curtidas             int,
  comentarios          int,
  salvamentos          int,
  compartilhamentos    int,
  interacoes           int,
  respostas            int,           -- stories
  seguiu               int,           -- stories: quantos seguiram a partir dele
  visitas_perfil       int,
  reel_tempo_medio_ms  bigint,
  metricas_em          timestamptz,   -- quando os números acima foram lidos
  metricas_erro        text,
  -- Sugestão de ligação quando a automática ficou em dúvida (o dono confirma na tela)
  sugestao_post_id     uuid REFERENCES public.organico_posts(id) ON DELETE SET NULL,
  criado_em            timestamptz NOT NULL DEFAULT now(),
  atualizado_em        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS organico_ig_midias_marca_data_idx
  ON public.organico_ig_midias (marca_id, publicado_em DESC);
CREATE INDEX IF NOT EXISTS organico_ig_midias_post_idx
  ON public.organico_ig_midias (post_id) WHERE post_id IS NOT NULL;

ALTER TABLE public.organico_ig_midias ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS organico_ig_midias_admin_le ON public.organico_ig_midias;
CREATE POLICY organico_ig_midias_admin_le ON public.organico_ig_midias
  FOR SELECT USING (is_admin());
-- O admin pode confirmar/desfazer a sugestão de ligação pela tela.
DROP POLICY IF EXISTS organico_ig_midias_admin_atualiza ON public.organico_ig_midias;
CREATE POLICY organico_ig_midias_admin_atualiza ON public.organico_ig_midias
  FOR UPDATE USING (is_admin()) WITH CHECK (is_admin());

DROP TRIGGER IF EXISTS organico_ig_midias_atualizado_em ON public.organico_ig_midias;
CREATE TRIGGER organico_ig_midias_atualizado_em
  BEFORE UPDATE ON public.organico_ig_midias
  FOR EACH ROW EXECUTE FUNCTION public.organico_tocar_atualizado_em();

CREATE TABLE IF NOT EXISTS public.organico_metricas_snapshots (
  id                   bigserial PRIMARY KEY,
  ig_media_id          text NOT NULL REFERENCES public.organico_ig_midias(ig_media_id) ON DELETE CASCADE,
  coletado_em          timestamptz NOT NULL DEFAULT now(),
  metricas             jsonb NOT NULL
);
CREATE INDEX IF NOT EXISTS organico_metricas_snapshots_midia_idx
  ON public.organico_metricas_snapshots (ig_media_id, coletado_em);

ALTER TABLE public.organico_metricas_snapshots ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS organico_metricas_snapshots_admin_le ON public.organico_metricas_snapshots;
CREATE POLICY organico_metricas_snapshots_admin_le ON public.organico_metricas_snapshots
  FOR SELECT USING (is_admin());

CREATE TABLE IF NOT EXISTS public.organico_conta_diaria (
  marca_id             uuid NOT NULL REFERENCES public.organico_marcas(id) ON DELETE CASCADE,
  data                 date NOT NULL,     -- dia em BRT
  seguidores           int,               -- total no momento da coleta
  novos_seguidores     int,               -- follower_count do dia (a Meta só guarda 30 dias)
  alcance              int,
  views                int,
  contas_engajadas     int,
  interacoes           int,
  atualizado_em        timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (marca_id, data)
);

ALTER TABLE public.organico_conta_diaria ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS organico_conta_diaria_admin_le ON public.organico_conta_diaria;
CREATE POLICY organico_conta_diaria_admin_le ON public.organico_conta_diaria
  FOR SELECT USING (is_admin());

-- ---------- Conferência ----------
SELECT c.relname AS tabela, c.relrowsecurity AS rls_ligado
  FROM pg_class c
 WHERE c.relname IN ('organico_ig_midias', 'organico_metricas_snapshots', 'organico_conta_diaria')
 ORDER BY 1;
