-- Marca o onboarding guiado como concluído nas contas que já operam de verdade.
--
-- Contexto (15/10/2026): o useEffect da Home que gravava onboarding_completed = true
-- nunca disparava (query do supabase-js sem await/then). Resultado: 14 contas com
-- 3+ alunos continuavam com onboarding_completed = false, e o passo a passo voltava
-- a aparecer por cima do painel sempre que o WhatsApp caía (caso Espaço Nobre Jácome).
--
-- Critério: 3+ alunos ativos E (já enviou mensagem OU WhatsApp conectado hoje).
-- Conta que só cadastrou aluno e nunca conectou nem enviou continua no onboarding.

update usuarios u
set onboarding_completed = true,
    onboarding_step = 4
where coalesce(u.onboarding_completed, false) = false
  and (select count(*) from devedores d
        where d.user_id = u.id and (d.lixo is null or d.lixo = false)) >= 3
  and (
    exists (select 1 from logs_mensagens l where l.user_id = u.id and l.status = 'enviado')
    or exists (select 1 from mensallizap z where z.user_id = u.id and z.conectado = true)
  );

-- Conferência: deve listar só quem ficou de fora (sem envio e sem conexão).
select u.id, u.nome_empresa, u.onboarding_completed,
       (select count(*) from devedores d where d.user_id = u.id and (d.lixo is null or d.lixo = false)) as alunos
from usuarios u
where coalesce(u.onboarding_completed, false) = false
  and (select count(*) from devedores d where d.user_id = u.id and (d.lixo is null or d.lixo = false)) >= 3;
