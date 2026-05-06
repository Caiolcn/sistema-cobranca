-- ============================================================
-- BUCKET RETENCAO_E - Vencimento do plano próximo (3 dias)
-- ============================================================
-- Adiciona um novo bucket no painel de Retenção SaaS:
-- avisar clientes PAGANTES 3 dias antes do plano vencer.
-- ============================================================

-- 1. Coluna de tracking
ALTER TABLE usuarios
  ADD COLUMN IF NOT EXISTS retencao_e_enviado_em TIMESTAMPTZ;

-- 2. Template padrão
INSERT INTO templates_admin (tipo, titulo, mensagem)
VALUES (
  'retencao_e',
  'Vencimento do plano em 3 dias',
  'Oi {{nome}}! 💚 Lembrete amigável: seu plano do Mensalli vence em poucos dias. Se quiser garantir que tudo continue rodando sem interrupção, é só renovar antes do vencimento. Qualquer dúvida, me chama! 🚀'
)
ON CONFLICT (tipo) DO NOTHING;

-- 3. Recriar a view incluindo o novo bucket
DROP VIEW IF EXISTS vw_mensalli_retencao_saas;

CREATE VIEW vw_mensalli_retencao_saas AS
WITH base AS (
  SELECT
    u.id AS usuario_id,
    u.nome_completo,
    u.email,
    u.telefone,
    u.data_cadastro,
    u.trial_fim,
    u.trial_ativo,
    u.plano_pago,
    u.plano,
    u.plano_vencimento,
    u.ultimo_acesso,
    au.last_sign_in_at,
    u.retencao_a_enviado_em,
    u.retencao_b_enviado_em,
    u.retencao_d_enviado_em,
    u.retencao_c1_enviado_em,
    u.retencao_c2_enviado_em,
    u.retencao_e_enviado_em,
    EXTRACT(DAY FROM (NOW() - u.data_cadastro))::INT AS dias_desde_cadastro,
    EXTRACT(DAY FROM (u.trial_fim - NOW()))::INT AS dias_para_trial_expirar,
    EXTRACT(DAY FROM (NOW() - u.trial_fim))::INT AS dias_desde_trial_expirar,
    EXTRACT(DAY FROM (u.plano_vencimento - NOW()))::INT AS dias_para_plano_vencer,
    EXISTS(
      SELECT 1 FROM pagamentos_mercadopago pm
      WHERE pm.user_id = u.id AND pm.status = 'approved'
    ) AS ja_pagou_algum_dia
  FROM usuarios u
  LEFT JOIN auth.users au ON au.id = u.id
  WHERE u.telefone IS NOT NULL
    AND u.telefone != ''
)
-- BUCKET A: trial acabando em 1 dia
SELECT
  'retencao_a' AS bucket, 'Trial acabando amanhã' AS bucket_label,
  usuario_id, nome_completo, email, telefone, data_cadastro, trial_fim,
  plano_vencimento, dias_para_plano_vencer,
  dias_desde_cadastro, dias_para_trial_expirar, dias_desde_trial_expirar,
  ultimo_acesso, last_sign_in_at,
  retencao_a_enviado_em AS ultimo_envio
FROM base
WHERE plano_pago = false
  AND trial_fim IS NOT NULL
  AND dias_para_trial_expirar = 1
  AND dias_desde_trial_expirar <= 0
  AND (retencao_a_enviado_em IS NULL OR retencao_a_enviado_em < NOW() - INTERVAL '7 days')

UNION ALL

-- BUCKET B: trial expirou há 1 dia
SELECT
  'retencao_b', 'Trial expirou ontem',
  usuario_id, nome_completo, email, telefone, data_cadastro, trial_fim,
  plano_vencimento, dias_para_plano_vencer,
  dias_desde_cadastro, dias_para_trial_expirar, dias_desde_trial_expirar,
  ultimo_acesso, last_sign_in_at,
  retencao_b_enviado_em
FROM base
WHERE plano_pago = false
  AND trial_fim IS NOT NULL
  AND dias_desde_trial_expirar = 1
  AND (retencao_b_enviado_em IS NULL OR retencao_b_enviado_em < NOW() - INTERVAL '7 days')

UNION ALL

-- BUCKET D: cadastrou há 1+ dia(s) e nunca logou
SELECT
  'retencao_d', 'Não logou após cadastro',
  usuario_id, nome_completo, email, telefone, data_cadastro, trial_fim,
  plano_vencimento, dias_para_plano_vencer,
  dias_desde_cadastro, dias_para_trial_expirar, dias_desde_trial_expirar,
  ultimo_acesso, last_sign_in_at,
  retencao_d_enviado_em
FROM base
WHERE plano_pago = false
  AND dias_desde_cadastro >= 1
  AND dias_desde_cadastro <= 2
  AND last_sign_in_at IS NULL
  AND (retencao_d_enviado_em IS NULL OR retencao_d_enviado_em < NOW() - INTERVAL '7 days')

UNION ALL

-- BUCKET C1: ex-pagante inativo há 7-90 dias
SELECT
  'retencao_c1', 'Ex-pagante sumido',
  usuario_id, nome_completo, email, telefone, data_cadastro, trial_fim,
  plano_vencimento, dias_para_plano_vencer,
  dias_desde_cadastro, dias_para_trial_expirar, dias_desde_trial_expirar,
  ultimo_acesso, last_sign_in_at,
  retencao_c1_enviado_em
FROM base
WHERE plano_pago = false
  AND ja_pagou_algum_dia = true
  AND trial_fim IS NOT NULL
  AND dias_desde_trial_expirar BETWEEN 7 AND 90
  AND (retencao_c1_enviado_em IS NULL OR retencao_c1_enviado_em < NOW() - INTERVAL '30 days')

UNION ALL

-- BUCKET C2: trial antigo, nunca pagou, expirou há 7-90 dias
SELECT
  'retencao_c2', 'Trial antigo (nunca pagou)',
  usuario_id, nome_completo, email, telefone, data_cadastro, trial_fim,
  plano_vencimento, dias_para_plano_vencer,
  dias_desde_cadastro, dias_para_trial_expirar, dias_desde_trial_expirar,
  ultimo_acesso, last_sign_in_at,
  retencao_c2_enviado_em
FROM base
WHERE plano_pago = false
  AND ja_pagou_algum_dia = false
  AND trial_fim IS NOT NULL
  AND dias_desde_trial_expirar BETWEEN 7 AND 90
  AND (retencao_c2_enviado_em IS NULL OR retencao_c2_enviado_em < NOW() - INTERVAL '30 days')

UNION ALL

-- BUCKET E: cliente PAGANTE com plano vencendo em até 3 dias
-- Cooldown de 20 dias pra não reaparecer no mesmo ciclo
SELECT
  'retencao_e', 'Vence em breve',
  usuario_id, nome_completo, email, telefone, data_cadastro, trial_fim,
  plano_vencimento, dias_para_plano_vencer,
  dias_desde_cadastro, dias_para_trial_expirar, dias_desde_trial_expirar,
  ultimo_acesso, last_sign_in_at,
  retencao_e_enviado_em
FROM base
WHERE plano_pago = true
  AND plano_vencimento IS NOT NULL
  AND dias_para_plano_vencer BETWEEN 0 AND 3
  AND (retencao_e_enviado_em IS NULL OR retencao_e_enviado_em < NOW() - INTERVAL '20 days');

-- ==========================================
-- VERIFICAR
-- ==========================================
SELECT bucket, bucket_label, COUNT(*) AS qtd
FROM vw_mensalli_retencao_saas
GROUP BY bucket, bucket_label
ORDER BY bucket;
