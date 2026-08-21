# Crise do WhatsApp — o que era, o que fizemos

Registro da investigação que atravessou duas semanas e terminou em 21/08/2026.

---

## A causa raiz, em uma frase

**O banco de dados da Evolution tinha 5,6 GB com 1,5 milhão de mensagens inúteis, e o Postgres queimava 169% de CPU numa VPS de 2 núcleos.** Sem processamento sobrando, os handshakes do WhatsApp não fechavam e os sockets morriam — era isso o "zumbi".

A prova: depois da limpeza, a chamada `fetchInstances` saiu de **211 segundos para 0**.

| Antes | Depois |
|---|---|
| Banco: 5.598 MB | ~400 MB |
| Tabela `Message`: 5.189 MB / 1.567.667 linhas | 215 MB / 91.155 linhas |
| CPU do `evolution-api-db`: 169% | (medir de novo) |
| `fetchInstances`: 211s, depois nem respondia em 240s | **0s** |

---

## Por que demorou duas semanas

Cada hipótese explicava parte dos sintomas e nenhuma era a causa. A lista, na ordem em que foram investigadas:

**A sonda em número falso** (11/08) — o health-check consultava `5511999999999` 48x/dia. Era assinatura de anti-abuso e o WhatsApp invalidava sessões. Média de quedas saiu de 2,0 para 12,3/dia quando a cadência subiu. **Real, corrigido, mas não era a causa principal.**

**O deadlock da Evolution** — instâncias com `logout` 500, `delete` 400, `restart` sem efeito. Levou à criação das instâncias `_v2`. **Real, mas era consequência: sem CPU, a Evolution não conseguia encerrar sessão.**

**O pool do Prisma em 3 conexões** — `connection_limit=3` para 68 instâncias. Gerava 500 com a mensagem **já entregue**, que o sistema marcava como falha e reenviava, cobrando o aluno duas vezes. **Real, corrigido, ainda era sintoma.**

**A VPS pequena** — KVM 1, 1 vCPU, com "Limitação de CPU ativada". Upgrade para KVM 2 **não resolveu**, e foi isso que revelou a verdade: não era falta de máquina, era um processo específico consumindo tudo.

O `docker stats` foi o que fechou o caso:

```
service_evolution-api-db    169.58% CPU
service_evolution-api        16.75% CPU
```

A Evolution estava **faminta**, não sobrecarregada.

---

## Lições que valem mais que as correções

**Estado não é verdade.** `connectionState: open` mentiu a semana inteira. A única prova de que uma conta funciona é entrega real — envio bem-sucedido depois da última falha. Toda análise por estado nos levou a conclusões erradas.

**Instrução que depende do cliente executar certo não é solução.** Três clientes seguidos (INDEPENDENTE, GR Esperança, Lucas Saulo) caíram na mesma armadilha da aba antiga, mesmo avisados. O conserto foi o clique reresolver a instância sozinho.

**O sintoma externo não é a aplicação.** No fim do dia a Evolution ficou 40 minutos "fora" e estava viva o tempo todo — o traefik é que não roteava. O teste que revelou isso foi perguntar à aplicação de dentro dela mesma:
```bash
docker exec <container> wget -qO- http://127.0.0.1:8080/
```

**Erro mascarado custa dias.** O código trocava o erro real por uma frase amigável, gravando `erro_codigo: unknown`. Foram 125 falhas indiagnosticáveis, e três dias em que precisei abrir a Evolution para descobrir o óbvio.

**Verificar antes de destruir.** Apaguei a instância da Paineiras 30 segundos depois de ela reconectar, porque olhei o estado instantâneo e não o histórico de eventos.

---

## O que subiu para produção em 21/08

| Commit | O que corrige |
|---|---|
| `f08e932` | Erro real deixa de ser mascarado nos logs |
| `7ee7a5a` | O clique reresolve a instância — aba antiga para de sabotar |
| `e85e341` | Aba antiga não reescreve mais a instância no banco |
| `b668d27` | Timeout nas 3 chamadas do fluxo de conexão do cliente |
| `fc83dfd` | Tela do admin não trava mais no `fetchInstances` |
| `90cd676` / `3ab9f1c` | Cliente zumbi vê "Conexão travada" com botão, em vez do check verde |
| `db5d75a` | "Número recusado" deixa de ser veredito permanente |
| `4ef4942` | Worker da fila de cobrança (piloto) |

**No banco:** `numero_inexistente` virou reenviável (65 mensagens desbloqueadas), `evolution_db_pool` classificado como entrega, e o aviso de zumbi passou a sair na **detecção** — antes só saía depois de recriar, então com a recriação desligada ninguém era avisado.

**Na infraestrutura:** 41 instâncias órfãs e de trial apagadas (de 71 para ~30), variáveis `DATABASE_SAVE_DATA_*` desligadas, `connection_limit` de 3 para 20, e a limpeza do banco.

---

## Pendências

**Recriar a instância da Rg Movimentos** — é a única cujo `instance_name` aponta para algo que não existe na Evolution.

**Ampliar a fila para todas as contas.** Hoje uma falha às 9h é sentença: não há retentativa. Dos 727 erros dos últimos 15 dias, **57% eram da nossa camada ou indiagnosticáveis** — o lote do n8n estoura em 300s e não classifica erro. O worker já está pronto e rodando em piloto.

**Ligar o aviso de zumbi** (`whatsapp_recovery_cfg`), em modo só-aviso:
```sql
update whatsapp_recovery_cfg
set ativo = true, restart_ativo = false, recriar_ativo = false
where id = true;
```

**Limpeza recorrente da tabela `Message`.** Ela vai crescer de novo. Um cron mensal apagando o que tem mais de 7 dias evita repetir este dia daqui a três meses.

**Corrigir o NPS**, que tenta todos os dias sem limite — dois alunos com número errado acumularam 95 falhas desde 03/07.

**Desligar `service_waha`, `service_wuzapi` e `service_evolution-rc2`**, se forem sobras de teste. Consomem recurso na mesma VPS.

---

## Comandos de diagnóstico

**Taxa de entrega por dia** — a métrica que importa:
```sql
select date(enviado_em) as dia,
       count(*) filter (where status='enviado') as entregues,
       round(100.0*count(*) filter (where status='enviado')/nullif(count(*),0),1) as taxa
from logs_mensagens
where enviado_em > now() - interval '15 days'
group by 1 order by 1 desc;
```

**Quem está travado** (por evidência, não por estado):
```sql
-- conta com falha de socket e nenhum envio bem-sucedido depois = travada
```

**Tamanho do banco da Evolution:**
```bash
ssh root@31.97.151.109
docker exec <id-do-db> psql -U postgres -d service -c \
  "select relname, pg_size_pretty(pg_total_relation_size(relid)) from pg_stat_user_tables order by 2 desc limit 5;"
```

**Quem está consumindo CPU:**
```bash
docker stats --no-stream
```

**Limpar mensagens antigas** (em lotes, nunca de uma vez):
```bash
for i in $(seq 1 40); do
  r=$(docker exec <id-do-db> psql -U postgres -d service -c \
    'DELETE FROM "Message" WHERE ctid IN (SELECT ctid FROM "Message" WHERE "messageTimestamp" < extract(epoch from now()) - 604800 LIMIT 50000);' | tail -1)
  echo "lote $i -> $r"
  [ "$r" = "DELETE 0" ] && break
done
docker exec <id-do-db> psql -U postgres -d service -c 'VACUUM FULL "Message";'
```

---

## O número que fecha o dia

Taxa de entrega em 21/08 até o momento da correção: **49%**.

Melhores dias do mês, antes do banco inchar: **97,6% em 06/08** e **95,9% em 10/08**.

A meta é voltar a esse patamar e ficar. Se em cinco dias úteis a entrega se mantiver acima de 90%, a causa raiz estava certa.
