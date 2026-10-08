// Edge Function: Loja - Pagar (trocar método / gerar novo Pix)
// POST { token, metodo }
// Para um pedido já criado: reaproveita a cobrança do mesmo método se existir,
// senão cria outra no Asaas. Pedido expirado volta para aguardando_pagamento
// (re-reservando estoque quando o item é finito).
// Acesso PÚBLICO (validação pelo token do pedido).

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
  corsHeaders, json, erro, hojeISO, carregarEmpresaPorId, gateLoja, asaasCtx, ensureWebhook,
  fetchPixQrCode, garantirCustomer, criarCobrancaAsaas, pedidoPublico,
} from '../_shared/loja.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return erro('metodo', 'Método não permitido', 405)

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

  try {
    const { token, metodo: metodoBody } = await req.json().catch(() => ({}))
    if (!token) return erro('dados', 'Pedido inválido', 400)

    const { data: pedido } = await supabase.from('loja_pedidos').select('*').eq('token', String(token)).maybeSingle()
    if (!pedido) return erro('nao_encontrado', 'Pedido não encontrado', 404)
    if (!['aguardando_pagamento', 'expirado'].includes(pedido.status)) {
      return erro('status', 'Este pedido não está aguardando pagamento', 409, { status: pedido.status })
    }

    const empresa = await carregarEmpresaPorId(supabase, pedido.user_id)
    const gate = await gateLoja(supabase, empresa, { exigirAsaas: true })
    if (!gate.ok) return erro(gate.code === 'asaas' ? 'asaas_indisponivel' : gate.code, gate.motivo, 403)

    const metodo = String(metodoBody || pedido.metodo || 'pix').toLowerCase()
    const formas = empresa.asaas_formas_pagamento || {}
    const liberado: Record<string, boolean> = { pix: true, cartao: formas.cartao === true, boleto: formas.boleto === true }
    if (!liberado[metodo]) return erro('metodo', 'Forma de pagamento indisponível', 400)

    const { data: produto } = await supabase.from('loja_produtos').select('id, tipo, ativo, estoque, variacoes, vagas, data_evento').eq('id', pedido.produto_id).maybeSingle()
    if (!produto || !produto.ativo) return erro('produto_inativo', 'Este item não está mais disponível', 410)

    // Pedido expirado: volta para a fila, re-reservando estoque se for finito
    if (pedido.status === 'expirado') {
      if (produto.tipo === 'produto') {
        const { data: ok } = await supabase.rpc('loja_reservar_estoque', { p_produto_id: produto.id, p_variacao: pedido.variacao })
        if (ok === false) return erro('esgotado', 'Este item esgotou enquanto o pedido estava expirado', 409)
      }
      if (produto.tipo === 'evento' && produto.vagas != null) {
        const { data: vagas } = await supabase.rpc('loja_vagas_evento', { p_produto_id: produto.id })
        if (vagas != null && vagas <= 0) return erro('lotado', 'As vagas deste evento acabaram', 409)
      }
      const finito = produto.tipo === 'produto' && (pedido.variacao
        ? (Array.isArray(produto.variacoes) ? produto.variacoes.find((v: any) => String(v.nome) === pedido.variacao)?.estoque != null : false)
        : produto.estoque != null)
      await supabase.from('loja_pedidos').update({ status: 'aguardando_pagamento', reservou_estoque: finito, created_at: new Date().toISOString() }).eq('id', pedido.id)
    }

    const ctx = asaasCtx(empresa, SUPABASE_URL)
    await ensureWebhook(ctx)

    // Reaproveita cobrança do mesmo método ainda válida
    const { data: existente } = await supabase
      .from('boletos')
      .select('asaas_id, invoice_url, boleto_url, status, forma_pagamento')
      .eq('pedido_id', pedido.id)
      .eq('forma_pagamento', metodo)
      .not('status', 'in', '(CANCELED,REFUNDED,DELETED,OVERDUE)')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (existente?.asaas_id && pedido.status !== 'expirado') {
      const pixQr = metodo === 'pix' ? await fetchPixQrCode(ctx, existente.asaas_id) : null
      await supabase.from('loja_pedidos').update({ metodo, asaas_payment_id: existente.asaas_id, invoice_url: existente.invoice_url }).eq('id', pedido.id)
      return json({
        sucesso: true, token: pedido.token,
        pedido: pedidoPublico({ ...pedido, metodo, status: 'aguardando_pagamento' }),
        pagamento: {
          metodo, valor: Number(pedido.valor), invoice_url: existente.invoice_url, boleto_url: existente.boleto_url || null,
          pix_qr_code: pixQr?.encodedImage || null, pix_copia_cola: pixQr?.payload || null,
        },
      })
    }

    const { data: devedor } = await supabase.from('devedores').select('id, user_id, nome, telefone, cpf').eq('id', pedido.devedor_id).maybeSingle()
    if (!devedor) return erro('interno', 'Cadastro do aluno não encontrado', 500)

    const cpf = pedido.responsavel_cpf || pedido.cpf || devedor.cpf
    const customer = await garantirCustomer(supabase, ctx, devedor, cpf)
    if (!customer.id) return erro('asaas_indisponivel', customer.erro || 'Pagamento indisponível', 502)

    const descricao = `${pedido.item_nome}${pedido.variacao ? ` (${pedido.variacao})` : ''} - ${empresa.nome_empresa || 'Mensalli'}`
    const cobranca = await criarCobrancaAsaas(ctx, {
      customer: customer.id, metodo, valor: Number(pedido.valor), dueDate: hojeISO(), descricao, externalReference: `loja:${pedido.id}`,
    })
    if (!cobranca.payment) return erro('asaas_indisponivel', cobranca.erro || 'Erro ao gerar pagamento', 502)
    const payment = cobranca.payment

    await supabase.from('boletos').insert({
      user_id: pedido.user_id, devedor_id: devedor.id, pedido_id: pedido.id,
      asaas_id: payment.id, asaas_customer_id: customer.id,
      valor: Number(pedido.valor), data_vencimento: hojeISO(), status: payment.status, forma_pagamento: metodo,
      boleto_url: payment.bankSlipUrl || null, invoice_url: payment.invoiceUrl || null, descricao,
    })
    await supabase.from('loja_pedidos').update({ metodo, asaas_payment_id: payment.id, invoice_url: payment.invoiceUrl || null }).eq('id', pedido.id)

    const pixQr = metodo === 'pix' ? await fetchPixQrCode(ctx, payment.id) : null
    return json({
      sucesso: true, token: pedido.token,
      pedido: pedidoPublico({ ...pedido, metodo, status: 'aguardando_pagamento', asaas_payment_id: payment.id, invoice_url: payment.invoiceUrl }),
      pagamento: {
        metodo, valor: Number(pedido.valor), invoice_url: payment.invoiceUrl || null, boleto_url: payment.bankSlipUrl || null,
        pix_qr_code: pixQr?.encodedImage || null, pix_copia_cola: pixQr?.payload || null,
      },
    })
  } catch (err) {
    console.error('Erro loja-pagar:', err)
    return erro('interno', 'Erro interno do servidor', 500)
  }
})
