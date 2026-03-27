// Edge Function: Agendamento Online - Dados da Empresa
// Retorna dados da empresa + aulas disponiveis + vagas por slug
// Acesso PUBLICO (sem autenticacao)

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

  try {
    const url = new URL(req.url)
    const slug = url.searchParams.get('slug')

    if (!slug || slug.length < 2) {
      return new Response(
        JSON.stringify({ error: 'Slug invalido' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 1. Buscar empresa pelo slug
    const { data: empresa, error: empresaError } = await supabase
      .from('usuarios')
      .select('id, nome_empresa, logo_url, telefone, agendamento_ativo, agendamento_antecedencia_horas')
      .eq('agendamento_slug', slug)
      .single()

    if (empresaError || !empresa) {
      return new Response(
        JSON.stringify({ error: 'Empresa nao encontrada' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (!empresa.agendamento_ativo) {
      return new Response(
        JSON.stringify({ error: 'Agendamento online nao esta ativo para esta empresa' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 2. Buscar aulas ativas da empresa
    const { data: aulas } = await supabase
      .from('aulas')
      .select('id, dia_semana, horario, descricao, capacidade')
      .eq('user_id', empresa.id)
      .eq('ativo', true)
      .order('dia_semana', { ascending: true })
      .order('horario', { ascending: true })

    // 3. Buscar agendamentos confirmados das proximas 2 semanas
    const hoje = new Date().toISOString().split('T')[0]
    const daqui14dias = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

    const { data: agendamentos } = await supabase
      .from('agendamentos')
      .select('aula_id, data')
      .eq('user_id', empresa.id)
      .eq('status', 'confirmado')
      .gte('data', hoje)
      .lte('data', daqui14dias)

    // 4. Calcular vagas por aula/data
    const contagemPorAulaData: Record<string, number> = {}
    if (agendamentos) {
      for (const ag of agendamentos) {
        const chave = `${ag.aula_id}_${ag.data}`
        contagemPorAulaData[chave] = (contagemPorAulaData[chave] || 0) + 1
      }
    }

    return new Response(
      JSON.stringify({
        empresa: {
          nome: empresa.nome_empresa,
          logo_url: empresa.logo_url,
          telefone: empresa.telefone,
          antecedencia_horas: empresa.agendamento_antecedencia_horas || 2,
        },
        aulas: aulas || [],
        agendamentos_contagem: contagemPorAulaData,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (err) {
    console.error('Erro agendamento-dados:', err)
    return new Response(
      JSON.stringify({ error: 'Erro interno do servidor' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
