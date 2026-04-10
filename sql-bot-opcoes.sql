-- Coluna pra controlar quais opções do bot ficam ativas (fluxo ALUNO)
-- Estrutura: { "mensalidade": true, "horarios": true, "pix": true, "agendar": true }
-- Obs: opção "atendente" é sempre ativa (não configurável)

ALTER TABLE configuracoes_cobranca
  ADD COLUMN IF NOT EXISTS bot_opcoes_ativas JSONB
  DEFAULT '{"mensalidade":true,"horarios":true,"pix":true,"agendar":true}'::jsonb;

-- Coluna pra controlar quais opções de interesse o bot oferece para LEADS (visitantes)
-- Estrutura: { "conhecer": true, "valores": true, "experimental": true }
-- Obs: opção "outro" é sempre ativa (não configurável)
ALTER TABLE configuracoes_cobranca
  ADD COLUMN IF NOT EXISTS bot_lead_opcoes_ativas JSONB
  DEFAULT '{"conhecer":true,"valores":true,"experimental":true}'::jsonb;

-- Saudação personalizada para LEADS (visitantes que ainda não são alunos)
ALTER TABLE configuracoes_cobranca
  ADD COLUMN IF NOT EXISTS bot_lead_saudacao TEXT
  DEFAULT 'Olá {{nomeCliente}}! 👋 Bem-vindo(a) à {{nomeEmpresa}}!';
