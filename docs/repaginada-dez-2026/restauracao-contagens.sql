-- =============================================================================
-- CONTAGENS PARA COMPARAR PRODUÇÃO x CÓPIA RESTAURADA
-- Etapa 0 da repaginada — teste de restauração do backup (27/11/2026)
-- =============================================================================
-- SOMENTE LEITURA: só conta linhas e olha datas. Não altera nada.
-- Pode rodar em PRODUÇÃO e na CÓPIA, pelo SQL Editor do painel de cada uma.
-- Devolve UMA tabela só, com 3 colunas: grupo, item, valor.
--   0-estrutura   -> quantas tabelas, views, funções, regras (policies), gatilhos,
--                    índices, crons, segredos do Vault, buckets, migrações
--   1-linhas      -> quantas linhas cada tabela tem (public, auth.users,
--                    auth.identities, storage.objects, storage.buckets)
--   2-ultimo-registro -> data do registro mais novo (created_at) de cada tabela
--                    do public que tem essa coluna
-- Nenhum nome, telefone ou CPF aparece: só números e datas.
--
-- Como comparar: rode em produção ANTES de pedir a restauração e exporte o
-- resultado (botão de download do SQL Editor, CSV). Rode na cópia depois do
-- restauracao-desligar-crons.sql e exporte também. O esperado:
--   - 0-estrutura igual nos dois (exceto crons ATIVAS, que na cópia vira 0);
--   - 1-linhas na cópia igual ou um pouco MENOR que produção (o backup é de
--     antes; produção continuou recebendo dado). Tabela com MENOS da metade, ou
--     tabela que existe numa e não na outra, é sinal de problema;
--   - 2-ultimo-registro na cópia perto da hora do backup escolhido.
-- Pode levar alguns segundos: conta cada tabela de verdade (count exato).
--
-- Como desfazer: não há o que desfazer (só leitura).
-- =============================================================================
with tabelas as (
  select n.nspname as esquema, c.relname as tabela
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where c.relkind in ('r', 'p')
    and not c.relispartition
    and (
      n.nspname = 'public'
      or (n.nspname = 'auth'    and c.relname in ('users', 'identities'))
      or (n.nspname = 'storage' and c.relname in ('objects', 'buckets'))
    )
),
estrutura as (
  select '0-estrutura' as grupo, 'tabelas public' as item, count(*)::text as valor from pg_tables where schemaname = 'public'
  union all select '0-estrutura', 'views public', count(*)::text from pg_views where schemaname = 'public'
  union all select '0-estrutura', 'funcoes public', count(*)::text
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public'
  union all select '0-estrutura', 'policies public', count(*)::text from pg_policies where schemaname = 'public'
  union all select '0-estrutura', 'policies storage', count(*)::text from pg_policies where schemaname = 'storage'
  union all select '0-estrutura', 'tabelas public SEM RLS', count(*)::text
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity
  union all select '0-estrutura', 'gatilhos public + auth.users', count(*)::text
    from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_namespace n on n.oid = c.relnamespace
    where not t.tgisinternal and (n.nspname = 'public' or (n.nspname = 'auth' and c.relname = 'users'))
  union all select '0-estrutura', 'indices public', count(*)::text from pg_indexes where schemaname = 'public'
  union all select '0-estrutura', 'extensoes', count(*)::text from pg_extension
  union all select '0-estrutura', 'crons total', count(*)::text from cron.job
  union all select '0-estrutura', 'crons ATIVAS', count(*)::text from cron.job where active
  union all select '0-estrutura', 'segredos no vault (so quantidade)', count(*)::text from vault.secrets
  union all select '0-estrutura', 'migracoes registradas', count(*)::text from supabase_migrations.schema_migrations
  union all select '0-estrutura', 'tabelas no realtime', count(*)::text from pg_publication_tables where pubname = 'supabase_realtime'
),
linhas as (
  select '1-linhas' as grupo,
         t.esquema || '.' || t.tabela as item,
         (xpath('/row/c/text()',
           query_to_xml(format('select count(*) as c from %I.%I', t.esquema, t.tabela), false, true, '')
         ))[1]::text as valor
  from tabelas t
),
ultimos as (
  select '2-ultimo-registro' as grupo,
         c.table_schema || '.' || c.table_name as item,
         coalesce((xpath('/row/m/text()',
           query_to_xml(format('select to_char(max(created_at), ''YYYY-MM-DD HH24:MI'') as m from %I.%I', c.table_schema, c.table_name), false, true, '')
         ))[1]::text, '(vazia)') as valor
  from information_schema.columns c
  join tabelas t on t.esquema = c.table_schema and t.tabela = c.table_name
  where c.table_schema = 'public' and c.column_name = 'created_at'
)
select grupo, item, valor from estrutura
union all select grupo, item, valor from linhas
union all select grupo, item, valor from ultimos
order by 1, 2;
