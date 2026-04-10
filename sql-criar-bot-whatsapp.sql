-- ============================================================
-- BOT WHATSAPP - Atendimento automático com menu numérico
-- ============================================================

-- 1. Colunas em configuracoes_cobranca
ALTER TABLE configuracoes_cobranca
  ADD COLUMN IF NOT EXISTS bot_ativo BOOLEAN DEFAULT false;

ALTER TABLE configuracoes_cobranca
  ADD COLUMN IF NOT EXISTS bot_saudacao TEXT
  DEFAULT 'Olá {{nomeCliente}}! 👋 Sou o assistente virtual da {{nomeEmpresa}}. Como posso ajudar?';

-- 2. Tabela de estado das conversas do bot
CREATE TABLE IF NOT EXISTS bot_conversas (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  devedor_id UUID REFERENCES devedores(id) ON DELETE SET NULL,
  telefone TEXT NOT NULL,
  estado TEXT NOT NULL DEFAULT 'menu',
  -- estados possíveis:
  --   menu             → próxima msg dispara o menu
  --   aguardando_opcao → esperando aluno digitar 1-5
  --   atendente        → bot silenciado, humano assumiu
  contexto JSONB DEFAULT '{}'::jsonb,
  ultima_interacao TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_bot_conversas_user_telefone
  ON bot_conversas (user_id, telefone);

CREATE INDEX IF NOT EXISTS idx_bot_conversas_devedor
  ON bot_conversas (devedor_id);

-- 3. RLS
ALTER TABLE bot_conversas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Usuarios veem suas proprias conversas" ON bot_conversas;
CREATE POLICY "Usuarios veem suas proprias conversas"
  ON bot_conversas FOR SELECT
  USING (auth.uid() = user_id OR is_admin());

DROP POLICY IF EXISTS "Service role insere conversas" ON bot_conversas;
CREATE POLICY "Service role insere conversas"
  ON bot_conversas FOR INSERT
  WITH CHECK (true);

DROP POLICY IF EXISTS "Service role atualiza conversas" ON bot_conversas;
CREATE POLICY "Service role atualiza conversas"
  ON bot_conversas FOR UPDATE
  USING (true);

DROP POLICY IF EXISTS "Usuarios deletam suas conversas" ON bot_conversas;
CREATE POLICY "Usuarios deletam suas conversas"
  ON bot_conversas FOR DELETE
  USING (auth.uid() = user_id OR is_admin());

-- 4. Limpar conversas antigas (>7 dias) - função de manutenção
CREATE OR REPLACE FUNCTION limpar_bot_conversas_antigas()
RETURNS void AS $$
BEGIN
  DELETE FROM bot_conversas
  WHERE ultima_interacao < NOW() - INTERVAL '7 days';
END;
$$ LANGUAGE plpgsql;
