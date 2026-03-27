-- ==========================================
-- CRIAR SISTEMA DE AGENDAMENTO ONLINE
-- MensalliZap - Aluno agenda/cancela aulas pelo link
-- ==========================================

-- ==========================================
-- 1. NOVAS COLUNAS EM USUARIOS (config do admin)
-- ==========================================
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'usuarios' AND column_name = 'agendamento_slug'
    ) THEN
        ALTER TABLE usuarios ADD COLUMN agendamento_slug TEXT;
        RAISE NOTICE 'Coluna agendamento_slug adicionada';
    ELSE
        RAISE NOTICE 'Coluna agendamento_slug ja existe';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'usuarios' AND column_name = 'agendamento_ativo'
    ) THEN
        ALTER TABLE usuarios ADD COLUMN agendamento_ativo BOOLEAN DEFAULT false;
        RAISE NOTICE 'Coluna agendamento_ativo adicionada';
    ELSE
        RAISE NOTICE 'Coluna agendamento_ativo ja existe';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'usuarios' AND column_name = 'agendamento_antecedencia_horas'
    ) THEN
        ALTER TABLE usuarios ADD COLUMN agendamento_antecedencia_horas INTEGER DEFAULT 2;
        RAISE NOTICE 'Coluna agendamento_antecedencia_horas adicionada';
    ELSE
        RAISE NOTICE 'Coluna agendamento_antecedencia_horas ja existe';
    END IF;
END $$;

-- Index unico para slug (pode ser NULL, mas se preenchido deve ser unico)
CREATE UNIQUE INDEX IF NOT EXISTS idx_usuarios_agendamento_slug
    ON usuarios(agendamento_slug) WHERE agendamento_slug IS NOT NULL;

-- ==========================================
-- 2. NOVA COLUNA EM DEVEDORES (origem do cadastro)
-- ==========================================
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'devedores' AND column_name = 'origem'
    ) THEN
        ALTER TABLE devedores ADD COLUMN origem TEXT DEFAULT 'manual';
        RAISE NOTICE 'Coluna origem adicionada em devedores';
    ELSE
        RAISE NOTICE 'Coluna origem ja existe em devedores';
    END IF;
END $$;

COMMENT ON COLUMN devedores.origem IS 'Origem do cadastro: manual (admin cadastrou) | agendamento (aluno se cadastrou pelo link)';

-- ==========================================
-- 3. TABELA: AULAS (horarios da empresa, sem vinculo com aluno)
-- ==========================================
CREATE TABLE IF NOT EXISTS aulas (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    dia_semana SMALLINT NOT NULL CHECK (dia_semana BETWEEN 0 AND 6),
    -- 0=Domingo, 1=Segunda, 2=Terca, 3=Quarta, 4=Quinta, 5=Sexta, 6=Sabado
    horario TIME NOT NULL,
    descricao TEXT DEFAULT '',
    capacidade INTEGER DEFAULT 10,
    ativo BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_aulas_user ON aulas(user_id);
CREATE INDEX IF NOT EXISTS idx_aulas_dia ON aulas(user_id, dia_semana, ativo);

-- RLS
ALTER TABLE aulas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own aulas" ON aulas;
CREATE POLICY "Users can view own aulas"
    ON aulas FOR SELECT
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own aulas" ON aulas;
CREATE POLICY "Users can insert own aulas"
    ON aulas FOR INSERT
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own aulas" ON aulas;
CREATE POLICY "Users can update own aulas"
    ON aulas FOR UPDATE
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own aulas" ON aulas;
CREATE POLICY "Users can delete own aulas"
    ON aulas FOR DELETE
    USING (auth.uid() = user_id);

-- ==========================================
-- 4. TABELA: AGENDAMENTOS (aluno -> aula em data especifica)
-- ==========================================
CREATE TABLE IF NOT EXISTS agendamentos (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    aula_id UUID NOT NULL REFERENCES aulas(id) ON DELETE CASCADE,
    devedor_id UUID NOT NULL REFERENCES devedores(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    data DATE NOT NULL,
    status TEXT NOT NULL DEFAULT 'confirmado' CHECK (status IN ('confirmado', 'cancelado', 'realizado')),
    cancelado_em TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(aula_id, devedor_id, data)
);

CREATE INDEX IF NOT EXISTS idx_agendamentos_aula_data ON agendamentos(aula_id, data, status);
CREATE INDEX IF NOT EXISTS idx_agendamentos_devedor ON agendamentos(devedor_id, data);
CREATE INDEX IF NOT EXISTS idx_agendamentos_user ON agendamentos(user_id);

-- RLS
ALTER TABLE agendamentos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own agendamentos" ON agendamentos;
CREATE POLICY "Users can view own agendamentos"
    ON agendamentos FOR SELECT
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own agendamentos" ON agendamentos;
CREATE POLICY "Users can insert own agendamentos"
    ON agendamentos FOR INSERT
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own agendamentos" ON agendamentos;
CREATE POLICY "Users can update own agendamentos"
    ON agendamentos FOR UPDATE
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own agendamentos" ON agendamentos;
CREATE POLICY "Users can delete own agendamentos"
    ON agendamentos FOR DELETE
    USING (auth.uid() = user_id);

-- ==========================================
-- 5. VIEW: VAGAS DISPONIVEIS POR AULA/DATA
-- ==========================================
DROP VIEW IF EXISTS vw_aulas_vagas;

CREATE VIEW vw_aulas_vagas AS
SELECT
    a.id AS aula_id,
    a.user_id,
    a.dia_semana,
    a.horario,
    a.descricao,
    a.capacidade,
    a.ativo,
    d.data,
    a.capacidade - COUNT(ag.id) AS vagas_restantes,
    COUNT(ag.id) AS total_agendados
FROM aulas a
CROSS JOIN (
    -- Gerar proximas 14 datas para cada dia da semana
    SELECT generate_series(
        CURRENT_DATE,
        CURRENT_DATE + INTERVAL '13 days',
        INTERVAL '1 day'
    )::date AS data
) d
LEFT JOIN agendamentos ag
    ON ag.aula_id = a.id
    AND ag.data = d.data
    AND ag.status = 'confirmado'
WHERE a.ativo = true
    AND EXTRACT(DOW FROM d.data) = a.dia_semana
    AND d.data >= CURRENT_DATE
GROUP BY a.id, a.user_id, a.dia_semana, a.horario, a.descricao, a.capacidade, a.ativo, d.data;

-- ==========================================
-- 6. FUNCAO: GERAR SLUG A PARTIR DO NOME DA EMPRESA
-- ==========================================
CREATE OR REPLACE FUNCTION gerar_agendamento_slug(nome_empresa TEXT)
RETURNS TEXT AS $$
DECLARE
    slug TEXT;
    slug_base TEXT;
    contador INTEGER := 0;
BEGIN
    -- Converter para minusculo, remover acentos basicos, trocar espacos por hifen
    slug_base := lower(trim(nome_empresa));
    slug_base := replace(slug_base, ' ', '-');
    slug_base := replace(slug_base, 'á', 'a');
    slug_base := replace(slug_base, 'é', 'e');
    slug_base := replace(slug_base, 'í', 'i');
    slug_base := replace(slug_base, 'ó', 'o');
    slug_base := replace(slug_base, 'ú', 'u');
    slug_base := replace(slug_base, 'ã', 'a');
    slug_base := replace(slug_base, 'õ', 'o');
    slug_base := replace(slug_base, 'ç', 'c');
    slug_base := replace(slug_base, 'ê', 'e');
    slug_base := replace(slug_base, 'â', 'a');
    slug_base := replace(slug_base, 'ô', 'o');
    -- Remover caracteres especiais (manter apenas letras, numeros e hifen)
    slug_base := regexp_replace(slug_base, '[^a-z0-9-]', '', 'g');
    -- Remover hifens duplicados
    slug_base := regexp_replace(slug_base, '-+', '-', 'g');
    -- Remover hifen no inicio/fim
    slug_base := trim(both '-' from slug_base);

    slug := slug_base;

    -- Verificar unicidade
    WHILE EXISTS (SELECT 1 FROM usuarios WHERE agendamento_slug = slug) LOOP
        contador := contador + 1;
        slug := slug_base || '-' || contador;
    END LOOP;

    RETURN slug;
END;
$$ LANGUAGE plpgsql;

-- ==========================================
-- VERIFICAR RESULTADO
-- ==========================================
SELECT 'aulas' as tabela, column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'aulas'
ORDER BY ordinal_position;

SELECT 'agendamentos' as tabela, column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'agendamentos'
ORDER BY ordinal_position;

SELECT 'usuarios - novas colunas' as info, column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'usuarios'
AND column_name IN ('agendamento_slug', 'agendamento_ativo', 'agendamento_antecedencia_horas');
