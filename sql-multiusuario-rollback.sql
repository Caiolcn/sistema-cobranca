-- ---------------------------------------------------------------------------
-- MULTIUSUÁRIO — ROLLBACK DA FASE 1
-- ---------------------------------------------------------------------------
--
-- Desfaz sql-multiusuario-fase1-conta-membros.sql e devolve o banco ao estado
-- de antes, exatamente.
--
-- NÃO restaura nada da fase 0 (a drop da policy frouxa e o trigger que trava as
-- colunas de cobrança). Aquilo é correção de segurança e deve ficar de pé
-- mesmo com o multiusuário revertido. O rollback da fase 0, se um dia for
-- preciso, está comentado no rodapé dos arquivos dela.
--
--
-- DE ONDE VEM A VERDADE
--
-- Da tabela public._rls_backup_prefase1, que o bloco 0 da fase 1 grava com a
-- definição EXATA de todas as policies do schema antes de encostar em nada.
-- Não é uma lista escrita à mão que pode estar desatualizada: é a foto do que
-- estava rodando.
--
--
-- QUANDO USAR
--
-- Sintoma que justifica rollback imediato:
--   - conta enxergando dado de outra conta (o pior caso, e o mais silencioso);
--   - queries voltando vazio ou com "permission denied for function
--     contas_do_usuario";
--   - lentidão perceptível em telas que listam mensalidades ou devedores.
--
-- Sintoma que NÃO justifica: membro sem acesso a alguma tela. Isso é a fase 3
-- faltando, não defeito da fase 1.
--
--
-- ORDEM IMPORTA
--
-- As policies novas dependem de contas_do_usuario(). Restaurar as policies
-- ANTES de derrubar a função. Se derrubar a função primeiro, toda query do app
-- passa a dar erro até o resto do script terminar.
-- ---------------------------------------------------------------------------


-- ANTES: a foto existe? Se isto voltar 0 linhas, PARE — a fase 1 não chegou a
-- rodar, ou alguém derrubou a tabela. Sem a foto, este script não tem o que
-- restaurar.
SELECT count(*) AS policies_na_foto, min(tirada_em) AS foto_tirada_em
  FROM public._rls_backup_prefase1;


BEGIN;

-- ---------------------------------------------------------------------------
-- 1. RESTAURAR AS POLICIES
-- ---------------------------------------------------------------------------
DO $rollback$
DECLARE
  r      record;
  v_sql  text;
  v_ok   int := 0;
  v_erro int := 0;
BEGIN
  FOR r IN SELECT * FROM public._rls_backup_prefase1 LOOP
    BEGIN
      -- A policy atual pode ter o mesmo nome (a fase 1 recriou mantendo nome).
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, r.tablename);

      v_sql := format('CREATE POLICY %I ON public.%I AS %s FOR %s TO %s',
                      r.policyname, r.tablename, r.permissive, r.cmd, r.papeis);
      IF r.qual       IS NOT NULL THEN v_sql := v_sql || ' USING '      || r.qual;       END IF;
      IF r.with_check IS NOT NULL THEN v_sql := v_sql || ' WITH CHECK ' || r.with_check; END IF;
      EXECUTE v_sql;

      v_ok := v_ok + 1;
    EXCEPTION WHEN OTHERS THEN
      -- Uma policy que não volta não pode impedir as outras 133 de voltarem.
      v_erro := v_erro + 1;
      RAISE WARNING 'FALHOU restaurar %.%: %', r.tablename, r.policyname, SQLERRM;
    END;
  END LOOP;

  RAISE NOTICE '--- restauradas: % | falharam: % ---', v_ok, v_erro;
END
$rollback$;


-- ---------------------------------------------------------------------------
-- 2. DEVOLVER handle_new_user AO ORIGINAL
-- ---------------------------------------------------------------------------
-- Corpo idêntico ao que estava em produção em 23/09/26, antes do desvio de
-- convite. Sem a linha de conta_membros, que deixa de existir.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_plano text;
  v_limite integer;
BEGIN
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

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'handle_new_user falhou para %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$function$;


-- ---------------------------------------------------------------------------
-- 3. DERRUBAR O QUE A FASE 1 CRIOU
-- ---------------------------------------------------------------------------
-- Só depois das policies já estarem restauradas e sem referência às funções.
DROP VIEW     IF EXISTS public.vw_minha_conta;
DROP FUNCTION IF EXISTS public.papel_atual();
DROP FUNCTION IF EXISTS public.conta_atual();
DROP FUNCTION IF EXISTS public.contas_do_usuario();

-- A tabela de membros. Perde-se quem foi convidado — é o custo de voltar
-- atrás, e por isso o rollback é decisão de horas, não de semanas.
DROP TABLE IF EXISTS public.conta_membros;

COMMIT;


-- ---------------------------------------------------------------------------
-- CONFERÊNCIA
-- ---------------------------------------------------------------------------

-- 1. Sobrou alguma policy citando contas_do_usuario()? Esperado: 0.
SELECT count(*) AS policies_ainda_no_formato_novo
  FROM pg_policies
 WHERE schemaname = 'public'
   AND (qual::text LIKE '%contas_do_usuario%' OR with_check::text LIKE '%contas_do_usuario%');

-- 2. O formato antigo voltou? Esperado: 142 (o número de antes da fase 1).
SELECT count(*) AS policies_no_formato_antigo
  FROM pg_policies
 WHERE schemaname = 'public'
   AND (qual::text LIKE '%auth.uid()%' OR with_check::text LIKE '%auth.uid()%');

-- 3. O app volta a ler? Entre com uma conta e confira as contagens de
--    devedores, mensalidades e templates contra o que era antes.

-- 4. Só depois de tudo conferido, e sem pressa:
--    DROP TABLE public._rls_backup_prefase1;
-- ---------------------------------------------------------------------------
