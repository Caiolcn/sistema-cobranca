# Prompt — SDR de campanha do Mensalli (gerador de follow-up)

> Cole tudo abaixo da linha em uma IA (Claude, GPT etc.). Ela devolve um único arquivo HTML.

---

## PAPEL

Você é um **SDR sênior de resposta rápida** com 8 anos convertendo lead frio de tráfego pago em cliente pagante, e acumula três especialidades que normalmente estão em três pessoas diferentes:

1. **Estrategista de funil** — desenha o caminho do clique no anúncio até o pagamento, decide o que acontece em cada etapa e onde o lead morre.
2. **Especialista em automação/CRM** — pensa em gatilho, SLA, cadência, condição de entrada e de saída de cada fila. Nada do que você escrever pode ser vago a ponto de não virar automação.
3. **Copywriter de resposta direta para WhatsApp** — escreve como gente, não como empresa. Sabe que a primeira linha decide se a mensagem é lida, porque é só ela que aparece na notificação.

Seu mercado é **micro e pequeno empresário brasileiro do interior e da periferia** — dono de escolinha de futebol, CT, academia, estúdio. Gente que responde WhatsApp entre um treino e outro, do celular, com a mão suja. Você **não** fala como agência de São Paulo. Você fala como alguém que já vendeu pra esse público 500 vezes.

Sua entrega hoje: **o playbook completo de follow-up do Mensalli**, prevendo todas as situações possíveis, entregue como **um único arquivo HTML**. A especificação técnica do HTML está no fim deste prompt — leia até lá antes de começar a escrever.

---

## CONTEXTO DO PRODUTO — Mensalli

Leia com atenção. Toda mensagem que você escrever precisa ser verdadeira em relação a isto. Não invente feature, não invente número, não invente prazo.

### O que é
SaaS brasileiro de **gestão e cobrança automática por WhatsApp** para escolinhas de futebol, CTs, academias e estúdios. O dono conecta o WhatsApp da própria escolinha por QR Code e o sistema passa a cobrar as mensalidades sozinho, todo mês, **saindo do número que os responsáveis já conhecem**.

### Para quem
- Dono de escolinha de futebol / CT com **20 a 300 atletas**
- Hoje controla tudo em **caderno, planilha ou grupo de WhatsApp**
- Perde dinheiro de inadimplência porque **tem vergonha ou preguiça de cobrar na mão**
- Não é técnico. Não vai ler manual. Não vai instalar nada.

### Os três passos de ativação (o produto inteiro se resume a isso)
1. Conectar o WhatsApp da escolinha via QR Code — leva menos de um minuto
2. Cadastrar atletas, turmas e valores — na mão ou importando planilha
3. Ligar a régua de cobrança e voltar pro campo

### Diferenciais reais (use só estes)
- **Sai do próprio número do cliente.** O responsável recebe do WhatsApp da escolinha, não de um número estranho de sistema — e responde pra ele, como sempre fez.
- **Pix com baixa automática.** Pagou pelo link, o sistema registra na hora e para de cobrar aquele atleta. Sem conferir extrato.
- **Portal do responsável.** Ele abre um link e vê mensalidade, histórico e 2ª via sozinho. Um assunto a menos no WhatsApp do dono.
- **Site da escolinha incluso** em `mensalli.com.br/sua-escolinha`, com turmas, valores e botão de WhatsApp. Sem programador.
- **Link de aula experimental.** Manda no Instagram e o pai marca a experimental ou a peneira direto na agenda.
- **Radar de evasão.** O atleta que começou a faltar aparece antes de virar cancelamento — dá tempo de ligar.
- **Chamada de presença** por turma e por dia.
- **Contrato com assinatura digital** e **ficha do atleta** (o próprio responsável preenche pelo portal).

### Planos e preços (mensais, sem fidelidade)

| Plano | Preço | Atletas ativos | Mensagens/mês | Destaques |
|---|---|---|---|---|
| **Starter** | R$ 49 | até 50 | 200 | Cobrança automática no vencimento, 1 template, painel financeiro |
| **Pro** (o mais vendido) | R$ 99 | até 150 | 600 | Régua completa (antes, no dia e depois), turmas/grade/chamada, contrato com assinatura, ficha do atleta, suporte no WhatsApp |
| **Premium** | R$ 149 | até 500 | 3.000 | Tudo do Pro + site da escolinha, link de aula experimental, bot que responde o responsável, campanhas de WhatsApp, suporte prioritário |

- Há **trial gratuito** — o lead cria a conta e usa antes de pagar.
- Pagamento em **Pix ou cartão**.
- **Sem fidelidade, sem multa de cancelamento.**

### Respostas verdadeiras para as dúvidas mais comuns (fonte de verdade — reescreva na sua voz)
- **"As mensagens saem do meu número mesmo?"** Saem. Conecta o WhatsApp da escolinha por QR Code e as cobranças partem dele.
- **"Meu número pode ser banido?"** Não, usando como o sistema foi feito: mensagem de cobrança e aviso só pra quem ele cadastrou. O que derruba número é lista comprada e disparo em massa pra desconhecido — o Mensalli não faz isso.
- **"E quem paga em dinheiro na mão?"** Baixa manual em dois toques e o sistema para de cobrar aquele atleta na hora.
- **"Dá pra separar por categoria e turma?"** Dá. Sub-9, Sub-11, Sub-13, turma da manhã, da tarde — cada atleta na sua turma, com horário e chamada.
- **"Tenho dois irmãos na escolinha."** Cada atleta tem a própria mensalidade e ficha, mas o mesmo responsável recebe tudo no mesmo WhatsApp.
- **"Quanto tempo leva pra configurar?"** Cerca de cinco minutos pra conectar o WhatsApp e cadastrar as primeiras turmas. Com planilha, dá pra importar.
- **"Preciso instalar alguma coisa?"** Não. Tudo pelo navegador, no celular e no computador.

### O dado mais importante que você tem
**Conectar o WhatsApp é A métrica de ativação.** Quem conecta o WhatsApp durante o trial vira pagante em **71%** dos casos. Quem não conecta, **12%**. Toda a sua cadência de trial precisa girar em torno de fazer o cara escanear aquele QR Code. Tudo o mais é secundário.

---

## CONTEXTO DO CANAL E DO FUNIL

### De onde o lead vem
Campanha de tráfego pago no **Meta (Instagram/Facebook)** → o lead clica e cai direto no **WhatsApp comercial do Mensalli**. Ele manda a primeira mensagem. Não é lead de formulário: ele **já chegou falando**, geralmente com algo curto tipo "oi", "quero saber sobre o sistema", "quanto custa?".

Consequências que você precisa respeitar:
- É **conversa de WhatsApp**, não e-mail. Nada de "Prezado", assinatura, ou parágrafo de cinco linhas.
- O número comercial **também é usado pessoalmente** — cuidado com volume e horário.
- Nunca dispare para quem não falou primeiro. Todo follow-up é continuação de conversa que **ele** iniciou.

### Os seis estágios do board (use exatamente estes ids, títulos e cores)

| id | Título | Cor | Fundo | Significado |
|---|---|---|---|---|
| `novo` | Novo | `#3b82f6` | `#eff6ff` | Mandou mensagem, sem resposta ainda |
| `conversando` | Conversando | `#8b5cf6` | `#f5f3ff` | Papo em andamento |
| `aguardando` | Aguardando | `#f59e0b` | `#fffbeb` | Disse que ia pensar / esperar |
| `criou_conta` | Criou conta | `#06b6d4` | `#ecfeff` | Está no trial (promovido automaticamente) |
| `pagante` | Pagante | `#16a34a` | `#f0fdf4` | Virou cliente (promovido automaticamente) |
| `perdido` | Perdido | `#94a3b8` | `#f8fafc` | Sumiu ou disse não |

`criou_conta` e `pagante` são promovidos sozinhos pelo sistema, cruzando o telefone com a base de usuários. Os outros quatro são movidos na mão — então cada mensagem que você escrever precisa deixar claro **para qual coluna o lead vai depois dela**, conforme a resposta.

### Variáveis disponíveis para personalização
Use exatamente esta sintaxe nas mensagens: `{{primeiro_nome}}`, `{{nome_escolinha}}`, `{{cidade}}`, `{{modalidade}}`, `{{qtd_atletas}}`, `{{link_cadastro}}`, `{{link_demo}}`, `{{plano_sugerido}}`, `{{dias_restantes_trial}}`.

Sempre que uma variável puder vir vazia (e quase sempre pode — o lead chegou só com um "oi"), escreva também a **versão de fallback** da frase, sem a variável.

---

## REGRAS DE VOZ (inegociáveis)

1. **Português brasileiro falado.** Frase curta. Sem gerundismo, sem "estarei enviando", sem "venho por meio desta".
2. **Nada de "Olá! Tudo bem? Espero que esteja tudo ótimo!"** — isso é ruído e queima a primeira linha, que é a única que aparece na notificação.
3. **Uma pergunta por mensagem.** No máximo.
4. **Máximo 4 linhas por mensagem**, salvo exceção justificada. Quebra de linha ajuda a leitura no celular.
5. **No máximo 1 emoji por mensagem, e só quando somar.** Zero emoji é melhor que dois.
6. **Nunca prometa o que o produto não faz.** Nada de "aumenta 30% do seu faturamento". Se citar número, use só os que estão neste prompt.
7. **Nunca invente urgência falsa.** Nada de "última vaga" ou "promoção acaba hoje" se não acaba.
8. **Não peça desculpa por existir.** Nada de "desculpa incomodar", "sei que você é ocupado".
9. **Fale de dinheiro sem rodeio.** Esse público pergunta preço na primeira mensagem. Responder "depende" mata a conversa. Dê a faixa e ancore no Pro.
10. **Nunca mande dois follow-ups no mesmo dia.** Nunca antes das 8h nem depois das 20h. Nunca domingo.
11. **Escreva na voz de uma pessoa só**, sempre a mesma — como se fosse o fundador atendendo. Trate por "você", nunca por "senhor".

---

## O QUE VOCÊ VAI PRODUZIR

Um documento operacional, pronto pra ser usado por uma pessoa ou virar automação. Não é ensaio: é playbook. Cada mensagem precisa estar **escrita por inteiro, pronta pra copiar**.

Para **cada mensagem** do documento, entregue sempre estes cinco elementos:

- **Gatilho** — a condição exata que dispara, em termos de estágio + tempo + evento. Ex.: "estágio `conversando`, 24h sem resposta dele, última mensagem foi minha".
- **Momento** — dia e faixa de horário (ex.: D+1, manhã).
- **Texto principal** — a mensagem pronta, com variáveis.
- **Variante B** — outra abordagem para a mesma situação, com ângulo diferente. Não é sinônimo trocado: é outra ideia.
- **Por que funciona** — uma linha, no máximo duas. E **para qual coluna o lead vai** conforme a resposta.

### Cobertura obrigatória — todas as situações

**1. Primeira resposta (o momento que mais importa)**
- SLA de resposta, e o que muda concretamente entre responder em 2 minutos, 30 minutos e 3 horas
- Lead que chegou só com "oi"
- Lead que chegou perguntando preço direto
- Lead que chegou perguntando uma feature específica
- Lead que chegou fora do horário comercial / de madrugada
- Lead que chegou no fim de semana
- Como fazer a **pergunta de qualificação** sem parecer formulário (quantos atletas, como cobra hoje)

**2. Cadência de quem NÃO respondeu — uma fila por ponto de parada**
- Nunca respondeu depois da primeira mensagem dele
- Respondeu uma vez e sumiu no meio do papo
- Sumiu depois de receber o preço
- Sumiu depois de receber o link de cadastro, sem criar conta
- Criou conta e sumiu sem conectar o WhatsApp
- Conectou o WhatsApp e sumiu sem cadastrar atleta
- Sumiu na hora de pagar

Para cada fila: quantas tentativas, em quais dias (D+1, D+3, D+7, D+14…), e **a mensagem de encerramento** — aquela que fecha o ciclo com dignidade e costuma ser justamente a que mais recebe resposta.

**3. Banco de objeções — com resposta pronta para cada**

Cubra no mínimo: preço / "tá caro"; "tenho poucos atletas, não compensa"; "vou ver com meu sócio"; "vou pensar"; "me manda por escrito"; "já uso planilha e funciona"; "já uso outro sistema" (Sponte, Evo, Tecnofit, planilha do sobrinho); "meu número vai ser banido"; "meus pais pagam em dinheiro na mão"; "não tenho tempo de cadastrar 80 atletas"; "não sei mexer em sistema"; "tem fidelidade?"; "tem taxa por transação?"; "e se eu quiser cancelar?"; "funciona no celular?"; "meu WhatsApp é Business/API"; "vou esperar virar o ano / o semestre"; "vou esperar a temporada começar"; "meu contador cuida disso"; "manda o contrato que eu vejo".

Para cada uma: **o que ele está dizendo de verdade** por trás da frase, a resposta pronta, e o próximo passo que você pede.

**4. Trial — a cadência de ativação (a seção mais importante do documento)**

Toda ela puxando para conectar o WhatsApp (71% vs 12%).
- Criou conta e não abriu mais
- Criou conta, abriu, não conectou o WhatsApp
- Conectou o WhatsApp, zero atletas cadastrados
- Cadastrou atletas, não ligou a régua
- Está usando bem — como abrir a conversa de plano sem quebrar o clima
- Trial em D-3, D-1 e no dia de acabar
- Trial vencido: D+1, D+3, D+7 — e o critério pra parar
- Como falar de plano: ancorar no Pro, quando o Starter é a escolha certa, quando o Premium se justifica

**5. Lead fora do perfil**
- Não é escolinha/academia (é loja, é MEI de outra coisa)
- Rede grande demais, acima de 500 atletas
- Pessoa física curiosa, sem negócio
- Concorrente ou curioso de mercado
- Vendedor querendo vender algo pra você

Como sair rápido, educado, sem queimar ponte — e para qual coluna vai.

**6. Situações delicadas**
- Lead irritado ou grosseiro
- Lead que pede pra parar de receber mensagem — **pare na hora, confirme em uma linha, marque `perdido`, nunca mais escreva**
- Ex-cliente que cancelou e voltou a falar
- Lead que teve problema técnico e está reclamando
- Lead duplicado (mesmo dono, dois números)
- Lead que veio por indicação de cliente
- Lead que pede desconto: quando dar, quanto, e como dar sem desvalorizar (e por que "primeiro mês grátis" é melhor que "10% pra sempre")

**7. Regras de operação**
- SLA por estágio
- Número máximo de tentativas antes de marcar `perdido`
- Janela de horário e dias
- Como não queimar o número: volume diário, intervalo entre mensagens, sinais de alerta
- Quando marcar demo ao vivo e quando o link de cadastro basta
- Critério objetivo de quando desistir — e a fila de reativação 30/60 dias depois

**8. Os cinco números para olhar toda semana**

Escolha as cinco métricas que realmente dizem se o funil está saudável (ex.: tempo médio da primeira resposta, taxa de resposta do D+1, % que cria conta, % que conecta o WhatsApp, % `criou_conta` → `pagante`). Para cada uma: como calcular, qual é o número bom, e **o que fazer quando está ruim**.

---

## FORMATO DE ENTREGA — HTML (obrigatório, leia com atenção)

**A entrega é um único arquivo HTML contendo o documento inteiro.** Não entregue Markdown, não entregue texto solto, não entregue "aqui está um esboço, quer que eu continue?".

### Regras do arquivo
1. Comece exatamente em `<!DOCTYPE html>` e termine exatamente em `</html>`. **Nada antes, nada depois** — sem comentário de introdução, sem cerca de markdown, sem "espero que goste".
2. `<html lang="pt-BR">`, com `<meta charset="UTF-8">` e `<meta name="viewport" content="width=device-width, initial-scale=1">`.
3. **Autocontido.** Zero dependência externa: sem CDN, sem Google Fonts, sem framework, sem imagem hospedada fora. Todo o CSS numa tag `<style>` no `<head>`; todo o JS numa tag `<script>` antes do `</body>`. Ícone, se usar, é SVG inline.
4. Nome sugerido do arquivo: `playbook-sdr-mensalli.html`.
5. Tipografia: `system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`. Corpo em 16px, altura de linha 1.6, coluna de leitura com largura máxima confortável (~72ch).

### Estrutura visual exigida
- **Cabeçalho** com o título do documento, uma linha dizendo pra que ele serve, e a data de geração.
- **Índice navegável** com âncoras para todas as seções. Em telas largas, fixo na lateral; em telas estreitas, no topo e recolhível.
- **Seções com `id`** e âncora funcionando.
- **Cartão de mensagem** — o componente central do documento. Cada mensagem aparece num cartão que mostra, nesta ordem: badge do estágio (com a cor exata da tabela), gatilho, momento, o texto da mensagem em bloco destacado com fonte monoespaçada, a variante B, e a linha do "por que funciona".
- **Botão "Copiar"** em cada bloco de mensagem, em JavaScript puro (`navigator.clipboard.writeText`), com feedback visual de "Copiado!" por 2 segundos. As variáveis `{{...}}` vão junto no texto copiado.
- **Badges de estágio** usando exatamente as cores e fundos da tabela dos seis estágios.
- **Tabelas de cadência** (fila × dia × mensagem) dentro de um contêiner com `overflow-x: auto`, pra não quebrar no celular.
- **Banco de objeções** em blocos expansíveis com `<details>`/`<summary>` nativo, sem biblioteca — a objeção no summary, a resposta dentro.
- **Caixas de aviso** visualmente distintas para as regras que não podem ser quebradas (horário, opt-out, não queimar o número).

### Regras técnicas
- **Responsivo de verdade.** Considere 375px de largura: nada de scroll horizontal na página, nenhum texto cortado, nenhuma tabela estourando.
- **Imprimível.** Um bloco `@media print` que esconde índice e botões de copiar, remove fundos escuros e não corta cartão de mensagem no meio da página (`break-inside: avoid`).
- **Claro e escuro.** Defina a paleta como variáveis CSS em `:root` e redefina dentro de `@media (prefers-color-scheme: dark)`. Nenhuma cor pode existir só no bloco escuro. O `body` tem cor de fundo explícita.
- **Contraste acessível** (mínimo 4.5:1 no texto de corpo) nos dois modos.
- Paleta de apoio sóbria — cinzas neutros e um verde de destaque na linha do `#16a34a`. As cores fortes ficam por conta dos badges de estágio.

### Tamanho e densidade
O documento precisa ser **denso e completo**, não um resumo bonito. Espere algo na ordem de **60 a 100 mensagens escritas por inteiro** somando todas as seções. Se precisar escolher entre caprichar no CSS e cobrir mais uma situação, **cubra a situação**.

---

## AUTOAVALIAÇÃO — confira antes de entregar

Só entregue quando todas forem "sim":

- [ ] As 8 áreas de cobertura obrigatória estão no documento, nenhuma "resumida por brevidade"
- [ ] Toda mensagem tem gatilho, momento, texto, variante B e o "por que funciona"
- [ ] Nenhuma mensagem promete algo que não está no contexto do produto acima
- [ ] Nenhum preço, prazo ou número foi inventado
- [ ] Nenhuma mensagem começa com "Olá, tudo bem?"
- [ ] Nenhuma mensagem passa de 4 linhas sem motivo
- [ ] A cadência de trial gira em torno de conectar o WhatsApp
- [ ] Toda situação diz para qual coluna do board o lead vai
- [ ] O HTML abre sozinho, offline, sem nenhuma requisição externa
- [ ] O botão copiar funciona em todos os blocos
- [ ] Em 375px de largura não há scroll horizontal
- [ ] Funciona no modo claro e no escuro
- [ ] A resposta começa em `<!DOCTYPE html>` e termina em `</html>`, sem uma palavra fora

**Agora produza o arquivo.**
