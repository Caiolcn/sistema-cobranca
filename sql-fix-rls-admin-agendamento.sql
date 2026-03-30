-- ==========================================
-- FIX: Adicionar is_admin() nas RLS das tabelas de agendamento
-- Para que o admin consiga visualizar dados dos clientes
-- ==========================================

-- AULAS
DROP POLICY IF EXISTS "Users can view own aulas" ON aulas;
CREATE POLICY "Users can view own aulas"
    ON aulas FOR SELECT
    USING (auth.uid() = user_id OR is_admin());

DROP POLICY IF EXISTS "Users can insert own aulas" ON aulas;
CREATE POLICY "Users can insert own aulas"
    ON aulas FOR INSERT
    WITH CHECK (auth.uid() = user_id OR is_admin());

DROP POLICY IF EXISTS "Users can update own aulas" ON aulas;
CREATE POLICY "Users can update own aulas"
    ON aulas FOR UPDATE
    USING (auth.uid() = user_id OR is_admin());

DROP POLICY IF EXISTS "Users can delete own aulas" ON aulas;
CREATE POLICY "Users can delete own aulas"
    ON aulas FOR DELETE
    USING (auth.uid() = user_id OR is_admin());

-- AGENDAMENTOS
DROP POLICY IF EXISTS "Users can view own agendamentos" ON agendamentos;
CREATE POLICY "Users can view own agendamentos"
    ON agendamentos FOR SELECT
    USING (auth.uid() = user_id OR is_admin());

DROP POLICY IF EXISTS "Users can insert own agendamentos" ON agendamentos;
CREATE POLICY "Users can insert own agendamentos"
    ON agendamentos FOR INSERT
    WITH CHECK (auth.uid() = user_id OR is_admin());

DROP POLICY IF EXISTS "Users can update own agendamentos" ON agendamentos;
CREATE POLICY "Users can update own agendamentos"
    ON agendamentos FOR UPDATE
    USING (auth.uid() = user_id OR is_admin());

DROP POLICY IF EXISTS "Users can delete own agendamentos" ON agendamentos;
CREATE POLICY "Users can delete own agendamentos"
    ON agendamentos FOR DELETE
    USING (auth.uid() = user_id OR is_admin());

-- AULAS_FIXOS
DROP POLICY IF EXISTS "Users can view own aulas_fixos" ON aulas_fixos;
CREATE POLICY "Users can view own aulas_fixos"
    ON aulas_fixos FOR SELECT
    USING (auth.uid() = user_id OR is_admin());

DROP POLICY IF EXISTS "Users can insert own aulas_fixos" ON aulas_fixos;
CREATE POLICY "Users can insert own aulas_fixos"
    ON aulas_fixos FOR INSERT
    WITH CHECK (auth.uid() = user_id OR is_admin());

DROP POLICY IF EXISTS "Users can delete own aulas_fixos" ON aulas_fixos;
CREATE POLICY "Users can delete own aulas_fixos"
    ON aulas_fixos FOR DELETE
    USING (auth.uid() = user_id OR is_admin());
