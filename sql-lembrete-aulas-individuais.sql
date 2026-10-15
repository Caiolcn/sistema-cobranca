-- ==========================================
-- LEMBRETES DE AULA (1H E 24H) — INCLUIR ALUNO INDIVIDUAL DA AGENDA NOVA
-- MensalliZap
-- ==========================================
-- Aluno individual da Agenda Nova mora direto em `aulas.devedor_id` (uma linha
-- de `aulas` por aluno e dia da semana) e NÃO usa `aulas_fixos`. As views de
-- lembrete só liam `agendamentos` e `aulas_fixos`, então essas aulas nunca
-- recebiam lembrete — caso RS PERSONAL TREINER (07/10): toggles ligados,
-- WhatsApp conectado e zero `class_reminder` na vida.
--
-- Este script:
--   1. Adiciona `lembrete_enviado_em` e `lembrete_24h_enviado_em` em `aulas`
--   2. vw_aulas_lembrete_1hora ganha a PARTE 3 (tabela_origem = 'aulas').
--      O n8n carimba via PATCH /{tabela_origem}?id=eq.{horario_id} com
--      lembrete_enviado_em + updated_at — `aulas` já tem updated_at, então o
--      workflow NÃO muda.
--   3. vw_aulas_lembrete_24h ganha as colunas `origem` e `registro_id` (no fim,
--      exigência do CREATE OR REPLACE) e a parte de aulas individuais.
--
-- ORDEM DE DEPLOY: publicar a edge function lembrete-aula-24h ANTES de rodar
-- este script. A versão antiga carimba sempre `agendamentos` por
-- agendamento_id; com linha de `aulas` (agendamento_id NULL) o carimbo não
-- pegaria e o aluno receberia o lembrete a cada 15 min da janela.
--
-- Nos dois casos a aula individual é PULADA quando, para aquela data, há
-- ausência registrada (ausencias_fixos) ou falta já marcada (presencas com
-- presente = false). E também quando o mesmo aluno está em aulas_fixos da
-- mesma aula, pra não sair lembrete em dobro.
-- ==========================================

-- ==========================================
-- 1. COLUNAS EM aulas
-- ==========================================
ALTER TABLE aulas ADD COLUMN IF NOT EXISTS lembrete_enviado_em TIMESTAMPTZ;
ALTER TABLE aulas ADD COLUMN IF NOT EXISTS lembrete_24h_enviado_em TIMESTAMPTZ;

-- ==========================================
-- 2. LEMBRETE 1H (lido pelo n8n)
-- ==========================================
CREATE OR REPLACE VIEW vw_aulas_lembrete_1hora AS
SELECT horario_id, tabela_origem, devedor_id, dia_semana, horario, descricao,
       lembrete_enviado_em, nome_cliente, telefone, user_id, plano,
       evolution_instance_name, evolution_api_key, evolution_api_url,
       nome_empresa, usage_count, limite_mensal, template_mensagem
FROM (
  -- ----- PARTE 1: AGENDAMENTOS ONLINE (avulsos) -----
  SELECT
    ag.id AS horario_id,
    'agendamentos'::text AS tabela_origem,
    ag.devedor_id,
    EXTRACT(DOW FROM ag.data)::smallint AS dia_semana,
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
  JOIN aulas a ON a.id = ag.aula_id
  JOIN devedores d ON ag.devedor_id = d.id
  JOIN usuarios u ON ag.user_id = u.id
  JOIN mensallizap mz ON mz.user_id = ag.user_id AND mz.conectado = true
  JOIN configuracoes_cobranca cc ON cc.user_id = ag.user_id AND cc.enviar_lembrete_aula = true
  LEFT JOIN controle_planos cp ON cp.user_id = ag.user_id
  LEFT JOIN templates t ON t.user_id = ag.user_id AND t.tipo = 'class_reminder' AND t.ativo = true
  WHERE ag.status = 'confirmado'
    AND a.ativo = true
    AND (d.lixo IS NULL OR d.lixo = false)
    AND (d.bloquear_mensagens IS NULL OR d.bloquear_mensagens = false)
    AND (d.comunicacoes_ativas IS NULL OR d.comunicacoes_ativas = true)
    AND ((ag.data + a.horario) AT TIME ZONE 'America/Sao_Paulo') >= (NOW() + INTERVAL '55 minutes')
    AND ((ag.data + a.horario) AT TIME ZONE 'America/Sao_Paulo') <= (NOW() + INTERVAL '75 minutes')
    AND ag.lembrete_enviado_em IS NULL
    AND (cp.usage_count < cp.limite_mensal OR cp.limite_mensal IS NULL)
    AND usuario_pode_enviar(u.id)

  UNION ALL

  -- ----- PARTE 2: ALUNOS FIXOS EM TURMA -----
  SELECT
    af.id AS horario_id,
    'aulas_fixos'::text AS tabela_origem,
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
  JOIN aulas a ON a.id = af.aula_id
  JOIN devedores d ON af.devedor_id = d.id
  JOIN usuarios u ON af.user_id = u.id
  JOIN mensallizap mz ON mz.user_id = af.user_id AND mz.conectado = true
  JOIN configuracoes_cobranca cc ON cc.user_id = af.user_id AND cc.enviar_lembrete_aula = true
  LEFT JOIN controle_planos cp ON cp.user_id = af.user_id
  LEFT JOIN templates t ON t.user_id = af.user_id AND t.tipo = 'class_reminder' AND t.ativo = true
  WHERE a.ativo = true
    AND (d.lixo IS NULL OR d.lixo = false)
    AND (d.bloquear_mensagens IS NULL OR d.bloquear_mensagens = false)
    AND (d.comunicacoes_ativas IS NULL OR d.comunicacoes_ativas = true)
    AND a.dia_semana::numeric = EXTRACT(DOW FROM (NOW() AT TIME ZONE 'America/Sao_Paulo'))
    AND a.horario >= ((NOW() AT TIME ZONE 'America/Sao_Paulo')::time + INTERVAL '55 minutes')
    AND a.horario <= ((NOW() AT TIME ZONE 'America/Sao_Paulo')::time + INTERVAL '75 minutes')
    AND (af.lembrete_enviado_em IS NULL
         OR (af.lembrete_enviado_em AT TIME ZONE 'America/Sao_Paulo')::date < (NOW() AT TIME ZONE 'America/Sao_Paulo')::date)
    AND NOT EXISTS (
      SELECT 1 FROM ausencias_fixos ax
      WHERE ax.aula_id = af.aula_id AND ax.devedor_id = af.devedor_id
        AND ax.data = (NOW() AT TIME ZONE 'America/Sao_Paulo')::date)
    AND (cp.usage_count < cp.limite_mensal OR cp.limite_mensal IS NULL)
    AND usuario_pode_enviar(u.id)

  UNION ALL

  -- ----- PARTE 3: ALUNO INDIVIDUAL DA AGENDA NOVA (aulas.devedor_id) -----
  SELECT
    a.id AS horario_id,
    'aulas'::text AS tabela_origem,
    a.devedor_id,
    a.dia_semana,
    a.horario,
    a.descricao,
    a.lembrete_enviado_em,
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
  FROM aulas a
  JOIN devedores d ON d.id = a.devedor_id
  JOIN usuarios u ON u.id = a.user_id
  JOIN mensallizap mz ON mz.user_id = a.user_id AND mz.conectado = true
  JOIN configuracoes_cobranca cc ON cc.user_id = a.user_id AND cc.enviar_lembrete_aula = true
  LEFT JOIN controle_planos cp ON cp.user_id = a.user_id
  LEFT JOIN templates t ON t.user_id = a.user_id AND t.tipo = 'class_reminder' AND t.ativo = true
  WHERE a.ativo = true
    AND a.devedor_id IS NOT NULL
    AND (d.lixo IS NULL OR d.lixo = false)
    AND (d.bloquear_mensagens IS NULL OR d.bloquear_mensagens = false)
    AND (d.comunicacoes_ativas IS NULL OR d.comunicacoes_ativas = true)
    AND a.dia_semana::numeric = EXTRACT(DOW FROM (NOW() AT TIME ZONE 'America/Sao_Paulo'))
    AND a.horario >= ((NOW() AT TIME ZONE 'America/Sao_Paulo')::time + INTERVAL '55 minutes')
    AND a.horario <= ((NOW() AT TIME ZONE 'America/Sao_Paulo')::time + INTERVAL '75 minutes')
    AND (a.lembrete_enviado_em IS NULL
         OR (a.lembrete_enviado_em AT TIME ZONE 'America/Sao_Paulo')::date < (NOW() AT TIME ZONE 'America/Sao_Paulo')::date)
    AND NOT EXISTS (
      SELECT 1 FROM ausencias_fixos ax
      WHERE ax.aula_id = a.id AND ax.devedor_id = a.devedor_id
        AND ax.data = (NOW() AT TIME ZONE 'America/Sao_Paulo')::date)
    AND NOT EXISTS (
      SELECT 1 FROM presencas p
      WHERE p.aula_id = a.id AND p.devedor_id = a.devedor_id AND p.presente = false
        AND p.data = (NOW() AT TIME ZONE 'America/Sao_Paulo')::date)
    AND NOT EXISTS (
      SELECT 1 FROM aulas_fixos af2
      WHERE af2.aula_id = a.id AND af2.devedor_id = a.devedor_id)
    AND (cp.usage_count < cp.limite_mensal OR cp.limite_mensal IS NULL)
    AND usuario_pode_enviar(u.id)
) _orig
WHERE usuario_pode_enviar(user_id) AND usuario_tem_plano(user_id, 'pro');

-- ==========================================
-- 3. LEMBRETE 24H (lido pela edge function lembrete-aula-24h)
-- ==========================================
-- Aula individual é semanal: a ocorrência de amanhã é calculada pelo
-- dia_semana. Olha hoje e amanhã porque, perto da meia-noite, a janela de
-- 23h–24h15 ainda cai em aula de HOJE à noite.
-- Carimbo: a próxima ocorrência da mesma linha está a 7 dias, então "enviado
-- há mais de 2 dias" é seguro pra liberar de novo.
CREATE OR REPLACE VIEW vw_aulas_lembrete_24h AS
SELECT
  ag.id AS agendamento_id,
  ag.devedor_id,
  ag.user_id,
  ag.data AS data_aula,
  a.horario,
  a.descricao,
  COALESCE(NULLIF(d.responsavel_nome, ''), d.nome) AS nome_cliente,
  d.nome AS nome_aluno,
  d.telefone,
  d.experimental,
  u.nome_empresa,
  mz.instance_name AS evolution_instance_name,
  mz.conectado,
  'agendamentos'::text AS origem,
  ag.id AS registro_id
FROM agendamentos ag
JOIN aulas a ON a.id = ag.aula_id
JOIN devedores d ON d.id = ag.devedor_id
JOIN usuarios u ON u.id = ag.user_id
JOIN mensallizap mz ON mz.user_id = ag.user_id
JOIN configuracoes_cobranca cc ON cc.user_id = ag.user_id AND cc.enviar_lembrete_aula_24h = true
LEFT JOIN controle_planos cp ON cp.user_id = ag.user_id
WHERE ag.status = 'confirmado'
  AND a.ativo = true
  AND (d.lixo IS NULL OR d.lixo = false)
  AND (d.bloquear_mensagens IS NULL OR d.bloquear_mensagens = false)
  AND (d.comunicacoes_ativas IS NULL OR d.comunicacoes_ativas = true)
  AND d.telefone IS NOT NULL
  AND ((ag.data + a.horario) AT TIME ZONE 'America/Sao_Paulo') >= (NOW() + INTERVAL '23 hours')
  AND ((ag.data + a.horario) AT TIME ZONE 'America/Sao_Paulo') <= (NOW() + INTERVAL '24 hours 15 minutes')
  AND ag.lembrete_24h_enviado_em IS NULL
  AND (cp.usage_count < cp.limite_mensal OR cp.limite_mensal IS NULL)
  AND usuario_pode_enviar(ag.user_id)
  AND usuario_tem_plano(ag.user_id, 'pro')

UNION ALL

SELECT
  NULL::uuid AS agendamento_id,
  a.devedor_id,
  a.user_id,
  dt.data_aula,
  a.horario,
  a.descricao,
  COALESCE(NULLIF(d.responsavel_nome, ''), d.nome) AS nome_cliente,
  d.nome AS nome_aluno,
  d.telefone,
  d.experimental,
  u.nome_empresa,
  mz.instance_name AS evolution_instance_name,
  mz.conectado,
  'aulas'::text AS origem,
  a.id AS registro_id
FROM aulas a
CROSS JOIN LATERAL (
  SELECT ((NOW() AT TIME ZONE 'America/Sao_Paulo')::date + k) AS data_aula
  FROM generate_series(0, 1) AS k
) dt
JOIN devedores d ON d.id = a.devedor_id
JOIN usuarios u ON u.id = a.user_id
JOIN mensallizap mz ON mz.user_id = a.user_id
JOIN configuracoes_cobranca cc ON cc.user_id = a.user_id AND cc.enviar_lembrete_aula_24h = true
LEFT JOIN controle_planos cp ON cp.user_id = a.user_id
WHERE a.ativo = true
  AND a.devedor_id IS NOT NULL
  AND a.dia_semana::numeric = EXTRACT(DOW FROM dt.data_aula)
  AND (d.lixo IS NULL OR d.lixo = false)
  AND (d.bloquear_mensagens IS NULL OR d.bloquear_mensagens = false)
  AND (d.comunicacoes_ativas IS NULL OR d.comunicacoes_ativas = true)
  AND d.telefone IS NOT NULL
  AND ((dt.data_aula + a.horario) AT TIME ZONE 'America/Sao_Paulo') >= (NOW() + INTERVAL '23 hours')
  AND ((dt.data_aula + a.horario) AT TIME ZONE 'America/Sao_Paulo') <= (NOW() + INTERVAL '24 hours 15 minutes')
  AND (a.lembrete_24h_enviado_em IS NULL OR a.lembrete_24h_enviado_em < NOW() - INTERVAL '2 days')
  AND NOT EXISTS (
    SELECT 1 FROM ausencias_fixos ax
    WHERE ax.aula_id = a.id AND ax.devedor_id = a.devedor_id AND ax.data = dt.data_aula)
  AND NOT EXISTS (
    SELECT 1 FROM presencas p
    WHERE p.aula_id = a.id AND p.devedor_id = a.devedor_id AND p.presente = false
      AND p.data = dt.data_aula)
  AND NOT EXISTS (
    SELECT 1 FROM aulas_fixos af2
    WHERE af2.aula_id = a.id AND af2.devedor_id = a.devedor_id)
  AND (cp.usage_count < cp.limite_mensal OR cp.limite_mensal IS NULL)
  AND usuario_pode_enviar(a.user_id)
  AND usuario_tem_plano(a.user_id, 'pro');

-- ==========================================
-- 4. CONFERÊNCIA (não envia nada)
-- ==========================================
SELECT
  (SELECT count(*) FROM vw_aulas_lembrete_1hora WHERE tabela_origem = 'aulas') AS individuais_1h_agora,
  (SELECT count(*) FROM vw_aulas_lembrete_24h WHERE origem = 'aulas') AS individuais_24h_agora;
