-- Analise de nichos: quais tipos de negocio usam o Mensalli hoje.
-- Somente leitura. Serve pra decidir quais landings de nicho criar
-- (hoje existem: escolinhas, pilates, luta, natacao).
-- Lista cada conta com nome da empresa, plano, modalidades cadastradas
-- e quantidade de alunos ativos. Contas sem aluno ficam de fora.

select
  u.nome_empresa,
  u.plano,
  coalesce(u.plano_pago, false) as pago,
  count(distinct d.id) as alunos,
  string_agg(distinct m.nome, ', ') as modalidades
from usuarios u
join devedores d on d.user_id = u.id and (d.lixo is null or d.lixo = false)
left join modalidades m on m.user_id = u.id
group by u.id, u.nome_empresa, u.plano, u.plano_pago
order by pago desc, alunos desc;
