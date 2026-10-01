-- Fix: adicionar campos NOT NULL ao trigger handle_new_user
-- Problema: asaas_formas_pagamento e landing_cta_final_destino são NOT NULL
-- mas o trigger não estava passando, causando "Database error saving new user"

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_plano text;
  v_limite integer;
BEGIN
  v_plano := COALESCE(NEW.raw_user_meta_data->>'plano', 'pro');
  v_limite := CASE v_plano WHEN 'starter' THEN 200 WHEN 'pro' THEN 600 WHEN 'premium' THEN 3000 ELSE 600 END;

  INSERT INTO public.usuarios (id, email, nome_completo, telefone, plano, limite_mensal, trial_fim, trial_ativo, plano_pago, status_conta, nome_empresa, asaas_formas_pagamento, landing_cta_final_destino)
  VALUES (
    NEW.id,
    NEW.email,
    NULLIF(NEW.raw_user_meta_data->>'nome_completo', ''),
    NULLIF(regexp_replace(COALESCE(NEW.raw_user_meta_data->>'telefone', ''), '[^0-9]', '', 'g'), ''),
    v_plano, v_limite, NOW() + INTERVAL '3 days', true, false, 'ativo', 'Minha Empresa', '{"pix": true, "boleto": false, "cartao": false}'::jsonb, 'whatsapp'
  )
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.controle_planos (user_id, plano, limite_mensal, usage_count, mes_referencia, status)
  VALUES (NEW.id, v_plano, v_limite, 0, to_char(NOW(), 'YYYY-MM'), 'ativo')
  ON CONFLICT (user_id) DO NOTHING;

  INSERT INTO public.configuracoes_cobranca (user_id, enviar_no_dia, enviar_3_dias_antes, enviar_3_dias_depois)
  VALUES (NEW.id, true, true, true)
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'handle_new_user falhou para %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$function$;
