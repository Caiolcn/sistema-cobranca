-- ============================================================
-- Aviso de ativacao das 24h: de automatico para manual (03/10/2026)
--
-- Quem cria a conta e nao conecta o WhatsApp em 24h agora cai na coluna
-- "Sem conectar" do CRM (/admin > Leads > Funil), onde o gestor manda um audio.
-- O aviso de FIM DO TESTE continua automatico (trial_avisos_ativo = true).
--
-- Ordem: 1) rodar este SQL  2) deploy da edge trial-avisos
--   supabase functions deploy trial-avisos
-- Antes do deploy a funcao antiga ignora a chave nova e segue mandando as 24h.
-- ============================================================

insert into config (user_id, chave, valor, descricao)
values ('c93b3e8d-78d5-4248-98a1-612149ffefe9', 'trial_ativacao_24h_ativo', 'false',
        'Liga/desliga so o aviso automatico das 24h sem conectar (edge trial-avisos). O de fim de teste usa trial_avisos_ativo.')
on conflict (chave) do nothing;

-- Religar o automatico das 24h:  update config set valor = 'true'  where chave = 'trial_ativacao_24h_ativo';
-- Desligar de novo:              update config set valor = 'false' where chave = 'trial_ativacao_24h_ativo';
