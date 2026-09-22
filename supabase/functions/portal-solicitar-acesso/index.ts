// Edge Function: Portal do Aluno - link único da conta (/portal/c/{slug})
//
// O aluno digita o WhatsApp e recebe o link individual dele (/portal/{token})
// NO NÚMERO CADASTRADO, pela instância da escola. A prova de identidade é estar
// com o celular na mão — não saber uma data de nascimento, que é pública e
// chutável. O portal mostra e deixa editar CPF e endereço, muitos alunos são
// menores, então a porta precisa ser mais forte que "telefone + aniversário".
//
// GET  ?slug=&token=  → { nome_empresa, logo_url, token_ok } pra montar a tela.
//                       token_ok diz se o token salvo no aparelho é DESTA conta
//                       (o aluno pode ser de duas escolas).
// POST { slug, telefone } → sempre { ok: true }, tenha ou não achado aluno, pra
//                       ninguém descobrir quem é aluno testando números. Única
//                       exceção: { offline: true } quando a escola está sem
//                       WhatsApp — isso não revela nada sobre os alunos.
//
// Acesso PUBLICO (sem autenticacao). Limite de tentativas em
// portal_acesso_solicitacoes (sql-portal-acesso-conta.sql).

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const APP_URL = Deno.env.get('APP_URL') || 'https://www.mensalli.com.br'

const LIMITE_POR_TELEFONE_24H = 3
const LIMITE_POR_IP_1H = 10
const LIMITE_POR_CONTA_24H = 300

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

// Mesmo helper do whatsapp-bot: com e sem 55, com e sem o 9 do celular.
// Cadastro salvo como (62) 98161-8862, 6281618862 ou 5562981618862 casa igual.
function variantesTelefone(tel: string): string[] {
  const limpo = String(tel || '').replace(/\D/g, '')
  const semDDI = limpo.startsWith('55') ? limpo.slice(2) : limpo
  const variantes = new Set<string>()
  variantes.add(limpo)
  variantes.add(semDDI)
  variantes.add('55' + semDDI)
  if (semDDI.length === 11 && semDDI[2] === '9') {
    const sem9 = semDDI.slice(0, 2) + semDDI.slice(3)
    variantes.add(sem9)
    variantes.add('55' + sem9)
  }
  if (semDDI.length === 10) {
    const com9 = semDDI.slice(0, 2) + '9' + semDDI.slice(2)
    variantes.add(com9)
    variantes.add('55' + com9)
  }
  return Array.from(variantes)
}

// Forma canônica pro limite de tentativas: 55 + DDD + 9 + número.
// Sem isso, digitar com e sem o 9 contaria como dois telefones.
function telefoneCanonico(tel: string): string {
  const limpo = String(tel || '').replace(/\D/g, '')
  let semDDI = limpo.startsWith('55') && limpo.length >= 12 ? limpo.slice(2) : limpo
  if (semDDI.length === 10) semDDI = semDDI.slice(0, 2) + '9' + semDDI.slice(2)
  return '55' + semDDI
}

function normalizarParaEnvio(tel: string): string {
  let t = String(tel || '').replace(/\D/g, '')
  if (t && !t.startsWith('55')) t = '55' + t
  return t
}

function primeiroNome(nome: string | null): string {
  return (nome || '').trim().split(/\s+/)[0] || ''
}

function codigoErro(status: number, textoCru: string): string {
  if (/Connection Closed/i.test(textoCru)) return 'connection_closed'
  if (/exists["\\\s:]*false/i.test(textoCru)) return 'numero_inexistente'
  if (status >= 500) return 'instance_500'
  return 'bad_request'
}

function ipDaRequisicao(req: Request): string {
  const xff = req.headers.get('x-forwarded-for') || ''
  return (xff.split(',')[0] || req.headers.get('cf-connecting-ip') || 'desconhecido').trim()
}

function montarMensagem(nomeEmpresa: string, alunos: { nome: string; responsavel_nome: string | null; portal_token: string }[]): string {
  const link = (t: string) => `${APP_URL}/portal/${t}`
  const rodape = '\n\n_Se não foi você que pediu, é só ignorar esta mensagem._'

  if (alunos.length === 1) {
    const a = alunos[0]
    const nome = primeiroNome(a.responsavel_nome || a.nome)
    return `Olá${nome ? `, ${nome}` : ''}! 👋\n\n` +
      `Aqui está o seu acesso ao portal do aluno da *${nomeEmpresa}*:\n\n${link(a.portal_token)}\n\n` +
      `Por lá você vê suas mensalidades, paga pelo PIX e confere seus horários.` +
      rodape
  }

  const lista = alunos.map(a => `*${a.nome.trim()}*\n${link(a.portal_token)}`).join('\n\n')
  return `Olá! 👋\n\n` +
    `Aqui estão os acessos ao portal do aluno da *${nomeEmpresa}*:\n\n${lista}` +
    rodape
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

  try {
    // ====== GET: dados da tela ======
    if (req.method === 'GET') {
      const url = new URL(req.url)
      const slug = url.searchParams.get('slug') || ''
      const token = url.searchParams.get('token') || ''
      if (!slug) return json({ error: 'slug obrigatorio' }, 400)

      const { data: empresa } = await supabase
        .from('usuarios')
        .select('id, nome_empresa, logo_url')
        .eq('agendamento_slug', slug)
        .maybeSingle()

      if (!empresa) return json({ error: 'Link não encontrado' }, 404)

      let tokenOk = false
      if (token.length >= 20) {
        const { data: dev } = await supabase
          .from('devedores')
          .select('id')
          .eq('portal_token', token)
          .eq('user_id', empresa.id)
          .or('lixo.is.null,lixo.eq.false')
          .maybeSingle()
        tokenOk = !!dev
      }

      return json({ nome_empresa: empresa.nome_empresa, logo_url: empresa.logo_url, token_ok: tokenOk })
    }

    if (req.method !== 'POST') return json({ error: 'Metodo nao suportado' }, 405)

    // ====== POST: pedir o link ======
    const { slug, telefone } = await req.json().catch(() => ({}))
    const digitos = String(telefone || '').replace(/\D/g, '')
    if (!slug || digitos.length < 10 || digitos.length > 13) {
      return json({ error: 'Informe o WhatsApp com DDD' }, 400)
    }

    const { data: empresa } = await supabase
      .from('usuarios')
      .select('id, nome_empresa')
      .eq('agendamento_slug', slug)
      .maybeSingle()

    if (!empresa) return json({ error: 'Link não encontrado' }, 404)

    const telNorm = telefoneCanonico(digitos)
    const ip = ipDaRequisicao(req)
    const agora = Date.now()
    const ha24h = new Date(agora - 24 * 60 * 60 * 1000).toISOString()
    const ha1h = new Date(agora - 60 * 60 * 1000).toISOString()

    const registrar = (resultado: string, alunos = 0) =>
      supabase.from('portal_acesso_solicitacoes').insert({
        user_id: empresa.id, telefone_norm: telNorm, ip, resultado, alunos,
      })

    // 1. Limites de tentativa. O de IP pode aparecer pro usuário (não revela
    //    nada sobre alunos); os de telefone e conta respondem igual ao sucesso.
    //    Pro telefone só conta pedido que chegou a procurar aluno: tentar com
    //    a escola offline, ou já barrado, não queima as tentativas do aluno.
    const [{ count: porIp }, { count: porTel }, { count: porConta }] = await Promise.all([
      supabase.from('portal_acesso_solicitacoes').select('id', { count: 'exact', head: true })
        .eq('ip', ip).gte('created_at', ha1h),
      supabase.from('portal_acesso_solicitacoes').select('id', { count: 'exact', head: true })
        .eq('telefone_norm', telNorm).in('resultado', ['enviado', 'nao_encontrado', 'falha'])
        .gte('created_at', ha24h),
      supabase.from('portal_acesso_solicitacoes').select('id', { count: 'exact', head: true })
        .eq('user_id', empresa.id).gte('created_at', ha24h),
    ])

    if ((porIp || 0) >= LIMITE_POR_IP_1H) {
      await registrar('limite')
      return json({ error: 'Muitas tentativas. Tente de novo daqui a pouco.' }, 429)
    }
    if ((porTel || 0) >= LIMITE_POR_TELEFONE_24H || (porConta || 0) >= LIMITE_POR_CONTA_24H) {
      await registrar('limite')
      return json({ ok: true })
    }

    // 2. A escola consegue mandar mensagem? Conta vencida não envia nada
    //    (mesma regra das automações) e instância caída não tem por onde.
    const [{ data: podeEnviar }, { data: conexao }] = await Promise.all([
      supabase.rpc('usuario_pode_enviar', { p_user_id: empresa.id }),
      supabase.from('mensallizap').select('instance_name')
        .eq('user_id', empresa.id).eq('conectado', true).maybeSingle(),
    ])

    if (!podeEnviar || !conexao?.instance_name) {
      await registrar('offline')
      return json({ offline: true })
    }

    // 3. Alunos desse número (dele ou do responsável). Irmãos dividem telefone,
    //    então pode vir mais de um — todos vão na MESMA mensagem, e a lista de
    //    nomes só aparece dentro do WhatsApp do dono do número.
    const { data: devedores } = await supabase
      .from('devedores')
      .select('id, nome, telefone, responsavel_telefone, responsavel_nome, portal_token, comunicacoes_ativas')
      .eq('user_id', empresa.id)
      .or('lixo.is.null,lixo.eq.false')

    const variantes = new Set(variantesTelefone(digitos))
    const casa = (tel: string | null) => {
      if (!tel) return false
      return variantesTelefone(String(tel)).some(v => variantes.has(v))
    }

    let numeroDestino = ''
    const alunos = (devedores || []).filter((d: any) => {
      if (!d.portal_token || d.comunicacoes_ativas === false) return false
      if (casa(d.responsavel_telefone)) { numeroDestino ||= d.responsavel_telefone; return true }
      if (casa(d.telefone)) { numeroDestino ||= d.telefone; return true }
      return false
    })

    if (alunos.length === 0) {
      await registrar('nao_encontrado')
      return json({ ok: true })
    }

    await registrar('enviado', alunos.length)

    // 4. Envio em segundo plano: a resposta sai no mesmo tempo que a de
    //    "não encontrado", senão a demora do envio entregaria quem é aluno.
    //    Vai pro número DO CADASTRO, não pro que foi digitado.
    const envio = (async () => {
      try {
        const { data: configs } = await supabase
          .from('config')
          .select('chave, valor')
          .in('chave', ['evolution_api_key', 'evolution_api_url'])
        const cm: Record<string, string> = {}
        for (const c of configs || []) cm[c.chave] = c.valor
        const apiUrl = cm.evolution_api_url || 'https://service-evolution-api.tnvro1.easypanel.host'
        const apiKey = cm.evolution_api_key
        if (!apiKey) { console.error('❌ Sem evolution_api_key'); return }

        const numero = normalizarParaEnvio(numeroDestino)
        const mensagem = montarMensagem(empresa.nome_empresa || 'escola', alunos)

        const resp = await fetch(`${apiUrl}/message/sendText/${conexao.instance_name}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'apikey': apiKey },
          body: JSON.stringify({ number: numero, text: mensagem }),
        })
        const textoCru = await resp.text()
        let corpo: unknown = null
        try { corpo = JSON.parse(textoCru) } catch { /* corpo não-JSON */ }

        await supabase.from('logs_mensagens').insert({
          user_id: empresa.id,
          devedor_id: alunos[0].id,
          tipo: 'portal_acesso',
          telefone: numero,
          mensagem,
          status: resp.ok ? 'enviado' : 'falha',
          erro: resp.ok ? null : textoCru.slice(0, 300),
          erro_codigo: resp.ok ? null : codigoErro(resp.status, textoCru),
          http_status: resp.status,
          response_api: corpo,
          enviado_em: new Date().toISOString(),
        })

        if (!resp.ok) {
          await supabase.from('portal_acesso_solicitacoes')
            .update({ resultado: 'falha' })
            .eq('user_id', empresa.id).eq('telefone_norm', telNorm).eq('resultado', 'enviado')
            .gte('created_at', new Date(agora - 60 * 1000).toISOString())
        }
      } catch (e) {
        console.error('❌ Erro ao enviar link do portal:', e)
      }
    })()

    // deno-lint-ignore no-explicit-any
    const runtime = (globalThis as any).EdgeRuntime
    if (runtime?.waitUntil) runtime.waitUntil(envio)
    else await envio

    return json({ ok: true })
  } catch (err) {
    console.error('Erro portal-solicitar-acesso:', err)
    return json({ error: 'Erro interno' }, 500)
  }
})
