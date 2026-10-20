-- =====================================================================
-- Segurança das views — 19/19: vw_radar_evasao
-- =====================================================================
-- Problema: roda como `postgres` (ignora RLS), sem filtro de dono, liberada pro
-- papel `authenticated`. Qualquer cliente logado lia o Radar de Evasão de TODAS as contas
-- (aluno, dias sem aparecer, dias de atraso, score). O app filtra por user_id,
-- mas quem chamasse a API direto sem filtro via tudo.
--
-- Correção: cada conta passa a ver só as próprias linhas (user_id = auth.uid()).
-- Admin (inclusive "vendo como" outra conta), service_role e SQL Editor
-- continuam vendo tudo via pode_ver_painel_admin(). Definição original embrulhada sem alteração.
--
-- Quem usa: USADA POR CLIENTES NO APP (34 contas nas últimas 24h): aba Radar
-- (RadarEvasao.js), card da Home e sino de notificações — os três já filtram
-- .eq('user_id', userId), que é exatamente o que a trava libera. Também é lida
-- por dentro da vw_resumo_diario_completo (n8n, service_role).
--
-- CHECAR LOGO DEPOIS DE APLICAR:
--   1. Logado numa conta de cliente, a aba Radar (Alunos → Radar) continua
--      listando os alunos em risco e o card da Home mostra o mesmo número.
--   2. Logado como admin, "vendo como" uma conta, o Radar dela aparece.
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
--   EXECUTE format('CREATE OR REPLACE VIEW public.vw_radar_evasao AS %s',
--     (SELECT definicao FROM seguranca_backup.views_originais
--       WHERE view_name = 'vw_radar_evasao' ORDER BY salvo_em DESC LIMIT 1));
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
  def text := pg_get_viewdef('public.vw_radar_evasao'::regclass);
BEGIN
  IF def ILIKE '%pode_ver_painel_admin%' THEN
    RAISE NOTICE 'vw_radar_evasao já tem a trava — nada a fazer';
    RETURN;
  END IF;

  INSERT INTO seguranca_backup.views_originais (view_name, definicao)
  VALUES ('vw_radar_evasao', def);

  EXECUTE format(
    'CREATE OR REPLACE VIEW public.vw_radar_evasao AS SELECT base.* FROM (%s) base WHERE (base.user_id = (SELECT auth.uid()) OR (SELECT public.pode_ver_painel_admin()))',
    rtrim(btrim(def), ';')
  );
END $$;

-- Conferência: no SQL Editor (sem JWT) a trava libera, então a contagem
-- continua a de antes; trava_aplicada e backup_salvo têm que vir true.
SELECT
  (SELECT count(*) FROM public.vw_radar_evasao) AS linhas_visiveis_no_editor,
  pg_get_viewdef('public.vw_radar_evasao'::regclass) ILIKE '%pode_ver_painel_admin%' AS trava_aplicada,
  EXISTS (SELECT 1 FROM seguranca_backup.views_originais WHERE view_name = 'vw_radar_evasao') AS backup_salvo;
