-- ==========================================================================
-- FASE 0 — Central de Mensagens: fundação de dados
--
-- Três problemas que precisam morrer ANTES de existir tela, senão a tela
-- nasce mentindo pro cliente:
--
--   A. Falha não é classificada. Hoje "falha" mistura infra transitória
--      (reenviar resolve), número inexistente (reenviar nunca resolve),
--      mensagem entregue (JID canônico BR) e mensagem nunca tentada
--      (timeout de lote do n8n). Um botão "Reenviar" em cima disso duplica
--      cobrança nos dois últimos casos.
--
--   B. Mensagem que nunca foi tentada não existe em lugar nenhum. As views
--      vw_parcelas_* exigem mensallizap.conectado = true; instância fora do
--      ar no instante do cron faz a parcela sumir da fila sem log e sem
--      alerta (incidente Rede Fit, 04/08). Uma tela alimentada só por
--      logs_mensagens mostraria verde com ninguém recebendo nada.
--
--   C. Não existe trava de duplicidade. A chave por JANELA (d-3/d0/d+3) impede
--      que a mesma parcela seja cobrada duas vezes no mesmo dia por caminhos
--      diferentes. Nota de 17/08: vw_parcelas_em_atraso e
--      vw_parcelas_3dias_depois cobrem a MESMA janela D+3 com flags distintas,
--      mas só a segunda é consumida em produção (workflow gdPzIzuqTqVNyCWx) —
--      a primeira é do workflow legado, que está OFF. A trava vale como defesa
--      caso o legado volte a ser ligado, não como conserto de bug ativo.
--
-- Idempotente: pode rodar mais de uma vez.
-- Aditivo: não altera view existente, não altera comportamento de envio.
-- ==========================================================================


-- ==========================================================================
-- PARTE A — Classificação de falha
-- ==========================================================================

-- Canoniza telefone/JID para comparação. Contas BR anteriores ao 9º dígito da
-- Anatel têm JID canônico SEM o 9; a Evolution devolve o JID resolvido, então
-- os dois lados precisam virar a mesma forma antes de comparar.
-- Espelha src/services/whatsappService.js (gerarVariantesNumero) e o guard
-- descrito em docs/fix-guard-jid-n8n.md.
CREATE OR REPLACE FUNCTION public.chave_comparavel(valor TEXT)
RETURNS TEXT LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE n TEXT; ddd TEXT; assinante TEXT;
BEGIN
  n := regexp_replace(split_part(split_part(COALESCE(valor, ''), '@', 1), ':', 1), '\D', '', 'g');
  IF n = '' THEN RETURN ''; END IF;
  IF left(n, 2) <> '55' THEN n := '55' || n; END IF;

  -- 55 + DDD(2) + 9 dígitos: assinante começando em 9 é celular pós-Anatel.
  -- Canoniza removendo o 9 para casar com o formato antigo.
  IF length(n) = 13 THEN
    ddd := substr(n, 3, 2);
    assinante := substr(n, 5);
    IF left(assinante, 1) = '9' THEN n := '55' || ddd || substr(assinante, 2); END IF;
  END IF;
  RETURN n;
END $$;


-- Classes de falha e o que cada uma autoriza na Central:
--
--   transitoria   → infra/conexão. Reenvio resolve. É o único caso que ganha
--                   botão "Reenviar" e o único que entra em retry automático.
--   permanente    → número não existe no WhatsApp. Reenvio nunca resolve;
--                   vira tarefa de corrigir cadastro.
--   nao_falha     → foi entregue. JID canônico BR divergente do cadastrado.
--                   Reenviar aqui é a máquina de cobrança duplicada.
--   nao_tentada   → nunca saiu (lote abortado por tempo no n8n). Não é erro,
--                   é fila: volta para mensagens_fila, não para "Reenviar".
--   config        → credencial/instância inválida. Nem reenvio nem cadastro
--                   resolvem; é intervenção nossa.
--   indeterminada → provedor não devolveu motivo estruturado. A Central mostra
--                   "motivo não informado" e NÃO oferece reenvio de 1 clique.
CREATE OR REPLACE FUNCTION public.classificar_falha(
  p_status TEXT, p_erro_codigo TEXT, p_erro TEXT
) RETURNS TEXT LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN p_status IS DISTINCT FROM 'falha' THEN NULL

    -- Entregue, apenas com JID canônico diferente do cadastrado.
    WHEN p_erro_codigo IN ('remote_jid_divergente', 'jid_canonico_br') THEN 'nao_falha'

    -- Nó Code do n8n aborta em 300s e marca o lote inteiro, inclusive o que
    -- nunca chegou a ser tentado (ver memória n8n_timeout_300s).
    WHEN p_erro_codigo = 'adiado_sem_tempo' THEN 'nao_tentada'

    -- Permanente. O teste do texto vem ANTES do balde transitório porque a
    -- Evolution devolve número inexistente dentro de um 400 genérico
    -- (erro_codigo = 'bad_request' com corpo {"exists": false}).
    -- O corpo do 400 chega serializado com aspas escapadas
    -- ("\"exists\":false"), por isso a classe de caractere em volta.
    WHEN p_erro_codigo = 'numero_inexistente' THEN 'permanente'
    WHEN p_erro ~* 'exists[\\"]*\s*:\s*false' THEN 'permanente'

    WHEN p_erro_codigo = 'auth_failed' THEN 'config'

    WHEN p_erro_codigo IN ('connection_closed', 'instance_500', 'instance_not_found',
                           'timeout', 'exception', 'bad_request', 'unknown')
      OR p_erro_codigo LIKE 'network_%'
      OR p_erro_codigo LIKE 'http_5%' THEN 'transitoria'
    WHEN p_erro ~* 'Connection Closed|EAI_AGAIN|PrismaClient|Internal Server Error|desconectad|reconectar' THEN 'transitoria'
    -- Formas cruas que o n8n grava sem erro_codigo.
    WHEN p_erro ~ '(status code|^)\s*5[0-9][0-9]( -|$)' THEN 'transitoria'

    ELSE 'indeterminada'
  END
$$;


ALTER TABLE logs_mensagens ADD COLUMN IF NOT EXISTS falha_classe TEXT;

CREATE INDEX IF NOT EXISTS idx_logs_falha_classe
  ON logs_mensagens(falha_classe, enviado_em DESC)
  WHERE falha_classe IS NOT NULL;


-- Preenche falha_classe em TODO writer sem tocar em nenhum deles: front
-- (whatsappService, 4 inserts), n8n (nós de log), asaas-webhook e
-- alerta-despesas. O EXCEPTION é proposital — classificação nunca pode
-- derrubar o registro do envio.
CREATE OR REPLACE FUNCTION public.trg_logs_mensagens_classificar()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  BEGIN
    NEW.falha_classe := public.classificar_falha(NEW.status, NEW.erro_codigo, NEW.erro);
  EXCEPTION WHEN OTHERS THEN
    NEW.falha_classe := NULL;
  END;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS logs_mensagens_classificar ON logs_mensagens;
CREATE TRIGGER logs_mensagens_classificar
  BEFORE INSERT OR UPDATE OF status, erro_codigo, erro ON logs_mensagens
  FOR EACH ROW EXECUTE FUNCTION public.trg_logs_mensagens_classificar();


-- Backfill do passivo.
UPDATE logs_mensagens
SET falha_classe = public.classificar_falha(status, erro_codigo, erro)
WHERE status = 'falha' AND falha_classe IS NULL;


-- ==========================================================================
-- PARTE B — Higiene do falso positivo de JID
--
-- docs/fix-guard-jid-n8n.md reclassificou 591 logs até 05/08/2026, mas a
-- Correção 1 (guard no n8n de produção) NUNCA foi aplicada: nasceram 51 novos
-- `remote_jid_divergente`, o último em 13/08/2026. Enquanto o n8n não for
-- corrigido isso continua nascendo — e cada um é uma parcela que volta para a
-- fila e é cobrada de novo (7 alunos duplicados em 04/08).
--
-- Aqui só reclassificamos o passivo, e SÓ o que a regra canônica prova ser
-- benigno. Divergência real (outro titular) é preservada como falha.
-- Rode o SELECT de conferência antes do UPDATE.
-- ==========================================================================

-- Conferência (dry-run): quantos são benignos vs divergência real.
-- SELECT
--   CASE WHEN public.chave_comparavel((regexp_match(erro, 'roteou pra ([^,\s]+)'))[1])
--           = public.chave_comparavel((regexp_match(erro, 'esperado ([^,\s]+)'))[1])
--        THEN 'benigno (nono digito)' ELSE 'divergencia real' END AS veredito,
--   count(*)
-- FROM logs_mensagens
-- WHERE erro_codigo = 'remote_jid_divergente'
-- GROUP BY 1;

-- UPDATE logs_mensagens
-- SET status = 'enviado', erro_codigo = 'jid_canonico_br', falha_classe = NULL
-- WHERE erro_codigo = 'remote_jid_divergente'
--   AND public.chave_comparavel((regexp_match(erro, 'roteou pra ([^,\s]+)'))[1])
--     = public.chave_comparavel((regexp_match(erro, 'esperado ([^,\s]+)'))[1]);


-- ==========================================================================
-- PARTE C — Fila materializada
--
-- Modelo: a fila é uma PREVISÃO diária, escrita antes da janela de envio, e
-- fechada por reconciliação contra logs_mensagens. Escolha deliberada de não
-- reescrever o caminho de envio do n8n nesta fase — o workflow de produção
-- diverge do versionado (docs/fix-guard-jid-n8n.md:227) e ele move dinheiro.
-- O que sobra `pendente` depois da janela é exatamente o buraco que hoje é
-- invisível.
--
-- payment_confirmed e welcome não entram: são disparados por evento (baixa de
-- pagamento, cadastro), não dá para prever. Eles são escritos direto pelo
-- front no momento do envio, na Fase 1.
-- ==========================================================================

CREATE TABLE IF NOT EXISTS mensagens_fila (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  user_id UUID NOT NULL,
  devedor_id UUID,
  mensalidade_id UUID,

  tipo TEXT NOT NULL,               -- pre_due_3days | due_day | overdue | pos_due_3days
  -- Janela é o que realmente identifica a cobrança do dia. `tipo` não serve de
  -- chave: em_atraso e 3dias_depois são tipos diferentes na MESMA janela D+3 e
  -- hoje devolvem a mesma parcela no mesmo dia.
  janela TEXT NOT NULL,             -- d-3 | d0 | d+3
  canal TEXT NOT NULL DEFAULT 'whatsapp',
  telefone TEXT,

  agendado_para TIMESTAMPTZ NOT NULL,
  estado TEXT NOT NULL DEFAULT 'pendente',
  -- pendente  → prevista, ainda não saiu
  -- barrada   → não vai ser tentada por um gate (hoje: WhatsApp desconectado)
  -- concluida → casada com um registro terminal em logs_mensagens
  -- expirada  → passou a janela útil sem nunca ter sido tentada
  motivo TEXT,                      -- whatsapp_offline, ...

  tentativas INT NOT NULL DEFAULT 0,
  log_id UUID REFERENCES logs_mensagens(id) ON DELETE SET NULL,
  origem TEXT NOT NULL DEFAULT 'materializador',

  -- A trava anti-duplicidade. user + parcela + janela + dia.
  dedupe_key TEXT NOT NULL UNIQUE,

  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fila_user_estado ON mensagens_fila(user_id, estado, agendado_para DESC);
CREATE INDEX IF NOT EXISTS idx_fila_estado_agendado ON mensagens_fila(estado, agendado_para);
CREATE INDEX IF NOT EXISTS idx_fila_mensalidade ON mensagens_fila(mensalidade_id);

ALTER TABLE mensagens_fila ENABLE ROW LEVEL SECURITY;

-- OR is_admin(): sem isso o seletor de conta do admin mostra tela VAZIA, sem
-- erro (ver memória rls_admin_seletor_is_admin).
DROP POLICY IF EXISTS "fila do proprio usuario" ON mensagens_fila;
CREATE POLICY "fila do proprio usuario" ON mensagens_fila
  FOR SELECT USING (user_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS "fila escrita service role" ON mensagens_fila;
CREATE POLICY "fila escrita service role" ON mensagens_fila
  FOR ALL TO service_role USING (true) WITH CHECK (true);


CREATE OR REPLACE FUNCTION public.mensagens_fila_dedupe_key(
  p_user_id UUID, p_mensalidade_id UUID, p_devedor_id UUID, p_janela TEXT, p_dia DATE
) RETURNS TEXT LANGUAGE sql IMMUTABLE AS $$
  SELECT p_user_id::text || ':' ||
         COALESCE(p_mensalidade_id::text, 'd' || p_devedor_id::text) || ':' ||
         p_janela || ':' || p_dia::text
$$;


-- Materializa a previsão do dia.
--
-- Lê as views vivas (não reimplementa os filtros: plano, limite, master switch,
-- lixo, assinatura_ativa ficam onde estão) e soma vw_parcelas_barradas_offline,
-- que é a MESMA regra com LEFT JOIN em mensallizap — é dali que sai o registro
-- da mensagem que hoje simplesmente evapora.
CREATE OR REPLACE FUNCTION public.materializar_fila_dia()
RETURNS TABLE(inseridas INT, barradas INT) LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_dia DATE := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  -- Janela real de disparo do n8n: 09:02 BRT.
  v_quando TIMESTAMPTZ := ((v_dia + time '09:00') AT TIME ZONE 'America/Sao_Paulo');
  v_ins INT := 0; v_bar INT := 0;
BEGIN
  WITH previstas AS (
    SELECT user_id, devedor_id, parcela_id, 'pre_due_3days' AS tipo, 'd-3' AS janela, telefone FROM vw_parcelas_lembrete_3dias
    UNION ALL
    SELECT user_id, devedor_id, parcela_id, 'due_day',        'd0',  telefone FROM vw_parcelas_no_dia
    UNION ALL
    -- Fonte D+3 = vw_parcelas_3dias_depois, que e o que o workflow VIVO le.
    -- vw_parcelas_em_atraso NAO entra: so o workflow legado (OFF) a consome.
    SELECT user_id, devedor_id, parcela_id, 'overdue',        'd+3', telefone FROM vw_parcelas_3dias_depois
  ), inseridas_cte AS (
    INSERT INTO mensagens_fila
      (user_id, devedor_id, mensalidade_id, tipo, janela, telefone, agendado_para, estado, origem, dedupe_key)
    SELECT DISTINCT ON (public.mensagens_fila_dedupe_key(user_id, parcela_id, devedor_id, janela, v_dia))
      user_id, devedor_id, parcela_id, tipo, janela, telefone, v_quando, 'pendente', 'materializador',
      public.mensagens_fila_dedupe_key(user_id, parcela_id, devedor_id, janela, v_dia)
    FROM previstas
    -- Colapso determinístico da janela D+3: quando em_atraso e 3dias_depois
    -- devolvem a mesma parcela, sobra `overdue` — uma cobrança, não duas.
    ORDER BY public.mensagens_fila_dedupe_key(user_id, parcela_id, devedor_id, janela, v_dia), tipo
    ON CONFLICT (dedupe_key) DO NOTHING
    RETURNING 1
  )
  SELECT count(*)::int INTO v_ins FROM inseridas_cte;

  -- Barradas: passariam em todos os outros filtros e são cortadas só pela
  -- instância desconectada. Hoje somem sem deixar rastro.
  WITH barradas_cte AS (
    INSERT INTO mensagens_fila
      (user_id, devedor_id, mensalidade_id, tipo, janela, telefone, agendado_para, estado, motivo, origem, dedupe_key)
    SELECT DISTINCT ON (public.mensagens_fila_dedupe_key(
             user_id, parcela_id, devedor_id,
             CASE janela WHEN 'pre_due_3days' THEN 'd-3' WHEN 'due_day' THEN 'd0' ELSE 'd+3' END, v_dia))
      user_id, devedor_id, parcela_id, janela,
      CASE janela WHEN 'pre_due_3days' THEN 'd-3' WHEN 'due_day' THEN 'd0' ELSE 'd+3' END,
      telefone, v_quando, 'barrada', 'whatsapp_offline', 'materializador',
      public.mensagens_fila_dedupe_key(
        user_id, parcela_id, devedor_id,
        CASE janela WHEN 'pre_due_3days' THEN 'd-3' WHEN 'due_day' THEN 'd0' ELSE 'd+3' END, v_dia)
    FROM vw_parcelas_barradas_offline
    ORDER BY public.mensagens_fila_dedupe_key(
               user_id, parcela_id, devedor_id,
               CASE janela WHEN 'pre_due_3days' THEN 'd-3' WHEN 'due_day' THEN 'd0' ELSE 'd+3' END, v_dia), janela
    ON CONFLICT (dedupe_key) DO NOTHING
    RETURNING 1
  )
  SELECT count(*)::int INTO v_bar FROM barradas_cte;

  RETURN QUERY SELECT v_ins, v_bar;
END $$;


-- Fecha a previsão contra o que realmente aconteceu.
--
-- Casa por (user, mensalidade, dia) e não por tipo de propósito: os nós de
-- sucesso do n8n gravam `tipo = NULL` (Correção 2 do fix-guard, nunca aplicada),
-- então casar por tipo fecharia só as falhas e deixaria todo sucesso órfão.
CREATE OR REPLACE FUNCTION public.reconciliar_fila()
RETURNS INT LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_n INT;
BEGIN
  WITH casadas AS (
    SELECT DISTINCT ON (f.id) f.id AS fila_id, l.id AS log_id, l.status
    FROM mensagens_fila f
    JOIN logs_mensagens l
      ON l.user_id = f.user_id
     AND l.mensalidade_id IS NOT DISTINCT FROM f.mensalidade_id
     AND (l.enviado_em AT TIME ZONE 'America/Sao_Paulo')::date
       = (f.agendado_para AT TIME ZONE 'America/Sao_Paulo')::date
     AND (l.tipo IS NULL OR l.tipo = f.tipo)
    WHERE f.estado IN ('pendente', 'barrada')
      AND f.mensalidade_id IS NOT NULL
    ORDER BY f.id, l.enviado_em DESC
  )
  UPDATE mensagens_fila f
  SET estado = 'concluida',
      log_id = c.log_id,
      tentativas = f.tentativas + 1,
      atualizado_em = now()
  FROM casadas c
  WHERE f.id = c.fila_id;

  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END $$;


-- Cobrança de vencimento entregue no dia seguinte é pior que não entregue.
-- A janela útil é o DIA; passada a virada, a linha para de ser "vai sair" e
-- vira evidência de que não saiu.
CREATE OR REPLACE FUNCTION public.expirar_fila()
RETURNS INT LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_n INT;
BEGIN
  UPDATE mensagens_fila
  SET estado = 'expirada', atualizado_em = now()
  WHERE estado IN ('pendente', 'barrada')
    AND (agendado_para AT TIME ZONE 'America/Sao_Paulo')::date
      < (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END $$;


-- ==========================================================================
-- PARTE D — Leitura honesta
-- ==========================================================================

-- Taxa de falha sem os falsos positivos. A conta que todo mundo cita hoje
-- (26,5% em 30 dias) inclui mensagem entregue e mensagem nunca tentada.
CREATE OR REPLACE VIEW vw_mensagens_saude AS
SELECT
  (enviado_em AT TIME ZONE 'America/Sao_Paulo')::date AS dia,
  user_id,
  count(*) FILTER (WHERE status = 'enviado')                          AS aceitas,
  count(*) FILTER (WHERE falha_classe = 'nao_falha')                  AS entregues_jid_alt,
  count(*) FILTER (WHERE falha_classe = 'transitoria')                AS falha_infra,
  count(*) FILTER (WHERE falha_classe = 'permanente')                 AS falha_cadastro,
  count(*) FILTER (WHERE falha_classe = 'nao_tentada')                AS nunca_tentadas,
  count(*) FILTER (WHERE falha_classe IN ('config', 'indeterminada')) AS falha_outra,
  round(100.0 * count(*) FILTER (WHERE falha_classe IN ('transitoria', 'permanente', 'config', 'indeterminada'))
        / NULLIF(count(*) FILTER (WHERE falha_classe IS DISTINCT FROM 'nao_falha'), 0), 1) AS pct_falha_real
FROM logs_mensagens
GROUP BY 1, 2;


-- ==========================================================================
-- PARTE E — Agendamento (APLICADO em 17/08/2026)
--
-- Horários em UTC. O n8n dispara as cobranças 09:02 BRT = 12:02 UTC.
--   11:40 UTC (08:40 BRT) fecha o dia anterior
--   11:45 UTC (08:45 BRT) materializa a previsão, ANTES da janela de envio
--   13/16/22 UTC          reconcilia contra o que realmente saiu
--
-- Estes jobs só escrevem em mensagens_fila. Nenhum deles envia mensagem nem
-- toca em mensalidades — desligar é cron.unschedule('<nome>').
-- ==========================================================================

-- SELECT cron.schedule('fila-expirar',      '40 11 * * *',      $$SELECT public.expirar_fila()$$);
-- SELECT cron.schedule('fila-materializar', '45 11 * * *',      $$SELECT public.materializar_fila_dia()$$);
-- SELECT cron.schedule('fila-reconciliar',  '0 13,16,22 * * *', $$SELECT public.reconciliar_fila()$$);


-- ==========================================================================
-- PASSO 5 — Fechar a leitura de logs_mensagens (aplicado em 18/08/2026)
--
-- A policy "Acesso total logs" era `FOR ALL USING (true)`. Policies são OR'd,
-- então as três restritas ao lado dela não valiam nada: qualquer usuário
-- autenticado lia mensagem de TODAS as contas — corpo, aluno, telefone, valor.
-- A Central é feita exatamente desses dados, então isso tinha de cair antes de
-- a tela ser aberta ao cliente.
--
-- ORDEM IMPORTA: o WITH CHECK do INSERT é afrouxado ANTES de a policy aberta
-- cair, na mesma transação — senão existe um instante em que envio deixa de
-- ser logado.
--
-- Medido depois de aplicar:
--   admin        → 10.611 linhas, 42 contas
--   gestor comum →    604 linhas,  1 conta
--   anon         →      0 linhas
-- ==========================================================================

-- O front grava user_id = dono da mensalidade/aluno, NÃO o usuário logado.
-- Sem o is_admin(), todo envio feito pelo seletor de conta do admin passaria a
-- acontecer sem log — o buraco silencioso que este projeto existe para fechar.
-- Verificado em 18/08: não há colaborador com login próprio operando conta
-- alheia (dos 3 com conta auth, 2 são o próprio gestor e 1 é registro de teste
-- sem login desde janeiro).
ALTER POLICY "Usuários podem criar seus próprios logs" ON logs_mensagens
  WITH CHECK (auth.uid() = user_id OR public.is_admin());

DROP POLICY IF EXISTS "Acesso total logs" ON logs_mensagens;

-- Vazamento equivalente aberto pela Parte D: a view de saúde nasceu sem
-- security_invoker, então rodava com os direitos do dono e ignorava a RLS.
ALTER VIEW vw_mensagens_saude SET (security_invoker = true);
