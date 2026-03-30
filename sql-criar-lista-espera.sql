-- ==========================================
-- CRIAR TABELA LISTA_ESPERA
-- Fila de espera para aulas lotadas
-- ==========================================

CREATE TABLE IF NOT EXISTS lista_espera (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    aula_id UUID NOT NULL REFERENCES aulas(id) ON DELETE CASCADE,
    devedor_id UUID NOT NULL REFERENCES devedores(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    data DATE NOT NULL,
    posicao INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'aguardando'
        CHECK (status IN ('aguardando', 'notificado', 'confirmado', 'expirado', 'cancelado')),
    notificado_em TIMESTAMPTZ,
    expira_em TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(aula_id, devedor_id, data)
);

CREATE INDEX IF NOT EXISTS idx_lista_espera_aula_data ON lista_espera(aula_id, data, status);
CREATE INDEX IF NOT EXISTS idx_lista_espera_user ON lista_espera(user_id);

-- RLS
ALTER TABLE lista_espera ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own lista_espera" ON lista_espera;
CREATE POLICY "Users can view own lista_espera"
    ON lista_espera FOR SELECT
    USING (auth.uid() = user_id OR is_admin());

DROP POLICY IF EXISTS "Users can insert own lista_espera" ON lista_espera;
CREATE POLICY "Users can insert own lista_espera"
    ON lista_espera FOR INSERT
    WITH CHECK (auth.uid() = user_id OR is_admin());

DROP POLICY IF EXISTS "Users can update own lista_espera" ON lista_espera;
CREATE POLICY "Users can update own lista_espera"
    ON lista_espera FOR UPDATE
    USING (auth.uid() = user_id OR is_admin());

DROP POLICY IF EXISTS "Users can delete own lista_espera" ON lista_espera;
CREATE POLICY "Users can delete own lista_espera"
    ON lista_espera FOR DELETE
    USING (auth.uid() = user_id OR is_admin());

-- ==========================================
-- VERIFICAR
-- ==========================================
SELECT 'lista_espera' as tabela, column_name, data_type
FROM information_schema.columns
WHERE table_name = 'lista_espera'
ORDER BY ordinal_position;
