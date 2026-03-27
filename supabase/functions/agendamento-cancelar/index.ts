// Edge Function: Agendamento Online - Cancelar Agendamento
// Aluno cancela aula com regra de antecedencia
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

function normalizarTelefone(tel: string): string {
  return tel.replace(/\D/g, '')
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

  try {
    const { slug, devedor_id, agendamento_id } = await req.json()

    if (!slug || !devedor_id || !agendamento_id) {
      return new Response(
        JSON.stringify({ error: 'slug, devedor_id e agendamento_id sao obrigatorios' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 1. Buscar empresa pelo slug
    const { data: empresa } = await supabase
      .from('usuarios')
      .select('id, nome_empresa, agendamento_ativo, agendamento_antecedencia_horas')
      .eq('agendamento_slug', slug)
      .single()

    if (!empresa || !empresa.agendamento_ativo) {
      return new Response(
        JSON.stringify({ error: 'Empresa nao encontrada ou agendamento inativo' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 2. Buscar agendamento
    const { data: agendamento } = await supabase
      .from('agendamentos')
      .select('id, aula_id, devedor_id, data, status, user_id')
      .eq('id', agendamento_id)
      .eq('devedor_id', devedor_id)
      .eq('user_id', empresa.id)
      .single()

    if (!agendamento) {
      return new Response(
        JSON.stringify({ error: 'Agendamento nao encontrado' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (agendamento.status !== 'confirmado') {
      return new Response(
        JSON.stringify({ error: 'Este agendamento ja foi cancelado ou realizado' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 3. Buscar horario da aula pra calcular antecedencia
    const { data: aula } = await supabase
      .from('aulas')
      .select('horario, descricao')
      .eq('id', agendamento.aula_id)
      .single()

    if (!aula) {
      return new Response(
        JSON.stringify({ error: 'Aula nao encontrada' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 4. Verificar regra de antecedencia
    const antecedenciaHoras = empresa.agendamento_antecedencia_horas || 2
    const dataHoraAula = new Date(`${agendamento.data}T${aula.horario}`)
    const agora = new Date()
    const diferencaMs = dataHoraAula.getTime() - agora.getTime()
    const diferencaHoras = diferencaMs / (1000 * 60 * 60)

    if (diferencaHoras < antecedenciaHoras) {
      return new Response(
        JSON.stringify({
          error: `Cancelamento permitido ate ${antecedenciaHoras}h antes da aula`,
          antecedencia_horas: antecedenciaHoras,
          horas_restantes: Math.max(0, Math.floor(diferencaHoras * 10) / 10),
        }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 5. Cancelar agendamento
    const { error: updateError } = await supabase
      .from('agendamentos')
      .update({
        status: 'cancelado',
        cancelado_em: new Date().toISOString(),
      })
      .eq('id', agendamento_id)

    if (updateError) throw updateError

    // 6. Devolver credito se for pacote
    const { data: devedor } = await supabase
      .from('devedores')
      .select('aulas_restantes')
      .eq('id', devedor_id)
      .single()

    let aulasRestantes = devedor?.aulas_restantes
    if (devedor && devedor.aulas_restantes !== null) {
      aulasRestantes = devedor.aulas_restantes + 1
      await supabase
        .from('devedores')
        .update({ aulas_restantes: aulasRestantes })
        .eq('id', devedor_id)
    }

    // 7. Notificar admin via WhatsApp
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

          const { data: alunoInfo } = await supabase
            .from('devedores')
            .select('nome')
            .eq('id', devedor_id)
            .single()

          if (adminUser?.telefone) {
            const telAdmin = normalizarTelefone(adminUser.telefone)
            const diasSemana = ['Domingo', 'Segunda', 'Terca', 'Quarta', 'Quinta', 'Sexta', 'Sabado']
            const dataObj = new Date(agendamento.data + 'T12:00:00')
            const msg = `❌ *Aula cancelada*\n\n` +
              `Aluno: ${alunoInfo?.nome || 'N/A'}\n` +
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
        aulas_restantes: aulasRestantes,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (err) {
    console.error('Erro agendamento-cancelar:', err)
    return new Response(
      JSON.stringify({ error: 'Erro interno do servidor' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
