-- ============================================================
-- Régua pela fila — worker no lugar do lote do n8n
-- JÁ APLICADO EM PRODUÇÃO (20/08/26). Este arquivo é o registro do que subiu.
--
-- Motivo, medido em 20/08: o disparo em rajada das 9h matou SEIS contas no
-- mesmo minuto e perdeu 34 mensagens; o nó Code do n8n aborta em 300s e deixou
-- 16 como 'adiado_sem_tempo'; e falha de conexão era sentença, porque não havia
-- nova tentativa no mesmo dia.
--
-- A fila (mensagens_fila) já era montada às 8:45 por materializar_fila_dia e
-- até aqui só OBSERVAVA o n8n (reconciliar_fila). Agora ela COMANDA.
-- ============================================================

-- Objetos criados (ver migrations fila_worker_cobranca e fila_worker_claim_casts):
--   fila_worker_cfg          liga/desliga, allowlist do piloto e ritmo — tudo em dado
--   reivindicar_fila_lote()  claim atômico (FOR UPDATE SKIP LOCKED) + payload das views
--   concluir_fila()          fecha a linha; transitória volta para 'pendente'

-- ------------------------------------------------------------
-- Agendamento (jobid 14)
--
-- 11:46-11:58 UTC = 8:46-8:58 BRT. A janela é deliberada:
--   8:45  materializar_fila_dia monta a fila
--   8:46  worker começa a drenar, 2 mensagens por conta a cada 2 min
--   9:00  lote do n8n — encontra as parcelas do piloto JÁ marcadas como
--         enviadas e as ignora sozinho
--
-- Isso evita editar o workflow do n8n e ainda deixa o n8n como REDE DE
-- SEGURANÇA: o que o worker não conseguiu drenar em 12 min sai às 9h como
-- sempre saiu. Nenhuma mensagem fica órfã enquanto o piloto amadurece.
-- ------------------------------------------------------------

-- Controles sem deploy:
--   update fila_worker_cfg set ativo = false where id = true;            -- para tudo
--   update fila_worker_cfg set contas = null where id = true;            -- todas as contas
--   update fila_worker_cfg set max_por_conta_rodada = 1 where id = true; -- ritmo mais lento
--   select cron.alter_job(14, active := false);                          -- desliga o cron

-- Piloto iniciado com a Guigo Academia (de4b97ad-...): 9 envios e ZERO falhas
-- em 20/08, então o que a gente mede é o ritmo, não o zumbi.

-- Conferência no dia seguinte:
--   select to_char(enviado_em,'HH24:MI') hora, count(*)
--   from logs_mensagens l join mensagens_fila f on f.log_id = l.id
--   where l.enviado_em >= current_date group by 1 order by 1;
--   -- esperado: cauda de ~10 min, não um pico

--   select mensalidade_id, count(*) from logs_mensagens
--   where enviado_em >= current_date and status = 'enviado'
--   group by 1 having count(*) > 1;
--   -- TEM que voltar vazio: duplicata é o dano que chega no aluno

--   select estado, count(*) from mensagens_fila
--   where agendado_para >= current_date group by 1;
--   -- nenhuma linha em 'enviando' no fim do dia (indicaria worker morto no meio)
