-- Desconto concedido na baixa manual da mensalidade (/financeiro > Marcar como Pago).
--
-- Fica em coluna propria e NUNCA abatido de `valor`: `valor` e a base do plano e
-- criarProximaMensalidade nasce dele (mensalidadeAtual.valor) quando o aluno nao tem
-- plano vinculado — descontar ali propagaria o desconto pra sempre.
--
-- valor_pago segue sendo o total que entrou de fato: base + multa + juros - desconto.
-- Cortesia (100% off) grava valor_pago = 0, entao no front sempre `valor_pago != null`
-- e nunca `valor_pago || valor` (o `||` trata o zero como "nao registrado").
alter table public.mensalidades
  add column if not exists valor_desconto numeric default 0;

comment on column public.mensalidades.valor_desconto is
  'Desconto concedido na baixa manual (R$). Sempre >= 0; abatido de valor_pago. Nao altera `valor` (base do plano).';
