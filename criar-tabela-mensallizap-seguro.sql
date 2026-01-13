-- ===================================
-- CRIAR TABELA: mensallizap (VERSÃO SEGURA)
-- ===================================
-- Este script verifica se cada elemento já existe antes de criar
-- Pode ser executado múltiplas vezes sem erro

-- 1. Criar tabela mensallizap (SE NÃO EXISTIR)
CREATE TABLE IF NOT EXISTS mensallizap (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Dados do Cliente
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  nome_completo TEXT,
  email TEXT,
  telefone TEXT,
  plano TEXT,

  -- Dados do WhatsApp
  whatsapp_numero TEXT,
  instance_name TEXT,

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

-- 2. Criar índices (SE NÃO EXISTIREM)
CREATE INDEX IF NOT EXISTS idx_mensallizap_user_id ON mensallizap(user_id);
CREATE INDEX IF NOT EXISTS idx_mensallizap_conectado ON mensallizap(conectado);
CREATE INDEX IF NOT EXISTS idx_mensallizap_whatsapp_numero ON mensallizap(whatsapp_numero);
CREATE INDEX IF NOT EXISTS idx_mensallizap_instance_name ON mensallizap(instance_name);
CREATE INDEX IF NOT EXISTS idx_mensallizap_ultima_conexao ON mensallizap(ultima_conexao DESC);

-- 3. Adicionar constraint UNIQUE em user_id (SE NÃO EXISTIR)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'mensallizap_user_id_unique'
    ) THEN
        ALTER TABLE mensallizap ADD CONSTRAINT mensallizap_user_id_unique UNIQUE (user_id);
        RAISE NOTICE 'Constraint user_id_unique criada';
    ELSE
        RAISE NOTICE 'Constraint user_id_unique já existe';
    END IF;
END $$;

-- 4. Criar função para atualizar updated_at (SUBSTITUIR SE EXISTIR)
CREATE OR REPLACE FUNCTION atualizar_updated_at_mensallizap()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 5. Criar trigger para updated_at (SE NÃO EXISTIR)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger
        WHERE tgname = 'trigger_atualizar_updated_at_mensallizap'
    ) THEN
        CREATE TRIGGER trigger_atualizar_updated_at_mensallizap
        BEFORE UPDATE ON mensallizap
        FOR EACH ROW
        EXECUTE FUNCTION atualizar_updated_at_mensallizap();
        RAISE NOTICE 'Trigger updated_at criado';
    ELSE
        RAISE NOTICE 'Trigger updated_at já existe';
    END IF;
END $$;

-- 6. Habilitar Row Level Security (RLS)
ALTER TABLE mensallizap ENABLE ROW LEVEL SECURITY;

-- 7. Criar policies de segurança (SE NÃO EXISTIREM)

-- Policy SELECT
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE tablename = 'mensallizap' AND policyname = 'Usuarios veem proprios dados mensallizap'
    ) THEN
        CREATE POLICY "Usuarios veem proprios dados mensallizap"
        ON mensallizap FOR SELECT
        USING (auth.uid() = user_id);
        RAISE NOTICE 'Policy SELECT criada';
    ELSE
        RAISE NOTICE 'Policy SELECT já existe';
    END IF;
END $$;

-- Policy INSERT
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE tablename = 'mensallizap' AND policyname = 'Permitir insert mensallizap'
    ) THEN
        CREATE POLICY "Permitir insert mensallizap"
        ON mensallizap FOR INSERT
        WITH CHECK (auth.uid() = user_id);
        RAISE NOTICE 'Policy INSERT criada';
    ELSE
        RAISE NOTICE 'Policy INSERT já existe';
    END IF;
END $$;

-- Policy UPDATE
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE tablename = 'mensallizap' AND policyname = 'Usuarios atualizam proprios dados mensallizap'
    ) THEN
        CREATE POLICY "Usuarios atualizam proprios dados mensallizap"
        ON mensallizap FOR UPDATE
        USING (auth.uid() = user_id);
        RAISE NOTICE 'Policy UPDATE criada';
    ELSE
        RAISE NOTICE 'Policy UPDATE já existe';
    END IF;
END $$;

-- Policy DELETE
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE tablename = 'mensallizap' AND policyname = 'Usuarios deletam proprios dados mensallizap'
    ) THEN
        CREATE POLICY "Usuarios deletam proprios dados mensallizap"
        ON mensallizap FOR DELETE
        USING (auth.uid() = user_id);
        RAISE NOTICE 'Policy DELETE criada';
    ELSE
        RAISE NOTICE 'Policy DELETE já existe';
    END IF;
END $$;

-- 8. Criar função para sincronizar dados do usuário (SUBSTITUIR SE EXISTIR)
CREATE OR REPLACE FUNCTION sync_mensallizap_usuario()
RETURNS TRIGGER AS $$
BEGIN
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

-- 9. Criar triggers de sincronização (SE NÃO EXISTIREM)

-- Trigger INSERT
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger
        WHERE tgname = 'trigger_sync_mensallizap_on_usuario_insert'
    ) THEN
        CREATE TRIGGER trigger_sync_mensallizap_on_usuario_insert
        AFTER INSERT ON usuarios
        FOR EACH ROW
        EXECUTE FUNCTION sync_mensallizap_usuario();
        RAISE NOTICE 'Trigger sync INSERT criado';
    ELSE
        RAISE NOTICE 'Trigger sync INSERT já existe';
    END IF;
END $$;

-- Trigger UPDATE
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger
        WHERE tgname = 'trigger_sync_mensallizap_on_usuario_update'
    ) THEN
        CREATE TRIGGER trigger_sync_mensallizap_on_usuario_update
        AFTER UPDATE ON usuarios
        FOR EACH ROW
        EXECUTE FUNCTION sync_mensallizap_usuario();
        RAISE NOTICE 'Trigger sync UPDATE criado';
    ELSE
        RAISE NOTICE 'Trigger sync UPDATE já existe';
    END IF;
END $$;

-- 10. Popular tabela com usuários existentes
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
-- VERIFICAÇÃO FINAL
-- ===================================

-- Contar registros na mensallizap
SELECT COUNT(*) as total_registros FROM mensallizap;

-- Ver estrutura da tabela
SELECT
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_name = 'mensallizap'
ORDER BY ordinal_position;

-- Verificar RLS está ativo
SELECT tablename, rowsecurity
FROM pg_tables
WHERE tablename = 'mensallizap';

-- Verificar policies criadas
SELECT policyname, cmd
FROM pg_policies
WHERE tablename = 'mensallizap'
ORDER BY cmd, policyname;

-- Verificar triggers
SELECT trigger_name, event_manipulation
FROM information_schema.triggers
WHERE event_object_table = 'mensallizap'
ORDER BY trigger_name;

/*
✅ RESULTADO ESPERADO:
- Tabela 'mensallizap' existe
- Total_registros = número de usuários já cadastrados
- RLS ativo (rowsecurity = true)
- 4 policies: SELECT, INSERT, UPDATE, DELETE
- 3 triggers: updated_at, sync INSERT, sync UPDATE
*/

-- ===================================
-- TESTE RÁPIDO
-- ===================================

-- Ver seus dados na tabela
SELECT
  nome_completo,
  email,
  conectado,
  ultima_conexao,
  plano
FROM mensallizap
WHERE user_id = auth.uid();
