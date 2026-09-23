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
// Textos. Moraram em src/Signup.js ate agora; vieram junto com o envio pra que
// exista um lugar so pra mexer neles -- e pra que fechar a aba logo depois do
// cadastro nao corte a segunda mensagem no meio, como acontecia no navegador.
// ---------------------------------------------------------------------------
const saudacao = (primeiroNome: string) =>
  `Oi ${primeiroNome}! 👋

Aqui é o Caio, da equipe do Mensalli. Vi que você acabou de criar sua conta — seja muito bem-vindo(a)! 🎉

Sua conta já está com tudo desbloqueado. Pra ver a mágica acontecer, é só cadastrar seus alunos e ativar a cobrança automática no WhatsApp.

Ficou com qualquer dúvida na hora de configurar? Pode responder aqui mesmo que eu te ajudo. 😊`

const cobrancaExemplo = (primeiroNome: string) =>
  `Olá, Maria.

Este é um lembrete referente à sua mensalidade:

📌 Plano Mensal
💰 R$ 150,00
📅 Vencimento: dia 10

🔑 Chave PIX: academia@exemplo.com.br

Estamos à disposição para qualquer esclarecimento.
━━━━━━━━━━━━━━━
${primeiroNome}, esta é uma cobrança de exemplo.

Vai ser assim que seus alunos vão receber, direto do seu WhatsApp. E todo esse texto você pode editar do jeito que você preferir dentro do Mensalli. ✏️`

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

    // Em sequencia, nao em paralelo: as duas precisam chegar nessa ordem.
    const r1 = await enviar(apiUrl, apiKey, instancia, jid, saudacao(primeiroNome))
    const r2 = r1.ok
      ? await enviar(apiUrl, apiKey, instancia, jid, cobrancaExemplo(primeiroNome))
      : { ok: false, erro: 'saudacao falhou antes', http: 0 }

    // Carimba se a saudacao saiu. O exemplo falhar sozinho nao deve liberar um
    // segundo "seja bem-vindo" na proxima chamada.
    if (r1.ok) {
      await supabase.from('usuarios')
        .update({ boas_vindas_enviado_em: new Date().toISOString() })
        .eq('id', alvoId)
    }

    // O que quebrou agora aparece nos logs da funcao, em vez de morrer num
    // console.error dentro do navegador de quem acabou de se cadastrar.
    if (!r1.ok || !r2.ok) {
      console.error('[signup-boas-vindas] falha', { alvoId, instancia, jid, r1, r2 })
    }

    return json({
      ok: true,
      enviado: r1.ok,
      saudacao: r1.ok,
      exemplo: r2.ok,
      instancia,
      detalhe: r1.ok && r2.ok ? null : { saudacao: r1, exemplo: r2 },
    })
  } catch (e) {
    console.error('[signup-boas-vindas] erro:', e)
    return json({ error: e instanceof Error ? e.message : 'Erro inesperado' }, 500)
  }
})
