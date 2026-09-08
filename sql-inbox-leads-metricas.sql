-- ============================================================
-- METRICAS DO FUNIL DE LEADS - Mensalli
-- ============================================================
-- Tres views que respondem os cinco numeros do playbook
-- (docs/playbook-leads-campanha.html, secao "Termometro"):
--
--   1. tempo ate a sua primeira resposta
--   2. % que responde a qualificacao
--   3. % que manda a lista           (proxy: chegou a criou_conta)
--   4. % que conecta o WhatsApp      (proxy: virou pagante / conta ativa)
--   5. lead -> pagante
--
-- Servem a aba Metricas do /admin e tambem a consulta direta (MCP/SQL) quando
-- for preciso analisar o funil sem abrir a tela.
--
-- security_invoker = true nas tres: herdam a RLS de mensalli_leads (so admin).
-- Depende de sql-inbox-leads.sql (colunas fila/nicho/alunos).
-- ============================================================

-- ==========================================
-- 1. POR LEAD
-- ==========================================
-- Uma linha por lead nao-ignorado, com os marcos da conversa.
-- "Primeira resposta" = primeira mensagem nossa DEPOIS da primeira mensagem
-- dele. A ordem importa: em lead vindo de backfill existe 'out' anterior ao
-- primeiro 'in', e contar essa como resposta daria tempo negativo.
CREATE OR REPLACE VIEW vw_mensalli_lead_metricas AS
WITH marcos AS (
  SELECT
    l.id AS lead_id,
    MIN(m.enviado_em) FILTER (WHERE m.direcao = 'in')  AS primeira_in,
    MAX(m.enviado_em) FILTER (WHERE m.direcao = 'in')  AS ultima_in,
    MAX(m.enviado_em) FILTER (WHERE m.direcao = 'out') AS ultima_out,
    COUNT(*) FILTER (WHERE m.direcao = 'in')           AS total_in,
    COUNT(*) FILTER (WHERE m.direcao = 'out')          AS total_out,
    COUNT(*) FILTER (WHERE m.direcao = 'in' AND m.tipo <> 'texto') AS midias_recebidas
  FROM mensalli_leads l
  LEFT JOIN mensalli_lead_mensagens m ON m.lead_id = l.id
  WHERE l.ignorado = FALSE
  GROUP BY l.id
),
resposta AS (
  SELECT
    k.lead_id,
    k.primeira_in,
    (SELECT MIN(m.enviado_em)
       FROM mensalli_lead_mensagens m
      WHERE m.lead_id = k.lead_id
        AND m.direcao = 'out'
        AND m.enviado_em > k.primeira_in) AS primeira_resposta
  FROM marcos k
)
SELECT
  l.id                AS lead_id,
  l.nome,
  l.telefone,
  l.status,
  l.fila,
  l.nicho,
  l.alunos,
  l.usuario_id,
  l.created_at        AS lead_criado_em,

  k.primeira_in,
  r.primeira_resposta,
  CASE
    WHEN r.primeira_resposta IS NULL THEN NULL
    ELSE ROUND(EXTRACT(EPOCH FROM (r.primeira_resposta - k.primeira_in)) / 60)::INT
  END                 AS minutos_primeira_resposta,
  (r.primeira_resposta IS NOT NULL) AS foi_respondido,

  k.total_in,
  k.total_out,
  k.midias_recebidas,
  k.ultima_in,
  k.ultima_out,
  ROUND(EXTRACT(EPOCH FROM (NOW() - l.ultima_interacao)) / 86400)::INT AS dias_parado,
  (l.ultima_direcao = 'in' AND l.status <> 'perdido')                  AS esperando_resposta,

  l.conta_detectada_em,
  l.pagamento_detectado_em,
  CASE WHEN l.conta_detectada_em IS NOT NULL AND k.primeira_in IS NOT NULL
       THEN ROUND(EXTRACT(EPOCH FROM (l.conta_detectada_em - k.primeira_in)) / 86400)::INT
  END                 AS dias_ate_conta,
  CASE WHEN l.pagamento_detectado_em IS NOT NULL AND k.primeira_in IS NOT NULL
       THEN ROUND(EXTRACT(EPOCH FROM (l.pagamento_detectado_em - k.primeira_in)) / 86400)::INT
  END                 AS dias_ate_pagante
FROM mensalli_leads l
JOIN marcos k   ON k.lead_id = l.id
JOIN resposta r ON r.lead_id = l.id
WHERE l.ignorado = FALSE;

ALTER VIEW vw_mensalli_lead_metricas SET (security_invoker = true);

-- ==========================================
-- 2. FUNIL AGREGADO
-- ==========================================
-- Uma linha por status. `mediana_min_resposta` usa mediana e nao media de
-- proposito: uma conversa esquecida por tres dias distorce a media inteira e
-- some com o sinal dos atendimentos rapidos.
CREATE OR REPLACE VIEW vw_mensalli_funil AS
SELECT
  status,
  COUNT(*)                                                        AS leads,
  COUNT(*) FILTER (WHERE esperando_resposta)                       AS esperando_resposta,
  COUNT(*) FILTER (WHERE NOT foi_respondido)                       AS nunca_respondidos,
  COUNT(*) FILTER (WHERE dias_parado >= 7)                         AS parados_7d_mais,
  ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (
    ORDER BY minutos_primeira_resposta)::NUMERIC, 1)               AS mediana_min_resposta,
  ROUND(AVG(alunos)::NUMERIC, 1)                                   AS media_alunos,
  MAX(ultima_in)                                                   AS ultima_mensagem_recebida
FROM vw_mensalli_lead_metricas
GROUP BY status;

ALTER VIEW vw_mensalli_funil SET (security_invoker = true);

-- ==========================================
-- 3. SERIE SEMANAL
-- ==========================================
-- Coorte pela semana em que o lead falou a primeira vez. Le assim: "dos leads
-- que chegaram nesta semana, quantos foram respondidos, quantos criaram conta
-- e quantos pagaram" — que e a unica leitura que mostra se o atendimento
-- melhorou ou se so entrou mais gente.
CREATE OR REPLACE VIEW vw_mensalli_funil_semana AS
SELECT
  DATE_TRUNC('week', primeira_in)::DATE                            AS semana,
  COUNT(*)                                                         AS chegaram,
  COUNT(*) FILTER (WHERE foi_respondido)                           AS respondidos,
  COUNT(*) FILTER (WHERE conta_detectada_em IS NOT NULL)           AS criaram_conta,
  COUNT(*) FILTER (WHERE pagamento_detectado_em IS NOT NULL)       AS viraram_pagante,
  ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (
    ORDER BY minutos_primeira_resposta)::NUMERIC, 1)               AS mediana_min_resposta,
  ROUND(
    100.0 * COUNT(*) FILTER (WHERE pagamento_detectado_em IS NOT NULL)
    / NULLIF(COUNT(*), 0), 1)                                      AS pct_pagante
FROM vw_mensalli_lead_metricas
WHERE primeira_in IS NOT NULL
GROUP BY 1
ORDER BY 1 DESC;

ALTER VIEW vw_mensalli_funil_semana SET (security_invoker = true);
