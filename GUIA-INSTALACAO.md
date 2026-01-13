# 🚀 Guia de Instalação - WhatsApp Individual

## ⚠️ IMPORTANTE: Execute APENAS arquivos .sql no Supabase!

**NÃO execute** arquivos `.js`, `.jsx` ou `.md` no SQL Editor!

---

## 📋 Passo a Passo

### **PASSO 1: Adicionar coluna whatsapp_config**

1. Acesse o Supabase Dashboard
2. Vá em **SQL Editor** (no menu lateral)
3. Clique em **+ New Query**
4. **Copie e cole** o conteúdo abaixo:

```sql
-- ===================================
-- MIGRAÇÃO: Adicionar Instância WhatsApp aos Clientes
-- ===================================
-- Permite que cada cliente tenha sua própria instância WhatsApp
-- API Key e URL são compartilhadas (da tabela config)

-- Adicionar coluna whatsapp_config na tabela devedores
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
        AND table_name = 'devedores'
        AND column_name = 'whatsapp_config'
    ) THEN
        ALTER TABLE devedores ADD COLUMN whatsapp_config JSONB DEFAULT '{
            "evolution_instance_name": null,
            "conectado": false,
            "ultima_conexao": null
        }'::jsonb;

        RAISE NOTICE 'Coluna whatsapp_config adicionada à tabela devedores';
    ELSE
        RAISE NOTICE 'Coluna whatsapp_config já existe';
    END IF;
END $$;

-- Adicionar comentário
COMMENT ON COLUMN devedores.whatsapp_config IS 'Instância individual WhatsApp do cliente (JSONB)';

-- Criar índice para buscar clientes com WhatsApp conectado
CREATE INDEX IF NOT EXISTS idx_devedores_whatsapp_conectado
ON devedores ((whatsapp_config->>'conectado'));

-- ===================================
-- VERIFICAÇÃO
-- ===================================

-- Ver estrutura atual
SELECT
    id,
    nome,
    telefone,
    whatsapp_config
FROM devedores
LIMIT 5;
```

5. Clique em **Run** (ou pressione Ctrl+Enter)
6. ✅ Deve aparecer: "Coluna whatsapp_config adicionada à tabela devedores"

---

### **PASSO 2: Remover evolution_instance_name global**

1. No mesmo **SQL Editor**
2. Clique em **+ New Query** (nova aba)
3. **Copie e cole** o conteúdo abaixo:

```sql
-- ===================================
-- REMOVER APENAS evolution_instance_name GLOBAL
-- ===================================
-- ARQUITETURA CORRETA:
-- - API Key e URL: GLOBAIS (compartilhadas por todos os clientes)
-- - Instance Name: INDIVIDUAL (cada cliente tem sua própria instância)

-- Remover APENAS o instance_name global (não é mais usado)
DELETE FROM config
WHERE chave = 'evolution_instance_name';

-- ===================================
-- VERIFICAÇÃO
-- ===================================

-- Listar configurações restantes (deve ter 9 itens)
SELECT
  chave,
  LEFT(valor, 50) as valor_preview,
  descricao
FROM config
ORDER BY chave;
```

4. Clique em **Run**
5. ✅ Verifique que `evolution_instance_name` foi removido da lista

---

### **PASSO 3: Verificar/Adicionar API Key Global**

1. No **SQL Editor**, nova query
2. **Primeiro, verifique** se já existe:

```sql
SELECT chave, valor, descricao
FROM config
WHERE chave IN ('evolution_api_key', 'evolution_api_url')
ORDER BY chave;
```

3. **Se NÃO retornar nada**, execute este SQL para adicionar:

```sql
-- IMPORTANTE: Substitua [SEU_USER_ID] e [SUA_API_KEY]

-- Buscar seu user_id
SELECT id, email FROM auth.users;

-- Depois de obter o user_id acima, execute:
INSERT INTO config (user_id, chave, valor, descricao) VALUES
('[SEU_USER_ID]', 'evolution_api_key', '[SUA_API_KEY]', 'API Key global da Evolution API'),
('[SEU_USER_ID]', 'evolution_api_url', 'https://service-evolution-api.tnvro1.easypanel.host', 'URL da Evolution API');

-- Verificar se foi criado:
SELECT chave, valor FROM config WHERE chave IN ('evolution_api_key', 'evolution_api_url');
```

---

## ✅ Validação Final

Execute este SQL para confirmar que está tudo correto:

```sql
-- 1. Verificar se coluna whatsapp_config existe
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'devedores'
  AND column_name = 'whatsapp_config';

-- 2. Verificar configurações globais (deve ter 9 itens, sem evolution_instance_name)
SELECT chave, LEFT(valor, 50) as valor_preview
FROM config
ORDER BY chave;

-- 3. Ver estrutura dos devedores
SELECT id, nome, whatsapp_config
FROM devedores
LIMIT 3;
```

**Resultado esperado:**
- ✅ Coluna `whatsapp_config` existe com tipo `jsonb`
- ✅ Tabela `config` tem 9 configurações (incluindo `evolution_api_key` e `evolution_api_url`)
- ✅ **NÃO** tem mais `evolution_instance_name` na config
- ✅ Devedores têm `whatsapp_config` com valor padrão

---

## 🎯 Próximo Passo: Testar Conexão WhatsApp

Agora você pode:

1. Acessar `/whatsapp` no seu sistema
2. Clicar em "Conectar WhatsApp"
3. Escanear o QR Code
4. O sistema vai salvar automaticamente em `devedores.whatsapp_config`

---

## 🆘 Troubleshooting

### Erro: "relation devedores does not exist"
**Solução:** A tabela `devedores` não existe. Verifique o nome correto da tabela.

### Erro: "duplicate key value violates unique constraint"
**Solução:** A coluna já existe. Isso é normal, o script já trata isso.

### Não vejo `evolution_api_key` na tabela config
**Solução:** Execute o PASSO 3 para adicionar as credenciais globais.

---

## 📞 Suporte

Se tiver dúvidas, verifique:
1. Nome correto das tabelas (`devedores`, `config`)
2. Permissões no Supabase (deve ter acesso ao SQL Editor)
3. Logs do SQL Editor (aba "Messages" após executar)
