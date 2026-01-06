# ⚙️ Guia de Configuração da Evolution API

## 🎯 O que você precisa fazer:

Configurar a API Key global da Evolution API no Supabase para que o sistema possa conectar WhatsApp.

---

## 📋 Passo a passo:

### **1. Executar SQL no Supabase**

1. Acesse seu projeto no [Supabase](https://supabase.com)
2. Vá em **SQL Editor** (no menu lateral esquerdo)
3. Clique em **New Query**
4. Cole o conteúdo do arquivo `criar-tabela-config.sql`
5. Clique em **Run** ou pressione `Ctrl + Enter`

✅ Isso criará a tabela `config` com as configurações necessárias.

---

### **2. Pegar sua API Key da Evolution API**

#### **Opção A: Se você já tem Evolution API rodando**

1. Acesse o painel da sua Evolution API
2. Geralmente fica em: `https://seu-dominio.easypanel.host`
3. Vá em **Settings** ou **Authentication**
4. Copie a **Global API Key** ou **API Key**

#### **Opção B: Se ainda não configurou Evolution API**

1. Acesse seu [EasyPanel](https://easypanel.io)
2. Vá no serviço da Evolution API
3. Procure nas variáveis de ambiente: `AUTHENTICATION_API_KEY`
4. Copie o valor

#### **Exemplo de API Key:**
```
B6D711FCDE4D4FD5936544120E713976
```

---

### **3. Inserir API Key no Supabase**

1. No Supabase, vá em **Table Editor**
2. Selecione a tabela **config**
3. Você verá um registro com:
   - `chave`: `evolution_api_key`
   - `valor`: `SUA_API_KEY_AQUI`

4. **Edite esse registro:**
   - Clique no registro
   - Substitua `SUA_API_KEY_AQUI` pela sua API Key real
   - Clique em **Save**

---

### **4. (Opcional) Atualizar URL da Evolution API**

Se sua Evolution API estiver em um domínio diferente:

1. Na tabela `config`, edite o registro:
   - `chave`: `evolution_api_url`
   - `valor`: `https://seu-dominio.easypanel.host`

2. Substitua pela URL correta
3. Salve

---

## 🔐 Como funciona a segurança:

### **Row Level Security (RLS) ativado:**
```sql
-- Apenas usuários autenticados podem ler configurações
CREATE POLICY "Permitir leitura de configurações"
ON config FOR SELECT TO authenticated USING (true);
```

- ✅ Usuários logados podem **ler** as configurações
- ❌ Ninguém pode criar/editar via aplicação (apenas você pelo painel)
- ✅ Chave está no banco, não exposta no código frontend

---

## 🏗️ Arquitetura:

```
┌─────────────────────────────────────────┐
│         React Application                │
│                                           │
│  1. User faz login                       │
│  2. WhatsAppConexao carrega              │
│  3. Busca config do Supabase             │
│     ↓                                     │
└─────────────────────────────────────────┘
              ↓
┌─────────────────────────────────────────┐
│          Supabase Database               │
│                                           │
│  Tabela: config                          │
│  ├─ evolution_api_key: B6D711FC...      │
│  └─ evolution_api_url: https://...      │
│                                           │
└─────────────────────────────────────────┘
              ↓
┌─────────────────────────────────────────┐
│         Evolution API Server             │
│                                           │
│  API Key Global validada                 │
│  ↓                                        │
│  Cria instância para o usuário           │
│  instance_abc12345                       │
│                                           │
└─────────────────────────────────────────┘
```

---

## ✅ Verificar se funcionou:

### **Teste 1: Verificar tabela no Supabase**
1. Vá em **Table Editor** → `config`
2. Deve ter 2 registros:
   - `evolution_api_key` com sua chave
   - `evolution_api_url` com a URL

### **Teste 2: No aplicativo**
1. Faça login no sistema
2. Clique no ícone do WhatsApp no menu
3. Clique em **"Gerar QR Code"**
4. Se aparecer o QR Code = funcionou! ✅
5. Se aparecer erro = verifique console do navegador

### **Teste 3: Console do navegador (F12)**
```javascript
// Não deve aparecer:
"Configurações da Evolution API não carregadas"

// Deve aparecer (em caso de sucesso):
"QR Code gerado com sucesso"
```

---

## 🐛 Problemas comuns:

### **Erro: "Configurações da Evolution API não carregadas"**
- ✅ Execute o SQL `criar-tabela-config.sql`
- ✅ Verifique se a tabela `config` existe
- ✅ Verifique RLS da tabela

### **Erro: "401 Unauthorized"**
- ✅ API Key está incorreta
- ✅ Verifique se copiou a chave correta da Evolution API

### **Erro: "Network Error" ou "Failed to fetch"**
- ✅ URL da Evolution API está errada
- ✅ Evolution API está offline
- ✅ Problema de CORS (configure no Evolution API)

### **QR Code não aparece**
- ✅ Verifique console do navegador (F12)
- ✅ Teste a URL manualmente: `https://sua-api.com/instance/connect/test`

---

## 📝 Exemplo completo:

### **Tabela config no Supabase:**
| id | chave | valor | descricao |
|----|-------|-------|-----------|
| 1 | evolution_api_key | B6D711FCDE4D4FD5936544120E713976 | Chave de API global da Evolution API |
| 2 | evolution_api_url | https://service-evolution-api.tnvro1.easypanel.host | URL base da Evolution API |

---

## 🚀 Próximos passos após configurar:

1. ✅ Testar conexão do WhatsApp
2. ✅ Conectar seu número
3. ✅ Configurar n8n workflow
4. ✅ Testar envio de mensagens

---

## 🎉 Pronto!

Agora sua aplicação está configurada para usar a Evolution API de forma segura, sem expor credenciais no código fonte!

**Benefícios:**
- 🔐 API Key não fica exposta no código
- ⚡ Pode alterar a chave sem fazer deploy
- 🔄 Fácil de atualizar quando trocar de servidor
- 👥 Todos os usuários usam a mesma configuração global
