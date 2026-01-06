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
3. Edite o registro com chave 'evolution_api_key'
4. Cole sua chave real da Evolution API
5. Salve

SEGURANÇA:
- Nunca exponha essa tabela publicamente
- RLS está ativado: apenas usuários autenticados podem ler
- Para atualizar via código, você precisará criar policies específicas
*/
