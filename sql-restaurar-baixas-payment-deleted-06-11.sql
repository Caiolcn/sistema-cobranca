-- ============================================================================
-- Restaura 4 baixas desfeitas pelo webhook do Asaas (PAYMENT_DELETED) em 06/11
-- ----------------------------------------------------------------------------
-- O que houve: as 4 mensalidades foram pagas por fora (Pix direto pra escola)
-- e o gestor deu baixa manual no Mensalli — o aluno recebeu a confirmação.
-- Antes disso o aluno tinha gerado um Pix pelo portal (Asaas) e não pagou
-- esse. Na madrugada de 06/11 (00:28) o Asaas apagou esses Pix vencidos e o
-- asaas-webhook, ao receber PAYMENT_DELETED, voltou a mensalidade para
-- "pendente" sem olhar se ela já estava paga. A forma_pagamento ficou (o
-- webhook só zera status e data_pagamento), por isso aparece "PIX" e
-- "em atraso" ao mesmo tempo.
--
-- data_pagamento = dia em que a confirmação de pagamento saiu pro aluno.
-- O webhook não mexeu em mais nada (valor, multa, juros, desconto ficaram).
-- Só altera se a linha ainda estiver pendente.
-- ============================================================================

-- ---------- Conferência ANTES ----------
SELECT u.nome_empresa, d.nome, m.data_vencimento, m.status, m.forma_pagamento, m.data_pagamento
  FROM mensalidades m
  JOIN devedores d ON d.id = m.devedor_id
  JOIN usuarios u ON u.id = m.user_id
 WHERE m.id IN ('e14fee28-766f-4281-abb2-d55b51adf03f', '43d5aefb-17b6-45ac-8b16-81703b6006ff',
                '045a1d85-1467-4ae7-90fc-e394dcf5eefb', '0de6cad6-3836-4023-9f2c-a3c63255a8dc');

BEGIN;

UPDATE mensalidades m
   SET status = 'pago', data_pagamento = v.pago_em, updated_at = now()
  FROM (VALUES
    ('e14fee28-766f-4281-abb2-d55b51adf03f'::uuid, DATE '2026-11-05'),  -- GR Esperança · Davi Lucas Guedes Claro · venc 30/10
    ('43d5aefb-17b6-45ac-8b16-81703b6006ff'::uuid, DATE '2026-11-04'),  -- GR Esperança · Felipe Azevedo Matos · venc 30/10
    ('045a1d85-1467-4ae7-90fc-e394dcf5eefb'::uuid, DATE '2026-11-03'),  -- GR Esperança · Benjamin Araujo Maia · venc 30/10
    ('0de6cad6-3836-4023-9f2c-a3c63255a8dc'::uuid, DATE '2026-11-05')   -- Paineiras · Bernardo Pereira da Silva de Melo · venc 30/09
  ) AS v(id, pago_em)
 WHERE m.id = v.id
   AND m.status = 'pendente';

COMMIT;

-- ---------- Conferência DEPOIS (as 4 devem estar "pago") ----------
SELECT u.nome_empresa, d.nome, m.data_vencimento, m.status, m.forma_pagamento, m.data_pagamento
  FROM mensalidades m
  JOIN devedores d ON d.id = m.devedor_id
  JOIN usuarios u ON u.id = m.user_id
 WHERE m.id IN ('e14fee28-766f-4281-abb2-d55b51adf03f', '43d5aefb-17b6-45ac-8b16-81703b6006ff',
                '045a1d85-1467-4ae7-90fc-e394dcf5eefb', '0de6cad6-3836-4023-9f2c-a3c63255a8dc');
