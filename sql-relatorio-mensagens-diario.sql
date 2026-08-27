-- ==========================================================================
-- RELATÓRIO DIÁRIO DE MENSAGENS — fundação de dados
--
-- Roda às 11h BRT (14h UTC), depois de TODA a rodagem da manhã:
--   11:25 UTC  fila-expirar
--   11:30 UTC  fila-materializar
--   11:36 UTC  fila-worker (de 2 em 2 min até 11:54)
--   12:00 UTC  cobranca-saas / n8n  (9h BRT)
--   14:00 UTC  ESTE relatório       (11h BRT)
--
-- CUSTO: uma chamada de RPC por dia. ZERO chamadas à Evolution — todo o dado
-- já está em logs_mensagens/mensagens_fila. Isso é deliberado e repete a regra
-- do whatsapp-zumbi-diario: perguntar o estado para a Evolution foi a causa
-- comprovada das quedas em massa (sonda onWhatsApp, 48x/dia, 22 de 22 quedas
-- com statusCode 401). Um relatório NUNCA justifica tocar na Evolution.
--
-- Idempotente: pode rodar mais de uma vez.
-- ==========================================================================


-- ==========================================================================
-- PARTE A — Correção: numero_inexistente é falha PERMANENTE, não transitória
--
-- A versão viva no banco classificava número inexistente como 'transitoria'.
-- Divergia do que o repo documenta (sql-fase0-central-mensagens.sql) e tinha
-- três consequências, todas visíveis no relatório que esta migration habilita:
--
--   1. vw_mensagens_saude.falha_cadastro ficava travado em 0 — a métrica que
--      existe justamente para separar "problema nosso" de "cadastro errado do
--      cliente" nunca acusava nada.
--   2. O relatório culparia infraestrutura por erro de digitação no telefone.
--      Em 7 dias foram 11 registros contados como instabilidade.
--   3. Pior: 'transitoria' é a ÚNICA classe que a Central autoriza a reenviar
--      e a única que entra em retry automático. Número que não existe no
--      WhatsApp entrava na fila de reenvio para sempre.
--
-- A precedência do CASE é preservada: o teste de permanente vem ANTES do balde
-- transitório, porque a Evolution devolve número inexistente dentro de um 400
-- genérico (erro_codigo='bad_request', corpo {"exists": false}).
-- ==========================================================================

CREATE OR REPLACE FUNCTION public.classificar_falha(
  p_status TEXT, p_erro_codigo TEXT, p_erro TEXT
) RETURNS TEXT LANGUAGE sql IMMUTABLE AS $function$
  SELECT CASE
    WHEN p_status IS DISTINCT FROM 'falha' THEN NULL

    -- Entregue; só o JID canônico difere do cadastrado (contas BR pré-Anatel),
    -- ou o erro veio do pool de conexão da própria Evolution.
    WHEN p_erro_codigo IN ('remote_jid_divergente', 'jid_canonico_br', 'evolution_db_pool') THEN 'nao_falha'

    -- Lote abortado por tempo no n8n (nó Code morre em 300s e marca o lote
    -- inteiro, inclusive o que nunca chegou a ser tentado). É fila, não erro.
    WHEN p_erro_codigo = 'adiado_sem_tempo' THEN 'nao_tentada'

    -- PERMANENTE — reenviar nunca resolve; vira tarefa de corrigir cadastro.
    -- O corpo do 400 chega serializado com aspas escapadas ("\"exists\":false"),
    -- daí a classe de caractere em volta.
    WHEN p_erro_codigo = 'numero_inexistente' THEN 'permanente'
    WHEN p_erro ~* 'exists[\\"]*\s*:\s*false' THEN 'permanente'

    WHEN p_erro_codigo = 'auth_failed' THEN 'config'

    WHEN p_erro_codigo IN ('connection_closed', 'instance_500', 'instance_not_found',
                           'timeout', 'exception', 'bad_request', 'unknown')
      OR p_erro_codigo LIKE 'network_%'
      OR p_erro_codigo LIKE 'http_5%' THEN 'transitoria'
    WHEN p_erro ~* 'Connection Closed|EAI_AGAIN|PrismaClient|Internal Server Error|desconectad|reconectar' THEN 'transitoria'
    WHEN p_erro ~ '(status code|^)\s*5[0-9][0-9]( -|$)' THEN 'transitoria'

    ELSE 'indeterminada'
  END
$function$;


-- Backfill: falha_classe é materializada no INSERT por trigger, então corrigir
-- a função não reclassifica o passado. Só toca em quem a função nova classifica
-- diferente — não reescreve a tabela inteira.
UPDATE logs_mensagens
   SET falha_classe = public.classificar_falha(status, erro_codigo, erro)
 WHERE status = 'falha'
   AND falha_classe IS DISTINCT FROM public.classificar_falha(status, erro_codigo, erro);


-- ==========================================================================
-- PARTE B — O relatório, em UMA chamada
--
-- Devolve um jsonb com tudo que o e-mail precisa. A edge function não faz
-- conta nenhuma: só formata. Assim o número do e-mail e o número da tela saem
-- sempre da mesma fonte.
-- ==========================================================================

CREATE OR REPLACE FUNCTION public.relatorio_mensagens_dia(p_dia DATE DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
AS $function$
DECLARE
  v_dia DATE;
  v_ini TIMESTAMPTZ;
  v_fim TIMESTAMPTZ;
  v_res JSONB;
BEGIN
  v_dia := COALESCE(p_dia, (now() AT TIME ZONE 'America/Sao_Paulo')::date);

  -- Faixa em timestamptz: mantém o índice de enviado_em utilizável.
  -- Comparar (enviado_em AT TIME ZONE ...)::date = X não é sargable.
  v_ini := (v_dia::timestamp)       AT TIME ZONE 'America/Sao_Paulo';
  v_fim := ((v_dia + 1)::timestamp) AT TIME ZONE 'America/Sao_Paulo';

  WITH log_dia AS (
    SELECT * FROM logs_mensagens
     WHERE enviado_em >= v_ini AND enviado_em < v_fim
  ),

  -- Totais por dia dos 28 dias anteriores. 28 para ter 4 amostras de CADA dia
  -- da semana.
  dias AS (
    SELECT (enviado_em AT TIME ZONE 'America/Sao_Paulo')::date AS d,
           count(*) AS tot,
           count(*) FILTER (WHERE falha_classe IN ('transitoria','permanente','config','indeterminada')) AS falhas
      FROM logs_mensagens
     WHERE enviado_em >= v_ini - INTERVAL '28 days' AND enviado_em < v_ini
     GROUP BY 1
  ),

  -- media_dia_semana é a referência que importa para detectar "não rodou".
  -- Domingo opera a ~20% de um dia útil (medido: razão 0,17 e 0,34 nos dois
  -- últimos domingos contra a média geral, enquanto sábado dá 0,82-0,96).
  -- Contra a média geral, TODO domingo acusaria queda e o alerta viraria ruído;
  -- contra os domingos anteriores, 23/08 sai em 0,79 e 27/08 (quinta) em 0,98.
  hist AS (
    SELECT
      (SELECT round(avg(tot)::numeric, 1)    FROM dias WHERE d >= v_dia - 7) AS media_total,
      (SELECT round(avg(falhas)::numeric, 1) FROM dias WHERE d >= v_dia - 7) AS media_falhas,
      (SELECT round(avg(tot)::numeric, 1)    FROM dias
        WHERE extract(dow FROM d) = extract(dow FROM v_dia))                 AS media_dia_semana
  )

  SELECT jsonb_build_object(
    'dia', v_dia,
    'dia_semana', to_char(v_dia, 'Dy'),

    'resumo', (
      SELECT jsonb_build_object(
        'total_registros',     count(*),
        'enviadas',            count(*) FILTER (WHERE status = 'enviado'),
        'entregues_jid_alt',   count(*) FILTER (WHERE falha_classe = 'nao_falha'),
        'falhas_reais',        count(*) FILTER (WHERE falha_classe IN ('transitoria','permanente','config','indeterminada')),
        'falha_infra',         count(*) FILTER (WHERE falha_classe = 'transitoria'),
        'falha_cadastro',      count(*) FILTER (WHERE falha_classe = 'permanente'),
        'falha_config',        count(*) FILTER (WHERE falha_classe = 'config'),
        'falha_indeterminada', count(*) FILTER (WHERE falha_classe = 'indeterminada'),
        'nunca_tentadas_log',  count(*) FILTER (WHERE falha_classe = 'nao_tentada'),
        'pct_falha', round(
          100.0 * count(*) FILTER (WHERE falha_classe IN ('transitoria','permanente','config','indeterminada'))::numeric
          / NULLIF(count(*) FILTER (WHERE falha_classe IS DISTINCT FROM 'nao_falha'), 0)::numeric, 1)
      ) FROM log_dia
    ),

    'comparativo', (SELECT to_jsonb(h) FROM hist h),

    -- Por que falharam: classe + código bruto + um exemplo do texto do erro.
    'motivos', COALESCE((
      SELECT jsonb_agg(m ORDER BY (m->>'qtd')::int DESC)
      FROM (
        SELECT jsonb_build_object(
                 'classe',  COALESCE(falha_classe, 'sem_classe'),
                 'codigo',  COALESCE(erro_codigo, '(sem codigo)'),
                 'qtd',     count(*)::int,
                 'exemplo', left(max(erro), 180)
               ) AS m
          FROM log_dia
         WHERE status = 'falha' AND COALESCE(falha_classe, '') <> 'nao_falha'
         GROUP BY falha_classe, erro_codigo
      ) s
    ), '[]'::jsonb),

    -- Quais contas concentram a falha. Uma conta com 100% de falha é instância
    -- caída; falha espalhada por muitas contas é problema nosso.
    'contas', COALESCE((
      SELECT jsonb_agg(c ORDER BY (c->>'falhas')::int DESC)
      FROM (
        SELECT jsonb_build_object(
                 'conta',    COALESCE(NULLIF(u.nome_empresa, ''), u.email, l.user_id::text),
                 'enviadas', count(*) FILTER (WHERE l.status = 'enviado')::int,
                 'falhas',   count(*) FILTER (WHERE l.falha_classe IN ('transitoria','permanente','config','indeterminada'))::int,
                 'motivo_top', (
                   SELECT COALESCE(l2.erro_codigo, '(sem codigo)')
                     FROM log_dia l2
                    WHERE l2.user_id = l.user_id AND l2.status = 'falha'
                    GROUP BY l2.erro_codigo ORDER BY count(*) DESC LIMIT 1)
               ) AS c
          FROM log_dia l
          LEFT JOIN usuarios u ON u.id = l.user_id
         GROUP BY l.user_id, u.nome_empresa, u.email
        HAVING count(*) FILTER (WHERE l.falha_classe IN ('transitoria','permanente','config','indeterminada')) > 0
      ) s
    ), '[]'::jsonb),

    -- O que o log sozinho NÃO conta: mensagem que nunca virou log.
    'fila', COALESCE((
      SELECT jsonb_object_agg(estado, qtd)
        FROM (SELECT estado, count(*)::int AS qtd
                FROM mensagens_fila
               WHERE agendado_para >= v_ini AND agendado_para < v_fim
                 AND estado <> 'concluida'
               GROUP BY estado) f
    ), '{}'::jsonb),

    -- Parcelas que sumiram da régua porque a instância estava offline na hora
    -- do disparo (incidente Rede Fit, 04/08): sem envio, sem log, sem alerta.
    'barradas_offline', (SELECT count(*)::int FROM vw_parcelas_barradas_offline),

    -- Sinalizador de integridade: se aparecer, o dado do relatório é suspeito.
    'avisos', COALESCE((
      SELECT jsonb_agg(a) FROM (
        SELECT 'Há ' || count(*) || ' falha(s) sem falha_classe preenchida — o trigger de classificação pode ter falhado.' AS a
          FROM log_dia WHERE status = 'falha' AND falha_classe IS NULL
        HAVING count(*) > 0
      ) s
    ), '[]'::jsonb)
  ) INTO v_res;

  RETURN v_res;
END
$function$;

GRANT EXECUTE ON FUNCTION public.relatorio_mensagens_dia(DATE) TO service_role;


-- ==========================================================================
-- PARTE C — Agendamento
--
-- ATENÇÃO: pg_cron neste projeto roda em UTC. Todos os jobs existentes seguem
-- essa convenção (cobranca-saas às 9h BRT está agendada como '0 12 * * *').
-- 11h BRT = 14h UTC.
-- ==========================================================================

SELECT cron.unschedule('relatorio-mensagens-diario')
 WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'relatorio-mensagens-diario');

SELECT cron.schedule(
  'relatorio-mensagens-diario',
  '0 14 * * *',
  $$
  SELECT net.http_post(
    url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'project_url') || '/functions/v1/relatorio-mensagens',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key')
    ),
    body := '{}'::jsonb
  );
  $$
);


-- --------------------------------------------------------------------------
-- Como testar sem enviar e-mail (devolve o JSON e o HTML montado):
--
--   SELECT net.http_post(
--     url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='project_url')
--            || '/functions/v1/relatorio-mensagens',
--     headers := jsonb_build_object('Content-Type','application/json',
--       'Authorization','Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='service_role_key')),
--     body := '{"dryRun": true, "dia": "2026-08-21"}'::jsonb);
--
--   -- pg_net é assíncrono; o retorno chega depois em:
--   SELECT status_code, content FROM net._http_response ORDER BY id DESC LIMIT 1;
--
-- Só os números, sem passar pela edge function:
--   SELECT jsonb_pretty(relatorio_mensagens_dia('2026-08-21'));
-- --------------------------------------------------------------------------
