-- ==========================================
-- CORRIGIR VIEW PARA INCLUIR DEVEDOR_ID
-- ==========================================

DROP VIEW IF EXISTS vw_parcelas_para_enviar;
CREATE OR REPLACE VIEW vw_parcelas_para_enviar AS
SELECT
  p.id as parcela_id,
  p.devedor_id as devedor_id,  -- ADICIONADO
  p.numero_parcela,
  p.valor as valor_em_aberto,
  p.data_vencimento,
  p.descricao,
  p.status as status_pagamento,
  p.data_ultimo_envio as ultimo_envio,
  p.enviado_hoje,
  p.total_envios,
  d.id as id_devedor,  -- ADICIONADO (alternativo)
  d.nome as nome_cliente,
  d.telefone,
  d.user_id,
  cp.plano as plano_contratado,
  cp.usage_count,
  cp.limite_mensal
FROM parcelas p
INNER JOIN devedores d ON p.devedor_id = d.id
LEFT JOIN controle_planos cp ON CAST(cp.user_id AS UUID) = d.user_id
WHERE p.status = 'pendente';

-- Verificar se a view está correta
SELECT * FROM vw_parcelas_para_enviar LIMIT 1;
