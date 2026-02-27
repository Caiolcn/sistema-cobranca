-- ==========================================
-- VIEW PARA ANIVERSARIANTES DO DIA
-- MensalliZap - Mensagem de Aniversário Automática
-- ==========================================
-- REGRAS:
-- - Envia 1x por ano (controle via campo enviado_aniversario_em)
-- - Apenas planos Pro/Premium (Starter bloqueado no whatsappService)
-- - Envia para alunos inativos (reengajamento)
-- - Filtra lixo = false
-- - Respeita configuração enviar_aniversario do usuário
-- - Conta na cota mensal de mensagens (usage_count)
-- - Horário sugerido: 8h da manhã (configurar no n8n)
-- ==========================================

-- ==========================================
-- MIGRATION: Campo para controle anti-duplicação em devedores
-- ==========================================
ALTER TABLE devedores
ADD COLUMN IF NOT EXISTS enviado_aniversario_em DATE;

COMMENT ON COLUMN devedores.enviado_aniversario_em IS
'Data do último envio de mensagem de aniversário. Comparar com ano atual para evitar duplicação.';

-- ==========================================
-- MIGRATION: Flag de envio de aniversário em configuracoes_cobranca
-- ==========================================
ALTER TABLE configuracoes_cobranca
ADD COLUMN IF NOT EXISTS enviar_aniversario BOOLEAN DEFAULT false;

COMMENT ON COLUMN configuracoes_cobranca.enviar_aniversario IS
'Habilita envio automático de mensagem de aniversário para alunos';

-- ==========================================
-- MIGRATION: Adicionar tipo 'birthday' nos templates
-- ==========================================
-- Remover constraint antiga e criar nova com 'birthday' incluído
DO $$
BEGIN
  -- Tentar remover constraint existente (pode ter nomes diferentes)
  BEGIN
    ALTER TABLE templates DROP CONSTRAINT IF EXISTS templates_tipo_check;
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  -- Criar nova constraint com birthday
  ALTER TABLE templates
  ADD CONSTRAINT templates_tipo_check
  CHECK (tipo IN ('overdue', 'pre_due_3days', 'pre_due_5days', 'due_day', 'birthday', 'class_reminder'));

  RAISE NOTICE 'Constraint atualizada com tipo birthday!';
END $$;

-- ==========================================
-- DROPAR VIEW SE EXISTIR
-- ==========================================
DROP VIEW IF EXISTS vw_aniversariantes_do_dia;

-- ==========================================
-- View: Aniversariantes do dia
-- Retorna alunos que fazem aniversário hoje e ainda não receberam
-- mensagem de parabéns neste ano
-- ==========================================
CREATE VIEW vw_aniversariantes_do_dia AS
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
WHERE d.data_nascimento IS NOT NULL
  AND EXTRACT(MONTH FROM d.data_nascimento) = EXTRACT(MONTH FROM CURRENT_DATE)
  AND EXTRACT(DAY FROM d.data_nascimento) = EXTRACT(DAY FROM CURRENT_DATE)
  AND (d.enviado_aniversario_em IS NULL OR EXTRACT(YEAR FROM d.enviado_aniversario_em) < EXTRACT(YEAR FROM CURRENT_DATE))
  AND (d.lixo IS NULL OR d.lixo = false)
  AND (cp.usage_count < cp.limite_mensal OR cp.limite_mensal IS NULL);

-- ==========================================
-- Security Invoker
-- ==========================================
ALTER VIEW vw_aniversariantes_do_dia SET (security_invoker = true);

-- ==========================================
-- Verificação
-- ==========================================
SELECT 'vw_aniversariantes_do_dia' as view_name, COUNT(*) as registros FROM vw_aniversariantes_do_dia;
