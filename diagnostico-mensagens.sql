-- ==========================================
-- DIAGNÓSTICO COMPLETO DE MENSAGENS
-- ==========================================

-- 1. Verificar o tipo e limite da coluna mensagem
SELECT
  column_name,
  data_type,
  character_maximum_length,
  is_nullable
FROM information_schema.columns
WHERE table_name = 'logs_mensagens'
  AND column_name = 'mensagem';

-- 2. Ver o tamanho real das mensagens salvas
SELECT
  id,
  LENGTH(mensagem) as tamanho_caracteres,
  SUBSTRING(mensagem, 1, 100) as primeiros_100_chars,
  SUBSTRING(mensagem, LENGTH(mensagem) - 50, 50) as ultimos_50_chars,
  enviado_em
FROM logs_mensagens
ORDER BY created_at DESC
LIMIT 5;

-- 3. Ver a mensagem COMPLETA da última entrada
SELECT
  id,
  enviado_em,
  telefone,
  LENGTH(mensagem) as tamanho,
  mensagem -- Mensagem completa
FROM logs_mensagens
ORDER BY created_at DESC
LIMIT 1;

-- 4. Garantir que a coluna seja TEXT sem limite
ALTER TABLE logs_mensagens
ALTER COLUMN mensagem TYPE TEXT;

-- 5. Verificar novamente após alteração
SELECT
  column_name,
  data_type,
  character_maximum_length
FROM information_schema.columns
WHERE table_name = 'logs_mensagens'
  AND column_name = 'mensagem';
