-- ============================================================
-- Habilita RLS nas 5 tabelas que estavam abertas para a anon key.
--
-- NAO TOCA NO FLUXO DE CONEXAO DO WHATSAPP.
-- O estado das instancias vive em whatsapp_connections e mensallizap,
-- que JA estao com RLS ligado e com policies. Nenhuma tabela abaixo
-- participa de conectar/desconectar cliente na Evolution.
-- ============================================================

-- ---------- 1. logs_conexao ----------
-- Escrita: SOMENTE a edge function whatsapp-bot, com SERVICE_ROLE
--          (service_role ignora RLS). Ver whatsapp-bot/index.ts:132 e :151.
-- Leitura: SOMENTE a funcao mensalli_engajamento(), que e SECURITY DEFINER
--          e roda como postgres (dono da tabela -> bypassa RLS).
-- Frontend e n8n: zero referencias.
-- => Ligar RLS aqui e inerte. Nenhuma policy necessaria.
ALTER TABLE public.logs_conexao ENABLE ROW LEVEL SECURITY;

-- ---------- 2. cron_geracao_log ----------
-- Zero referencias no repo. Escrito por pg_cron / funcao server-side.
ALTER TABLE public.cron_geracao_log ENABLE ROW LEVEL SECURITY;

-- ---------- 3 e 4. backups de 13/jul ----------
-- Snapshots congelados (5 e 7 linhas), zero referencias.
ALTER TABLE public._backup_views_parcelas_13jul ENABLE ROW LEVEL SECURITY;
ALTER TABLE public._backup_views_automacoes_13jul ENABLE ROW LEVEL SECURITY;

-- ---------- 5. avisos ----------
-- ATENCAO: esta e a unica que QUEBRA se ligar RLS sem policy.
-- O frontend (src/Avisos.js) le e escreve com a sessao do proprio cliente
-- (anon key + JWT). Sem policy, a tela Avisos de TODOS os clientes fica
-- vazia e para de salvar. Por isso a policy vai junto, na mesma transacao.
-- (A edge function portal-dados usa service_role -> nao e afetada.)
BEGIN;

ALTER TABLE public.avisos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "avisos_select_proprio" ON public.avisos;
CREATE POLICY "avisos_select_proprio" ON public.avisos
  FOR SELECT USING (auth.uid() = user_id OR is_admin());

DROP POLICY IF EXISTS "avisos_insert_proprio" ON public.avisos;
CREATE POLICY "avisos_insert_proprio" ON public.avisos
  FOR INSERT WITH CHECK (auth.uid() = user_id OR is_admin());

DROP POLICY IF EXISTS "avisos_update_proprio" ON public.avisos;
CREATE POLICY "avisos_update_proprio" ON public.avisos
  FOR UPDATE USING (auth.uid() = user_id OR is_admin())
  WITH CHECK (auth.uid() = user_id OR is_admin());

DROP POLICY IF EXISTS "avisos_delete_proprio" ON public.avisos;
CREATE POLICY "avisos_delete_proprio" ON public.avisos
  FOR DELETE USING (auth.uid() = user_id OR is_admin());

COMMIT;

-- ---------- Conferencia ----------
-- Rodar depois: toda linha deve vir rls_on = true, e avisos com 4 policies.
-- SELECT c.relname, c.relrowsecurity AS rls_on,
--        (SELECT count(*) FROM pg_policies p
--          WHERE p.schemaname='public' AND p.tablename=c.relname) AS policies
--   FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
--  WHERE n.nspname='public'
--    AND c.relname IN ('logs_conexao','avisos','cron_geracao_log',
--                      '_backup_views_parcelas_13jul','_backup_views_automacoes_13jul');
