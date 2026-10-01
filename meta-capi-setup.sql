-- ============================================
-- SETUP META CAPI: Checklist de Implementação
-- ============================================
-- Este arquivo reúne TUDO o que falta pra fechar o funil Meta.
-- Execute em partes conforme faz cada etapa.

-- ============================================
-- ETAPA 1: Criar Tabelas (se não existirem)
-- ============================================

-- Tabela de atribuição: armazena fbp/fbc do navegador quando pessoa clica em anúncio
-- fbp = Facebook Pixel ID (cookie do navegador)
-- fbc = Facebook Click ID (parâmetro ?fbclid=... na URL)
CREATE TABLE IF NOT EXISTS meta_atribuicao (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES usuarios(id) ON DELETE CASCADE,
  fbp text,                    -- Facebook Pixel ID
  fbc text,                    -- Facebook Click ID
  user_agent text,             -- navegador da pessoa
  landing_url text,            -- página onde clicou
  criado_em timestamp DEFAULT now()
);

-- Tabela de auditoria: registra cada evento enviado pro Meta
CREATE TABLE IF NOT EXISTS meta_capi_eventos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  event_id text NOT NULL UNIQUE,   -- deduplicação
  event_name text NOT NULL,        -- CompleteSignup, AtivouWhatsApp, Purchase, etc
  valor numeric(10, 2),            -- valor em BRL (para Purchase)
  origem text DEFAULT 'front',     -- 'front' ou 'trigger'
  resposta jsonb,                  -- resposta do Meta
  enviado_em timestamp DEFAULT now()
);

CREATE INDEX idx_meta_capi_eventos_user_id ON meta_capi_eventos(user_id);
CREATE INDEX idx_meta_capi_eventos_event_name ON meta_capi_eventos(event_name);

-- ============================================
-- ETAPA 2: Triggers que Disparam Events
-- ============================================

-- TRIGGER 1: CompleteSignup quando cria conta
-- (Pode rodar via front também, mas trigger garante)
CREATE OR REPLACE FUNCTION trigger_meta_complete_signup()
RETURNS TRIGGER AS $$
DECLARE
  v_event_id text;
BEGIN
  v_event_id := 'signup_' || NEW.id || '_' || to_char(now(), 'YYYYMMDDHHMMSS');

  -- Chamar edge function meta-capi (assíncrono via pg_net)
  -- Nota: isso precisa de pg_net extension e de uma tabela outbox se quiser garantir entrega

  -- Por enquanto, só registra na auditoria (será enviado mais tarde)
  INSERT INTO meta_capi_eventos (user_id, event_id, event_name, origem)
  VALUES (NEW.id, v_event_id, 'CompleteSignup', 'trigger')
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Aplica o trigger no auth.users
DROP TRIGGER IF EXISTS on_auth_user_created_meta ON auth.users;
CREATE TRIGGER on_auth_user_created_meta
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION trigger_meta_complete_signup();

-- TRIGGER 2: AtivouWhatsApp quando conecta WhatsApp
CREATE OR REPLACE FUNCTION trigger_meta_ativou_whatsapp()
RETURNS TRIGGER AS $$
DECLARE
  v_event_id text;
BEGIN
  -- Só registra se é a PRIMEIRA conexão bem-sucedida (state = 'open')
  IF NEW.state = 'open' AND (OLD.state IS NULL OR OLD.state != 'open') THEN
    v_event_id := 'whatsapp_' || NEW.account_id || '_' || to_char(now(), 'YYYYMMDDHHMMSS');

    INSERT INTO meta_capi_eventos (user_id, event_id, event_name, origem)
    SELECT
      c.user_id,
      v_event_id,
      'AtivouWhatsApp',
      'trigger'
    FROM contas c
    WHERE c.id = NEW.account_id
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

-- TRIGGER 3: Primeira Cobrança (Purchase)
-- Executado na cron que roda as cobranças automáticas (cron job 9h)
-- Função auxiliar que vai ser chamada pelo cron
CREATE OR REPLACE FUNCTION registrar_primeira_cobranca_meta(p_account_id uuid, p_valor numeric)
RETURNS void AS $$
DECLARE
  v_event_id text;
BEGIN
  v_event_id := 'purchase_' || p_account_id || '_' || to_char(now(), 'YYYYMMDDHHMMSS');

  INSERT INTO meta_capi_eventos (user_id, event_id, event_name, valor, origem)
  SELECT
    c.user_id,
    v_event_id,
    'Purchase',
    p_valor,
    'trigger'
  FROM contas c
  WHERE c.id = p_account_id
  ON CONFLICT DO NOTHING;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- ETAPA 3: Capturar fbp/fbc do Front
-- ============================================
-- No Signup.js, ANTES de criar a conta:
-- 1. Chamar edge function /meta-capi com event_name=CompleteSignup + fbp + fbc
-- 2. Guardar fbp/fbc em localStorage
-- 3. Ao criar conta, enviar fbp/fbc também

-- Função auxiliar: salvar atribuição (chamada do front via RPC)
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

-- ============================================
-- ETAPA 4: Disparar Events para o Meta (via Edge Function)
-- ============================================
-- Esta é a parte que FALTA no código atual.
-- Precisa de um worker que lê meta_capi_eventos.enviado_em IS NULL
-- e chama a edge function /meta-capi com os dados.

-- Tabela de controle de retry
CREATE TABLE IF NOT EXISTS meta_capi_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id text NOT NULL UNIQUE REFERENCES meta_capi_eventos(event_id),
  tentativas int DEFAULT 0,
  proxima_tentativa timestamp,
  erro text,
  criado_em timestamp DEFAULT now()
);

-- ============================================
-- ETAPA 5: Configurar Segredos no Supabase
-- ============================================
-- Supabase Dashboard → Edge Functions → Secrets
-- 1. META_PIXEL_ID = 1387142490186737
-- 2. META_CAPI_ACCESS_TOKEN = {obter de Meta Business Manager}
-- 3. META_TEST_EVENT_CODE = opcional (enquanto valida)

-- ============================================
-- CHECKLIST FINAL
-- ============================================
/*
✅ FEITO:
- Edge function meta-capi já existe em supabase/functions/meta-capi/

📋 A FAZER:
1. Executar este arquivo SQL (criar tabelas + triggers)
2. Configurar segredos no Supabase:
   - META_PIXEL_ID = 1387142490186737
   - META_CAPI_ACCESS_TOKEN = {token do Meta CAPI}
3. Modificar Signup.js para guardar fbp/fbc:
   - Chamar rpc_salvar_atribuicao_meta()
   - Passar fbp/fbc na criação da conta
4. Criar worker que dispara eventos pra Meta:
   - Cron que lê meta_capi_eventos com enviado_em IS NULL
   - Chama edge function /meta-capi para cada um
5. No cron de cobranças (9h), chamar registrar_primeira_cobranca_meta()
6. Criar dashboard /admin?aba=meta-attribution
   - Query: SELECT ... FROM meta_capi_eventos WHERE event_name IN ('CompleteSignup', 'AtivouWhatsApp', 'Purchase')
*/