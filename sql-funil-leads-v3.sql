-- ============================================================
-- Funil de leads v3 (02/10/26) — funil de follow-up estruturado
--
-- Mensagens e dias em src/admin/leads/funilFollowup.json (montado a partir de
-- docs/funil-followup/funil-01.json + ideias do funil-02.json).
--
-- Colunas do board (status):
--   conversando → aguardando → a_toque_1..a_toque_5 → a_final (Despedida)
--   → perdido (rótulo "Fora do funil")      + automáticas: criou_conta, pagante, churn
-- Coluna de toque = "esse toque JÁ FOI ENVIADO". O board calcula o próximo.
-- Dentro de aguardando / criou_conta / pagante / churn / perdido os toques são
-- sub-passos: `passo` guarda o último enviado (some na troca de etapa).
-- 'novo' e 'sumiu' saem: lead novo nasce em conversando (trigger abaixo, o
-- whatsapp-bot continua mandando 'novo' e não precisa de deploy).
-- ============================================================

-- 1) Dados que saem de cena
UPDATE mensalli_leads SET status = 'conversando' WHERE status IN ('novo', 'sumiu');

ALTER TABLE mensalli_leads DROP CONSTRAINT IF EXISTS mensalli_leads_status_check;
ALTER TABLE mensalli_leads ADD CONSTRAINT mensalli_leads_status_check
  CHECK (status = ANY (ARRAY['conversando','aguardando',
    'a_toque_1','a_toque_2','a_toque_3','a_toque_4','a_toque_5','a_final',
    'criou_conta','pagante','churn','perdido']));

-- 2) Colunas novas
ALTER TABLE mensalli_leads ADD COLUMN IF NOT EXISTS passo TEXT;
ALTER TABLE mensalli_leads ADD COLUMN IF NOT EXISTS passo_em TIMESTAMPTZ;
ALTER TABLE mensalli_leads ADD COLUMN IF NOT EXISTS remarcacoes INTEGER NOT NULL DEFAULT 0;
ALTER TABLE mensalli_leads ADD COLUMN IF NOT EXISTS arquivado BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE mensalli_leads ADD COLUMN IF NOT EXISTS motivo_saida TEXT;
ALTER TABLE mensalli_leads DROP CONSTRAINT IF EXISTS mensalli_leads_motivo_saida_check;
ALTER TABLE mensalli_leads ADD CONSTRAINT mensalli_leads_motivo_saida_check
  CHECK (motivo_saida IS NULL OR motivo_saida IN ('esgotou','nao_claro','sem_fit','preco_timing'));

-- 3) Troca de etapa: zera contador, sub-passo e remarcações; 'novo' vira conversando
CREATE OR REPLACE FUNCTION mensalli_leads_etapa_desde()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path TO 'public', 'pg_temp' AS $$
BEGIN
  IF NEW.status IN ('novo', 'sumiu') THEN
    NEW.status := 'conversando';
  END IF;
  IF TG_OP = 'INSERT' OR NEW.status IS DISTINCT FROM OLD.status THEN
    NEW.etapa_desde := NOW();
    IF TG_OP = 'UPDATE' THEN
      NEW.passo := NULL;
      NEW.passo_em := NULL;
      NEW.remarcacoes := 0;
      IF NEW.status <> 'perdido' THEN
        NEW.arquivado := false;
        NEW.motivo_saida := NULL;
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END $$;

-- BEFORE UPDATE (sem "OF status") pra pegar também o INSERT com 'novo'
DROP TRIGGER IF EXISTS trg_mensalli_leads_etapa_desde ON mensalli_leads;
CREATE TRIGGER trg_mensalli_leads_etapa_desde
  BEFORE INSERT OR UPDATE ON mensalli_leads
  FOR EACH ROW EXECUTE FUNCTION mensalli_leads_etapa_desde();

-- 4) Histórico: base da "taxa de resposta por toque"
CREATE TABLE IF NOT EXISTS mensalli_lead_eventos (
  id BIGSERIAL PRIMARY KEY,
  lead_id UUID NOT NULL REFERENCES mensalli_leads(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL CHECK (tipo IN ('etapa', 'passo')),
  de TEXT,
  para TEXT,
  em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_mensalli_lead_eventos_lead ON mensalli_lead_eventos (lead_id, em);
ALTER TABLE mensalli_lead_eventos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admin le mensalli_lead_eventos" ON mensalli_lead_eventos;
CREATE POLICY "Admin le mensalli_lead_eventos" ON mensalli_lead_eventos
  FOR SELECT USING (is_admin());

CREATE OR REPLACE FUNCTION mensalli_leads_registrar_evento()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO mensalli_lead_eventos (lead_id, tipo, de, para) VALUES (NEW.id, 'etapa', NULL, NEW.status);
    RETURN NEW;
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO mensalli_lead_eventos (lead_id, tipo, de, para) VALUES (NEW.id, 'etapa', OLD.status, NEW.status);
  END IF;
  IF NEW.passo IS NOT NULL AND NEW.passo IS DISTINCT FROM OLD.passo THEN
    INSERT INTO mensalli_lead_eventos (lead_id, tipo, de, para) VALUES (NEW.id, 'passo', OLD.passo, NEW.passo);
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_mensalli_leads_eventos ON mensalli_leads;
CREATE TRIGGER trg_mensalli_leads_eventos
  AFTER INSERT OR UPDATE ON mensalli_leads
  FOR EACH ROW EXECUTE FUNCTION mensalli_leads_registrar_evento();

-- 5) View: colunas novas no fim
CREATE OR REPLACE VIEW vw_mensalli_leads WITH (security_invoker = true) AS
 SELECT l.id, l.remote_jid, l.telefone, l.nome, l.status, l.origem, l.usuario_id,
    l.conta_detectada_em, l.pagamento_detectado_em, l.ultima_mensagem, l.ultima_direcao,
    l.ultima_interacao, l.observacoes, l.retornar_em, l.created_at, l.updated_at, l.ignorado,
    l.nicho, l.alunos, l.fila, l.toque_num, l.proximo_toque_em, l.nao_lidas, l.lido_em,
    u.nome_completo AS usuario_nome, u.email AS usuario_email, u.plano_pago, u.trial_ativo,
    u.trial_fim, u.data_cadastro AS usuario_cadastro,
    ( SELECT count(*) FROM mensalli_lead_mensagens m WHERE m.lead_id = l.id) AS total_mensagens,
    COALESCE(l.ultima_direcao = 'in' AND l.status <> 'perdido', false) AS esperando_resposta,
    round(EXTRACT(epoch FROM now() - l.ultima_interacao) / 60)::integer AS minutos_parado,
    COALESCE(l.proximo_toque_em <= CURRENT_DATE, false) AS toque_vencido,
    l.etapa_desde,
    mc.enviadas,
    mc.recebidas,
    mc.ultima_recebida_em,
    ( SELECT count(*) FROM mensalli_lead_mensagens m
       WHERE m.lead_id = l.id AND m.direcao = 'out'
         AND (mc.ultima_recebida_em IS NULL OR m.enviado_em > mc.ultima_recebida_em)) AS enviadas_sem_resposta,
    u.virou_pagante_em,
    u.cancelado_em,
    ( SELECT count(DISTINCT (m.enviado_em AT TIME ZONE 'America/Sao_Paulo')::date)
        FROM mensalli_lead_mensagens m
       WHERE m.lead_id = l.id AND m.direcao = 'out'
         AND (mc.ultima_recebida_em IS NULL
              OR (m.enviado_em AT TIME ZONE 'America/Sao_Paulo')::date
                 > (mc.ultima_recebida_em AT TIME ZONE 'America/Sao_Paulo')::date)) AS chamadas_sem_retorno,
    l.passo,
    l.passo_em,
    l.remarcacoes,
    l.arquivado,
    l.motivo_saida
   FROM mensalli_leads l
     LEFT JOIN usuarios u ON u.id = l.usuario_id
     LEFT JOIN LATERAL (
       SELECT count(*) FILTER (WHERE m.direcao = 'out') AS enviadas,
              count(*) FILTER (WHERE m.direcao = 'in')  AS recebidas,
              max(m.enviado_em) FILTER (WHERE m.direcao = 'in') AS ultima_recebida_em
         FROM mensalli_lead_mensagens m
        WHERE m.lead_id = l.id
     ) mc ON true
  WHERE l.ignorado = false;

-- 6) Sync: promove a partir das etapas novas (Fora do funil incluso: criar
--    conta depois de sair é o melhor sinal que existe)
CREATE OR REPLACE FUNCTION public.sync_mensalli_leads()
 RETURNS TABLE(vinculados integer, viraram_conta integer, viraram_pagante integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_vinc INT := 0;
  v_conta INT := 0;
  v_pag INT := 0;
  v_pre TEXT[] := ARRAY['conversando','aguardando','a_toque_1','a_toque_2','a_toque_3',
                        'a_toque_4','a_toque_5','a_final','perdido'];
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'apenas admin';
  END IF;

  WITH match AS (
    SELECT l.id AS lead_id,
           (SELECT u.id FROM usuarios u
             WHERE tel_chave(u.telefone) = tel_chave(l.telefone)
             ORDER BY u.data_cadastro NULLS LAST LIMIT 1) AS usuario_id
      FROM mensalli_leads l
     WHERE l.usuario_id IS NULL AND tel_chave(l.telefone) IS NOT NULL
  )
  UPDATE mensalli_leads l SET usuario_id = m.usuario_id, updated_at = NOW()
    FROM match m WHERE l.id = m.lead_id AND m.usuario_id IS NOT NULL;
  GET DIAGNOSTICS v_vinc = ROW_COUNT;

  -- Criou conta / virou pagante: promovem UMA vez (o arrasto manual vence).
  UPDATE mensalli_leads l
     SET status = CASE WHEN l.status = ANY (v_pre) THEN 'criou_conta' ELSE l.status END,
         conta_detectada_em = NOW(), updated_at = NOW()
   WHERE l.usuario_id IS NOT NULL AND l.conta_detectada_em IS NULL;
  GET DIAGNOSTICS v_conta = ROW_COUNT;

  UPDATE mensalli_leads l
     SET status = CASE WHEN l.status = ANY (v_pre || 'criou_conta'::text) THEN 'pagante' ELSE l.status END,
         pagamento_detectado_em = NOW(), updated_at = NOW()
    FROM usuarios u
   WHERE u.id = l.usuario_id AND u.plano_pago = TRUE AND l.pagamento_detectado_em IS NULL;
  GET DIAGNOSTICS v_pag = ROW_COUNT;

  -- Churn segue o estado da conta, mas só a partir de criou_conta/pagante:
  -- se você arrastou o churnado pra outra etapa (tentando recuperar), fica lá.
  UPDATE mensalli_leads l SET status = 'churn', updated_at = NOW()
    FROM usuarios u
   WHERE u.id = l.usuario_id
     AND l.status IN ('criou_conta', 'pagante')
     AND (u.cancelado_em IS NOT NULL
          OR (COALESCE(u.plano_pago, false) = false AND u.virou_pagante_em IS NOT NULL));

  UPDATE mensalli_leads l SET status = 'pagante', updated_at = NOW()
    FROM usuarios u
   WHERE u.id = l.usuario_id AND l.status = 'churn'
     AND u.plano_pago = TRUE AND u.cancelado_em IS NULL;

  RETURN QUERY SELECT v_vinc, v_conta, v_pag;
END;
$function$;
