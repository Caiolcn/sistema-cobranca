-- Orgânico: o Reel do depoimento da Carol Ribeiro (planejado para 03/11)
-- já tinha sido postado na quinta 29/10 17h45. A tela marcou "postado" com a
-- data de hoje e sem ligar ao Instagram; isto liga ao post real (mesma
-- legenda) para a data ficar certa e as métricas entrarem no post.
-- Idempotente.

UPDATE organico_posts p
   SET ig_media_id = m.ig_media_id,
       permalink   = m.permalink,
       postado_em  = m.publicado_em,
       postado_por = 'manual'
  FROM organico_ig_midias m
 WHERE p.chave = '2026-11-03|feed|1'
   AND m.ig_media_id = '17996999136110563';

UPDATE organico_ig_midias
   SET post_id = (SELECT id FROM organico_posts WHERE chave = '2026-11-03|feed|1'),
       sugestao_post_id = NULL
 WHERE ig_media_id = '17996999136110563';

SELECT p.titulo, p.postado_em AT TIME ZONE 'America/Sao_Paulo' AS postado_em, p.permalink,
       (m.post_id = p.id) AS ligado
  FROM organico_posts p
  JOIN organico_ig_midias m ON m.ig_media_id = p.ig_media_id
 WHERE p.chave = '2026-11-03|feed|1';
