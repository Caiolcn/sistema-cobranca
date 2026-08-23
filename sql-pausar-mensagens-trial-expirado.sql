-- ==========================================================
-- PAUSAR MENSAGENS AUTOMATICAS QUANDO USUARIO ESTA EXPIRADO
-- ==========================================================
-- Problema: views consumidas pelo n8n nao filtram pelo status
-- de pagamento do usuario SaaS. Trial expirado + WhatsApp ainda
-- conectado = mensagens continuam saindo.
--
-- Solucao: funcao centralizada usuario_pode_enviar(uuid) +
-- patch nas views referenciadas pelos workflows do n8n.
--
-- Views afetadas (encontradas nos JSONs em n8n-workflows/):
--   - vw_parcelas_lembrete_3dias
--   - vw_parcelas_no_dia
--   - vw_parcelas_em_atraso
--   - vw_aniversariantes_do_dia
--   - vw_aulas_lembrete_1hora
-- ==========================================================

-- ==========================================================
-- 1. FUNCAO CENTRALIZADA
-- ==========================================================
-- Retorna true quando o usuario tem assinatura ativa OU
-- ainda esta dentro do periodo de trial.
-- Mudar a regra (ex.: tolerancia de N dias apos vencer) =
-- mudar apenas aqui.
-- ==========================================================
CREATE OR REPLACE FUNCTION usuario_pode_enviar(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    plano_pago = true
    OR (trial_fim IS NOT NULL AND trial_fim >= CURRENT_DATE),
    false
  )
  FROM usuarios
  WHERE id = p_user_id;
$$;

COMMENT ON FUNCTION usuario_pode_enviar(UUID) IS
'Retorna true se o usuario SaaS pode disparar mensagens automaticas (plano pago OU trial valido).';

GRANT EXECUTE ON FUNCTION usuario_pode_enviar(UUID) TO anon, authenticated, service_role;


-- ==========================================================
-- 2. VIEW: vw_parcelas_lembrete_3dias
-- ==========================================================
DROP VIEW IF EXISTS vw_parcelas_lembrete_3dias;
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
  AND (d.bloquear_mensagens IS NULL OR d.bloquear_mensagens = false)
  AND (cp.usage_count < cp.limite_mensal OR cp.limite_mensal IS NULL)
  AND usuario_pode_enviar(u.id);

ALTER VIEW vw_parcelas_lembrete_3dias SET (security_invoker = true);


-- ==========================================================
-- 3. VIEW: vw_parcelas_no_dia
-- ==========================================================
DROP VIEW IF EXISTS vw_parcelas_no_dia;
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
  AND (d.bloquear_mensagens IS NULL OR d.bloquear_mensagens = false)
  AND (cp.usage_count < cp.limite_mensal OR cp.limite_mensal IS NULL)
  AND usuario_pode_enviar(u.id);

ALTER VIEW vw_parcelas_no_dia SET (security_invoker = true);


-- ==========================================================
-- 4. VIEW: vw_parcelas_em_atraso
-- ==========================================================
DROP VIEW IF EXISTS vw_parcelas_em_atraso;
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
  AND (d.bloquear_mensagens IS NULL OR d.bloquear_mensagens = false)
  AND (cp.usage_count < cp.limite_mensal OR cp.limite_mensal IS NULL)
  AND usuario_pode_enviar(u.id);

ALTER VIEW vw_parcelas_em_atraso SET (security_invoker = true);


-- ==========================================================
-- 5. VIEW: vw_aniversariantes_do_dia
-- ==========================================================
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
    (EXTRACT(MONTH FROM d.data_nascimento) = EXTRACT(MONTH FROM CURRENT_DATE)
     AND EXTRACT(DAY FROM d.data_nascimento) = EXTRACT(DAY FROM CURRENT_DATE))
    OR
    (EXTRACT(DOW FROM CURRENT_DATE) = 1
     AND cc.enviar_domingo = false
     AND EXTRACT(MONTH FROM d.data_nascimento) = EXTRACT(MONTH FROM CURRENT_DATE - INTERVAL '1 day')
     AND EXTRACT(DAY FROM d.data_nascimento) = EXTRACT(DAY FROM CURRENT_DATE - INTERVAL '1 day'))
  )
  AND (d.enviado_aniversario_em IS NULL OR EXTRACT(YEAR FROM d.enviado_aniversario_em) < EXTRACT(YEAR FROM CURRENT_DATE))
  AND (d.lixo IS NULL OR d.lixo = false)
  AND (d.bloquear_mensagens IS NULL OR d.bloquear_mensagens = false)
  AND (cp.usage_count < cp.limite_mensal OR cp.limite_mensal IS NULL)
  AND NOT (EXTRACT(DOW FROM CURRENT_DATE) = 0 AND cc.enviar_domingo = false)
  AND usuario_pode_enviar(u.id);

ALTER VIEW vw_aniversariantes_do_dia SET (security_invoker = true);


-- ==========================================================
-- 6. VIEW: vw_aulas_lembrete_1hora (3 UNIONs)
-- ==========================================================
DROP VIEW IF EXISTS vw_aulas_lembrete_1hora;
CREATE VIEW vw_aulas_lembrete_1hora AS
-- ----- PARTE 1: GRADE FIXA SEMANAL (legado) -----
SELECT
  gh.id AS horario_id,
  'grade_horarios' AS tabela_origem,
  gh.devedor_id,
  gh.dia_semana,
  gh.horario,
  gh.descricao,
  gh.lembrete_enviado_em,
  d.nome AS nome_cliente,
  d.telefone,
  d.user_id,
  u.plano,
  mz.instance_name AS evolution_instance_name,
  (SELECT valor FROM config WHERE chave = 'evolution_api_key' LIMIT 1) AS evolution_api_key,
  (SELECT valor FROM config WHERE chave = 'evolution_api_url' LIMIT 1) AS evolution_api_url,
  u.nome_empresa,
  cp.usage_count,
  cp.limite_mensal,
  COALESCE(t.mensagem, '') AS template_mensagem
FROM grade_horarios gh
INNER JOIN devedores d ON gh.devedor_id = d.id
INNER JOIN usuarios u ON d.user_id = u.id
INNER JOIN mensallizap mz ON mz.user_id = d.user_id AND mz.conectado = true
INNER JOIN configuracoes_cobranca cc ON cc.user_id = d.user_id AND cc.enviar_lembrete_aula = true
LEFT JOIN controle_planos cp ON cp.user_id = d.user_id
LEFT JOIN templates t ON t.user_id = d.user_id AND t.tipo = 'class_reminder' AND t.ativo = true
WHERE gh.ativo = true
  AND (d.lixo IS NULL OR d.lixo = false)
  AND (d.bloquear_mensagens IS NULL OR d.bloquear_mensagens = false)
  AND gh.dia_semana = EXTRACT(DOW FROM (NOW() AT TIME ZONE 'America/Sao_Paulo'))
  AND gh.horario BETWEEN ((NOW() AT TIME ZONE 'America/Sao_Paulo')::time + INTERVAL '55 minutes')
                     AND ((NOW() AT TIME ZONE 'America/Sao_Paulo')::time + INTERVAL '75 minutes')
  AND (gh.lembrete_enviado_em IS NULL
       OR (gh.lembrete_enviado_em AT TIME ZONE 'America/Sao_Paulo')::date < (NOW() AT TIME ZONE 'America/Sao_Paulo')::date)
  AND (cp.usage_count < cp.limite_mensal OR cp.limite_mensal IS NULL)
  AND usuario_pode_enviar(u.id)

UNION ALL

-- ----- PARTE 2: AGENDAMENTOS ONLINE (avulsos) -----
SELECT
  ag.id AS horario_id,
  'agendamentos' AS tabela_origem,
  ag.devedor_id,
  EXTRACT(DOW FROM ag.data)::SMALLINT AS dia_semana,
  a.horario,
  a.descricao,
  ag.lembrete_enviado_em,
  d.nome AS nome_cliente,
  d.telefone,
  d.user_id,
  u.plano,
  mz.instance_name AS evolution_instance_name,
  (SELECT valor FROM config WHERE chave = 'evolution_api_key' LIMIT 1) AS evolution_api_key,
  (SELECT valor FROM config WHERE chave = 'evolution_api_url' LIMIT 1) AS evolution_api_url,
  u.nome_empresa,
  cp.usage_count,
  cp.limite_mensal,
  COALESCE(t.mensagem, '') AS template_mensagem
FROM agendamentos ag
INNER JOIN aulas a ON a.id = ag.aula_id
INNER JOIN devedores d ON ag.devedor_id = d.id
INNER JOIN usuarios u ON ag.user_id = u.id
INNER JOIN mensallizap mz ON mz.user_id = ag.user_id AND mz.conectado = true
INNER JOIN configuracoes_cobranca cc ON cc.user_id = ag.user_id AND cc.enviar_lembrete_aula = true
LEFT JOIN controle_planos cp ON cp.user_id = ag.user_id
LEFT JOIN templates t ON t.user_id = ag.user_id AND t.tipo = 'class_reminder' AND t.ativo = true
WHERE ag.status = 'confirmado'
  AND a.ativo = true
  AND (d.lixo IS NULL OR d.lixo = false)
  AND (d.bloquear_mensagens IS NULL OR d.bloquear_mensagens = false)
  AND ((ag.data + a.horario) AT TIME ZONE 'America/Sao_Paulo')
        BETWEEN (NOW() + INTERVAL '55 minutes')
            AND (NOW() + INTERVAL '75 minutes')
  AND ag.lembrete_enviado_em IS NULL
  AND (cp.usage_count < cp.limite_mensal OR cp.limite_mensal IS NULL)
  AND usuario_pode_enviar(u.id)

UNION ALL

-- ----- PARTE 3: ALUNOS FIXOS DO AGENDAMENTO ONLINE -----
SELECT
  af.id AS horario_id,
  'aulas_fixos' AS tabela_origem,
  af.devedor_id,
  a.dia_semana,
  a.horario,
  a.descricao,
  af.lembrete_enviado_em,
  d.nome AS nome_cliente,
  d.telefone,
  d.user_id,
  u.plano,
  mz.instance_name AS evolution_instance_name,
  (SELECT valor FROM config WHERE chave = 'evolution_api_key' LIMIT 1) AS evolution_api_key,
  (SELECT valor FROM config WHERE chave = 'evolution_api_url' LIMIT 1) AS evolution_api_url,
  u.nome_empresa,
  cp.usage_count,
  cp.limite_mensal,
  COALESCE(t.mensagem, '') AS template_mensagem
FROM aulas_fixos af
INNER JOIN aulas a ON a.id = af.aula_id
INNER JOIN devedores d ON af.devedor_id = d.id
INNER JOIN usuarios u ON af.user_id = u.id
INNER JOIN mensallizap mz ON mz.user_id = af.user_id AND mz.conectado = true
INNER JOIN configuracoes_cobranca cc ON cc.user_id = af.user_id AND cc.enviar_lembrete_aula = true
LEFT JOIN controle_planos cp ON cp.user_id = af.user_id
LEFT JOIN templates t ON t.user_id = af.user_id AND t.tipo = 'class_reminder' AND t.ativo = true
WHERE a.ativo = true
  AND (d.lixo IS NULL OR d.lixo = false)
  AND (d.bloquear_mensagens IS NULL OR d.bloquear_mensagens = false)
  AND a.dia_semana = EXTRACT(DOW FROM (NOW() AT TIME ZONE 'America/Sao_Paulo'))
  AND a.horario BETWEEN ((NOW() AT TIME ZONE 'America/Sao_Paulo')::time + INTERVAL '55 minutes')
                    AND ((NOW() AT TIME ZONE 'America/Sao_Paulo')::time + INTERVAL '75 minutes')
  AND (af.lembrete_enviado_em IS NULL
       OR (af.lembrete_enviado_em AT TIME ZONE 'America/Sao_Paulo')::date < (NOW() AT TIME ZONE 'America/Sao_Paulo')::date)
  AND NOT EXISTS (
        SELECT 1 FROM ausencias_fixos ax
        WHERE ax.aula_id = af.aula_id
          AND ax.devedor_id = af.devedor_id
          AND ax.data = (NOW() AT TIME ZONE 'America/Sao_Paulo')::date
  )
  AND (cp.usage_count < cp.limite_mensal OR cp.limite_mensal IS NULL)
  AND usuario_pode_enviar(u.id);

ALTER VIEW vw_aulas_lembrete_1hora SET (security_invoker = true);


-- ==========================================================
-- GRANT
-- ==========================================================
GRANT SELECT ON vw_parcelas_lembrete_3dias  TO anon, authenticated, service_role;
GRANT SELECT ON vw_parcelas_no_dia          TO anon, authenticated, service_role;
GRANT SELECT ON vw_parcelas_em_atraso       TO anon, authenticated, service_role;
GRANT SELECT ON vw_aniversariantes_do_dia   TO anon, authenticated, service_role;
GRANT SELECT ON vw_aulas_lembrete_1hora     TO anon, authenticated, service_role;


-- ==========================================================
-- VERIFICACAO
-- ==========================================================
-- Lista usuarios que estao bloqueados e devem parar de enviar
SELECT
  u.id,
  u.email,
  u.nome_empresa,
  u.plano,
  u.plano_pago,
  u.trial_fim,
  usuario_pode_enviar(u.id) as pode_enviar
FROM usuarios u
WHERE usuario_pode_enviar(u.id) = false
ORDER BY u.email;
