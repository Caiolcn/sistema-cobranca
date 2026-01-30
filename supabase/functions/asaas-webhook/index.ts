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

          // --- Enviar WhatsApp de confirmacao ao cliente ---
          try {
            const { data: devedor } = await supabase
              .from('devedores')
              .select('id, nome, telefone')
              .eq('id', boleto.devedor_id)
              .single()

            const { data: configs } = await supabase
              .from('config')
              .select('key, value')
              .eq('user_id', boleto.user_id)
              .in('key', ['evolution_api_key', 'evolution_api_url'])

            const { data: usuario } = await supabase
              .from('usuarios')
              .select('nome_empresa')
              .eq('id', boleto.user_id)
              .single()

            const { data: whatsapp } = await supabase
              .from('mensallizap')
              .select('instance_name, conectado')
              .eq('user_id', boleto.user_id)
              .eq('conectado', true)
              .maybeSingle()

            if (devedor?.telefone && whatsapp?.instance_name && configs?.length) {
              const apiKey = configs.find((c: any) => c.key === 'evolution_api_key')?.value
              const apiUrl = configs.find((c: any) => c.key === 'evolution_api_url')?.value
                || 'https://service-evolution-api.tnvro1.easypanel.host'

              let telefone = devedor.telefone.replace(/\D/g, '')
              if (!telefone.startsWith('55')) telefone = '55' + telefone

              const valorPago = parseFloat(payment.value || boleto.valor || 0)
              const valorFormatado = valorPago.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

              // Formatar data de vencimento
              const dataVenc = boleto.mensalidade?.data_vencimento
              const vencimentoFormatado = dataVenc
                ? new Date(dataVenc + 'T12:00:00').toLocaleDateString('pt-BR')
                : ''

              const empresa = usuario?.nome_empresa || ''
              const mensagem = `Olá, ${devedor.nome}! ✅\n\nConfirmamos o recebimento do seu pagamento.\n\n💰 Valor: ${valorFormatado}\n📅 Vencimento: ${vencimentoFormatado}\n\nObrigado pela pontualidade! - ${empresa}`

              const whatsappResponse = await fetch(
                `${apiUrl}/message/sendText/${whatsapp.instance_name}`,
                {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json', 'apikey': apiKey },
                  body: JSON.stringify({
                    number: `${telefone}@s.whatsapp.net`,
                    text: mensagem
                  })
                }
              )

              console.log('📱 WhatsApp confirmacao:', whatsappResponse.ok ? 'enviado' : 'falha')

              await supabase.from('logs_mensagens').insert({
                user_id: boleto.user_id,
                devedor_id: devedor.id,
                mensalidade_id: boleto.mensalidade_id,
                tipo: 'payment_confirmed',
                mensagem,
                status: whatsappResponse.ok ? 'enviado' : 'falha',
                telefone
              })

              // --- Notificar o gestor (dono da instancia WhatsApp) ---
              try {
                const instanceResp = await fetch(
                  `${apiUrl}/instance/fetchInstances?instanceName=${whatsapp.instance_name}`,
                  { headers: { 'apikey': apiKey } }
                )
                if (instanceResp.ok) {
                  const instances = await instanceResp.json()
                  const ownerJid = instances?.[0]?.instance?.owner
                  if (ownerJid) {
                    const ownerNumber = ownerJid.replace('@s.whatsapp.net', '')
                    const notifGestor = `💰 Pagamento recebido!\n\n${devedor.nome} pagou ${valorFormatado}\n📅 Vencimento: ${vencimentoFormatado}`

                    await fetch(
                      `${apiUrl}/message/sendText/${whatsapp.instance_name}`,
                      {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', 'apikey': apiKey },
                        body: JSON.stringify({
                          number: `${ownerNumber}@s.whatsapp.net`,
                          text: notifGestor
                        })
                      }
                    )
                    console.log('📱 Notificacao gestor enviada para:', ownerNumber)
                  }
                }
              } catch (gestorErr) {
                console.error('⚠️ Erro notificacao gestor (nao afeta webhook):', gestorErr)
              }
            } else {
              console.log('⏩ WhatsApp nao enviado: sem telefone, conexao ou config')
            }
          } catch (whatsappError) {
            console.error('⚠️ Erro WhatsApp confirmacao (nao afeta webhook):', whatsappError)
          }

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
