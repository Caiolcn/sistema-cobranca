-- Aluno bolsista (bolsa integral)
-- O bolsista fica com assinatura_ativa = false e plano_id = null: é isso que o
-- cron gerar_proximas_mensalidades e as views da fila de mensagens olham, então
-- nada é gerado nem cobrado. A flag separa "bolsista" de "cancelado" na lista,
-- nos filtros e na taxa de cancelamento, e faz o aluno contar no limite do plano.

ALTER TABLE public.devedores
  ADD COLUMN IF NOT EXISTS bolsista boolean NOT NULL DEFAULT false;
