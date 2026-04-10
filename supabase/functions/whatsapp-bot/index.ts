// Edge Function: WhatsApp Bot - Handler de webhook do Evolution API
// Recebe mensagens dos alunos e responde com menu numerico
// Acesso PUBLICO (chamado pelo Evolution API)

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const APP_URL = Deno.env.get('APP_URL') || 'https://www.mensalli.com.br'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// ============================================================
// Helpers
// ============================================================

function normalizarTelefone(tel: string): string {
  let t = String(tel || '').replace(/\D/g, '')
  // Remove sufixo do JID se vier (ex: 5511999999999@s.whatsapp.net)
  if (t.startsWith('55') && t.length >= 12) return t
  if (!t.startsWith('55')) t = '55' + t
  return t
}

function variantesTelefone(tel: string): string[] {
  // Gera variantes pra busca: com e sem 9, com e sem 55
  const limpo = String(tel || '').replace(/\D/g, '')
  const semDDI = limpo.startsWith('55') ? limpo.slice(2) : limpo
  const variantes = new Set<string>()
  variantes.add(limpo)
  variantes.add(semDDI)
  variantes.add('55' + semDDI)
  // sem o 9 do celular (DDD + 9XXXX-XXXX → DDD + XXXX-XXXX)
  if (semDDI.length === 11 && semDDI[2] === '9') {
    const sem9 = semDDI.slice(0, 2) + semDDI.slice(3)
    variantes.add(sem9)
    variantes.add('55' + sem9)
  }
  // com o 9 do celular
  if (semDDI.length === 10) {
    const com9 = semDDI.slice(0, 2) + '9' + semDDI.slice(2)
    variantes.add(com9)
    variantes.add('55' + com9)
  }
  return Array.from(variantes)
}

async function enviarMensagem(
  evolutionUrl: string,
  apiKey: string,
  instance: string,
  numero: string,
  texto: string
) {
  const url = `${evolutionUrl}/message/sendText/${instance}`
  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': apiKey },
      body: JSON.stringify({ number: numero, text: texto }),
    })
    if (!resp.ok) {
      console.error('❌ Erro Evolution:', await resp.text())
    }
  } catch (e) {
    console.error('❌ Erro ao enviar mensagem:', e)
  }
}

function substituirVars(texto: string, vars: Record<string, string>): string {
  let r = texto
  for (const [k, v] of Object.entries(vars)) {
    r = r.replace(new RegExp(`\\{\\{${k}\\}\\}`, 'g'), v)
  }
  return r
}

// ============================================================
// PIX Copia e Cola (BR Code EMV)
// Portado de src/services/pixService.js
// ============================================================

function crc16(str: string): string {
  const polynomial = 0x1021
  let crc = 0xFFFF
  for (let i = 0; i < str.length; i++) {
    const byte = str.charCodeAt(i)
    crc ^= (byte << 8)
    for (let j = 0; j < 8; j++) {
      if ((crc & 0x8000) !== 0) crc = ((crc << 1) ^ polynomial) & 0xFFFF
      else crc = (crc << 1) & 0xFFFF
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0')
}

function sanitizePix(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9 ]/g, '')
    .toUpperCase()
    .trim()
}

function tlv(tag: string, value: string): string {
  const len = value.length.toString().padStart(2, '0')
  return `${tag}${len}${value}`
}

function formatarChavePix(chave: string): string {
  const chaveLimpa = chave.trim()
  const apenasNumeros = chaveLimpa.replace(/\D/g, '')
  if (chaveLimpa.includes('@')) return chaveLimpa.toLowerCase().trim()
  if (/[.\-\/]/.test(chaveLimpa)) {
    if (/^\d{11}$/.test(apenasNumeros) || /^\d{14}$/.test(apenasNumeros)) return apenasNumeros
  }
  if (/^\d{14}$/.test(apenasNumeros)) return apenasNumeros
  if (chaveLimpa.startsWith('+55')) {
    let tel = apenasNumeros.substring(2)
    if (tel.startsWith('0')) tel = tel.substring(1)
    return `+55${tel}`
  }
  if (chaveLimpa.startsWith('+')) return chaveLimpa
  if (/^\d{10}$/.test(apenasNumeros)) return `+55${apenasNumeros}`
  if (/^\d{11}$/.test(apenasNumeros)) {
    const terceiro = apenasNumeros[2]
    if (terceiro === '9') return `+55${apenasNumeros}`
    return apenasNumeros
  }
  if (/^55\d{10,11}$/.test(apenasNumeros)) return `+${apenasNumeros}`
  return chaveLimpa
}

function gerarPixCopiaCola(opts: {
  chavePix: string
  valor: number
  nomeRecebedor: string
  cidadeRecebedor: string
  txid?: string
}): string {
  const { chavePix, valor, nomeRecebedor, cidadeRecebedor } = opts
  const txid = opts.txid || '***'
  const chave = formatarChavePix(chavePix)
  const nome = sanitizePix(nomeRecebedor).substring(0, 25) || 'RECEBEDOR'
  const cidade = sanitizePix(cidadeRecebedor).substring(0, 15) || 'CIDADE'
  const valorStr = valor.toFixed(2)
  const txidClean = txid.replace(/[^a-zA-Z0-9*]/g, '').substring(0, 25) || '***'

  const merchantAccount = tlv('00', 'br.gov.bcb.pix') + tlv('01', chave)
  const additionalData = tlv('05', txidClean)

  let payload = ''
  payload += tlv('00', '01')
  payload += tlv('26', merchantAccount)
  payload += tlv('52', '0000')
  payload += tlv('53', '986')
  payload += tlv('54', valorStr)
  payload += tlv('58', 'BR')
  payload += tlv('59', nome)
  payload += tlv('60', cidade)
  payload += tlv('62', additionalData)
  payload += '6304'

  return payload + crc16(payload)
}

// ============================================================
// Menu e respostas
// ============================================================

// Catálogo de opções do bot. A ordem aqui define a numeração no menu (após filtragem de ativas).
// "atendente" é sempre a última e sempre ativa.
type BotOpcao = 'mensalidade' | 'horarios' | 'pix' | 'agendar' | 'atendente'

const OPCOES_CATALOGO: { key: BotOpcao; emoji: string; label: string }[] = [
  { key: 'mensalidade', emoji: '💰', label: 'Minha mensalidade' },
  { key: 'horarios',    emoji: '📅', label: 'Horários das aulas' },
  { key: 'pix',         emoji: '💳', label: '2ª via do PIX' },
  { key: 'agendar',     emoji: '📝', label: 'Agendar aula' },
  { key: 'atendente',   emoji: '👨‍💼', label: 'Falar com atendente' },
]

const NUMS_EMOJI = ['0️⃣', '1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣']

// Retorna a lista de opções ATIVAS pra esse usuário, na ordem do catálogo.
// "atendente" sempre entra. Se a config não existe, considera todas ativas.
function opcoesAtivas(opcoesConfig: any): { key: BotOpcao; emoji: string; label: string }[] {
  return OPCOES_CATALOGO.filter(opt => {
    if (opt.key === 'atendente') return true
    if (!opcoesConfig || typeof opcoesConfig !== 'object') return true
    // ativa se valor != false (default true)
    return opcoesConfig[opt.key] !== false
  })
}

// Catálogo de opções de interesse pra LEADS (visitantes)
type LeadOpcao = 'conhecer' | 'valores' | 'experimental' | 'outro'

const LEAD_OPCOES_CATALOGO: { key: LeadOpcao; label: string; descricaoCRM: string }[] = [
  { key: 'conhecer',     label: 'Quero conhecer as aulas',           descricaoCRM: 'Quer conhecer as aulas' },
  { key: 'valores',      label: 'Quero saber valores',                descricaoCRM: 'Quer saber valores' },
  { key: 'experimental', label: 'Quero agendar aula experimental',    descricaoCRM: 'Aula experimental' },
  { key: 'outro',        label: 'Outro assunto',                      descricaoCRM: 'Outro assunto' },
]

function leadOpcoesAtivas(opcoesConfig: any): { key: LeadOpcao; label: string; descricaoCRM: string }[] {
  return LEAD_OPCOES_CATALOGO.filter(opt => {
    if (opt.key === 'outro') return true
    if (!opcoesConfig || typeof opcoesConfig !== 'object') return true
    return opcoesConfig[opt.key] !== false
  })
}

function montarMenuLead(opcoes: { key: LeadOpcao; label: string }[]): string {
  let txt = 'O que te trouxe aqui hoje? Digite o número:\n\n'
  opcoes.forEach((opt, idx) => {
    const num = NUMS_EMOJI[idx + 1] || `${idx + 1}.`
    txt += `${num} ${opt.label}\n`
  })
  return txt.trimEnd()
}

function montarMenuTexto(opcoes: { key: BotOpcao; emoji: string; label: string }[]): string {
  let txt = 'Escolha uma opção digitando o número:\n\n'
  opcoes.forEach((opt, idx) => {
    const num = NUMS_EMOJI[idx + 1] || `${idx + 1}.`
    txt += `${num} ${opt.label}\n`
  })
  txt += '\n_Digite *0* a qualquer momento para voltar ao menu._'
  return txt
}

async function montarSaudacao(
  supabase: any,
  userId: string,
  devedorNome: string,
  nomeEmpresa: string,
  opcoes: { key: BotOpcao; emoji: string; label: string }[]
) {
  const { data: cfg } = await supabase
    .from('configuracoes_cobranca')
    .select('bot_saudacao')
    .eq('user_id', userId)
    .maybeSingle()

  const saudacaoBase =
    cfg?.bot_saudacao ||
    'Olá {{nomeCliente}}! 👋 Sou o assistente virtual da {{nomeEmpresa}}.'

  const saudacao = substituirVars(saudacaoBase, {
    nomeCliente: devedorNome.split(' ')[0],
    nomeEmpresa: nomeEmpresa,
  })

  return `${saudacao}\n\n${montarMenuTexto(opcoes)}`
}

async function respostaMensalidade(supabase: any, devedorId: string): Promise<string> {
  const { data } = await supabase
    .from('mensalidades')
    .select('valor, data_vencimento, status')
    .eq('devedor_id', devedorId)
    .in('status', ['pendente', 'atrasado'])
    .order('data_vencimento', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (!data) {
    return '✅ Você está em dia! Não há mensalidades pendentes no momento.\n\n_Digite *0* para voltar ao menu._'
  }

  const valor = parseFloat(String(data.valor)).toFixed(2).replace('.', ',')
  const venc = new Date(data.data_vencimento + 'T00:00:00').toLocaleDateString('pt-BR')
  const statusTxt = data.status === 'atrasado' ? '⚠️ Em atraso' : '📅 A vencer'

  return `${statusTxt}\n\n💰 Valor: R$ ${valor}\n📆 Vencimento: ${venc}\n\nDigite *3* para gerar o PIX agora.\n\n_Digite *0* para voltar ao menu._`
}

async function respostaHorarios(supabase: any, userId: string): Promise<string> {
  const { data } = await supabase
    .from('aulas')
    .select('dia_semana, horario, descricao, capacidade')
    .eq('user_id', userId)
    .eq('ativo', true)
    .order('dia_semana', { ascending: true })
    .order('horario', { ascending: true })

  if (!data || data.length === 0) {
    return 'Ainda não há horários cadastrados.\n\n_Digite *0* para voltar ao menu._'
  }

  const dias = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado']
  const porDia: Record<number, string[]> = {}
  for (const a of data) {
    if (!porDia[a.dia_semana]) porDia[a.dia_semana] = []
    const h = a.horario ? String(a.horario).substring(0, 5) : '--:--'
    const desc = a.descricao ? ` - ${a.descricao}` : ''
    porDia[a.dia_semana].push(`  🕐 ${h}${desc}`)
  }

  let msg = '*📅 Horários das aulas:*\n'
  for (let i = 0; i < 7; i++) {
    if (porDia[i]) {
      msg += `\n*${dias[i]}*\n${porDia[i].join('\n')}\n`
    }
  }
  msg += '\n_Digite *0* para voltar ao menu._'
  return msg
}

async function respostaPix(
  supabase: any,
  devedor: any,
  userId: string
): Promise<{ texto: string; pixCode?: string }> {
  const { data: mens } = await supabase
    .from('mensalidades')
    .select('id, valor, data_vencimento')
    .eq('devedor_id', devedor.id)
    .in('status', ['pendente', 'atrasado'])
    .order('data_vencimento', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (!mens) {
    return { texto: '✅ Você está em dia! Não há mensalidades pendentes para gerar PIX.\n\n_Digite *0* para voltar ao menu._' }
  }

  // Busca dados da empresa pra gerar o PIX
  const { data: usuario } = await supabase
    .from('usuarios')
    .select('chave_pix, nome_empresa, cidade')
    .eq('id', userId)
    .single()

  // Se não tem chave PIX cadastrada → fallback portal
  if (!usuario?.chave_pix) {
    if (!devedor.portal_token) {
      return { texto: 'Não foi possível gerar o pagamento. Por favor, fale com a recepção.\n\n_Digite *0* para voltar ao menu._' }
    }
    const url = `${APP_URL}/portal/${devedor.portal_token}`
    return { texto: `💳 *2ª via do PIX*\n\nClique no link abaixo para acessar seu portal e pagar via PIX:\n\n${url}\n\n_Digite *0* para voltar ao menu._` }
  }

  // Gera o PIX Copia e Cola
  try {
    const valor = parseFloat(String(mens.valor))
    const pixCode = gerarPixCopiaCola({
      chavePix: usuario.chave_pix,
      valor,
      nomeRecebedor: usuario.nome_empresa || 'RECEBEDOR',
      cidadeRecebedor: usuario.cidade || 'BRASIL',
      txid: mens.id
    })

    const valorFmt = valor.toFixed(2).replace('.', ',')
    const venc = new Date(mens.data_vencimento + 'T00:00:00').toLocaleDateString('pt-BR')

    const texto = `💳 *PIX da sua mensalidade*\n\n📅 Vencimento: ${venc}\n💰 Valor: R$ ${valorFmt}\n\n_Copie o código abaixo e cole no app do seu banco_ 👇`
    return { texto, pixCode }
  } catch (err) {
    console.error('❌ Erro ao gerar PIX:', err)
    // Fallback portal
    if (devedor.portal_token) {
      const url = `${APP_URL}/portal/${devedor.portal_token}`
      return { texto: `💳 *2ª via do PIX*\n\nAcesse o link para pagar:\n\n${url}\n\n_Digite *0* para voltar ao menu._` }
    }
    return { texto: 'Não foi possível gerar o PIX agora. Por favor, fale com a recepção.\n\n_Digite *0* para voltar ao menu._' }
  }
}

async function respostaAgendar(supabase: any, userId: string): Promise<string> {
  const { data } = await supabase
    .from('usuarios')
    .select('agendamento_slug, agendamento_ativo')
    .eq('id', userId)
    .single()

  if (!data?.agendamento_ativo || !data?.agendamento_slug) {
    return 'O agendamento online não está ativo. Por favor, fale com a recepção.\n\n_Digite *0* para voltar ao menu._'
  }

  const url = `${APP_URL}/agendar/${data.agendamento_slug}`
  return `📅 *Agendar aula*\n\nClique no link abaixo para escolher horário:\n\n${url}\n\n_Digite *0* para voltar ao menu._`
}

const RESPOSTA_ATENDENTE = `👨‍💼 Tudo bem! Avisei nosso time, em breve alguém te responde por aqui.

_Para falar comigo de novo, digite *menu*._`

// ============================================================
// Handler principal
// ============================================================

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

  try {
    const payload = await req.json()
    console.log('📨 Webhook recebido:', JSON.stringify(payload).slice(0, 500))

    // Evolution API envia em formatos variados; tentamos cobrir os principais
    const eventName = payload.event || payload.eventType
    if (eventName && !String(eventName).includes('messages.upsert') && !String(eventName).includes('MESSAGES_UPSERT')) {
      return new Response(JSON.stringify({ ok: true, ignored: 'event' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const data = payload.data || payload
    const instanceName = payload.instance || data.instance || data.instanceName
    const key = data.key || {}
    const remoteJid = key.remoteJid || ''
    const fromMe = key.fromMe === true
    const pushName = data.pushName || ''

    // Ignora mensagens enviadas por nós mesmos
    if (fromMe) {
      console.log('⏭️ Ignorado: fromMe=true')
      return new Response(JSON.stringify({ ok: true, ignored: 'fromMe' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Ignora mensagens de grupo
    if (remoteJid.endsWith('@g.us')) {
      console.log('⏭️ Ignorado: grupo')
      return new Response(JSON.stringify({ ok: true, ignored: 'group' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Extrai texto da mensagem
    const msg = data.message || {}
    const texto = (
      msg.conversation ||
      msg.extendedTextMessage?.text ||
      msg.imageMessage?.caption ||
      msg.videoMessage?.caption ||
      ''
    ).trim()

    // Detecta tipo de mídia que NÃO é texto (áudio, sticker, documento, etc)
    const ehAudio = !!(msg.audioMessage || msg.pttMessage)
    const ehMidiaSemTexto = !texto && (
      ehAudio ||
      msg.imageMessage ||
      msg.videoMessage ||
      msg.documentMessage ||
      msg.stickerMessage
    )

    console.log('📝 Texto extraído:', JSON.stringify(texto), '| Keys da msg:', Object.keys(msg), '| ehAudio:', ehAudio)

    if (!texto && !ehMidiaSemTexto) {
      console.log('⏭️ Ignorado: no_text | msg completa:', JSON.stringify(msg).slice(0, 500))
      return new Response(JSON.stringify({ ok: true, ignored: 'no_text' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Pega telefone do remoteJid (ex: 5511999999999@s.whatsapp.net)
    const telefoneRaw = remoteJid.split('@')[0].split(':')[0]
    const telefone = normalizarTelefone(telefoneRaw)

    // ====== 1. Identificar instance → user_id ======
    if (!instanceName) {
      console.warn('⚠️ Sem instance_name no payload')
      return new Response(JSON.stringify({ ok: true, ignored: 'no_instance' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { data: mz } = await supabase
      .from('mensallizap')
      .select('user_id')
      .eq('instance_name', instanceName)
      .maybeSingle()

    if (!mz?.user_id) {
      console.warn('⚠️ Instance sem user_id:', instanceName)
      return new Response(JSON.stringify({ ok: true, ignored: 'no_user' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    const userId = mz.user_id

    // ====== 2. Verificar se bot está ativo + buscar plano ======
    const { data: cfg } = await supabase
      .from('configuracoes_cobranca')
      .select('bot_ativo, bot_opcoes_ativas, bot_lead_opcoes_ativas, bot_lead_saudacao')
      .eq('user_id', userId)
      .maybeSingle()

    const opcoesDisponiveis = opcoesAtivas(cfg?.bot_opcoes_ativas)
    const leadOpcoesDisponiveis = leadOpcoesAtivas(cfg?.bot_lead_opcoes_ativas)

    if (!cfg?.bot_ativo) {
      console.log('⏭️ Ignorado: bot_off | user_id:', userId)
      return new Response(JSON.stringify({ ok: true, ignored: 'bot_off' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { data: usuario, error: usuarioErr } = await supabase
      .from('usuarios')
      .select('plano, plano_pago, trial_ativo, nome_empresa')
      .eq('id', userId)
      .single()

    if (usuarioErr) console.error('❌ Erro buscar usuário:', usuarioErr)
    console.log('👤 Usuário:', { plano: usuario?.plano, plano_pago: usuario?.plano_pago, trial_ativo: usuario?.trial_ativo })

    if (!usuario || usuario.plano !== 'premium' || (!usuario.plano_pago && !usuario.trial_ativo)) {
      console.log('⏭️ Ignorado: plan')
      return new Response(JSON.stringify({ ok: true, ignored: 'plan' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Pega config global de Evolution (tabela config)
    const { data: configRows } = await supabase
      .from('config')
      .select('chave, valor')
      .in('chave', ['evolution_api_url', 'evolution_api_key'])
    const configMap: Record<string, string> = {}
    for (const r of configRows || []) configMap[r.chave] = r.valor
    const evolutionUrl = configMap.evolution_api_url
    const evolutionKey = configMap.evolution_api_key

    if (!evolutionUrl || !evolutionKey) {
      console.error('❌ Sem credenciais Evolution')
      return new Response(JSON.stringify({ ok: true, ignored: 'no_creds' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // ====== 3. Identificar devedor pelo telefone ======
    // Telefones podem estar salvos com formatação ((62) 98161-8862), então
    // buscamos todos os devedores do user e filtramos no JS comparando só dígitos.
    const variantes = variantesTelefone(telefone)
    console.log('🔍 Buscando devedor | telefone:', telefone, '| variantes:', variantes)

    const { data: todosDevedores, error: devedorErr } = await supabase
      .from('devedores')
      .select('id, nome, telefone, responsavel_telefone, portal_token, bloquear_mensagens, lixo')
      .eq('user_id', userId)

    if (devedorErr) console.error('❌ Erro busca devedor:', devedorErr)

    const variantesSet = new Set(variantes)
    const matchTelefone = (tel: string | null) => {
      if (!tel) return false
      const apenasDigitos = String(tel).replace(/\D/g, '')
      // Compara contra todas as variantes (com/sem 9, com/sem 55)
      if (variantesSet.has(apenasDigitos)) return true
      // Também tenta normalizar pelo mesmo helper
      const variantesDoCadastro = variantesTelefone(apenasDigitos)
      return variantesDoCadastro.some(v => variantesSet.has(v))
    }

    const devedoresMatch = (todosDevedores || []).filter(
      (d: any) => matchTelefone(d.telefone) || matchTelefone(d.responsavel_telefone)
    )
    console.log('📋 Devedores encontrados:', devedoresMatch.length)

    const devedor = devedoresMatch.find(
      (d: any) => !d.lixo && !d.bloquear_mensagens
    )
    console.log('👥 Devedor selecionado:', devedor?.nome || 'NENHUM')

    // ====== 4. Carregar/criar conversa ======
    const { data: conversaExistente } = await supabase
      .from('bot_conversas')
      .select('*')
      .eq('user_id', userId)
      .eq('telefone', telefone)
      .maybeSingle()

    let conversa = conversaExistente

    if (!conversa) {
      const { data: nova } = await supabase
        .from('bot_conversas')
        .insert({
          user_id: userId,
          devedor_id: devedor?.id || null,
          telefone,
          estado: 'menu',
        })
        .select()
        .single()
      conversa = nova
    }

    // Se estado='atendente' e <30min desde última interação → ignora
    if (conversa.estado === 'atendente') {
      const agora = Date.now()
      const ultima = new Date(conversa.ultima_interacao).getTime()
      if (agora - ultima < 30 * 60 * 1000 && texto.toLowerCase() !== 'menu') {
        await supabase
          .from('bot_conversas')
          .update({ ultima_interacao: new Date().toISOString() })
          .eq('id', conversa.id)
        return new Response(JSON.stringify({ ok: true, ignored: 'atendente_ativo' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
    }

    // ====== 5. Processar mensagem ======
    const textoLower = texto.toLowerCase().trim()
    const nomeEmpresa = usuario.nome_empresa || 'nossa equipe'
    let resposta = ''
    let novoEstado = conversa.estado || 'aguardando_opcao'
    let novoContexto = conversa.contexto || {}

    const ehSaudacao = ['menu', '/menu', '0', 'oi', 'olá', 'ola', 'bom dia', 'boa tarde', 'boa noite'].includes(textoLower)

    // ============================================================
    // TRATAMENTO DE MÍDIA SEM TEXTO (áudio, imagem sem caption, etc)
    // ============================================================
    if (ehMidiaSemTexto) {
      const tipoMidia = ehAudio ? 'áudio' : 'mensagem de mídia'

      if (devedor) {
        // Aluno mandou áudio → resposta amigável
        resposta = `Oi ${devedor.nome.split(' ')[0]}! 👋\n\nAinda não consigo ouvir ${tipoMidia}s 😅\n\nSe preferir, digite *menu* pra eu te ajudar com as opções, ou *5* pra falar com nossa equipe.`
      } else {
        // Lead mandou áudio
        const { data: leadJaExiste } = await supabase
          .from('leads')
          .select('id, nome')
          .eq('user_id', userId)
          .eq('telefone', telefone)
          .maybeSingle()

        if (leadJaExiste) {
          // Lead já capturado → resposta amigável
          resposta = `Oi ${leadJaExiste.nome.split(' ')[0]}! 👋\n\nAinda não consigo ouvir ${tipoMidia}s 😅 mas nossa equipe já foi avisada e em breve vai te responder por aqui!`
          // Atualiza last interaction
          await supabase
            .from('leads')
            .update({ ultima_mensagem: `[${tipoMidia}]`, ultima_interacao: new Date().toISOString() })
            .eq('id', leadJaExiste.id)
        } else {
          // Lead novo mandou áudio logo de cara → cria lead com pushName se disponível
          const nomeLead = pushName?.trim() || 'Lead WhatsApp'

          const { data: novoLead } = await supabase
            .from('leads')
            .insert({
              user_id: userId,
              nome: nomeLead,
              telefone,
              origem: 'whatsapp_bot',
              status: 'novo',
              interesse: `Mandou ${tipoMidia} (não transcrito)`,
              ultima_mensagem: `[${tipoMidia}]`,
              ultima_interacao: new Date().toISOString()
            })
            .select()
            .single()

          if (novoLead) novoContexto = { ...novoContexto, lead_id: novoLead.id }

          // Notifica admin
          const { data: admin } = await supabase
            .from('usuarios')
            .select('telefone')
            .eq('id', userId)
            .single()

          if (admin?.telefone) {
            const telAdmin = normalizarTelefone(admin.telefone)
            const msgAdmin = `🔥 *Novo lead!*\n\n👤 ${nomeLead}\n📱 ${telefone}\n💬 Mandou um ${tipoMidia} (precisa ouvir manualmente)\n\n_Veio pelo bot do WhatsApp. Acesse o CRM para responder._`
            await enviarMensagem(evolutionUrl, evolutionKey, instanceName, telAdmin, msgAdmin)
          }

          const primeiroNome = nomeLead.split(' ')[0]
          resposta = `Oi${primeiroNome !== 'Lead' ? `, ${primeiroNome}` : ''}! 👋\n\nAinda não consigo ouvir ${tipoMidia}s 😅 mas já avisei nossa equipe da *${nomeEmpresa}*! Em breve alguém vai te responder por aqui.\n\n_Se preferir adiantar, me conta por mensagem o que você precisa!_ 😊`
          novoEstado = 'lead_capturado'
        }
      }

      // Envia a resposta e termina (não cai no fluxo principal)
      if (resposta) {
        await enviarMensagem(evolutionUrl, evolutionKey, instanceName, telefone, resposta)
      }

      await supabase
        .from('bot_conversas')
        .update({
          estado: novoEstado,
          devedor_id: devedor?.id || conversa.devedor_id,
          contexto: novoContexto,
          ultima_interacao: new Date().toISOString(),
        })
        .eq('id', conversa.id)

      return new Response(JSON.stringify({ ok: true, handled: 'midia' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // ============================================================
    // FLUXO LEAD (não é aluno cadastrado)
    // ============================================================
    if (!devedor) {
      // Verifica se já existe lead pra esse telefone
      const { data: leadExistenteCheck } = await supabase
        .from('leads')
        .select('id, nome, status')
        .eq('user_id', userId)
        .eq('telefone', telefone)
        .maybeSingle()

      if (leadExistenteCheck && !novoContexto.lead_id) {
        novoContexto = { ...novoContexto, lead_id: leadExistenteCheck.id }
      }

      // Estado: aguardando nome do lead
      if (conversa.estado === 'lead_aguardando_nome') {
        const nomeInformado = texto.trim()
        if (nomeInformado.length < 2) {
          resposta = 'Por favor, me diga seu nome 🙂'
          novoEstado = 'lead_aguardando_nome'
        } else {
          // Cria/atualiza lead no CRM
          const { data: leadExistente } = await supabase
            .from('leads')
            .select('id')
            .eq('user_id', userId)
            .eq('telefone', telefone)
            .maybeSingle()

          if (leadExistente) {
            await supabase
              .from('leads')
              .update({ nome: nomeInformado, ultima_mensagem: texto, ultima_interacao: new Date().toISOString() })
              .eq('id', leadExistente.id)
            novoContexto = { ...novoContexto, lead_id: leadExistente.id }
          } else {
            const { data: novoLead } = await supabase
              .from('leads')
              .insert({
                user_id: userId,
                nome: nomeInformado,
                telefone,
                origem: 'whatsapp_bot',
                status: 'novo',
                ultima_mensagem: texto,
                ultima_interacao: new Date().toISOString()
              })
              .select()
              .single()
            novoContexto = { ...novoContexto, lead_id: novoLead?.id }
          }

          resposta = `Prazer, ${nomeInformado.split(' ')[0]}! 😊\n\n${montarMenuLead(leadOpcoesDisponiveis)}`
          novoEstado = 'lead_aguardando_interesse'
        }
      }
      // Estado: aguardando interesse do lead
      else if (conversa.estado === 'lead_aguardando_interesse') {
        const numero = parseInt(textoLower.charAt(0), 10)
        const optSelecionada = (!isNaN(numero) && numero >= 1 && numero <= leadOpcoesDisponiveis.length)
          ? leadOpcoesDisponiveis[numero - 1]
          : null

        if (!optSelecionada) {
          resposta = `Por favor, escolha uma das opções acima.\n\n${montarMenuLead(leadOpcoesDisponiveis)}`
          novoEstado = 'lead_aguardando_interesse'
        } else {
          const interesse = optSelecionada.descricaoCRM
          // Atualiza interesse no lead
          if (novoContexto.lead_id) {
            await supabase
              .from('leads')
              .update({ interesse, ultima_mensagem: texto, ultima_interacao: new Date().toISOString() })
              .eq('id', novoContexto.lead_id)
          }

          // Monta resposta personalizada por chave
          if (optSelecionada.key === 'conhecer') {
            // Conhecer aulas → manda horários + link de agendamento
            const horarios = await respostaHorarios(supabase, userId)
            // Pega slug pra link de agendamento
            const { data: u } = await supabase
              .from('usuarios')
              .select('agendamento_slug, agendamento_ativo')
              .eq('id', userId)
              .single()
            let extra = ''
            if (u?.agendamento_ativo && u?.agendamento_slug) {
              extra = `\n\nQuer agendar uma aula? 👉 ${APP_URL}/agendar/${u.agendamento_slug}`
            }
            resposta = `Que ótimo! 😊 Aqui estão nossos horários:\n\n${horarios.replace('\n_Digite *0* para voltar ao menu._', '')}${extra}\n\n_Nossa equipe também vai te chamar em breve!_`
          } else if (optSelecionada.key === 'valores') {
            // Valores → lista os planos
            const { data: planos } = await supabase
              .from('planos')
              .select('nome, valor')
              .eq('user_id', userId)
              .eq('ativo', true)
              .order('valor', { ascending: true })

            if (planos && planos.length > 0) {
              let lista = '*💰 Nossos planos:*\n'
              for (const p of planos) {
                const valor = parseFloat(String(p.valor)).toFixed(2).replace('.', ',')
                lista += `\n📌 ${p.nome} - R$ ${valor}/mês`
              }
              resposta = `${lista}\n\n_Nossa equipe vai te passar mais detalhes em breve!_ 😊`
            } else {
              resposta = `Show! Já avisei o time da ${nomeEmpresa}, em breve alguém te passa os valores. 💰`
            }
          } else if (optSelecionada.key === 'experimental') {
            // Aula experimental → manda link direto
            const { data: u } = await supabase
              .from('usuarios')
              .select('agendamento_slug, agendamento_ativo')
              .eq('id', userId)
              .single()

            if (u?.agendamento_ativo && u?.agendamento_slug) {
              resposta = `Perfeito! 🎉 Pode agendar sua aula experimental no link abaixo:\n\n👉 ${APP_URL}/agendar/${u.agendamento_slug}\n\n_Qualquer dúvida, nossa equipe também vai te chamar!_`
            } else {
              resposta = `Show! ✨ Já avisei o time da ${nomeEmpresa}, em breve alguém entra em contato pra agendar sua aula experimental. 🙏`
            }
          } else {
            // Outro assunto
            resposta = `Tudo bem! ✨ Já avisei o time da ${nomeEmpresa}, em breve alguém vai te chamar aqui no WhatsApp. 🙏`
          }

          // Notifica o admin (sempre, independente da opção)
          const { data: admin } = await supabase
            .from('usuarios')
            .select('telefone')
            .eq('id', userId)
            .single()

          if (admin?.telefone) {
            const telAdmin = normalizarTelefone(admin.telefone)
            const nomeLead = (await supabase.from('leads').select('nome').eq('id', novoContexto.lead_id).single()).data?.nome || 'Lead'
            const msgAdmin = `🔥 *Novo lead!*\n\n👤 ${nomeLead}\n📱 ${telefone}\n💬 Interesse: ${interesse}\n\n_Veio pelo bot do WhatsApp. Acesse o CRM para responder._`
            await enviarMensagem(evolutionUrl, evolutionKey, instanceName, telAdmin, msgAdmin)
          }

          novoEstado = 'lead_capturado'
        }
      }
      // Lead já existe (capturado ou em qualquer outro estado avançado)
      else if (leadExistenteCheck) {
        // Atualiza última mensagem sempre
        await supabase
          .from('leads')
          .update({ ultima_mensagem: texto, ultima_interacao: new Date().toISOString() })
          .eq('id', leadExistenteCheck.id)

        if (ehSaudacao) {
          // Saudação de lead já capturado → resposta amigável SEM resetar
          const primeiroNome = leadExistenteCheck.nome.split(' ')[0]
          resposta = `Olá de novo, ${primeiroNome}! 👋\n\nNossa equipe já foi avisada sobre você e em breve vai entrar em contato. 😊\n\n_Se preferir aguardar aqui mesmo, fica tranquilo(a)._`
          novoEstado = 'lead_capturado'
        } else {
          // Mensagem normal → bot fica em silêncio (humano vai responder)
          resposta = ''
          novoEstado = 'lead_capturado'
        }
      }
      else {
        // Primeira interação. Se o WhatsApp já forneceu um pushName,
        // pula a pergunta do nome e cria o lead direto, indo pra pergunta de interesse.
        if (pushName && pushName.trim().length >= 2) {
          const nomeDoPerfil = pushName.trim()

          // Cria o lead já com o nome do perfil
          const { data: novoLead } = await supabase
            .from('leads')
            .insert({
              user_id: userId,
              nome: nomeDoPerfil,
              telefone,
              origem: 'whatsapp_bot',
              status: 'novo',
              ultima_mensagem: texto,
              ultima_interacao: new Date().toISOString()
            })
            .select()
            .single()

          if (novoLead) {
            novoContexto = { ...novoContexto, lead_id: novoLead.id }
          }

          const primeiroNome = nomeDoPerfil.split(' ')[0]
          const saudacaoLeadBase = cfg?.bot_lead_saudacao || 'Olá {{nomeCliente}}! 👋 Bem-vindo(a) à {{nomeEmpresa}}!'
          const saudacaoLead = substituirVars(saudacaoLeadBase, {
            nomeCliente: primeiroNome,
            nomeEmpresa: nomeEmpresa,
          })
          resposta = `${saudacaoLead}\n\n${montarMenuLead(leadOpcoesDisponiveis)}`
          novoEstado = 'lead_aguardando_interesse'
        } else {
          // Sem pushName → fallback: pergunta o nome (sem variável de nome ainda)
          const saudacaoLeadBase = cfg?.bot_lead_saudacao || 'Olá! 👋 Bem-vindo(a) à {{nomeEmpresa}}!'
          const saudacaoLead = substituirVars(saudacaoLeadBase, {
            nomeCliente: '',
            nomeEmpresa: nomeEmpresa,
          })
          resposta = `${saudacaoLead.replace(/, !/g, '!').replace(/  /g, ' ')}\n\nComo posso te chamar? 😊`
          novoEstado = 'lead_aguardando_nome'
        }
      }
    }
    // ============================================================
    // FLUXO ALUNO CADASTRADO (devedor existe)
    // ============================================================
    else if (ehSaudacao) {
      resposta = await montarSaudacao(supabase, userId, devedor.nome, nomeEmpresa, opcoesDisponiveis)
      novoEstado = 'aguardando_opcao'
    } else if (conversa.estado === 'menu' || conversa.estado === 'atendente') {
      resposta = await montarSaudacao(supabase, userId, devedor.nome, nomeEmpresa, opcoesDisponiveis)
      novoEstado = 'aguardando_opcao'
    } else {
      // Estado aguardando_opcao → processa número (renumerado conforme opções ativas)
      const numero = parseInt(textoLower.charAt(0), 10)
      const opcaoSelecionada = (!isNaN(numero) && numero >= 1 && numero <= opcoesDisponiveis.length)
        ? opcoesDisponiveis[numero - 1].key
        : null

      if (!opcaoSelecionada) {
        resposta = `Opção inválida 🤷\n\n${montarMenuTexto(opcoesDisponiveis)}`
      } else {
        switch (opcaoSelecionada) {
          case 'mensalidade':
            resposta = await respostaMensalidade(supabase, devedor.id)
            break
          case 'horarios':
            resposta = await respostaHorarios(supabase, userId)
            break
          case 'pix': {
            const pixResp = await respostaPix(supabase, devedor, userId)
            resposta = pixResp.texto
            if (pixResp.pixCode) {
              await enviarMensagem(evolutionUrl, evolutionKey, instanceName, telefone, pixResp.texto)
              await new Promise(r => setTimeout(r, 800))
              await enviarMensagem(evolutionUrl, evolutionKey, instanceName, telefone, pixResp.pixCode)
              resposta = ''
            }
            break
          }
          case 'agendar':
            resposta = await respostaAgendar(supabase, userId)
            break
          case 'atendente':
            resposta = RESPOSTA_ATENDENTE
            novoEstado = 'atendente'
            break
        }
      }
    }

    // ====== 6. Enviar resposta + atualizar estado ======
    console.log('💬 Resposta montada | estado:', conversa.estado, '→', novoEstado, '| tamanho:', resposta.length)
    if (resposta) {
      console.log('📤 Enviando mensagem para:', telefone)
      await enviarMensagem(evolutionUrl, evolutionKey, instanceName, telefone, resposta)
      console.log('✅ Mensagem enviada')
    }

    await supabase
      .from('bot_conversas')
      .update({
        estado: novoEstado,
        devedor_id: devedor?.id || conversa.devedor_id,
        contexto: novoContexto,
        ultima_interacao: new Date().toISOString(),
      })
      .eq('id', conversa.id)

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err: any) {
    console.error('❌ Erro no bot:', err)
    return new Response(JSON.stringify({ ok: false, error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
