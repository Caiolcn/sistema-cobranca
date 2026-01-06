-- ==========================================
-- TABELA DE USUÁRIOS/CLIENTES DO SISTEMA
-- ==========================================

CREATE TABLE IF NOT EXISTS usuarios (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Dados pessoais
  email TEXT UNIQUE NOT NULL,
  nome_completo TEXT,
  telefone TEXT,
  cpf_cnpj TEXT,

  -- Dados do plano
  plano TEXT DEFAULT 'basico', -- basico, premium, enterprise
  limite_mensal INTEGER DEFAULT 100, -- Limite de mensagens
  status_conta TEXT DEFAULT 'ativo', -- ativo, inativo, bloqueado

  -- Dados da empresa (se for PJ)
  razao_social TEXT,
  nome_fantasia TEXT,

  -- Endereço
  cep TEXT,
  endereco TEXT,
  numero TEXT,
  complemento TEXT,
  bairro TEXT,
  cidade TEXT,
  estado TEXT,

  -- Metadados
  data_cadastro TIMESTAMPTZ DEFAULT NOW(),
  ultimo_acesso TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ==========================================
-- ÍNDICES
-- ==========================================
CREATE INDEX IF NOT EXISTS idx_usuarios_email ON usuarios(email);
CREATE INDEX IF NOT EXISTS idx_usuarios_cpf_cnpj ON usuarios(cpf_cnpj);
CREATE INDEX IF NOT EXISTS idx_usuarios_status ON usuarios(status_conta);

-- ==========================================
-- RLS (Row Level Security)
-- ==========================================
ALTER TABLE usuarios ENABLE ROW LEVEL SECURITY;

-- Usuário pode ver apenas seus próprios dados
DROP POLICY IF EXISTS "Usuários podem ver próprios dados" ON usuarios;
CREATE POLICY "Usuários podem ver próprios dados"
  ON usuarios
  FOR SELECT
  USING (auth.uid() = id);

-- Usuário pode atualizar apenas seus próprios dados
DROP POLICY IF EXISTS "Usuários podem atualizar próprios dados" ON usuarios;
CREATE POLICY "Usuários podem atualizar próprios dados"
  ON usuarios
  FOR UPDATE
  USING (auth.uid() = id);

-- Permitir INSERT para novos usuários
DROP POLICY IF EXISTS "Permitir insert de novos usuários" ON usuarios;
CREATE POLICY "Permitir insert de novos usuários"
  ON usuarios
  FOR INSERT
  WITH CHECK (true);

-- ==========================================
-- TRIGGER: Criar registro automaticamente ao fazer signup
-- ==========================================
CREATE OR REPLACE FUNCTION criar_usuario_automatico()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.usuarios (id, email, nome_completo)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'nome_completo', NEW.email)
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Remover trigger se já existir
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- Criar trigger
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION criar_usuario_automatico();

-- ==========================================
-- TRIGGER: Atualizar updated_at automaticamente
-- ==========================================
CREATE OR REPLACE FUNCTION atualizar_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_atualizar_updated_at ON usuarios;
CREATE TRIGGER trigger_atualizar_updated_at
  BEFORE UPDATE ON usuarios
  FOR EACH ROW
  EXECUTE FUNCTION atualizar_updated_at();

-- ==========================================
-- SINCRONIZAR USUÁRIOS EXISTENTES
-- ==========================================
-- Inserir usuários que já existem no auth.users mas não em usuarios
INSERT INTO usuarios (id, email, nome_completo)
SELECT
  id,
  email,
  COALESCE(raw_user_meta_data->>'nome_completo', email)
FROM auth.users
WHERE id NOT IN (SELECT id FROM usuarios)
ON CONFLICT (id) DO NOTHING;

-- ==========================================
-- VIEW PARA RELATÓRIOS
-- ==========================================
CREATE OR REPLACE VIEW vw_usuarios_completo AS
SELECT
  u.id,
  u.email,
  u.nome_completo,
  u.telefone,
  u.plano,
  u.limite_mensal,
  u.status_conta,
  u.data_cadastro,
  u.ultimo_acesso,
  au.last_sign_in_at as ultimo_login,
  au.created_at as data_criacao_auth,
  cp.usage_count as mensagens_usadas,
  (SELECT COUNT(*) FROM devedores WHERE user_id = u.id) as total_devedores,
  (SELECT COUNT(*) FROM parcelas p
   INNER JOIN devedores d ON p.devedor_id = d.id
   WHERE d.user_id = u.id) as total_parcelas
FROM usuarios u
LEFT JOIN auth.users au ON u.id = au.id
LEFT JOIN controle_planos cp ON CAST(cp.user_id AS UUID) = u.id;

-- ==========================================
-- FUNÇÃO PARA ATUALIZAR ÚLTIMO ACESSO
-- ==========================================
CREATE OR REPLACE FUNCTION registrar_ultimo_acesso()
RETURNS void AS $$
BEGIN
  UPDATE usuarios
  SET ultimo_acesso = NOW()
  WHERE id = auth.uid();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ==========================================
-- QUERIES ÚTEIS
-- ==========================================

-- Ver todos os usuários cadastrados
-- SELECT * FROM vw_usuarios_completo;

-- Ver usuários ativos
-- SELECT * FROM usuarios WHERE status_conta = 'ativo';

-- Ver usuários por plano
-- SELECT plano, COUNT(*) as total FROM usuarios GROUP BY plano;

-- Atualizar dados do usuário logado
-- UPDATE usuarios
-- SET nome_completo = 'Seu Nome', telefone = '62982466639'
-- WHERE id = auth.uid();

COMMIT;
