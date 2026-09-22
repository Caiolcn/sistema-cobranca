// Edge Function: Disparo de Retencao (ponte para o n8n)
//
// POR QUE EXISTE
// O painel /admin dispara a campanha de retencao mandando o payload direto para
// o webhook do n8n - e junto ia a chave GLOBAL da Evolution, lida do navegador.
// O workflow do n8n precisa dessa credencial para enviar, entao nao dava para
// simplesmente parar de mandar sem reescrever o workflow.
//
// Esta funcao resolve o meio-termo: o navegador manda so os DADOS do disparo, e
// a credencial (mais a URL do webhook) e injetada aqui, com service_role. O
// workflow do n8n continua recebendo exatamente o mesmo formato de antes.
//
// SEGURANCA
// - Exige JWT e confere usuarios.role = 'admin' no banco (nunca no corpo).
// - Nem a chave da Evolution nem a URL do webhook voltam na resposta.

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

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: 'Nao autenticado' }, 401)

    const supabaseAuth = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: { user } } = await supabaseAuth.auth.getUser()
    if (!user) return json({ error: 'Token invalido' }, 401)

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    const { data: perfil } = await supabase
      .from('usuarios').select('role').eq('id', user.id).maybeSingle()
    if (perfil?.role !== 'admin') {
      return json({ error: 'Operacao restrita a administrador' }, 403)
    }

    const payload = await req.json().catch(() => null)
    if (!payload || typeof payload !== 'object') {
      return json({ error: 'Payload invalido' }, 400)
    }

    const { data: cfg } = await supabase
      .from('config').select('chave, valor')
      .in('chave', ['n8n_webhook_recuperar_trial', 'evolution_api_url', 'evolution_api_key'])
    const mapa = Object.fromEntries((cfg || []).map((c) => [c.chave, c.valor]))

    if (!mapa.n8n_webhook_recuperar_trial) {
      return json({ error: 'Webhook nao configurado (n8n_webhook_recuperar_trial na tabela config).' }, 500)
    }
    if (!mapa.evolution_api_url || !mapa.evolution_api_key) {
      return json({ error: 'Credenciais Evolution nao encontradas na tabela config.' }, 500)
    }

    // O cliente nao dita credencial: o que vier no corpo com esses nomes e
    // descartado e substituido pelo valor do banco.
    const corpo = {
      ...payload,
      evolution_api_url: mapa.evolution_api_url,
      evolution_api_key: mapa.evolution_api_key,
      disparado_por: user.id,
    }

    const resposta = await fetch(mapa.n8n_webhook_recuperar_trial, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(corpo),
    })

    // A resposta do n8n nao e repassada crua: ela pode ecoar o payload, e o
    // payload agora contem a chave.
    if (!resposta.ok) {
      return json({ ok: false, status: resposta.status, error: `Webhook respondeu HTTP ${resposta.status}` })
    }
    return json({ ok: true, status: resposta.status })
  } catch (erro) {
    console.error('disparo-retencao:', erro)
    return json({ error: String((erro as Error)?.message ?? erro) }, 500)
  }
})
