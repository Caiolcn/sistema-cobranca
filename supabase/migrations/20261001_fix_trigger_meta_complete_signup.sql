-- Fix: corrigir sintaxe ON CONFLICT DO NOTHING em trigger_meta_complete_signup
-- Problema: ON CONFLICT DO NOTHING é sintaxe inválida
-- Solução: ON CONFLICT (event_id) DO NOTHING

CREATE OR REPLACE FUNCTION public.trigger_meta_complete_signup()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_event_id text;
BEGIN
  v_event_id := 'signup_' || NEW.id || '_' || to_char(now(), 'YYYYMMDDHHMMSS');
  INSERT INTO meta_capi_eventos (user_id, event_id, event_name, origem)
  VALUES (NEW.id, v_event_id, 'CompleteSignup', 'trigger')
  ON CONFLICT (event_id) DO NOTHING;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE LOG 'trigger_meta_complete_signup erro: % (%)', SQLERRM, SQLSTATE;
  RETURN NEW;
END;
$function$;
