-- ==========================================
-- CORRIGIR TABELA MENSALLIZAP
-- ==========================================
-- O upsert não funciona porque user_id não tem UNIQUE constraint

-- 1. Adicionar constraint UNIQUE no user_id (se não existir)
ALTER TABLE mensallizap
ADD CONSTRAINT mensallizap_user_id_unique UNIQUE (user_id);

-- 2. Atualizar o registro do usuário atual (substitua pelo seu user_id se necessário)
UPDATE mensallizap
SET conectado = true,
    instance_name = 'instance_c93b3e8d',
    updated_at = NOW()
WHERE user_id = 'c93b3e8d-78d5-4248-98a1-612149ffefe9';

-- 3. Verificar
SELECT user_id, instance_name, conectado, updated_at
FROM mensallizap
WHERE user_id = 'c93b3e8d-78d5-4248-98a1-612149ffefe9';
