# Design system do Mensalli — diagnóstico (27/11/2026)

Rodada só de diagnóstico. Nenhum arquivo do projeto foi alterado. Revisão feita pelo código (sem navegador); contagens vêm de `grep` em `src/` fora de `src/design-system/`. Onde um número é aproximado, está dito.

## Resumo (5 linhas)

1. O DS tem uma base boa: tokens de cor/espaço/raio/sombra/movimento, 21 componentes e vários já com regra para celular (Modal vira folha de baixo, Table vira lista de cartões, Input/Select com 16px e 44px).
2. Ele quase não chegou às telas: fora do DS há 6.743 `style={{}}`, 5.939 hex de 6 dígitos, 656 `<button>` em 117 arquivos e 202 `<input>` em 48. Home, WhatsApp, Configuração, Relatórios, Agendamento, Portal, Pagamento e Contrato não importam nenhum componente do DS.
3. Faltam no DS: Toast e Skeleton (existem soltos fora dele), Textarea, DatePicker, upload de foto, Paginação, Alert/Banner, ConfirmModal, Tooltip, barra de progresso, PageHeader/FilterBar e navegação de celular (menu inferior/gaveta). Faltam também tokens de z-index, breakpoint, foco e tamanho de fonte.
4. Problemas dentro do DS: texto branco sobre o verde da marca dá contraste 2,8:1 (reprova); hex cravado em Button/Avatar/TimeInput; escala de z-index quebrada (Select 10100 acima do Toast 10001); breakpoints 640 (DS e hook) contra 768 (index.css e 17 telas); 18px de Checkbox/Radio e 36x20 de Switch sem área de toque de 44px.
5. Antes de migrar qualquer tela: fechar 7 itens P0 (tokens z-index/breakpoint/foco/fonte, Toast+Skeleton, Textarea, contraste do verde, área de toque, z-index/portais, menu de celular), cerca de 3 a 4 dias de trabalho; P1 e P2 podem andar junto com a migração.

---

## 1. O que o design system cobre hoje

Arquivos: `src/design-system/tokens.css` (377 linhas), `src/design-system/components/` (21 componentes JS + 16 CSS), mais 24 páginas de documentação `Pagina*.js` e `DSLayout.js` servidas em `/app/design-system`. O `tokens.css` é importado globalmente em `src/App.js:8`.

### 1.1 Tokens (`tokens.css`)

| Grupo | O que existe | Linhas |
| --- | --- | --- |
| Cor de marca | `--mensalli-green-50..950` (500 = #4CAF50, a marca) | 17-27 |
| Cor complementar | `--mensalli-dark-50..950` (600 = #344848) | 34-44 |
| Neutros | `--neutral-0, 50..950` (Slate) | 50-61 |
| Semânticas | `--success/warning/danger/info` em 50, 500, 700 | 67-81 |
| WhatsApp | `--whatsapp-500`, `--whatsapp-600` | 84-85 |
| Aliases | `--color-brand`, `-hover`, `-active`, `-brand-dark`, `--color-bg-page/surface/muted`, `--color-border-subtle/default`, `--color-text-primary/secondary/muted/on-brand` | 91-106 |
| Tipografia | `--font-sans` (Inter), `--font-mono`; 11 classes `.ds-text-display` (42), `h1` (32), `h2` (24), `h3` (20), `h4` (18), `body-lg` (16), `body` (14), `body-sm` (13), `caption` (12), `eyebrow` (11), `mono` (12) | 115-203 |
| Espaço | `--space-0, 0-5, 1, 1-5, 2, 2-5, 3, 3-5, 4, 5, 6, 8, 10, 15` (2px a 60px) | 211-224 |
| Raio | `--radius-sm 4, md 6, lg 8, xl 12, 2xl 16, full` | 229-234 |
| Sombra | `--shadow-sm, md, lg, xl, 2xl` (tinta neutral-900) | 240-244 |
| Movimento | `--duration-100/150/200/300/500/700`, `--ease-out/in/in-out/bounce` | 250-260 |
| Keyframes | `ds-fade-in, slide-in-right/bottom/top, scale-in, spin, pulse, shimmer, ping, loading-dots` | 267-313 |
| Utilitários | `.ds-transition-colors/transform/opacity`, `.ds-loading-dots`, `.ds-live-ping`, regra de `prefers-reduced-motion` | 318-377 |

Não existem como token: z-index, breakpoints, tamanho de fonte/peso/altura de linha como variável (só como classe), cor de foco, altura mínima de toque, largura de container.

### 1.2 Componentes e variações

| Componente | Variações / props principais |
| --- | --- |
| Button | `variant`: primary, secondary, outline, ghost, gray, danger, danger-outline, danger-soft, whatsapp. `size` xs 24 / sm 32 / md 40 / lg 48. `icon`, `iconRight`, `iconOnly`, `loading`, `fullWidth`, `shape` (default/pill/circle), `elevated`, `selected` + `selectedTone`, `as="a"`. |
| Input | `label, helper, error, required, prefix, suffix, icon, iconRight, clearable, loading, size sm/md/lg, fullWidth, showCounter`. |
| SearchInput, PasswordInput, TimeInput | Derivados do Input (TimeInput tem lista de horários própria). |
| Select | Dropdown próprio com portal: `searchable, multiple (chips), clearable, onCreate, size, icon, emptyMessage`, teclado e aria. |
| Checkbox, Radio, RadioGroup | `label, description, error, indeterminate`; grupo com `orientation`. |
| Switch | `size sm/md/lg`, `label, description, labelPosition`. |
| Badge | `variant` default/primary/success/warning/danger/info/outline; `size xs/sm/md`; `shape`, `solid`, `dot`, `icon`, `onRemove`, `customColor/customTextColor`. |
| Avatar, AvatarGroup | `size xs..2xl`, `ring` por status, paleta por hash do nome, foto ou iniciais. |
| Card | `elevation` flat/elevated/floating, `padding` none/tight/default/spacious, `accent`, `tinted`, `clickable`, `as`; sub-componentes Header/Body/Footer/Divider. |
| StatCard | `label, value, icon, accent, tinted, delta {value, direction, tone, label}, hint, footer, loading, onClick, size sm/md`. |
| Modal | `size` sm/md/lg/xl/fullscreen, `position` center/aside, `closeOnBackdrop/Esc`, `hideHeader`; Header/Body/Footer; portal; foco preso. Abaixo de 640px vira folha de baixo (`Modal.css:212-253`). |
| Table | Declarativa (`columns`, `data`): `selectable` + barra de ações em massa, `loading` (skeleton próprio), estado vazio, `size`, `striped`, `stickyHeader`, `onRowClick`; **`mobileCards` (padrão true)** vira lista de cartões abaixo de 640px (`Table.js:64`, `Table.css:196-255`). |
| Tabs | `variant` underline / pills / segmented; `size`; `count`, `icon`; underline rola na horizontal (`Tabs.css:29`); segmented quebra linha no celular. |
| Dropdown | Menu em portal `position: fixed`, vira para cima se não couber; Item/Divider/Group; `danger`, `shortcut`. |
| EmptyState | 5 variantes por intenção (no-results, no-matches, first-use, requires-setup e uma de erro); `size` compact/default/large; `action`, `secondary`. |
| Domínio | `ClienteIdentity` (compact/stacked/contact-focus), `CobrancaStatus` (pago/pendente/atrasado/cancelado com regra de dias), `PlanoCard`, `WizardStepper` (horizontal/vertical/compact, 5 estados). |

### 1.3 Adoção real (importações fora do DS)

Button 45 arquivos, Select 29, Modal 23, Input 21, Badge 14, SearchInput 13, EmptyState 12, Table 10, StatCard 7, Tabs 6, Switch 6, Checkbox 6, Card 4, PlanoCard 2, Dropdown 2, WizardStepper 1, TimeInput 1, Avatar 1. Zero uso: Radio, RadioGroup, PasswordInput, AvatarGroup, ClienteIdentity, CobrancaStatus.

Importam algo do DS: Clientes, Financeiro, CRM, MinhaAssinatura, Autocadastro, PortalAcesso, AgendaNovaContainer e vários modais. **Não importam nada:** Home, WhatsAppConexao, Configuracao, Relatorios, Agendamento, PortalCliente, PaginaPagamento, PaginaContrato, AgendaNovaDia, AgendaNovaSemana.

---

## 2. O que as telas usam e o DS ainda não tem

Telas pelas rotas de `src/App.js:186-278` e `src/pages/`. Contagens: grupos de arquivos por tela (Financeiro = Financeiro + Parcelas + Devedores + Despesas + CobrancasAvulsas + ModalCobranca etc.; Agenda = `AgendaNova*` + modais da agenda; Configuração = Configuracao + ColaboradoresConfig + Contratos + PerfilUsuario).

### 2.1 Peso por tela (estilo escrito à mão)

| Tela | Arquivo principal | Linhas do grupo | `style={{}}` | hex 6 díg. | `<button>` à mão (aprox.) |
| --- | --- | ---: | ---: | ---: | ---: |
| Home | `Home.js` (+`Home.css`) | 3.829 | 9 (e muito CSS) | 240 | 7 |
| Clientes | `Clientes.js` | 5.175 | 455 | 281 | 16 |
| Financeiro | `Financeiro.js` + 8 arquivos | 8.294 | 682 | 379 | 25 só no principal |
| Agenda | `AgendaNova*.js` e modais | 5.521 | 408 | 362 | 61 (contagem do grupo) |
| WhatsApp | `WhatsAppConexao.js`, `CentralMensagens.js` | 5.003 | 374 | 374 | 36 |
| Configuração | `Configuracao.js` + 6 | 7.819 | 845 | 478 | 50 |
| Relatórios | `Relatorios.js` | 1.103 | 35 | 48 | 10 |
| CRM | `CRM.js` | 1.305 | 158 | 120 | 16 |
| Assinatura | `assinatura/*` | 1.494 | 1 | 0 | 0 |
| Agendamento (aluno) | `pages/Agendamento.js` | 1.375 | 160 | 177 | 19 |
| Autocadastro | `pages/Autocadastro.js` | 267 | 15 | 0 | 0 |
| Portal | `PortalCliente.js`, `PortalAcesso.js` | 2.280 | 400 | 407 | 20 |
| Pagamento | `pages/PaginaPagamento.js` | 332 | 35 | 9 | 1 |
| Contrato | `pages/PaginaContrato.js` | 272 | 34 | 37 | 2 |

Assinatura e Autocadastro são as telas mais perto do DS. Configuração, Financeiro, Clientes, WhatsApp, Portal e Agendamento são as mais distantes.

Cores mais repetidas fora da paleta: `#e5e7eb` (286x), `#16a34a` (168x), `#6b7280` (164x), `#1a1a1a` (130x), `#d1d5db`, `#9ca3af`, `#f3f4f6`, `#dc2626`, `#ef4444`, `#374151`, `#22c55e`. Os cinzas são os do Tailwind, e o DS usa Slate. A marca #4CAF50 aparece 116x; o verde que mais aparece é o `#16a34a`, que não é a marca.

### 2.2 Padrões que o DS NÃO tem

| # | Padrão | Onde aparece (peso) | Situação |
| --- | --- | --- | --- |
| 1 | **Toast** | `src/Toast.js` (usado em 56 arquivos; Financeiro 116 chamadas, Configuração 110, Clientes 69, Agenda 67). Tem a página `PaginaToast.js`, mas o componente fica fora do DS, com hex (`Toast.js:40-70`), `zIndex: 10001` e `isMobile` embutido. | Falta mover para `components/` com tokens |
| 2 | **Skeleton** | `src/components/Skeleton.js` em 16 arquivos (35 usos), com `#e0e0e0`/`#f5f5f5` e `<style>` injetado a cada instância (`Skeleton.js:3-17`). O Table tem skeleton interno, mas não há componente solto. | Falta |
| 3 | **Estado de carregando em texto** | "Carregando..." em 56 arquivos (142 ocorrências: SecaoOrganico 14, Dashboard 11, Configuração 8, WhatsApp 6). | Falta padrão de loading de página/seção |
| 4 | **Estado vazio à mão** | "Nenhum/Nenhuma ..." em 72 arquivos (128 ocorrências: RadarEvasao 5, Clientes 5, PortalCliente 4, Home 4, Despesas 4). EmptyState só entrou em 12 arquivos. | DS tem, falta migrar; falta variante inline/compacta de uma linha |
| 5 | **Textarea** | 43 em 28 arquivos (Configuração 8, WhatsApp 5, CRM 3, Clientes 2, LojaEditor, ModalCobranca). O Input não aceita multilinha (`Input.js` sem `textarea`/`rows`). | **Falta** |
| 6 | **Select nativo** | 39 `<select>` em 19 arquivos (Clientes 3, Configuração 4, WhatsApp 4, CRM 2). O DS Select é custom; não há versão nativa leve para celular. | Falta decisão (ver 3.4) |
| 7 | **Seletor de data** | Já existem 4 peças fora do DS: `components/DateField.js`, `DateInput.js`, `DateRangePicker.js`, `AgendaDatePicker.js` (25 usos em 11 arquivos; Clientes 8). Mais 17 `type="date"` nativos em 11 arquivos (Despesas 3, ParcelaForm 2). | **Falta** (consolidar em um DatePicker + DateRangePicker) |
| 8 | **Campo de telefone e país** | `components/PhoneInput.js`, `CountrySelect.js` fora do DS. | Falta |
| 9 | **Tags/chips editáveis** | `components/TagInput.js`, `TagFormModal.js` (Clientes). | Falta (Badge com `onRemove` cobre só a exibição) |
| 10 | **Abas à mão** | Troca de aba escrita com `aba === '...'` em 20 arquivos (98 ocorrências: PortalCliente 11, Configuração 11, Financeiro 10, WhatsApp 9, AdminAssinaturas 8, Relatórios 6). O DS Tabs foi adotado só em 6 arquivos, e não em Home/Config/WhatsApp/Relatórios/Portal. | DS tem; falta variante "abas com rolagem + indicador de mais" para 6+ abas no celular |
| 11 | **Filtros de lista (barra de filtros)** | Financeiro, Clientes, CRM, Despesas, CobrancasAvulsas escrevem cada um a sua: busca + selects + chips + período. | **Falta** `FilterBar`/`Toolbar` |
| 12 | **Paginação** | Lógica de página em 27 arquivos (163 ocorrências: Financeiro 28, Clientes 23, Despesas 19, CobrancasAvulsas 18), cada uma com seu "Anterior/Próxima". | **Falta** `Pagination` |
| 13 | **Upload de foto/arquivo** | `type="file"` em 8 arquivos (Configuração 4, BioEditor 2, Clientes, WhatsApp, LojaProdutoModal, CsvImportModal). Foto do aluno (commit fb0a134) e logo do negócio. | **Falta** `FileUpload`/`AvatarUpload` |
| 14 | **Modal/overlay feito à mão** | `position: 'fixed'` em 49 arquivos (88 ocorrências: Dashboard 9, Financeiro 6, Clientes 5, PortalCliente 4, Agendamento 4, WhatsApp 4). Boa parte são modais e gavetas que não usam o `Modal` do DS (que está em 23 arquivos). | DS tem; falta migrar |
| 15 | **ConfirmModal** | `ConfirmModal.js` na raiz, 31 usos em 18 arquivos (Clientes 4, Financeiro 3, WhatsApp 2, Agenda 4...). | Falta virar `Modal.Confirm` do DS |
| 16 | **Banner / Alert inline** | `WhatsAppDesconectadoBanner.js`, `PlanExpirationBanner.js`, `TrialExpiredModal.js`, 6 usos em Dashboard, mais avisos em Agenda. Cada um com cor própria. | **Falta** `Alert`/`Banner` (info/warning/danger/success, com ação e fechar) |
| 17 | **Cartão de KPI** | StatCard em 7 arquivos; Home (cards de resumo, `Home.css:25,336,561`) e Relatórios ainda têm os seus. | DS tem; falta migrar |
| 18 | **Gráficos** | Relatórios (5) e Home (3) usam gráfico à mão com hex próprio. Sem tokens de cor para série de gráfico. | Falta paleta de gráfico (P2) |
| 19 | **Tabela à mão** | 26 `<table>` em 20 arquivos (Configuração 8, Clientes 3, Financeiro 4). Table do DS em 10 arquivos. | DS tem; falta migrar |
| 20 | **Badge de status à mão** | Pílulas `borderRadius: 999/20` em 34 arquivos (68 ocorrências: RadarEvasao 7, PortalCliente 3, AgendaNovaDia 3, ListaConversas 3). CobrancaStatus tem 0 usos. | DS tem; falta migrar |
| 21 | **Stepper** | WizardStepper só em `Onboarding.js`; `LojaWizard` e `OnboardingGuiado` têm indicador próprio. | DS tem; falta migrar |
| 22 | **Menu lateral / navegação principal** | `Dashboard.js:538-590`: sidebar de 70px com ícones que vira gaveta de 260px no celular, tudo com `style` inline e `isMobile`. Não é componente do DS. | **Falta** `AppShell`/`Sidebar`/`BottomNav` |
| 23 | **Cabeçalho de página** | Cada tela monta o seu título + botão principal; nenhum `PageHeader`. A regra "botão principal sempre no mesmo lugar" não tem componente que a garanta. | **Falta** `PageHeader` |
| 24 | **Barra de progresso, tooltip, accordion, popover, chip de filtro removível** | Barra de progresso em onboarding/limites de plano; tooltip hoje em CSS solto (`.sidebar-tooltip`, `Button.css:66-90` tem um tooltip próprio com `#1f2937`). | Falta (P2) |
| 25 | **Seletor de horário** | TimeInput existe no DS, uso 1 arquivo; Agenda usa o seu. | DS tem; falta migrar |
| 26 | **Páginas públicas do aluno** | Agendamento, Portal, Pagamento e Contrato têm layout de "página solta" (cabeçalho do negócio + cartão central). Sem componente `PublicPage`/`PublicShell` com largura máxima e tema do negócio. | Falta |

---

## 3. O que falta para o celular

O DS já faz a parte de componente, mas não define o chão: breakpoints, z-index e navegação. Estado por item:

| Necessidade | Hoje | Falta |
| --- | --- | --- |
| **Breakpoints** | Cada CSS escreve o seu: `max-width` 768 (17x), 640 (13x), 1024 (9x), 720 (5x), 900 (4x), 560 (3x), 480 (3x), 600, 1080, 1200, 1400. O DS e o hook usam 640 (`useWindowSize.js:50`, `Button.css:238`, `Table.css:196`, `Modal.css:212`); o `index.css:51` e `isSmallScreen` usam 768. | Tokens/convenção única: sugestão 480 (celular pequeno), 640 (celular), 768 (tablet retrato), 1024 (notebook). CSS não aceita `var()` em `@media`, então a saída é documentar e usar só esses valores (ou custom media via PostCSS). `useWindowSize` expõe as mesmas constantes. |
| **Tabela que vira lista de cartões** | **Existe** em `Table` (`mobileCards` padrão true, `Table.css:196-255`). | Só 10 arquivos usam o Table; as 26 `<table>` à mão quebram no celular. Falta: coluna marcada como "título do cartão" (hoje todas as colunas viram par rótulo/valor), coluna "só desktop" e ação de linha (Dropdown) no canto do cartão. |
| **Modal em tela cheia / bottom sheet** | **Existe** abaixo de 640px: folha de baixo com 92dvh, cantos 16px, rodapé com `safe-area` (`Modal.css:212-253`). | (a) `size="fullscreen"` no celular não ocupa a tela (`Modal.css:223` o trata como os outros; fica 92dvh). (b) Sem alça/arrastar para fechar. (c) `Modal.css:45,63` ainda usa `100vh` no desktop/aside; `Modal.css:57` `95vh`. (d) Select/Dropdown abrem como balão pequeno; falta versão "folha de baixo" para listas longas no celular. |
| **Área de toque 44px** | Button md 44 e sm 40 em ≤640px (`Button.css:238-241`); Input/Select 44px (`Input.css:266-277`, `Select.css:388-393`). | Ficam abaixo de 44px: Button `xs` 24 e `iconOnly` sm 32; **Checkbox e Radio com controle de 18px** (`Checkbox.css:37-38`, `Radio.css:37-38`); **Switch md 36x20** (`Switch.css:64`); item do Dropdown ~34px (`Dropdown.css:41`, padding 8px 10px); item de Tabs underline ~38px (`Tabs.css:36`) e `sm` ~30px (`Tabs.css:169`); botão fechar do Modal; `Badge onRemove`; Avatar clicável xs/sm. Regra: caixa de toque de 44px com `::before` expandido ou `min-height` na `label`, sem aumentar o desenho. |
| **Menu: sidebar para menu inferior/gaveta** | Só dentro do `Dashboard.js:250-590`, escrito à mão com `isMobile`; gaveta de 260px, botão hambúrguer, busca em tela cheia com `zIndex: 10000` (`Dashboard.js:377-381`). | Componente `AppShell` (sidebar compacta no desktop, gaveta no celular, opcional barra inferior com 4-5 destinos). Hoje o gestor no celular precisa abrir a gaveta para qualquer troca de tela. Decisão do dono: manter gaveta ou adotar menu inferior (não muda a função de lugar). |
| **Inputs sem zoom no iOS** | Input e Select do DS: 16px ≤640px (`Input.css:266-273`, `Select.css:388-392`). Regra global de segurança em `src/index.css:51-66` com `!important` para 768. | Está resolvido para o DS e para campos antigos, mas por `!important` global. Falta: TimeInput (`TimeInput.js:188-226` usa fontes inline de 12-14px), Textarea (não existe) e campos que estão em `<select>` nativo com fonte inline. Ao migrar, tirar o `!important` e deixar só o do DS. |
| **safe-area** | `viewport-fit=cover` em `public/index.html:6`. Só o Modal usa `env(safe-area-inset-bottom)` (`Modal.css:248`). 5 usos fora do DS. | Tokens `--safe-top/--safe-bottom` (`env()`); aplicar em Toast (`top: 64px` fixo, `Toast.js`), barra inferior, FAB, rodapé fixo de formulário, gaveta lateral (`Modal` aside e sidebar, que ignora o recorte lateral do iPhone em paisagem). |
| **Altura de viewport** | `dvh` só no Modal (`Modal.css:236`). 88 usos de `100vh`/`dvh` fora do DS. | Token/utilitário `--vh-full: 100dvh` com fallback `100vh`; trocar nas telas. |
| **Largura fixa em pixel** | Não é do DS, mas é o que quebra: `Dashboard.js:538` (gaveta `260px`), `Toast.js` (`maxWidth: 400px`), Card sem `min-width: 0`. | Em `Table`, Card, Select (`max-height: 320px`) conferir `min-width: 0` e `max-width: 100%`; criar classe/componente `Stack`/`Grid` responsivos (`auto-fit, minmax(...)`) para não repetir `grid-template-columns: repeat(5, 1fr)` como em `Home.css:336,561`. |
| **Rolagem horizontal de abas e chips** | Tabs underline rola (`Tabs.css:29`) sem indicador de que há mais. | Fade nas bordas ou setas; centralizar a aba ativa ao trocar. |
| **Dropdown no celular** | `Dropdown.js` posiciona em portal e vira para cima; sem tratamento ≤640px. | Virar folha de baixo ou ocupar a largura com margem de 16px; hoje pode vazar à direita em celular de 360px (`min-width: 200px`, `Dropdown.css:17`). |
| **Teclado do celular** | `Input` aceita `inputMode` (passa por `...rest`, usado em `Autocadastro.js:212`). | Documentar `inputMode`/`autoComplete`/`enterKeyHint` por tipo (telefone, CPF, valor em R$, data) como props prontas: `type="tel"`, `type="money"`, `type="cpf"`. |

---

## 4. Inconsistências dentro do próprio DS

### 4.1 Cor

1. **Contraste do botão primário reprova.** Texto branco (`--color-text-on-brand`, `tokens.css:106`) sobre `--mensalli-green-500` (#4CAF50) dá cerca de **2,8:1** (mínimo AA é 4,5:1 para texto normal, 3:1 para texto grande). Atinge `Button.css:~84-90` (primary), `Badge.css:91-94` (solid primary) e `Badge.css:96-98` (solid success, mesma cor). Também: branco sobre `--warning-500` (#FF9800) cerca de 2,2:1 (`Badge.css:101-103`), sobre `--info-500` cerca de 3,1:1 (`Badge.css:111-113`), sobre `--whatsapp-500` (#25D366) cerca de 2,0:1 (`Button.css:164-166`). Saídas possíveis (decisão do dono, porque envolve a marca): texto escuro `--neutral-900` sobre o verde (cerca de 6,4:1) mantendo #4CAF50; ou fundo `--mensalli-green-700/800` com texto branco (4,1:1 e 5,1:1) mantendo #4CAF50 só para ícones, bordas e destaques.
2. **Hex cravado em componente:** `Button.css:147` (`#FCA5A5`), `:160` (`#FCD0CD`), `:196` (`#FEE2E2`), `:205` (`#FFE0B2`), `:214` (`#BBDEFB`); `Avatar.css:44-46` (roxo/rosa/ciano `#F3E8FF #6B21A8 #FFE4E6 #BE123C #CFFAFE #155E75`, fora da paleta; as palettes 0-4 usam token); `TimeInput.js:188-224` (`#fff`, `#e2e8f0`, `#94a3b8`, `#f1f5f9`, `#0f172a`, `#475569`, `#f8fafc`, tudo com `style` inline); `Modal.css:11` (`rgba(15,23,42,.5)`); `Badge.css:178,182` e `Tabs.css:111` (rgba solto). Para os tons "hover claro" faltam tokens `--danger-100`, `--warning-100`, `--info-100` (a escala semântica só tem 50/500/700).
3. **Cor de anel de foco repetida à mão:** `rgba(244, 67, 54, …)` em `Button.css:140,153,161`, `Input.css:56`, `Select.css:86`, `Checkbox.css:87`, `Radio.css:87`; `rgba(37,211,102,…)` em `Button.css:169`. Falta `--focus-ring` e `--focus-ring-danger`. Há 3 valores de alfa para o mesmo anel (0.15 e 0.25).
4. **Tokens duplicados:** `--success-50/500/700` (`tokens.css:67-69`) são idênticos a `--mensalli-green-50/500/700`; `--color-brand` = `--mensalli-green-500`. Mantém duas formas de pedir a mesma cor (Badge `primary` e `success` ficam visualmente iguais, `Badge.css:51-54` vs `:56-59` difere só em 100/800 vs 50/700). Decidir: `success` é um alias do verde da marca ou uma cor própria.
5. **Aliases semânticos incompletos** (`tokens.css:91-106`): existe `--color-text-*`, `--color-border-*`, `--color-bg-*`, mas não `--color-success/warning/danger/info`, `--color-focus`, `--color-overlay`, `--color-disabled`. Os componentes usam `var(--danger-700)` direto, misturando token primitivo e semântico no mesmo arquivo.
6. **Texto principal diferente do que o sistema usa.** `--color-text-primary` é `--neutral-800` (#1E293B), mas o código das telas tem `#1a1a1a` (130x) e `#344848` (282x, a cor complementar da marca) como texto. A cinza do DS é Slate; a das telas, Tailwind gray (`#e5e7eb` 286x, `#6b7280` 164x). Migrar tela por tela vai mudar o tom do cinza visivelmente; combinar com o dono se as telas ganham o Slate ou se o DS passa a ser neutro-gray.
7. **Cor de marca divergente:** tokens estão corretos (500 = #4CAF50). Mas o `#16a34a` (168x) e `#22c55e` (64x) nas telas são outros verdes; o `PaginaToast.js` e o `Toast.js:40-70` usam `#4CAF50` e `#f44336` em hex em vez de token.
8. **Comentário desatualizado:** `tokens.css:3-6` ("Nenhum componente existente é forçado a adotar agora") e `:14`/`:31`/`:114` (contagens de ocorrências de 2026 antes da repaginada). `PaginaCores.js:443-443` repete o discurso de "adoção gradual". Passam a ser mentira quando a repaginada começar.

### 4.2 Escala de espaço, raio e tipografia

9. **Quase-duplicados:** `--space-2-5` (10px) e `--space-3-5` (14px) existem só porque o código antigo usava (`tokens.css:216,218`, comentário "desencorajado"); `--radius-md` 6px ao lado de `--radius-lg` 8px (`tokens.css:230-231`, comentário "vai migrar", 271 usos). Os componentes ainda usam os dois: `Tabs.css:36` (`10px 14px`), `Dropdown.css:41` (`8px 10px`), `Tabs.css:73` (`6px 12px`) com **px cravado em vez de `var(--space-*)`**.
10. **Tamanhos de fonte sem token.** 12 valores soltos nos CSS: 10px (`Badge.css:28`, `Dropdown.css:107`, `Avatar.css:26`), 11, 12, 13, 14, 15 (`Tabs.css:176`), 16. Só as classes `.ds-text-*` formam escala, mas componentes não as usam; cada um cravou o `font-size`. Total de `font-size: Npx` cravado nos 16 CSS: Select 11, Input 10, Tabs 8, Table 7, Avatar 6, StatCard 5, EmptyState 5, WizardStepper 5. A base do app é 13px (`index.css:30`) contra 14px de `.ds-text-body` (`tokens.css:169`) e 14px dos campos (`Input.css:84`); labels do Input em 13px (`Input.css:18`). Dois "corpos" competem.
11. **Textos de 10px e 11px** (`Badge.css:28` size xs, `Dropdown.css:107`, `Table.css` rótulo de cartão 11px, eyebrow 11px) ficam abaixo do mínimo legível no celular (recomendado 12px).
12. **Peso inconsistente:** `.ds-text-h4` 600 e h1-h3 700, `caption` 500, `eyebrow` 600; Tabs 600 (`Tabs.css:37`), Badge/Button conforme o arquivo. Sem token de peso (400/500/600/700).

### 4.3 z-index, camadas e portais

13. **Escala de z-index quebrada.** `Dropdown.css:16` 100 (mas o JS sobrepõe com 1000 em `Dropdown.js:136`); `Select.css:223` 100 (e `Select.js:364` 10100 quando em portal); `Modal.css:16` 1000; `Toast.js:59` 10001; `Dashboard.js:381` 10000. Resultados: **Select aberto (10100) cobre o Toast (10001)**; Dropdown (1000) empata com o Modal (1000) e só funciona pela ordem no DOM. Fora do DS há 26 `10000`, 25 `1000`, 9 `10001`, 6 `1001`, 4 `2000`. Falta token: `--z-dropdown`, `--z-sticky`, `--z-modal`, `--z-popover`, `--z-toast`.

### 4.4 Nomes e estrutura

14. **Prefixos de token sem regra:** `--mensalli-green-*`, `--mensalli-dark-*` (marca), `--neutral-*`, `--success-*`/`--danger-*` (sem prefixo `color-`), `--whatsapp-*` e `--color-*` (alias). Em `tokens.css:91` o prefixo `color-` só existe para aliases. Convenção sugerida: primitivos sem `color-` e todos os semânticos `--color-*`.
15. **Nomes de componente e arquivo mistos:** componentes em inglês (`Button`, `Modal`), domínio em português (`ClienteIdentity`, `CobrancaStatus`, `PlanoCard`), props em português no domínio (`diasAtraso`, `diasParaVencer`) e inglês no resto (`loading`, `disabled`). Variantes: `danger-outline`/`danger-soft` (hífen) vs `selectedTone`; `Select` aceita `multiple`, `Table` aceita `mobileCards` (inglês + inglês misturado).
16. **Dois nomes para a mesma coisa nas telas e no DS:** Button `variant="outline"` (DS) vs "Cancelar/Voltar"; no DS `EmptyState variant="no-results"` mas a tela diz "Nenhum aluno"/"Nenhum cliente" (aluno vs cliente). Os componentes de domínio se chamam `ClienteIdentity`/`cliente` enquanto Clientes.js trata como "aluno" em parte do texto. Definir o termo canônico antes de migrar.
17. **`transition: all`** em `WizardStepper.css:110`, contra a regra do próprio `tokens.css:315-316` ("use estas em vez de transition: all").
18. **Docs fora do mesmo sistema:** `PaginaToast.js:35` (e outras `Pagina*.js`) cravam hex e `fontSize` inline (`Selo`). A documentação viva é a fonte da verdade e não segue a si mesma. Baixo impacto.
19. **`DSLayout.js:12-55`: todas as 24 páginas estão com `estado: 'em-revisao'`.** Nenhum componente consta como aprovado; combinar o que significa "aprovado" (a lista P0 abaixo).
20. **Componentes de domínio sem uso (0 importações):** `ClienteIdentity`, `CobrancaStatus` (e o Avatar/AvatarGroup quase). Ou são abandonados ou as telas ainda não migraram; o risco é o DS descrever regras de negócio (como `CobrancaStatus` calcula "Atrasado N dias") que as telas fazem diferente.

---

## 5. Lista priorizada (fazer no DS antes de migrar telas)

Esforço: P = até 2h, M = 2h a 1 dia, G = mais de 1 dia. Os P0 são o que, sem ele, a migração de uma tela já nasce errada no celular ou obriga a refazer depois.

### P0 — antes de migrar qualquer tela

| # | Item | Esforço | Por que é P0 |
| --- | --- | --- | --- |
| P0-1 | **Tokens que faltam:** z-index (`--z-*`), breakpoints (documentados + constantes no `useWindowSize`), `--focus-ring`, `--safe-top/bottom`, escala de fonte (`--text-xs..2xl`) e peso, `--touch-min: 44px`, `--danger-100/warning-100/info-100` | M (3 a 4h) | Todo componente novo e toda tela migrada vai consumir esses tokens. Sem eles, cada migração cria mais valor fixo. Itens 3, 9, 10, 13 da seção 4. |
| P0-2 | **Contraste do verde da marca** (decisão do dono entre texto escuro no verde ou fundo mais escuro): Button primary, Badge solid, Switch/Checkbox marcados | P (1 a 2h depois da decisão) | Botão principal do sistema reprova no mínimo de acessibilidade (2,8:1). Se mudar depois de migrar as telas, muda o visual de todas de novo. |
| P0-3 | **Camadas e portais:** alinhar `Select`, `Dropdown`, `Modal`, `Toast` e o `Dashboard` na escala `--z-*` (Select 10100 acima do Toast 10001 hoje) | P (1h) | Bug real com Select dentro de Modal e Toast sobre Select. Depende de P0-1. |
| P0-4 | **Toast e Skeleton** movidos para `design-system/components/` com tokens, `--safe-top` e dismiss acessível (`role="status"`/`aria-live`); `Toast.js` e `Skeleton.js` antigos viram re-export | M (3 a 4h) | Usados em 56 e 16 arquivos; se as telas forem migradas apontando para o arquivo antigo, vira retrabalho. Hoje `Skeleton` injeta `<style>` a cada instância. |
| P0-5 | **Textarea** (`Input multiline` ou `Textarea`) e **Select nativo/`NativeSelect`** leve para celular | M (3h) | 43 textarea em 28 arquivos e 39 select nativos em 19; Configuração, WhatsApp e CRM não migram sem. Reaproveita o 16px/44px do Input. |
| P0-6 | **Área de toque de 44px** em Checkbox, Radio, Switch, item de Dropdown, item de Tabs e `iconOnly` ≤640px (caixa de toque expandida sem mudar o desenho) | M (3 a 4h) | Regra de acessibilidade do projeto e causa direta de "não consigo tocar" no celular; muda o CSS de 6 componentes, melhor antes de espalhar. |
| P0-7 | **Navegação de celular (`AppShell`/`Sidebar` + gaveta/menu inferior)**, extraída do `Dashboard.js:250-590` | G (1 a 2 dias) | Toda tela do gestor vive dentro dele; é o que decide se o celular é utilizável. O dono decide gaveta x menu inferior. Pode começar com extração fiel (sem mudar função de lugar) e evoluir. |

Total estimado P0: cerca de 3 a 4 dias de trabalho de um dev.

### P1 — junto com a primeira onda de telas (Clientes, Financeiro, Configuração, WhatsApp)

| # | Item | Esforço | Por que |
| --- | --- | --- | --- |
| P1-1 | **PageHeader** (título + ação principal sempre no mesmo lugar + voltar) | M (3h) | Resolve "botão principal sempre no mesmo lugar" nas 9 telas do gestor. |
| P1-2 | **FilterBar/Toolbar** (busca + filtros + chips + "limpar", colapsa em celular) | M (4 a 6h) | Padrão repetido em Financeiro, Clientes, CRM, Despesas e CobrancasAvulsas; está entre as quebras mais comuns no celular. |
| P1-3 | **Pagination** (e "carregar mais") | P (2h) | 27 arquivos com lógica própria; aparece em toda lista. |
| P1-4 | **Alert/Banner** (info, warning, danger, success, com ação e fechar) | P (2h) | 6 banners soltos no Dashboard, WhatsApp desconectado, plano vencendo, trial. Já é sobre dinheiro e conexão. |
| P1-5 | **Modal.Confirm** (substitui `ConfirmModal.js`, 31 usos) + `fullscreen` de verdade no celular + alça de arrastar | M (3h) | 23 arquivos já usam Modal; o `fullscreen` hoje é 92dvh no celular (`Modal.css:223`). |
| P1-6 | **DatePicker/DateRangePicker** unificando `DateField`, `DateInput`, `DateRangePicker`, `AgendaDatePicker` e `type="date"` | G (1 dia) | 4 peças fora do DS + 17 `type="date"`; formulário de cobrança, Despesas e Agenda dependem. |
| P1-7 | **FileUpload/AvatarUpload** (foto do aluno, logo, CSV) com redução no navegador (já feita no commit fb0a134) | M (3 a 4h) | 8 arquivos com `type="file"`; foto é o ponto que quebrou recentemente. |
| P1-8 | **Table**: coluna "título do cartão" e coluna "só desktop"; ação de linha no cartão | M (3h) | 26 `<table>` à mão para migrar; sem isso o cartão fica longo e sem hierarquia. |
| P1-9 | **Dropdown/Select no celular** como folha de baixo e `min-width` corrigido | M (3h) | Menus de ação por linha são comuns em Clientes e Financeiro. |
| P1-10 | **Corrigir os hex dentro dos componentes** (Button, Avatar, TimeInput, Modal) para tokens; `TimeInput` com classe CSS e 16px | P (1 a 2h) | Faz o DS cumprir o que cobra das telas. Fecha 4.1 item 2. |
| P1-11 | **Resolver duplicidades** (`success` x `green`, `space-2-5/3-5`, `radius-md`): decidir e migrar os componentes | P (1h de decisão, 1h de ajuste) | Fecha 4.1 item 4 e 4.2 item 9. |
| P1-12 | **Glossário de texto** (aluno ou cliente, mensalidade ou parcela, cobrança) e aplicar nos componentes de domínio | P (1h + dono) | Evita que o DS fixe nomes que o dono ainda vai trocar (item 16 da seção 4). |

### P2 — depois da onda principal

| # | Item | Esforço |
| --- | --- | --- |
| P2-1 | `PhoneInput`/`CountrySelect` e `TagInput` dentro do DS | M |
| P2-2 | `PublicPage`/`PublicShell` para Agendamento, Portal, Pagamento, Contrato e Autocadastro (largura máxima, cabeçalho do negócio, rodapé "Feito com Mensalli") | M |
| P2-3 | Paleta e componentes de gráfico (Relatórios e Home) | M |
| P2-4 | `ProgressBar`, `Tooltip`, `Accordion`, `Popover` | M |
| P2-5 | Tabs: fade/seta nas bordas e aba ativa centralizada | P |
| P2-6 | Utilitários `Stack`, `Grid` responsivo (`auto-fit/minmax`) e `Container` | P |
| P2-7 | Remover o `!important` global do `index.css:51-66` quando o último campo antigo migrar | P |
| P2-8 | Atualizar `DSLayout.js` (estado "aprovado" por componente), comentários de `tokens.css` e as páginas `Pagina*.js` para não usarem hex | P |
| P2-9 | Decidir o destino de `ClienteIdentity`, `CobrancaStatus`, `AvatarGroup`, `RadioGroup`, `PasswordInput` (0 usos): migrar as telas para eles ou tirar do DS | P |

### Ordem sugerida

P0-1, P0-2 e P0-3 no mesmo dia (tokens, contraste e z-index mudam os mesmos arquivos). P0-4, P0-5 e P0-6 em seguida, em paralelo. P0-7 (menu de celular) em paralelo com o início da migração de Home/Relatórios, que são as telas mais simples e menos arriscadas. P1 vai entrando conforme a tela da vez precisar: Clientes e Financeiro puxam P1-1, P1-2, P1-3, P1-8; Configuração e WhatsApp puxam P0-5, P1-4, P1-5, P1-7.

### O que não foi coberto

Revisão só pelo código: nenhuma tela foi aberta no navegador, então tamanho real de toque, rolagem horizontal e contraste foram calculados a partir do CSS, não medidos na tela. As contagens de `<button>`/`<input>` fora do DS incluem usos dentro de componentes de admin (`/admin`), que o escopo desta rodada não cobre; as tabelas por tela da seção 2.1 só contam os arquivos do gestor e do aluno.
