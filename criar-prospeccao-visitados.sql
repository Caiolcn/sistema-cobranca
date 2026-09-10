-- Prospeccao por rota (/admin > aba Prospeccao): memoria de quais portas ja foram batidas.
--
-- POR QUE A TABELA GUARDA TAO POUCO
-- Os termos do Google Maps Platform proibem montar base propria com dados do
-- Places. O unico campo que pode ser guardado por tempo indeterminado e o
-- `place_id`. Nome, endereco, telefone e nota tem que ser rebuscados na hora e
-- vivem so na tela — por isso NAO existe coluna `nome` aqui, e nao adicione uma.
--
-- O que persiste e so: qual lugar (place_id) + o que EU escrevi sobre ele.
-- Isso basta para o unico trabalho que a tabela tem: sumir da lista de amanha o
-- que ja foi visitado hoje.

create table if not exists public.prospeccao_visitados (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  place_id    text not null,
  -- visitado  = entrei e falei com alguem
  -- descartar = nao serve (fechado, grande demais, ja tem sistema)
  -- voltar    = valeu a pena mas o dono nao estava
  status      text not null default 'visitado'
              check (status in ('visitado', 'descartar', 'voltar')),
  nota        text,
  criado_em   timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (user_id, place_id)
);

comment on table public.prospeccao_visitados is
  'Portas ja batidas na prospeccao por rota. So place_id + anotacao propria: os termos do Google proibem persistir dados do Places.';

create index if not exists idx_prospeccao_visitados_user
  on public.prospeccao_visitados (user_id);

alter table public.prospeccao_visitados enable row level security;

-- Ferramenta interna: cada admin ve so o proprio historico de visitas.
-- Sem OR is_admin() de proposito — aqui nao existe caso de admin operando conta
-- alheia, e o historico de um nao deve poluir a lista do outro.
drop policy if exists prospeccao_visitados_proprio on public.prospeccao_visitados;
create policy prospeccao_visitados_proprio
  on public.prospeccao_visitados
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
