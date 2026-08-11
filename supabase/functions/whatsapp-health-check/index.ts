// Edge Function: WhatsApp Health Check
// ============================================================
// A SONDA FOI DESLIGADA EM 11/08/26 — ERA ELA QUE DERRUBAVA OS CLIENTES.
//
// A varredura sondava cada instância "open" com POST /chat/whatsappNumbers
// (um onWhatsApp do Baileys, round-trip real ao servidor do WhatsApp) usando o
// número FAKE 5511999999999 — porque mensallizap.whatsapp_numero está NULL nas
// 26 contas pagas (o salvarConexao lê GET /instance/fetchProfile, que responde
// 404). Dava ~1.250 consultas por dia por um número inexistente, saindo do
// mesmo servidor: assinatura de anti-abuso, e a resposta do WhatsApp foi
// justamente invalidar as sessões (22 de 22 quedas com statusCode 401 loggedOut).
//
// A conta bate com a mudança de cadência:
//   até 27/07 ('0 11 * * *', 1x/dia) ..... 2,0 quedas/dia
//   de 28/07 ('*/30', 48x/dia) .......... 12,3 quedas/dia
// E as quedas seguiram o MINUTO do cron: quando ele passou de '*/30' para
// '15,45' em 05/08, o agrupamento migrou de 122 quedas nos minutos 0-2/30-32
// (5 nos minutos 15-18/45-48) para 0 e 39, respectivamente.
//
// Custo assumido: voltamos a ser cegos ao zumbi (open + socket morto). É raro
// (1 em 243 rodadas) e existe detecção melhor e de graça em logs_mensagens
// (erro_codigo 'connection_closed'/'instance_500'), que é o socket falhando num
// envio de verdade. sondarSocket() segue no arquivo, sem uso, pra rollback.
//
// NÃO reative a sonda sem trocar o número falso e a cadência — foi essa
// combinação que criou o problema.
//
// Saudável = state "open" (o painel volta a ser a fonte, com a ressalva abaixo).
//
// O QUE FAZER COM O NÃO-SAUDÁVEL depende do estado (medido na Evolution
// 2.3.7 em 31/07/2026, ver tabela abaixo):
//  - "close": não há sessão pra derrubar e o QR está livre. O logout aqui volta
//    400 "instance is not connected" — foram 711 tentativas inúteis em 7 dias.
//    O cliente reconecta sozinho, só precisa SABER que caiu.
//  - "connecting": ATENÇÃO, NÃO é a mesma coisa que "close" — a linha acima
//    dizia que era, e foi por isso que 4 contas pagantes ficaram presas sem
//    ninguém ver (uma delas 8 dias). Depois de um 401 a Evolution repareia
//    sozinha, emite QRs que ninguém escaneia, esgota o QRCODE_LIMIT e trava:
//    GET /instance/connect passa a responder 200 SEM base64 e o cliente vê
//    "QR Code não foi gerado pela API", sem saída pela tela. Só delete+recriar
//    resolve. Esta varredura era CEGA a esse estado até 11/08/26 porque lia o
//    connectionState, que responde "close" para instância que o fetchInstances
//    mostra em "connecting". Agora lê o fetchInstances (1 request pra frota
//    inteira) e marca 'travado_sem_qr' — NÃO confundir com 'qr_ja_livre'.
//  - "open" + socket morto (zumbi): é o único caso em que derrubar adianta,
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
// Mesmo fallback de config.evolution_master_instance usado no resto do sistema.
const INSTANCIA_MENSALLI = 'mensalli_master'

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

type InstanciaFrota = {
  estado: string
  ownerJid: string | null
  motivoQueda: number | null
  caiuEm: string | null
}

/**
 * Lê a frota inteira num request só.
 *
 * Substituiu 1 connectionState por cliente por 1 fetchInstances por rodada, e não
 * é só economia: o connectionState MENTE. Ele responde `close` para instância que
 * o fetchInstances mostra em `connecting` (confirmado ao vivo em 11/08 na conta do
 * Projeto Jiu-Jitsu). Era por isso que esta varredura não enxergava instância
 * travada — classificava como "QR já livre" 4 contas pagantes que estavam presas,
 * uma delas há 8 dias.
 *
 * De quebra vem ownerJid (JID canônico do cliente) e o motivo/hora da última queda.
 *
 * Devolve null se a API não respondeu: nesse caso NÃO sabemos nada sobre ninguém,
 * e a rodada inteira precisa se abster — uma instabilidade da Evolution não pode
 * virar "a base toda caiu".
 */
async function lerFrota(apiUrl: string, apiKey: string): Promise<Map<string, InstanciaFrota> | null> {
  try {
    const res = await fetchComTimeout(
      `${apiUrl}/instance/fetchInstances`,
      { headers: { apikey: apiKey } },
      PROBE_TIMEOUT_MS * 3, // payload da frota inteira
    )
    if (!res.ok) return null
    const lista = await res.json()
    if (!Array.isArray(lista)) return null

    const mapa = new Map<string, InstanciaFrota>()
    for (const i of lista) {
      const nome = i?.name || i?.instance?.instanceName
      if (!nome) continue
      mapa.set(nome, {
        estado: i?.connectionStatus || i?.instance?.state || 'close',
        ownerJid: i?.ownerJid || null,
        motivoQueda: typeof i?.disconnectionReasonCode === 'number' ? i.disconnectionReasonCode : null,
        caiuEm: i?.disconnectionAt || null,
      })
    }
    return mapa
  } catch (_e) {
    return null
  }
}

/**
 * Mesmo número, ignorando o nono dígito?
 *
 * Contas BR pré-2014 têm o JID canônico SEM o 9 mesmo depois da migração da
 * Anatel, então o telefone cadastrado e o JID real divergem na grafia sem serem
 * números diferentes. Medido na base: 18 das 26 contas pagas têm ownerJid igual
 * ao telefone do gestor, e em 8 delas a grafia difere — que são exatamente as
 * que faziam o aviso de queda voltar 400 exists:false.
 */
function mesmoNumero(a: string, b: string): boolean {
  const norm = (s: string) => {
    let n = String(s || '').replace(/\D/g, '')
    if (n.startsWith('55')) n = n.slice(2)
    if (n.length === 11 && n[2] === '9') n = n.slice(0, 2) + n.slice(3)
    return n
  }
  const x = norm(a)
  return x.length >= 10 && x === norm(b)
}

/** Grafias plausíveis do número, com e sem o nono dígito, sempre com DDI. */
function grafiasTelefone(telefone: string): string[] {
  let n = String(telefone || '').replace(/\D/g, '')
  if (!n) return []
  if (n.startsWith('55')) n = n.slice(2)
  const fora: string[] = [n]
  if (n.length === 11 && n[2] === '9') fora.push(n.slice(0, 2) + n.slice(3))
  if (n.length === 10) fora.push(n.slice(0, 2) + '9' + n.slice(2))
  return fora.map((x) => '55' + x)
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

// Canal C: envia o aviso pela instância MASTER da Mensalli ao gestor.
// (O WhatsApp do próprio cliente está fora, então usamos o número da plataforma.)
//
// Recebe o JID já resolvido (ver resolverJidGestor) em vez do telefone cru:
// montar o destino a partir do cadastro errava a grafia do nono dígito e o
// envio voltava 400 exists:false — 107 vezes em 7 dias, sem ninguém notar.
async function avisarPeloMaster(
  apiUrl: string,
  apiKey: string,
  masterInstance: string,
  jidGestor: string,
  texto: string,
): Promise<{ ok: boolean; detalhe: string | null }> {
  if (!jidGestor) return { ok: false, detalhe: 'aviso: destino do gestor vazio' }
  const destino = jidGestor.includes('@') ? jidGestor : `${jidGestor}@s.whatsapp.net`
  try {
    const res = await fetchComTimeout(
      `${apiUrl}/message/sendText/${masterInstance}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: apiKey },
        body: JSON.stringify({ number: destino, text: texto }),
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

/**
 * Descobre para qual JID mandar o aviso de queda, e cacheia.
 *
 * O envio direto para `usuarios.telefone` + '55' falha em DDD pré-2014 (o JID
 * canônico não tem o nono dígito): 107 tentativas viraram 400 exists:false em 7
 * dias, em 4 contas — ou seja, o cliente caía e NUNCA era avisado.
 *
 * Ordem: cache -> ownerJid (quando é o mesmo número do gestor, é o JID que o
 * próprio WhatsApp confirmou) -> consulta ao master testando as duas grafias.
 * A consulta é 1 número real, no máximo 1x a cada 3 dias por conta, e só quando
 * já vamos avisar — nada a ver com a sonda que derrubava a base.
 */
async function resolverJidGestor(
  apiUrl: string,
  apiKey: string,
  masterInstance: string,
  telefone: string,
  ownerJid: string | null,
  jidCacheado: string | null,
): Promise<string | null> {
  if (jidCacheado) return jidCacheado

  const soNumero = (jid: string) => jid.split('@')[0]
  if (ownerJid && mesmoNumero(soNumero(ownerJid), telefone)) return ownerJid

  const grafias = grafiasTelefone(telefone)
  if (!grafias.length) return null

  try {
    const res = await fetchComTimeout(
      `${apiUrl}/chat/whatsappNumbers/${masterInstance}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: apiKey },
        body: JSON.stringify({ numbers: grafias }),
      },
      PROBE_TIMEOUT_MS,
    )
    if (res.ok) {
      const lista = await res.json()
      const achou = (Array.isArray(lista) ? lista : []).find((i: any) => i?.exists && i?.jid)
      if (achou?.jid) return achou.jid
    }
  } catch (_e) {
    /* cai no fallback */
  }

  // Última tentativa: a grafia do cadastro, que é o que se fazia antes.
  return `${grafias[0]}@s.whatsapp.net`
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

  // Estado de TODAS as instâncias num request só (ver lerFrota).
  const frota = await lerFrota(apiUrl, apiKey)
  if (!frota) {
    // Sem a frota não sabemos nada sobre ninguém. Abster é obrigatório: gravar
    // "caiu" aqui tiraria a base inteira das views vw_parcelas_* por causa de
    // uma indisponibilidade da Evolution.
    console.error('❌ fetchInstances não respondeu — rodada abortada sem escrever nada.')
    return { abortado: 'fetchInstances indisponível', checado_em: new Date().toISOString() }
  }

  // Canal C só funciona se o WhatsApp master da Mensalli estiver conectado.
  // Se ele cai, TODO aviso de queda para em silêncio — por isso o estado dele
  // vai para a config, que o painel admin lê. Antes disso, o único registro era
  // um console.warn que ninguém via.
  const masterOk = frota.get(masterInstance)?.estado === 'open'
  if (!masterOk) console.warn('⚠️ Instância master não conectada — avisos do Canal C serão pulados.')
  const { error: erroMaster } = await admin.from('whatsapp_master_estado').upsert(
    {
      id: true,
      estado: masterOk ? 'open' : (frota.get(masterInstance)?.estado || 'inexistente'),
      checado_em: new Date().toISOString(),
    },
    { onConflict: 'id' },
  )
  // Sempre logar a falha: a primeira versão disto gravava em `config` e estourava
  // config_user_id_fkey em silêncio, então parecia que estava funcionando.
  if (erroMaster) console.error('Falha ao gravar whatsapp_master_estado:', erroMaster.message)

  // Clientes com assinatura paga.
  const { data: usuarios, error: usuariosError } = await admin
    .from('usuarios')
    .select('id, nome_empresa, email, plano, plano_pago, telefone')
    .eq('plano_pago', true)

  if (usuariosError) throw usuariosError

  const userIds = (usuarios || []).map((u: { id: string }) => u.id)
  const { data: zaps } = await admin
    .from('mensallizap')
    .select('user_id, instance_name, whatsapp_numero, gestor_jid, conectado, ultima_conexao, ultimo_aviso_desconexao')
    .in('user_id', userIds.length ? userIds : ['00000000-0000-0000-0000-000000000000'])

  type ZapInfo = {
    instance_name: string | null
    whatsapp_numero: string | null
    gestor_jid: string | null
    conectado: boolean | null
    ultima_conexao: string | null
    ultimo_aviso_desconexao: string | null
  }
  const zapPorUser = new Map<string, ZapInfo>()
  zaps?.forEach((z: ZapInfo & { user_id: string }) => {
    zapPorUser.set(z.user_id, {
      instance_name: z.instance_name,
      whatsapp_numero: z.whatsapp_numero,
      gestor_jid: z.gestor_jid,
      conectado: z.conectado,
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

    const info = frota.get(instance)
    const estado = info ? info.estado : 'inexistente'

    // ownerJid é o JID canônico do cliente — a fonte certa do número, que o
    // salvarConexao nunca conseguiu preencher porque lia /instance/fetchProfile
    // (endpoint que responde 404). Por isso whatsapp_numero está NULL em todas
    // as contas. Guardar aqui conserta o cadastro sozinho, rodada a rodada.
    if (info?.ownerJid) {
      const numero = info.ownerJid.split('@')[0]
      if (numero && numero !== zap?.whatsapp_numero) {
        await admin.from('mensallizap').update({ whatsapp_numero: numero }).eq('user_id', u.id)
      }
    }

    // Self-heal: garante o webhook de connection.update enquanto a instância existir.
    if (estado !== 'inexistente' && rodadaProfunda) {
      await garantirWebhook(apiUrl, apiKey, instance, botPorUser.get(u.id) || false)
    }

    const probeOk = false
    let probeErro: string | null = null
    let saudavel = false

    if (estado === 'inexistente') {
      // Instância nem existe na Evolution — nada a deslogar.
      probeErro = 'instância não existe na Evolution'
    } else if (estado === 'open') {
      // SONDA DESLIGADA em 11/08/26 — ver o bloco no topo do arquivo.
      // Voltamos a confiar no painel: pior ter zumbi invisível por um tempo do
      // que continuar derrubando a base inteira pra detectá-lo.
      saudavel = true
      probeErro = 'sonda desligada (veredito pelo estado do painel)'
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

    if (confirmado && estado === 'connecting') {
      // TRAVADO — o oposto de 'qr_ja_livre', apesar de os dois serem "não open".
      // Depois de um logout a Evolution repareia sozinha, emite QRs que ninguém
      // escaneia, esgota o QRCODE_LIMIT e para: o connect passa a responder 200
      // SEM base64 e o cliente vê "QR Code não foi gerado pela API". Este código
      // tratava isso como "o cliente reconecta sozinho" — e foi assim que 4
      // contas pagantes ficaram presas sem ninguém ver, uma delas por 8 dias.
      // Só delete + recriar destrava (Etapa 3; hoje é diagnóstico).
      acao = 'travado_sem_qr'
    } else if (confirmado && estado === 'close') {
      // close de verdade: não há sessão pra derrubar e o QR ESTÁ livre —
      // o cliente reconecta sozinho, só precisa saber que caiu.
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
      //
      // A condição era só `ultimo_aviso_desconexao` — e isso deixava conta
      // parada FORA da régua para sempre: quem caiu por blip (webhook grava
      // conectado=false na hora, sem aviso) ou pelo botão Desconectar voltava
      // a ficar open sem nunca ser restaurado, some de todas as vw_parcelas_*
      // com a tela dizendo "conectado". Agora qualquer divergência conserta.
      if (zap?.conectado === false || zap?.ultimo_aviso_desconexao) {
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
        const jidGestor = await resolverJidGestor(
          apiUrl, apiKey, masterInstance, u.telefone, info?.ownerJid || null, zap?.gestor_jid || null,
        )
        if (jidGestor && jidGestor !== zap?.gestor_jid) {
          await admin.from('mensallizap').update({ gestor_jid: jidGestor }).eq('user_id', u.id)
        }

        const nome = (u.nome_empresa || '').trim().split(' ')[0] || 'tudo bem'

        // Há quanto tempo está fora. A Nr assessoria ficou 8 dias sem enviar
        // nada e recebeu um aviso dizendo "detectamos que desconectou", como se
        // tivesse acabado de acontecer — o tempo é o que dá a real urgência.
        let desdeQuando = ''
        if (info?.caiuEm) {
          const dias = Math.floor((agora - Date.parse(info.caiuEm)) / 86400000)
          if (dias >= 1) desdeQuando = ` Isso já faz *${dias} ${dias === 1 ? 'dia' : 'dias'}*.`
        }

        const texto =
          `⚠️ *MensalliZap — atenção*\n\n` +
          `Olá${nome ? `, ${nome}` : ''}! Detectamos que o *WhatsApp da sua conta desconectou* ` +
          `e suas mensagens automáticas (cobranças, lembretes) não estão saindo.${desdeQuando}\n\n` +
          `👉 Reconecte agora escaneando o QR Code:\n${APP_URL}/app/whatsapp\n\n` +
          `É rápido e leva menos de 1 minuto. Qualquer dúvida, é só chamar a gente por aqui!`
        const envio = await avisarPeloMaster(apiUrl, apiKey, masterInstance, jidGestor || '', texto)
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
      // Motivo/hora da queda direto da Evolution: 401 = loggedOut (credencial
      // morta, só QR novo resolve); os outros são transitórios e o restart
      // reconecta sem pareamento. É o que vai guiar a recuperação da Etapa 2.
      motivo_queda: info?.motivoQueda ?? null,
      caiu_em: info?.caiuEm ?? null,
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
