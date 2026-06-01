-- ==========================================
-- ADICIONAR IMAGEM ÀS CAMPANHAS WHATSAPP
-- Permite anexar uma imagem (enviada como mídia com legenda)
-- ==========================================

ALTER TABLE campanhas ADD COLUMN IF NOT EXISTS imagem_url TEXT;

SELECT 'campanhas' as tabela, column_name, data_type
FROM information_schema.columns WHERE table_name = 'campanhas' ORDER BY ordinal_position;
