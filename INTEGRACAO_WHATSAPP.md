# Integração WhatsApp - Evolution API

## 🚀 Implementação Completa

A integração com WhatsApp via Evolution API foi implementada com sucesso no sistema! Agora você pode enviar cobranças automaticamente.

## 📋 O que foi implementado?

### 1. **Banco de Dados**
Criado arquivo `supabase-migrations.sql` com:
- ✅ Tabela `templates` - Armazena templates de mensagens personalizáveis
- ✅ Tabela `logs_mensagens` - Registra todas as mensagens enviadas com status
- ✅ Campos adicionais na tabela `parcelas`:
  - `enviado_hoje` - Controla se já foi enviado hoje
  - `ultima_mensagem_enviada_em` - Timestamp do último envio
  - `total_mensagens_enviadas` - Contador de envios

### 2. **Serviço WhatsApp** (`src/services/whatsappService.js`)
Criado serviço completo com:
- ✅ Integração direta com Evolution API
- ✅ Substituição automática de variáveis do template
- ✅ Formatação de telefone para padrão internacional
- ✅ Envio individual e em lote
- ✅ Log automático de todas as mensagens
- ✅ Atualização de status das parcelas

### 3. **Persistência de Templates**
- ✅ Salvar templates no banco de dados
- ✅ Carregar templates salvos
- ✅ Template padrão automático
- ✅ Editor com preview em tempo real

### 4. **Envio de Mensagens**
- ✅ Botão de envio na fila do Dashboard
- ✅ Confirmação antes de enviar
- ✅ Feedback visual durante envio
- ✅ Mensagem de sucesso/erro

## 🔧 Como Configurar

### Passo 1: Executar Migrations no Supabase

1. Acesse seu projeto no Supabase
2. Vá em **SQL Editor**
3. Copie o conteúdo do arquivo `supabase-migrations.sql`
4. Execute o SQL
5. Verifique se as tabelas foram criadas:
   - `templates`
   - `logs_mensagens`
   - Campos novos em `parcelas`

### Passo 2: Conectar WhatsApp

1. No sistema, acesse **WhatsApp** no menu lateral
2. Na aba **Conexão**, clique em "Gerar QR Code"
3. Abra o WhatsApp no celular
4. Vá em **Mais opções** > **Dispositivos conectados** > **Conectar dispositivo**
5. Escaneie o QR Code
6. Aguarde a confirmação de conexão

### Passo 3: Configurar Template

1. No sistema, vá para aba **Templates de Mensagens**
2. Edite o template padrão ou crie um novo
3. Use as variáveis disponíveis:
   - `{{nomeCliente}}` - Nome do cliente
   - `{{telefone}}` - Telefone do cliente
   - `{{valorParcela}}` - Valor formatado (R$ 150,00)
   - `{{dataVencimento}}` - Data formatada (06/01/2026)
   - `{{diasAtraso}}` - Número de dias em atraso
   - `{{nomeEmpresa}}` - Nome da sua empresa
4. Visualize o preview no lado direito
5. Clique em **Salvar Template**

### Passo 4: Enviar Cobranças

#### Envio Manual (Dashboard):
1. No **Dashboard**, veja a seção **Fila de WhatsApp**
2. Clique no ícone do WhatsApp verde em cada item
3. Confirme o envio
4. Aguarde o feedback

#### Envio via Código:
```javascript
import whatsappService from './services/whatsappService'

// Enviar para uma parcela específica
const resultado = await whatsappService.enviarCobranca(parcelaId)

if (resultado.sucesso) {
  console.log('Mensagem enviada!', resultado.messageId)
} else {
  console.error('Erro:', resultado.erro)
}

// Enviar em lote
const parcelaIds = ['id1', 'id2', 'id3']
const resultados = await whatsappService.enviarCobrancasLote(parcelaIds)
```

## 📊 Variáveis Disponíveis nos Templates

| Variável | Descrição | Exemplo |
|----------|-----------|---------|
| `{{nomeCliente}}` | Nome completo do cliente | João Silva |
| `{{telefone}}` | Telefone do cliente | (62) 98246-6639 |
| `{{valorParcela}}` | Valor formatado em reais | R$ 150,00 |
| `{{dataVencimento}}` | Data de vencimento | 06/01/2026 |
| `{{diasAtraso}}` | Dias em atraso | 5 |
| `{{nomeEmpresa}}` | Nome da empresa | Minha Empresa |

## 🔐 Formatação de Telefone

O sistema automaticamente formata telefones para o padrão internacional:
- Remove caracteres especiais
- Adiciona código do Brasil (55) se necessário
- Adiciona sufixo `@s.whatsapp.net`

Exemplos:
- `(62) 98246-6639` → `5562982466639@s.whatsapp.net`
- `11987654321` → `5511987654321@s.whatsapp.net`

## 📝 Logs de Mensagens

Todas as mensagens são registradas na tabela `logs_mensagens` com:
- ✅ Status: pendente, enviado, entregue, lido, erro
- ✅ Conteúdo da mensagem enviada
- ✅ Dados do cliente e parcela
- ✅ ID da mensagem na Evolution API
- ✅ Timestamps de envio/entrega/leitura
- ✅ Erros (se houver)

### Verificar logs:
```javascript
const { data: logs } = await supabase
  .from('logs_mensagens')
  .select('*')
  .order('enviado_em', { ascending: false })
  .limit(10)
```

## 🤖 Automação (Próximos Passos)

Para envios automáticos, você pode:

### Opção 1: Cron Job Manual
Criar um script que rode diariamente:
```javascript
// scripts/enviar-cobrancas-automatico.js
import whatsappService from './src/services/whatsappService'
import { supabase } from './src/supabaseClient'

async function enviarCobrancasAutomaticas() {
  // Buscar parcelas vencidas que não foram enviadas hoje
  const { data: parcelas } = await supabase
    .from('parcelas')
    .select('id')
    .eq('status', 'pendente')
    .eq('enviado_hoje', false)
    .lte('data_vencimento', new Date().toISOString().split('T')[0])

  if (!parcelas || parcelas.length === 0) {
    console.log('Nenhuma cobrança para enviar')
    return
  }

  console.log(`Enviando ${parcelas.length} cobranças...`)
  const parcelaIds = parcelas.map(p => p.id)
  const resultados = await whatsappService.enviarCobrancasLote(parcelaIds)

  console.log('Resultados:', resultados)
}

enviarCobrancasAutomaticas()
```

### Opção 2: Supabase Edge Function
Criar uma função serverless que roda via cron:
```sql
-- Criar função que retorna parcelas para envio
CREATE OR REPLACE FUNCTION get_parcelas_para_envio(user_uuid UUID)
RETURNS TABLE (
  id UUID,
  devedor_id UUID,
  valor NUMERIC,
  data_vencimento DATE
) AS $$
BEGIN
  RETURN QUERY
  SELECT p.id, p.devedor_id, p.valor, p.data_vencimento
  FROM parcelas p
  WHERE p.user_id = user_uuid
    AND p.status = 'pendente'
    AND p.enviado_hoje = false
    AND p.data_vencimento <= CURRENT_DATE;
END;
$$ LANGUAGE plpgsql;
```

### Opção 3: Botão "Enviar Todas"
Adicionar botão no Dashboard para enviar tudo de uma vez.

## ⚙️ Configurações Avançadas

### Resetar enviado_hoje diariamente
O sistema tem uma função SQL para resetar o campo `enviado_hoje`:
```sql
SELECT reset_enviado_hoje();
```

Configure um cron no Supabase ou no seu servidor para rodar isso todo dia às 00:00.

### Intervalo entre envios
Por padrão, há um delay de 2 segundos entre cada envio em lote. Para ajustar:
```javascript
// Em whatsappService.js, linha ~257
await new Promise(resolve => setTimeout(resolve, 2000)) // Altere 2000 para o valor desejado em ms
```

## 🛠️ Solução de Problemas

### "WhatsApp não configurado"
- Verifique se a tabela `config` tem os campos `evolution_api_key` e `evolution_api_url`
- Certifique-se de que o WhatsApp está conectado (indicador verde no menu)

### "Nenhum template de mensagem configurado"
- Acesse **WhatsApp** > **Templates de Mensagens**
- Salve pelo menos um template

### "Erro ao enviar mensagem"
- Verifique se o WhatsApp está conectado
- Confira se o telefone está no formato correto
- Veja os logs em `logs_mensagens` para mais detalhes

### Telefone não recebe
- Verifique se o número existe no WhatsApp
- Confirme se o formato está correto (com DDD e código do país)
- Aguarde alguns minutos (pode haver delay da operadora)

## 📞 Suporte

Em caso de dúvidas ou problemas:
1. Verifique os logs no console do navegador (F12)
2. Consulte a tabela `logs_mensagens` no Supabase
3. Verifique o status da Evolution API

## ✅ Checklist de Implementação

- [x] Criar tabelas no Supabase
- [x] Implementar serviço WhatsApp
- [x] Substituição de variáveis
- [x] Persistência de templates
- [x] Envio via Dashboard
- [x] Logs de mensagens
- [x] Atualização de parcelas
- [ ] Configurar automação (cron/scheduler)
- [ ] Implementar webhooks para status (entregue/lido)
- [ ] Botão "Enviar Todas" no Dashboard

## 🎉 Pronto!

A integração está completa e funcional. Agora você pode:
- ✅ Conectar seu WhatsApp
- ✅ Criar templates personalizados
- ✅ Enviar cobranças manualmente
- ✅ Ver logs de todas as mensagens
- ✅ Rastrear status de envio

Próximos passos sugeridos: implementar envio automático agendado!
