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

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

  try {
    const { token, mensalidade_id } = await req.json()

    if (!token || !mensalidade_id) {
      return new Response(
        JSON.stringify({ error: 'token e mensalidade_id são obrigatórios' }),
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

    // 3. Verificar se já existe boleto Asaas para esta mensalidade
    const { data: boletoExistente } = await supabase
      .from('boletos')
      .select('invoice_url, asaas_id, status')
      .eq('mensalidade_id', mensalidade_id)
      .not('invoice_url', 'is', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    // 4. Buscar configuração Asaas do gestor (dono do devedor)
    const { data: usuario } = await supabase
      .from('usuarios')
      .select('asaas_api_key, asaas_ambiente, nome_empresa')
      .eq('id', devedor.user_id)
      .single()

    if (!usuario?.asaas_api_key) {
      return new Response(
        JSON.stringify({ error: 'Pagamento online não disponível no momento' }),
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
      console.log('🔗 Reusando boleto existente:', boletoExistente.asaas_id)
      const pixQr = await fetchPixQrCode(boletoExistente.asaas_id)
      return new Response(
        JSON.stringify({
          success: true,
          invoice_url: boletoExistente.invoice_url,
          pix_qr_code: pixQr?.encodedImage || null,
          pix_copia_cola: pixQr?.payload || null
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 5. Validar CPF do devedor
    const cpfLimpo = devedor.cpf?.replace(/\D/g, '') || ''
    if (!cpfLimpo || cpfLimpo.length < 11) {
      return new Response(
        JSON.stringify({ error: 'CPF do cliente não cadastrado. Entre em contato com o estabelecimento.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
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

    // 7. Criar cobrança PIX no Asaas
    const paymentResponse = await fetch(`${baseUrl}/payments`, {
      method: 'POST',
      headers: { 'access_token': asaasApiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customer: asaasCustomerId,
        billingType: 'PIX',
        value: parseFloat(String(mensalidade.valor)),
        dueDate: mensalidade.data_vencimento,
        description: `Mensalidade - ${usuario.nome_empresa || 'MensalliZap'}`,
        externalReference: mensalidade_id,
        fine: { value: 2, type: 'PERCENTAGE' },
        interest: { value: 1, type: 'PERCENTAGE' },
      }),
    })

    if (!paymentResponse.ok) {
      const errorData = await paymentResponse.json()
      console.error('❌ Erro ao criar cobrança:', errorData)
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
      boleto_url: payment.bankSlipUrl,
      invoice_url: payment.invoiceUrl,
      descricao: `Mensalidade - ${usuario.nome_empresa || 'MensalliZap'}`
    })

    console.log('✅ Cobrança criada via portal:', payment.id)

    // 9. Buscar QR Code PIX da cobrança recém-criada
    const pixQr = await fetchPixQrCode(payment.id)

    return new Response(
      JSON.stringify({
        success: true,
        invoice_url: payment.invoiceUrl,
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
