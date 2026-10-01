-- Meta CAPI Setup: Tabelas, Triggers e Funções
-- Execute no Supabase SQL Editor

-- Tabela de atribuição: fbp/fbc do navegador
CREATE TABLE IF NOT EXISTS meta_atribuicao (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES usuarios(id) ON DELETE CASCADE,
  fbp text,
  fbc text,
  user_agent text,
  landing_url text,
  criado_em timestamp DEFAULT now()
);

-- Tabela de auditoria: eventos enviados pro Meta
CREATE TABLE IF NOT EXISTS meta_capi_eventos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  event_id text NOT NULL UNIQUE,
  event_name text NOT NULL,
  valor numeric(10, 2),
  origem text DEFAULT 'front',
  resposta jsonb,
  enviado_em timestamp DEFAULT now()
);

CREATE INDEX idx_meta_capi_eventos_user_id ON meta_capi_eventos(user_id);
CREATE INDEX idx_meta_capi_eventos_event_name ON meta_capi_eventos(event_name);

-- Tabela de fila de retry
CREATE TABLE IF NOT EXISTS meta_capi_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id text NOT NULL UNIQUE REFERENCES meta_capi_eventos(event_id),
  tentativas int DEFAULT 0,
  proxima_tentativa timestamp,
  erro text,
  criado_em timestamp DEFAULT now()
);

-- Trigger: CompleteSignup quando cria conta
CREATE OR REPLACE FUNCTION trigger_meta_complete_signup()
RETURNS TRIGGER AS $$
DECLARE
  v_event_id text;
BEGIN
  v_event_id := 'signup_' || NEW.id || '_' || to_char(now(), 'YYYYMMDDHHMMSS');
  INSERT INTO meta_capi_eventos (user_id, event_id, event_name, origem)
  VALUES (NEW.id, v_event_id, 'CompleteSignup', 'trigger')
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created_meta ON auth.users;
CREATE TRIGGER on_auth_user_created_meta
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION trigger_meta_complete_signup();

-- Trigger: AtivouWhatsApp quando conecta
CREATE OR REPLACE FUNCTION trigger_meta_ativou_whatsapp()
RETURNS TRIGGER AS $$
DECLARE
  v_event_id text;
BEGIN
  IF NEW.state = 'open' AND (OLD.state IS NULL OR OLD.state != 'open') THEN
    v_event_id := 'whatsapp_' || NEW.account_id || '_' || to_char(now(), 'YYYYMMDDHHMMSS');
    INSERT INTO meta_capi_eventos (user_id, event_id, event_name, origem)
    SELECT c.user_id, v_event_id, 'AtivouWhatsApp', 'trigger'
    FROM contas c WHERE c.id = NEW.account_id
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_conexao_whatsapp_meta ON logs_conexao;
CREATE TRIGGER on_conexao_whatsapp_meta
  AFTER INSERT ON logs_conexao
  FOR EACH ROW
  EXECUTE FUNCTION trigger_meta_ativou_whatsapp();

-- Função auxiliar: registrar primeira cobrança
CREATE OR REPLACE FUNCTION registrar_primeira_cobranca_meta(p_account_id uuid, p_valor numeric)
RETURNS void AS $$
DECLARE
  v_event_id text;
BEGIN
  v_event_id := 'purchase_' || p_account_id || '_' || to_char(now(), 'YYYYMMDDHHMMSS');
  INSERT INTO meta_capi_eventos (user_id, event_id, event_name, valor, origem)
  SELECT c.user_id, v_event_id, 'Purchase', p_valor, 'trigger'
  FROM contas c WHERE c.id = p_account_id
  ON CONFLICT DO NOTHING;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Função RPC: salvar atribuição do front
CREATE OR REPLACE FUNCTION rpc_salvar_atribuicao_meta(
  p_user_id uuid,
  p_fbp text,
  p_fbc text,
  p_user_agent text,
  p_landing_url text
)
RETURNS jsonb AS $$
BEGIN
  INSERT INTO meta_atribuicao (user_id, fbp, fbc, user_agent, landing_url)
  VALUES (p_user_id, p_fbp, p_fbc, p_user_agent, p_landing_url)
  ON CONFLICT (user_id) DO UPDATE SET
    fbp = COALESCE(EXCLUDED.fbp, meta_atribuicao.fbp),
    fbc = COALESCE(EXCLUDED.fbc, meta_atribuicao.fbc),
    user_agent = COALESCE(EXCLUDED.user_agent, meta_atribuicao.user_agent),
    landing_url = COALESCE(EXCLUDED.landing_url, meta_atribuicao.landing_url);
  RETURN jsonb_build_object('ok', true, 'guardado', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;