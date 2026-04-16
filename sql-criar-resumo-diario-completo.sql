-- ============================================================
-- RESUMO DIÁRIO COMPLETO — Dashboard do Dono no WhatsApp
-- ============================================================
-- Agrega tudo que o dono precisa saber num unico SELECT por user.
-- Usado pelo n8n pra montar a mensagem das 7h.
-- Premium: mensagem completa. Pro: reduzida. Starter: não envia.
-- ============================================================

DROP VIEW IF EXISTS vw_resumo_diario_completo;

CREATE VIEW vw_resumo_diario_completo AS
WITH
-- Datas de referência
datas AS (
  SELECT
    CURRENT_DATE AS hoje,
    CURRENT_DATE - 1 AS ontem,
    DATE_TRUNC('month', CURRENT_DATE)::date AS inicio_mes,
    (DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '1 month' - INTERVAL '1 day')::date AS fim_mes
),

-- ONTEM: check-ins
ontem_checkins AS (
  SELECT p.user_id, COUNT(*) AS total
  FROM presencas p, datas d
  WHERE p.data = d.ontem AND p.presente = true
  GROUP BY p.user_id
),

-- ONTEM: recebimentos (mensalidades pagas ontem)
ontem_recebidos AS (
  SELECT m.user_id,
    SUM(m.valor) AS total_valor,
    COUNT(*) AS total_count
  FROM mensalidades m, datas d
  WHERE m.status = 'pago'
    AND m.updated_at::date = d.ontem
  GROUP BY m.user_id
),

-- ONTEM: novas matrículas (devedores criados ontem com assinatura ativa)
ontem_matriculas AS (
  SELECT d.user_id,
    COUNT(*) AS total,
    STRING_AGG(d.nome, ', ' ORDER BY d.nome) AS nomes
  FROM devedores d, datas dt
  WHERE d.created_at::date = dt.ontem
    AND d.assinatura_ativa = true
    AND (d.lixo IS NULL OR d.lixo = false)
  GROUP BY d.user_id
),

-- ONTEM: leads novos
ontem_leads AS (
  SELECT l.user_id,
    COUNT(*) AS total
  FROM leads l, datas d
  WHERE l.created_at::date = d.ontem
  GROUP BY l.user_id
),

-- ONTEM: NPS recebidos
ontem_nps AS (
  SELECT nr.user_id,
    COUNT(*) AS total,
    ROUND(AVG(nr.nota), 1) AS media_nota,
    MIN(nr.nota) AS pior_nota
  FROM nps_respostas nr, datas d
  WHERE nr.respondido_em::date = d.ontem
    AND nr.nota IS NOT NULL
  GROUP BY nr.user_id
),

-- HOJE: aulas agendadas (com detalhe por aula em JSON)
hoje_aulas AS (
  SELECT a.user_id,
    COUNT(DISTINCT a.id) AS total_aulas,
    COALESCE(SUM(
      (SELECT COUNT(*) FROM agendamentos ag
       WHERE ag.aula_id = a.id AND ag.data = CURRENT_DATE AND ag.status = 'confirmado')
      + (SELECT COUNT(*) FROM aulas_fixos af
         WHERE af.aula_id = a.id AND (af.ativo IS NULL OR af.ativo = true))
    ), 0) AS total_alunos
  FROM aulas a
  WHERE a.ativo = true
    AND a.dia_semana = EXTRACT(DOW FROM CURRENT_DATE)
  GROUP BY a.user_id
),
hoje_aulas_detalhe AS (
  SELECT a.user_id,
    json_agg(json_build_object(
      'horario', a.horario,
      'descricao', a.descricao,
      'capacidade', a.capacidade,
      'nomes_fixos', COALESCE(
        (SELECT string_agg(d.nome, ', ' ORDER BY d.nome)
         FROM aulas_fixos af JOIN devedores d ON d.id = af.devedor_id
         WHERE af.aula_id = a.id AND (af.ativo IS NULL OR af.ativo = true)), ''),
      'total_fixos', COALESCE(
        (SELECT COUNT(*) FROM aulas_fixos af
         WHERE af.aula_id = a.id AND (af.ativo IS NULL OR af.ativo = true)), 0),
      'nomes_agendados', COALESCE(
        (SELECT string_agg(d.nome, ', ' ORDER BY d.nome)
         FROM agendamentos ag JOIN devedores d ON d.id = ag.devedor_id
         WHERE ag.aula_id = a.id AND ag.data = CURRENT_DATE AND ag.status = 'confirmado'), ''),
      'total_agendados', COALESCE(
        (SELECT COUNT(*) FROM agendamentos ag
         WHERE ag.aula_id = a.id AND ag.data = CURRENT_DATE AND ag.status = 'confirmado'), 0)
    ) ORDER BY a.horario) AS aulas_json
  FROM aulas a
  WHERE a.ativo = true
    AND a.dia_semana = EXTRACT(DOW FROM CURRENT_DATE)
  GROUP BY a.user_id
),

-- HOJE: aniversariantes
hoje_aniversariantes AS (
  SELECT d.user_id,
    COUNT(*) AS total,
    STRING_AGG(d.nome, ', ' ORDER BY d.nome) AS nomes
  FROM devedores d
  WHERE d.assinatura_ativa = true
    AND (d.lixo IS NULL OR d.lixo = false)
    AND d.data_nascimento IS NOT NULL
    AND EXTRACT(MONTH FROM d.data_nascimento) = EXTRACT(MONTH FROM CURRENT_DATE)
    AND EXTRACT(DAY FROM d.data_nascimento) = EXTRACT(DAY FROM CURRENT_DATE)
  GROUP BY d.user_id
),

-- HOJE: mensalidades que vencem hoje
hoje_vencimentos AS (
  SELECT m.user_id,
    COUNT(*) AS total,
    SUM(m.valor) AS valor_total
  FROM mensalidades m
  WHERE m.data_vencimento = CURRENT_DATE
    AND m.status IN ('pendente', 'atrasado')
  GROUP BY m.user_id
),

-- ATENÇÃO: inadimplentes (atrasados há mais de 1 dia)
atencao_atrasados AS (
  SELECT m.user_id,
    COUNT(DISTINCT m.devedor_id) AS total_alunos,
    SUM(m.valor) AS valor_total
  FROM mensalidades m
  WHERE m.status IN ('pendente', 'atrasado')
    AND m.data_vencimento < CURRENT_DATE
  GROUP BY m.user_id
),

-- ATENÇÃO: alunos em risco (score >= 50)
atencao_risco AS (
  SELECT r.user_id,
    COUNT(*) AS total
  FROM vw_radar_evasao r
  WHERE r.score_total >= 50
  GROUP BY r.user_id
),

-- ATENÇÃO: leads sem resposta há mais de 24h
atencao_leads AS (
  SELECT l.user_id,
    COUNT(*) AS total
  FROM leads l
  WHERE l.status IN ('novo', 'contatado')
    AND l.ultima_interacao < NOW() - INTERVAL '24 hours'
  GROUP BY l.user_id
),

-- MÊS: recebido total
mes_recebido AS (
  SELECT m.user_id,
    SUM(m.valor) AS total
  FROM mensalidades m, datas d
  WHERE m.status = 'pago'
    AND m.updated_at >= d.inicio_mes::timestamp
    AND m.updated_at < (d.fim_mes + 1)::timestamp
  GROUP BY m.user_id
),

-- MÊS: MRR (receita esperada)
mes_mrr AS (
  SELECT d.user_id,
    SUM(COALESCE(p.valor, 0)) AS mrr,
    COUNT(*) AS ativos
  FROM devedores d
  LEFT JOIN planos p ON p.id = d.plano_id
  WHERE d.assinatura_ativa = true
    AND (d.lixo IS NULL OR d.lixo = false)
  GROUP BY d.user_id
),

-- MÊS: novos alunos
mes_novos AS (
  SELECT d.user_id, COUNT(*) AS total
  FROM devedores d, datas dt
  WHERE d.created_at >= dt.inicio_mes::timestamp
    AND d.assinatura_ativa = true
    AND (d.lixo IS NULL OR d.lixo = false)
  GROUP BY d.user_id
),

-- MÊS: cancelamentos (alunos que desativaram assinatura neste mês)
mes_cancelamentos AS (
  SELECT d.user_id, COUNT(*) AS total
  FROM devedores d, datas dt
  WHERE d.assinatura_ativa = false
    AND d.updated_at >= dt.inicio_mes::timestamp
    AND (d.lixo IS NULL OR d.lixo = false)
  GROUP BY d.user_id
)

-- ==========================================
-- SELECT FINAL: 1 linha por usuário
-- ==========================================
SELECT
  u.id AS user_id,
  u.nome_empresa,
  u.telefone AS telefone_admin,
  u.plano,

  -- Ontem
  COALESCE(oc.total, 0) AS ontem_checkins,
  COALESCE(orec.total_valor, 0) AS ontem_recebido,
  COALESCE(orec.total_count, 0) AS ontem_pagamentos,
  COALESCE(om.total, 0) AS ontem_matriculas,
  COALESCE(om.nomes, '') AS ontem_matriculas_nomes,
  COALESCE(ol.total, 0) AS ontem_leads,
  COALESCE(on2.total, 0) AS ontem_nps_count,
  on2.media_nota AS ontem_nps_media,

  -- Hoje
  COALESCE(ha.total_aulas, 0) AS hoje_aulas,
  COALESCE(ha.total_alunos, 0) AS hoje_alunos_confirmados,
  had.aulas_json AS hoje_aulas_detalhe,
  COALESCE(han.total, 0) AS hoje_aniversariantes,
  COALESCE(han.nomes, '') AS hoje_aniversariantes_nomes,
  COALESCE(hv.total, 0) AS hoje_vencimentos,
  COALESCE(hv.valor_total, 0) AS hoje_vencimentos_valor,

  -- Atenção
  COALESCE(aa.total_alunos, 0) AS atencao_atrasados,
  COALESCE(aa.valor_total, 0) AS atencao_atrasados_valor,
  COALESCE(ar.total, 0) AS atencao_risco_evasao,
  COALESCE(al.total, 0) AS atencao_leads_sem_resposta,

  -- Mês
  COALESCE(mr.total, 0) AS mes_recebido,
  COALESCE(mm.mrr, 0) AS mes_mrr,
  COALESCE(mm.ativos, 0) AS mes_ativos,
  COALESCE(mn.total, 0) AS mes_novos,
  COALESCE(mc.total, 0) AS mes_cancelamentos,
  CASE WHEN COALESCE(mm.mrr, 0) > 0
    THEN ROUND((COALESCE(mr.total, 0) / mm.mrr * 100)::numeric, 0)
    ELSE 0
  END AS mes_percentual_meta,

  -- Evolution (pra enviar a mensagem)
  mz.instance_name AS evolution_instance_name,
  (SELECT valor FROM config WHERE chave = 'evolution_api_key' LIMIT 1) AS evolution_api_key,
  (SELECT valor FROM config WHERE chave = 'evolution_api_url' LIMIT 1) AS evolution_api_url

FROM usuarios u
JOIN configuracoes_cobranca cc ON cc.user_id = u.id AND cc.enviar_resumo_diario = true
JOIN mensallizap mz ON mz.user_id = u.id AND mz.conectado = true
LEFT JOIN ontem_checkins oc ON oc.user_id = u.id
LEFT JOIN ontem_recebidos orec ON orec.user_id = u.id
LEFT JOIN ontem_matriculas om ON om.user_id = u.id
LEFT JOIN ontem_leads ol ON ol.user_id = u.id
LEFT JOIN ontem_nps on2 ON on2.user_id = u.id
LEFT JOIN hoje_aulas ha ON ha.user_id = u.id
LEFT JOIN hoje_aulas_detalhe had ON had.user_id = u.id
LEFT JOIN hoje_aniversariantes han ON han.user_id = u.id
LEFT JOIN hoje_vencimentos hv ON hv.user_id = u.id
LEFT JOIN atencao_atrasados aa ON aa.user_id = u.id
LEFT JOIN atencao_risco ar ON ar.user_id = u.id
LEFT JOIN atencao_leads al ON al.user_id = u.id
LEFT JOIN mes_recebido mr ON mr.user_id = u.id
LEFT JOIN mes_mrr mm ON mm.user_id = u.id
LEFT JOIN mes_novos mn ON mn.user_id = u.id
LEFT JOIN mes_cancelamentos mc ON mc.user_id = u.id
WHERE u.plano IN ('pro', 'premium')
  AND (u.plano_pago = true OR u.trial_ativo = true);

-- ==========================================
-- VERIFICAÇÃO
-- ==========================================
-- SELECT * FROM vw_resumo_diario_completo LIMIT 5;
