-- Coluna pra ativar/desativar resumo diário
ALTER TABLE configuracoes_cobranca ADD COLUMN IF NOT EXISTS enviar_resumo_diario BOOLEAN DEFAULT false;

-- View: resumo diário de agendamentos (aulas do dia com fixos + agendados)
DROP VIEW IF EXISTS vw_resumo_diario_agendamento;

CREATE VIEW vw_resumo_diario_agendamento AS
SELECT
    u.id AS user_id,
    u.nome_empresa,
    u.telefone AS telefone_admin,
    u.plano,
    a.id AS aula_id,
    a.horario,
    a.descricao,
    a.capacidade,
    COALESCE(
        (SELECT string_agg(d.nome, ', ' ORDER BY d.nome)
         FROM aulas_fixos af
         JOIN devedores d ON d.id = af.devedor_id
         WHERE af.aula_id = a.id AND (af.ativo IS NULL OR af.ativo = true)),
        ''
    ) AS nomes_fixos,
    COALESCE(
        (SELECT COUNT(*)
         FROM aulas_fixos af
         WHERE af.aula_id = a.id AND (af.ativo IS NULL OR af.ativo = true)),
        0
    )::INTEGER AS total_fixos,
    COALESCE(
        (SELECT string_agg(d.nome, ', ' ORDER BY d.nome)
         FROM agendamentos ag
         JOIN devedores d ON d.id = ag.devedor_id
         WHERE ag.aula_id = a.id AND ag.data = CURRENT_DATE AND ag.status = 'confirmado'),
        ''
    ) AS nomes_agendados,
    COALESCE(
        (SELECT COUNT(*)
         FROM agendamentos ag
         WHERE ag.aula_id = a.id AND ag.data = CURRENT_DATE AND ag.status = 'confirmado'),
        0
    )::INTEGER AS total_agendados,
    mz.instance_name AS evolution_instance_name,
    (SELECT valor FROM config WHERE chave = 'evolution_api_key' LIMIT 1) AS evolution_api_key,
    (SELECT valor FROM config WHERE chave = 'evolution_api_url' LIMIT 1) AS evolution_api_url
FROM aulas a
JOIN usuarios u ON u.id = a.user_id
JOIN configuracoes_cobranca cc ON cc.user_id = u.id AND cc.enviar_resumo_diario = true
JOIN mensallizap mz ON mz.user_id = u.id AND mz.conectado = true
WHERE a.ativo = true
    AND a.dia_semana = EXTRACT(DOW FROM CURRENT_DATE)
    AND u.plano = 'premium'
    AND (u.plano_pago = true OR u.trial_ativo = true)
ORDER BY u.id, a.horario;
