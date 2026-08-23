-- Painel de ativação: onde cada conta não-pagante trava no funil.
--
-- SOMENTE LEITURA. Cria uma view, não escreve em nada, não tem trigger,
-- não encosta em instância / Evolution / mensallizap.conectado.
--
-- Fonte do estado de conexão: mensallizap (conectado, instance_name) — é o que o
-- checklist de onboarding lê. NÃO usar whatsapp_connections (tabela morta, 1 linha
-- no banco todo) nem config.evolution_instance_name (a chave global pertence a um
-- único usuário; as por usuário usam prefixo <user_id>_).

CREATE OR REPLACE VIEW vw_ativacao_funil
WITH (security_invoker = true)
AS
SELECT
  u.id,
  u.nome_completo,
  u.telefone,
  u.email,
  u.created_at::date                      AS cadastro,
  u.trial_fim::date                       AS fim_trial,
  (u.trial_fim >= now())                  AS trial_vivo,
  COALESCE(u.onboarding_step, 0)          AS passo_onboarding,
  u.ultimo_acesso,

  -- Degraus da ativação, em ordem
  COALESCE(m.conectado, false)            AS wa_conectado,
  (SELECT count(*) FROM devedores d
     WHERE d.user_id = u.id AND COALESCE(d.lixo, false) = false)      AS alunos,
  (SELECT count(*) FROM mensalidades ms
     WHERE ms.user_id = u.id AND COALESCE(ms.lixo, false) = false)    AS mensalidades,
  (SELECT count(*) FROM logs_mensagens l WHERE l.user_id = u.id)      AS msgs,

  -- Grupo de abordagem (ver docs/ativacao-passo2.md)
  CASE
    WHEN (SELECT count(*) FROM logs_mensagens l WHERE l.user_id = u.id) > 0
      THEN 'A - provou valor, trial venceu'
    WHEN COALESCE(m.conectado, false)
      THEN 'B - conectou, nao cadastrou aluno'
    WHEN (SELECT count(*) FROM devedores d
            WHERE d.user_id = u.id AND COALESCE(d.lixo, false) = false) > 0
      THEN 'C - cadastrou aluno, nao conectou'
    ELSE 'D - cadastrou e sumiu'
  END AS grupo

FROM usuarios u
LEFT JOIN mensallizap m ON m.user_id = u.id
WHERE NOT u.plano_pago;

COMMENT ON VIEW vw_ativacao_funil IS
  'Somente leitura. Em que degrau cada conta nao-pagante travou. Ver docs/ativacao-passo2.md';


-- Uso:
--
--   -- lista de abordagem dos ultimos 45 dias, do mais quente ao mais frio
--   SELECT grupo, nome_completo, telefone, cadastro, fim_trial, alunos, msgs
--   FROM vw_ativacao_funil
--   WHERE cadastro > now() - interval '45 days'
--   ORDER BY grupo, cadastro DESC;
--
--   -- o funil resumido, para acompanhar semana a semana
--   SELECT count(*) AS cadastros,
--          count(*) FILTER (WHERE wa_conectado) AS conectaram,
--          count(*) FILTER (WHERE alunos > 0)   AS cadastraram_aluno,
--          count(*) FILTER (WHERE msgs > 0)     AS enviaram
--   FROM vw_ativacao_funil
--   WHERE cadastro > now() - interval '45 days';
