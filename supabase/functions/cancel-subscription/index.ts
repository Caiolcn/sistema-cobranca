// Edge Function: Cancel Subscription
// Cancela assinatura recorrente no Mercado Pago

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!
// assinaturas_mercadopago/pagamentos_mercadopago são gravadas só pelo servidor:
// a gravação é feita aqui com service_role, depois de autenticar o usuário.
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const MP_ACCESS_TOKEN = Deno.env.get('MERCADOPAGO_ACCESS_TOKEN')!

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

    // Buscar assinatura ativa do usuário
    const { data: assinatura, error: assinaturaError } = await supabase
      .from('assinaturas_mercadopago')
      .select('subscription_id, status, plano')
      .eq('user_id', user.id)
      .eq('status', 'authorized')
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    if (assinaturaError || !assinatura) {
      throw new Error('Nenhuma assinatura ativa encontrada')
    }

    console.log('📋 Assinatura encontrada:', assinatura.subscription_id)

    // Cancelar no Mercado Pago
    const mpResponse = await fetch(
      `https://api.mercadopago.com/preapproval/${assinatura.subscription_id}`,
      {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${MP_ACCESS_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status: 'cancelled' }),
      }
    )

    if (!mpResponse.ok) {
      const errorData = await mpResponse.text()
      console.error('❌ Erro MP:', errorData)
      throw new Error(`Erro ao cancelar assinatura no MP: ${mpResponse.status}`)
    }

    console.log('✅ Assinatura cancelada no MP')

    // Atualizar no banco (webhook também fará isso, mas garantimos aqui).
    // service_role: o gestor não grava mais nessa tabela, e a RPC abaixo não é
    // executável por usuário logado.
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    const { error: erroStatus } = await admin
      .from('assinaturas_mercadopago')
      .update({ status: 'cancelled', updated_at: new Date().toISOString() })
      .eq('subscription_id', assinatura.subscription_id)
      .eq('user_id', user.id)
    if (erroStatus) console.error('❌ Cancelada no MP mas status NÃO gravado:', assinatura.subscription_id, erroStatus.message)

    // Desativar usuário
    const { error: erroDesativar } = await admin.rpc('desativar_assinatura_usuario', {
      p_user_id: user.id,
    })
    if (erroDesativar) console.error('❌ Cancelada no MP mas conta NÃO desativada:', user.id, erroDesativar.message)

    console.log('🚫 Usuário desativado')

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Assinatura cancelada com sucesso',
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )

  } catch (error) {
    console.error('❌ Erro ao cancelar assinatura:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  }
})
