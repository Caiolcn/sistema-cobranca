-- ==========================================
-- TABELA DE LOGS DE MENSAGENS ENVIADAS
-- ==========================================

CREATE TABLE IF NOT EXISTS logs_mensagens (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,

  -- Relacionamentos
  parcela_id UUID REFERENCES parcelas(id) ON DELETE SET NULL,
  devedor_id UUID REFERENCES devedores(id) ON DELETE SET NULL,
  user_id UUID,

  -- Dados do envio
  telefone TEXT NOT NULL,
  mensagem TEXT NOT NULL,

  -- Dados da parcela no momento do envio
  valor_parcela DECIMAL(10,2),
  data_vencimento DATE,
  dias_atraso INTEGER,
  numero_parcela INTEGER,

  -- Status do envio
  status TEXT DEFAULT 'enviado', -- enviado, falha, pendente
  erro TEXT, -- Mensagem de erro caso tenha falhado

  -- Resposta da API de WhatsApp
  response_api JSONB, -- Armazena a resposta completa da Evolution API

  -- Metadados
  enviado_em TIMESTAMPTZ DEFAULT NOW(),
  ip_origem TEXT,
  user_agent TEXT,

  -- Índices para busca rápida
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ==========================================
-- ÍNDICES PARA PERFORMANCE
-- ==========================================
CREATE INDEX IF NOT EXISTS idx_logs_parcela_id ON logs_mensagens(parcela_id);
CREATE INDEX IF NOT EXISTS idx_logs_devedor_id ON logs_mensagens(devedor_id);
CREATE INDEX IF NOT EXISTS idx_logs_telefone ON logs_mensagens(telefone);
CREATE INDEX IF NOT EXISTS idx_logs_enviado_em ON logs_mensagens(enviado_em);
CREATE INDEX IF NOT EXISTS idx_logs_status ON logs_mensagens(status);

-- ==========================================
-- RLS (Row Level Security)
-- ==========================================
ALTER TABLE logs_mensagens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Acesso total logs" ON logs_mensagens;
CREATE POLICY "Acesso total logs"
  ON logs_mensagens
  FOR ALL
  USING (true);

-- ==========================================
-- FUNÇÃO PARA AUTO-LIMPEZA (opcional)
-- ==========================================
-- Apaga logs com mais de 1 ano (execute mensalmente)
CREATE OR REPLACE FUNCTION limpar_logs_antigos()
RETURNS void AS $$
BEGIN
  DELETE FROM logs_mensagens
  WHERE enviado_em < NOW() - INTERVAL '1 year';

  RAISE NOTICE 'Logs antigos removidos com sucesso!';
END;
$$ LANGUAGE plpgsql;

-- ==========================================
-- VIEW PARA RELATÓRIOS
-- ==========================================
CREATE OR REPLACE VIEW vw_logs_mensagens_completo AS
SELECT
  l.id,
  l.enviado_em,
  l.telefone,
  l.status,
  l.valor_parcela,
  l.data_vencimento,
  l.dias_atraso,
  l.numero_parcela,
  d.nome as devedor_nome,
  d.id as devedor_id,
  p.id as parcela_id,
  p.status as parcela_status_atual,
  SUBSTRING(l.mensagem, 1, 100) as preview_mensagem,
  l.erro
FROM logs_mensagens l
LEFT JOIN devedores d ON l.devedor_id = d.id
LEFT JOIN parcelas p ON l.parcela_id = p.id
ORDER BY l.enviado_em DESC;

-- ==========================================
-- QUERIES ÚTEIS
-- ==========================================

-- Ver últimas 50 mensagens enviadas
-- SELECT * FROM vw_logs_mensagens_completo LIMIT 50;

-- Ver mensagens de um devedor específico
-- SELECT * FROM logs_mensagens WHERE devedor_id = 'UUID_DO_DEVEDOR' ORDER BY enviado_em DESC;

-- Ver mensagens que falharam
-- SELECT * FROM logs_mensagens WHERE status = 'falha';

-- Contar mensagens enviadas hoje
-- SELECT COUNT(*) FROM logs_mensagens WHERE enviado_em::date = CURRENT_DATE;

-- Contar mensagens por dia (últimos 30 dias)
-- SELECT
--   enviado_em::date as data,
--   COUNT(*) as total_mensagens,
--   COUNT(CASE WHEN status = 'enviado' THEN 1 END) as enviadas,
--   COUNT(CASE WHEN status = 'falha' THEN 1 END) as falhas
-- FROM logs_mensagens
-- WHERE enviado_em >= NOW() - INTERVAL '30 days'
-- GROUP BY enviado_em::date
-- ORDER BY data DESC;

COMMIT;
