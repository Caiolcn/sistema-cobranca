-- ============================================================
-- WhatsApp — Etapa 1: verdade e encanamento (11/08/26)
-- JÁ APLICADO EM PRODUÇÃO. Este arquivo é o registro do que subiu.
--
-- Contexto: a Etapa 0 desligou a sonda que derrubava os clientes (ver o topo de
-- supabase/functions/whatsapp-health-check/index.ts). Esta etapa conserta o que
-- o diagnóstico revelou de dado mentiroso.
-- ============================================================

-- 1) Destino do aviso de queda -------------------------------------------------
-- O aviso ia para usuarios.telefone + '55'. Em DDD de celular pré-2014 o JID
-- canônico NÃO tem o nono dígito, então o envio voltava 400 exists:false:
-- 107 tentativas falhas em 7 dias, 4 contas — clientes que caíram e NUNCA foram
-- avisados (a Nr assessoria passou 8 dias assim).
--
-- Medido na base: das 26 contas pagas, 18 têm ownerJid == telefone do gestor
-- (8 delas com grafia diferente); as outras 8 seguem para a consulta ao master.
alter table mensallizap add column if not exists gestor_jid text;

comment on column mensallizap.gestor_jid is
  'JID confirmado do gestor para avisos (resolvido via ownerJid ou consulta ao master). Nullable.';

-- 2) Motivo e hora da queda ----------------------------------------------------
-- Vêm do fetchInstances, que a varredura passou a ler no lugar de 26 chamadas de
-- connectionState. 401 = loggedOut (credencial morta, exige QR novo); os demais
-- são transitórios, em que o restart reconecta sem pareamento — é o que vai
-- guiar a recuperação automática da Etapa 2.
alter table whatsapp_health_checks add column if not exists motivo_queda integer;
alter table whatsapp_health_checks add column if not exists caiu_em timestamptz;

comment on column whatsapp_health_checks.motivo_queda is
  'disconnectionReasonCode da Evolution. 401 = loggedOut.';

-- 3) RPC do painel expõe os campos novos ---------------------------------------
-- Precisa de DROP: mudar o RETURNS TABLE não é permitido no CREATE OR REPLACE.
drop function if exists public.admin_whatsapp_saude();

create or replace function public.admin_whatsapp_saude()
returns table(
  user_id uuid, nome_empresa text, plano text, instance_name text,
  estado_painel text, probe_ok boolean, saudavel boolean, acao text, erro text,
  motivo_queda integer, caiu_em timestamptz, checado_em timestamptz
)
language sql
security definer
set search_path to 'public'
as $function$
  -- Pega só a execução mais recente (mesmo lote = mesmo checado_em)
  SELECT w.user_id, w.nome_empresa, w.plano, w.instance_name, w.estado_painel,
         w.probe_ok, w.saudavel, w.acao, w.erro, w.motivo_queda, w.caiu_em, w.checado_em
  FROM whatsapp_health_checks w
  WHERE is_admin()
    AND w.checado_em = (SELECT MAX(checado_em) FROM whatsapp_health_checks)
  ORDER BY w.saudavel ASC, w.nome_empresa ASC;
$function$;

-- 4) Estado da instância master ------------------------------------------------
-- Se a master cai, NENHUM aviso de desconexão sai para NENHUM cliente, e o único
-- registro disso era um console.warn dentro da edge function.
--
-- Tabela própria e não uma chave em `config` porque config.user_id é NOT NULL e
-- tem FK para usuários — e o dono das chaves globais da Evolution já não existe
-- mais, então qualquer insert novo lá estoura config_user_id_fkey. As linhas
-- antigas sobrevivem só porque FK é checada na escrita, não na leitura.
create table if not exists public.whatsapp_master_estado (
  id boolean primary key default true check (id),  -- trava em 1 linha só
  estado text not null,
  checado_em timestamptz not null default now()
);

alter table public.whatsapp_master_estado enable row level security;
-- Sem policies de propósito: só a service_role (edge function) escreve.
-- O painel lê pela RPC abaixo, que já valida is_admin().

create or replace function public.admin_whatsapp_master_estado()
returns table(estado text, checado_em timestamptz)
language sql
security definer
set search_path to 'public'
as $function$
  select m.estado, m.checado_em from whatsapp_master_estado m where is_admin();
$function$;
