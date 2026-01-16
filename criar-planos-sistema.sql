-- ==========================================
-- CRIAR TABELA DE PLANOS DO SISTEMA
-- ==========================================
-- Este script cria os 3 planos: starter, pro, premium

-- ==========================================
-- 0. REMOVER CONSTRAINTS ANTIGAS (para permitir migração)
-- ==========================================
-- Remover check constraint antiga que limitava valores de plano
ALTER TABLE IF EXISTS controle_planos DROP CONSTRAINT IF EXISTS controle_planos_plano_check;
ALTER TABLE IF EXISTS usuarios DROP CONSTRAINT IF EXISTS usuarios_plano_check;

-- ==========================================
-- 1. CRIAR TABELA planos_sistema
-- ==========================================
CREATE TABLE IF NOT EXISTS planos_sistema (
  id TEXT PRIMARY KEY,           -- 'starter', 'pro', 'premium'
  nome TEXT NOT NULL,            -- Nome de exibição
  descricao TEXT,                -- Descrição do plano
  preco DECIMAL(10,2) NOT NULL,  -- Preço mensal
  limite_mensal INTEGER NOT NULL, -- Limite de mensagens por mês
  limite_clientes INTEGER NOT NULL DEFAULT 50, -- Limite de clientes ativos

  -- Features habilitadas (JSON)
  features JSONB DEFAULT '[]'::jsonb,

  -- Ordem de hierarquia (1 = menor, 3 = maior)
  nivel INTEGER NOT NULL,

  -- Controle
  ativo BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ==========================================
-- 2. INSERIR OS 3 PLANOS
-- ==========================================
INSERT INTO planos_sistema (id, nome, descricao, preco, limite_mensal, limite_clientes, nivel, features)
VALUES
  (
    'starter',
    'Starter',
    'Plano inicial para começar a cobrar',
    49.90,
    200,
    50,
    1,
    '[
      "Até 50 clientes ativos",
      "200 mensagens/mês",
      "1 template padrão (sem edição)",
      "Disparo automático em atraso",
      "Dashboard básico",
      "Exportação CSV",
      "Suporte por e-mail (48h)"
    ]'::jsonb
  ),
  (
    'pro',
    'Pro',
    'Plano profissional com automação completa',
    99.90,
    500,
    150,
    2,
    '[
      "Até 150 clientes ativos",
      "500 mensagens/mês",
      "3 templates personalizáveis",
      "Automação 3 e 5 dias antes",
      "Automação em atraso",
      "Dashboard completo com gráficos",
      "Aging Report (status dos clientes)",
      "Receita Projetada",
      "Histórico completo",
      "Suporte WhatsApp (24h)"
    ]'::jsonb
  ),
  (
    'premium',
    'Premium',
    'Plano completo para alto volume',
    149.90,
    3000,
    500,
    3,
    '[
      "Até 500 clientes ativos",
      "3.000 mensagens/mês",
      "Tudo do Pro",
      "Webhooks para integração (n8n)",
      "Consultoria inicial (1h)",
      "Suporte prioritário (4h)",
      "Acesso antecipado a novas features"
    ]'::jsonb
  )
ON CONFLICT (id) DO UPDATE SET
  nome = EXCLUDED.nome,
  descricao = EXCLUDED.descricao,
  preco = EXCLUDED.preco,
  limite_mensal = EXCLUDED.limite_mensal,
  limite_clientes = EXCLUDED.limite_clientes,
  nivel = EXCLUDED.nivel,
  features = EXCLUDED.features,
  updated_at = NOW();

-- ==========================================
-- 3. ATUALIZAR COLUNA plano NA TABELA usuarios
-- ==========================================

-- Migrar valores antigos para novos:
-- 'basico' -> 'starter'
-- 'premium' -> 'pro'
-- 'enterprise' ou 'business' -> 'premium'
UPDATE usuarios
SET plano = CASE
  WHEN plano = 'basico' THEN 'starter'
  WHEN plano = 'premium' THEN 'pro'
  WHEN plano = 'enterprise' THEN 'premium'
  WHEN plano = 'business' THEN 'premium'
  ELSE 'starter'  -- Default para qualquer valor não reconhecido
END
WHERE plano IN ('basico', 'premium', 'enterprise', 'business') OR plano IS NULL;

-- Atualizar limite_mensal baseado no novo plano
UPDATE usuarios u
SET limite_mensal = ps.limite_mensal
FROM planos_sistema ps
WHERE u.plano = ps.id;

-- ==========================================
-- 4. ATUALIZAR TABELA controle_planos
-- ==========================================

-- Migrar valores antigos para novos na controle_planos também
UPDATE controle_planos
SET plano = CASE
  WHEN plano = 'basico' THEN 'starter'
  WHEN plano = 'premium' THEN 'pro'
  WHEN plano = 'enterprise' THEN 'premium'
  WHEN plano = 'business' THEN 'premium'
  ELSE 'starter'
END
WHERE plano IN ('basico', 'premium', 'enterprise', 'business') OR plano IS NULL;

-- Atualizar limite_mensal na controle_planos
UPDATE controle_planos cp
SET limite_mensal = ps.limite_mensal
FROM planos_sistema ps
WHERE cp.plano = ps.id;

-- ==========================================
-- 4.1 ADICIONAR NOVA CONSTRAINT (após migração)
-- ==========================================
-- Agora que os dados foram migrados, adicionar nova constraint
ALTER TABLE controle_planos ADD CONSTRAINT controle_planos_plano_check
  CHECK (plano IN ('starter', 'pro', 'premium'));
ALTER TABLE usuarios ADD CONSTRAINT usuarios_plano_check
  CHECK (plano IN ('starter', 'pro', 'premium'));

-- ==========================================
-- 5. CRIAR VIEW PARA CONSULTAR PLANOS
-- ==========================================
CREATE OR REPLACE VIEW v_planos_disponiveis AS
SELECT
  id,
  nome,
  descricao,
  preco,
  limite_mensal,
  nivel,
  features,
  CASE
    WHEN preco = 0 THEN 'Grátis'
    ELSE 'R$ ' || TO_CHAR(preco, 'FM999G999D00')
  END as preco_formatado,
  CASE
    WHEN limite_mensal >= 999999 THEN 'Ilimitado'
    ELSE limite_mensal || ' mensagens/mês'
  END as limite_formatado
FROM planos_sistema
WHERE ativo = true
ORDER BY nivel;

-- ==========================================
-- 6. CRIAR FUNÇÃO PARA VERIFICAR FEATURE
-- ==========================================
CREATE OR REPLACE FUNCTION verificar_feature_plano(
  p_user_id UUID,
  p_plano_requerido TEXT
)
RETURNS BOOLEAN AS $$
DECLARE
  v_nivel_usuario INTEGER;
  v_nivel_requerido INTEGER;
BEGIN
  -- Buscar nível do plano do usuário
  SELECT ps.nivel INTO v_nivel_usuario
  FROM usuarios u
  JOIN planos_sistema ps ON u.plano = ps.id
  WHERE u.id = p_user_id;

  -- Se não encontrou, assume starter (nível 1)
  IF v_nivel_usuario IS NULL THEN
    v_nivel_usuario := 1;
  END IF;

  -- Buscar nível do plano requerido
  SELECT nivel INTO v_nivel_requerido
  FROM planos_sistema
  WHERE id = p_plano_requerido;

  -- Se não encontrou plano requerido, retorna true (sem restrição)
  IF v_nivel_requerido IS NULL THEN
    RETURN TRUE;
  END IF;

  -- Retorna true se usuário tem nível >= requerido
  RETURN v_nivel_usuario >= v_nivel_requerido;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ==========================================
-- 7. CRIAR FUNÇÃO PARA UPGRADE DE PLANO
-- ==========================================
CREATE OR REPLACE FUNCTION fazer_upgrade_plano(
  p_user_id UUID,
  p_novo_plano TEXT
)
RETURNS JSONB AS $$
DECLARE
  v_plano_info RECORD;
BEGIN
  -- Buscar informações do novo plano
  SELECT * INTO v_plano_info
  FROM planos_sistema
  WHERE id = p_novo_plano AND ativo = true;

  IF v_plano_info IS NULL THEN
    RETURN jsonb_build_object(
      'sucesso', false,
      'erro', 'Plano não encontrado ou inativo'
    );
  END IF;

  -- Atualizar usuário
  UPDATE usuarios
  SET
    plano = p_novo_plano,
    limite_mensal = v_plano_info.limite_mensal,
    plano_pago = (v_plano_info.preco > 0),
    updated_at = NOW()
  WHERE id = p_user_id;

  -- Atualizar controle_planos
  UPDATE controle_planos
  SET
    plano = p_novo_plano,
    limite_mensal = v_plano_info.limite_mensal,
    updated_at = NOW()
  WHERE user_id = p_user_id::TEXT;

  -- Se não existe controle_planos, criar
  INSERT INTO controle_planos (user_id, plano, limite_mensal, usage_count)
  SELECT p_user_id::TEXT, p_novo_plano, v_plano_info.limite_mensal, 0
  WHERE NOT EXISTS (
    SELECT 1 FROM controle_planos WHERE user_id = p_user_id::TEXT
  );

  RETURN jsonb_build_object(
    'sucesso', true,
    'plano', p_novo_plano,
    'nome', v_plano_info.nome,
    'limite_mensal', v_plano_info.limite_mensal
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ==========================================
-- 8. ATUALIZAR TRIGGER DE CRIAÇÃO DE USUÁRIO
-- ==========================================
CREATE OR REPLACE FUNCTION criar_usuario_automatico()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.usuarios (id, email, nome_completo, plano, limite_mensal)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'nome_completo', NEW.email),
    'starter',  -- Novo usuário começa como starter
    200         -- Limite padrão do starter (200 mensagens)
  );

  -- Criar registro em controle_planos também
  INSERT INTO public.controle_planos (user_id, plano, limite_mensal, usage_count)
  VALUES (
    NEW.id::TEXT,
    'starter',
    200,
    0
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ==========================================
-- 9. RLS PARA planos_sistema (público para leitura)
-- ==========================================
ALTER TABLE planos_sistema ENABLE ROW LEVEL SECURITY;

-- Todos podem ver os planos disponíveis
DROP POLICY IF EXISTS "Planos visíveis para todos" ON planos_sistema;
CREATE POLICY "Planos visíveis para todos"
  ON planos_sistema
  FOR SELECT
  USING (ativo = true);

-- ==========================================
-- 10. VERIFICAÇÃO FINAL
-- ==========================================

-- Listar planos criados
SELECT
  id,
  nome,
  preco,
  limite_mensal,
  nivel
FROM planos_sistema
ORDER BY nivel;

-- Verificar usuários atualizados
SELECT
  id,
  email,
  plano,
  limite_mensal
FROM usuarios
LIMIT 5;

COMMIT;
