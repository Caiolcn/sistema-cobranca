-- Perfil do negócio no primeiro acesso (05/11/2026)
-- ---------------------------------------------------------------------------
-- POR QUE
-- 1. Toda conta nasce "Minha Empresa" (trigger handle_new_user + Signup.js) e
--    esse nome sai nas cobranças ({{nomeEmpresa}}), no portal, na loja e no
--    PIX. O passo "dê o nome da empresa" saiu do onboarding guiado e, em
--    05/11/2026, 52 das 71 contas criadas nos últimos 60 dias seguiam com o
--    nome padrão -- inclusive 6 pagantes.
-- 2. Não existia dado de nicho (só dava pra chutar pelo nome) nem de "como
--    conheceu" (~58% das contas novas chegam sem UTM em meta_atribuicao).
--
-- O QUE FAZ (idempotente, pode rodar 2x)
--   1. Colunas novas em usuarios: area_atuacao, area_atuacao_outro,
--      como_conheceu, perfil_respondido_em, perfil_dispensado_em
--      (carimbos timestamptz, não booleano).
--   2. CHECKs com as listas fechadas (batem com src/data/perfilNegocio.js).
--   3. vw_ativacao_funil e vw_admin_contas ganham as colunas no FINAL
--      (create or replace só aceita coluna nova no fim). As duas foram
--      copiadas da definição real do banco em 05/11/2026:
--        - vw_ativacao_funil continua security_invoker = true;
--        - vw_admin_contas continua definer COM a trava pode_ver_painel_admin().
--      Os GRANTs ficam como estão (create or replace preserva).
--   4. SELECTs de conferência e de análise por área/origem.
--   5. (OPCIONAL, COMENTADO) pré-preencher area_atuacao das contas antigas
--      pelo nome da empresa -- primeiro rode a PRÉVIA e revise.
--
-- A "origem automática" (UTM do clique) continua só em meta_atribuicao, que
-- alimenta o Meta. A resposta do dono fica em coluna própria e nunca
-- sobrescreve a automática.
--
-- Nada aqui manda mensagem. A tabela usuarios já tem RLS (dono atualiza a
-- própria linha) e os triggers de proteção não tocam nessas colunas.
--
-- ORDEM DE DEPLOY: este SQL -> front (Home + PerfilNegocioModal + /admin).
-- Se o front subir antes, o pop-up simplesmente não abre (a leitura das
-- colunas falha e ele sai do caminho) e o /admin mostra "—".
--
-- COMO RODAR: dá pra colar o arquivo inteiro (o UPDATE do item 5 está
-- comentado). O SQL Editor só mostra o resultado do ÚLTIMO select (a prévia
-- 5a); para ver as conferências 4a-4d, rode cada uma sozinha depois.
--
-- REVERTER: subir o front anterior. As colunas podem ficar.
-- ---------------------------------------------------------------------------

-- ---------- 1. Colunas ----------
alter table usuarios add column if not exists area_atuacao         text;
alter table usuarios add column if not exists area_atuacao_outro   text;
alter table usuarios add column if not exists como_conheceu        text;
alter table usuarios add column if not exists perfil_respondido_em timestamptz;
alter table usuarios add column if not exists perfil_dispensado_em timestamptz;

comment on column usuarios.area_atuacao is
  'Área declarada no pop-up do primeiro acesso (PerfilNegocioModal). Lista fechada por CHECK.';
comment on column usuarios.como_conheceu is
  'Como conheceu, declarado pelo dono. A origem automática (UTM) fica em meta_atribuicao.';
comment on column usuarios.perfil_respondido_em is
  'Quando respondeu o pop-up de perfil. Preenchido = não mostra mais.';
comment on column usuarios.perfil_dispensado_em is
  'Quando fechou/pulou o pop-up de perfil sem responder. Preenchido = não mostra mais.';

-- ---------- 2. CHECKs (listas fechadas) ----------
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'usuarios_area_atuacao_check') then
    alter table usuarios add constraint usuarios_area_atuacao_check check (
      area_atuacao is null or area_atuacao in (
        'luta', 'futebol', 'academia', 'personal', 'pilates', 'danca', 'natacao',
        'outros_esportes', 'educacao', 'musica', 'saude', 'outro'
      )
    );
  end if;

  if not exists (select 1 from pg_constraint where conname = 'usuarios_como_conheceu_check') then
    alter table usuarios add constraint usuarios_como_conheceu_check check (
      como_conheceu is null or como_conheceu in (
        'anuncio_meta', 'instagram', 'google', 'ia', 'indicacao', 'youtube_tiktok',
        'outro', 'prefiro_nao_informar'
      )
    );
  end if;

  if not exists (select 1 from pg_constraint where conname = 'usuarios_area_atuacao_outro_tamanho') then
    alter table usuarios add constraint usuarios_area_atuacao_outro_tamanho check (
      area_atuacao_outro is null or char_length(area_atuacao_outro) <= 60
    );
  end if;
end $$;

-- ---------- 3a. vw_ativacao_funil (security_invoker, igual ao banco) ----------
create or replace view vw_ativacao_funil
with (security_invoker = true) as
 SELECT u.id,
    u.nome_completo,
    u.telefone,
    u.email,
    u.created_at::date AS cadastro,
    u.trial_fim::date AS fim_trial,
    u.trial_fim >= now() AS trial_vivo,
    COALESCE(u.onboarding_step, 0) AS passo_onboarding,
    u.ultimo_acesso,
    COALESCE(m.conectado, false) AS wa_conectado,
    ( SELECT count(*) AS count
           FROM devedores d
          WHERE d.user_id = u.id AND COALESCE(d.lixo, false) = false) AS alunos,
    ( SELECT count(*) AS count
           FROM mensalidades ms
          WHERE ms.user_id = u.id AND COALESCE(ms.lixo, false) = false) AS mensalidades,
    ( SELECT count(*) AS count
           FROM logs_mensagens l
          WHERE l.user_id = u.id) AS msgs,
        CASE
            WHEN (( SELECT count(*) AS count
               FROM logs_mensagens l
              WHERE l.user_id = u.id)) > 0 THEN 'A - provou valor, trial venceu'::text
            WHEN COALESCE(m.conectado, false) THEN 'B - conectou, nao cadastrou aluno'::text
            WHEN (( SELECT count(*) AS count
               FROM devedores d
              WHERE d.user_id = u.id AND COALESCE(d.lixo, false) = false)) > 0 THEN 'C - cadastrou aluno, nao conectou'::text
            ELSE 'D - cadastrou e sumiu'::text
        END AS grupo,
    -- novas (05/11/2026): perfil do negócio
    u.nome_empresa,
    u.area_atuacao,
    u.como_conheceu,
    u.perfil_respondido_em
   FROM usuarios u
     LEFT JOIN mensallizap m ON m.user_id = u.id
  WHERE NOT u.plano_pago;

-- ---------- 3b. vw_admin_contas (definer + trava pode_ver_painel_admin) ----------
create or replace view vw_admin_contas as
 WITH imp AS (
         SELECT log_auditoria.valor_novo::uuid AS alvo,
            log_auditoria.created_at
           FROM log_auditoria
          WHERE log_auditoria.acao = 'impersonation_usada'::text AND log_auditoria.valor_novo ~ '^[0-9a-f-]{36}$'::text
        ), acesso AS (
         SELECT s.user_id,
            max(GREATEST(s.created_at, s.updated_at, (s.refreshed_at AT TIME ZONE 'UTC'::text))) AS ultimo
           FROM auth.sessions s
          WHERE NOT (EXISTS ( SELECT 1
                   FROM imp
                  WHERE imp.alvo = s.user_id AND s.created_at >= (imp.created_at - '00:01:00'::interval) AND s.created_at <= (imp.created_at + '00:01:00'::interval)))
          GROUP BY s.user_id
        ), login AS (
         SELECT au.id AS user_id,
            au.last_sign_in_at
           FROM auth.users au
          WHERE NOT (EXISTS ( SELECT 1
                   FROM imp
                  WHERE imp.alvo = au.id AND au.last_sign_in_at >= (imp.created_at - '00:01:00'::interval) AND au.last_sign_in_at <= (imp.created_at + '00:01:00'::interval)))
        ), acoes AS (
         SELECT DISTINCT ON (x.user_id) x.user_id,
            x.em,
            x.acao
           FROM ( SELECT devedores.user_id,
                    devedores.created_at AS em,
                    'Cadastrou aluno'::text AS acao
                   FROM devedores
                  WHERE devedores.origem = 'manual'::text
                UNION ALL
                 SELECT presencas.user_id,
                    presencas.created_at,
                    'Marcou presença'::text AS text
                   FROM presencas
                UNION ALL
                 SELECT aulas.user_id,
                    aulas.created_at,
                    'Criou aula'::text AS text
                   FROM aulas
                UNION ALL
                 SELECT despesas.user_id,
                    despesas.created_at,
                    'Lançou despesa'::text AS text
                   FROM despesas
                UNION ALL
                 SELECT cobrancas_avulsas.user_id,
                    cobrancas_avulsas.created_at,
                    'Criou cobrança avulsa'::text AS text
                   FROM cobrancas_avulsas
                UNION ALL
                 SELECT contratos_enviados.user_id,
                    contratos_enviados.created_at,
                    'Enviou contrato'::text AS text
                   FROM contratos_enviados
                UNION ALL
                 SELECT templates.user_id,
                    templates.updated_at,
                    'Editou mensagem'::text AS text
                   FROM templates
                  WHERE templates.updated_at > (templates.created_at + '00:01:00'::interval)
                UNION ALL
                 SELECT log_auditoria.user_id,
                    log_auditoria.created_at,
                        CASE log_auditoria.acao
                            WHEN 'mensalidade_excluida'::text THEN 'Excluiu mensalidade'::text
                            WHEN 'mensalidade_pulada'::text THEN 'Pulou mês'::text
                            WHEN 'mensalidade_valor_alterado'::text THEN 'Alterou valor de mensalidade'::text
                            WHEN 'assinatura_ativada'::text THEN 'Ativou assinatura'::text
                            WHEN 'assinatura_desativada'::text THEN 'Desativou assinatura'::text
                            ELSE 'Alterou cadastro'::text
                        END AS "case"
                   FROM log_auditoria
                  WHERE log_auditoria.acao !~~ 'impersonation%'::text) x
          WHERE x.em IS NOT NULL
          ORDER BY x.user_id, x.em DESC
        ), pag AS (
         SELECT pagamentos_mercadopago.user_id,
            min(COALESCE(pagamentos_mercadopago.data_aprovacao, pagamentos_mercadopago.data_pagamento, pagamentos_mercadopago.created_at)) AS primeiro_pagamento,
            max(COALESCE(pagamentos_mercadopago.data_aprovacao, pagamentos_mercadopago.data_pagamento, pagamentos_mercadopago.created_at)) AS ultimo_pagamento,
            count(*) AS total_pagamentos,
            sum(pagamentos_mercadopago.valor) AS total_pago
           FROM pagamentos_mercadopago
          WHERE pagamentos_mercadopago.status = 'approved'::text
          GROUP BY pagamentos_mercadopago.user_id
        ), msgs AS (
         SELECT logs_mensagens.user_id,
            count(*) AS mensagens_mes
           FROM logs_mensagens
          WHERE logs_mensagens.enviado_em >= date_trunc('month'::text, now()) AND (logs_mensagens.status = 'enviado'::text OR logs_mensagens.falha_classe = 'nao_falha'::text)
          GROUP BY logs_mensagens.user_id
        ), assin AS (
         SELECT DISTINCT ON (assinaturas_mercadopago.user_id) assinaturas_mercadopago.user_id,
            assinaturas_mercadopago.status AS assinatura_status,
            assinaturas_mercadopago.valor AS assinatura_valor,
            assinaturas_mercadopago.proxima_cobranca,
            assinaturas_mercadopago.data_inicio AS assinatura_desde
           FROM assinaturas_mercadopago
          ORDER BY assinaturas_mercadopago.user_id, assinaturas_mercadopago.created_at DESC
        )
 SELECT u.id,
    u.email,
    u.nome_empresa,
    u.nome_completo,
    u.telefone,
    u.plano,
    u.plano_pago,
    u.plano_vencimento,
    u.trial_fim,
    u.data_cadastro,
    u.created_at,
    u.virou_pagante_em,
    u.cancelado_em,
    u.cancelado_motivo,
        CASE
            WHEN u.cancelado_em IS NOT NULL THEN 'cancelado'::text
            WHEN u.plano_pago AND u.plano_vencimento::date >= CURRENT_DATE AND u.plano_vencimento::date <= (CURRENT_DATE + 3) THEN 'vencendo'::text
            WHEN u.plano_pago AND u.plano_vencimento::date >= CURRENT_DATE THEN 'ativo'::text
            WHEN u.plano_pago THEN 'inadimplente'::text
            WHEN u.virou_pagante_em IS NOT NULL THEN 'churn'::text
            WHEN u.trial_fim::date >= CURRENT_DATE THEN 'trial'::text
            ELSE 'trial_expirado'::text
        END AS ciclo,
        CASE
            WHEN pag.user_id IS NOT NULL THEN 'mercadopago'::text
            WHEN u.virou_pagante_em IS NOT NULL THEN 'manual'::text
            ELSE 'nenhum'::text
        END AS origem_pagamento,
        CASE
            WHEN u.virou_pagante_em IS NOT NULL THEN u.plano_vencimento
            ELSE u.trial_fim
        END AS data_limite,
    usuario_pode_enviar(u.id) AS tem_acesso,
    pag.primeiro_pagamento,
    pag.ultimo_pagamento,
    COALESCE(pag.total_pagamentos, 0::bigint) AS total_pagamentos,
    COALESCE(pag.total_pago, 0::numeric) AS total_pago,
    assin.assinatura_status,
    assin.assinatura_valor,
    assin.assinatura_desde,
    assin.proxima_cobranca,
    COALESCE(m.mensagens_mes, 0::bigint) AS mensagens_mes,
    cp.limite_mensal,
    mz.conectado AS whatsapp_conectado,
    mz.ultima_conexao AS whatsapp_ultima_conexao,
    mz.telefone AS whatsapp_telefone,
    mz.whatsapp_numero,
    mz.instance_name AS whatsapp_instancia,
    u.retencao_a_enviado_em,
    u.retencao_b_enviado_em,
    u.retencao_c1_enviado_em,
    u.retencao_c2_enviado_em,
    u.retencao_d_enviado_em,
    u.retencao_e_enviado_em,
    GREATEST(acesso.ultimo, login.last_sign_in_at, acoes.em) AS ultimo_acesso,
    acoes.em AS ultima_acao_em,
    acoes.acao AS ultima_acao,
    ( SELECT count(*) AS count
           FROM devedores dv
          WHERE dv.user_id = u.id AND COALESCE(dv.lixo, false) = false) AS total_alunos,
    -- novas (05/11/2026): perfil do negócio + origem automática ao lado
    u.area_atuacao,
    u.area_atuacao_outro,
    u.como_conheceu,
    u.perfil_respondido_em,
    u.perfil_dispensado_em,
    COALESCE(
      NULLIF(btrim(ma.utm_source), ''),
      CASE WHEN ma.fbclid IS NOT NULL OR ma.fbc IS NOT NULL THEN 'meta (clique)' END
    ) AS origem_automatica
   FROM usuarios u
     LEFT JOIN pag ON pag.user_id = u.id
     LEFT JOIN msgs m ON m.user_id = u.id
     LEFT JOIN assin ON assin.user_id = u.id
     LEFT JOIN controle_planos cp ON cp.user_id = u.id
     LEFT JOIN mensallizap mz ON mz.user_id = u.id
     LEFT JOIN acesso ON acesso.user_id = u.id
     LEFT JOIN login ON login.user_id = u.id
     LEFT JOIN acoes ON acoes.user_id = u.id
     LEFT JOIN meta_atribuicao ma ON ma.user_id = u.id
  WHERE u.role IS DISTINCT FROM 'admin'::text AND ( SELECT pode_ver_painel_admin() AS pode_ver_painel_admin);

-- ---------- 4. Conferência ----------
-- 4a. Colunas e CHECKs criados (espera 5 colunas e 3 constraints)
select column_name, data_type
from information_schema.columns
where table_schema = 'public' and table_name = 'usuarios'
  and column_name in ('area_atuacao', 'area_atuacao_outro', 'como_conheceu',
                      'perfil_respondido_em', 'perfil_dispensado_em')
order by column_name;

select conname from pg_constraint
where conname in ('usuarios_area_atuacao_check', 'usuarios_como_conheceu_check',
                  'usuarios_area_atuacao_outro_tamanho');

-- 4b. A trava continua na vw_admin_contas e o security_invoker na do funil
select c.relname, c.reloptions,
       position('pode_ver_painel_admin' in pg_get_viewdef(c.oid)) > 0 as tem_trava_admin
from pg_class c
where c.relnamespace = 'public'::regnamespace
  and c.relname in ('vw_admin_contas', 'vw_ativacao_funil');

-- 4c. Quem vai ver o pop-up (contagem; nada é enviado)
select
  count(*) filter (where created_at > now() - interval '7 days') as contas_novas_7d,
  count(*) filter (where created_at <= now() - interval '7 days'
                     and (nome_empresa is null or btrim(nome_empresa) = ''
                          or lower(btrim(nome_empresa)) = 'minha empresa')) as antigas_com_nome_padrao
from usuarios
where role is distinct from 'admin'
  and perfil_respondido_em is null and perfil_dispensado_em is null;

-- 4d. Análise (rodar depois de alguns dias): contas, ativação e pagantes por
--     área e por origem (declarada x automática)
select
  coalesce(u.area_atuacao, '(não respondeu)') as area,
  coalesce(u.como_conheceu, '(não respondeu)') as origem_declarada,
  coalesce(nullif(btrim(ma.utm_source), ''),
           case when ma.fbclid is not null or ma.fbc is not null then 'meta (clique)' end,
           '(sem UTM)') as origem_automatica,
  count(*) as contas,
  count(*) filter (where coalesce(mz.conectado, false)) as conectaram,
  count(*) filter (where u.virou_pagante_em is not null) as viraram_pagantes
from usuarios u
left join meta_atribuicao ma on ma.user_id = u.id
left join mensallizap mz on mz.user_id = u.id
where u.role is distinct from 'admin'
group by 1, 2, 3
order by contas desc;

-- ---------- 5. OPCIONAL: pré-preencher a área das contas antigas ----------
-- Chute por palavra-chave no nome da empresa. NÃO roda sozinho: primeiro a
-- PRÉVIA abaixo, confira linha a linha, e só então descomente o UPDATE.
-- Só mexe em quem ainda não tem área e não está com nome padrão. Não marca
-- perfil_respondido_em (o chute não é resposta do dono).

-- 5b. UPDATE (descomente só depois de revisar a PRÉVIA 5a, logo abaixo; mesma regra).
--     Fica ANTES da prévia de propósito: no SQL Editor, comentário depois do
--     último ";" faz o resultado sumir ("No rows returned").
-- with base as (
--   select u.id,
--          lower(translate(coalesce(u.nome_empresa, ''),
--            'áàãâäéèêëíìîïóòõôöúùûüçÁÀÃÂÄÉÈÊËÍÌÎÏÓÒÕÔÖÚÙÛÜÇ',
--            'aaaaaeeeeiiiiooooouuuucaaaaaeeeeiiiiooooouuuuc')) as n
--   from usuarios u
--   where u.role is distinct from 'admin'
--     and u.area_atuacao is null
--     and u.nome_empresa is not null and btrim(u.nome_empresa) <> ''
--     and lower(btrim(u.nome_empresa)) <> 'minha empresa'
-- ), chute as (
--   select id,
--     case
--       when n ~ '(jiu|bjj|muay|thai|boxe|\mbox\M|luta|fight|mma|karate|judo|taekwon|capoeira|kung ?fu|krav|wrestling|\mct\M|gracie)' then 'luta'
--       when n ~ '(futebol|futsal|escolinha|soccer|society|\mfc\M|f\.c|esporte clube)' then 'futebol'
--       when n ~ '(pilates)' then 'pilates'
--       when n ~ '(danca|dance|ballet|\mbale\M|jazz|zumba)' then 'danca'
--       when n ~ '(natacao|swim|aqua|hidro)' then 'natacao'
--       when n ~ '(personal|trainer|coach)' then 'personal'
--       when n ~ '(academia|\mfit|gym|crossfit|cross|funcional)' then 'academia'
--       when n ~ '(fisio|clinica|terapia|bem estar|bem-estar|saude)' then 'saude'
--       when n ~ '(musica|violao|piano|canto|guitarra|bateria)' then 'musica'
--       when n ~ '(ingles|idioma|english|reforco|colegio|educa|curso|saber)' then 'educacao'
--       when n ~ '(volei|basquete|tenis|beach|handebol|skate|surf|corrida|\mrun|ciclismo|bike)' then 'outros_esportes'
--     end as area_chute
--   from base
-- )
-- update usuarios u
-- set area_atuacao = c.area_chute
-- from chute c
-- where c.id = u.id
--   and c.area_chute is not null
--   and u.area_atuacao is null;

-- 5a. PRÉVIA (somente leitura)
with base as (
  select u.id, u.nome_empresa, u.plano_pago,
         lower(translate(coalesce(u.nome_empresa, ''),
           'áàãâäéèêëíìîïóòõôöúùûüçÁÀÃÂÄÉÈÊËÍÌÎÏÓÒÕÔÖÚÙÛÜÇ',
           'aaaaaeeeeiiiiooooouuuucaaaaaeeeeiiiiooooouuuuc')) as n
  from usuarios u
  where u.role is distinct from 'admin'
    and u.area_atuacao is null
    and u.nome_empresa is not null and btrim(u.nome_empresa) <> ''
    and lower(btrim(u.nome_empresa)) <> 'minha empresa'
), chute as (
  select id, nome_empresa, plano_pago,
    case
      when n ~ '(jiu|bjj|muay|thai|boxe|\mbox\M|luta|fight|mma|karate|judo|taekwon|capoeira|kung ?fu|krav|wrestling|\mct\M|gracie)' then 'luta'
      when n ~ '(futebol|futsal|escolinha|soccer|society|\mfc\M|f\.c|esporte clube)' then 'futebol'
      when n ~ '(pilates)' then 'pilates'
      when n ~ '(danca|dance|ballet|\mbale\M|jazz|zumba)' then 'danca'
      when n ~ '(natacao|swim|aqua|hidro)' then 'natacao'
      when n ~ '(personal|trainer|coach)' then 'personal'
      when n ~ '(academia|\mfit|gym|crossfit|cross|funcional)' then 'academia'
      when n ~ '(fisio|clinica|terapia|bem estar|bem-estar|saude)' then 'saude'
      when n ~ '(musica|violao|piano|canto|guitarra|bateria)' then 'musica'
      when n ~ '(ingles|idioma|english|reforco|colegio|educa|curso|saber)' then 'educacao'
      when n ~ '(volei|basquete|tenis|beach|handebol|skate|surf|corrida|\mrun|ciclismo|bike)' then 'outros_esportes'
    end as area_chute
  from base
)
select area_chute, nome_empresa, plano_pago, id
from chute
where area_chute is not null
order by area_chute, nome_empresa;
