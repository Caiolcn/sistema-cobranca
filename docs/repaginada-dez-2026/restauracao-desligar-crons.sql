-- #############################################################################
-- #                                                                           #
-- #   RODAR SÓ NO PROJETO CÓPIA (o restaurado do backup). NUNCA EM PRODUÇÃO.   #
-- #                                                                           #
-- #   Antes de colar: olhe a barra de endereço do navegador.                  #
-- #   Produção é  .../project/zvlnkkmcytjtridiojxx/...                        #
-- #   Se aparecer zvlnkkmcytjtridiojxx, FECHE ESTA ABA. Você está na produção. #
-- #                                                                           #
-- #############################################################################
--
-- Etapa 0 da repaginada — teste de restauração do backup (27/11/2026)
--
-- Por quê: a cópia restaurada nasce com TUDO de produção, inclusive:
--   - 17 crons ligadas (pg_cron), em horário de Greenwich;
--   - o Vault com o endereço de PRODUÇÃO (project_url) e o segredo das crons.
-- Ou seja: 12 dessas crons, rodando na cópia, chamam as edge functions de
-- PRODUÇÃO com o segredo válido. A função de produção lê o banco de produção e
-- manda WhatsApp de verdade (lembrete de aula, fila de cobrança, cobrança do
-- Mensalli, avisos de trial, relatório) e publica no Instagram (organico-publicar
-- roda a cada 5 minutos). Seria um disparo DOBRADO para clientes reais.
-- Além disso, 2 gatilhos do banco (meta_capi_purchase em usuarios e
-- meta_capi_ativacao em logs_conexao) mandam evento ao Meta pelo mesmo endereço.
--
-- O que este arquivo faz, tudo de uma vez (se a trava do passo 0 falhar, nada é feito):
--   0. Trava: só segue se você colar o ref da CÓPIA (20 letras) e ele não for o de produção.
--   1. Desliga todas as crons (active = false). Ficam guardadas, só param.
--   2. Troca no Vault da cópia: project_url -> endereço que não existe;
--      service_role_key e cron_secret -> texto inútil.
--   3. Desliga os 2 gatilhos que chamam o Meta.
--   4. Troca na tabela config da cópia o endereço/chave da Evolution e os
--      webhooks do n8n por endereço que não existe.
--   5. Esvazia a fila de chamadas HTTP pendentes do pg_net (net.http_request_queue).
-- Não mexe em nenhuma tabela de aluno, mensalidade ou conta. As contagens do
-- restauracao-contagens.sql continuam comparáveis.
--
-- Como desfazer: não há motivo para religar nada na cópia. O fim do teste é
-- APAGAR o projeto cópia (Settings > General > Delete project), o que leva tudo
-- junto. Se precisar religar uma cron na cópia por algum motivo de teste:
--   select cron.alter_job(job_id := <jobid>, active := true);
-- (só depois de trocar o project_url do Vault da cópia de volta, o que NÃO se recomenda).
-- #############################################################################

begin;

do $$
declare
  -- >>> COLE AQUI O REF DA CÓPIA (as 20 letras depois de /project/ na URL da cópia) <<<
  v_ref_copia text := 'COLE_AQUI_O_REF_DA_COPIA';
  r record;
begin
  -- 0) Trava
  if v_ref_copia = 'COLE_AQUI_O_REF_DA_COPIA' then
    raise exception 'PARE: cole o ref da CÓPIA na linha v_ref_copia antes de rodar.';
  end if;
  if v_ref_copia ilike '%zvlnkkmcytjtridiojxx%' then
    raise exception 'PARE: esse é o ref de PRODUÇÃO. Este arquivo só roda na cópia.';
  end if;
  if length(v_ref_copia) <> 20 then
    raise exception 'PARE: o ref tem 20 letras. Confira o que foi colado.';
  end if;

  -- 1) Crons: desliga todas
  for r in select jobid from cron.job where active loop
    perform cron.alter_job(job_id := r.jobid, active := false);
  end loop;

  -- 2) Vault: tira o endereço e os segredos de produção da cópia
  begin
    for r in select id, name from vault.secrets where name in ('project_url', 'service_role_key', 'cron_secret') loop
      perform vault.update_secret(
        r.id,
        case when r.name = 'project_url' then 'http://127.0.0.1:9/copia-restaurada-sem-saida'
             else 'desativado-na-copia-' || r.name end
      );
    end loop;
  exception when others then
    raise warning 'Vault não foi trocado (%). As crons e os gatilhos já ficam desligados pelos passos 1 e 3.', sqlerrm;
  end;

  -- 3) Gatilhos que chamam o Meta via pg_net
  execute 'alter table public.usuarios disable trigger meta_capi_purchase';
  execute 'alter table public.logs_conexao disable trigger meta_capi_ativacao';

  -- 4) config: Evolution e webhooks do n8n apontando para o nada
  update public.config set valor = 'http://127.0.0.1:9'
   where chave in ('evolution_api_url', 'n8n_webhook_lembrete', 'n8n_webhook_recuperar_trial', 'n8n_webhook_vencimento_hoje');
  update public.config set valor = 'desativado-na-copia'
   where chave = 'evolution_api_key';

  -- 5) Fila do pg_net: chamadas que estavam esperando para sair
  begin
    delete from net.http_request_queue;
  exception when others then
    raise warning 'Não consegui esvaziar net.http_request_queue (%).', sqlerrm;
  end;
end $$;

commit;

-- Conferência (esperado: crons_ativas 0; vault_trocado_agora 3; os dois gatilhos 'D' = desligado;
-- evolution_neutralizada true; fila_pg_net 0)
select
  (select count(*) from cron.job)                  as crons_total,
  (select count(*) from cron.job where active)     as crons_ativas,
  (select count(*) from vault.secrets
    where name in ('project_url', 'service_role_key', 'cron_secret')
      and updated_at > now() - interval '15 minutes') as vault_trocado_agora,
  (select tgenabled from pg_trigger where tgname = 'meta_capi_purchase'  and tgrelid = 'public.usuarios'::regclass)     as gatilho_meta_purchase,
  (select tgenabled from pg_trigger where tgname = 'meta_capi_ativacao'  and tgrelid = 'public.logs_conexao'::regclass) as gatilho_meta_ativacao,
  (select valor = 'http://127.0.0.1:9' from public.config where chave = 'evolution_api_url') as evolution_neutralizada,
  (select count(*) from net.http_request_queue)    as fila_pg_net;
