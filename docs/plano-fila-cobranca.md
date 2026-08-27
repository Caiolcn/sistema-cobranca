# Migrar a régua de cobrança para a fila

Plano explicado do começo, sem pressupor conhecimento técnico.

---

## O problema, sem jargão

Hoje, às 9h da manhã, o n8n acorda e dispara **todas as cobranças do dia de uma vez**. Uma atrás da outra, com 1 segundo de intervalo.

Isso cria três problemas:

**Se falhar, perdeu.** Não existe segunda tentativa. Se o WhatsApp do cliente estiver instável naquele instante exato, aquele aluno simplesmente não é cobrado — e ninguém fica sabendo.

**O lote tem prazo.** O n8n mata qualquer rotina que passe de 5 minutos. Quando há muita mensagem, ele para no meio e o resto não sai. Em 20/08 foram 16 mensagens abandonadas assim.

**A rajada chama atenção.** Nove mensagens em um minuto, do mesmo número, para pessoas diferentes — é o padrão que o WhatsApp usa para identificar disparo em massa. O risco não é o sistema cair; é o **número do cliente ser bloqueado**.

## A solução, sem jargão

Em vez de disparar tudo às 9h, o sistema **monta uma lista** do que precisa ser enviado no dia. Aí um "carteiro" passa de dois em dois minutos, pega algumas mensagens da lista, envia, e volta depois para pegar mais.

Se uma mensagem falhar, ela **volta para a lista** e sai na próxima passada.

É a diferença entre despejar cem cartas na caixa de uma vez e um carteiro entregando ao longo da manhã.

---

## O que já existe (e funciona)

Boa parte do trabalho está pronta e **rodando em produção desde 21/08**:

| Peça | O que faz | Estado |
|---|---|---|
| `mensagens_fila` | a lista do dia | pronta |
| `materializar_fila_dia` | monta a lista às 8:45 | rodando |
| `reivindicar_fila_lote` | o carteiro pega o próximo punhado | pronta |
| `concluir_fila` | marca entregue, ou devolve para a lista | pronta |
| `mensagens-worker` | o carteiro em si | rodando |
| Cron a cada 2 min | acorda o carteiro | rodando |

**E o piloto funcionou.** Em 24/08, às 08:46:05 e 08:46:09, o worker enviou duas cobranças reais do Personal Fight — antes do lote do n8n das 9h. A fila comandou, o n8n não precisou fazer nada.

---

## As etapas

### Etapa 1 — Ampliar o piloto para 3 ou 4 contas

**O que é:** hoje só o Personal Fight sai pela fila. Basta acrescentar mais contas numa lista no banco.

**Dificuldade: fácil.** É um comando SQL, sem deploy, reversível na hora.

**O que ajuda a descobrir:** se o ritmo aguenta várias contas ao mesmo tempo, e se o texto sai correto em contas com configurações diferentes.

**Onde escolher bem importa:** pegar contas com volume e com as três janelas ativas (3 dias antes, no dia, 3 dias depois). Uma conta que só usa "no dia" testa um terço do sistema.

### Etapa 2 — Observar por 2 ou 3 dias

**O que olhar, em ordem de importância:**

1. **Nenhuma mensalidade cobrada duas vezes.** Essa é a única falha inaceitável — chega no aluno.
2. As mensagens saem espalhadas, não em rajada.
3. Nada fica preso no estado "enviando" no fim do dia.
4. O texto que o aluno recebe é idêntico ao de antes.

**Dificuldade: fácil, mas exige paciência.** A tentação é acelerar. Cada dia observado vale mais que uma suposição.

### Etapa 3 — Virar todas as contas

**O que é:** trocar a lista de contas por "todas".

**Dificuldade: fácil de fazer, tenso de decidir.** O comando é trivial; a decisão de confiar é que pesa.

### Etapa 4 — Desligar o lote do n8n

**O que é:** desativar o agendamento do workflow de cobranças.

**Dificuldade: média.** Depois disso, se a fila falhar, ninguém cobre. Só fazer quando a Etapa 2 tiver dado tranquilidade.

---

## Os furos que eu enxergo

**O risco número um: cobrança duplicada.**
Durante a transição, os dois sistemas rodam. Se a fila enviar e o n8n enviar de novo, o aluno recebe duas vezes — e isso queima o cliente com ele.

*Como está protegido:* o worker roda 8:46–8:58 e marca a parcela como enviada; quando o n8n acorda às 9h, ela já saiu da lista dele. A proteção depende de o worker terminar antes das 9h.

*Onde o furo aparece:* se uma conta tiver mensagens demais para drenar em 12 minutos, o n8n pega o resto às 9h. Nesse caso ele é rede de segurança e está tudo bem — mas se o worker estiver **no meio de um envio** às 9h em ponto, dá para os dois mandarem a mesma. Janela de segundos, e real.

**Segundo furo: a lista é montada às 8:45 e congela.**
Quem estiver com o WhatsApp caído nesse instante entra na lista como "barrada" e não é tentado no dia, mesmo que reconecte às 9h30. É conservador demais.

**Terceiro furo: mensagem presa em "enviando".**
Se o worker morrer no meio de um envio, a linha fica travada nesse estado e ninguém a pega de novo. Já aconteceu duas vezes no piloto (21 e 20/08, uma linha cada). Falta uma rotina que devolva à lista o que ficou preso.

**Quarto furo: perdemos a edição visual.**
Hoje você abre o n8n e vê o fluxo desenhado. Depois da migração, mudar o comportamento vira alteração de código e deploy. É menos acessível.

---

## O que é difícil de verdade

**Nada, tecnicamente.** As peças estão prontas e testadas.

**O difícil é o timing e a confiança.** Toda a cobrança do produto passa por aí. A tentação é virar tudo de uma vez porque "está funcionando"; a disciplina é ampliar aos poucos e conferir duplicidade todo dia.

---

## O que isso não resolve

**Conta desconectada continua sem enviar.** A fila guarda a mensagem, mas não conecta ninguém.

**Cadastro com número errado continua falhando.** São 12 alunos hoje.

**Os outros workflows do n8n continuam disparando em rajada.** Descobrimos que o lembrete de aula manda **8 mensagens no mesmo segundo** — sem intervalo nenhum, pior que o de cobrança. Não está no escopo deste plano, mas é a próxima dívida.

---

## Como saber se deu certo

**A métrica única: taxa de entrega diária.**

| Referência | Valor |
|---|---|
| Pior dia do mês | 32% (07/08) |
| Dia da crise | 49% (21/08) |
| Ontem | 89,7% |
| **Meta** | **acima de 95% por 5 dias úteis** |

**A contra-prova obrigatória**, todo dia da transição:

```sql
select mensalidade_id, count(*)
from logs_mensagens
where enviado_em >= current_date and status = 'enviado'
group by 1 having count(*) > 1;
```

Tem que voltar vazio. Se voltar qualquer linha, para tudo e investiga.
