-- ===================================
-- CRIAR TABELA: mensallizap
-- ===================================
-- Tabela para rastrear todos os clientes conectados no sistema
-- Mostra quem está conectado, quando conectou/desconectou, número do WhatsApp, etc.

-- 1. Criar tabela mensallizap
CREATE TABLE IF NOT EXISTS mensallizap (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Dados do Cliente
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  nome_completo TEXT,
  email TEXT,
  telefone TEXT,
  plano TEXT,

  -- Dados do WhatsApp
  whatsapp_numero TEXT, -- Número conectado no WhatsApp
  instance_name TEXT,   -- Nome da instância Evolution API

  -- Status de Conexão
  conectado BOOLEAN DEFAULT false,
  ultima_conexao TIMESTAMPTZ,
  ultima_desconexao TIMESTAMPTZ,
  tentativas_reconexao INTEGER DEFAULT 0,

  -- Estatísticas de Uso
  total_mensagens_enviadas INTEGER DEFAULT 0,
  mensagens_mes_atual INTEGER DEFAULT 0,
  ultima_mensagem_enviada_em TIMESTAMPTZ,

  -- Metadata
  data_primeiro_acesso TIMESTAMPTZ DEFAULT NOW(),
  ip_address TEXT,
  user_agent TEXT,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Criar índices para performance
CREATE INDEX IF NOT EXISTS idx_mensallizap_user_id ON mensallizap(user_id);
CREATE INDEX IF NOT EXISTS idx_mensallizap_conectado ON mensallizap(conectado);
CREATE INDEX IF NOT EXISTS idx_mensallizap_whatsapp_numero ON mensallizap(whatsapp_numero);
CREATE INDEX IF NOT EXISTS idx_mensallizap_instance_name ON mensallizap(instance_name);
CREATE INDEX IF NOT EXISTS idx_mensallizap_ultima_conexao ON mensallizap(ultima_conexao DESC);

-- 3. Comentários explicativos
COMMENT ON TABLE mensallizap IS 'Rastreamento de clientes conectados no sistema MensalliZap';
COMMENT ON COLUMN mensallizap.user_id IS 'Referência ao usuário na tabela auth.users';
COMMENT ON COLUMN mensallizap.conectado IS 'Status atual da conexão WhatsApp';
COMMENT ON COLUMN mensallizap.whatsapp_numero IS 'Número do WhatsApp conectado (formato internacional)';
COMMENT ON COLUMN mensallizap.instance_name IS 'Nome da instância na Evolution API';
COMMENT ON COLUMN mensallizap.mensagens_mes_atual IS 'Contador de mensagens enviadas no mês atual';

-- 4. Trigger para atualizar updated_at automaticamente
CREATE OR REPLACE FUNCTION atualizar_updated_at_mensallizap()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_atualizar_updated_at_mensallizap
BEFORE UPDATE ON mensallizap
FOR EACH ROW
EXECUTE FUNCTION atualizar_updated_at_mensallizap();

-- 5. Habilitar Row Level Security (RLS)
ALTER TABLE mensallizap ENABLE ROW LEVEL SECURITY;

-- 6. Policies de Segurança

-- Policy SELECT: Cada usuário vê apenas seus próprios dados
CREATE POLICY "Usuarios veem proprios dados mensallizap"
ON mensallizap FOR SELECT
USING (auth.uid() = user_id);

-- Policy INSERT: Permite insert ao criar registro
CREATE POLICY "Permitir insert mensallizap"
ON mensallizap FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Policy UPDATE: Cada usuário atualiza apenas seus dados
CREATE POLICY "Usuarios atualizam proprios dados mensallizap"
ON mensallizap FOR UPDATE
USING (auth.uid() = user_id);

-- Policy DELETE: Usuários podem deletar seus próprios dados
CREATE POLICY "Usuarios deletam proprios dados mensallizap"
ON mensallizap FOR DELETE
USING (auth.uid() = user_id);

-- ===================================
-- FUNÇÃO: Sincronizar dados do usuário na mensallizap
-- ===================================
-- Esta função cria ou atualiza o registro do usuário na mensallizap
-- sempre que ele se conecta no sistema

CREATE OR REPLACE FUNCTION sync_mensallizap_usuario()
RETURNS TRIGGER AS $$
BEGIN
  -- Inserir ou atualizar registro na mensallizap
  INSERT INTO mensallizap (
    user_id,
    nome_completo,
    email,
    telefone,
    plano
  )
  VALUES (
    NEW.id,
    NEW.nome_completo,
    NEW.email,
    NEW.telefone,
    NEW.plano
  )
  ON CONFLICT (user_id) DO UPDATE SET
    nome_completo = EXCLUDED.nome_completo,
    email = EXCLUDED.email,
    telefone = EXCLUDED.telefone,
    plano = EXCLUDED.plano,
    updated_at = NOW();

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 7. Trigger para sincronizar automaticamente
-- Quando usuário é criado ou atualizado em 'usuarios', sincroniza na 'mensallizap'
CREATE TRIGGER trigger_sync_mensallizap_on_usuario_insert
AFTER INSERT ON usuarios
FOR EACH ROW
EXECUTE FUNCTION sync_mensallizap_usuario();

CREATE TRIGGER trigger_sync_mensallizap_on_usuario_update
AFTER UPDATE ON usuarios
FOR EACH ROW
EXECUTE FUNCTION sync_mensallizap_usuario();

-- ===================================
-- CONSTRAINT: user_id único
-- ===================================
-- Garante que cada usuário tenha apenas 1 registro na mensallizap
ALTER TABLE mensallizap ADD CONSTRAINT mensallizap_user_id_unique UNIQUE (user_id);

-- ===================================
-- POPULAR TABELA COM USUÁRIOS EXISTENTES
-- ===================================
-- Inserir todos os usuários que já existem na tabela 'usuarios'
INSERT INTO mensallizap (user_id, nome_completo, email, telefone, plano)
SELECT
  id,
  nome_completo,
  email,
  telefone,
  plano
FROM usuarios
ON CONFLICT (user_id) DO NOTHING;

-- ===================================
-- QUERIES ÚTEIS PARA CONSULTAR
-- ===================================

-- Ver todos os clientes (conectados e desconectados)
SELECT
  nome_completo,
  email,
  telefone,
  whatsapp_numero,
  plano,
  conectado,
  ultima_conexao,
  ultima_desconexao,
  total_mensagens_enviadas,
  mensagens_mes_atual,
  data_primeiro_acesso
FROM mensallizap
ORDER BY ultima_conexao DESC NULLS LAST;

-- Ver apenas clientes CONECTADOS
SELECT
  nome_completo,
  email,
  telefone,
  whatsapp_numero,
  plano,
  ultima_conexao,
  mensagens_mes_atual,
  instance_name
FROM mensallizap
WHERE conectado = true
ORDER BY ultima_conexao DESC;

-- Ver apenas clientes DESCONECTADOS
SELECT
  nome_completo,
  email,
  telefone,
  whatsapp_numero,
  plano,
  ultima_desconexao,
  tentativas_reconexao
FROM mensallizap
WHERE conectado = false
ORDER BY ultima_desconexao DESC;

-- Estatísticas gerais
SELECT
  COUNT(*) as total_clientes,
  COUNT(*) FILTER (WHERE conectado = true) as clientes_conectados,
  COUNT(*) FILTER (WHERE conectado = false) as clientes_desconectados,
  SUM(total_mensagens_enviadas) as total_mensagens_enviadas,
  SUM(mensagens_mes_atual) as mensagens_mes_atual
FROM mensallizap;

-- Top 10 clientes que mais enviaram mensagens (mês atual)
SELECT
  nome_completo,
  email,
  telefone,
  plano,
  mensagens_mes_atual,
  conectado
FROM mensallizap
ORDER BY mensagens_mes_atual DESC
LIMIT 10;

-- ===================================
-- VERIFICAÇÃO FINAL
-- ===================================

-- Verificar estrutura da tabela
SELECT
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_name = 'mensallizap'
ORDER BY ordinal_position;

-- Verificar RLS está ativo
SELECT tablename, rowsecurity
FROM pg_tables
WHERE tablename = 'mensallizap';

-- Verificar policies criadas
SELECT policyname, cmd, permissive
FROM pg_policies
WHERE tablename = 'mensallizap'
ORDER BY cmd, policyname;

-- Verificar triggers
SELECT trigger_name, event_manipulation, event_object_table
FROM information_schema.triggers
WHERE event_object_table = 'mensallizap';

/*
RESULTADO ESPERADO:
✅ Tabela 'mensallizap' criada com todas as colunas
✅ Índices criados para performance
✅ RLS ativo (rowsecurity = true)
✅ 4 policies criadas (SELECT, INSERT, UPDATE, DELETE)
✅ Triggers criados para auto-atualização
✅ Usuários existentes já sincronizados
✅ Constraint user_id único funcionando
*/
