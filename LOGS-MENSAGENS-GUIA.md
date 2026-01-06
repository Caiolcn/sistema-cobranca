# 📊 Sistema de Logs de Mensagens

## ✅ O que foi criado:

### 1. Tabela `logs_mensagens`
Registra TODAS as mensagens enviadas pelo sistema com:

**Informações do envio:**
- ✅ Telefone que recebeu
- ✅ Mensagem completa enviada
- ✅ Data/hora exata do envio
- ✅ Status (enviado/falha)

**Dados da parcela:**
- ✅ Valor da parcela
- ✅ Data de vencimento
- ✅ Dias de atraso
- ✅ Número da parcela

**Relacionamentos:**
- ✅ Link para parcela original
- ✅ Link para devedor
- ✅ User ID (quem enviou)

**Resposta da API:**
- ✅ Response completo da Evolution API (em JSON)
- ✅ Mensagens de erro (se houver falha)

---

## 🚀 Como usar:

### 1. Criar a tabela no Supabase

Execute o arquivo `criar-tabela-logs-mensagens.sql` no Supabase SQL Editor:

```bash
1. Vá no Supabase → SQL Editor
2. Abra o arquivo: criar-tabela-logs-mensagens.sql
3. Cole TODO o conteúdo
4. Clique em RUN
```

### 2. Atualizar o workflow n8n

1. **Delete o workflow atual** no n8n
2. **Importe novamente** o `n8n-workflow-corrigido.json`
3. **Reconfigure credenciais** do Supabase
4. **Teste o workflow**

**Novo fluxo:**
```
Enviar WhatsApp
    ↓
[NOVO] Registrar Log → Salva mensagem no banco
    ↓
Atualizar Parcela
    ↓
Incrementar Contador
```

---

## 📋 Queries úteis:

### Ver últimas 50 mensagens enviadas
```sql
SELECT * FROM vw_logs_mensagens_completo LIMIT 50;
```

### Ver mensagens de um cliente específico
```sql
SELECT
  enviado_em,
  telefone,
  valor_parcela,
  dias_atraso,
  status,
  SUBSTRING(mensagem, 1, 100) as preview
FROM logs_mensagens
WHERE devedor_id = 'UUID_DO_DEVEDOR'
ORDER BY enviado_em DESC;
```

### Ver mensagens que falharam
```sql
SELECT * FROM logs_mensagens
WHERE status = 'falha'
ORDER BY enviado_em DESC;
```

### Contar mensagens enviadas hoje
```sql
SELECT COUNT(*) as total_hoje
FROM logs_mensagens
WHERE enviado_em::date = CURRENT_DATE;
```

### Relatório mensal de envios
```sql
SELECT
  enviado_em::date as data,
  COUNT(*) as total_mensagens,
  COUNT(CASE WHEN status = 'enviado' THEN 1 END) as enviadas,
  COUNT(CASE WHEN status = 'falha' THEN 1 END) as falhas
FROM logs_mensagens
WHERE enviado_em >= NOW() - INTERVAL '30 days'
GROUP BY enviado_em::date
ORDER BY data DESC;
```

### Ver mensagem exata enviada para um número
```sql
SELECT
  enviado_em,
  telefone,
  mensagem,
  valor_parcela,
  dias_atraso,
  response_api
FROM logs_mensagens
WHERE telefone = '5562982466639'
ORDER BY enviado_em DESC
LIMIT 10;
```

### Buscar por conteúdo da mensagem
```sql
SELECT * FROM logs_mensagens
WHERE mensagem ILIKE '%palavra-chave%'
ORDER BY enviado_em DESC;
```

---

## 🎯 Casos de uso:

### 1. Cliente reclamou que não recebeu
```sql
SELECT
  enviado_em,
  telefone,
  status,
  mensagem
FROM logs_mensagens
WHERE telefone = '5562XXXXXXXXX'
  AND enviado_em::date = '2025-12-18'
ORDER BY enviado_em DESC;
```

### 2. Ver todas as mensagens de uma parcela específica
```sql
SELECT * FROM logs_mensagens
WHERE parcela_id = 'UUID_DA_PARCELA'
ORDER BY enviado_em DESC;
```

### 3. Auditoria de envios
```sql
SELECT
  l.enviado_em,
  d.nome as cliente,
  l.telefone,
  l.valor_parcela,
  l.status,
  l.erro
FROM logs_mensagens l
JOIN devedores d ON l.devedor_id = d.id
WHERE l.enviado_em >= '2025-12-01'
  AND l.enviado_em < '2025-12-31'
ORDER BY l.enviado_em DESC;
```

---

## 🔧 Manutenção:

### Limpar logs antigos (mais de 1 ano)
```sql
SELECT limpar_logs_antigos();
```

### Ver tamanho da tabela
```sql
SELECT pg_size_pretty(pg_total_relation_size('logs_mensagens')) as tamanho;
```

### Ver total de registros
```sql
SELECT COUNT(*) as total_logs FROM logs_mensagens;
```

---

## 📊 VIEW `vw_logs_mensagens_completo`

Já vem com JOIN automático de devedores e parcelas para facilitar relatórios:

```sql
SELECT * FROM vw_logs_mensagens_completo
WHERE devedor_nome ILIKE '%João%'
ORDER BY enviado_em DESC;
```

Campos disponíveis:
- `enviado_em` - Data/hora
- `telefone` - Número do WhatsApp
- `status` - Status do envio
- `valor_parcela` - Valor
- `devedor_nome` - Nome do cliente
- `preview_mensagem` - Primeiros 100 caracteres
- `parcela_status_atual` - Status atual da parcela
- `erro` - Mensagem de erro (se houver)

---

## ⚠️ Importante:

1. **Privacidade**: Os logs contêm mensagens completas. Proteja o acesso!
2. **LGPD/GDPR**: Configure retenção adequada (atualmente 1 ano)
3. **Performance**: A tabela tem índices otimizados para busca rápida
4. **Backup**: Logs são críticos para auditoria - faça backup regular

---

## 🎉 Pronto!

Agora você tem:
- ✅ Registro completo de TODAS as mensagens
- ✅ Rastreamento de sucesso/falha
- ✅ Auditoria completa
- ✅ Suporte a clientes
- ✅ Análise de padrões
- ✅ Compliance com regulamentações
