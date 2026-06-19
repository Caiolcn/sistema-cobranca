// Edge Function: Portal do Cliente - Pagar
// Cria ou reutiliza cobrança Asaas a partir do portal público
// Acesso PÚBLICO (sem autenticação) - validação por portal_token

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const ASAAS_URLS: Record<string, string> = {
  sandbox: 'https://sandbox.asaas.com/api/v3',
  production: 'https://api.asaas.com/v3'
}

// Valida CPF (11 digitos + digitos verificadores). Asaas exige cpfCnpj no customer.
function isValidCpf(value: string): boolean {
  const cpf = (value || '').replace(/\D/g, '')
  if (cpf.length !== 11) return false
  if (/^(\d)\1{10}$/.test(cpf)) return false
  let soma = 0
  for (let i = 0; i < 9; i++) soma += parseInt(cpf[i]) * (10 - i)
  let d1 = 11 - (soma % 11)
  if (d1 >= 10) d1 = 0
  if (d1 !== parseInt(cpf[9])) return false
  soma = 0
  for (let i = 0; i < 10; i++) soma += parseInt(cpf[i]) * (11 - i)
  let d2 = 11 - (soma % 11)
  if (d2 >= 10) d2 = 0
  return d2 === parseInt(cpf[10])
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

  try {
    const { token, mensalidade_id, cpf, metodo } = await req.json()

    if (!token || !mensalidade_id) {
      return new Response(
        JSON.stringify({ error: 'token e mensalidade_id são obrigatórios' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Metodo escolhido pelo aluno -> billingType do Asaas. Default PIX (compat. com front antigo).
    const metodoEscolhido = (metodo || 'pix').toString().toLowerCase()
    const BILLING_TYPE: Record<string, string> = {
      pix: 'PIX',
      cartao: 'CREDIT_CARD',
      boleto: 'BOLETO'
    }
    if (!BILLING_TYPE[metodoEscolhido]) {
      return new Response(
        JSON.stringify({ error: 'Forma de pagamento inválida' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 1. Validar token e buscar devedor
    const { data: devedor, error: devedorError } = await supabase
      .from('devedores')
      .select('id, nome, telefone, cpf, user_id')
      .eq('portal_token', token)
      .or('lixo.is.null,lixo.eq.false')
      .single()

    if (devedorError || !devedor) {
      return new Response(
        JSON.stringify({ error: 'Token inválido' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 2. Validar que a mensalidade pertence ao devedor
    const { data: mensalidade, error: mensalidadeError } = await supabase
      .from('mensalidades')
      .select('id, valor, data_vencimento, status, devedor_id')
      .eq('id', mensalidade_id)
      .eq('devedor_id', devedor.id)
      .single()

    if (mensalidadeError || !mensalidade) {
      return new Response(
        JSON.stringify({ error: 'Mensalidade não encontrada para este cliente' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (mensalidade.status === 'pago') {
      return new Response(
        JSON.stringify({ error: 'Esta mensalidade já está paga' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 3. Verificar se já existe cobrança Asaas para esta mensalidade NO MESMO método
    // (cada método gera uma cobrança própria; PIX também reaproveita registros legados sem forma_pagamento)
    let boletoQuery = supabase
      .from('boletos')
      .select('invoice_url, boleto_url, asaas_id, status, forma_pagamento')
      .eq('mensalidade_id', mensalidade_id)
      .not('invoice_url', 'is', null)
    boletoQuery = metodoEscolhido === 'pix'
      ? boletoQuery.or('forma_pagamento.eq.pix,forma_pagamento.is.null')
      : boletoQuery.eq('forma_pagamento', metodoEscolhido)
    const { data: boletoExistente } = await boletoQuery
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    // 4. Buscar configuração Asaas do gestor (dono do devedor)
    const { data: usuario } = await supabase
      .from('usuarios')
      .select('asaas_api_key, asaas_ambiente, nome_empresa, asaas_formas_pagamento')
      .eq('id', devedor.user_id)
      .single()

    if (!usuario?.asaas_api_key) {
      return new Response(
        JSON.stringify({ error: 'Pagamento online não disponível no momento' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Trava server-side: o método precisa estar habilitado pelo gestor (PIX sempre liberado)
    const formasGestor = {
      pix: true,
      cartao: usuario.asaas_formas_pagamento?.cartao === true,
      boleto: usuario.asaas_formas_pagamento?.boleto === true
    }
    if (!formasGestor[metodoEscolhido as keyof typeof formasGestor]) {
      return new Response(
        JSON.stringify({ error: 'Esta forma de pagamento não está disponível' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const asaasApiKey = usuario.asaas_api_key
    const ambiente = usuario.asaas_ambiente || 'sandbox'
    const baseUrl = ASAAS_URLS[ambiente]

    // Helper: buscar QR Code PIX de um payment
    const fetchPixQrCode = async (paymentId: string) => {
      try {
        const qrResponse = await fetch(`${baseUrl}/payments/${paymentId}/pixQrCode`, {
          headers: { 'access_token': asaasApiKey }
        })
        if (qrResponse.ok) {
          const qrData = await qrResponse.json()
          return { encodedImage: qrData.encodedImage, payload: qrData.payload }
        }
      } catch (e) {
        console.error('⚠️ Erro ao buscar QR Code PIX:', e)
      }
      return null
    }

    if (boletoExistente?.asaas_id) {
      console.log('🔗 Reusando cobrança existente:', boletoExistente.asaas_id, metodoEscolhido)
      // PIX devolve QR inline; cartão/boleto vão pro checkout/boleto (invoice_url)
      const pixQr = metodoEscolhido === 'pix' ? await fetchPixQrCode(boletoExistente.asaas_id) : null
      return new Response(
        JSON.stringify({
          success: true,
          metodo: metodoEscolhido,
          invoice_url: boletoExistente.invoice_url,
          boleto_url: boletoExistente.boleto_url || null,
          pix_qr_code: pixQr?.encodedImage || null,
          pix_copia_cola: pixQr?.payload || null
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 5. Resolver CPF do devedor — captura no portal se ainda nao tiver
    let cpfLimpo = (devedor.cpf || '').replace(/\D/g, '')

    if (!isValidCpf(cpfLimpo)) {
      const cpfInformado = (cpf || '').replace(/\D/g, '')

      if (!cpfInformado) {
        // Sem CPF salvo e sem CPF informado: front exibe o campo pra digitar.
        // `code` = sinal pro front novo; `error` = texto amigavel pro front antigo.
        return new Response(
          JSON.stringify({ code: 'cpf_required', error: 'Para gerar o pagamento, informe o CPF do aluno.' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      if (!isValidCpf(cpfInformado)) {
        return new Response(
          JSON.stringify({ code: 'cpf_invalid', error: 'CPF inválido. Confira os números e tente novamente.' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      // Grava no devedor apenas se ainda estiver vazio (nunca sobrescreve um CPF existente)
      const { error: cpfUpdateError } = await supabase
        .from('devedores')
        .update({ cpf: cpfInformado })
        .eq('id', devedor.id)
        .or('cpf.is.null,cpf.eq.')

      if (cpfUpdateError) {
        console.error('⚠️ Erro ao salvar CPF do devedor:', cpfUpdateError)
      }

      cpfLimpo = cpfInformado
    }

    // 6. Buscar ou criar cliente no Asaas
    let asaasCustomerId: string

    const { data: cachedCustomer } = await supabase
      .from('asaas_clientes')
      .select('asaas_customer_id')
      .eq('devedor_id', devedor.id)
      .eq('user_id', devedor.user_id)
      .single()

    if (cachedCustomer?.asaas_customer_id) {
      asaasCustomerId = cachedCustomer.asaas_customer_id
    } else {
      const customerResponse = await fetch(`${baseUrl}/customers`, {
        method: 'POST',
        headers: { 'access_token': asaasApiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: devedor.nome,
          phone: devedor.telefone?.replace(/\D/g, '') || null,
          mobilePhone: devedor.telefone?.replace(/\D/g, '') || null,
          cpfCnpj: cpfLimpo,
          notificationDisabled: true,
        }),
      })

      if (!customerResponse.ok) {
        const errorData = await customerResponse.json()
        console.error('❌ Erro ao criar cliente Asaas:', errorData)
        return new Response(
          JSON.stringify({ error: 'Erro ao processar pagamento' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      const customer = await customerResponse.json()
      asaasCustomerId = customer.id

      await supabase.from('asaas_clientes').insert({
        user_id: devedor.user_id,
        devedor_id: devedor.id,
        asaas_customer_id: asaasCustomerId,
        nome: devedor.nome,
        cpf_cnpj: cpfLimpo,
        telefone: devedor.telefone
      })
    }

    // 7. Criar cobrança no Asaas no método escolhido pelo aluno
    // Asaas rejeita cobranca com dueDate no passado. Se a mensalidade ja venceu,
    // usa a data de hoje (UTC nunca fica no passado em relacao ao BRT).
    const hojeISO = new Date().toISOString().split('T')[0]
    const dueDateAsaas = mensalidade.data_vencimento < hojeISO ? hojeISO : mensalidade.data_vencimento

    const paymentResponse = await fetch(`${baseUrl}/payments`, {
      method: 'POST',
      headers: { 'access_token': asaasApiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customer: asaasCustomerId,
        billingType: BILLING_TYPE[metodoEscolhido],
        value: parseFloat(String(mensalidade.valor)),
        dueDate: dueDateAsaas,
        description: `Mensalidade - ${usuario.nome_empresa || 'MensalliZap'}`,
        externalReference: mensalidade_id,
        fine: { value: 2, type: 'PERCENTAGE' },
        interest: { value: 1, type: 'PERCENTAGE' },
      }),
    })

    if (!paymentResponse.ok) {
      const errorData = await paymentResponse.json()
      console.error('❌ Erro ao criar cobrança:', JSON.stringify(errorData))
      return new Response(
        JSON.stringify({ error: 'Erro ao gerar pagamento' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const payment = await paymentResponse.json()

    // 8. Salvar boleto no banco
    await supabase.from('boletos').insert({
      user_id: devedor.user_id,
      mensalidade_id: mensalidade_id,
      devedor_id: devedor.id,
      asaas_id: payment.id,
      asaas_customer_id: asaasCustomerId,
      valor: parseFloat(String(mensalidade.valor)),
      data_vencimento: mensalidade.data_vencimento,
      status: payment.status,
      forma_pagamento: metodoEscolhido,
      boleto_url: payment.bankSlipUrl,
      invoice_url: payment.invoiceUrl,
      descricao: `Mensalidade - ${usuario.nome_empresa || 'MensalliZap'}`
    })

    console.log('✅ Cobrança criada via portal:', payment.id, metodoEscolhido)

    // 9. PIX devolve QR inline; cartão/boleto vão pro checkout/boleto (invoice_url)
    const pixQr = metodoEscolhido === 'pix' ? await fetchPixQrCode(payment.id) : null

    return new Response(
      JSON.stringify({
        success: true,
        metodo: metodoEscolhido,
        invoice_url: payment.invoiceUrl,
        boleto_url: payment.bankSlipUrl || null,
        pix_qr_code: pixQr?.encodedImage || null,
        pix_copia_cola: pixQr?.payload || null
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('❌ Erro no portal-pagar:', error)
    return new Response(
      JSON.stringify({ error: 'Erro interno do servidor' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
