-- Trigger de criação da conta no signup.
--
-- Problema que isso resolve: o Signup.js criava a linha de `usuarios` pelo
-- CLIENTE, depois do supabase.auth.signUp(). Se qualquer coisa falhasse entre
-- os dois passos (rede, RLS, aba fechada), sobrava um auth.users sem linha em
-- `usuarios` — conta zumbi: a pessoa não consegue usar o app nem recadastrar
-- (o email já está "registrado"). Foram 7 casos, 2 deles leads reais.
--
-- Agora a linha nasce no banco, na mesma transação do signup. O upsert do
-- cliente continua existindo (enriquece com telefone/plano) e é idempotente.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_plano text;
  v_limite integer;
BEGIN
  -- Plano vindo do metadata do signup; 'pro' é o default do trial
  v_plano := COALESCE(NEW.raw_user_meta_data->>'plano', 'pro');
  v_limite := CASE v_plano
    WHEN 'starter' THEN 200
    WHEN 'pro'     THEN 600
    WHEN 'premium' THEN 3000
    ELSE 600
  END;

  INSERT INTO public.usuarios (
    id, email, nome_completo, telefone, plano, limite_mensal,
    trial_fim, trial_ativo, plano_pago, status_conta
  ) VALUES (
    NEW.id,
    NEW.email,
    NULLIF(NEW.raw_user_meta_data->>'nome_completo', ''),
    NULLIF(regexp_replace(COALESCE(NEW.raw_user_meta_data->>'telefone', ''), '[^0-9]', '', 'g'), ''),
    v_plano,
    v_limite,
    NOW() + INTERVAL '3 days',
    true,
    false,
    'ativo'
  )
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.controle_planos (
    user_id, plano, limite_mensal, usage_count, mes_referencia, status
  ) VALUES (
    NEW.id, v_plano, v_limite, 0, to_char(NOW(), 'YYYY-MM'), 'ativo'
  )
  ON CONFLICT (user_id) DO NOTHING;

  INSERT INTO public.configuracoes_cobranca (
    user_id, enviar_no_dia, enviar_3_dias_antes, enviar_3_dias_depois
  ) VALUES (
    NEW.id, true, true, true
  )
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Nunca bloqueia o signup: pior caso volta ao comportamento antigo,
  -- em que o cliente cria a linha.
  RAISE WARNING 'handle_new_user falhou para %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Backfill das contas órfãs já existentes.
-- Trial novo de 3 dias (contado de agora): essas pessoas se cadastraram e nunca
-- chegaram a receber o teste que foi prometido.
--
-- ATENÇÃO: o backfill é restrito às órfãs (auth.users sem linha em `usuarios`).
-- NÃO criar configuracoes_cobranca em massa: 7 contas ativas hoje não têm essa
-- linha, e criá-la com enviar_* = true LIGARIA cobrança automática pra quem
-- está deliberadamente sem. O gate das automações vive nas views.
WITH orfas AS (
  SELECT a.id, a.email, a.raw_user_meta_data, a.created_at
  FROM auth.users a
  LEFT JOIN public.usuarios u ON u.id = a.id
  WHERE u.id IS NULL
), ins_u AS (
  INSERT INTO public.usuarios (
    id, email, nome_completo, plano, limite_mensal,
    trial_fim, trial_ativo, plano_pago, status_conta, created_at
  )
  SELECT o.id, o.email,
         NULLIF(o.raw_user_meta_data->>'nome_completo', ''),
         COALESCE(o.raw_user_meta_data->>'plano', 'pro'), 600,
         NOW() + INTERVAL '3 days', true, false, 'ativo', o.created_at
  FROM orfas o
  ON CONFLICT (id) DO NOTHING
  RETURNING id
), ins_c AS (
  INSERT INTO public.controle_planos (user_id, plano, limite_mensal, usage_count, mes_referencia, status)
  SELECT id, 'pro', 600, 0, to_char(NOW(), 'YYYY-MM'), 'ativo' FROM ins_u
  ON CONFLICT (user_id) DO NOTHING
  RETURNING user_id
)
INSERT INTO public.configuracoes_cobranca (user_id, enviar_no_dia, enviar_3_dias_antes, enviar_3_dias_depois)
SELECT user_id, true, true, true FROM ins_c
ON CONFLICT (user_id) DO NOTHING;
