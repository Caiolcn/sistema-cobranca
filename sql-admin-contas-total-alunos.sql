-- ============================================================
-- vw_admin_contas: coluna total_alunos (aplicado em producao 01/10/2026)
--
-- A coluna "Alunos" da aba Contas contava no front com
-- supabase.from('devedores').select('user_id'): o PostgREST corta em 1000
-- linhas (a base tem 4k+) e o select nao filtrava lixo. A contagem veio pro
-- banco, ignorando aluno excluido (lixo).
--
-- Injeta a coluna no FIM da definicao atual (CREATE OR REPLACE so aceita
-- coluna nova no final) -- sem retranscrever a view inteira.
-- ============================================================
do $$
declare d text; n text;
begin
  d := rtrim(pg_get_viewdef('vw_admin_contas'::regclass, true), E'; \n');
  n := replace(d, E'acoes.acao AS ultima_acao\n   FROM usuarios u',
    E'acoes.acao AS ultima_acao,\n    ( SELECT count(*) FROM devedores dv WHERE dv.user_id = u.id AND COALESCE(dv.lixo, false) = false) AS total_alunos\n   FROM usuarios u');
  if n = d then raise exception 'ponto de injecao nao encontrado'; end if;
  execute 'create or replace view vw_admin_contas as ' || n;
end $$;
