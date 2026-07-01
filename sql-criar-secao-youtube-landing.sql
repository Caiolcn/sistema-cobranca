-- Seção "Vídeo do YouTube" no Criador de Sites (landing page pública)
-- Adiciona título + descrição opcional + link do vídeo, com toggle de visibilidade.
-- Colunas aditivas e nullable — seguro rodar em produção (idempotente).

ALTER TABLE usuarios
  ADD COLUMN IF NOT EXISTS landing_youtube_url        TEXT,
  ADD COLUMN IF NOT EXISTS landing_youtube_titulo     TEXT,
  ADD COLUMN IF NOT EXISTS landing_youtube_descricao  TEXT,
  ADD COLUMN IF NOT EXISTS landing_mostrar_youtube    BOOLEAN DEFAULT true;
