// Edge Function: Asaas Create Payment
// Cria boleto ou BolePix no Asaas

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// URLs do Asaas
const ASAAS_URLS = {
  sandbox: 'https://sandbox.asaas.com/api/v3',
  production: 'https://api.asaas.com/v3'
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Autenticar usuário via Supabase
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      throw new Error('Authorization header missing')
    }

    const supabaseUser = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      global: {
        headers: { Authorization: authHeader },
      },
    })

    // Client com service role para operações administrativas
    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    const { data: { user }, error: userError } = await supabaseUser.auth.getUser()
    if (userError || !user) {
      throw new Error('Unauthorized')
    }

    console.log('👤 Usuário autenticado:', user.id)

    // Parse body
    const {
      mensalidade_id,
      devedor_id,
      valor,
      data_vencimento,
      descricao,
      billing_type = 'UNDEFINED' // BOLETO, PIX, UNDEFINED (BolePix)
    } = await req.json()

    // Validar campos obrigatórios
    if (!devedor_id || !valor || !data_vencimento) {
      throw new Error('Campos obrigatórios: devedor_id, valor, data_vencimento')
    }

    // Buscar configuração do Asaas do usuário
    const { data: usuario, error: userConfigError } = await supabaseAdmin
      .from('usuarios')
      .select('asaas_api_key, asaas_ambiente, nome_empresa')
      .eq('id', user.id)
      .single()

    if (userConfigError || !usuario?.asaas_api_key) {
      throw new Error('Asaas não configurado. Configure sua API Key nas configurações.')
    }

    const asaasApiKey = usuario.asaas_api_key
    const ambiente = usuario.asaas_ambiente || 'sandbox'
    const baseUrl = ASAAS_URLS[ambiente as keyof typeof ASAAS_URLS]

    console.log(`📄 Ambiente Asaas: ${ambiente}`)
    console.log('🔍 Buscando devedor:', { devedor_id, user_id: user.id })

    // Buscar dados do devedor (tabela usa 'cpf' não 'cpf_cnpj', e não tem 'email')
    const { data: devedor, error: devedorError } = await supabaseAdmin
      .from('devedores')
      .select('id, nome, telefone, cpf, user_id')
      .eq('id', devedor_id)
      .single()

    console.log('📦 Resultado busca devedor:', { devedor, devedorError })

    if (devedorError || !devedor) {
      throw new Error(`Devedor não encontrado. ID: ${devedor_id}, Erro: ${devedorError?.message || 'N/A'}`)
    }

    // Verificar se o devedor pertence ao usuário
    if (devedor.user_id !== user.id) {
      throw new Error(`Devedor não pertence ao usuário. Devedor user_id: ${devedor.user_id}, User ID: ${user.id}`)
    }

    console.log('👤 Devedor:', devedor.nome)

    // Validar se o devedor tem CPF (obrigatório para boletos no Asaas)
    const cpfLimpo = devedor.cpf?.replace(/\D/g, '') || ''
    if (!cpfLimpo || cpfLimpo.length < 11) {
      throw new Error('CPF do cliente é obrigatório para gerar boleto. Cadastre o CPF do cliente primeiro.')
    }

    // Verificar/criar cliente no Asaas
    let asaasCustomerId: string

    // Buscar cliente no cache
    const { data: cachedCustomer } = await supabaseAdmin
      .from('asaas_clientes')
      .select('asaas_customer_id')
      .eq('devedor_id', devedor_id)
      .eq('user_id', user.id)
      .single()

    if (cachedCustomer?.asaas_customer_id) {
      asaasCustomerId = cachedCustomer.asaas_customer_id
      console.log('✅ Cliente encontrado no cache:', asaasCustomerId)
    } else {
      // Criar cliente no Asaas
      console.log('🆕 Criando cliente no Asaas...')

      const customerData = {
        name: devedor.nome,
        email: null, // Tabela devedores não tem email
        phone: devedor.telefone?.replace(/\D/g, '') || null,
        mobilePhone: devedor.telefone?.replace(/\D/g, '') || null,
        cpfCnpj: cpfLimpo, // CPF já validado acima
        notificationDisabled: true, // Sem email, desabilitar notificações
      }

      const customerResponse = await fetch(`${baseUrl}/customers`, {
        method: 'POST',
        headers: {
          'access_token': asaasApiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(customerData),
      })

      if (!customerResponse.ok) {
        const errorData = await customerResponse.json()
        console.error('❌ Erro ao criar cliente:', errorData)
        throw new Error(errorData.errors?.[0]?.description || 'Erro ao criar cliente no Asaas')
      }

      const customer = await customerResponse.json()
      asaasCustomerId = customer.id

      console.log('✅ Cliente criado no Asaas:', asaasCustomerId)

      // Salvar no cache
      await supabaseAdmin
        .from('asaas_clientes')
        .insert({
          user_id: user.id,
          devedor_id: devedor_id,
          asaas_customer_id: asaasCustomerId,
          nome: devedor.nome,
          cpf_cnpj: cpfLimpo,
          email: null,
          telefone: devedor.telefone
        })
    }

    // Criar cobrança no Asaas
    console.log('💳 Criando cobrança no Asaas...')

    const paymentData = {
      customer: asaasCustomerId,
      billingType: billing_type, // BOLETO, PIX, UNDEFINED (aceita ambos)
      value: parseFloat(valor),
      dueDate: data_vencimento, // Formato: YYYY-MM-DD
      description: descricao || `Mensalidade - ${usuario.nome_empresa || 'MensalliZap'}`,
      externalReference: mensalidade_id || devedor_id, // Limite de 100 caracteres
      // Configurações de juros e multa (opcional)
      fine: {
        value: 2, // 2% de multa
        type: 'PERCENTAGE'
      },
      interest: {
        value: 1, // 1% de juros ao mês
        type: 'PERCENTAGE'
      },
      // Desconto para pagamento antecipado (opcional)
      // discount: {
      //   value: 5,
      //   dueDateLimitDays: 3,
      //   type: 'PERCENTAGE'
      // }
    }

    const paymentResponse = await fetch(`${baseUrl}/payments`, {
      method: 'POST',
      headers: {
        'access_token': asaasApiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(paymentData),
    })

    if (!paymentResponse.ok) {
      const errorData = await paymentResponse.json()
      console.error('❌ Erro ao criar cobrança:', errorData)
      throw new Error(errorData.errors?.[0]?.description || 'Erro ao criar cobrança no Asaas')
    }

    const payment = await paymentResponse.json()

    console.log('✅ Cobrança criada:', payment.id)

    // Buscar dados do boleto (linha digitável, etc)
    let boletoInfo = null
    if (billing_type === 'BOLETO' || billing_type === 'UNDEFINED') {
      const boletoResponse = await fetch(`${baseUrl}/payments/${payment.id}/identificationField`, {
        headers: {
          'access_token': asaasApiKey,
        },
      })

      if (boletoResponse.ok) {
        boletoInfo = await boletoResponse.json()
        console.log('📄 Linha digitável obtida')
      }
    }

    // Buscar QR Code PIX (se disponível)
    let pixInfo = null
    if (billing_type === 'PIX' || billing_type === 'UNDEFINED') {
      const pixResponse = await fetch(`${baseUrl}/payments/${payment.id}/pixQrCode`, {
        headers: {
          'access_token': asaasApiKey,
        },
      })

      if (pixResponse.ok) {
        pixInfo = await pixResponse.json()
        console.log('📱 QR Code PIX obtido')
      }
    }

    // Salvar boleto no banco de dados
    const { data: boleto, error: boletoError } = await supabaseAdmin
      .from('boletos')
      .insert({
        user_id: user.id,
        mensalidade_id: mensalidade_id || null,
        devedor_id: devedor_id,
        asaas_id: payment.id,
        asaas_customer_id: asaasCustomerId,
        valor: parseFloat(valor),
        data_vencimento: data_vencimento,
        status: payment.status,
        boleto_url: payment.bankSlipUrl,
        invoice_url: payment.invoiceUrl,
        linha_digitavel: boletoInfo?.identificationField || null,
        nosso_numero: payment.nossoNumero || null,
        pix_qrcode_url: pixInfo?.encodedImage ? `data:image/png;base64,${pixInfo.encodedImage}` : null,
        pix_copia_cola: pixInfo?.payload || null,
        pix_expiration_date: pixInfo?.expirationDate || null,
        descricao: descricao
      })
      .select()
      .single()

    if (boletoError) {
      console.error('❌ Erro ao salvar boleto:', boletoError)
      // Não falhar a operação, o boleto foi criado no Asaas
    }

    console.log('💾 Boleto salvo no banco:', boleto?.id)

    // Se tiver mensalidade_id, atualizar a mensalidade
    if (mensalidade_id) {
      await supabaseAdmin
        .from('mensalidades')
        .update({
          forma_pagamento: billing_type === 'PIX' ? 'PIX' : 'Boleto'
        })
        .eq('id', mensalidade_id)
    }

    // Retornar dados para o frontend
    return new Response(
      JSON.stringify({
        success: true,
        boleto_id: boleto?.id,
        asaas_id: payment.id,
        status: payment.status,
        valor: parseFloat(valor),
        data_vencimento: data_vencimento,
        // URLs
        boleto_url: payment.bankSlipUrl,
        invoice_url: payment.invoiceUrl,
        // Boleto
        linha_digitavel: boletoInfo?.identificationField || null,
        nosso_numero: payment.nossoNumero || null,
        // PIX
        pix_qrcode_base64: pixInfo?.encodedImage || null,
        pix_copia_cola: pixInfo?.payload || null,
        pix_expiration_date: pixInfo?.expirationDate || null,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )

  } catch (error) {
    console.error('❌ Erro:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  }
})
