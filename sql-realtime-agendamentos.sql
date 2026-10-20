-- =====================================================================
-- Realtime: publicar a tabela `agendamentos`
-- =====================================================================
-- Problema: três partes do app escutam `agendamentos` via Realtime
-- (postgres_changes), mas a tabela nunca foi adicionada à publicação
-- supabase_realtime — nenhum evento chegava:
--   - useAgendamentoNotifications (Dashboard): aviso "Fulano agendou uma aula"
--     e "Fulano cancelou um agendamento";
--   - AgendaCalendario / AgendaNovaContainer: Agenda se atualiza sozinha
--     quando um agendamento entra ou é cancelado.
--
-- Por que é seguro (conferido em 19/10/2026):
--   - RLS ligado e só policy de dono: (auth.uid() = user_id) OR is_admin().
--     O Realtime aplica o RLS por assinante, então ninguém recebe evento de
--     outra conta. O app ainda filtra user_id=eq.<conta>.
--   - Volume baixo: 206 agendamentos nos últimos 30 dias (~7/dia no total).
-- =====================================================================

-- ROLLBACK (só se precisar voltar):
-- ALTER PUBLICATION supabase_realtime DROP TABLE public.agendamentos;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'agendamentos'
  ) THEN
    RAISE NOTICE 'agendamentos já está na publicação — nada a fazer';
  ELSE
    ALTER PUBLICATION supabase_realtime ADD TABLE public.agendamentos;
  END IF;
END $$;

-- Conferência: tem que listar agendamentos junto das outras tabelas.
SELECT tablename
FROM pg_publication_tables
WHERE pubname = 'supabase_realtime'
ORDER BY tablename;
