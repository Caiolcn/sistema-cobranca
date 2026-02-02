-- =============================================
-- PORTAL DO CLIENTE - Migração de banco de dados
-- Rodar no Supabase SQL Editor
-- =============================================

-- 1. Adicionar coluna portal_token na tabela devedores
ALTER TABLE devedores ADD COLUMN IF NOT EXISTS portal_token VARCHAR(64) UNIQUE;

-- 2. Criar índice para buscas rápidas por token
CREATE INDEX IF NOT EXISTS idx_devedores_portal_token ON devedores(portal_token);

-- 3. Gerar token para todos os clientes existentes que não têm
UPDATE devedores
SET portal_token = replace(gen_random_uuid()::text, '-', '')
WHERE portal_token IS NULL;
