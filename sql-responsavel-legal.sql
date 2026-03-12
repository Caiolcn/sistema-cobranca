-- =====================================================
-- RESPONSÁVEL LEGAL DO ALUNO
-- Adiciona campos de responsável legal no cadastro do aluno.
-- Quando preenchido, mensagens são enviadas pro responsável.
-- =====================================================

-- 1. Adicionar colunas na tabela devedores
ALTER TABLE devedores
ADD COLUMN IF NOT EXISTS email TEXT,
ADD COLUMN IF NOT EXISTS responsavel_nome TEXT,
ADD COLUMN IF NOT EXISTS responsavel_telefone TEXT;

COMMENT ON COLUMN devedores.email IS 'E-mail do aluno (opcional)';

COMMENT ON COLUMN devedores.responsavel_nome IS 'Nome do responsável legal do aluno';
COMMENT ON COLUMN devedores.responsavel_telefone IS 'Telefone do responsável legal. Se preenchido, mensagens vão para este número.';

-- =====================================================
-- 2. Recriar views usando telefone do responsável quando disponível
-- COALESCE(responsavel_telefone, telefone) = se tem responsável, usa ele
-- =====================================================

-- VIEW 1: Parcelas com vencimento em 3 DIAS (lembrete)
DROP VIEW IF EXISTS vw_parcelas_3dias_antes;
CREATE VIEW vw_parcelas_3dias_antes AS
SELECT
  m.id as parcela_id,
  m.valor as valor_em_aberto,
  m.data_vencimento,
  m.status,
  m.enviado_3dias,
  m.total_envios,
  d.id as devedor_id,
  d.nome as nome_cliente,
  COALESCE(d.responsavel_telefone, d.telefone) as telefone,
  d.user_id,
  u.nome_empresa,
  u.chave_pix,
  COALESCE(t.mensagem, '') as template_mensagem,
  mz.instance_name as evolution_instance_name,
  (SELECT valor FROM config WHERE chave = 'evolution_api_key' LIMIT 1) as evolution_api_key,
  (SELECT valor FROM config WHERE chave = 'evolution_api_url' LIMIT 1) as evolution_api_url
FROM mensalidades m
JOIN devedores d ON m.devedor_id = d.id
JOIN usuarios u ON d.user_id = u.id
JOIN configuracoes_cobranca c ON c.user_id = d.user_id
LEFT JOIN mensallizap mz ON mz.user_id = d.user_id
LEFT JOIN templates t ON t.user_id = d.user_id AND t.tipo = 'pre_due_3days' AND t.ativo = true
WHERE (
    m.data_vencimento = CURRENT_DATE + INTERVAL '3 days'
    OR (
      EXTRACT(DOW FROM CURRENT_DATE) = 1
      AND c.enviar_domingo = false
      AND m.data_vencimento = CURRENT_DATE + INTERVAL '2 days'
    )
  )
  AND m.status != 'pago'
  AND (m.enviado_3dias IS NULL OR m.enviado_3dias = false)
  AND c.enviar_3_dias_antes = true
  AND NOT (EXTRACT(DOW FROM CURRENT_DATE) = 0 AND c.enviar_domingo = false)
  AND mz.conectado = true;

-- VIEW 2: Parcelas com vencimento HOJE
DROP VIEW IF EXISTS vw_parcelas_no_dia;
CREATE VIEW vw_parcelas_no_dia AS
SELECT
  m.id as parcela_id,
  m.valor as valor_em_aberto,
  m.data_vencimento,
  m.status,
  m.enviado_no_dia,
  m.total_envios,
  d.id as devedor_id,
  d.nome as nome_cliente,
  COALESCE(d.responsavel_telefone, d.telefone) as telefone,
  d.user_id,
  u.nome_empresa,
  u.chave_pix,
  COALESCE(t.mensagem, '') as template_mensagem,
  mz.instance_name as evolution_instance_name,
  (SELECT valor FROM config WHERE chave = 'evolution_api_key' LIMIT 1) as evolution_api_key,
  (SELECT valor FROM config WHERE chave = 'evolution_api_url' LIMIT 1) as evolution_api_url
FROM mensalidades m
JOIN devedores d ON m.devedor_id = d.id
JOIN usuarios u ON d.user_id = u.id
JOIN configuracoes_cobranca c ON c.user_id = d.user_id
LEFT JOIN mensallizap mz ON mz.user_id = d.user_id
LEFT JOIN templates t ON t.user_id = d.user_id AND t.tipo = 'due_day' AND t.ativo = true
WHERE (
    m.data_vencimento = CURRENT_DATE
    OR (
      EXTRACT(DOW FROM CURRENT_DATE) = 1
      AND c.enviar_domingo = false
      AND m.data_vencimento = CURRENT_DATE - INTERVAL '1 day'
    )
  )
  AND m.status != 'pago'
  AND (m.enviado_no_dia IS NULL OR m.enviado_no_dia = false)
  AND c.enviar_no_dia = true
  AND NOT (EXTRACT(DOW FROM CURRENT_DATE) = 0 AND c.enviar_domingo = false)
  AND mz.conectado = true;

-- VIEW 3: Parcelas com 3 DIAS DE ATRASO (cobrança)
DROP VIEW IF EXISTS vw_parcelas_3dias_depois;
CREATE VIEW vw_parcelas_3dias_depois AS
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
  COALESCE(d.responsavel_telefone, d.telefone) as telefone,
  d.user_id,
  u.nome_empresa,
  u.chave_pix,
  COALESCE(t.mensagem, '') as template_mensagem,
  mz.instance_name as evolution_instance_name,
  (SELECT valor FROM config WHERE chave = 'evolution_api_key' LIMIT 1) as evolution_api_key,
  (SELECT valor FROM config WHERE chave = 'evolution_api_url' LIMIT 1) as evolution_api_url
FROM mensalidades m
JOIN devedores d ON m.devedor_id = d.id
JOIN usuarios u ON d.user_id = u.id
JOIN configuracoes_cobranca c ON c.user_id = d.user_id
LEFT JOIN mensallizap mz ON mz.user_id = d.user_id
LEFT JOIN templates t ON t.user_id = d.user_id AND t.tipo = 'overdue' AND t.ativo = true
WHERE (
    m.data_vencimento = CURRENT_DATE - INTERVAL '3 days'
    OR (
      EXTRACT(DOW FROM CURRENT_DATE) = 1
      AND c.enviar_domingo = false
      AND m.data_vencimento = CURRENT_DATE - INTERVAL '4 days'
    )
  )
  AND m.status != 'pago'
  AND (m.enviado_3dias_depois IS NULL OR m.enviado_3dias_depois = false)
  AND c.enviar_3_dias_depois = true
  AND NOT (EXTRACT(DOW FROM CURRENT_DATE) = 0 AND c.enviar_domingo = false)
  AND mz.conectado = true;

-- VIEW 4: Aniversariantes do dia
DROP VIEW IF EXISTS vw_aniversariantes_do_dia;
CREATE VIEW vw_aniversariantes_do_dia AS
SELECT
  d.id as devedor_id,
  d.nome as nome_cliente,
  COALESCE(d.responsavel_telefone, d.telefone) as telefone,
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
WHERE d.data_nascimento IS NOT NULL
  AND (
    -- Aniversário hoje
    (EXTRACT(MONTH FROM d.data_nascimento) = EXTRACT(MONTH FROM CURRENT_DATE)
     AND EXTRACT(DAY FROM d.data_nascimento) = EXTRACT(DAY FROM CURRENT_DATE))
    OR
    -- Segunda: incluir aniversariantes de domingo se não envia domingo
    (EXTRACT(DOW FROM CURRENT_DATE) = 1
     AND cc.enviar_domingo = false
     AND EXTRACT(MONTH FROM d.data_nascimento) = EXTRACT(MONTH FROM CURRENT_DATE - INTERVAL '1 day')
     AND EXTRACT(DAY FROM d.data_nascimento) = EXTRACT(DAY FROM CURRENT_DATE - INTERVAL '1 day'))
  )
  AND (d.enviado_aniversario_em IS NULL OR EXTRACT(YEAR FROM d.enviado_aniversario_em) < EXTRACT(YEAR FROM CURRENT_DATE))
  AND (d.lixo IS NULL OR d.lixo = false)
  AND (cp.usage_count < cp.limite_mensal OR cp.limite_mensal IS NULL)
  AND NOT (EXTRACT(DOW FROM CURRENT_DATE) = 0 AND cc.enviar_domingo = false);

-- =====================================================
-- GRANT PERMISSIONS
-- =====================================================
GRANT SELECT ON vw_parcelas_3dias_antes TO anon, authenticated, service_role;
GRANT SELECT ON vw_parcelas_no_dia TO anon, authenticated, service_role;
GRANT SELECT ON vw_parcelas_3dias_depois TO anon, authenticated, service_role;
GRANT SELECT ON vw_aniversariantes_do_dia TO anon, authenticated, service_role;
