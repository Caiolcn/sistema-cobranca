// Edge Function: WhatsApp Bot - Handler de webhook do Evolution API
// Recebe mensagens dos alunos e responde com menu numerico
// Acesso PUBLICO (chamado pelo Evolution API)

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const APP_URL = Deno.env.get('APP_URL') || 'https://www.mensalli.com.br'

// Instancia do WhatsApp COMERCIAL do Mensalli (o numero que recebe os leads das
// campanhas). Mensagens dessa instancia NAO passam pelo bot de aluno: viram lead
// no CRM de campanha (/app/admin/leads). Mesma constante de Signup.js e Admin.js.
// Fallback de config.evolution_master_instance.
const INSTANCIA_MENSALLI = 'mensalli_master'

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

// ============================================================
// connection.update — rastreio de queda/reconexão em TEMPO REAL
// ------------------------------------------------------------
// Complementa o health-check (cron 8h): o cron pega socket morto
// "silencioso" (state "open" mas Connection Closed no envio); este
// webhook pega o evento limpo de queda/logout no instante em que
// acontece. Grava o timestamp exato em logs_conexao e, quando é
// logout definitivo, libera o QR + avisa o gestor pelo master.
// ============================================================
const REAVISO_INTERVALO_MS = 3 * 24 * 60 * 60 * 1000 // anti-spam: 1 aviso / 3 dias

function formatarTelefoneGestor(telefone: string): string | null {
  let n = String(telefone || '').replace(/\D/g, '')
  if (!n) return null
  if (!n.startsWith('55')) n = '55' + n
  return n
}

async function lerEstadoInstancia(apiUrl: string, apiKey: string, instance: string): Promise<string> {
  try {
    const res = await fetch(`${apiUrl}/instance/connectionState/${instance}`, { headers: { apikey: apiKey } })
    if (!res.ok) return 'erro'
    const d = await res.json()
    return d?.instance?.state || 'close'
  } catch {
    return 'erro'
  }
}

async function tratarConnectionUpdate(supabase: any, instance: string, data: any): Promise<void> {
  if (!instance) return
  const estado = String(data?.state || data?.connection || '').toLowerCase()
  const statusReason = Number(
    data?.statusReason ?? data?.lastDisconnect?.error?.output?.statusCode ?? 0,
  )
  const agoraIso = new Date().toISOString()

  const { data: zap } = await supabase
    .from('mensallizap')
    .select('user_id, ultimo_aviso_desconexao, gestor_jid, conectado')
    .eq('instance_name', instance)
    .maybeSingle()
  if (!zap?.user_id) return
  const userId = zap.user_id

  // ---- Reconectou ----
  if (estado === 'open') {
    await supabase
      .from('mensallizap')
      .update({ conectado: true, ultima_conexao: agoraIso, ultimo_aviso_desconexao: null, updated_at: agoraIso })
      .eq('user_id', userId)
    await supabase.from('logs_conexao').insert({ user_id: userId, instance_name: instance, status: 'conectado' })
    console.log('✅ connection.update: reconectado', instance)
    return
  }

  // ---- Caiu ----
  if (estado === 'close') {
    // Só é QUEDA quando a conta estava conectada. Instância já caída fica
    // ciclando connecting→close→connecting e emite 'close' o tempo todo — e as
    // nossas próprias ações de recuperação (restart, pedir QR) também geram.
    //
    // Registrar tudo como queda fazia dois estragos: inflava a contagem (a
    // métrica de "quedas/dia" contava reemissão de quem já estava fora) e
    // REJUVENESCIA o ultima_desconexao — a Nr assessoria, fora desde 03/08,
    // aparecia como "caiu 12/08 12:45", quebrando o "há quantos dias" do painel
    // e do aviso ao cliente.
    const quedaReal = zap.conectado !== false

    if (quedaReal) {
      await supabase.from('logs_conexao').insert({ user_id: userId, instance_name: instance, status: 'desconectado' })
      await supabase
        .from('mensallizap')
        .update({ conectado: false, ultima_desconexao: agoraIso, updated_at: agoraIso })
        .eq('user_id', userId)
      console.log(`⚠️ connection.update: caiu ${instance} (statusReason ${statusReason})`)
    } else {
      // Já estava fora: só garante o flag, sem mexer no "desde quando".
      await supabase.from('mensallizap').update({ conectado: false, updated_at: agoraIso }).eq('user_id', userId)
      console.log(`↻ connection.update: ${instance} segue fora (close repetido, statusReason ${statusReason})`)
    }

    // 401 = DisconnectReason.loggedOut → saiu de vez: avisa na hora, aqui mesmo.
    //
    // Outros códigos = o Baileys diz que reconecta sozinho — só que nem sempre
    // reconecta: a instância fica presa em "connecting" indefinidamente e as
    // automações param sem ninguém saber. Não alarmamos daqui (seria um aviso a
    // cada blip de rede), mas a queda JÁ ficou registrada acima (conectado=false
    // + ultima_desconexao + logs_conexao) e o health-check, que roda de 30 em 30
    // min, avisa e libera o QR se ainda estiver fora na rodada seguinte.
    if (statusReason !== 401) return

    // Anti-spam (mesma janela do health-check, pra não avisar 2x pelos dois caminhos).
    const ultimoAviso = zap.ultimo_aviso_desconexao ? Date.parse(zap.ultimo_aviso_desconexao) : 0
    if (ultimoAviso && Date.now() - ultimoAviso < REAVISO_INTERVALO_MS) return

    const { data: configRows } = await supabase
      .from('config')
      .select('chave, valor')
      .in('chave', ['evolution_api_url', 'evolution_api_key', 'evolution_master_instance'])
    const cm: Record<string, string> = {}
    for (const r of configRows || []) cm[r.chave] = r.valor
    const apiUrl = cm.evolution_api_url
    const apiKey = cm.evolution_api_key
    const masterInstance = cm.evolution_master_instance || 'mensalli_master'
    if (!apiUrl || !apiKey) return

    // Libera o QR (idempotente; em loggedOut a Evolution já derrubou a sessão).
    try {
      await fetch(`${apiUrl}/instance/logout/${instance}`, { method: 'DELETE', headers: { apikey: apiKey } })
    } catch { /* noop */ }

    const { data: u } = await supabase
      .from('usuarios')
      .select('telefone, nome_empresa')
      .eq('id', userId)
      .maybeSingle()
    // gestor_jid é o JID que o WhatsApp confirmou, resolvido e cacheado pelo
    // health-check. Preferi-lo conserta o aviso que voltava 400 exists:false:
    // em DDD pré-2014 o JID canônico não tem o nono dígito, e montar o destino
    // a partir do telefone cadastrado errava em 4 contas (107 falhas em 7 dias).
    const numero = zap.gestor_jid || formatarTelefoneGestor(u?.telefone || '')
    if (!numero) return

    // Só avisa pelo master se ele estiver conectado.
    if ((await lerEstadoInstancia(apiUrl, apiKey, masterInstance)) !== 'open') return

    const nome = String(u?.nome_empresa || '').trim().split(' ')[0] || ''
    const texto =
      `⚠️ *MensalliZap — atenção*\n\n` +
      `Olá${nome ? `, ${nome}` : ''}! Detectamos que o *WhatsApp da sua conta desconectou* ` +
      `e suas mensagens automáticas (cobranças, lembretes) não estão saindo.\n\n` +
      `👉 Reconecte agora escaneando o QR Code:\n${APP_URL}/app/whatsapp\n\n` +
      `É rápido e leva menos de 1 minuto. Qualquer dúvida, é só chamar a gente por aqui!`
    // gestor_jid já vem com sufixo; o telefone cru não. Concatenar sem checar
    // geraria "...@s.whatsapp.net@s.whatsapp.net" e o envio falharia calado.
    const destino = numero.includes('@') ? numero : `${numero}@s.whatsapp.net`
    await enviarMensagem(apiUrl, apiKey, masterInstance, destino, texto)
    await supabase.from('mensallizap').update({ ultimo_aviso_desconexao: agoraIso }).eq('user_id', userId)
    console.log('📣 connection.update: aviso de queda enviado ao gestor', userId)
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
// CRM de leads de campanha (instancia comercial do Mensalli)
// ============================================================

// Grava a mensagem no CRM de leads.
//
// Duas regras que andam juntas:
//  1. O card SO nasce de uma mensagem RECEBIDA. Prospeccao ativa, follow-up,
//     boas-vindas de trial e cobranca SaaS saem por este mesmo numero — se
//     outbound criasse lead, o board viraria a lista de todo mundo com quem a
//     gente ja falou, em vez de quem procurou a gente.
//  2. Em conversa que JA e lead, o que enviamos e gravado (direcao 'out'). E o
//     que permite a coluna "Novo" significar, ao pe da letra, "ainda nao respondi".
// Texto pronto da campanha de WhatsApp. Fallback para quando o WhatsApp nao
// manda o externalAdReply (acontece em alguns aparelhos/versoes).
const TEXTO_PRONTO_ANUNCIO = /^oi! vi o v[ií]deo e quero saber mais sobre o mensalli/i

// Clique-para-WhatsApp: a 1a mensagem traz contextInfo.externalAdReply com o
// anuncio de origem. A Evolution pode por o contextInfo em data ou dentro da
// mensagem, conforme o tipo.
function extrairAnuncio(data: any, msg: any): { id: string | null; titulo: string | null; ctwaClid: string | null } | null {
  const candidatos = [
    data?.contextInfo,
    ...Object.values(msg || {}).map((v: any) => v?.contextInfo),
    msg?.messageContextInfo,
  ]
  for (const ctx of candidatos) {
    const ad = ctx?.externalAdReply
    if (ad && (ad.sourceId || ad.sourceType === 'ad' || ad.ctwaClid || ad.sourceUrl)) {
      return {
        id: ad.sourceId ? String(ad.sourceId) : null,
        titulo: ad.title || ad.body || null,
        ctwaClid: ad.ctwaClid || null,
      }
    }
  }
  return null
}

async function capturarLeadMensalli(
  supabase: any,
  args: {
    remoteJid: string
    pushName: string
    fromMe: boolean
    texto: string
    tipo: string
    waMessageId: string
    enviadoEm: string
    anuncio: { id: string | null; titulo: string | null; ctwaClid: string | null } | null
  }
) {
  const { remoteJid, pushName, fromMe, texto, tipo, waMessageId, enviadoEm, anuncio } = args
  const veioDeAnuncio = !fromMe && (!!anuncio || TEXTO_PRONTO_ANUNCIO.test(texto))
  const direcao = fromMe ? 'out' : 'in'

  // Contas migradas pro enderecamento LID nao expoem telefone no JID (@lid).
  // Nesses casos o lead existe mesmo assim, so fica sem telefone (e sem match
  // automatico com a tabela usuarios).
  const ehLid = remoteJid.includes('@lid')
  const telefone = ehLid ? null : normalizarTelefone(remoteJid.split('@')[0].split(':')[0])

  const { data: lead } = await supabase
    .from('mensalli_leads')
    .select('id, status, nome, ultima_interacao, ignorado, nao_lidas, veio_de_anuncio')
    .eq('remote_jid', remoteJid)
    .maybeSingle()

  // Contato marcado como "não é lead" (o número também é usado pessoalmente):
  // não volta pro board nem tem a conversa gravada.
  if (lead?.ignorado) {
    console.log('⏭️ Contato ignorado no CRM de leads:', remoteJid)
    return
  }

  let leadId = lead?.id

  // Fomos nos que puxamos a conversa e o contato ainda nao e lead => ignora.
  // Se ele responder, o card nasce na hora (ja em 'conversando').
  if (!leadId && fromMe) {
    console.log('⏭️ Outbound pra quem nao e lead — nao cria card:', remoteJid)
    return
  }

  if (!leadId) {
    const { data: novo, error } = await supabase
      .from('mensalli_leads')
      .insert({
        remote_jid: remoteJid,
        telefone,
        // pushName em mensagem fromMe e o NOSSO nome de perfil ("Mensalli"),
        // nao o do contato — so aproveitamos o de quem escreve pra gente.
        nome: pushName?.trim() || null,
        status: 'novo',
        origem: 'whatsapp',
        ultima_mensagem: texto,
        ultima_direcao: direcao,
        ultima_interacao: enviadoEm,
        // Lead nasce de mensagem recebida (o guard acima barra outbound), entao
        // ja nasce com uma nao lida — e o badge da caixa aparece na hora.
        nao_lidas: 1,
        veio_de_anuncio: veioDeAnuncio,
        anuncio_id: anuncio?.id || null,
        anuncio_titulo: anuncio?.titulo || null,
        ctwa_clid: anuncio?.ctwaClid || null,
      })
      .select('id')
      .single()

    if (error) {
      console.error('❌ Erro ao criar lead Mensalli:', error.message)
      return
    }
    leadId = novo.id
    console.log('🆕 Lead Mensalli criado:', remoteJid, pushName)
  } else {
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }

    // Reentrega de webhook ou backfill fora de ordem: nao deixa uma mensagem
    // antiga sobrescrever o resumo da conversa.
    const ehMaisRecente = !lead.ultima_interacao || enviadoEm >= lead.ultima_interacao
    if (ehMaisRecente) {
      patch.ultima_mensagem = texto
      patch.ultima_direcao = direcao
      patch.ultima_interacao = enviadoEm
      // Respondi um lead novo => ele sai de "Novo" (que significa "sem resposta")
      if (fromMe && lead.status === 'novo') patch.status = 'conversando'
    }
    // Só o pushName de quem escreve pra gente serve como nome do lead.
    if (!lead.nome && !fromMe && pushName?.trim()) patch.nome = pushName.trim()

    // Badge da caixa de entrada. Quem zera e o inbox ao abrir a conversa (e o
    // proprio envio, na edge function mensalli-lead-send).
    if (!fromMe) patch.nao_lidas = (lead.nao_lidas || 0) + 1

    // Lead antigo que voltou clicando num anuncio: passa a contar como do anuncio
    if (veioDeAnuncio && !lead.veio_de_anuncio) {
      patch.veio_de_anuncio = true
      if (anuncio?.id) patch.anuncio_id = anuncio.id
      if (anuncio?.titulo) patch.anuncio_titulo = anuncio.titulo
      if (anuncio?.ctwaClid) patch.ctwa_clid = anuncio.ctwaClid
    }

    await supabase.from('mensalli_leads').update(patch).eq('id', leadId)
  }

  // wa_message_id e UNIQUE: reentrega do mesmo evento nao duplica a conversa
  const temMidia = tipo !== 'texto'
  const { data: gravada, error: msgErr } = await supabase
    .from('mensalli_lead_mensagens')
    .upsert(
      {
        lead_id: leadId,
        wa_message_id: waMessageId || null,
        direcao,
        texto,
        tipo,
        enviado_em: enviadoEm,
        // 'pendente' entra na fila de download logo abaixo.
        midia_status: temMidia ? 'pendente' : 'nao_aplica',
      },
      { onConflict: 'wa_message_id', ignoreDuplicates: true }
    )
    .select('id, midia_status')
    .maybeSingle()

  if (msgErr) console.error('❌ Erro ao gravar mensagem do lead:', msgErr.message)

  // Midia do WhatsApp expira: buscamos no ato do recebimento, nao na hora de
  // abrir a conversa. waitUntil solta o download em segundo plano — a Evolution
  // recebe o 200 sem esperar o upload.
  if (temMidia && gravada?.id && gravada.midia_status === 'pendente') {
    const tarefa = baixarMidiaLead(supabase, {
      mensagemId: gravada.id,
      leadId: leadId!,
      waMessageId,
      remoteJid,
      fromMe,
      tipo,
    })
    // @ts-ignore EdgeRuntime existe no runtime do Supabase, nao nos tipos do Deno
    if (typeof EdgeRuntime !== 'undefined' && EdgeRuntime.waitUntil) {
      // @ts-ignore
      EdgeRuntime.waitUntil(tarefa)
    } else {
      tarefa.catch(() => {})
    }
  }
}

// ============================================================
// Midia das conversas de lead
// ============================================================
// A Evolution nao manda o binario no webhook (webhookBase64 fica false de
// proposito: ligar isso engorda o payload de TODAS as instancias dos clientes,
// e a rotina de zumbi recria instancia com o flag em false de novo). Entao
// buscamos sob demanda, uma mensagem por vez.
const EXTENSAO_POR_MIME: Record<string, string> = {
  'audio/ogg': 'ogg', 'audio/mpeg': 'mp3', 'audio/mp4': 'm4a', 'audio/aac': 'aac',
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif',
  'video/mp4': 'mp4', 'video/3gpp': '3gp', 'video/quicktime': 'mov',
  'application/pdf': 'pdf',
}

const EXTENSAO_POR_TIPO: Record<string, string> = {
  audio: 'ogg', imagem: 'jpg', video: 'mp4', documento: 'bin', sticker: 'webp', outro: 'bin',
}

async function baixarMidiaLead(
  supabase: any,
  args: {
    mensagemId: string
    leadId: string
    waMessageId: string
    remoteJid: string
    fromMe: boolean
    tipo: string
  }
) {
  const { mensagemId, leadId, waMessageId, remoteJid, fromMe, tipo } = args

  const marcarErro = async (motivo: string) => {
    console.warn(`⚠️ Midia de lead nao baixada (${motivo}):`, waMessageId)
    await supabase
      .from('mensalli_lead_mensagens')
      .update({ midia_status: 'erro' })
      .eq('id', mensagemId)
  }

  try {
    if (!waMessageId) return await marcarErro('sem wa_message_id')

    const { data: configRows } = await supabase
      .from('config')
      .select('chave, valor')
      .in('chave', ['evolution_api_url', 'evolution_api_key', 'evolution_master_instance'])
    const cfg: Record<string, string> = {}
    for (const r of configRows || []) cfg[r.chave] = r.valor

    const apiUrl = (cfg.evolution_api_url || '').replace(/\/+$/, '')
    const apiKey = cfg.evolution_api_key
    const instancia = cfg.evolution_master_instance || INSTANCIA_MENSALLI
    if (!apiUrl || !apiKey) return await marcarErro('evolution nao configurada')

    const resp = await fetch(`${apiUrl}/chat/getBase64FromMediaMessage/${instancia}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: apiKey },
      body: JSON.stringify({
        message: { key: { id: waMessageId, remoteJid, fromMe } },
        convertToMp4: false,
      }),
    })

    if (!resp.ok) return await marcarErro(`http ${resp.status}`)

    const dados = await resp.json().catch(() => null)
    const base64 = dados?.base64 || dados?.media || null
    if (!base64) return await marcarErro('resposta sem base64')

    const mime = dados?.mimetype || dados?.mimeType || null
    const ext = (mime && EXTENSAO_POR_MIME[String(mime).split(';')[0]]) || EXTENSAO_POR_TIPO[tipo] || 'bin'

    // base64 -> bytes sem passar por string gigante duas vezes
    const binario = atob(base64)
    const bytes = new Uint8Array(binario.length)
    for (let i = 0; i < binario.length; i++) bytes[i] = binario.charCodeAt(i)

    const caminho = `${leadId}/${waMessageId}.${ext}`
    const { error: upErr } = await supabase.storage
      .from('lead-midia')
      .upload(caminho, bytes, {
        contentType: mime || 'application/octet-stream',
        upsert: true,
      })
    if (upErr) return await marcarErro(`upload: ${upErr.message}`)

    await supabase
      .from('mensalli_lead_mensagens')
      .update({
        midia_path: caminho,
        midia_mime: mime,
        midia_bytes: bytes.length,
        duracao_seg: dados?.seconds || dados?.duration || null,
        midia_status: 'ok',
      })
      .eq('id', mensagemId)

    console.log('📎 Midia de lead guardada:', caminho, `${Math.round(bytes.length / 1024)}KB`)
  } catch (e) {
    await marcarErro(e instanceof Error ? e.message : 'excecao')
  }
}

// ============================================================
// Boas-vindas "responde QUERO" (sql-boas-vindas-quero.sql, 02/11/2026)
// ------------------------------------------------------------
// O cadastro (signup-boas-vindas) manda UMA mensagem pedindo "responde QUERO".
// Aqui, quando o dono de uma conta nova responde pro master:
//   - carimba usuarios.boas_vindas_respondeu_em (libera os avisos do trial,
//     que pra quem nunca respondeu ficam travados -- regra dos 2) e liga o
//     lead do CRM a conta;
//   - QUERO/qro/sim/manda/👍 com a conta aguardando -> cobranca de exemplo e,
//     5s depois, os proximos passos (em segundo plano: a Evolution recebe o
//     200 na hora);
//   - qualquer outra coisa -> nada automatico; avisa o dono no
//     RELATORIO_WHATSAPP_TO, so na 1a vez de cada conta.
// Toda trava e um UPDATE condicional (... is null) -- reentrega de webhook ou
// dois "quero" seguidos nao duplicam envio.
//
// Destino: o proprio chat que escreveu, e so depois de casar o telefone dele
// com usuarios.telefone (tel_chave, cobre com e sem o 9). Em @lid sem telefone
// no payload nao casa nada e a conversa segue so no CRM (manual).
// ============================================================
const RELATORIO_WHATSAPP_TO = Deno.env.get('RELATORIO_WHATSAPP_TO') || ''
// Contas olhadas pra carimbar "respondeu" (cobre o trial de 3 dias com folga).
const BV_JANELA_CONTA_DIAS = 15
// Ate quando o QUERO vale depois da mensagem do cadastro.
const BV_JANELA_QUERO_DIAS = 7
const BV_ATRASO_PROXIMOS_MS = 5000
const BV_PALAVRAS = new Set(['quero', 'qro', 'sim', 'manda'])
const DIA_MS = 24 * 60 * 60 * 1000

// Fallback se o template sumir de templates_admin -- quem pediu o exemplo tem
// que receber o exemplo. Mesmo texto do sql-boas-vindas-quero.sql.
const BV_EXEMPLO_FALLBACK = `Olá, {{nome}}.

Este é um lembrete referente à sua mensalidade:

📌 Plano Mensal
💰 R$ 150,00
📅 Vencimento: dia 10

🔑 Chave PIX: chave-de-exemplo@mensalli.com.br (fictícia)

Estamos à disposição para qualquer esclarecimento.
━━━━━━━━━━━━━━━
{{nome}}, essa é uma cobrança de exemplo — é assim que seus alunos vão receber, direto do seu WhatsApp. E dá pra editar o texto do jeito que quiser ✏️`

const BV_PROXIMOS_FALLBACK =
  'Pra começar a cobrar assim, faltam 2 passos: cadastrar os alunos e conectar seu WhatsApp. Ou, se preferir, me manda sua lista de alunos (planilha, print ou foto) que eu cadastro tudo pra você. Qual você prefere?'

const POLEGAR = /\u{1F44D}[\u{1F3FB}-\u{1F3FF}]?/gu

// "Quero!", "sim, quero", "MANDA", "qro", 👍 (qualquer tom de pele) -> true.
// "quero ver como funciona" -> false (vai pro dono responder).
function ehRespostaQuero(texto: string): boolean {
  const bruto = String(texto || '').trim()
  if (!bruto) return false
  const temPolegar = bruto.match(POLEGAR) !== null
  const palavras = bruto
    .replace(POLEGAR, ' ')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
  if (palavras.length === 0) return temPolegar
  if (palavras.length > 4) return false
  return palavras.every((p) => BV_PALAVRAS.has(p))
}

// Porte do tel_chave() do banco: DDD + 8 ultimos digitos. Casa com e sem o 9.
function telChave(tel: string | null | undefined): string | null {
  let d = String(tel || '').replace(/\D/g, '')
  if (d.startsWith('55') && (d.length === 12 || d.length === 13)) d = d.slice(2)
  if (d.length < 10) return null
  return d.slice(0, 2) + d.slice(-8)
}

// Telefone de quem escreveu. Em @lid o JID nao tem telefone; algumas versoes da
// Evolution mandam o numero real em senderPn/remoteJidAlt.
function telefoneDoRemetente(remoteJid: string, key: any, data: any): string | null {
  if (!remoteJid.includes('@lid')) return remoteJid.split('@')[0].split(':')[0] || null
  const candidatos = [key?.senderPn, key?.remoteJidAlt, key?.participantPn, data?.senderPn]
  for (const c of candidatos) {
    const s = String(c || '')
    if (s && !s.includes('@lid') && /\d{10,}/.test(s.replace(/\D/g, ''))) return s.split('@')[0].split(':')[0]
  }
  return null
}

function emSegundoPlano(tarefa: Promise<unknown>) {
  const segura = tarefa.catch((e) => console.error('❌ boas-vindas (segundo plano):', e))
  // @ts-ignore EdgeRuntime existe no runtime do Supabase, nao nos tipos do Deno
  if (typeof EdgeRuntime !== 'undefined' && EdgeRuntime.waitUntil) {
    // @ts-ignore
    EdgeRuntime.waitUntil(segura)
  }
}

async function configMaster(supabase: any) {
  const { data: rows } = await supabase
    .from('config')
    .select('chave, valor')
    .in('chave', ['evolution_api_url', 'evolution_api_key', 'evolution_master_instance'])
  const cfg: Record<string, string> = {}
  for (const r of rows || []) cfg[r.chave] = r.valor
  return {
    apiUrl: String(cfg.evolution_api_url || '').replace(/\/+$/, ''),
    apiKey: cfg.evolution_api_key || '',
    instancia: cfg.evolution_master_instance || INSTANCIA_MENSALLI,
  }
}

// Envio com timeout e resultado (o enviarMensagem acima so loga).
async function enviarPeloMaster(apiUrl: string, apiKey: string, instancia: string, numero: string, texto: string) {
  try {
    const r = await fetch(`${apiUrl}/message/sendText/${instancia}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: apiKey },
      body: JSON.stringify({ number: numero, text: texto }),
      signal: AbortSignal.timeout(30000),
    })
    if (!r.ok) return { ok: false, http: r.status, erro: (await r.text()).slice(0, 300) }
    return { ok: true, http: r.status, erro: '' }
  } catch (e) {
    return { ok: false, http: 0, erro: e instanceof Error ? e.message : String(e) }
  }
}

async function logBoasVindas(supabase: any, usuarioId: string, tipo: string, mensagem: string, r: { ok: boolean; http: number; erro: string }) {
  const { error } = await supabase.from('retencao_saas_envios').insert({
    usuario_id: usuarioId,
    tipo,
    mensagem,
    canal: 'boas_vindas',
    status: r.ok ? 'enviado' : 'falha',
    erro: r.ok ? null : `${r.http} ${r.erro}`,
  })
  if (error) console.error('❌ boas-vindas: log falhou:', error.message)
}

interface ContaBoasVindas {
  id: string
  nome_completo: string | null
  nome_empresa: string | null
  telefone: string | null
  created_at: string
  role: string | null
  boas_vindas_aguarda_quero_desde: string | null
  boas_vindas_respondeu_em: string | null
  boas_vindas_exemplo_enviado_em: string | null
  boas_vindas_alerta_enviado_em: string | null
  retencao_d_enviado_em: string | null
}

async function enviarExemploBoasVindas(supabase: any, conta: ContaBoasVindas, destino: string) {
  const { apiUrl, apiKey, instancia } = await configMaster(supabase)
  const falhaCfg = { ok: false, http: 0, erro: 'Evolution nao configurada' }

  const { data: tmpls } = await supabase
    .from('templates_admin').select('tipo, mensagem').in('tipo', ['bv_exemplo', 'bv_proximos_passos'])
  const t: Record<string, string> = {}
  for (const x of tmpls || []) t[x.tipo] = x.mensagem

  const nome = String(conta.nome_completo || '').trim().split(/\s+/)[0] || 'tudo bem'
  const exemplo = (t.bv_exemplo || BV_EXEMPLO_FALLBACK).replaceAll('{{nome}}', nome)
  const proximos = (t.bv_proximos_passos || BV_PROXIMOS_FALLBACK).replaceAll('{{nome}}', nome)

  const r1 = apiUrl && apiKey ? await enviarPeloMaster(apiUrl, apiKey, instancia, destino, exemplo) : falhaCfg
  await logBoasVindas(supabase, conta.id, 'bv_exemplo', exemplo, r1)

  if (!r1.ok) {
    // Devolve a trava: o proximo "quero" tenta de novo.
    await supabase.from('usuarios').update({ boas_vindas_exemplo_enviado_em: null }).eq('id', conta.id)
    console.error('❌ boas-vindas: exemplo falhou', { usuario_id: conta.id, r1 })
    return
  }

  await new Promise((res) => setTimeout(res, BV_ATRASO_PROXIMOS_MS))

  const r2 = await enviarPeloMaster(apiUrl, apiKey, instancia, destino, proximos)
  await logBoasVindas(supabase, conta.id, 'bv_proximos_passos', proximos, r2)
  if (!r2.ok) console.error('❌ boas-vindas: proximos passos falhou', { usuario_id: conta.id, r2 })
  else console.log('✅ boas-vindas: exemplo + proximos passos enviados', conta.id)
}

async function avisarDonoBoasVindas(supabase: any, conta: ContaBoasVindas, texto: string) {
  const { apiUrl, apiKey, instancia } = await configMaster(supabase)
  const nome = String(conta.nome_completo || '').trim() || '(sem nome)'
  const empresa = String(conta.nome_empresa || '').trim()
  const aviso =
    `🔔 *Boas-vindas: responder na mão*\n\n` +
    `${nome}${empresa ? ` (${empresa})` : ''} respondeu:\n` +
    `"${String(texto || '').slice(0, 300)}"\n\n` +
    `Responde pelo inbox: ${APP_URL}/app/admin/leads`

  let r = { ok: false, http: 0, erro: 'Evolution nao configurada' }
  if (apiUrl && apiKey) {
    // Mesmo destino do resumo diario (relatorio-mensagens): o segredo, ou o
    // proprio numero conectado no master.
    let destino = RELATORIO_WHATSAPP_TO
    if (!destino) {
      try {
        const f = await fetch(`${apiUrl}/instance/fetchInstances?instanceName=${encodeURIComponent(instancia)}`, {
          headers: { apikey: apiKey },
          signal: AbortSignal.timeout(10000),
        })
        if (f.ok) {
          const d = await f.json()
          const i = (Array.isArray(d) ? d : [d])[0]
          destino = i?.ownerJid || i?.instance?.owner || ''
        }
      } catch { /* cai no erro abaixo */ }
    }
    if (destino) {
      const numero = destino.includes('@') ? destino : `${destino.replace(/\D/g, '')}@s.whatsapp.net`
      r = await enviarPeloMaster(apiUrl, apiKey, instancia, numero, aviso)
    } else {
      r = { ok: false, http: 0, erro: 'sem RELATORIO_WHATSAPP_TO e sem ownerJid do master' }
    }
  }

  await logBoasVindas(supabase, conta.id, 'bv_alerta_dono', aviso, r)
  if (!r.ok) {
    // Devolve a trava: a proxima mensagem dessa conta tenta avisar de novo.
    await supabase.from('usuarios').update({ boas_vindas_alerta_enviado_em: null }).eq('id', conta.id)
    console.error('❌ boas-vindas: aviso ao dono falhou', { usuario_id: conta.id, r })
  }
}

async function tratarRespostaBoasVindas(
  supabase: any,
  args: { remoteJid: string; telefoneRemetente: string | null; texto: string; ehReacao: boolean }
) {
  const { remoteJid, telefoneRemetente, texto, ehReacao } = args
  const chave = telChave(telefoneRemetente)
  if (!chave) return

  // Poucas contas (cadastros dos ultimos 15 dias): compara tel_chave aqui.
  const { data: contas, error } = await supabase
    .from('usuarios')
    .select('id, nome_completo, nome_empresa, telefone, created_at, role, boas_vindas_aguarda_quero_desde, boas_vindas_respondeu_em, boas_vindas_exemplo_enviado_em, boas_vindas_alerta_enviado_em, retencao_d_enviado_em')
    .gte('created_at', new Date(Date.now() - BV_JANELA_CONTA_DIAS * DIA_MS).toISOString())
    .not('telefone', 'is', null)
  if (error) {
    console.error('❌ boas-vindas: busca de conta falhou:', error.message)
    return
  }
  const conta = ((contas || []) as ContaBoasVindas[])
    .filter((c) => c.role !== 'admin' && telChave(c.telefone) === chave)
    .sort((a, b) => b.created_at.localeCompare(a.created_at))[0]
  if (!conta) return

  const agoraIso = new Date().toISOString()

  if (!conta.boas_vindas_respondeu_em) {
    await supabase.from('usuarios')
      .update({ boas_vindas_respondeu_em: agoraIso })
      .eq('id', conta.id)
      .is('boas_vindas_respondeu_em', null)
    // O trigger de vinculo so roda no cadastro; o lead nasceu agora.
    await supabase.from('mensalli_leads')
      .update({ usuario_id: conta.id, conta_detectada_em: agoraIso, updated_at: agoraIso })
      .eq('remote_jid', remoteJid)
      .is('usuario_id', null)
      .or('vinculo_manual.is.null,vinculo_manual.eq.false')
  }

  // Conta do fluxo antigo (ja recebeu saudacao + exemplo): so o carimbo acima.
  if (!conta.boas_vindas_aguarda_quero_desde) return
  if (Date.now() - Date.parse(conta.boas_vindas_aguarda_quero_desde) > BV_JANELA_QUERO_DIAS * DIA_MS) return

  // Depois da mensagem de 24h (retencao_d) o "sim" pode ser resposta a outra
  // pergunta -- dali em diante e tudo manual.
  const aguardando = !conta.boas_vindas_exemplo_enviado_em && !conta.retencao_d_enviado_em
  if (aguardando && ehRespostaQuero(texto)) {
    const { data: reservada } = await supabase.from('usuarios')
      .update({ boas_vindas_exemplo_enviado_em: agoraIso })
      .eq('id', conta.id)
      .is('boas_vindas_exemplo_enviado_em', null)
      .is('retencao_d_enviado_em', null)
      .select('id')
    if (reservada && reservada.length > 0) {
      emSegundoPlano(enviarExemploBoasVindas(supabase, conta, remoteJid))
    }
    return
  }

  // Reacao que nao e 👍 (ou remocao de reacao) nao pede resposta.
  if (ehReacao) return
  if (conta.boas_vindas_alerta_enviado_em) return

  const { data: reservaAlerta } = await supabase.from('usuarios')
    .update({ boas_vindas_alerta_enviado_em: agoraIso })
    .eq('id', conta.id)
    .is('boas_vindas_alerta_enviado_em', null)
    .select('id')
  if (reservaAlerta && reservaAlerta.length > 0) {
    emSegundoPlano(avisarDonoBoasVindas(supabase, conta, texto))
  }
}

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

    // ====== connection.update: rastreio de queda/reconexão (antes do filtro de msg) ======
    const evLower = String(eventName || '').toLowerCase()
    if (evLower.includes('connection.update') || evLower.includes('connection_update')) {
      const cdata = payload.data || payload
      const cinstance = payload.instance || cdata.instance || cdata.instanceName
      await tratarConnectionUpdate(supabase, cinstance, cdata)
      return new Response(JSON.stringify({ ok: true, handled: 'connection.update' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

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

    // A instancia comercial do Mensalli grava os dois lados da conversa no CRM de
    // leads (ver capturarLeadMensalli), entao aqui ela nao pula o fromMe.
    const ehInstanciaMensalli = instanceName === INSTANCIA_MENSALLI

    // Ignora mensagens enviadas por nós mesmos
    if (fromMe && !ehInstanciaMensalli) {
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

    // Reacao (👍) a mensagem do master: so interessa pra boas-vindas "responde
    // QUERO". Nao vira mensagem no CRM, igual antes.
    if (ehInstanciaMensalli && !fromMe && msg.reactionMessage) {
      const reacao = String(msg.reactionMessage.text || '')
      if (reacao) {
        try {
          await tratarRespostaBoasVindas(supabase, {
            remoteJid,
            telefoneRemetente: telefoneDoRemetente(remoteJid, key, data),
            texto: reacao,
            ehReacao: true,
          })
        } catch (e) {
          console.error('❌ boas-vindas (reacao):', e)
        }
      }
      return new Response(JSON.stringify({ ok: true, ignored: 'reaction' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (!texto && !ehMidiaSemTexto) {
      console.log('⏭️ Ignorado: no_text | msg completa:', JSON.stringify(msg).slice(0, 500))
      return new Response(JSON.stringify({ ok: true, ignored: 'no_text' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // ====== Instância comercial do Mensalli → CRM de leads de campanha ======
    // Sai por aqui de propósito: quem escreve pro número do Mensalli é um lead da
    // campanha, não um aluno. Nunca deve receber o menu do bot nem virar linha na
    // tabela `leads` (que é multi-tenant, dos clientes).
    if (ehInstanciaMensalli) {
      if (remoteJid === 'status@broadcast' || remoteJid.endsWith('@broadcast')) {
        return new Response(JSON.stringify({ ok: true, ignored: 'broadcast' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      let tipoMsg = 'texto'
      if (ehAudio) tipoMsg = 'audio'
      else if (msg.imageMessage) tipoMsg = 'imagem'
      else if (msg.videoMessage) tipoMsg = 'video'
      else if (msg.documentMessage) tipoMsg = 'documento'
      else if (msg.stickerMessage) tipoMsg = 'sticker'

      const rotuloMidia: Record<string, string> = {
        audio: '🎤 Áudio',
        imagem: '📷 Imagem',
        video: '🎬 Vídeo',
        documento: '📎 Documento',
        sticker: '💬 Figurinha',
      }

      const ts = Number(data.messageTimestamp) || 0
      const enviadoEm = ts > 0 ? new Date(ts * 1000).toISOString() : new Date().toISOString()

      // Texto do anuncio sem externalAdReply: registra o que veio, pra saber se a
      // Evolution entrega o anuncio neste formato (o log geral corta em 500).
      const anuncio = extrairAnuncio(data, msg)
      if (!fromMe && !anuncio && TEXTO_PRONTO_ANUNCIO.test(texto || '')) {
        console.log('📣 Anuncio sem externalAdReply:', JSON.stringify({
          contextInfo: data.contextInfo,
          tipos: Object.keys(msg || {}),
        }).slice(0, 1500))
      }

      await capturarLeadMensalli(supabase, {
        remoteJid,
        pushName,
        fromMe,
        texto: texto || rotuloMidia[tipoMsg] || '(sem texto)',
        tipo: tipoMsg,
        waMessageId: key.id || '',
        enviadoEm,
        anuncio,
      })

      // Dono de conta nova respondendo a boas-vindas. Erro aqui nunca derruba a
      // captura do lead, que ja foi gravada acima.
      if (!fromMe) {
        try {
          await tratarRespostaBoasVindas(supabase, {
            remoteJid,
            telefoneRemetente: telefoneDoRemetente(remoteJid, key, data),
            texto: texto || rotuloMidia[tipoMsg] || '(sem texto)',
            ehReacao: false,
          })
        } catch (e) {
          console.error('❌ boas-vindas:', e)
        }
      }

      return new Response(JSON.stringify({ ok: true, handled: 'mensalli_lead' }), {
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
      .select('plano, plano_pago, plano_vencimento, trial_fim, virou_pagante_em, cancelado_em, nome_empresa')
      .eq('id', userId)
      .single()

    if (usuarioErr) console.error('❌ Erro buscar usuário:', usuarioErr)

    // Gate por DATA, não por flag. `trial_ativo` (o gate antigo) nunca é
    // desligado quando o trial acaba, então contas vencidas seguiam com o bot
    // premium respondendo de graça. Mesma regra de usuario_pode_enviar() no
    // banco: quem já foi pagante é lido pelo plano_vencimento, quem nunca
    // pagou pelo trial_fim, e o dia do vencimento ainda vale.
    const dataLimite = usuario?.virou_pagante_em ? usuario?.plano_vencimento : usuario?.trial_fim
    const dentroDoPrazo = !!dataLimite
      && new Date(`${String(dataLimite).slice(0, 10)}T23:59:59`) >= new Date()

    console.log('👤 Usuário:', { plano: usuario?.plano, plano_pago: usuario?.plano_pago, dataLimite, dentroDoPrazo })

    if (!usuario || usuario.plano !== 'premium' || usuario.cancelado_em || !dentroDoPrazo) {
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
    // EXCETO: se existe NPS pendente pra algum dos devedores candidatos,
    // a captura de NPS tem prioridade sobre o estado "atendente".
    if (conversa.estado === 'atendente') {
      const agora = Date.now()
      const ultima = new Date(conversa.ultima_interacao).getTime()
      if (agora - ultima < 30 * 60 * 1000 && texto.toLowerCase() !== 'menu') {
        // Pre-check rápido: existe NPS pendente pra esse telefone?
        let temNpsPendente = false
        if (devedoresMatch.length > 0) {
          const { count } = await supabase
            .from('nps_respostas')
            .select('id', { count: 'exact', head: true })
            .eq('user_id', userId)
            .in('devedor_id', devedoresMatch.map((d: any) => d.id))
            .is('nota', null)
          temNpsPendente = (count || 0) > 0
        }

        if (!temNpsPendente) {
          await supabase
            .from('bot_conversas')
            .update({ ultima_interacao: new Date().toISOString() })
            .eq('id', conversa.id)
          return new Response(JSON.stringify({ ok: true, ignored: 'atendente_ativo' }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          })
        }
        // Tem NPS pendente → deixa passar pra captura de NPS processar
        console.log('⚡ Estado atendente, mas tem NPS pendente — prosseguindo pra captura')
      }
    }

    // ====== 5. Processar mensagem ======
    const textoLower = texto.toLowerCase().trim()
    const nomeEmpresa = usuario.nome_empresa || 'nossa equipe'
    let resposta = ''
    let mensagemExtra = ''
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
    // CAPTURA DE RESPOSTA DE NPS
    // Se algum devedor (entre os candidatos com esse telefone) tem
    // resposta NPS pendente, a próxima mensagem é interpretada como
    // resposta. Prioridade máxima — executa antes do fluxo normal.
    // Buscamos pra TODOS os devedores que batem com esse telefone
    // (cobre casos de múltiplos devedores com mesmo número).
    // ============================================================
    if (devedoresMatch.length > 0) {
      const idsCandidatos = devedoresMatch.map((d: any) => d.id)
      const { data: npsPendente } = await supabase
        .from('nps_respostas')
        .select('id, enviado_em, devedor_id')
        .eq('user_id', userId)
        .in('devedor_id', idsCandidatos)
        .is('nota', null)
        .order('enviado_em', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (npsPendente) {
        // Janela de 7 dias pra responder (depois disso ignora)
        const enviadoEm = new Date(npsPendente.enviado_em).getTime()
        const limiteMs = 7 * 24 * 60 * 60 * 1000
        const dentroJanela = (Date.now() - enviadoEm) < limiteMs

        if (dentroJanela) {
          // Tenta extrair nota 0-10 do texto
          // Procura 1º número de 0 a 10 na mensagem
          const match = texto.match(/\b(10|[0-9])\b/)
          const notaExtraida = match ? parseInt(match[1], 10) : null

          if (notaExtraida !== null && notaExtraida >= 0 && notaExtraida <= 10) {
            // Pega o devedor correto (o que tem a pendência, pode ser diferente do "devedor" principal)
            const devedorDaPendencia = devedoresMatch.find((d: any) => d.id === npsPendente.devedor_id) || devedor || { nome: 'Aluno' }
            const nomeDev = (devedorDaPendencia?.nome || 'Aluno').split(' ')[0]

            // Salva a resposta
            await supabase
              .from('nps_respostas')
              .update({
                nota: notaExtraida,
                comentario: texto,
                respondido_em: new Date().toISOString()
              })
              .eq('id', npsPendente.id)

            // Resposta de agradecimento, variando por faixa
            let agradecimento
            if (notaExtraida >= 9) {
              agradecimento = `Que ótimo, ${nomeDev}! 🎉\n\nFico muito feliz que você curtiu! Obrigado pela nota ${notaExtraida} — sua opinião é super importante pra nós. 💛`
            } else if (notaExtraida >= 7) {
              agradecimento = `Obrigado, ${nomeDev}! 😊\n\nAnotei sua nota ${notaExtraida}. Se tiver alguma sugestão do que podemos melhorar, só me mandar por aqui!`
            } else {
              agradecimento = `Obrigado pela sinceridade, ${nomeDev}. 🙏\n\nQueremos melhorar, e sua nota ${notaExtraida} é importante pra isso. Já repassei pro time que vai entrar em contato pra entender melhor.`
            }

            await enviarMensagem(evolutionUrl, evolutionKey, instanceName, telefone, agradecimento)

            // Notifica admin se nota baixa
            if (notaExtraida <= 6) {
              const { data: admin } = await supabase
                .from('usuarios')
                .select('telefone')
                .eq('id', userId)
                .single()
              if (admin?.telefone) {
                const telAdmin = normalizarTelefone(admin.telefone)
                const avisoAdmin = `⚠️ *NPS baixo recebido*\n\n👤 ${devedorDaPendencia?.nome || 'Aluno'}\n📱 ${telefone}\n⭐ Nota: ${notaExtraida}/10\n💬 "${texto.substring(0, 200)}"\n\n_Recomendo falar com esse aluno o quanto antes._`
                await enviarMensagem(evolutionUrl, evolutionKey, instanceName, telAdmin, avisoAdmin)
              }
            }

            await supabase
              .from('bot_conversas')
              .update({
                ultima_interacao: new Date().toISOString(),
              })
              .eq('id', conversa.id)

            return new Response(JSON.stringify({ ok: true, handled: 'nps', nota: notaExtraida }), {
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            })
          }
          // Se não tem nota válida, segue pro fluxo normal do bot
          // (o aluno pode ter mandado "oi" ou outra coisa; responderemos normalmente)
        }
      }
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
            // Buscar texto de apresentação customizado + slug de agendamento
            const { data: cfg } = await supabase
              .from('configuracoes_cobranca')
              .select('bot_texto_conhecer')
              .eq('user_id', userId)
              .maybeSingle()

            const { data: u } = await supabase
              .from('usuarios')
              .select('agendamento_slug, agendamento_ativo')
              .eq('id', userId)
              .single()

            const textoCustom = cfg?.bot_texto_conhecer?.trim()

            if (textoCustom) {
              // 1ª mensagem: apresentação customizada
              resposta = textoCustom.replace(/\{\{nomeEmpresa\}\}/g, nomeEmpresa)

              // 2ª mensagem (extra): pergunta + link de agendamento
              if (u?.agendamento_ativo && u?.agendamento_slug) {
                mensagemExtra = `Quer agendar uma aula experimental? 👉 ${APP_URL}/agendar/${u.agendamento_slug}`
              } else {
                mensagemExtra = `_Nossa equipe vai te chamar em breve pra marcar uma aula experimental!_ 😊`
              }
            } else {
              // Fallback: grade de horários (comportamento antigo)
              const horarios = await respostaHorarios(supabase, userId)
              let extra = ''
              if (u?.agendamento_ativo && u?.agendamento_slug) {
                extra = `\n\nQuer agendar uma aula? 👉 ${APP_URL}/agendar/${u.agendamento_slug}`
              }
              resposta = `Que ótimo! 😊 Aqui estão nossos horários:\n\n${horarios.replace('\n_Digite *0* para voltar ao menu._', '')}${extra}\n\n_Nossa equipe também vai te chamar em breve!_`
            }
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
    if (mensagemExtra) {
      await new Promise(r => setTimeout(r, 1200))
      console.log('📤 Enviando mensagem extra para:', telefone)
      await enviarMensagem(evolutionUrl, evolutionKey, instanceName, telefone, mensagemExtra)
      console.log('✅ Mensagem extra enviada')
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
