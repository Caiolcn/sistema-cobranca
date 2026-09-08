-- ==========================================================
-- RLS de pagamentos_mercadopago e assinaturas_mercadopago
--
-- PROBLEMA
-- As duas tabelas têm uma política chamada "Service role gerencia ...",
-- criada como:
--
--     FOR ALL TO public USING (true)
--
-- `service_role` IGNORA RLS por definição — essa política nunca foi
-- necessária pro webhook. O que ela faz de fato é liberar SELECT, INSERT,
-- UPDATE e DELETE das duas tabelas para o papel `public`, ou seja: anon e
-- qualquer usuário logado. Na prática, com a chave publishable do front,
-- dava pra ler (e escrever) o histórico de pagamento de todas as contas.
--
-- Confirmado em 03/09/2026 abrindo a tela Meu Plano SEM sessão: o histórico
-- veio populado com pagamentos de várias contas.
--
-- POR QUE NÃO BASTA DAR DROP
-- As edge functions create-pix-payment, create-subscription e
-- cancel-subscription NÃO usam service_role: elas criam o client com a
-- ANON_KEY repassando o Authorization do usuário, justamente pra herdar a
-- identidade dele. Elas gravam nestas tabelas. Sem uma política de
-- INSERT/UPDATE pro usuário dono da linha, gerar Pix e assinar no cartão
-- quebram na hora.
--
-- O que segue troca a política aberta por permissões coladas em user_id.
-- O webhook (mercadopago-webhook, service_role) segue passando por cima da
-- RLS e não é afetado.
--
-- Depois de aplicar, confira com a chave anon que
--   select * from pagamentos_mercadopago
-- volta VAZIO.
-- ==========================================================

BEGIN;

-- ---------- pagamentos_mercadopago ----------

DROP POLICY IF EXISTS "Service role gerencia pagamentos" ON public.pagamentos_mercadopago;

-- SELECT próprio e SELECT admin já existem e continuam valendo:
--   "Usuários veem próprios pagamentos"  USING (auth.uid() = user_id)
--   "Admin vê todos pagamentos"          USING (is_admin())

-- create-pix-payment grava a linha em nome do usuário logado.
CREATE POLICY "Usuário cria próprio pagamento"
  ON public.pagamentos_mercadopago
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- ---------- assinaturas_mercadopago ----------

DROP POLICY IF EXISTS "Service role gerencia assinaturas" ON public.assinaturas_mercadopago;

-- create-subscription grava a assinatura pendente em nome do usuário.
CREATE POLICY "Usuário cria própria assinatura"
  ON public.assinaturas_mercadopago
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- cancel-subscription marca status='cancelled' na assinatura do usuário.
CREATE POLICY "Usuário atualiza própria assinatura"
  ON public.assinaturas_mercadopago
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

COMMIT;

-- ---------- Conferência ----------
-- select tablename, policyname, cmd, roles::text, qual::text, with_check::text
--   from pg_policies
--  where schemaname='public'
--    and tablename in ('pagamentos_mercadopago','assinaturas_mercadopago')
--  order by tablename, cmd;
--
-- Nenhuma linha pode sobrar com cmd='ALL', roles={public} e qual='true'.
