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

const DIAS_SEMANA = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado']

function normalizarTelefone(tel: string | null): string {
  let t = String(tel || '').replace(/\D/g, '')
  if (t && !t.startsWith('55')) t = '55' + t
  return t
}

function primeiroNome(nome: string | null): string {
  return (nome || '').trim().split(/\s+/)[0] || ''
}

/** Formata direto da string YYYY-MM-DD.
 *  NÃO usar new Date('YYYY-MM-DD'): a data é lida como UTC e volta um dia no
 *  fuso de Brasília — o aluno receberia a confirmação com a data errada. */
function dataBR(iso: string): string {
  const [ano, mes, dia] = iso.slice(0, 10).split('-')
  return `${dia}/${mes}/${ano}`
}

function diaSemanaBR(iso: string): string {
  const [ano, mes, dia] = iso.slice(0, 10).split('-').map(Number)
  return DIAS_SEMANA[new Date(Date.UTC(ano, mes - 1, dia)).getUTCDay()]
}

/** Texto usado quando a conta ligou a confirmação mas não tem template salvo.
 *  Sem isto o aluno receberia mensagem VAZIA — foi o que aconteceu com
 *  class_reminder e birthday, que nunca foram semeados em conta nenhuma.
 *  Tem que bater com TEMPLATES_PADRAO.booking_confirmed de
 *  src/data/templatesPadrao.js. */
const FALLBACK_CONFIRMACAO = `Oi, {{nomeAluno}}! ✅

Sua aula está *confirmada*!

📆 Data: {{dataAula}} ({{diaSemana}})
⏰ Horário: {{horarioAula}}
🥋 Aula: {{descricaoAula}}
📍 Local: {{nomeEmpresa}}

Chegue uns 10 minutinhos antes. Se precisar remarcar, é só responder aqui.

Até lá! 💪`

/** `classificar_falha` no banco lê `erro_codigo` de uma lista fechada pra
 *  decidir se a Central de Mensagens pode oferecer reenvio. Código fora dela
 *  vira 'indeterminada'. Mesma lista de mensagens-worker e lembrete-aula-24h. */
function codigoErro(status: number, textoCru: string): string {
  if (/Connection Closed/i.test(textoCru)) return 'connection_closed'
  if (/exists["\\\s:]*false/i.test(textoCru)) return 'numero_inexistente'
  if (status >= 500) return 'instance_500'
  return 'bad_request'
}

/** Aula sem descrição é o caso COMUM, não a exceção: a maioria dos horários
 *  cadastrados não tem nome. Encher a variável com um texto de reserva gerava
 *  "Aula: sua aula", e deixar vazia gera uma linha órfã "🥋 Aula:". Então
 *  variável vazia apaga a LINHA em que ela estava — e só ela.
 *
 *  Roda antes da substituição, porque depois não há como saber qual linha
 *  existia só por causa da variável. Cópia do mesmo helper de
 *  lembrete-aula-24h; mexer aqui pede mexer lá. */
function removerLinhasDeVariavelVazia(base: string, tokensVazios: string[]): string {
  if (tokensVazios.length === 0) return base

  return base
    .split('\n')
    .filter(linha => {
      if (!tokensVazios.some(t => linha.includes(t))) return true
      const semToken = tokensVazios.reduce((s, t) => s.split(t).join(''), linha)
      return /[A-Za-zÀ-ÿ0-9]/.test(semToken.replace(/^[^:]*:/, ''))
    })
    .join('\n')
}

function montarConfirmacao(template: string | null, dados: {
  nomeCliente: string | null
  nomeAluno: string | null
  descricaoAula: string | null
  horarioAula: string | null
  dataAula: string
  nomeEmpresa: string | null
}): string {
  const vars: Record<string, string> = {
    '{{nomeCliente}}': primeiroNome(dados.nomeCliente),
    '{{nomeAluno}}': primeiroNome(dados.nomeAluno),
    '{{nomeAlunoReal}}': primeiroNome(dados.nomeAluno),
    '{{descricaoAula}}': dados.descricaoAula || '',
    '{{horarioAula}}': (dados.horarioAula || '').slice(0, 5),
    '{{dataAula}}': dataBR(dados.dataAula),
    '{{diaSemana}}': diaSemanaBR(dados.dataAula),
    '{{nomeEmpresa}}': dados.nomeEmpresa || 'Equipe',
  }

  const tokensVazios = Object.entries(vars).filter(([, v]) => v === '').map(([k]) => k)
  let msg = removerLinhasDeVariavelVazia(
    (template && template.trim() !== '') ? template : FALLBACK_CONFIRMACAO,
    tokensVazios
  )

  for (const [chave, valor] of Object.entries(vars)) {
    msg = msg.split(chave).join(valor)
  }
  return msg.replace(/ {2,}/g, ' ')
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
      .select('id, agendamento_ativo, nome_empresa')
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
      .select('id, nome, user_id, aulas_restantes, telefone, responsavel_nome, comunicacoes_ativas, bloquear_mensagens')
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

    // Bloquear se houver mensalidade vencida (status pendente + data_vencimento < hoje)
    const hojeStr = new Date().toISOString().split('T')[0]
    const { data: vencidas } = await supabase
      .from('mensalidades')
      .select('id')
      .eq('devedor_id', devedor.id)
      .eq('status', 'pendente')
      .lt('data_vencimento', hojeStr)
      .limit(1)

    if (vencidas && vencidas.length > 0) {
      return new Response(
        JSON.stringify({ error: 'Você possui mensalidade(s) vencida(s). Regularize para agendar aulas.' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
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

    // 9b. Se for experimental e ainda nao tem primeira_aula no lead, popular
    await supabase
      .from('leads')
      .update({ primeira_aula_data: data, primeira_aula_id: aula_id })
      .eq('convertido_em_devedor_id', devedor_id)
      .eq('status', 'experimental')
      .is('primeira_aula_data', null)

    // 10. Avisar no WhatsApp: o dono sempre, o aluno se a conta ligou a confirmação.
    //
    // As duas mensagens saem da MESMA instância (a do cliente) e nenhuma delas
    // pode derrubar o agendamento — que já está gravado a esta altura. Por isso
    // tudo aqui vive dentro de try/catch e nunca muda a resposta da função.
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

        const enviar = async (numero: string, texto: string) => {
          const resp = await fetch(`${apiUrl}/message/sendText/${conexao.instance_name}`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'apikey': apiKey,
            },
            body: JSON.stringify({ number: numero, text: texto }),
          })
          const textoCru = await resp.text()
          let corpo: unknown = null
          try { corpo = JSON.parse(textoCru) } catch { /* corpo não-JSON */ }
          return { ok: resp.ok, status: resp.status, textoCru, corpo }
        }

        if (apiKey) {
          // 10a. Notificação do dono (comportamento antigo, intocado)
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

            await enviar(`55${telAdmin}`, msg)
          }

          // 10b. Confirmação para o ALUNO — o pedido do cliente. Até aqui quem
          // marcava pelo link não recebia nada e ficava sem prova de que deu certo.
          const { data: cfg } = await supabase
            .from('configuracoes_cobranca')
            .select('enviar_confirmacao_agendamento')
            .eq('user_id', empresa.id)
            .maybeSingle()

          const alunoAceitaMensagem =
            devedor.comunicacoes_ativas !== false && devedor.bloquear_mensagens !== true

          if (cfg?.enviar_confirmacao_agendamento === true && alunoAceitaMensagem) {
            const telAluno = normalizarTelefone(devedor.telefone)

            if (telAluno.length >= 12) {
              const { data: templates } = await supabase
                .from('templates')
                .select('mensagem, is_padrao')
                .eq('user_id', empresa.id)
                .eq('tipo', 'booking_confirmed')
                .eq('ativo', true)

              const customizado = templates?.find((t: any) => t.is_padrao !== true)
              const padrao = templates?.find((t: any) => t.is_padrao === true)

              const mensagem = montarConfirmacao(customizado?.mensagem || padrao?.mensagem || null, {
                nomeCliente: devedor.responsavel_nome || devedor.nome,
                nomeAluno: devedor.nome,
                descricaoAula: aula.descricao,
                horarioAula: aula.horario,
                dataAula: data,
                nomeEmpresa: empresa.nome_empresa,
              })

              const r = await enviar(telAluno, mensagem)

              await supabase.from('logs_mensagens').insert({
                user_id: empresa.id,
                devedor_id: devedor.id,
                tipo: 'booking_confirmed',
                telefone: telAluno,
                mensagem,
                status: r.ok ? 'enviado' : 'falha',
                erro: r.ok ? null : r.textoCru.slice(0, 300),
                erro_codigo: r.ok ? null : codigoErro(r.status, r.textoCru),
                http_status: r.status,
                response_api: r.corpo,
                enviado_em: new Date().toISOString(),
              })
            }
          }
        }
      }
    } catch (notifErr) {
      console.error('Erro ao notificar agendamento:', notifErr)
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
