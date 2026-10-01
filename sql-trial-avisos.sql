-- ============================================================
-- Avisos automaticos do periodo de teste (edge trial-avisos)
-- 01/10/2026
--
-- 1. Templates (editaveis no /admin > Retencao > Editar mensagens)
-- 2. Flag on/off em config.trial_avisos_ativo -- NASCE DESLIGADA.
--    Ligar so depois de conferir o dryRun.
-- 3. pg_cron de hora em hora, 12h-23h UTC = 9h-20h BRT.
-- ============================================================

-- 1. Templates -----------------------------------------------
-- Variaveis: {{nome}} (primeiro nome), {{alunos}} (qtd), {{fim}} ("amanhã" / "hoje às 22h")
insert into templates_admin (tipo, titulo, mensagem) values
('trial_24h_sem_alunos', 'Trial 24h - não conectou, sem alunos',
'Oi {{nome}}! Aqui é o Caio, do Mensalli 👋

Vi que você criou sua conta ontem e ainda não conectou o WhatsApp. É ele que faz a cobrança chegar sozinha no seu aluno, sem você precisar lembrar ninguém.

Leva 1 minuto: abre o Mensalli no computador, vai em *WhatsApp* e lê o QR Code com o celular, igual ao WhatsApp Web.
👉 https://www.mensalli.com.br/app/whatsapp

Se quiser, me manda aqui sua lista de alunos (planilha, foto, do jeito que tiver) que eu cadastro pra você 😉'),

('trial_24h_com_alunos', 'Trial 24h - não conectou, já tem alunos',
'Oi {{nome}}! Aqui é o Caio, do Mensalli 👋

Vi que você já cadastrou {{alunos}} aluno(s) — falta só conectar o WhatsApp pra régua começar a cobrar por você.

Leva 1 minuto: abre o Mensalli no computador, vai em *WhatsApp* e lê o QR Code com o celular, igual ao WhatsApp Web.
👉 https://www.mensalli.com.br/app/whatsapp

Travou em alguma parte? Me responde aqui que eu te ajudo.'),

('trial_d1_sem_whatsapp', 'Fim do trial - WhatsApp não conectado',
'Oi {{nome}}! ⏰ Seu teste do Mensalli termina {{fim}}.

Ainda dá tempo de ver a cobrança automática funcionando: é só conectar o WhatsApp, leva 1 minuto.
👉 https://www.mensalli.com.br/app/whatsapp

Quer uma mão? Me responde aqui.'),

('trial_d1_sem_alunos', 'Fim do trial - conectado, sem alunos',
'Oi {{nome}}! ⏰ Seu teste do Mensalli termina {{fim}}.

Seu WhatsApp já está conectado ✅ Falta cadastrar os alunos pra régua começar a cobrar.

Se preferir, me manda a lista aqui (planilha, foto, do jeito que tiver) que eu cadastro pra você.'),

('trial_d1_ativo', 'Fim do trial - conta configurada',
'Oi {{nome}}! ⏰ Seu teste do Mensalli termina {{fim}}.

Depois disso, as cobranças automáticas dos seus {{alunos}} aluno(s) param de sair. Pra manter tudo funcionando, é só escolher um plano:
👉 https://www.mensalli.com.br/app/assinatura

Ficou alguma dúvida? Me chama aqui.')
on conflict (tipo) do nothing;

-- 2. Flag (nasce desligada) ----------------------------------
insert into config (user_id, chave, valor, descricao)
values ('c93b3e8d-78d5-4248-98a1-612149ffefe9', 'trial_avisos_ativo', 'false',
        'Liga/desliga a edge trial-avisos (ativacao 24h + fim do teste). true/false.')
on conflict (chave) do nothing;

-- 3. Cron ----------------------------------------------------
select cron.schedule(
  'trial-avisos',
  '5 12-23 * * *',
  $$
  SELECT net.http_post(
    url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'project_url') || '/functions/v1/trial-avisos',
    headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key')),
    body := '{}'::jsonb
  );
  $$
);

-- Ligar:     update config set valor = 'true'  where chave = 'trial_avisos_ativo';
-- Desligar:  update config set valor = 'false' where chave = 'trial_avisos_ativo';
-- Envios:    select * from retencao_saas_envios where canal = 'trial_auto' order by created_at desc;
