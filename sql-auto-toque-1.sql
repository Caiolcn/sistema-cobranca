-- ============================================================
-- Toque 1 automatico (03/10/2026)
--
-- O board passa a mostrar DE QUEM E A VEZ:
--   Conversando         a bola esta com voce (ele falou por ultimo)
--   Toque 1 / Toque 2   a bola esta com ele (voce falou por ultimo)
--
-- REGRAS
--   1. Voce manda mensagem (WhatsApp direto OU pelo CRM) e o lead esta em
--      'conversando'  ->  vai pra 'a_toque_1'.
--      NAO move quando:
--        - o lead acabou de nascer como 'novo' (a 1a resposta so tira de Novo);
--        - ele esta parado ha mais de 30 dias (Reaquecimento: segue pelos toques 30/60/90);
--        - ha um toque de reaquecimento recente (reaq_*) valendo (mesma regra da tela);
--        - esta ignorado, arquivado ou veio do Outbound (o CRM do Outbound cuida dele).
--   2. Ele responde e o lead esta em Toque 1/2 (ou nas antigas Toque 3-5/Despedida)
--      ->  volta pra 'conversando'.
--      NAO mexe em Aguardando nem em Fora do funil.
--
-- COMO FUNCIONA
--   Gatilho BEFORE UPDATE: so ajusta o campo status dentro da MESMA atualizacao que
--   o bot ou o envio do CRM ja fazem a cada mensagem. Nao cria escrita nova. Roda
--   antes de trg_mensalli_leads_etapa_desde (ordem alfabetica), que zera a contagem
--   da etapa e o passo; o historico em mensalli_lead_eventos registra a troca.
--   So vale pra mensagens NOVAS: nada e movido retroativamente.
--
-- TESTAR (nao grava nada): rodar sql-auto-toque-1-teste.sql depois deste.
--
-- DESLIGAR:
--   DROP TRIGGER IF EXISTS trg_mensalli_leads_auto_toque ON public.mensalli_leads;
--   DROP FUNCTION IF EXISTS public.mensalli_leads_auto_toque();
-- ============================================================

CREATE OR REPLACE FUNCTION public.mensalli_leads_auto_toque()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  -- Fora do funil de prospeccao: ignorado, arquivado ou do Outbound
  IF COALESCE(NEW.ignorado, false) OR COALESCE(NEW.arquivado, false)
     OR COALESCE(NEW.origem, '') = 'outbound' THEN
    RETURN NEW;
  END IF;

  IF NEW.ultima_direcao = 'out'
     AND OLD.status = 'conversando' AND NEW.status = 'conversando' THEN
    -- Parado ha mais de 30 dias: Reaquecimento segue pelos toques 30/60/90
    IF OLD.ultima_interacao IS NOT NULL
       AND OLD.ultima_interacao < NOW() - INTERVAL '30 days' THEN
      RETURN NEW;
    END IF;
    -- Toque de reaquecimento recente: a propria mensagem dele e a ultima interacao
    IF OLD.passo LIKE 'reaq\_%' AND OLD.passo_em IS NOT NULL
       AND OLD.ultima_interacao IS NOT NULL
       AND OLD.passo_em >= OLD.ultima_interacao - INTERVAL '1 day' THEN
      RETURN NEW;
    END IF;
    NEW.status := 'a_toque_1';

  ELSIF NEW.ultima_direcao = 'in'
     AND OLD.status IN ('a_toque_1', 'a_toque_2', 'a_toque_3', 'a_toque_4', 'a_toque_5', 'a_final') THEN
    NEW.status := 'conversando';
  END IF;

  RETURN NEW;
END
$function$;

DROP TRIGGER IF EXISTS trg_mensalli_leads_auto_toque ON public.mensalli_leads;

CREATE TRIGGER trg_mensalli_leads_auto_toque
  BEFORE UPDATE OF ultima_interacao ON public.mensalli_leads
  FOR EACH ROW
  WHEN (NEW.ultima_interacao IS DISTINCT FROM OLD.ultima_interacao)
  EXECUTE FUNCTION public.mensalli_leads_auto_toque();
