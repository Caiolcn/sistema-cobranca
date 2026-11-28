# Telas fora do design system — varredura no navegador (27/11/2026)

Feita no localhost, logado na conta de teste, em largura de celular (375px), depois de entregar os P0 do design system (`design-system.md`).
Em cada tela, uma verificação contou o que está na tela e **não** é componente do DS: botão, campo, select do navegador, área de texto, caixa de marcar, tabela, "botão falso" (div clicável no lugar de botão) e fundo no verde antigo #4CAF50.

Nenhum arquivo do app foi alterado nesta varredura.

## Resumo

- **Já estão quase todas no DS:** Minha Assinatura, Loja (Marketing), a entrada do Portal do aluno e o formulário **Novo aluno**. No Novo aluno faltam só o calendário e as tags.
- **Totalmente à mão:** Configurações (todas as abas), Horários, WhatsApp, CRM, Ajuda, Avisos e o modal **Nova despesa**.
- **Misturadas:** Home, Financeiro, Clientes (lista e ficha do aluno) e Relatórios.
- **O padrão que mais se repete fora do DS:** cartão de número (KPI) feito à mão e clicável como div. Aparece em Home (8), Relatórios (13) e Financeiro (4). O DS já tem `StatCard`.
- **Não encontrei:** rolagem lateral em nenhuma tela, nem campo com fonte menor que 16px no celular. O `!important` do `index.css` está segurando isso.

## Tela por tela

Coluna "à mão": quantos elementos daquele tipo estão fora do DS. "DS": quantos já usam o DS.

| Tela | Botões à mão / DS | Campos à mão / DS | Outros fora do DS | Arquivo |
|---|---|---|---|---|
| Home | 13 / 4 | — | 8 cartões KPI clicáveis em div; botão "Indicar"; carrossel de novidades | `Home.js`, `components/NovidadesPainel.js` |
| Clientes (lista) | 0 / 3 | 0 / 1 | linha do aluno é div clicável (5); 1 select nativo | `Clientes.js` |
| Ficha do aluno (modal) | 8 / 2 | 0 / 13 | chips "Copiar portal / Enviar portal / Pedir ficha" à mão; calendário; tags; avatar "A" clicável | `Clientes.js`, `components/TagInput.js`, `components/DateField.js` |
| Novo aluno (modal) | 1 / 3 | 0 / 12 | só o botão "Abrir calendário" e o campo de tags | `components/DateField.js`, `components/TagInput.js` |
| Financeiro | 6 / 9 | 0 / 1 | abas Mensalidades/Vendas/Despesas à mão (cortam "Despesas" no celular); 4 cartões KPI à mão com selo no verde antigo; 2 botões só de ícone sem texto (exportar, filtro); linhas de cobrança em div clicável (7) | `Financeiro.js` |
| Nova despesa (modal) | 3 / 0 | 3 / 0 | 2 selects nativos, 1 área de texto, data nativa, "Despesa recorrente" em div clicável | `Despesas.js` |
| Horários | 7 / 0 | — | barra de dia (anterior/hoje/próximo/calendário/filtro/mais) à mão; botão "+" preto, fora da cor da marca; estado vazio à mão (texto fala em "+ Nova", mas no celular o botão mostra só "+") | `AgendaNovaContainer.js`, `AgendaNovaDia.js` |
| WhatsApp | 2 / 0 | — | botão "Conectar WhatsApp" e "Forçar nova conexão"; 1 select nativo | `WhatsAppConexao.js` |
| Relatórios | 11 / 1 | 0 / 1 | 13 cartões KPI em div clicável; seletor de período (30/90 dias/1 ano) à mão | `Relatorios.js` |
| CRM | 1 / 0 | 1 / 0 | busca à mão; botão "Novo lead"; 1 select nativo | `CRM.js` |
| Ajuda | 17 / 0 | — | todos os botões ("Falar com Suporte", "Assistir") | `Ajuda.js` |
| Avisos | 1 / 0 | — | "Novo Aviso" | `Avisos.js` |
| Minha Assinatura | 0 / 2 | — | 1 fundo no verde antigo | `MinhaAssinatura.js` |
| Config · Dados da Empresa | 1 / 0 | 12 / 0 | upload de logo à mão; placeholder do CPF/CNPJ cortado no celular; select do topo | `Configuracao.js` |
| Config · Planos | 13 / 0 | — | botão azul "Adicionar Plano" (cor fora do DS); editar/pausar/excluir à mão em cada plano | `Configuracao.js` |
| Config · Colaboradores | 1 / 0 | — | "Novo colaborador" | `ColaboradoresConfig.js` |
| Config · Integrações | 2 / 0 | 1 / 0 | 4 caixas de marcar/opções à mão; cartões de escolha (Asaas / PIX manual) em div clicável; 3 fundos no verde antigo | `Configuracao.js` |
| Config · Anamnese | 1 / 0 | — | "Adicionar pergunta" | `Configuracao.js` |
| Config · Contratos | 1 / 0 | — | "Novo template"; 1 fundo no verde antigo | `ContratosTemplates.js` |
| Marketing · Link na bio | 20 / 0 | 7 / 0 | área de texto; escolha de tema (Noite, Fogo, Oceano…) com botões à mão | `components/BioEditor.js` |
| Marketing · Loja | 0 / 1 | — | ok | — |
| Marketing · Agendamento | 2 / 0 | 3 / 0 | "Gerar" / "Salvar configuração"; 1 div clicável | `Configuracao.js` |
| Portal do aluno (entrada) | 0 / 1 | 0 / 1 | ok | `pages/PortalAcesso.js` |

**Não deu para abrir na conta de teste:**
- Agendamento e Autocadastro estão desativados nessa conta. Os links mostram "Link indisponível".
- Portal logado, Pagamento e Contrato precisam de link com token.

Para essas cinco, vale o que o diagnóstico pelo código já mostrou (`design-system.md`, seção 2): nenhuma usa componente do DS.

## Prioridade para migrar

O que pesa: o que o gestor usa todo dia, o que o aluno vê e o que está quebrando no celular.

1. **Financeiro:**
   - abas viram `Tabs`, hoje cortam "Despesas" no celular;
   - cartões viram `StatCard`;
   - botões só de ícone ganham texto ou `aria-label`;
   - linhas viram `Table`, que no celular vira cartão.
   - Uso diário, e tem o defeito visível das abas cortadas.
2. **Configurações (Dados da Empresa, Planos, Integrações):**
   - 12 campos à mão viram `Input`;
   - botão azul vira `Button primary`;
   - opções de Integrações viram `Radio`/`Checkbox`;
   - upload de logo espera o `FileUpload` (P1-7).
3. **Modal Nova despesa:** todo à mão. Usa `Input`, `NativeSelect`, `Textarea` e `Switch`, que já existem desde hoje.
4. **Horários:**
   - barra de navegação do dia com `Button`;
   - "+" no verde da marca;
   - estado vazio com `EmptyState`;
   - corrigir o texto "+ Nova".
5. **Home e Relatórios:** 21 cartões KPI viram `StatCard` (o maior volume repetido) e o seletor de período vira `Tabs segmented`.
6. **Ficha e Novo aluno:** faltam só o calendário e as tags. Dependem de `DatePicker` (P1-6) e `TagInput` no DS (P2-1).
7. **WhatsApp, CRM, Avisos, Colaboradores, Contratos, Anamnese:** poucos botões e campos cada um. Migração rápida, dá para fazer em lote.
8. **Link na bio e Ajuda:** muitos botões, mas pouco uso diário. Por último.

**Depois das telas do gestor:** as páginas do aluno (Pagamento, Contrato, Portal, Agendamento, Autocadastro). Precisam do `PublicPage` (P2-2) e de um link com token de teste para abrir.
