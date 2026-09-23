-- Boas-vindas do cadastro: marca de "já enviei"
-- ---------------------------------------------------------------------------
-- Até 22/09/2026 as duas mensagens de boas-vindas (saudação + cobrança de
-- exemplo) saíam do NAVEGADOR, pela instância master, em src/Signup.js. O
-- evolution-proxy (commit 196af67) passou a barrar isso: cliente comum só
-- opera a própria instância, então todo cadastro novo levava 403 e ninguém
-- recebia nada -- silenciosamente, porque esse envio nunca gravou log.
--
-- O envio virou a edge function signup-boas-vindas, que manda pela master com
-- service_role. Esta coluna é o que impede a função de virar canal de spam:
-- com ela, cada conta recebe a boas-vindas UMA vez. O outro lado da trava é
-- que o telefone de destino é sempre lido de usuarios.telefone -- nunca vem
-- do corpo da requisição.
--
-- Mesmo padrão das colunas retencao_*_enviado_em: carimbo, não booleano, pra
-- dar pra auditar QUANDO saiu.

alter table usuarios
  add column if not exists boas_vindas_enviado_em timestamptz;

comment on column usuarios.boas_vindas_enviado_em is
  'Quando a boas-vindas do cadastro saiu pela master (edge signup-boas-vindas). NULL = ainda não recebeu. Serve de trava de envio único.';

-- Contas criadas ANTES da função existir não devem receber boas-vindas
-- atrasada semanas depois. A função já limita por idade da conta (7 dias),
-- mas carimbar aqui deixa explícito e protege contra mudança nesse limite.
update usuarios
   set boas_vindas_enviado_em = coalesce(boas_vindas_enviado_em, created_at)
 where created_at < '2026-09-22 11:17:00-03'   -- deploy do evolution-proxy
   and boas_vindas_enviado_em is null;
