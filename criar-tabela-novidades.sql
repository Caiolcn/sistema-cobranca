-- ============================================================
-- Novidades do produto ("O que mudou no Mensalli")
--
-- Por que uma tabela e não um array no código: o changelog já existia
-- hardcoded em src/components/NotificacoesDropdown.js (const NOVIDADES) e
-- parou em 03/06/2026 — porque publicar exigia deploy. Aqui o gestor do
-- Mensalli publica pelo /admin e a novidade aparece na hora.
--
-- Duas tabelas:
--   novidades        — o catálogo (compartilhado, escrito só por admin)
--   novidades_lidas  — quem já viu / quem clicou (por usuário)
--
-- A leitura por usuário fica no BANCO, não no localStorage: o mesmo gestor
-- entra pelo celular e pelo computador, e o "novo pra você" tem que ser
-- coerente nos dois. E é o que permite medir clique -> uso da feature.
-- ============================================================

create table if not exists public.novidades (
  id            uuid primary key default gen_random_uuid(),

  -- Data que vale para ordenação e para o selo "novo pra você".
  -- Agendar é só marcar uma data futura: a policy de leitura já esconde.
  publicado_em  timestamptz not null default now(),

  tag           text not null default 'Novidade'
                  check (tag in ('Novidade', 'Melhoria', 'Correção')),
  titulo        text not null,
  resumo        text not null,     -- 1 linha: é o que aparece na barra da Home
  descricao     text,              -- texto completo do modal (opcional)
  icone         text,              -- iconify, ex: 'mdi:calendar-outline'
  imagem_url    text,              -- print da feature no modal (opcional)

  -- CTA: o ponto da coisa toda. Sem rota, a novidade é só informativa.
  cta_label     text,
  cta_rota      text,              -- ex: '/app/horarios'

  -- destaque = abre o modal sozinho na próxima entrada. Reservado pra
  -- entrega grande; o resto vive na barra e no sino, sem interromper.
  destaque      boolean not null default false,

  -- Segmentação simples. 'todos' é o default; os outros existem pra não
  -- anunciar recurso de plano pago pra quem está no teste, e vice-versa.
  publico       text not null default 'todos'
                  check (publico in ('todos', 'pagantes', 'trial')),

  ativo         boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists idx_novidades_publicado
  on public.novidades (publicado_em desc) where ativo;

create table if not exists public.novidades_lidas (
  user_id     uuid not null references public.usuarios(id) on delete cascade,
  novidade_id uuid not null references public.novidades(id) on delete cascade,
  visto_em    timestamptz not null default now(),
  -- Nulo até a pessoa clicar no CTA. É a métrica que importa: "viu" não
  -- prova nada, "clicou e foi pra tela" prova.
  clicado_em  timestamptz,
  primary key (user_id, novidade_id)
);

create index if not exists idx_novidades_lidas_novidade
  on public.novidades_lidas (novidade_id);

-- ---------- RLS ----------

alter table public.novidades enable row level security;
alter table public.novidades_lidas enable row level security;

drop policy if exists novidades_select on public.novidades;
create policy novidades_select on public.novidades
  for select to authenticated
  using (is_admin() or (ativo and publicado_em <= now()));

-- Escrita é só do admin do Mensalli (é catálogo do produto, não dado da conta).
drop policy if exists novidades_admin_write on public.novidades;
create policy novidades_admin_write on public.novidades
  for all to authenticated
  using (is_admin()) with check (is_admin());

drop policy if exists novidades_lidas_select on public.novidades_lidas;
create policy novidades_lidas_select on public.novidades_lidas
  for select to authenticated
  using (user_id = auth.uid() or is_admin());

drop policy if exists novidades_lidas_insert on public.novidades_lidas;
create policy novidades_lidas_insert on public.novidades_lidas
  for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists novidades_lidas_update on public.novidades_lidas;
create policy novidades_lidas_update on public.novidades_lidas
  for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------- métricas ----------
-- security_invoker: a view respeita a RLS de quem consulta, senão qualquer
-- usuário autenticado leria a contagem de todo mundo.
create or replace view public.vw_novidades_metricas
  with (security_invoker = on) as
select
  n.id,
  n.titulo,
  n.tag,
  n.publicado_em,
  n.destaque,
  n.ativo,
  n.cta_rota,
  count(l.user_id)                                        as vistos,
  count(l.clicado_em)                                     as cliques,
  case when count(l.user_id) = 0 then 0
       else round(100.0 * count(l.clicado_em) / count(l.user_id), 1)
  end                                                     as taxa_clique
from public.novidades n
left join public.novidades_lidas l on l.novidade_id = n.id
group by n.id;

-- ---------- conteúdo ----------
-- As novidades em si NÃO ficam versionadas aqui de propósito: elas nascem e são
-- editadas em /app/admin?aba=novidades. Este arquivo é só o esquema.
-- A carga inicial (9 entregas de jun–ago/2026) já foi aplicada em produção.
