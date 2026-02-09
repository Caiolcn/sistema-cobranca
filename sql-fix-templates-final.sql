-- ==========================================
-- SQL FIX TEMPLATES - CORREÇÃO DEFINITIVA
-- MensalliZap - Execute no Supabase SQL Editor
-- ==========================================

-- ==========================================
-- PARTE 1: CORRIGIR CHECK CONSTRAINT
-- ==========================================
ALTER TABLE templates DROP CONSTRAINT IF EXISTS templates_tipo_check;

ALTER TABLE templates
ADD CONSTRAINT templates_tipo_check
CHECK (tipo IN ('overdue', 'pre_due_3days', 'due_day'));

-- ==========================================
-- PARTE 2: LIMPAR DUPLICATAS (manter melhor)
-- ==========================================
WITH templates_a_manter AS (
  SELECT DISTINCT ON (user_id, tipo)
    id
  FROM templates
  WHERE ativo = true
  ORDER BY user_id, tipo,
    CASE WHEN is_padrao = false THEN 0 ELSE 1 END,
    updated_at DESC
)
UPDATE templates t
SET ativo = false
WHERE t.ativo = true
  AND t.id NOT IN (SELECT id FROM templates_a_manter);

-- ==========================================
-- PARTE 3: CRIAR TEMPLATES FALTANTES
-- ==========================================

-- due_day
INSERT INTO templates (user_id, titulo, mensagem, tipo, ativo, is_padrao)
SELECT u.id, 'Lembrete - Vencimento Hoje',
'Oi, {{nomeCliente}}! Tudo bem? 😃

Hoje é o dia do vencimento da sua mensalidade.

💰 Valor: {{valorMensalidade}}
💳 Pix para pagamento: {{chavePix}}

Manter seu plano em dia garante que você continue aproveitando todos os nossos benefícios sem interrupções! 🚀

Qualquer dúvida, estou à disposição.',
'due_day', true, true
FROM usuarios u
WHERE NOT EXISTS (SELECT 1 FROM templates t WHERE t.user_id = u.id AND t.tipo = 'due_day' AND t.ativo = true);

-- pre_due_3days
INSERT INTO templates (user_id, titulo, mensagem, tipo, ativo, is_padrao)
SELECT u.id, 'Lembrete - 3 Dias Antes do Vencimento',
'Olá, {{nomeCliente}}! 👋

Passando para te ajudar na organização da semana: sua mensalidade vence em 3 dias. 😃

💰 Valor: {{valorMensalidade}}
📆 Vencimento: {{dataVencimento}}

🔑 Chave Pix: {{chavePix}}

Adiantar o pagamento garante sua tranquilidade e a continuidade dos seus planos sem correria! 💪',
'pre_due_3days', true, true
FROM usuarios u
WHERE NOT EXISTS (SELECT 1 FROM templates t WHERE t.user_id = u.id AND t.tipo = 'pre_due_3days' AND t.ativo = true);

-- overdue
INSERT INTO templates (user_id, titulo, mensagem, tipo, ativo, is_padrao)
SELECT u.id, 'Cobrança - 3 Dias Após o Vencimento',
'Olá, {{nomeCliente}}, como vai?

Notamos que o pagamento da sua mensalidade (vencida em {{dataVencimento}}) ainda não consta em nosso sistema.

Sabemos que a rotina é corrida, por isso trouxemos os dados aqui para facilitar sua regularização agora mesmo:

💰 Valor: {{valorMensalidade}}
🔑 Chave Pix: {{chavePix}}

Se você já realizou o pagamento e foi um atraso na nossa baixa manual, basta me enviar o comprovante por aqui! Obrigado! 🙏',
'overdue', true, true
FROM usuarios u
WHERE NOT EXISTS (SELECT 1 FROM templates t WHERE t.user_id = u.id AND t.tipo = 'overdue' AND t.ativo = true);

-- ==========================================
-- PARTE 4: CRIAR ÍNDICE ÚNICO (prevenir duplicatas)
-- ==========================================
DROP INDEX IF EXISTS idx_templates_user_tipo_ativo;
CREATE UNIQUE INDEX idx_templates_user_tipo_ativo
ON templates(user_id, tipo) WHERE ativo = true;

-- ==========================================
-- PARTE 5: VERIFICAR RESULTADO
-- ==========================================
SELECT user_id, tipo, titulo, is_padrao, ativo
FROM templates
WHERE ativo = true
ORDER BY user_id, tipo;
