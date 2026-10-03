-- ============================================================================
-- FIX: trigger_meta_ativou_whatsapp em logs_conexao quebrava toda reconexão
-- Aplicado em 03/10/2026.
--
-- O trigger lia NEW.state / NEW.account_id, colunas que NÃO existem em
-- logs_conexao (foi escrito para outra tabela). Cadeia do erro:
--   upsert mensallizap.conectado = true
--     → trg_log_conexao insere em logs_conexao
--       → on_conexao_whatsapp_meta: record "new" has no field "state"
--         → rollback do upsert inteiro (POST 400 no app)
-- Efeito: desde 01/10 ~14h nenhuma conta conseguia voltar a conectado = true
-- no banco, e a régua barrava as mensagens por "whatsapp_offline" mesmo com a
-- instância open na Evolution.
-- ============================================================================

-- CT INVICTUS: instância open na Evolution (tela confirma), banco travado em false.
-- Bloco de execução no FIM do arquivo (SQL Editor engole resultado se houver
-- comentário depois do último ;).

-- A função fica no banco (sem trigger apontando para ela) só como referência.
-- Definição original, para refazer o evento AtivouWhatsApp do jeito certo:
--
-- CREATE OR REPLACE FUNCTION public.trigger_meta_ativou_whatsapp()
--  RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $function$
-- DECLARE
--   v_event_id text;
-- BEGIN
--   IF NEW.state = 'open' AND (OLD.state IS NULL OR OLD.state != 'open') THEN
--     v_event_id := 'whatsapp_' || NEW.account_id || '_' || to_char(now(), 'YYYYMMDDHHMMSS');
--     INSERT INTO meta_capi_eventos (user_id, event_id, event_name, origem)
--     SELECT c.user_id, v_event_id, 'AtivouWhatsApp', 'trigger'
--     FROM contas c WHERE c.id = NEW.account_id
--     ON CONFLICT DO NOTHING;
--   END IF;
--   RETURN NEW;
-- END;
-- $function$;
--
-- Versão correta (se quiser religar): trigger AFTER INSERT em logs_conexao
-- usando NEW.status = 'conectado' e NEW.user_id direto — sem tabela `contas`.

DROP TRIGGER IF EXISTS on_conexao_whatsapp_meta ON public.logs_conexao;

UPDATE public.mensallizap
SET conectado = true, instance_name = 'instance_fd3170f8'
WHERE user_id = 'fd3170f8-da69-4936-b54f-5a2f956e78a1';

SELECT u.nome_empresa, mz.conectado, mz.instance_name, mz.ultima_conexao,
       (SELECT count(*) FROM public.logs_conexao l WHERE l.user_id = mz.user_id AND l.created_at > now() - interval '5 minutes') AS log_novo
FROM public.mensallizap mz JOIN public.usuarios u ON u.id = mz.user_id
WHERE mz.user_id = 'fd3170f8-da69-4936-b54f-5a2f956e78a1';
