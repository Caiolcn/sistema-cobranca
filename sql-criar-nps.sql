-- ============================================================
-- NPS AUTOMÁTICO - Pesquisa de satisfação pós-experimental
-- ============================================================
-- Dispara 24h após a 1ª presença registrada do aluno.
-- Aluno responde via WhatsApp e o bot captura a resposta.
-- Resultados aparecem em Relatórios > Satisfação (NPS).
-- Premium only (depende do bot pra capturar respostas).
-- ============================================================

-- ==========================================
-- 1. TABELA DE RESPOSTAS
-- ==========================================
CREATE TABLE IF NOT EXISTS nps_respostas (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  devedor_id UUID NOT NULL REFERENCES devedores(id) ON DELETE CASCADE,
  nota INT,                       -- 0 a 10 (null se não respondeu ainda)
  comentario TEXT,
  tipo_gatilho TEXT NOT NULL,     -- 'experimental' | 'periodico'
  enviado_em TIMESTAMPTZ DEFAULT NOW(),
  respondido_em TIMESTAMPTZ,
  CONSTRAINT nota_valida CHECK (nota IS NULL OR (nota >= 0 AND nota <= 10))
);

CREATE INDEX IF NOT EXISTS idx_nps_user ON nps_respostas (user_id, enviado_em DESC);
CREATE INDEX IF NOT EXISTS idx_nps_devedor ON nps_respostas (devedor_id);
CREATE INDEX IF NOT EXISTS idx_nps_pendente
  ON nps_respostas (user_id, devedor_id)
  WHERE nota IS NULL;

-- RLS
ALTER TABLE nps_respostas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Usuarios veem seus nps" ON nps_respostas;
CREATE POLICY "Usuarios veem seus nps"
  ON nps_respostas FOR SELECT
  USING (auth.uid() = user_id OR is_admin());

DROP POLICY IF EXISTS "Usuarios criam seus nps" ON nps_respostas;
CREATE POLICY "Usuarios criam seus nps"
  ON nps_respostas FOR INSERT
  WITH CHECK (auth.uid() = user_id OR is_admin());

DROP POLICY IF EXISTS "Usuarios atualizam seus nps" ON nps_respostas;
CREATE POLICY "Usuarios atualizam seus nps"
  ON nps_respostas FOR UPDATE
  USING (auth.uid() = user_id OR is_admin());

DROP POLICY IF EXISTS "Service role insere nps" ON nps_respostas;
CREATE POLICY "Service role insere nps"
  ON nps_respostas FOR INSERT
  WITH CHECK (true);

DROP POLICY IF EXISTS "Service role atualiza nps" ON nps_respostas;
CREATE POLICY "Service role atualiza nps"
  ON nps_respostas FOR UPDATE
  USING (true);

-- ==========================================
-- 2. COLUNAS AUXILIARES
-- ==========================================
-- Flag de ativação da automação
ALTER TABLE configuracoes_cobranca
  ADD COLUMN IF NOT EXISTS nps_experimental_ativo BOOLEAN DEFAULT false;

-- Marca que o aluno já recebeu o NPS pós-experimental (evita duplicação)
ALTER TABLE devedores
  ADD COLUMN IF NOT EXISTS nps_experimental_enviado_em TIMESTAMPTZ;

-- ==========================================
-- 3. VIEW: alunos elegíveis pro NPS pós-experimental
-- ==========================================
-- Regra: aluno teve a 1ª presença há >= 24h, ainda não recebeu NPS,
-- configuração ativa, instance conectada, plano premium.
DROP VIEW IF EXISTS vw_alunos_aguardando_nps;

CREATE VIEW vw_alunos_aguardando_nps AS
SELECT
  d.id AS devedor_id,
  d.user_id,
  d.nome AS nome_cliente,
  d.telefone,
  primeira_presenca.primeira_data,
  u.nome_empresa,
  mz.instance_name AS evolution_instance_name,
  (SELECT valor FROM config WHERE chave = 'evolution_api_key' LIMIT 1) AS evolution_api_key,
  (SELECT valor FROM config WHERE chave = 'evolution_api_url' LIMIT 1) AS evolution_api_url,
  cp.usage_count,
  cp.limite_mensal,
  COALESCE(t.mensagem, '') AS template_mensagem
FROM devedores d
INNER JOIN usuarios u ON u.id = d.user_id
INNER JOIN configuracoes_cobranca cc
  ON cc.user_id = d.user_id AND cc.nps_experimental_ativo = true
INNER JOIN mensallizap mz
  ON mz.user_id = d.user_id AND mz.conectado = true
INNER JOIN (
  SELECT devedor_id, MIN(data) AS primeira_data
  FROM presencas
  WHERE presente = true
  GROUP BY devedor_id
) primeira_presenca ON primeira_presenca.devedor_id = d.id
LEFT JOIN controle_planos cp ON cp.user_id = d.user_id
LEFT JOIN templates t
  ON t.user_id = d.user_id AND t.tipo = 'nps_experimental' AND t.ativo = true
WHERE (d.lixo IS NULL OR d.lixo = false)
  AND (d.bloquear_mensagens IS NULL OR d.bloquear_mensagens = false)
  AND d.telefone IS NOT NULL
  AND d.nps_experimental_enviado_em IS NULL
  -- Pelo menos 24h desde a 1ª presença
  AND primeira_presenca.primeira_data <= (CURRENT_DATE - INTERVAL '1 day')
  -- Plano Premium + pago ou trial
  AND u.plano = 'premium'
  AND (u.plano_pago = true OR u.trial_ativo = true)
  -- Quota
  AND (cp.usage_count < cp.limite_mensal OR cp.limite_mensal IS NULL);

-- ==========================================
-- 4. FUNÇÃO: calcular NPS score do usuário
-- ==========================================
-- NPS = % Promotores (9-10) - % Detratores (0-6)
-- Range: -100 a 100
CREATE OR REPLACE FUNCTION calcular_nps_score(p_user_id UUID, p_periodo_dias INT DEFAULT 90)
RETURNS TABLE(
  total_respostas INT,
  promotores INT,
  neutros INT,
  detratores INT,
  score NUMERIC
) AS $$
DECLARE
  v_total INT;
  v_prom INT;
  v_neu INT;
  v_det INT;
BEGIN
  SELECT
    COUNT(*) FILTER (WHERE nota IS NOT NULL),
    COUNT(*) FILTER (WHERE nota >= 9),
    COUNT(*) FILTER (WHERE nota BETWEEN 7 AND 8),
    COUNT(*) FILTER (WHERE nota <= 6)
  INTO v_total, v_prom, v_neu, v_det
  FROM nps_respostas
  WHERE user_id = p_user_id
    AND nota IS NOT NULL
    AND respondido_em >= NOW() - (p_periodo_dias || ' days')::INTERVAL;

  total_respostas := COALESCE(v_total, 0);
  promotores := COALESCE(v_prom, 0);
  neutros := COALESCE(v_neu, 0);
  detratores := COALESCE(v_det, 0);

  IF total_respostas > 0 THEN
    score := ROUND(
      ((promotores::NUMERIC - detratores::NUMERIC) / total_respostas::NUMERIC) * 100,
      1
    );
  ELSE
    score := 0;
  END IF;

  RETURN NEXT;
END;
$$ LANGUAGE plpgsql;

-- ==========================================
-- VERIFICAR
-- ==========================================
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name = 'devedores' AND column_name = 'nps_experimental_enviado_em';

SELECT column_name, data_type FROM information_schema.columns
WHERE table_name = 'configuracoes_cobranca' AND column_name = 'nps_experimental_ativo';

-- Quantos alunos estariam elegíveis AGORA (se a config estivesse ativa)
SELECT COUNT(*) AS elegiveis FROM vw_alunos_aguardando_nps;
