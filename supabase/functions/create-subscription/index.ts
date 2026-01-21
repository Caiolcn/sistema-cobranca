// Edge Function: Create Subscription
// Cria assinatura recorrente no Mercado Pago

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

    console.log('📦 Criando assinatura:', plano)

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
      .select('email, nome_completo')
      .eq('id', user.id)
      .single()

    // Preparar dados da assinatura para o Mercado Pago
    // Para testes locais, usar uma URL pública dummy (MP não aceita localhost)
    const origin = req.headers.get('origin') || ''
    const isLocalhost = origin.includes('localhost') || origin.includes('127.0.0.1')
    const backUrl = isLocalhost
      ? 'https://www.google.com' // MP não aceita localhost, usa URL dummy
      : `${origin}/app/upgrade/success`

    // Data de início: agora + 1 minuto (MP exige data futura)
    const startDate = new Date()
    startDate.setMinutes(startDate.getMinutes() + 1)
    const startDateISO = startDate.toISOString()

    const subscriptionData = {
      reason: `MensalliZap - Plano ${plano.charAt(0).toUpperCase() + plano.slice(1)}`,
      auto_recurring: {
        frequency: 1,
        frequency_type: 'months',
        transaction_amount: valor,
        currency_id: 'BRL',
        start_date: startDateISO, // ✅ Campo obrigatório
      },
      payment_methods_allowed: {
        payment_types: [
          { id: 'credit_card' },
          { id: 'debit_card' },
          { id: 'account_money' }
        ]
      },
      back_url: backUrl,
      payer_email: usuario?.email || user.email,
      external_reference: user.id, // CRUCIAL para identificar o usuário no webhook
      notification_url: WEBHOOK_URL,
    }

    console.log('🚀 Enviando para Mercado Pago...')
    console.log('📋 Dados enviados:', JSON.stringify(subscriptionData, null, 2))

    // Criar assinatura no Mercado Pago
    const mpResponse = await fetch('https://api.mercadopago.com/preapproval', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${MP_ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(subscriptionData),
    })

    if (!mpResponse.ok) {
      const errorData = await mpResponse.text()
      console.error('❌ Status MP:', mpResponse.status)
      console.error('❌ Resposta completa MP:', errorData)
      console.error('❌ Dados enviados:', JSON.stringify(subscriptionData, null, 2))
      throw new Error(`Erro ao criar assinatura no MP: ${mpResponse.status} - ${errorData}`)
    }

    const subscription = await mpResponse.json()

    console.log('✅ Assinatura criada no MP:', subscription.id)

    // Salvar assinatura pendente no banco
    await supabase
      .from('assinaturas_mercadopago')
      .insert({
        user_id: user.id,
        subscription_id: subscription.id,
        preapproval_id: subscription.id,
        plano,
        status: 'pending',
        valor,
        external_reference: user.id,
        metadata: subscription,
      })

    console.log('💾 Assinatura salva no banco')

    // Retornar init_point para redirecionar usuário
    return new Response(
      JSON.stringify({
        success: true,
        init_point: subscription.init_point,
        subscription_id: subscription.id,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )

  } catch (error) {
    console.error('❌ Erro ao criar assinatura:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  }
})
