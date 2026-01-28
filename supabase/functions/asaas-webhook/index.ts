// Edge Function: Asaas Webhook
// Recebe notificações de pagamento do Asaas

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, asaas-access-token',
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

  try {
    // Parse webhook payload
    const payload = await req.json()

    console.log('🔔 Webhook Asaas recebido:', payload.event)
    console.log('📦 Payload:', JSON.stringify(payload, null, 2))

    // Salvar log do webhook
    await supabase
      .from('asaas_webhook_logs')
      .insert({
        event_type: payload.event,
        asaas_id: payload.payment?.id || payload.id,
        payload: payload,
        processado: false
      })

    // Extrair dados do pagamento
    const payment = payload.payment || payload
    const event = payload.event

    if (!payment?.id) {
      console.log('⚠️ Webhook sem ID de pagamento, ignorando')
      return new Response(JSON.stringify({ received: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Buscar boleto no banco de dados
    const { data: boleto, error: boletoError } = await supabase
      .from('boletos')
      .select('*, mensalidade:mensalidades(*)')
      .eq('asaas_id', payment.id)
      .single()

    if (boletoError || !boleto) {
      console.log('⚠️ Boleto não encontrado para asaas_id:', payment.id)
      // Atualizar log como processado mas sem ação
      await supabase
        .from('asaas_webhook_logs')
        .update({
          processado: true,
          sucesso: false,
          erro: 'Boleto não encontrado',
          processado_at: new Date().toISOString()
        })
        .eq('asaas_id', payment.id)
        .order('created_at', { ascending: false })
        .limit(1)

      return new Response(JSON.stringify({ received: true, message: 'Boleto não encontrado' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    console.log('📄 Boleto encontrado:', boleto.id)

    // Processar baseado no evento
    switch (event) {
      case 'PAYMENT_RECEIVED':
      case 'PAYMENT_CONFIRMED':
        console.log('✅ Pagamento confirmado!')

        // Atualizar boleto
        await supabase
          .from('boletos')
          .update({
            status: payment.status || 'RECEIVED',
            data_pagamento: payment.paymentDate || new Date().toISOString(),
            valor_pago: payment.value || boleto.valor,
            forma_pagamento: payment.billingType || 'BOLETO',
            updated_at: new Date().toISOString()
          })
          .eq('id', boleto.id)

        // Atualizar mensalidade como paga
        if (boleto.mensalidade_id) {
          await supabase
            .from('mensalidades')
            .update({
              status: 'pago',
              data_pagamento: payment.paymentDate || new Date().toISOString(),
              forma_pagamento: payment.billingType === 'PIX' ? 'PIX' : 'Boleto'
            })
            .eq('id', boleto.mensalidade_id)

          console.log('✅ Mensalidade marcada como paga:', boleto.mensalidade_id)

          // Criar próxima mensalidade se for recorrente
          if (boleto.mensalidade?.is_mensalidade) {
            const dataVencimentoAtual = new Date(boleto.mensalidade.data_vencimento)
            const proximoVencimento = new Date(dataVencimentoAtual)
            proximoVencimento.setMonth(proximoVencimento.getMonth() + 1)

            // Verificar se já existe mensalidade para o próximo mês
            const { data: existente } = await supabase
              .from('mensalidades')
              .select('id')
              .eq('devedor_id', boleto.devedor_id)
              .eq('user_id', boleto.user_id)
              .gte('data_vencimento', proximoVencimento.toISOString().split('T')[0])
              .single()

            if (!existente) {
              // Criar próxima mensalidade
              await supabase
                .from('mensalidades')
                .insert({
                  user_id: boleto.user_id,
                  devedor_id: boleto.devedor_id,
                  valor: boleto.mensalidade.valor,
                  data_vencimento: proximoVencimento.toISOString().split('T')[0],
                  status: 'pendente',
                  is_mensalidade: true,
                  numero_mensalidade: (boleto.mensalidade.numero_mensalidade || 0) + 1
                })

              console.log('📅 Próxima mensalidade criada para:', proximoVencimento.toISOString().split('T')[0])
            }
          }
        }
        break

      case 'PAYMENT_OVERDUE':
        console.log('⚠️ Pagamento vencido')

        await supabase
          .from('boletos')
          .update({
            status: 'OVERDUE',
            updated_at: new Date().toISOString()
          })
          .eq('id', boleto.id)
        break

      case 'PAYMENT_DELETED':
      case 'PAYMENT_REFUNDED':
        console.log('🔄 Pagamento cancelado/estornado')

        await supabase
          .from('boletos')
          .update({
            status: event === 'PAYMENT_REFUNDED' ? 'REFUNDED' : 'CANCELED',
            updated_at: new Date().toISOString()
          })
          .eq('id', boleto.id)

        // Se tinha mensalidade, voltar para pendente
        if (boleto.mensalidade_id) {
          await supabase
            .from('mensalidades')
            .update({
              status: 'pendente',
              data_pagamento: null
            })
            .eq('id', boleto.mensalidade_id)
        }
        break

      case 'PAYMENT_UPDATED':
        console.log('🔄 Pagamento atualizado')

        await supabase
          .from('boletos')
          .update({
            status: payment.status,
            valor: payment.value || boleto.valor,
            data_vencimento: payment.dueDate || boleto.data_vencimento,
            updated_at: new Date().toISOString()
          })
          .eq('id', boleto.id)
        break

      default:
        console.log('ℹ️ Evento não processado:', event)
    }

    // Atualizar log como processado com sucesso
    await supabase
      .from('asaas_webhook_logs')
      .update({
        processado: true,
        sucesso: true,
        processado_at: new Date().toISOString()
      })
      .eq('asaas_id', payment.id)
      .order('created_at', { ascending: false })
      .limit(1)

    return new Response(
      JSON.stringify({ received: true, processed: true }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )

  } catch (error) {
    console.error('❌ Erro no webhook:', error)

    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  }
})
