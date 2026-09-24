-- ============================================================
-- Vazamento: views do painel admin legíveis por qualquer cliente logado
-- (corrigido em 24/09/2026)
--
-- vw_admin_contas, vw_central_mensagens e vw_mensalli_retencao_saas rodam
-- com a permissão do DONO (não são security_invoker), não filtravam por admin
-- e o papel `authenticated` tinha SELECT. Resultado: qualquer conta de cliente
-- lia, pelo console do navegador, as 120 contas (e-mail, telefone, plano,
-- valores) e 16 mil mensagens de 52 escolas (texto + telefone do aluno).
--
-- Correção: um guarda único dentro das views. Não dá para trocar por
-- security_invoker: várias tabelas por baixo não liberam leitura ao admin
-- via RLS, e o painel ficaria vazio.
--
-- As views são reescritas a partir da definição VIVA (pg_get_viewdef) — os
-- .sql do repo estão defasados e copiar à mão arriscaria reverter coluna.
-- ============================================================

-- Quem pode ler dado de painel admin:
--   - admin logado (is_admin() olha auth.uid());
--   - service_role (edge functions / n8n pela API);
--   - conexão direta ao Postgres (n8n, pg_cron, SQL editor): sem
--     request.jwt.claims. Toda requisição pela API (PostgREST) tem esse
--     setting, preenchido a partir do JWT verificado — o cliente não controla.
--   A 1ª versão usava session_user <> 'authenticator'. Funcionava, mas não
--   dava para TESTAR simulando cliente pelo SQL (a sessão de teste é postgres,
--   então liberava tudo). Com as claims, `set_config('request.jwt.claims', ...)`
--   + `set local role authenticated` reproduz o cliente fielmente.
CREATE OR REPLACE FUNCTION public.pode_ver_painel_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_admin()
      OR coalesce(auth.role(), '') = 'service_role'
      OR nullif(current_setting('request.jwt.claims', true), '') IS NULL;
$$;

REVOKE ALL ON FUNCTION public.pode_ver_painel_admin() FROM public;
GRANT EXECUTE ON FUNCTION public.pode_ver_painel_admin() TO anon, authenticated, service_role;

-- (SELECT ...) vira InitPlan: avaliado uma vez por consulta, não por linha.

DO $$
DECLARE d text := pg_get_viewdef('public.vw_admin_contas'::regclass, true);
BEGIN
  d := rtrim(d, E'; \n');
  d := replace(d,
    $x$WHERE u.role IS DISTINCT FROM 'admin'::text$x$,
    $x$WHERE u.role IS DISTINCT FROM 'admin'::text AND (SELECT pode_ver_painel_admin())$x$);
  IF position('pode_ver_painel_admin' in d) = 0 THEN
    RAISE EXCEPTION 'vw_admin_contas: WHERE esperado não encontrado';
  END IF;
  EXECUTE 'CREATE OR REPLACE VIEW public.vw_admin_contas AS ' || d;
END $$;

DO $$
DECLARE d text := pg_get_viewdef('public.vw_central_mensagens'::regclass, true);
BEGIN
  d := rtrim(d, E'; \n');
  -- 1º ramo (fila)
  d := replace(d,
    $x$WHERE f.estado = ANY (ARRAY['pendente'::text, 'barrada'::text, 'expirada'::text])$x$,
    $x$WHERE f.estado = ANY (ARRAY['pendente'::text, 'barrada'::text, 'expirada'::text]) AND (SELECT pode_ver_painel_admin())$x$);
  -- 2º ramo (logs) termina no LATERAL ... ON true, sem WHERE
  IF right(d, 7) <> 'ON true' THEN
    RAISE EXCEPTION 'vw_central_mensagens: final inesperado';
  END IF;
  d := d || E'\n  WHERE (SELECT pode_ver_painel_admin())';
  IF (length(d) - length(replace(d, 'pode_ver_painel_admin', ''))) / length('pode_ver_painel_admin') <> 2 THEN
    RAISE EXCEPTION 'vw_central_mensagens: guarda não entrou nos dois ramos';
  END IF;
  EXECUTE 'CREATE OR REPLACE VIEW public.vw_central_mensagens AS ' || d;
END $$;

-- Nenhuma tela lê esta view (quem usa é automação com service_role).
REVOKE ALL ON public.vw_mensalli_retencao_saas FROM anon, authenticated;

-- Views de leitura não precisam de escrita para ninguém do cliente.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.vw_admin_contas, public.vw_central_mensagens FROM anon, authenticated;
