-- =============================================
-- MÓDULO DE DESPESAS - Mensalli
-- Criar tabelas: categorias_despesas e despesas
-- =============================================

-- 1. Tabela de categorias de despesas
CREATE TABLE IF NOT EXISTS categorias_despesas (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  nome TEXT NOT NULL,
  icone TEXT DEFAULT 'mdi:tag-outline',
  cor TEXT DEFAULT '#666666',
  is_default BOOLEAN DEFAULT false,
  ativo BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_categorias_despesas_user_id ON categorias_despesas(user_id);

-- RLS categorias_despesas
ALTER TABLE categorias_despesas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Usuarios veem proprias categorias despesas" ON categorias_despesas;
CREATE POLICY "Usuarios veem proprias categorias despesas"
  ON categorias_despesas FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Usuarios inserem proprias categorias despesas" ON categorias_despesas;
CREATE POLICY "Usuarios inserem proprias categorias despesas"
  ON categorias_despesas FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Usuarios atualizam proprias categorias despesas" ON categorias_despesas;
CREATE POLICY "Usuarios atualizam proprias categorias despesas"
  ON categorias_despesas FOR UPDATE
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Usuarios deletam proprias categorias despesas" ON categorias_despesas;
CREATE POLICY "Usuarios deletam proprias categorias despesas"
  ON categorias_despesas FOR DELETE
  USING (auth.uid() = user_id);


-- 2. Tabela de despesas
CREATE TABLE IF NOT EXISTS despesas (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  categoria_id UUID REFERENCES categorias_despesas(id) ON DELETE SET NULL,
  descricao TEXT NOT NULL,
  valor DECIMAL(10,2) NOT NULL,
  data_vencimento DATE NOT NULL,
  data_pagamento DATE,
  status TEXT DEFAULT 'pendente' CHECK (status IN ('pendente', 'pago', 'cancelado')),
  forma_pagamento TEXT,
  observacoes TEXT,

  -- Campos de recorrência
  is_recorrente BOOLEAN DEFAULT false,
  recorrencia_tipo TEXT CHECK (recorrencia_tipo IN ('mensal', 'semanal', 'anual')),
  recorrencia_pai_id UUID REFERENCES despesas(id) ON DELETE SET NULL,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_despesas_user_id ON despesas(user_id);
CREATE INDEX IF NOT EXISTS idx_despesas_categoria_id ON despesas(categoria_id);
CREATE INDEX IF NOT EXISTS idx_despesas_status ON despesas(status);
CREATE INDEX IF NOT EXISTS idx_despesas_data_vencimento ON despesas(data_vencimento);
CREATE INDEX IF NOT EXISTS idx_despesas_is_recorrente ON despesas(is_recorrente);

-- RLS despesas
ALTER TABLE despesas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Usuarios veem proprias despesas" ON despesas;
CREATE POLICY "Usuarios veem proprias despesas"
  ON despesas FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Usuarios inserem proprias despesas" ON despesas;
CREATE POLICY "Usuarios inserem proprias despesas"
  ON despesas FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Usuarios atualizam proprias despesas" ON despesas;
CREATE POLICY "Usuarios atualizam proprias despesas"
  ON despesas FOR UPDATE
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Usuarios deletam proprias despesas" ON despesas;
CREATE POLICY "Usuarios deletam proprias despesas"
  ON despesas FOR DELETE
  USING (auth.uid() = user_id);


-- 3. Função para criar categorias padrão para um usuário
CREATE OR REPLACE FUNCTION criar_categorias_padrao_despesas(p_user_id UUID)
RETURNS void AS $$
BEGIN
  INSERT INTO categorias_despesas (user_id, nome, icone, cor, is_default) VALUES
    (p_user_id, 'Aluguel', 'mdi:home-outline', '#E91E63', true),
    (p_user_id, 'Salários', 'mdi:account-group-outline', '#9C27B0', true),
    (p_user_id, 'Internet/Telefone', 'mdi:wifi', '#2196F3', true),
    (p_user_id, 'Fornecedores', 'mdi:truck-delivery-outline', '#FF9800', true),
    (p_user_id, 'Marketing', 'mdi:bullhorn-outline', '#4CAF50', true),
    (p_user_id, 'Impostos', 'mdi:file-document-outline', '#f44336', true),
    (p_user_id, 'Água/Luz/Gás', 'mdi:flash-outline', '#FFC107', true),
    (p_user_id, 'Software/Assinaturas', 'mdi:laptop', '#00BCD4', true),
    (p_user_id, 'Material de Escritório', 'mdi:pencil-outline', '#795548', true),
    (p_user_id, 'Outros', 'mdi:dots-horizontal-circle-outline', '#607D8B', true)
  ON CONFLICT DO NOTHING;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
