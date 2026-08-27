-- ============================================================================
-- Ciclo de vida da conta — trilho de assinatura proprio
-- ============================================================================
--
-- PROBLEMA QUE ISTO RESOLVE
--
-- O sistema nao tinha estado de assinatura. O status era derivado em runtime de
-- DOIS campos, onde um boolean escolhia qual data valia:
--
--     plano_pago ? plano_vencimento : trial_fim
--
-- Ou seja: um unico slot de data por conta, e o trilho era o boolean. Ao marcar
-- um ex-pagante como expirado (plano_pago = false), a conta mudava de trilho e
-- caia no slot do trial. O botao "marcar como expirado" do /admin ainda gravava
-- trial_fim = ontem — que e literalmente a definicao de "trial expirado" em todo
-- o sistema. Resultado: o ex-pagante reaparecia como trial expirado, e o cliente
-- via "Seu periodo de teste de 3 dias terminou".
--
-- O mesmo estrago acontecia sem o botao: o webhook do Mercado Pago gravava
-- trial_fim = +30 dias no pagamento, contaminando o slot do trial com uma data
-- de assinatura.
--
-- O /admin disfarcava isso com everPaidSet = quem tem pagamento aprovado no
-- Mercado Pago. Sinal incompleto: 10 das 40 contas que ja pagaram nao estao no
-- Mercado Pago (venda na mao / Asaas antigo).
--
-- A CORRECAO
--
-- `virou_pagante_em` e o sinal que faltava: uma vez pagante, sempre ex-pagante.
-- E write-once — nunca e apagado, nem quando a conta e cancelada. E ele, e nao
-- `plano_pago`, que escolhe o trilho.
--
-- CAMPOS LEGADOS (nao dropar, mas parar de escrever)
--
--   trial_ativo         — 32 contas com a flag true e trial vencido. Nenhum gate le.
--   status_conta        — 78 contas dizem 'ativo' estando expiradas. Nenhum gate le.
--   grace_period_until  — gravado pelo webhook do MP, lido por ninguem.
--
-- Ficam na tabela por seguranca (edge functions antigas ainda escrevem), mas
-- nenhuma logica nova deve depender deles. Quem decide acesso e usuario_pode_enviar()
-- no banco e o trialStatus do UserContext no front — os dois por DATA, nunca por flag.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. Colunas do trilho de assinatura
-- ----------------------------------------------------------------------------

alter table usuarios
  add column if not exists virou_pagante_em  timestamptz,
  add column if not exists cancelado_em      timestamptz,
  add column if not exists cancelado_motivo  text;

comment on column usuarios.virou_pagante_em is
  'Primeira vez que a conta virou pagante. WRITE-ONCE: so preenche se for null, '
  'e NUNCA e apagado. E o que separa churn de trial expirado — sem ele, um '
  'ex-pagante marcado como expirado volta a ser lido como trial.';

comment on column usuarios.cancelado_em is
  'Cancelamento explicito (admin marcou como expirado / cliente pediu saida). '
  'Diferente de inadimplente, que e so vencimento no passado.';

comment on column usuarios.cancelado_motivo is
  'Texto livre ou uma das opcoes do modal do /admin: nao_pagou, pediu_cancelamento, '
  'inadimplente, teste_interno, outro.';

create index if not exists idx_usuarios_virou_pagante_em
  on usuarios (virou_pagante_em) where virou_pagante_em is not null;


-- ----------------------------------------------------------------------------
-- 2. Backfill
-- ----------------------------------------------------------------------------
--
-- A) 30 contas com pagamento aprovado no Mercado Pago — data real.
--
update usuarios u
   set virou_pagante_em = p.primeiro
  from (
    select user_id,
           min(coalesce(data_aprovacao, data_pagamento, created_at)) as primeiro
      from pagamentos_mercadopago
     where status = 'approved'
     group by user_id
  ) p
 where p.user_id = u.id
   and u.virou_pagante_em is null;

--
-- B) 7 pagantes de hoje + C) 3 ex-pagantes, todos sem registro no Mercado Pago
--    (venda na mao / Asaas antigo).
--
--    A data usada e `trial_fim`: o fim do periodo livre e quando o pagamento
--    comecou. Confere com os dados — nessas contas trial_fim e o fim do trial
--    de verdade (cadastro + 3d, ou uma extensao manual), porque justamente
--    elas nunca passaram pelo webhook do MP que contamina o campo.
--
--    NAO usar `plano_vencimento - 30 dias`: para cliente antigo isso da uma data
--    absurda (Carol Ribeiro, cadastrada em jan/26, daria "virou pagante em nov/26").
--
--    Estas 10 contas ficam com origem_pagamento = 'manual' na vw_admin_contas,
--    e o /admin tem filtro por isso para revisao.
--
--    Resultado medido: 40 contas ja pagaram (30 mercadopago + 10 manual),
--    67 nunca pagaram, 13 em churn. Zero datas no futuro ou antes do cadastro.
--
update usuarios
   set virou_pagante_em = coalesce(trial_fim, data_cadastro, created_at)
 where virou_pagante_em is null
   and (plano_pago = true or plano_vencimento is not null);


-- ----------------------------------------------------------------------------
-- 3. vw_admin_contas — a view canonica
-- ----------------------------------------------------------------------------
--
-- UMA definicao de ciclo de vida, consumida pelo /admin, pelo seletor de contas
-- do Dashboard e pelas views de retencao. Substitui as 8 queries paralelas que o
-- Admin.js fazia no load.
--
-- Antes desta view havia QUATRO taxonomias divergentes: getStatusPagamento do
-- Admin (4 estados, sem churn), a segmentacao por everPaidSet, os buckets da
-- vw_mensalli_retencao_saas e o trialStatus do UserContext. Nenhuma concordava.
--
-- ATENCAO — nao adicionar `mensalli_engajamento()` como lateral join aqui. A
-- funcao tem um guard `RAISE 'apenas admin'`, entao o lateral derruba a view
-- INTEIRA com erro duro para qualquer chamador nao-admin, em vez de devolver
-- null. Score/temperatura continuam vindo da vw_mensalli_engajamento numa query
-- separada do front, que so roda dentro do /admin.
--
drop view if exists vw_admin_contas;

create view vw_admin_contas as
with pag as (
  select user_id,
         min(coalesce(data_aprovacao, data_pagamento, created_at)) as primeiro_pagamento,
         max(coalesce(data_aprovacao, data_pagamento, created_at)) as ultimo_pagamento,
         count(*)                                                  as total_pagamentos,
         sum(valor)                                                as total_pago
    from pagamentos_mercadopago
   where status = 'approved'
   group by user_id
),
msgs as (
  select user_id, count(*) as mensagens_mes
    from logs_mensagens
   where enviado_em >= date_trunc('month', now())
     and (status = 'enviado' or falha_classe = 'nao_falha')
   group by user_id
),
assin as (
  select distinct on (user_id)
         user_id, status as assinatura_status, valor as assinatura_valor,
         proxima_cobranca, data_inicio as assinatura_desde
    from assinaturas_mercadopago
   order by user_id, created_at desc
)
select
  u.id,
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

  -- ------------------------------------------------------------------
  -- ciclo de vida canonico — a ORDEM dos ramos importa
  -- ------------------------------------------------------------------
  case
    -- cancelamento explicito ganha de tudo: a conta saiu de proposito
    when u.cancelado_em is not null                                     then 'cancelado'
    -- pagante em dia, mas o vencimento esta na janela de aviso (D-3)
    when u.plano_pago
     and u.plano_vencimento::date >= current_date
     and u.plano_vencimento::date <= current_date + 3                   then 'vencendo'
    when u.plano_pago
     and u.plano_vencimento::date >= current_date                       then 'ativo'
    -- pagante sem vencimento e dado quebrado, nao licenca vitalicia:
    -- cai aqui junto com o vencimento no passado (fail-closed, igual ao gate)
    when u.plano_pago                                                   then 'inadimplente'
    -- ja pagou alguma vez e hoje nao paga — churn, NUNCA "trial expirado"
    when u.virou_pagante_em is not null                                 then 'churn'
    when u.trial_fim::date >= current_date                              then 'trial'
    else                                                                     'trial_expirado'
  end as ciclo,

  -- de onde veio a informacao de que a conta ja pagou. 'manual' = inferido no
  -- backfill (venda na mao / Asaas), precisa de revisao humana no /admin.
  case
    when pag.user_id is not null        then 'mercadopago'
    when u.virou_pagante_em is not null then 'manual'
    else                                     'nenhum'
  end as origem_pagamento,

  -- a data-limite do trilho CERTO. Nao e mais "o boolean escolhe":
  -- quem ja foi pagante e lido pelo plano_vencimento para sempre.
  case
    when u.virou_pagante_em is not null then u.plano_vencimento
    else u.trial_fim
  end as data_limite,

  -- mesmo veredito do gate do banco (usuario_pode_enviar) e do UserContext:
  -- o dia do vencimento ainda e dia de acesso, o corte cai no dia seguinte.
  usuario_pode_enviar(u.id) as tem_acesso,

  pag.primeiro_pagamento,
  pag.ultimo_pagamento,
  coalesce(pag.total_pagamentos, 0)  as total_pagamentos,
  coalesce(pag.total_pago, 0)        as total_pago,
  assin.assinatura_status,
  assin.assinatura_valor,
  assin.assinatura_desde,
  assin.proxima_cobranca,

  coalesce(m.mensagens_mes, 0)       as mensagens_mes,
  cp.limite_mensal,

  mz.conectado                       as whatsapp_conectado,
  mz.ultima_conexao                  as whatsapp_ultima_conexao,
  mz.telefone                        as whatsapp_telefone,
  mz.whatsapp_numero,
  mz.instance_name                   as whatsapp_instancia,

  u.retencao_a_enviado_em,
  u.retencao_b_enviado_em,
  u.retencao_c1_enviado_em,
  u.retencao_c2_enviado_em,
  u.retencao_d_enviado_em,
  u.retencao_e_enviado_em

from usuarios u
  left join pag         on pag.user_id = u.id
  left join msgs m      on m.user_id   = u.id
  left join assin       on assin.user_id = u.id
  left join controle_planos cp on cp.user_id = u.id
  left join mensallizap mz on mz.user_id = u.id
where u.role is distinct from 'admin';

comment on view vw_admin_contas is
  'Fonte unica do ciclo de vida de uma conta Mensalli. Sete estados: cancelado, '
  'vencendo, ativo, inadimplente, churn, trial, trial_expirado. Consumida pelo '
  '/admin, pelo seletor de contas do Dashboard e pelas views de retencao. '
  'NAO derivar status em outro lugar — foi a divergencia entre quatro taxonomias '
  'paralelas que fez ex-pagante virar "trial expirado".';

grant select on vw_admin_contas to authenticated;


-- ----------------------------------------------------------------------------
-- 4. Alinhar as views de retencao ao mesmo sinal
-- ----------------------------------------------------------------------------
--
-- vw_mensalli_retencao_saas usava ja_pagou_algum_dia = EXISTS(pagamento MP
-- aprovado) — o mesmo sinal incompleto. Trocar por virou_pagante_em corrige os
-- buckets retencao_c1 (ex-pagante sumido) e retencao_c2 (trial antigo), que
-- trocavam 10 contas de lugar: ex-pagante de venda na mao caia em "trial antigo"
-- e recebia a mensagem errada.
--
-- Nao ha DROP: a definicao abaixo e a viva (lida com pg_get_viewdef), com a
-- unica alteracao sendo a linha de ja_pagou_algum_dia.
--
create or replace view vw_mensalli_retencao_saas as
 WITH base AS (
         SELECT u.id AS usuario_id,
            u.nome_completo,
            u.email,
            u.telefone,
            u.data_cadastro,
            u.trial_fim,
            u.trial_ativo,
            u.plano_pago,
            u.plano,
            u.plano_vencimento,
            u.ultimo_acesso,
            au.last_sign_in_at,
            u.retencao_a_enviado_em,
            u.retencao_b_enviado_em,
            u.retencao_d_enviado_em,
            u.retencao_c1_enviado_em,
            u.retencao_c2_enviado_em,
            u.retencao_e_enviado_em,
            EXTRACT(day FROM now() - u.data_cadastro)::integer AS dias_desde_cadastro,
            EXTRACT(day FROM u.trial_fim - now())::integer AS dias_para_trial_expirar,
            EXTRACT(day FROM now() - u.trial_fim)::integer AS dias_desde_trial_expirar,
            EXTRACT(day FROM u.plano_vencimento - now())::integer AS dias_para_plano_vencer,
            -- ANTES: EXISTS (SELECT 1 FROM pagamentos_mercadopago ...) — cego para
            -- venda na mao e Asaas antigo. Agora usa o trilho canonico.
            (u.virou_pagante_em IS NOT NULL) AS ja_pagou_algum_dia
           FROM usuarios u
             LEFT JOIN auth.users au ON au.id = u.id
          WHERE u.telefone IS NOT NULL AND u.telefone <> ''::text
        )
 SELECT 'retencao_a'::text AS bucket,
    'Trial acabando amanha'::text AS bucket_label,
    base.usuario_id, base.nome_completo, base.email, base.telefone,
    base.data_cadastro, base.trial_fim, base.plano_vencimento,
    base.dias_para_plano_vencer, base.dias_desde_cadastro,
    base.dias_para_trial_expirar, base.dias_desde_trial_expirar,
    base.ultimo_acesso, base.last_sign_in_at,
    base.retencao_a_enviado_em AS ultimo_envio
   FROM base
  WHERE base.plano_pago = false AND base.ja_pagou_algum_dia = false
    AND base.trial_fim IS NOT NULL
    AND base.dias_para_trial_expirar = 1 AND base.dias_desde_trial_expirar <= 0
    AND (base.retencao_a_enviado_em IS NULL OR base.retencao_a_enviado_em < (now() - '7 days'::interval))
UNION ALL
 SELECT 'retencao_b'::text, 'Trial expirou ontem'::text,
    base.usuario_id, base.nome_completo, base.email, base.telefone,
    base.data_cadastro, base.trial_fim, base.plano_vencimento,
    base.dias_para_plano_vencer, base.dias_desde_cadastro,
    base.dias_para_trial_expirar, base.dias_desde_trial_expirar,
    base.ultimo_acesso, base.last_sign_in_at,
    base.retencao_b_enviado_em
   FROM base
  WHERE base.plano_pago = false AND base.ja_pagou_algum_dia = false
    AND base.trial_fim IS NOT NULL
    AND base.dias_desde_trial_expirar = 1
    AND (base.retencao_b_enviado_em IS NULL OR base.retencao_b_enviado_em < (now() - '7 days'::interval))
UNION ALL
 SELECT 'retencao_d'::text, 'Nao logou apos cadastro'::text,
    base.usuario_id, base.nome_completo, base.email, base.telefone,
    base.data_cadastro, base.trial_fim, base.plano_vencimento,
    base.dias_para_plano_vencer, base.dias_desde_cadastro,
    base.dias_para_trial_expirar, base.dias_desde_trial_expirar,
    base.ultimo_acesso, base.last_sign_in_at,
    base.retencao_d_enviado_em
   FROM base
  WHERE base.plano_pago = false AND base.dias_desde_cadastro >= 1 AND base.dias_desde_cadastro <= 2
    AND base.last_sign_in_at IS NULL
    AND (base.retencao_d_enviado_em IS NULL OR base.retencao_d_enviado_em < (now() - '7 days'::interval))
UNION ALL
 SELECT 'retencao_c1'::text, 'Ex-pagante sumido'::text,
    base.usuario_id, base.nome_completo, base.email, base.telefone,
    base.data_cadastro, base.trial_fim, base.plano_vencimento,
    base.dias_para_plano_vencer, base.dias_desde_cadastro,
    base.dias_para_trial_expirar, base.dias_desde_trial_expirar,
    base.ultimo_acesso, base.last_sign_in_at,
    base.retencao_c1_enviado_em
   FROM base
  WHERE base.plano_pago = false AND base.ja_pagou_algum_dia = true
    -- ex-pagante e medido pelo VENCIMENTO DO PLANO, nao pelo trial: era o
    -- trial_fim aqui que fazia ex-pagante sem MP escapar deste bucket.
    AND base.plano_vencimento IS NOT NULL
    AND base.dias_para_plano_vencer <= -7 AND base.dias_para_plano_vencer >= -90
    AND (base.retencao_c1_enviado_em IS NULL OR base.retencao_c1_enviado_em < (now() - '30 days'::interval))
UNION ALL
 SELECT 'retencao_c2'::text, 'Trial antigo (nunca pagou)'::text,
    base.usuario_id, base.nome_completo, base.email, base.telefone,
    base.data_cadastro, base.trial_fim, base.plano_vencimento,
    base.dias_para_plano_vencer, base.dias_desde_cadastro,
    base.dias_para_trial_expirar, base.dias_desde_trial_expirar,
    base.ultimo_acesso, base.last_sign_in_at,
    base.retencao_c2_enviado_em
   FROM base
  WHERE base.plano_pago = false AND base.ja_pagou_algum_dia = false
    AND base.trial_fim IS NOT NULL
    AND base.dias_desde_trial_expirar >= 7 AND base.dias_desde_trial_expirar <= 90
    AND (base.retencao_c2_enviado_em IS NULL OR base.retencao_c2_enviado_em < (now() - '30 days'::interval))
UNION ALL
 SELECT 'retencao_e'::text, 'Vence em breve'::text,
    base.usuario_id, base.nome_completo, base.email, base.telefone,
    base.data_cadastro, base.trial_fim, base.plano_vencimento,
    base.dias_para_plano_vencer, base.dias_desde_cadastro,
    base.dias_para_trial_expirar, base.dias_desde_trial_expirar,
    base.ultimo_acesso, base.last_sign_in_at,
    base.retencao_e_enviado_em
   FROM base
  WHERE base.plano_pago = true AND base.plano_vencimento IS NOT NULL
    AND base.dias_para_plano_vencer >= 0 AND base.dias_para_plano_vencer <= 3
    AND (base.retencao_e_enviado_em IS NULL OR base.retencao_e_enviado_em < (now() - '20 days'::interval));


-- ----------------------------------------------------------------------------
-- 5. Conferencia
-- ----------------------------------------------------------------------------
--
-- select ciclo, origem_pagamento, count(*) from vw_admin_contas group by 1,2 order by 1;
--
-- -- tem que dar ZERO: ninguem que ja pagou pode ser lido como trial
-- select count(*) from vw_admin_contas
--  where ciclo like 'trial%' and virou_pagante_em is not null;
--
-- -- o ciclo tem que concordar com o gate do banco
-- select ciclo, tem_acesso, count(*) from vw_admin_contas group by 1,2 order by 1;
--
-- select bucket, count(*) from vw_mensalli_retencao_saas group by 1 order by 1;


-- ----------------------------------------------------------------------------
-- 5. Funcoes de assinatura — passam a manter o trilho
-- ----------------------------------------------------------------------------

-- ativar_assinatura_usuario: chamada pelo webhook do Mercado Pago quando a
-- assinatura e autorizada e a cada cobranca recorrente aprovada.
--
-- Alem de gravar virou_pagante_em (write-once) e limpar cancelado_em, corrige
-- dois defeitos que estavam na versao em producao:
--
--   a) limites errados. Era premium=500, enterprise=-1, else=100 — contradizia
--      handle_new_user e o webhook, que usam starter=200/pro=600/premium=3000.
--      Um assinante premium era ativado com limite 500 em vez de 3000.
--   b) o UPDATE em controle_planos filtrava por
--      `mes_referencia = TO_CHAR(NOW(),'YYYY-MM')`. So 19 das 108 linhas tem o
--      mes corrente — para as outras 89 o update silenciosamente nao pegava, e
--      o limite ficava com o valor antigo. controle_planos tem UNIQUE(user_id):
--      e uma linha por conta, nao um historico mensal. Filtro removido.
create or replace function public.ativar_assinatura_usuario(p_user_id uuid, p_plano text)
returns void
language plpgsql
security definer
as $function$
declare
  v_limite_mensal integer;
begin
  case p_plano
    when 'premium'    then v_limite_mensal := 3000;
    when 'pro'        then v_limite_mensal := 600;
    when 'enterprise' then v_limite_mensal := -1;
    else                   v_limite_mensal := 200;   -- starter
  end case;

  update usuarios
     set plano_pago        = true,
         plano             = p_plano,
         limite_mensal     = v_limite_mensal,
         plano_vencimento  = now() + interval '30 days',
         virou_pagante_em  = coalesce(virou_pagante_em, now()),
         cancelado_em      = null,
         cancelado_motivo  = null,
         updated_at        = now()
   where id = p_user_id;

  update controle_planos
     set plano         = p_plano,
         limite_mensal = v_limite_mensal,
         status        = 'ativo',
         updated_at    = now()
   where user_id = p_user_id;
end;
$function$;


-- desativar_assinatura_usuario: chamada quando a assinatura e cancelada/pausada.
--
-- A versao anterior gravava `plano = 'basico'`, APAGANDO qual plano o cliente
-- pagava — no dia da reativacao ninguem sabia pra onde devolver a conta. E nao
-- registrava o cancelamento em lugar nenhum: a conta virava plano_pago = false
-- sem data e sem motivo, indistinguivel de um trial que acabou.
--
-- NAO toca em trial_fim nem em virou_pagante_em. E isso que mantem o
-- ex-pagante sendo lido como ex-pagante.
create or replace function public.desativar_assinatura_usuario(p_user_id uuid)
returns void
language plpgsql
security definer
as $function$
begin
  update usuarios
     set plano_pago       = false,
         cancelado_em     = coalesce(cancelado_em, now()),
         cancelado_motivo = coalesce(cancelado_motivo, 'assinatura_cancelada'),
         updated_at       = now()
   where id = p_user_id;
end;
$function$;
