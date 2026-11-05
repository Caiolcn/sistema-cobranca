# Diagnóstico SEO/GEO do Mensalli — 05/11/2026

**Placar:** o Google conhece no máximo a home; as IAs (ChatGPT, Claude, Perplexity) não conseguem ler nenhuma página do site.

Medido: código do repositório e `curl` no site no ar. Presença no Google foi checada com uma busca dos EUA. Ela serve como sinal, mas não substitui o Search Console. Não medido: posição real no Google Brasil e citações no ChatGPT/Perplexity.

---

## 1. Bloqueios críticos

### 1.1 O site é invisível para robôs que não rodam JavaScript
Todas as URLs devolvem o mesmo HTML de 4.802 bytes com `<div id="root"></div>` vazio:

| URL | Status | Título que o robô vê |
|---|---|---|
| `/` | 200 | Mensalli - Cobre Mensalidades pelo WhatsApp no Automático |
| `/sistema-para-escolinhas` | 200 | (mesmo título da home) |
| `/sistema-para-estudio-pilates` | 200 | (mesmo título da home) |
| `/pagina-que-nao-existe-xyz` | 200 | (mesmo título da home) |
| `/llms.txt` | 200 | (devolve a home) |

GPTBot, ClaudeBot e PerplexityBot não executam JS. Para eles, o Mensalli é só um título e uma meta description. O Google executa JS, mas com atraso e sem garantia. Em todas as URLs o texto inicial é o mesmo.

### 1.2 Canonical fixo na home em todas as páginas
`public/index.html:13` traz `<link rel="canonical" href="https://www.mensalli.com.br">`, e nenhuma landing de nicho sobrescreve isso. As 4 páginas de nicho dizem ao Google "a versão oficial sou a home", então elas não ranqueiam.

### 1.3 Sitemap com 1 URL só
`public/sitemap.xml` lista apenas a home, com `lastmod` de 09/03/2026. As 4 landings de nicho estão fora.

### 1.4 Nota inventada no schema
`public/index.html` declara `aggregateRating` 4.9 com 47 avaliações. A página não mostra essas avaliações em lugar nenhum. O Google considera isso spam de dados estruturados e pode aplicar ação manual. Remover até existirem avaliações reais e públicas.

### 1.5 Soft 404 e páginas de clientes no mesmo domínio
Qualquer URL inventada devolve 200, porque `vercel.json` reescreve tudo para `index.html` e `/:slug` cai na BioAcademia. Isso gera páginas fantasmas e mistura sites de clientes (`/:slug`, `/loja/:slug`) com o site do Mensalli. Falta decidir se as páginas dos clientes devem ou não ser indexadas.

## 2. Correções rápidas (menos de 1 hora cada)

1. Remover `aggregateRating` do JSON-LD e trocar `SoftwareApplication` por algo verdadeiro: `Organization` e `SoftwareApplication` com `offers` dos planos reais.
2. Incluir as 4 landings de nicho e `/privacidade` no `sitemap.xml`, com `lastmod` atual.
3. Fazer cada landing sobrescrever o canonical com a própria URL, no mesmo `useEffect` que já troca o título.
4. Trocar o redirecionamento `mensalli.com.br` → `www` de 307 (temporário) para 308/301 (permanente) no painel de domínios da Vercel.
5. Criar `public/llms.txt` com um resumo em texto do produto, das funcionalidades, dos nichos, dos planos e dos links. É barato e ajuda as IAs.
6. Trocar a `og:image` (hoje é o logo 512×512) por uma imagem 1200×630 com a promessa do produto.
7. No `robots.txt`, bloquear também `/pagar/`, `/portal/`, `/contrato/`, `/ver-como/` e `/preview-recibo`.

## 3. Estrutural (o que destrava de verdade)

**Pré-renderizar as páginas públicas no build.** Dá para fazer sem trocar o app inteiro: um script pós-build abre `/`, `/sistema-para-*` e `/privacidade` num navegador headless, salva o HTML já renderizado em `build/<rota>/index.html` e ajusta o `vercel.json` para servir esse arquivo antes do fallback do SPA. Com isso, título, canonical, H1 e texto chegam no HTML que qualquer robô lê. A área logada continua como está.

A alternativa maior seria migrar as páginas públicas para Next.js/Astro num projeto separado. Isso só vale se o blog for crescer.

## 4. Conteúdo a criar

Nas buscas do nicho, quem aparece hoje são blogs de meios de pagamento (InfinitePay, Asaas) e ferramentas genéricas de WhatsApp. Nenhum sistema específico para escolinha ou pilates aparece, e o Mensalli não aparece nem buscando o próprio nome. O espaço está aberto.

| Página | Busca que ataca | Pergunta de IA que responde |
|---|---|---|
| Modelos de mensagem de cobrança de mensalidade (por nicho) | "mensagem de cobrança mensalidade academia/escolinha" | "como cobrar aluno atrasado sem ser chato?" |
| Como cobrar mensalidade pelo WhatsApp sem ser bloqueado | "cobrar pelo whatsapp", "whatsapp bloqueou" | "posso cobrar cliente pelo WhatsApp?" |
| Sistema para personal trainer cobrar alunos | "app para personal cobrar aluno" | "qual app o personal usa para cobrar?" |
| Sistema para escola de dança / música | "sistema escola de dança mensalidade" | idem por nicho |
| Planilha × sistema para controlar mensalidade | "planilha controle de mensalidades" | "vale a pena sair da planilha?" |
| Comparativos honestos (Mensalli × planilha, × Asaas, × sistema de academia grande) | "alternativa a X" | "qual o melhor sistema para escolinha?" |
| Página de preços clara | "mensalli preço" | "quanto custa o Mensalli?" |

Cada página precisa ter resposta direta no primeiro parágrafo, FAQ com schema `FAQPage`, dados concretos sobre o produto e prova real (depoimentos com nome, como o da Carol).

## 5. O que precisa do dono

- **Google Search Console:** verificar o domínio e mandar o sitemap. Sem isso, não dá para medir posição nem cliques.
- **Google Meu Negócio** da empresa, se fizer sentido para o CNPJ.
- **Avaliações reais e públicas** (Google, Reclame Aqui, diretórios de SaaS) antes de qualquer nota no schema.
- **Presença externa**, que é o que as IAs citam: aparecer em listas de "melhores sistemas para escolinha/pilates", canal do YouTube com os tutoriais (`docs/roteiros-videos-tutoriais.md`) e perfil com descrição consistente em todo lugar.

## Ordem sugerida

1. Correções rápidas 1 a 4: schema, sitemap, canonical e redirecionamento. Meio dia de trabalho.
2. Search Console (dono).
3. Pré-renderização das páginas públicas, junto com o `llms.txt`.
4. Primeiras 3 páginas de conteúdo: modelos de mensagem, personal trainer e preços.
