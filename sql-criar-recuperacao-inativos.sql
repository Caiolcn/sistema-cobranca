-- ============================================================
-- RECUPERAÇÃO DE INATIVOS - Régua automática (15/30/45 dias)
-- ============================================================
-- Dispara mensagens pra alunos que pararam de aparecer em aula.
-- Só entra na régua quem JÁ TEVE presença registrada antes.
-- Academia que não usa o sistema de presença nunca dispara nada.
-- ============================================================

-- ==========================================
-- 1. COLUNAS NA TABELA devedores
-- ==========================================
-- Status da régua:
--   NULL         = ainda não entrou
--   '15dias'     = recebeu 1ª mensagem (15 dias sem aparecer)
--   '30dias'     = recebeu 2ª mensagem
--   '45dias'     = recebeu 3ª mensagem
--   'recuperado' = voltou a aparecer (reset automático)
--   'perdido'    = passou de 45 dias sem resposta
ALTER TABLE devedores
  ADD COLUMN IF NOT EXISTS recuperacao_status TEXT;

ALTER TABLE devedores
  ADD COLUMN IF NOT EXISTS recuperacao_ultimo_envio TIMESTAMPTZ;

-- ==========================================
-- 2. COLUNA DE CONFIGURAÇÃO POR USUÁRIO
-- ==========================================
ALTER TABLE configuracoes_cobranca
  ADD COLUMN IF NOT EXISTS recuperacao_inativos_ativa BOOLEAN DEFAULT false;

-- ==========================================
-- 3. VIEW: alunos candidatos à régua de recuperação
-- ==========================================
DROP VIEW IF EXISTS vw_alunos_inativos_regua;

CREATE VIEW vw_alunos_inativos_regua AS
SELECT
  d.id AS devedor_id,
  d.user_id,
  d.nome AS nome_cliente,
  d.telefone,
  d.recuperacao_status,
  d.recuperacao_ultimo_envio,
  MAX(p.data) AS ultima_presenca,
  (CURRENT_DATE - MAX(p.data))::INT AS dias_sem_aparecer,
  u.plano,
  u.plano_pago,
  u.trial_ativo,
  u.nome_empresa,
  mz.instance_name AS evolution_instance_name,
  (SELECT valor FROM config WHERE chave = 'evolution_api_key' LIMIT 1) AS evolution_api_key,
  (SELECT valor FROM config WHERE chave = 'evolution_api_url' LIMIT 1) AS evolution_api_url,
  cp.usage_count,
  cp.limite_mensal,
  -- Templates das 3 mensagens (15/30/45)
  COALESCE(t15.mensagem, '') AS template_15,
  COALESCE(t30.mensagem, '') AS template_30,
  COALESCE(t45.mensagem, '') AS template_45,
  -- Qual mensagem deve ser disparada agora (baseado no status e dias)
  CASE
    WHEN d.recuperacao_status IS NULL
         AND (CURRENT_DATE - MAX(p.data))::INT >= 15
         AND (CURRENT_DATE - MAX(p.data))::INT < 30
      THEN '15dias'
    WHEN d.recuperacao_status = '15dias'
         AND (CURRENT_DATE - MAX(p.data))::INT >= 30
         AND (CURRENT_DATE - MAX(p.data))::INT < 45
      THEN '30dias'
    WHEN d.recuperacao_status = '30dias'
         AND (CURRENT_DATE - MAX(p.data))::INT >= 45
      THEN '45dias'
    ELSE NULL
  END AS proxima_mensagem
FROM devedores d
INNER JOIN usuarios u ON u.id = d.user_id
INNER JOIN configuracoes_cobranca cc ON cc.user_id = d.user_id AND cc.recuperacao_inativos_ativa = true
INNER JOIN mensallizap mz ON mz.user_id = d.user_id AND mz.conectado = true
INNER JOIN presencas p ON p.devedor_id = d.id AND p.presente = true
LEFT JOIN controle_planos cp ON cp.user_id = d.user_id
LEFT JOIN templates t15 ON t15.user_id = d.user_id AND t15.tipo = 'recuperacao_15' AND t15.ativo = true
LEFT JOIN templates t30 ON t30.user_id = d.user_id AND t30.tipo = 'recuperacao_30' AND t30.ativo = true
LEFT JOIN templates t45 ON t45.user_id = d.user_id AND t45.tipo = 'recuperacao_45' AND t45.ativo = true
WHERE (d.lixo IS NULL OR d.lixo = false)
  AND (d.bloquear_mensagens IS NULL OR d.bloquear_mensagens = false)
  AND d.assinatura_ativa = true
  AND d.telefone IS NOT NULL
  -- Só planos Pro ou Premium
  AND u.plano IN ('pro', 'premium')
  AND (u.plano_pago = true OR u.trial_ativo = true)
  -- Ainda tem quota mensal
  AND (cp.usage_count < cp.limite_mensal OR cp.limite_mensal IS NULL)
  -- Não recebeu NADA hoje (evita disparar duas vezes no mesmo dia)
  AND (
    d.recuperacao_ultimo_envio IS NULL
    OR (d.recuperacao_ultimo_envio AT TIME ZONE 'America/Sao_Paulo')::date
       < (NOW() AT TIME ZONE 'America/Sao_Paulo')::date
  )
  -- Não tá marcado como 'perdido' ou 'recuperado'
  AND (d.recuperacao_status IS NULL OR d.recuperacao_status NOT IN ('perdido', 'recuperado'))
GROUP BY
  d.id, d.user_id, d.nome, d.telefone, d.recuperacao_status, d.recuperacao_ultimo_envio,
  u.plano, u.plano_pago, u.trial_ativo, u.nome_empresa,
  mz.instance_name, cp.usage_count, cp.limite_mensal,
  t15.mensagem, t30.mensagem, t45.mensagem
-- Só retorna alunos que têm uma próxima mensagem definida
HAVING (
  CASE
    WHEN d.recuperacao_status IS NULL
         AND (CURRENT_DATE - MAX(p.data))::INT >= 15
         AND (CURRENT_DATE - MAX(p.data))::INT < 30
      THEN '15dias'
    WHEN d.recuperacao_status = '15dias'
         AND (CURRENT_DATE - MAX(p.data))::INT >= 30
         AND (CURRENT_DATE - MAX(p.data))::INT < 45
      THEN '30dias'
    WHEN d.recuperacao_status = '30dias'
         AND (CURRENT_DATE - MAX(p.data))::INT >= 45
      THEN '45dias'
    ELSE NULL
  END
) IS NOT NULL;

-- ==========================================
-- 4. TRIGGER: quando aparece nova presença, resetar status
-- ==========================================
-- Se o aluno tava em '15dias', '30dias' ou '45dias' e marca presença de novo,
-- vira 'recuperado' automaticamente.
CREATE OR REPLACE FUNCTION trigger_reset_recuperacao_inativos()
RETURNS TRIGGER AS $$
BEGIN
  -- Só reseta se a nova presença for "presente=true" e o aluno tá em alguma etapa da régua
  IF NEW.presente = true AND NEW.devedor_id IS NOT NULL THEN
    UPDATE devedores
    SET recuperacao_status = 'recuperado'
    WHERE id = NEW.devedor_id
      AND recuperacao_status IN ('15dias', '30dias', '45dias');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS reset_recuperacao_on_presenca ON presencas;
CREATE TRIGGER reset_recuperacao_on_presenca
  AFTER INSERT OR UPDATE ON presencas
  FOR EACH ROW
  EXECUTE FUNCTION trigger_reset_recuperacao_inativos();

-- ==========================================
-- 5. FUNÇÃO helper pra contar recuperados no mês (usada pelo KPI do Home)
-- ==========================================
CREATE OR REPLACE FUNCTION contar_recuperados_mes(p_user_id UUID)
RETURNS INT AS $$
DECLARE
  total INT;
BEGIN
  SELECT COUNT(*) INTO total
  FROM devedores d
  INNER JOIN presencas p ON p.devedor_id = d.id
  WHERE d.user_id = p_user_id
    AND d.recuperacao_status = 'recuperado'
    AND p.data >= DATE_TRUNC('month', CURRENT_DATE)::date
    AND p.presente = true;
  RETURN COALESCE(total, 0);
END;
$$ LANGUAGE plpgsql;

-- ==========================================
-- VERIFICAR
-- ==========================================
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name = 'devedores'
  AND column_name IN ('recuperacao_status', 'recuperacao_ultimo_envio');

SELECT column_name, data_type FROM information_schema.columns
WHERE table_name = 'configuracoes_cobranca'
  AND column_name = 'recuperacao_inativos_ativa';

-- Previsão de quantos alunos estão em cada etapa agora (quando rodar pela primeira vez)
SELECT
  proxima_mensagem,
  COUNT(*) AS qtd
FROM vw_alunos_inativos_regua
GROUP BY proxima_mensagem;
