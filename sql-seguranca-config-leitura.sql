-- =====================================================================
-- Segurança: leitura aberta da tabela `config`
-- =====================================================================
-- Problema: a policy "Permitir leitura de configurações para usuários
-- autenticados" libera SELECT com `true` pra qualquer usuário logado. Como
-- policies se somam (OR), ela anula a policy de dono e qualquer cliente lê,
-- pelo console, a `evolution_api_key` global (trocada em 22/09/2026, commit
-- 196af67, que já previa restringir essa leitura — ficou pendente) e as URLs
-- de webhook do n8n.
--
-- Correção: remover só essa policy. Continua valendo
-- "Usuários podem ver suas próprias configurações" (auth.uid() = user_id OR
-- is_admin()).
--
-- Por que não quebra:
-- - O app só lê linhas do próprio usuário (chaves `<user_id>_...`); conferido
--   em 19/10/2026: 56 linhas prefixadas, 0 com prefixo de outro usuário.
-- - Linhas globais (evolution_*, n8n_webhook_*, trial_*) são lidas pelo admin
--   (is_admin) e por edge functions / n8n com a chave secreta (ignora RLS).
-- =====================================================================

-- ROLLBACK (só se precisar voltar):
-- CREATE POLICY "Permitir leitura de configurações para usuários autenticados"
--   ON public.config FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Permitir leitura de configurações para usuários autenticados" ON public.config;

-- Conferência: deve listar só a policy de dono como SELECT.
SELECT policyname, roles::text, qual
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'config' AND cmd = 'SELECT';
