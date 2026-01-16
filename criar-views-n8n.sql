-- ==========================================
-- VIEWS PARA INTEGRAÇÃO COM N8N
-- MensalliZap - Sistema de Cobrança Automatizada
-- ==========================================
-- REGRA DE ENVIO (FLAGS BOOLEANAS):
-- - Cada tipo de mensagem é enviado apenas 1x
-- - enviado_5dias = true após enviar lembrete 5 dias
-- - enviado_3dias = true após enviar lembrete 3 dias
-- - enviado_vencimento = true após enviar cobrança
-- - Máximo de 3 mensagens por mensalidade
-- ==========================================
-- ESTRUTURA DAS CONFIGS:
-- - mensallizap: conectado, instance_name (por USUÁRIO)
-- - config: evolution_api_key, evolution_api_url (global)
-- - usuarios: chave_pix, nome_empresa
-- ==========================================

-- ==========================================
-- View 1: Parcelas para lembrete 5 dias antes (PRO+)
-- Envia apenas 1x - quando enviado_5dias = false
-- ==========================================
CREATE OR REPLACE VIEW vw_parcelas_lembrete_5dias AS
SELECT
  m.id as parcela_id,
  m.devedor_id,
  m.valor as valor_em_aberto,
  m.data_vencimento,
  m.descricao,
  5 as dias_restantes,
  d.nome as nome_cliente,
  d.telefone,
  d.user_id,
  u.plano,
  -- Evolution API config (do USUÁRIO, não do devedor)
  mz.instance_name as evolution_instance_name,
  (SELECT valor FROM config WHERE chave = 'evolution_api_key' LIMIT 1) as evolution_api_key,
  (SELECT valor FROM config WHERE chave = 'evolution_api_url' LIMIT 1) as evolution_api_url,
  -- Config do usuário
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
LEFT JOIN templates t ON t.user_id = d.user_id AND t.tipo = 'pre_due_5days' AND t.ativo = true
WHERE m.status = 'pendente'
  AND m.enviado_5dias = false
  AND m.data_vencimento = CURRENT_DATE + INTERVAL '5 days'
  AND cc.enviar_5_dias_antes = true
  AND u.plano IN ('pro', 'premium')
  AND d.assinatura_ativa = true
  AND (d.lixo IS NULL OR d.lixo = false)
  AND (cp.usage_count < cp.limite_mensal OR cp.limite_mensal IS NULL)
  -- Verificar se USUÁRIO tem WhatsApp conectado
  AND mz.conectado = true;

-- ==========================================
-- View 2: Parcelas para lembrete 3 dias antes (PRO+)
-- Envia apenas 1x - quando enviado_3dias = false
-- ==========================================
CREATE OR REPLACE VIEW vw_parcelas_lembrete_3dias AS
SELECT
  m.id as parcela_id,
  m.devedor_id,
  m.valor as valor_em_aberto,
  m.data_vencimento,
  m.descricao,
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
  AND u.plano IN ('pro', 'premium')
  AND d.assinatura_ativa = true
  AND (d.lixo IS NULL OR d.lixo = false)
  AND (cp.usage_count < cp.limite_mensal OR cp.limite_mensal IS NULL)
  AND mz.conectado = true;

-- ==========================================
-- View 3: Parcelas em atraso (vencidas) - TODOS os planos
-- Envia apenas 1x - quando enviado_vencimento = false
-- ==========================================
CREATE OR REPLACE VIEW vw_parcelas_em_atraso AS
SELECT
  m.id as parcela_id,
  m.devedor_id,
  m.valor as valor_em_aberto,
  m.data_vencimento,
  m.descricao,
  m.total_envios,
  (CURRENT_DATE - m.data_vencimento::date)::integer as dias_atraso,
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
  AND m.data_vencimento <= CURRENT_DATE
  AND d.assinatura_ativa = true
  AND (d.lixo IS NULL OR d.lixo = false)
  AND (cp.usage_count < cp.limite_mensal OR cp.limite_mensal IS NULL)
  AND mz.conectado = true;

-- ==========================================
-- Habilitar Security Invoker nas Views
-- ==========================================
ALTER VIEW vw_parcelas_lembrete_5dias SET (security_invoker = true);
ALTER VIEW vw_parcelas_lembrete_3dias SET (security_invoker = true);
ALTER VIEW vw_parcelas_em_atraso SET (security_invoker = true);

-- ==========================================
-- Verificação
-- ==========================================
SELECT 'vw_parcelas_lembrete_5dias' as view_name, COUNT(*) as registros FROM vw_parcelas_lembrete_5dias
UNION ALL
SELECT 'vw_parcelas_lembrete_3dias', COUNT(*) FROM vw_parcelas_lembrete_3dias
UNION ALL
SELECT 'vw_parcelas_em_atraso', COUNT(*) FROM vw_parcelas_em_atraso;
