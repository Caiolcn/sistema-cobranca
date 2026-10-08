-- ==========================================================================
-- RELATÓRIO DIÁRIO DE MENSAGENS — canal WhatsApp (12h BRT)
--
-- Complementa sql-relatorio-mensagens-diario.sql. O e-mail das 11h continua
-- igual; este job manda um resumo curto pelo WhatsApp master
-- (mensalli_master) para o PRÓPRIO número conectado nele.
--
-- O e-mail agrupa a falha por conta. No WhatsApp o pedido é ver QUEM falhou
-- (aluno + telefone), então a lista vem de uma função à parte, com o MESMO
-- filtro de "falha real" usado em relatorio_mensagens_dia() — os totais da
-- mensagem e a lista nunca divergem.
--
-- Idempotente: pode rodar mais de uma vez.
-- ==========================================================================


-- --------------------------------------------------------------------------
-- PARTE A — Lista de falhas do dia, destinatário por destinatário
--
-- 'recuperada' = o mesmo telefone, da mesma conta, recebeu uma mensagem com
-- sucesso DEPOIS da falha, no mesmo dia (reenvio da Central ou retry do
-- worker). Continua contando como falha no total, mas a mensagem separa —
-- não é para correr atrás de quem já recebeu.
-- --------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.relatorio_mensagens_falhas_dia(p_dia DATE DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
AS $function$
DECLARE
  v_dia DATE;
  v_ini TIMESTAMPTZ;
  v_fim TIMESTAMPTZ;
BEGIN
  v_dia := COALESCE(p_dia, (now() AT TIME ZONE 'America/Sao_Paulo')::date);
  v_ini := (v_dia::timestamp)       AT TIME ZONE 'America/Sao_Paulo';
  v_fim := ((v_dia + 1)::timestamp) AT TIME ZONE 'America/Sao_Paulo';

  RETURN COALESCE((
    SELECT jsonb_agg(f ORDER BY f->>'conta', f->>'enviado_em')
    FROM (
      SELECT jsonb_build_object(
               'conta',      COALESCE(NULLIF(u.nome_empresa, ''), u.email, l.user_id::text),
               'aluno',      NULLIF(d.nome, ''),
               'telefone',   COALESCE(NULLIF(l.telefone, ''), d.telefone),
               'tipo',       l.tipo,
               'classe',     l.falha_classe,
               'codigo',     COALESCE(l.erro_codigo, '(sem codigo)'),
               'enviado_em', l.enviado_em,
               'recuperada', EXISTS (
                 SELECT 1 FROM logs_mensagens l2
                  WHERE l2.user_id = l.user_id
                    AND l2.telefone = l.telefone
                    AND l2.status = 'enviado'
                    AND l2.enviado_em > l.enviado_em
                    AND l2.enviado_em < v_fim)
             ) AS f
        FROM logs_mensagens l
        LEFT JOIN usuarios  u ON u.id = l.user_id
        LEFT JOIN devedores d ON d.id = l.devedor_id
       WHERE l.enviado_em >= v_ini AND l.enviado_em < v_fim
         AND l.falha_classe IN ('transitoria','permanente','config','indeterminada')
    ) s
  ), '[]'::jsonb);
END
$function$;

GRANT EXECUTE ON FUNCTION public.relatorio_mensagens_falhas_dia(DATE) TO service_role;


-- --------------------------------------------------------------------------
-- PARTE B — Agendamento: 12h BRT = 15h UTC
--
-- Mesma edge function do e-mail, com { "canal": "whatsapp" }. Sem body o
-- job das 14h UTC continua mandando só o e-mail, como antes.
-- --------------------------------------------------------------------------

SELECT cron.unschedule('relatorio-mensagens-whatsapp')
 WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'relatorio-mensagens-whatsapp');

SELECT cron.schedule(
  'relatorio-mensagens-whatsapp',
  '0 15 * * *',
  $$
  SELECT net.http_post(
    url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'project_url') || '/functions/v1/relatorio-mensagens',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key')
    ),
    body := '{"canal": "whatsapp"}'::jsonb
  );
  $$
);
