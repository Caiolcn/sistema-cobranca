-- ==========================================
-- CORRIGIR TIPO DA COLUNA MENSAGEM
-- ==========================================

-- 1. Remover a view temporariamente
DROP VIEW IF EXISTS vw_logs_mensagens_completo;

-- 2. Alterar a coluna mensagem para TEXT (sem limite)
ALTER TABLE logs_mensagens
ALTER COLUMN mensagem TYPE TEXT;

-- 3. Recriar a view
CREATE OR REPLACE VIEW vw_logs_mensagens_completo AS
SELECT
  l.id,
  l.enviado_em,
  l.telefone,
  l.status,
  l.valor_parcela,
  l.data_vencimento,
  l.dias_atraso,
  l.numero_parcela,
  d.nome as devedor_nome,
  d.id as devedor_id,
  p.id as parcela_id,
  p.status as parcela_status_atual,
  l.mensagem, -- AGORA SEM SUBSTRING - mensagem completa
  l.erro,
  l.response_api
FROM logs_mensagens l
LEFT JOIN devedores d ON l.devedor_id = d.id
LEFT JOIN parcelas p ON l.parcela_id = p.id
ORDER BY l.enviado_em DESC;

-- 4. Verificar o tipo da coluna
SELECT
  column_name,
  data_type,
  character_maximum_length,
  is_nullable
FROM information_schema.columns
WHERE table_name = 'logs_mensagens'
  AND column_name = 'mensagem';

-- 5. Ver as mensagens completas (últimas 3)
SELECT
  id,
  enviado_em,
  telefone,
  LENGTH(mensagem) as tamanho_caracteres,
  SUBSTRING(mensagem, 1, 150) as inicio_mensagem,
  CASE
    WHEN LENGTH(mensagem) > 150 THEN '...(mensagem continua)'
    ELSE ''
  END as indicador
FROM logs_mensagens
ORDER BY created_at DESC
LIMIT 3;
