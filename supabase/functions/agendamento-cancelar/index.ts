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

    const antecedenciaHoras = empresa.agendamento_antecedencia_horas || 2
    const dataHoraAula = new Date(`${agendamento.data}T${aula.horario}-03:00`)
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

    const { error: updateError } = await supabase
      .from('agendamentos')
      .update({ status: 'cancelado', cancelado_em: new Date().toISOString() })
      .eq('id', agendamento_id)

    if (updateError) throw updateError

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

    let conexao: any = null
    let apiUrl = ''
    let apiKey = ''

    try {
      const { data: conn } = await supabase
        .from('mensallizap')
        .select('instance_name, conectado')
        .eq('user_id', empresa.id)
        .eq('conectado', true)
        .maybeSingle()

      conexao = conn

      if (conexao) {
        const { data: configs } = await supabase
          .from('config')
          .select('chave, valor')
          .in('chave', ['evolution_api_key', 'evolution_api_url'])

        const configMap: Record<string, string> = {}
        if (configs) configs.forEach((c: any) => { configMap[c.chave] = c.valor })

        apiUrl = configMap.evolution_api_url || 'https://service-evolution-api.tnvro1.easypanel.host'
        apiKey = configMap.evolution_api_key

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
              headers: { 'Content-Type': 'application/json', 'apikey': apiKey },
              body: JSON.stringify({ number: `55${telAdmin}`, text: msg }),
            })
          }
        }
      }
    } catch (notifErr) {
      console.error('Erro ao notificar admin:', notifErr)
    }

    try {
      const { data: proximoFila } = await supabase
        .from('lista_espera')
        .select('id, devedor_id')
        .eq('aula_id', agendamento.aula_id)
        .eq('data', agendamento.data)
        .eq('status', 'aguardando')
        .order('posicao', { ascending: true })
        .limit(1)
        .maybeSingle()

      if (proximoFila && conexao && apiKey) {
        const expiraEm = new Date(Date.now() + 60 * 60 * 1000).toISOString()
        await supabase.from('lista_espera').update({
          status: 'notificado',
          notificado_em: new Date().toISOString(),
          expira_em: expiraEm
        }).eq('id', proximoFila.id)

        const { data: alunoFila } = await supabase.from('devedores').select('nome, telefone').eq('id', proximoFila.devedor_id).single()
        if (alunoFila?.telefone) {
          const linkConfirmacao = `https://www.mensalli.com.br/agendar/${slug}?confirmar=${proximoFila.id}`
          const msgFila = `🎉 *Vaga disponivel!*\n\nUma vaga abriu na aula que voce esta esperando:\n\n📚 ${aula.descricao || 'Aula'}\n📅 ${new Date(agendamento.data + 'T12:00:00').toLocaleDateString('pt-BR')}\n🕐 ${aula.horario}\n\nConfirme sua vaga em ate 1 hora:\n${linkConfirmacao}\n\nSe nao confirmar a tempo, a vaga passa para o proximo da fila.`
          await fetch(`${apiUrl}/message/sendText/${conexao.instance_name}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'apikey': apiKey },
            body: JSON.stringify({ number: `55${alunoFila.telefone.replace(/\D/g, '')}`, text: msgFila }),
          })
        }
      }
    } catch (filaErr) {
      console.error('Erro ao processar fila:', filaErr)
    }

    return new Response(
      JSON.stringify({ sucesso: true, aulas_restantes: aulasRestantes }),
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
