// Edge Function: lembrete de aula 24h antes (véspera)
//
// O lembrete que já existia sai 1 hora antes da aula e é servido por uma view
// que o n8n varre (vw_aulas_lembrete_1hora). Segundo o cliente, 1h é pouco: o
// aluno já saiu de casa, já marcou outra coisa, esquece. Este aqui é o toque da
// véspera, e vale SÓ para aula avulsa (tabela `agendamentos`) — aluno de turma
// fixa receberia "sua aula é amanhã" todo dia, o que é spam e convite a bloqueio.
//
// Por que não foi para o n8n, onde mora o de 1h:
//   - o nó Code de lá aborta em 300s e marca o LOTE INTEIRO como falha, inclusive
//     o que já tinha sido entregue (98 de 150 em 10/08);
//   - workflow novo lá exige re-importar pra valer, e some da revisão de código.
// Aqui é pg_cron + esta função, do mesmo jeito que alerta-despesas e cobranca-saas.
//
// Chamada:
//   - pg_cron nos minutos 0/15/30, sem body
//   - { dryRun: true } -> não envia e não carimba; devolve o texto que sairia
//
// Nasce inerte: `configuracoes_cobranca.enviar_lembrete_aula_24h` é false por
// padrão, então a view não devolve nada até a conta ligar o toggle.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const TIPO = 'class_reminder_24h'
const MAX_POR_RODADA = 80
// O runtime derruba a função por volta de 2 min. Saímos antes: quem não coube
// fica sem carimbo e sai na rodada seguinte (a janela da view é de 1h15).
const ORCAMENTO_MS = 90_000
const PAUSA_MS = 800
const TIMEOUT_ENVIO_MS = 20_000

/** Usado quando a conta ligou o lembrete mas não tem template salvo.
 *  Sem isto o aluno receberia mensagem VAZIA — foi o que aconteceu com
 *  class_reminder e birthday, que nunca foram semeados em conta nenhuma.
 *  Tem que bater com TEMPLATES_PADRAO.class_reminder_24h de
 *  src/data/templatesPadrao.js. */
const FALLBACK = `Oi, {{nomeAluno}}! 👋

Passando pra lembrar: você tem aula *amanhã*! 📅

📆 Data: {{dataAula}} ({{diaSemana}})
⏰ Horário: {{horarioAula}}
🥋 Aula: {{descricaoAula}}
📍 Local: {{nomeEmpresa}}

Se precisar remarcar, é só responder aqui. Te espero! 💪`

interface Linha {
  agendamento_id: string
  devedor_id: string
  user_id: string
  data_aula: string
  horario: string | null
  descricao: string | null
  nome_cliente: string | null
  nome_aluno: string | null
  telefone: string | null
  experimental: boolean | null
  nome_empresa: string | null
  evolution_instance_name: string | null
  conectado: boolean | null
}

const DIAS = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado']

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
 *  fuso de Brasília — o aluno receberia a véspera da véspera. */
function dataBR(iso: string): string {
  const [ano, mes, dia] = iso.slice(0, 10).split('-')
  return `${dia}/${mes}/${ano}`
}

function diaSemana(iso: string): string {
  const [ano, mes, dia] = iso.slice(0, 10).split('-').map(Number)
  return DIAS[new Date(Date.UTC(ano, mes - 1, dia)).getUTCDay()]
}

function hora(h: string | null): string {
  return (h || '').slice(0, 5)
}

/** Aula sem descrição é o caso COMUM, não a exceção: a maioria dos horários
 *  cadastrados não tem nome. Encher a variável com um texto de reserva gerava
 *  "sua aula de sua aula", e deixar vazia gera uma linha órfã "🥋 Aula:".
 *  Então variável vazia apaga a LINHA em que ela estava — e só ela.
 *
 *  Roda antes da substituição, porque depois não há como saber qual linha
 *  existia só por causa da variável. Linha em que a variável aparece no meio de
 *  uma frase é preservada (template editado pelo cliente pode ser assim). */
function removerLinhasDeVariavelVazia(base: string, tokensVazios: string[]): string {
  if (tokensVazios.length === 0) return base

  return base
    .split('\n')
    .filter(linha => {
      if (!tokensVazios.some(t => linha.includes(t))) return true
      const semToken = tokensVazios.reduce((s, t) => s.split(t).join(''), linha)
      // Tirado o rótulo antes dos dois-pontos, sobrou texto de verdade? Se não,
      // a linha só existia pra mostrar a variável.
      return /[A-Za-zÀ-ÿ0-9]/.test(semToken.replace(/^[^:]*:/, ''))
    })
    .join('\n')
}

export function montarMensagem(template: string | null, l: Linha): string {
  const vars: Record<string, string> = {
    '{{nomeCliente}}': primeiroNome(l.nome_cliente),
    '{{nomeAluno}}': primeiroNome(l.nome_aluno),
    '{{nomeAlunoReal}}': primeiroNome(l.nome_aluno),
    '{{descricaoAula}}': l.descricao || '',
    '{{horarioAula}}': hora(l.horario),
    '{{dataAula}}': dataBR(l.data_aula),
    '{{diaSemana}}': diaSemana(l.data_aula),
    '{{nomeEmpresa}}': l.nome_empresa || 'Equipe',
  }

  const tokensVazios = Object.entries(vars).filter(([, v]) => v === '').map(([k]) => k)
  let msg = removerLinhasDeVariavelVazia(
    (template && template.trim() !== '') ? template : FALLBACK,
    tokensVazios
  )

  for (const [chave, valor] of Object.entries(vars)) {
    msg = msg.split(chave).join(valor)
  }
  // Variável vazia no meio de uma frase deixa espaço dobrado.
  return msg.replace(/ {2,}/g, ' ')
}

interface Veredito {
  ok: boolean
  transitoria: boolean
  erroCodigo: string | null
}

/** Os códigos aqui NÃO são livres: `classificar_falha` no banco (trigger de
 *  logs_mensagens) lê `erro_codigo` de uma lista fechada pra decidir
 *  `falha_classe`. Código fora dela vira 'indeterminada', e aí a Central de
 *  Mensagens não sabe se pode reenviar. Mesma classificação de
 *  mensagens-worker/index.ts.
 *
 *  Só falha DEFINITIVA carimba o agendamento; transitória fica sem carimbo e
 *  volta na rodada seguinte — a janela da view é de 1h15, então dá ~5 tentativas. */
function classificar(status: number, corpo: unknown, textoCru: string): Veredito {
  const s = `${textoCru} ${JSON.stringify(corpo ?? {})}`

  if (status >= 200 && status < 300) {
    return { ok: true, transitoria: false, erroCodigo: null }
  }

  // A Evolution entrega ao WhatsApp e SÓ DEPOIS grava no banco dela. Com o pool
  // do Prisma esgotado ela devolve 500 com a mensagem já entregue; reenviar
  // duplicaria o lembrete.
  if (status === 500 && /connection pool|PrismaClient|pris\.ly/i.test(s)) {
    return { ok: true, transitoria: false, erroCodigo: 'evolution_db_pool' }
  }

  if (status === 0) return { ok: false, transitoria: true, erroCodigo: 'exception' }
  if (/Connection Closed/i.test(s)) return { ok: false, transitoria: true, erroCodigo: 'connection_closed' }

  // "exists": false não é veredito confiável logo após pareamento — o banco
  // classifica como permanente, mas aqui vale uma nova tentativa na janela.
  if (/exists["\\\s:]*false/i.test(s)) return { ok: false, transitoria: true, erroCodigo: 'numero_inexistente' }

  if (status >= 500 || status === 429) return { ok: false, transitoria: true, erroCodigo: 'instance_500' }

  return { ok: false, transitoria: false, erroCodigo: 'bad_request' }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

  let dryRun = false
  try {
    const body = await req.json()
    dryRun = body?.dryRun === true
  } catch {
    // sem body — chamada do cron
  }

  try {
    const { data: linhas, error: erroView } = await supabase
      .from('vw_aulas_lembrete_24h')
      .select('*')
      .order('data_aula', { ascending: true })
      .limit(MAX_POR_RODADA)

    if (erroView) throw erroView
    if (!linhas || linhas.length === 0) {
      return new Response(
        JSON.stringify({ enviados: 0, pulados: 0, falhas: 0, motivo: 'nada na janela' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const { data: configs } = await supabase
      .from('config')
      .select('chave, valor')
      .in('chave', ['evolution_api_key', 'evolution_api_url'])

    const configMap: Record<string, string> = {}
    if (configs) configs.forEach((c: any) => { configMap[c.chave] = c.valor })

    const apiUrl = configMap.evolution_api_url || 'https://service-evolution-api.tnvro1.easypanel.host'
    const apiKey = configMap.evolution_api_key

    if (!apiKey) {
      return new Response(
        JSON.stringify({ erro: 'evolution_api_key não configurada' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Template por conta: customizado > padrão > FALLBACK do código
    const templateCache = new Map<string, string | null>()
    async function templateDaConta(userId: string): Promise<string | null> {
      if (templateCache.has(userId)) return templateCache.get(userId)!
      const { data } = await supabase
        .from('templates')
        .select('mensagem, is_padrao')
        .eq('user_id', userId)
        .eq('tipo', TIPO)
        .eq('ativo', true)
      const customizado = data?.find((t: any) => t.is_padrao !== true)
      const padrao = data?.find((t: any) => t.is_padrao === true)
      const escolhido = customizado?.mensagem || padrao?.mensagem || null
      templateCache.set(userId, escolhido)
      return escolhido
    }

    let enviados = 0, pulados = 0, falhas = 0, semTempo = 0
    const previa: unknown[] = []
    const problemas: unknown[] = []
    const inicio = Date.now()

    for (const l of linhas as Linha[]) {
      if (Date.now() - inicio > ORCAMENTO_MS) {
        semTempo++
        continue
      }

      // WhatsApp caído: não carimba, tenta de novo na próxima rodada. É por isso
      // que `conectado` é coluna e não filtro da view — uma queda de 10 min
      // deixaria a aula sem lembrete nenhum, calada (incidente Rede Fit, 04/08).
      if (l.conectado !== true || !l.evolution_instance_name) {
        pulados++
        continue
      }

      const numero = normalizarTelefone(l.telefone)
      if (numero.length < 12) {
        pulados++
        problemas.push({ agendamento_id: l.agendamento_id, motivo: 'telefone inválido' })
        continue
      }

      const mensagem = montarMensagem(await templateDaConta(l.user_id), l)

      if (dryRun) {
        previa.push({ agendamento_id: l.agendamento_id, aluno: l.nome_aluno, numero, mensagem })
        continue
      }

      let status = 0
      let corpo: unknown = null
      let textoCru = ''

      try {
        const ctrl = new AbortController()
        const timer = setTimeout(() => ctrl.abort(), TIMEOUT_ENVIO_MS)
        const resp = await fetch(`${apiUrl}/message/sendText/${l.evolution_instance_name}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'apikey': apiKey },
          body: JSON.stringify({ number: numero, text: mensagem }),
          signal: ctrl.signal,
        })
        clearTimeout(timer)
        status = resp.status
        textoCru = await resp.text()
        try { corpo = JSON.parse(textoCru) } catch { corpo = null }
      } catch (err) {
        status = 0
        textoCru = String(err)
      }

      const veredito = classificar(status, corpo, textoCru)
      const ok = veredito.ok
      const vaiTentarDeNovo = !ok && veredito.transitoria

      await supabase.from('logs_mensagens').insert({
        user_id: l.user_id,
        devedor_id: l.devedor_id,
        tipo: TIPO,
        telefone: numero,
        mensagem,
        status: ok ? 'enviado' : 'falha',
        erro: ok ? null : textoCru.slice(0, 300),
        erro_codigo: veredito.erroCodigo,
        http_status: status || null,
        response_api: corpo,
        enviado_em: new Date().toISOString(),
      })

      if (ok || !vaiTentarDeNovo) {
        await supabase
          .from('agendamentos')
          .update({ lembrete_24h_enviado_em: new Date().toISOString() })
          .eq('id', l.agendamento_id)
      }

      if (ok) {
        enviados++
        const { data: controle } = await supabase
          .from('controle_planos')
          .select('usage_count')
          .eq('user_id', l.user_id)
          .maybeSingle()
        if (controle) {
          await supabase
            .from('controle_planos')
            .update({ usage_count: (controle.usage_count || 0) + 1 })
            .eq('user_id', l.user_id)
        }
      } else {
        falhas++
        problemas.push({ agendamento_id: l.agendamento_id, status, retentar: vaiTentarDeNovo, corpo: textoCru.slice(0, 200) })
      }

      await new Promise(r => setTimeout(r, PAUSA_MS))
    }

    return new Response(
      JSON.stringify({
        candidatos: linhas.length,
        enviados,
        pulados,
        falhas,
        semTempo,
        ...(dryRun ? { dryRun: true, previa } : {}),
        problemas: problemas.slice(0, 10),
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    console.error('Erro lembrete-aula-24h:', err)
    return new Response(
      JSON.stringify({ erro: String(err) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
