-- ============================================================
-- COBRANÇA SAAS × CARTÃO RECORRENTE (Mercado Pago)
--
-- Problema: quem assina no cartão recebia "vence em 3 dias" / "vence hoje"
-- às 9h, mas o MP só debita no dia seguinte ao nosso vencimento (o MP cobra
-- no mesmo dia todo mês; o sistema somava +30 dias), à tarde. E como o MP
-- nunca avisou a gente da cobrança, o plano vencia e as cobranças dos alunos
-- pausavam até alguém lançar à mão em /admin/assinaturas.
--
-- Agora:
--   - edge fn `conciliar-cartao-mp` (cron de hora em hora) consulta o MP,
--     registra a cobrança e põe plano_vencimento = próxima cobrança + 3 dias;
--   - esta view NÃO manda venc_d3 / venc_hoje pra quem tem cartão ativo.
--     No lugar:
--       cartao_d3     → 3 dias antes do débito, aviso tranquilo ("vai debitar")
--       cartao_falhou → 1 dia depois do débito, se a conta não renovou
--     venc_vencido (3 dias depois do vencimento) continua valendo pra todos.
--
-- Data do débito = vencimento − 3 dias (a tolerância da conciliação).
-- ⚠️ Mesma constante de TOLERANCIA_DIAS em conciliar-cartao-mp. Mudou lá, muda aqui.
--
-- Rodar no SQL Editor DEPOIS de publicar `conciliar-cartao-mp` (--no-verify-jwt)
-- e de conferir a simulação (sql-conciliar-cartao-mp-simulacao.sql).
-- `cobranca-saas` já está no ar com os modelos cartao_d3/cartao_falhou (06/11).
-- ============================================================

-- 1) Modelos das 2 mensagens novas.
--    Variáveis extras: {{data_cobranca}} (dia do débito no cartão)
INSERT INTO templates_admin (tipo, titulo, mensagem) VALUES
(
  'cartao_d3',
  'Cobrança SaaS — cartão: 3 dias antes do débito',
  E'Oi {{nome}}! 👋\n\nSó um aviso rápido: a mensalidade do seu plano {{plano}} (*R$ {{valor}}*) vai ser debitada automaticamente no seu cartão em *{{data_cobranca}}*.\n\nNão precisa fazer nada 😉\n\nQualquer dúvida, é só chamar! 🙌'
),
(
  'cartao_falhou',
  'Cobrança SaaS — cartão: débito não aprovado',
  E'Oi {{nome}}! 👋\n\nTentamos debitar a mensalidade do seu plano {{plano}} (*R$ {{valor}}*) no cartão em {{data_cobranca}}, mas o pagamento não foi aprovado.\n\nPra não pausar as cobranças dos seus alunos, atualize o cartão ou pague por aqui:\n👉 https://www.mensalli.com.br/app/assinatura?renovar=1\n\nQualquer dúvida, é só chamar! 🙌'
)
ON CONFLICT (tipo) DO NOTHING;

-- 2) View dos alvos. CREATE OR REPLACE mantém as permissões; as colunas novas
--    (cartao, data_cobranca) entram no fim, como o Postgres exige.
CREATE OR REPLACE VIEW vw_mensalli_cobranca_saas AS
WITH cartao AS (
  SELECT DISTINCT user_id
  FROM assinaturas_mercadopago
  WHERE status = 'authorized'
),
base AS (
  SELECT
    u.id AS usuario_id,
    -- {{nome}} é a PESSOA, não a empresa: quem lê o WhatsApp é o Thiago, não o "Studio T.S".
    COALESCE(NULLIF(TRIM(u.nome_completo), ''), NULLIF(TRIM(u.nome_empresa), ''), u.email) AS nome_cliente,
    u.telefone,
    u.plano,
    CASE lower(u.plano)
      WHEN 'starter' THEN 49.90
      WHEN 'pro'     THEN 99.90
      WHEN 'premium' THEN 149.90
      ELSE 0
    END AS valor,
    (u.plano_vencimento AT TIME ZONE 'America/Sao_Paulo')::date AS data_vencimento,
    ((u.plano_vencimento AT TIME ZONE 'America/Sao_Paulo')::date
       - (NOW() AT TIME ZONE 'America/Sao_Paulo')::date) AS dias_para_vencer,
    (c.user_id IS NOT NULL) AS cartao
  FROM usuarios u
  LEFT JOIN cartao c ON c.user_id = u.id
  WHERE u.plano_pago = TRUE
    AND u.plano_vencimento IS NOT NULL
    AND u.telefone IS NOT NULL
    AND u.telefone <> ''
    AND u.role IS DISTINCT FROM 'admin'
),
marcos AS (
  SELECT
    b.*,
    CASE
      -- Cartão ativo: o MP debita sozinho, então nada de "vence hoje".
      WHEN b.cartao AND b.dias_para_vencer = 6 THEN 'cartao_d3'      -- débito em 3 dias
      WHEN b.cartao AND b.dias_para_vencer = 2 THEN 'cartao_falhou'  -- débito foi ontem e não renovou
      WHEN b.cartao AND b.dias_para_vencer IN (3, 0) THEN NULL
      WHEN b.dias_para_vencer = 3  THEN 'venc_d3'
      WHEN b.dias_para_vencer = 0  THEN 'venc_hoje'
      WHEN b.dias_para_vencer = -3 THEN 'venc_vencido'
    END AS bucket
  FROM base b
)
SELECT
  bucket,
  usuario_id,
  nome_cliente,
  telefone,
  plano,
  valor,
  data_vencimento,
  dias_para_vencer,
  GREATEST(dias_para_vencer, 0)   AS dias,          -- p/ {{dias}} (venc_d3 = 3)
  GREATEST(-dias_para_vencer, 0)  AS dias_atraso,   -- p/ {{dias_atraso}} (vencido = 3)
  cartao,
  CASE WHEN cartao THEN data_vencimento - 3 END AS data_cobranca  -- p/ {{data_cobranca}}
FROM marcos
WHERE bucket IS NOT NULL
  -- Trava das views definer (ver sql-seguranca-view-*): sem ela qualquer
  -- usuário logado leria nome/telefone/vencimento de todos os clientes.
  AND (SELECT pode_ver_painel_admin());

-- 3) Conciliação do cartão de hora em hora (minuto 40). Pega o débito do MP
--    no máximo 1h depois e roda antes do disparo das 9h BRT.
SELECT cron.unschedule('conciliar-cartao-mp')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'conciliar-cartao-mp');

SELECT cron.schedule(
  'conciliar-cartao-mp',
  '40 * * * *',
  $$
  SELECT net.http_post(
    url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'project_url') || '/functions/v1/conciliar-cartao-mp',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
  $$
);

-- Conferência: a cron existe e a view devolve os mesmos campos de antes + cartao/data_cobranca.
SELECT jobname, schedule, active FROM cron.job WHERE jobname = 'conciliar-cartao-mp';
SELECT bucket, nome_cliente, data_vencimento, cartao, data_cobranca FROM vw_mensalli_cobranca_saas;
