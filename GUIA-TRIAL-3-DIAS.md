## 🎯 Sistema de Trial de 3 Dias - Implementado!

Sistema completo de trial gratuito de 3 dias com bloqueio automático e popup de upgrade.

---

## 📋 Passo a Passo de Instalação

### PASSO 1: Adicionar Colunas e Funções no Supabase

Execute no **SQL Editor do Supabase**:

1. Abra o arquivo: **[adicionar-trial-sistema.sql](adicionar-trial-sistema.sql)**
2. Copie todo o conteúdo
3. Cole no SQL Editor
4. Clique em **Run**

**O que este SQL faz:**
- ✅ Adiciona colunas `trial_ativo`, `trial_fim`, `plano_pago` na tabela `usuarios`
- ✅ Cria função `trial_expirado()` para verificar se expirou
- ✅ Cria função `dias_restantes_trial()` para contar dias restantes
- ✅ Cria view `v_status_trial` para consultas fáceis
- ✅ Atualiza usuários existentes com trial de 3 dias

### PASSO 2: Atualizar Trigger de Criação de Usuário

Execute no **SQL Editor**:

1. Abra o arquivo: **[atualizar-trigger-trial.sql](atualizar-trigger-trial.sql)**
2. Copie e cole no SQL Editor
3. Clique em **Run**

**O que este SQL faz:**
- ✅ Atualiza a função `criar_usuario_automatico()`
- ✅ Novos usuários já nascem com trial de 3 dias configurado
- ✅ `trial_fim` = data de cadastro + 3 dias

### PASSO 3: Testar o Sistema

1. **Recarregue a página** (Ctrl+Shift+R)
2. **Faça login** no sistema
3. **Verifique no Supabase:**

```sql
-- Ver seu status de trial
SELECT * FROM v_status_trial WHERE user_id = auth.uid();

-- Ver todos os usuários
SELECT
  nome_completo,
  email,
  data_cadastro,
  trial_fim,
  plano_pago,
  dias_restantes_trial(id) as dias_restantes
FROM usuarios;
```

---

## 🔧 Como Funciona

### Quando o usuário se cadastra:

1. **Trigger automático** cria registro em `usuarios`
2. **trial_ativo** = `true`
3. **trial_fim** = data/hora atual + 3 dias
4. **plano_pago** = `false`

### Durante os 3 dias:

- ✅ Usuário tem acesso total ao sistema
- ⏰ **2 dias antes** de expirar: Popup de alerta aparece
- ⏰ **1 dia antes**: Popup mais urgente
- ✅ Hook `useTrialStatus` verifica status a cada 5 minutos

### Quando o trial expira (3 dias completos):

- ❌ **Dashboard é bloqueado** (fica borrado e sem interação)
- 🔒 **Popup obrigatório** aparece por cima
- 📱 **Botão "Fazer Upgrade"** leva para página de planos
- 🚫 **Não pode fechar** o popup (trial expirado)

### Na página de Upgrade:

- 💳 Mostra 2 planos: **Premium** (R$ 49,90) e **Enterprise** (R$ 149,90)
- 📱 **Botão WhatsApp** abre conversa com mensagem pré-pronta
- ⚙️ **Após pagamento**, você ativa manualmente no banco

---

## 💰 Como Ativar Manualmente um Plano Pago

Quando um cliente pagar, execute no SQL Editor:

```sql
-- Ativar plano Premium
UPDATE usuarios
SET
    plano_pago = true,
    plano = 'premium',
    trial_ativo = false,
    status_conta = 'ativo'
WHERE email = 'cliente@exemplo.com';

-- Ativar plano Enterprise
UPDATE usuarios
SET
    plano_pago = true,
    plano = 'enterprise',
    trial_ativo = false,
    status_conta = 'ativo'
WHERE email = 'cliente@exemplo.com';
```

**Pronto!** O cliente terá acesso ilimitado imediatamente.

---

## 📊 Consultas Úteis

### Ver todos os trials expirando hoje

```sql
SELECT
    nome_completo,
    email,
    telefone,
    dias_restantes_trial(id) as dias_restantes
FROM usuarios
WHERE dias_restantes_trial(id) <= 1
  AND plano_pago = false
ORDER BY dias_restantes_trial(id);
```

### Ver todos os trials expirados

```sql
SELECT
    nome_completo,
    email,
    telefone,
    data_cadastro,
    trial_fim
FROM usuarios
WHERE trial_expirado(id) = true
  AND plano_pago = false
ORDER BY trial_fim DESC;
```

### Estatísticas gerais

```sql
SELECT
    COUNT(*) as total_usuarios,
    COUNT(*) FILTER (WHERE plano_pago = true) as assinantes,
    COUNT(*) FILTER (WHERE trial_expirado(id) = false AND plano_pago = false) as trial_ativo,
    COUNT(*) FILTER (WHERE trial_expirado(id) = true AND plano_pago = false) as trial_expirado
FROM usuarios;
```

---

## 🧪 Como Testar o Trial

### Método 1: Forçar expiração manual

```sql
-- Fazer seu trial expirar agora (para testar)
UPDATE usuarios
SET trial_fim = NOW() - INTERVAL '1 hour'
WHERE email = 'seu-email@exemplo.com';
```

Recarregue a página → Popup aparecerá!

### Método 2: Testar popup de alerta (1 dia restante)

```sql
-- Fazer trial expirar amanhã
UPDATE usuarios
SET trial_fim = NOW() + INTERVAL '1 day'
WHERE email = 'seu-email@exemplo.com';
```

### Método 3: Resetar trial para 3 dias

```sql
-- Voltar para 3 dias de trial
UPDATE usuarios
SET
    trial_fim = NOW() + INTERVAL '3 days',
    trial_ativo = true,
    plano_pago = false
WHERE email = 'seu-email@exemplo.com';
```

---

## 🎨 Componentes Criados

### 1. **[src/TrialExpiredModal.js](src/TrialExpiredModal.js)**
- Popup bonito e responsivo
- Mostra dias restantes ou "Trial Expirado"
- Botão de upgrade + botão de fechar (se ainda não expirou)
- Lista de benefícios do plano pago

### 2. **[src/useTrialStatus.js](src/useTrialStatus.js)**
- Hook React personalizado
- Verifica status do trial automaticamente
- Atualiza a cada 5 minutos
- Retorna: `isExpired`, `diasRestantes`, `planoPago`, `loading`

### 3. **[src/UpgradePage.js](src/UpgradePage.js)**
- Página de planos com preços
- Cards bonitos para Premium e Enterprise
- Botões diretos para WhatsApp
- Instruções de como funciona o upgrade

### 4. **[src/Dashboard.js](src/Dashboard.js)** (modificado)
- Integrado com `useTrialStatus`
- Bloqueia acesso se trial expirou
- Mostra popup se está expirando (1-2 dias)
- Dashboard fica borrado no fundo quando bloqueado

---

## 📱 Contato para Upgrade

**WhatsApp configurado:** `+55 62 98246-6639`

**Mensagem automática:**
```
Olá! Gostaria de fazer upgrade para o plano [NOME] ([PREÇO]/mês)
```

---

## ⚙️ Configurações Ajustáveis

### Mudar duração do trial (padrão: 3 dias)

No arquivo `adicionar-trial-sistema.sql`, linha 59:

```sql
trial_fim = data_cadastro + INTERVAL '3 days',  -- Mude aqui
```

Exemplos:
- `'7 days'` = 7 dias
- `'14 days'` = 14 dias
- `'30 days'` = 30 dias

### Mudar quando mostrar popup de alerta

No arquivo `src/Dashboard.js`, linha 64:

```sql
{mostrarModalTrial && diasRestantes > 0 && diasRestantes <= 2 && (
```

Mude `<= 2` para mostrar em outros momentos:
- `<= 1` = Só no último dia
- `<= 3` = Nos últimos 3 dias
- `<= 7` = Na última semana

### Mudar número do WhatsApp

No arquivo `src/UpgradePage.js`, linha 195:

```javascript
href={`https://wa.me/5562982466639?text=...`}
```

---

## ✅ Checklist de Validação

Depois de instalar, valide:

- [ ] SQL executado sem erros
- [ ] Colunas criadas na tabela `usuarios`
- [ ] Trigger atualizado
- [ ] Novo cadastro já tem trial configurado
- [ ] Dashboard mostra popup quando expira
- [ ] Página `/app/upgrade` funciona
- [ ] Botão WhatsApp abre conversa
- [ ] Ativação manual de plano pago funciona

---

## 🆘 Troubleshooting

### Trial não está sendo criado automaticamente

**Solução:** Execute o SQL `atualizar-trigger-trial.sql` novamente

### Popup não aparece

**Solução:**
1. Verifique console do navegador (F12)
2. Execute: `SELECT * FROM v_status_trial WHERE user_id = auth.uid();`
3. Veja se `trial_expirado` está `true`

### Erro "column trial_fim does not exist"

**Solução:** Execute o SQL `adicionar-trial-sistema.sql` primeiro

---

## 🎉 Pronto!

Sistema de trial completamente funcional! Seus novos usuários terão 3 dias gratuitos para testar o MensalliZap e, após esse período, serão incentivados a fazer upgrade.

Qualquer dúvida, me chame! 🚀
