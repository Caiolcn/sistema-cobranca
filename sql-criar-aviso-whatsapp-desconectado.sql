-- ============================================================
-- AVISO DE WHATSAPP DESCONECTADO (Canais A + C)
-- ============================================================
-- Quando o health check detecta que o WhatsApp de um cliente pago
-- caiu, avisamos por dois canais (o próprio WhatsApp dele está fora,
-- então NÃO dá pra usá-lo):
--   A) Banner in-app no painel do cliente (lê mensallizap.conectado)
--   C) Mensagem WhatsApp pela INSTÂNCIA MASTER da Mensalli ao
--      telefone do gestor (usuarios.telefone)
--
-- Anti-spam: re-avisa no máximo a cada 3 dias enquanto seguir caído.
-- Ao reconectar, o campo é zerado pra que a próxima queda avise na hora.
-- ============================================================

-- 1. Marca quando o último aviso de desconexão foi enviado (Canal C)
ALTER TABLE mensallizap
  ADD COLUMN IF NOT EXISTS ultimo_aviso_desconexao TIMESTAMPTZ;

COMMENT ON COLUMN mensallizap.ultimo_aviso_desconexao IS
  'Quando o gestor foi avisado pela última vez que o WhatsApp caiu (anti-spam de 3 dias). Zerado ao reconectar.';

-- 2. Nome da instância MASTER da Mensalli.
--    NÃO é necessário gravar nada: tanto a edge function quanto a tela admin
--    usam o fallback fixo 'mensalli_master' quando a chave não existe.
--    (A tabela config exige user_id NOT NULL, então não dá pra criar um
--     registro "global" simples — e não precisa.)
--
--    Só personalize se quiser OUTRO nome de instância. Nesse caso, use o
--    MESMO user_id das credenciais Evolution e descomente:
--
--    INSERT INTO config (user_id, chave, valor, descricao)
--    SELECT user_id, 'evolution_master_instance', 'mensalli_master',
--           'Instância Evolution master da Mensalli (envia avisos de sistema)'
--    FROM config WHERE chave = 'evolution_api_key' LIMIT 1;

-- ==========================================
-- VERIFICAÇÃO
-- ==========================================
-- SELECT user_id, conectado, ultima_conexao, ultimo_aviso_desconexao FROM mensallizap LIMIT 10;
