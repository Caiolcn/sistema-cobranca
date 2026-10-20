-- =====================================================================
-- Segurança das views — 06/19: vw_contratos_enviados
-- =====================================================================
-- Problema: roda como `postgres` (ignora RLS), sem filtro de dono, liberada pro
-- papel `authenticated`. Qualquer cliente logado lia os contratos enviados de TODAS as contas:
-- aluno, telefone, título, status, quem assinou e o link_token (link de assinatura).
--
-- Correção: mesma trava das views anteriores (pode_ver_painel_admin()).
-- Cliente logado passa a receber 0 linhas; admin, service_role e SQL Editor
-- continuam vendo tudo. Definição original embrulhada sem alteração.
--
-- Quem usa: ninguém hoje — a ficha do aluno lê a tabela contratos_enviados direto
-- (ContratosSection.js). Não está no n8n, edge functions nem em funções do banco.
-- =====================================================================

-- ---------------------------------------------------------------------
-- ROLLBACK (só se precisar voltar): rode o bloco abaixo sem os "--".
-- ---------------------------------------------------------------------
-- CREATE OR REPLACE VIEW public.vw_contratos_enviados AS
--  SELECT c.id,
--     c.user_id,
--     c.devedor_id,
--     c.template_id,
--     c.titulo,
--     c.link_token,
--     c.status,
--     c.assinatura_nome,
--     c.assinado_em,
--     c.created_at,
--     d.nome AS devedor_nome,
--     d.telefone AS devedor_telefone
--    FROM contratos_enviados c
--      JOIN devedores d ON d.id = c.devedor_id
--   ORDER BY c.created_at DESC;

-- =====================================================================
-- APLICAR
-- =====================================================================

DO $$
DECLARE
  def text := pg_get_viewdef('public.vw_contratos_enviados'::regclass);
BEGIN
  IF def ILIKE '%pode_ver_painel_admin%' THEN
    RAISE NOTICE 'vw_contratos_enviados já tem a trava — nada a fazer';
    RETURN;
  END IF;

  EXECUTE format(
    'CREATE OR REPLACE VIEW public.vw_contratos_enviados AS SELECT base.* FROM (%s) base WHERE (SELECT public.pode_ver_painel_admin())',
    rtrim(btrim(def), ';')
  );
END $$;

-- Conferência: no SQL Editor (sem JWT) a trava libera, então a contagem
-- continua a de antes; trava_aplicada tem que vir true.
SELECT
  (SELECT count(*) FROM public.vw_contratos_enviados) AS linhas_visiveis_no_editor,
  pg_get_viewdef('public.vw_contratos_enviados'::regclass) ILIKE '%pode_ver_painel_admin%' AS trava_aplicada;
