import { supabase } from '../supabaseClient'
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

export function getInstanceName(userId) {
  return `instance_${userId.substring(0, 8)}`
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
    instanceName: getInstanceName(userId)
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
 * Sonda profunda: força um round-trip até o servidor do WhatsApp.
 *
 * O connectionState MENTE — fica "open" com o socket Baileys morto por baixo
 * ("zumbi"). Foi assim que a Escolinha Napoli passou 2 dias com a tela verde,
 * o banner vermelho e nenhuma cobrança saindo. Só o round-trip distingue os dois.
 *
 * Socket morto responde 400/500 "Connection Closed" (Boom 428) ou trava até o timeout.
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
 * Veredito honesto da conexão, para a UI e para o que se grava no banco.
 *
 *  'conectado'    — open + socket vivo. Único caso em que vale gravar conectado = true.
 *  'zumbi'        — open + socket morto. A conta NÃO envia; precisa reparear.
 *  'desconectado' — close/connecting: o QR já está livre.
 *
 * Nunca devolve 'conectado' só porque o painel disse "open".
 */
export async function verificarSaude(config) {
  const estado = await verificarEstado(config)
  if (estado !== 'open') return { estado, veredito: 'desconectado' }
  const vivo = await sondarSocket(config)
  return { estado, veredito: vivo ? 'conectado' : 'zumbi' }
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
async function criarEConectar(config) {
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
 * Garante que a instância existe e devolve o QR em base64.
 * Se já estiver conectada de verdade, devolve { jaConectado: true } e não gera QR.
 *
 * `forcar` = o usuário clicou em "Reconectar": descarta a sessão atual antes de
 * parear, inclusive quando ela está apenas 'connecting'. Esse é justamente o
 * estado em que a Evolution devolve 200 sem QR e o cliente ficava rodando em
 * círculo — mas nunca derrubamos uma sessão que está viva, mesmo com forcar.
 */
export async function gerarQrCode(config, { forcar = false } = {}) {
  if (!config?.apiKey) {
    throw new Error('Integração do WhatsApp não configurada. Fale com o suporte.')
  }

  const { veredito } = await verificarSaude(config)
  if (veredito === 'conectado') return { jaConectado: true, qr: null }

  // Zumbi: o painel diz "open" com o socket morto. A Evolution recusa parear
  // enquanto a sessão morta ocupar o nome — a tela dizia "conectado", o botão
  // desconectar dava 500 e o QR nunca vinha.
  if (veredito === 'zumbi' || forcar) await resetarInstancia(config)

  let qr = await criarEConectar(config)

  // 200 sem QR = instância presa. Última cartada: reset duro e tentar de novo.
  // Sem isto a tela morria em "QR Code não foi gerado pela API" e o cliente
  // dependia de alguém mexer no servidor para voltar a enviar cobrança.
  if (!qr) {
    await resetarInstancia(config)
    qr = await criarEConectar(config)
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

  // Número pareado: melhor esforço, não impede a gravação
  let whatsappNumero = null
  try {
    const perfil = await fetch(
      `${config.apiUrl}/instance/fetchProfile/${config.instanceName}`,
      { headers: { apikey: config.apiKey } }
    )
    if (perfil.ok) {
      const dados = await perfil.json()
      whatsappNumero = dados.wuid || dados.id || null
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
