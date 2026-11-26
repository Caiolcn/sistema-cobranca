-- Link de agendamento: limite de quantos dias à frente o aluno pode marcar — 26/11/2026
-- ---------------------------------------------------------------------------
-- Pedido do Personal Fight Trainer: aluno marcava aula com muitos dias de
-- antecedência e faltava. Cada cliente escolhe o limite em
-- Configurações > Agendamento online. Padrão 14 (o que já valia para todos).
-- Ex.: 2 → numa quarta, o aluno marca até sexta.

ALTER TABLE public.usuarios
  ADD COLUMN IF NOT EXISTS agendamento_dias_frente integer NOT NULL DEFAULT 14;

ALTER TABLE public.usuarios
  DROP CONSTRAINT IF EXISTS usuarios_agendamento_dias_frente_check;
ALTER TABLE public.usuarios
  ADD CONSTRAINT usuarios_agendamento_dias_frente_check
  CHECK (agendamento_dias_frente BETWEEN 0 AND 60);

-- Conferência: deve listar a coluna com default 14
SELECT column_name, data_type, column_default
  FROM information_schema.columns
 WHERE table_schema = 'public' AND table_name = 'usuarios'
   AND column_name = 'agendamento_dias_frente';
