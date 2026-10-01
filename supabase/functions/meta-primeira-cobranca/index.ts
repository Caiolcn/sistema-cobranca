import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ ok: false, erro: 'POST only' }), { status: 405 })
  }

  try {
    const { account_id, valor } = await req.json()

    if (!account_id || !valor) {
      return new Response(
        JSON.stringify({ ok: false, erro: 'account_id e valor são obrigatórios' }),
        { status: 400 }
      )
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    // Registra a primeira cobrança na fila Meta
    await supabase.rpc('registrar_primeira_cobranca_meta', {
      p_account_id: account_id,
      p_valor: valor
    })

    console.log(`✅ Primeira cobrança registrada para Meta — account=${account_id} valor=${valor}`)
    return new Response(JSON.stringify({ ok: true, registrado: true }), { status: 200 })
  } catch (erro) {
    console.error('❌ Erro ao registrar cobrança Meta:', erro)
    return new Response(JSON.stringify({ ok: false, erro: String(erro) }), { status: 500 })
  }
})
