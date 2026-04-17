// Edge Function: Agendamento Online - Cadastrar Aluno Novo
// Cria devedor com origem='agendamento' e status experimental
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
    const { slug, nome, telefone } = await req.json()

    if (!slug || !nome || !telefone) {
      return new Response(
        JSON.stringify({ error: 'slug, nome e telefone sao obrigatorios' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (nome.trim().length < 2) {
      return new Response(
        JSON.stringify({ error: 'Nome deve ter pelo menos 2 caracteres' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const telNormalizado = normalizarTelefone(telefone)
    if (telNormalizado.length < 10) {
      return new Response(
        JSON.stringify({ error: 'Telefone invalido' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 1. Buscar empresa pelo slug
    const { data: empresa } = await supabase
      .from('usuarios')
      .select('id, nome_empresa, agendamento_ativo')
      .eq('agendamento_slug', slug)
      .single()

    if (!empresa || !empresa.agendamento_ativo) {
      return new Response(
        JSON.stringify({ error: 'Empresa nao encontrada ou agendamento inativo' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 2. Verificar se ja existe aluno com esse telefone
    const { data: existentes } = await supabase
      .from('devedores')
      .select('id, telefone')
      .eq('user_id', empresa.id)
      .or('lixo.is.null,lixo.eq.false')

    const jaExiste = existentes?.find(d => normalizarTelefone(d.telefone || '') === telNormalizado)

    if (jaExiste) {
      return new Response(
        JSON.stringify({ error: 'Ja existe um aluno com esse telefone', aluno_id: jaExiste.id }),
        { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 3. Gerar portal_token
    const portalToken = crypto.randomUUID().replace(/-/g, '')

    // 4. Criar devedor (marcado como experimental pra sair da lista de clientes pagantes
    //    e entrar no CRM de Experimentais)
    const { data: novoAluno, error: insertError } = await supabase
      .from('devedores')
      .insert({
        user_id: empresa.id,
        nome: nome.trim(),
        telefone: telefone.trim(),
        valor_devido: 0,
        data_vencimento: new Date().toISOString().split('T')[0],
        status: 'pendente',
        assinatura_ativa: false,
        origem: 'agendamento',
        experimental: true,
        portal_token: portalToken,
      })
      .select('id, nome, telefone')
      .single()

    if (insertError) {
      console.error('Erro ao criar aluno:', insertError)
      return new Response(
        JSON.stringify({ error: 'Erro ao criar cadastro' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 4b. Criar lead vinculado (feeds no CRM/kanban coluna "Aula experimental")
    await supabase.from('leads').insert({
      user_id: empresa.id,
      nome: nome.trim(),
      telefone: telefone.trim(),
      origem: 'agendamento',
      interesse: 'Aula experimental',
      status: 'experimental',
      convertido_em_devedor_id: novoAluno.id,
    })

    // 5. Notificar admin via WhatsApp (buscar conexao)
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
            const telAdmin = normalizarTelefone(adminUser.telefone)
            const msg = `🆕 *Novo aluno experimental*\n\n` +
              `Nome: ${nome.trim()}\n` +
              `Telefone: ${telefone.trim()}\n\n` +
              `Cadastrado pelo link de agendamento online.\n` +
              `Acesse o painel para gerenciar.`

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
      // Notificacao falhou, mas cadastro foi feito - nao bloquear
      console.error('Erro ao notificar admin:', notifErr)
    }

    return new Response(
      JSON.stringify({
        sucesso: true,
        aluno: {
          id: novoAluno.id,
          nome: novoAluno.nome,
          aulas_restantes: null,
          aulas_total: null,
        },
      }),
      { status: 201, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (err) {
    console.error('Erro agendamento-cadastrar:', err)
    return new Response(
      JSON.stringify({ error: 'Erro interno do servidor' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
