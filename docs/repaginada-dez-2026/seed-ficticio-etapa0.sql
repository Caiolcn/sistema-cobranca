-- =============================================================================
-- DADOS FICTÍCIOS PARA O BANCO LOCAL — Etapa 0 da repaginada (27/11/2026)
-- =============================================================================
-- Por quê: o banco local vem só com a estrutura de produção, sem nenhuma linha.
-- Este arquivo cria UMA conta de teste com 5 alunos inventados para o app abrir
-- e as telas Home, Clientes e Financeiro terem o que mostrar.
--
-- NADA aqui é de cliente real. Nomes "Aluno Teste", telefones 55999000000xx
-- (DDD 99 não manda nada para ninguém e a Evolution local é falsa) e e-mails
-- @exemplo.test (domínio reservado, não existe).
--
-- Login da conta de teste (só existe no banco LOCAL):
--   e-mail: gestor.teste@exemplo.test
--   senha:  Teste-Local-2026!
--
-- Onde rodar: SÓ no banco local. O próprio arquivo se recusa a rodar se
-- encontrar sinal de produção (segredos no Vault ou mais de 20 contas).
-- Jeito automático: apontar [db.seed] do supabase/config.toml para este arquivo
-- e rodar `npx supabase db reset` (o guia explica). Jeito manual: colar no
-- SQL Editor do Studio LOCAL (http://127.0.0.1:54323).
--
-- Idempotente: rodar duas vezes não duplica nada (ids fixos + on conflict).
-- Datas relativas a current_date: "vence hoje" é sempre hoje.
--
-- Situações criadas:
--   Aluno Teste 1 Em Dia       -> mensalidade deste mês PAGA + próxima em 25 dias
--   Aluno Teste 2 Vence Hoje   -> mensalidade pendente vencendo hoje
--   Aluno Teste 3 Atrasado     -> mensalidade pendente vencida há 10 dias
--   Aluno Teste 4 Vence Logo   -> mensalidade pendente vencendo em 3 dias
--   Aluno Teste 5 Inativo      -> assinatura desligada, última mensalidade paga há 2 meses
--
-- Como desfazer (no local): `npx supabase db reset` recria o banco do zero.
-- Ou, só a conta de teste: delete from auth.users where id = '0e7a0000-0000-4000-8000-000000000001';
-- (as chaves estrangeiras com cascade levam junto alunos, mensalidades, etc.)
-- =============================================================================

begin;

-- 0) Trava: nunca rodar fora do banco local.
do $$
begin
  if exists (select 1 from vault.secrets where name in ('project_url', 'service_role_key', 'cron_secret')) then
    raise exception 'PARE: este banco tem segredos de produção no Vault. O seed fictício só roda no banco LOCAL.';
  end if;
  if (select count(*) from public.usuarios) > 20 then
    raise exception 'PARE: este banco tem mais de 20 contas. Parece produção ou a cópia restaurada. O seed só roda no LOCAL.';
  end if;
end $$;

-- Conferência ANTES
select 'antes' as momento,
       (select count(*) from public.usuarios)     as contas,
       (select count(*) from public.devedores)    as alunos,
       (select count(*) from public.mensalidades) as mensalidades;

-- 1) Usuário de login (auth.users + auth.identities).
--    O gatilho on_auth_user_created (handle_new_user) cria sozinho as linhas em
--    usuarios, controle_planos e configuracoes_cobranca; e o gatilho de usuarios
--    cria a linha em mensallizap.
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change,
  email_change_token_current, phone_change, phone_change_token, reauthentication_token
) values (
  '00000000-0000-0000-0000-000000000000',
  '0e7a0000-0000-4000-8000-000000000001',
  'authenticated', 'authenticated',
  'gestor.teste@exemplo.test',
  extensions.crypt('Teste-Local-2026!', extensions.gen_salt('bf')),
  now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{"nome_completo":"Gestor Teste Local","telefone":"5599900000000","plano":"pro"}'::jsonb,
  now() - interval '90 days', now(),
  '', '', '', '', '', '', '', ''
)
on conflict (id) do nothing;

insert into auth.identities (id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at)
values (
  '0e7a0000-0000-4000-8000-0000000000a1',
  '0e7a0000-0000-4000-8000-000000000001',
  '0e7a0000-0000-4000-8000-000000000001',
  'email',
  '{"sub":"0e7a0000-0000-4000-8000-000000000001","email":"gestor.teste@exemplo.test","email_verified":true}'::jsonb,
  now(), now(), now()
)
on conflict do nothing;

-- Garantia: se o gatilho de cadastro não existir no local, cria as linhas na mão.
insert into public.usuarios (id, email, nome_completo, telefone, plano, limite_mensal, trial_fim, trial_ativo, plano_pago, status_conta, nome_empresa, asaas_formas_pagamento, landing_cta_final_destino)
values ('0e7a0000-0000-4000-8000-000000000001', 'gestor.teste@exemplo.test', 'Gestor Teste Local', '5599900000000',
        'pro', 600, now() - interval '87 days', false, false, 'ativo', 'Academia Exemplo (TESTE)',
        '{"pix": true, "boleto": false, "cartao": false}'::jsonb, 'whatsapp')
on conflict (id) do nothing;

insert into public.controle_planos (user_id, plano, limite_mensal, usage_count, mes_referencia, status)
values ('0e7a0000-0000-4000-8000-000000000001', 'pro', 600, 0, to_char(now(), 'YYYY-MM'), 'ativo')
on conflict (user_id) do nothing;

insert into public.configuracoes_cobranca (user_id, enviar_no_dia, enviar_3_dias_antes, enviar_3_dias_depois)
select '0e7a0000-0000-4000-8000-000000000001', true, true, true
where not exists (select 1 from public.configuracoes_cobranca where user_id = '0e7a0000-0000-4000-8000-000000000001');

-- 2) Conta como pagante do plano Pro.
--    Regra do projeto: plano muda nas DUAS tabelas (usuarios e controle_planos).
--    Rodando como postgres, o gatilho proteger_campos_cobranca deixa passar.
--    O gatilho meta_capi_purchase tenta avisar o Meta, mas no local o Vault está
--    vazio e ele só registra um aviso (nenhuma chamada sai).
update public.usuarios set
  nome_completo        = 'Gestor Teste Local',
  telefone             = '5599900000000',
  nome_empresa         = 'Academia Exemplo (TESTE)',
  plano                = 'pro',
  limite_mensal        = 600,
  plano_pago           = true,
  virou_pagante_em     = now() - interval '60 days',
  plano_vencimento     = now() + interval '30 days',
  trial_ativo          = false,
  status_conta         = 'ativo',
  chave_pix            = 'pix-falso@exemplo.test',
  modo_integracao      = 'manual',
  asaas_ambiente       = 'sandbox',
  onboarding_completed = true,
  onboarding_step      = 4
where id = '0e7a0000-0000-4000-8000-000000000001';

update public.controle_planos set
  plano = 'pro', limite_mensal = 600, status = 'ativo', mes_referencia = to_char(now(), 'YYYY-MM')
where user_id = '0e7a0000-0000-4000-8000-000000000001';

-- WhatsApp da conta: desconectado e com nome de instância que não existe.
update public.mensallizap set
  instance_name = 'teste-local-inexistente',
  conectado     = false,
  whatsapp_numero = null
where user_id = '0e7a0000-0000-4000-8000-000000000001';

-- 3) Tabela config: endereço FALSO da Evolution.
--    Sem isto, 14 edge functions (e as da loja) caem no endereço de PRODUÇÃO da Evolution
--    (está fixo no código como "plano B"). 127.0.0.1:9 recusa na hora.
--    config tem user_id NOT NULL e chave única no banco inteiro.
insert into public.config (user_id, chave, valor, descricao) values
  ('0e7a0000-0000-4000-8000-000000000001', 'evolution_api_url',         'http://127.0.0.1:9',             'LOCAL: endereço falso de propósito'),
  ('0e7a0000-0000-4000-8000-000000000001', 'evolution_api_key',         'chave-falsa-local-nao-funciona', 'LOCAL: chave falsa de propósito'),
  ('0e7a0000-0000-4000-8000-000000000001', 'evolution_master_instance', 'instancia-falsa-local',          'LOCAL: instância falsa'),
  ('0e7a0000-0000-4000-8000-000000000001', 'evolution_instance_name',   'instancia-falsa-local',          'LOCAL: instância falsa')
on conflict (chave) do update set valor = excluded.valor, descricao = excluded.descricao;

-- 4) Planos da academia de teste.
insert into public.planos (id, user_id, nome, valor, descricao, ativo, ciclo_cobranca, tipo, numero_aulas) values
  ('0e7a0000-0000-4000-8000-0000000001a1', '0e7a0000-0000-4000-8000-000000000001', 'Mensal Teste',          150.00, 'Plano fictício', true, 'mensal', 'recorrente', null),
  ('0e7a0000-0000-4000-8000-0000000001a2', '0e7a0000-0000-4000-8000-000000000001', 'Pacote 8 aulas Teste',  120.00, 'Plano fictício', true, 'mensal', 'pacote',     8)
on conflict (id) do nothing;

-- 5) Cinco alunos inventados (tabela devedores = alunos).
--    status do aluno aceita: pendente, em_aberto, pago.
--    "Inativo" no app = assinatura_ativa false e não bolsista.
insert into public.devedores (id, user_id, nome, telefone, email, valor_devido, data_vencimento, status, plano_id, assinatura_ativa, data_inicio_assinatura, origem) values
  ('0e7a0000-0000-4000-8000-0000000002a1', '0e7a0000-0000-4000-8000-000000000001', 'Aluno Teste 1 Em Dia',     '5599900000001', 'aluno1@exemplo.test', 150.00, current_date + 25, 'pago',     '0e7a0000-0000-4000-8000-0000000001a1', true,  current_date - 65, 'manual'),
  ('0e7a0000-0000-4000-8000-0000000002a2', '0e7a0000-0000-4000-8000-000000000001', 'Aluno Teste 2 Vence Hoje', '5599900000002', 'aluno2@exemplo.test', 150.00, current_date,      'pendente', '0e7a0000-0000-4000-8000-0000000001a1', true,  current_date - 30, 'manual'),
  ('0e7a0000-0000-4000-8000-0000000002a3', '0e7a0000-0000-4000-8000-000000000001', 'Aluno Teste 3 Atrasado',   '5599900000003', 'aluno3@exemplo.test', 150.00, current_date - 10, 'pendente', '0e7a0000-0000-4000-8000-0000000001a1', true,  current_date - 40, 'manual'),
  ('0e7a0000-0000-4000-8000-0000000002a4', '0e7a0000-0000-4000-8000-000000000001', 'Aluno Teste 4 Vence Logo', '5599900000004', 'aluno4@exemplo.test', 120.00, current_date + 3,  'pendente', '0e7a0000-0000-4000-8000-0000000001a2', true,  current_date - 27, 'manual'),
  ('0e7a0000-0000-4000-8000-0000000002a5', '0e7a0000-0000-4000-8000-000000000001', 'Aluno Teste 5 Inativo',    '5599900000005', 'aluno5@exemplo.test', 150.00, current_date - 60, 'pago',     '0e7a0000-0000-4000-8000-0000000001a1', false, current_date - 120, 'manual')
on conflict (id) do nothing;

-- 6) Mensalidades. status aceita: pendente, pago, atrasado, cancelado.
--    O app considera atrasada a pendente com vencimento no passado
--    (Clientes.js), então a atrasada fica como 'pendente' + data vencida.
insert into public.mensalidades (id, devedor_id, user_id, numero_mensalidade, valor, data_vencimento, status, is_mensalidade, descricao, data_pagamento, forma_pagamento, valor_pago) values
  -- Aluno 1: pagou a deste mês, próxima daqui a 25 dias
  ('0e7a0000-0000-4000-8000-0000000003a1', '0e7a0000-0000-4000-8000-0000000002a1', '0e7a0000-0000-4000-8000-000000000001', 1, 150.00, current_date - 5,  'pago',     true, 'Mensalidade (teste)', current_date - 6, 'pix', 150.00),
  ('0e7a0000-0000-4000-8000-0000000003a2', '0e7a0000-0000-4000-8000-0000000002a1', '0e7a0000-0000-4000-8000-000000000001', 2, 150.00, current_date + 25, 'pendente', true, 'Mensalidade (teste)', null, null, null),
  -- Aluno 2: vence hoje
  ('0e7a0000-0000-4000-8000-0000000003a3', '0e7a0000-0000-4000-8000-0000000002a2', '0e7a0000-0000-4000-8000-000000000001', 1, 150.00, current_date,      'pendente', true, 'Mensalidade (teste)', null, null, null),
  -- Aluno 3: atrasada há 10 dias
  ('0e7a0000-0000-4000-8000-0000000003a4', '0e7a0000-0000-4000-8000-0000000002a3', '0e7a0000-0000-4000-8000-000000000001', 1, 150.00, current_date - 10, 'pendente', true, 'Mensalidade (teste)', null, null, null),
  -- Aluno 4: vence em 3 dias (pacote)
  ('0e7a0000-0000-4000-8000-0000000003a5', '0e7a0000-0000-4000-8000-0000000002a4', '0e7a0000-0000-4000-8000-000000000001', 1, 120.00, current_date + 3,  'pendente', true, 'Pacote 8 aulas (teste)', null, null, null),
  -- Aluno 5 (inativo): última paga há 2 meses
  ('0e7a0000-0000-4000-8000-0000000003a6', '0e7a0000-0000-4000-8000-0000000002a5', '0e7a0000-0000-4000-8000-000000000001', 1, 150.00, current_date - 60, 'pago',     true, 'Mensalidade (teste)', current_date - 60, 'dinheiro', 150.00)
on conflict (id) do nothing;

commit;

-- Conferência DEPOIS (esperado: 1 conta pro paga, 5 alunos, 4 ativos, 6 mensalidades,
-- 1 vencendo hoje, 1 atrasada, 1 vencendo em até 3 dias, 2 pagas).
select 'depois' as momento,
       (select count(*) from public.usuarios where id = '0e7a0000-0000-4000-8000-000000000001' and plano = 'pro' and plano_pago) as conta_teste_ok,
       (select plano from public.controle_planos where user_id = '0e7a0000-0000-4000-8000-000000000001') as plano_controle,
       (select count(*) from public.devedores where user_id = '0e7a0000-0000-4000-8000-000000000001') as alunos,
       (select count(*) from public.devedores where user_id = '0e7a0000-0000-4000-8000-000000000001' and assinatura_ativa) as alunos_ativos,
       (select count(*) from public.mensalidades where user_id = '0e7a0000-0000-4000-8000-000000000001') as mensalidades,
       (select count(*) from public.mensalidades where user_id = '0e7a0000-0000-4000-8000-000000000001' and status = 'pendente' and data_vencimento = current_date) as vence_hoje,
       (select count(*) from public.mensalidades where user_id = '0e7a0000-0000-4000-8000-000000000001' and status = 'pendente' and data_vencimento < current_date) as atrasadas,
       (select count(*) from public.mensalidades where user_id = '0e7a0000-0000-4000-8000-000000000001' and status = 'pendente' and data_vencimento between current_date + 1 and current_date + 3) as vence_em_3_dias,
       (select count(*) from public.mensalidades where user_id = '0e7a0000-0000-4000-8000-000000000001' and status = 'pago') as pagas,
       (select valor from public.config where chave = 'evolution_api_url') as evolution_local;
