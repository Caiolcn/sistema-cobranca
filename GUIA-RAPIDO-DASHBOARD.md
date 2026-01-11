# Guia Rápido - Dashboard Aprimorado

## Como Visualizar as Novas Métricas

### 1. Acessar o Dashboard
- Faça login no sistema
- Clique no ícone de **Home** no menu lateral (primeiro ícone)
- Ou navegue para `/home`

### 2. Selecionar Período
No topo da tela, você pode filtrar os dados por período:
- **Hoje**: Apenas dados de hoje
- **Mês Atual**: Do dia 1 até hoje
- **Mês Anterior**: Mês passado completo
- **Últimos 7/30/60/90 dias**: Períodos deslizantes
- **Personalizado**: Escolha datas específicas

> **Dica**: A maioria das métricas respeita o filtro selecionado!

---

## Entendendo Cada Métrica

### 📊 Cards Principais (Primeira Linha)

#### 1️⃣ Total de Clientes
- **O que mostra**: Quantidade total de clientes cadastrados
- **Ação**: Clique em "Ver" para ir à tela de Clientes

#### 2️⃣ Cobranças Ativas
- **O que mostra**: Quantidade de parcelas pendentes ou atrasadas
- **Ação**: Clique em "Ver" para ir ao Financeiro

#### 3️⃣ Total a Receber
- **O que mostra**: Soma de todas as parcelas a receber no período
- **Cor**: Roxo
- **Ação**: Clique em "Ver" para ir ao Financeiro

#### 4️⃣ Total Recebido
- **O que mostra**: Soma de todas as parcelas pagas no período
- **Cor**: Verde
- **Como usar**: Compare com "Total a Receber" para ver eficiência

#### 5️⃣ Mensagens Enviadas
- **O que mostra**: Quantas mensagens de cobrança foram enviadas
- **Ação**: Clique em "Ver" para ver logs de mensagens

---

### 🎯 Cards de Alerta (Segunda Linha)

#### ⚠️ Clientes Inadimplentes
- **O que mostra**: Clientes com parcelas vencidas
- **Use para**: Identificar quem precisa de atenção urgente

#### 📈 Maior Débito em Aberto
- **O que mostra**: O maior valor em aberto de um único cliente
- **Use para**: Priorizar cobranças de alto valor

---

### 💰 Mensalidades e Ticket Médio (Terceira Linha) ⭐ NOVO

#### 📅 Mensalidades Ativas
- **O que mostra**:
  - Número principal: Quantidade de clientes com mensalidade recorrente
  - Texto menor: Receita de mensalidades no período
- **Como funciona**: Conta apenas parcelas marcadas como `is_mensalidade = true`
- **Use para**: Acompanhar sua base recorrente e MRR (Monthly Recurring Revenue)

#### 🎫 Ticket Médio
- **O que mostra**: Valor médio de cada pagamento recebido
- **Cálculo**: Total Recebido ÷ Número de Pagamentos
- **Use para**:
  - Entender o padrão de pagamentos
  - Definir metas de vendas
  - Comparar com períodos anteriores

---

### 📊 Análise e Projeção (Quarta Linha) ⭐ NOVO

#### ✅ Taxa de Recebimento
- **O que mostra**: % do valor esperado que foi recebido
- **Indicadores**:
  - 🟢 **Excelente** (≥80%): Está indo muito bem!
  - 🟡 **Bom** (60-79%): Desempenho aceitável
  - 🔴 **Atenção** (<60%): Precisa melhorar a cobrança
- **Use para**: Avaliar eficiência do processo de cobrança

#### 📈 vs. Mês Anterior
- **O que mostra**: Comparação com o mês passado
- **Elementos**:
  - Percentual de crescimento/queda
  - Valor absoluto da diferença
  - Ícone: Seta para cima (crescimento) ou para baixo (queda)
  - Cor: Verde (positivo) ou Vermelho (negativo)
- **Use para**:
  - Identificar tendências
  - Comemorar conquistas
  - Detectar problemas cedo

#### 💎 Receita Projetada
- **O que mostra**: Recebido + A Receber
- **Cálculo**: Total Recebido + Total a Receber
- **Use para**:
  - Planejar fluxo de caixa
  - Projetar faturamento do mês
  - Tomar decisões de investimento

---

## 📈 Gráficos

### Recebimentos - Últimos 7 Dias
- Mostra evolução diária dos pagamentos
- Passe o mouse sobre as barras para ver valores exatos
- Use para identificar dias com mais/menos recebimentos

---

## 🚀 Ações Rápidas

### Fila de WhatsApp
- Lista próximas cobranças a enviar
- Botões:
  - 💚 **Verde (WhatsApp)**: Envia cobrança imediatamente
  - ❌ **Vermelho (X)**: Cancela o envio
- Mostra dias de atraso em vermelho

### Mensagens Recentes
- Histórico das últimas mensagens enviadas
- Status:
  - ✅ Verde: Enviada com sucesso
  - ❌ Vermelho: Falha no envio

---

## 💡 Dicas de Uso

### Para Controle Diário
1. Use filtro "Hoje"
2. Verifique:
   - Mensagens Enviadas
   - Fila de WhatsApp
   - Total Recebido vs A Receber

### Para Análise Mensal
1. Use filtro "Mês Atual"
2. Foque em:
   - Taxa de Recebimento (deve estar acima de 80%)
   - Comparativo vs Mês Anterior
   - Receita Projetada
   - Mensalidades Ativas (base recorrente)

### Para Planejamento
1. Use filtro "Últimos 30 dias"
2. Analise:
   - Ticket Médio (para precificação)
   - Tendência no gráfico de 7 dias
   - Clientes Inadimplentes (ações necessárias)

---

## ⚙️ Configuração Necessária

### Marcando Parcelas como Mensalidade

Para que a métrica **Mensalidades Ativas** funcione corretamente, você precisa marcar as parcelas recorrentes:

**Opção 1: No Código (Desenvolvedor)**
```javascript
// Ao criar parcela recorrente
await supabase.from('parcelas').insert({
  ...outrosCampos,
  is_mensalidade: true  // ← Marcar como mensalidade
})
```

**Opção 2: Diretamente no Supabase**
1. Acesse seu projeto no Supabase
2. Vá em Table Editor → parcelas
3. Encontre as parcelas recorrentes
4. Marque a coluna `is_mensalidade` como `true`

**Opção 3: SQL em Massa**
```sql
-- Marcar todas as parcelas com descrição "mensalidade"
UPDATE parcelas
SET is_mensalidade = true
WHERE descricao ILIKE '%mensalidade%';

-- Marcar parcelas de clientes específicos
UPDATE parcelas
SET is_mensalidade = true
WHERE devedor_id IN (SELECT id FROM devedores WHERE ...);
```

---

## 🎨 Cores e Significados

| Cor | Significado | Onde Aparece |
|-----|-------------|--------------|
| 🟢 Verde | Positivo, Recebido, Sucesso | Total Recebido, Crescimento |
| 🔴 Vermelho | Negativo, Atrasado, Atenção | Inadimplentes, Queda |
| 🟡 Laranja | Aviso, Em Aberto | Total a Receber, Mensalidades |
| 🔵 Azul | Informação, Clientes | Total Clientes, Comparativo |
| 🟣 Roxo | Financeiro, Receita | Total a Receber, Projeção |

---

## ❓ FAQ - Perguntas Frequentes

**P: Por que "Mensalidades Ativas" está em 0?**
R: Você precisa marcar as parcelas recorrentes com `is_mensalidade = true`. Veja seção "Configuração Necessária".

**P: A "Taxa de Recebimento" está baixa, o que fazer?**
R:
- Verifique a Fila de WhatsApp
- Envie cobranças para clientes atrasados
- Revise processos de cobrança
- Entre em contato com inadimplentes

**P: O comparativo mensal sempre compara com qual período?**
R: Sempre compara o mês atual COMPLETO com o mês anterior COMPLETO, independente do filtro selecionado.

**P: Posso exportar esses dados?**
R: Atualmente não, mas está na lista de melhorias futuras.

**P: Como atualizo os dados?**
R: Os dados são carregados automaticamente ao abrir a tela ou mudar o filtro de período.

---

## 🆘 Solução de Problemas

### Dados não aparecem
1. Verifique sua conexão com internet
2. Abra o Console do navegador (F12)
3. Procure por erros em vermelho
4. Verifique se tem dados no Supabase

### Taxa de Recebimento em 0%
- Normal se não houver parcelas vencidas no período
- Mude o filtro para "Mês Atual" ou "Últimos 30 dias"

### Comparativo mostra valores estranhos
- Normal nos primeiros dias do mês
- O mês anterior tem dados completos, o atual está iniciando

---

**Precisa de ajuda? Entre em contato com o suporte técnico.**

---

Última atualização: 2026-01-10
