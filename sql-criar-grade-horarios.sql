-- ==========================================
-- CRIAR TABELA GRADE DE HORÁRIOS (Aulas Semanais)
-- MensalliZap - Lembretes de Aula 1h Antes
-- ==========================================

-- Tabela principal: grade semanal fixa de aulas
CREATE TABLE IF NOT EXISTS grade_horarios (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    devedor_id UUID NOT NULL REFERENCES devedores(id) ON DELETE CASCADE,
    dia_semana SMALLINT NOT NULL CHECK (dia_semana BETWEEN 0 AND 6),
    -- 0=Domingo, 1=Segunda, 2=Terça, 3=Quarta, 4=Quinta, 5=Sexta, 6=Sábado
    horario TIME NOT NULL,
    descricao TEXT DEFAULT '',
    ativo BOOLEAN DEFAULT true,
    lembrete_enviado_em TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_grade_horarios_user_id ON grade_horarios(user_id);
CREATE INDEX IF NOT EXISTS idx_grade_horarios_devedor_id ON grade_horarios(devedor_id);
CREATE INDEX IF NOT EXISTS idx_grade_horarios_dia_semana ON grade_horarios(dia_semana);
CREATE INDEX IF NOT EXISTS idx_grade_horarios_ativo ON grade_horarios(ativo) WHERE ativo = true;

-- RLS
ALTER TABLE grade_horarios ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own schedules" ON grade_horarios;
CREATE POLICY "Users can view own schedules"
    ON grade_horarios FOR SELECT
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own schedules" ON grade_horarios;
CREATE POLICY "Users can insert own schedules"
    ON grade_horarios FOR INSERT
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own schedules" ON grade_horarios;
CREATE POLICY "Users can update own schedules"
    ON grade_horarios FOR UPDATE
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own schedules" ON grade_horarios;
CREATE POLICY "Users can delete own schedules"
    ON grade_horarios FOR DELETE
    USING (auth.uid() = user_id);

-- ==========================================
-- ADICIONAR COLUNA DE CONFIG
-- ==========================================
ALTER TABLE configuracoes_cobranca
ADD COLUMN IF NOT EXISTS enviar_lembrete_aula BOOLEAN DEFAULT false;

COMMENT ON COLUMN configuracoes_cobranca.enviar_lembrete_aula IS
'Habilita envio de lembrete de aula 1 hora antes via WhatsApp';

-- ==========================================
-- VIEW: AULAS COM LEMBRETE EM 1 HORA
-- ==========================================
DROP VIEW IF EXISTS vw_aulas_lembrete_1hora;

CREATE VIEW vw_aulas_lembrete_1hora AS
SELECT
  gh.id as horario_id,
  gh.devedor_id,
  gh.dia_semana,
  gh.horario,
  gh.descricao,
  gh.lembrete_enviado_em,
  d.nome as nome_cliente,
  d.telefone,
  d.user_id,
  u.plano,
  mz.instance_name as evolution_instance_name,
  (SELECT valor FROM config WHERE chave = 'evolution_api_key' LIMIT 1) as evolution_api_key,
  (SELECT valor FROM config WHERE chave = 'evolution_api_url' LIMIT 1) as evolution_api_url,
  u.nome_empresa,
  cp.usage_count,
  cp.limite_mensal,
  COALESCE(t.mensagem, '') as template_mensagem
FROM grade_horarios gh
INNER JOIN devedores d ON gh.devedor_id = d.id
INNER JOIN usuarios u ON d.user_id = u.id
INNER JOIN mensallizap mz ON mz.user_id = d.user_id AND mz.conectado = true
INNER JOIN configuracoes_cobranca cc ON cc.user_id = d.user_id AND cc.enviar_lembrete_aula = true
LEFT JOIN controle_planos cp ON cp.user_id = d.user_id
LEFT JOIN templates t ON t.user_id = d.user_id AND t.tipo = 'class_reminder' AND t.ativo = true
WHERE gh.ativo = true
  AND (d.lixo IS NULL OR d.lixo = false)
  -- Dia da semana de hoje (PostgreSQL EXTRACT DOW: 0=Domingo...6=Sábado)
  AND gh.dia_semana = EXTRACT(DOW FROM (NOW() AT TIME ZONE 'America/Sao_Paulo'))
  -- Aula começa entre 55-75 minutos no futuro (janela de 20 min para o cron de 15 min)
  AND gh.horario BETWEEN ((NOW() AT TIME ZONE 'America/Sao_Paulo')::time + INTERVAL '55 minutes')
                     AND ((NOW() AT TIME ZONE 'America/Sao_Paulo')::time + INTERVAL '75 minutes')
  -- Lembrete ainda não enviado hoje
  AND (gh.lembrete_enviado_em IS NULL
       OR (gh.lembrete_enviado_em AT TIME ZONE 'America/Sao_Paulo')::date < (NOW() AT TIME ZONE 'America/Sao_Paulo')::date)
  -- Limite de uso
  AND (cp.usage_count < cp.limite_mensal OR cp.limite_mensal IS NULL);

-- ==========================================
-- VERIFICAR RESULTADO
-- ==========================================
SELECT
  'grade_horarios' as tabela,
  column_name,
  data_type,
  column_default
FROM information_schema.columns
WHERE table_name = 'grade_horarios'
ORDER BY ordinal_position;
