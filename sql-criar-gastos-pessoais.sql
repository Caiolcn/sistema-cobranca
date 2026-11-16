-- ============================================================
-- GASTOS PESSOAIS — controle financeiro pessoal do dono via Telegram
-- ============================================================
-- Você manda "45 mercado" pro bot do Telegram → edge function
-- telegram-gastos grava aqui → página /admin/financas mostra.
--
-- Dado PESSOAL, não da empresa: a RLS libera só o próprio dono
-- (auth.uid() = user_id). De propósito SEM "OR is_admin()".
-- A edge function grava com a chave secreta (ignora RLS).
-- ============================================================

CREATE TABLE IF NOT EXISTS gastos_pessoais (
  id          BIGSERIAL PRIMARY KEY,
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  valor       NUMERIC(12,2) NOT NULL CHECK (valor > 0),
  descricao   TEXT NOT NULL,
  categoria   TEXT NOT NULL DEFAULT 'Outros',
  data        DATE NOT NULL DEFAULT (now() AT TIME ZONE 'America/Sao_Paulo')::date,
  origem      TEXT NOT NULL DEFAULT 'telegram',   -- telegram | painel
  telegram_message_id BIGINT,                      -- evita gravar 2x se o Telegram reenviar
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_gastos_pessoais_user_data
  ON gastos_pessoais (user_id, data DESC);

CREATE UNIQUE INDEX IF NOT EXISTS uq_gastos_pessoais_telegram_msg
  ON gastos_pessoais (user_id, telegram_message_id)
  WHERE telegram_message_id IS NOT NULL;

ALTER TABLE gastos_pessoais ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS gastos_pessoais_dono ON gastos_pessoais;
CREATE POLICY gastos_pessoais_dono ON gastos_pessoais
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

SELECT 'gastos_pessoais criada' AS ok;
