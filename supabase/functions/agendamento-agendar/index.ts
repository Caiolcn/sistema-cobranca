// Edge Function: Agendamento Online - Agendar Aula
// Aluno agenda uma aula em data especifica
// Acesso PUBLICO (sem autenticacao) - validacao por devedor_id + slug

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
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

  try {
    const { slug, devedor_id, aula_id, data } = await req.json()

    if (!slug || !devedor_id || !aula_id || !data) {
      return new Response(
        JSON.stringify({ error: 'slug, devedor_id, aula_id e data sao obrigatorios' }),
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

    // 2. Validar que o aluno pertence a empresa
    const { data: devedor } = await supabase
      .from('devedores')
      .select('id, nome, user_id, aulas_restantes')
      .eq('id', devedor_id)
      .eq('user_id', empresa.id)
      .or('lixo.is.null,lixo.eq.false')
      .single()

    if (!devedor) {
      return new Response(
        JSON.stringify({ error: 'Aluno nao encontrado' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 3. Validar que a aula existe e pertence a empresa
    const { data: aula } = await supabase
      .from('aulas')
      .select('id, dia_semana, horario, descricao, capacidade, user_id')
      .eq('id', aula_id)
      .eq('user_id', empresa.id)
      .eq('ativo', true)
      .single()

    if (!aula) {
      return new Response(
        JSON.stringify({ error: 'Aula nao encontrada' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 4. Validar que a data e futura e bate com o dia_semana da aula
    const dataAgendamento = new Date(data + 'T00:00:00')
    const hoje = new Date()
    hoje.setHours(0, 0, 0, 0)

    if (dataAgendamento < hoje) {
      return new Response(
        JSON.stringify({ error: 'Nao e possivel agendar em datas passadas' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (dataAgendamento.getDay() !== aula.dia_semana) {
      return new Response(
        JSON.stringify({ error: 'Data nao corresponde ao dia da semana da aula' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 5. Verificar vagas disponiveis
    const { count: totalAgendados } = await supabase
      .from('agendamentos')
      .select('id', { count: 'exact', head: true })
      .eq('aula_id', aula_id)
      .eq('data', data)
      .eq('status', 'confirmado')

    if ((totalAgendados || 0) >= aula.capacidade) {
      return new Response(
        JSON.stringify({ error: 'Aula lotada, nao ha vagas disponiveis' }),
        { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 6. Verificar se aluno ja tem agendamento nesta aula/data
    const { data: existente } = await supabase
      .from('agendamentos')
      .select('id, status')
      .eq('aula_id', aula_id)
      .eq('devedor_id', devedor_id)
      .eq('data', data)
      .maybeSingle()

    if (existente && existente.status === 'confirmado') {
      return new Response(
        JSON.stringify({ error: 'Voce ja tem agendamento nesta aula' }),
        { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 7. Verificar creditos (se for pacote)
    if (devedor.aulas_restantes !== null && devedor.aulas_restantes <= 0) {
      return new Response(
        JSON.stringify({ error: 'Voce nao tem creditos de aula disponiveis' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 8. Criar agendamento (ou reativar cancelado)
    let agendamento
    if (existente && existente.status === 'cancelado') {
      const { data: updated, error: updateError } = await supabase
        .from('agendamentos')
        .update({ status: 'confirmado', cancelado_em: null })
        .eq('id', existente.id)
        .select('id, aula_id, data, status')
        .single()

      if (updateError) throw updateError
      agendamento = updated
    } else {
      const { data: novo, error: insertError } = await supabase
        .from('agendamentos')
        .insert({
          aula_id,
          devedor_id,
          user_id: empresa.id,
          data,
          status: 'confirmado',
        })
        .select('id, aula_id, data, status')
        .single()

      if (insertError) throw insertError
      agendamento = novo
    }

    // 9. Decrementar creditos se for pacote
    if (devedor.aulas_restantes !== null) {
      await supabase
        .from('devedores')
        .update({ aulas_restantes: devedor.aulas_restantes - 1 })
        .eq('id', devedor_id)
    }

    // 10. Notificar admin via WhatsApp
    try {
      const { data: conexao } = await supabase
        .from('mensallizap')
        .select('instance_name, conectado')
        .eq('user_id', empresa.id)
        .eq('conectado', true)
        .maybeSingle()

      if (conexao) {
        const { data: configs } = await supabase
          .from('config')
          .select('chave, valor')
          .in('chave', ['evolution_api_key', 'evolution_api_url'])

        const configMap: Record<string, string> = {}
        if (configs) configs.forEach((c: any) => { configMap[c.chave] = c.valor })

        const apiUrl = configMap.evolution_api_url || 'https://service-evolution-api.tnvro1.easypanel.host'
        const apiKey = configMap.evolution_api_key

        if (apiKey) {
          const { data: adminUser } = await supabase
            .from('usuarios')
            .select('telefone')
            .eq('id', empresa.id)
            .single()

          if (adminUser?.telefone) {
            const telAdmin = adminUser.telefone.replace(/\D/g, '')
            const diasSemana = ['Domingo', 'Segunda', 'Terca', 'Quarta', 'Quinta', 'Sexta', 'Sabado']
            const dataObj = new Date(data + 'T12:00:00')
            const msg = `📅 *Novo agendamento*\n\n` +
              `Aluno: ${devedor.nome}\n` +
              `Aula: ${aula.descricao || 'Sem descricao'}\n` +
              `Data: ${dataObj.toLocaleDateString('pt-BR')} (${diasSemana[dataObj.getDay()]})\n` +
              `Horario: ${aula.horario}`

            await fetch(`${apiUrl}/message/sendText/${conexao.instance_name}`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'apikey': apiKey,
              },
              body: JSON.stringify({
                number: `55${telAdmin}`,
                text: msg,
              }),
            })
          }
        }
      }
    } catch (notifErr) {
      console.error('Erro ao notificar admin:', notifErr)
    }

    return new Response(
      JSON.stringify({
        sucesso: true,
        agendamento,
        aulas_restantes: devedor.aulas_restantes !== null ? devedor.aulas_restantes - 1 : null,
      }),
      { status: 201, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (err) {
    console.error('Erro agendamento-agendar:', err)
    return new Response(
      JSON.stringify({ error: 'Erro interno do servidor' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
