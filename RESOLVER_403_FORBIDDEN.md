# 🔒 Resolver Erro 403 Forbidden - Evolution API

## ❌ Erro Atual
```
Erro ao criar instância: Forbidden
```

## 🎯 Causa do Problema

O erro **403 Forbidden** acontece quando a API Key usada **NÃO tem permissão** para criar instâncias na Evolution API.

Existem 2 tipos de API Keys na Evolution API:
- **🌐 Global API Key** (Master Key) → Tem permissão TOTAL ✅
- **📱 Instance API Key** → Só funciona para uma instância específica ❌

**Você está usando a Instance Key, mas precisa da Global Key!**

---

## ✅ Soluções (Escolha UMA)

### Solução 1: Usar a Global API Key (RECOMENDADO) ⭐

#### Passo 1: Encontrar a Global API Key

A Global API Key está configurada no servidor da Evolution API.

**Se você hospeda a Evolution API:**

1. **Via Docker Compose:**
   ```bash
   # Acesse a pasta onde está o docker-compose.yml
   cd /caminho/para/evolution-api

   # Visualize o arquivo
   cat docker-compose.yml

   # Ou edite
   nano docker-compose.yml
   ```

   Procure por:
   ```yaml
   environment:
     - AUTHENTICATION_API_KEY=minha-chave-super-secreta-123
   ```
   **Esta é sua Global API Key!** Copie o valor.

2. **Via arquivo .env:**
   ```bash
   # Visualize o .env
   cat .env | grep API_KEY
   ```

   Procure por:
   ```
   AUTHENTICATION_API_KEY=minha-chave-super-secreta-123
   ```

**Se usa serviço hospedado (EasyPanel, Hostinger, etc.):**

1. Acesse o painel de controle da Evolution API
2. Vá em **Environment Variables** ou **Variáveis de Ambiente**
3. Procure por `AUTHENTICATION_API_KEY` ou `API_KEY_GLOBAL`
4. Copie o valor

#### Passo 2: Atualizar no Sistema

Acesse o **Supabase SQL Editor** e execute:

```sql
-- Substitua 'SUA_GLOBAL_API_KEY_AQUI' pela chave que você copiou
UPDATE config
SET valor = 'SUA_GLOBAL_API_KEY_AQUI'
WHERE chave = 'evolution_api_key';
```

**Exemplo:**
```sql
UPDATE config
SET valor = 'minha-chave-super-secreta-123'
WHERE chave = 'evolution_api_key';
```

#### Passo 3: Recarregar a Página

1. Volte ao sistema de cobrança
2. Recarregue a página do WhatsApp (F5)
3. Tente criar e conectar novamente
4. Deve funcionar! 🎉

---

### Solução 2: Configurar Permissões na Evolution API

Se você tem acesso ao servidor da Evolution API:

#### Passo 1: Editar Configurações

```bash
# Edite o arquivo de configuração
nano .env

# Ou no docker-compose.yml
nano docker-compose.yml
```

#### Passo 2: Adicionar/Verificar estas linhas:

```bash
# Permitir criação de instâncias
INSTANCE_CREATION_ENABLED=true

# API Key global com permissões completas
AUTHENTICATION_API_KEY=sua-chave-super-secreta

# Permitir múltiplas instâncias
INSTANCE_MAX=100
```

#### Passo 3: Reiniciar Evolution API

```bash
# Se usar Docker
docker-compose restart

# Se usar PM2
pm2 restart evolution-api

# Se usar systemd
sudo systemctl restart evolution-api
```

#### Passo 4: Testar

Volte ao sistema e tente criar a instância novamente.

---

### Solução 3: Criar Instância Manualmente

Se você não conseguir usar a Global API Key agora, pode criar a instância manualmente via API:

#### Passo 1: Descobrir seu User ID

No Supabase SQL Editor:
```sql
-- Substitua 'seu@email.com' pelo seu email de login
SELECT id FROM auth.users WHERE email = 'seu@email.com';
```

Copie os **primeiros 8 caracteres** do ID.
Exemplo: se o ID for `a1b2c3d4-e5f6-7890-abcd-ef1234567890`, pegue `a1b2c3d4`

#### Passo 2: Criar Instância via cURL

Abra o terminal e execute:

```bash
curl -X POST https://service-evolution-api.tnvro1.easypanel.host/instance/create \
  -H "Content-Type: application/json" \
  -H "apikey: SUA_GLOBAL_API_KEY_AQUI" \
  -d '{
    "instanceName": "instance_SEUS_8_CARACTERES",
    "qrcode": true,
    "integration": "WHATSAPP-BAILEYS"
  }'
```

**Exemplo real:**
```bash
curl -X POST https://service-evolution-api.tnvro1.easypanel.host/instance/create \
  -H "Content-Type: application/json" \
  -H "apikey: minha-chave-super-secreta-123" \
  -d '{
    "instanceName": "instance_a1b2c3d4",
    "qrcode": true,
    "integration": "WHATSAPP-BAILEYS"
  }'
```

#### Passo 3: Conectar no Sistema

1. Volte ao sistema de cobrança
2. Recarregue a página (F5)
3. Agora deve aparecer o botão **"Gerar QR Code"** (não "Criar")
4. Clique e escaneie o QR Code

---

### Solução 4: Usar Botão de Emergência (Temporário)

Se nenhuma das soluções acima funcionou agora, o sistema tem um botão de emergência:

1. Quando aparecer o erro 403 Forbidden
2. Vai aparecer um botão laranja: **"Tentar Conectar Sem Criar"**
3. Clique nele
4. Se a instância já existir, vai gerar o QR Code

**Nota:** Isso só funciona se a instância já foi criada antes (manualmente ou por outro meio).

---

## 🔍 Como Verificar se Funcionou

### Teste 1: Verificar API Key no Supabase

```sql
SELECT chave, valor
FROM config
WHERE chave = 'evolution_api_key';
```

Deve retornar a Global API Key (não a Instance Key).

### Teste 2: Verificar Permissões da API Key

No terminal ou Postman:

```bash
curl -X GET https://service-evolution-api.tnvro1.easypanel.host/instance/fetchInstances \
  -H "apikey: SUA_API_KEY"
```

**Se funcionar:** Sua API Key está correta ✅
**Se retornar 403:** A API Key ainda não tem permissão ❌

---

## 📋 Checklist de Diagnóstico

Marque o que você já verificou:

- [ ] Confirmei que estou usando a **Global API Key** (não Instance Key)
- [ ] A Global API Key está no formato correto (texto sem espaços)
- [ ] Atualizei a chave na tabela `config` do Supabase
- [ ] Recarreguei a página após atualizar
- [ ] Verifiquei os logs no console do navegador (F12)
- [ ] A Evolution API está online e respondendo
- [ ] Testei a API Key com o comando cURL acima

---

## 🆘 Ainda não funcionou?

### Debug Avançado:

1. **Abra o Console do Navegador** (F12)
2. **Vá na aba "Network"**
3. **Tente criar a instância novamente**
4. **Clique na requisição que falhou**
5. **Veja a resposta completa**

Copie as informações e verifique:
- O que está sendo enviado no header `apikey`?
- Qual é a resposta exata do servidor?

### Onde Pedir Ajuda:

**Evolution API:**
- GitHub: https://github.com/EvolutionAPI/evolution-api/issues
- Documentação: https://doc.evolution-api.com

**Informações úteis para compartilhar:**
```
- URL da Evolution API: https://service-evolution-api.tnvro1.easypanel.host
- Versão da Evolution API: (veja no painel)
- Erro exato: 403 Forbidden ao criar instância
- Já tentei: [listar o que você já tentou]
```

---

## 🎯 Diferenças entre API Keys

| Tipo | Onde fica | O que pode fazer | Use para |
|------|-----------|------------------|----------|
| **Global API Key** | Servidor Evolution (`.env`) | Tudo: criar instâncias, deletar, configurar | Sistema de cobrança ✅ |
| **Instance API Key** | Criada após conectar WhatsApp | Apenas enviar mensagens por aquela instância | Apps externos que só enviam |

---

## ✅ Solução Rápida (TL;DR)

1. Acesse o servidor da Evolution API
2. Pegue a `AUTHENTICATION_API_KEY` do `.env` ou `docker-compose.yml`
3. Execute no Supabase:
   ```sql
   UPDATE config SET valor = 'sua-chave-aqui' WHERE chave = 'evolution_api_key';
   ```
4. Recarregue a página
5. Tente novamente

**Pronto!** 🎉
