-- =============================================
-- SALDO EM CONTA - Mensalli
-- Adiciona campos para o usuário registrar/ajustar
-- manualmente o saldo da conta bancária.
--
-- saldo_inicial      = valor de referência informado pelo usuário
-- saldo_inicial_data = data a partir da qual receitas/despesas
--                      são somadas/subtraídas para calcular o
--                      saldo atual.
-- =============================================

ALTER TABLE usuarios
  ADD COLUMN IF NOT EXISTS saldo_inicial NUMERIC(15, 2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS saldo_inicial_data DATE;
