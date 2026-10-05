-- Link na bio da academia (rota /:slug/bio, editor em Marketing › Bio)
-- Guarda tema, fonte, frase, redes, links extras, fotos/vídeos e quais botões mostrar.
-- Coluna aditiva e nullable — seguro rodar em produção (idempotente).
-- Quando vazia, a bio herda tudo do que o cliente já preencheu no site (landing_*).

ALTER TABLE usuarios
  ADD COLUMN IF NOT EXISTS bio_config JSONB;
