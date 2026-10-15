-- Diagnóstico de funil do Mensalli (ativação, conversão, churn, reativação)
-- Rodar cada bloco separadamente no SQL Editor.

-- 1) Conversão por quantidade de alunos cadastrados nos 7 primeiros dias do trial
with u as (
  select id, created_at,
    (virou_pagante_em is not null or plano_pago or cancelado_em is not null) as pagou
  from usuarios
  where coalesce(role,'') <> 'admin'
    and (trial_fim < now() or plano_pago or virou_pagante_em is not null)
), a as (
  select u.*,
    (select count(*) from devedores d where d.user_id = u.id and d.created_at < u.created_at + interval '7 days') as al7
  from u
)
select case when al7 = 0 then '0' when al7 < 5 then '1-4' when al7 < 20 then '5-19' else '20+' end as faixa_alunos_7d,
  count(*) as n, sum(pagou::int) as pagaram, round(100.0 * avg(pagou::int)) as conv_pct
from a group by 1 order by 1;

-- 2) Lista para campanha de reativação (quem nunca pagou ou cancelou), já segmentada
with base as (
  select u.id, u.nome_completo, u.nome_empresa, u.telefone, u.email, u.created_at::date as cadastro,
    u.ultimo_acesso::date as ultimo_acesso,
    (u.virou_pagante_em is not null or u.cancelado_em is not null) as ja_pagou,
    (select count(*) from devedores d where d.user_id = u.id and coalesce(d.lixo,false) = false) as alunos
  from usuarios u
  where coalesce(u.role,'') <> 'admin'
    and not (coalesce(u.plano_pago,false) and u.cancelado_em is null)
    and (u.trial_fim < now() or u.virou_pagante_em is not null or u.cancelado_em is not null)
)
select
  case
    when ja_pagou then 'A_ex_cliente'
    when alunos >= 5 then 'B_trial_ativou'
    when ultimo_acesso >= current_date - 30 then 'C_trial_voltou_recente'
    when alunos between 1 and 4 then 'D_trial_comecou'
    else 'E_trial_nao_ativou'
  end as segmento,
  *
from base
order by segmento, ultimo_acesso desc nulls last;
