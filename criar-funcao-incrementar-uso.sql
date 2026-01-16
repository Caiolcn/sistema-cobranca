-- ==========================================
-- FUNÇÃO PARA INCREMENTAR USO DO PLANO
-- MensalliZap - Sistema de Cobrança Automatizada
-- ==========================================
-- Esta função é chamada via RPC pelo n8n após enviar mensagens
-- para incrementar o contador de uso do usuário.
-- ==========================================

-- Criar função RPC para incrementar uso
CREATE OR REPLACE FUNCTION incrementar_uso(p_user_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE controle_planos
  SET usage_count = usage_count + 1
  WHERE user_id = p_user_id;

  -- Se não existir registro, cria um
  IF NOT FOUND THEN
    INSERT INTO controle_planos (user_id, usage_count, limite_mensal)
    VALUES (p_user_id, 1, 200);
  END IF;
END;
$$;

-- Permitir acesso à função via API REST
GRANT EXECUTE ON FUNCTION incrementar_uso(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION incrementar_uso(UUID) TO service_role;

-- Comentário
COMMENT ON FUNCTION incrementar_uso(UUID) IS
'Incrementa o contador de uso de mensagens do usuário. Chamada pelo n8n após enviar cada mensagem.';

-- ==========================================
-- VERIFICAÇÃO
-- ==========================================
-- Testar a função:
-- SELECT incrementar_uso('seu-user-id-aqui');
