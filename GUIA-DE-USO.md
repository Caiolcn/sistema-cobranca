# 📚 Guia Completo - Sistema de Cobrança

## 🎯 Visão Geral

Sistema completo de cobrança com envio automático via WhatsApp usando:
- **React** - Interface web para gerenciar devedores e parcelas
- **Supabase** - Banco de dados e autenticação
- **n8n** - Automação de envio de mensagens
- **Evolution API** - Disparo de WhatsApp

---

## 🚀 Passo a Passo para Começar

### 1️⃣ Configurar Supabase

1. **Execute o SQL completo:**
   - Abra o arquivo: `setup-supabase.sql`
   - Vá no Supabase → SQL Editor
   - Cole TODO o conteúdo do arquivo
   - Clique em **Run**

2. **Verifique se foi criado:**
   - Tabela `parcelas` com colunas: `enviado_hoje`, `data_ultimo_envio`, `total_envios`
   - Tabela `controle_planos`
   - View `vw_parcelas_para_enviar`
   - Funções: `resetar_contador_mensal()`, `resetar_envios_diarios()`

---

### 2️⃣ Configurar n8n

1. **Importe o workflow:**
   - Arquivo: `n8n-workflow-corrigido.json`
   - No n8n: Menu → Import from File
   - Selecione o arquivo

2. **Configure credenciais do Supabase:**
   - Vá em: Supabase → Settings → API
   - Copie:
     - **Project URL**: `https://zvlnkkmcytjtridiojxx.supabase.co`
     - **Service Role Key** (secret - NÃO é a anon key!)
   - No n8n, em cada nó Supabase, configure essas credenciais

3. **Ajuste o Schedule:**
   - Nó "⏰ Schedule"
   - Configure para rodar 2x por dia (ex: 9h e 14h)
   - Cron: `0 9,14 * * *`

---

### 3️⃣ Usar o Sistema React

1. **Inicie o servidor:**
   ```bash
   npm start
   ```

2. **Faça login/cadastro**

3. **Adicione um devedor:**
   - Clique em "+ Adicionar Devedor"
   - Preencha: Nome, Telefone, Valor Total, Vencimento

4. **Gerencie parcelas:**
   - Clique em "Ver Parcelas" do devedor
   - Você pode:
     - ✅ Criar parcela única
     - ✅ Criar múltiplas parcelas (parcelamento)
     - ✅ Editar parcelas
     - ✅ Marcar como pago/pendente
     - ✅ Ver histórico de envios
     - ✅ Excluir parcelas

---

## 📋 Recursos do Sistema

### Gerenciamento de Parcelas

#### Criar Parcela Única
1. Clique em "Adicionar Parcela"
2. Preencha: Número, Valor, Vencimento, Descrição
3. Salvar

#### Criar Parcelamento (Múltiplas Parcelas)
1. Clique em "Adicionar Parcela"
2. Marque "Criar múltiplas parcelas"
3. Preencha:
   - **Valor Total**: Ex: R$ 1.500,00
   - **Quantidade**: Ex: 10 parcelas
   - **Dia Vencimento**: Ex: dia 10 de cada mês
4. O sistema cria automaticamente 10 parcelas de R$ 150,00 cada

#### Status de Parcelas
- 🟠 **Pendente** - Ainda não pago
- 🟢 **Pago** - Já foi pago
- 🔴 **Atrasado** - Vencido e não pago
- ⚫ **Cancelado** - Cancelado

---

## 🤖 Como Funciona o n8n

### Fluxo Automático

```
[Schedule: 2x/dia]
    ↓
[É dia 1?] → SIM → Resetar contador mensal
    ↓ NÃO
[Resetar "enviado_hoje" = false]
    ↓
[Buscar parcelas vencidas hoje]
    ↓
[Validar horário comercial + limite]
    ↓
[Enviar WhatsApp]
    ↓
[Marcar como enviado + incrementar contador]
```

### Proteções Implementadas

✅ **Horário comercial**: Envia apenas entre 9h-18h
✅ **Não duplica**: Não envia 2x no mesmo dia para a mesma parcela
✅ **Limite mensal**: Plano básico = 100 envios/mês
✅ **Reseta dia 1**: No dia 1 do mês, zera o contador
✅ **Só parcelas vencidas**: Busca apenas `data_vencimento <= hoje`

---

## 🎨 Estrutura das Tabelas

### Tabela: `devedores`
```
- id (UUID)
- user_id (UUID) → Quem criou
- nome (TEXT)
- telefone (TEXT)
- valor_devido (DECIMAL) → Valor total da dívida
- data_vencimento (DATE) → Usado como referência
- status (TEXT)
- created_at
- updated_at
```

### Tabela: `parcelas`
```
- id (UUID)
- devedor_id (UUID) → FK para devedores
- user_id (UUID)
- numero_parcela (INTEGER) → Ex: 1, 2, 3...
- valor (DECIMAL) → Valor desta parcela
- data_vencimento (DATE) → Vencimento específico
- descricao (TEXT) → Opcional
- status (TEXT) → pendente, pago, atrasado, cancelado
- enviado_hoje (BOOLEAN) → Se já foi enviado hoje
- data_ultimo_envio (DATE) → Última vez que enviou
- total_envios (INTEGER) → Quantas vezes enviou
```

### Tabela: `controle_planos`
```
- id (UUID)
- user_id (TEXT) → ID do workflow n8n ou user
- plano (TEXT) → basico, premium, enterprise
- limite_mensal (INTEGER) → Ex: 100
- usage_count (INTEGER) → Quantos já enviou neste mês
- mes_referencia (TEXT) → Ex: "2025-12"
- status (TEXT) → ativo, bloqueado
```

---

## 🔍 Queries Úteis (SQL)

### Ver todas as parcelas de um devedor
```sql
SELECT * FROM parcelas
WHERE devedor_id = 'UUID_DO_DEVEDOR'
ORDER BY numero_parcela;
```

### Ver parcelas que venceram hoje
```sql
SELECT * FROM vw_parcelas_para_enviar
WHERE data_vencimento = CURRENT_DATE;
```

### Resetar manualmente o contador mensal
```sql
SELECT resetar_contador_mensal();
```

### Ver uso atual do plano
```sql
SELECT * FROM controle_planos;
```

### Marcar parcela como paga
```sql
UPDATE parcelas
SET status = 'pago'
WHERE id = 'UUID_DA_PARCELA';
```

---

## ⚙️ Configurações do n8n

### Credenciais necessárias:

1. **Supabase:**
   - Host: `https://zvlnkkmcytjtridiojxx.supabase.co`
   - Service Role Key: (pegar no Supabase → Settings → API)

2. **WhatsApp (Evolution API):**
   - URL: `https://service-evolution-api.tnvro1.easypanel.host`
   - Header Auth: (sua chave de API)

---

## 🎯 Planos e Limites

### Plano Básico (atual)
- ✅ 100 mensagens/mês
- ✅ Usuários ilimitados
- ✅ Parcelas ilimitadas
- ✅ Envio automático 2x/dia

### Expansão Futura
Você pode criar planos adicionais editando a tabela `controle_planos`:
- Premium: 500 mensagens/mês
- Enterprise: Ilimitado

---

## 📞 Mensagem Padrão Enviada

```
*🔔 Lembrete de Pagamento*

Olá, *[NOME]*! 👋

Identificamos que você possui um pagamento pendente:

💰 *Valor:* R$ [VALOR]
📅 *Vencimento:* [DATA]
⚠️ *X dia(s) em atraso*

✅ *Formas de Pagamento:*

*PIX (Instantâneo):*
Chave Pix: `05373488160`

📝 [DESCRIÇÃO]

✔️ Já pagou? Desconsidere e envie comprovante.

❓ Dúvidas? Estamos à disposição!

_Equipe de Cobrança_
```

Você pode editar a mensagem no nó "Criar Mensagem" do n8n!

---

## 🐛 Solução de Problemas

### Erro: "Column enviado_hoje does not exist"
→ Execute o `setup-supabase.sql` completo

### n8n não está enviando mensagens
→ Verifique:
1. Credenciais do Supabase estão corretas?
2. Service Role Key (não anon key)?
3. Schedule está ativo?
4. Horário está entre 9h-18h?

### Parcelas não aparecem no sistema
→ Verifique se o `user_id` da parcela corresponde ao usuário logado

### Limite atingido
→ Execute no Supabase:
```sql
UPDATE controle_planos
SET usage_count = 0
WHERE user_id = 'SEU_USER_ID';
```

---

## ✅ Checklist de Implementação

- [ ] SQL executado no Supabase
- [ ] Tabela `parcelas` com colunas corretas
- [ ] Tabela `controle_planos` criada
- [ ] View `vw_parcelas_para_enviar` criada
- [ ] Workflow importado no n8n
- [ ] Credenciais Supabase configuradas no n8n
- [ ] Schedule ativo (2x/dia)
- [ ] Sistema React rodando (`npm start`)
- [ ] Teste: criar devedor
- [ ] Teste: criar parcelas
- [ ] Teste: marcar como pago
- [ ] Teste: envio automático no n8n

---

## 🎉 Pronto!

Seu sistema está completo e funcional! Agora você pode:

1. Cadastrar devedores
2. Criar parcelas (únicas ou parceladas)
3. Deixar o n8n rodar automaticamente
4. Gerenciar pagamentos pelo sistema web

Qualquer dúvida, consulte este guia! 🚀
