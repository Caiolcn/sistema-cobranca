-- ==========================================
-- LIMPAR TODOS OS DADOS PARA TESTE
-- ==========================================
-- ATENÇÃO: Este script deleta TODOS os dados das tabelas!
-- Use apenas em ambiente de desenvolvimento/teste

-- 1. Deletar logs (não tem dependências)
DELETE FROM logs_mensagens;

-- 2. Deletar parcelas (depende de devedores)
DELETE FROM parcelas;

-- 3. Deletar devedores
DELETE FROM devedores;

-- 4. Resetar o contador do controle_planos (opcional)
UPDATE controle_planos SET usage_count = 0;

-- 5. Verificar se tudo foi deletado
SELECT 'logs_mensagens' as tabela, COUNT(*) as total FROM logs_mensagens
UNION ALL
SELECT 'parcelas' as tabela, COUNT(*) as total FROM parcelas
UNION ALL
SELECT 'devedores' as tabela, COUNT(*) as total FROM devedores;

-- Pronto! Agora você pode:
-- 1. Criar um novo devedor no React
-- 2. Adicionar parcelas para ele
-- 3. Rodar o workflow n8n manualmente para testar
