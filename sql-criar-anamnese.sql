-- ============================================================
-- ANAMNESE - Avaliação física dos alunos (V2 com histórico)
-- ============================================================

-- 1. Tabela principal — uma linha por avaliação (várias por aluno)
CREATE TABLE IF NOT EXISTS anamneses (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  devedor_id UUID NOT NULL REFERENCES devedores(id) ON DELETE CASCADE,
  data_avaliacao DATE NOT NULL DEFAULT CURRENT_DATE,

  -- ===== SAÚDE =====
  tem_dores TEXT,
  lesao_recente BOOLEAN,
  lesoes_descricao TEXT,
  cirurgias TEXT,
  doencas TEXT,           -- hipertensão, diabetes, cardíaca, etc
  medicamentos TEXT,
  alergias TEXT,
  ja_desmaiou BOOLEAN,

  -- ===== HISTÓRICO FÍSICO =====
  praticou_esporte BOOLEAN,
  esportes_descricao TEXT,
  tempo_parado TEXT,      -- 'nunca_parou', 'ate_3m', '3a6m', '6ma1ano', 'mais_1ano'

  -- ===== OBJETIVO =====
  objetivo TEXT,          -- 'emagrecer', 'hipertrofia', 'condicionamento', 'reabilitacao', 'qualidade_vida', 'outro'
  objetivo_descricao TEXT,

  -- ===== MEDIDAS (cm/kg) =====
  peso DECIMAL(5,2),
  altura DECIMAL(3,2),
  cintura DECIMAL(5,2),
  quadril DECIMAL(5,2),
  braco_direito DECIMAL(5,2),
  braco_esquerdo DECIMAL(5,2),
  coxa_direita DECIMAL(5,2),
  coxa_esquerda DECIMAL(5,2),

  -- ===== EXTRAS (configurados pelo dono em Configurações) =====
  -- Estrutura: { "campo_id_1": "resposta", "campo_id_2": true, ... }
  campos_extras JSONB DEFAULT '{}'::jsonb,

  -- ===== OBSERVAÇÕES =====
  observacoes TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_anamneses_user_devedor
  ON anamneses (user_id, devedor_id);
CREATE INDEX IF NOT EXISTS idx_anamneses_data
  ON anamneses (devedor_id, data_avaliacao DESC);

-- 2. RLS
ALTER TABLE anamneses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Usuarios veem suas anamneses" ON anamneses;
CREATE POLICY "Usuarios veem suas anamneses"
  ON anamneses FOR SELECT
  USING (auth.uid() = user_id OR is_admin());

DROP POLICY IF EXISTS "Usuarios criam suas anamneses" ON anamneses;
CREATE POLICY "Usuarios criam suas anamneses"
  ON anamneses FOR INSERT
  WITH CHECK (auth.uid() = user_id OR is_admin());

DROP POLICY IF EXISTS "Usuarios atualizam suas anamneses" ON anamneses;
CREATE POLICY "Usuarios atualizam suas anamneses"
  ON anamneses FOR UPDATE
  USING (auth.uid() = user_id OR is_admin());

DROP POLICY IF EXISTS "Usuarios deletam suas anamneses" ON anamneses;
CREATE POLICY "Usuarios deletam suas anamneses"
  ON anamneses FOR DELETE
  USING (auth.uid() = user_id OR is_admin());

-- 3. Trigger updated_at
CREATE OR REPLACE FUNCTION update_anamneses_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS anamneses_updated_at ON anamneses;
CREATE TRIGGER anamneses_updated_at
  BEFORE UPDATE ON anamneses
  FOR EACH ROW
  EXECUTE FUNCTION update_anamneses_updated_at();

-- 4. Coluna em usuarios pra guardar a config dos campos extras
-- Estrutura: [{ "id": "uuid", "label": "Pergunta", "tipo": "texto|textarea|sim_nao|numero|select", "opcoes": ["a","b"], "obrigatorio": false }, ...]
ALTER TABLE usuarios
  ADD COLUMN IF NOT EXISTS anamnese_campos_extras JSONB
  DEFAULT '[]'::jsonb;
