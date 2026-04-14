-- ============================================================
-- RETENÇÃO SAAS - Mensagens manuais pra clientes do Mensalli
-- ============================================================
-- Detecta clientes que precisam de uma mensagem de retenção e
-- expõe via view pro painel admin (/app/admin).
-- O envio é MANUAL (admin clica "enviar" pra cada um).
-- ============================================================

-- ==========================================
-- 1. TABELA DE TEMPLATES ADMIN
-- ==========================================
-- Templates usados pelo painel admin (separados dos templates dos alunos).
-- Uma linha por tipo de mensagem.
CREATE TABLE IF NOT EXISTS templates_admin (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tipo TEXT NOT NULL UNIQUE,          -- 'retencao_a', 'retencao_b', 'retencao_d'
  titulo TEXT NOT NULL,
  mensagem TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS (só admin pode ler/editar)
ALTER TABLE templates_admin ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin ve templates_admin" ON templates_admin;
CREATE POLICY "Admin ve templates_admin"
  ON templates_admin FOR SELECT
  USING (is_admin());

DROP POLICY IF EXISTS "Admin gerencia templates_admin" ON templates_admin;
CREATE POLICY "Admin gerencia templates_admin"
  ON templates_admin FOR ALL
  USING (is_admin());

-- Insere os templates padrão (só se não existirem)
INSERT INTO templates_admin (tipo, titulo, mensagem)
VALUES
  (
    'retencao_d',
    'Onboarding - Não logou há 1 dia',
    'Oi {{nome}}! 👋 Vi que você criou sua conta no Mensalli ontem mas ainda não teve chance de explorar. Tá com alguma dúvida? Posso te ajudar a configurar os primeiros alunos ou o WhatsApp! 💬'
  ),
  (
    'retencao_a',
    'Trial acabando - 1 dia antes',
    'Oi {{nome}}! ⏰ Seu trial do Mensalli termina amanhã. Já deu tempo de conhecer? Se ficar com a gente, todas as suas configurações e dados continuam intactos. Qualquer dúvida antes, me chama aqui! 💪'
  ),
  (
    'retencao_b',
    'Trial expirou ontem',
    'Oi {{nome}}! 💛 Seu trial do Mensalli acabou ontem. Queria entender: o que você achou? Travou em algo, não era o que esperava, ou só não deu pra testar direito? Me responde nem que seja em 1 linha — sua opinião me ajuda MUITO. Se quiser continuar, é só me avisar que a gente libera uma semana extra.'
  ),
  (
    'retencao_c1',
    'Reativação - Ex-pagante sumido',
    'Oi {{nome}}! 💛 Faz um tempo que a gente não se fala. Espero que tudo bem por aí! Vim avisar que o Mensalli tá com várias novidades desde que você saiu — bot WhatsApp, CRM de leads, agendamento online. Seu cadastro ainda tá aqui esperando. Quer que eu libere uma semana grátis pra você testar as novidades?'
  ),
  (
    'retencao_c2',
    'Reativação - Trial antigo não pagante',
    'Oi {{nome}}! 👋 Faz um tempo que você criou conta no Mensalli mas não deu pra testar direito. Tenho novidades que podem mudar sua opinião: agora tem bot WhatsApp, CRM de leads e muito mais. Posso liberar uma semana grátis estendida pra você dar mais uma chance? 💪'
  )
ON CONFLICT (tipo) DO NOTHING;

-- ==========================================
-- 2. COLUNAS DE TRACKING EM usuarios
-- ==========================================
-- Registra o ÚLTIMO envio de cada bucket pra evitar spam.
ALTER TABLE usuarios
  ADD COLUMN IF NOT EXISTS retencao_a_enviado_em TIMESTAMPTZ;

ALTER TABLE usuarios
  ADD COLUMN IF NOT EXISTS retencao_b_enviado_em TIMESTAMPTZ;

ALTER TABLE usuarios
  ADD COLUMN IF NOT EXISTS retencao_d_enviado_em TIMESTAMPTZ;

ALTER TABLE usuarios
  ADD COLUMN IF NOT EXISTS retencao_c1_enviado_em TIMESTAMPTZ;

ALTER TABLE usuarios
  ADD COLUMN IF NOT EXISTS retencao_c2_enviado_em TIMESTAMPTZ;

-- ==========================================
-- 3. TABELA DE LOG DE ENVIOS
-- ==========================================
-- Guarda cada envio feito (pra histórico + auditoria).
CREATE TABLE IF NOT EXISTS retencao_saas_envios (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  usuario_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL,                 -- 'retencao_a' | 'retencao_b' | 'retencao_d'
  mensagem TEXT NOT NULL,
  canal TEXT DEFAULT 'whatsapp',      -- pode virar 'email' futuramente
  status TEXT DEFAULT 'enviado',      -- 'enviado' | 'falha'
  erro TEXT,
  enviado_por UUID REFERENCES auth.users(id),  -- quem clicou no botão
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_retencao_envios_usuario ON retencao_saas_envios (usuario_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_retencao_envios_tipo ON retencao_saas_envios (tipo, created_at DESC);

-- RLS (só admin)
ALTER TABLE retencao_saas_envios ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin gerencia retencao_envios" ON retencao_saas_envios;
CREATE POLICY "Admin gerencia retencao_envios"
  ON retencao_saas_envios FOR ALL
  USING (is_admin());

-- ==========================================
-- 4. VIEW: candidatos à retenção SaaS
-- ==========================================
-- Retorna usuários que se encaixam em algum bucket (A, B ou D).
-- Bucket A: trial acabando em 1 dia
-- Bucket B: trial expirou ontem
-- Bucket D: criou conta há 1+ dia(s) e nunca logou
--
-- Filtros transversais:
-- - plano_pago = false (já pagantes não recebem)
-- - tem telefone preenchido
-- - não recebeu o mesmo toque nos últimos 7 dias (evita re-envio)

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
    u.ultimo_acesso,
    au.last_sign_in_at,
    u.retencao_a_enviado_em,
    u.retencao_b_enviado_em,
    u.retencao_d_enviado_em,
    u.retencao_c1_enviado_em,
    u.retencao_c2_enviado_em,
    -- Dias desde cadastro
    EXTRACT(DAY FROM (NOW() - u.data_cadastro))::INT AS dias_desde_cadastro,
    -- Dias até trial expirar (pode ser negativo)
    EXTRACT(DAY FROM (u.trial_fim - NOW()))::INT AS dias_para_trial_expirar,
    -- Dias desde trial expirar (positivo = já expirou)
    EXTRACT(DAY FROM (NOW() - u.trial_fim))::INT AS dias_desde_trial_expirar,
    -- Detecta se já teve pagamento aprovado em algum momento
    EXISTS(
      SELECT 1 FROM pagamentos_mercadopago pm
      WHERE pm.user_id = u.id AND pm.status = 'approved'
    ) AS ja_pagou_algum_dia
  FROM usuarios u
  LEFT JOIN auth.users au ON au.id = u.id
  WHERE u.plano_pago = false
    AND u.telefone IS NOT NULL
    AND u.telefone != ''
)
-- BUCKET A: trial acabando em 1 dia
SELECT
  'retencao_a' AS bucket,
  'Trial acabando amanhã' AS bucket_label,
  usuario_id,
  nome_completo,
  email,
  telefone,
  data_cadastro,
  trial_fim,
  dias_desde_cadastro,
  dias_para_trial_expirar,
  dias_desde_trial_expirar,
  ultimo_acesso,
  last_sign_in_at,
  retencao_a_enviado_em AS ultimo_envio
FROM base
WHERE trial_fim IS NOT NULL
  AND dias_para_trial_expirar = 1
  AND dias_desde_trial_expirar <= 0
  AND (
    retencao_a_enviado_em IS NULL
    OR retencao_a_enviado_em < NOW() - INTERVAL '7 days'
  )

UNION ALL

-- BUCKET B: trial expirou há 1 dia
SELECT
  'retencao_b' AS bucket,
  'Trial expirou ontem' AS bucket_label,
  usuario_id,
  nome_completo,
  email,
  telefone,
  data_cadastro,
  trial_fim,
  dias_desde_cadastro,
  dias_para_trial_expirar,
  dias_desde_trial_expirar,
  ultimo_acesso,
  last_sign_in_at,
  retencao_b_enviado_em AS ultimo_envio
FROM base
WHERE trial_fim IS NOT NULL
  AND dias_desde_trial_expirar = 1
  AND (
    retencao_b_enviado_em IS NULL
    OR retencao_b_enviado_em < NOW() - INTERVAL '7 days'
  )

UNION ALL

-- BUCKET D: cadastrou há 1+ dia(s) e nunca logou
SELECT
  'retencao_d' AS bucket,
  'Não logou após cadastro' AS bucket_label,
  usuario_id,
  nome_completo,
  email,
  telefone,
  data_cadastro,
  trial_fim,
  dias_desde_cadastro,
  dias_para_trial_expirar,
  dias_desde_trial_expirar,
  ultimo_acesso,
  last_sign_in_at,
  retencao_d_enviado_em AS ultimo_envio
FROM base
WHERE dias_desde_cadastro >= 1
  AND dias_desde_cadastro <= 2  -- janela curta pra não virar spam
  AND last_sign_in_at IS NULL
  AND (
    retencao_d_enviado_em IS NULL
    OR retencao_d_enviado_em < NOW() - INTERVAL '7 days'
  )

UNION ALL

-- BUCKET C1: EX-PAGANTE inativo há 7-90 dias (cancelou ou não renovou)
-- Cooldown de 30 dias entre envios pra não virar spam
SELECT
  'retencao_c1' AS bucket,
  'Ex-pagante sumido' AS bucket_label,
  usuario_id,
  nome_completo,
  email,
  telefone,
  data_cadastro,
  trial_fim,
  dias_desde_cadastro,
  dias_para_trial_expirar,
  dias_desde_trial_expirar,
  ultimo_acesso,
  last_sign_in_at,
  retencao_c1_enviado_em AS ultimo_envio
FROM base
WHERE ja_pagou_algum_dia = true
  -- Expirou entre 7 e 90 dias atrás
  AND trial_fim IS NOT NULL
  AND dias_desde_trial_expirar BETWEEN 7 AND 90
  AND (
    retencao_c1_enviado_em IS NULL
    OR retencao_c1_enviado_em < NOW() - INTERVAL '30 days'
  )

UNION ALL

-- BUCKET C2: TRIAL ANTIGO, nunca pagou, expirou há 7-90 dias
-- Cooldown de 30 dias entre envios
SELECT
  'retencao_c2' AS bucket,
  'Trial antigo (nunca pagou)' AS bucket_label,
  usuario_id,
  nome_completo,
  email,
  telefone,
  data_cadastro,
  trial_fim,
  dias_desde_cadastro,
  dias_para_trial_expirar,
  dias_desde_trial_expirar,
  ultimo_acesso,
  last_sign_in_at,
  retencao_c2_enviado_em AS ultimo_envio
FROM base
WHERE ja_pagou_algum_dia = false
  AND trial_fim IS NOT NULL
  AND dias_desde_trial_expirar BETWEEN 7 AND 90
  AND (
    retencao_c2_enviado_em IS NULL
    OR retencao_c2_enviado_em < NOW() - INTERVAL '30 days'
  );

-- ==========================================
-- VERIFICAR
-- ==========================================
SELECT tipo, titulo FROM templates_admin ORDER BY tipo;

-- Quantos candidatos em cada bucket agora?
SELECT bucket, bucket_label, COUNT(*) AS qtd
FROM vw_mensalli_retencao_saas
GROUP BY bucket, bucket_label;
