-- ==========================================
-- LEMBRETE 1H ANTES — INCLUIR AGENDAMENTOS ONLINE
-- MensalliZap
-- ==========================================
-- Este script:
--   1. Adiciona coluna lembrete_enviado_em em `agendamentos`
--   2. Recria a view vw_aulas_lembrete_1hora unindo grade_horarios + agendamentos
--   3. Expõe `tabela_origem` para que o workflow saiba qual tabela atualizar
-- ==========================================

-- ==========================================
-- 1. ADICIONAR COLUNA EM agendamentos
-- ==========================================
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'agendamentos' AND column_name = 'lembrete_enviado_em'
    ) THEN
        ALTER TABLE agendamentos ADD COLUMN lembrete_enviado_em TIMESTAMPTZ;
        RAISE NOTICE 'Coluna lembrete_enviado_em adicionada em agendamentos';
    ELSE
        RAISE NOTICE 'Coluna lembrete_enviado_em ja existe em agendamentos';
    END IF;
END $$;

-- ==========================================
-- 2. RECRIAR VIEW UNINDO GRADE_HORARIOS + AGENDAMENTOS
-- ==========================================
DROP VIEW IF EXISTS vw_aulas_lembrete_1hora;

CREATE VIEW vw_aulas_lembrete_1hora AS
-- ----- PARTE 1: GRADE FIXA SEMANAL -----
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
  AND gh.dia_semana = EXTRACT(DOW FROM (NOW() AT TIME ZONE 'America/Sao_Paulo'))
  AND gh.horario BETWEEN ((NOW() AT TIME ZONE 'America/Sao_Paulo')::time + INTERVAL '55 minutes')
                     AND ((NOW() AT TIME ZONE 'America/Sao_Paulo')::time + INTERVAL '75 minutes')
  AND (gh.lembrete_enviado_em IS NULL
       OR (gh.lembrete_enviado_em AT TIME ZONE 'America/Sao_Paulo')::date < (NOW() AT TIME ZONE 'America/Sao_Paulo')::date)
  AND (cp.usage_count < cp.limite_mensal OR cp.limite_mensal IS NULL)

UNION ALL

-- ----- PARTE 2: AGENDAMENTOS ONLINE -----
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
  -- Combinar data + horário e checar se está 55-75 min no futuro
  AND ((ag.data + a.horario) AT TIME ZONE 'America/Sao_Paulo')
        BETWEEN (NOW() + INTERVAL '55 minutes')
            AND (NOW() + INTERVAL '75 minutes')
  -- Lembrete ainda não enviado para este agendamento específico
  AND ag.lembrete_enviado_em IS NULL
  AND (cp.usage_count < cp.limite_mensal OR cp.limite_mensal IS NULL);

-- ==========================================
-- VERIFICAR RESULTADO
-- ==========================================
SELECT 'agendamentos' as tabela, column_name, data_type
FROM information_schema.columns
WHERE table_name = 'agendamentos' AND column_name = 'lembrete_enviado_em';

SELECT * FROM vw_aulas_lembrete_1hora LIMIT 5;
