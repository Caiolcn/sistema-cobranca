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
    const { slug, devedor_id, aula_id, data } = await req.json()
    if (!slug || !devedor_id || !aula_id || !data) {
      return new Response(JSON.stringify({ error: 'Campos obrigatorios faltando' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const { data: empresa } = await supabase.from('usuarios').select('id, agendamento_ativo').eq('agendamento_slug', slug).single()
    if (!empresa || !empresa.agendamento_ativo) {
      return new Response(JSON.stringify({ error: 'Empresa nao encontrada ou agendamento inativo' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const { data: devedor } = await supabase.from('devedores').select('id, nome').eq('id', devedor_id).eq('user_id', empresa.id).or('lixo.is.null,lixo.eq.false').single()
    if (!devedor) {
      return new Response(JSON.stringify({ error: 'Aluno nao encontrado' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const { data: aula } = await supabase.from('aulas').select('id, dia_semana, horario, descricao, capacidade').eq('id', aula_id).eq('user_id', empresa.id).eq('ativo', true).single()
    if (!aula) {
      return new Response(JSON.stringify({ error: 'Aula nao encontrada' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const { data: jaFila } = await supabase.from('lista_espera').select('id, status').eq('aula_id', aula_id).eq('devedor_id', devedor_id).eq('data', data).maybeSingle()

    if (jaFila && (jaFila.status === 'aguardando' || jaFila.status === 'notificado')) {
      return new Response(JSON.stringify({ error: 'Voce ja esta na lista de espera desta aula' }), { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const { data: jaAgendado } = await supabase.from('agendamentos').select('id').eq('aula_id', aula_id).eq('devedor_id', devedor_id).eq('data', data).eq('status', 'confirmado').maybeSingle()
    if (jaAgendado) {
      return new Response(JSON.stringify({ error: 'Voce ja tem agendamento nesta aula' }), { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const { data: ultimaPosicao } = await supabase.from('lista_espera').select('posicao').eq('aula_id', aula_id).eq('data', data).in('status', ['aguardando', 'notificado']).order('posicao', { ascending: false }).limit(1).maybeSingle()
    const posicao = (ultimaPosicao?.posicao || 0) + 1

    let filaId
    if (jaFila && (jaFila.status === 'cancelado' || jaFila.status === 'expirado')) {
      const { error: updateError } = await supabase.from('lista_espera').update({
        status: 'aguardando', posicao, notificado_em: null, expira_em: null
      }).eq('id', jaFila.id)
      if (updateError) throw updateError
      filaId = jaFila.id
    } else {
      const { data: fila, error: insertError } = await supabase.from('lista_espera').insert({
        aula_id, devedor_id, user_id: empresa.id, data, posicao, status: 'aguardando'
      }).select('id').single()
      if (insertError) throw insertError
      filaId = fila.id
    }

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
          if (adminUser?.telefone) {
            const diasSemana = ['Domingo', 'Segunda', 'Terca', 'Quarta', 'Quinta', 'Sexta', 'Sabado']
            const dataObj = new Date(data + 'T12:00:00')
            const msg = `📋 *Lista de espera*\n\n${devedor.nome} entrou na fila da aula ${aula.descricao || 'Sem descricao'}\nData: ${dataObj.toLocaleDateString('pt-BR')} (${diasSemana[dataObj.getDay()]})\nHorario: ${aula.horario}\nPosicao: ${posicao}º`
            await fetch(`${apiUrl}/message/sendText/${conexao.instance_name}`, {
              method: 'POST', headers: { 'Content-Type': 'application/json', 'apikey': apiKey },
              body: JSON.stringify({ number: `55${adminUser.telefone.replace(/\D/g, '')}`, text: msg })
            })
          }
        }
      }
    } catch (e) { console.error('Erro notificacao:', e) }

    return new Response(JSON.stringify({ sucesso: true, posicao, fila_id: filaId }), { status: 201, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  } catch (err) {
    console.error('Erro fila-entrar:', err)
    return new Response(JSON.stringify({ error: 'Erro interno' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
})
