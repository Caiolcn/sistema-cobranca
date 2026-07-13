-- ============================================================
-- SCORE DE PROPENSAO A CONVERTER (Retencao SaaS)
-- ============================================================
-- Ordena a fila de "Recuperar trials" (/app/admin -> Retencao SaaS) por quem
-- tem mais chance de virar (ou voltar a ser) pagante, em vez de tratar todo
-- mundo igual.
--
-- DE ONDE VIERAM OS PESOS (base real, 13/07/26 — 25 pagantes x 50 nao-pagantes)
-- Comparacao feita na MESMA janela de 7 dias pos-cadastro, de proposito: se a
-- gente olhasse o uso "de hoje", o pagante pareceria mais engajado só porque
-- continuou usando DEPOIS de pagar (confundir efeito com causa).
--
--   sinal no trial            pagantes   nao-pagantes
--   cadastrou 10+ alunos ....... 84%   x   18%      <- mais forte
--   conectou o WhatsApp ........ 76%   x   20%      <- segundo mais forte
--   montou a grade ............. 10,0  x   0,6  aulas (media)
--   deu baixa em mensalidade ... 35,4  x   4,6  (media)
--   criou plano ................ 96%   x   62%      <- fraco, quase todo mundo cria
--
-- BACKTEST (mesmos pesos, so com o que existia ate o 7o dia):
--   score medio 74,8 nos que viraram pagantes  x  17,6 nos que nao viraram
--   76% dos pagantes cairiam em "quente"; 72% dos nao-pagantes em "frio"
--   dos 25 marcados "quente", 19 realmente pagaram
--
-- Nao e caixa-preta: a funcao devolve os MOTIVOS, que a tela mostra no card.
-- ============================================================

CREATE OR REPLACE FUNCTION mensalli_engajamento(p_user_id UUID)
RETURNS TABLE (score INT, temperatura TEXT, motivos TEXT[])
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_alunos INT;
  v_conectou BOOLEAN;
  v_aulas INT;
  v_baixas INT;
  v_msgs INT;
  v_dias_ativos INT;
  v_score INT := 0;
  v_motivos TEXT[] := ARRAY[]::TEXT[];
BEGIN
  -- OBRIGATORIO: e SECURITY DEFINER (le a base toda) e as views de score sao
  -- security_invoker por cima de views antigas SEM RLS — sem este guard, ate a
  -- chave anon conseguia ler o engajamento dos clientes.
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'apenas admin';
  END IF;

  SELECT count(*) INTO v_alunos
    FROM devedores d WHERE d.user_id = p_user_id AND coalesce(d.lixo, false) = false;

  -- Conexao de verdade: a linha em mensallizap nasce no cadastro pra todo mundo,
  -- entao ela NAO serve de sinal. logs_conexao 'conectado' serve.
  SELECT EXISTS (SELECT 1 FROM logs_conexao lc WHERE lc.user_id = p_user_id AND lc.status = 'conectado')
    INTO v_conectou;

  SELECT count(*) INTO v_aulas FROM aulas a WHERE a.user_id = p_user_id;

  SELECT count(*) INTO v_baixas
    FROM mensalidades m WHERE m.user_id = p_user_id AND m.status = 'pago';

  SELECT count(*) INTO v_msgs FROM logs_mensagens lm WHERE lm.user_id = p_user_id;

  SELECT count(DISTINCT date(lm.created_at)) INTO v_dias_ativos
    FROM logs_mensagens lm WHERE lm.user_id = p_user_id;

  -- Alunos cadastrados (0-35) — o sinal mais forte
  IF v_alunos >= 30 THEN
    v_score := v_score + 35;
    v_motivos := v_motivos || format('%s alunos cadastrados', v_alunos);
  ELSIF v_alunos >= 10 THEN
    v_score := v_score + 30;
    v_motivos := v_motivos || format('%s alunos cadastrados', v_alunos);
  ELSIF v_alunos >= 5 THEN
    v_score := v_score + 20;
    v_motivos := v_motivos || format('%s alunos cadastrados', v_alunos);
  ELSIF v_alunos >= 1 THEN
    v_score := v_score + 10;
    v_motivos := v_motivos || format('%s aluno(s) cadastrado(s)', v_alunos);
  END IF;

  -- WhatsApp conectado (0-25) — segundo divisor de aguas
  IF v_conectou THEN
    v_score := v_score + 25;
    v_motivos := v_motivos || 'conectou o WhatsApp'::TEXT;
  END IF;

  -- Grade montada (0-15)
  IF v_aulas >= 5 THEN
    v_score := v_score + 15;
    v_motivos := v_motivos || format('grade com %s aulas', v_aulas);
  ELSIF v_aulas >= 1 THEN
    v_score := v_score + 8;
    v_motivos := v_motivos || 'começou a montar a grade'::TEXT;
  END IF;

  -- Usou a cobranca de verdade (0-15)
  IF v_baixas >= 5 THEN
    v_score := v_score + 15;
    v_motivos := v_motivos || format('%s mensalidades baixadas', v_baixas);
  ELSIF v_baixas >= 1 THEN
    v_score := v_score + 8;
    v_motivos := v_motivos || 'já baixou mensalidade'::TEXT;
  END IF;

  -- Disparou cobranca pelo sistema (0-10)
  IF v_msgs >= 1 THEN
    v_score := v_score + 10;
    v_motivos := v_motivos || format('%s cobrança(s) enviada(s)', v_msgs);
  END IF;

  -- Voltou em mais de um dia (0-10) — habito, nao so curiosidade
  IF v_dias_ativos >= 2 THEN
    v_score := v_score + 10;
    v_motivos := v_motivos || format('ativo em %s dias diferentes', v_dias_ativos);
  END IF;

  v_score := LEAST(v_score, 100);

  RETURN QUERY SELECT
    v_score,
    CASE WHEN v_score >= 60 THEN 'quente'
         WHEN v_score >= 30 THEN 'morno'
         ELSE 'frio' END,
    CASE WHEN cardinality(v_motivos) = 0 THEN ARRAY['nunca saiu do zero']::TEXT[] ELSE v_motivos END;
END;
$$;

REVOKE ALL ON FUNCTION mensalli_engajamento(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION mensalli_engajamento(UUID) TO authenticated;

-- View consumida pelo painel (src/components/RetencaoSaas.js). Fica POR CIMA da
-- vw_mensalli_retencao_saas, que continua intacta pra quem ja depende dela.
CREATE OR REPLACE VIEW vw_mensalli_retencao_score AS
SELECT r.*, e.score, e.temperatura, e.motivos
FROM vw_mensalli_retencao_saas r
CROSS JOIN LATERAL mensalli_engajamento(r.usuario_id) e;

ALTER VIEW vw_mensalli_retencao_score SET (security_invoker = true);
GRANT SELECT ON vw_mensalli_retencao_score TO authenticated;

-- Score de TODO cliente (nao so os que caem nos buckets de retencao) — usado
-- pelo modal de disparo em massa do /admin (src/Admin.js), pra escolher pra quem
-- mandar em vez de marcar todo mundo no escuro.
CREATE OR REPLACE VIEW vw_mensalli_engajamento AS
SELECT u.id AS usuario_id, e.score, e.temperatura, e.motivos
FROM usuarios u
CROSS JOIN LATERAL mensalli_engajamento(u.id) e
WHERE u.role <> 'admin';

ALTER VIEW vw_mensalli_engajamento SET (security_invoker = true);
GRANT SELECT ON vw_mensalli_engajamento TO authenticated;
