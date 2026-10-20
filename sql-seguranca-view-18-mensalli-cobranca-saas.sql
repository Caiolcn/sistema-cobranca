-- =====================================================================
-- Segurança das views — 18/19: vw_mensalli_cobranca_saas
-- =====================================================================
-- Problema: roda como `postgres` (ignora RLS), sem filtro de dono, liberada pro
-- papel `authenticated`. Qualquer cliente logado lia a cobrança da assinatura Mensalli de
-- TODAS as contas (empresa, telefone, plano, valor, vencimento).
--
-- Correção: mesma trava das views anteriores (pode_ver_painel_admin()).
-- Cliente logado passa a receber 0 linhas; admin, service_role e SQL Editor
-- continuam vendo tudo. Definição original embrulhada sem alteração.
--
-- Quem usa: painel admin (/admin → Cobrança SaaS, AdminCobrancaSaas.js) com o
-- login de admin → is_admin() libera; edge functions cobranca-saas e
-- conciliar-cartao-mp com SUPABASE_SERVICE_ROLE_KEY → passam na trava.
--
-- CHECAR: logado como admin, a aba Cobrança SaaS do /admin continua
-- listando as contas.
--
-- Backup: antes de trocar, a definição viva é salva em
-- seguranca_backup.views_originais (schema fora da API, sem acesso de
-- anon/authenticated). Por isso não há cópia da definição neste arquivo.
-- =====================================================================

-- ---------------------------------------------------------------------
-- ROLLBACK (só se precisar voltar): rode o bloco abaixo sem os "--".
-- ---------------------------------------------------------------------
-- DO $$
-- BEGIN
--   EXECUTE format('CREATE OR REPLACE VIEW public.vw_mensalli_cobranca_saas AS %s',
--     (SELECT definicao FROM seguranca_backup.views_originais
--       WHERE view_name = 'vw_mensalli_cobranca_saas' ORDER BY salvo_em DESC LIMIT 1));
-- END $$;

-- =====================================================================
-- APLICAR
-- =====================================================================

CREATE SCHEMA IF NOT EXISTS seguranca_backup;
REVOKE ALL ON SCHEMA seguranca_backup FROM PUBLIC, anon, authenticated;
CREATE TABLE IF NOT EXISTS seguranca_backup.views_originais (
  view_name text NOT NULL,
  definicao text NOT NULL,
  salvo_em  timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE seguranca_backup.views_originais ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON seguranca_backup.views_originais FROM PUBLIC, anon, authenticated;

DO $$
DECLARE
  def text := pg_get_viewdef('public.vw_mensalli_cobranca_saas'::regclass);
BEGIN
  IF def ILIKE '%pode_ver_painel_admin%' THEN
    RAISE NOTICE 'vw_mensalli_cobranca_saas já tem a trava — nada a fazer';
    RETURN;
  END IF;

  INSERT INTO seguranca_backup.views_originais (view_name, definicao)
  VALUES ('vw_mensalli_cobranca_saas', def);

  EXECUTE format(
    'CREATE OR REPLACE VIEW public.vw_mensalli_cobranca_saas AS SELECT base.* FROM (%s) base WHERE (SELECT public.pode_ver_painel_admin())',
    rtrim(btrim(def), ';')
  );
END $$;

-- Conferência: no SQL Editor (sem JWT) a trava libera, então a contagem
-- continua a de antes; trava_aplicada e backup_salvo têm que vir true.
SELECT
  (SELECT count(*) FROM public.vw_mensalli_cobranca_saas) AS linhas_visiveis_no_editor,
  pg_get_viewdef('public.vw_mensalli_cobranca_saas'::regclass) ILIKE '%pode_ver_painel_admin%' AS trava_aplicada,
  EXISTS (SELECT 1 FROM seguranca_backup.views_originais WHERE view_name = 'vw_mensalli_cobranca_saas') AS backup_salvo;
