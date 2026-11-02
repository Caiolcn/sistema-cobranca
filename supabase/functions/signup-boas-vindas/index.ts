// Edge Function: boas-vindas do cadastro (Mensalli -> novo cliente)
// ---------------------------------------------------------------------------
// POR QUE ESTA FUNCAO EXISTE
// As duas mensagens do cadastro (saudacao + cobranca de exemplo) saem da
// instancia MASTER, porque o recem-cadastrado ainda nao conectou o WhatsApp
// dele. Ate 22/09/2026 isso era feito pelo navegador, em src/Signup.js. O
// evolution-proxy (commit 196af67) fechou esse caminho: cliente comum so opera
// a propria instancia, entao todo cadastro novo levava 403 do proxy e ninguem
// recebia nada -- em silencio, porque o Signup so fazia console.error e esse
// envio nunca gravou em logs_mensagens.
//
// A correcao NAO foi abrir excecao no proxy. Deixar cliente comum mandar
// sendText pela master transformaria qualquer conta logada num canal de spam
// pelo numero comercial do Mensalli. Em vez disso o envio veio pra ca, com o
// destino fora do alcance de quem chama.
//
// REGRAS DE SEGURANCA (as tres juntas sao o que impede o abuso)
// 1. Exige JWT valido.
// 2. O telefone de destino NUNCA vem do corpo: e lido de usuarios.telefone da
//    propria pessoa que chama. Nao da pra apontar esta funcao pra um numero
//    arbitrario.
// 3. Uma vez por conta (usuarios.boas_vindas_enviado_em) e so nos primeiros
//    JANELA_DIAS de vida da conta. Sem isso, uma conta antiga viraria um botao
//    de "mandar 2 mensagens pela master" acionavel para sempre.
//
// Admin tem um caminho a parte (user_id + forcar) pro reenvio manual, que e o
// que resgata quem nasceu durante a janela quebrada.
//
// FLUXO "RESPONDE QUERO" (02/11/2026, sql-boas-vindas-quero.sql)
// Desde entao sai UMA mensagem so, pedindo "responde QUERO". A cobranca de
// exemplo virou resposta: quem manda e o whatsapp-bot, quando a pessoa
// responde. Motivo: no maximo 2 mensagens automaticas do master pra quem nunca
// respondeu (a 2a e a de 24h, no trial-avisos). Esta funcao carimba
// boas_vindas_aguarda_quero_desde, que e o que habilita o QUERO no bot, e
// grava o envio em retencao_saas_envios (canal 'boas_vindas').

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Fallback de config.evolution_master_instance. Se a master for renomeada,
// troca la -- ja houve incidente de 3 dias por esse nome ficar fixo no codigo.
const INSTANCIA_MENSALLI = 'mensalli_master'

// Janela de vida da conta em que a boas-vindas ainda faz sentido. Fecha o canal
// de spam e evita "seja bem-vindo!" chegando semanas depois pra quem cadastrou
// e sumiu.
const JANELA_DIAS = 7

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })

// ---------------------------------------------------------------------------
// Texto. A cobranca de exemplo e os proximos passos moram em templates_admin
// (bv_exemplo / bv_proximos_passos) e saem do whatsapp-bot quando a pessoa
// responde QUERO. Texto do dono, literal.
// ---------------------------------------------------------------------------
const saudacao = (primeiroNome: string) =>
  `Oi${primeiroNome ? `, ${primeiroNome}` : ''}! 👋\n\n` +
  `Aqui é o Caio, do Mensalli.\n\n` +
  `Vi que você acabou de criar sua conta, seja bem-vindo! 🎉\n\n` +
  `Quer ver como seus alunos vão receber a cobrança, direto do seu WhatsApp?\n\n` +
  `Responde QUERO que eu te mando um exemplo agora 👇`

// ---------------------------------------------------------------------------
// Numero. Porte fiel do gerarVariantesNumero/verificarNumeroWhatsApp do
// whatsappService: conta BR antiga pode existir no WhatsApp SEM o nono digito,
// e mandar pra variante errada e mensagem que nao chega em ninguem.
// ---------------------------------------------------------------------------
function variantes(telefone: string): string[] {
  let n = (telefone || '').replace(/\D/g, '')
  if (!n) return []
  if (!n.startsWith('55')) n = '55' + n

  const lista = [n]
  if (n.length >= 12) {
    const ddd = n.substring(2, 4)
    const resto = n.substring(4)
    if (resto.length === 9 && resto.startsWith('9')) lista.push('55' + ddd + resto.substring(1))
    else if (resto.length === 8) lista.push('55' + ddd + '9' + resto)
  }
  return lista
}

async function resolverJid(apiUrl: string, apiKey: string, instancia: string, telefone: string) {
  const lista = variantes(telefone)
  if (lista.length === 0) return null
  if (lista.length === 1) return lista[0] + '@s.whatsapp.net'

  try {
    const r = await fetch(`${apiUrl}/chat/whatsappNumbers/${instancia}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: apiKey },
      body: JSON.stringify({ numbers: lista.map((n) => n + '@s.whatsapp.net') }),
      signal: AbortSignal.timeout(10000),
    })
    if (r.ok) {
      const dados = await r.json()
      const achados = Array.isArray(dados) ? dados : (dados?.response || [])
      const valido = achados.find((x: Record<string, unknown>) => x?.exists === true)
      if (valido) {
        const jid = String(valido.jid || valido.number)
        return jid.includes('@') ? jid : jid + '@s.whatsapp.net'
      }
    }
  } catch (_e) {
    // Verificacao e melhoria, nao pre-requisito: cai no numero original.
  }
  return lista[0] + '@s.whatsapp.net'
}

async function enviar(apiUrl: string, apiKey: string, instancia: string, jid: string, texto: string) {
  try {
    const r = await fetch(`${apiUrl}/message/sendText/${instancia}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: apiKey },
      body: JSON.stringify({ number: jid, text: texto }),
      signal: AbortSignal.timeout(30000),
    })
    const bruto = await r.text()
    if (!r.ok) return { ok: false, erro: bruto.slice(0, 300), http: r.status }
    return { ok: true, http: r.status }
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : String(e), http: 0 }
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: 'Nao autenticado' }, 401)

    const supabaseAuth = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: { user } } = await supabaseAuth.auth.getUser()
    if (!user) return json({ error: 'Token invalido' }, 401)

    const body = await req.json().catch(() => ({}))
    const alvoPedido: string | undefined = body?.user_id
    const forcar: boolean = body?.forcar === true

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    // Papel lido do banco com service_role -- nunca do corpo.
    const { data: perfil } = await supabase
      .from('usuarios').select('role').eq('id', user.id).maybeSingle()
    const ehAdmin = perfil?.role === 'admin'

    // Mandar pra OUTRA conta, ou repetir um envio ja feito, e operacao de admin.
    if ((alvoPedido && alvoPedido !== user.id) || forcar) {
      if (!ehAdmin) return json({ error: 'Operacao restrita a administrador' }, 403)
    }
    const alvoId = alvoPedido || user.id

    const { data: conta } = await supabase
      .from('usuarios')
      .select('id, nome_completo, telefone, created_at, boas_vindas_enviado_em')
      .eq('id', alvoId)
      .maybeSingle()
    if (!conta) return json({ error: 'Conta nao encontrada' }, 404)
    if (!conta.telefone) return json({ error: 'Conta sem telefone', enviado: false }, 400)

    // Trava de envio unico. Nao e erro: o Signup pode repetir a chamada num
    // refresh, e reenviar a mesma boas-vindas e pior do que nao fazer nada.
    if (conta.boas_vindas_enviado_em && !forcar) {
      return json({ ok: true, enviado: false, motivo: 'ja_enviado', em: conta.boas_vindas_enviado_em })
    }

    // Trava de janela. Admin com `forcar` passa por cima (resgate manual).
    const idadeDias = (Date.now() - new Date(conta.created_at).getTime()) / 86400000
    if (idadeDias > JANELA_DIAS && !forcar) {
      return json({ ok: true, enviado: false, motivo: 'conta_fora_da_janela', idade_dias: Math.round(idadeDias) })
    }

    const { data: cfgRows } = await supabase
      .from('config').select('chave, valor')
      .in('chave', ['evolution_api_url', 'evolution_api_key', 'evolution_master_instance'])
    const cfg: Record<string, string> = {}
    for (const r of cfgRows || []) cfg[r.chave] = r.valor

    const apiUrl = (cfg.evolution_api_url || '').replace(/\/+$/, '')
    const apiKey = cfg.evolution_api_key
    const instancia = cfg.evolution_master_instance || INSTANCIA_MENSALLI
    if (!apiUrl || !apiKey) return json({ error: 'Evolution nao configurada' }, 500)

    const primeiroNome = String(conta.nome_completo || '').trim().split(' ')[0]
    const jid = await resolverJid(apiUrl, apiKey, instancia, conta.telefone)
    if (!jid) return json({ error: 'Telefone invalido', enviado: false }, 400)

    const texto = saudacao(primeiroNome)
    const r1 = await enviar(apiUrl, apiKey, instancia, jid, texto)

    // Carimba se saiu. boas_vindas_aguarda_quero_desde e o que faz o
    // whatsapp-bot aceitar o QUERO dessa conta e o trial-avisos mandar a
    // mensagem de 24h -- conta sem ele e do fluxo antigo.
    if (r1.ok) {
      const agoraIso = new Date().toISOString()
      await supabase.from('usuarios')
        .update({ boas_vindas_enviado_em: agoraIso, boas_vindas_aguarda_quero_desde: agoraIso })
        .eq('id', alvoId)
    }

    // Log de auditoria de tudo que sai do master pra conta.
    const { error: errLog } = await supabase.from('retencao_saas_envios').insert({
      usuario_id: alvoId,
      tipo: 'bv_saudacao',
      mensagem: texto,
      canal: 'boas_vindas',
      status: r1.ok ? 'enviado' : 'falha',
      erro: r1.ok ? null : `${r1.http} ${r1.erro}`,
      enviado_por: forcar ? user.id : null,
    })
    if (errLog) console.error('[signup-boas-vindas] log falhou:', errLog.message)

    // O que quebrou agora aparece nos logs da funcao, em vez de morrer num
    // console.error dentro do navegador de quem acabou de se cadastrar.
    if (!r1.ok) {
      console.error('[signup-boas-vindas] falha', { alvoId, instancia, jid, r1 })
    }

    return json({
      ok: true,
      enviado: r1.ok,
      saudacao: r1.ok,
      // O exemplo agora so sai quando a pessoa responde QUERO (whatsapp-bot).
      aguardando_quero: r1.ok,
      instancia,
      detalhe: r1.ok ? null : { saudacao: r1 },
    })
  } catch (e) {
    console.error('[signup-boas-vindas] erro:', e)
    return json({ error: e instanceof Error ? e.message : 'Erro inesperado' }, 500)
  }
})
