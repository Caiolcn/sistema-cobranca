-- ===================================
-- REMOVER APENAS evolution_instance_name GLOBAL
-- ===================================
-- ARQUITETURA CORRETA:
-- - API Key e URL: GLOBAIS (compartilhadas por todos os clientes)
-- - Instance Name: INDIVIDUAL (cada cliente tem sua própria instância)

-- Remover APENAS o instance_name global (não é mais usado)
DELETE FROM config
WHERE chave = 'evolution_instance_name';

-- ===================================
-- VERIFICAÇÃO
-- ===================================

-- Listar configurações restantes (deve ter 9 itens)
SELECT
  chave,
  LEFT(valor, 50) as valor_preview,
  descricao
FROM config
ORDER BY chave;

/*
CONFIGURAÇÕES QUE DEVEM PERMANECER:

1. evolution_api_key (GLOBAL - compartilhada)
2. evolution_api_url (GLOBAL - compartilhada)
3. n8n_webhook_lembrete
4. n8n_webhook_vencimento_hoje
5. msg_template_lembrete
6. msg_template_vencimento_hoje
7. dias_lembrete_antecipado
8. horario_envio_automatico
9. automacao_habilitada

REMOVIDA (agora é individual por cliente):
❌ evolution_instance_name

ARQUITETURA FINAL:
================
- Todos os clientes usam a MESMA API Key e URL (do dono do sistema)
- Cada cliente cria sua PRÓPRIA instância (salva em devedores.whatsapp_config)
- Ao enviar mensagens, usa API Key global + instance name individual
*/
