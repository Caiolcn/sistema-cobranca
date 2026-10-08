-- ============================================================
-- MENSALLI VENDAS (LOJA PÚBLICA POR ACADEMIA)
-- ============================================================
-- Página pública /loja/:slug onde o aluno compra plano, pacote, produto ou
-- evento, se cadastra, paga pelo Asaas do gestor e escolhe turma fixa.
--
-- Fluxo:
--   1) Gestor liga a loja em Marketing › Loja (usuarios.loja_ativa) e cadastra
--      itens em loja_produtos (plano/pacote apontam para `planos`).
--   2) Aluno abre /loja/:slug (edge loja-dados), escolhe um item, preenche a
--      ficha e paga (edge loja-comprar cria devedor + loja_pedidos + cobrança
--      no Asaas + linha em `boletos` com pedido_id).
--   3) Asaas chama asaas-webhook. Se boletos.pedido_id existe, o webhook
--      materializa: plano -> devedor ativo + mensalidades; pacote/produto/
--      evento -> cobrancas_avulsas paga (origem='loja').
--   4) Plano com exigir_turma: aluno escolhe horário (edge loja-escolher-turma
--      -> loja_vincular_turmas, atômica).
--
-- Acesso ao módulo: plano Pro/Premium + add-on 'vendas' em assinaturas_addons.
-- A COBRANÇA do add-on não está aqui — só o gate.
--
-- Idempotente e aditivo: seguro rodar em produção.
-- Ordem: este SQL -> deploy das edges loja-* e asaas-webhook -> front.
-- ============================================================

-- ------------------------------------------------------------
-- 1. usuarios: liga/desliga e configuração da loja
-- ------------------------------------------------------------
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS loja_ativa BOOLEAN DEFAULT false;
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS loja_config JSONB;
-- loja_config: {titulo, frase, suporte_whatsapp, boas_vindas,
--               retirada: {ativa, endereco, horario},
--               aparencia: {herdar_bio, tema, fonte},
--               mostrar_experimental}

-- ------------------------------------------------------------
-- 2. Add-on (só o gate; cobrança fica para outro SQL)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS assinaturas_addons (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  addon TEXT NOT NULL,                       -- 'vendas'
  status TEXT NOT NULL DEFAULT 'ativo',      -- ativo | cancelado
  preco_contratado NUMERIC(10,2),
  inicio DATE NOT NULL DEFAULT CURRENT_DATE,
  fim DATE,                                  -- NULL = sem fim; preenchido ao cancelar (vale até esta data)
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_assinaturas_addons_user ON assinaturas_addons (user_id, addon);

ALTER TABLE assinaturas_addons ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Dono ve seus addons" ON assinaturas_addons;
CREATE POLICY "Dono ve seus addons" ON assinaturas_addons
  FOR SELECT USING (auth.uid() = user_id OR is_admin());
DROP POLICY IF EXISTS "Admin gerencia addons" ON assinaturas_addons;
CREATE POLICY "Admin gerencia addons" ON assinaturas_addons
  FOR ALL USING (is_admin()) WITH CHECK (is_admin());

-- Tem o add-on hoje? (ativo e dentro do prazo)
CREATE OR REPLACE FUNCTION usuario_tem_addon(p_user_id UUID, p_addon TEXT)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM assinaturas_addons a
    WHERE a.user_id = p_user_id
      AND a.addon = p_addon
      AND a.status = 'ativo'
      AND a.inicio <= CURRENT_DATE
      AND (a.fim IS NULL OR a.fim >= CURRENT_DATE)
  );
$$;

-- ------------------------------------------------------------
-- 3. Itens à venda
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS loja_produtos (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL CHECK (tipo IN ('plano', 'pacote', 'produto', 'evento')),
  plano_id UUID REFERENCES planos(id) ON DELETE SET NULL,  -- obrigatório em plano/pacote (validado na edge)
  nome TEXT NOT NULL,
  descricao TEXT,
  valor NUMERIC(10,2) NOT NULL DEFAULT 0,
  imagem_url TEXT,
  categoria_avulsa TEXT,                     -- produto/evento: categoria em cobrancas_avulsas
  variacoes JSONB,                           -- produto: [{nome:'M', estoque: 10 | null}]
  estoque INT,                               -- produto sem variação; NULL = ilimitado
  exigir_turma BOOLEAN DEFAULT false,        -- plano
  qtd_turmas INT DEFAULT 1,                  -- plano: quantos horários escolher (0 = livre)
  modalidade_id UUID REFERENCES modalidades(id) ON DELETE SET NULL,
  data_evento TIMESTAMPTZ,                   -- evento
  vagas INT,                                 -- evento; NULL = ilimitado
  local_evento TEXT,
  validade_dias INT,                         -- pacote (informativo)
  campos_extras JSONB,                       -- [{chave, rotulo, tipo:'texto'|'opcao', opcoes:[], obrigatorio}]
  contrato_template_id UUID REFERENCES contratos_templates(id) ON DELETE SET NULL,
  retirada_presencial BOOLEAN DEFAULT false,
  destaque BOOLEAN DEFAULT false,            -- estrela no editor: entra em "Destaques" na vitrine
  ativo BOOLEAN DEFAULT true,
  ordem INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE loja_produtos ADD COLUMN IF NOT EXISTS destaque BOOLEAN DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_loja_produtos_user ON loja_produtos (user_id, ativo, ordem);

ALTER TABLE loja_produtos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Dono gerencia produtos da loja" ON loja_produtos;
CREATE POLICY "Dono gerencia produtos da loja" ON loja_produtos
  FOR ALL USING (auth.uid() = user_id OR is_admin())
  WITH CHECK (auth.uid() = user_id OR is_admin());
-- Leitura pública NÃO é por policy: a edge loja-dados usa service role.

-- ------------------------------------------------------------
-- 4. Pedidos
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS loja_pedidos (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  produto_id UUID REFERENCES loja_produtos(id) ON DELETE SET NULL,
  devedor_id UUID REFERENCES devedores(id) ON DELETE SET NULL,
  token TEXT NOT NULL UNIQUE,                -- link público do pedido
  status TEXT NOT NULL DEFAULT 'aguardando_pagamento'
    CHECK (status IN ('aguardando_pagamento','pago','turma_pendente','aguardando_retirada',
                      'concluido','retirado','expirado','cancelado','estornado')),
  -- snapshot do item e do comprador na hora da compra
  tipo TEXT NOT NULL,
  item_nome TEXT NOT NULL,
  nome TEXT NOT NULL,                        -- aluno
  telefone TEXT NOT NULL,                    -- telefone principal (do responsável se menor)
  cpf TEXT,
  email TEXT,
  data_nascimento DATE,
  responsavel_nome TEXT,
  responsavel_telefone TEXT,
  responsavel_cpf TEXT,
  variacao TEXT,
  respostas JSONB,                           -- campos extras
  valor NUMERIC(10,2) NOT NULL,
  metodo TEXT,                               -- pix | cartao | boleto
  asaas_payment_id TEXT,
  invoice_url TEXT,
  mensalidade_id UUID REFERENCES mensalidades(id) ON DELETE SET NULL,
  cobranca_avulsa_id UUID REFERENCES cobrancas_avulsas(id) ON DELETE SET NULL,
  contrato_enviado_id UUID,
  aula_ids UUID[],
  reservou_estoque BOOLEAN DEFAULT false,
  origem_link TEXT,                          -- bio | campanha | ficha | direto
  ip_hash TEXT,
  pago_em TIMESTAMPTZ,
  retirado_em TIMESTAMPTZ,
  cancelado_em TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_loja_pedidos_user_status ON loja_pedidos (user_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_loja_pedidos_token ON loja_pedidos (token);
CREATE INDEX IF NOT EXISTS idx_loja_pedidos_asaas ON loja_pedidos (asaas_payment_id);
CREATE INDEX IF NOT EXISTS idx_loja_pedidos_devedor ON loja_pedidos (devedor_id);
CREATE INDEX IF NOT EXISTS idx_loja_pedidos_produto ON loja_pedidos (produto_id, status);

ALTER TABLE loja_pedidos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Dono ve seus pedidos" ON loja_pedidos;
CREATE POLICY "Dono ve seus pedidos" ON loja_pedidos
  FOR SELECT USING (auth.uid() = user_id OR is_admin());
-- Gestor só altera campos operacionais pelo app (retirado/cancelado); criação é da edge.
DROP POLICY IF EXISTS "Dono atualiza seus pedidos" ON loja_pedidos;
CREATE POLICY "Dono atualiza seus pedidos" ON loja_pedidos
  FOR UPDATE USING (auth.uid() = user_id OR is_admin())
  WITH CHECK (auth.uid() = user_id OR is_admin());

-- Inscrições em eventos (uma por pedido pago)
CREATE TABLE IF NOT EXISTS loja_inscricoes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  pedido_id UUID NOT NULL REFERENCES loja_pedidos(id) ON DELETE CASCADE,
  produto_id UUID REFERENCES loja_produtos(id) ON DELETE SET NULL,
  devedor_id UUID REFERENCES devedores(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'confirmada',  -- confirmada | cancelada
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_loja_inscricoes_produto ON loja_inscricoes (produto_id, status);
ALTER TABLE loja_inscricoes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Dono ve inscricoes" ON loja_inscricoes;
CREATE POLICY "Dono ve inscricoes" ON loja_inscricoes
  FOR ALL USING (auth.uid() = user_id OR is_admin())
  WITH CHECK (auth.uid() = user_id OR is_admin());

-- Realtime para o toast "nova venda" (ignora se já estiver na publicação)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    BEGIN
      ALTER PUBLICATION supabase_realtime ADD TABLE loja_pedidos;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
  END IF;
END $$;

-- ------------------------------------------------------------
-- 5. Ligações com o que já existe
-- ------------------------------------------------------------
-- O webhook do Asaas acha a cobrança em `boletos` pelo asaas_id; com pedido_id
-- ele sabe que é da loja e roteia para processarPedidoLoja.
ALTER TABLE boletos ADD COLUMN IF NOT EXISTS pedido_id UUID REFERENCES loja_pedidos(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_boletos_pedido ON boletos (pedido_id);

ALTER TABLE cobrancas_avulsas ADD COLUMN IF NOT EXISTS pedido_id UUID REFERENCES loja_pedidos(id) ON DELETE SET NULL;
ALTER TABLE cobrancas_avulsas ADD COLUMN IF NOT EXISTS origem TEXT DEFAULT 'manual';  -- manual | loja
CREATE INDEX IF NOT EXISTS idx_cobrancas_avulsas_pedido ON cobrancas_avulsas (pedido_id);

-- devedores.origem já é texto livre ('manual' | 'agendamento' | 'autocadastro'); a loja grava 'loja'.

-- ------------------------------------------------------------
-- 6. Vagas de turma fixa (fonte única, conta os alunos fixos ativos)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION loja_vagas_turma(p_aula_id UUID)
RETURNS INT
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT GREATEST(0,
    COALESCE((SELECT a.capacidade FROM aulas a WHERE a.id = p_aula_id), 0)
    - (SELECT COUNT(*)::int FROM aulas_fixos f
         JOIN devedores d ON d.id = f.devedor_id
        WHERE f.aula_id = p_aula_id
          AND f.ativo IS DISTINCT FROM false
          AND (d.lixo IS NULL OR d.lixo = false))
  );
$$;

-- Vincula o aluno do pedido às turmas escolhidas, com trava de linha nas aulas
-- para dois alunos não levarem a última vaga ao mesmo tempo.
-- Retorna jsonb {ok:true, aula_ids:[...]} ou {ok:false, code:'lotado'|'invalida'|..., aula_id}
CREATE OR REPLACE FUNCTION loja_vincular_turmas(p_pedido_id UUID, p_aula_ids UUID[])
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_pedido loja_pedidos%ROWTYPE;
  v_produto loja_produtos%ROWTYPE;
  v_aula aulas%ROWTYPE;
  v_aula_id UUID;
  v_ocupadas INT;
  v_qtd INT;
  v_ids UUID[];
BEGIN
  SELECT * INTO v_pedido FROM loja_pedidos WHERE id = p_pedido_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'code', 'pedido_nao_encontrado'); END IF;
  IF v_pedido.status <> 'turma_pendente' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'pedido_sem_turma_pendente', 'status', v_pedido.status);
  END IF;
  IF v_pedido.devedor_id IS NULL THEN RETURN jsonb_build_object('ok', false, 'code', 'sem_aluno'); END IF;

  SELECT * INTO v_produto FROM loja_produtos WHERE id = v_pedido.produto_id;
  v_qtd := COALESCE(v_produto.qtd_turmas, 1);

  IF p_aula_ids IS NULL OR array_length(p_aula_ids, 1) IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'nenhuma_turma');
  END IF;
  IF v_qtd > 0 AND array_length(p_aula_ids, 1) <> v_qtd THEN
    RETURN jsonb_build_object('ok', false, 'code', 'quantidade_invalida', 'esperado', v_qtd);
  END IF;

  -- Trava e valida cada aula (ordem fixa para evitar deadlock)
  v_ids := ARRAY(SELECT DISTINCT u FROM unnest(p_aula_ids) AS u ORDER BY u);
  FOREACH v_aula_id IN ARRAY v_ids LOOP
    SELECT * INTO v_aula FROM aulas WHERE id = v_aula_id FOR UPDATE;
    IF NOT FOUND OR v_aula.user_id <> v_pedido.user_id OR v_aula.ativo IS DISTINCT FROM true OR v_aula.devedor_id IS NOT NULL THEN
      RETURN jsonb_build_object('ok', false, 'code', 'turma_invalida', 'aula_id', v_aula_id);
    END IF;
    IF v_produto.modalidade_id IS NOT NULL AND v_aula.modalidade_id IS DISTINCT FROM v_produto.modalidade_id THEN
      RETURN jsonb_build_object('ok', false, 'code', 'turma_invalida', 'aula_id', v_aula_id);
    END IF;

    -- já está nessa turma? então não ocupa vaga nova
    IF NOT EXISTS (SELECT 1 FROM aulas_fixos f WHERE f.aula_id = v_aula_id AND f.devedor_id = v_pedido.devedor_id AND f.ativo IS DISTINCT FROM false) THEN
      SELECT COUNT(*) INTO v_ocupadas FROM aulas_fixos f
        JOIN devedores d ON d.id = f.devedor_id
       WHERE f.aula_id = v_aula_id AND f.ativo IS DISTINCT FROM false AND (d.lixo IS NULL OR d.lixo = false);
      IF v_ocupadas >= COALESCE(v_aula.capacidade, 0) THEN
        RETURN jsonb_build_object('ok', false, 'code', 'lotado', 'aula_id', v_aula_id);
      END IF;
    END IF;
  END LOOP;

  -- Tudo validado: insere/reativa (mesma lógica de AgendaFixoModal.adicionarFixoEm)
  FOREACH v_aula_id IN ARRAY p_aula_ids LOOP
    INSERT INTO aulas_fixos (aula_id, devedor_id, user_id, ativo)
    VALUES (v_aula_id, v_pedido.devedor_id, v_pedido.user_id, true)
    ON CONFLICT (aula_id, devedor_id) DO UPDATE SET ativo = true, updated_at = NOW();
  END LOOP;

  UPDATE loja_pedidos
     SET aula_ids = p_aula_ids, status = 'concluido', updated_at = NOW()
   WHERE id = p_pedido_id;

  RETURN jsonb_build_object('ok', true, 'aula_ids', to_jsonb(p_aula_ids));
END;
$$;

-- ------------------------------------------------------------
-- 7. Estoque e vagas de evento
-- ------------------------------------------------------------
-- Reserva 1 unidade (produto com estoque finito). Retorna true se reservou ou
-- se o item é ilimitado; false se esgotado.
CREATE OR REPLACE FUNCTION loja_reservar_estoque(p_produto_id UUID, p_variacao TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_prod loja_produtos%ROWTYPE;
  v_idx INT;
  v_est INT;
BEGIN
  SELECT * INTO v_prod FROM loja_produtos WHERE id = p_produto_id FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;

  IF p_variacao IS NOT NULL AND v_prod.variacoes IS NOT NULL THEN
    SELECT ord - 1 INTO v_idx
      FROM jsonb_array_elements(v_prod.variacoes) WITH ORDINALITY AS t(el, ord)
     WHERE el->>'nome' = p_variacao LIMIT 1;
    IF v_idx IS NULL THEN RETURN false; END IF;
    IF (v_prod.variacoes->v_idx->>'estoque') IS NULL THEN RETURN true; END IF;  -- ilimitado
    v_est := (v_prod.variacoes->v_idx->>'estoque')::int;
    IF v_est <= 0 THEN RETURN false; END IF;
    UPDATE loja_produtos
       SET variacoes = jsonb_set(variacoes, ARRAY[v_idx::text, 'estoque'], to_jsonb(v_est - 1)), updated_at = NOW()
     WHERE id = p_produto_id;
    RETURN true;
  END IF;

  IF v_prod.estoque IS NULL THEN RETURN true; END IF;
  IF v_prod.estoque <= 0 THEN RETURN false; END IF;
  UPDATE loja_produtos SET estoque = estoque - 1, updated_at = NOW() WHERE id = p_produto_id;
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION loja_devolver_estoque(p_produto_id UUID, p_variacao TEXT)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_prod loja_produtos%ROWTYPE;
  v_idx INT;
  v_est INT;
BEGIN
  SELECT * INTO v_prod FROM loja_produtos WHERE id = p_produto_id FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;

  IF p_variacao IS NOT NULL AND v_prod.variacoes IS NOT NULL THEN
    SELECT ord - 1 INTO v_idx
      FROM jsonb_array_elements(v_prod.variacoes) WITH ORDINALITY AS t(el, ord)
     WHERE el->>'nome' = p_variacao LIMIT 1;
    IF v_idx IS NULL OR (v_prod.variacoes->v_idx->>'estoque') IS NULL THEN RETURN; END IF;
    v_est := (v_prod.variacoes->v_idx->>'estoque')::int;
    UPDATE loja_produtos
       SET variacoes = jsonb_set(variacoes, ARRAY[v_idx::text, 'estoque'], to_jsonb(v_est + 1)), updated_at = NOW()
     WHERE id = p_produto_id;
    RETURN;
  END IF;

  IF v_prod.estoque IS NULL THEN RETURN; END IF;
  UPDATE loja_produtos SET estoque = estoque + 1, updated_at = NOW() WHERE id = p_produto_id;
END;
$$;

-- Vagas restantes de um evento: vagas - pedidos vivos (aguardando ou pagos)
CREATE OR REPLACE FUNCTION loja_vagas_evento(p_produto_id UUID)
RETURNS INT
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT CASE WHEN p.vagas IS NULL THEN NULL
              ELSE GREATEST(0, p.vagas - (
                SELECT COUNT(*)::int FROM loja_pedidos pe
                 WHERE pe.produto_id = p.id
                   AND pe.status NOT IN ('expirado','cancelado','estornado')))
         END
    FROM loja_produtos p WHERE p.id = p_produto_id;
$$;

-- ------------------------------------------------------------
-- 8. Expiração de pedidos não pagos (Pix vale 24h)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION loja_expirar_pedidos()
RETURNS INT
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  r RECORD;
  v_total INT := 0;
BEGIN
  FOR r IN
    SELECT id, produto_id, variacao, reservou_estoque
      FROM loja_pedidos
     WHERE status = 'aguardando_pagamento'
       AND created_at < NOW() - INTERVAL '24 hours'
     FOR UPDATE SKIP LOCKED
  LOOP
    UPDATE loja_pedidos SET status = 'expirado', updated_at = NOW() WHERE id = r.id;
    IF r.reservou_estoque AND r.produto_id IS NOT NULL THEN
      PERFORM loja_devolver_estoque(r.produto_id, r.variacao);
      UPDATE loja_pedidos SET reservou_estoque = false WHERE id = r.id;
    END IF;
    v_total := v_total + 1;
  END LOOP;
  RETURN v_total;
END;
$$;

-- Cron de hora em hora (só se pg_cron estiver instalado)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('loja-expirar-pedidos')
      WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'loja-expirar-pedidos');
    PERFORM cron.schedule('loja-expirar-pedidos', '15 * * * *', $cron$ SELECT loja_expirar_pedidos(); $cron$);
  END IF;
END $$;

-- ------------------------------------------------------------
-- 9. updated_at automático
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION loja_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS tr_loja_produtos_updated ON loja_produtos;
CREATE TRIGGER tr_loja_produtos_updated BEFORE UPDATE ON loja_produtos
  FOR EACH ROW EXECUTE FUNCTION loja_set_updated_at();
DROP TRIGGER IF EXISTS tr_loja_pedidos_updated ON loja_pedidos;
CREATE TRIGGER tr_loja_pedidos_updated BEFORE UPDATE ON loja_pedidos
  FOR EACH ROW EXECUTE FUNCTION loja_set_updated_at();

-- ------------------------------------------------------------
-- 10. Ativar o add-on numa conta (feito pelo admin, até existir cobrança no app)
-- ------------------------------------------------------------
-- insert into assinaturas_addons (user_id, addon, preco_contratado)
-- select id, 'vendas', 69.90 from usuarios where email = 'conta@exemplo.com'
-- on conflict do nothing;
--
-- Cancelar (vale até o fim do ciclo):
-- update assinaturas_addons set status = 'cancelado', fim = (select plano_vencimento::date from usuarios u where u.id = user_id)
--  where addon = 'vendas' and user_id = (select id from usuarios where email = 'conta@exemplo.com');

-- ------------------------------------------------------------
-- 11. Verificação
-- ------------------------------------------------------------
SELECT 'loja_produtos' AS tabela, COUNT(*) FROM loja_produtos
UNION ALL SELECT 'loja_pedidos', COUNT(*) FROM loja_pedidos
UNION ALL SELECT 'assinaturas_addons', COUNT(*) FROM assinaturas_addons;
