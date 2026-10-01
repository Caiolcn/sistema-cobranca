-- ---------------------------------------------------------------------------
-- MULTIUSUÁRIO — FASE 0.2: blindar as colunas que dão acesso pago
-- ---------------------------------------------------------------------------
--
-- >> APLICADO EM PRODUÇÃO em 23/09/26, junto com a 0.1.
-- >> Migration: multiusuario_fase0_2_proteger_campos_cobranca
-- >>
-- >> Comprovação, simulando JWT real (set local role authenticated +
-- >> request.jwt.claims), tudo em transação desfeita:
-- >>
-- >>   ANTES  AUTO_UPGRADE linhas=1 plano_pago=t vencimento=2030-01-01
-- >>                       trial_fim=2030-01-01
-- >>   DEPOIS POS_FIX      linhas=1 plano_pago=f vencimento=<NULL>
-- >>                       trial_fim=<inalterado>
-- >>
-- >> Caminhos legítimos conferidos um a um depois de aplicar:
-- >>   dono editando nome_empresa/logo_url ....... passa
-- >>   /admin (is_admin) mudando vencimento ...... passa
-- >>   service_role .............................. passa
-- >>
-- >> Este arquivo fica como documentação do porquê e como rollback.
--
-- PRÉ-REQUISITO: rode sql-fix-rls-usuarios-update.sql ANTES deste arquivo.
-- Aquele derruba a policy "Trigger pode atualizar usuarios" (USING true), que
-- deixa qualquer um escrever em qualquer linha de usuarios. Este aqui fecha o
-- que sobra DEPOIS daquele fix.
--
-- O QUE SOBRA ABERTO DEPOIS DO OUTRO FIX
--
-- Com a policy frouxa fora, resta "Usuários podem atualizar próprios dados"
--   USING ((auth.uid() = id) OR is_admin())
--
-- Isso impede mexer na conta ALHEIA, mas continua permitindo a conta mexer
-- em si mesma — inclusive nas colunas que decidem se ela pagou. Pelo PostgREST:
--
--   supabase.from('usuarios').update({ plano_pago: true,
--                                      plano_vencimento: '2030-01-01' })
--                            .eq('id', <meu id>)
--
-- e o produto vira de graça. O mesmo vale para trial_fim: o gate do banco
-- (usuario_pode_enviar) aceita `trial_fim >= CURRENT_DATE`, então esticar o
-- trial para 2030 tem o mesmo efeito.
--
-- Hoje isso já é um buraco, mas o estrago é limitado: só o dono tem login.
-- A partir do multiusuário, TODA recepcionista e TODO professor ganham um
-- login dentro da conta — e a superfície desse abuso multiplica junto.
-- Por isso esta fase é bloqueante, e não "a gente faz depois".
--
-- POR QUE TRIGGER E NÃO POLICY
--
-- RLS decide por LINHA, não por coluna. Não existe "pode atualizar esta linha,
-- menos estas 4 colunas" em policy. Dá para fazer com GRANT de coluna, mas aí
-- o dono perde o UPDATE inteiro da linha e quebra Configuracao/Onboarding/Perfil.
--
-- O padrão de reverter em trigger já existe e está provado nesta mesma tabela:
-- tr_proteger_role (proteger_role_admin) faz exatamente isso com `role` desde
-- sql-admin-role.sql. Este aqui é o irmão dele para as colunas de cobrança.
--
-- QUEM CONTINUA PODENDO ESCREVER
--
--   1. is_admin()                -> o /admin (src/admin/ModalEditarConta.js é o
--                                   ÚNICO lugar do front que escreve essas
--                                   colunas; verificado em 23/09/26)
--   2. auth.role() = 'service_role' -> edge functions (mercadopago-webhook,
--                                   confirmar-assinatura-cartao, asaas-webhook,
--                                   cobranca-saas) e as RPCs SECURITY DEFINER
--                                   (ativar_assinatura_usuario,
--                                   desativar_assinatura_usuario,
--                                   fazer_upgrade_plano, definir_grace_period)
--   3. auth.uid() IS NULL        -> pg_cron e qualquer conexão sem JWT
--
-- ACOPLAMENTO COM O CADASTRO — LEIA ANTES DE APLICAR
--
-- src/Signup.js:168 faz upsert em usuarios logo depois do signUp, e o payload
-- inclui trial_fim, trial_ativo e plano_pago. Nesse momento auth.uid() = id e
-- a pessoa não é admin, então o trigger REVERTE esses três campos.
--
-- Isso NÃO quebra o cadastro, porque handle_new_user (o trigger de
-- on_auth_user_created) já gravou os mesmos valores um instante antes:
--   trial_fim   = NOW() + 3 days   (Signup manda o mesmo + alguns ms)
--   trial_ativo = true             (idêntico)
--   plano_pago  = false            (idêntico)
-- Reverter para OLD devolve exatamente o que já estava lá.
--
-- >> MESMO ASSIM, limpe o Signup.js depois de aplicar isto: deixar o front
-- >> mandando campo que o banco descarta em silêncio é pegadinha para o
-- >> próximo que mexer. Tire trial_fim, trial_ativo e plano_pago do upsert —
-- >> handle_new_user é a fonte de verdade deles.
--
-- `plano` e `limite_mensal` ficam de FORA da proteção de propósito: o Signup
-- os escreve com o plano escolhido na tela, e handle_new_user só acerta o
-- valor quando o raw_user_meta_data veio preenchido. Proteger os dois aqui
-- quebraria a escolha de plano no cadastro. Eles também não dão acesso pago
-- sozinhos — quem manda no gate do servidor (usuario_pode_enviar) são as
-- quatro colunas abaixo. `plano` solto libera feature na UI via hasFeature(),
-- que é gate de cliente e nunca foi barreira de verdade.
-- ---------------------------------------------------------------------------


-- ANTES: confirme que o outro fix já rodou. Tem de sobrar UMA linha só,
-- a restrita. Se ainda aparecer "Trigger pode atualizar usuarios", PARE e
-- rode sql-fix-rls-usuarios-update.sql primeiro.
SELECT policyname, qual::text
  FROM pg_policies
 WHERE schemaname = 'public' AND tablename = 'usuarios' AND cmd = 'UPDATE';


-- ---------------------------------------------------------------------------
-- O FIX
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.proteger_campos_cobranca()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_autorizado boolean;
BEGIN
  -- service_role e conexões sem JWT (pg_cron) são o caminho legítimo das
  -- edge functions e das RPCs de assinatura. is_admin() é o /admin.
  v_autorizado := (auth.uid() IS NULL)
               OR (auth.role() = 'service_role')
               OR is_admin();

  IF v_autorizado THEN
    RETURN NEW;
  END IF;

  -- Não é erro: reverte em silêncio, igual proteger_role_admin. Levantar
  -- exceção aqui derrubaria o upsert do cadastro, que manda esses campos
  -- sem querer mudar nada.
  NEW.plano_pago       := OLD.plano_pago;
  NEW.plano_vencimento := OLD.plano_vencimento;
  NEW.virou_pagante_em := OLD.virou_pagante_em;
  NEW.cancelado_em     := OLD.cancelado_em;
  NEW.trial_fim        := OLD.trial_fim;
  NEW.trial_ativo      := OLD.trial_ativo;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS tr_proteger_campos_cobranca ON public.usuarios;

-- BEFORE UPDATE e antes do sync do mensallizap: os triggers de sync são
-- AFTER, então já enxergam o valor revertido.
CREATE TRIGGER tr_proteger_campos_cobranca
  BEFORE UPDATE ON public.usuarios
  FOR EACH ROW
  EXECUTE FUNCTION public.proteger_campos_cobranca();


-- ---------------------------------------------------------------------------
-- TESTE (rode logado como uma conta comum, NÃO admin, pelo app)
-- ---------------------------------------------------------------------------
-- No console do navegador, com uma conta de teste:
--
--   await supabase.from('usuarios')
--     .update({ plano_pago: true, plano_vencimento: '2030-01-01' })
--     .eq('id', (await supabase.auth.getUser()).data.user.id)
--     .select('plano_pago, plano_vencimento')
--
-- ESPERADO: a chamada retorna sucesso (a linha existe e a policy passa), mas
-- os valores devolvidos são os ANTIGOS. Se voltar plano_pago: true, o trigger
-- não está ativo.
--
-- E confirme que o caminho legítimo continua de pé:
--   - /admin -> Contas -> editar uma conta -> mudar vencimento -> salvar
--   - um pagamento de teste no Mercado Pago ativando a assinatura
-- ---------------------------------------------------------------------------


-- ---------------------------------------------------------------------------
-- ROLLBACK (reabre o auto-upgrade)
-- ---------------------------------------------------------------------------
-- DROP TRIGGER IF EXISTS tr_proteger_campos_cobranca ON public.usuarios;
-- ---------------------------------------------------------------------------
