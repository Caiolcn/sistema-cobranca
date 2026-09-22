-- ============================================================
-- Link único do Portal do Aluno por conta (/portal/c/{slug})
-- ------------------------------------------------------------
-- O aluno digita o WhatsApp e recebe o link individual dele
-- (/portal/{portal_token}) no número CADASTRADO, pela instância
-- da escola. Esta tabela registra cada pedido pra aplicar o
-- limite de tentativas da edge function portal-solicitar-acesso.
--
-- Só a service role lê/escreve: RLS ligada e sem policy.
-- O slug da conta é o mesmo usuarios.agendamento_slug.
-- ============================================================

CREATE TABLE IF NOT EXISTS portal_acesso_solicitacoes (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  telefone_norm TEXT NOT NULL,
  ip TEXT,
  -- enviado | nao_encontrado | limite | offline | falha
  resultado TEXT NOT NULL,
  alunos INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_portal_acesso_tel
  ON portal_acesso_solicitacoes (telefone_norm, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_portal_acesso_ip
  ON portal_acesso_solicitacoes (ip, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_portal_acesso_conta
  ON portal_acesso_solicitacoes (user_id, created_at DESC);

ALTER TABLE portal_acesso_solicitacoes ENABLE ROW LEVEL SECURITY;
