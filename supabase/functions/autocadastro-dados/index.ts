// Edge Function: Autocadastro - Dados da escola
// Alimenta a pagina publica /cadastro/:slug (nome, logo e cor da escola).
// Acesso PUBLICO (sem autenticacao). O slug e o mesmo do agendamento online.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

  try {
    const slug = new URL(req.url).searchParams.get('slug')
    if (!slug || slug.length < 2) return json({ error: 'Link invalido' }, 400)

    const { data: empresa } = await supabase
      .from('usuarios')
      .select('nome_empresa, logo_url, landing_cor_primaria, autocadastro_ativo')
      .eq('agendamento_slug', slug)
      .maybeSingle()

    if (!empresa) return json({ error: 'Escola nao encontrada' }, 404)
    if (!empresa.autocadastro_ativo) return json({ error: 'Link de cadastro desativado' }, 403)

    return json({
      empresa: {
        nome: empresa.nome_empresa,
        logo_url: empresa.logo_url,
        cor: empresa.landing_cor_primaria || null,
      },
    })
  } catch (err) {
    console.error('Erro autocadastro-dados:', err)
    return json({ error: 'Erro interno do servidor' }, 500)
  }
})
