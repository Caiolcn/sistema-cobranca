-- ============================================================
-- FIX: Views com data exata + View de mensagens nao enviadas
-- MensalliZap - Sistema de Cobranca Automatizada
-- ============================================================
-- Views de envio mantem data EXATA (sem reenvio automatico)
-- Nova view vw_mensagens_nao_enviadas: mostra o que falhou
-- para o usuario decidir se quer reenviar manualmente ou nao
-- ============================================================

-- ============================================================
-- 1. DROPAR VIEWS EXISTENTES
-- ============================================================
DROP VIEW IF EXISTS vw_parcelas_lembrete_3dias;
DROP VIEW IF EXISTS vw_parcelas_no_dia;
DROP VIEW IF EXISTS vw_parcelas_em_atraso;
DROP VIEW IF EXISTS vw_mensagens_nao_enviadas;

-- ============================================================
-- 2. VIEW: Parcelas para lembrete 3 dias ANTES (data exata)
-- ============================================================
CREATE VIEW vw_parcelas_lembrete_3dias AS
SELECT
  m.id as parcela_id,
  m.devedor_id,
  m.valor as valor_em_aberto,
  m.data_vencimento,
  m.descricao,
  m.total_envios,
  3 as dias_restantes,
  d.nome as nome_cliente,
  d.telefone,
  d.user_id,
  u.plano,
  mz.instance_name as evolution_instance_name,
  (SELECT valor FROM config WHERE chave = 'evolution_api_key' LIMIT 1) as evolution_api_key,
  (SELECT valor FROM config WHERE chave = 'evolution_api_url' LIMIT 1) as evolution_api_url,
  u.chave_pix,
  u.nome_empresa,
  cp.usage_count,
  cp.limite_mensal,
  COALESCE(t.mensagem, '') as template_mensagem
FROM mensalidades m
INNER JOIN devedores d ON m.devedor_id = d.id
INNER JOIN usuarios u ON d.user_id = u.id
INNER JOIN mensallizap mz ON mz.user_id = d.user_id AND mz.conectado = true
INNER JOIN configuracoes_cobranca cc ON cc.user_id = d.user_id AND cc.enviar_3_dias_antes = true
LEFT JOIN controle_planos cp ON cp.user_id = d.user_id
LEFT JOIN templates t ON t.user_id = d.user_id AND t.tipo = 'pre_due_3days' AND t.ativo = true
WHERE m.status = 'pendente'
  AND m.enviado_3dias = false
  AND m.data_vencimento = CURRENT_DATE + INTERVAL '3 days'
  AND d.assinatura_ativa = true
  AND (d.lixo IS NULL OR d.lixo = false)
  AND (cp.usage_count < cp.limite_mensal OR cp.limite_mensal IS NULL);

-- ============================================================
-- 3. VIEW: Parcelas para lembrete NO DIA (data exata)
-- ============================================================
CREATE VIEW vw_parcelas_no_dia AS
SELECT
  m.id as parcela_id,
  m.devedor_id,
  m.valor as valor_em_aberto,
  m.data_vencimento,
  m.descricao,
  m.total_envios,
  0 as dias_restantes,
  d.nome as nome_cliente,
  d.telefone,
  d.user_id,
  u.plano,
  mz.instance_name as evolution_instance_name,
  (SELECT valor FROM config WHERE chave = 'evolution_api_key' LIMIT 1) as evolution_api_key,
  (SELECT valor FROM config WHERE chave = 'evolution_api_url' LIMIT 1) as evolution_api_url,
  u.chave_pix,
  u.nome_empresa,
  cp.usage_count,
  cp.limite_mensal,
  COALESCE(t.mensagem, '') as template_mensagem
FROM mensalidades m
INNER JOIN devedores d ON m.devedor_id = d.id
INNER JOIN usuarios u ON d.user_id = u.id
INNER JOIN mensallizap mz ON mz.user_id = d.user_id AND mz.conectado = true
INNER JOIN configuracoes_cobranca cc ON cc.user_id = d.user_id AND cc.enviar_no_dia = true
LEFT JOIN controle_planos cp ON cp.user_id = d.user_id
LEFT JOIN templates t ON t.user_id = d.user_id AND t.tipo = 'due_day' AND t.ativo = true
WHERE m.status = 'pendente'
  AND m.enviado_no_dia = false
  AND m.data_vencimento = CURRENT_DATE
  AND d.assinatura_ativa = true
  AND (d.lixo IS NULL OR d.lixo = false)
  AND (cp.usage_count < cp.limite_mensal OR cp.limite_mensal IS NULL);

-- ============================================================
-- 4. VIEW: Parcelas em ATRASO - 3 dias DEPOIS (data exata)
-- ============================================================
CREATE VIEW vw_parcelas_em_atraso AS
SELECT
  m.id as parcela_id,
  m.devedor_id,
  m.valor as valor_em_aberto,
  m.data_vencimento,
  m.descricao,
  m.total_envios,
  3 as dias_atraso,
  d.nome as nome_cliente,
  d.telefone,
  d.user_id,
  u.plano,
  mz.instance_name as evolution_instance_name,
  (SELECT valor FROM config WHERE chave = 'evolution_api_key' LIMIT 1) as evolution_api_key,
  (SELECT valor FROM config WHERE chave = 'evolution_api_url' LIMIT 1) as evolution_api_url,
  u.chave_pix,
  u.nome_empresa,
  cp.usage_count,
  cp.limite_mensal,
  COALESCE(t.mensagem, '') as template_mensagem
FROM mensalidades m
INNER JOIN devedores d ON m.devedor_id = d.id
INNER JOIN usuarios u ON d.user_id = u.id
INNER JOIN mensallizap mz ON mz.user_id = d.user_id AND mz.conectado = true
INNER JOIN configuracoes_cobranca cc ON cc.user_id = d.user_id AND cc.enviar_3_dias_depois = true
LEFT JOIN controle_planos cp ON cp.user_id = d.user_id
LEFT JOIN templates t ON t.user_id = d.user_id AND t.tipo = 'overdue' AND t.ativo = true
WHERE m.status = 'pendente'
  AND m.enviado_vencimento = false
  AND m.data_vencimento = CURRENT_DATE - INTERVAL '3 days'
  AND d.assinatura_ativa = true
  AND (d.lixo IS NULL OR d.lixo = false)
  AND (cp.usage_count < cp.limite_mensal OR cp.limite_mensal IS NULL);

-- ============================================================
-- 5. NOVA VIEW: Mensagens que deveriam ter sido enviadas mas NAO foram
-- Mostra mensagens pendentes dos ultimos 30 dias que ja passaram da data
-- O usuario vê isso e decide se quer reenviar manualmente
-- ============================================================
CREATE VIEW vw_mensagens_nao_enviadas AS
SELECT
  m.id as mensalidade_id,
  m.devedor_id,
  d.nome as nome_cliente,
  d.telefone,
  m.valor,
  m.data_vencimento,
  d.user_id,
  u.nome_empresa,
  -- Qual tipo de mensagem falhou
  CASE
    WHEN m.enviado_3dias = false AND m.data_vencimento < CURRENT_DATE + INTERVAL '3 days'
      AND EXISTS (SELECT 1 FROM configuracoes_cobranca cc WHERE cc.user_id = d.user_id AND cc.enviar_3_dias_antes = true)
      THEN 'pre_due_3days'
    WHEN m.enviado_no_dia = false AND m.data_vencimento < CURRENT_DATE
      AND EXISTS (SELECT 1 FROM configuracoes_cobranca cc WHERE cc.user_id = d.user_id AND cc.enviar_no_dia = true)
      THEN 'due_day'
    WHEN m.enviado_vencimento = false AND m.data_vencimento < CURRENT_DATE - INTERVAL '3 days'
      AND EXISTS (SELECT 1 FROM configuracoes_cobranca cc WHERE cc.user_id = d.user_id AND cc.enviar_3_dias_depois = true)
      THEN 'overdue'
    ELSE NULL
  END as tipo_mensagem_pendente,
  -- Descricao legivel
  CASE
    WHEN m.enviado_3dias = false AND m.data_vencimento < CURRENT_DATE + INTERVAL '3 days'
      AND EXISTS (SELECT 1 FROM configuracoes_cobranca cc WHERE cc.user_id = d.user_id AND cc.enviar_3_dias_antes = true)
      THEN 'Lembrete 3 dias antes nao enviado'
    WHEN m.enviado_no_dia = false AND m.data_vencimento < CURRENT_DATE
      AND EXISTS (SELECT 1 FROM configuracoes_cobranca cc WHERE cc.user_id = d.user_id AND cc.enviar_no_dia = true)
      THEN 'Lembrete no dia nao enviado'
    WHEN m.enviado_vencimento = false AND m.data_vencimento < CURRENT_DATE - INTERVAL '3 days'
      AND EXISTS (SELECT 1 FROM configuracoes_cobranca cc WHERE cc.user_id = d.user_id AND cc.enviar_3_dias_depois = true)
      THEN 'Cobranca 3 dias depois nao enviada'
    ELSE NULL
  END as descricao_pendencia,
  -- Quantos dias atrasou o envio (alinhado com tipo_mensagem_pendente)
  CASE
    WHEN m.enviado_3dias = false AND m.data_vencimento < CURRENT_DATE + INTERVAL '3 days'
      AND EXISTS (SELECT 1 FROM configuracoes_cobranca cc WHERE cc.user_id = d.user_id AND cc.enviar_3_dias_antes = true)
      THEN (CURRENT_DATE - (m.data_vencimento::date - 3))
    WHEN m.enviado_no_dia = false AND m.data_vencimento < CURRENT_DATE
      AND EXISTS (SELECT 1 FROM configuracoes_cobranca cc WHERE cc.user_id = d.user_id AND cc.enviar_no_dia = true)
      THEN (CURRENT_DATE - m.data_vencimento::date)
    WHEN m.enviado_vencimento = false AND m.data_vencimento < CURRENT_DATE - INTERVAL '3 days'
      AND EXISTS (SELECT 1 FROM configuracoes_cobranca cc WHERE cc.user_id = d.user_id AND cc.enviar_3_dias_depois = true)
      THEN (CURRENT_DATE - (m.data_vencimento::date + 3))
    ELSE 0
  END as dias_desde_falha
FROM mensalidades m
INNER JOIN devedores d ON m.devedor_id = d.id
INNER JOIN usuarios u ON d.user_id = u.id
WHERE m.status = 'pendente'
  AND d.assinatura_ativa = true
  AND (d.lixo IS NULL OR d.lixo = false)
  AND m.data_vencimento >= CURRENT_DATE - INTERVAL '30 days'
  -- Pelo menos uma flag de envio esta pendente e ja passou da data
  AND (
    (m.enviado_3dias = false AND m.data_vencimento < CURRENT_DATE + INTERVAL '3 days'
      AND EXISTS (SELECT 1 FROM configuracoes_cobranca cc WHERE cc.user_id = d.user_id AND cc.enviar_3_dias_antes = true))
    OR
    (m.enviado_no_dia = false AND m.data_vencimento < CURRENT_DATE
      AND EXISTS (SELECT 1 FROM configuracoes_cobranca cc WHERE cc.user_id = d.user_id AND cc.enviar_no_dia = true))
    OR
    (m.enviado_vencimento = false AND m.data_vencimento < CURRENT_DATE - INTERVAL '3 days'
      AND EXISTS (SELECT 1 FROM configuracoes_cobranca cc WHERE cc.user_id = d.user_id AND cc.enviar_3_dias_depois = true))
  )
ORDER BY m.data_vencimento DESC, d.nome;

-- ============================================================
-- 6. Habilitar Security Invoker
-- ============================================================
ALTER VIEW vw_parcelas_lembrete_3dias SET (security_invoker = true);
ALTER VIEW vw_parcelas_no_dia SET (security_invoker = true);
ALTER VIEW vw_parcelas_em_atraso SET (security_invoker = true);
ALTER VIEW vw_mensagens_nao_enviadas SET (security_invoker = true);

-- ============================================================
-- 7. Verificacao
-- ============================================================
SELECT 'vw_parcelas_lembrete_3dias' as view_name, COUNT(*) as registros FROM vw_parcelas_lembrete_3dias
UNION ALL
SELECT 'vw_parcelas_no_dia', COUNT(*) FROM vw_parcelas_no_dia
UNION ALL
SELECT 'vw_parcelas_em_atraso', COUNT(*) FROM vw_parcelas_em_atraso
UNION ALL
SELECT 'vw_mensagens_nao_enviadas', COUNT(*) FROM vw_mensagens_nao_enviadas;

-- ============================================================
-- 8. Preview: mensagens que falharam (deve mostrar as de 15/02)
-- ============================================================
SELECT
  nome_cliente,
  telefone,
  valor,
  data_vencimento,
  tipo_mensagem_pendente,
  descricao_pendencia,
  dias_desde_falha
FROM vw_mensagens_nao_enviadas
ORDER BY data_vencimento DESC, nome_cliente;
