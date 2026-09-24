-- ============================================================
-- vw_admin_contas: última atividade de cada conta (24/09/2026)
--
-- Rodar DEPOIS de sql-fix-views-admin-vazamento.sql. A view é reescrita a
-- partir da definição VIVA (pg_get_viewdef), então o guarda
-- pode_ver_painel_admin() aplicado lá continua valendo.
--
-- Três colunas novas no fim:
--   ultimo_acesso   quando a pessoa esteve no app
--   ultima_acao_em  quando fez algo de dono (cadastrar, marcar presença...)
--   ultima_acao     o que foi
--
-- ÚLTIMO ACESSO
--   auth.sessions é renovada a cada hora enquanto o app está aberto, então
--   pega quem nunca desloga (PWA). last_sign_in_at sozinho não serve: a
--   maioria loga uma vez e fica meses logada. Soma-se a própria ação: quem
--   agiu estava dentro, e o refresh é de hora em hora.
--   O "ver como" do admin abre sessão REAL na conta do cliente (magic link) e
--   contamina sessions e last_sign_in_at. Essas sessões casam com o
--   log_auditoria 'impersonation_usada' em menos de 1s (92 de 93 em 24/09) —
--   por isso a janela de 1 min.
--   refreshed_at é timestamp SEM fuso (UTC); o banco roda em -03.
--
-- ÚLTIMA AÇÃO — só o que é o DONO fazendo:
--   entra:  aluno cadastrado à mão (origem manual), presença, aula, despesa,
--           cobrança avulsa, contrato, template EDITADO, log_auditoria.
--   fora:   mensalidade gerada/paga, mensagem enviada — cron, n8n e webhook
--           escrevem isso e fariam conta abandonada parecer viva. Baixa manual
--           também fica fora: não dá para separar da baixa do gateway
--           (os dois gravam forma_pagamento 'PIX').
--           Autocadastro e agendamento são o ALUNO fazendo.
--           Template sem edição é semeado automaticamente.
--   Limitação: o que o admin faz dentro do "ver como" conta como da conta.
-- ============================================================

DO $$
DECLARE
  d text := pg_get_viewdef('public.vw_admin_contas'::regclass, true);
  antes text;
BEGIN
  d := rtrim(d, E'; \n');

  -- 1) CTEs novas antes das existentes
  antes := d;
  d := regexp_replace(d, '^\s*WITH\s+pag\s+AS\s*\(', $cte$ WITH imp AS (
         SELECT log_auditoria.valor_novo::uuid AS alvo,
            log_auditoria.created_at
           FROM log_auditoria
          WHERE log_auditoria.acao = 'impersonation_usada'::text
            AND log_auditoria.valor_novo ~ '^[0-9a-f-]{36}$'::text
        ), acesso AS (
         SELECT s.user_id,
            max(GREATEST(s.created_at, s.updated_at, s.refreshed_at AT TIME ZONE 'UTC'::text)) AS ultimo
           FROM auth.sessions s
          WHERE NOT (EXISTS ( SELECT 1
                   FROM imp
                  WHERE imp.alvo = s.user_id
                    AND s.created_at >= (imp.created_at - '00:01:00'::interval)
                    AND s.created_at <= (imp.created_at + '00:01:00'::interval)))
          GROUP BY s.user_id
        ), login AS (
         SELECT au.id AS user_id,
            au.last_sign_in_at
           FROM auth.users au
          WHERE NOT (EXISTS ( SELECT 1
                   FROM imp
                  WHERE imp.alvo = au.id
                    AND au.last_sign_in_at >= (imp.created_at - '00:01:00'::interval)
                    AND au.last_sign_in_at <= (imp.created_at + '00:01:00'::interval)))
        ), acoes AS (
         SELECT DISTINCT ON (x.user_id) x.user_id,
            x.em,
            x.acao
           FROM ( SELECT devedores.user_id, devedores.created_at AS em, 'Cadastrou aluno'::text AS acao
                   FROM devedores
                  WHERE devedores.origem = 'manual'::text
                UNION ALL
                 SELECT presencas.user_id, presencas.created_at, 'Marcou presença'::text
                   FROM presencas
                UNION ALL
                 SELECT aulas.user_id, aulas.created_at, 'Criou aula'::text
                   FROM aulas
                UNION ALL
                 SELECT despesas.user_id, despesas.created_at, 'Lançou despesa'::text
                   FROM despesas
                UNION ALL
                 SELECT cobrancas_avulsas.user_id, cobrancas_avulsas.created_at, 'Criou cobrança avulsa'::text
                   FROM cobrancas_avulsas
                UNION ALL
                 SELECT contratos_enviados.user_id, contratos_enviados.created_at, 'Enviou contrato'::text
                   FROM contratos_enviados
                UNION ALL
                 SELECT templates.user_id, templates.updated_at, 'Editou mensagem'::text
                   FROM templates
                  WHERE templates.updated_at > (templates.created_at + '00:01:00'::interval)
                UNION ALL
                 SELECT log_auditoria.user_id, log_auditoria.created_at,
                        CASE log_auditoria.acao
                            WHEN 'mensalidade_excluida'::text THEN 'Excluiu mensalidade'::text
                            WHEN 'mensalidade_pulada'::text THEN 'Pulou mês'::text
                            WHEN 'mensalidade_valor_alterado'::text THEN 'Alterou valor de mensalidade'::text
                            WHEN 'assinatura_ativada'::text THEN 'Ativou assinatura'::text
                            WHEN 'assinatura_desativada'::text THEN 'Desativou assinatura'::text
                            ELSE 'Alterou cadastro'::text
                        END
                   FROM log_auditoria
                  WHERE log_auditoria.acao !~~ 'impersonation%'::text) x
          WHERE x.em IS NOT NULL
          ORDER BY x.user_id, x.em DESC
        ), pag AS ($cte$);
  IF d = antes THEN RAISE EXCEPTION 'vw_admin_contas: início WITH pag não encontrado'; END IF;

  -- 2) Colunas novas no FIM do select (CREATE OR REPLACE só aceita acrescentar no fim)
  antes := d;
  d := regexp_replace(d, 'u\.retencao_e_enviado_em\s+FROM\s+usuarios\s+u', $col$u.retencao_e_enviado_em,
    GREATEST(acesso.ultimo, login.last_sign_in_at, acoes.em) AS ultimo_acesso,
    acoes.em AS ultima_acao_em,
    acoes.acao AS ultima_acao
   FROM usuarios u$col$);
  IF d = antes THEN RAISE EXCEPTION 'vw_admin_contas: fim do select não encontrado'; END IF;

  -- 3) Joins antes do WHERE
  antes := d;
  d := regexp_replace(d, '\s+WHERE\s+u\.role\s+IS\s+DISTINCT\s+FROM', $join$
     LEFT JOIN acesso ON acesso.user_id = u.id
     LEFT JOIN login ON login.user_id = u.id
     LEFT JOIN acoes ON acoes.user_id = u.id
  WHERE u.role IS DISTINCT FROM$join$);
  IF d = antes THEN RAISE EXCEPTION 'vw_admin_contas: WHERE não encontrado'; END IF;

  IF position('pode_ver_painel_admin' in d) = 0 THEN
    RAISE EXCEPTION 'vw_admin_contas: rode antes sql-fix-views-admin-vazamento.sql (guarda de admin ausente)';
  END IF;

  EXECUTE 'CREATE OR REPLACE VIEW public.vw_admin_contas AS ' || d;
END $$;
