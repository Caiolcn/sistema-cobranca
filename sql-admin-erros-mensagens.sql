-- ==========================================
-- ADMIN — ERROS DE ENVIO DE MENSAGENS
-- Garante colunas detalhadas em logs_mensagens
-- e cria índices para a tela de diagnóstico.
-- Idempotente: pode rodar várias vezes.
-- ==========================================

-- 1. Colunas adicionais para diagnóstico
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'logs_mensagens' AND column_name = 'response_api'
  ) THEN
    ALTER TABLE logs_mensagens ADD COLUMN response_api JSONB;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'logs_mensagens' AND column_name = 'http_status'
  ) THEN
    ALTER TABLE logs_mensagens ADD COLUMN http_status INTEGER;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'logs_mensagens' AND column_name = 'erro_codigo'
  ) THEN
    ALTER TABLE logs_mensagens ADD COLUMN erro_codigo TEXT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'logs_mensagens' AND column_name = 'tipo'
  ) THEN
    ALTER TABLE logs_mensagens ADD COLUMN tipo TEXT;
  END IF;
END $$;

-- 2. Índices para a tela /admin/erros-mensagens
CREATE INDEX IF NOT EXISTS idx_logs_status_data ON logs_mensagens(status, enviado_em DESC);
CREATE INDEX IF NOT EXISTS idx_logs_user_status_data ON logs_mensagens(user_id, status, enviado_em DESC);
CREATE INDEX IF NOT EXISTS idx_logs_erro_codigo ON logs_mensagens(erro_codigo) WHERE erro_codigo IS NOT NULL;

-- 3. Verificação
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'logs_mensagens'
ORDER BY ordinal_position;
