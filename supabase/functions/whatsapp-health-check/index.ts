// Edge Function: WhatsApp Health Check
// ============================================================
// Testa DE VERDADE se a conexão Evolution de cada cliente pago
// está viva — não confia só no painel (connectionState mente:
// fica "open" mesmo com o socket morto por baixo).
//
// Teste profundo: além do connectionState, força um round-trip
// até o servidor do WhatsApp via POST /chat/whatsappNumbers.
// Se o socket estiver morto isso estoura "Connection Closed" /
// 500 / timeout, mesmo com state === "open".
//
// Saudável = state "open" E a sonda respondeu sem erro.
//
// O QUE FAZER COM O NÃO-SAUDÁVEL depende do estado (medido na Evolution
// 2.3.7 em 31/07/2026, ver tabela abaixo):
//  - "close"/"connecting": NÃO há sessão pra derrubar e o QR JÁ está livre.
//    O logout aqui volta 400 "instance is not connected" — foram 711
//    tentativas inúteis em 7 dias. O cliente consegue reconectar sozinho,
//    só precisa SABER que caiu.
//  - "open" + sonda morta (zumbi): é o único caso em que derrubar adianta,
//    e é justamente onde nada funciona —
//      DELETE /instance/logout  -> 500 "Connection Closed"
//      POST  /instance/restart  -> 200 mas no-op (socket segue morto)
//      GET   /instance/connect  -> 200 "open", SEM QR
//    A tela do cliente diz "conectado" e ele não tem como parear. Só sai
//    disso com DELETE /instance/delete + recriar, que exige o cliente
//    escanear QR de novo — por isso é ação humana, não automática.
//
// CONFIRMAÇÃO EM DUAS RODADAS: logout e aviso só acontecem quando a
// rodada ANTERIOR também viu a instância caída. Rodando de 30 em 30
// min, um blip isolado não desloga ninguém — o cliente só é derrubado
// depois de ~30 min consecutivos fora. Sem isso, 48 varreduras/dia dão
// 48 chances/dia de matar uma sessão viva por um timeout à toa.
//
// Grava um relatório (1 linha por cliente) em whatsapp_health_checks.
// Disparada de 30 em 30 min pelo pg_cron (ver sql-criar-whatsapp-health-check.sql).
// ============================================================

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Número de descarte só pra exercitar o socket quando o cliente não
// tem o próprio número salvo. Não recebe nada — é só uma consulta de
// existência (onWhatsApp). Qualquer número em formato válido serve.
const NUMERO_SONDA_FALLBACK = '5511999999999'

// Instância do WhatsApp comercial do Mensalli. O bot de aluno fica DESLIGADO
// nela, mas ela precisa do MESSAGES_UPSERT mesmo assim: é dele que sai o CRM de
// leads de campanha (/app/admin/leads). Sem esta exceção, o self-heal abaixo
// derrubaria a captura de leads todo dia às 8h.
const INSTANCIA_MENSALLI = 'instance_c93b3e8d'

// Timeout curto: socket vivo responde rápido; morto trava.
const PROBE_TIMEOUT_MS = 12000

// Anti-spam do aviso de desconexão (Canal C): re-avisa no máximo a cada 3 dias.
const REAVISO_INTERVALO_MS = 3 * 24 * 60 * 60 * 1000

// Janela pra buscar o veredito da rodada anterior (cadência de 30 min + folga).
const JANELA_STRIKE_MS = 90 * 60 * 1000

// Estados em que a Evolution respondeu e sabemos o que está acontecendo.
// "timeout"/"erro" significam que NÃO conseguimos falar com a API — nesse caso
// não dá pra concluir nada sobre o socket do cliente, então nunca deslogamos
// nem avisamos (senão uma instabilidade da Evolution derruba a base inteira).
const ESTADOS_CONCLUSIVOS = ['open', 'close', 'connecting']

// Quantos dias de relatório manter. A 48 varreduras/dia a tabela cresce ~50x
// mais rápido que antes; o painel só lê a última rodada.
const RETENCAO_RELATORIO_DIAS = 7

// URL do app pro link de reconexão na mensagem
const APP_URL = 'https://www.mensalli.com.br'

// Receiver do webhook (a mesma edge function whatsapp-bot trata MESSAGES_UPSERT
// E connection.update). O health-check (re)afirma esse webhook em cada cliente —
// é o que liga o rastreio de queda em tempo real pra toda a base, sem ninguém
// precisar reconectar.
const WEBHOOK_BOT_URL = `${SUPABASE_URL}/functions/v1/whatsapp-bot`

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function fetchComTimeout(url: string, options: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController()
  const id = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { ...options, signal: controller.signal })
  } finally {
    clearTimeout(id)
  }
}

// Lê o connectionState (o que o painel mostra). Não é confiável sozinho.
async function lerEstado(apiUrl: string, apiKey: string, instance: string): Promise<string> {
  try {
    const res = await fetchComTimeout(
      `${apiUrl}/instance/connectionState/${instance}`,
      { headers: { apikey: apiKey } },
      PROBE_TIMEOUT_MS,
    )
    if (!res.ok) return res.status === 404 ? 'inexistente' : 'erro'
    const data = await res.json()
    return data?.instance?.state || 'close'
  } catch (_e) {
    return 'timeout'
  }
}

// Sonda profunda: força round-trip ao WhatsApp. Retorna se o socket
// está REALMENTE vivo + o erro bruto (pra registrar no relatório).
async function sondarSocket(
  apiUrl: string,
  apiKey: string,
  instance: string,
  numero: string,
): Promise<{ vivo: boolean; erro: string | null }> {
  try {
    const res = await fetchComTimeout(
      `${apiUrl}/chat/whatsappNumbers/${instance}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: apiKey },
        body: JSON.stringify({ numbers: [numero] }),
      },
      PROBE_TIMEOUT_MS,
    )

    if (res.ok) {
      // 200 = o Baileys conseguiu consultar o WhatsApp => socket vivo.
      // Não importa se o número existe ou não.
      await res.json().catch(() => null)
      return { vivo: true, erro: null }
    }

    const texto = await res.text().catch(() => '')
    // Connection Closed / 500 = socket morto apesar do state "open".
    if (texto.includes('Connection Closed') || res.status === 500) {
      return { vivo: false, erro: `socket morto (HTTP ${res.status}: Connection Closed)` }
    }
    if (res.status === 404) {
      return { vivo: false, erro: 'instância não encontrada (404)' }
    }
    return { vivo: false, erro: `HTTP ${res.status}: ${texto.slice(0, 200)}` }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { vivo: false, erro: msg.includes('abort') ? 'timeout na sonda (socket travado)' : msg }
  }
}

// Tenta derrubar a sessão. Devolve o detalhe do erro junto: sem isso o
// relatório só dizia "logout_falhou" e o diagnóstico exigia ir na mão na
// Evolution descobrir por quê.
async function deslogar(
  apiUrl: string,
  apiKey: string,
  instance: string,
): Promise<{ ok: boolean; detalhe: string | null }> {
  try {
    const res = await fetchComTimeout(
      `${apiUrl}/instance/logout/${instance}`,
      { method: 'DELETE', headers: { apikey: apiKey } },
      PROBE_TIMEOUT_MS,
    )
    if (res.ok) return { ok: true, detalhe: null }
    const texto = await res.text().catch(() => '')
    return { ok: false, detalhe: `logout HTTP ${res.status}: ${texto.slice(0, 150)}` }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { ok: false, detalhe: `logout falhou: ${msg}` }
  }
}

// (Re)afirma o webhook da instância apontando pro whatsapp-bot. Mantém
// CONNECTION_UPDATE sempre; adiciona MESSAGES_UPSERT só se o bot estiver ativo
// (o /webhook/set substitui a config inteira, então mandamos a lista completa).
async function garantirWebhook(
  apiUrl: string,
  apiKey: string,
  instance: string,
  botAtivo: boolean,
): Promise<void> {
  const precisaMensagens = botAtivo || instance === INSTANCIA_MENSALLI
  const events = precisaMensagens ? ['MESSAGES_UPSERT', 'CONNECTION_UPDATE'] : ['CONNECTION_UPDATE']
  try {
    await fetchComTimeout(
      `${apiUrl}/webhook/set/${instance}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: apiKey },
        body: JSON.stringify({
          webhook: { enabled: true, url: WEBHOOK_BOT_URL, webhookByEvents: false, webhookBase64: false, events },
        }),
      },
      PROBE_TIMEOUT_MS,
    )
  } catch (_e) {
    // best-effort: se falhar, a próxima varredura tenta de novo
  }
}

// Telefone do gestor pro padrão internacional (55…), só dígitos.
function formatarTelefone(telefone: string): string | null {
  let n = (telefone || '').replace(/\D/g, '')
  if (!n) return null
  if (!n.startsWith('55')) n = '55' + n
  return n
}

// Canal C: envia o aviso pela instância MASTER da Mensalli ao gestor.
// (O WhatsApp do próprio cliente está fora, então usamos o número da plataforma.)
async function avisarPeloMaster(
  apiUrl: string,
  apiKey: string,
  masterInstance: string,
  telefoneGestor: string,
  texto: string,
): Promise<{ ok: boolean; detalhe: string | null }> {
  const numero = formatarTelefone(telefoneGestor)
  if (!numero) return { ok: false, detalhe: 'aviso: telefone do gestor vazio' }
  try {
    const res = await fetchComTimeout(
      `${apiUrl}/message/sendText/${masterInstance}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: apiKey },
        body: JSON.stringify({ number: `${numero}@s.whatsapp.net`, text: texto }),
      },
      PROBE_TIMEOUT_MS,
    )
    if (res.ok) return { ok: true, detalhe: null }
    // Por que o aviso não saiu: em 31/07/26 contas na MESMA rodada, com o
    // mesmo master vivo e telefones de formato idêntico, umas receberam e
    // outras não — sem o corpo da resposta não dá pra saber o motivo.
    const texto400 = await res.text().catch(() => '')
    return { ok: false, detalhe: `aviso HTTP ${res.status}: ${texto400.slice(0, 150)}` }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { ok: false, detalhe: `aviso falhou: ${msg}` }
  }
}

// Master está conectado? Só tenta o Canal C se sim (senão sobra o Canal A).
async function masterConectado(apiUrl: string, apiKey: string, masterInstance: string): Promise<boolean> {
  return (await lerEstado(apiUrl, apiKey, masterInstance)) === 'open'
}

// Faz o trabalho pesado. Roda em background (EdgeRuntime.waitUntil),
// desacoplado de quem chamou — o pg_net tem timeout de 5s e a varredura
// de todos os clientes demora bem mais. Grava o relatório em lotes pra
// não perder o progresso caso o tempo de execução estoure.
async function executarVarredura(): Promise<Record<string, unknown>> {
  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

  // Credenciais globais da Evolution (mesma config usada no app)
  const { data: configs } = await admin
    .from('config')
    .select('chave, valor')
    .in('chave', ['evolution_api_key', 'evolution_api_url', 'evolution_master_instance'])

  const configMap: Record<string, string> = {}
  configs?.forEach((c: { chave: string; valor: string }) => {
    configMap[c.chave] = c.valor
  })
  const apiKey = configMap.evolution_api_key
  const apiUrl = configMap.evolution_api_url || 'https://service-evolution-api.tnvro1.easypanel.host'
  const masterInstance = configMap.evolution_master_instance || 'mensalli_master'

  if (!apiKey) {
    throw new Error('evolution_api_key não configurada na tabela config')
  }

  // Canal C só funciona se o WhatsApp master da Mensalli estiver conectado.
  // Checa uma vez; se estiver fora, cai só no Canal A (banner in-app).
  const masterOk = await masterConectado(apiUrl, apiKey, masterInstance)
  if (!masterOk) console.warn('⚠️ Instância master não conectada — avisos do Canal C serão pulados.')

  // Clientes com assinatura paga. Junta o número/instância já conhecidos
  // (mensallizap) pra usar o próprio número como sonda quando houver.
  const { data: usuarios, error: usuariosError } = await admin
    .from('usuarios')
    .select('id, nome_empresa, email, plano, plano_pago, telefone')
    .eq('plano_pago', true)

  if (usuariosError) throw usuariosError

  const userIds = (usuarios || []).map((u: { id: string }) => u.id)
  const { data: zaps } = await admin
    .from('mensallizap')
    .select('user_id, instance_name, whatsapp_numero, conectado, ultima_conexao, ultimo_aviso_desconexao')
    .in('user_id', userIds.length ? userIds : ['00000000-0000-0000-0000-000000000000'])

  type ZapInfo = {
    instance_name: string | null
    whatsapp_numero: string | null
    ultima_conexao: string | null
    ultimo_aviso_desconexao: string | null
  }
  const zapPorUser = new Map<string, ZapInfo>()
  zaps?.forEach((z: ZapInfo & { user_id: string }) => {
    zapPorUser.set(z.user_id, {
      instance_name: z.instance_name,
      whatsapp_numero: z.whatsapp_numero,
      ultima_conexao: z.ultima_conexao,
      ultimo_aviso_desconexao: z.ultimo_aviso_desconexao,
    })
  })

  // bot_ativo por usuário — define se o webhook leva MESSAGES_UPSERT junto.
  const { data: cfgs } = await admin
    .from('configuracoes_cobranca')
    .select('user_id, bot_ativo')
    .in('user_id', userIds.length ? userIds : ['00000000-0000-0000-0000-000000000000'])
  const botPorUser = new Map<string, boolean>()
  cfgs?.forEach((c: { user_id: string; bot_ativo: boolean }) => botPorUser.set(c.user_id, !!c.bot_ativo))

  // Veredito da rodada anterior (última linha de cada cliente dentro da janela).
  // É o que autoriza as ações destrutivas: só mexemos em quem já estava caído
  // na varredura passada. Na primeira execução após um deploy o mapa vem vazio,
  // então ninguém é deslogado/avisado — a rodada seguinte é que decide.
  const { data: anteriores } = await admin
    .from('whatsapp_health_checks')
    .select('user_id, saudavel, checado_em')
    .gte('checado_em', new Date(Date.now() - JANELA_STRIKE_MS).toISOString())
    .order('checado_em', { ascending: false })

  const caidoNaRodadaAnterior = new Map<string, boolean>()
  anteriores?.forEach((r: { user_id: string; saudavel: boolean }) => {
    // A lista vem do mais recente pro mais antigo: o primeiro de cada user vence.
    if (!caidoNaRodadaAnterior.has(r.user_id)) caidoNaRodadaAnterior.set(r.user_id, !r.saudavel)
  })

  // O self-heal do webhook não precisa rodar 48x/dia — 1x/dia resolve e evita
  // martelar a Evolution. Roda na varredura das 8h BRT (11h UTC).
  const rodadaProfunda = new Date().getUTCHours() === 11

  const checadoEm = new Date().toISOString()
  const agora = Date.now()
  let total = 0
  let saudaveis = 0
  let mortos = 0
  let deslogados = 0
  let avisados = 0
  let buffer: Record<string, unknown>[] = []

  // Grava o buffer acumulado (lote). Chamado a cada N clientes e no fim,
  // pra que o relatório sobreviva mesmo se a execução for interrompida.
  const flush = async () => {
    if (!buffer.length) return
    const { error: insErr } = await admin.from('whatsapp_health_checks').insert(buffer)
    if (insErr) console.error('Erro ao gravar lote do relatório:', insErr.message)
    buffer = []
  }

  for (const u of usuarios || []) {
    const zap = zapPorUser.get(u.id)
    const instance = zap?.instance_name || `instance_${u.id.substring(0, 8)}`
    const numeroSonda = (zap?.whatsapp_numero || '').replace(/\D/g, '') || NUMERO_SONDA_FALLBACK

    const estado = await lerEstado(apiUrl, apiKey, instance)

    // Self-heal: garante o webhook de connection.update enquanto a instância existir.
    if (estado !== 'inexistente' && rodadaProfunda) {
      await garantirWebhook(apiUrl, apiKey, instance, botPorUser.get(u.id) || false)
    }

    let probeOk = false
    let probeErro: string | null = null
    let saudavel = false

    if (estado === 'inexistente') {
      // Instância nem existe na Evolution — nada a deslogar.
      probeErro = 'instância não existe na Evolution'
    } else if (estado === 'open') {
      // Só vale a pena sondar quando o painel diz "open" — é justamente
      // o caso que mente. Se já está close/connecting, não está saudável.
      const sonda = await sondarSocket(apiUrl, apiKey, instance, numeroSonda)
      probeOk = sonda.vivo
      probeErro = sonda.erro
      saudavel = sonda.vivo
    } else {
      probeErro = `estado "${estado}" (painel já indica não-conectado)`
    }

    let acao = 'nenhuma'
    let detalheAcao: string | null = null

    // Só agimos sobre estado conclusivo: se a Evolution deu timeout/erro não
    // sabemos nada sobre o cliente, e uma instabilidade da API não pode virar
    // logout em massa. O masterOk funciona como canário do mesmo problema.
    const estadoConclusivo = ESTADOS_CONCLUSIVOS.includes(estado)
    const confirmado = !saudavel && estadoConclusivo && caidoNaRodadaAnterior.get(u.id) === true

    if (confirmado && estado !== 'open') {
      // close/connecting: a Evolution recusa logout ("instance is not
      // connected") e não há o que liberar — o QR já está disponível.
      // Não depende do master: é diagnóstico, não ação.
      acao = 'qr_ja_livre'
    } else if (confirmado && masterOk) {
      // open + sonda morta = zumbi. Tentar o logout continua valendo (é barato
      // e funciona nas janelas em que o socket dá sinal de vida — aconteceu
      // 1x em 243), mas quando falha marcamos 'zumbi_travado': esse cliente
      // NÃO consegue reconectar sozinho e precisa de delete+recriar.
      const r = await deslogar(apiUrl, apiKey, instance)
      acao = r.ok ? 'logout' : 'zumbi_travado'
      detalheAcao = r.detalhe
      if (r.ok) deslogados++
    } else if (!saudavel && estadoConclusivo) {
      acao = 'aguardando_confirmacao'
    }

    // ============ AVISO DE DESCONEXÃO (Canais A + C) ============
    // Só avisa quem JÁ tinha conectado um dia (ultima_conexao != null) —
    // não enche quem nunca configurou. Instância inexistente também não avisa.
    const jaConectouAlgumDia = !!zap?.ultima_conexao
    if (saudavel) {
      // Reconectou: garante conectado=true e ZERA o anti-spam, pra que a
      // próxima queda avise imediatamente.
      if (zap?.ultimo_aviso_desconexao) {
        await admin
          .from('mensallizap')
          .update({ conectado: true, ultimo_aviso_desconexao: null, updated_at: checadoEm })
          .eq('user_id', u.id)
      }
    } else if (estadoConclusivo && jaConectouAlgumDia) {
      // Canal A: reflete a queda no mensallizap (o banner in-app lê isso) já na
      // PRIMEIRA rodada — é ação não-destrutiva e, além do banner, tira a conta
      // das views de automação na hora, evitando disparo contra socket morto.
      const ultimoAviso = zap?.ultimo_aviso_desconexao ? Date.parse(zap.ultimo_aviso_desconexao) : 0
      const podeReavisar = !ultimoAviso || (agora - ultimoAviso) >= REAVISO_INTERVALO_MS

      // Canal C: WhatsApp da plataforma → telefone do gestor (anti-spam 3 dias).
      // Exige confirmação em duas rodadas: uma queda de segundos que já se
      // resolveu sozinha não vira mensagem de alarme pro gestor.
      let avisouAgora = false
      if (confirmado && masterOk && podeReavisar && u.telefone) {
        const nome = (u.nome_empresa || '').trim().split(' ')[0] || 'tudo bem'
        const texto =
          `⚠️ *MensalliZap — atenção*\n\n` +
          `Olá${nome ? `, ${nome}` : ''}! Detectamos que o *WhatsApp da sua conta desconectou* ` +
          `e suas mensagens automáticas (cobranças, lembretes) não estão saindo.\n\n` +
          `👉 Reconecte agora escaneando o QR Code:\n${APP_URL}/app/whatsapp\n\n` +
          `É rápido e leva menos de 1 minuto. Qualquer dúvida, é só chamar a gente por aqui!`
        const envio = await avisarPeloMaster(apiUrl, apiKey, masterInstance, u.telefone, texto)
        avisouAgora = envio.ok
        if (envio.detalhe) detalheAcao = [detalheAcao, envio.detalhe].filter(Boolean).join(' | ')
        if (avisouAgora) avisados++
      }

      // ultima_desconexao marca QUANDO caiu, não quando foi checado: só grava na
      // primeira rodada em que vimos a queda. Reescrever a cada 30 min apagaria
      // há quanto tempo o cliente está fora (e o timestamp exato que o webhook
      // connection.update já tinha registrado).
      const quedaNova = caidoNaRodadaAnterior.get(u.id) !== true
      await admin
        .from('mensallizap')
        .update({
          conectado: false,
          updated_at: checadoEm,
          ...(quedaNova ? { ultima_desconexao: checadoEm } : {}),
          ...(avisouAgora ? { ultimo_aviso_desconexao: checadoEm } : {}),
        })
        .eq('user_id', u.id)

      if (avisouAgora) acao = acao === 'nenhuma' ? 'avisado' : `${acao}+avisado`
    }

    total++
    if (saudavel) saudaveis++
    else if (estado === 'open') mortos++

    buffer.push({
      user_id: u.id,
      nome_empresa: u.nome_empresa || u.email || '—',
      plano: u.plano || null,
      instance_name: instance,
      estado_painel: estado,
      probe_ok: probeOk,
      saudavel,
      acao,
      erro: [probeErro, detalheAcao].filter(Boolean).join(' | ') || null,
      checado_em: checadoEm,
    })

    // Grava em lotes de 10 pra não perder progresso se o tempo estourar
    if (buffer.length >= 10) await flush()

    // Throttle leve pra não martelar a Evolution
    await sleep(400)
  }

  await flush()

  // Retenção: a 48 varreduras/dia o relatório cresce rápido e o painel só lê a
  // rodada mais recente. Limpa na varredura profunda pra não pagar isso 48x.
  if (rodadaProfunda) {
    const corte = new Date(Date.now() - RETENCAO_RELATORIO_DIAS * 24 * 60 * 60 * 1000).toISOString()
    const { error: delErr } = await admin.from('whatsapp_health_checks').delete().lt('checado_em', corte)
    if (delErr) console.error('Erro na limpeza do relatório:', delErr.message)
  }

  const resumo = { total, saudaveis, mortos_detectados: mortos, deslogados, avisados, checado_em: checadoEm }
  console.log('✅ Health check concluído:', JSON.stringify(resumo))
  return resumo
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  // Roda a varredura em background: responde 200 na hora (o pg_net tem
  // timeout de 5s) e deixa o trabalho pesado terminar desacoplado.
  // @ts-ignore — EdgeRuntime é injetado pelo runtime do Supabase
  EdgeRuntime.waitUntil(
    executarVarredura().catch((e) => {
      const msg = e instanceof Error ? e.message : String(e)
      console.error('❌ Erro no health check:', msg)
    }),
  )

  return new Response(
    JSON.stringify({ success: true, message: 'Varredura iniciada em background. Consulte admin_whatsapp_saude() em alguns segundos.' }),
    { status: 202, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  )
})
