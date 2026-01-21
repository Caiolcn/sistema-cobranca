// Edge Function: Create Pix Payment
// Cria pagamento único via Pix no Mercado Pago

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!
const MP_ACCESS_TOKEN = Deno.env.get('MERCADOPAGO_ACCESS_TOKEN')!
const WEBHOOK_URL = Deno.env.get('MERCADOPAGO_WEBHOOK_URL')!

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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

    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: {
        headers: { Authorization: authHeader },
      },
    })

    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      throw new Error('Unauthorized')
    }

    console.log('👤 Usuário autenticado:', user.id)

    // Parse body
    const { plano } = await req.json()

    // Validar plano
    if (!['starter', 'pro', 'premium'].includes(plano)) {
      throw new Error('Plano inválido. Use "starter", "pro" ou "premium"')
    }

    console.log('📦 Criando pagamento Pix:', plano)

    // Definir valores dos planos
    const precos: Record<string, number> = {
      starter: 49.90,
      pro: 99.90,
      premium: 149.90,
    }
    const valor = precos[plano]

    // Buscar dados do usuário
    const { data: usuario } = await supabase
      .from('usuarios')
      .select('email, nome_completo, cpf_cnpj')
      .eq('id', user.id)
      .single()

    // Limpar e validar CPF/CNPJ
    let cpfCnpj = usuario?.cpf_cnpj?.replace(/\D/g, '') || ''

    // Função para validar CPF
    const validarCPF = (cpf: string): boolean => {
      if (cpf.length !== 11 || /^(\d)\1+$/.test(cpf)) return false
      let soma = 0
      for (let i = 0; i < 9; i++) soma += parseInt(cpf[i]) * (10 - i)
      let resto = (soma * 10) % 11
      if (resto === 10 || resto === 11) resto = 0
      if (resto !== parseInt(cpf[9])) return false
      soma = 0
      for (let i = 0; i < 10; i++) soma += parseInt(cpf[i]) * (11 - i)
      resto = (soma * 10) % 11
      if (resto === 10 || resto === 11) resto = 0
      return resto === parseInt(cpf[10])
    }

    // Se CPF inválido ou vazio, usar CPF de teste válido
    // CPF: 12345678909 passa na validação matemática
    if (!cpfCnpj || cpfCnpj.length < 11 || !validarCPF(cpfCnpj)) {
      cpfCnpj = '12345678909' // CPF válido matematicamente para teste
    }

    // Determinar tipo de documento
    const tipoDoc = cpfCnpj.length > 11 ? 'CNPJ' : 'CPF'

    // Dados do pagamento Pix
    const paymentData = {
      transaction_amount: valor,
      description: `MensalliZap - Plano ${plano.charAt(0).toUpperCase() + plano.slice(1)} (30 dias)`,
      payment_method_id: 'pix',
      payer: {
        email: usuario?.email || user.email,
        first_name: usuario?.nome_completo?.split(' ')[0] || 'Cliente',
        last_name: usuario?.nome_completo?.split(' ').slice(1).join(' ') || 'MensalliZap',
        identification: {
          type: tipoDoc,
          number: cpfCnpj
        }
      },
      external_reference: JSON.stringify({
        user_id: user.id,
        plano: plano,
        tipo: 'pix_mensal'
      }),
      notification_url: WEBHOOK_URL,
    }

    console.log('🚀 Enviando para Mercado Pago...')
    console.log('📋 Dados enviados:', JSON.stringify(paymentData, null, 2))

    // Criar pagamento no Mercado Pago
    const mpResponse = await fetch('https://api.mercadopago.com/v1/payments', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${MP_ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
        'X-Idempotency-Key': `${user.id}-${Date.now()}`, // Evita pagamentos duplicados
      },
      body: JSON.stringify(paymentData),
    })

    if (!mpResponse.ok) {
      const errorData = await mpResponse.text()
      console.error('❌ Status MP:', mpResponse.status)
      console.error('❌ Resposta completa MP:', errorData)
      throw new Error(`Erro ao criar pagamento Pix: ${mpResponse.status} - ${errorData}`)
    }

    const payment = await mpResponse.json()

    console.log('✅ Pagamento Pix criado:', payment.id)

    // Extrair dados do Pix
    const pixData = payment.point_of_interaction?.transaction_data

    // Salvar pagamento no banco
    await supabase
      .from('pagamentos_mercadopago')
      .insert({
        user_id: user.id,
        payment_id: payment.id.toString(),
        subscription_id: null, // Não é assinatura
        valor: valor,
        status: payment.status,
        status_detail: payment.status_detail,
        payment_type_id: 'pix',
        payment_method_id: 'pix',
        data_pagamento: new Date().toISOString(),
        raw_webhook: {
          plano: plano,
          tipo: 'pix_mensal',
          qr_code: pixData?.qr_code,
          ticket_url: pixData?.ticket_url,
        }
      })

    console.log('💾 Pagamento salvo no banco')

    // Retornar dados do Pix para o frontend
    return new Response(
      JSON.stringify({
        success: true,
        payment_id: payment.id,
        status: payment.status,
        pix: {
          qr_code: pixData?.qr_code, // Código copia-cola
          qr_code_base64: pixData?.qr_code_base64, // Imagem do QR Code
          ticket_url: pixData?.ticket_url, // Link alternativo
        },
        expiration: payment.date_of_expiration,
        valor: valor,
        plano: plano,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )

  } catch (error) {
    console.error('❌ Erro ao criar pagamento Pix:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  }
})
