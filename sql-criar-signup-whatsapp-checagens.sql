-- Tentativas da edge function signup-verificar-whatsapp (o WhatsApp digitado no
-- cadastro existe?). Serve só pro limite por IP e pro teto geral por hora.
-- Só a service_role mexe: RLS ligado e nenhuma policy.

CREATE TABLE IF NOT EXISTS signup_whatsapp_checagens (
  id BIGSERIAL PRIMARY KEY,
  telefone_norm TEXT NOT NULL,
  ip TEXT,
  -- existe | nao_existe | indisponivel | limite_ip | limite_global
  resultado TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_signup_wa_checagens_ip
  ON signup_whatsapp_checagens (ip, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_signup_wa_checagens_data
  ON signup_whatsapp_checagens (created_at DESC);

ALTER TABLE signup_whatsapp_checagens ENABLE ROW LEVEL SECURITY;
