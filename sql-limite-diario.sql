-- =====================================================
-- LIMITE DIÁRIO DE MENSAGENS POR USUÁRIO
-- Máximo de 20 mensagens/dia. Excedentes vão pro dia seguinte.
-- Buffer de 1 dia nas datas para capturar overflow.
-- =====================================================

-- 1. Adicionar coluna limite_diario_mensagens
ALTER TABLE configuracoes_cobranca
ADD COLUMN IF NOT EXISTS limite_diario_mensagens INTEGER DEFAULT 20;

COMMENT ON COLUMN configuracoes_cobranca.limite_diario_mensagens IS
'Limite máximo de mensagens enviadas por dia. Excedentes são enviados no dia seguinte.';

-- =====================================================
-- 2. Recriar views com limite diário + buffer de 1 dia
-- =====================================================

-- VIEW 1: Parcelas com vencimento em 3 DIAS (lembrete)
-- Buffer: inclui +2 dias para capturar overflow do dia anterior
DROP VIEW IF EXISTS vw_parcelas_3dias_antes;
CREATE VIEW vw_parcelas_3dias_antes AS
WITH envios_hoje AS (
  SELECT user_id, COUNT(*) as total
  FROM logs_mensagens
  WHERE status = 'enviado'
  AND enviado_em >= CURRENT_DATE
  GROUP BY user_id
),
base AS (
  SELECT
    m.id as parcela_id,
    m.valor as valor_em_aberto,
    m.data_vencimento,
    m.status,
    m.enviado_3dias,
    m.total_envios,
    d.id as devedor_id,
    d.nome as nome_cliente,
    d.telefone,
    d.user_id,
    u.nome_empresa,
    u.chave_pix,
    COALESCE(t.mensagem, '') as template_mensagem,
    mz.instance_name as evolution_instance_name,
    (SELECT valor FROM config WHERE chave = 'evolution_api_key' LIMIT 1) as evolution_api_key,
    (SELECT valor FROM config WHERE chave = 'evolution_api_url' LIMIT 1) as evolution_api_url,
    ROW_NUMBER() OVER (PARTITION BY d.user_id ORDER BY m.data_vencimento) as rn,
    COALESCE(eh.total, 0) as enviados_hoje,
    COALESCE(c.limite_diario_mensagens, 20) as limite
  FROM mensalidades m
  JOIN devedores d ON m.devedor_id = d.id
  JOIN usuarios u ON d.user_id = u.id
  JOIN configuracoes_cobranca c ON c.user_id = d.user_id
  LEFT JOIN mensallizap mz ON mz.user_id = d.user_id
  LEFT JOIN templates t ON t.user_id = d.user_id AND t.tipo = 'pre_due_3days' AND t.ativo = true
  LEFT JOIN envios_hoje eh ON eh.user_id = d.user_id
  WHERE m.data_vencimento BETWEEN CURRENT_DATE + INTERVAL '2 days' AND CURRENT_DATE + INTERVAL '3 days'
    AND m.status != 'pago'
    AND (m.enviado_3dias IS NULL OR m.enviado_3dias = false)
    AND c.enviar_3_dias_antes = true
    AND NOT (EXTRACT(DOW FROM CURRENT_DATE) = 0 AND c.enviar_domingo = false)
    AND mz.conectado = true
)
SELECT parcela_id, valor_em_aberto, data_vencimento, status, enviado_3dias, total_envios,
       devedor_id, nome_cliente, telefone, user_id, nome_empresa, chave_pix,
       template_mensagem, evolution_instance_name, evolution_api_key, evolution_api_url
FROM base
WHERE enviados_hoje < limite
AND rn <= (limite - enviados_hoje);

-- VIEW 2: Parcelas com vencimento HOJE
-- Buffer: inclui ontem para capturar overflow do dia anterior
DROP VIEW IF EXISTS vw_parcelas_no_dia;
CREATE VIEW vw_parcelas_no_dia AS
WITH envios_hoje AS (
  SELECT user_id, COUNT(*) as total
  FROM logs_mensagens
  WHERE status = 'enviado'
  AND enviado_em >= CURRENT_DATE
  GROUP BY user_id
),
base AS (
  SELECT
    m.id as parcela_id,
    m.valor as valor_em_aberto,
    m.data_vencimento,
    m.status,
    m.enviado_no_dia,
    m.total_envios,
    d.id as devedor_id,
    d.nome as nome_cliente,
    d.telefone,
    d.user_id,
    u.nome_empresa,
    u.chave_pix,
    COALESCE(t.mensagem, '') as template_mensagem,
    mz.instance_name as evolution_instance_name,
    (SELECT valor FROM config WHERE chave = 'evolution_api_key' LIMIT 1) as evolution_api_key,
    (SELECT valor FROM config WHERE chave = 'evolution_api_url' LIMIT 1) as evolution_api_url,
    ROW_NUMBER() OVER (PARTITION BY d.user_id ORDER BY m.data_vencimento) as rn,
    COALESCE(eh.total, 0) as enviados_hoje,
    COALESCE(c.limite_diario_mensagens, 20) as limite
  FROM mensalidades m
  JOIN devedores d ON m.devedor_id = d.id
  JOIN usuarios u ON d.user_id = u.id
  JOIN configuracoes_cobranca c ON c.user_id = d.user_id
  LEFT JOIN mensallizap mz ON mz.user_id = d.user_id
  LEFT JOIN templates t ON t.user_id = d.user_id AND t.tipo = 'due_day' AND t.ativo = true
  LEFT JOIN envios_hoje eh ON eh.user_id = d.user_id
  WHERE m.data_vencimento BETWEEN CURRENT_DATE - INTERVAL '1 day' AND CURRENT_DATE
    AND m.status != 'pago'
    AND (m.enviado_no_dia IS NULL OR m.enviado_no_dia = false)
    AND c.enviar_no_dia = true
    AND NOT (EXTRACT(DOW FROM CURRENT_DATE) = 0 AND c.enviar_domingo = false)
    AND mz.conectado = true
)
SELECT parcela_id, valor_em_aberto, data_vencimento, status, enviado_no_dia, total_envios,
       devedor_id, nome_cliente, telefone, user_id, nome_empresa, chave_pix,
       template_mensagem, evolution_instance_name, evolution_api_key, evolution_api_url
FROM base
WHERE enviados_hoje < limite
AND rn <= (limite - enviados_hoje);

-- VIEW 3: Parcelas com 3 DIAS DE ATRASO (cobrança)
-- Buffer: inclui -4 dias para capturar overflow do dia anterior
DROP VIEW IF EXISTS vw_parcelas_3dias_depois;
CREATE VIEW vw_parcelas_3dias_depois AS
WITH envios_hoje AS (
  SELECT user_id, COUNT(*) as total
  FROM logs_mensagens
  WHERE status = 'enviado'
  AND enviado_em >= CURRENT_DATE
  GROUP BY user_id
),
base AS (
  SELECT
    m.id as parcela_id,
    m.valor as valor_em_aberto,
    m.data_vencimento,
    m.status,
    m.enviado_3dias_depois,
    m.total_envios,
    3 as dias_atraso,
    d.id as devedor_id,
    d.nome as nome_cliente,
    d.telefone,
    d.user_id,
    u.nome_empresa,
    u.chave_pix,
    COALESCE(t.mensagem, '') as template_mensagem,
    mz.instance_name as evolution_instance_name,
    (SELECT valor FROM config WHERE chave = 'evolution_api_key' LIMIT 1) as evolution_api_key,
    (SELECT valor FROM config WHERE chave = 'evolution_api_url' LIMIT 1) as evolution_api_url,
    ROW_NUMBER() OVER (PARTITION BY d.user_id ORDER BY m.data_vencimento) as rn,
    COALESCE(eh.total, 0) as enviados_hoje,
    COALESCE(c.limite_diario_mensagens, 20) as limite
  FROM mensalidades m
  JOIN devedores d ON m.devedor_id = d.id
  JOIN usuarios u ON d.user_id = u.id
  JOIN configuracoes_cobranca c ON c.user_id = d.user_id
  LEFT JOIN mensallizap mz ON mz.user_id = d.user_id
  LEFT JOIN templates t ON t.user_id = d.user_id AND t.tipo = 'overdue' AND t.ativo = true
  LEFT JOIN envios_hoje eh ON eh.user_id = d.user_id
  WHERE m.data_vencimento BETWEEN CURRENT_DATE - INTERVAL '4 days' AND CURRENT_DATE - INTERVAL '3 days'
    AND m.status != 'pago'
    AND (m.enviado_3dias_depois IS NULL OR m.enviado_3dias_depois = false)
    AND c.enviar_3_dias_depois = true
    AND NOT (EXTRACT(DOW FROM CURRENT_DATE) = 0 AND c.enviar_domingo = false)
    AND mz.conectado = true
)
SELECT parcela_id, valor_em_aberto, data_vencimento, status, enviado_3dias_depois, total_envios,
       dias_atraso, devedor_id, nome_cliente, telefone, user_id, nome_empresa, chave_pix,
       template_mensagem, evolution_instance_name, evolution_api_key, evolution_api_url
FROM base
WHERE enviados_hoje < limite
AND rn <= (limite - enviados_hoje);

-- VIEW 4: Aniversariantes do dia
-- Buffer: inclui ontem para capturar overflow do dia anterior
DROP VIEW IF EXISTS vw_aniversariantes_do_dia;
CREATE VIEW vw_aniversariantes_do_dia AS
WITH envios_hoje AS (
  SELECT user_id, COUNT(*) as total
  FROM logs_mensagens
  WHERE status = 'enviado'
  AND enviado_em >= CURRENT_DATE
  GROUP BY user_id
)
SELECT
  d.id as devedor_id,
  d.nome as nome_cliente,
  d.telefone,
  d.user_id,
  d.data_nascimento,
  u.plano,
  u.nome_empresa,
  mz.instance_name as evolution_instance_name,
  (SELECT valor FROM config WHERE chave = 'evolution_api_key' LIMIT 1) as evolution_api_key,
  (SELECT valor FROM config WHERE chave = 'evolution_api_url' LIMIT 1) as evolution_api_url,
  cp.usage_count,
  cp.limite_mensal,
  COALESCE(t.mensagem, '') as template_mensagem
FROM devedores d
INNER JOIN usuarios u ON d.user_id = u.id
INNER JOIN mensallizap mz ON mz.user_id = d.user_id AND mz.conectado = true
INNER JOIN configuracoes_cobranca cc ON cc.user_id = d.user_id AND cc.enviar_aniversario = true
LEFT JOIN controle_planos cp ON cp.user_id = d.user_id
LEFT JOIN templates t ON t.user_id = d.user_id AND t.tipo = 'birthday' AND t.ativo = true
LEFT JOIN envios_hoje eh ON eh.user_id = d.user_id
WHERE d.data_nascimento IS NOT NULL
  AND (
    -- Aniversário hoje
    (EXTRACT(MONTH FROM d.data_nascimento) = EXTRACT(MONTH FROM CURRENT_DATE)
     AND EXTRACT(DAY FROM d.data_nascimento) = EXTRACT(DAY FROM CURRENT_DATE))
    OR
    -- Buffer: aniversário ontem (overflow do dia anterior)
    (EXTRACT(MONTH FROM d.data_nascimento) = EXTRACT(MONTH FROM CURRENT_DATE - INTERVAL '1 day')
     AND EXTRACT(DAY FROM d.data_nascimento) = EXTRACT(DAY FROM CURRENT_DATE - INTERVAL '1 day'))
  )
  AND (d.enviado_aniversario_em IS NULL OR EXTRACT(YEAR FROM d.enviado_aniversario_em) < EXTRACT(YEAR FROM CURRENT_DATE))
  AND (d.lixo IS NULL OR d.lixo = false)
  AND (cp.usage_count < cp.limite_mensal OR cp.limite_mensal IS NULL)
  -- Domingo: excluir se não envia domingo
  AND NOT (EXTRACT(DOW FROM CURRENT_DATE) = 0 AND cc.enviar_domingo = false)
  -- Limite diário
  AND COALESCE(eh.total, 0) < COALESCE(cc.limite_diario_mensagens, 20);

-- =====================================================
-- GRANT PERMISSIONS
-- =====================================================
GRANT SELECT ON vw_parcelas_3dias_antes TO anon, authenticated, service_role;
GRANT SELECT ON vw_parcelas_no_dia TO anon, authenticated, service_role;
GRANT SELECT ON vw_parcelas_3dias_depois TO anon, authenticated, service_role;
GRANT SELECT ON vw_aniversariantes_do_dia TO anon, authenticated, service_role;
