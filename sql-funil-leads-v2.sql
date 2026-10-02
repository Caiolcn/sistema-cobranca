-- ============================================================
-- Funil de leads v2 (02/10/26)
--
-- O board do Funil vira só controle: sem texto de mensagem, arrastar pra
-- mover, data de "chamar em" visível no card. Etapas novas:
--   sumiu  — parou de responder (manual)
--   churn  — foi pagante e cancelou/deixou de pagar (AUTOMÁTICO, mesma regra
--            do ciclo 'churn'/'cancelado' da vw_admin_contas)
-- Automático continua só criou_conta / pagante / churn — o resto é arrasto.
-- ============================================================

-- 1) Etapas novas
ALTER TABLE mensalli_leads DROP CONSTRAINT IF EXISTS mensalli_leads_status_check;
ALTER TABLE mensalli_leads ADD CONSTRAINT mensalli_leads_status_check
  CHECK (status = ANY (ARRAY['novo','conversando','aguardando','sumiu','criou_conta','pagante','churn','perdido']));

-- 2) Desde quando está na etapa atual (pra mostrar "há 5d aqui" no card)
ALTER TABLE mensalli_leads ADD COLUMN IF NOT EXISTS etapa_desde TIMESTAMPTZ;
UPDATE mensalli_leads
   SET etapa_desde = CASE status
         WHEN 'pagante'     THEN COALESCE(pagamento_detectado_em, updated_at, created_at)
         WHEN 'criou_conta' THEN COALESCE(conta_detectada_em, updated_at, created_at)
         ELSE COALESCE(updated_at, created_at) END
 WHERE etapa_desde IS NULL;
ALTER TABLE mensalli_leads ALTER COLUMN etapa_desde SET DEFAULT NOW();

CREATE OR REPLACE FUNCTION mensalli_leads_etapa_desde()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' OR NEW.status IS DISTINCT FROM OLD.status THEN
    NEW.etapa_desde := NOW();
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_mensalli_leads_etapa_desde ON mensalli_leads;
CREATE TRIGGER trg_mensalli_leads_etapa_desde
  BEFORE INSERT OR UPDATE OF status ON mensalli_leads
  FOR EACH ROW EXECUTE FUNCTION mensalli_leads_etapa_desde();

-- 3) View: contadores de mensagem e churn (colunas novas no FIM — CREATE OR
--    REPLACE VIEW não deixa reordenar)
CREATE OR REPLACE VIEW vw_mensalli_leads WITH (security_invoker = true) AS
 SELECT l.id,
    l.remote_jid,
    l.telefone,
    l.nome,
    l.status,
    l.origem,
    l.usuario_id,
    l.conta_detectada_em,
    l.pagamento_detectado_em,
    l.ultima_mensagem,
    l.ultima_direcao,
    l.ultima_interacao,
    l.observacoes,
    l.retornar_em,
    l.created_at,
    l.updated_at,
    l.ignorado,
    l.nicho,
    l.alunos,
    l.fila,
    l.toque_num,
    l.proximo_toque_em,
    l.nao_lidas,
    l.lido_em,
    u.nome_completo AS usuario_nome,
    u.email AS usuario_email,
    u.plano_pago,
    u.trial_ativo,
    u.trial_fim,
    u.data_cadastro AS usuario_cadastro,
    ( SELECT count(*) FROM mensalli_lead_mensagens m WHERE m.lead_id = l.id) AS total_mensagens,
    COALESCE(l.ultima_direcao = 'in' AND l.status <> 'perdido', false) AS esperando_resposta,
    round(EXTRACT(epoch FROM now() - l.ultima_interacao) / 60)::integer AS minutos_parado,
    COALESCE(l.proximo_toque_em <= CURRENT_DATE, false) AS toque_vencido,
    -- novas
    l.etapa_desde,
    mc.enviadas,
    mc.recebidas,
    mc.ultima_recebida_em,
    -- quantas eu mandei depois da última resposta dele (follow-ups no vácuo)
    ( SELECT count(*) FROM mensalli_lead_mensagens m
       WHERE m.lead_id = l.id AND m.direcao = 'out'
         AND (mc.ultima_recebida_em IS NULL OR m.enviado_em > mc.ultima_recebida_em)) AS enviadas_sem_resposta,
    u.virou_pagante_em,
    u.cancelado_em
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

-- 4) Sync: + churn automático (e volta pra pagante se reativar)
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
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'apenas admin';
  END IF;

  WITH match AS (
    SELECT l.id AS lead_id,
           (SELECT u.id
              FROM usuarios u
             WHERE tel_chave(u.telefone) = tel_chave(l.telefone)
             ORDER BY u.data_cadastro NULLS LAST
             LIMIT 1) AS usuario_id
      FROM mensalli_leads l
     WHERE l.usuario_id IS NULL
       AND tel_chave(l.telefone) IS NOT NULL
  )
  UPDATE mensalli_leads l
     SET usuario_id = m.usuario_id,
         updated_at = NOW()
    FROM match m
   WHERE l.id = m.lead_id
     AND m.usuario_id IS NOT NULL;
  GET DIAGNOSTICS v_vinc = ROW_COUNT;

  -- Criou conta / virou pagante: promovem UMA vez (o arrasto manual vence).
  UPDATE mensalli_leads l
     SET status = CASE WHEN l.status IN ('novo', 'conversando', 'aguardando', 'sumiu')
                       THEN 'criou_conta' ELSE l.status END,
         conta_detectada_em = NOW(),
         updated_at = NOW()
   WHERE l.usuario_id IS NOT NULL
     AND l.conta_detectada_em IS NULL
     AND l.status <> 'perdido';
  GET DIAGNOSTICS v_conta = ROW_COUNT;

  UPDATE mensalli_leads l
     SET status = CASE WHEN l.status IN ('novo', 'conversando', 'aguardando', 'sumiu', 'criou_conta')
                       THEN 'pagante' ELSE l.status END,
         pagamento_detectado_em = NOW(),
         updated_at = NOW()
    FROM usuarios u
   WHERE u.id = l.usuario_id
     AND u.plano_pago = TRUE
     AND l.pagamento_detectado_em IS NULL
     AND l.status <> 'perdido';
  GET DIAGNOSTICS v_pag = ROW_COUNT;

  -- Churn: segue o estado da conta, mas só mexe em quem está em criou_conta/
  -- pagante. Se você arrastou o churnado pra "Conversando" (tentando
  -- recuperar), ele fica lá.
  UPDATE mensalli_leads l
     SET status = 'churn', updated_at = NOW()
    FROM usuarios u
   WHERE u.id = l.usuario_id
     AND l.status IN ('criou_conta', 'pagante')
     AND (u.cancelado_em IS NOT NULL
          OR (COALESCE(u.plano_pago, false) = false AND u.virou_pagante_em IS NOT NULL));

  -- Reativou: churn → pagante
  UPDATE mensalli_leads l
     SET status = 'pagante', updated_at = NOW()
    FROM usuarios u
   WHERE u.id = l.usuario_id
     AND l.status = 'churn'
     AND u.plano_pago = TRUE
     AND u.cancelado_em IS NULL;

  RETURN QUERY SELECT v_vinc, v_conta, v_pag;
END;
$function$;

-- 5) (aplicado depois, migration funil_leads_v2_toques) A view ganhou no fim:
--    chamadas_sem_retorno = count(DISTINCT dia BRT) das mensagens 'out' com dia
--    > dia da última 'in'. "4 mensagens sem resposta" confundia: 2 delas eram
--    resposta no meio da conversa. O card mostra "Chamei Nx sem retorno".
