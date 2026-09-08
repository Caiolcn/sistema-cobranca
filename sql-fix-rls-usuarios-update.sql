-- ---------------------------------------------------------------------------
-- FIX RLS CRÍTICO — usuarios: UPDATE liberado para qualquer um
-- ---------------------------------------------------------------------------
--
-- O QUE ESTÁ ERRADO
--
-- A tabela usuarios tem duas policies de UPDATE, e como policies permissivas
-- são combinadas com OR, a mais frouxa vence:
--
--   "Trigger pode atualizar usuarios"      {public}  USING (true)   <-- BURACO
--   "Usuários podem atualizar próprios..." {public}  USING (auth.uid() = id OR is_admin())
--
-- Com USING (true) e WITH CHECK nulo, QUALQUER usuário (a policy é {public},
-- então vale até para anon com a publishable key) escreve em QUALQUER linha
-- de usuarios. Dois abusos concretos:
--
--   1. Auto-upgrade: plano_pago = true + plano_vencimento no futuro = produto
--      de graça.
--   2. Exfiltração: no PostgREST, .update(...).select() devolve a linha
--      alterada. Dá para varrer a base inteira lendo email e asaas_api_key
--      (a chave de cobrança do Asaas) de todas as contas.
--
-- Takeover de admin NÃO é possível: o trigger tr_proteger_role reverte
-- qualquer mudança em `role` feita por quem não é admin.
--
-- POR QUE DÁ PARA DROPAR SEM QUEBRAR NADA
--
-- O nome da policy é enganoso: nenhum trigger depende dela. Todas as funções
-- que escrevem em usuarios são SECURITY DEFINER e já furam a RLS por
-- definição — handle_new_user (on_auth_user_created), sync_mensallizap_usuario
-- (INSERT e UPDATE em usuarios), proteger_role_admin, atualizar_ultimo_acesso,
-- ativar_assinatura_usuario, fazer_upgrade_plano, definir_grace_period,
-- incrementar_uso, e as demais RPCs de plano.
--
-- Os 25 pontos de escrita do front continuam cobertos pela policy que sobra:
--   - conta mexendo nela mesma (Configuracao.js, Onboarding.js, PerfilUsuario.js,
--     UserContext.js) -> auth.uid() = id
--   - admin mexendo em conta alheia (ModalEditarConta, ModalDisparo,
--     RetencaoSaas, e o contextUserId do seletor admin) -> is_admin()
--     (is_admin() é STABLE SECURITY DEFINER, roda dentro da RLS sem recursão)
--   - edge functions e n8n usam service_role -> furam RLS, indiferentes
--
-- ATENÇÃO — ACOPLAMENTO COM O CADASTRO
--
-- Signup.js:188 faz upsert em usuarios com onConflict:'id' e SEM
-- ignoreDuplicates. Como o trigger handle_new_user já criou a linha, esse
-- upsert cai no caminho ON CONFLICT DO UPDATE em todo cadastro — ou seja,
-- ele PRECISA passar por uma policy de UPDATE.
--
-- Hoje isso funciona porque a confirmação de e-mail está DESLIGADA: o
-- supabase.auth.signUp() devolve sessão na hora, então auth.uid() = id já
-- vale no momento do upsert. Verificado em 31/08/26 — os 21 cadastros dos
-- últimos 30 dias saíram todos autoconfirmados em menos de 5s, com zero
-- e-mails de confirmação enviados.
--
-- >> SE UM DIA LIGAREM A CONFIRMAÇÃO DE E-MAIL NO PAINEL, O CADASTRO QUEBRA
-- >> AQUI: sem sessão, auth.uid() é NULL e o UPDATE do upsert é negado.
-- >> Nesse dia, o conserto é o Signup parar de reescrever a linha do trigger.
--
-- NÃO INCLUÍDO DE PROPÓSITO
--
-- 1. A policy de INSERT "Permitir insert de novos usuários" também está
--    frouxa (WITH CHECK true, {public} = qualquer um insere linha arbitrária).
--    É outro caminho do cadastro e já quebrou o signup antes — trate em
--    commit separado, com teste de cadastro ponta a ponta.
-- 2. O buraco da tabela `config` (evolution_api_key legível por qualquer
--    usuário logado) NÃO se resolve com SQL. O front baixa essa chave para o
--    browser em 5 arquivos / 31 chamadas, então apertar a policy derruba o
--    WhatsApp do produto inteiro. Precisa antes de uma edge function proxy —
--    e a chave tem de ser ROTACIONADA na Evolution, porque a cópia atual já
--    passou pelo browser de todo cliente.
-- ---------------------------------------------------------------------------


-- ANTES: confira que as duas policies de UPDATE estão lá como descrito.
SELECT policyname, permissive, roles, qual, with_check
  FROM pg_policies
 WHERE schemaname = 'public' AND tablename = 'usuarios' AND cmd = 'UPDATE';


-- O FIX.
DROP POLICY IF EXISTS "Trigger pode atualizar usuarios" ON public.usuarios;


-- DEPOIS: tem de sobrar exatamente UMA policy de UPDATE, a restrita.
-- Esperado: "Usuários podem atualizar próprios dados"
--           qual = ((auth.uid() = id) OR is_admin())
SELECT policyname, permissive, roles, qual, with_check
  FROM pg_policies
 WHERE schemaname = 'public' AND tablename = 'usuarios' AND cmd = 'UPDATE';


-- ---------------------------------------------------------------------------
-- ROLLBACK (só se algo inesperado quebrar — isso REABRE o buraco)
-- ---------------------------------------------------------------------------
-- CREATE POLICY "Trigger pode atualizar usuarios"
--   ON public.usuarios FOR UPDATE TO public USING (true);
-- ---------------------------------------------------------------------------
