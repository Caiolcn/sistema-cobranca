CREATE TABLE IF NOT EXISTS ausencias_fixos (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    aula_id UUID NOT NULL REFERENCES aulas(id) ON DELETE CASCADE,
    devedor_id UUID NOT NULL REFERENCES devedores(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    data DATE NOT NULL,
    motivo TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(aula_id, devedor_id, data)
);

CREATE INDEX IF NOT EXISTS idx_ausencias_fixos_aula_data ON ausencias_fixos(aula_id, data);
CREATE INDEX IF NOT EXISTS idx_ausencias_fixos_devedor ON ausencias_fixos(devedor_id);

ALTER TABLE ausencias_fixos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own ausencias_fixos" ON ausencias_fixos;
CREATE POLICY "Users can view own ausencias_fixos"
    ON ausencias_fixos FOR SELECT USING (auth.uid() = user_id OR is_admin());

DROP POLICY IF EXISTS "Users can insert own ausencias_fixos" ON ausencias_fixos;
CREATE POLICY "Users can insert own ausencias_fixos"
    ON ausencias_fixos FOR INSERT WITH CHECK (auth.uid() = user_id OR is_admin());

DROP POLICY IF EXISTS "Users can delete own ausencias_fixos" ON ausencias_fixos;
CREATE POLICY "Users can delete own ausencias_fixos"
    ON ausencias_fixos FOR DELETE USING (auth.uid() = user_id OR is_admin());
