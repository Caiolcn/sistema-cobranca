-- ===================================
-- VERIFICAR E CORRIGIR TABELA MENSALLIZAP
-- ===================================

-- 1. Ver dados atuais da sua conta
SELECT
  nome_completo,
  conectado,
  ultima_conexao AT TIME ZONE 'America/Sao_Paulo' as ultima_conexao_br,
  ultima_desconexao AT TIME ZONE 'America/Sao_Paulo' as ultima_desconexao_br,
  instance_name,
  whatsapp_numero,
  created_at AT TIME ZONE 'America/Sao_Paulo' as criado_em_br,
  updated_at AT TIME ZONE 'America/Sao_Paulo' as atualizado_em_br
FROM mensallizap
WHERE user_id = auth.uid();

-- 2. Ver dados RAW (sem conversão de timezone)
SELECT
  nome_completo,
  conectado,
  ultima_conexao,
  ultima_desconexao,
  updated_at
FROM mensallizap
WHERE user_id = auth.uid();

-- 3. Testar UPDATE manual (para ver se funciona)
-- DESCOMENTE AS LINHAS ABAIXO PARA TESTAR:

-- UPDATE mensallizap
-- SET
--   ultima_conexao = NOW(),
--   conectado = true,
--   updated_at = NOW()
-- WHERE user_id = auth.uid();

-- 4. Verificar constraint e índices
SELECT
  conname as constraint_name,
  contype as constraint_type
FROM pg_constraint
WHERE conrelid = 'mensallizap'::regclass;

-- 5. Ver todas as colunas da tabela
SELECT
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_name = 'mensallizap'
ORDER BY ordinal_position;

/*
DIAGNÓSTICO:
- Se ultima_conexao está NULL: problema no código ou na policy
- Se ultima_desconexao tem hora errada: é UTC, não converteu para BR
- Timezone correto do Brasil: America/Sao_Paulo (UTC-3)
*/
