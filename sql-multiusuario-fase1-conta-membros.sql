-- ---------------------------------------------------------------------------
-- MULTIUSUÁRIO — FASE 1: a conta passa a ter membros
-- ---------------------------------------------------------------------------
--
-- PRÉ-REQUISITOS (nesta ordem):
--   1. sql-fix-rls-usuarios-update.sql          (derruba a policy USING true)
--   2. sql-multiusuario-fase0-blindar-plano.sql (trava as colunas de cobrança)
--
-- Sem os dois, este arquivo entrega um login a cada funcionário do cliente
-- numa tabela `usuarios` que qualquer um consegue reescrever.
--
--
-- A DECISÃO DE ARQUITETURA
--
-- Hoje `usuarios.id` É o `auth.users.id`: conta e login são a mesma linha.
-- O caminho de livro seria criar uma tabela `contas`, pendurar `conta_id` nas
-- 47 tabelas que têm `user_id` e migrar tudo. São meses, e cada tabela é uma
-- chance de deixar dado para trás.
--
-- O caminho daqui é outro: `usuarios` CONTINUA sendo a conta (o dono), o
-- `user_id` das 47 tabelas CONTINUA sendo o id do dono, e nenhum dado é
-- migrado. O que entra é só uma tabela de vínculo — quem mais pode entrar
-- nessa conta — e a troca da pergunta que a RLS faz:
--
--   de   "esta linha é do usuário logado?"     ->  user_id = auth.uid()
--   para "esta linha é de alguma conta que o   ->  user_id = ANY(contas_do_usuario())
--         usuário logado pode acessar?"
--
-- Para o dono, as duas perguntas dão a mesma resposta. É isso que torna a
-- migração reversível: enquanto não existir linha em conta_membros apontando
-- para outro login, o sistema se comporta exatamente como antes.
--
--
-- UMA PESSOA, UMA CONTA
--
-- O índice único parcial lá embaixo impede o mesmo login em duas contas
-- ativas. É escolha deliberada: sem isso, o app precisa de um seletor de
-- conta no topo e `conta_atual()` precisa de estado de sessão. Como ninguém
-- pediu isso, fica travado.
--
-- Mas `contas_do_usuario()` já devolve ARRAY, não uuid. O dia em que o
-- professor que dá aula em dois CTs virar problema, o destravamento é
-- derrubar o índice e construir o seletor — a RLS não muda uma linha.
--
--
-- O QUE ESTE ARQUIVO NÃO FAZ
--
-- Não cria permissão por módulo. `papel` nasce como rótulo: todo membro
-- enxerga o mesmo que o dono, menos o que as exceções abaixo tiram.
-- Restringir o que cada papel faz é a fase 3, e é lá que entra a decisão de
-- quais telas o professor não abre. Fazer as duas coisas no mesmo commit
-- significa depurar vazamento de dado e regra de negócio ao mesmo tempo.
-- ---------------------------------------------------------------------------

BEGIN;

-- ---------------------------------------------------------------------------
-- 0. A FOTO DE ANTES (rede de segurança — não pule)
-- ---------------------------------------------------------------------------
--
-- Guarda a definição EXATA de todas as policies do schema antes de qualquer
-- mudança. É daqui que sql-multiusuario-rollback.sql restaura.
--
-- Está dentro da mesma transação de propósito: se a migração falhar no meio, a
-- foto some junto e nada ficou pela metade. E é CREATE TABLE (não TEMP): tem
-- de sobreviver à sessão para o rollback poder ser rodado dias depois.
--
-- O IF NOT EXISTS protege contra rodar duas vezes e sobrescrever a foto boa
-- com uma já modificada. Se precisar refazer a foto de propósito, derrube a
-- tabela na mão antes.
CREATE TABLE IF NOT EXISTS public._rls_backup_prefase1 AS
SELECT now() AS tirada_em,
       tablename, policyname, cmd, permissive,
       array_to_string(roles, ', ') AS papeis,
       qual::text       AS qual,
       with_check::text AS with_check
  FROM pg_policies
 WHERE schemaname = 'public';

-- Ninguém além do dono do schema precisa enxergar isso.
REVOKE ALL ON public._rls_backup_prefase1 FROM anon, authenticated;


-- ---------------------------------------------------------------------------
-- 1. A TABELA DE VÍNCULO
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.conta_membros (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- A conta. É o dono, e é exatamente o valor que está em user_id nas
  -- 47 tabelas de dado.
  conta_id          uuid NOT NULL REFERENCES public.usuarios(id) ON DELETE CASCADE,

  -- O login. Fica NULL entre o convite e o aceite: a linha existe antes de
  -- a pessoa ter conta no auth.
  auth_user_id      uuid REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Liga ao cadastro que já existe (nome, cargo, CPF, endereço). O membro
  -- não nasce de um cadastro novo: nasce de um colaborador ganhando login.
  colaborador_id    uuid REFERENCES public.colaboradores(id) ON DELETE SET NULL,

  email             text NOT NULL,
  nome              text,

  -- Rótulo na fase 1, regra na fase 3. 'dono' é a linha semeada para quem
  -- já tem conta; não pode ser removida nem rebaixada.
  papel             text NOT NULL DEFAULT 'operacao'
                    CHECK (papel IN ('dono', 'gerente', 'operacao', 'professor')),

  ativo             boolean NOT NULL DEFAULT true,

  -- O convite. O token viaja no raw_user_meta_data do signUp e é o que
  -- handle_new_user usa para NÃO criar uma conta nova (ver bloco 7).
  convite_token     uuid DEFAULT gen_random_uuid(),
  convite_expira_em timestamptz DEFAULT now() + INTERVAL '7 days',
  convite_aceito_em timestamptz,

  criado_por        uuid,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

-- O mesmo login não entra duas vezes na mesma conta.
CREATE UNIQUE INDEX IF NOT EXISTS conta_membros_conta_login_uk
  ON public.conta_membros (conta_id, auth_user_id)
  WHERE auth_user_id IS NOT NULL;

-- O mesmo e-mail não é convidado duas vezes para a mesma conta.
CREATE UNIQUE INDEX IF NOT EXISTS conta_membros_conta_email_uk
  ON public.conta_membros (conta_id, lower(email));

-- UMA PESSOA, UMA CONTA (ver cabeçalho). Derrube este índice no dia em que
-- for construir o seletor de conta.
CREATE UNIQUE INDEX IF NOT EXISTS conta_membros_login_unico_uk
  ON public.conta_membros (auth_user_id)
  WHERE auth_user_id IS NOT NULL AND ativo;

-- O token é procurado a cada aceite de convite.
CREATE UNIQUE INDEX IF NOT EXISTS conta_membros_token_uk
  ON public.conta_membros (convite_token)
  WHERE convite_token IS NOT NULL;

-- contas_do_usuario() roda em TODA query do app. Sem este índice, cada
-- request faz seq scan na tabela de membros.
CREATE INDEX IF NOT EXISTS conta_membros_login_ativo_ix
  ON public.conta_membros (auth_user_id) WHERE ativo;

DROP TRIGGER IF EXISTS trigger_atualizar_updated_at ON public.conta_membros;
CREATE TRIGGER trigger_atualizar_updated_at
  BEFORE UPDATE ON public.conta_membros
  FOR EACH ROW EXECUTE FUNCTION public.atualizar_updated_at();


-- ---------------------------------------------------------------------------
-- 2. SEMEAR O DONO
-- ---------------------------------------------------------------------------
-- Toda conta que já existe ganha sua linha 'dono'. Não muda comportamento
-- nenhum (o dono já enxergava tudo), mas faz a tela de membros abrir com a
-- lista certa em vez de vazia, e dá um lugar para `criado_por` apontar.
--
-- convite_token vai NULO de propósito: dono não tem convite pendente, e o
-- índice único do token ignora NULL.
INSERT INTO public.conta_membros
       (conta_id, auth_user_id, email, nome, papel, convite_token, convite_expira_em, convite_aceito_em)
SELECT u.id, u.id, u.email, u.nome_completo, 'dono', NULL, NULL, now()
  FROM public.usuarios u
ON CONFLICT DO NOTHING;


-- ---------------------------------------------------------------------------
-- 3. OS HELPERS
-- ---------------------------------------------------------------------------
--
-- Por que SECURITY DEFINER: a policy de conta_membros chama estas funções, e
-- elas leem conta_membros. Sem SECURITY DEFINER isso é recursão infinita de
-- RLS. Rodando como dono da tabela, a RLS não se aplica — é o mesmo truque
-- que is_admin() já usa para ler `usuarios` desde sql-admin-role.sql.
--
-- Por que devolve ARRAY e não uuid: ver "UMA PESSOA, UMA CONTA" no cabeçalho.
-- E, principalmente, porque `user_id = ANY((SELECT ...))` NÃO depende da linha
-- sendo testada — o Postgres avalia uma vez por query (InitPlan) em vez de uma
-- vez por linha. Com uma função que recebe a linha como argumento
-- (`pertence_a_conta(user_id)`), seria uma chamada por linha, e em
-- `mensalidades` isso aparece no relógio.
--
-- O `SELECT auth.uid()` de dentro é a rede de segurança da migração: se a
-- tabela de membros estiver vazia, sumir ou dar erro, todo mundo continua
-- enxergando a própria conta e nada mais — o comportamento de hoje.
CREATE OR REPLACE FUNCTION public.contas_do_usuario()
RETURNS uuid[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT ARRAY(
    SELECT auth.uid() WHERE auth.uid() IS NOT NULL
    UNION
    SELECT cm.conta_id
      FROM public.conta_membros cm
     WHERE cm.auth_user_id = auth.uid()
       AND cm.ativo
  );
$function$;

-- A conta "em que eu estou". Para o dono é o próprio id — por isso o app
-- inteiro continua funcionando sem saber que membro existe.
CREATE OR REPLACE FUNCTION public.conta_atual()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT COALESCE(
    (SELECT cm.conta_id
       FROM public.conta_membros cm
      WHERE cm.auth_user_id = auth.uid()
        AND cm.ativo
      ORDER BY (cm.papel = 'dono') DESC, cm.created_at
      LIMIT 1),
    auth.uid()
  );
$function$;

-- O papel de quem está logado: alimenta a fase 3 e a UI que esconde botão.
-- Sem linha de membro, o padrão é 'dono' — de novo, comportamento de hoje.
CREATE OR REPLACE FUNCTION public.papel_atual()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT COALESCE(
    (SELECT cm.papel
       FROM public.conta_membros cm
      WHERE cm.auth_user_id = auth.uid()
        AND cm.ativo
      ORDER BY (cm.papel = 'dono') DESC, cm.created_at
      LIMIT 1),
    'dono'
  );
$function$;

GRANT EXECUTE ON FUNCTION public.contas_do_usuario() TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.conta_atual()       TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.papel_atual()       TO authenticated, anon;


-- ---------------------------------------------------------------------------
-- 4. RLS DA PRÓPRIA conta_membros
-- ---------------------------------------------------------------------------
ALTER TABLE public.conta_membros ENABLE ROW LEVEL SECURITY;

-- Ver: todo mundo da conta vê a equipe. Sem isso o membro nem sabe em que
-- conta está.
DROP POLICY IF EXISTS "Membros veem a equipe da conta" ON public.conta_membros;
CREATE POLICY "Membros veem a equipe da conta"
  ON public.conta_membros FOR SELECT TO public
  USING (conta_id = ANY ((SELECT public.contas_do_usuario())) OR is_admin());

-- Mexer na equipe: só o DONO. Gerente convidar gerente é decisão da fase 3;
-- até lá, quem paga é quem adiciona — e quem adiciona é quem aumenta a fatura.
DROP POLICY IF EXISTS "Dono gerencia a equipe" ON public.conta_membros;
CREATE POLICY "Dono gerencia a equipe"
  ON public.conta_membros FOR ALL TO public
  USING      (conta_id = auth.uid() OR is_admin())
  WITH CHECK (conta_id = auth.uid() OR is_admin());


-- ---------------------------------------------------------------------------
-- 5. A CONTA VISTA PELO MEMBRO
-- ---------------------------------------------------------------------------
--
-- ATENÇÃO — ESTE BLOCO É O MOTIVO DE A POLICY DE `usuarios` NÃO SER ALARGADA.
--
-- `usuarios` guarda `asaas_api_key`: a chave que emite cobrança de verdade na
-- conta Asaas do cliente (7 contas têm chave em 23/09/26). RLS filtra LINHA,
-- não COLUNA — alargar o SELECT de `usuarios` para os membros entregaria essa
-- chave a toda recepcionista via PostgREST, porque basta pedir a coluna.
--
-- Então a policy de `usuarios` fica EXATAMENTE como está (dono e admin), e o
-- membro lê a conta por esta view, que só expõe o que a UI precisa. A view
-- pertence ao dono do schema e não tem security_invoker, então atravessa a
-- RLS da tabela de propósito — o filtro é o WHERE aqui dentro.
--
-- A lista de colunas é a CAMPOS_CONTA de src/contexts/UserContext.js mais o
-- onboarding. Se acrescentar campo lá, acrescente aqui — e pense duas vezes
-- antes de trazer segredo para dentro.
CREATE OR REPLACE VIEW public.vw_minha_conta AS
SELECT
  u.id,
  u.email,
  u.plano,
  u.plano_pago,
  u.plano_vencimento,
  u.limite_mensal,
  u.nome_empresa,
  u.nome_completo,
  u.chave_pix,
  u.cpf_cnpj,
  u.email_empresa,
  u.telefone,
  u.logo_url,
  u.trial_fim,
  u.virou_pagante_em,
  u.cancelado_em,
  u.role,
  u.ultimo_acesso,
  u.onboarding_completed,
  u.onboarding_step,
  u.modo_integracao,
  -- O que o front precisa saber sobre QUEM está olhando
  public.papel_atual()        AS meu_papel,
  (u.id = auth.uid())         AS sou_dono,
  -- Sinal booleano em vez da chave: WhatsAppConexao.js:848 só quer saber se
  -- o Asaas está configurado, nunca precisou do segredo.
  (u.asaas_api_key IS NOT NULL AND u.asaas_api_key <> '') AS asaas_configurado
FROM public.usuarios u
WHERE u.id = ANY ((SELECT public.contas_do_usuario()));

GRANT SELECT ON public.vw_minha_conta TO authenticated, anon;


-- ---------------------------------------------------------------------------
-- 6. A REESCRITA DAS POLICIES
-- ---------------------------------------------------------------------------
--
-- 100 policies em 46 tabelas cabem em quatro formas exatas (levantado em
-- 23/09/26 sobre pg_policies):
--
--   ((auth.uid() = user_id) OR is_admin())   77
--   (auth.uid() = user_id)                   18
--   (user_id = auth.uid())                    3
--   ((user_id = auth.uid()) OR is_admin())    2
--
-- O bloco abaixo só toca no que casa com uma dessas quatro, LETRA POR LETRA.
-- Qualquer coisa fora disso ele deixa quieto e imprime no aviso final, para
-- tratar na mão. Reescrita por LIKE/regex aqui seria mexer em policy de
-- segurança no escuro.
--
-- EXCLUÍDAS DE PROPÓSITO:
--
--   usuarios        -> ver bloco 5. A conta se lê pela view.
--
--   novidades_lidas -> aqui `user_id` significa PESSOA, não conta: é quem já
--                      viu o changelog (grava com realUserId). Alargar faria
--                      um membro marcar a novidade como lida para a conta
--                      inteira — e, pior, o FK aponta para `usuarios`, onde o
--                      membro NÃO tem linha: o INSERT morreria em violação de
--                      FK. Repontar o FK para auth.users é fase 2.
--
--   campanha_envios -> as 3 policies filtram por EXISTS na campanha-mãe.
--                      Reescritas na mão logo abaixo.
--
-- A lista de alvos é materializada ANTES do laço: iterar pg_policies enquanto
-- se dá DROP/CREATE em policy é mexer na tabela que se está lendo.
CREATE TEMP TABLE _policies_alvo ON COMMIT DROP AS
SELECT tablename, policyname, cmd, permissive,
       array_to_string(roles, ', ') AS papeis,
       qual::text       AS q,
       with_check::text AS wc
  FROM pg_policies
 WHERE schemaname = 'public'
   AND tablename NOT IN ('usuarios', 'novidades_lidas', 'campanha_envios')
   AND (qual::text LIKE '%auth.uid()%' OR with_check::text LIKE '%auth.uid()%');

DO $migracao$
DECLARE
  r            record;
  v_qual       text;
  v_check      text;
  v_sql        text;
  v_nao_tocado text[] := '{}';
  v_ok         int := 0;
  c_dono  constant text := '(user_id = ANY ((SELECT public.contas_do_usuario())))';
  c_admin constant text := '(user_id = ANY ((SELECT public.contas_do_usuario())) OR is_admin())';
BEGIN
  FOR r IN SELECT * FROM _policies_alvo LOOP

    v_qual := CASE r.q
      WHEN '((auth.uid() = user_id) OR is_admin())' THEN c_admin
      WHEN '((user_id = auth.uid()) OR is_admin())' THEN c_admin
      WHEN '(auth.uid() = user_id)'                 THEN c_dono
      WHEN '(user_id = auth.uid())'                 THEN c_dono
      ELSE NULL END;

    v_check := CASE r.wc
      WHEN '((auth.uid() = user_id) OR is_admin())' THEN c_admin
      WHEN '((user_id = auth.uid()) OR is_admin())' THEN c_admin
      WHEN '(auth.uid() = user_id)'                 THEN c_dono
      WHEN '(user_id = auth.uid())'                 THEN c_dono
      ELSE NULL END;

    -- Nada reconhecido nos dois lados: não é policy de dono, passa longe.
    IF v_qual IS NULL AND v_check IS NULL THEN
      v_nao_tocado := v_nao_tocado || (r.tablename || '.' || r.policyname);
      CONTINUE;
    END IF;

    -- Reconheci um lado mas o outro tem conteúdo estranho: não mexo em
    -- nenhum dos dois. Meia reescrita é como se abre buraco.
    IF (r.q IS NOT NULL AND v_qual IS NULL) OR (r.wc IS NOT NULL AND v_check IS NULL) THEN
      v_nao_tocado := v_nao_tocado || (r.tablename || '.' || r.policyname || ' (forma mista)');
      CONTINUE;
    END IF;

    EXECUTE format('DROP POLICY %I ON public.%I', r.policyname, r.tablename);

    v_sql := format('CREATE POLICY %I ON public.%I AS %s FOR %s TO %s',
                    r.policyname, r.tablename, r.permissive, r.cmd, r.papeis);
    IF v_qual  IS NOT NULL THEN v_sql := v_sql || ' USING '      || v_qual;  END IF;
    IF v_check IS NOT NULL THEN v_sql := v_sql || ' WITH CHECK ' || v_check; END IF;
    EXECUTE v_sql;

    v_ok := v_ok + 1;
  END LOOP;

  RAISE NOTICE '--- policies reescritas: % ---', v_ok;
  IF array_length(v_nao_tocado, 1) > 0 THEN
    RAISE NOTICE '--- NAO TOCADAS (trate na mao): %', array_to_string(v_nao_tocado, ' | ');
  ELSE
    RAISE NOTICE '--- nenhuma policy ficou para tras ---';
  END IF;
END
$migracao$;


-- campanha_envios: filtra pela campanha-mãe, não por user_id próprio.
DROP POLICY IF EXISTS "Usuários podem ver envios de suas campanhas"       ON public.campanha_envios;
DROP POLICY IF EXISTS "Usuários podem criar envios de suas campanhas"     ON public.campanha_envios;
DROP POLICY IF EXISTS "Usuários podem atualizar envios de suas campanhas" ON public.campanha_envios;

CREATE POLICY "Usuários podem ver envios de suas campanhas"
  ON public.campanha_envios FOR SELECT TO public
  USING (EXISTS (SELECT 1 FROM public.campanhas c
                  WHERE c.id = campanha_envios.campanha_id
                    AND (c.user_id = ANY ((SELECT public.contas_do_usuario())) OR is_admin())));

CREATE POLICY "Usuários podem criar envios de suas campanhas"
  ON public.campanha_envios FOR INSERT TO public
  WITH CHECK (EXISTS (SELECT 1 FROM public.campanhas c
                       WHERE c.id = campanha_envios.campanha_id
                         AND (c.user_id = ANY ((SELECT public.contas_do_usuario())) OR is_admin())));

CREATE POLICY "Usuários podem atualizar envios de suas campanhas"
  ON public.campanha_envios FOR UPDATE TO public
  USING (EXISTS (SELECT 1 FROM public.campanhas c
                  WHERE c.id = campanha_envios.campanha_id
                    AND (c.user_id = ANY ((SELECT public.contas_do_usuario())) OR is_admin())));


-- ---------------------------------------------------------------------------
-- 7. O DESVIO DO CONVITE NO CADASTRO
-- ---------------------------------------------------------------------------
--
-- handle_new_user roda em TODO auth.users novo e cria conta + controle_planos
-- + configuracoes_cobranca. Sem o desvio abaixo, quem aceita convite ganha uma
-- conta própria, com trial próprio, e o convite nunca liga em lugar nenhum.
--
-- O front manda o token em raw_user_meta_data no signUp:
--   supabase.auth.signUp({ email, password,
--                          options: { data: { convite_token: '<uuid>' } } })
--
-- O resto do corpo é idêntico ao que está no banco em 23/09/26 — se aquele
-- mudar, reaplique a mudança aqui.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_plano     text;
  v_limite    integer;
  v_token     uuid;
  v_membro_id uuid;
BEGIN
  -- ---- desvio do convite ----
  BEGIN
    v_token := NULLIF(NEW.raw_user_meta_data->>'convite_token', '')::uuid;
  EXCEPTION WHEN OTHERS THEN
    v_token := NULL;  -- token torto é tratado como cadastro comum
  END;

  IF v_token IS NOT NULL THEN
    SELECT cm.id INTO v_membro_id
      FROM public.conta_membros cm
     WHERE cm.convite_token = v_token
       AND cm.auth_user_id IS NULL
       AND cm.ativo
       AND (cm.convite_expira_em IS NULL OR cm.convite_expira_em > now())
     LIMIT 1;

    IF v_membro_id IS NOT NULL THEN
      UPDATE public.conta_membros
         SET auth_user_id      = NEW.id,
             convite_aceito_em = now(),
             convite_token     = NULL,   -- queima o token: vale um aceite só
             email             = COALESCE(NEW.email, email)
       WHERE id = v_membro_id;

      -- NÃO cria conta: este login é membro de uma conta que já existe.
      RETURN NEW;
    END IF;

    -- Token inválido/expirado cai no caminho normal e vira conta própria.
    -- É o menos pior: melhor um trial a mais que um cadastro que morre.
    RAISE WARNING 'convite_token % nao encontrado para %; criando conta propria', v_token, NEW.id;
  END IF;

  -- ---- cadastro comum (inalterado) ----
  v_plano := COALESCE(NEW.raw_user_meta_data->>'plano', 'pro');
  v_limite := CASE v_plano WHEN 'starter' THEN 200 WHEN 'pro' THEN 600 WHEN 'premium' THEN 3000 ELSE 600 END;

  INSERT INTO public.usuarios (id, email, nome_completo, telefone, plano, limite_mensal, trial_fim, trial_ativo, plano_pago, status_conta)
  VALUES (
    NEW.id,
    NEW.email,
    NULLIF(NEW.raw_user_meta_data->>'nome_completo', ''),
    NULLIF(regexp_replace(COALESCE(NEW.raw_user_meta_data->>'telefone', ''), '[^0-9]', '', 'g'), ''),
    v_plano, v_limite, NOW() + INTERVAL '3 days', true, false, 'ativo'
  )
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.controle_planos (user_id, plano, limite_mensal, usage_count, mes_referencia, status)
  VALUES (NEW.id, v_plano, v_limite, 0, to_char(NOW(), 'YYYY-MM'), 'ativo')
  ON CONFLICT (user_id) DO NOTHING;

  INSERT INTO public.configuracoes_cobranca (user_id, enviar_no_dia, enviar_3_dias_antes, enviar_3_dias_depois)
  VALUES (NEW.id, true, true, true)
  ON CONFLICT (user_id) DO NOTHING;

  -- A linha de dono do bloco 2, agora para contas novas.
  INSERT INTO public.conta_membros
         (conta_id, auth_user_id, email, nome, papel, convite_token, convite_expira_em, convite_aceito_em)
  VALUES (NEW.id, NEW.id, NEW.email,
          NULLIF(NEW.raw_user_meta_data->>'nome_completo', ''), 'dono', NULL, NULL, now())
  ON CONFLICT DO NOTHING;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'handle_new_user falhou para %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$function$;

COMMIT;


-- ---------------------------------------------------------------------------
-- CONFERÊNCIA (rode DEPOIS do commit)
-- ---------------------------------------------------------------------------

-- 1. Sobrou policy no formato antigo? Esperado: só as de `usuarios` e
--    `novidades_lidas`, que ficaram de fora de propósito.
SELECT tablename, policyname, cmd, qual::text
  FROM pg_policies
 WHERE schemaname = 'public'
   AND (qual::text LIKE '%auth.uid()%' OR with_check::text LIKE '%auth.uid()%')
 ORDER BY tablename, policyname;

-- 2. Toda conta tem sua linha de dono? Esperado: 0.
SELECT count(*) AS contas_sem_linha_de_dono
  FROM public.usuarios u
 WHERE NOT EXISTS (SELECT 1 FROM public.conta_membros cm
                    WHERE cm.conta_id = u.id AND cm.papel = 'dono');

-- 3. O ISOLAMENTO ENTRE CONTAS CONTINUA DE PÉ? Este é o teste que importa.
--    Logado pelo app com a conta A, as contagens têm de bater com as de
--    antes da migração, e NÃO podem incluir dado da conta B:
--      select count(*) from devedores;
--      select count(*) from mensalidades;
--      select count(*) from templates;


-- ---------------------------------------------------------------------------
-- ROLLBACK
-- ---------------------------------------------------------------------------
-- Enquanto conta_membros só tiver linhas 'dono' (conta_id = auth_user_id), as
-- policies novas dão exatamente o mesmo resultado que as antigas: dá para
-- ficar parado aqui com segurança por tempo indeterminado.
--
-- Para voltar de vez, reescreva as policies com o mesmo DO block invertendo o
-- CASE. NÃO derrube contas_do_usuario() antes disso — as 100 policies dependem
-- dela e o app inteiro para de ler dado.
--
--   DROP VIEW IF EXISTS public.vw_minha_conta;
--   -- ... reescrever as policies de volta ...
--   DROP FUNCTION IF EXISTS public.papel_atual();
--   DROP FUNCTION IF EXISTS public.conta_atual();
--   DROP FUNCTION IF EXISTS public.contas_do_usuario();
--   DROP TABLE IF EXISTS public.conta_membros;
-- ---------------------------------------------------------------------------
