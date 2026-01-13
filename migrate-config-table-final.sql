-- ===================================
-- MIGRAÇÃO: Atualizar Tabela Config
-- ===================================
-- Este script é seguro para executar múltiplas vezes
-- Verifica existência de cada elemento antes de criar

-- ===================================
-- PASSO 1: ADICIONAR COLUNAS
-- ===================================

-- Adicionar coluna descricao se não existir
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
        AND table_name = 'config'
        AND column_name = 'descricao'
    ) THEN
        ALTER TABLE config ADD COLUMN descricao TEXT;
        RAISE NOTICE 'Coluna descricao adicionada';
    ELSE
        RAISE NOTICE 'Coluna descricao já existe';
    END IF;
END $$;

-- Adicionar coluna created_at se não existir
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
        AND table_name = 'config'
        AND column_name = 'created_at'
    ) THEN
        ALTER TABLE config ADD COLUMN created_at TIMESTAMPTZ DEFAULT NOW();
        RAISE NOTICE 'Coluna created_at adicionada';
    ELSE
        RAISE NOTICE 'Coluna created_at já existe';
    END IF;
END $$;

-- Adicionar coluna updated_at se não existir
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
        AND table_name = 'config'
        AND column_name = 'updated_at'
    ) THEN
        ALTER TABLE config ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW();
        RAISE NOTICE 'Coluna updated_at adicionada';
    ELSE
        RAISE NOTICE 'Coluna updated_at já existe';
    END IF;
END $$;

-- ===================================
-- PASSO 2: REMOVER DUPLICATAS
-- ===================================

-- Remover duplicatas ANTES de adicionar constraint UNIQUE
-- Mantém o registro mais antigo com base em created_at ou ctid
DO $$
DECLARE
    deleted_count INTEGER;
BEGIN
    -- Criar tabela temporária com IDs a deletar
    CREATE TEMP TABLE IF NOT EXISTS ids_para_deletar AS
    SELECT id
    FROM (
        SELECT id,
               ROW_NUMBER() OVER (
                   PARTITION BY chave
                   ORDER BY COALESCE(created_at, NOW()), ctid
               ) as rn
        FROM config
    ) t
    WHERE t.rn > 1;

    -- Contar quantos registros serão deletados
    SELECT COUNT(*) INTO deleted_count FROM ids_para_deletar;

    IF deleted_count > 0 THEN
        -- Deletar duplicatas
        DELETE FROM config
        WHERE id IN (SELECT id FROM ids_para_deletar);

        RAISE NOTICE 'Removidas % duplicatas da tabela config', deleted_count;
    ELSE
        RAISE NOTICE 'Nenhuma duplicata encontrada';
    END IF;

    -- Limpar tabela temporária
    DROP TABLE IF EXISTS ids_para_deletar;
END $$;

-- ===================================
-- PASSO 3: ADICIONAR CONSTRAINT UNIQUE
-- ===================================

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'config_chave_key'
        AND conrelid = 'config'::regclass
    ) THEN
        ALTER TABLE config ADD CONSTRAINT config_chave_key UNIQUE (chave);
        RAISE NOTICE 'Constraint UNIQUE adicionada na coluna chave';
    ELSE
        RAISE NOTICE 'Constraint UNIQUE já existe';
    END IF;
END $$;

-- ===================================
-- PASSO 4: OBTER USER_ID DO PRIMEIRO USUÁRIO
-- ===================================

-- Variável para armazenar o user_id
DO $$
DECLARE
    v_user_id UUID;
BEGIN
    -- Buscar o primeiro user_id da tabela auth.users
    -- Se você tiver múltiplos usuários, ajuste a query conforme necessário
    SELECT id INTO v_user_id
    FROM auth.users
    LIMIT 1;

    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Nenhum usuário encontrado na tabela auth.users. Crie um usuário primeiro.';
    END IF;

    RAISE NOTICE 'Usando user_id: %', v_user_id;

    -- Armazenar em uma configuração temporária para uso nos INSERTs seguintes
    CREATE TEMP TABLE IF NOT EXISTS temp_user_id (user_id UUID);
    DELETE FROM temp_user_id;
    INSERT INTO temp_user_id VALUES (v_user_id);
END $$;

-- ===================================
-- PASSO 5: INSERIR/ATUALIZAR CONFIGURAÇÕES
-- ===================================

-- Evolution API Key
INSERT INTO config (user_id, chave, valor, descricao)
SELECT
    user_id,
    'evolution_api_key',
    'SUA_API_KEY_AQUI',
    'Chave de API global da Evolution API para autenticação'
FROM temp_user_id
ON CONFLICT (chave) DO UPDATE SET
  descricao = EXCLUDED.descricao,
  updated_at = NOW();

-- Evolution API URL
INSERT INTO config (user_id, chave, valor, descricao)
SELECT
    user_id,
    'evolution_api_url',
    'https://service-evolution-api.tnvro1.easypanel.host',
    'URL base da Evolution API'
FROM temp_user_id
ON CONFLICT (chave) DO UPDATE SET
  valor = EXCLUDED.valor,
  descricao = EXCLUDED.descricao,
  updated_at = NOW();

-- Evolution Instance Name
INSERT INTO config (user_id, chave, valor, descricao)
SELECT
    user_id,
    'evolution_instance_name',
    'SUA_INSTANCIA_AQUI',
    'Nome da instância conectada na Evolution API'
FROM temp_user_id
ON CONFLICT (chave) DO UPDATE SET
  descricao = EXCLUDED.descricao,
  updated_at = NOW();

-- n8n Webhook Lembrete
INSERT INTO config (user_id, chave, valor, descricao)
SELECT
    user_id,
    'n8n_webhook_lembrete',
    'https://seu-n8n.com/webhook/lembrete-vencimento',
    'URL do webhook do n8n para enviar lembretes antes do vencimento'
FROM temp_user_id
ON CONFLICT (chave) DO UPDATE SET
  descricao = EXCLUDED.descricao,
  updated_at = NOW();

-- n8n Webhook Vencimento Hoje
INSERT INTO config (user_id, chave, valor, descricao)
SELECT
    user_id,
    'n8n_webhook_vencimento_hoje',
    'https://seu-n8n.com/webhook/vencimento-hoje',
    'URL do webhook do n8n para avisar sobre vencimento no dia'
FROM temp_user_id
ON CONFLICT (chave) DO UPDATE SET
  descricao = EXCLUDED.descricao,
  updated_at = NOW();

-- Template Lembrete
INSERT INTO config (user_id, chave, valor, descricao)
SELECT
    user_id,
    'msg_template_lembrete',
    'Olá {{nome}}! 👋

Lembramos que sua mensalidade de *{{valor}}* vence em *{{dias_restantes}} dias* ({{data_vencimento}}).

Para manter seu acesso ativo, efetue o pagamento até a data de vencimento.

Qualquer dúvida, estamos à disposição! 😊',
    'Template de mensagem para lembrete antes do vencimento'
FROM temp_user_id
ON CONFLICT (chave) DO UPDATE SET
  descricao = EXCLUDED.descricao,
  updated_at = NOW();

-- Template Vencimento Hoje
INSERT INTO config (user_id, chave, valor, descricao)
SELECT
    user_id,
    'msg_template_vencimento_hoje',
    'Olá {{nome}}! 👋

Sua mensalidade de *{{valor}}* vence *hoje* ({{data_vencimento}}).

Para evitar a suspensão do seu acesso, efetue o pagamento o quanto antes.

Qualquer dúvida, estamos à disposição! 😊',
    'Template de mensagem para vencimento no dia'
FROM temp_user_id
ON CONFLICT (chave) DO UPDATE SET
  descricao = EXCLUDED.descricao,
  updated_at = NOW();

-- Dias Lembrete Antecipado
INSERT INTO config (user_id, chave, valor, descricao)
SELECT
    user_id,
    'dias_lembrete_antecipado',
    '3',
    'Quantos dias antes do vencimento enviar lembrete automático'
FROM temp_user_id
ON CONFLICT (chave) DO UPDATE SET
  descricao = EXCLUDED.descricao,
  updated_at = NOW();

-- Horário Envio Automático
INSERT INTO config (user_id, chave, valor, descricao)
SELECT
    user_id,
    'horario_envio_automatico',
    '09:00',
    'Horário para processar e enviar mensagens automáticas (formato HH:MM)'
FROM temp_user_id
ON CONFLICT (chave) DO UPDATE SET
  descricao = EXCLUDED.descricao,
  updated_at = NOW();

-- Automação Habilitada
INSERT INTO config (user_id, chave, valor, descricao)
SELECT
    user_id,
    'automacao_habilitada',
    'false',
    'true ou false - Habilita ou desabilita o envio automático de mensagens'
FROM temp_user_id
ON CONFLICT (chave) DO UPDATE SET
  descricao = EXCLUDED.descricao,
  updated_at = NOW();

-- Limpar tabela temporária
DROP TABLE IF EXISTS temp_user_id;

-- ===================================
-- PASSO 6: ÍNDICES E COMENTÁRIOS
-- ===================================

-- Criar índice para busca rápida por chave
CREATE INDEX IF NOT EXISTS idx_config_chave ON config(chave);

-- Comentários nas colunas
COMMENT ON TABLE config IS 'Configurações globais do sistema';
COMMENT ON COLUMN config.chave IS 'Identificador único da configuração';
COMMENT ON COLUMN config.valor IS 'Valor da configuração';
COMMENT ON COLUMN config.descricao IS 'Descrição do que essa configuração faz';

-- ===================================
-- PASSO 7: POLÍTICAS RLS
-- ===================================

-- Habilitar RLS se ainda não estiver
ALTER TABLE config ENABLE ROW LEVEL SECURITY;

-- Remover policy antiga se existir (para recriar)
DROP POLICY IF EXISTS "Permitir leitura de configurações para usuários autenticados" ON config;

-- Criar policy de leitura
CREATE POLICY "Permitir leitura de configurações para usuários autenticados"
ON config
FOR SELECT
TO authenticated
USING (true);

-- ===================================
-- PASSO 8: VERIFICAÇÃO
-- ===================================

-- Listar todas as configurações inseridas
SELECT
    chave,
    LEFT(valor, 50) as valor_preview,
    descricao,
    created_at,
    updated_at
FROM config
ORDER BY chave;

-- Contar registros por chave (deve ser 1 para cada)
SELECT
    chave,
    COUNT(*) as total,
    CASE
        WHEN COUNT(*) = 1 THEN '✅ OK'
        ELSE '❌ DUPLICADO'
    END as status
FROM config
GROUP BY chave
ORDER BY chave;

-- ===================================
-- RESULTADO ESPERADO
-- ===================================
-- Você deve ver 10 configurações listadas
-- Todas com status '✅ OK'
-- Nenhuma duplicata deve existir
