-- ===================================
-- MIGRAÇÃO: Atualizar Tabela Config
-- ===================================

-- Adicionar coluna descricao se não existir
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'config'
        AND column_name = 'descricao'
    ) THEN
        ALTER TABLE config ADD COLUMN descricao TEXT;
    END IF;
END $$;

-- Adicionar coluna created_at se não existir
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'config'
        AND column_name = 'created_at'
    ) THEN
        ALTER TABLE config ADD COLUMN created_at TIMESTAMPTZ DEFAULT NOW();
    END IF;
END $$;

-- Adicionar coluna updated_at se não existir
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'config'
        AND column_name = 'updated_at'
    ) THEN
        ALTER TABLE config ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW();
    END IF;
END $$;

-- ===================================
-- ADICIONAR CONSTRAINT UNIQUE
-- ===================================

-- Adicionar constraint UNIQUE na coluna chave se não existir
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'config_chave_key'
        AND conrelid = 'config'::regclass
    ) THEN
        -- Remover duplicatas antes de adicionar constraint (mantém o mais antigo com base em created_at ou ctid)
        DELETE FROM config a
        WHERE a.id IN (
            SELECT id
            FROM (
                SELECT id,
                       ROW_NUMBER() OVER (PARTITION BY chave ORDER BY COALESCE(created_at, NOW()), ctid) as rn
                FROM config
            ) t
            WHERE t.rn > 1
        );

        -- Adicionar constraint UNIQUE
        ALTER TABLE config ADD CONSTRAINT config_chave_key UNIQUE (chave);
    END IF;
END $$;

-- ===================================
-- INSERIR/ATUALIZAR CONFIGURAÇÕES
-- ===================================

-- Evolution API Key
INSERT INTO config (chave, valor, descricao)
VALUES (
  'evolution_api_key',
  'SUA_API_KEY_AQUI',
  'Chave de API global da Evolution API para autenticação'
)
ON CONFLICT (chave) DO UPDATE SET
  descricao = EXCLUDED.descricao;

-- Evolution API URL
INSERT INTO config (chave, valor, descricao)
VALUES (
  'evolution_api_url',
  'https://service-evolution-api.tnvro1.easypanel.host',
  'URL base da Evolution API'
)
ON CONFLICT (chave) DO UPDATE SET
  valor = EXCLUDED.valor,
  descricao = EXCLUDED.descricao;

-- Evolution Instance Name
INSERT INTO config (chave, valor, descricao)
VALUES (
  'evolution_instance_name',
  'SUA_INSTANCIA_AQUI',
  'Nome da instância conectada na Evolution API'
)
ON CONFLICT (chave) DO UPDATE SET
  descricao = EXCLUDED.descricao;

-- n8n Webhook Lembrete
INSERT INTO config (chave, valor, descricao)
VALUES (
  'n8n_webhook_lembrete',
  'https://seu-n8n.com/webhook/lembrete-vencimento',
  'URL do webhook do n8n para enviar lembretes antes do vencimento'
)
ON CONFLICT (chave) DO UPDATE SET
  descricao = EXCLUDED.descricao;

-- n8n Webhook Vencimento Hoje
INSERT INTO config (chave, valor, descricao)
VALUES (
  'n8n_webhook_vencimento_hoje',
  'https://seu-n8n.com/webhook/vencimento-hoje',
  'URL do webhook do n8n para avisar sobre vencimento no dia'
)
ON CONFLICT (chave) DO UPDATE SET
  descricao = EXCLUDED.descricao;

-- Template Lembrete
INSERT INTO config (chave, valor, descricao)
VALUES (
  'msg_template_lembrete',
  'Olá {{nome}}! 👋

Lembramos que sua mensalidade de *{{valor}}* vence em *{{dias_restantes}} dias* ({{data_vencimento}}).

Para manter seu acesso ativo, efetue o pagamento até a data de vencimento.

Qualquer dúvida, estamos à disposição! 😊',
  'Template de mensagem para lembrete antes do vencimento'
)
ON CONFLICT (chave) DO UPDATE SET
  descricao = EXCLUDED.descricao;

-- Template Vencimento Hoje
INSERT INTO config (chave, valor, descricao)
VALUES (
  'msg_template_vencimento_hoje',
  'Olá {{nome}}! 👋

Sua mensalidade de *{{valor}}* vence *hoje* ({{data_vencimento}}).

Para evitar a suspensão do seu acesso, efetue o pagamento o quanto antes.

Qualquer dúvida, estamos à disposição! 😊',
  'Template de mensagem para vencimento no dia'
)
ON CONFLICT (chave) DO UPDATE SET
  descricao = EXCLUDED.descricao;

-- Dias Lembrete Antecipado
INSERT INTO config (chave, valor, descricao)
VALUES (
  'dias_lembrete_antecipado',
  '3',
  'Quantos dias antes do vencimento enviar lembrete automático'
)
ON CONFLICT (chave) DO UPDATE SET
  descricao = EXCLUDED.descricao;

-- Horário Envio Automático
INSERT INTO config (chave, valor, descricao)
VALUES (
  'horario_envio_automatico',
  '09:00',
  'Horário para processar e enviar mensagens automáticas (formato HH:MM)'
)
ON CONFLICT (chave) DO UPDATE SET
  descricao = EXCLUDED.descricao;

-- Automação Habilitada
INSERT INTO config (chave, valor, descricao)
VALUES (
  'automacao_habilitada',
  'false',
  'true ou false - Habilita ou desabilita o envio automático de mensagens'
)
ON CONFLICT (chave) DO UPDATE SET
  descricao = EXCLUDED.descricao;

-- ===================================
-- ÍNDICES E COMENTÁRIOS
-- ===================================

-- Criar índice para busca rápida por chave
CREATE INDEX IF NOT EXISTS idx_config_chave ON config(chave);

-- Comentários nas colunas
COMMENT ON TABLE config IS 'Configurações globais do sistema';
COMMENT ON COLUMN config.chave IS 'Identificador único da configuração';
COMMENT ON COLUMN config.valor IS 'Valor da configuração';
COMMENT ON COLUMN config.descricao IS 'Descrição do que essa configuração faz';

-- ===================================
-- POLÍTICAS RLS
-- ===================================

-- Habilitar RLS se ainda não estiver
ALTER TABLE config ENABLE ROW LEVEL SECURITY;

-- Criar policy de leitura se não existir
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE tablename = 'config'
        AND policyname = 'Permitir leitura de configurações para usuários autenticados'
    ) THEN
        CREATE POLICY "Permitir leitura de configurações para usuários autenticados"
        ON config
        FOR SELECT
        TO authenticated
        USING (true);
    END IF;
END $$;

-- ===================================
-- VERIFICAÇÃO
-- ===================================

-- Listar todas as configurações inseridas
SELECT chave,
       LEFT(valor, 50) as valor_preview,
       descricao
FROM config
ORDER BY chave;

/*
PRÓXIMOS PASSOS:

1. ✅ Execute este SQL no Supabase Dashboard → SQL Editor
2. 📋 Verifique se todas as configurações foram inseridas (query no final)
3. ✏️ Atualize os valores diretamente no Table Editor:
   - evolution_api_key: Cole sua API Key real
   - evolution_instance_name: Nome da sua instância
   - n8n_webhook_lembrete: URL do webhook do n8n
   - n8n_webhook_vencimento_hoje: URL do webhook do n8n
4. 💾 Personalize os templates de mensagens se desejar
5. 🚀 Acesse o sistema → Configurações → Automação WhatsApp
*/
