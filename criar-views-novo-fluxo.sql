-- =====================================================
-- VIEWS PARA NOVO FLUXO DE MENSAGENS
-- 3 dias antes | No dia | 3 dias depois
-- =====================================================

-- Adicionar novas colunas na tabela configuracoes_cobranca
ALTER TABLE configuracoes_cobranca
ADD COLUMN IF NOT EXISTS enviar_no_dia BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS enviar_3_dias_depois BOOLEAN DEFAULT false;

-- Adicionar novas colunas na tabela mensalidades para controle de envio
ALTER TABLE mensalidades
ADD COLUMN IF NOT EXISTS enviado_no_dia BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS enviado_3dias_depois BOOLEAN DEFAULT false;

-- =====================================================
-- VIEW 1: Parcelas com vencimento em 3 DIAS (lembrete)
-- =====================================================
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
  d.telefone,
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
WHERE m.data_vencimento = CURRENT_DATE + INTERVAL '3 days'
  AND m.status != 'pago'
  AND (m.enviado_3dias IS NULL OR m.enviado_3dias = false)
  AND c.enviar_3_dias_antes = true
  AND mz.conectado = true;

-- =====================================================
-- VIEW 2: Parcelas com vencimento HOJE
-- =====================================================
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
  d.telefone,
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
WHERE m.data_vencimento = CURRENT_DATE
  AND m.status != 'pago'
  AND (m.enviado_no_dia IS NULL OR m.enviado_no_dia = false)
  AND c.enviar_no_dia = true
  AND mz.conectado = true;

-- =====================================================
-- VIEW 3: Parcelas com 3 DIAS DE ATRASO (cobrança)
-- =====================================================
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
  d.telefone,
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
WHERE m.data_vencimento = CURRENT_DATE - INTERVAL '3 days'
  AND m.status != 'pago'
  AND (m.enviado_3dias_depois IS NULL OR m.enviado_3dias_depois = false)
  AND c.enviar_3_dias_depois = true
  AND mz.conectado = true;

-- =====================================================
-- GRANT PERMISSIONS
-- =====================================================
GRANT SELECT ON vw_parcelas_3dias_antes TO anon, authenticated, service_role;
GRANT SELECT ON vw_parcelas_no_dia TO anon, authenticated, service_role;
GRANT SELECT ON vw_parcelas_3dias_depois TO anon, authenticated, service_role;

-- =====================================================
-- CRIAR TEMPLATES PADRÃO PARA USUÁRIOS SEM TEMPLATE
-- Isso garante que todos os usuários tenham templates
-- =====================================================

-- Template: 3 Dias Antes (pre_due_3days)
INSERT INTO templates (user_id, titulo, mensagem, tipo, ativo, is_padrao)
SELECT
  u.id,
  'Lembrete - 3 Dias Antes do Vencimento',
  '*⚠️ Lembrete Importante*

Olá, *{{nomeCliente}}*! 👋

Sua mensalidade vence em breve:

💰 *Valor:* {{valorMensalidade}}
📆 *Vencimento:* {{dataVencimento}}
⏰ *Faltam apenas 3 dias!*

💳 *Meu PIX:* {{chavePix}}

Evite juros e multas, pague em dia! 💪

_{{nomeEmpresa}}_',
  'pre_due_3days',
  true,
  true
FROM usuarios u
WHERE NOT EXISTS (
  SELECT 1 FROM templates t
  WHERE t.user_id = u.id AND t.tipo = 'pre_due_3days'
);

-- Template: No Dia (due_day)
INSERT INTO templates (user_id, titulo, mensagem, tipo, ativo, is_padrao)
SELECT
  u.id,
  'Lembrete - Vencimento Hoje',
  '*📅 Vencimento Hoje*

Olá, *{{nomeCliente}}*! 👋

Sua mensalidade vence hoje:

💰 *Valor:* {{valorMensalidade}}
📆 *Vencimento:* {{dataVencimento}} (HOJE)

💳 *Meu PIX:* {{chavePix}}

Pague em dia e evite juros! 😊

_{{nomeEmpresa}}_',
  'due_day',
  true,
  true
FROM usuarios u
WHERE NOT EXISTS (
  SELECT 1 FROM templates t
  WHERE t.user_id = u.id AND t.tipo = 'due_day'
);

-- Template: 3 Dias Depois (overdue)
INSERT INTO templates (user_id, titulo, mensagem, tipo, ativo, is_padrao)
SELECT
  u.id,
  'Cobrança - 3 Dias Após o Vencimento',
  '*🚨 Aviso de Cobrança*

Olá, *{{nomeCliente}}*! 👋

Identificamos uma pendência em seu nome:

💰 *Valor:* {{valorMensalidade}}
📅 *Vencimento:* {{dataVencimento}}
⏰ *Dias em atraso:* {{diasAtraso}}

💳 *Meu PIX:* {{chavePix}}

Por favor, regularize sua situação o quanto antes para evitar maiores transtornos.

Caso já tenha efetuado o pagamento, por favor desconsidere esta mensagem. 🙏

_{{nomeEmpresa}}_',
  'overdue',
  true,
  true
FROM usuarios u
WHERE NOT EXISTS (
  SELECT 1 FROM templates t
  WHERE t.user_id = u.id AND t.tipo = 'overdue'
);
