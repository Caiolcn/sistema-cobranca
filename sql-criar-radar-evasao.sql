-- ============================================================
-- RADAR DE EVASÃO — Score de risco de cancelamento (0–100)
-- ============================================================
-- Combina 5 sinais: frequência cadente, dias sem aparecer,
-- atraso financeiro, NPS baixo e tempo de casa.
-- Premium only.
-- ============================================================

-- ==========================================
-- 1. VIEW DE SCORE DE RISCO
-- ==========================================
DROP VIEW IF EXISTS vw_radar_evasao;

CREATE VIEW vw_radar_evasao AS
WITH presenca_recente AS (
  SELECT
    p.devedor_id,
    MAX(p.data) AS ultima_presenca,
    (CURRENT_DATE - MAX(p.data))::INT AS dias_sem_aparecer,
    COUNT(*) FILTER (WHERE p.data >= CURRENT_DATE - 14 AND p.presente = true) AS presencas_14d,
    COUNT(*) FILTER (WHERE p.data >= CURRENT_DATE - 28 AND p.data < CURRENT_DATE - 14 AND p.presente = true) AS presencas_14d_anterior
  FROM presencas p
  WHERE p.presente = true
  GROUP BY p.devedor_id
),
mensalidade_atraso AS (
  SELECT
    m.devedor_id,
    MAX(
      CASE
        WHEN m.status IN ('pendente', 'atrasado') AND m.data_vencimento < CURRENT_DATE
        THEN (CURRENT_DATE - m.data_vencimento)::INT
        ELSE 0
      END
    ) AS dias_atraso
  FROM mensalidades m
  GROUP BY m.devedor_id
),
nps_ultimo AS (
  SELECT DISTINCT ON (nr.devedor_id)
    nr.devedor_id,
    nr.nota
  FROM nps_respostas nr
  WHERE nr.nota IS NOT NULL
  ORDER BY nr.devedor_id, nr.respondido_em DESC
)
SELECT
  d.id AS devedor_id,
  d.user_id,
  d.nome,
  d.telefone,
  d.created_at AS data_cadastro,
  pr.ultima_presenca,
  COALESCE(pr.dias_sem_aparecer, 999) AS dias_sem_aparecer,
  COALESCE(pr.presencas_14d, 0) AS presencas_14d,
  COALESCE(pr.presencas_14d_anterior, 0) AS presencas_14d_anterior,
  COALESCE(ma.dias_atraso, 0) AS dias_atraso,
  nu.nota AS nps_nota,
  d.recuperacao_status,

  -- Score de frequencia cadente (0-35 pts)
  CASE
    WHEN pr.presencas_14d_anterior > 0 AND COALESCE(pr.presencas_14d, 0) = 0 THEN 35
    WHEN pr.presencas_14d_anterior > 0 AND pr.presencas_14d::float / pr.presencas_14d_anterior < 0.5 THEN 25
    WHEN pr.presencas_14d_anterior > 0 AND pr.presencas_14d::float / pr.presencas_14d_anterior < 0.75 THEN 15
    ELSE 0
  END AS score_frequencia,

  -- Score de dias sem aparecer (0-25 pts)
  CASE
    WHEN COALESCE(pr.dias_sem_aparecer, 999) > 30 THEN 25
    WHEN pr.dias_sem_aparecer > 21 THEN 22
    WHEN pr.dias_sem_aparecer > 14 THEN 18
    WHEN pr.dias_sem_aparecer > 7 THEN 10
    ELSE 0
  END AS score_ausencia,

  -- Score de atraso financeiro (0-20 pts)
  CASE
    WHEN COALESCE(ma.dias_atraso, 0) > 15 THEN 20
    WHEN ma.dias_atraso > 7 THEN 15
    WHEN ma.dias_atraso > 0 THEN 10
    ELSE 0
  END AS score_atraso,

  -- Score de NPS (0-10 pts)
  CASE
    WHEN nu.nota IS NULL THEN 5
    WHEN nu.nota <= 4 THEN 10
    WHEN nu.nota <= 6 THEN 7
    WHEN nu.nota = 7 THEN 3
    ELSE 0
  END AS score_nps,

  -- Score de tempo de casa (0-10 pts)
  CASE
    WHEN d.created_at > CURRENT_DATE - INTERVAL '3 months' THEN 10
    WHEN d.created_at > CURRENT_DATE - INTERVAL '6 months' THEN 6
    WHEN d.created_at > CURRENT_DATE - INTERVAL '12 months' THEN 3
    ELSE 0
  END AS score_tempo,

  -- SCORE TOTAL (0-100)
  (
    CASE WHEN pr.presencas_14d_anterior > 0 AND COALESCE(pr.presencas_14d, 0) = 0 THEN 35
         WHEN pr.presencas_14d_anterior > 0 AND pr.presencas_14d::float / pr.presencas_14d_anterior < 0.5 THEN 25
         WHEN pr.presencas_14d_anterior > 0 AND pr.presencas_14d::float / pr.presencas_14d_anterior < 0.75 THEN 15
         ELSE 0 END
    + CASE WHEN COALESCE(pr.dias_sem_aparecer, 999) > 30 THEN 25
           WHEN pr.dias_sem_aparecer > 21 THEN 22
           WHEN pr.dias_sem_aparecer > 14 THEN 18
           WHEN pr.dias_sem_aparecer > 7 THEN 10
           ELSE 0 END
    + CASE WHEN COALESCE(ma.dias_atraso, 0) > 15 THEN 20
           WHEN ma.dias_atraso > 7 THEN 15
           WHEN ma.dias_atraso > 0 THEN 10
           ELSE 0 END
    + CASE WHEN nu.nota IS NULL THEN 5
           WHEN nu.nota <= 4 THEN 10
           WHEN nu.nota <= 6 THEN 7
           WHEN nu.nota = 7 THEN 3
           ELSE 0 END
    + CASE WHEN d.created_at > CURRENT_DATE - INTERVAL '3 months' THEN 10
           WHEN d.created_at > CURRENT_DATE - INTERVAL '6 months' THEN 6
           WHEN d.created_at > CURRENT_DATE - INTERVAL '12 months' THEN 3
           ELSE 0 END
  ) AS score_total

FROM devedores d
LEFT JOIN presenca_recente pr ON pr.devedor_id = d.id
LEFT JOIN mensalidade_atraso ma ON ma.devedor_id = d.id
LEFT JOIN nps_ultimo nu ON nu.devedor_id = d.id
WHERE d.assinatura_ativa = true
  AND (d.lixo IS NULL OR d.lixo = false)
  AND (d.bloquear_mensagens IS NULL OR d.bloquear_mensagens = false);

-- ==========================================
-- 2. VERIFICACAO
-- ==========================================
-- Testa o resultado (troque pelo seu user_id real)
-- SELECT nome, score_total, score_frequencia, score_ausencia, score_atraso, score_nps, score_tempo,
--        dias_sem_aparecer, dias_atraso, nps_nota
-- FROM vw_radar_evasao
-- WHERE user_id = 'SEU_USER_ID'
-- ORDER BY score_total DESC
-- LIMIT 20;
