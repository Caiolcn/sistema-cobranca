// Edge Function: Agendamento Online - Identificar Aluno
// Busca aluno pelo telefone dentro da empresa (slug)
// Quando o mesmo telefone tem mais de um cadastro (responsavel + filhos),
// devolve a lista pra o front mostrar a tela "Quem vai agendar?" e volta
// aqui com devedor_id escolhido.
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
    const { slug, telefone, devedor_id } = await req.json()

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

    // 2. Buscar alunos pelo telefone (normalizado) dentro da empresa
    const telNormalizado = normalizarTelefone(telefone)

    const { data: devedores } = await supabase
      .from('devedores')
      .select('id, nome, telefone, portal_token, plano_id, aulas_restantes, aulas_total')
      .eq('user_id', empresa.id)
      .or('lixo.is.null,lixo.eq.false')

    // Comparar telefone normalizado
    const candidatos = (devedores || []).filter(
      d => normalizarTelefone(d.telefone || '') === telNormalizado
    )

    if (candidatos.length === 0) {
      return new Response(
        JSON.stringify({ encontrado: false }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 2b. Mais de um cadastro no mesmo telefone e ainda nao escolheu:
    //     devolve a lista pro front perguntar quem vai agendar
    if (candidatos.length > 1 && !devedor_id) {
      const planoIds = [...new Set(candidatos.map(d => d.plano_id).filter(Boolean))]
      let planosMap: Record<string, string> = {}

      if (planoIds.length > 0) {
        const { data: planos } = await supabase
          .from('planos')
          .select('id, nome')
          .in('id', planoIds)

        for (const p of planos || []) planosMap[p.id] = p.nome
      }

      return new Response(
        JSON.stringify({
          encontrado: true,
          multiplos: true,
          alunos: candidatos.map(d => ({
            id: d.id,
            nome: d.nome,
            plano_nome: d.plano_id ? (planosMap[d.plano_id] || null) : null,
          })),
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // O devedor_id so vale se estiver entre os cadastros desse telefone/empresa
    const devedor = devedor_id
      ? candidatos.find(d => d.id === devedor_id)
      : candidatos[0]

    if (!devedor) {
      return new Response(
        JSON.stringify({ encontrado: false }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const hoje = new Date().toISOString().split('T')[0]

    // Bloquear se houver mensalidade vencida (status pendente + data_vencimento < hoje)
    const { data: vencidas } = await supabase
      .from('mensalidades')
      .select('id')
      .eq('devedor_id', devedor.id)
      .eq('status', 'pendente')
      .lt('data_vencimento', hoje)
      .limit(1)

    if (vencidas && vencidas.length > 0) {
      return new Response(
        JSON.stringify({
          encontrado: true,
          bloqueado: true,
          error: 'Você possui mensalidade(s) vencida(s). Regularize para agendar aulas.',
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 3. Buscar agendamentos futuros do aluno
    const { data: agendamentos } = await supabase
      .from('agendamentos')
      .select('id, aula_id, data, status, created_at')
      .eq('devedor_id', devedor.id)
      .eq('status', 'confirmado')
      .gte('data', hoje)
      .order('data', { ascending: true })

    // 4. Lista de espera ativa do aluno
    const { data: filas } = await supabase
      .from('lista_espera')
      .select('id, aula_id, data, posicao, status')
      .eq('devedor_id', devedor.id)
      .in('status', ['aguardando', 'notificado'])
      .gte('data', hoje)
      .order('data', { ascending: true })

    // 5. Aulas fixas do aluno + ausencias ja marcadas
    const { data: aulasFixas } = await supabase
      .from('aulas_fixos')
      .select('id, aula_id')
      .eq('devedor_id', devedor.id)
      .eq('ativo', true)

    const { data: ausenciasFixos } = await supabase
      .from('ausencias_fixos')
      .select('id, aula_id, data')
      .eq('devedor_id', devedor.id)
      .gte('data', hoje)

    // Buscar detalhes das aulas agendadas / na fila
    const aulaIds = [...new Set([
      ...(agendamentos || []).map(a => a.aula_id),
      ...(filas || []).map(f => f.aula_id),
    ])]
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

    const filasComDetalhes = (filas || []).map(f => ({
      ...f,
      aula: aulasMap[f.aula_id] || null,
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
        filas: filasComDetalhes,
        aulas_fixas: aulasFixas || [],
        ausencias_fixos: ausenciasFixos || [],
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
