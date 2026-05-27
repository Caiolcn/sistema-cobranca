# Agenda Nova — contexto da sessão (2026-05-26, atualizado)

Doc de handoff para retomada amanhã. Escrito pra Claude (e pra mim) entender
em 2 min o que foi construído hoje, por que, e onde continuar.

---

## Por que existe

A "Agenda" atual (menu **Horários** em `/app/horarios`) ficou confusa pros
clientes depois de várias iterações (Dia / Semana / Individual / Legado).
A ideia é construir uma **Agenda Nova** isolada, em outro menu, **sem mexer
na atual**, pra evoluir o desenho sem medo de quebrar quem já usa.

**Restrição-mor:** Horários antigo precisa continuar funcionando 100% igual.

---

## O que está pronto

### Menu e roteamento
- **Sidebar**: novo item "Agenda Nova" logo abaixo de "Horários" — ícone
  `fluent:calendar-sparkle-20-regular` em [src/Dashboard.js:518-547](../src/Dashboard.js#L518)
- **Rota**: `/app/agenda-nova` em [src/App.js:105](../src/App.js#L105)
  (lazy-loaded como `AgendaNova`)
- **Shell**: [src/AgendaNova.js](../src/AgendaNova.js) — só wrapper com
  título e subtítulo "Versão em construção"

### Visão única responsiva
Sem toggle de modos no header (vai voltar depois). Viewport decide:
- **Desktop** → grade Semana 7 dias × horas (estilo Google Agenda)
- **Mobile** → visão Dia (uma data por vez)

Container em [src/AgendaNovaContainer.js](../src/AgendaNovaContainer.js)
faz `isMobile ? <AgendaNovaDia /> : <AgendaNovaSemana />`.

### Modelo de dados — **MUDANÇA IMPORTANTE**
A Agenda Nova introduz "aluno individual" como **entidade distinta de turma**.

Nova coluna: `aulas.devedor_id UUID` (FK em devedores, ON DELETE CASCADE).
- `devedor_id IS NULL` → linha é uma **turma** (cap>1, alunos via `aulas_fixos`)
- `devedor_id IS NOT NULL` → linha é um **aluno individual** (cap=1, sem `aulas_fixos`)

Migração: [sql-adicionar-devedor-aulas.sql](../sql-adicionar-devedor-aulas.sql)
(idempotente, com índice parcial).

**Por que esse modelo?** O usuário escolheu via AskUserQuestion. Outras opções
descartadas: coluna `tipo` em aulas; nova tabela `agenda_alunos`. Escolha
explícita: "Coluna devedor_id em aulas (Recommended)" — minimal change,
retrocompatível.

### Isolamento Horários ↔ Agenda Nova
- [src/AgendaCalendario.js:84-87](../src/AgendaCalendario.js#L84) — query
  filtra `.is('devedor_id', null)` → menu Horários **nunca vê** os alunos
  individuais novos
- [src/AgendaPersonal.js:56-60](../src/AgendaPersonal.js#L56) — modo
  "Individual" antigo (cap=1) também filtra
- AgendaNovaContainer query **sem filtro** + join `devedores` → vê os dois

### Modal único de criação ("Nova")
[src/AgendaNovaCriarModal.js](../src/AgendaNovaCriarModal.js) — radio:
- **Aluno individual**: select aluno + dia da semana + horário + tag/descrição
  opcional. Salva em `aulas` com `devedor_id` setado, capacidade=1.
  **NÃO** cria `aulas_fixos`.
- **Turma**: dias da semana (multi) + início/fim + duração (30/60/90/120min)
  + nome (descricao) + capacidade + professor. Cria N aulas em batch (igual
  AgendaAulaModal atual).

Botão no header chama "Nova" (era "Nova turma").

### Visual dos cards (atual)
Look "premium 2025" — branco + faixa lateral colorida + hover com elevação,
aplicado a **alunos individuais E turmas** (mesma linguagem visual no desktop).

**Desktop — `BlocoAluno`** em AgendaNovaSemana.js:
- Card branco, radius 8px, borda fina, faixa lateral 3px no acento do status
- Avatar 20px (foto OU inicial em círculo `#eef2ff`/`#4338ca`)
- Nome bold + dot colorido no canto direito (status)
- Horário · tag na linha de baixo

**Desktop — `BlocoTurma`** em AgendaNovaSemana.js (repaginado):
- Mesma estética (branco + faixa lateral 3px, agora na cor da modalidade
  `corDaAula(descricao)` — preserva agrupamento visual por tipo de aula)
- Header: horário + pill pequena com iniciais do professor (#344848)
- Descrição em `cor.text` + fontWeight 600 (sutil, mas mantém o "grupo visual")
- **Footer linha 1**: `👥 X/Y` (contagem ocupadas/capacidade) + ícone status
- **Footer linha 2**: pilha de avatares dos alunos (`AvatarStack`) — esconde
  quando 0 alunos pra não deixar espaço vazio
- Hover: shadow + translate-Y -1px (igual ao card de aluno)

**Helpers compartilhados no AgendaNovaSemana.js** (final do arquivo):
- `AvatarStack({ roster, max=3, capacidade })` — pilha de até 3 avatares
  18px sobrepostos com `marginLeft: -5px`, "+N" pill quando exceder. Tooltip
  do container mostra "X/Y alunos", tooltip de cada avatar mostra o nome.
- `corDoAluno(nome)` — hash determinístico → paleta `PALETA_ALUNO` (8 cores
  suaves: violet/blue/green/amber/pink/indigo/orange/cyan). Mesmo aluno =
  mesma cor sempre, em qualquer card.

**Mobile — `CardAluno`** em [src/AgendaNovaDia.js](../src/AgendaNovaDia.js):
- Card branco radius 14px, faixa lateral 4px
- Avatar 48px (foto OU inicial em círculo com gradient da cor de status)
- Nome 15px bold + linha com ícone relógio + horário · tag
- **Status pill** à direita (Presente / Falta / Pendente / Em breve) com ícone

**Mobile — card de turma**: ainda usa o cabeçalho original do AgendaDia
(roster expandido logo abaixo). NÃO foi repaginado ainda — pendente decisão
do usuário se quer aplicar a mesma linguagem do desktop ou manter assim.

**Status colors** (acento, alunos individuais):
- Presente `#16a34a` | Falta `#ef4444` | Pendente `#f59e0b` | Em breve `#8b5cf6`

**Sem botões inline** (decisão do usuário). Click no card de aluno =
abre `AgendaPresencaModal`, que aceita prop opcional `onRemoverSlot` e
renderiza um botão discreto "Remover horário do aluno" (só pra aluno
individual — turmas no menu Horários não veem esse botão).
Click no card de turma = abre o modal de detalhe (roster + fila + ações).

---

## Arquivos novos

| Arquivo | Função |
|--------|--------|
| [sql-adicionar-devedor-aulas.sql](../sql-adicionar-devedor-aulas.sql) | Migração: ADD COLUMN devedor_id |
| [src/AgendaNova.js](../src/AgendaNova.js) | Shell da página `/app/agenda-nova` |
| [src/AgendaNovaContainer.js](../src/AgendaNovaContainer.js) | Container (estado, queries, modais) |
| [src/AgendaNovaSemana.js](../src/AgendaNovaSemana.js) | View Semana (fork de AgendaSemana + BlocoAluno) |
| [src/AgendaNovaDia.js](../src/AgendaNovaDia.js) | View Dia (fork de AgendaDia + CardAluno) |
| [src/AgendaNovaCriarModal.js](../src/AgendaNovaCriarModal.js) | Modal único Aluno/Turma com radio |

## Arquivos editados (cuidado!)

| Arquivo | Mudança | Risco |
|--------|---------|-------|
| [src/App.js](../src/App.js) | +lazy import + rota | Zero |
| [src/Dashboard.js](../src/Dashboard.js) | +item de sidebar | Zero |
| [src/AgendaCalendario.js](../src/AgendaCalendario.js) | `.is('devedor_id', null)` na query | Mínimo (campo não existia antes) |
| [src/AgendaPersonal.js](../src/AgendaPersonal.js) | mesmo filtro | Mínimo |
| [src/AgendaPresencaModal.js](../src/AgendaPresencaModal.js) | +prop opcional `onRemoverSlot` | Zero (prop opcional, default fora-of-the-way) |

**Não tocados** (intocáveis pra preservar Horários): AgendaSemana, AgendaDia,
AgendaAulaModal, AgendaFixoModal, AgendaSlotNovoModal, AgendaGradeLegada,
AgendaPartes, agendaActions, agendaUtils, AgendaDatePicker, AgendaExportarModal.

---

## Decisões de design (com contexto)

1. **Sidebar separada vs aba dentro da Agenda atual** — usuário escolheu
   sidebar pra ter isolamento total visual. Item da sidebar abaixo de Horários.

2. **Toggle de modos removido do header** — usuário disse "Mais pra frente,
   a gente constrói os modos de visualização, não precisa focar agora".
   Por enquanto só visão única responsiva.

3. **Botão "Nova" (era "Nova turma")** — usuário pediu pra simplificar. Modal
   único decide entre aluno/turma via radio.

4. **devedor_id em aulas (não nova tabela)** — minimal change, retrocompat,
   join nativo do Supabase facilita. Trade-off: lembretes baseados em
   `aulas_fixos` não vão disparar pra aluno individual (ver TODO abaixo).

5. **Fork AgendaSemana/Dia → AgendaNovaSemana/Dia** — não é "modificar
   shared component com prop flag". É fork mesmo. Por quê? Usuário pediu
   isolamento total ("Só a Agenda Nova mostra"). Fork garante que mudanças
   visuais futuras na Nova nunca afetem Horários por acidente.

6. **Sem botões inline no card** — usuário disse "pode tirar os botões e
   deixar esse card mais bonito". Ação fica no modal que abre ao clicar.

7. **"dia" no formulário de aluno = dia da semana**, não data específica.
   Recorrente toda semana, igual ao modelo de fixos.

---

## TODOs / pendências

- **Lembretes/notificações**: jobs que varrem `aulas_fixos` (`sql-lembrete-aulas-fixos.sql`,
  `sql-lembrete-aulas-agendamento-online.sql`) **não disparam** pra aluno
  individual, porque ele não está em `aulas_fixos`. Avaliar adaptação dos
  jobs quando o modelo estabilizar — pode ser uma query UNION que busca
  ambos (`aulas_fixos` + `aulas WHERE devedor_id IS NOT NULL`).

- **Modos de visualização** (toggle): usuário quer construir mais tarde.
  Hoje só viewport-driven.

- **Refinamento visual**: usuário gostou bastante do visual atual. Pode
  evoluir com micro-animações, refinos tipográficos, etc.

- **Card de turma no mobile (Dia)**: ainda usa o cabeçalho original do
  AgendaDia (`mdi:clock-outline` em quadrado azul, texto "Prof. X · 5/10
  vagas"). Não foi repaginado pra seguir a linguagem do desktop. Se o
  usuário quiser, aplicar avatares + cor.border igual no BlocoTurma do
  desktop. Caller fica em [src/AgendaNovaDia.js](../src/AgendaNovaDia.js)
  na section `aulasTurmaDia.map`.

- **Limpeza**: dropar `AgendaPersonal` e `AgendaGradeLegada` quando o
  usuário confirmar que o modo "Individual" antigo pode morrer. Por enquanto
  ainda vive no menu Horários.

---

## Como retomar amanhã

1. Conferir se a migração SQL foi executada no Supabase (usuário disse
   "funcionou" — provavelmente já rodou).
2. Acessar `/app/agenda-nova` no browser pra ver o estado atual.
3. Esperar o usuário trazer a referência visual ou novos requisitos.
4. Ao mexer em algo do card: lembrar que os arquivos das views (`AgendaDia.js`,
   `AgendaSemana.js`) **não devem ser tocados** — fork em `AgendaNova*.js`.
5. Ao mexer no banco: lembrar que `devedor_id IS NULL` é o filtro mágico
   que isola os dois mundos.

---

## Estado do git (fim da sessão)

Branch: `dev`, sincronizada com `origin/dev`. Dois commits hoje:
1. `e2159f4` — feat: Agenda Nova — menu isolado com card de aluno individual
   (estrutura toda + visual inicial)
2. próximo commit — refinamento visual do card de turma (avatares + estética
   alinhada ao card de aluno) + atualização deste doc
