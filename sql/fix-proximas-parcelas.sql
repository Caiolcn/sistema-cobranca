-- Script para corrigir mensalidades sem is_mensalidade e criar próximas parcelas
-- Conta: pilatescarolribeiro@outlook.com
-- Clientes: Joelma Borges da Silva, Lara Roberta da Silva Faria
-- Data: 2026-02-07

-- ============================================
-- PASSO 1: Atualizar is_mensalidade para true em TODAS as mensalidades
-- de clientes com assinatura ativa (previne o problema globalmente)
-- ============================================
UPDATE mensalidades m
SET is_mensalidade = true
FROM devedores d
WHERE m.devedor_id = d.id
  AND d.assinatura_ativa = true
  AND (m.is_mensalidade IS NULL OR m.is_mensalidade = false);

-- ============================================
-- PASSO 2: Criar próximas parcelas para Joelma e Lara
-- A mensalidade paga foi em 02/02/2026, então a próxima é 02/03/2026
-- ============================================

-- Criar próxima mensalidade para JOELMA BORGES DA SILVA
INSERT INTO mensalidades (user_id, devedor_id, valor, data_vencimento, status, is_mensalidade, numero_mensalidade)
SELECT
  d.user_id,
  d.id,
  COALESCE(p.valor, 180.00),
  '2026-03-02',
  'pendente',
  true,
  COALESCE((SELECT MAX(numero_mensalidade) FROM mensalidades WHERE devedor_id = d.id), 0) + 1
FROM devedores d
LEFT JOIN planos p ON d.plano_id = p.id
JOIN auth.users u ON d.user_id = u.id
WHERE u.email = 'pilatescarolribeiro@outlook.com'
  AND d.nome ILIKE '%Joelma Borges%'
  AND NOT EXISTS (
    SELECT 1 FROM mensalidades m
    WHERE m.devedor_id = d.id
    AND m.data_vencimento = '2026-03-02'
  );

-- Criar próxima mensalidade para LARA ROBERTA DA SILVA FARIA
INSERT INTO mensalidades (user_id, devedor_id, valor, data_vencimento, status, is_mensalidade, numero_mensalidade)
SELECT
  d.user_id,
  d.id,
  COALESCE(p.valor, 180.00),
  '2026-03-02',
  'pendente',
  true,
  COALESCE((SELECT MAX(numero_mensalidade) FROM mensalidades WHERE devedor_id = d.id), 0) + 1
FROM devedores d
LEFT JOIN planos p ON d.plano_id = p.id
JOIN auth.users u ON d.user_id = u.id
WHERE u.email = 'pilatescarolribeiro@outlook.com'
  AND d.nome ILIKE '%Lara Roberta%'
  AND NOT EXISTS (
    SELECT 1 FROM mensalidades m
    WHERE m.devedor_id = d.id
    AND m.data_vencimento = '2026-03-02'
  );

-- ============================================
-- PASSO 3: Verificar se as mensalidades foram criadas
-- ============================================
SELECT m.id, d.nome, m.data_vencimento, m.valor, m.status, m.is_mensalidade
FROM mensalidades m
JOIN devedores d ON m.devedor_id = d.id
JOIN auth.users u ON d.user_id = u.id
WHERE u.email = 'pilatescarolribeiro@outlook.com'
  AND (d.nome ILIKE '%Joelma Borges%' OR d.nome ILIKE '%Lara Roberta%')
ORDER BY d.nome, m.data_vencimento DESC;
