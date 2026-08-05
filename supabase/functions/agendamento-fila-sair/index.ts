import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

  try {
    const { slug, devedor_id, fila_id } = await req.json()
    if (!slug || !devedor_id || !fila_id) {
      return new Response(JSON.stringify({ error: 'Campos obrigatorios faltando' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // Buscar o registro da fila
    const { data: fila } = await supabase.from('lista_espera').select('id, aula_id, data, posicao, status').eq('id', fila_id).eq('devedor_id', devedor_id).single()
    if (!fila || (fila.status !== 'aguardando' && fila.status !== 'notificado')) {
      return new Response(JSON.stringify({ error: 'Registro na fila nao encontrado' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // Cancelar
    await supabase.from('lista_espera').update({ status: 'cancelado' }).eq('id', fila_id)

    // Reordenar posicoes dos que ficaram
    const { data: restantes } = await supabase.from('lista_espera').select('id, posicao').eq('aula_id', fila.aula_id).eq('data', fila.data).in('status', ['aguardando', 'notificado']).order('posicao')
    if (restantes) {
      for (let i = 0; i < restantes.length; i++) {
        if (restantes[i].posicao !== i + 1) {
          await supabase.from('lista_espera').update({ posicao: i + 1 }).eq('id', restantes[i].id)
        }
      }
    }

    return new Response(JSON.stringify({ sucesso: true }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  } catch (err) {
    console.error('Erro fila-sair:', err)
    return new Response(JSON.stringify({ error: 'Erro interno' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
})
