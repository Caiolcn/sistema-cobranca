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

/**
 * Garante que a instância existe e devolve o QR em base64.
 * Se já estiver conectada, devolve { jaConectado: true } e não gera QR.
 */
export async function gerarQrCode(config) {
  if (!config?.apiKey) {
    throw new Error('Integração do WhatsApp não configurada. Fale com o suporte.')
  }

  const estado = await verificarEstado(config)
  if (estado === 'open') return { jaConectado: true, qr: null }

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

  if (![403, 409].includes(createResponse.status) && !createResponse.ok) {
    const erro = await createResponse.json().catch(() => ({}))
    throw new Error(erro.message || `Erro ao criar instância: HTTP ${createResponse.status}`)
  }

  const connectResponse = await fetch(
    `${config.apiUrl}/instance/connect/${config.instanceName}`,
    { headers: { apikey: config.apiKey } }
  )

  if (!connectResponse.ok) {
    const erro = await connectResponse.json().catch(() => ({}))
    throw new Error(erro.message || `HTTP ${connectResponse.status}`)
  }

  const data = await connectResponse.json()
  // A Evolution já devolveu o QR em formatos diferentes entre versões
  const qr = data.base64 || data.qrcode?.base64 || data.code || data.qr

  if (!qr) throw new Error('A API não devolveu o QR Code. Tente de novo.')

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
