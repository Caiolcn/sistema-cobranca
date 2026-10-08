// Helpers compartilhados das edge functions da Loja (Mensalli Vendas).
// Importado por loja-dados, loja-comprar, loja-pagar, loja-pedido-status,
// loja-escolher-turma e pelo ramo de pedido do asaas-webhook.
//
// É a primeira pasta _shared do projeto: as outras funções copiam helpers
// entre si. O deploy (`supabase functions deploy loja-comprar`) empacota
// este arquivo junto por ser import relativo.

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

export const erro = (code: string, mensagem: string, status = 400, extra: Record<string, unknown> = {}) =>
  json({ code, error: mensagem, ...extra }, status)

// ---------------------------------------------------------------- texto/validação

export const soDigitos = (v: unknown) => String(v ?? '').replace(/\D/g, '')

export const texto = (v: unknown, max = 200) => {
  const s = String(v ?? '').trim().slice(0, max)
  return s || null
}

export function dataNascimentoValida(v: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false
  const d = new Date(v + 'T12:00:00Z')
  if (isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== v) return false
  return d.getFullYear() >= 1900 && d <= new Date()
}

export function idadeEmAnos(v: string): number {
  const [a, m, d] = v.split('-').map(Number)
  const hoje = new Date()
  let anos = hoje.getFullYear() - a
  const mes = hoje.getMonth() + 1
  if (mes < m || (mes === m && hoje.getDate() < d)) anos--
  return anos
}

// Mesma validação de portal-pagar: Asaas exige cpfCnpj no customer.
export function isValidCpf(value: string): boolean {
  const cpf = (value || '').replace(/\D/g, '')
  if (cpf.length !== 11) return false
  if (/^(\d)\1{10}$/.test(cpf)) return false
  let soma = 0
  for (let i = 0; i < 9; i++) soma += parseInt(cpf[i]) * (10 - i)
  let d1 = 11 - (soma % 11)
  if (d1 >= 10) d1 = 0
  if (d1 !== parseInt(cpf[9])) return false
  soma = 0
  for (let i = 0; i < 10; i++) soma += parseInt(cpf[i]) * (11 - i)
  let d2 = 11 - (soma % 11)
  if (d2 >= 10) d2 = 0
  return d2 === parseInt(cpf[10])
}

// Data de HOJE no fuso de São Paulo (AAAA-MM-DD). `toISOString()` dava a data em UTC:
// uma compra às 21h no Brasil nascia com vencimento "amanhã".
export const hojeISO = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })

export const fmtBRL = (v: unknown) =>
  (parseFloat(String(v)) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

export const fmtData = (iso: string | null | undefined) =>
  iso ? new Date(String(iso).slice(0, 10) + 'T12:00:00').toLocaleDateString('pt-BR') : ''

// Próximo vencimento respeitando o ciclo do plano (porte de Financeiro.js).
// Dia inexistente no mês alvo cai no último dia do mês.
export function calcularProximoVencimento(dataVencimento: string, cicloCobranca?: string | null): string {
  const meses = ({ trimestral: 3, semestral: 6, anual: 12 } as Record<string, number>)[cicloCobranca || ''] || 1
  const atual = new Date(dataVencimento.slice(0, 10) + 'T00:00:00')
  const proximo = new Date(atual)
  proximo.setMonth(proximo.getMonth() + meses)
  if (proximo.getDate() !== atual.getDate()) proximo.setDate(0)
  const mes = String(proximo.getMonth() + 1).padStart(2, '0')
  const dia = String(proximo.getDate()).padStart(2, '0')
  return `${proximo.getFullYear()}-${mes}-${dia}`
}

export const novoToken = () => crypto.randomUUID().replace(/-/g, '')

export async function hashIp(req: Request): Promise<string> {
  const ip = req.headers.get('cf-connecting-ip')
    || (req.headers.get('x-forwarded-for') || '').split(',')[0].trim()
    || 'sem-ip'
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(ip))
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 32)
}

// ---------------------------------------------------------------- empresa + gate

export const CAMPOS_EMPRESA = `
  id, nome_empresa, logo_url, telefone, plano, plano_pago, plano_vencimento, trial_fim,
  virou_pagante_em, cancelado_em, agendamento_slug, agendamento_ativo,
  loja_ativa, loja_config, bio_config, landing_cor_primaria, landing_foto_capa_url,
  landing_descricao, landing_hero_subtitulo, instagram_url,
  landing_galeria, landing_faq, landing_depoimentos_manuais, landing_cta_final_titulo, landing_cta_final_subtitulo,
  asaas_api_key, asaas_ambiente, asaas_formas_pagamento, asaas_multa_juros, modo_integracao,
  endereco, numero, bairro, cidade, estado
`

export async function carregarEmpresaPorSlug(supabase: any, slug: string) {
  const { data } = await supabase
    .from('usuarios')
    .select(CAMPOS_EMPRESA)
    .eq('agendamento_slug', slug)
    .maybeSingle()
  return data
}

export async function carregarEmpresaPorId(supabase: any, id: string) {
  const { data } = await supabase.from('usuarios').select(CAMPOS_EMPRESA).eq('id', id).maybeSingle()
  return data
}

export const asaasConfigurado = (empresa: any) =>
  !!(empresa?.asaas_api_key && empresa?.modo_integracao === 'asaas')

// Gate da loja no servidor. Mesma regra por DATA de landing-dados: quem já foi
// pagante é lido pelo plano_vencimento; quem nunca pagou, pelo trial_fim.
// Retorna {ok:true} ou {ok:false, code, motivo}.
export async function gateLoja(supabase: any, empresa: any, opts: { exigirAsaas?: boolean } = {}) {
  if (!empresa) return { ok: false, code: 'nao_encontrada', motivo: 'Loja não encontrada' }

  const dataLimite = empresa.virou_pagante_em ? empresa.plano_vencimento : empresa.trial_fim
  const dentroDoPrazo = !!dataLimite && new Date(`${String(dataLimite).slice(0, 10)}T23:59:59`) >= new Date()
  const planoOk = ['pro', 'premium'].includes(String(empresa.plano || '').toLowerCase()) && !empresa.cancelado_em && dentroDoPrazo
  if (!planoOk) return { ok: false, code: 'plano', motivo: 'Loja indisponível' }

  const { data: temAddon } = await supabase.rpc('usuario_tem_addon', { p_user_id: empresa.id, p_addon: 'vendas' })
  if (!temAddon) return { ok: false, code: 'addon', motivo: 'Loja indisponível' }

  if (!empresa.loja_ativa) return { ok: false, code: 'inativa', motivo: 'Esta loja está fora do ar' }

  if (opts.exigirAsaas !== false && !asaasConfigurado(empresa)) {
    return { ok: false, code: 'asaas', motivo: 'Pagamento online indisponível no momento' }
  }
  return { ok: true as const }
}

// Seções da página (liga/desliga + conteúdo próprio). Espelho de normalizarSecoes()
// em src/pages/loja/lojaTema.js: mudou lá, muda aqui.
export function normalizarSecoes(raw: any) {
  const s = (raw && typeof raw === 'object') ? raw : {}
  const lista = (v: any, n: number) => (Array.isArray(v) ? v.slice(0, n) : [])
  return {
    como_funciona: s.como_funciona !== false,
    passos: lista(s.passos, 3).map((p: any) => String(p || '').trim()),
    resultados: s.resultados !== false,
    depoimentos: s.depoimentos !== false,
    depoimentos_manuais: lista(s.depoimentos_manuais, 3).filter((d: any) => d && d.texto),
    horarios: s.horarios !== false,
    faq: s.faq !== false,
    faq_itens: lista(s.faq_itens, 6).filter((f: any) => f && f.pergunta && f.resposta),
    sobre: s.sobre !== false,
    chamada_final: s.chamada_final !== false,
    chamada_titulo: String(s.chamada_titulo || '').trim(),
    chamada_texto: String(s.chamada_texto || '').trim(),
  }
}

// Conteúdo que a academia já tem no cadastro (antigo criador de site e bio) e a loja reaproveita
export function conteudoHerdado(empresa: any) {
  const bio = (empresa.bio_config && typeof empresa.bio_config === 'object') ? empresa.bio_config : {}
  const midias = Array.isArray(bio.midias) ? bio.midias : null
  const galeriaBio = midias ? midias.filter((m: any) => m && m.url && (m.tipo || 'foto') === 'foto').map((m: any) => m.url) : null
  const galeria = (galeriaBio && galeriaBio.length ? galeriaBio : (Array.isArray(empresa.landing_galeria) ? empresa.landing_galeria : [])).filter(Boolean).slice(0, 8)
  const faq = (Array.isArray(empresa.landing_faq) ? empresa.landing_faq : [])
    .filter((f: any) => f && (f.pergunta || f.q) && (f.resposta || f.a))
    .map((f: any) => ({ pergunta: f.pergunta || f.q, resposta: f.resposta || f.a })).slice(0, 6)
  const manuais = (Array.isArray(empresa.landing_depoimentos_manuais) ? empresa.landing_depoimentos_manuais : [])
    .filter((d: any) => d && d.comentario && String(d.comentario).trim().length >= 5)
    .map((d: any) => ({ nome: String(d.nome || 'Aluno(a)').trim(), texto: String(d.comentario).trim(), nota: d.nota || null })).slice(0, 3)
  return {
    galeria, faq, depoimentos_manuais: manuais,
    cta_titulo: empresa.landing_cta_final_titulo || null,
    cta_texto: empresa.landing_cta_final_subtitulo || null,
  }
}

// Dados públicos da empresa (mesmo formato que a bio consome em resolverBio)
export function empresaPublica(empresa: any) {
  const partes = [empresa.endereco, empresa.numero, empresa.bairro, empresa.cidade, empresa.estado].filter(Boolean)
  const cfg = (empresa.loja_config && typeof empresa.loja_config === 'object') ? empresa.loja_config : {}
  const formas = empresa.asaas_formas_pagamento || {}
  return {
    nome_empresa: empresa.nome_empresa,
    logo_url: empresa.logo_url,
    telefone: empresa.telefone,
    cor_primaria: empresa.landing_cor_primaria || '#344848',
    foto_capa_url: empresa.landing_foto_capa_url,
    descricao: empresa.landing_descricao,
    hero_subtitulo: empresa.landing_hero_subtitulo,
    instagram_url: empresa.instagram_url,
    endereco_completo: partes.join(', '),
    bairro: empresa.bairro || null,
    cidade: empresa.cidade || null,
    agendamento_slug: empresa.agendamento_slug,
    // Aula experimental online é exclusiva do Premium (mesma regra de landing-dados)
    agendamento_ativo: !!empresa.agendamento_ativo && String(empresa.plano).toLowerCase() === 'premium',
    bio: empresa.bio_config || null,
    loja: {
      titulo: cfg.titulo || null,
      frase: cfg.frase || null,
      boas_vindas: cfg.boas_vindas || null,
      suporte_whatsapp: cfg.suporte_whatsapp || empresa.telefone || null,
      retirada: cfg.retirada || null,
      aparencia: cfg.aparencia || { estilo: 'claro' },
      mostrar_experimental: cfg.mostrar_experimental !== false,
      secoes: normalizarSecoes(cfg.secoes),
    },
    formas_pagamento: { pix: true, cartao: formas.cartao === true, boleto: formas.boleto === true },
  }
}

// ---------------------------------------------------------------- Asaas

export const ASAAS_URLS: Record<string, string> = {
  sandbox: 'https://sandbox.asaas.com/api/v3',
  production: 'https://api.asaas.com/v3',
}

export const BILLING_TYPE: Record<string, string> = { pix: 'PIX', cartao: 'CREDIT_CARD', boleto: 'BOLETO' }

export function asaasCtx(empresa: any, supabaseUrl: string) {
  const ambiente = empresa.asaas_ambiente || 'sandbox'
  return {
    apiKey: empresa.asaas_api_key as string,
    baseUrl: ASAAS_URLS[ambiente] || ASAAS_URLS.sandbox,
    webhookUrl: `${supabaseUrl}/functions/v1/asaas-webhook`,
  }
}

// Garante o webhook de baixa automática na conta Asaas do gestor (cópia de portal-pagar).
export async function ensureWebhook(ctx: { apiKey: string; baseUrl: string; webhookUrl: string }) {
  try {
    const listResp = await fetch(`${ctx.baseUrl}/webhooks`, { headers: { 'access_token': ctx.apiKey } })
    if (listResp.ok) {
      const list = await listResp.json()
      const jaExiste = (list.data || []).some((wh: any) => wh.url === ctx.webhookUrl && wh.enabled === true)
      if (jaExiste) return
    }
    let email = ''
    try {
      const acc = await fetch(`${ctx.baseUrl}/myAccount`, { headers: { 'access_token': ctx.apiKey } })
      if (acc.ok) email = (await acc.json())?.email || ''
    } catch (_) { /* segue sem email */ }
    await fetch(`${ctx.baseUrl}/webhooks`, {
      method: 'POST',
      headers: { 'access_token': ctx.apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Mensalli', url: ctx.webhookUrl, email, enabled: true, interrupted: false, apiVersion: 3,
        sendType: 'SEQUENTIALLY',
        events: ['PAYMENT_CREATED', 'PAYMENT_RECEIVED', 'PAYMENT_CONFIRMED', 'PAYMENT_OVERDUE', 'PAYMENT_DELETED', 'PAYMENT_UPDATED', 'PAYMENT_REFUNDED'],
      }),
    })
  } catch (e) {
    console.error('⚠️ ensureWebhook falhou (não bloqueia):', e)
  }
}

export async function fetchPixQrCode(ctx: { apiKey: string; baseUrl: string }, paymentId: string) {
  try {
    const r = await fetch(`${ctx.baseUrl}/payments/${paymentId}/pixQrCode`, { headers: { 'access_token': ctx.apiKey } })
    if (r.ok) {
      const q = await r.json()
      return { encodedImage: q.encodedImage as string, payload: q.payload as string }
    }
  } catch (e) {
    console.error('⚠️ Erro ao buscar QR Pix:', e)
  }
  return null
}

export async function buscarPagamentoAsaas(ctx: { apiKey: string; baseUrl: string }, paymentId: string) {
  try {
    const r = await fetch(`${ctx.baseUrl}/payments/${paymentId}`, { headers: { 'access_token': ctx.apiKey } })
    if (r.ok) return await r.json()
  } catch (e) {
    console.error('⚠️ Erro ao consultar pagamento Asaas:', e)
  }
  return null
}

// Customer do Asaas para o devedor (cache em asaas_clientes, UNIQUE user_id+devedor_id).
export async function garantirCustomer(
  supabase: any, ctx: { apiKey: string; baseUrl: string },
  devedor: { id: string; user_id: string; nome: string; telefone: string | null },
  cpf: string,
): Promise<{ id?: string; erro?: string }> {
  const { data: cached } = await supabase
    .from('asaas_clientes')
    .select('asaas_customer_id')
    .eq('devedor_id', devedor.id)
    .eq('user_id', devedor.user_id)
    .maybeSingle()
  if (cached?.asaas_customer_id) return { id: cached.asaas_customer_id }

  const tel = soDigitos(devedor.telefone) || null
  const r = await fetch(`${ctx.baseUrl}/customers`, {
    method: 'POST',
    headers: { 'access_token': ctx.apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: devedor.nome, phone: tel, mobilePhone: tel, cpfCnpj: cpf, notificationDisabled: true }),
  })
  if (!r.ok) {
    const e = await r.json().catch(() => ({}))
    console.error('❌ Erro ao criar customer Asaas:', JSON.stringify(e))
    return { erro: e?.errors?.[0]?.description || 'Erro ao criar cliente no Asaas' }
  }
  const c = await r.json()
  await supabase.from('asaas_clientes').insert({
    user_id: devedor.user_id, devedor_id: devedor.id, asaas_customer_id: c.id,
    nome: devedor.nome, cpf_cnpj: cpf, telefone: devedor.telefone,
  })
  return { id: c.id }
}

export async function criarCobrancaAsaas(
  ctx: { apiKey: string; baseUrl: string },
  dados: { customer: string; metodo: string; valor: number; dueDate: string; descricao: string; externalReference: string },
): Promise<{ payment?: any; erro?: string }> {
  const r = await fetch(`${ctx.baseUrl}/payments`, {
    method: 'POST',
    headers: { 'access_token': ctx.apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      customer: dados.customer,
      billingType: BILLING_TYPE[dados.metodo] || 'PIX',
      value: Math.round(dados.valor * 100) / 100,
      dueDate: dados.dueDate,
      description: dados.descricao.slice(0, 250),
      externalReference: dados.externalReference,
    }),
  })
  if (!r.ok) {
    const e = await r.json().catch(() => ({}))
    console.error('❌ Erro ao criar cobrança Asaas:', JSON.stringify(e))
    return { erro: e?.errors?.[0]?.description || 'Erro ao gerar pagamento' }
  }
  return { payment: await r.json() }
}

// ---------------------------------------------------------------- WhatsApp (Evolution)

const EVOLUTION_URL_FALLBACK = 'https://service-evolution-api.tnvro1.easypanel.host'

export async function carregarCredenciaisEvolution(supabase: any) {
  const { data } = await supabase.from('config').select('chave, valor').in('chave', ['evolution_api_key', 'evolution_api_url'])
  const mapa: Record<string, string> = {}
  for (const l of data || []) mapa[l.chave] = l.valor
  return { apiKey: mapa.evolution_api_key || '', apiUrl: mapa.evolution_api_url || EVOLUTION_URL_FALLBACK }
}

export async function carregarInstancia(supabase: any, userId: string) {
  const { data } = await supabase.from('mensallizap').select('instance_name, conectado').eq('user_id', userId).maybeSingle()
  return data && data.conectado === true && data.instance_name ? (data.instance_name as string) : null
}

function formatarTelefoneBase(telefone: string) {
  let n = soDigitos(telefone)
  if (n && !n.startsWith('55')) n = '55' + n
  return n
}

function gerarVariantesNumero(telefone: string) {
  const numero = formatarTelefoneBase(telefone)
  const variantes = [numero]
  if (numero.startsWith('55') && numero.length >= 12) {
    const ddd = numero.substring(2, 4)
    const restante = numero.substring(4)
    if (restante.length === 9 && restante.startsWith('9')) variantes.push('55' + ddd + restante.substring(1))
    else if (restante.length === 8) variantes.push('55' + ddd + '9' + restante)
  }
  return variantes
}

export async function resolverNumeroWhatsApp(apiUrl: string, apiKey: string, instance: string, telefone: string) {
  const variantes = gerarVariantesNumero(telefone)
  if (variantes.length === 1) return variantes[0] + '@s.whatsapp.net'
  try {
    const r = await fetch(`${apiUrl}/chat/whatsappNumbers/${instance}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': apiKey },
      body: JSON.stringify({ numbers: variantes.map((n) => n + '@s.whatsapp.net') }),
      signal: AbortSignal.timeout(10000),
    })
    if (r.ok) {
      const res = await r.json()
      const lista = Array.isArray(res) ? res : (res?.response || [])
      const ok = lista.find((x: any) => x.exists === true)
      if (ok) {
        const n = ok.jid || ok.number
        return String(n).includes('@') ? n : n + '@s.whatsapp.net'
      }
    }
  } catch (e) {
    console.warn('⚠️ Falha ao verificar variantes:', (e as Error).message)
  }
  return variantes[0] + '@s.whatsapp.net'
}

// Envio simples com classificação de erro no mesmo mapa de erro_codigo do front.
export async function enviarTexto(apiUrl: string, apiKey: string, instance: string, numeroJid: string, textoMsg: string) {
  try {
    const r = await fetch(`${apiUrl}/message/sendText/${instance}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': apiKey },
      body: JSON.stringify({ number: numeroJid, text: textoMsg }),
      signal: AbortSignal.timeout(30000),
    })
    if (r.ok) return { sucesso: true, httpStatus: r.status, responseApi: await r.json() }
    const t = await r.text()
    let e: any = {}
    try { e = JSON.parse(t) } catch { /* não é JSON */ }
    const httpStatus = r.status
    const responseApi = Object.keys(e).length ? e : { raw: t }
    if (e.response?.message === 'Connection Closed' || t.includes('Connection Closed')) return { sucesso: false, erro: 'WhatsApp desconectado', erroCodigo: 'connection_closed', httpStatus, responseApi }
    if (httpStatus === 500) return { sucesso: false, erro: 'Instância retornou 500', erroCodigo: 'instance_500', httpStatus, responseApi }
    if (httpStatus === 404) return { sucesso: false, erro: 'Instância não encontrada', erroCodigo: 'instance_not_found', httpStatus, responseApi }
    if (httpStatus === 401 || httpStatus === 403) return { sucesso: false, erro: 'Credencial inválida', erroCodigo: 'auth_failed', httpStatus, responseApi }
    if (httpStatus === 400) return { sucesso: false, erro: 'Requisição inválida', erroCodigo: 'bad_request', httpStatus, responseApi }
    return { sucesso: false, erro: e.message || t || `HTTP ${httpStatus}`, erroCodigo: `http_${httpStatus}`, httpStatus, responseApi }
  } catch (err) {
    const e = err as Error
    if (e.name === 'AbortError' || e.name === 'TimeoutError') return { sucesso: false, erro: 'Timeout', erroCodigo: 'timeout', responseApi: { message: e.message } }
    return { sucesso: false, erro: e.message, erroCodigo: 'exception', responseApi: { message: e.message } }
  }
}

// Manda uma mensagem pela instância da conta e grava em logs_mensagens.
// Nunca lança: WhatsApp é best-effort, a venda já está feita.
export async function enviarWhatsAppConta(supabase: any, args: {
  userId: string; devedorId?: string | null; mensalidadeId?: string | null;
  tipo: string; telefone: string; mensagem: string;
}) {
  const logar = async (status: string, extra: any = {}) => {
    const { error } = await supabase.from('logs_mensagens').insert({
      user_id: args.userId, devedor_id: args.devedorId || null, mensalidade_id: args.mensalidadeId || null,
      tipo: args.tipo, mensagem: args.mensagem, status, telefone: args.telefone,
      erro: extra.erro || null, erro_codigo: extra.erroCodigo || (status === 'falha' ? 'unknown' : null),
      http_status: extra.httpStatus || null, response_api: extra.responseApi || null,
    })
    if (error) console.error('⚠️ logs_mensagens:', error.message)
  }
  try {
    if (!args.telefone) { await logar('falha', { erro: 'Sem telefone', erroCodigo: 'sem_telefone' }); return false }
    const [instance, cred] = await Promise.all([carregarInstancia(supabase, args.userId), carregarCredenciaisEvolution(supabase)])
    if (!instance) { await logar('falha', { erro: 'WhatsApp da conta desconectado', erroCodigo: 'conta_desconectada' }); return false }
    if (!cred.apiKey) { await logar('falha', { erro: 'Credencial Evolution ausente', erroCodigo: 'auth_failed' }); return false }
    const jid = await resolverNumeroWhatsApp(cred.apiUrl, cred.apiKey, instance, args.telefone)
    const r = await enviarTexto(cred.apiUrl, cred.apiKey, instance, jid, args.mensagem)
    await logar(r.sucesso ? 'enviado' : 'falha', r)
    return r.sucesso
  } catch (e) {
    try { await logar('falha', { erro: (e as Error).message, erroCodigo: 'exception' }) } catch { /* best-effort */ }
    return false
  }
}

// Aviso ao gestor (telefone da conta). Sem log em logs_mensagens: não é
// mensagem para aluno e não deve contar no uso do plano.
export async function avisarGestor(supabase: any, userId: string, telefoneGestor: string | null, mensagem: string) {
  try {
    const tel = soDigitos(telefoneGestor)
    if (!tel) return
    const [instance, cred] = await Promise.all([carregarInstancia(supabase, userId), carregarCredenciaisEvolution(supabase)])
    if (!instance || !cred.apiKey) return
    await enviarTexto(cred.apiUrl, cred.apiKey, instance, (tel.startsWith('55') ? tel : '55' + tel) + '@s.whatsapp.net', mensagem)
  } catch (e) {
    console.error('⚠️ avisarGestor:', e)
  }
}

// Template do gestor (customizado > padrão) ou fallback do código.
export async function carregarTemplate(supabase: any, userId: string, tipo: string): Promise<string | null> {
  const { data } = await supabase
    .from('templates')
    .select('mensagem, is_padrao')
    .eq('user_id', userId)
    .eq('tipo', tipo)
    .eq('ativo', true)
    .order('is_padrao', { ascending: true })
    .limit(1)
    .maybeSingle()
  return data?.mensagem || null
}

export function aplicarVariaveis(template: string, vars: Record<string, string>) {
  let out = template
  for (const [k, v] of Object.entries(vars)) out = out.split(`{{${k}}}`).join(v ?? '')
  // linhas que ficaram só com variável vazia somem
  return out.split('\n').filter((l) => !/^\s*[-•*]?\s*$/.test(l) || l.trim() === '').join('\n').replace(/\n{3,}/g, '\n\n').trim()
}

// ---------------------------------------------------------------- pedido público

export const CAMPOS_PEDIDO_PUBLICO = `
  id, token, status, tipo, item_nome, nome, telefone, valor, metodo, invoice_url, asaas_payment_id,
  produto_id, devedor_id, variacao, aula_ids, pago_em, created_at, user_id, contrato_enviado_id
`

export function pedidoPublico(p: any, extras: Record<string, unknown> = {}) {
  return {
    token: p.token, status: p.status, tipo: p.tipo, item_nome: p.item_nome, nome: p.nome,
    valor: Number(p.valor), metodo: p.metodo, invoice_url: p.invoice_url || null,
    variacao: p.variacao || null, aula_ids: p.aula_ids || [], pago_em: p.pago_em, created_at: p.created_at,
    ...extras,
  }
}
