-- ===================================
-- TABELA DE CONFIGURAÇÕES GLOBAIS
-- ===================================

-- Criar tabela de configurações
CREATE TABLE IF NOT EXISTS config (
  id SERIAL PRIMARY KEY,
  chave TEXT UNIQUE NOT NULL,
  valor TEXT NOT NULL,
  descricao TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Inserir API Key da Evolution API
INSERT INTO config (chave, valor, descricao)
VALUES (
  'evolution_api_key',
  'SUA_API_KEY_AQUI',
  'Chave de API global da Evolution API para autenticação'
)
ON CONFLICT (chave) DO NOTHING;

-- Inserir URL da Evolution API (opcional, caso mude)
INSERT INTO config (chave, valor, descricao)
VALUES (
  'evolution_api_url',
  'https://service-evolution-api.tnvro1.easypanel.host',
  'URL base da Evolution API'
)
ON CONFLICT (chave) DO NOTHING;

-- Inserir nome da instância da Evolution API
INSERT INTO config (chave, valor, descricao)
VALUES (
  'evolution_instance_name',
  'SUA_INSTANCIA_AQUI',
  'Nome da instância conectada na Evolution API'
)
ON CONFLICT (chave) DO NOTHING;

-- ===================================
-- CONFIGURAÇÕES DO N8N
-- ===================================

-- URL do webhook do n8n para lembretes
INSERT INTO config (chave, valor, descricao)
VALUES (
  'n8n_webhook_lembrete',
  'https://seu-n8n.com/webhook/lembrete-vencimento',
  'URL do webhook do n8n para enviar lembretes antes do vencimento'
)
ON CONFLICT (chave) DO NOTHING;

-- URL do webhook do n8n para avisos de vencimento hoje
INSERT INTO config (chave, valor, descricao)
VALUES (
  'n8n_webhook_vencimento_hoje',
  'https://seu-n8n.com/webhook/vencimento-hoje',
  'URL do webhook do n8n para avisar sobre vencimento no dia'
)
ON CONFLICT (chave) DO NOTHING;

-- ===================================
-- TEMPLATES DE MENSAGENS
-- ===================================

-- Template: Lembrete antes do vencimento
INSERT INTO config (chave, valor, descricao)
VALUES (
  'msg_template_lembrete',
  'Olá {{nome}}! 👋

Lembramos que sua mensalidade de *{{valor}}* vence em *{{dias_restantes}} dias* ({{data_vencimento}}).

Para manter seu acesso ativo, efetue o pagamento até a data de vencimento.

Qualquer dúvida, estamos à disposição! 😊',
  'Template de mensagem para lembrete antes do vencimento'
)
ON CONFLICT (chave) DO NOTHING;

-- Template: Vencimento hoje
INSERT INTO config (chave, valor, descricao)
VALUES (
  'msg_template_vencimento_hoje',
  'Olá {{nome}}! 👋

Sua mensalidade de *{{valor}}* vence *hoje* ({{data_vencimento}}).

Para evitar a suspensão do seu acesso, efetue o pagamento o quanto antes.

Qualquer dúvida, estamos à disposição! 😊',
  'Template de mensagem para vencimento no dia'
)
ON CONFLICT (chave) DO NOTHING;

-- ===================================
-- CONFIGURAÇÕES DE AUTOMAÇÃO
-- ===================================

-- Quantos dias antes enviar lembrete
INSERT INTO config (chave, valor, descricao)
VALUES (
  'dias_lembrete_antecipado',
  '3',
  'Quantos dias antes do vencimento enviar lembrete automático'
)
ON CONFLICT (chave) DO NOTHING;

-- Horário de envio das automações (formato HH:MM)
INSERT INTO config (chave, valor, descricao)
VALUES (
  'horario_envio_automatico',
  '09:00',
  'Horário para processar e enviar mensagens automáticas (formato HH:MM)'
)
ON CONFLICT (chave) DO NOTHING;

-- Habilitar/desabilitar automação
INSERT INTO config (chave, valor, descricao)
VALUES (
  'automacao_habilitada',
  'false',
  'true ou false - Habilita ou desabilita o envio automático de mensagens'
)
ON CONFLICT (chave) DO NOTHING;

-- Criar índice para busca rápida por chave
CREATE INDEX IF NOT EXISTS idx_config_chave ON config(chave);

-- Comentários nas colunas
COMMENT ON TABLE config IS 'Configurações globais do sistema';
COMMENT ON COLUMN config.chave IS 'Identificador único da configuração';
COMMENT ON COLUMN config.valor IS 'Valor da configuração';
COMMENT ON COLUMN config.descricao IS 'Descrição do que essa configuração faz';

-- ===================================
-- POLÍTICAS RLS (Row Level Security)
-- ===================================

-- Habilitar RLS
ALTER TABLE config ENABLE ROW LEVEL SECURITY;

-- Permitir leitura para usuários autenticados
CREATE POLICY "Permitir leitura de configurações para usuários autenticados"
ON config
FOR SELECT
TO authenticated
USING (true);

-- Apenas administradores podem inserir/atualizar (você pode ajustar isso depois)
-- Por enquanto, vamos permitir apenas leitura via aplicação

-- ===================================
-- NOTAS IMPORTANTES
-- ===================================

/*
ATENÇÃO: Após executar este SQL:

1. Acesse o Supabase Dashboard
2. Vá em "Table Editor" → "config"
3. Configure os seguintes valores:

   EVOLUTION API:
   - evolution_api_key: Cole sua API Key da Evolution API
   - evolution_api_url: Verifique se a URL está correta
   - evolution_instance_name: Nome da sua instância conectada

   N8N WEBHOOKS:
   - n8n_webhook_lembrete: URL do webhook para lembretes
   - n8n_webhook_vencimento_hoje: URL do webhook para vencimento hoje

   AUTOMAÇÃO:
   - dias_lembrete_antecipado: Ajuste quantos dias antes enviar (padrão: 3)
   - horario_envio_automatico: Horário para processar (padrão: 09:00)
   - automacao_habilitada: Mude para 'true' quando estiver tudo configurado

   TEMPLATES:
   - msg_template_lembrete: Personalize a mensagem (use {{nome}}, {{valor}}, {{dias_restantes}}, {{data_vencimento}})
   - msg_template_vencimento_hoje: Personalize a mensagem

4. Salve todas as alterações

SEGURANÇA:
- Nunca exponha essa tabela publicamente
- RLS está ativado: apenas usuários autenticados podem ler
- Para atualizar via código, você precisará criar policies específicas
- As API Keys são sensíveis - mantenha em segredo

PRÓXIMOS PASSOS:
1. Execute este SQL no Supabase
2. Configure os valores reais no dashboard
3. Crie os workflows no n8n
4. Implemente a página de Configurações no React
5. Crie a função que processa e envia as mensagens automáticas
*/
