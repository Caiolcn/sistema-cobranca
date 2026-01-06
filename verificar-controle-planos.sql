-- Verificar estrutura da tabela controle_planos
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'controle_planos'
ORDER BY ordinal_position;

-- Ver dados atuais
SELECT * FROM controle_planos;
