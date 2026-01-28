// Edge Function: Asaas Test Connection
// Testa se a API Key do Asaas está configurada corretamente
// E cria o webhook automaticamente na conta do cliente

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const ASAAS_URLS = {
  sandbox: 'https://sandbox.asaas.com/api/v3',
  production: 'https://api.asaas.com/v3'
}

// URL do webhook que será configurado automaticamente
const WEBHOOK_URL = `${SUPABASE_URL}/functions/v1/asaas-webhook`

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      throw new Error('Authorization header missing')
    }

    const supabaseUser = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      global: { headers: { Authorization: authHeader } },
    })

    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    const { data: { user }, error: userError } = await supabaseUser.auth.getUser()
    if (userError || !user) {
      throw new Error('Unauthorized')
    }

    // Buscar configuração do Asaas
    const { data: usuario } = await supabaseAdmin
      .from('usuarios')
      .select('asaas_api_key, asaas_ambiente')
      .eq('id', user.id)
      .single()

    if (!usuario?.asaas_api_key) {
      throw new Error('API Key do Asaas não configurada')
    }

    const ambiente = usuario.asaas_ambiente || 'sandbox'
    const baseUrl = ASAAS_URLS[ambiente as keyof typeof ASAAS_URLS]
    const apiKey = usuario.asaas_api_key

    // Testar conexão listando a conta
    const response = await fetch(`${baseUrl}/myAccount`, {
      headers: {
        'access_token': apiKey,
      },
    })

    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.errors?.[0]?.description || 'API Key inválida')
    }

    const account = await response.json()

    console.log('✅ Conexão com Asaas OK:', account.name)

    // ==========================================
    // CRIAR WEBHOOK AUTOMATICAMENTE
    // ==========================================

    let webhookCriado = false
    let webhookMensagem = ''

    try {
      // Primeiro, verificar se já existe um webhook para nossa URL
      const webhooksResponse = await fetch(`${baseUrl}/webhooks`, {
        headers: {
          'access_token': apiKey,
        },
      })

      let webhookExiste = false

      if (webhooksResponse.ok) {
        const webhooksData = await webhooksResponse.json()
        const webhooks = webhooksData.data || []

        // Verificar se já existe webhook para nossa URL
        webhookExiste = webhooks.some((wh: any) =>
          wh.url === WEBHOOK_URL && wh.enabled === true
        )
      }

      if (webhookExiste) {
        console.log('✅ Webhook já existe e está ativo')
        webhookCriado = true
        webhookMensagem = 'Webhook já configurado'
      } else {
        // Criar novo webhook
        console.log('🔧 Criando webhook automaticamente...')

        const createWebhookResponse = await fetch(`${baseUrl}/webhooks`, {
          method: 'POST',
          headers: {
            'access_token': apiKey,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            url: WEBHOOK_URL,
            email: account.email, // Email para notificações de falha
            enabled: true,
            interrupted: false,
            apiVersion: 3,
            authToken: null, // Sem autenticação extra por enquanto
            events: [
              'PAYMENT_CREATED',
              'PAYMENT_RECEIVED',
              'PAYMENT_CONFIRMED',
              'PAYMENT_OVERDUE',
              'PAYMENT_DELETED',
              'PAYMENT_UPDATED',
              'PAYMENT_REFUNDED'
            ]
          }),
        })

        if (createWebhookResponse.ok) {
          const webhookData = await createWebhookResponse.json()
          console.log('✅ Webhook criado com sucesso:', webhookData.id)
          webhookCriado = true
          webhookMensagem = 'Webhook configurado automaticamente'
        } else {
          const webhookError = await createWebhookResponse.json()
          console.error('⚠️ Erro ao criar webhook:', webhookError)
          webhookMensagem = webhookError.errors?.[0]?.description || 'Não foi possível criar webhook automaticamente'
        }
      }
    } catch (webhookErr: unknown) {
      console.error('⚠️ Erro ao configurar webhook:', webhookErr)
      webhookMensagem = 'Erro ao configurar webhook: ' + (webhookErr instanceof Error ? webhookErr.message : String(webhookErr))
    }

    return new Response(
      JSON.stringify({
        success: true,
        ambiente: ambiente,
        conta: {
          nome: account.name,
          email: account.email,
          cpfCnpj: account.cpfCnpj,
          walletId: account.walletId
        },
        webhook: {
          configurado: webhookCriado,
          mensagem: webhookMensagem,
          url: WEBHOOK_URL
        }
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
