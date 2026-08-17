import { supabase, FUNCTIONS_URL } from '../supabaseClient'
import { modoEspelhoAtivo } from '../utils/modoEspelho'
import { TEMPLATES_SEED } from '../data/templatesPadrao'

/**
 * Primitivas de conexão com a Evolution API.
 *
 * Existem para o wizard de onboarding poder conectar o WhatsApp sem duplicar as
 * ~200 linhas do WhatsAppConexao.js (que segue sendo a tela completa: templates,
 * automações, desconectar, diagnóstico). Aqui fica só o mínimo do "parear o
 * aparelho": criar a instância, pegar o QR, checar o estado e gravar no banco.
 *
 * Mesma convenção de nome de instância usada pelo whatsappService e pela tela de
 * conexão — trocar isso quebraria todos os envios.
 */

const API_URL_PADRAO = 'https://service-evolution-api.tnvro1.easypanel.host'

/**
 * Nome que uma conta NOVA recebe. Só isso — não use para descobrir a instância
 * de uma conta existente; para isso existe o resolverInstanceName abaixo.
 */
export function nomePadraoInstancia(userId) {
  return `instance_${userId.substring(0, 8)}`
}

/**
 * Descobre em qual instância da Evolution esta conta vive.
 *
 * LÊ do banco. Derivar do user_id (como era em 8 pontos do código) amarrava
 * cada conta a um único nome para sempre — e é isso que transforma o deadlock
 * da Evolution em beco sem saída: quando aquele nome trava (logout 500, delete
 * 400, connect sem QR — caso Rede Fit em 17/08), não há para onde ir, e a única
 * saída vira mexer no Postgres da Evolution ou reiniciar o container inteiro.
 *
 * Lendo do banco, destravar passa a ser: cria instância com nome novo, aponta
 * o mensallizap para ela, cliente escaneia. A travada vira órfã inofensiva.
 *
 * Fallback no nome padrão para conta que ainda não tem registro (primeiro
 * pareamento) — é o mesmo que as edge functions já fazem.
 */
export async function resolverInstanceName(userId) {
  if (!userId) return null
  try {
    const { data } = await supabase
      .from('mensallizap')
      .select('instance_name')
      .eq('user_id', userId)
      .maybeSingle()
    return data?.instance_name || nomePadraoInstancia(userId)
  } catch {
    return nomePadraoInstancia(userId)
  }
}

/** @deprecated use resolverInstanceName (lê do banco) ou nomePadraoInstancia. */
export function getInstanceName(userId) {
  return nomePadraoInstancia(userId)
}

/** Lê a chave/URL globais da Evolution e monta a config da instância do usuário. */
export async function carregarConfigEvolution(userId) {
  const { data } = await supabase
    .from('config')
    .select('chave, valor')
    .in('chave', ['evolution_api_key', 'evolution_api_url'])

  const mapa = {}
  data?.forEach((item) => { mapa[item.chave] = item.valor })

  return {
    apiKey: mapa.evolution_api_key || '',
    apiUrl: mapa.evolution_api_url || API_URL_PADRAO,
    instanceName: await resolverInstanceName(userId)
  }
}

/** 'open' | 'connecting' | 'close' — 'close' também cobre instância inexistente. */
export async function verificarEstado(config) {
  if (!config?.apiKey) return 'close'
  try {
    const response = await fetch(
      `${config.apiUrl}/instance/connectionState/${config.instanceName}`,
      { headers: { apikey: config.apiKey } }
    )
    if (!response.ok) return 'close'
    const data = await response.json()
    return data.instance?.state || 'close'
  } catch {
    return 'close'
  }
}

// Número de descarte só pra exercitar o socket. Não recebe nada — é consulta de
// existência (onWhatsApp). Mesmo fallback usado pelo whatsapp-health-check.
const NUMERO_SONDA = '5511999999999'

/**
 * DESATIVADA em 11/08/26 — não chame. Mantida só para rollback.
 *
 * Esta sonda (e a gêmea no whatsapp-health-check) era o que derrubava a base:
 * consultar repetidamente um número INEXISTENTE contra o servidor do WhatsApp é
 * assinatura de anti-abuso, e a resposta foi invalidar as sessões (22 de 22
 * quedas com statusCode 401 loggedOut). A média saiu de 2,0 para 12,3 quedas/dia
 * quando a varredura passou de 1x/dia para 48x/dia, e as quedas passaram a
 * acontecer no MINUTO do cron.
 *
 * Aqui no front era ainda pior que no cron: rodava toda vez que o cliente abria
 * /app/whatsapp — ou seja, batíamos no número falso justamente na instância de
 * quem tinha acabado de cair.
 *
 * Se um dia voltar: com número real e sem repetição. Ver o topo do
 * supabase/functions/whatsapp-health-check/index.ts.
 */
export async function sondarSocket(config, timeoutMs = 12000) {
  if (!config?.apiKey) return false
  const controller = new AbortController()
  const id = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(`${config.apiUrl}/chat/whatsappNumbers/${config.instanceName}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: config.apiKey },
      body: JSON.stringify({ numbers: [NUMERO_SONDA] }),
      signal: controller.signal
    })
    // 200 = o Baileys conseguiu falar com o WhatsApp. Se o número existe é irrelevante.
    return res.ok
  } catch {
    return false
  } finally {
    clearTimeout(id)
  }
}

/**
 * Veredito da conexão, para a UI e para o que se grava no banco.
 *
 *  'conectado'    — o painel diz open.
 *  'desconectado' — close/connecting.
 *  'zumbi'        — open + socket morto. NÃO é mais devolvido aqui: distinguir
 *                   zumbi exigia a sonda, e o preço dela era derrubar a base
 *                   (ver sondarSocket). Quem passou a denunciar zumbi é o envio
 *                   real falhando — logs_mensagens.erro_codigo 'connection_closed'.
 *                   O tratamento de 'zumbi' segue no chamador para quando a
 *                   detecção voltar por esse caminho.
 */
export async function verificarSaude(config) {
  const estado = await verificarEstado(config)
  return { estado, veredito: estado === 'open' ? 'conectado' : 'desconectado' }
}

const WEBHOOK_BOT_URL = `${FUNCTIONS_URL}/whatsapp-bot`

/**
 * (Re)aponta o webhook da instância para o whatsapp-bot.
 *
 * Obrigatório depois de TODO create: a configuração de webhook morre junto com
 * a instância no delete, e sem o CONNECTION_UPDATE a conta some do rastreio de
 * queda em tempo real — o cliente cai e ninguém fica sabendo até a varredura
 * seguinte. O /webhook/set substitui a config inteira, então vai a lista toda.
 */
async function garantirWebhook(config, userId) {
  let botAtivo = false
  if (userId) {
    const { data } = await supabase
      .from('configuracoes_cobranca')
      .select('bot_ativo')
      .eq('user_id', userId)
      .maybeSingle()
    botAtivo = !!data?.bot_ativo
  }

  try {
    await fetch(`${config.apiUrl}/webhook/set/${config.instanceName}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: config.apiKey },
      body: JSON.stringify({
        webhook: {
          enabled: true,
          url: WEBHOOK_BOT_URL,
          webhookByEvents: false,
          webhookBase64: false,
          events: botAtivo ? ['MESSAGES_UPSERT', 'CONNECTION_UPDATE'] : ['CONNECTION_UPDATE']
        }
      })
    })
  } catch {
    // best-effort: o self-heal do health-check reafirma na próxima rodada
  }
}

/**
 * Tenta trazer a instância de volta SEM novo pareamento.
 *
 * Numa queda transitória (428 connectionClosed, 408 timeout, 515 restartRequired)
 * a credencial continua válida e o restart reconecta sem o cliente ver QR nenhum.
 *
 * Vem antes de qualquer reset porque re-parear não é de graça: segundo
 * docs/runbook-lid-whatsapp.md o re-pareamento é o GATILHO da migração LID, e
 * conta migrada na 2.3.7 não entrega mais nada — o envio volta 201 e o sistema
 * marca "enviado". Resetar por reflexo troca "escaneia o QR de novo" por "esta
 * conta nunca mais envia e ninguém percebe".
 *
 * POST: o PUT devolve 404 nesta versão (medido em 11/08/26).
 */
export async function tentarRestart(config, numeroReal, esperaMs = 15000) {
  if (!config?.apiKey) return false

  // SEM número não há como provar que voltou. Antes isto conferia o resultado
  // com o connectionState — que responde 'open' para instância ZUMBI, sempre.
  // Resultado: em 17/08 o botão "Forçar nova conexão" da Rede Fit declarou
  // "Conectado" numa instância que não enviava nada. Na dúvida, dizemos que NÃO
  // voltou: seguir para o reset é recuperável; mentir "conectado" devolve a
  // conta para a régua e as cobranças falham em silêncio.
  if (!numeroReal) return false

  try {
    const res = await fetch(`${config.apiUrl}/instance/restart/${config.instanceName}`, {
      method: 'POST', headers: { apikey: config.apiKey }
    })
    if (!res.ok) return false
  } catch {
    return false
  }

  const limite = Date.now() + esperaMs
  while (Date.now() < limite) {
    await pausa(2500)
    if (await sondarSocketReal(config, numeroReal)) return true
  }
  return false
}

/**
 * Round-trip real ao WhatsApp com um número REAL do próprio cliente.
 *
 * É o único teste honesto de "consegue enviar". Diferente da sondarSocket
 * antiga, que usava número inventado em massa e derrubou a base: aqui é 1
 * consulta, com número do próprio dono, e só dentro de uma ação do usuário.
 */
async function sondarSocketReal(config, numero, timeoutMs = 12000) {
  if (!config?.apiKey || !numero) return false
  const controller = new AbortController()
  const id = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(`${config.apiUrl}/chat/whatsappNumbers/${config.instanceName}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: config.apiKey },
      body: JSON.stringify({ numbers: [String(numero).replace(/\D/g, '')] }),
      signal: controller.signal
    })
    return res.ok
  } catch {
    return false
  } finally {
    clearTimeout(id)
  }
}

/** Número real do cliente, do cadastro. Null se não houver — aí não se afirma nada. */
async function numeroRealDoCliente(userId) {
  if (!userId) return null
  try {
    const { data: z } = await supabase
      .from('mensallizap')
      .select('whatsapp_numero, gestor_jid')
      .eq('user_id', userId)
      .maybeSingle()
    if (z?.whatsapp_numero) return z.whatsapp_numero
    if (z?.gestor_jid) return String(z.gestor_jid).split('@')[0]

    const { data: u } = await supabase
      .from('usuarios').select('telefone').eq('id', userId).maybeSingle()
    const n = String(u?.telefone || '').replace(/\D/g, '')
    if (n.length < 10) return null
    return n.startsWith('55') ? n : '55' + n
  } catch {
    return null
  }
}

const pausa = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

export const MENSAGEM_TRAVADA =
  'Não conseguimos liberar sua conexão para gerar um novo QR Code. ' +
  'Isso é um travamento no servidor do WhatsApp, não é nada que você fez errado — ' +
  'fale com o suporte que destravamos manualmente.'

/**
 * true quando a instância não existe mais na Evolution (404 no fetch por nome).
 *
 * Não dá para usar o connectionState aqui: ele responde `close` para uma
 * instância que o fetchInstances mostra presa em `connecting` (visto ao vivo na
 * conta do Projeto Jiu-Jitsu). Confiar nele faria o reset achar que limpou sem
 * ter limpado, e o create logo depois voltaria 403 sobre a instância travada.
 */
async function instanciaSumiu(config) {
  try {
    const res = await fetch(
      `${config.apiUrl}/instance/fetchInstances?instanceName=${encodeURIComponent(config.instanceName)}`,
      { headers: { apikey: config.apiKey } }
    )
    if (res.status === 404) return true
    if (!res.ok) return false
    const data = await res.json()
    const lista = Array.isArray(data) ? data : [data]
    return !lista.some((i) => (i?.name || i?.instance?.instanceName) === config.instanceName)
  } catch {
    return false
  }
}

/**
 * Derruba a sessão na Evolution e espera o nome da instância ficar livre.
 *
 * É o "desentupidor" do pareamento: recriar do zero é o que reseta o ciclo de QR
 * da instância. Enquanto o nome segue preso, /instance/connect responde 200 SEM
 * o base64 — que é o "QR Code não foi gerado pela API" que o cliente via, sem
 * nenhuma saída pela tela.
 *
 * logout e delete são best-effort de propósito: numa instância caída o logout
 * responde 400 "is not connected" (confirmado na conta do Projeto Jiu-Jitsu) e
 * num zumbi dá 500. Por isso quem manda é o sumiço confirmado, não o status HTTP.
 */
export async function resetarInstancia(config, tentativas = 4) {
  if (!config?.apiKey) return false

  await fetch(`${config.apiUrl}/instance/logout/${config.instanceName}`, {
    method: 'DELETE', headers: { apikey: config.apiKey }
  }).catch(() => {})
  await fetch(`${config.apiUrl}/instance/delete/${config.instanceName}`, {
    method: 'DELETE', headers: { apikey: config.apiKey }
  }).catch(() => {})

  // O delete não é instantâneo: a Evolution ainda derruba o socket e limpa a
  // sessão depois de responder. Recriar antes disso ressuscita a instância presa.
  for (let i = 0; i < tentativas; i++) {
    await pausa(1000)
    if (await instanciaSumiu(config)) return true
  }
  return false
}

/** Cria (se preciso) e pede o QR. Devolve o base64 ou null se a API não mandou. */
async function criarEConectar(config, userId) {
  // 403/409 = instância já existe; não é erro.
  const createResponse = await fetch(`${config.apiUrl}/instance/create`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: config.apiKey },
    body: JSON.stringify({
      instanceName: config.instanceName,
      qrcode: true,
      integration: 'WHATSAPP-BAILEYS'
    })
  })

  // 401/403 de chave inválida precisa estourar: nenhum reset resolve isso e
  // insistir só esconderia a causa real atrás de "conexão travada".
  if (createResponse.status === 401) {
    throw new Error('Integração do WhatsApp recusada pelo servidor. Fale com o suporte.')
  }
  if (![403, 409].includes(createResponse.status) && !createResponse.ok) {
    const erro = await createResponse.json().catch(() => ({}))
    throw new Error(erro.message || `Erro ao criar instância: HTTP ${createResponse.status}`)
  }

  // Antes do connect: se este create veio depois de um reset, a instância é
  // nova e nasceu sem webhook. Sem isso o cliente reconecta e mesmo assim fica
  // fora do rastreio de queda em tempo real.
  await garantirWebhook(config, userId)

  const connectResponse = await fetch(
    `${config.apiUrl}/instance/connect/${config.instanceName}`,
    { headers: { apikey: config.apiKey } }
  )

  // Falha aqui não é terminal: quase sempre é a instância presa, e quem trata
  // isso é o reset do gerarQrCode. Devolver null deixa ele decidir.
  if (!connectResponse.ok) return null

  const data = await connectResponse.json()
  // A Evolution já devolveu o QR em formatos diferentes entre versões
  return data.base64 || data.qrcode?.base64 || data.code || data.qr || null
}

/**
 * Marca que o cliente está com o QR aberto na tela, por `segundos`.
 *
 * A recuperação automática do servidor apaga e recria instância travada. Se isso
 * cair no meio de um pareamento, o QR que o cliente está olhando vira inválido e
 * o polling morre em "Tempo expirado" — o tipo de erro que não pode mais
 * aparecer. O backend respeita esta janela e não toca na instância.
 */
async function marcarPareamento(userId, segundos) {
  if (!userId) return
  try {
    await supabase
      .from('mensallizap')
      .update({ pareamento_ate: new Date(Date.now() + segundos * 1000).toISOString() })
      .eq('user_id', userId)
  } catch {
    /* não impede o pareamento */
  }
}

/**
 * Garante que a instância existe e devolve o QR em base64.
 * Se já estiver conectada, devolve { jaConectado: true } e não gera QR.
 *
 * A ordem aqui é deliberada: **reconectar sem QR primeiro, re-parear por último**.
 * Re-parear é a ação mais cara do sistema — é o gatilho da migração LID, que na
 * 2.3.7 não tem volta (ver tentarRestart). Então só destruímos credencial depois
 * que o restart provou que ela não serve mais.
 *
 * `forcar` = o cliente clicou em "Forçar nova conexão", ou seja, disse que não
 * está funcionando. Aí NÃO devolvemos "já conectado" mesmo com o painel em open:
 * sem a sonda não dá pra distinguir open real de zumbi, e era justamente esse
 * atalho que deixava o cliente preso numa tela verde que não enviava nada.
 */
export async function gerarQrCode(config, { forcar = false, userId = null } = {}) {
  if (!config?.apiKey) {
    throw new Error('Integração do WhatsApp não configurada. Fale com o suporte.')
  }

  // A trava do modo espelho mora no whatsappService; este serviço usa fetch
  // direto e escapava dela. Sem isto, um admin "vendo como cliente" que
  // clicasse em conectar criava/apagava a instância REAL dele.
  if (modoEspelhoAtivo()) {
    throw new Error('Modo espelho: você está vendo a conta do cliente. Conectar o WhatsApp precisa ser feito por ele.')
  }

  const estado = await verificarEstado(config)
  if (!forcar && estado === 'open') return { jaConectado: true, qr: null }

  // Reserva a instância enquanto este pareamento acontece. Generoso de propósito
  // (o reset abaixo pode levar ~10s antes de o QR aparecer, e o cliente ainda
  // tem 2 min pra escanear).
  await marcarPareamento(userId, 240)

  // Número real do cliente: sem ele o restart não tem como PROVAR que voltou.
  const numeroReal = await numeroRealDoCliente(userId)

  if (forcar) {
    if (await tentarRestart(config, numeroReal)) return { jaConectado: true, qr: null }
    await resetarInstancia(config)
  }

  let qr = await criarEConectar(config, userId)

  // 200 sem QR = instância presa (tipicamente em 'connecting', com o balde de
  // tentativas de QR esgotado pela própria Evolution tentando reparear sozinha).
  // Sem este resgate a tela morria em "QR Code não foi gerado pela API" e o
  // cliente dependia de alguém mexer no servidor para voltar a cobrar.
  if (!qr) {
    if (!forcar && await tentarRestart(config, numeroReal)) return { jaConectado: true, qr: null }
    await resetarInstancia(config)
    qr = await criarEConectar(config, userId)
  }

  if (!qr) throw new Error(MENSAGEM_TRAVADA)

  return { jaConectado: false, qr }
}

/**
 * Cria os templates que faltam na conta. Idempotente: consulta o que já existe e
 * insere só o resto, então reconectar não duplica nada.
 *
 * Precisa acontecer junto da conexão. As views da régua (vw_parcelas_*) fazem
 * `JOIN mensallizap ON conectado = true` + `LEFT JOIN templates` com
 * `COALESCE(t.mensagem, '')` — conta conectada e sem template entra na fila de
 * cobrança com a mensagem VAZIA. Até aqui isso nunca ocorreu porque conectar
 * exigia abrir /app/whatsapp, que semeia no mount; com o WhatsApp dentro do
 * wizard as duas ações se separaram.
 */
export async function garantirTemplatesPadrao(userId) {
  const { data: existentes, error } = await supabase
    .from('templates')
    .select('tipo')
    .eq('user_id', userId)

  // Na dúvida não insere: duplicar template é pior que não semear, porque o
  // findBestTemplate da tela de WhatsApp passaria a ter que desempatar.
  if (error) throw error

  const jaTem = new Set((existentes || []).map((t) => t.tipo))
  const faltando = TEMPLATES_SEED.filter((t) => !jaTem.has(t.tipo))
  if (faltando.length === 0) return 0

  const { error: erroInsert } = await supabase.from('templates').insert(
    faltando.map((t) => ({
      user_id: userId,
      titulo: t.titulo,
      mensagem: t.mensagem,
      tipo: t.tipo,
      ativo: true,
      is_padrao: true
    }))
  )

  if (erroInsert) throw erroInsert
  return faltando.length
}

/**
 * Grava a conexão nos dois lugares que o resto do sistema lê:
 * `config` (flags por usuário) e `mensallizap` (fonte do status/health-check).
 */
export async function salvarConexao(userId, config) {
  const agora = new Date().toISOString()

  // Antes de marcar conectado = true: é esse flag que faz a conta entrar na
  // régua, então os templates têm que existir antes dela ficar elegível.
  try {
    await garantirTemplatesPadrao(userId)
  } catch (erro) {
    console.error('Falha ao semear templates padrão:', erro)
  }

  await supabase.from('config').upsert([
    {
      user_id: userId,
      chave: 'evolution_instance_name',
      valor: config.instanceName,
      descricao: 'Nome da instância conectada na Evolution API',
      updated_at: agora
    },
    {
      user_id: userId,
      chave: 'whatsapp_conectado',
      valor: 'true',
      descricao: 'Status de conexão do WhatsApp',
      updated_at: agora
    }
  ], { onConflict: 'user_id,chave' })

  const { data: usuario } = await supabase
    .from('usuarios')
    .select('nome_completo, email, telefone, plano')
    .eq('id', userId)
    .maybeSingle()

  // Número pareado: melhor esforço, não impede a gravação.
  //
  // Vem do ownerJid do fetchInstances, que é o JID canônico. Antes lia
  // GET /instance/fetchProfile — endpoint que **não existe** e responde 404 —
  // e por isso whatsapp_numero ficou NULL nas 26 contas pagas. Esse buraco é o
  // que fazia o aviso de queda ser montado a partir do telefone cadastrado e
  // errar a grafia do nono dígito.
  let whatsappNumero = null
  try {
    const res = await fetch(
      `${config.apiUrl}/instance/fetchInstances?instanceName=${encodeURIComponent(config.instanceName)}`,
      { headers: { apikey: config.apiKey } }
    )
    if (res.ok) {
      const dados = await res.json()
      const inst = (Array.isArray(dados) ? dados : [dados])[0]
      whatsappNumero = inst?.ownerJid ? String(inst.ownerJid).split('@')[0] : null
    }
  } catch {
    /* segue sem o número */
  }

  await supabase.from('mensallizap').upsert({
    user_id: userId,
    nome_completo: usuario?.nome_completo || null,
    email: usuario?.email || '',
    telefone: usuario?.telefone || null,
    plano: usuario?.plano || 'starter',
    whatsapp_numero: whatsappNumero,
    instance_name: config.instanceName,
    conectado: true,
    ultima_conexao: agora,
    updated_at: agora
  }, { onConflict: 'user_id' })
}
