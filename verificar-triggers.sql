-- Verificar triggers na tabela usuarios
SELECT
  trigger_name,
  event_manipulation,
  event_object_table,
  action_statement,
  action_timing
FROM information_schema.triggers
WHERE event_object_table = 'usuarios'
ORDER BY trigger_name;

-- Verificar funções relacionadas a usuários
SELECT
  routine_name,
  routine_type,
  routine_definition
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND (
    routine_name LIKE '%usuario%'
    OR routine_name LIKE '%user%'
    OR routine_name LIKE '%signup%'
  )
ORDER BY routine_name;
