-- ============================================================================
-- Modal de atualizações: "dispensei o aviso" separado de "li esta novidade"
-- ============================================================================
--
-- O pop-up de novidades era destravado à mão: só abria se alguém marcasse a
-- novidade como `destaque` no /admin. Trabalho manual toda semana, e fácil de
-- esquecer — publicava-se a leva e ninguém era avisado.
--
-- A regra passa a ser automática: publicou novidade, o pop-up abre uma vez pra
-- todo mundo; quem fechou não vê de novo até a PRÓXIMA publicação.
--
-- Isso exige guardar QUANDO a pessoa fechou o aviso — que é uma pergunta
-- diferente de "quais novidades ela leu" (`novidades_lidas`). Fossem a mesma
-- coisa, fechar o pop-up marcaria como lida uma novidade que a pessoa nunca
-- abriu, e o selo "novo pra você" da barra da Home morreria junto.
--
-- NULL = nunca dispensou. É o estado de toda conta hoje, e o de qualquer conta
-- nova: o pop-up abre no primeiro acesso e se resolve sozinho a partir daí.
--
-- Reversível: alter table usuarios drop column novidades_dispensadas_em;
-- ============================================================================

alter table usuarios
  add column if not exists novidades_dispensadas_em timestamptz;

comment on column usuarios.novidades_dispensadas_em is
  'Quando a pessoa fechou o modal de atualizacoes pela ultima vez. O pop-up so '
  'reabre se existir novidade com publicado_em posterior a esta marca. '
  'NULL = nunca dispensou.';

-- Sem policy nova: `usuarios` já tem UPDATE liberado pro próprio dono
-- ("Usuários podem atualizar próprios dados", auth.uid() = id), que é
-- exatamente quem grava esta coluna.
