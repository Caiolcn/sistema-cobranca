-- ===================================
-- ATUALIZAR TRIGGER PARA CONFIGURAR TRIAL AUTOMATICAMENTE
-- ===================================

-- 1. Atualizar função que cria usuário automaticamente
CREATE OR REPLACE FUNCTION criar_usuario_automatico()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO usuarios (
    id,
    email,
    nome_completo,
    plano,
    status_conta,
    trial_ativo,
    trial_fim,
    plano_pago,
    data_cadastro,
    created_at
  ) VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'nome_completo', split_part(NEW.email, '@', 1)),
    'basico',
    'ativo',
    true,
    NOW() + INTERVAL '3 days',  -- Trial expira em 3 dias
    false,  -- Ainda não é assinante
    NOW(),
    NOW()
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Verificar se o trigger existe e recriá-lo se necessário
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION criar_usuario_automatico();

-- ===================================
-- VERIFICAÇÃO
-- ===================================

-- Listar triggers da tabela auth.users
SELECT
    trigger_name,
    event_manipulation,
    action_statement
FROM information_schema.triggers
WHERE event_object_table = 'users'
  AND trigger_schema = 'auth';

-- Ver a função atualizada
SELECT
    proname as function_name,
    prosrc as source_code
FROM pg_proc
WHERE proname = 'criar_usuario_automatico';

/*
✅ RESULTADO ESPERADO:
- Trigger "on_auth_user_created" recriado
- Função atualizada com trial_fim = NOW() + 3 days
- Novos usuários já terão trial configurado automaticamente
*/
