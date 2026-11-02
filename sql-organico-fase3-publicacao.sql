-- ============================================================================
-- Orgânico (Instagram) — FASE 3: publicação automática do FEED
-- ----------------------------------------------------------------------------
-- Por quê: o dono aprova o post na tela e o sistema publica sozinho no
-- Instagram na data/hora planejada (BRT). Só feed: reel, carrossel (até 10)
-- e foto. Stories continuam manuais.
--
-- Travas:
--   - Só publica post com aprovado_em preenchido (botão "Aprovar" na tela).
--   - publicacao_ativa (interruptor geral, por marca) nasce DESLIGADO.
--     (Fica na marca e não em `config` porque `config` é por cliente e tem
--     user_id NOT NULL — não existe linha global lá.)
--   - Envio único por carimbo: publicando_em (reservou e criou o container) e
--     publicado_em (media_publish feito). Nunca booleano. Se der erro, NÃO
--     tenta de novo sozinho: a tela mostra o erro e o botão "Tentar de novo".
--   - Se o importador mudar o conteúdo de um post aprovado (e ainda não
--     publicado), a aprovação cai e o dono precisa aprovar de novo.
--
-- Rodar DEPOIS das fases 1 e 2. Idempotente.
-- ============================================================================

ALTER TABLE public.organico_marcas
  ADD COLUMN IF NOT EXISTS publicacao_ativa boolean NOT NULL DEFAULT false;

ALTER TABLE public.organico_posts
  ADD COLUMN IF NOT EXISTS aprovado_em            timestamptz,
  ADD COLUMN IF NOT EXISTS aprovado_por           uuid,
  ADD COLUMN IF NOT EXISTS publicando_em          timestamptz,   -- reservado pelo cron, container criado
  ADD COLUMN IF NOT EXISTS publicar_chamado_em    timestamptz,   -- media_publish foi chamado (trava do 2º passo)
  ADD COLUMN IF NOT EXISTS publicado_em           timestamptz,   -- saiu no Instagram
  ADD COLUMN IF NOT EXISTS ig_container_id        text,
  ADD COLUMN IF NOT EXISTS ig_filhos              text[],        -- containers dos itens do carrossel
  ADD COLUMN IF NOT EXISTS publicacao_erro        text,
  ADD COLUMN IF NOT EXISTS publicacao_erro_em     timestamptz;

CREATE INDEX IF NOT EXISTS organico_posts_fila_publicacao_idx
  ON public.organico_posts (planejado_para)
  WHERE aprovado_em IS NOT NULL AND publicado_em IS NULL;

-- ---------- Conferência ----------
SELECT slug, publicacao_ativa FROM public.organico_marcas ORDER BY slug;
