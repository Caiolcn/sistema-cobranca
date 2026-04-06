-- ==========================================
-- CRIAR TABELAS DE CAMPANHAS WHATSAPP
-- Disparo em massa segmentado
-- ==========================================

CREATE TABLE IF NOT EXISTS campanhas (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    titulo TEXT NOT NULL,
    mensagem TEXT NOT NULL,
    segmento TEXT NOT NULL DEFAULT 'todos',
    filtro_plano_id UUID,
    total_destinatarios INTEGER DEFAULT 0,
    total_enviados INTEGER DEFAULT 0,
    total_falhas INTEGER DEFAULT 0,
    status TEXT DEFAULT 'rascunho'
        CHECK (status IN ('rascunho', 'enviando', 'concluida', 'cancelada')),
    iniciada_em TIMESTAMPTZ,
    concluida_em TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS campanha_envios (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    campanha_id UUID NOT NULL REFERENCES campanhas(id) ON DELETE CASCADE,
    devedor_id UUID NOT NULL REFERENCES devedores(id) ON DELETE CASCADE,
    telefone TEXT,
    status TEXT DEFAULT 'pendente'
        CHECK (status IN ('pendente', 'enviado', 'falha', 'pulado')),
    erro TEXT,
    enviado_em TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_campanhas_user ON campanhas(user_id);
CREATE INDEX IF NOT EXISTS idx_campanha_envios_campanha ON campanha_envios(campanha_id);

ALTER TABLE campanhas ENABLE ROW LEVEL SECURITY;
ALTER TABLE campanha_envios ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own campanhas" ON campanhas;
CREATE POLICY "Users can view own campanhas"
    ON campanhas FOR SELECT USING (auth.uid() = user_id OR is_admin());

DROP POLICY IF EXISTS "Users can insert own campanhas" ON campanhas;
CREATE POLICY "Users can insert own campanhas"
    ON campanhas FOR INSERT WITH CHECK (auth.uid() = user_id OR is_admin());

DROP POLICY IF EXISTS "Users can update own campanhas" ON campanhas;
CREATE POLICY "Users can update own campanhas"
    ON campanhas FOR UPDATE USING (auth.uid() = user_id OR is_admin());

DROP POLICY IF EXISTS "Users can delete own campanhas" ON campanhas;
CREATE POLICY "Users can delete own campanhas"
    ON campanhas FOR DELETE USING (auth.uid() = user_id OR is_admin());

DROP POLICY IF EXISTS "Users can view own campanha_envios" ON campanha_envios;
CREATE POLICY "Users can view own campanha_envios"
    ON campanha_envios FOR SELECT
    USING (EXISTS (SELECT 1 FROM campanhas c WHERE c.id = campanha_id AND (c.user_id = auth.uid() OR is_admin())));

DROP POLICY IF EXISTS "Users can insert own campanha_envios" ON campanha_envios;
CREATE POLICY "Users can insert own campanha_envios"
    ON campanha_envios FOR INSERT
    WITH CHECK (EXISTS (SELECT 1 FROM campanhas c WHERE c.id = campanha_id AND (c.user_id = auth.uid() OR is_admin())));

DROP POLICY IF EXISTS "Users can update own campanha_envios" ON campanha_envios;
CREATE POLICY "Users can update own campanha_envios"
    ON campanha_envios FOR UPDATE
    USING (EXISTS (SELECT 1 FROM campanhas c WHERE c.id = campanha_id AND (c.user_id = auth.uid() OR is_admin())));

SELECT 'campanhas' as tabela, column_name, data_type
FROM information_schema.columns WHERE table_name = 'campanhas' ORDER BY ordinal_position;
