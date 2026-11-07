-- ============================================================================
-- Separa as duas chaves da ficha do aluno
-- ----------------------------------------------------------------------------
-- ANTES: as duas faziam quase a mesma coisa. "Comunicações ativas" desligada
-- calava TUDO (cobrança inclusive) e "Cobranças pausadas" também calava
-- aniversário e lembrete de aula.
--
-- DEPOIS:
--   Comunicações ativas = false  -> para aula, aniversário, boas-vindas,
--                                   confirmação de pagamento, NPS, reativação.
--                                   COBRANÇA CONTINUA.
--   Cobranças pausadas (bloquear_mensagens = true) -> para só a régua de
--                                   cobrança (3 dias antes, no dia, atraso,
--                                   3 dias depois). O resto continua.
--
-- Exceções de propósito:
--   * vw_alunos_inativos_regua (reativação) e vw_alunos_aguardando_nps passam
--     a respeitar AS DUAS: aluno com cobrança pausada costuma ser quem saiu, e
--     mandar "sentimos sua falta" pra ele seria pior que não mandar.
--   * vw_radar_evasao não muda (é painel, não manda mensagem).
--
-- Impacto medido em 07/11/2026:
--   * 2 alunos (2 contas) com Comunicações off e Cobranças ligadas voltam a
--     receber cobrança — nenhum tem mensalidade em aberto hoje.
--   * 44 alunos (15 contas) com Cobranças pausadas e Comunicações ligadas
--     passam a receber aniversário e lembrete de aula.
--
-- Como funciona: lê a definição atual de cada view, troca SÓ o trecho do
-- filtro e recria. Se algum trecho não for encontrado o número esperado de
-- vezes, para tudo com erro e nada muda (é uma transação só).
-- ============================================================================

-- ---------- Conferência ANTES (anote os números) ----------
SELECT 'vw_parcelas_3dias_antes' v, count(*) FROM vw_parcelas_3dias_antes
UNION ALL SELECT 'vw_parcelas_no_dia', count(*) FROM vw_parcelas_no_dia
UNION ALL SELECT 'vw_parcelas_em_atraso', count(*) FROM vw_parcelas_em_atraso
UNION ALL SELECT 'vw_regua_cobranca', count(*) FROM vw_regua_cobranca
UNION ALL SELECT 'vw_aniversariantes_do_dia', count(*) FROM vw_aniversariantes_do_dia;


DO $$
DECLARE
  com  text := '((d.comunicacoes_ativas IS NULL) OR (d.comunicacoes_ativas = true))';
  blo  text := '((d.bloquear_mensagens IS NULL) OR (d.bloquear_mensagens = false))';
  r    record;
  def  text;
  novo text;
  achados int;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      -- view                          , trecho a trocar, troca por                       , vezes esperadas
      -- Cobrança: deixa de olhar "Comunicações"
      ('vw_parcelas_3dias_antes'      , 'com', 'true', 1),
      ('vw_parcelas_3dias_depois'     , 'com', 'true', 1),
      ('vw_parcelas_barradas_offline' , 'com', 'true', 3),
      ('vw_parcelas_em_atraso'        , 'com', 'true', 1),
      ('vw_parcelas_lembrete_3dias'   , 'com', 'true', 1),
      ('vw_parcelas_no_dia'           , 'com', 'true', 1),
      ('vw_regua_cobranca'            , 'com', 'true', 1),
      -- Comunicação: deixa de olhar "Cobranças pausadas"
      ('vw_aniversariantes_do_dia'    , 'blo', 'true', 1),
      ('vw_aulas_lembrete_1hora'      , 'blo', 'true', 3),
      ('vw_aulas_lembrete_24h'        , 'blo', 'true', 2),
      -- Reativação e NPS: respeitam as duas
      ('vw_alunos_inativos_regua'     , 'blo', 'ambas', 1),
      ('vw_alunos_aguardando_nps'     , 'blo', 'ambas', 1)
    ) AS t(vista, trecho, troca, esperado)
  LOOP
    def := pg_get_viewdef(('public.' || r.vista)::regclass);

    achados := (length(def) - length(replace(def, CASE r.trecho WHEN 'com' THEN com ELSE blo END, '')))
               / length(CASE r.trecho WHEN 'com' THEN com ELSE blo END);
    IF achados <> r.esperado THEN
      RAISE EXCEPTION '% : esperava % ocorrência(s) do filtro "%", achei %. Nada foi alterado.',
        r.vista, r.esperado, r.trecho, achados;
    END IF;

    novo := replace(
      def,
      CASE r.trecho WHEN 'com' THEN com ELSE blo END,
      CASE r.troca  WHEN 'true' THEN 'true' ELSE '(' || blo || ' AND ' || com || ')' END
    );

    EXECUTE format('CREATE OR REPLACE VIEW public.%I AS %s', r.vista, novo);
    RAISE NOTICE '% ok (% trecho(s))', r.vista, achados;
  END LOOP;
END $$;


-- ---------- Conferência DEPOIS ----------
-- 1) Cobrança não olha mais "comunicacoes_ativas" no filtro; aula/aniversário
--    não olham mais "bloquear_mensagens"; inativos/NPS olham as duas.
SELECT c.relname AS view,
       pg_get_viewdef(c.oid) LIKE '%(d.comunicacoes_ativas IS NULL) OR%' AS filtra_comunicacoes,
       pg_get_viewdef(c.oid) LIKE '%(d.bloquear_mensagens IS NULL) OR%'  AS filtra_cobranca_pausada
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
 WHERE n.nspname = 'public'
   AND c.relname IN ('vw_parcelas_3dias_antes','vw_parcelas_3dias_depois','vw_parcelas_barradas_offline',
                     'vw_parcelas_em_atraso','vw_parcelas_lembrete_3dias','vw_parcelas_no_dia','vw_regua_cobranca',
                     'vw_aniversariantes_do_dia','vw_aulas_lembrete_1hora','vw_aulas_lembrete_24h',
                     'vw_alunos_inativos_regua','vw_alunos_aguardando_nps')
 ORDER BY 1;

-- 2) Mesmos números de antes (ou um pouco maiores; nunca menores).
SELECT 'vw_parcelas_3dias_antes' v, count(*) FROM vw_parcelas_3dias_antes
UNION ALL SELECT 'vw_parcelas_no_dia', count(*) FROM vw_parcelas_no_dia
UNION ALL SELECT 'vw_parcelas_em_atraso', count(*) FROM vw_parcelas_em_atraso
UNION ALL SELECT 'vw_regua_cobranca', count(*) FROM vw_regua_cobranca
UNION ALL SELECT 'vw_aniversariantes_do_dia', count(*) FROM vw_aniversariantes_do_dia;
