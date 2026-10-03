-- ============================================================
-- Teste do Toque 1 automatico. NAO GRAVA NADA.
--
-- Roda sql-auto-toque-1.sql antes. Este script cria um lead de teste, simula as
-- mensagens e termina de proposito com um erro que mostra o resultado de cada
-- cenario. Como termina em erro, o Postgres desfaz tudo (inclusive o lead de teste).
--
-- Resultado esperado: sete linhas terminando em "OK" (a mensagem aparece como
-- ERRO "TESTE AUTO-TOQUE ... nada foi gravado" -- e isso mesmo).
-- ============================================================

DO $teste$
DECLARE
  v_id    mensalli_leads.id%TYPE;
  v_st    text;
  v_out   text := '';
BEGIN
  INSERT INTO mensalli_leads (remote_jid, telefone, nome, status, origem, ultima_mensagem, ultima_direcao, ultima_interacao, nao_lidas)
  VALUES ('zz-teste-auto-toque@s.whatsapp.net', NULL, 'Teste auto toque', 'conversando', 'whatsapp', 'oi', 'in', NOW() - INTERVAL '2 days', 0)
  RETURNING id INTO v_id;

  -- 1) voce manda mensagem: conversando -> a_toque_1
  UPDATE mensalli_leads SET ultima_direcao = 'out', ultima_interacao = NOW() - INTERVAL '1 day' WHERE id = v_id;
  SELECT status INTO v_st FROM mensalli_leads WHERE id = v_id;
  v_out := v_out || E'\n1) voce manda mensagem            -> ' || v_st || CASE WHEN v_st = 'a_toque_1' THEN '   OK' ELSE '   FALHOU (esperado a_toque_1)' END;

  -- 2) ele responde: a_toque_1 -> conversando
  UPDATE mensalli_leads SET ultima_direcao = 'in', ultima_interacao = NOW() - INTERVAL '12 hours' WHERE id = v_id;
  SELECT status INTO v_st FROM mensalli_leads WHERE id = v_id;
  v_out := v_out || E'\n2) ele responde                   -> ' || v_st || CASE WHEN v_st = 'conversando' THEN '   OK' ELSE '   FALHOU (esperado conversando)' END;

  -- 3) parado ha 45 dias (Reaquecimento): mensagem sua NAO move
  UPDATE mensalli_leads SET ultima_direcao = 'in', ultima_interacao = NOW() - INTERVAL '45 days' WHERE id = v_id;
  UPDATE mensalli_leads SET ultima_direcao = 'out', ultima_interacao = NOW() - INTERVAL '44 days' WHERE id = v_id;
  SELECT status INTO v_st FROM mensalli_leads WHERE id = v_id;
  v_out := v_out || E'\n3) parado 45 dias, voce manda     -> ' || v_st || CASE WHEN v_st = 'conversando' THEN '   OK' ELSE '   FALHOU (esperado conversando)' END;

  -- 4) toque de reaquecimento recente valendo: segunda mensagem sua NAO move
  UPDATE mensalli_leads SET ultima_direcao = 'out', ultima_interacao = NOW() - INTERVAL '3 hours' WHERE id = v_id;
  UPDATE mensalli_leads SET passo = 'reaq_30', passo_em = NOW() - INTERVAL '2 hours' WHERE id = v_id;
  UPDATE mensalli_leads SET ultima_direcao = 'out', ultima_interacao = NOW() - INTERVAL '1 hour' WHERE id = v_id;
  SELECT status INTO v_st FROM mensalli_leads WHERE id = v_id;
  v_out := v_out || E'\n4) reaquecimento em andamento      -> ' || v_st || CASE WHEN v_st = 'conversando' THEN '   OK' ELSE '   FALHOU (esperado conversando)' END;

  -- 5) arquivado: mensagem sua NAO move
  UPDATE mensalli_leads SET passo = NULL, passo_em = NULL, arquivado = true WHERE id = v_id;
  UPDATE mensalli_leads SET ultima_direcao = 'out', ultima_interacao = NOW() WHERE id = v_id;
  SELECT status INTO v_st FROM mensalli_leads WHERE id = v_id;
  v_out := v_out || E'\n5) arquivado, voce manda          -> ' || v_st || CASE WHEN v_st = 'conversando' THEN '   OK' ELSE '   FALHOU (esperado conversando)' END;

  -- 6) Aguardando: resposta dele NAO tira de Aguardando
  UPDATE mensalli_leads SET arquivado = false WHERE id = v_id;
  UPDATE mensalli_leads SET status = 'aguardando' WHERE id = v_id;
  UPDATE mensalli_leads SET ultima_direcao = 'in', ultima_interacao = NOW() + INTERVAL '1 minute' WHERE id = v_id;
  SELECT status INTO v_st FROM mensalli_leads WHERE id = v_id;
  v_out := v_out || E'\n6) aguardando, ele responde        -> ' || v_st || CASE WHEN v_st = 'aguardando' THEN '   OK' ELSE '   FALHOU (esperado aguardando)' END;

  -- 7) quem esta ignorado: mensagem sua NAO move
  UPDATE mensalli_leads SET status = 'conversando', ignorado = true WHERE id = v_id;
  UPDATE mensalli_leads SET ultima_direcao = 'out', ultima_interacao = NOW() + INTERVAL '2 minutes' WHERE id = v_id;
  SELECT status INTO v_st FROM mensalli_leads WHERE id = v_id;
  v_out := v_out || E'\n7) ignorado, voce manda           -> ' || v_st || CASE WHEN v_st = 'conversando' THEN '   OK' ELSE '   FALHOU (esperado conversando)' END;

  RAISE EXCEPTION E'TESTE AUTO-TOQUE (nada foi gravado):%', v_out;
END
$teste$;
