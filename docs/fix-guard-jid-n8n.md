# Correção do guard `remote_jid_divergente` no n8n

**Data:** 04/08/2026
**Aplicação:** manual, no n8n de produção (o workflow lá divergiu de `n8n-workflows/*.json`)

## Status em 18/08/2026 — RESOLVIDO

- ✅ **Correção 1 (guard no n8n) — aplicada em 13/08**, por outro caminho que não este
  documento. O nó vivo `Enviar No Dia1` normaliza o nono dígito com `_norm()`, e a
  função foi verificada em 18/08 contra os 4 pares reais que geraram falso positivo:
  nenhum deles acusa mais. **Último `remote_jid_divergente` nasceu 13/08 12:48** — os 51
  registros são passivo histórico, não fluxo contínuo.
- ✅ **Correção 2 (`tipo` nos logs de sucesso) — aplicada em 18/08** via API
  (`PUT /api/v1/workflows/gdPzIzuqTqVNyCWx`). `Log 3 Dias1` → `pre_due_3days`,
  `Log No Dia1` → `due_day`, `Log Atraso1` → `overdue`, batendo com os nós de falha
  irmãos. Antes disso todo envio bem-sucedido gravava `tipo` nulo — origem dos 5.935
  registros sem tipo.
- ✅ **Workflow vivo exportado** para `n8n-workflows/cobrancas-3em1.json` (com os
  segredos substituídos por `__SUPABASE_SERVICE_ROLE_KEY__`). O repo deixou de divergir.

> **Escopo:** o guard de JID existe **somente** no `Enviar No Dia1`. `Enviar 3 Dias1` e
> `Enviar Atraso1` não comparam JID — confirmado no vivo em 18/08.

Falsos positivos latentes que **sobraram** no `_norm()` vivo, ambos sem ocorrência real
em 51 registros e deixados de propósito (mexer no fluxo de envio custa mais que o risco):
sufixo de device (`5511...:12` vira `5511...12` no `replace(/\D/g,'')`) e `@lid`
(normaliza para lixo). O segundo é provavelmente inalcançável — pelo runbook do LID, o
Baileys não entrega a contas LID, então não existe sucesso com `remoteJid @lid`.

### Histórico — status em 05/08/2026

- ❌ **Correção 1 — NÃO aplicada** naquela data. Em 05/08 nasceram **20 novos**
  `remote_jid_divergente` na rodada das 9h.
- ✅ **Passivo histórico reclassificado.** 591 logs (28/05 → 05/08) reavaliados pela
  regra de canonização: **591 benignos, 0 divergência real**. Viraram
  `status = 'enviado'`, `erro_codigo = 'jid_canonico_br'` — saem dos contadores de
  falha sem perder o rastro. O texto do erro foi preservado.
- ⏸️ **Tapume mantido** em `AdminErrosMensagens.js:63` (item 4 do checklist abaixo),
  de propósito: sem ele a tela volta a mostrar os falsos positivos que ainda nascerem.
- ⚠️ **O tapume nunca cobriu o resto do app.** Ele filtra só a tela de Erros de Envio.
  Como o registro nascia com `status = 'falha'`, ele continuava aparecendo no histórico
  do aluno (`Clientes.js:662`), no dashboard (`Admin.js:148`), em `Relatorios.js:140` e
  em `Home.js:184`. A reclassificação acima é o que limpou esses quatro.

## O problema

Os nós `Enviar 3 Dias` / `Enviar No Dia` / `Enviar Atraso` do n8n de produção comparam o
`body.key.remoteJid` devolvido pela Evolution com o telefone cadastrado e, se diferirem, marcam
`envio_sucesso: false` com `erro_codigo: 'remote_jid_divergente'`.

Em contas de WhatsApp criadas antes do nono dígito da Anatel, o **JID canônico é sem o 9**. A
Evolution resolve e roteia para o titular certo; o guard lê isso como erro.

```
enviado para 5591981149019  →  Evolution roteia 559181149019@s.whatsapp.net  →  guard acusa erro
```

Levantamento de 04/08/2026 sobre os últimos 30 dias:

| | |
|---|---|
| Logs `remote_jid_divergente` | 214 |
| Explicados só pelo nono dígito | **214** |
| Divergência real (outro titular) | **0** |

Confirmado por `/chat/whatsappNumbers` (todos `exists: true`, JID sem o 9, nomes batendo com o
cadastro) e por `/chat/findMessages` (`DELIVERY_ACK` / `READ` nas mensagens acusadas).

## Por que não é cosmético

O nó `Marcar *` só roda no ramo de sucesso. Com o falso positivo, `enviado_no_dia` fica `false`
numa parcela **já cobrada** → a parcela volta para a fila → o aluno recebe de novo.

Em 04/08 sete alunos receberam a mesma cobrança duas vezes (09:02 e 10:36).

## A correção

Normalizar o nono dígito **dos dois lados** antes de comparar, e só acusar divergência se ainda
assim os números diferirem. É a mesma regra que o app já usa em
`src/services/whatsappService.js:266-288` (`gerarVariantesNumero`).

> **Correção de escopo (05/08/2026):** o guard está **somente no nó `Enviar No Dia`**.
> Os 591 logs são **100% `tipo = 'due_day'`** — nenhum `pre_due_3days`, nenhum `overdue`.
> Conferido no n8n: `Enviar 3 Dias` e `Enviar Atraso` rodam o código limpo, idêntico ao
> versionado, **sem** o bloco `jidDivergente`. Trocar os três, como esta seção dizia
> originalmente, adicionaria uma verificação de JID onde ela nunca existiu — mudança de
> comportamento não pedida em dois nós que hoje funcionam.

Substituir o corpo do nó `Enviar No Dia` por:

```js
const items = $input.all();
const results = [];

// Canoniza um telefone ou JID para comparação.
// Contas BR anteriores ao 9º dígito da Anatel têm JID canônico SEM o 9 — a Evolution
// devolve o JID resolvido, então os dois lados precisam virar a mesma forma antes de comparar.
// Mesma regra de src/services/whatsappService.js:266-288 (gerarVariantesNumero).
function chaveComparavel(valor) {
  let n = String(valor || '').split('@')[0].split(':')[0].replace(/\D/g, '');
  if (!n) return '';
  if (!n.startsWith('55')) n = '55' + n;

  // 55 + DDD(2) + 9 dígitos: se o assinante começa com 9, é celular pós-Anatel.
  // Canoniza removendo o 9 para casar com o formato antigo.
  if (n.length === 13) {
    const ddd = n.substring(2, 4);
    const assinante = n.substring(4);
    if (assinante.startsWith('9')) n = '55' + ddd + assinante.substring(1);
  }
  return n;
}

for (let i = 0; i < items.length; i++) {
  const data = items[i].json;
  if (i > 0) await new Promise(r => setTimeout(r, 1000));

  try {
    const resp = await this.helpers.httpRequest({
      method: 'POST',
      url: data.evolution_url,
      headers: { 'Content-Type': 'application/json', 'apikey': data.evolution_api_key },
      body: { number: data.telefone, text: data.mensagem },
      returnFullResponse: true,
      ignoreHttpStatusErrors: true,
      json: true
    });

    const body = resp.body;
    const statusCode = resp.statusCode;
    const jidRetornado = body?.key?.remoteJid || '';

    // Endereçamento LID não é comparável com telefone — não dá para verificar, não acusa.
    const ehLid = jidRetornado.endsWith('@lid');
    const esperado = chaveComparavel(data.telefone);
    const recebido = chaveComparavel(jidRetornado);
    const jidDivergente = !ehLid && esperado && recebido && esperado !== recebido;

    if (statusCode >= 200 && statusCode < 300 && body?.key?.id && !jidDivergente) {
      results.push({ json: { ...data, envio_sucesso: true, response_id: body.key.id, http_status: statusCode, response_api: body } });
    } else if (jidDivergente) {
      // Sobrevive só a divergência REAL: outro titular, depois de neutralizar o 9º dígito.
      results.push({ json: { ...data, envio_sucesso: false,
        erro_codigo: 'remote_jid_divergente',
        erro_mensagem: `Evolution roteou pra ${jidRetornado}, esperado ${esperado}@s.whatsapp.net. Pode ter sido entregue ao titular errado.`,
        http_status: statusCode, response_api: body } });
    } else {
      let erroCodigo = `http_${statusCode}`;
      let erroMsg = body?.response?.message || body?.message || `HTTP ${statusCode}`;
      if (statusCode === 500) { erroCodigo = 'instance_500'; erroMsg = 'Instância retornou 500 (provável desconexão)'; }
      else if (statusCode === 404) { erroCodigo = 'instance_not_found'; erroMsg = 'Instância não encontrada na Evolution'; }
      else if (statusCode === 401 || statusCode === 403) { erroCodigo = 'auth_failed'; erroMsg = 'Credencial Evolution inválida'; }
      else if (statusCode === 400) { erroCodigo = 'bad_request'; }
      results.push({ json: { ...data, envio_sucesso: false, erro_mensagem: typeof erroMsg === 'string' ? erroMsg : JSON.stringify(erroMsg), erro_codigo: erroCodigo, http_status: statusCode, response_api: body } });
    }
  } catch (err) {
    results.push({ json: { ...data, envio_sucesso: false, erro_mensagem: err.message || 'Erro de conexão', erro_codigo: err.code ? `network_${String(err.code).toLowerCase()}` : 'exception', http_status: null, response_api: { name: err.name, message: err.message, code: err.code } } });
  }
}

return results;
```

### Validação da função

`chaveComparavel` foi testada em 04/08/2026 contra os pares reais extraídos dos logs e contra casos
adversariais:

- **0 falsos positivos** nos pares reais (amostra cobrindo DDD 47, 61, 63, 71, 74, 75, 77, 81, 82,
  86, 88, 91, 98, 99).
- Continua acusando divergência de verdade: último dígito diferente, DDD diferente, e o caso
  traiçoeiro `5591981149019` × `559981149019` (DDD 91 com 9 vs DDD 99 sem o 9 — que uma normalização
  ingênua deixaria passar).
- Não acusa quando o JID é `@lid`, quando o JID vem vazio, quando o cadastro está formatado
  (`(91) 98114-9019`) ou sem DDI (`91981149019`).
- Fixo de 8 dígitos passa intacto.

### O que muda no comportamento

| Situação | Antes | Depois |
|---|---|---|
| JID sem o 9 (conta BR antiga) | falha, parcela reenvia | **sucesso**, flag gravada |
| JID `@lid` | dependia da comparação | não comparado, não acusa |
| JID de outro titular de verdade | falha | falha (mantido) |
| HTTP 500 / 404 / 401 / 400 | falha | falha (inalterado) |

## Correção 2 — `tipo` nos logs de sucesso

Os nós de log de sucesso omitem `tipo`; os de falha preenchem. Por isso todo envio bem-sucedido
fica com `tipo = null` em `logs_mensagens` e qualquer análise por tipo enxerga só as falhas.

Adicionar `tipo` ao corpo dos nós de sucesso, com o mesmo valor do nó de falha irmão:

| Nó de sucesso | `tipo` a incluir |
|---|---|
| `Log 3 Dias` | `pre_due_3days` |
| `Log No Dia` | `due_day` |
| `Log Atraso` | `overdue` |

Cuidado com a taxonomia: `agente-lembretes-antecipados.json:271/310` grava `lembrete_3dias` e
`vencimento_hoje` para os mesmos eventos. Padronizar em `pre_due_3days` / `due_day` / `overdue`,
que é o que o app usa em `whatsappService.js:678-691` (`calcularTipoMensagem`).

## Correção 3 — a janela cega da desconexão

Defeito independente descoberto no mesmo incidente. As views `vw_parcelas_*` exigem
`mensallizap.conectado = true`. Se a instância está fora do ar no instante do cron, a parcela
**some da fila**: sem tentativa, sem log, sem alerta. E o cron roda **uma vez por dia**.

Foi o que tirou 3 alunos da Rede Fit da cobrança em 04/08: WhatsApp caiu 09:00:05, voltou 09:21:56,
o n8n roda 09:02.

Duas peças:

### 3a. View de visibilidade (já aplicada)

`vw_parcelas_barradas_offline` — lista as parcelas que passariam em todos os outros filtros e são
barradas **só** pela instância desconectada, nas três janelas (`pre_due_3days`, `due_day`,
`overdue`), com `instance_name`, `conectado` e `ultima_desconexao`.

```sql
select * from vw_parcelas_barradas_offline;
```

Vale plugar num alerta: se essa view voltar linhas logo depois da rodada diária, alguém ficou sem
cobrança.

### 3b. Segunda rodada do workflow — **só depois da Correção 1**

Agendar uma segunda execução (ex.: 11h30). Como o filtro é `enviado_no_dia = false`, ela não
duplica nada — só recolhe quem ficou para trás.

> **Ordem importa.** Com o guard ainda quebrado, a flag nunca é gravada e a segunda rodada vira
> exatamente a máquina de duplicar que rodou em 04/08 (7 alunos receberam a mesma cobrança duas
> vezes, 09:02 e 10:36). Aplicar a Correção 1 primeiro.

## Depois de aplicar

1. Disparar o workflow e conferir que uma parcela de número BR antigo grava `status = 'enviado'`
   **e** `enviado_no_dia = true`.
2. Rodar duas vezes seguidas — a segunda não pode enviar nada para quem já recebeu.
3. Confirmar que não nascem `remote_jid_divergente` novos:
   ```sql
   select count(*) from logs_mensagens
   where erro_codigo = 'remote_jid_divergente' and created_at > now() - interval '1 day';
   ```
4. Com o painel limpo, remover o filtro-tapume de `src/AdminErrosMensagens.js:61-63`, que hoje
   esconde esse código da tela de Erros de Envio (commit `49fbfa9`, 19/06/2026).
5. **Exportar o workflow corrigido de volta para `n8n-workflows/`** — hoje o que roda em produção
   não está versionado, e é por isso que este guard nunca apareceu no repo.
