-- =====================================================================
-- Segurança das views — 15/19: vw_aniversariantes_do_dia
-- =====================================================================
-- Problema: roda como `postgres` (ignora RLS), sem filtro de dono, liberada pro
-- papel `authenticated`. Qualquer cliente logado lia os aniversariantes do dia de TODAS as
-- contas (nome, telefone, data de nascimento) e a `evolution_api_key` global.
--
-- Correção: mesma trava das views anteriores (pode_ver_painel_admin()).
-- Cliente logado passa a receber 0 linhas; admin, service_role e SQL Editor
-- continuam vendo tudo. Definição original embrulhada sem alteração.
--
-- Quem usa: n8n (agente-aniversario) com a chave secreta → passa na trava. Nenhuma
-- tela do app, edge function nem função do banco usa.
--
-- CHECAR: no próximo dia com aniversariante, a mensagem sai normalmente
-- (devedores.enviado_aniversario_em atualizado).
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
--   EXECUTE format('CREATE OR REPLACE VIEW public.vw_aniversariantes_do_dia AS %s',
--     (SELECT definicao FROM seguranca_backup.views_originais
--       WHERE view_name = 'vw_aniversariantes_do_dia' ORDER BY salvo_em DESC LIMIT 1));
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
  def text := pg_get_viewdef('public.vw_aniversariantes_do_dia'::regclass);
BEGIN
  IF def ILIKE '%pode_ver_painel_admin%' THEN
    RAISE NOTICE 'vw_aniversariantes_do_dia já tem a trava — nada a fazer';
    RETURN;
  END IF;

  INSERT INTO seguranca_backup.views_originais (view_name, definicao)
  VALUES ('vw_aniversariantes_do_dia', def);

  EXECUTE format(
    'CREATE OR REPLACE VIEW public.vw_aniversariantes_do_dia AS SELECT base.* FROM (%s) base WHERE (SELECT public.pode_ver_painel_admin())',
    rtrim(btrim(def), ';')
  );
END $$;

-- Conferência: no SQL Editor (sem JWT) a trava libera, então a contagem
-- continua a de antes; trava_aplicada e backup_salvo têm que vir true.
SELECT
  (SELECT count(*) FROM public.vw_aniversariantes_do_dia) AS linhas_visiveis_no_editor,
  pg_get_viewdef('public.vw_aniversariantes_do_dia'::regclass) ILIKE '%pode_ver_painel_admin%' AS trava_aplicada,
  EXISTS (SELECT 1 FROM seguranca_backup.views_originais WHERE view_name = 'vw_aniversariantes_do_dia') AS backup_salvo;
