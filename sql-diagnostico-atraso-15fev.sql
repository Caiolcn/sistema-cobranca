-- ============================================================
-- DIAGNOSTICO: Mensagens "3 dias depois" NAO enviadas
-- Cliente: adgoms321@gmail.com
-- Alunos com vencimento 15/02/2026
-- Envio deveria ter ocorrido em 18/02/2026 (3 dias depois)
-- ============================================================

-- ============================================================
-- 1. TIMEZONE E DATA DO SERVIDOR
-- Se o servidor estiver em UTC, CURRENT_DATE pode estar 1 dia adiantado
-- ============================================================
SELECT
  CURRENT_DATE as data_servidor,
  NOW() as agora_utc,
  NOW() AT TIME ZONE 'America/Sao_Paulo' as agora_brasil,
  (CURRENT_DATE - INTERVAL '3 days')::date as "view_buscaria_vencimento_de",
  CASE
    WHEN CURRENT_DATE = '2026-02-19' THEN 'OK - Servidor em 19/02'
    ELSE 'ATENCAO: Servidor em ' || CURRENT_DATE || ' (esperado 19/02)'
  END as verificacao_data;

-- ============================================================
-- 2. IDENTIFICAR O USUARIO
-- ============================================================
SELECT
  id as user_id,
  email,
  nome_completo,
  plano,
  plano_pago,
  status_conta
FROM usuarios
WHERE email = 'adgoms321@gmail.com';

-- ============================================================
-- 3. CHECAR CONFIGURACAO DE COBRANCA (enviar_3_dias_depois deve ser TRUE)
-- ============================================================
SELECT
  cc.*,
  u.email,
  CASE
    WHEN cc.id IS NULL THEN 'SEM CONFIGURACAO - nunca habilitou automacao!'
    WHEN cc.enviar_3_dias_depois = false THEN 'DESABILITADO - toggle 3 Dias Depois esta OFF!'
    WHEN cc.enviar_3_dias_depois = true THEN 'OK - Habilitado'
    ELSE 'NULL - nao definido'
  END as diagnostico
FROM usuarios u
LEFT JOIN configuracoes_cobranca cc ON cc.user_id = u.id
WHERE u.email = 'adgoms321@gmail.com';

-- ============================================================
-- 4. CHECAR WHATSAPP CONECTADO (mensallizap.conectado deve ser TRUE)
-- ============================================================
SELECT
  mz.*,
  u.email,
  CASE
    WHEN mz.id IS NULL THEN 'SEM REGISTRO - nunca conectou WhatsApp!'
    WHEN mz.conectado = false THEN 'DESCONECTADO!'
    WHEN mz.instance_name IS NULL OR mz.instance_name = '' THEN 'SEM INSTANCE NAME!'
    ELSE 'OK - Conectado como ' || mz.instance_name
  END as diagnostico
FROM usuarios u
LEFT JOIN mensallizap mz ON mz.user_id = u.id
WHERE u.email = 'adgoms321@gmail.com';

-- ============================================================
-- 5. CHECAR TEMPLATE OVERDUE (tipo='overdue' e ativo=true)
-- ============================================================
SELECT
  t.id,
  t.tipo,
  t.titulo,
  t.ativo,
  t.is_padrao,
  LEFT(t.mensagem, 150) as inicio_mensagem,
  LENGTH(t.mensagem) as tamanho,
  CASE
    WHEN t.id IS NULL THEN 'SEM TEMPLATE OVERDUE!'
    WHEN t.ativo = false THEN 'TEMPLATE INATIVO!'
    WHEN t.mensagem IS NULL OR t.mensagem = '' THEN 'TEMPLATE VAZIO!'
    ELSE 'OK - Template com ' || LENGTH(t.mensagem) || ' chars'
  END as diagnostico
FROM usuarios u
LEFT JOIN templates t ON t.user_id = u.id AND t.tipo = 'overdue'
WHERE u.email = 'adgoms321@gmail.com';

-- ============================================================
-- 6. CHECAR LIMITE DE MENSAGENS (controle_planos)
-- ============================================================
SELECT
  cp.*,
  u.email,
  CASE
    WHEN cp.id IS NULL THEN 'SEM CONTROLE - tabela nao tem registro (pode ser ok se LEFT JOIN)'
    WHEN cp.limite_mensal IS NOT NULL AND cp.usage_count >= cp.limite_mensal THEN 'LIMITE ATINGIDO! ' || cp.usage_count || '/' || cp.limite_mensal
    ELSE 'OK - ' || COALESCE(cp.usage_count::text, '0') || '/' || COALESCE(cp.limite_mensal::text, 'ilimitado')
  END as diagnostico
FROM usuarios u
LEFT JOIN controle_planos cp ON cp.user_id = u.id
WHERE u.email = 'adgoms321@gmail.com';

-- ============================================================
-- 7. MENSALIDADES COM VENCIMENTO 15/02 - ESTADO ATUAL
-- Mostra se enviado_vencimento esta true ou false
-- ============================================================
SELECT
  m.id as mensalidade_id,
  d.nome as aluno,
  d.telefone,
  m.data_vencimento,
  m.valor,
  m.status,
  m.enviado_vencimento as "flag_3dias_depois",
  m.enviado_no_dia as "flag_no_dia",
  m.enviado_3dias as "flag_3dias_antes",
  m.total_envios,
  d.assinatura_ativa,
  d.lixo,
  CASE
    WHEN m.status != 'pendente' THEN 'Status nao e pendente: ' || m.status
    WHEN m.enviado_vencimento = true THEN 'Flag enviado_vencimento = true (ja marcado como enviado, mas n8n nao rodou?)'
    WHEN d.assinatura_ativa = false OR d.assinatura_ativa IS NULL THEN 'assinatura_ativa = false!'
    WHEN d.lixo = true THEN 'Na lixeira!'
    WHEN d.telefone IS NULL OR d.telefone = '' THEN 'SEM TELEFONE!'
    ELSE 'Dados OK - deveria ter sido enviado'
  END as diagnostico
FROM mensalidades m
INNER JOIN devedores d ON m.devedor_id = d.id
INNER JOIN usuarios u ON d.user_id = u.id
WHERE u.email = 'adgoms321@gmail.com'
  AND m.data_vencimento = '2026-02-15'
ORDER BY d.nome;

-- ============================================================
-- 8. SIMULAR: O que a view vw_parcelas_em_atraso retornaria em 18/02?
-- (trocando CURRENT_DATE por '2026-02-18')
-- Se retornar vazio, alguma condicao falhou
-- ============================================================
SELECT
  m.id as parcela_id,
  d.nome as nome_cliente,
  d.telefone,
  m.valor as valor_em_aberto,
  m.data_vencimento,
  m.status,
  m.enviado_vencimento,
  d.assinatura_ativa,
  (d.lixo IS NULL OR d.lixo = false) as nao_lixo,
  cc.enviar_3_dias_depois,
  mz.conectado as whatsapp_conectado,
  mz.instance_name,
  t.id IS NOT NULL as tem_template_overdue,
  COALESCE(cp.usage_count, 0) as uso,
  COALESCE(cp.limite_mensal, 9999) as limite
FROM mensalidades m
INNER JOIN devedores d ON m.devedor_id = d.id
INNER JOIN usuarios u ON d.user_id = u.id
LEFT JOIN configuracoes_cobranca cc ON cc.user_id = d.user_id
LEFT JOIN mensallizap mz ON mz.user_id = d.user_id
LEFT JOIN controle_planos cp ON cp.user_id = d.user_id
LEFT JOIN templates t ON t.user_id = d.user_id AND t.tipo = 'overdue' AND t.ativo = true
WHERE u.email = 'adgoms321@gmail.com'
  AND m.data_vencimento = '2026-02-15'
  AND m.status = 'pendente'
ORDER BY d.nome;

-- ============================================================
-- 9. LOGS DE MENSAGENS RECENTES DESTE USUARIO
-- Verifica se algo foi enviado nos ultimos 7 dias
-- ============================================================
SELECT
  lm.id,
  d.nome as aluno,
  lm.telefone,
  lm.tipo,
  lm.status as status_envio,
  lm.erro,
  LEFT(lm.mensagem, 100) as mensagem,
  lm.created_at
FROM logs_mensagens lm
LEFT JOIN devedores d ON lm.devedor_id = d.id
WHERE lm.user_id = (SELECT id FROM usuarios WHERE email = 'adgoms321@gmail.com')
  AND lm.created_at >= CURRENT_DATE - INTERVAL '7 days'
ORDER BY lm.created_at DESC;

-- ============================================================
-- 10. DIAGNOSTICO RESUMO - CAUSA PROVAVEL
-- ============================================================
SELECT
  'RESULTADO' as secao,
  CASE
    -- Sem configuracao
    WHEN NOT EXISTS (
      SELECT 1 FROM configuracoes_cobranca cc
      JOIN usuarios u ON cc.user_id = u.id
      WHERE u.email = 'adgoms321@gmail.com'
    ) THEN 'CAUSA: Sem registro em configuracoes_cobranca. Toggle nunca foi habilitado.'

    -- Toggle desligado
    WHEN NOT EXISTS (
      SELECT 1 FROM configuracoes_cobranca cc
      JOIN usuarios u ON cc.user_id = u.id
      WHERE u.email = 'adgoms321@gmail.com' AND cc.enviar_3_dias_depois = true
    ) THEN 'CAUSA: enviar_3_dias_depois = false. O toggle "3 Dias Depois" esta desligado na tela de WhatsApp.'

    -- WhatsApp desconectado
    WHEN NOT EXISTS (
      SELECT 1 FROM mensallizap mz
      JOIN usuarios u ON mz.user_id = u.id
      WHERE u.email = 'adgoms321@gmail.com' AND mz.conectado = true
    ) THEN 'CAUSA: WhatsApp desconectado. mensallizap.conectado = false.'

    -- Sem instance_name
    WHEN NOT EXISTS (
      SELECT 1 FROM mensallizap mz
      JOIN usuarios u ON mz.user_id = u.id
      WHERE u.email = 'adgoms321@gmail.com' AND mz.instance_name IS NOT NULL AND mz.instance_name != ''
    ) THEN 'CAUSA: Sem instance_name na mensallizap. Conexao WhatsApp incompleta.'

    -- Sem template
    WHEN NOT EXISTS (
      SELECT 1 FROM templates t
      JOIN usuarios u ON t.user_id = u.id
      WHERE u.email = 'adgoms321@gmail.com' AND t.tipo = 'overdue' AND t.ativo = true
    ) THEN 'CAUSA: Sem template "overdue" ativo. Precisa criar template de cobranca.'

    -- Template vazio
    WHEN EXISTS (
      SELECT 1 FROM templates t
      JOIN usuarios u ON t.user_id = u.id
      WHERE u.email = 'adgoms321@gmail.com' AND t.tipo = 'overdue' AND t.ativo = true
        AND (t.mensagem IS NULL OR t.mensagem = '')
    ) THEN 'CAUSA: Template "overdue" existe mas esta VAZIO.'

    -- Limite atingido
    WHEN EXISTS (
      SELECT 1 FROM controle_planos cp
      JOIN usuarios u ON cp.user_id = u.id
      WHERE u.email = 'adgoms321@gmail.com'
        AND cp.limite_mensal IS NOT NULL AND cp.usage_count >= cp.limite_mensal
    ) THEN 'CAUSA: Limite mensal de mensagens atingido!'

    -- Mensalidades ja marcadas como enviadas
    WHEN NOT EXISTS (
      SELECT 1 FROM mensalidades m
      JOIN devedores d ON m.devedor_id = d.id
      JOIN usuarios u ON d.user_id = u.id
      WHERE u.email = 'adgoms321@gmail.com'
        AND m.data_vencimento = '2026-02-15'
        AND m.status = 'pendente'
        AND m.enviado_vencimento = false
    ) THEN 'CAUSA: Todas as mensalidades de 15/02 ja tem enviado_vencimento=true OU status!=pendente. Verifique query 7.'

    -- Alunos sem assinatura ativa
    WHEN NOT EXISTS (
      SELECT 1 FROM mensalidades m
      JOIN devedores d ON m.devedor_id = d.id
      JOIN usuarios u ON d.user_id = u.id
      WHERE u.email = 'adgoms321@gmail.com'
        AND m.data_vencimento = '2026-02-15'
        AND d.assinatura_ativa = true
    ) THEN 'CAUSA: Nenhum aluno com vencimento 15/02 tem assinatura_ativa=true.'

    -- Tudo parece ok = problema no n8n
    ELSE 'TUDO OK no banco! Problema provavel: workflow n8n nao executou em 18/02. Verifique: 1) n8n esta rodando? 2) Workflow esta ativo? 3) Credenciais Supabase no n8n estao corretas?'
  END as diagnostico_final;

-- ============================================================
-- 11. FIX: Resetar flags para reenvio manual
-- DESCOMENTE para executar (so rodar depois de confirmar o diagnostico)
-- Isso vai permitir que o n8n envie as mensagens no proximo ciclo
-- MAS so funciona se CURRENT_DATE - 3 days = 2026-02-15 (ou seja, hoje = 18/02)
-- Como hoje ja e 19/02, a view nao vai pegar. Use query 12 para envio manual.
-- ============================================================
/*
UPDATE mensalidades
SET enviado_vencimento = false, total_envios = 0
WHERE devedor_id IN (
  SELECT d.id FROM devedores d
  JOIN usuarios u ON d.user_id = u.id
  WHERE u.email = 'adgoms321@gmail.com'
)
AND data_vencimento = '2026-02-15'
AND status = 'pendente';
*/

-- ============================================================
-- 12. DADOS PARA ENVIO MANUAL (se precisar enviar via n8n manualmente)
-- Use esses dados para disparar manualmente no n8n ou via API
-- ============================================================
SELECT
  d.nome as nome_cliente,
  d.telefone,
  m.valor,
  m.data_vencimento,
  u.chave_pix,
  u.nome_empresa,
  mz.instance_name,
  t.mensagem as template_mensagem
FROM mensalidades m
INNER JOIN devedores d ON m.devedor_id = d.id
INNER JOIN usuarios u ON d.user_id = u.id
LEFT JOIN mensallizap mz ON mz.user_id = u.id
LEFT JOIN templates t ON t.user_id = u.id AND t.tipo = 'overdue' AND t.ativo = true
WHERE u.email = 'adgoms321@gmail.com'
  AND m.data_vencimento = '2026-02-15'
  AND m.status = 'pendente'
ORDER BY d.nome;
