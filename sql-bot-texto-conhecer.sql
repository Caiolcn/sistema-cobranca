-- Adiciona campo de texto customizado para a opção "Conhecer as aulas" do bot
ALTER TABLE configuracoes_cobranca
ADD COLUMN IF NOT EXISTS bot_texto_conhecer TEXT DEFAULT '';
