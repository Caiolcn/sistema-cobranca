-- ==========================================
-- SCRIPT DE TESTE - Verificar Parcelas
-- ==========================================

-- 1. Ver todas as parcelas cadastradas
SELECT
  p.id,
  p.numero_parcela,
  p.valor,
  p.data_vencimento,
  p.status,
  p.enviado_hoje,
  d.nome as devedor_nome
FROM parcelas p
INNER JOIN devedores d ON p.devedor_id = d.id
ORDER BY p.data_vencimento;

-- 2. Ver quantas parcelas venceram hoje ou antes
SELECT COUNT(*) as total_vencidas
FROM parcelas
WHERE data_vencimento <= CURRENT_DATE
  AND status = 'pendente';

-- 3. Ver quantas parcelas já foram enviadas hoje
SELECT COUNT(*) as total_enviadas_hoje
FROM parcelas
WHERE enviado_hoje = true;

-- 4. Ver exatamente o que a VIEW retorna (o que o n8n busca)
SELECT *
FROM vw_parcelas_para_enviar
WHERE data_vencimento <= CURRENT_DATE
  AND enviado_hoje = false;

-- 5. Ver a data atual do servidor Supabase
SELECT CURRENT_DATE as data_hoje, CURRENT_TIMESTAMP as timestamp_agora;

-- ==========================================
-- AÇÕES CORRETIVAS (se necessário)
-- ==========================================

-- Se você quiser criar uma parcela de TESTE com vencimento HOJE:
/*
INSERT INTO parcelas (
  devedor_id,
  user_id,
  numero_parcela,
  valor,
  data_vencimento,
  descricao,
  status,
  enviado_hoje
) VALUES (
  'SEU_DEVEDOR_ID_AQUI', -- Substitua pelo ID de um devedor existente
  'SEU_USER_ID_AQUI',     -- Substitua pelo seu user_id
  1,
  100.00,
  CURRENT_DATE,           -- Vence HOJE
  'Teste de envio',
  'pendente',
  false
);
*/

-- Se você quiser RESETAR o enviado_hoje para testar novamente:
/*
UPDATE parcelas
SET enviado_hoje = false
WHERE enviado_hoje = true;
*/
