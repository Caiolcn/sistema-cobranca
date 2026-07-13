# Runbook — LID do WhatsApp quebra envios (plano de contenção)

> Última atualização: 08/07/2026. Dono: infra/WhatsApp.
> Detector: [`scripts/scan-lid.mjs`](../scripts/scan-lid.mjs).

## 1. O que é / por que acontece

O WhatsApp está migrando as contas para o endereçamento **LID** (Linked Identity),
de forma **gradual e por conta**. Quando uma conta migra:

- A instância só entrega mensagens endereçadas ao JID **`@lid`**.
- **Todo envio do sistema** monta o destino como **`{numero}@s.whatsapp.net`** (JID de
  telefone). A **Evolution 2.3.7** não resolve telefone → LID, então esses envios
  terminam em `MessageUpdate.status = ERROR` — **entregues zero**.
- As conversas pessoais da gestora continuam chegando (o app dela usa `@lid`), o que dá a
  **falsa impressão de que a conexão está boa**.

**Gatilho:** o **reparear o QR (logout + novo pareamento)**. Ao reparear, o WhatsApp
re-registra a conta no esquema LID atual. Confirmado no 1º caso (Juliana,
`instance_70733843`, 08/07): desconectou 09:00 → reconectou 09:20 → muro de ERROR a
partir de ~09:23. **`restart` de instância (reusa credencial, sem QR) NÃO é gatilho** —
só o pareamento novo é.

**Consequência prática:** WhatsApp **não volta** a conta de LID. Reconectar de novo **não
resolve** — só recria a sessão LID quebrada. A cura é do lado da Evolution.

## 2. Sinais de que uma instância virou LID

| Sinal | LID quebrado | Queda de socket comum |
|---|---|---|
| `GET /instance/connectionState` | `open` | `close`/`connecting` |
| Envios do sistema (`@s.whatsapp.net`) | **ERROR** (todos) | sem envio / Connection Closed |
| Conversas pessoais (`@lid`) | entregam normal | também param |
| App / `logs_mensagens` | marca **"enviado"** (só vê o HTTP 201) | marca falha/erro |

Regra de bolso: **conexão `open` + `logs_mensagens` "enviado" + aluno não recebe = suspeitar de LID.**

## 3. Detecção (rodar sob demanda ou em cron)

```bash
EVOLUTION_URL="https://service-evolution-api.tnvro1.easypanel.host" \
EVOLUTION_KEY="<apikey>" \
node scripts/scan-lid.mjs
```

- Agrupa as instâncias `open` por: **LID-QUEBRADO** (≥80% dos envios a telefone em ERROR
  nas últimas 48h), **suspeito** (≥30%), **ok**, e **sem-tráfego-pn** (sem sinal — não dá
  pra confirmar, mas não está quebrado).
- **Exit code 1** quando há ao menos uma instância quebrada → dá pra plugar em alerta/cron.
- Nunca commitar a apikey; passar sempre por env.

> Fila de melhoria (fecha o buraco de raiz): assinar o webhook **`messages.update`** da
> Evolution e reconciliar `logs_mensagens` com o status **real** (ERROR/DELIVERY_ACK/READ).
> Hoje o app marca "enviado" só com o HTTP 201 e nunca vê o ERROR. Com isso dá pra **alertar
> automático** e **auto-reenviar**. (Já existe infra de webhook `connection.update`.)

## 4. Resposta imediata quando uma instância cai

1. **Confirmar que é LID** (seção 3), não uma queda de socket comum.
2. **NÃO reparear o QR na Evolution atual (2.3.7).** Não resolve e mantém a conta presa no
   estado quebrado. Avisar quem der suporte pra não mandar a cliente "reconectar".
3. **Avisar a gestora** que os envios automáticos estão suspensos temporariamente (evitar que
   ela ache que está tudo certo — o app mostra "enviado").
4. **Mover a instância para o servidor de fallback (Evolution rc2)** — seção 5.
5. Registrar o caso (data, instância, horário do reconnect) pra acompanhar a curva de migração.

## 5. Plano B — servidor de fallback na Evolution 2.4.0-rc2

**Por quê:** a correção de LID (`onWhatsApp` p/ `@lid`, `convert LID to phoneNumber`,
tratamento `@s.whatsapp.net` vs `@lid`) **só existe na linha 2.4.0-rc** (rc2, mai/2026). Não
há estável com o fix — a 2.3.7 é a última estável e é a que roda hoje. Então o plano B roda
uma **RC**, isolada, e só recebe as instâncias já quebradas (risco baixo: elas já não enviam).

### 5.1 Subir a Evolution rc2 no easypanel

> ⚠️ **A rc2 roda migrações de schema próprias. NUNCA aponte-a para o banco da 2.3.7** —
> corromperia a produção. Banco **dedicado** e Redis **dedicado (ou prefixo próprio)**.

1. **Banco dedicado:** criar um Postgres novo no easypanel (ex. serviço `evolution-rc2-db`).
   Pode ser Redis novo também, ou reusar o Redis existente com `CACHE_REDIS_PREFIX_KEY`
   diferente.
2. **Serviço App** a partir da imagem `evoapicloud/evolution-api:2.4.0-rc2` (porta interna 8080).
3. **Domínio próprio** (ex. `evolution-rc2.<...>.easypanel.host`) → é o `EVOLUTION_URL` do fallback.
4. **Env vars** (ajustar hosts/senhas):
   ```env
   SERVER_URL=https://evolution-rc2.<dominio>
   AUTHENTICATION_API_KEY=<gerar-key-forte-nova>        # NÃO reusar a key da 2.3.7
   DATABASE_ENABLED=true
   DATABASE_PROVIDER=postgresql
   DATABASE_CONNECTION_URI=postgresql://user:pass@evolution-rc2-db:5432/evolution   # DEDICADO
   DATABASE_SAVE_DATA_INSTANCE=true
   DATABASE_SAVE_DATA_NEW_MESSAGE=true
   DATABASE_SAVE_MESSAGE_UPDATE=true                    # guarda o status final (ERROR/DELIVERY_ACK)
   CACHE_REDIS_ENABLED=true
   CACHE_REDIS_URI=redis://<redis-host>:6379/6
   CACHE_REDIS_PREFIX_KEY=evolution_rc2
   CACHE_LOCAL_ENABLED=false
   ```
5. **Validar saúde:** `curl https://evolution-rc2.<dominio>/` → tem que responder
   `"version":"2.4.0-rc2"`.

### 5.2 Migrar a instância quebrada (piloto: Juliana) — SEM tocar no app ainda

Fazer o teste **fora de banda** primeiro: prova que a rc2 resolve o LID com risco zero de produção.
`$RC2` = URL do fallback, `$K2` = apikey nova.

1. **Criar a instância** no rc2 (mesmo nome):
   ```bash
   curl -X POST "$RC2/instance/create" -H "apikey: $K2" -H "Content-Type: application/json" \
     -d '{"instanceName":"instance_70733843","integration":"WHATSAPP-BAILEYS","qrcode":true}'
   ```
2. **Replicar o webhook** (mesmo da 2.3.7 — evento `CONNECTION_UPDATE`):
   ```bash
   curl -X POST "$RC2/webhook/set/instance_70733843" -H "apikey: $K2" -H "Content-Type: application/json" \
     -d '{"webhook":{"enabled":true,"url":"https://zvlnkkmcytjtridiojxx.supabase.co/functions/v1/whatsapp-bot","events":["CONNECTION_UPDATE"]}}'
   ```
3. **Parear o QR no rc2** (`GET /instance/connect/instance_70733843` → QR base64; a gestora
   escaneia). Isso **desconecta** a instância dela da 2.3.7 (device linkado migra) — ok, ela já
   estava quebrada; as conversas `@lid` continuam funcionando no rc2.
4. **Validar sem afetar produção:**
   ```bash
   EVOLUTION_URL="$RC2" EVOLUTION_KEY="$K2" node scripts/scan-lid.mjs
   ```
   ou um envio de teste para um número seu (`POST /message/sendText/...`) e conferir que o
   status final vai a **DELIVERY_ACK/READ** (não ERROR). ✅ = a rc2 resolve o LID.

### 5.3 Só se 5.2 provar: ligar o app na rc2 para a Juliana

Hoje `config.evolution_api_url` é **global** (uma linha, `chave=evolution_api_url`) e a apikey
também ([`whatsappService.js`](../src/services/whatsappService.js) `initialize()`, ~L102-115)
— todas as instâncias falam com o mesmo servidor. Para roteamento **por conta**:

- **(B) Roteamento por instância (recomendado p/ piloto — reversível):** adicionar override por
  dono (ex. colunas `evolution_url`/`evolution_key` em `mensallizap`, ou linhas `config` por
  `user_id`). `initialize()`/`ensureInitialized()` passam a resolver URL+key **do dono da
  instância** antes de enviar; sem override → usa a global (2.3.7). Migra 1 conta por vez e
  reverte só apagando o override.
  > Pontos de código: `initialize()` (lê url/key global) e `_executarEnvio()` (usa
  > `this.apiUrl`/`this.apiKey`/`instanceName`) — precisam receber url+key por-owner, não só o nome da instância.
- **(A) Cutover total:** quando a rc2 estiver estável por alguns dias, migrar **todas** as
  instâncias e trocar o `evolution_api_url`+key globais. Simples no app, blast radius maior.
  Alternativa: aguardar a **2.4.0 estável** e fazer o cutover nela.

**Recomendação:** 5.1 → 5.2 (piloto fora de banda) → 5.3(B) só pra Juliana. Depois de alguns
dias estável, decidir entre 5.3(A) agora na rc2 ou esperar a 2.4.0 estável.

## 6. Prevenção (enquanto estiver na 2.3.7)
- **Minimizar reparear QR.** Instância `open` continua entregando; o LID só vira no
  re-pareamento. As instâncias hoje OK estão de pé porque não repararam recentemente.
- **Auto-recovery:** o `restartInstance()` (reusa credencial, sem QR) é seguro — não dispara
  LID. Garantir que o fluxo de recovery use `restart`, e **não** logout+QR automático.
- **Monitorar a curva:** rodar `scan-lid.mjs` diariamente (cron) — quando começar a aparecer
  mais de uma instância quebrada, acelerar o cutover para a rc2.

## 7. Árvore de decisão (resumo)

```
Aluno não recebe, mas app diz "enviado"
        │
        ▼
connectionState == open ?  ──não──> queda de socket comum → restart/reparear normal
        │ sim
        ▼
scan-lid.mjs → LID-QUEBRADO ?  ──não──> investigar número/conteúdo/instância isolada
        │ sim
        ▼
NÃO reparear na 2.3.7 → avisar gestora → migrar instância pro fallback rc2 (§5)
        │
        ▼
Muitas instâncias caindo? → acelerar cutover total pra rc2 / aguardar 2.4.0 estável
```

## Referências
- Memória: `incidente_lid_evolution_envios_quebram`, `whatsapp_connection_tracking`.
- Evolution atual: **2.3.7**. Fix de LID: **2.4.0-rc2** (pré-lançamento).
