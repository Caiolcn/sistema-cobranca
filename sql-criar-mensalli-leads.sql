-- ============================================================
-- CRM DE LEADS DE CAMPANHA - Mensalli
-- ============================================================
-- Quem manda mensagem pro WhatsApp comercial do Mensalli
-- (instancia master) vira um lead aqui. O board fica em
-- /app/admin/leads.
--
-- Funil: novo -> conversando -> aguardando -> criou_conta -> pagante -> perdido
-- As colunas 'criou_conta' e 'pagante' sao promovidas automaticamente
-- por sync_mensalli_leads() cruzando telefone com a tabela usuarios.
-- ============================================================

-- ==========================================
-- 1. CHAVE DE TELEFONE (DDD + ultimos 8 digitos)
-- ==========================================
-- O JID do WhatsApp vem como 556282466639@s.whatsapp.net (com DDI, e as
-- vezes SEM o nono digito, em contas BR antigas), enquanto usuarios.telefone
-- fica como '62984381422' ou '(62) 98438-1422'. Comparar DDD + ultimos 8
-- digitos casa os dois formatos sem depender do nono digito.
CREATE OR REPLACE FUNCTION tel_chave(tel TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  d TEXT;
BEGIN
  d := regexp_replace(COALESCE(tel, ''), '\D', '', 'g');
  -- tira o DDI 55 (5562984381422 = 13, 556284381422 = 12)
  IF LEFT(d, 2) = '55' AND LENGTH(d) IN (12, 13) THEN
    d := SUBSTRING(d FROM 3);
  END IF;
  IF LENGTH(d) < 10 THEN
    RETURN NULL;  -- telefone incompleto: nao casa com ninguem
  END IF;
  RETURN LEFT(d, 2) || RIGHT(d, 8);
END;
$$;

-- ==========================================
-- 2. TABELA DE LEADS
-- ==========================================
CREATE TABLE IF NOT EXISTS mensalli_leads (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,

  -- Identidade no WhatsApp
  remote_jid TEXT NOT NULL UNIQUE,   -- chave de dedup (aguenta @lid, onde nao ha telefone)
  telefone TEXT,                     -- so digitos; NULL quando o JID e @lid
  nome TEXT,                         -- pushName do WhatsApp

  -- Funil
  status TEXT NOT NULL DEFAULT 'novo'
    CHECK (status IN ('novo', 'conversando', 'aguardando', 'criou_conta', 'pagante', 'perdido')),
  origem TEXT NOT NULL DEFAULT 'whatsapp'
    CHECK (origem IN ('whatsapp', 'backfill', 'manual')),

  -- Vinculo com a conta no Mensalli (preenchido por sync_mensalli_leads)
  usuario_id UUID REFERENCES usuarios(id) ON DELETE SET NULL,
  conta_detectada_em TIMESTAMPTZ,      -- promove pra criou_conta uma unica vez
  pagamento_detectado_em TIMESTAMPTZ,  -- promove pra pagante uma unica vez

  -- Resumo da conversa (pro card do board)
  ultima_mensagem TEXT,
  ultima_direcao TEXT CHECK (ultima_direcao IN ('in', 'out')),  -- 'in' = ele falou por ultimo (nao respondido)
  ultima_interacao TIMESTAMPTZ DEFAULT NOW(),

  -- Anotacoes do admin
  observacoes TEXT,
  retornar_em DATE,                    -- "me chama dia 20" (coluna Aguardando)

  -- O numero do Mensalli tambem e usado pessoalmente (amigo, familia, fornecedor
  -- caem no mesmo webhook). `ignorado` tira do board E faz o whatsapp-bot parar
  -- de gravar as conversas desse contato.
  ignorado BOOLEAN NOT NULL DEFAULT FALSE,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mensalli_leads_status ON mensalli_leads(status);
CREATE INDEX IF NOT EXISTS idx_mensalli_leads_interacao ON mensalli_leads(ultima_interacao DESC);
CREATE INDEX IF NOT EXISTS idx_mensalli_leads_telchave ON mensalli_leads(tel_chave(telefone));
CREATE INDEX IF NOT EXISTS idx_mensalli_leads_ignorado ON mensalli_leads(ignorado) WHERE ignorado = FALSE;

-- ==========================================
-- 3. TABELA DE MENSAGENS
-- ==========================================
CREATE TABLE IF NOT EXISTS mensalli_lead_mensagens (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id UUID NOT NULL REFERENCES mensalli_leads(id) ON DELETE CASCADE,
  wa_message_id TEXT UNIQUE,          -- key.id da Evolution: torna a ingestao idempotente
  direcao TEXT NOT NULL CHECK (direcao IN ('in', 'out')),
  texto TEXT,
  tipo TEXT NOT NULL DEFAULT 'texto'
    CHECK (tipo IN ('texto', 'audio', 'imagem', 'video', 'documento', 'sticker', 'outro')),
  enviado_em TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mensalli_lead_msg_lead ON mensalli_lead_mensagens(lead_id, enviado_em);

-- ==========================================
-- 4. RLS - so admin
-- ==========================================
ALTER TABLE mensalli_leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE mensalli_lead_mensagens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin gerencia mensalli_leads" ON mensalli_leads;
CREATE POLICY "Admin gerencia mensalli_leads"
  ON mensalli_leads FOR ALL
  USING (is_admin())
  WITH CHECK (is_admin());

DROP POLICY IF EXISTS "Admin gerencia mensalli_lead_mensagens" ON mensalli_lead_mensagens;
CREATE POLICY "Admin gerencia mensalli_lead_mensagens"
  ON mensalli_lead_mensagens FOR ALL
  USING (is_admin())
  WITH CHECK (is_admin());
-- Obs: a edge function whatsapp-bot escreve com a service_role, que ignora RLS.

-- ==========================================
-- 5. SYNC - vincula lead <-> usuario e promove o funil
-- ==========================================
-- Chamada via RPC quando o painel carrega. Barata (dezenas de linhas).
-- Regras:
--   - promove UMA UNICA VEZ, na primeira deteccao (conta_detectada_em /
--     pagamento_detectado_em). Depois disso o arrasto manual manda.
--   - nunca mexe em quem esta em 'perdido'.
-- E SECURITY DEFINER porque precisa enxergar `usuarios` inteira, entao checa
-- is_admin() por dentro (senao qualquer usuario logado poderia dispara-la).
CREATE OR REPLACE FUNCTION sync_mensalli_leads()
RETURNS TABLE (vinculados INT, viraram_conta INT, viraram_pagante INT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_vinc INT := 0;
  v_conta INT := 0;
  v_pag INT := 0;
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'apenas admin';
  END IF;

  -- 5.1 Vincula lead -> usuario pelo telefone (DDD + ultimos 8 digitos)
  WITH match AS (
    SELECT l.id AS lead_id,
           (SELECT u.id
              FROM usuarios u
             WHERE tel_chave(u.telefone) = tel_chave(l.telefone)
             ORDER BY u.data_cadastro NULLS LAST
             LIMIT 1) AS usuario_id
      FROM mensalli_leads l
     WHERE l.usuario_id IS NULL
       AND tel_chave(l.telefone) IS NOT NULL
  )
  UPDATE mensalli_leads l
     SET usuario_id = m.usuario_id,
         updated_at = NOW()
    FROM match m
   WHERE l.id = m.lead_id
     AND m.usuario_id IS NOT NULL;
  GET DIAGNOSTICS v_vinc = ROW_COUNT;

  -- 5.2 Criou conta (primeira deteccao)
  UPDATE mensalli_leads l
     SET status = CASE WHEN l.status IN ('novo', 'conversando', 'aguardando')
                       THEN 'criou_conta' ELSE l.status END,
         conta_detectada_em = NOW(),
         updated_at = NOW()
   WHERE l.usuario_id IS NOT NULL
     AND l.conta_detectada_em IS NULL
     AND l.status <> 'perdido';
  GET DIAGNOSTICS v_conta = ROW_COUNT;

  -- 5.3 Virou pagante (primeira deteccao)
  UPDATE mensalli_leads l
     SET status = CASE WHEN l.status IN ('novo', 'conversando', 'aguardando', 'criou_conta')
                       THEN 'pagante' ELSE l.status END,
         pagamento_detectado_em = NOW(),
         updated_at = NOW()
    FROM usuarios u
   WHERE u.id = l.usuario_id
     AND u.plano_pago = TRUE
     AND l.pagamento_detectado_em IS NULL
     AND l.status <> 'perdido';
  GET DIAGNOSTICS v_pag = ROW_COUNT;

  RETURN QUERY SELECT v_vinc, v_conta, v_pag;
END;
$$;

REVOKE ALL ON FUNCTION sync_mensalli_leads() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sync_mensalli_leads() TO authenticated;

-- ==========================================
-- 6. VIEW DO BOARD (lead + dados da conta)
-- ==========================================
CREATE OR REPLACE VIEW vw_mensalli_leads AS
SELECT
  l.*,
  u.nome_completo   AS usuario_nome,
  u.email           AS usuario_email,
  u.plano_pago,
  u.trial_ativo,
  u.trial_fim,
  u.data_cadastro   AS usuario_cadastro,
  (SELECT COUNT(*) FROM mensalli_lead_mensagens m WHERE m.lead_id = l.id) AS total_mensagens
FROM mensalli_leads l
LEFT JOIN usuarios u ON u.id = l.usuario_id
WHERE l.ignorado = FALSE;

-- View herda a RLS da tabela base (security_invoker) => so admin enxerga.
ALTER VIEW vw_mensalli_leads SET (security_invoker = true);
