-- ============================================================================
-- Envio manual de mensagem BARRADA — Central de Mensagens
--
-- Barrada = a régua das 9h não tentou porque o WhatsApp da conta estava
-- desconectado. Não existe log nem texto, então o "Reenviar" (que repete o
-- texto de um log) não serve. Este RPC é a trava; o texto é montado no front
-- com o mesmo template do envio normal (whatsappService.montarMensagemCobranca)
-- e o envio vai por reenviarMensagemSegura (1 chamada, sem restart).
--
-- Mesmas regras do reivindicar_reenvio, mais as que só existem aqui:
--   - só no MESMO DIA do agendamento (cobrança de vencimento no dia seguinte
--     é pior que nada — é a mesma regra do expirar_fila);
--   - mensalidade ainda pendente (o aluno pode ter pago depois das 9h);
--   - nenhum envio bem-sucedido hoje da mesma mensalidade+tipo (o gestor pode
--     ter mandado na mão pela tela do aluno).
-- A trava contra duplo clique / duas abas é o UPDATE ... WHERE estado =
-- 'barrada': só uma transação consegue virar a linha para 'enviando'.
-- O fechamento reaproveita concluir_reenvio (reenviado_por = quem clicou).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.reivindicar_envio_barrada(
  p_fila_id uuid,
  p_cooldown_seg integer DEFAULT 20
)
RETURNS TABLE(fila_id uuid, erro text, destino text, instance_name text, mensalidade_id uuid, tipo text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_f        RECORD;
  v_zap      RECORD;
  v_uid      UUID := auth.uid();
  v_status   TEXT;
  v_destino  TEXT;
  v_num      TEXT;
  v_hoje     DATE := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
BEGIN
  SELECT f.id, f.user_id, f.devedor_id, f.mensalidade_id, f.tipo, f.telefone,
         f.estado, f.agendado_para
    INTO v_f
  FROM mensagens_fila f WHERE f.id = p_fila_id;

  IF v_f.id IS NULL THEN
    RETURN QUERY SELECT NULL::uuid, 'fila_inexistente', NULL::text, NULL::text, NULL::uuid, NULL::text; RETURN;
  END IF;

  IF v_uid IS NULL OR NOT (v_uid = v_f.user_id OR public.is_admin()) THEN
    RETURN QUERY SELECT NULL::uuid, 'sem_permissao', NULL::text, NULL::text, NULL::uuid, NULL::text; RETURN;
  END IF;

  IF v_f.estado <> 'barrada' THEN
    RETURN QUERY SELECT NULL::uuid, 'ja_enviada', NULL::text, NULL::text, NULL::uuid, NULL::text; RETURN;
  END IF;

  IF (v_f.agendado_para AT TIME ZONE 'America/Sao_Paulo')::date <> v_hoje THEN
    RETURN QUERY SELECT NULL::uuid, 'fora_da_janela', NULL::text, NULL::text, NULL::uuid, NULL::text; RETURN;
  END IF;

  IF v_f.mensalidade_id IS NULL OR v_f.tipo NOT IN ('pre_due_3days', 'due_day', 'overdue') THEN
    RETURN QUERY SELECT NULL::uuid, 'tipo_nao_suportado', NULL::text, NULL::text, NULL::uuid, NULL::text; RETURN;
  END IF;

  SELECT m.status INTO v_status FROM mensalidades m WHERE m.id = v_f.mensalidade_id;
  IF v_status IS DISTINCT FROM 'pendente' THEN
    RETURN QUERY SELECT NULL::uuid, 'ja_paga', NULL::text, NULL::text, NULL::uuid, NULL::text; RETURN;
  END IF;

  IF EXISTS (
    SELECT 1 FROM logs_mensagens l
    WHERE l.mensalidade_id = v_f.mensalidade_id
      AND l.status = 'enviado'
      AND (l.enviado_em AT TIME ZONE 'America/Sao_Paulo')::date = v_hoje
      AND (l.tipo IS NULL OR l.tipo = v_f.tipo)
  ) THEN
    RETURN QUERY SELECT NULL::uuid, 'ja_enviada', NULL::text, NULL::text, NULL::uuid, NULL::text; RETURN;
  END IF;

  SELECT mz.conectado, mz.instance_name INTO v_zap
  FROM mensallizap mz WHERE mz.user_id = v_f.user_id;

  IF COALESCE(v_zap.instance_name, '') = '' THEN
    RETURN QUERY SELECT NULL::uuid, 'sem_instancia', NULL::text, NULL::text, NULL::uuid, NULL::text; RETURN;
  END IF;

  IF v_zap.conectado IS DISTINCT FROM true THEN
    RETURN QUERY SELECT NULL::uuid, 'whatsapp_desconectado', NULL::text, NULL::text, NULL::uuid, NULL::text; RETURN;
  END IF;

  -- Cooldown por conta, contando reenvio e envio de barrada juntos.
  IF EXISTS (
    SELECT 1 FROM mensagens_fila f
    WHERE f.user_id = v_f.user_id
      AND f.reenviado_por IS NOT NULL
      AND f.atualizado_em > now() - make_interval(secs => p_cooldown_seg)
  ) THEN
    RETURN QUERY SELECT NULL::uuid, 'cooldown', NULL::text, NULL::text, NULL::uuid, NULL::text; RETURN;
  END IF;

  -- DESTINO: JID já resolvido pela Evolution num envio bem-sucedido; senão o
  -- telefone atual do cadastro; senão o da fila.
  SELECT l2.response_api #>> '{key,remoteJid}' INTO v_destino
  FROM logs_mensagens l2
  WHERE l2.devedor_id = v_f.devedor_id
    AND l2.status = 'enviado'
    AND l2.response_api #>> '{key,remoteJid}' IS NOT NULL
  ORDER BY l2.enviado_em DESC
  LIMIT 1;

  IF v_destino IS NULL THEN
    v_num := regexp_replace(COALESCE(public.telefone_atual_do_aluno(v_f.devedor_id), v_f.telefone, ''), '\D', '', 'g');
    IF v_num = '' THEN
      RETURN QUERY SELECT NULL::uuid, 'sem_telefone', NULL::text, NULL::text, NULL::uuid, NULL::text; RETURN;
    END IF;
    IF left(v_num, 2) <> '55' THEN v_num := '55' || v_num; END IF;
    v_destino := v_num;
  END IF;

  UPDATE mensagens_fila f
  SET estado = 'enviando',
      reenviado_por = v_uid,
      atualizado_em = now()
  WHERE f.id = p_fila_id AND f.estado = 'barrada';

  IF NOT FOUND THEN
    RETURN QUERY SELECT NULL::uuid, 'ja_enviada', NULL::text, NULL::text, NULL::uuid, NULL::text; RETURN;
  END IF;

  RETURN QUERY SELECT v_f.id, NULL::text, v_destino, v_zap.instance_name, v_f.mensalidade_id, v_f.tipo;
END $function$;

REVOKE ALL ON FUNCTION public.reivindicar_envio_barrada(uuid, integer) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.reivindicar_envio_barrada(uuid, integer) TO authenticated;

SELECT proname, prosecdef FROM pg_proc WHERE proname = 'reivindicar_envio_barrada';
