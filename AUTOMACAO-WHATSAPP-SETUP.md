# 🤖 Guia de Configuração: Automação de WhatsApp

Este guia completo irá te auxiliar a configurar a automação de mensagens via WhatsApp usando **n8n** + **Evolution API**.

---

## 📋 Pré-requisitos

Antes de começar, certifique-se de ter:

1. ✅ **n8n instalado e rodando** (localmente ou em cloud)
2. ✅ **Evolution API configurada** com uma instância conectada ao WhatsApp
3. ✅ **Acesso ao Supabase Dashboard** do seu projeto
4. ✅ **Node.js e npm instalados** (para rodar o sistema React)

---

## 🗄️ Passo 1: Configurar Banco de Dados (Supabase)

### 1.1 Executar Script SQL

Acesse o **Supabase Dashboard** → **SQL Editor** e execute o arquivo:

```
criar-tabela-config.sql
```

Este script irá:
- Criar a tabela `config` para armazenar configurações
- Inserir registros iniciais com valores padrão
- Configurar políticas RLS (Row Level Security)

### 1.2 Preencher Credenciais

Após executar o SQL, vá em **Table Editor** → **config** e preencha:

| Chave | Valor | Descrição |
|-------|-------|-----------|
| `evolution_api_key` | `SUA_API_KEY_AQUI` | Sua API Key da Evolution API |
| `evolution_api_url` | `https://service-evolution-api.tnvro1.easypanel.host` | URL do seu servidor Evolution |
| `evolution_instance_name` | `nome-da-sua-instancia` | Nome da instância conectada |

> ⚠️ **Importante**: Nunca compartilhe suas credenciais publicamente!

---

## 🔗 Passo 2: Configurar n8n

### 2.1 Importar Workflows

1. Abra seu **n8n**
2. Vá em **Workflows** no menu lateral
3. Clique no botão **"+"** para criar novo workflow
4. Clique nos **3 pontinhos (⋮)** → **"Import from File"**
5. Selecione o arquivo: `n8n-workflows.json`

Você precisará importar **2 workflows**:
- **Lembrete de Vencimento** (envia X dias antes)
- **Vencimento Hoje** (envia no dia do vencimento)

### 2.2 Ativar Workflows

Para cada workflow importado:
1. Clique no workflow
2. Ative-o usando o toggle **"Active"** no canto superior direito
3. Copie a **URL do webhook** que aparece no nó "Webhook"

Exemplo de URL do webhook:
```
https://seu-n8n.com/webhook/lembrete-vencimento
https://seu-n8n.com/webhook/vencimento-hoje
```

### 2.3 Salvar URLs dos Webhooks

Volte ao **Supabase** → **Table Editor** → **config** e atualize:

| Chave | Valor |
|-------|-------|
| `n8n_webhook_lembrete` | `https://seu-n8n.com/webhook/lembrete-vencimento` |
| `n8n_webhook_vencimento_hoje` | `https://seu-n8n.com/webhook/vencimento-hoje` |

---

## ⚙️ Passo 3: Configurar no Sistema React

### 3.1 Acessar Configurações

No sistema, vá em:
```
Menu Lateral → Configurações → Automação WhatsApp
```

### 3.2 Preencher Formulário

Preencha todos os campos necessários:

#### Evolution API
- **API Key**: Sua chave de autenticação
- **URL da API**: URL do servidor Evolution
- **Nome da Instância**: Nome da instância WhatsApp conectada

#### n8n Webhooks
- **Webhook Lembrete**: URL copiada do n8n (workflow de lembrete)
- **Webhook Vencimento Hoje**: URL copiada do n8n (workflow de vencimento hoje)

#### Templates de Mensagens
Personalize as mensagens usando as variáveis disponíveis:
- `{{nome}}` - Nome do cliente
- `{{valor}}` - Valor da mensalidade (formatado em R$)
- `{{dias_restantes}}` - Quantos dias faltam para o vencimento
- `{{data_vencimento}}` - Data de vencimento (formatada)

**Exemplo de Template:**
```
Olá {{nome}}! 👋

Lembramos que sua mensalidade de *{{valor}}* vence em *{{dias_restantes}} dias* ({{data_vencimento}}).

Para manter seu acesso ativo, efetue o pagamento até a data de vencimento.

Qualquer dúvida, estamos à disposição! 😊
```

#### Configurações Gerais
- **Dias de Antecedência**: Quantos dias antes enviar lembrete (padrão: 3)
- **Horário de Envio**: Quando processar automações (padrão: 09:00)

### 3.3 Salvar e Ativar

1. Clique em **"Salvar Configurações"**
2. Ative o toggle **"Automação"** no topo da página
3. Clique em **"Testar Agora"** para verificar se está funcionando

---

## 🧪 Passo 4: Testar a Automação

### 4.1 Teste Manual

No sistema, na aba **Automação WhatsApp**:
1. Certifique-se que a automação está **ATIVADA** (toggle verde)
2. Clique no botão **"Testar Agora"**
3. Verifique o console do navegador (F12) para ver os logs

### 4.2 Criar Mensalidade de Teste

Para testar de verdade:
1. Crie um cliente com número de WhatsApp válido
2. Crie uma mensalidade com vencimento daqui a 3 dias (ou o número configurado)
3. Clique em **"Testar Agora"** na aba de Automação
4. Verifique se a mensagem chegou no WhatsApp

### 4.3 Verificar no n8n

No n8n, você pode ver:
- **Executions**: Histórico de execuções dos workflows
- **Status**: Se as mensagens foram enviadas com sucesso
- **Erros**: Se houver algum problema na integração

---

## 📊 Como Funciona

### Fluxo de Automação

```
1. Sistema React verifica mensalidades no Supabase
   ↓
2. Filtra mensalidades que precisam de lembrete
   ↓
3. Envia dados para webhook do n8n
   ↓
4. n8n processa template de mensagem
   ↓
5. n8n envia para Evolution API
   ↓
6. Evolution API envia via WhatsApp
   ↓
7. Cliente recebe mensagem
```

### Quando as Mensagens São Enviadas

| Tipo | Quando |
|------|--------|
| **Lembrete Antecipado** | X dias antes do vencimento (configurável) |
| **Vencimento Hoje** | No dia do vencimento |

### Condições para Envio

✅ Mensagem é enviada se:
- Automação está ATIVADA
- Mensalidade está PENDENTE (não paga)
- Cliente tem telefone cadastrado
- Data corresponde à regra (X dias antes ou hoje)

❌ Mensagem NÃO é enviada se:
- Automação está DESATIVADA
- Mensalidade já foi PAGA
- Cliente não tem telefone
- Data não corresponde

---

## 🔧 Configuração Avançada

### Agendar Execução Automática

Para executar automaticamente todos os dias, você tem 2 opções:

#### Opção 1: Cron Job (Linux/Mac)
```bash
# Editar crontab
crontab -e

# Adicionar linha (executar às 09:00 diariamente)
0 9 * * * curl -X POST https://seu-dominio.com/api/processar-automacoes
```

#### Opção 2: Task Scheduler (Windows)
1. Abra o **Agendador de Tarefas**
2. Crie nova tarefa básica
3. Configure para executar diariamente no horário desejado
4. Ação: executar script que chama a API

#### Opção 3: n8n Schedule Trigger
Você pode adicionar um nó **Schedule Trigger** no início do workflow do n8n:
1. Adicione nó "Schedule Trigger" antes do webhook
2. Configure para executar diariamente
3. Configure para fazer uma chamada HTTP ao seu sistema React

---

## 🐛 Troubleshooting (Resolução de Problemas)

### Problema: Mensagens não estão sendo enviadas

**Verificar:**
1. ✅ Automação está ativada no sistema?
2. ✅ URLs dos webhooks estão corretas?
3. ✅ Evolution API está rodando e conectada?
4. ✅ Cliente tem telefone cadastrado?
5. ✅ Mensalidade está com status "pendente"?

**Como debugar:**
- Abra o console do navegador (F12) e clique em "Testar Agora"
- Verifique os logs no console
- Verifique as execuções no n8n (Executions)

### Problema: Erro de autenticação na Evolution API

**Solução:**
- Verifique se a API Key está correta no Supabase
- Teste a API Key diretamente usando Postman ou curl
- Verifique se a instância está ativa

### Problema: Webhook do n8n não responde

**Solução:**
- Verifique se o workflow está ATIVO no n8n
- Teste o webhook diretamente com curl:
```bash
curl -X POST https://seu-n8n.com/webhook/teste \
  -H "Content-Type: application/json" \
  -d '{"teste": "ok"}'
```

### Problema: Template de mensagem não substitui variáveis

**Solução:**
- Certifique-se de usar o formato exato: `{{variavel}}`
- Use aspas simples, não crases
- Verifique se a variável existe no payload enviado

---

## 📝 Manutenção

### Backup das Configurações

Sempre faça backup da tabela `config` do Supabase:
```sql
SELECT * FROM config;
```

### Atualizar Templates

Para alterar as mensagens:
1. Vá em **Configurações** → **Automação WhatsApp**
2. Edite os templates
3. Clique em **Salvar**

### Monitorar Uso

Acompanhe o envio de mensagens:
- No n8n: verifique o histórico de execuções
- No sistema: veja os logs no console ao testar

---

## 🎯 Próximos Passos

Após configurar a automação básica, você pode:

1. ⚙️ **Adicionar mais tipos de mensagens**
   - Aviso de atraso (1-7 dias)
   - Aviso de bloqueio (7+ dias)

2. 📊 **Criar relatórios**
   - Taxa de resposta
   - Efetividade das mensagens

3. 🔄 **Integrar com outros sistemas**
   - CRM
   - Sistema de pagamentos

4. 🎨 **Personalizar mais**
   - Mensagens por tipo de cliente
   - Horários diferentes por cliente

---

## 📞 Suporte

Se tiver problemas:
1. Verifique o console do navegador (F12)
2. Verifique os logs do n8n
3. Teste cada componente isoladamente (Evolution API, n8n, webhook)

---

## 🎉 Conclusão

Parabéns! Você configurou com sucesso a automação de WhatsApp. Agora seu sistema irá:

✅ Enviar lembretes automáticos antes do vencimento
✅ Avisar clientes no dia do vencimento
✅ Reduzir inadimplência
✅ Economizar tempo operacional

**Dica final**: Comece com a automação DESATIVADA, faça alguns testes, e só então ative para produção!
