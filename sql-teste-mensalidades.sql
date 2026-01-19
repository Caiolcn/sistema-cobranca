-- ==========================================
-- SQL PARA TESTAR OS 3 FLUXOS DE COBRANÇA
-- MensalliZap - Execute no Supabase SQL Editor
-- ==========================================
-- IMPORTANTE: Substitua os valores marcados com <<SUBSTITUA>>
-- ==========================================

-- Primeiro, vamos descobrir um devedor válido para o seu usuário
-- Execute esta query para ver seus devedores:
-- SELECT d.id, d.nome, d.telefone, d.user_id, d.assinatura_ativa
-- FROM devedores d
-- WHERE d.assinatura_ativa = true AND (d.lixo IS NULL OR d.lixo = false)
-- LIMIT 5;

-- ==========================================
-- OPÇÃO 1: INSERIR COM IDs CONHECIDOS
-- ==========================================
-- Substitua <<DEVEDOR_ID>> pelo ID de um devedor existente

-- Mensalidade 1: Vence em 3 dias (dispara vw_parcelas_lembrete_3dias)
INSERT INTO mensalidades (
  devedor_id,
  valor,
  data_vencimento,
  descricao,
  status,
  enviado_3dias,
  enviado_no_dia,
  enviado_vencimento
) VALUES (
  '<<DEVEDOR_ID>>',  -- Substitua pelo ID do devedor
  100.00,
  CURRENT_DATE + INTERVAL '3 days',
  'TESTE - Lembrete 3 dias antes',
  'pendente',
  false,
  false,
  false
);

-- Mensalidade 2: Vence HOJE (dispara vw_parcelas_no_dia)
INSERT INTO mensalidades (
  devedor_id,
  valor,
  data_vencimento,
  descricao,
  status,
  enviado_3dias,
  enviado_no_dia,
  enviado_vencimento
) VALUES (
  '<<DEVEDOR_ID>>',  -- Substitua pelo ID do devedor
  150.00,
  CURRENT_DATE,
  'TESTE - Vencimento hoje',
  'pendente',
  false,
  false,
  false
);

-- Mensalidade 3: Venceu há 3 dias (dispara vw_parcelas_em_atraso)
INSERT INTO mensalidades (
  devedor_id,
  valor,
  data_vencimento,
  descricao,
  status,
  enviado_3dias,
  enviado_no_dia,
  enviado_vencimento
) VALUES (
  '<<DEVEDOR_ID>>',  -- Substitua pelo ID do devedor
  200.00,
  CURRENT_DATE - INTERVAL '3 days',
  'TESTE - 3 dias em atraso',
  'pendente',
  false,
  false,
  false
);

-- ==========================================
-- OPÇÃO 2: INSERIR AUTOMATICAMENTE (mais fácil)
-- ==========================================
-- Este script pega o primeiro devedor ativo do sistema

DO $$
DECLARE
  v_devedor_id UUID;
  v_user_id UUID;
BEGIN
  -- Pegar primeiro devedor ativo
  SELECT d.id, d.user_id INTO v_devedor_id, v_user_id
  FROM devedores d
  WHERE d.assinatura_ativa = true
    AND (d.lixo IS NULL OR d.lixo = false)
  LIMIT 1;

  IF v_devedor_id IS NULL THEN
    RAISE EXCEPTION 'Nenhum devedor ativo encontrado!';
  END IF;

  RAISE NOTICE 'Usando devedor: % (user: %)', v_devedor_id, v_user_id;

  -- Mensalidade 1: Vence em 3 dias
  INSERT INTO mensalidades (user_id, devedor_id, numero_mensalidade, valor, data_vencimento, descricao, status, enviado_3dias, enviado_no_dia, enviado_vencimento)
  VALUES (v_user_id, v_devedor_id, 901, 100.00, CURRENT_DATE + INTERVAL '3 days', 'TESTE - Lembrete 3 dias antes', 'pendente', false, false, false);

  -- Mensalidade 2: Vence HOJE
  INSERT INTO mensalidades (user_id, devedor_id, numero_mensalidade, valor, data_vencimento, descricao, status, enviado_3dias, enviado_no_dia, enviado_vencimento)
  VALUES (v_user_id, v_devedor_id, 902, 150.00, CURRENT_DATE, 'TESTE - Vencimento hoje', 'pendente', false, false, false);

  -- Mensalidade 3: Venceu há 3 dias
  INSERT INTO mensalidades (user_id, devedor_id, numero_mensalidade, valor, data_vencimento, descricao, status, enviado_3dias, enviado_no_dia, enviado_vencimento)
  VALUES (v_user_id, v_devedor_id, 903, 200.00, CURRENT_DATE - INTERVAL '3 days', 'TESTE - 3 dias em atraso', 'pendente', false, false, false);

  RAISE NOTICE 'Criadas 3 mensalidades de teste!';
END $$;

-- ==========================================
-- VERIFICAR SE AS VIEWS RETORNAM OS DADOS
-- ==========================================

-- Ver mensalidades de teste criadas
SELECT id, descricao, valor, data_vencimento, status, enviado_3dias, enviado_no_dia, enviado_vencimento
FROM mensalidades
WHERE descricao LIKE 'TESTE%'
ORDER BY data_vencimento;

-- Verificar o que cada view retorna
SELECT 'vw_parcelas_lembrete_3dias' as view_name, COUNT(*) as total FROM vw_parcelas_lembrete_3dias
UNION ALL
SELECT 'vw_parcelas_no_dia', COUNT(*) FROM vw_parcelas_no_dia
UNION ALL
SELECT 'vw_parcelas_em_atraso', COUNT(*) FROM vw_parcelas_em_atraso;

-- Ver detalhes de cada view
SELECT '3 DIAS ANTES' as tipo, parcela_id, nome_cliente, telefone, valor_em_aberto, data_vencimento, template_mensagem != '' as tem_template
FROM vw_parcelas_lembrete_3dias;

SELECT 'NO DIA' as tipo, parcela_id, nome_cliente, telefone, valor_em_aberto, data_vencimento, template_mensagem != '' as tem_template
FROM vw_parcelas_no_dia;

SELECT '3 DIAS DEPOIS' as tipo, parcela_id, nome_cliente, telefone, valor_em_aberto, data_vencimento, template_mensagem != '' as tem_template
FROM vw_parcelas_em_atraso;

-- ==========================================
-- LIMPAR TESTES (executar depois de testar)
-- ==========================================
-- DELETE FROM mensalidades WHERE descricao LIKE 'TESTE%';
