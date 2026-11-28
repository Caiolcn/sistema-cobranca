-- Alerta do Supabase "auth_users_exposed" (critical) na vw_admin_contas — 24/11/2026
-- ---------------------------------------------------------------------------
-- A view já tem a trava pode_ver_painel_admin(): quem não é admin recebe 0
-- linhas e o anon nem tem permissão. Na prática nada vazava. O alerta dispara
-- porque a view LÊ auth.users e auth.sessions (para "último acesso") e está
-- liberada ao role authenticated — o verificador do Supabase não enxerga a trava.
--
-- Correção: a leitura de auth.* sai da view e vai para uma função travada
-- (admin_acessos_auth). A view continua com as mesmas colunas e o mesmo
-- resultado; o painel admin não muda nada.
--
-- Rode tudo de uma vez no SQL Editor.

-- 1) Função que entrega só o necessário de auth.* (último acesso por conta),
--    ignorando logins feitos via "entrar como" (impersonation) do admin.
CREATE OR REPLACE FUNCTION public.admin_acessos_auth()
RETURNS TABLE (user_id uuid, ultima_sessao timestamptz, last_sign_in_at timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  WITH imp AS (
    SELECT (la.valor_novo)::uuid AS alvo, la.created_at
      FROM public.log_auditoria la
     WHERE la.acao = 'impersonation_usada'
       AND la.valor_novo ~ '^[0-9a-f-]{36}$'
  ), acesso AS (
    SELECT s.user_id,
           max(GREATEST(s.created_at, s.updated_at, (s.refreshed_at AT TIME ZONE 'UTC'))) AS ultimo
      FROM auth.sessions s
     WHERE NOT EXISTS (SELECT 1 FROM imp
                        WHERE imp.alvo = s.user_id
                          AND s.created_at BETWEEN imp.created_at - interval '1 minute'
                                               AND imp.created_at + interval '1 minute')
     GROUP BY s.user_id
  )
  SELECT au.id,
         acesso.ultimo,
         CASE WHEN EXISTS (SELECT 1 FROM imp
                            WHERE imp.alvo = au.id
                              AND au.last_sign_in_at BETWEEN imp.created_at - interval '1 minute'
                                                         AND imp.created_at + interval '1 minute')
              THEN NULL ELSE au.last_sign_in_at END
    FROM auth.users au
    LEFT JOIN acesso ON acesso.user_id = au.id
   WHERE public.pode_ver_painel_admin();
$$;

REVOKE ALL ON FUNCTION public.admin_acessos_auth() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_acessos_auth() TO authenticated, service_role;

-- 2) Troca os CTEs "acesso" e "login" da view (que liam auth.*) pela função.
--    Mantém todo o resto da definição atual intacto.
DO $$
DECLARE
  d   text := pg_get_viewdef('public.vw_admin_contas'::regclass);
  ini int  := strpos(d, 'acesso AS (');
  fim int  := strpos(d, 'acoes AS (');
BEGIN
  IF ini = 0 OR fim = 0 OR fim < ini THEN
    RAISE EXCEPTION 'Não achei os trechos acesso/acoes na view — nada foi alterado.';
  END IF;

  d := substr(d, 1, ini - 1)
    || 'acesso AS (SELECT a.user_id, a.ultima_sessao AS ultimo FROM public.admin_acessos_auth() a WHERE a.ultima_sessao IS NOT NULL), '
    || 'login AS (SELECT a.user_id, a.last_sign_in_at FROM public.admin_acessos_auth() a), '
    || substr(d, fim);

  IF d ~* 'auth\.(users|sessions)' THEN
    RAISE EXCEPTION 'A view ainda cita auth.users/auth.sessions — nada foi alterado.';
  END IF;

  EXECUTE 'CREATE OR REPLACE VIEW public.vw_admin_contas AS ' || d;
END $$;

-- 3) Conferência: deve voltar 0 (nenhuma view pública dependendo de auth.users)
SELECT count(*) AS views_que_ainda_leem_auth_users
  FROM pg_depend dep
  JOIN pg_rewrite r ON r.oid = dep.objid
  JOIN pg_class v   ON v.oid = r.ev_class
  JOIN pg_namespace n ON n.oid = v.relnamespace
 WHERE dep.refobjid = 'auth.users'::regclass
   AND n.nspname = 'public';
