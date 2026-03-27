// Edge Function: Agendamento Online - Identificar Aluno
// Busca aluno pelo telefone dentro da empresa (slug)
// Acesso PUBLICO (sem autenticacao)

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Normalizar telefone: manter apenas digitos
function normalizarTelefone(tel: string): string {
  return tel.replace(/\D/g, '')
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

  try {
    const { slug, telefone } = await req.json()

    if (!slug || !telefone) {
      return new Response(
        JSON.stringify({ error: 'slug e telefone sao obrigatorios' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 1. Buscar empresa pelo slug
    const { data: empresa } = await supabase
      .from('usuarios')
      .select('id, agendamento_ativo')
      .eq('agendamento_slug', slug)
      .single()

    if (!empresa || !empresa.agendamento_ativo) {
      return new Response(
        JSON.stringify({ error: 'Empresa nao encontrada ou agendamento inativo' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 2. Buscar aluno pelo telefone (normalizado) dentro da empresa
    const telNormalizado = normalizarTelefone(telefone)

    const { data: devedores } = await supabase
      .from('devedores')
      .select('id, nome, telefone, portal_token, aulas_restantes, aulas_total')
      .eq('user_id', empresa.id)
      .or('lixo.is.null,lixo.eq.false')

    // Comparar telefone normalizado
    const devedor = devedores?.find(d => normalizarTelefone(d.telefone || '') === telNormalizado)

    if (!devedor) {
      return new Response(
        JSON.stringify({ encontrado: false }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 3. Buscar agendamentos futuros do aluno
    const hoje = new Date().toISOString().split('T')[0]

    const { data: agendamentos } = await supabase
      .from('agendamentos')
      .select('id, aula_id, data, status, created_at')
      .eq('devedor_id', devedor.id)
      .eq('status', 'confirmado')
      .gte('data', hoje)
      .order('data', { ascending: true })

    // Buscar detalhes das aulas agendadas
    const aulaIds = [...new Set((agendamentos || []).map(a => a.aula_id))]
    let aulasMap: Record<string, any> = {}

    if (aulaIds.length > 0) {
      const { data: aulas } = await supabase
        .from('aulas')
        .select('id, dia_semana, horario, descricao')
        .in('id', aulaIds)

      if (aulas) {
        for (const aula of aulas) {
          aulasMap[aula.id] = aula
        }
      }
    }

    const agendamentosComDetalhes = (agendamentos || []).map(ag => ({
      ...ag,
      aula: aulasMap[ag.aula_id] || null,
    }))

    return new Response(
      JSON.stringify({
        encontrado: true,
        aluno: {
          id: devedor.id,
          nome: devedor.nome,
          aulas_restantes: devedor.aulas_restantes,
          aulas_total: devedor.aulas_total,
        },
        agendamentos: agendamentosComDetalhes,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (err) {
    console.error('Erro agendamento-identificar:', err)
    return new Response(
      JSON.stringify({ error: 'Erro interno do servidor' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
