// Edge Function: WhatsApp Bot - Configurar webhook na Evolution API
// Registra a URL da edge function whatsapp-bot como webhook do Evolution
// Acesso AUTENTICADO (JWT do usuário)

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const WEBHOOK_URL = `${SUPABASE_URL}/functions/v1/whatsapp-bot`

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Autenticar usuário via JWT
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Não autenticado' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabaseAuth = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: { user } } = await supabaseAuth.auth.getUser()
    if (!user) {
      return new Response(JSON.stringify({ error: 'Token inválido' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    const { acao } = await req.json().catch(() => ({ acao: 'ativar' }))

    // Buscar instance do usuário
    const { data: mz } = await supabase
      .from('mensallizap')
      .select('instance_name')
      .eq('user_id', user.id)
      .maybeSingle()

    if (!mz?.instance_name) {
      return new Response(JSON.stringify({ error: 'WhatsApp não conectado' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Buscar credenciais Evolution (config global)
    const { data: configRows } = await supabase
      .from('config')
      .select('chave, valor')
      .in('chave', ['evolution_api_url', 'evolution_api_key'])
    const configMap: Record<string, string> = {}
    for (const r of configRows || []) configMap[r.chave] = r.valor

    const evolutionUrl = configMap.evolution_api_url
    const evolutionKey = configMap.evolution_api_key

    if (!evolutionUrl || !evolutionKey) {
      return new Response(JSON.stringify({ error: 'Credenciais Evolution não configuradas' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const url = `${evolutionUrl}/webhook/set/${mz.instance_name}`

    const body =
      acao === 'desativar'
        ? {
            webhook: {
              enabled: false,
              url: '',
              events: [],
            },
          }
        : {
            webhook: {
              enabled: true,
              url: WEBHOOK_URL,
              webhookByEvents: false,
              webhookBase64: false,
              events: ['MESSAGES_UPSERT'],
            },
          }

    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': evolutionKey },
      body: JSON.stringify(body),
    })

    const respText = await resp.text()
    if (!resp.ok) {
      console.error('❌ Erro Evolution:', respText)
      return new Response(
        JSON.stringify({ error: 'Erro ao configurar webhook', detalhe: respText }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    return new Response(
      JSON.stringify({
        success: true,
        webhook_url: acao === 'desativar' ? null : WEBHOOK_URL,
        instance: mz.instance_name,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err: any) {
    console.error('❌ Erro:', err)
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
