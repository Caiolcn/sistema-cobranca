-- =====================================================================
-- AUTOCADASTRO DE ALUNOS
-- =====================================================================
-- O professor manda o link /cadastro/:slug, o aluno preenche a ficha e
-- entra como devedor PENDENTE: experimental = true, sem plano e sem
-- mensalidade. O professor aprova na tela de Alunos (escolhe plano +
-- vencimento) e o aluno vira cliente normal.
--
-- O slug é o mesmo do agendamento online (usuarios.agendamento_slug).
-- Os dois links caem na mesma fila de aprovação:
--   origem = 'autocadastro'  -> veio do link de cadastro
--   origem = 'agendamento'   -> aluno experimental do link de agendamento
--
-- Aluno pendente não recebe cobrança (não tem mensalidade nem
-- assinatura_ativa). A única automação que o alcançava era o aniversário,
-- que não olhava experimental — filtro adicionado abaixo.
-- =====================================================================

-- 1. Liga/desliga do link de cadastro
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS autocadastro_ativo BOOLEAN DEFAULT false;

-- 2. Fila de aprovação: pendentes por escola, mais recentes primeiro
CREATE INDEX IF NOT EXISTS idx_devedores_pendentes_aprovacao
  ON devedores (user_id, created_at DESC)
  WHERE experimental = true AND (lixo IS NULL OR lixo = false);

-- 3. Aniversário: não mandar parabéns para quem ainda não foi aprovado
--    (mesma definição de antes + "d.experimental IS NOT TRUE")
CREATE OR REPLACE VIEW vw_aniversariantes_do_dia AS
 SELECT devedor_id,
    nome_cliente,
    telefone,
    user_id,
    data_nascimento,
    plano,
    nome_empresa,
    evolution_instance_name,
    evolution_api_key,
    evolution_api_url,
    usage_count,
    limite_mensal,
    template_mensagem
   FROM ( SELECT d.id AS devedor_id,
            d.nome AS nome_cliente,
            COALESCE(d.responsavel_telefone, d.telefone) AS telefone,
            d.user_id,
            d.data_nascimento,
            u.plano,
            u.nome_empresa,
            mz.instance_name AS evolution_instance_name,
            ( SELECT config.valor
                   FROM config
                  WHERE (config.chave = 'evolution_api_key'::text)
                 LIMIT 1) AS evolution_api_key,
            ( SELECT config.valor
                   FROM config
                  WHERE (config.chave = 'evolution_api_url'::text)
                 LIMIT 1) AS evolution_api_url,
            cp.usage_count,
            cp.limite_mensal,
            COALESCE(t.mensagem, ''::text) AS template_mensagem
           FROM (((((devedores d
             JOIN usuarios u ON ((d.user_id = u.id)))
             JOIN mensallizap mz ON (((mz.user_id = d.user_id) AND (mz.conectado = true))))
             JOIN configuracoes_cobranca cc ON (((cc.user_id = d.user_id) AND (cc.enviar_aniversario = true))))
             LEFT JOIN controle_planos cp ON ((cp.user_id = d.user_id)))
             LEFT JOIN templates t ON (((t.user_id = d.user_id) AND (t.tipo = 'birthday'::text) AND (t.ativo = true))))
          WHERE ((d.data_nascimento IS NOT NULL) AND (((EXTRACT(month FROM d.data_nascimento) = EXTRACT(month FROM CURRENT_DATE)) AND (EXTRACT(day FROM d.data_nascimento) = EXTRACT(day FROM CURRENT_DATE))) OR ((EXTRACT(dow FROM CURRENT_DATE) = (1)::numeric) AND (cc.enviar_domingo = false) AND (EXTRACT(month FROM d.data_nascimento) = EXTRACT(month FROM (CURRENT_DATE - '1 day'::interval))) AND (EXTRACT(day FROM d.data_nascimento) = EXTRACT(day FROM (CURRENT_DATE - '1 day'::interval))))) AND ((d.enviado_aniversario_em IS NULL) OR (EXTRACT(year FROM d.enviado_aniversario_em) < EXTRACT(year FROM CURRENT_DATE))) AND ((d.lixo IS NULL) OR (d.lixo = false)) AND (d.experimental IS NOT TRUE) AND ((d.bloquear_mensagens IS NULL) OR (d.bloquear_mensagens = false)) AND ((d.comunicacoes_ativas IS NULL) OR (d.comunicacoes_ativas = true)) AND ((cp.usage_count < cp.limite_mensal) OR (cp.limite_mensal IS NULL)) AND (NOT ((EXTRACT(dow FROM CURRENT_DATE) = (0)::numeric) AND (cc.enviar_domingo = false))) AND usuario_pode_enviar(u.id))) _orig
  WHERE (usuario_pode_enviar(user_id) AND usuario_tem_plano(user_id, 'pro'::text));
