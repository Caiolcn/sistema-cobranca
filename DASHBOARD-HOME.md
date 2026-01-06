# Dashboard Home - Documentação

## 📊 Visão Geral

A tela **Home** é a nova página inicial do sistema de cobrança, oferecendo uma visão completa e em tempo real de todas as métricas importantes do negócio.

## 🎯 Funcionalidades Implementadas

### 1. **Header de Boas-vindas**
- Saudação personalizada (Bom dia/Boa tarde/Boa noite)
- Nome da empresa/usuário exibido
- Design moderno e acolhedor

### 2. **Filtro de Período Inteligente**
Localizado no header, permite análise de diferentes períodos:

- **Mês Atual** (padrão)
- **Mês Anterior**
- **Últimos 30 Dias**
- **Últimos 90 Dias**
- **Período Personalizado** (com seleção de data início/fim)

Todos os indicadores são recalculados automaticamente ao mudar o período.

### 3. **Cards de Indicadores Principais**

#### 🎨 6 Cards Coloridos:

1. **Total de Clientes** (Azul)
   - Ícone: Grupo de pessoas
   - Mostra quantidade total de clientes cadastrados

2. **Cobranças Ativas** (Laranja)
   - Ícone: Recibo
   - Mostra parcelas pendentes + atrasadas

3. **Total a Receber** (Roxo)
   - Ícone: Pagamentos
   - Valor total de parcelas pendentes no período selecionado
   - Formato: R$ X.XXX,XX

4. **Total Recebido** (Verde)
   - Ícone: Check Circle
   - Valor total de parcelas pagas no período selecionado
   - Formato: R$ X.XXX,XX

5. **Mensagens Enviadas** (Ciano)
   - Ícone: Email
   - Quantidade de mensagens WhatsApp enviadas no período

6. **Taxa de Inadimplência** (Vermelho)
   - Ícone: Alerta
   - Percentual de parcelas atrasadas vs total vencidas
   - Formato: XX.X%

#### 📌 2 Cards Secundários:

1. **Clientes Inadimplentes**
   - Quantidade de clientes com pelo menos 1 parcela atrasada

2. **Maior Débito em Aberto**
   - Valor do maior débito individual
   - Útil para priorização de cobranças

### 4. **Gráfico de Recebimentos (Últimos 7 Dias)**

- **Tipo**: Gráfico de barras vertical
- **Dados**: Valores recebidos por dia
- **Período**: Últimos 7 dias (rolante)
- **Interatividade**:
  - Hover mostra valor exato
  - Barras com gradiente roxo
  - Animação suave
- **Formato**: DD/MM por dia

**Funcionalidade:**
- Permite visualizar tendência de recebimentos
- Identifica dias com maior/menor movimento
- Ajuda no planejamento financeiro

### 5. **Fila de WhatsApp** 📱

**Descrição:**
Lista das próximas mensagens que serão enviadas pelo sistema de automação.

**Critérios de Exibição:**
- Parcelas com status "pendente"
- Data de vencimento <= hoje
- Flag `enviado_hoje` = false
- Ordenação por data de vencimento (mais antiga primeiro)
- Limite: 10 primeiras mensagens

**Informações Exibidas:**
- Nome do cliente
- Telefone
- Valor da parcela
- Dias de atraso (badge vermelho)
- Ícone de agendamento (verde WhatsApp)

**Badge de Contador:**
- Mostra quantidade de mensagens na fila
- Atualiza em tempo real

**Empty State:**
- Ícone de check verde
- Mensagem: "Nenhuma mensagem pendente!"

### 6. **Mensagens Recentes** 📨

**Descrição:**
Histórico das últimas mensagens enviadas pelo sistema.

**Fonte de Dados:**
- Tabela `logs_mensagens`
- Ordenação por data/hora decrescente
- Limite: 8 últimas mensagens

**Informações Exibidas:**
- Status (enviado ✅ / falha ❌)
- Nome do cliente
- Telefone
- Valor da parcela
- Data e hora do envio (DD/MM HH:MM)

**Indicadores Visuais:**
- Badge verde: Mensagem enviada com sucesso
- Badge vermelho: Falha no envio

**Empty State:**
- Ícone de inbox
- Mensagem: "Nenhuma mensagem enviada ainda"

## 🎨 Design e UX

### Paleta de Cores

| Elemento | Cor Principal | Gradiente |
|----------|---------------|-----------|
| Clientes | #2196F3 (Azul) | #1976D2 |
| Cobranças | #ff9800 (Laranja) | #f57c00 |
| A Receber | #9C27B0 (Roxo) | #7B1FA2 |
| Recebido | #4CAF50 (Verde) | #388E3C |
| Mensagens | #00BCD4 (Ciano) | #0097A7 |
| Inadimplência | #f44336 (Vermelho) | #d32f2f |
| Gráficos | #8867A1 (Roxo) | #6a4d82 |
| Fila WhatsApp | #25D366 (Verde WhatsApp) | #128C7E |

### Animações e Interações

✨ **Efeitos Implementados:**
- Cards com hover elevado (translateY -2px)
- Sombras suaves que intensificam no hover
- Transições suaves em todos os elementos
- Barras do gráfico com animação de crescimento
- Bordas esquerdas coloridas nos cards
- Gradientes nos ícones

### Responsividade

📱 **Breakpoints:**

- **Desktop (> 1200px)**: Layout completo em 2 colunas
- **Tablet (768px - 1200px)**: Grid adaptado, colunas empilham
- **Mobile (< 768px)**: Layout em coluna única
- **Small Mobile (< 480px)**: Tamanhos reduzidos, padding compacto

**Adaptações Mobile:**
- Header empilhado verticalmente
- Filtros em coluna
- Cards em lista vertical
- Gráfico mantém proporção
- Fontes reduzidas proporcionalmente

## 🔄 Fluxo de Dados

### Carregamento Inicial

```javascript
1. Usuário faz login
2. Dashboard renderiza
3. Home é a tela padrão (telaAtiva = 'home')
4. useEffect dispara carregarDados()
5. Busca informações do usuário
6. Carrega todos os indicadores em paralelo
7. Renderiza componentes
```

### Atualização por Filtro

```javascript
1. Usuário seleciona novo período
2. useEffect detecta mudança
3. Recalcula datas de início/fim
4. Recarrega apenas dados afetados:
   - Total a Receber (filtrado)
   - Total Recebido (filtrado)
   - Mensagens Enviadas (filtrado)
5. Dados globais não mudam:
   - Total de Clientes
   - Cobranças Ativas
   - Taxa de Inadimplência
```

## 📋 Queries Utilizadas

### Total de Clientes
```sql
SELECT COUNT(*)
FROM devedores
WHERE user_id = auth.uid()
```

### Cobranças Ativas
```sql
SELECT COUNT(*)
FROM parcelas
WHERE user_id = auth.uid()
  AND status IN ('pendente', 'atrasado')
```

### Total a Receber (Período)
```sql
SELECT SUM(valor)
FROM parcelas
WHERE user_id = auth.uid()
  AND status IN ('pendente', 'atrasado')
  AND data_vencimento BETWEEN :inicio AND :fim
```

### Total Recebido (Período)
```sql
SELECT SUM(valor)
FROM parcelas
WHERE user_id = auth.uid()
  AND status = 'pago'
  AND updated_at BETWEEN :inicio AND :fim
```

### Mensagens Enviadas (Período)
```sql
SELECT COUNT(*)
FROM logs_mensagens
WHERE user_id = auth.uid()
  AND enviado_em BETWEEN :inicio AND :fim
```

### Taxa de Inadimplência
```sql
-- Total vencidas
SELECT COUNT(*)
FROM parcelas
WHERE user_id = auth.uid()
  AND data_vencimento <= CURRENT_DATE

-- Atrasadas
SELECT COUNT(*)
FROM parcelas
WHERE user_id = auth.uid()
  AND status IN ('pendente', 'atrasado')
  AND data_vencimento < CURRENT_DATE

-- Taxa = (atrasadas / total_vencidas) * 100
```

### Clientes Inadimplentes
```sql
SELECT COUNT(DISTINCT devedor_id)
FROM parcelas
WHERE user_id = auth.uid()
  AND status = 'pendente'
  AND data_vencimento < CURRENT_DATE
```

### Maior Débito em Aberto
```sql
-- Para cada devedor
SELECT devedor_id, SUM(valor) as total
FROM parcelas
WHERE user_id = auth.uid()
  AND status IN ('pendente', 'atrasado')
GROUP BY devedor_id
ORDER BY total DESC
LIMIT 1
```

### Fila WhatsApp
```sql
SELECT p.*, d.nome, d.telefone
FROM parcelas p
JOIN devedores d ON p.devedor_id = d.id
WHERE p.user_id = auth.uid()
  AND p.status = 'pendente'
  AND p.enviado_hoje = false
  AND p.data_vencimento <= CURRENT_DATE
ORDER BY p.data_vencimento ASC
LIMIT 10
```

### Mensagens Recentes
```sql
SELECT l.*, d.nome
FROM logs_mensagens l
JOIN devedores d ON l.devedor_id = d.id
WHERE l.user_id = auth.uid()
ORDER BY l.enviado_em DESC
LIMIT 8
```

### Gráfico 7 Dias
```sql
-- Para cada dia (loop frontend)
SELECT SUM(valor)
FROM parcelas
WHERE user_id = auth.uid()
  AND status = 'pago'
  AND updated_at BETWEEN :data_inicio_dia AND :data_fim_dia
```

## 🚀 Navegação

### Menu Lateral Atualizado

**Ordem (de cima para baixo):**

1. 🏠 **Home** (Nova!)
   - Ícone: `material-symbols-light:home-outline-rounded`
   - Tela padrão ao abrir o sistema

2. 🧾 **Financeiro**
   - Ícone: `fluent:receipt-20-regular`
   - Gestão de parcelas

3. 👥 **Clientes**
   - Ícone: `fluent:people-24-regular`
   - Gestão de clientes

4. 💬 **WhatsApp Conexão**
   - Ícone: `mdi:whatsapp`
   - Configuração WhatsApp

---

5. 👤 **Perfil** (após divisória)
6. 🚪 **Sair**

### Comportamento Padrão

```javascript
// Estado inicial do Dashboard
const [telaAtiva, setTelaAtiva] = useState('home')
```

Ao fazer login, usuário cai automaticamente na tela Home.

## 🛠️ Arquivos Criados/Modificados

### Novos Arquivos

1. **`src/Home.js`** (508 linhas)
   - Componente principal da Dashboard
   - Lógica de carregamento de dados
   - Controle de filtros
   - Renderização de todos os indicadores

2. **`src/Home.css`** (578 linhas)
   - Estilos completos da Dashboard
   - Design responsivo
   - Animações e transições
   - Paleta de cores personalizada

### Arquivos Modificados

1. **`src/Dashboard.js`**
   - Importação do componente Home
   - Estado inicial alterado para 'home'
   - Novo botão no menu lateral (Home)
   - Renderização condicional atualizada

## 💡 Benefícios da Implementação

### Para o Usuário

✅ **Visão Centralizada**
- Todas as informações críticas em um só lugar
- Não precisa navegar entre telas para entender o status

✅ **Análise Temporal**
- Filtros flexíveis permitem análise de diferentes períodos
- Identificação rápida de tendências

✅ **Ação Imediata**
- Fila de WhatsApp mostra exatamente o que será enviado
- Priorização de cobranças baseada em dados reais

✅ **Transparência**
- Histórico de mensagens rastreável
- Taxa de inadimplência calculada automaticamente

### Para o Negócio

📈 **Tomada de Decisão**
- Métricas em tempo real
- Identificação de problemas (alta inadimplência)
- Oportunidades (clientes para contato)

💰 **Controle Financeiro**
- Valores a receber vs recebidos
- Maior débito em destaque
- Gráfico de tendência

🎯 **Eficiência Operacional**
- Menos cliques para acessar informações
- Interface intuitiva
- Automação visível (fila de envio)

## 🔮 Melhorias Futuras Sugeridas

### Curto Prazo

1. **Indicadores Adicionais**
   - Ticket médio
   - Tempo médio de pagamento
   - Taxa de conversão (enviado → pago)

2. **Interatividade**
   - Clicar em card para filtrar
   - Exportar dados (PDF/Excel)
   - Notificações push

3. **Gráficos Avançados**
   - Gráfico de pizza (status das parcelas)
   - Linha do tempo de recebimentos
   - Comparativo mês a mês

### Médio Prazo

4. **Personalização**
   - Escolher quais cards exibir
   - Reordenar elementos
   - Temas de cor

5. **Previsões**
   - Previsão de recebimentos
   - Alertas de inadimplência crescente
   - Meta vs Realizado

6. **Comparativos**
   - Período atual vs anterior
   - Crescimento percentual
   - Benchmarks

## 📱 Screenshots (Conceitual)

### Desktop
```
┌─────────────────────────────────────────────────────────┐
│ 🏠 Bom dia! 👋                      📅 [Mês Atual ▼]    │
│ Bem-vindo ao Sistema Cobrança                           │
├─────────────────────────────────────────────────────────┤
│ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ │
│ │  👥  │ │  📄  │ │  💳  │ │  ✅  │ │  📧  │ │  ⚠️  │ │
│ │ 150  │ │  42  │ │12.5K │ │ 8.2K │ │ 156  │ │ 15% │ │
│ └──────┘ └──────┘ └──────┘ └──────┘ └──────┘ └──────┘ │
├─────────────────────────────────────────────────────────┤
│ 📊 Recebimentos - Últimos 7 Dias                        │
│ ▂▅▃▇▄▆▅ (gráfico de barras)                            │
├──────────────────────┬──────────────────────────────────┤
│ 💬 Fila WhatsApp     │ 📨 Mensagens Recentes           │
│ ┌─────────────────┐  │ ┌────────────────────────────┐  │
│ │ João - R$ 150   │  │ │ ✅ Maria - R$ 200 10/01    │  │
│ │ Maria - R$ 200  │  │ │ ✅ João - R$ 150 10/01     │  │
│ └─────────────────┘  │ └────────────────────────────┘  │
└──────────────────────┴──────────────────────────────────┘
```

## 🎓 Como Usar

### 1. Acesso
- Faça login no sistema
- Você será direcionado automaticamente para a Home

### 2. Análise de Período
- Clique no seletor de período no header
- Escolha o período desejado
- Observe os cards se atualizarem automaticamente

### 3. Período Personalizado
- Selecione "Período Personalizado"
- Escolha data início e fim
- Clique fora para aplicar

### 4. Fila de WhatsApp
- Veja quais mensagens serão enviadas
- Dias de atraso aparecem em vermelho
- Badge mostra quantidade total

### 5. Mensagens Recentes
- Verifique histórico de envios
- ✅ = Sucesso | ❌ = Falha
- Veja data/hora exata do envio

### 6. Gráfico
- Passe o mouse sobre as barras
- Veja valor exato do dia
- Identifique tendências visuais

## 🔐 Segurança

- Todos os dados filtrados por `user_id`
- RLS ativo em todas as tabelas
- Queries otimizadas com índices
- Nenhum dado exposto sem autenticação

## ⚡ Performance

### Otimizações Implementadas

1. **Queries Paralelas**
   - Múltiplas queries executadas simultaneamente
   - Reduz tempo de carregamento

2. **Índices do Banco**
   - `idx_parcelas_user_id`
   - `idx_parcelas_status`
   - `idx_parcelas_data_vencimento`
   - `idx_logs_mensagens_enviado_em`

3. **Limit nas Queries**
   - Fila WhatsApp: 10 registros
   - Mensagens Recentes: 8 registros
   - Gráfico: 7 dias

4. **useEffect Otimizado**
   - Recarrega apenas quando filtros mudam
   - Evita loops infinitos

## 📞 Suporte

Em caso de dúvidas ou problemas:
1. Verifique se todas as tabelas do banco estão criadas
2. Confirme que RLS está habilitado
3. Teste com dados de exemplo
4. Veja os logs do navegador (F12 → Console)

---

**Criado em:** Janeiro 2026
**Versão:** 1.0.0
**Status:** ✅ Implementado e Funcional
