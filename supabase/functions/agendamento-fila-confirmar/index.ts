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
    const { slug, fila_id } = await req.json()
    if (!slug || !fila_id) {
      return new Response(JSON.stringify({ error: 'slug e fila_id sao obrigatorios' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const { data: empresa } = await supabase.from('usuarios').select('id, agendamento_ativo').eq('agendamento_slug', slug).single()
    if (!empresa || !empresa.agendamento_ativo) {
      return new Response(JSON.stringify({ error: 'Empresa nao encontrada' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const { data: fila } = await supabase.from('lista_espera').select('id, aula_id, devedor_id, user_id, data, status, expira_em').eq('id', fila_id).eq('user_id', empresa.id).single()
    if (!fila || fila.status !== 'notificado') {
      return new Response(JSON.stringify({ error: 'Registro na fila nao encontrado ou ja processado' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    if (fila.expira_em && new Date(fila.expira_em) < new Date()) {
      await supabase.from('lista_espera').update({ status: 'expirado' }).eq('id', fila_id)
      return new Response(JSON.stringify({ error: 'O prazo para confirmar expirou. A vaga foi passada para o proximo da fila.' }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const { data: aula } = await supabase.from('aulas').select('id, capacidade, descricao, horario, dia_semana').eq('id', fila.aula_id).single()
    const { count: totalAgendados } = await supabase.from('agendamentos').select('id', { count: 'exact', head: true }).eq('aula_id', fila.aula_id).eq('data', fila.data).eq('status', 'confirmado')
    const { count: totalFixos } = await supabase.from('aulas_fixos').select('id', { count: 'exact', head: true }).eq('aula_id', fila.aula_id)

    if (aula && ((totalAgendados || 0) + (totalFixos || 0)) >= aula.capacidade) {
      return new Response(JSON.stringify({ error: 'Infelizmente a vaga ja foi preenchida' }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const { data: agendamento, error: agError } = await supabase.from('agendamentos').insert({
      aula_id: fila.aula_id, devedor_id: fila.devedor_id, user_id: fila.user_id, data: fila.data, status: 'confirmado'
    }).select('id, aula_id, data, status').single()
    if (agError) throw agError

    await supabase.from('lista_espera').update({ status: 'confirmado' }).eq('id', fila_id)

    const { data: devedor } = await supabase.from('devedores').select('nome, aulas_restantes').eq('id', fila.devedor_id).single()
    let aulasRestantes = devedor?.aulas_restantes
    if (devedor && devedor.aulas_restantes !== null) {
      aulasRestantes = devedor.aulas_restantes - 1
      await supabase.from('devedores').update({ aulas_restantes: aulasRestantes }).eq('id', fila.devedor_id)
    }

    try {
      const { data: conexao } = await supabase.from('mensallizap').select('instance_name, conectado').eq('user_id', fila.user_id).eq('conectado', true).maybeSingle()
      if (conexao) {
        const { data: configs } = await supabase.from('config').select('chave, valor').in('chave', ['evolution_api_key', 'evolution_api_url'])
        const configMap: Record<string, string> = {}
        if (configs) configs.forEach((c: any) => { configMap[c.chave] = c.valor })
        const apiUrl = configMap.evolution_api_url || 'https://service-evolution-api.tnvro1.easypanel.host'
        const apiKey = configMap.evolution_api_key
        if (apiKey) {
          const { data: adminUser } = await supabase.from('usuarios').select('telefone').eq('id', fila.user_id).single()
          if (adminUser?.telefone) {
            const msg = `✅ *Fila de espera - Confirmado*\n\n${devedor?.nome || 'Aluno'} confirmou a vaga na aula ${aula?.descricao || ''}\nData: ${new Date(fila.data + 'T12:00:00').toLocaleDateString('pt-BR')}\nHorario: ${aula?.horario || ''}`
            await fetch(`${apiUrl}/message/sendText/${conexao.instance_name}`, {
              method: 'POST', headers: { 'Content-Type': 'application/json', 'apikey': apiKey },
              body: JSON.stringify({ number: `55${adminUser.telefone.replace(/\D/g, '')}`, text: msg })
            })
          }
        }
      }
    } catch (e) { console.error('Erro notificacao:', e) }

    return new Response(JSON.stringify({ sucesso: true, agendamento, aulas_restantes: aulasRestantes }), { status: 201, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  } catch (err) {
    console.error('Erro fila-confirmar:', err)
    return new Response(JSON.stringify({ error: 'Erro interno' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
})
