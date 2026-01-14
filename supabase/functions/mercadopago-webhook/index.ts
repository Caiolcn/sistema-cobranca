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
    let plano = 'basico'
    const valor = parseFloat(subscription.transaction_amount || subscription.auto_recurring?.transaction_amount || 0)

    if (valor >= 149) {
      plano = 'enterprise'
    } else if (valor >= 49) {
      plano = 'premium'
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

    // Extrair user_id e subscription_id
    const userId = payment.external_reference
    const subscriptionId = payment.metadata?.subscription_id || payment.subscription_id

    if (!userId) {
      throw new Error('external_reference (user_id) não encontrado no pagamento')
    }

    // Buscar assinatura no banco
    const { data: assinatura } = await supabase
      .from('assinaturas_mercadopago')
      .select('id, plano, status')
      .eq('subscription_id', subscriptionId)
      .single()

    // Salvar pagamento
    await supabase
      .from('pagamentos_mercadopago')
      .upsert(
        {
          user_id: userId,
          assinatura_id: assinatura?.id || null,
          payment_id: paymentId,
          subscription_id: subscriptionId,
          valor: payment.transaction_amount,
          status: payment.status,
          status_detail: payment.status_detail,
          payment_type_id: payment.payment_type_id,
          payment_method_id: payment.payment_method_id,
          data_pagamento: payment.date_created,
          data_aprovacao: payment.date_approved,
          external_reference: payment.external_reference,
          metadata: payment.metadata,
          raw_webhook: webhookData,
        },
        { onConflict: 'payment_id' }
      )

    // Se pagamento aprovado, garantir que assinatura está ativa
    if (payment.status === 'approved' && assinatura) {
      if (assinatura.status === 'authorized') {
        await supabase.rpc('ativar_assinatura_usuario', {
          p_user_id: userId,
          p_plano: assinatura.plano,
        })

        // Limpar grace period se houver
        await supabase.rpc('limpar_grace_period', {
          p_user_id: userId,
        })

        console.log(`✅ Pagamento aprovado - usuário ${userId} mantido ativo`)
      }
    }

    // Se pagamento rejeitado, definir grace period
    if (payment.status === 'rejected' && assinatura) {
      await supabase.rpc('definir_grace_period', {
        p_user_id: userId,
        p_dias: 3,
      })
      console.log(`⚠️ Pagamento rejeitado - grace period de 3 dias definido para ${userId}`)
    }

    return { success: true, message: `Payment ${action} processado` }

  } catch (error) {
    console.error('❌ Erro ao processar payment webhook:', error)
    return { success: false, error: error.message }
  }
}
