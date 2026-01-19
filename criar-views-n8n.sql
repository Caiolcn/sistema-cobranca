-- ==========================================
-- VIEWS PARA INTEGRAÇÃO COM N8N
-- MensalliZap - Sistema de Cobrança Automatizada
-- ==========================================
-- REGRA DE ENVIO (FLAGS BOOLEANAS):
-- - Cada tipo de mensagem é enviado apenas 1x
-- - enviado_3dias = true após enviar lembrete 3 dias antes
-- - enviado_no_dia = true após enviar no dia do vencimento
-- - enviado_vencimento = true após enviar 3 dias depois (atraso)
-- - Máximo de 3 mensagens por mensalidade
-- ==========================================
-- ESTRUTURA DAS CONFIGS:
-- - mensallizap: conectado, instance_name (por USUÁRIO)
-- - config: evolution_api_key, evolution_api_url (global)
-- - usuarios: chave_pix, nome_empresa
-- ==========================================

-- ==========================================
-- MIGRATION: Adicionar coluna enviado_no_dia
-- ==========================================
ALTER TABLE mensalidades
ADD COLUMN IF NOT EXISTS enviado_no_dia BOOLEAN DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_mensalidades_enviado_no_dia
ON mensalidades(enviado_no_dia);

COMMENT ON COLUMN mensalidades.enviado_no_dia IS
'Flag: Lembrete no dia do vencimento já foi enviado';

-- ==========================================
-- MIGRATION: Adicionar coluna enviar_no_dia em configuracoes_cobranca
-- ==========================================
ALTER TABLE configuracoes_cobranca
ADD COLUMN IF NOT EXISTS enviar_no_dia BOOLEAN DEFAULT true;

COMMENT ON COLUMN configuracoes_cobranca.enviar_no_dia IS
'Habilita envio de lembrete no dia do vencimento';

-- ==========================================
-- DROPAR VIEWS EXISTENTES (necessário quando há mudança de colunas)
-- ==========================================
DROP VIEW IF EXISTS vw_parcelas_lembrete_5dias;
DROP VIEW IF EXISTS vw_parcelas_lembrete_3dias;
DROP VIEW IF EXISTS vw_parcelas_no_dia;
DROP VIEW IF EXISTS vw_parcelas_em_atraso;

-- ==========================================
-- View 1: Parcelas para lembrete 3 dias ANTES (TODOS os planos)
-- Envia apenas 1x - quando enviado_3dias = false
-- ==========================================
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
LEFT JOIN mensallizap mz ON mz.user_id = d.user_id
LEFT JOIN configuracoes_cobranca cc ON cc.user_id = d.user_id
LEFT JOIN controle_planos cp ON cp.user_id = d.user_id
LEFT JOIN templates t ON t.user_id = d.user_id AND t.tipo = 'pre_due_3days' AND t.ativo = true
WHERE m.status = 'pendente'
  AND m.enviado_3dias = false
  AND m.data_vencimento = CURRENT_DATE + INTERVAL '3 days'
  AND cc.enviar_3_dias_antes = true
  AND d.assinatura_ativa = true
  AND (d.lixo IS NULL OR d.lixo = false)
  AND (cp.usage_count < cp.limite_mensal OR cp.limite_mensal IS NULL)
  AND mz.conectado = true;

-- ==========================================
-- View 2: Parcelas para lembrete NO DIA do vencimento (TODOS os planos)
-- Envia apenas 1x - quando enviado_no_dia = false
-- ==========================================
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
LEFT JOIN mensallizap mz ON mz.user_id = d.user_id
LEFT JOIN configuracoes_cobranca cc ON cc.user_id = d.user_id
LEFT JOIN controle_planos cp ON cp.user_id = d.user_id
LEFT JOIN templates t ON t.user_id = d.user_id AND t.tipo = 'due_day' AND t.ativo = true
WHERE m.status = 'pendente'
  AND m.enviado_no_dia = false
  AND m.data_vencimento = CURRENT_DATE
  AND cc.enviar_no_dia = true
  AND d.assinatura_ativa = true
  AND (d.lixo IS NULL OR d.lixo = false)
  AND (cp.usage_count < cp.limite_mensal OR cp.limite_mensal IS NULL)
  AND mz.conectado = true;

-- ==========================================
-- View 3: Parcelas em atraso - 3 dias DEPOIS do vencimento (TODOS os planos)
-- Envia apenas 1x - quando enviado_vencimento = false
-- ==========================================
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
LEFT JOIN mensallizap mz ON mz.user_id = d.user_id
LEFT JOIN configuracoes_cobranca cc ON cc.user_id = d.user_id
LEFT JOIN controle_planos cp ON cp.user_id = d.user_id
LEFT JOIN templates t ON t.user_id = d.user_id AND t.tipo = 'overdue' AND t.ativo = true
WHERE m.status = 'pendente'
  AND m.enviado_vencimento = false
  AND m.data_vencimento = CURRENT_DATE - INTERVAL '3 days'
  AND d.assinatura_ativa = true
  AND (d.lixo IS NULL OR d.lixo = false)
  AND (cp.usage_count < cp.limite_mensal OR cp.limite_mensal IS NULL)
  AND mz.conectado = true;

-- ==========================================
-- Habilitar Security Invoker nas Views
-- ==========================================
ALTER VIEW vw_parcelas_lembrete_3dias SET (security_invoker = true);
ALTER VIEW vw_parcelas_no_dia SET (security_invoker = true);
ALTER VIEW vw_parcelas_em_atraso SET (security_invoker = true);

-- ==========================================
-- Verificação
-- ==========================================
SELECT 'vw_parcelas_lembrete_3dias' as view_name, COUNT(*) as registros FROM vw_parcelas_lembrete_3dias
UNION ALL
SELECT 'vw_parcelas_no_dia', COUNT(*) FROM vw_parcelas_no_dia
UNION ALL
SELECT 'vw_parcelas_em_atraso', COUNT(*) FROM vw_parcelas_em_atraso;
