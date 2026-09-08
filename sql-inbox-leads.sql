-- ============================================================
-- INBOX DE LEADS - Mensalli
-- ============================================================
-- Fundacao de dados para responder o lead de dentro do /admin,
-- em vez de sair pro WhatsApp. Complementa sql-criar-mensalli-leads.sql
-- (que criou mensalli_leads / mensalli_lead_mensagens).
--
-- O que este arquivo faz:
--   1. colunas de contexto e de fila de follow-up em mensalli_leads
--   2. colunas de midia em mensalli_lead_mensagens
--   3. bucket privado lead-midia
--   4. realtime nas duas tabelas
--   5. mensalli_respostas_rapidas + semeadura com o playbook
--   6. vw_mensalli_leads recriada com as colunas novas
--
-- Idempotente: pode rodar de novo sem quebrar.
-- ============================================================

-- ==========================================
-- 1. CONTEXTO E FILA DE FOLLOW-UP NO LEAD
-- ==========================================
-- nicho/alunos alimentam as variaveis {{nicho}} e {{alunos}} das respostas
-- rapidas. Sao preenchidos a mao no painel, em dois cliques, porque e o
-- proprio ato de qualificar o lead (a P1 e a P2 do playbook).
ALTER TABLE mensalli_leads ADD COLUMN IF NOT EXISTS nicho TEXT;
ALTER TABLE mensalli_leads ADD COLUMN IF NOT EXISTS alunos INT;

-- Cadencia de silencio do playbook. A fila define o intervalo entre toques:
--   A (sumiu sem qualificar)      +1  +4  +8
--   B (ouviu a oferta e sumiu)    +2  +5  +9
--   C (conta montada, nao conectou) +1 +3 +7 +15
--   D (testou e nao virou plano)  +3  +6  +10
ALTER TABLE mensalli_leads ADD COLUMN IF NOT EXISTS fila TEXT;
ALTER TABLE mensalli_leads ADD COLUMN IF NOT EXISTS toque_num INT NOT NULL DEFAULT 0;
ALTER TABLE mensalli_leads ADD COLUMN IF NOT EXISTS proximo_toque_em DATE;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'mensalli_leads_fila_check'
  ) THEN
    ALTER TABLE mensalli_leads
      ADD CONSTRAINT mensalli_leads_fila_check
      CHECK (fila IS NULL OR fila IN ('A', 'B', 'C', 'D'));
  END IF;
END $$;

-- Badge de nao lidas da caixa de entrada. Incrementado pelo webhook em toda
-- mensagem 'in'; zerado quando a conversa e aberta no painel.
ALTER TABLE mensalli_leads ADD COLUMN IF NOT EXISTS nao_lidas INT NOT NULL DEFAULT 0;
ALTER TABLE mensalli_leads ADD COLUMN IF NOT EXISTS lido_em TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_mensalli_leads_proximo_toque
  ON mensalli_leads(proximo_toque_em)
  WHERE proximo_toque_em IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_mensalli_leads_nao_lidas
  ON mensalli_leads(nao_lidas)
  WHERE nao_lidas > 0;

-- ==========================================
-- 2. MIDIA NAS MENSAGENS
-- ==========================================
-- 29% do que chega e audio/imagem/video. O webhook grava a linha com
-- midia_status='pendente' e baixa o binario da Evolution em segundo plano
-- (getBase64FromMediaMessage), subindo pro bucket lead-midia.
--
-- Midia do WhatsApp expira: mensagem antiga pode voltar 'erro', e nesse caso
-- a tela cai no fallback "abrir no WhatsApp". Isso e esperado, nao e bug.
ALTER TABLE mensalli_lead_mensagens ADD COLUMN IF NOT EXISTS midia_path TEXT;
ALTER TABLE mensalli_lead_mensagens ADD COLUMN IF NOT EXISTS midia_mime TEXT;
ALTER TABLE mensalli_lead_mensagens ADD COLUMN IF NOT EXISTS midia_bytes INT;
ALTER TABLE mensalli_lead_mensagens ADD COLUMN IF NOT EXISTS duracao_seg INT;
ALTER TABLE mensalli_lead_mensagens ADD COLUMN IF NOT EXISTS midia_status TEXT NOT NULL DEFAULT 'nao_aplica';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'mensalli_lead_msg_midia_status_check'
  ) THEN
    ALTER TABLE mensalli_lead_mensagens
      ADD CONSTRAINT mensalli_lead_msg_midia_status_check
      CHECK (midia_status IN ('nao_aplica', 'pendente', 'ok', 'erro'));
  END IF;
END $$;

-- Fila de retentativa: quem ficou pendente e ainda pode ser baixado.
CREATE INDEX IF NOT EXISTS idx_mensalli_lead_msg_midia_pendente
  ON mensalli_lead_mensagens(created_at)
  WHERE midia_status = 'pendente';

-- ==========================================
-- 3. BUCKET DA MIDIA (privado)
-- ==========================================
-- Conversa de terceiro: nunca publico. A tela le por createSignedUrl curta.
INSERT INTO storage.buckets (id, name, public)
VALUES ('lead-midia', 'lead-midia', FALSE)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Admin le midia de lead" ON storage.objects;
CREATE POLICY "Admin le midia de lead"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'lead-midia' AND public.is_admin());

DROP POLICY IF EXISTS "Admin gerencia midia de lead" ON storage.objects;
CREATE POLICY "Admin gerencia midia de lead"
  ON storage.objects FOR ALL
  USING (bucket_id = 'lead-midia' AND public.is_admin())
  WITH CHECK (bucket_id = 'lead-midia' AND public.is_admin());
-- Obs: o whatsapp-bot sobe a midia com service_role, que ignora estas policies.

-- ==========================================
-- 4. REALTIME
-- ==========================================
-- A publicacao supabase_realtime hoje so tem `mensalidades`. Sem REPLICA
-- IDENTITY FULL o payload de UPDATE vem sem os valores antigos e o filtro
-- por lead_id nao funciona (mesma observacao de usePaymentNotifications.js).
ALTER TABLE mensalli_leads REPLICA IDENTITY FULL;
ALTER TABLE mensalli_lead_mensagens REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
     WHERE pubname = 'supabase_realtime' AND tablename = 'mensalli_leads'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE mensalli_leads;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
     WHERE pubname = 'supabase_realtime' AND tablename = 'mensalli_lead_mensagens'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE mensalli_lead_mensagens;
  END IF;
END $$;

-- ==========================================
-- 5. RESPOSTAS RAPIDAS
-- ==========================================
-- Os textos dos playbooks (docs/playbook-leads-campanha.html e
-- docs/playbook-reativacao-leads.html) viram atalhos no composer: voce digita
-- "/" e busca pelo atalho. As variaveis {{...}} sao resolvidas na hora com os
-- dados do lead e da conta vinculada.
--
-- Regra do playbook que o codigo NAO deve automatizar: o texto sempre e
-- editado antes de enviar. Copy-paste identico em sequencia e o padrao que o
-- WhatsApp pune, e a pessoa percebe que recebeu um molde.
CREATE TABLE IF NOT EXISTS mensalli_respostas_rapidas (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  atalho TEXT NOT NULL UNIQUE,        -- o que voce digita depois da "/"
  titulo TEXT NOT NULL,
  texto TEXT NOT NULL,
  categoria TEXT NOT NULL DEFAULT 'venda'
    CHECK (categoria IN ('venda', 'objecao', 'followup', 'suporte')),
  estagio TEXT,                       -- E0..E5, ou a fila (A/B/C/D) do follow-up
  ordem INT NOT NULL DEFAULT 100,
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  uso_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_respostas_rapidas_ativo
  ON mensalli_respostas_rapidas(categoria, ordem)
  WHERE ativo = TRUE;

ALTER TABLE mensalli_respostas_rapidas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin gerencia respostas rapidas" ON mensalli_respostas_rapidas;
CREATE POLICY "Admin gerencia respostas rapidas"
  ON mensalli_respostas_rapidas FOR ALL
  USING (is_admin())
  WITH CHECK (is_admin());

-- ------------------------------------------
-- 5.1 Semeadura
-- ------------------------------------------
-- ON CONFLICT DO NOTHING de proposito: se voce editar um texto pela tela,
-- rodar este arquivo de novo NAO desfaz a sua edicao.
INSERT INTO mensalli_respostas_rapidas (atalho, titulo, texto, categoria, estagio, ordem) VALUES

-- E0: primeira resposta
('boasvindas', 'E0 - Resposta ao lead do anuncio', $t$Olá! Tudo bem? Aqui é o Caio, do Mensalli 😊

Respondendo direto ao que você perguntou: o Mensalli cobra a mensalidade dos seus alunos automaticamente pelo WhatsApp. Ele avisa antes de vencer, cobra quem atrasou e te mostra quem já pagou — sem você precisar lembrar de nada. A partir de R$ 49,90/mês.

Pra eu te dizer se compensa no seu caso: qual seu tipo de negócio e quantos alunos você tem mais ou menos?$t$, 'venda', 'E0', 10),

-- E1: as nove bifurcacoes
('q30', 'E1.1 - Qualificado (30+ alunos)', $t$Boa, {{nome}}. {{alunos}} alunos é justo o ponto em que cobrar na mão para de caber — dá quase duas horas por mês só mandando lembrete.

No seu caso é o plano {{plano}}, R$ {{preco}}/mês, com o aviso antes de vencer, a cobrança de quem atrasou e a baixa automática quando o Pix cai.

Faço o seguinte: me manda a sua lista de alunos do jeito que ela estiver — planilha, print, foto do caderno, tanto faz. Eu cadastro tudo, escrevo as mensagens no seu tom e te devolvo pronto. Não precisa organizar nada antes.

Aí a gente conecta seu WhatsApp em 5 minutos e você vê a primeira cobrança saindo. Pode me mandar?$t$, 'venda', 'E1', 20),

('q2030', 'E1.2 - Entre 20 e 30 alunos', $t$Show, {{nome}}. Com {{alunos}} alunos você fica no Starter, R$ 49,90/mês.

Vou te falar com sinceridade: nesse tamanho o que pesa não é tanto a inadimplência, é o tempo e o desconforto. São {{alunos}} mensagens por mês que você não manda mais, e ninguém precisa ser cobrado na cara por você.

Me manda a sua lista do jeito que estiver que eu monto pra você e te devolvo rodando — você vê funcionando antes de decidir qualquer coisa. Pode ser?$t$, 'venda', 'E1', 21),

('qpequeno', 'E1.3 - Menos de 20 alunos (nao force)', $t$Vou ser honesto contigo, {{nome}}: com {{alunos}} alunos o Mensalli funciona, mas ele se paga de verdade a partir de umas 25, 30 mensalidades. Não quero te empurrar uma coisa que ainda não é a sua prioridade.

Fico salvo aqui. Quando sua turma crescer, me chama que eu monto tudo pra você em 20 minutos, sem custo pra ver.

E se você conhece alguém com turma maior que sofre pra cobrar, me indica? Ajuda demais.$t$, 'venda', 'E1', 22),

('qsonicho', 'E1.4 - Disse o nicho, faltou o numero', $t$Boa! E quantos alunos você atende hoje, mais ou menos?

É só pra eu te dizer o plano certo e não te empurrar o maior.$t$, 'venda', 'E1', 23),

('preco', 'E1.5 - Perguntou o preco antes', $t$Claro, sem mistério: R$ 49,90 até 50 alunos, R$ 99,90 até 150 e R$ 149,90 acima disso. Sem fidelidade, cancela quando quiser.

Pra eu te dizer qual serve pra você: quantos alunos você tem hoje?$t$, 'venda', 'E1', 24),

('gateway', 'E1.6 - Ja usa Asaas / InfinitePay / Pix', $t$Perfeito — e o {{gateway}} continua sendo o seu recebimento, eu não substituo isso. Eu me conecto nele.

O que falta ali é quem avisa: ele manda e-mail e boleto, e aluno não abre e-mail. Eu ponho o lembrete no WhatsApp com o link de pagamento junto, e a baixa cai sozinha quando ele paga.

Quantos alunos você tem hoje? Se fizer sentido, eu monto a sua conta e você vê rodando antes de decidir.$t$, 'venda', 'E1', 25),

('erp', 'E1.7 - Ja tem sistema de gestao', $t$Legal — e a cobrança dele avisa o aluno pelo WhatsApp automático, ou só gera o boleto?

Pergunto porque é onde quase todos furam: bons de cadastro, fracos de cobrança. Tem cliente meu que mantém o sistema e usa o Mensalli só pra régua de mensagem, porque é ali que dói.$t$, 'venda', 'E1', 26),

('tecnica', 'E1.8 - Pergunta tecnica (sai do meu numero?)', $t$Funciona sim — você conecta o seu próprio número por QR Code, igual WhatsApp Web, e as mensagens saem dele. O aluno recebe do número que já conhece e te responde ali mesmo, como sempre.

Quantos alunos você tem hoje? Com esse número eu já te digo o plano e, se quiser, monto a sua conta pra você ver rodando.$t$, 'venda', 'E1', 27),

('foraperfil', 'E1.9 - Fora do perfil (avulso)', $t$Ah, então o meu não serve pra você — eu resolvo mensalidade recorrente mesmo. Não vou te tomar tempo.

Só uma coisa: se você conhece alguém que tem turma fixa e sofre pra cobrar todo mês, me indica? Bom trabalho aí!$t$, 'venda', 'E1', 28),

-- E2: degraus
('degrau2', 'E2 - Quer ver antes (call de 20 min)', $t$Tranquilo. A gente faz 20 minutos por vídeo e eu te mostro com dados de {{nicho}} mesmo, não com exemplo genérico.

Amanhã às 10h ou quinta às 15h?$t$, 'venda', 'E2', 30),

('degrau3', 'E2 - Nao quer nada agora (contato salvo)', $t$Sem problema nenhum. Posso te deixar aqui um resumo de uma linha e um vídeo de 1 minuto?

Fica salvo aí, e se um dia a cobrança dos seus alunos estiver te dando trabalho, você me chama.$t$, 'venda', 'E2', 31),

-- E3: recebeu a lista
('recebi', 'E3 - Recebi sua lista (ancora o prazo)', $t$Recebi, {{nome}}. Vou montar aqui e te devolvo até amanhã às 12h.

Se eu tiver dúvida em algum aluno eu te chamo — no resto pode esquecer que eu resolvo.$t$, 'venda', 'E3', 40),

('entrega', 'E3 - Conta montada (com o numero do atraso)', $t${{nome}}, pronto. Seus {{alunos}} alunos estão cadastrados, cada um com valor e dia de vencimento, e as mensagens já escritas do seu jeito.

Uma coisa que já dá pra ver: [N] alunos estão com a mensalidade em atraso, somando R$ [valor].

Falta só uma etapa, e é de 2 minutos: conectar o seu WhatsApp. Abre a tela, aparece um QR Code e você escaneia igual WhatsApp Web.

Te mando o passo a passo agora ou prefere que eu te ligue e a gente faz junto?$t$, 'venda', 'E3', 41),

-- E4: ativacao
('conectado', 'E4 - Conectou o WhatsApp', $t$Conectado! 🎉

A partir de agora as cobranças saem sozinhas do seu número, todo dia às 9h. A primeira leva sai amanhã e você não precisa fazer nada.

Depois que sair, me diz se o texto ficou do seu jeito que eu ajusto em 2 minutos.$t$, 'venda', 'E4', 50),

('primeiracobranca', 'E4 - Saiu a primeira cobranca', $t${{nome}}, saiu a primeira: [N] alunos avisados hoje de manhã, e [K] já abriram o link de pagamento.

Você não digitou nenhuma delas. É isso todo mês, no automático.

Quer que eu ajuste alguma coisa no texto antes de virar rotina?$t$, 'venda', 'E4', 51),

-- E5: fechamento
('fimteste', 'E5 - Ultimo dia do teste', $t${{nome}}, seu teste acaba hoje. Nesses dias saíram [N] cobranças pelo seu WhatsApp e [K] alunos já pagaram — R$ [valor] que entraram sem você pedir.

Pra continuar rodando é o {{plano}}, R$ {{preco}}/mês, sem fidelidade e cancela quando quiser.

Te mando o link de pagamento?$t$, 'venda', 'E5', 60),

('pausado', 'E5 - Cobrancas pausadas (nao pagou)', $t${{nome}}, suas cobranças estão paradas desde sexta — seus alunos deixaram de receber os lembretes.

Prefere que eu religue agora, ou que eu deixe parado por enquanto? As duas respostas tão certas comigo.$t$, 'venda', 'E5', 61),

-- Fila A: sumiu sem qualificar
('a1', 'Fila A - Toque 1 (dia +1)', $t${{nome}}, só pra não te deixar no vácuo: se for mais fácil, me diz só o número de alunos que eu já te digo se compensa pro seu caso.

E se não for a hora, sem problema nenhum também — é só me falar.$t$, 'followup', 'A', 70),

('a2', 'Fila A - Toque 2 (dia +4, a conta dos R$ 600)', $t${{nome}}, uma pergunta rápida e sincera: quantos alunos seus atrasaram a mensalidade este mês?

Pergunto porque é o número que mais assusta o pessoal quando a gente senta pra ver. Se forem 4 alunos de R$ 150, são R$ 600 parados. Todo mês, e quase sempre é o mesmo aluno.

Se quiser, eu cadastro os seus alunos e te mostro exatamente quem tá devendo. Leva uns 20 minutos do meu lado e você não precisa decidir nada pra ver.$t$, 'followup', 'A', 71),

('a3', 'Fila A - Toque 3 (dia +8, despedida)', $t${{nome}}, vou parar de te chamar pra não encher.

Fico salvo aqui — se um dia correr atrás de mensalidade atrasada virar dor de cabeça aí, me chama que eu monto tudo pra você em 20 minutos.

Boa semana!$t$, 'followup', 'A', 72),

-- Fila B: ouviu a oferta e nao mandou a lista
('b1', 'Fila B - Toque 1 (dia +2, diminui o pedido)', $t${{nome}}, pra facilitar: não precisa ser planilha.

Me manda um print da sua agenda, uma foto do caderno, o que você tiver. É sério, do jeito que estiver — eu transformo em cadastro aqui e te devolvo pronto.$t$, 'followup', 'B', 80),

('b2', 'Fila B - Toque 2 (dia +5, menu 1/2/3)', $t${{nome}}, prometo que é a última vez que te chamo. Me responde só com o número que eu me organizo aqui:

1 — Quero, mas essa semana tá corrida
2 — Quero entender melhor antes
3 — Não é pra mim agora

Qualquer uma das três tá ótima pra mim.$t$, 'followup', 'B', 81),

('b3', 'Fila B - Toque 3 (dia +9, despedida)', $t$Sem resposta eu entendo como "não é o momento" e paro por aqui, {{nome}} — sem problema nenhum.

Se mudar de ideia, é só me chamar. Fica salvo.$t$, 'followup', 'B', 82),

-- Fila C: conta montada e nao conectou (a mais cara)
('c1', 'Fila C - Toque 1 (dia +1)', $t${{nome}}, sua conta tá montada e parada esperando 1 minuto seu — é só escanear o QR Code, igual WhatsApp Web.

Quer que eu te ligue agora e a gente faz junto? Leva 2 minutos e aí você já vê a primeira cobrança sair.$t$, 'followup', 'C', 90),

('c2', 'Fila C - Toque 2 (dia +3, DEPOIS de ligar)', $t$Te liguei agora e não consegui te pegar, {{nome}} — imagino que esteja no meio de atendimento.

Te ligo hoje às 14h ou amanhã às 10h? É só pra gente conectar e ligar as cobranças, não te tomo mais que 5 minutos.$t$, 'followup', 'C', 91),

('c3', 'Fila C - Toque 3 (dia +7)', $t${{nome}}, deixo sua conta salva aqui do jeito que está — seus {{alunos}} alunos continuam cadastrados, nada se perde.

Quando quiser ligar, me chama que a gente termina em 5 minutos.$t$, 'followup', 'C', 92),

('c4', 'Fila C - Toque 4 (dia +15, pede o motivo)', $t${{nome}}, faz um tempo que a gente montou sua conta e acabou não indo pra frente. Imagino que você tenha resolvido de outro jeito.

Só pra eu organizar meus contatos: prefere que eu te avise quando tiver novidade, ou que eu não te chame mais? As duas respostas tão certas comigo.

(e se rolou alguma coisa que te fez desistir, me fala sem dó — me ajuda demais)$t$, 'followup', 'C', 93),

-- Fila D: testou e nao virou plano
('d2', 'Fila D - Toque 2 (dia +6, tres alternativas)', $t${{nome}}, me tira uma dúvida sincera, sem compromisso nenhum: foi o preço, foi alguma coisa que faltou no sistema, ou simplesmente não era a hora?

Pergunto porque me ajuda a melhorar de verdade — e se for preço, me fala que a gente vê o que dá pra fazer.$t$, 'followup', 'D', 100),

('d3', 'Fila D - Toque 3 (dia +10, despedida)', $t$Tranquilo, {{nome}} — paro por aqui pra não te encher.

Sua conta fica salva com os alunos cadastrados. Se um dia quiser religar, é só me chamar que em 5 minutos tá rodando de novo.

Sucesso aí!$t$, 'followup', 'D', 101),

-- Banco de objecoes
('obj-caro', 'Objecao - Ta caro', $t$Entendo. Deixa eu te fazer uma conta: um aluno seu que esquece de pagar um mês já custa mais que o plano do ano inteiro. O sistema não precisa recuperar muita coisa pra se pagar — precisa recuperar um.$t$, 'objecao', NULL, 110),

('obj-ban', 'Objecao - Meu numero vai ser banido?', $t$Não. Só sai mensagem pra aluno que você mesmo cadastrou, no ritmo normal, sem lista fria e sem disparo em massa. É o mesmo que você já faz na mão — a diferença é que não é você digitando.$t$, 'objecao', NULL, 111),

('obj-tecnologia', 'Objecao - Nao entendo de tecnologia', $t$E não precisa entender. Você não vai configurar nada — quem monta sou eu. O que sobra pra você é abrir o app e ver quem pagou.$t$, 'objecao', NULL, 112),

('obj-pensar', 'Objecao - Vou pensar', $t$Claro. Só pra eu não ficar te enchendo: te chamo na quinta, ou prefere que eu deixe quieto e você me procura?$t$, 'objecao', NULL, 113),

('obj-video', 'Objecao - Manda um video que eu vejo depois', $t$Mando agora. Só me diz uma coisa antes, pra eu te mandar a coisa certa e não um material genérico: hoje você controla em planilha, caderno ou algum sistema?$t$, 'objecao', NULL, 114),

('obj-socio', 'Objecao - Preciso falar com meu socio', $t$Faz todo sentido. Chama ele numa call de 20 minutos comigo, aí vocês decidem juntos e ninguém fica no telefone sem fio. Quinta às 10h serve pros dois?$t$, 'objecao', NULL, 115),

('obj-alunos', 'Objecao - Meus alunos vao achar ruim', $t$É o contrário do que parece: a mensagem sai do seu número, com o nome do seu trabalho, três dias antes de vencer. Todo mundo gosta de ser lembrado antes — chato é ser cobrado depois.$t$, 'objecao', NULL, 116),

('obj-jausei', 'Objecao - Ja usei sistema e nao deu certo', $t$O que aconteceu? … Pois é, é quase sempre isso: entregam o login e somem. Eu faço o contrário — eu monto, e só te chamo quando estiver rodando.$t$, 'objecao', NULL, 117),

('obj-fidelidade', 'Objecao - Tem fidelidade?', $t$Não tem fidelidade nenhuma. É mês a mês e você cancela quando quiser, sem multa e sem ligar pra ninguém.$t$, 'objecao', NULL, 118),

('obj-dinheiro', 'Objecao - O dinheiro passa por voces?', $t$Não. O pagamento vai direto pra sua conta — a gente só manda o link e registra quando cai. Seu dinheiro não passa em nenhum momento pela nossa mão.$t$, 'objecao', NULL, 119),

('obj-ficha', 'Objecao - Tem ficha de treino / catraca?', $t$Não tenho, e nem quero ter — eu resolvo a parte do dinheiro, bem feita. É por isso que custa R$ 99 e não R$ 400.$t$, 'objecao', NULL, 120),

('obj-mudar', 'Objecao - Posso mudar as mensagens?', $t$Você muda quando quiser, é texto livre. E na montagem eu já escrevo do seu jeito — me diz como você fala com seu aluno que eu deixo igual.$t$, 'objecao', NULL, 121)

ON CONFLICT (atalho) DO NOTHING;

-- ==========================================
-- 6. VIEW DO BOARD / CAIXA
-- ==========================================
-- Recriada (nao CREATE OR REPLACE) porque l.* passou a expandir mais colunas,
-- e o Postgres nao aceita mudanca de posicao num REPLACE.
DROP VIEW IF EXISTS vw_mensalli_leads;

CREATE VIEW vw_mensalli_leads AS
SELECT
  l.*,
  u.nome_completo   AS usuario_nome,
  u.email           AS usuario_email,
  u.plano_pago,
  u.trial_ativo,
  u.trial_fim,
  u.data_cadastro   AS usuario_cadastro,
  (SELECT COUNT(*) FROM mensalli_lead_mensagens m WHERE m.lead_id = l.id) AS total_mensagens,
  -- Ordenacao da caixa: quem esta esperando ha mais tempo aparece primeiro.
  -- COALESCE porque ultima_direcao pode ser NULL (lead sem mensagem ainda) e
  -- NULL no lugar de FALSE faria o filtro da caixa se comportar de forma
  -- diferente do contador do cabecalho.
  COALESCE(l.ultima_direcao = 'in' AND l.status <> 'perdido', FALSE)       AS esperando_resposta,
  ROUND(EXTRACT(EPOCH FROM (NOW() - l.ultima_interacao)) / 60)::INT        AS minutos_parado,
  COALESCE(l.proximo_toque_em <= CURRENT_DATE, FALSE)                      AS toque_vencido
FROM mensalli_leads l
LEFT JOIN usuarios u ON u.id = l.usuario_id
WHERE l.ignorado = FALSE;

ALTER VIEW vw_mensalli_leads SET (security_invoker = true);
