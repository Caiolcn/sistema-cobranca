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
-- ESTRUTURA DO JSONB whatsapp_config
-- ===================================
/*
ARQUITETURA:
- API Key e URL: Globais (tabela config)
- Instance Name: Individual por cliente (neste campo)

{
  "evolution_instance_name": "cliente-joao-academia",  // Nome ÚNICO da instância do cliente
  "conectado": true,                                    // Status de conexão
  "ultima_conexao": "2026-01-13T15:30:00Z",            // Timestamp da última conexão
  "numero_whatsapp": "5511999999999"                    // Número conectado (opcional)
}
*/

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

-- Contar clientes com WhatsApp conectado
SELECT
    COUNT(*) as total_clientes,
    COUNT(*) FILTER (WHERE whatsapp_config->>'conectado' = 'true') as com_whatsapp_conectado,
    COUNT(*) FILTER (WHERE whatsapp_config->>'conectado' = 'false' OR whatsapp_config->>'conectado' IS NULL) as sem_whatsapp
FROM devedores;

/*
PRÓXIMOS PASSOS:

1. ✅ Execute este SQL no Supabase
2. Configure na tabela config (GLOBAL):
   - evolution_api_key: SUA API KEY (compartilhada por todos)
   - evolution_api_url: URL da Evolution API
3. Na tela de "Conectar WhatsApp" do cliente:
   - Cliente cria sua instância única
   - Salve evolution_instance_name no whatsapp_config do cliente
4. Ao enviar mensagens:
   - Use API Key/URL global (da config)
   - Use instance_name individual (do whatsapp_config)
*/
