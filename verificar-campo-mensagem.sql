-- Verificar o tipo atual da coluna mensagem
SELECT
  column_name,
  data_type,
  character_maximum_length,
  is_nullable
FROM information_schema.columns
WHERE table_name = 'logs_mensagens'
  AND column_name = 'mensagem';

-- Ver o tamanho real das mensagens salvas
SELECT
  id,
  LENGTH(mensagem) as tamanho_mensagem,
  SUBSTRING(mensagem, 1, 50) as inicio,
  SUBSTRING(mensagem, LENGTH(mensagem) - 50, 50) as fim
FROM logs_mensagens
ORDER BY created_at DESC
LIMIT 5;

-- Alterar coluna para garantir que não há limite
ALTER TABLE logs_mensagens
ALTER COLUMN mensagem TYPE TEXT;

-- Verificar novamente
SELECT
  column_name,
  data_type,
  character_maximum_length
FROM information_schema.columns
WHERE table_name = 'logs_mensagens'
  AND column_name = 'mensagem';
