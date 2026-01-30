-- ============================================================
-- SQL para Features: Onboarding + Notificacao de Pagamento
-- Rodar no Supabase Dashboard > SQL Editor
-- ============================================================

-- 1. Adicionar colunas de onboarding na tabela usuarios
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN DEFAULT FALSE;
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS onboarding_step INTEGER DEFAULT 0;

-- 2. Marcar usuarios existentes como ja tendo completado o onboarding
-- (para que usuarios atuais nao sejam forçados a passar pelo wizard)
UPDATE usuarios SET onboarding_completed = TRUE WHERE status_conta = 'ativo';

-- 3. Habilitar REPLICA IDENTITY FULL na tabela mensalidades
-- (necessario para que o Supabase Realtime envie os dados antigos no payload de UPDATE)
ALTER TABLE mensalidades REPLICA IDENTITY FULL;

-- ============================================================
-- IMPORTANTE: Alem de rodar este SQL, voce precisa:
--
-- 4. No Supabase Dashboard > Database > Replication:
--    - Verificar que a tabela "mensalidades" esta adicionada
--      na publicacao realtime (supabase_realtime)
--    - Se nao estiver, adicionar manualmente
--
-- Isso permite que o hook usePaymentNotifications receba
-- eventos em tempo real quando um pagamento e confirmado.
-- ============================================================
