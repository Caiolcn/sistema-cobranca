-- =============================================================================
-- EXTRAS DA ESTRUTURA QUE O `supabase db dump` NÃO TRAZ
-- Etapa 0 da repaginada (27/11/2026) — SÓ PARA O BANCO LOCAL (Docker)
-- =============================================================================
-- Por quê: o dump do schema public não leva o que mora em schemas da própria
-- Supabase (auth, storage, realtime) nem configurações do banco. Sem isto, o
-- banco local abre, mas:
--   - criar usuário não cria a conta em usuarios/controle_planos (gatilho em auth.users);
--   - foto de aluno (avatars) e logo não sobem (buckets e regras do Storage);
--   - telas "ao vivo" (mensalidades, agendamentos, loja, CRM) não atualizam sozinhas;
--   - datas "de hoje" viram as de Londres depois das 21h (fuso do banco).
--
-- Tirado do catálogo de produção em 27/11/2026 (só estrutura, nenhuma linha de cliente).
-- Como usar: copiar para supabase/migrations/20261201000100_extras_auth_storage_realtime.sql
-- (o guia etapa-0-rede-de-protecao.md mostra o comando). NÃO rodar em produção:
-- lá tudo isto já existe.
--
-- Idempotente: pode rodar de novo sem duplicar nada.
--
-- Como desfazer (no local): `npx supabase db reset` sem este arquivo na pasta
-- supabase/migrations recria o banco local sem ele.
-- =============================================================================

begin;

-- 1) Fuso do banco igual ao de produção (lá: TimeZone=America/Sao_Paulo no banco).
do $$
begin
  execute 'alter database postgres set timezone to ''America/Sao_Paulo''';
exception when others then
  raise notice 'Não consegui ajustar o fuso do banco local (%). As datas podem virar às 21h.', sqlerrm;
end $$;

-- 2) Gatilhos em auth.users (iguais aos de produção).
--    handle_new_user cria usuarios + controle_planos + configuracoes_cobranca.
create or replace trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace trigger on_auth_user_created_meta
  after insert on auth.users
  for each row execute function public.trigger_meta_complete_signup();

create or replace trigger on_auth_user_login
  after update on auth.users
  for each row
  when (old.last_sign_in_at is distinct from new.last_sign_in_at)
  execute function public.atualizar_ultimo_acesso();

-- 3) Buckets do Storage (só a configuração; os arquivos NÃO vêm).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('artes',          'artes',          true,  null,      null),
  ('avatars',        'avatars',        true,  2097152,   array['image/jpeg','image/png','image/webp','image/gif','image/heic','image/heif']),
  ('avisos',         'avisos',         true,  null,      null),
  ('CentralDeAjuda', 'CentralDeAjuda', true,  null,      null),
  ('lead-midia',     'lead-midia',     false, null,      null),
  ('logos',          'logos',          true,  null,      null),
  ('organico',       'organico',       false, 104857600, array['image/png','image/jpeg','image/webp','video/mp4','video/quicktime'])
on conflict (id) do nothing;

-- 4) Regras (policies) do Storage — cópia fiel das 16 de produção.
do $$
declare
  p record;
begin
  for p in
    select * from (values
      ('Admin gerencia midia de lead',        'all',    'public',        $q$(bucket_id = 'lead-midia' and public.is_admin())$q$, $q$(bucket_id = 'lead-midia' and public.is_admin())$q$),
      ('Admin le midia de lead',              'select', 'public',        $q$(bucket_id = 'lead-midia' and public.is_admin())$q$, null),
      ('Logos sao publicas para leitura',     'select', 'public',        $q$(bucket_id = 'logos')$q$, null),
      ('Permitir leitura avisos',             'select', 'public',        $q$(bucket_id = 'avisos')$q$, null),
      ('Permitir upload avisos',              'insert', 'public',        null, $q$(bucket_id = 'avisos')$q$),
      ('Usuarios podem atualizar logo',       'update', 'authenticated', $q$(bucket_id = 'logos' and (storage.foldername(name))[1] = auth.uid()::text)$q$, null),
      ('Usuarios podem deletar logo',         'delete', 'authenticated', $q$(bucket_id = 'logos' and (storage.foldername(name))[1] = auth.uid()::text)$q$, null),
      ('Usuarios podem fazer upload de logo', 'insert', 'authenticated', null, $q$(bucket_id = 'logos' and (storage.foldername(name))[1] = auth.uid()::text)$q$),
      ('avatars_dono_delete',                 'delete', 'authenticated', $q$(bucket_id = 'avatars' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()))$q$, null),
      ('avatars_dono_insert',                 'insert', 'authenticated', null, $q$(bucket_id = 'avatars' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()))$q$),
      ('avatars_dono_select',                 'select', 'authenticated', $q$(bucket_id = 'avatars' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()))$q$, null),
      ('avatars_dono_update',                 'update', 'authenticated', $q$(bucket_id = 'avatars' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()))$q$, $q$(bucket_id = 'avatars' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()))$q$),
      ('organico_storage_admin_delete',       'delete', 'public',        $q$(bucket_id = 'organico' and public.is_admin())$q$, null),
      ('organico_storage_admin_insert',       'insert', 'public',        null, $q$(bucket_id = 'organico' and public.is_admin())$q$),
      ('organico_storage_admin_select',       'select', 'public',        $q$(bucket_id = 'organico' and public.is_admin())$q$, null),
      ('organico_storage_admin_update',       'update', 'public',        $q$(bucket_id = 'organico' and public.is_admin())$q$, null)
    ) as t(nome, cmd, papel, usando, checando)
  loop
    if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = p.nome) then
      execute format(
        'create policy %I on storage.objects for %s to %s %s %s',
        p.nome, p.cmd, p.papel,
        case when p.usando   is not null then 'using (' || p.usando || ')' else '' end,
        case when p.checando is not null then 'with check (' || p.checando || ')' else '' end
      );
    end if;
  end loop;
end $$;

-- 5) Tabelas que avisam a tela em tempo real (publicação supabase_realtime).
do $$
declare
  t text;
begin
  foreach t in array array['mensalidades','agendamentos','mensalli_leads','mensalli_lead_mensagens','loja_pedidos'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

commit;

-- Conferência (deve dar: 3 gatilhos, 7 buckets, 16 regras, 5 tabelas ao vivo).
select
  (select count(*) from pg_trigger where tgrelid = 'auth.users'::regclass and not tgisinternal) as gatilhos_auth_users,
  (select count(*) from storage.buckets) as buckets,
  (select count(*) from pg_policies where schemaname = 'storage') as regras_storage,
  (select count(*) from pg_publication_tables where pubname = 'supabase_realtime') as tabelas_ao_vivo;
