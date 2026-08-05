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
    const { slug, devedor_id, aula_id, data, acao } = await req.json()
    if (!slug || !devedor_id || !aula_id || !data) {
      return new Response(JSON.stringify({ error: 'Campos obrigatorios faltando' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const { data: empresa } = await supabase.from('usuarios').select('id, agendamento_ativo, agendamento_antecedencia_horas').eq('agendamento_slug', slug).single()
    if (!empresa || !empresa.agendamento_ativo) {
      return new Response(JSON.stringify({ error: 'Empresa nao encontrada' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const { data: fixo } = await supabase.from('aulas_fixos').select('id').eq('aula_id', aula_id).eq('devedor_id', devedor_id).maybeSingle()
    if (!fixo) {
      return new Response(JSON.stringify({ error: 'Aluno nao e fixo nesta aula' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const { data: aula } = await supabase.from('aulas').select('horario, descricao').eq('id', aula_id).single()

    if (acao === 'cancelar') {
      const antecedenciaHoras = empresa.agendamento_antecedencia_horas || 2
      const dataHoraAula = new Date(`${data}T${aula.horario}-03:00`)
      const agora = new Date()
      const diferencaHoras = (dataHoraAula.getTime() - agora.getTime()) / (1000 * 60 * 60)

      if (diferencaHoras < antecedenciaHoras) {
        return new Response(JSON.stringify({ error: `Cancelamento permitido ate ${antecedenciaHoras}h antes da aula` }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }

      const { error } = await supabase.from('ausencias_fixos').insert({
        aula_id, devedor_id, user_id: empresa.id, data
      })
      if (error && error.code === '23505') {
        return new Response(JSON.stringify({ error: 'Voce ja cancelou esta aula neste dia' }), { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }
      if (error) throw error

      try {
        const { data: conexao } = await supabase.from('mensallizap').select('instance_name, conectado').eq('user_id', empresa.id).eq('conectado', true).maybeSingle()
        if (conexao) {
          const { data: configs } = await supabase.from('config').select('chave, valor').in('chave', ['evolution_api_key', 'evolution_api_url'])
          const configMap: Record<string, string> = {}
          if (configs) configs.forEach((c: any) => { configMap[c.chave] = c.valor })
          const apiUrl = configMap.evolution_api_url || 'https://service-evolution-api.tnvro1.easypanel.host'
          const apiKey = configMap.evolution_api_key
          if (apiKey) {
            const { data: adminUser } = await supabase.from('usuarios').select('telefone').eq('id', empresa.id).single()
            const { data: alunoInfo } = await supabase.from('devedores').select('nome').eq('id', devedor_id).single()
            if (adminUser?.telefone) {
              const diasSemana = ['Domingo', 'Segunda', 'Terca', 'Quarta', 'Quinta', 'Sexta', 'Sabado']
              const dataObj = new Date(data + 'T12:00:00')
              const msg = `❌ *Aluno fixo cancelou aula*\n\nAluno: ${alunoInfo?.nome || 'N/A'}\nAula: ${aula?.descricao || ''}\nData: ${dataObj.toLocaleDateString('pt-BR')} (${diasSemana[dataObj.getDay()]})\nHorario: ${aula?.horario}`
              await fetch(`${apiUrl}/message/sendText/${conexao.instance_name}`, {
                method: 'POST', headers: { 'Content-Type': 'application/json', 'apikey': apiKey },
                body: JSON.stringify({ number: `55${adminUser.telefone.replace(/\D/g, '')}`, text: msg })
              })
            }
          }
        }
      } catch (e) { console.error('Erro notificacao:', e) }

      return new Response(JSON.stringify({ sucesso: true }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

    } else if (acao === 'desfazer') {
      await supabase.from('ausencias_fixos').delete().eq('aula_id', aula_id).eq('devedor_id', devedor_id).eq('data', data)
      return new Response(JSON.stringify({ sucesso: true }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    return new Response(JSON.stringify({ error: 'Acao invalida' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  } catch (err) {
    console.error('Erro fixo-cancelar:', err)
    return new Response(JSON.stringify({ error: 'Erro interno' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
})
