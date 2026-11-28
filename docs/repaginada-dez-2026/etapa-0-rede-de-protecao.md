# Etapa 0 — Rede de proteção

Repaginada de dezembro/2026. Escrito em 27/11/2026 a partir do catálogo de produção (só estrutura, nenhuma linha de cliente foi lida).

O objetivo é ter duas coisas antes de mexer em qualquer tela ou tabela:

1. **Um Mensalli inteiro rodando no seu computador**, com a mesma estrutura de produção e só dados inventados. Erro ali não chega em cliente.
2. **A prova de que o backup volta**: restaurar o backup num projeto separado na nuvem, conferir que está tudo lá e apagar.

Nenhum passo deste guia escreve na produção. A produção só é **lida** em dois momentos: no `db dump` (copia a estrutura, sem dado) e no `restauracao-contagens.sql` (só conta linhas).

## Arquivos desta pasta

| Arquivo | Para que serve | Onde roda |
| --- | --- | --- |
| `etapa-0-rede-de-protecao.md` | Este guia | — |
| `local-extras-auth-storage-realtime.sql` | O que o dump não traz: gatilhos de cadastro, buckets e regras do Storage, tempo real, fuso | Só no banco local (vira migração) |
| `seed-ficticio-etapa0.sql` | Conta de teste + 5 alunos inventados | Só no banco local |
| `.env.local.exemplo` | Modelo das variáveis das edge functions, só nomes e valores falsos | Copiar para `supabase/.env.local` |
| `restauracao-desligar-crons.sql` | Desliga tudo que dispara mensagem na cópia restaurada | Só no projeto cópia |
| `restauracao-contagens.sql` | Conta linhas e objetos para comparar | Produção e cópia (só leitura) |

---

## Antes de tudo: comandos que você NÃO roda nesta etapa

Alguns comandos do Supabase CLI parecem inofensivos e mexem direto na produção. Enquanto o projeto estiver "ligado" (`supabase link`), estes ficam proibidos:

| Comando | O que faria |
| --- | --- |
| `supabase db push` | Tentaria aplicar a migração-base **na produção** |
| `supabase db reset --linked` | **Apaga e recria o banco de produção.** Sem `--linked` é só o local |
| `supabase migration repair` | Reescreve o histórico de migrações da produção |
| `supabase functions deploy` | Publica função na produção |
| `supabase secrets set` | Troca segredo da produção |
| `supabase db dump --data-only` ou `--data` | Baixaria **dado de cliente** para o computador |

Regra simples: se o comando tiver `--linked`, `push`, `deploy`, `secrets` ou `repair`, pare e pergunte.

---

## Parte 1 — Supabase local só com a estrutura

### O que já existe no repositório (conferido em 27/11)

- **Não existe** `supabase/config.toml`. Vamos criar com `supabase init`.
- `supabase/migrations/` tem 4 arquivos antigos de 01 e 02/10/2026. Eles **quebram** o banco local: três têm o mesmo número de versão (`20261001`), e um deles cria a tabela `outbound_leads` apontando para uma tabela `instancias` que não existe em produção. A produção registra 118 migrações com outros nomes; esses 4 arquivos não batem com nenhuma. Vamos tirá-los da pasta (passo 1.6), sem apagar.
- `supabase/.temp/` já tem o projeto de produção ligado (`zvlnkkmcytjtridiojxx`) e está fora do Git.
- Docker Desktop está instalado (versão 29.9). O Supabase CLI **não** está instalado; vamos usar pelo `npx`, que baixa sozinho.
- Produção usa Postgres 17.

### 1.1 Abrir o terminal na pasta do projeto

Abra o PowerShell. O comando abaixo só entra na pasta do projeto. Se der "não encontrado", o caminho mudou.

```powershell
cd "C:\Users\cttca\Documents\sistema-cobranca\sistema-cobranca"
```

### 1.2 Conferir que o Docker está ligado

O Supabase local roda dentro do Docker. Este comando pergunta ao Docker se ele está de pé. Se aparecer `Server Version: ...`, está ok. Se aparecer "cannot connect" ou "error during connect", abra o Docker Desktop, espere a baleia ficar parada e rode de novo.

```powershell
docker info --format "Server Version: {{.ServerVersion}}"
```

### 1.3 Baixar o Supabase CLI e ver a versão

Na primeira vez o `npx` pergunta "Ok to proceed? (y)": responda `y`. Ele baixa o CLI (uns 50 MB) e mostra a versão. Pode dar erro de rede ou antivírus bloqueando o download; nesse caso, tente de novo ou libere no antivírus.

```powershell
npx supabase --version
```

### 1.4 Entrar na sua conta do Supabase

Abre o navegador para você autorizar o CLI na sua conta. Só lê/guarda um token no seu computador; não muda nada no projeto. Se o navegador não abrir, o terminal mostra um link para copiar.

```powershell
npx supabase login
```

### 1.5 Criar o config.toml do ambiente local

Cria `supabase/config.toml` (a configuração do Supabase no computador). Não mexe em `supabase/functions` nem em produção. Se perguntar sobre "VS Code settings for Deno" ou "IntelliJ", responda `N`. Se disser que já existe, siga em frente.

```powershell
npx supabase init
```

Depois abra o arquivo no Bloco de Notas para três ajustes:

```powershell
notepad supabase\config.toml
```

1. Na seção `[db]`, confira que está `major_version = 17` (igual produção).
2. Na seção `[analytics]`, troque para `enabled = false`. No Windows esse serviço costuma travar o `supabase start` e não faz falta.
3. Na seção `[db.seed]`, deixe assim (é o que faz o banco local nascer com os dados fictícios):

```toml
[db.seed]
enabled = true
sql_paths = ["../docs/repaginada-dez-2026/seed-ficticio-etapa0.sql"]
```

4. No fim do arquivo, cole o bloco abaixo. Ele repete o que produção faz: essas 31 funções aceitam chamada sem login (páginas públicas, webhooks e crons). Sem isto, portal do aluno, agendamento e loja dão erro 401 no local.

```toml
[functions.mercadopago-webhook]
verify_jwt = false
[functions.telegram-gastos]
verify_jwt = false
[functions.organico-coletar]
verify_jwt = false
[functions.mensagens-worker]
verify_jwt = false
[functions.relatorio-mensagens]
verify_jwt = false
[functions.loja-pedido-status]
verify_jwt = false
[functions.portal-solicitar-acesso]
verify_jwt = false
[functions.agendamento-identificar]
verify_jwt = false
[functions.conciliar-cartao-mp]
verify_jwt = false
[functions.signup-verificar-whatsapp]
verify_jwt = false
[functions.organico-referencias]
verify_jwt = false
[functions.loja-dados]
verify_jwt = false
[functions.alerta-despesas]
verify_jwt = false
[functions.landing-dados]
verify_jwt = false
[functions.organico-publicar]
verify_jwt = false
[functions.portal-dados]
verify_jwt = false
[functions.loja-comprar]
verify_jwt = false
[functions.asaas-webhook]
verify_jwt = false
[functions.organico-importar]
verify_jwt = false
[functions.agendamento-dados]
verify_jwt = false
[functions.loja-escolher-turma]
verify_jwt = false
[functions.admin-impersonar-resgatar]
verify_jwt = false
[functions.whatsapp-zumbi-diario]
verify_jwt = false
[functions.meta-ads-sync]
verify_jwt = false
[functions.whatsapp-bot]
verify_jwt = false
[functions.agendamento-cancelar]
verify_jwt = false
[functions.cobranca-saas]
verify_jwt = false
[functions.loja-pagar]
verify_jwt = false
[functions.lembrete-aula-24h]
verify_jwt = false
[functions.trial-avisos]
verify_jwt = false
[functions.portal-pagar]
verify_jwt = false
```

Atenção: o `config.toml` só vale para o computador. Ele **não** é enviado para produção por nenhum comando desta etapa.

### 1.6 Tirar as 4 migrações antigas da pasta (mover, não apagar)

Esses comandos criam a pasta `sql/estrutura-historico/` e movem os 4 arquivos para lá pelo Git (o histórico deles fica preservado). Nada é apagado. Se o `git mv` reclamar que o arquivo não existe, alguém já moveu; siga em frente.

```powershell
New-Item -ItemType Directory -Force sql\estrutura-historico
```

```powershell
Get-ChildItem supabase\migrations\*.sql | ForEach-Object { git mv $_.FullName sql\estrutura-historico\ }
```

Confira que a pasta de migrações ficou vazia (não deve listar nada):

```powershell
Get-ChildItem supabase\migrations
```

### 1.7 Ligar o CLI ao projeto de produção (só para ler a estrutura)

Grava no `supabase/.temp` qual é o projeto. Não muda nada na produção. Se pedir "database password", aperte Enter para pular. Se der erro de permissão, rode de novo o `login` do passo 1.4.

```powershell
npx supabase link --project-ref zvlnkkmcytjtridiojxx
```

### 1.8 Copiar a estrutura da produção (sem nenhuma linha de dado)

Este é o único comando que lê a produção. O `db dump` **sem opção nenhuma** copia só a estrutura: tabelas, colunas, views, funções, regras de acesso (RLS) e gatilhos do schema `public` (e de outros schemas que não são da Supabase, como `seguranca_backup`). Não use `--data-only` nem `--data`: esses trazem dado de cliente.

Pode pedir a senha do banco. Ela fica no painel em Project Settings > Database. **Não clique em "Reset database password"** sem antes checar o que usa essa senha (n8n, scripts): trocar derruba quem usa. Pode demorar 1 a 3 minutos. Se der "Docker not running", volte ao passo 1.2.

```powershell
npx supabase db dump --linked -f supabase\migrations\20261201000000_base_producao.sql
```

Confira que não veio dado. O comando procura comandos de inserção de linha no arquivo; o resultado tem que ser `0`. Se der mais que 0, **apague o arquivo** (`Remove-Item supabase\migrations\20261201000000_base_producao.sql`) e me chame.

```powershell
(Select-String -Path supabase\migrations\20261201000000_base_producao.sql -Pattern "^\s*(INSERT INTO|COPY )" | Measure-Object).Count
```

**Não faça commit deste arquivo ainda.** O repositório é público e a estrutura completa com todas as regras de acesso é um mapa para quem quer atacar (o mesmo motivo de `docs/security-audit/` estar fora do Git). Conferi no catálogo: nenhuma função, view, padrão de coluna ou comentário tem chave, telefone, e-mail ou id de cliente escrito. Mesmo assim, se ele vai para o Git é decisão para o revisor-seguranca.

### 1.9 Colocar os extras que o dump não traz

Copia o arquivo de extras para a pasta de migrações com um número logo depois da base. Ele recria no local os 3 gatilhos de `auth.users` (o que cria a conta em `usuarios`/`controle_planos` ao cadastrar), os 7 buckets e as 16 regras do Storage, as 5 tabelas de tempo real e o fuso de São Paulo.

```powershell
Copy-Item docs\repaginada-dez-2026\local-extras-auth-storage-realtime.sql supabase\migrations\20261201000100_extras_auth_storage_realtime.sql
```

### 1.10 Copiar o modelo de variáveis das funções

Cria `supabase/.env.local` a partir do modelo (só valores falsos). O segundo comando confirma que o Git ignora o arquivo: tem que aparecer uma linha citando `.gitignore`. Se não aparecer nada, **não continue**: me chame.

```powershell
Copy-Item docs\repaginada-dez-2026\.env.local.exemplo supabase\.env.local
```

```powershell
git check-ignore -v supabase\.env.local
```

### 1.11 Subir o Supabase no computador

Baixa as imagens do Supabase no Docker (primeira vez: alguns GB, 5 a 15 minutos), sobe o banco, aplica as duas migrações e roda o seed fictício. No fim mostra uma lista de endereços e chaves **locais** (são chaves de demonstração, não servem para produção).

O que pode dar errado:
- "port is already allocated" / porta 54321-54324 ocupada: outro Supabase local já está rodando. Rode `npx supabase stop` e tente de novo.
- Erro de SQL numa migração: veja a seção 1.13.

```powershell
npx supabase start
```

### 1.12 Recriar o banco local do zero quando quiser

Apaga **o banco do computador** e recria a partir das migrações + seed. Use sempre que bagunçar os dados de teste. **Nunca** com `--linked`.

```powershell
npx supabase db reset
```

Mostrar de novo os endereços e as chaves locais:

```powershell
npx supabase status
```

### 1.13 Se o `db reset` / `start` reclamar de algum objeto do dump

O dump vem da produção e às vezes traz linhas que o banco local recusa. Os casos comuns:

| Mensagem | Causa | O que fazer |
| --- | --- | --- |
| `permission denied ... supabase_admin` ou `must be owner` em `ALTER DEFAULT PRIVILEGES` / `OWNER TO` | Linha que só o dono interno da Supabase pode rodar | Abrir o arquivo da base, achar a linha citada e colocar `-- ` no começo dela. Rodar `db reset` de novo |
| `extension ... is not available` | Extensão que não existe na imagem local | Comentar o `CREATE EXTENSION` citado (as 7 de produção existem no local; ver lista na Parte 6) |
| `relation "instancias" does not exist` | Migração antiga ainda na pasta | Refazer o passo 1.6 |
| `duplicate key ... schema_migrations` | Duas migrações com o mesmo número | Refazer o passo 1.6 |
| Erro no seed (`PARE: ...`) | A trava do seed achou sinal de produção | Você está no banco errado. Pare |

Para ver o erro com detalhe:

```powershell
npx supabase db reset --debug
```

Comentar linha no arquivo da base é ajuste **só do local**. Anote o que comentou no fim deste guia (seção "Ajustes feitos no dump") para o banco-dados levar em conta quando organizar as migrações.

### 1.14 Conferir que o banco local bate com produção

Abra o Studio local no navegador: <http://127.0.0.1:54323>, menu SQL Editor, e rode a consulta abaixo. Em produção, em 27/11, os números eram: **87 tabelas, 39 views, 92 funções, 203 regras no public, 16 no storage, 31 gatilhos no public, 332 índices, 3 gatilhos em auth.users**. No local o esperado é igual, com **0 crons**.

```sql
select
  (select count(*) from pg_tables where schemaname = 'public') as tabelas,
  (select count(*) from pg_views where schemaname = 'public') as views,
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public') as funcoes,
  (select count(*) from pg_policies where schemaname = 'public') as regras_public,
  (select count(*) from pg_policies where schemaname = 'storage') as regras_storage,
  (select count(*) from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_namespace n on n.oid = c.relnamespace where not t.tgisinternal and n.nspname = 'public') as gatilhos_public,
  (select count(*) from pg_indexes where schemaname = 'public') as indices,
  (select count(*) from pg_trigger where tgrelid = 'auth.users'::regclass and not tgisinternal) as gatilhos_auth,
  (select count(*) from cron.job) as crons,
  (select count(*) from vault.secrets) as segredos_vault;
```

Se `crons` der mais que 0 no local (não deveria), desligue todas com:

```sql
select cron.unschedule(jobid) from cron.job;
```

`segredos_vault` tem que dar 0 no local. Com o Vault vazio, mesmo que uma cron ou gatilho tentasse chamar uma função, não haveria endereço para chamar.

---

## Parte 2 — Edge functions no computador

### 2.1 Variáveis que as funções leem

Li as 57 funções de `supabase/functions/` (todas as chamadas `Deno.env.get`). São 24 nomes fixos e 1 dinâmico.

**O Supabase local injeta sozinho (não coloque no arquivo):**
`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (e `SUPABASE_DB_URL`). Apontam para o banco local.

**Precisam de valor de teste, sem risco:**

| Variável | Quem usa | Valor no local |
| --- | --- | --- |
| `APP_URL` | admin-impersonar, portal-solicitar-acesso, whatsapp-bot, whatsapp-health-check, whatsapp-zumbi-diario | `http://localhost:3000` |
| `CRON_SECRET` | todas as funções chamadas por cron (`_shared/cron-auth.ts`) | texto aleatório de 40+ letras, inventado |
| `META_GRAPH_VERSION` | `_shared/organico.ts` | `v21.0` |
| `ORGANICO_IMPORT_TOKEN` | organico-importar, organico-referencias | inventado |
| `GASTOS_USER_ID` | telegram-gastos | id da conta de teste |

**Perigosas — deixe com valor falso (ou só credencial de sandbox/teste do próprio serviço):**

| Variável | Quem usa | O que acontece com valor real |
| --- | --- | --- |
| `MERCADOPAGO_ACCESS_TOKEN` | admin-mercadopago, cancel-subscription, conciliar-cartao-mp, confirmar-assinatura-cartao, create-pix-payment, create-subscription, mercadopago-webhook | Cria/cancela assinatura e Pix de verdade do Mensalli |
| `MERCADOPAGO_WEBHOOK_URL` | create-pix-payment, create-subscription | Aviso de pagamento iria para o endereço informado |
| `META_ADS_TOKEN`, `META_AD_ACCOUNT_ID` | meta-ads-sync | Lê/mexe na conta de anúncios |
| `META_CAPI_ACCESS_TOKEN`, `META_PIXEL_ID`, `META_TEST_EVENT_CODE` | meta-capi | Manda evento falso de cadastro/compra para o pixel e suja a otimização das campanhas |
| `META_IG_TOKEN` (e `META_IG_TOKEN_<MARCA>`, lido pelo nome) | organico-* | **Publica post no Instagram** |
| `RESEND_API_KEY`, `RELATORIO_EMAIL_FROM`, `RELATORIO_EMAIL_TO` | relatorio-mensagens | Manda e-mail |
| `RELATORIO_WHATSAPP_TO` | relatorio-mensagens, whatsapp-bot | Número que recebe WhatsApp |
| `TELEGRAM_GASTOS_BOT_TOKEN`, `TELEGRAM_GASTOS_CHAT_ID`, `TELEGRAM_GASTOS_SECRET` | telegram-gastos | Mensagem no Telegram |
| `GROQ_API_KEY` | telegram-gastos | Gasta crédito de transcrição |
| `GOOGLE_MAPS_API_KEY` | prospeccao-rota | Gasta crédito do Google |

**Perigosas que NÃO são variável (moram no banco):**

- **Evolution / WhatsApp**: endereço e chave ficam na tabela `config` (chaves `evolution_api_url` e `evolution_api_key`). Se a linha não existir, **14 funções** (e as 5 da loja, pelo código compartilhado `_shared/loja.ts`) usam o endereço de **produção** da Evolution que está escrito no código como plano B. O seed grava `http://127.0.0.1:9`, que recusa na hora. Nunca coloque a chave real da Evolution no banco local.
- **Asaas** (boleto/Pix dos alunos): a chave é de cada conta, em `usuarios.asaas_api_key`, com `asaas_ambiente` = `sandbox` ou produção. A conta de teste não tem chave. Para testar Asaas, use uma chave do **sandbox** do Asaas.

O modelo completo, só com nomes e valores falsos, está em `.env.local.exemplo` (você copiou no passo 1.10).

### 2.2 Rodar as funções contra o banco local

Sobe todas as funções de `supabase/functions/` no computador, lendo as variáveis do `supabase/.env.local`. Fica rodando e mostrando o log; para parar, `Ctrl+C`. Se der "env file not found", refaça o passo 1.10. O endereço delas fica `http://127.0.0.1:54321/functions/v1/<nome>`.

```powershell
npx supabase functions serve --env-file supabase\.env.local
```

No local **nada dispara sozinho**: não há crons e o Vault está vazio. Uma função só roda quando o app (ou você) chama.

Se uma função tentar falar com o mundo de fora e der erro de conexão, é o esperado: os endereços estão falsos de propósito. Isso é a rede de proteção funcionando.

---

## Parte 3 — App no computador apontando para o banco local

### 3.1 Como o app escolhe o banco

`src/supabaseClient.js` lê `REACT_APP_SUPABASE_URL` e `REACT_APP_SUPABASE_ANON_KEY`. **Se essas variáveis não existirem, ele usa o endereço e a chave de produção que estão escritos no próprio arquivo.** Ou seja: um erro de digitação no nome da variável faz o app local abrir silenciosamente na produção.

Hoje existe na raiz um `.env.local` com uma variável que não tem a ver com o Supabase. Não precisa mexer nele.

### 3.2 Criar o `.env.development.local`

O Create React App dá prioridade a este arquivo quando você roda `npm start`, e ele já está no `.gitignore`. Crie o arquivo na raiz do projeto com o Bloco de Notas:

```powershell
notepad .env.development.local
```

Conteúdo (a chave você copia da linha "Publishable key" ou "anon key" do `npx supabase status`; é chave de demonstração do local):

```
REACT_APP_SUPABASE_URL=http://127.0.0.1:54321
REACT_APP_SUPABASE_ANON_KEY=cole-aqui-a-publishable-key-do-supabase-status
```

Confira que o Git ignora (tem que aparecer uma linha citando `.gitignore`):

```powershell
git check-ignore -v .env.development.local
```

### 3.3 Subir o app

Abre o app em `http://localhost:3000`. Precisa estar com o `supabase start` rodando. Se o app já estava aberto antes de criar o arquivo, pare (`Ctrl+C`) e rode de novo: o React só lê o arquivo ao iniciar.

```powershell
npm start
```

### 3.4 Como ter certeza de que está no banco local

1. **Entre com a conta de teste**: `gestor.teste@exemplo.test` (a senha está no topo do `seed-ficticio-etapa0.sql`). Essa conta só existe no banco local. Se o login funcionar, você está no local.
2. **Nunca entre com a sua conta real no app local.** Se a sua senha real funcionar, o app está falando com a produção: feche a aba e revise o passo 3.2.
3. No navegador, aperte F12 > aba **Network (Rede)** > no filtro escreva `zvlnkkmcytjtridiojxx`. Navegando pelas telas, a lista deve ficar vazia. A única exceção esperada são os vídeos da Central de Ajuda (`src/Ajuda.js` aponta para o Storage de produção; é só leitura de vídeo público).
4. Os pedidos devem ir para `127.0.0.1:54321`.

### 3.5 Endereço de produção fixo no código (avisar antes de testar)

| Arquivo | O que está fixo | Efeito no local |
| --- | --- | --- |
| `src/supabaseClient.js` | URL e chave de produção como "plano B" | Se a variável faltar, o app inteiro usa produção |
| `src/services/asaasService.js` | `FUNCTIONS_URL` de produção | Botões de boleto/Pix do Asaas chamam a **função de produção** mesmo no local |
| `src/services/mercadoPagoService.js` | `FUNCTIONS_URL` de produção | Assinatura/Pix/cartão do Mensalli chamam a **função de produção** mesmo no local |
| `src/Ajuda.js` | Vídeos no Storage de produção | Inofensivo (vídeo público) |

Com a conta de teste local, a produção recusa essas chamadas (o login local não vale lá), mas **o pedido sai do seu computador para a produção**. Até corrigir: **não clique em botões de pagamento (Asaas, Mercado Pago, assinatura) no app local.** A correção é pequena (os dois arquivos passarem a usar o `FUNCTIONS_URL` que o `supabaseClient.js` já exporta) e fica para o dev-funcionalidades, com revisão do revisor-codigo.

---

## Parte 4 — Dados fictícios

O `seed-ficticio-etapa0.sql` roda sozinho a cada `npx supabase db reset` (por causa do `[db.seed]` do passo 1.5). Para rodar na mão, cole no SQL Editor do Studio **local** (<http://127.0.0.1:54323>).

O que ele cria (tudo com id fixo começando em `0e7a0000-`):

- 1 conta "Academia Exemplo (TESTE)", plano **Pro pago** (atualizado em `usuarios` **e** em `controle_planos`, como manda a regra do projeto), onboarding concluído, WhatsApp desconectado.
- Linhas em `config` com endereço e chave **falsos** da Evolution.
- 2 planos: mensal R$ 150 e pacote de 8 aulas R$ 120.
- 5 alunos (`devedores`), telefones `5599900000001` a `…05`, e-mails `@exemplo.test`:

| Aluno | Situação |
| --- | --- |
| Aluno Teste 1 Em Dia | mensalidade do mês paga (Pix) + próxima daqui a 25 dias |
| Aluno Teste 2 Vence Hoje | pendente, vence hoje |
| Aluno Teste 3 Atrasado | pendente, venceu há 10 dias |
| Aluno Teste 4 Vence Logo | pendente, vence em 3 dias (pacote) |
| Aluno Teste 5 Inativo | assinatura desligada, última paga há 2 meses |

Status usados são os que o banco aceita: mensalidade `pendente`/`pago` (o banco também aceita `atrasado` e `cancelado`; o app trata pendente com data passada como atrasada), aluno `pendente`/`pago`.

Trava de segurança: o seed **se recusa a rodar** se encontrar segredos no Vault ou mais de 20 contas — que é o que acontece em produção e na cópia restaurada.

O fim do arquivo mostra uma conferência numa linha só. Esperado: `conta_teste_ok 1`, `plano_controle pro`, `alunos 5`, `alunos_ativos 4`, `mensalidades 6`, `vence_hoje 1`, `atrasadas 1`, `vence_em_3_dias 1`, `pagas 2`, `evolution_local http://127.0.0.1:9`.

---

## Parte 5 — Teste de restauração do backup

### 5.1 O que este teste prova e o que custa

Prova que, se a produção quebrar, o backup volta inteiro. Para isso o painel cria um **projeto novo** a partir do backup ("Restore to a New Project"). A produção não é tocada.

Cuidados:

- **O projeto novo é cobrado** enquanto existir (mesmo tamanho de máquina da produção). O painel mostra o custo antes de confirmar. Faça tudo no mesmo dia e apague ao final.
- **A cópia tem todos os dados reais de clientes**, inclusive logins (senhas embaralhadas) e chaves Asaas das contas. Ela fica na nuvem da Supabase, na mesma região. **Nunca** baixe backup, nunca exporte tabela, nunca aponte o app local para ela. A única coisa que sai dela são as contagens do `restauracao-contagens.sql` (números e datas).
- Segundo a documentação da Supabase, a cópia leva banco, estrutura, dados, usuários do login e **extensões ligadas, incluindo pg_cron e pg_net**. Não leva: arquivos do Storage, edge functions, configurações de login, chaves de API, configurações de tempo real.
- Exige plano pago com backup físico ligado (produção está no Postgres 17.6, que usa backup físico).

### 5.2 O perigo principal: a cópia nasce disparando

Conferido no catálogo em 27/11: produção tem **17 crons ligadas**, e **12** delas chamam edge functions pelo endereço guardado no Vault (`project_url`), com o segredo `cron_secret`. A cópia nasce com esse mesmo Vault. Resultado: assim que a cópia sobe, as crons dela chamam **as funções de produção**, com segredo válido, e as funções de produção leem o banco de produção e mandam **WhatsApp de verdade** — lembrete de aula, cobrança do Mensalli, avisos de trial, fila de cobrança dos alunos, relatório — e **publicam no Instagram**. Seria disparo dobrado para clientes reais. Além disso, dois gatilhos do banco mandam evento ao Meta pelo mesmo caminho.

As crons rodam no horário de Greenwich (3 horas à frente de Brasília):

| Cron | Quando (horário de Brasília) | O que faz | Tipo |
| --- | --- | --- | --- |
| organico-publicar | a cada 5 min | publica posts agendados no Instagram | chama função |
| lembrete-aula-24h | :00, :15 e :30 de toda hora | WhatsApp de lembrete de aula ao aluno | chama função |
| organico-coletar-hora | :07 de toda hora | coleta métricas do Instagram | chama função |
| loja-expirar-pedidos | :15 de toda hora | expira pedidos da loja | só SQL |
| gerar-proximas-mensalidades | 06h00 | cria as próximas mensalidades | só SQL |
| organico-coletar-dia | 06h30 | coleta diária do Instagram | chama função |
| meta-ads-sync-diario | 07h00 | puxa gasto do Meta Ads | chama função |
| alerta-despesas-diario | 08h00 | avisa despesas a vencer | chama função |
| whatsapp-zumbi-diario | 08h20, 12h20, 16h20, 20h20 | confere WhatsApps "zumbis" | chama função |
| fila-expirar | 08h25 | expira itens da fila de mensagens | só SQL |
| fila-materializar | 08h30 | monta a fila de cobranças do dia | só SQL |
| fila-worker | 08h36 a 08h54, a cada 2 min | **envia as cobranças do dia aos alunos** | chama função |
| cobranca-saas-diaria | 09h00 | cobra a assinatura do Mensalli pelo WhatsApp | chama função |
| trial-avisos | 09h05 a 20h05, de hora em hora | avisos de trial pelo WhatsApp | chama função |
| fila-reconciliar | 10h, 13h, 19h | reconcilia a fila | só SQL |
| relatorio-mensagens-diario | 11h00 | relatório por e-mail | chama função |
| relatorio-mensagens-whatsapp | 12h00 | resumo diário no WhatsApp | chama função |
| whatsapp-health-check-diario | — | **já desligada** em produção | chama função |

Por isso:
- **Faça a restauração de madrugada, entre 02h e 05h** (horário de Brasília). Nessa janela só rodam organico-publicar, lembrete-aula-24h, organico-coletar-hora e loja-expirar-pedidos. **Nunca** entre 08h e 09h30 (fila de cobrança e cobrança do Mensalli).
- Fique na frente do painel e rode o `restauracao-desligar-crons.sql` **no minuto em que a cópia ficar pronta**, antes de qualquer outra coisa.

### 5.3 Passo a passo

**Antes (em produção, só leitura):**

1. No painel da **produção**, vá em Database > Backups > aba **Scheduled backups** e anote: quantos backups diários aparecem, a data/hora do mais recente e se existe a aba Point in Time ligada. Isso responde "de quanto em quanto tempo" (no plano Pro, o normal é 1 por dia, guardado 7 dias).
2. Ainda na produção, abra o SQL Editor, cole o `restauracao-contagens.sql` e rode. Baixe o resultado (botão de download, CSV) com o nome `contagens-producao-AAAA-MM-DD.csv`. Ele só tem números e datas; pode ficar no computador, mas **fora do Git** (salve em `dados-clientes/`, que já é ignorada).

**Restaurar:**

3. Ainda na produção: Database > Backups > aba **Restore to a New Project**. Escolha o backup mais recente. Leia o custo que o painel mostrar e confirme.
4. Espere a cópia aparecer na lista de projetos (pode levar de minutos a mais de uma hora, conforme o tamanho). Deixe a página aberta.

**Assim que a cópia ficar pronta (primeiro de tudo):**

5. Abra a cópia. **Olhe a barra de endereço**: ela mostra `.../project/<ref>/...`. O ref da cópia tem 20 letras e é **diferente** de `zvlnkkmcytjtridiojxx`. Se aparecer `zvlnkkmcytjtridiojxx`, você está na produção: volte.
6. Na cópia: SQL Editor > cole o `restauracao-desligar-crons.sql` > na linha `v_ref_copia := 'COLE_AQUI_O_REF_DA_COPIA'`, troque pelo ref da cópia > Run.
7. Confira a última linha do resultado: `crons_ativas 0`, `vault_trocado_agora 3`, os dois gatilhos com `D` (desligado), `evolution_neutralizada true`, `fila_pg_net 0`. Se aparecer erro "PARE: ...", leia a mensagem: o arquivo recusou rodar e nada foi feito.

**Comparar:**

8. Na cópia, rode o `restauracao-contagens.sql` e baixe como `contagens-copia-AAAA-MM-DD.csv` (também em `dados-clientes/`).
9. Compare os dois arquivos (pode abrir lado a lado no Excel):
   - grupo **0-estrutura**: tudo igual, exceto `crons ATIVAS` (produção 17, cópia 0);
   - grupo **1-linhas**: cópia igual ou um pouco menor (o backup é de antes). Tabela com menos da metade na cópia, ou que só existe de um lado, é problema: me chame antes de apagar a cópia;
   - grupo **2-ultimo-registro**: na cópia, perto da hora do backup escolhido.
10. Opcional: na cópia, abra o Table Editor e só confira que as tabelas `usuarios`, `devedores` e `mensalidades` abrem. Não exporte nada.

**Apagar a cópia:**

11. Na **cópia** (confira o ref na barra de endereço de novo, é o passo mais perigoso do roteiro): Project Settings > General > **Delete project**. O painel pede para digitar o nome do projeto: confira que é o nome da cópia, **não** o da produção.
12. Volte à lista de projetos e confirme que só a produção sobrou.

**Registrar:**

13. Anote no `backlog.md` (item 3): data do teste, backup usado (data/hora), quanto tempo a restauração levou, se as contagens bateram e quanto custou.

---

## Parte 6 — O que a estrutura depende e não vem junto

Conferido no catálogo de produção em 27/11/2026.

**Extensões** (todas existem na imagem local; o dump cria as que estão ligadas):
`pg_cron` 1.6.4, `pg_net` 0.19.5, `pg_stat_statements`, `pgcrypto`, `plpgsql`, `supabase_vault` 0.3.1, `uuid-ossp`. **Não** estão em produção: `pgsodium`, `http`, `pg_graphql`, `wrappers`.

**Segredos do Vault** (só nomes): `project_url`, `service_role_key`, `cron_secret`. Não vêm no dump. No local ficam vazios de propósito.

**Crons**: 18 cadastradas, 17 ligadas (tabela da seção 5.2). Não vêm no dump (moram no schema `cron`). No local: zero. Nenhuma tem chave escrita no próprio texto; todas buscam no Vault.

**Gatilhos que chamam a internet**: só a função `meta_capi_enviar` (usa `net.http_post` + Vault), chamada pelos gatilhos `meta_capi_purchase` (em `usuarios`) e `meta_capi_ativacao` (em `logs_conexao`). Os gatilhos vêm no dump; no local não chamam nada porque o Vault está vazio.

**Webhooks de banco**: não existem (não há o schema `supabase_functions`). Os webhooks do painel do Mercado Pago e do Asaas apontam para produção e continuam assim.

**Storage**: 7 buckets (`artes`, `avatars`, `avisos`, `CentralDeAjuda`, `lead-midia`, `logos`, `organico`) e 16 regras. Não vêm no dump; o arquivo de extras recria buckets e regras. Os **arquivos** (fotos, logos, vídeos) não vêm em nenhum caso.

**Schema auth**: a estrutura é da própria Supabase (o local já tem). Usuários não vêm. Os 3 gatilhos em `auth.users` (cadastro, Meta, último acesso) não vêm no dump; o arquivo de extras recria.

**Tempo real**: 5 tabelas na publicação `supabase_realtime` (`mensalidades`, `agendamentos`, `mensalli_leads`, `mensalli_lead_mensagens`, `loja_pedidos`). Não vêm no dump; o arquivo de extras recria.

**Configurações do banco**: fuso `America/Sao_Paulo` (o arquivo de extras tenta aplicar), tempo-limite de consulta por papel (anon 3s, authenticated 8s) e `search_path` do postgres. Os tempos-limite não vêm; no local as consultas podem demorar mais sem dar erro, então lentidão não aparece no local como aparece em produção.

**Edge functions**: produção tem 2 funções que **não estão no repositório** (`gerar-post` e `zz-keycheck-temp`) e o repositório tem 1 que **não está publicada** (`meta-primeira-cobranca`). No local só existem as do repositório.

**Tabela `config`**: guarda credenciais globais (Evolution, webhooks do n8n) e preferências por conta. Não vem no dump. O seed grava só valores falsos.

---

## Ajustes feitos no dump

(Preencha se precisar comentar alguma linha no passo 1.13.)

| Data | Linha / objeto | Erro | O que foi feito |
| --- | --- | --- | --- |
| | | | |
