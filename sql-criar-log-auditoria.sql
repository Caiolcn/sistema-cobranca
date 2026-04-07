CREATE TABLE IF NOT EXISTS log_auditoria (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL,
    devedor_id UUID,
    acao TEXT NOT NULL,
    campo TEXT,
    valor_anterior TEXT,
    valor_novo TEXT,
    detalhes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_log_auditoria_devedor ON log_auditoria(devedor_id);
CREATE INDEX IF NOT EXISTS idx_log_auditoria_user ON log_auditoria(user_id);
CREATE INDEX IF NOT EXISTS idx_log_auditoria_acao ON log_auditoria(acao);

ALTER TABLE log_auditoria ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own log_auditoria" ON log_auditoria;
CREATE POLICY "Users can view own log_auditoria"
    ON log_auditoria FOR SELECT USING (auth.uid() = user_id OR is_admin());

DROP POLICY IF EXISTS "Users can insert own log_auditoria" ON log_auditoria;
CREATE POLICY "Users can insert own log_auditoria"
    ON log_auditoria FOR INSERT WITH CHECK (auth.uid() = user_id OR is_admin());
