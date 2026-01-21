// Edge Function: Mercado Pago Webhook Receiver
// Recebe e processa webhooks do Mercado Pago (assinaturas e pagamentos)

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const MP_ACCESS_TOKEN = Deno.env.get('MERCADOPAGO_ACCESS_TOKEN')!

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, x-signature, x-request-id',
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Criar cliente Supabase com service_role para bypass RLS
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    // Parse request body
    const body = await req.json()
    const headers = Object.fromEntries(req.headers.entries())

    console.log('📥 Webhook recebido:', {
      type: body.type,
      action: body.action,
      resource: body.data?.id,
    })

    // Log webhook no banco para auditoria
    const { data: logData } = await supabase
      .from('webhook_logs')
      .insert({
        event_type: body.type || 'unknown',
        resource_id: body.data?.id || null,
        payload: body,
        headers,
        ip_origem: headers['x-forwarded-for'] || 'unknown',
        processado: false,
      })
      .select()
      .single()

    const logId = logData?.id

    // Validar assinatura do webhook (IMPORTANTE para segurança)
    // Por enquanto vamos aceitar todos, mas em produção DEVE validar
    const isValid = true // TODO: Implementar validateMPSignature(req, body)

    if (logId) {
      await supabase
        .from('webhook_logs')
        .update({ signature_valida: isValid })
        .eq('id', logId)
    }

    // Processar webhook baseado no tipo
    let result

    if (body.type === 'subscription' || body.action?.includes('subscription')) {
      // Webhook de assinatura (authorized, paused, cancelled)
      result = await handleSubscriptionWebhook(supabase, body)
    } else if (body.type === 'payment') {
      // Webhook de pagamento (created, updated)
      result = await handlePaymentWebhook(supabase, body)
    } else {
      console.warn('⚠️ Tipo de webhook não suportado:', body.type)
      result = { success: true, message: 'Webhook ignorado (tipo não suportado)' }
    }

    // Atualizar log com resultado
    if (logId) {
      await supabase
        .from('webhook_logs')
        .update({
          processado: true,
          sucesso: result.success,
          erro: result.error || null,
          processado_at: new Date().toISOString(),
        })
        .eq('id', logId)
    }

    console.log('✅ Webhook processado:', result)

    return new Response(
      JSON.stringify(result),
      {
        status: result.success ? 200 : 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )

  } catch (error) {
    console.error('❌ Erro ao processar webhook:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  }
})

// ============================================
// Handler: Subscription Webhooks
// ============================================

async function handleSubscriptionWebhook(supabase: any, webhookData: any) {
  try {
    const subscriptionId = webhookData.data?.id
    const action = webhookData.action // authorized, paused, cancelled

    console.log(`🔔 Processando subscription: ${action} - ${subscriptionId}`)

    if (!subscriptionId) {
      throw new Error('subscription_id não encontrado no webhook')
    }

    // Buscar dados completos da assinatura no Mercado Pago
    const mpResponse = await fetch(
      `https://api.mercadopago.com/preapproval/${subscriptionId}`,
      {
        headers: {
          'Authorization': `Bearer ${MP_ACCESS_TOKEN}`,
        },
      }
    )

    if (!mpResponse.ok) {
      throw new Error(`Erro ao buscar assinatura no MP: ${mpResponse.status}`)
    }

    const subscription = await mpResponse.json()

    // Extrair user_id do external_reference
    const userId = subscription.external_reference

    if (!userId) {
      throw new Error('external_reference (user_id) não encontrado na assinatura')
    }

    // Determinar plano baseado no valor
    let plano = 'starter'
    const valor = parseFloat(subscription.transaction_amount || subscription.auto_recurring?.transaction_amount || 0)

    if (valor >= 149) {
      plano = 'premium'
    } else if (valor >= 99) {
      plano = 'pro'
    } else {
      plano = 'starter'
    }

    // Atualizar ou criar registro de assinatura
    const { data: existingSubscription } = await supabase
      .from('assinaturas_mercadopago')
      .select('id')
      .eq('subscription_id', subscriptionId)
      .single()

    const subscriptionData = {
      user_id: userId,
      subscription_id: subscriptionId,
      preapproval_id: subscription.id,
      payer_id: subscription.payer_id,
      payer_email: subscription.payer_email,
      plano,
      status: subscription.status,
      valor,
      data_inicio: subscription.date_created,
      proxima_cobranca: subscription.next_payment_date,
      external_reference: subscription.external_reference,
      metadata: subscription,
      updated_at: new Date().toISOString(),
    }

    if (existingSubscription) {
      // Update existente
      await supabase
        .from('assinaturas_mercadopago')
        .update(subscriptionData)
        .eq('id', existingSubscription.id)
    } else {
      // Insert novo
      await supabase
        .from('assinaturas_mercadopago')
        .insert(subscriptionData)
    }

    // Atualizar status do usuário baseado na ação
    if (action === 'authorized' || subscription.status === 'authorized') {
      // Ativar assinatura
      await supabase.rpc('ativar_assinatura_usuario', {
        p_user_id: userId,
        p_plano: plano,
      })
      console.log(`✅ Usuário ${userId} ativado com plano ${plano}`)
    } else if (action === 'cancelled' || action === 'paused' || subscription.status === 'cancelled') {
      // Desativar assinatura
      await supabase.rpc('desativar_assinatura_usuario', {
        p_user_id: userId,
      })
      console.log(`🚫 Usuário ${userId} desativado`)
    }

    return { success: true, message: `Subscription ${action} processada` }

  } catch (error) {
    console.error('❌ Erro ao processar subscription webhook:', error)
    return { success: false, error: error.message }
  }
}

// ============================================
// Handler: Payment Webhooks
// ============================================

async function handlePaymentWebhook(supabase: any, webhookData: any) {
  try {
    const paymentId = webhookData.data?.id
    const action = webhookData.action // created, updated

    console.log(`💳 Processando payment: ${action} - ${paymentId}`)

    if (!paymentId) {
      throw new Error('payment_id não encontrado no webhook')
    }

    // Buscar dados completos do pagamento no Mercado Pago
    const mpResponse = await fetch(
      `https://api.mercadopago.com/v1/payments/${paymentId}`,
      {
        headers: {
          'Authorization': `Bearer ${MP_ACCESS_TOKEN}`,
        },
      }
    )

    if (!mpResponse.ok) {
      throw new Error(`Erro ao buscar pagamento no MP: ${mpResponse.status}`)
    }

    const payment = await mpResponse.json()

    // Extrair user_id - pode vir como string ou JSON
    let userId = null
    let planoFromRef = null
    let tipoPagamento = null

    try {
      // Tentar parsear como JSON (pagamento Pix)
      const refData = JSON.parse(payment.external_reference)
      userId = refData.user_id
      planoFromRef = refData.plano
      tipoPagamento = refData.tipo // 'pix_mensal'
    } catch {
      // Se não for JSON, é o user_id direto (assinatura)
      userId = payment.external_reference
    }

    const subscriptionId = payment.metadata?.subscription_id || payment.subscription_id

    if (!userId) {
      throw new Error('external_reference (user_id) não encontrado no pagamento')
    }

    // Verificar se é pagamento Pix (pagamento único)
    const isPix = payment.payment_method_id === 'pix' || tipoPagamento === 'pix_mensal'

    // Buscar assinatura no banco (se existir)
    let assinatura = null
    if (subscriptionId) {
      const { data } = await supabase
        .from('assinaturas_mercadopago')
        .select('id, plano, status')
        .eq('subscription_id', subscriptionId)
        .single()
      assinatura = data
    }

    // Atualizar pagamento existente ou inserir novo
    const { data: existingPayment } = await supabase
      .from('pagamentos_mercadopago')
      .select('id')
      .eq('payment_id', paymentId.toString())
      .single()

    const paymentData = {
      user_id: userId,
      assinatura_id: assinatura?.id || null,
      payment_id: paymentId.toString(),
      subscription_id: subscriptionId,
      valor: payment.transaction_amount,
      status: payment.status,
      status_detail: payment.status_detail,
      payment_type_id: payment.payment_type_id,
      payment_method_id: payment.payment_method_id,
      data_pagamento: payment.date_created,
      data_aprovacao: payment.date_approved,
      raw_webhook: {
        ...webhookData,
        plano: planoFromRef,
        tipo: tipoPagamento,
      },
    }

    if (existingPayment) {
      await supabase
        .from('pagamentos_mercadopago')
        .update(paymentData)
        .eq('id', existingPayment.id)
    } else {
      await supabase
        .from('pagamentos_mercadopago')
        .insert(paymentData)
    }

    // Se pagamento aprovado
    if (payment.status === 'approved') {
      // Pagamento Pix aprovado - ativar usuário por 30 dias
      if (isPix && planoFromRef) {
        // Determinar limite mensal baseado no plano
        let limiteMensal = 200 // starter
        if (planoFromRef === 'pro') limiteMensal = 600
        if (planoFromRef === 'premium') limiteMensal = 3000

        // Calcular data de expiração (30 dias)
        const dataExpiracao = new Date()
        dataExpiracao.setDate(dataExpiracao.getDate() + 30)

        // Ativar usuário com plano pago por 30 dias
        await supabase
          .from('usuarios')
          .update({
            plano_pago: true,
            plano: planoFromRef,
            limite_mensal: limiteMensal,
            trial_ativo: false,
            trial_fim: dataExpiracao.toISOString(), // Reutilizando campo para expiração do Pix
            status_conta: 'ativo',
            updated_at: new Date().toISOString(),
          })
          .eq('id', userId)

        console.log(`✅ Pix aprovado - usuário ${userId} ativado com plano ${planoFromRef} por 30 dias`)
      }
      // Pagamento de assinatura aprovado
      else if (assinatura) {
        if (assinatura.status === 'authorized') {
          await supabase.rpc('ativar_assinatura_usuario', {
            p_user_id: userId,
            p_plano: assinatura.plano,
          })

          console.log(`✅ Pagamento aprovado - usuário ${userId} mantido ativo`)
        }
      }
    }

    // Se pagamento rejeitado e é assinatura, definir grace period
    if (payment.status === 'rejected' && assinatura) {
      await supabase
        .from('usuarios')
        .update({
          grace_period_until: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', userId)
      console.log(`⚠️ Pagamento rejeitado - grace period de 3 dias definido para ${userId}`)
    }

    return { success: true, message: `Payment ${action} processado` }

  } catch (error) {
    console.error('❌ Erro ao processar payment webhook:', error)
    return { success: false, error: error.message }
  }
}
