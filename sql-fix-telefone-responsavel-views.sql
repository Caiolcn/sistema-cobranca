-- =====================================================
-- FIX: cobranças automáticas indo para o telefone do aluno
-- em vez do telefone do responsável legal.
--
-- As views usadas pelo n8n (cobrancas-3em1) já trocavam o NOME
-- para o responsável, mas continuavam devolvendo d.telefone.
-- Resultado: "Oi, <responsável>" chegando no WhatsApp do aluno.
--
-- Correção: telefone = responsavel_telefone quando preenchido,
-- senão telefone do aluno (mesma regra de src/utils/destinatario.js).
-- Nenhuma outra coluna/filtro foi alterado.
-- =====================================================

-- VIEW 1: lembrete 3 dias antes
CREATE OR REPLACE VIEW vw_parcelas_lembrete_3dias AS
SELECT m.id AS parcela_id,
    m.devedor_id,
    m.valor AS valor_em_aberto,
    m.data_vencimento,
    m.descricao,
    m.total_envios,
    3 AS dias_restantes,
    COALESCE(NULLIF(TRIM(BOTH FROM d.responsavel_nome), ''::text), d.nome) AS nome_cliente,
    COALESCE(NULLIF(TRIM(BOTH FROM d.responsavel_telefone), ''::text), d.telefone) AS telefone,
    d.user_id,
    u.plano,
    mz.instance_name AS evolution_instance_name,
    (SELECT config.valor FROM config WHERE config.chave = 'evolution_api_key'::text LIMIT 1) AS evolution_api_key,
    (SELECT config.valor FROM config WHERE config.chave = 'evolution_api_url'::text LIMIT 1) AS evolution_api_url,
    u.chave_pix,
    u.nome_empresa,
    cp.usage_count,
    cp.limite_mensal,
    COALESCE(t.mensagem, ''::text) AS template_mensagem,
    d.portal_token,
    (SELECT config.valor FROM config WHERE config.chave = (d.user_id)::text || '_metodo_pagamento_whatsapp'::text LIMIT 1) AS metodo_pagamento,
    d.nome AS nome_aluno_real,
    NULLIF(TRIM(BOTH FROM d.responsavel_nome), ''::text) AS nome_responsavel
FROM mensalidades m
JOIN devedores d ON m.devedor_id = d.id
JOIN usuarios u ON d.user_id = u.id
JOIN mensallizap mz ON mz.user_id = d.user_id AND mz.conectado = true
JOIN configuracoes_cobranca cc ON cc.user_id = d.user_id AND cc.enviar_3_dias_antes = true
LEFT JOIN controle_planos cp ON cp.user_id = d.user_id
LEFT JOIN templates t ON t.user_id = d.user_id AND t.tipo = 'pre_due_3days'::text AND t.ativo = true
WHERE m.status = 'pendente'::text
  AND m.enviado_3dias = false
  AND m.data_vencimento = (CURRENT_DATE + '3 days'::interval)
  AND d.assinatura_ativa = true
  AND (d.lixo IS NULL OR d.lixo = false)
  AND (d.bloquear_mensagens IS NULL OR d.bloquear_mensagens = false)
  AND (d.comunicacoes_ativas IS NULL OR d.comunicacoes_ativas = true)
  AND (cp.usage_count < cp.limite_mensal OR cp.limite_mensal IS NULL)
  AND usuario_pode_enviar(u.id)
  AND (m.lixo IS NULL OR m.lixo = false)
  AND usuario_tem_plano(d.user_id, 'pro'::text);

-- VIEW 2: vence hoje
CREATE OR REPLACE VIEW vw_parcelas_no_dia AS
SELECT parcela_id, devedor_id, valor_em_aberto, data_vencimento, descricao,
    total_envios, dias_restantes, nome_cliente, telefone, user_id, plano,
    evolution_instance_name, evolution_api_key, evolution_api_url, chave_pix,
    nome_empresa, usage_count, limite_mensal, template_mensagem, portal_token,
    metodo_pagamento, nome_aluno_real, nome_responsavel
FROM (
    SELECT m.id AS parcela_id,
        m.devedor_id,
        m.valor AS valor_em_aberto,
        m.data_vencimento,
        m.descricao,
        m.total_envios,
        0 AS dias_restantes,
        COALESCE(NULLIF(TRIM(BOTH FROM d.responsavel_nome), ''::text), d.nome) AS nome_cliente,
        COALESCE(NULLIF(TRIM(BOTH FROM d.responsavel_telefone), ''::text), d.telefone) AS telefone,
        d.user_id,
        u.plano,
        mz.instance_name AS evolution_instance_name,
        (SELECT config.valor FROM config WHERE config.chave = 'evolution_api_key'::text LIMIT 1) AS evolution_api_key,
        (SELECT config.valor FROM config WHERE config.chave = 'evolution_api_url'::text LIMIT 1) AS evolution_api_url,
        u.chave_pix,
        u.nome_empresa,
        cp.usage_count,
        cp.limite_mensal,
        COALESCE(t.mensagem, ''::text) AS template_mensagem,
        d.portal_token,
        (SELECT config.valor FROM config WHERE config.chave = (d.user_id)::text || '_metodo_pagamento_whatsapp'::text LIMIT 1) AS metodo_pagamento,
        d.nome AS nome_aluno_real,
        NULLIF(TRIM(BOTH FROM d.responsavel_nome), ''::text) AS nome_responsavel
    FROM mensalidades m
    JOIN devedores d ON m.devedor_id = d.id
    JOIN usuarios u ON d.user_id = u.id
    JOIN mensallizap mz ON mz.user_id = d.user_id AND mz.conectado = true
    JOIN configuracoes_cobranca cc ON cc.user_id = d.user_id AND cc.enviar_no_dia = true
    LEFT JOIN controle_planos cp ON cp.user_id = d.user_id
    LEFT JOIN templates t ON t.user_id = d.user_id AND t.tipo = 'due_day'::text AND t.ativo = true
    WHERE m.status = 'pendente'::text
      AND m.enviado_no_dia = false
      AND m.data_vencimento = CURRENT_DATE
      AND d.assinatura_ativa = true
      AND (d.lixo IS NULL OR d.lixo = false)
      AND (d.bloquear_mensagens IS NULL OR d.bloquear_mensagens = false)
      AND (d.comunicacoes_ativas IS NULL OR d.comunicacoes_ativas = true)
      AND (cp.usage_count < cp.limite_mensal OR cp.limite_mensal IS NULL)
      AND usuario_pode_enviar(u.id)
      AND (m.lixo IS NULL OR m.lixo = false)
) _orig
WHERE usuario_pode_enviar(user_id) AND usuario_tem_plano(user_id, 'starter'::text);

-- VIEW 3: 3 dias em atraso
CREATE OR REPLACE VIEW vw_parcelas_em_atraso AS
SELECT m.id AS parcela_id,
    m.devedor_id,
    m.valor AS valor_em_aberto,
    m.data_vencimento,
    m.descricao,
    m.total_envios,
    3 AS dias_atraso,
    COALESCE(NULLIF(TRIM(BOTH FROM d.responsavel_nome), ''::text), d.nome) AS nome_cliente,
    COALESCE(NULLIF(TRIM(BOTH FROM d.responsavel_telefone), ''::text), d.telefone) AS telefone,
    d.user_id,
    u.plano,
    mz.instance_name AS evolution_instance_name,
    (SELECT config.valor FROM config WHERE config.chave = 'evolution_api_key'::text LIMIT 1) AS evolution_api_key,
    (SELECT config.valor FROM config WHERE config.chave = 'evolution_api_url'::text LIMIT 1) AS evolution_api_url,
    u.chave_pix,
    u.nome_empresa,
    cp.usage_count,
    cp.limite_mensal,
    COALESCE(t.mensagem, ''::text) AS template_mensagem,
    d.portal_token,
    (SELECT config.valor FROM config WHERE config.chave = (d.user_id)::text || '_metodo_pagamento_whatsapp'::text LIMIT 1) AS metodo_pagamento,
    d.nome AS nome_aluno_real,
    NULLIF(TRIM(BOTH FROM d.responsavel_nome), ''::text) AS nome_responsavel
FROM mensalidades m
JOIN devedores d ON m.devedor_id = d.id
JOIN usuarios u ON d.user_id = u.id
JOIN mensallizap mz ON mz.user_id = d.user_id AND mz.conectado = true
JOIN configuracoes_cobranca cc ON cc.user_id = d.user_id AND cc.enviar_3_dias_depois = true
LEFT JOIN controle_planos cp ON cp.user_id = d.user_id
LEFT JOIN templates t ON t.user_id = d.user_id AND t.tipo = 'overdue'::text AND t.ativo = true
WHERE m.status = 'pendente'::text
  AND m.enviado_vencimento = false
  AND m.data_vencimento = (CURRENT_DATE - '3 days'::interval)
  AND d.assinatura_ativa = true
  AND (d.lixo IS NULL OR d.lixo = false)
  AND (d.bloquear_mensagens IS NULL OR d.bloquear_mensagens = false)
  AND (d.comunicacoes_ativas IS NULL OR d.comunicacoes_ativas = true)
  AND (cp.usage_count < cp.limite_mensal OR cp.limite_mensal IS NULL)
  AND usuario_pode_enviar(u.id)
  AND (m.lixo IS NULL OR m.lixo = false)
  AND usuario_tem_plano(d.user_id, 'pro'::text);

-- Conferência: as 3 devem retornar true
SELECT viewname, position('responsavel_telefone' in definition) > 0 AS usa_tel_responsavel
FROM pg_views
WHERE schemaname = 'public'
  AND viewname IN ('vw_parcelas_lembrete_3dias', 'vw_parcelas_no_dia', 'vw_parcelas_em_atraso');
