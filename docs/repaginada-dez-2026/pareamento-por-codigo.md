# Conexão do WhatsApp por código de pareamento — diagnóstico e proposta

> 28/11/2026 · investigação somente leitura (git, código, docs). Nenhuma instância foi
> tocada e nenhuma chamada foi feita à Evolution.
> Para quem: gestor que configura o Mensalli **pelo próprio celular** e não tem como
> escanear o QR Code que aparece nesse mesmo celular.

---

## 1. Resumo em 5 linhas

1. A conexão por código existiu de **18/02/2026** (`760e367`) a **26/05/2026** (`9c658b7`, que a tirou num "refactor" sem dizer por quê).
2. Em **11/05/2026** foram **6 commits de conserto no mesmo dia** (`c270f36` → `1ce879b`) e o WhatsApp continuou recusando o código.
3. A causa mais provável **nunca foi achada**: a Evolution 2.x **gera um código novo a cada vez que o QR gira** (~20–60 s). A tela mostrava o primeiro código por 120 s; quando o gestor digitava, aquele código já tinha sido trocado.
4. Pelo celular o problema piora: o gestor sai do navegador para abrir o WhatsApp, a aba fica em segundo plano, o cronômetro e o polling param, e às vezes a página recarrega e o código some.
5. Dá para trazer de volta com segurança: o código é pedido **no servidor** (edge function nova), a tela **acompanha o código atual**, retoma quando o gestor volta do WhatsApp e oferece o QR quando falha. **Esforço: uns 3 a 4 dias**, mais um teste rápido antes (seção 5.0).

---

## 2. O que existia e por que saiu

### 2.1 Linha do tempo (git)

| Data | Commit | O que mudou |
|---|---|---|
| 18/02/26 | `760e367` | Cria o modo "Código de pareamento" ao lado do QR em `src/WhatsAppConexao.js` (+300 linhas). Toggle QR / Código, campo de telefone, código grande `ABCD-EFGH` com botão copiar, passo a passo e o mesmo cronômetro de 120 s do QR. |
| 11/05/26 | `c270f36` | *"código de pareamento não conectava"*. O código exibido começava com `2@...`: era a **string do QR** (`data.code`), não o código. Conserto: logout antes e aceitar só `pairingCode` com 8 caracteres. |
| 11/05/26 | `f4f692c` | *"WhatsApp continuava recusando"*. Hipótese: a instância nasceu com `qrcode: true` e o socket ficou "em modo QR". Conserto: **apagar e recriar** a instância passando `number` no create. |
| 11/05/26 | `da24821` | Apaga a instância "órfã" **sem condição** (o `fetchInstances` dizia que não existia, mas o create voltava 403). |
| 11/05/26 | `263a5a7` | *debug*: resposta da Evolution com **`count: 18`**; logout + delete + restart e espera de 4 s. |
| 11/05/26 | `3ca0070` | Log limpo (3× 404, create OK com `pairingCode`) e **mesmo assim recusado**. Hipótese: código gerado antes do handshake. Conserto: ignorar o código do create, esperar 6 s e pedir de novo via `/instance/connect?number=`. |
| 11/05/26 | `1ce879b` | A resposta trazia `pairingCode` + `code` + `base64` juntos. Hipótese: modo "dual". Conserto: tirar `qrcode: true` do create. |
| 26/05/26 | `9c658b7` | *"refactor: simplifica WhatsAppConexao"* (−421 linhas). O modo pareamento vai embora junto (43 linhas com `pairing`/`pareamento` removidas). |

O texto da Ajuda **ainda promete** o recurso: `src/Ajuda.js:180`, *"Como conectar seu WhatsApp via QR Code ou código de pareamento"*. Corrigir junto ou antes.

### 2.2 Como o fluxo antigo funcionava (versão final, `9c658b7^`)

No modo código, cada clique em "Conectar" fazia:

1. logout + **delete** + restart da instância, direto do navegador e com a chave da Evolution no front;
2. espera de 3 s, depois `create` com `{ number }` e sem `qrcode: true`;
3. espera de 6 s, depois `GET /instance/connect/{inst}?number=55...`;
4. mostra `pairingCode` (8 caracteres) **uma vez** e espera 120 s fixos, conferindo `connectionState` a cada 3 s.

Validação do número: só "tem 10 dígitos ou mais", e prefixa `55` se faltar.

### 2.3 O que dava errado, causa por causa

**A. O código mudava e a tela não (causa principal, nunca identificada na época).**
Na Evolution 2.x o código **não é gerado uma vez só**. No serviço Baileys, a cada evento `qr` (cada vez que o QR gira), se a instância tem número, ela faz:

```ts
this.instance.qrcode.count++
if (this.phoneNumber) {
  await delay(1000)
  this.instance.qrcode.pairingCode = await this.client.requestPairingCode(this.phoneNumber)
}
```

Cada `requestPairingCode` sorteia um **código novo** e registra esse novo no WhatsApp. O QR gira em ~60 s na primeira vez e ~20 s nas seguintes, então o código também. A tela mostrava o primeiro por 120 s. É exatamente o sintoma de `3ca0070`: *"tudo limpo, create OK retornando pairingCode, mas WhatsApp ainda recusa"*. O `count: 18` de `263a5a7` mostra uma instância que já tinha girado o código 18 vezes.
*(A conferir no teste da seção 5.0: se o código antigo morre mesmo quando gira. O exemplo oficial do Baileys pede o código **uma vez só**, e a Evolution pede de novo a cada giro.)*

**B. Instância em `connecting` devolve o que já está guardado.**
O `/instance/connect` da Evolution 2.x faz:

- `open` → devolve o estado;
- **`connecting` → devolve o `qrCode` guardado, sem gerar nada e ignorando `?number=`**;
- `close` → `connectToWhatsapp(number)` e devolve o QR/código novo.

Se a instância já estava esperando QR (criada com `qrcode: true`, sem número), pedir `?number=` devolvia o QR antigo, com `code = "2@..."` e sem `pairingCode`. Foi o primeiro bug (`c270f36`). O apaga-e-recria de `f4f692c` contornava isso na força bruta.

**C. Apagar a instância a cada tentativa.**
Cada clique destruía e recriava a instância. Hoje isso não pode voltar:
- o webhook morre junto no delete (ver `garantirWebhook` em `src/services/whatsappConexao.js:145`), e a conta sai do rastreio de queda;
- re-parear é o **gatilho da migração LID** na Evolution 2.3.7 (`docs/runbook-lid-whatsapp.md` §1). Gerar código para quem tinha sessão boa troca "conectar de novo" por "nunca mais entrega";
- o `delete` agora é **só admin** no `evolution-proxy` (`supabase/functions/evolution-proxy/index.ts:85`), então o navegador do cliente nem consegue mais.

**D. Chave da Evolution no navegador.**
O fluxo antigo chamava a Evolution do front com `apikey`. Foi fechado em 08/09/2026 (proxy). O código novo tem que passar pelo servidor.

**E. Celular: o gestor sai da tela para digitar o código.**
Diferente do QR (outro aparelho escaneia), no código o gestor **sai do navegador** e vai para o WhatsApp no mesmo celular. Aí:
- o navegador congela timers em segundo plano: cronômetro e polling param, e o código pode girar sem a tela saber;
- o sistema pode descartar a aba ou o PWA. Na volta a página recarrega no estado inicial e **o código some**, porque ficava só em `useState`;
- o `setTimeout` de 120 s dispara "Tempo expirado" na volta, mesmo com o pareamento ainda possível.

**F. Número no formato errado.**
Só "10+ dígitos + 55". Riscos:
- nono dígito: a conta WhatsApp de muitos números BR fica registrada **sem o 9** no JID. Já mordeu o projeto (`salvarConexao`, comentário sobre "errar a grafia do nono dígito"). Pedir código para a grafia errada falha sem mensagem;
- número fixo, número de outra pessoa, ou `55` duplicado (`5555...`).

**G. Limite de tentativas da Evolution.**
Cada giro soma `count`. Ao bater `QRCODE_LIMIT` (padrão 30 no `.env` de exemplo), a Evolution manda `QRCODE_UPDATED` com "QR code limit reached", fecha a sessão e a instância vai para `close`. Hoje o `criarEConectar` lê "200 sem QR" como instância presa (`src/services/whatsappConexao.js:439`); o mesmo vale para o código.

**H. Conflito QR × código.**
O número entra no socket **na criação da conexão** (`connectToWhatsapp(number)`). Trocar de aba (QR → código) com a instância já em `connecting` não muda nada: precisa fechar e abrir de novo. A tela antiga trocava só o visual.

**I. Variável de ambiente do navegador (hipótese, conferir no servidor).**
O Baileys exige um `browser` válido para o código (o celular mostra "Chrome (Linux)" etc.). A Evolution monta com `CONFIG_SESSION_PHONE_CLIENT` / `CONFIG_SESSION_PHONE_NAME`. Se `PHONE_NAME` estiver com um valor fora da lista (ex.: "Mensalli"), o código pode ser recusado. Conferir só lendo o `.env` do container, sem reiniciar nada.

---

## 3. O que existe hoje e serve de base

- **`gerarQrCode`** (`src/services/whatsappConexao.js:378`): relê a instância registrada no clique (aba defasada), marca `pareamento_ate`, tenta **restart antes de re-parear** (LID), reseta e recria se o QR não vem. Usado pela tela e pelos dois onboardings (`src/Onboarding.js`, `src/OnboardingGuiado.js`).
- **`evolution-proxy`**: allowlist de operações; a instância vem do banco. A op `connect` **não repassa query string**, então hoje não há como mandar `?number=`. `delete` é só admin.
- **`mensallizap.pareamento_ate`** (migration `whatsapp_recuperacao_automatica`, 11/08/26): é um "não mexa, o cliente está com o QR na tela". O front grava agora + 240 s (`marcarPareamento`, `whatsappConexao.js:352`). Quem respeita:
  - `whatsapp-zumbi-diario/index.ts:364`: pula a conta se `pareamento_ate` está no futuro;
  - `whatsapp-health-check/index.ts:903`: idem, mas esse cron está **desligado de propósito**.

  Não é zerado no sucesso; só vence. Na prática protege pouco hoje, porque a varredura de zumbi já só mexe em `conectado = true` + `open` (`47f84aa`), mas é o lugar certo para a janela do código, que precisa ser **mais longa** (seção 4.4).
- **Webhook `connection.update`** no `whatsapp-bot`: já marca reconexão em tempo real. Pode avisar o sucesso do pareamento sem depender do polling da aba.

> Observação lateral, fora do escopo e não corrigida: `resetarInstancia` chama `delete` pelo proxy, que responde 403 para cliente comum. Para o gestor, o "reset" de hoje é só logout, e o `instanciaSumiu` nunca fica verdadeiro. Vale conferir se é intencional.

---

## 4. Proposta

### 4.1 Princípios

1. **Servidor pede o código, a tela só mostra.** Nada de chave no front e nada de delete do navegador.
2. **A tela sempre mostra o código atual**, não o primeiro.
3. **Não destruir sessão boa.** Mesma ordem do `gerarQrCode`: se a instância tem sessão, tentar restart primeiro; recriar só quando não há o que salvar.
4. **O estado vive no servidor**, não na aba: sair para o WhatsApp e voltar não perde nada.
5. **Saída sempre visível**: código não veio, ou não funcionou → "Gerar novo código" ou "Usar QR Code".

### 4.2 Fluxo de tela no celular

```
[Aba Conexão]  (no celular abre em "Pelo número"; no computador, em "QR Code")

 ┌─ Pelo número ─┬─ QR Code ─┐
 │ Número do WhatsApp que vai enviar as cobranças
 │ [ (11) 9 8888-7777 ]   ← já vem do cadastro (usuarios.telefone)
 │ [ Gerar código ]
 └───────────────────────────┘
        │ (servidor valida e confere se o número tem WhatsApp)
        ▼
 ┌───────────────────────────────────────────┐
 │  Seu código                               │
 │      ABCD-EFGH        [ Copiar ]          │
 │  ▓▓▓▓▓▓░░░  atualiza sozinho              │
 │                                           │
 │  1. Toque em Copiar                       │
 │  2. Abra o WhatsApp. Vai aparecer uma     │
 │     notificação "Insira o código": toque  │
 │     nela e cole.                          │
 │     Sem notificação? Configurações >      │
 │     Dispositivos conectados > Conectar    │
 │     dispositivo > Conectar com número     │
 │  3. Volte para cá                         │
 │                                           │
 │  [ Gerar novo código ]   Prefiro QR Code  │
 └───────────────────────────────────────────┘
        │ volta do WhatsApp (visibilitychange)
        ▼
  confere na hora: conectou? → tela de sucesso
                   código mudou? → faixa "O código mudou, copie o novo"
                   expirou? → "Gerar novo código"
```

Detalhes que contam:
- **Copiar sem o hífen** (o WhatsApp aceita os 8 caracteres), mas mostrar com hífen.
- **Retomar após recarregar**: guardar em `sessionStorage` só "pareamento em andamento desde X". Ao abrir a tela, se a marca existe e o servidor diz `connecting`, volta direto para a tela do código. O código em si sempre vem do servidor.
- **Sem cronômetro fixo de 120 s.** Quem decide "expirou" é o servidor (instância foi para `close` ou bateu o limite). Na tela, uma barra discreta "atualiza sozinho" em vez de contagem regressiva.
- No `visibilitychange` (voltou para a aba), consultar na hora em vez de esperar o próximo tick.
- Mesmo componente no **onboarding guiado**, que é onde quem chega pelo anúncio no celular mais trava.

### 4.3 Validação do número

No front (rápida, antes de chamar o servidor):
- só dígitos; tira `+`, espaços, parênteses e `0` de operadora à frente;
- aceita 10–11 dígitos (DDD + número) ou 12–13 começando com `55`; recusa `5555...`;
- DDD válido (lista dos 67 DDDs);
- celular: o número local começa com 9 (11 dígitos) ou tem 8 dígitos começando com 6–9 (grafia antiga).

No servidor (a que resolve o nono dígito):
- **1 consulta** `POST /chat/whatsappNumbers` com o número digitado, pela **instância master** (a do gestor ainda não está conectada). Usa o `jid` que voltar como número canônico. Se `exists: false`, responde "Esse número não tem WhatsApp. Confira o DDD ou use o QR Code".
- Isso respeita a regra da sonda: é número **real**, **1 vez**, **dentro de uma ação do gestor**. Não é varredura e não usa número inventado (ver `sondarSocket`, `whatsappConexao.js:103`).
- Se a master estiver fora, seguir com o número digitado e avisar no log. Não bloquear.

### 4.4 Lado do servidor: edge function `whatsapp-parear`

Uma função nova em vez de abrir o `evolution-proxy`. O proxy é repasse genérico, e aqui há regra de negócio e limite de tentativas.

**`POST { acao: 'iniciar', numero }`**
1. JWT → `user_id`; instância **do banco** (`mensallizap.instance_name`, como o proxy faz). Bloqueia em modo espelho (o front já bloqueia; o servidor também).
2. Limite de tentativas: no máximo **5 inícios por conta a cada 30 min** (tabela pequena `whatsapp_pareamento_log`: user_id, quando, número mascarado, resultado). Serve também de diagnóstico, para não repetir o "erro mascarado custa dias" da crise de 21/08.
3. Valida e resolve o número (4.3).
4. Lê o estado da instância (`fetchInstances?instanceName=`, porque o `connectionState` mente para `connecting`):
   - **`open`**: não gera código. Devolve `jaConectado`; a tela segue o mesmo caminho do QR (checagem de zumbi pelos envios).
   - **`connecting` sem número** (estava no QR) ou com **outro número**: logout. Se a instância não volta a `close` em ~5 s, delete com service_role e espera sumir (mesma lógica do `resetarInstancia`).
   - **`close`** ou instância inexistente: segue.
   - Se havia credencial (`ownerJid` presente) e o gestor não está forçando: **restart primeiro** (mesma regra LID do `gerarQrCode`). Só re-parear se não voltar.
5. `create` com `{ number, integration: 'WHATSAPP-BAILEYS', webhook: {...CONNECTION_UPDATE...} }`. O webhook vai **dentro** do create porque o socket já sobe na criação; um `webhook/set` depois pode chegar tarde. Se a instância já existe e está em `close`: `connect?number=`.
6. Espera até ~8 s pelo `pairingCode` (pequenas leituras do `connect`, que em `connecting` só devolve o que está na memória da Evolution e não fala com o WhatsApp).
7. Grava `pareamento_ate = agora + 10 min`.
8. Devolve `{ codigo, numeroUsado }`, ou erro com motivo (`sem_whatsapp`, `limite`, `nao_gerou`, `chave_invalida`).

**`POST { acao: 'status' }`**, chamado pela tela a cada 3 s e no `visibilitychange`:
- `connectionState` (memória da Evolution, igual ao polling do QR de hoje);
- se `connecting`: `connect` sem número, que devolve o `pairingCode` **atual** guardado. Nunca chama `connect` em `close`, porque isso abriria um ciclo novo sozinho; em `close`, devolve `expirou`;
- renova `pareamento_ate` (+10 min) enquanto a tela pergunta;
- se `open`: **confirma com 1 `whatsappNumbers` usando o número do próprio gestor** (a regra "connectionState mente"), roda o `salvarConexao` equivalente no servidor (templates, `config`, `mensallizap.conectado = true`, `whatsapp_numero` do `ownerJid`) e zera `pareamento_ate`.

**`POST { acao: 'cancelar' }`**: botão "Prefiro QR Code". Logout se `connecting`, zera `pareamento_ate`, e a tela chama o `gerarQrCode` de sempre.

Carga na Evolution: a mesma do QR de hoje (polling de 3 s em leitura de memória), mais 1 consulta de número por tentativa. Nada de cron e nada de varredura, então não reabre o problema do health-check.

### 4.5 Quando falha: o que a tela diz

| Situação | Mensagem | Ação na tela |
|---|---|---|
| Número sem WhatsApp | "Esse número não tem WhatsApp. Confira o DDD." | editar número / QR Code |
| Código não veio em ~8 s | "Não conseguimos gerar o código agora." | Gerar novo código / QR Code |
| Código girou enquanto o gestor estava fora | faixa: "O código mudou. Copie o novo." | Copiar |
| Instância foi para `close` (limite ou tempo) | "O código expirou." | Gerar novo código |
| Gestor digitou e o WhatsApp recusou (não temos como saber) | dica fixa sob o código: "Deu código incorreto? Gere um novo e cole logo em seguida." | Gerar novo código |
| 5 tentativas em 30 min | "Muitas tentativas. Use o QR Code ou tente de novo em X min." | QR Code (com dica de abrir o Mensalli num computador ou em outro celular) |
| Chave da Evolution recusada (401) | mensagem atual de "fale com o suporte" | Suporte |
| Instância travada mesmo após reset | `MENSAGEM_TRAVADA` (já existe) | Suporte |

O QR fica **sempre** a um toque. Para quem só tem o celular, a dica do QR é "abra mensalli.com.br em um computador, ou peça a alguém para abrir no celular dele, e escaneie de lá".

---

## 5. Plano e esforço

### 5.0 Antes de codar: teste de 1–2 h (precisa do dono)

Confirmar as hipóteses A e I numa **instância de teste nova** (ex.: `instance_teste_pareamento`), com o número do próprio dono e **nunca numa instância de cliente**:
1. `create` com `number` → anotar o `pairingCode`; esperar o QR girar (webhook `QRCODE_UPDATED` ou `connect` a cada 5 s) e ver **se o código muda** e de quanto em quanto tempo.
2. Digitar no WhatsApp um código **já trocado** → recusa? (confirma a causa A)
3. Digitar o código **mais novo** logo depois de gerado → conecta?
4. Repetir com um número de DDD ≥ 31 com e sem o 9 → qual grafia o `whatsappNumbers` devolve e qual funciona.
5. Ler `CONFIG_SESSION_PHONE_CLIENT` / `CONFIG_SESSION_PHONE_NAME` e `QRCODE_LIMIT` do `.env` do container (só leitura).
6. Apagar a instância de teste no fim.

Se o passo 2 mostrar que o código antigo **continua valendo**, a proposta continua de pé (o "código atual" não atrapalha). Se o passo 3 também falhar, o problema é outro (versão do Baileys ou a variável do item 5) e é melhor parar antes de fazer a tela.

### 5.1 Estimativa

| Parte | Esforço |
|---|---|
| Teste da seção 5.0 | 1–2 h |
| Edge function `whatsapp-parear` (iniciar / status / cancelar, validação, limite, log, salvar conexão no servidor) + SQL da tabela de log | ~1 dia |
| Tela "Pelo número" no DS (`Tabs`, `Input`, `Button`; celular abre nessa aba), copiar, retomar após recarregar, `visibilitychange`, mensagens de falha | ~1 dia |
| Mesmo componente no onboarding guiado | ~0,5 dia |
| Ajustes: `Ajuda.js:180` e texto da Central de Ajuda | ~1 h |
| QA em celular de verdade (Android + iPhone, navegador e PWA, sair e voltar do WhatsApp) | ~0,5–1 dia |
| **Total** | **~3 a 4 dias** |

### 5.2 Riscos que continuam

- **LID**: parear por código é um pareamento novo, igual ao QR. Não acrescenta risco, mas também não foge dele. O botão "Gerar novo código" não pode virar reflexo para conta que **já estava conectada**; para essa, o caminho segue sendo restart (regra que a função herda).
- **Golpe do código**: quem tem conta no Mensalli pode pedir código para o número de outra pessoa e convencê-la a digitar. O limite de tentativas e o log ajudam. Opcional: avisar quando o número difere do `usuarios.telefone`.
- **Mudança de comportamento numa atualização da Evolution** (2.4.x para o LID): refazer o teste 5.0 depois de cada troca de versão.

---

## 6. Referências

- Versão antiga completa: `git show 9c658b7^:src/WhatsAppConexao.js` (fluxo nas linhas ~1987–2199, tela ~2638–3020).
- Commits: `760e367`, `c270f36`, `f4f692c`, `da24821`, `263a5a7`, `3ca0070`, `1ce879b`, `9c658b7`.
- Fluxo atual: `src/services/whatsappConexao.js` (`gerarQrCode`, `marcarPareamento`, `resetarInstancia`, `tentarRestart`), `src/WhatsAppConexao.js:1993` (`conectarWhatsApp`) e `:2042` (polling).
- Proxy: `supabase/functions/evolution-proxy/index.ts` (allowlist; `connect` sem query; `delete` só admin).
- `pareamento_ate`: `supabase/functions/whatsapp-zumbi-diario/index.ts:364`, `supabase/functions/whatsapp-health-check/index.ts:903`, `sql-whatsapp-saude-etapa1.sql:89`.
- LID: `docs/runbook-lid-whatsapp.md`.
- Evolution 2.x: `InstanceController.connectToWhatsapp` (open / connecting / close) e o handler de `qr` no serviço Baileys (`requestPairingCode` a cada giro, `QRCODE_LIMIT`). Descrito de memória do código-fonte da linha 2.x; **o teste 5.0 confirma na 2.3.7 em uso.**
