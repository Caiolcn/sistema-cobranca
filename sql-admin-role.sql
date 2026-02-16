-- ==========================================
-- ADMIN ROLE - Sistema de Acesso Administrativo
-- MensalliZap - Sistema de Cobrança Automatizada
-- ==========================================
-- EXECUTE ESTE SQL NO SUPABASE SQL EDITOR
-- ==========================================

-- ==========================================
-- 1. Adicionar coluna role na tabela usuarios
-- ==========================================
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'user';

COMMENT ON COLUMN usuarios.role IS 'Papel do usuário: user (padrão) ou admin';

-- ==========================================
-- 2. Criar função helper is_admin()
-- Usada nas RLS policies para verificar se o usuário logado é admin
-- SECURITY DEFINER: executa com permissões do criador (bypass RLS)
-- STABLE: resultado consistente dentro da mesma transação
-- ==========================================
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM usuarios WHERE id = auth.uid() AND role = 'admin'
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ==========================================
-- 3. Trigger para proteger a coluna role
-- Impede que usuários normais alterem seu próprio role
-- ==========================================
CREATE OR REPLACE FUNCTION proteger_role_admin()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.role IS DISTINCT FROM NEW.role THEN
    IF NOT is_admin() THEN
      NEW.role := OLD.role;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS tr_proteger_role ON usuarios;
CREATE TRIGGER tr_proteger_role
  BEFORE UPDATE ON usuarios
  FOR EACH ROW
  EXECUTE FUNCTION proteger_role_admin();

-- ==========================================
-- 4. Atualizar RLS Policies
-- Padrão: admin pode ver/editar tudo, user só seus dados
-- ==========================================

-- ==========================================
-- 4.1 USUARIOS
-- ==========================================
DROP POLICY IF EXISTS "Usuários podem ver próprios dados" ON usuarios;
CREATE POLICY "Usuários podem ver próprios dados"
  ON usuarios FOR SELECT
  USING (auth.uid() = id OR is_admin());

DROP POLICY IF EXISTS "Usuários podem atualizar próprios dados" ON usuarios;
CREATE POLICY "Usuários podem atualizar próprios dados"
  ON usuarios FOR UPDATE
  USING (auth.uid() = id OR is_admin());

-- INSERT permanece: WITH CHECK (true) - necessário para signup

-- ==========================================
-- 4.2 DEVEDORES
-- ==========================================
DROP POLICY IF EXISTS "Usuários podem ver seus próprios devedores" ON devedores;
DROP POLICY IF EXISTS "Users can view own debtors" ON devedores;
CREATE POLICY "Usuários podem ver seus próprios devedores"
  ON devedores FOR SELECT
  USING (auth.uid() = user_id OR is_admin());

DROP POLICY IF EXISTS "Usuários podem criar seus próprios devedores" ON devedores;
DROP POLICY IF EXISTS "Users can insert own debtors" ON devedores;
CREATE POLICY "Usuários podem criar seus próprios devedores"
  ON devedores FOR INSERT
  WITH CHECK (auth.uid() = user_id OR is_admin());

DROP POLICY IF EXISTS "Usuários podem atualizar seus próprios devedores" ON devedores;
DROP POLICY IF EXISTS "Users can update own debtors" ON devedores;
CREATE POLICY "Usuários podem atualizar seus próprios devedores"
  ON devedores FOR UPDATE
  USING (auth.uid() = user_id OR is_admin());

DROP POLICY IF EXISTS "Usuários podem deletar seus próprios devedores" ON devedores;
DROP POLICY IF EXISTS "Users can delete own debtors" ON devedores;
CREATE POLICY "Usuários podem deletar seus próprios devedores"
  ON devedores FOR DELETE
  USING (auth.uid() = user_id OR is_admin());

-- ==========================================
-- 4.3 MENSALIDADES
-- ==========================================
DROP POLICY IF EXISTS "Usuários podem ver suas próprias mensalidades" ON mensalidades;
CREATE POLICY "Usuários podem ver suas próprias mensalidades"
  ON mensalidades FOR SELECT
  USING (auth.uid() = user_id OR is_admin());

DROP POLICY IF EXISTS "Usuários podem inserir suas próprias mensalidades" ON mensalidades;
CREATE POLICY "Usuários podem inserir suas próprias mensalidades"
  ON mensalidades FOR INSERT
  WITH CHECK (auth.uid() = user_id OR is_admin());

DROP POLICY IF EXISTS "Usuários podem atualizar suas próprias mensalidades" ON mensalidades;
CREATE POLICY "Usuários podem atualizar suas próprias mensalidades"
  ON mensalidades FOR UPDATE
  USING (auth.uid() = user_id OR is_admin());

DROP POLICY IF EXISTS "Usuários podem deletar suas próprias mensalidades" ON mensalidades;
CREATE POLICY "Usuários podem deletar suas próprias mensalidades"
  ON mensalidades FOR DELETE
  USING (auth.uid() = user_id OR is_admin());

-- ==========================================
-- 4.4 TEMPLATES
-- ==========================================
DROP POLICY IF EXISTS "Usuários podem ver seus próprios templates" ON templates;
CREATE POLICY "Usuários podem ver seus próprios templates"
  ON templates FOR SELECT
  USING (auth.uid() = user_id OR is_admin());

DROP POLICY IF EXISTS "Usuários podem criar seus próprios templates" ON templates;
CREATE POLICY "Usuários podem criar seus próprios templates"
  ON templates FOR INSERT
  WITH CHECK (auth.uid() = user_id OR is_admin());

DROP POLICY IF EXISTS "Usuários podem atualizar seus próprios templates" ON templates;
CREATE POLICY "Usuários podem atualizar seus próprios templates"
  ON templates FOR UPDATE
  USING (auth.uid() = user_id OR is_admin());

DROP POLICY IF EXISTS "Usuários podem deletar seus próprios templates" ON templates;
CREATE POLICY "Usuários podem deletar seus próprios templates"
  ON templates FOR DELETE
  USING (auth.uid() = user_id OR is_admin());

-- ==========================================
-- 4.5 CONFIGURACOES_COBRANCA
-- ==========================================
DROP POLICY IF EXISTS "Users can view own billing config" ON configuracoes_cobranca;
DROP POLICY IF EXISTS "Users can manage own billing settings" ON configuracoes_cobranca;
CREATE POLICY "Users can view own billing config"
  ON configuracoes_cobranca FOR SELECT
  USING (auth.uid() = user_id OR is_admin());

DROP POLICY IF EXISTS "Users can insert own billing config" ON configuracoes_cobranca;
CREATE POLICY "Users can insert own billing config"
  ON configuracoes_cobranca FOR INSERT
  WITH CHECK (auth.uid() = user_id OR is_admin());

DROP POLICY IF EXISTS "Users can update own billing config" ON configuracoes_cobranca;
CREATE POLICY "Users can update own billing config"
  ON configuracoes_cobranca FOR UPDATE
  USING (auth.uid() = user_id OR is_admin());

DROP POLICY IF EXISTS "Users can delete own billing config" ON configuracoes_cobranca;
CREATE POLICY "Users can delete own billing config"
  ON configuracoes_cobranca FOR DELETE
  USING (auth.uid() = user_id OR is_admin());

-- ==========================================
-- 4.6 MENSALLIZAP
-- ==========================================
DROP POLICY IF EXISTS "Usuarios veem proprios dados mensallizap" ON mensallizap;
CREATE POLICY "Usuarios veem proprios dados mensallizap"
  ON mensallizap FOR SELECT
  USING (auth.uid() = user_id OR is_admin());

DROP POLICY IF EXISTS "Permitir insert mensallizap" ON mensallizap;
CREATE POLICY "Permitir insert mensallizap"
  ON mensallizap FOR INSERT
  WITH CHECK (auth.uid() = user_id OR is_admin());

DROP POLICY IF EXISTS "Usuarios atualizam proprios dados mensallizap" ON mensallizap;
CREATE POLICY "Usuarios atualizam proprios dados mensallizap"
  ON mensallizap FOR UPDATE
  USING (auth.uid() = user_id OR is_admin());

DROP POLICY IF EXISTS "Usuarios deletam proprios dados mensallizap" ON mensallizap;
CREATE POLICY "Usuarios deletam proprios dados mensallizap"
  ON mensallizap FOR DELETE
  USING (auth.uid() = user_id OR is_admin());

-- ==========================================
-- 4.7 CONFIG (tabela de configurações por usuário)
-- ==========================================
DROP POLICY IF EXISTS "Usuários podem ver suas próprias configurações" ON config;
CREATE POLICY "Usuários podem ver suas próprias configurações"
  ON config FOR SELECT
  USING (auth.uid() = user_id OR is_admin());

DROP POLICY IF EXISTS "Usuários podem criar suas próprias configurações" ON config;
CREATE POLICY "Usuários podem criar suas próprias configurações"
  ON config FOR INSERT
  WITH CHECK (auth.uid() = user_id OR is_admin());

DROP POLICY IF EXISTS "Usuários podem atualizar suas próprias configurações" ON config;
CREATE POLICY "Usuários podem atualizar suas próprias configurações"
  ON config FOR UPDATE
  USING (auth.uid() = user_id OR is_admin());

DROP POLICY IF EXISTS "Usuários podem deletar suas próprias configurações" ON config;
CREATE POLICY "Usuários podem deletar suas próprias configurações"
  ON config FOR DELETE
  USING (auth.uid() = user_id OR is_admin());

-- Manter a policy de leitura global (para configs globais sem user_id)
-- DROP POLICY IF EXISTS "Permitir leitura de configurações para usuários autenticados" ON config;

-- ==========================================
-- 4.8 GRADE_HORARIOS
-- ==========================================
DROP POLICY IF EXISTS "Users can view own schedules" ON grade_horarios;
CREATE POLICY "Users can view own schedules"
  ON grade_horarios FOR SELECT
  USING (auth.uid() = user_id OR is_admin());

DROP POLICY IF EXISTS "Users can insert own schedules" ON grade_horarios;
CREATE POLICY "Users can insert own schedules"
  ON grade_horarios FOR INSERT
  WITH CHECK (auth.uid() = user_id OR is_admin());

DROP POLICY IF EXISTS "Users can update own schedules" ON grade_horarios;
CREATE POLICY "Users can update own schedules"
  ON grade_horarios FOR UPDATE
  USING (auth.uid() = user_id OR is_admin());

DROP POLICY IF EXISTS "Users can delete own schedules" ON grade_horarios;
CREATE POLICY "Users can delete own schedules"
  ON grade_horarios FOR DELETE
  USING (auth.uid() = user_id OR is_admin());

-- ==========================================
-- 4.9 CATEGORIAS_DESPESAS
-- ==========================================
DROP POLICY IF EXISTS "Usuarios veem proprias categorias despesas" ON categorias_despesas;
CREATE POLICY "Usuarios veem proprias categorias despesas"
  ON categorias_despesas FOR SELECT
  USING (auth.uid() = user_id OR is_admin());

DROP POLICY IF EXISTS "Usuarios inserem proprias categorias despesas" ON categorias_despesas;
CREATE POLICY "Usuarios inserem proprias categorias despesas"
  ON categorias_despesas FOR INSERT
  WITH CHECK (auth.uid() = user_id OR is_admin());

DROP POLICY IF EXISTS "Usuarios atualizam proprias categorias despesas" ON categorias_despesas;
CREATE POLICY "Usuarios atualizam proprias categorias despesas"
  ON categorias_despesas FOR UPDATE
  USING (auth.uid() = user_id OR is_admin());

DROP POLICY IF EXISTS "Usuarios deletam proprias categorias despesas" ON categorias_despesas;
CREATE POLICY "Usuarios deletam proprias categorias despesas"
  ON categorias_despesas FOR DELETE
  USING (auth.uid() = user_id OR is_admin());

-- ==========================================
-- 4.10 DESPESAS
-- ==========================================
DROP POLICY IF EXISTS "Usuarios veem proprias despesas" ON despesas;
CREATE POLICY "Usuarios veem proprias despesas"
  ON despesas FOR SELECT
  USING (auth.uid() = user_id OR is_admin());

DROP POLICY IF EXISTS "Usuarios inserem proprias despesas" ON despesas;
CREATE POLICY "Usuarios inserem proprias despesas"
  ON despesas FOR INSERT
  WITH CHECK (auth.uid() = user_id OR is_admin());

DROP POLICY IF EXISTS "Usuarios atualizam proprias despesas" ON despesas;
CREATE POLICY "Usuarios atualizam proprias despesas"
  ON despesas FOR UPDATE
  USING (auth.uid() = user_id OR is_admin());

DROP POLICY IF EXISTS "Usuarios deletam proprias despesas" ON despesas;
CREATE POLICY "Usuarios deletam proprias despesas"
  ON despesas FOR DELETE
  USING (auth.uid() = user_id OR is_admin());

-- ==========================================
-- 4.11 BOLETOS
-- ==========================================
DROP POLICY IF EXISTS "Usuários podem ver seus próprios boletos" ON boletos;
CREATE POLICY "Usuários podem ver seus próprios boletos"
  ON boletos FOR SELECT
  USING (auth.uid() = user_id OR is_admin());

DROP POLICY IF EXISTS "Usuários podem criar seus próprios boletos" ON boletos;
CREATE POLICY "Usuários podem criar seus próprios boletos"
  ON boletos FOR INSERT
  WITH CHECK (auth.uid() = user_id OR is_admin());

DROP POLICY IF EXISTS "Usuários podem atualizar seus próprios boletos" ON boletos;
CREATE POLICY "Usuários podem atualizar seus próprios boletos"
  ON boletos FOR UPDATE
  USING (auth.uid() = user_id OR is_admin());

DROP POLICY IF EXISTS "Usuários podem deletar seus próprios boletos" ON boletos;
CREATE POLICY "Usuários podem deletar seus próprios boletos"
  ON boletos FOR DELETE
  USING (auth.uid() = user_id OR is_admin());

-- ==========================================
-- 4.12 ASAAS_CLIENTES
-- ==========================================
DROP POLICY IF EXISTS "Usuários podem ver seus próprios clientes Asaas" ON asaas_clientes;
CREATE POLICY "Usuários podem ver seus próprios clientes Asaas"
  ON asaas_clientes FOR SELECT
  USING (auth.uid() = user_id OR is_admin());

DROP POLICY IF EXISTS "Usuários podem criar seus próprios clientes Asaas" ON asaas_clientes;
CREATE POLICY "Usuários podem criar seus próprios clientes Asaas"
  ON asaas_clientes FOR INSERT
  WITH CHECK (auth.uid() = user_id OR is_admin());

DROP POLICY IF EXISTS "Usuários podem atualizar seus próprios clientes Asaas" ON asaas_clientes;
CREATE POLICY "Usuários podem atualizar seus próprios clientes Asaas"
  ON asaas_clientes FOR UPDATE
  USING (auth.uid() = user_id OR is_admin());

-- ==========================================
-- 4.13 WHATSAPP_CONNECTIONS
-- ==========================================
DROP POLICY IF EXISTS "Usuários podem ver sua própria conexão" ON whatsapp_connections;
CREATE POLICY "Usuários podem ver sua própria conexão"
  ON whatsapp_connections FOR SELECT
  USING (auth.uid() = user_id OR is_admin());

DROP POLICY IF EXISTS "Usuários podem inserir sua própria conexão" ON whatsapp_connections;
CREATE POLICY "Usuários podem inserir sua própria conexão"
  ON whatsapp_connections FOR INSERT
  WITH CHECK (auth.uid() = user_id OR is_admin());

DROP POLICY IF EXISTS "Usuários podem atualizar sua própria conexão" ON whatsapp_connections;
CREATE POLICY "Usuários podem atualizar sua própria conexão"
  ON whatsapp_connections FOR UPDATE
  USING (auth.uid() = user_id OR is_admin());

DROP POLICY IF EXISTS "Usuários podem deletar sua própria conexão" ON whatsapp_connections;
CREATE POLICY "Usuários podem deletar sua própria conexão"
  ON whatsapp_connections FOR DELETE
  USING (auth.uid() = user_id OR is_admin());

-- ==========================================
-- 4.14 PLANOS
-- ==========================================
DROP POLICY IF EXISTS "Usuários podem ver seus próprios planos" ON planos;
CREATE POLICY "Usuários podem ver seus próprios planos"
  ON planos FOR SELECT
  USING (auth.uid() = user_id OR is_admin());

DROP POLICY IF EXISTS "Usuários podem criar seus próprios planos" ON planos;
CREATE POLICY "Usuários podem criar seus próprios planos"
  ON planos FOR INSERT
  WITH CHECK (auth.uid() = user_id OR is_admin());

DROP POLICY IF EXISTS "Usuários podem atualizar seus próprios planos" ON planos;
CREATE POLICY "Usuários podem atualizar seus próprios planos"
  ON planos FOR UPDATE
  USING (auth.uid() = user_id OR is_admin())
  WITH CHECK (auth.uid() = user_id OR is_admin());

DROP POLICY IF EXISTS "Usuários podem deletar seus próprios planos" ON planos;
CREATE POLICY "Usuários podem deletar seus próprios planos"
  ON planos FOR DELETE
  USING (auth.uid() = user_id OR is_admin());

-- ==========================================
-- 5. Definir admin (ALTERE O EMAIL ABAIXO)
-- ==========================================
-- UPDATE usuarios SET role = 'admin' WHERE email = 'SEU_EMAIL_AQUI';

-- ==========================================
-- Verificação
-- ==========================================
SELECT
  id,
  email,
  nome_completo,
  role
FROM usuarios
ORDER BY role DESC, created_at;
