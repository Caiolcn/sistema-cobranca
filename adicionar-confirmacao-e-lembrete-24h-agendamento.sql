-- ==========================================================================
-- Confirmação de agendamento + lembrete 24h antes da aula
--
-- Pedido do cliente: aluno que marca aula experimental pelo link não recebe
-- nada (só o dono recebia a notificação), e o lembrete de 1h antes é pouco —
-- muita gente esquece.
--
-- Duas coisas nascem aqui:
--
--   1. `enviar_confirmacao_agendamento` — toggle da mensagem que sai NA HORA
--      em que o aluno marca. O envio em si mora na edge function
--      agendamento-agendar, que já falava com a Evolution pra avisar o dono.
--
--   2. `enviar_lembrete_aula_24h` + `vw_aulas_lembrete_24h` — o lembrete da
--      véspera, servido pela edge function lembrete-aula-24h (pg_cron 15/15min).
--
-- Por que uma coluna nova de dedupe (`lembrete_24h_enviado_em`) em vez de
-- reusar `lembrete_enviado_em`: a coluna existente guarda UM carimbo. Se o
-- lembrete de 24h escrevesse nela, o de 1h nunca mais sairia (e vice-versa).
--
-- Por que só `agendamentos` e não `aulas_fixos`: aluno de turma fixa tem aula
-- toda semana no mesmo horário. "Sua aula é amanhã" todo santo dia é spam e
-- convite a bloqueio. O caso do pedido (experimental/avulso) é exatamente o
-- ramo de agendamentos.
--
-- A janela é FOLGADA de propósito (23h a 24h15 antes) porque a view exige
-- WhatsApp conectado: instância caída na hora exata fazia a linha sumir sem
-- envio, sem log e sem alerta (incidente Rede Fit, 04/08). Com 1h15 de janela
-- e cron de 15 em 15, uma queda curta não custa mais o lembrete.
-- ==========================================================================

-- 1. Carimbo próprio do lembrete de 24h ------------------------------------
ALTER TABLE public.agendamentos
  ADD COLUMN IF NOT EXISTS lembrete_24h_enviado_em timestamptz;

COMMENT ON COLUMN public.agendamentos.lembrete_24h_enviado_em IS
  'Quando saiu o lembrete da véspera. Separado de lembrete_enviado_em (1h antes) para os dois conviverem.';

-- 2. Toggles por conta ------------------------------------------------------
ALTER TABLE public.configuracoes_cobranca
  ADD COLUMN IF NOT EXISTS enviar_confirmacao_agendamento boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS enviar_lembrete_aula_24h boolean DEFAULT false;

COMMENT ON COLUMN public.configuracoes_cobranca.enviar_confirmacao_agendamento IS
  'Manda confirmação no WhatsApp do aluno assim que ele marca pelo link de agendamento.';
COMMENT ON COLUMN public.configuracoes_cobranca.enviar_lembrete_aula_24h IS
  'Lembrete da véspera (24h antes). Vale só para agendamentos avulsos, não para turma fixa.';

-- 3. Índice do varrimento de 15 em 15 minutos -------------------------------
CREATE INDEX IF NOT EXISTS idx_agendamentos_lembrete_24h_pendente
  ON public.agendamentos (data)
  WHERE status = 'confirmado' AND lembrete_24h_enviado_em IS NULL;

-- 4. View servida à edge function lembrete-aula-24h -------------------------
-- Espelha o ramo `agendamentos` de vw_aulas_lembrete_1hora. Diferenças:
--   - toggle próprio (enviar_lembrete_aula_24h)
--   - template próprio (class_reminder_24h)
--   - dedupe por lembrete_24h_enviado_em
--   - `conectado` vem como COLUNA, não como filtro: a função pula a linha sem
--     carimbar, e ela volta na rodada seguinte quando o WhatsApp voltar
--   - nome_cliente com fallback responsável > aluno, e nome_aluno sempre o aluno
CREATE OR REPLACE VIEW public.vw_aulas_lembrete_24h AS
SELECT
  ag.id                                        AS agendamento_id,
  ag.devedor_id,
  ag.user_id,
  ag.data                                      AS data_aula,
  a.horario,
  a.descricao,
  COALESCE(NULLIF(d.responsavel_nome, ''), d.nome) AS nome_cliente,
  d.nome                                       AS nome_aluno,
  d.telefone,
  d.experimental,
  u.nome_empresa,
  mz.instance_name                             AS evolution_instance_name,
  mz.conectado
FROM agendamentos ag
  JOIN aulas a               ON a.id = ag.aula_id
  JOIN devedores d           ON d.id = ag.devedor_id
  JOIN usuarios u            ON u.id = ag.user_id
  JOIN mensallizap mz        ON mz.user_id = ag.user_id
  JOIN configuracoes_cobranca cc ON cc.user_id = ag.user_id AND cc.enviar_lembrete_aula_24h = true
  LEFT JOIN controle_planos cp   ON cp.user_id = ag.user_id
WHERE ag.status = 'confirmado'
  AND a.ativo = true
  AND (d.lixo IS NULL OR d.lixo = false)
  AND (d.bloquear_mensagens IS NULL OR d.bloquear_mensagens = false)
  AND (d.comunicacoes_ativas IS NULL OR d.comunicacoes_ativas = true)
  AND d.telefone IS NOT NULL
  AND ((ag.data + a.horario) AT TIME ZONE 'America/Sao_Paulo') >= (now() + interval '23 hours')
  AND ((ag.data + a.horario) AT TIME ZONE 'America/Sao_Paulo') <= (now() + interval '24 hours 15 minutes')
  AND ag.lembrete_24h_enviado_em IS NULL
  AND (cp.usage_count < cp.limite_mensal OR cp.limite_mensal IS NULL)
  AND usuario_pode_enviar(ag.user_id)
  AND usuario_tem_plano(ag.user_id, 'pro');

COMMENT ON VIEW public.vw_aulas_lembrete_24h IS
  'Aulas avulsas que acontecem daqui a ~24h e ainda não receberam o lembrete da véspera. Consumida por supabase/functions/lembrete-aula-24h.';

-- 5. A view nasce com GRANT pra anon/authenticated por default privilege ------
-- Ela expõe telefone de aluno e não tem RLS (view roda como owner). Só o
-- service_role da edge function precisa ler.
-- NOTA: vw_aulas_lembrete_1hora ainda concede SELECT a `authenticated` — ou
-- seja, qualquer usuário logado lê telefone de aluno de TODAS as contas.
-- Não foi mexido aqui pra não alterar o que o n8n já consome; vale revisar.
REVOKE ALL ON public.vw_aulas_lembrete_24h FROM anon, authenticated;
GRANT SELECT ON public.vw_aulas_lembrete_24h TO service_role;

-- 6. Cron do lembrete da véspera -------------------------------------------
-- Minutos 0/15/30 e NÃO */15: o minuto 45 cairia dentro da janela do
-- `fila-worker` (11:36-11:54 UTC), e disparo colado na mesma instância foi o
-- que matou seis contas no mesmo minuto em 20/08. A janela da view tem 1h15,
-- então pular um tique não custa lembrete nenhum.
-- pg_cron do projeto roda em UTC.
SELECT cron.schedule(
  'lembrete-aula-24h',
  '0,15,30 * * * *',
  $$
  SELECT net.http_post(
    url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'project_url') || '/functions/v1/lembrete-aula-24h',
    headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key')),
    body := '{}'::jsonb
  );
  $$
);
