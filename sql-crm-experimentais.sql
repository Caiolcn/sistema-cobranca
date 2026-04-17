-- ============================================================
-- CRM de Experimentais: alunos que agendaram aula pelo link
-- e ainda nao viraram alunos pagantes
-- ============================================================

-- 1. Flag no devedor pra identificar experimental (separar da lista de alunos reais)
ALTER TABLE devedores ADD COLUMN IF NOT EXISTS experimental BOOLEAN DEFAULT FALSE;
CREATE INDEX IF NOT EXISTS idx_devedores_experimental ON devedores (user_id, experimental) WHERE experimental = TRUE;

-- 2. Campos no lead pra rastrear primeira aula agendada pelo link
ALTER TABLE leads ADD COLUMN IF NOT EXISTS primeira_aula_data DATE;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS primeira_aula_id UUID;

-- 3. Nova origem possivel no lead: 'agendamento' (quando vem do link publico)
--    (coluna origem ja existe como TEXT, nao precisa ALTER)

-- 4. Backfill: marcar experimentais historicos
--    Criterio: origem='agendamento' + nunca teve mensalidade paga + sem assinatura ativa
UPDATE devedores d
SET experimental = TRUE
WHERE origem = 'agendamento'
  AND assinatura_ativa = FALSE
  AND NOT EXISTS (
    SELECT 1 FROM mensalidades m
    WHERE m.devedor_id = d.id AND m.status = 'pago'
  )
  AND (experimental IS NULL OR experimental = FALSE);

-- 5. Backfill: criar leads para cada devedor experimental que ainda nao tem lead vinculado
INSERT INTO leads (user_id, nome, telefone, origem, interesse, status, convertido_em_devedor_id, created_at)
SELECT
  d.user_id,
  d.nome,
  d.telefone,
  'agendamento',
  'Aula experimental',
  'experimental',
  d.id,
  d.created_at
FROM devedores d
WHERE d.experimental = TRUE
  AND NOT EXISTS (
    SELECT 1 FROM leads l WHERE l.convertido_em_devedor_id = d.id
  );

-- 6. Backfill: popular primeira_aula_data/primeira_aula_id nos leads que ja tem agendamentos
UPDATE leads l
SET
  primeira_aula_data = sub.data,
  primeira_aula_id = sub.aula_id
FROM (
  SELECT DISTINCT ON (devedor_id) devedor_id, data, aula_id
  FROM agendamentos
  WHERE status IN ('confirmado', 'realizado')
  ORDER BY devedor_id, data ASC
) sub
WHERE l.convertido_em_devedor_id = sub.devedor_id
  AND l.status = 'experimental'
  AND l.primeira_aula_data IS NULL;
