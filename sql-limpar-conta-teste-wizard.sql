-- Apaga uma conta de teste inteira. Trocar o email na linha do SELECT.
-- Rodar o arquivo inteiro; é idempotente e não toca em mais nada.
--
-- A maioria das tabelas tem FK pra auth.users com ON DELETE CASCADE, então sai
-- sozinha no DELETE final. O que está listado abaixo é justamente o que NÃO
-- cascateia e faria o delete estourar 23503:
--   - FKs NO ACTION a partir de auth.users (cobrancas_avulsas, presencas,
--     retencao_saas_envios, mensalli_cobranca_saas_config.updated_by)
--   - FKs que apontam pra public.usuarios (admin_impersonation_tokens, avisos,
--     logs_conexao, mensalli_leads, planos)
--   - logs_mensagens, que não tem FK declarada pra nenhum dos dois
--
-- Conferir se a lista mudou:
--   select c.relname, a.attname, con.confdeltype from pg_constraint con
--   join pg_class c on c.oid=con.conrelid
--   join pg_attribute a on a.attrelid=c.oid and a.attnum=any(con.conkey)
--   where con.contype='f' and con.confrelid in ('public.usuarios'::regclass, 'auth.users'::regclass);
--   (confdeltype 'c' = cascade, 'a' = no action → só o 'a' precisa entrar aqui)
--
-- ATENÇÃO: se a conta chegou a gerar QR Code, também existe uma instância na
-- Evolution. Ela NÃO sai por SQL. Pegar o nome antes de apagar a conta:
--   select instance_name from mensallizap where user_id = '<id>';
-- e remover com DELETE {EVOLUTION_URL}/instance/delete/{instance_name}
-- (ver a rotina de limpeza de instâncias órfãs).

DO $$
DECLARE
  v_id uuid;
BEGIN
  SELECT id INTO v_id FROM auth.users WHERE email = 'teste.wizard@mensalli.com.br';
  IF v_id IS NULL THEN
    RAISE NOTICE 'Conta de teste não encontrada — nada a fazer.';
    RETURN;
  END IF;

  -- FKs NO ACTION a partir de auth.users
  DELETE FROM public.cobrancas_avulsas    WHERE user_id = v_id;
  DELETE FROM public.presencas            WHERE user_id = v_id;
  DELETE FROM public.retencao_saas_envios WHERE usuario_id = v_id OR enviado_por = v_id;
  UPDATE public.mensalli_cobranca_saas_config SET updated_by = NULL WHERE updated_by = v_id;

  -- FKs que apontam pra public.usuarios
  DELETE FROM public.admin_impersonation_tokens WHERE target_user_id = v_id OR admin_user_id = v_id;
  DELETE FROM public.avisos         WHERE user_id = v_id;
  DELETE FROM public.logs_conexao   WHERE user_id = v_id;
  DELETE FROM public.mensalli_leads WHERE usuario_id = v_id;
  DELETE FROM public.planos         WHERE user_id = v_id;

  -- Sem FK declarada: não sai por cascade
  DELETE FROM public.logs_mensagens WHERE user_id = v_id;

  -- Filhos antes dos pais no que sobrou explícito
  DELETE FROM public.mensalidades   WHERE user_id = v_id;
  DELETE FROM public.devedores      WHERE user_id = v_id;
  DELETE FROM public.usuarios       WHERE id      = v_id;
  DELETE FROM auth.users            WHERE id      = v_id;

  RAISE NOTICE 'Conta de teste % removida.', v_id;
END $$;
