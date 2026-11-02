-- ============================================================================
-- Orgânico (Instagram) — FASE 1: calendário e conteúdo da semana
-- ----------------------------------------------------------------------------
-- Por quê: o conteúdo do Instagram vivia numa pasta do computador (Word de
-- legendas + vídeos/imagens) e o dono não enxergava o que sai em cada dia.
-- Agora o conteúdo da semana vai para o banco + Storage (pelo script
-- ferramentas/organico/enviar-semana.js, via edge function organico-importar)
-- e aparece em /admin/organico.
--
-- "Marca": a ferramenta serve a outros SaaS do dono no futuro. Cada marca tem
-- o seu Instagram (ig_user_id) e o NOME do segredo do token (nunca o token).
--
-- Segurança: tudo é só do admin. RLS ligado, policy is_admin(). Cliente comum
-- não lê nem escreve nada daqui. Bucket "organico" é PRIVADO (a tela usa link
-- assinado temporário).
--
-- Idempotente: pode rodar de novo sem estragar nada.
-- Ordem: este arquivo -> sql-organico-fase2-metricas.sql -> sql-organico-fase3-publicacao.sql
--        -> sql-organico-crons.sql (por último, depois do deploy das funções).
-- ============================================================================

-- ---------- 1. Marcas ----------
CREATE TABLE IF NOT EXISTS public.organico_marcas (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug             text NOT NULL UNIQUE,
  nome             text NOT NULL,
  ig_user_id       text,                    -- id da conta profissional do Instagram (não é segredo)
  ig_username      text,
  -- NOME do segredo do Supabase com o token da Meta desta marca.
  -- A edge function só aceita nomes no formato META_IG_TOKEN ou META_IG_TOKEN_<X>.
  token_segredo    text NOT NULL DEFAULT 'META_IG_TOKEN',
  ativo            boolean NOT NULL DEFAULT true,
  criado_em        timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.organico_marcas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS organico_marcas_admin ON public.organico_marcas;
CREATE POLICY organico_marcas_admin ON public.organico_marcas
  FOR ALL USING (is_admin()) WITH CHECK (is_admin());

-- Mensalli é a primeira marca. ig_user_id do @mensalli (público, não é segredo).
INSERT INTO public.organico_marcas (slug, nome, ig_user_id, ig_username, token_segredo)
VALUES ('mensalli', 'Mensalli', '17841480022710080', 'mensalli', 'META_IG_TOKEN')
ON CONFLICT (slug) DO NOTHING;

-- ---------- 2. Posts planejados (feed e stories) ----------
CREATE TABLE IF NOT EXISTS public.organico_posts (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  marca_id         uuid NOT NULL REFERENCES public.organico_marcas(id) ON DELETE CASCADE,
  -- Chave estável vinda do importador (semana|data|tipo|ordem). Reenviar a
  -- mesma semana atualiza o post em vez de duplicar.
  chave            text NOT NULL,
  semana_inicio    date NOT NULL,           -- segunda-feira da semana
  semana_nome      text,                    -- nome da pasta ("Semana 02-08 nov")
  tipo             text NOT NULL CHECK (tipo IN ('reel', 'carrossel', 'foto', 'story')),
  ordem            int  NOT NULL DEFAULT 1, -- ordem dentro do dia (stories 1, 2, 3...)
  data_planejada   date NOT NULL,
  hora_planejada   time,                    -- null = sem horário definido no Word
  planejado_para   timestamptz,             -- data + hora em BRT (null se sem hora)
  titulo           text,
  legenda          text,
  hashtags         text,
  texto_alt        text,
  dica             text,
  -- Stories: { figurinha, texto_figurinha, opcoes, dm, depois, rotulo }
  story            jsonb,
  -- Status "postado" (manual, pela ligação automática ou pela publicação automática)
  postado_em       timestamptz,
  postado_por      text,                    -- 'manual' | 'auto-ligacao' | 'auto-publicacao'
  permalink        text,                    -- link do post no Instagram (colado ou descoberto)
  ig_media_id      text,                    -- id da mídia publicada (fase 2/3)
  importado_em     timestamptz,
  criado_em        timestamptz NOT NULL DEFAULT now(),
  atualizado_em    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (marca_id, chave)
);

CREATE INDEX IF NOT EXISTS organico_posts_marca_data_idx
  ON public.organico_posts (marca_id, data_planejada);
CREATE INDEX IF NOT EXISTS organico_posts_ig_media_idx
  ON public.organico_posts (ig_media_id) WHERE ig_media_id IS NOT NULL;

ALTER TABLE public.organico_posts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS organico_posts_admin ON public.organico_posts;
CREATE POLICY organico_posts_admin ON public.organico_posts
  FOR ALL USING (is_admin()) WITH CHECK (is_admin());

CREATE OR REPLACE FUNCTION public.organico_tocar_atualizado_em()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.atualizado_em := now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS organico_posts_atualizado_em ON public.organico_posts;
CREATE TRIGGER organico_posts_atualizado_em
  BEFORE UPDATE ON public.organico_posts
  FOR EACH ROW EXECUTE FUNCTION public.organico_tocar_atualizado_em();

-- ---------- 3. Arquivos (criativos) de cada post ----------
CREATE TABLE IF NOT EXISTS public.organico_arquivos (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id          uuid NOT NULL REFERENCES public.organico_posts(id) ON DELETE CASCADE,
  caminho          text NOT NULL,           -- caminho no bucket "organico"
  nome_original    text,
  tipo             text NOT NULL CHECK (tipo IN ('imagem', 'video', 'capa')),
  ordem            int  NOT NULL DEFAULT 1,
  tamanho_bytes    bigint,
  criado_em        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (post_id, caminho)
);

ALTER TABLE public.organico_arquivos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS organico_arquivos_admin ON public.organico_arquivos;
CREATE POLICY organico_arquivos_admin ON public.organico_arquivos
  FOR ALL USING (is_admin()) WITH CHECK (is_admin());

-- ---------- 4. Registro das execuções (importação, coleta, publicação) ----------
-- A tela mostra "última coleta" e o erro da Meta a partir daqui.
CREATE TABLE IF NOT EXISTS public.organico_execucoes (
  id               bigserial PRIMARY KEY,
  marca_id         uuid REFERENCES public.organico_marcas(id) ON DELETE CASCADE,
  tipo             text NOT NULL,           -- 'importacao' | 'coleta_hora' | 'coleta_dia' | 'publicacao'
  iniciado_em      timestamptz NOT NULL DEFAULT now(),
  terminado_em     timestamptz,
  ok               boolean,
  erro             text,
  resumo           jsonb
);
CREATE INDEX IF NOT EXISTS organico_execucoes_marca_tipo_idx
  ON public.organico_execucoes (marca_id, tipo, iniciado_em DESC);

ALTER TABLE public.organico_execucoes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS organico_execucoes_admin_le ON public.organico_execucoes;
CREATE POLICY organico_execucoes_admin_le ON public.organico_execucoes
  FOR SELECT USING (is_admin());
-- Escrita só pelas edge functions (service_role ignora RLS).

-- ---------- 5. Bucket privado dos criativos ----------
-- 100 MB por arquivo. Se o limite GLOBAL do projeto (Storage > Settings) for
-- menor (ex.: 50 MB no plano Free), vale o menor — o script avisa e pula.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('organico', 'organico', false, 104857600,
        ARRAY['image/png', 'image/jpeg', 'image/webp', 'video/mp4', 'video/quicktime'])
ON CONFLICT (id) DO UPDATE
  SET public = false,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Admin vê/baixa (link assinado). Upload vem do script por link assinado
-- gerado pela edge function (service_role), então não precisa de policy de INSERT
-- para o cliente — mas o admin pode trocar/apagar arquivo pela tela no futuro.
DROP POLICY IF EXISTS organico_storage_admin_select ON storage.objects;
CREATE POLICY organico_storage_admin_select ON storage.objects
  FOR SELECT USING (bucket_id = 'organico' AND is_admin());

DROP POLICY IF EXISTS organico_storage_admin_insert ON storage.objects;
CREATE POLICY organico_storage_admin_insert ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'organico' AND is_admin());

DROP POLICY IF EXISTS organico_storage_admin_update ON storage.objects;
CREATE POLICY organico_storage_admin_update ON storage.objects
  FOR UPDATE USING (bucket_id = 'organico' AND is_admin());

DROP POLICY IF EXISTS organico_storage_admin_delete ON storage.objects;
CREATE POLICY organico_storage_admin_delete ON storage.objects
  FOR DELETE USING (bucket_id = 'organico' AND is_admin());

-- ---------- Conferência ----------
SELECT 'marcas' AS item, count(*)::text AS valor FROM public.organico_marcas
UNION ALL SELECT 'posts', count(*)::text FROM public.organico_posts
UNION ALL SELECT 'arquivos', count(*)::text FROM public.organico_arquivos
UNION ALL SELECT 'bucket organico privado', (SELECT (NOT public)::text FROM storage.buckets WHERE id = 'organico')
UNION ALL SELECT 'rls posts ligado', (SELECT relrowsecurity::text FROM pg_class WHERE oid = 'public.organico_posts'::regclass);
