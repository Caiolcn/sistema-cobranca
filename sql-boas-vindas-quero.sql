-- Boas-vindas em 2 tempos: "responde QUERO" (02/11/2026)
-- ---------------------------------------------------------------------------
-- POR QUE
-- Até aqui o cadastro mandava 2 mensagens pela instância MASTER (saudação +
-- cobrança de exemplo) e, ~42h depois, o trial-avisos mandava o aviso de fim
-- de teste (trial_d1_*). Quem nunca respondeu levava 3 mensagens do número
-- comercial do Mensalli -- e mensagem automática pra quem não responde é o que
-- faz o WhatsApp bloquear número.
--
-- REGRA NOVA: no máximo 2 mensagens automáticas do master pra quem nunca
-- respondeu.
--   1. Cadastro: 1 mensagem só, pedindo "responde QUERO" (signup-boas-vindas).
--   2. Respondeu QUERO/qro/sim/manda/👍: o whatsapp-bot manda a cobrança de
--      exemplo e, 5s depois, os próximos passos.
--      Respondeu outra coisa: nada automático; avisa o dono no
--      RELATORIO_WHATSAPP_TO (1x por conta).
--   3. Calado 24h: o trial-avisos manda UMA mensagem conforme o estado da conta.
--   4. Depois disso, nada automático pra quem nunca respondeu -- o trial_d1_*
--      passa a exigir boas_vindas_respondeu_em preenchido.
--   Fora da regra (decisão do dono): avisos de "WhatsApp desconectou"
--   (logout e zumbi), que só atingem quem já conectou.
--
-- O QUE FAZ (idempotente, pode rodar 2x)
--   1. Colunas novas em usuarios (carimbos timestamptz, não booleano).
--   2. Preenche boas_vindas_respondeu_em de quem já escreveu pro master.
--   3. Templates novos em templates_admin (só insere se não existir).
--   4. Flag config.boas_vindas_followup_ativo (liga/desliga o envio das 24h).
--
-- ORDEM DE DEPLOY: este SQL -> whatsapp-bot -> trial-avisos ->
-- signup-boas-vindas -> front (Signup.js).
--
-- REVERTER: update config set valor = 'false' where chave = 'boas_vindas_followup_ativo';
-- e voltar as 3 funções/tela para o commit anterior. As colunas podem ficar.
-- ---------------------------------------------------------------------------

-- ---------- 1. Colunas ----------
alter table usuarios add column if not exists boas_vindas_aguarda_quero_desde timestamptz;
alter table usuarios add column if not exists boas_vindas_respondeu_em       timestamptz;
alter table usuarios add column if not exists boas_vindas_exemplo_enviado_em timestamptz;
alter table usuarios add column if not exists boas_vindas_alerta_enviado_em  timestamptz;

comment on column usuarios.boas_vindas_aguarda_quero_desde is
  'Fluxo novo de boas-vindas: quando saiu o "responde QUERO". NULL = conta do fluxo antigo (ja recebeu saudacao + exemplo) ou sem boas-vindas.';
comment on column usuarios.boas_vindas_respondeu_em is
  'Primeira mensagem que o dono da conta mandou pro numero master depois do cadastro. NULL = nunca respondeu: no maximo 2 mensagens automaticas do master.';
comment on column usuarios.boas_vindas_exemplo_enviado_em is
  'Trava de envio unico da cobranca de exemplo (resposta ao QUERO).';
comment on column usuarios.boas_vindas_alerta_enviado_em is
  'Trava do aviso ao dono (RELATORIO_WHATSAPP_TO) na primeira resposta que nao e QUERO.';

-- Busca do trial-avisos: contas novas que nunca responderam.
create index if not exists idx_usuarios_bv_aguarda
  on usuarios (boas_vindas_aguarda_quero_desde)
  where boas_vindas_aguarda_quero_desde is not null and boas_vindas_respondeu_em is null;

-- ---------- 2. Retroativo: quem já escreveu pro master ----------
-- Contas dos últimos 15 dias com mensagem RECEBIDA no CRM de leads depois do
-- cadastro. Casa pelo vínculo do lead ou pelo telefone (tel_chave = DDD + 8
-- últimos dígitos, cobre com e sem o 9). Sem isso, contas em teste que já
-- conversaram perderiam o aviso de fim de teste.
update usuarios u
   set boas_vindas_respondeu_em = r.primeira
  from (
    select u2.id, min(m.enviado_em) as primeira
      from usuarios u2
      join mensalli_leads l
        on l.usuario_id = u2.id
        or (tel_chave(l.telefone) is not null and tel_chave(l.telefone) = tel_chave(u2.telefone))
      join mensalli_lead_mensagens m
        on m.lead_id = l.id and m.direcao = 'in' and m.enviado_em >= u2.created_at
     where u2.created_at > now() - interval '15 days'
     group by u2.id
  ) r
 where u.id = r.id
   and u.boas_vindas_respondeu_em is null;

-- ---------- 3. Templates ----------
-- Variáveis: {{nome}} (primeiro nome), {{alunos}} (qtde de alunos).
-- Só insere se não existir: rodar de novo não apaga texto editado.
insert into templates_admin (tipo, titulo, mensagem) values
('bv_exemplo', 'Boas-vindas: cobrança de exemplo (resposta ao QUERO)',
'Olá, {{nome}}.

Este é um lembrete referente à sua mensalidade:

📌 Plano Mensal
💰 R$ 150,00
📅 Vencimento: dia 10

🔑 Chave PIX: chave-de-exemplo@mensalli.com.br (fictícia)

Estamos à disposição para qualquer esclarecimento.
━━━━━━━━━━━━━━━
{{nome}}, essa é uma cobrança de exemplo — é assim que seus alunos vão receber, direto do seu WhatsApp. E dá pra editar o texto do jeito que quiser ✏️'),
('bv_proximos_passos', 'Boas-vindas: próximos passos (5s depois do exemplo)',
'Pra começar a cobrar assim, faltam 2 passos: cadastrar os alunos e conectar seu WhatsApp. Ou, se preferir, me manda sua lista de alunos (planilha, print ou foto) que eu cadastro tudo pra você. Qual você prefere?'),
('bv24_sem_nada', 'Boas-vindas 24h sem resposta: não conectou e não cadastrou',
'Oi {{nome}}, é o Caio do Mensalli de novo 🙂 Pra cobrança começar a sair sozinha faltam 2 passos: cadastrar seus alunos e conectar seu WhatsApp (leva 1 minuto, igual WhatsApp Web). Se preferir, me manda sua lista de alunos aqui (planilha, print ou foto) que eu cadastro tudo pra você. Quer que eu cadastre?'),
('bv24_conectado_sem_alunos', 'Boas-vindas 24h sem resposta: conectou, sem alunos',
'Oi {{nome}}, é o Caio do Mensalli 🙂 Vi que seu WhatsApp já tá conectado ✅ Agora só falta cadastrar os alunos pra cobrança sair sozinha. Me manda a lista aqui (planilha, print ou foto) que eu cadastro pra você. Pode ser?'),
('bv24_alunos_sem_conexao', 'Boas-vindas 24h sem resposta: cadastrou, não conectou',
'Oi {{nome}}, é o Caio do Mensalli 🙂 Vi que você já cadastrou {{alunos}} aluno(s) 👏 Só falta conectar seu WhatsApp pra cobrança sair sozinha: abre o Mensalli no computador, vai em WhatsApp e lê o QR Code.
👉 https://www.mensalli.com.br/app/whatsapp

Consegue fazer hoje?')
on conflict (tipo) do nothing;

-- ---------- 4. Flag ----------
-- config tem user_id NOT NULL: a linha nova herda o user_id da linha de
-- trial_avisos_ativo (mesmo dono das demais chaves globais).
insert into config (user_id, chave, valor, descricao)
select c.user_id, 'boas_vindas_followup_ativo', 'true',
       'trial-avisos: mensagem unica de 24h pra quem nao respondeu o "responde QUERO" (sql-boas-vindas-quero.sql)'
  from config c
 where c.chave = 'trial_avisos_ativo'
   and not exists (select 1 from config where chave = 'boas_vindas_followup_ativo')
 limit 1;

-- ---------- Conferência ----------
select
  (select count(*) from information_schema.columns
    where table_schema = 'public' and table_name = 'usuarios'
      and column_name like 'boas_vindas_%')                                   as colunas_boas_vindas_esperado_5,
  (select count(*) from templates_admin where tipo like 'bv%')                as templates_bv_esperado_5,
  (select valor from config where chave = 'boas_vindas_followup_ativo')       as followup_ativo,
  (select count(*) from usuarios
    where created_at > now() - interval '15 days'
      and boas_vindas_respondeu_em is not null)                               as contas_15d_que_ja_responderam,
  (select count(*) from usuarios
    where created_at > now() - interval '15 days'
      and boas_vindas_respondeu_em is null)                                   as contas_15d_nunca_responderam;
