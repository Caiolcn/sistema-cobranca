// Edge Function: Relatório diário de mensagens por e-mail
// ============================================================
// Manda, todo dia às 11h BRT (14h UTC), um e-mail com o resultado da rodagem
// da manhã: quantas mensagens saíram, quantas falharam, por que falharam, em
// quais contas, e o que NÃO saiu (fila barrada, instância offline).
//
// DUAS REGRAS DE PROJETO, as duas aprendidas em incidente:
//
// 1. ZERO chamadas à Evolution. Todo o dado já está em logs_mensagens e
//    mensagens_fila. Perguntar o estado para a Evolution foi a causa
//    comprovada das quedas em massa (sonda onWhatsApp 48x/dia levou a média
//    de 2,0 para 12,3 quedas/dia; 22 de 22 quedas com statusCode 401).
//    Nenhum relatório vale derrubar a sessão de um cliente.
//
// 2. Esta função não faz CONTA nenhuma. Todos os números vêm de uma única
//    chamada a relatorio_mensagens_dia(). Assim o número do e-mail e o número
//    da tela nunca divergem — o mesmo erro que fez o Resumo "X/Y" brigar com
//    o Histórico por meses.
//
// Chamada:
//   - pg_cron, sem body                 -> relatório de HOJE, envia e-mail
//   - { "dia": "2026-08-21" }           -> reprocessa um dia específico
//   - { "dryRun": true }                -> devolve o JSON e o HTML, NÃO envia
//   - { "to": "outro@email.com" }       -> sobrescreve o destinatário
//   - { "canal": "whatsapp" }           -> resumo curto pelo WhatsApp master
//                                          (cron das 12h BRT), em vez do e-mail
//
// Segredos necessários (supabase secrets set):
//   RESEND_API_KEY      chave da Resend
//   RELATORIO_EMAIL_TO  destinatário (aceita vários separados por vírgula)
//   RELATORIO_EMAIL_FROM (opcional) remetente verificado na Resend
//   RELATORIO_WHATSAPP_TO (opcional) número que recebe o resumo no WhatsApp.
//                       Sem ele, vai para o PRÓPRIO número conectado na
//                       instância master (ownerJid).
//
// Canal WhatsApp: são DUAS chamadas à Evolution, as duas só na instância
// master da Mensalli (ler o ownerJid e mandar o texto). Nenhuma instância de
// cliente é tocada — a regra 1 abaixo continua valendo.
// ============================================================

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')
const EMAIL_TO = Deno.env.get('RELATORIO_EMAIL_TO')
// onboarding@resend.dev funciona sem verificar domínio, mas só entrega para o
// e-mail dono da conta Resend. Para entregar em qualquer caixa, verifique
// mensalli.com.br na Resend e troque este segredo.
const EMAIL_FROM = Deno.env.get('RELATORIO_EMAIL_FROM') || 'Mensalli <onboarding@resend.dev>'
const WHATSAPP_TO = Deno.env.get('RELATORIO_WHATSAPP_TO')

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Limiares do bloco "exige ação". Acima disso o e-mail abre com alerta em vez
// de abrir com os números — para o dia ruim não parecer com o dia normal.
const PCT_FALHA_ALERTA = 15      // % de falha real que já merece olhar
const FALHAS_CONTA_MORTA = 3     // falhas numa conta com ZERO envio = instância morta
// Fração da média do MESMO DIA DA SEMANA abaixo da qual o volume vira alerta.
//
// Tem que ser o mesmo dia da semana, não a média geral: domingo roda a ~20% de
// um dia útil (medido — razão 0,17 e 0,34 nos dois últimos domingos, contra
// 0,82-0,96 no sábado). Comparado com a média geral, TODO domingo acusaria
// queda; comparado com os domingos anteriores, 23/08 sai em 0,79 e 27/08
// (quinta) em 0,98. Um alarme que toca todo domingo ensina a ignorar o e-mail.
//
// 0,35 deixa margem sobre o pior domingo real (0,42) e ainda pega uma rodagem
// que não saiu, que cai perto de zero. Queda parcial por instância caída já é
// pega pelo alerta por conta, abaixo.
const QUEDA_VOLUME = 0.35

// to_char(..., 'Dy') sai em inglês independente do locale do banco.
const DIA_SEMANA: Record<string, string> = {
  Mon: 'segundas', Tue: 'terças', Wed: 'quartas', Thu: 'quintas',
  Fri: 'sextas', Sat: 'sábados', Sun: 'domingos',
}

interface Relatorio {
  dia: string
  dia_semana: string
  resumo: Record<string, number | null>
  comparativo: {
    media_total: number | null
    media_falhas: number | null
    media_dia_semana: number | null   // média do MESMO dia da semana, 28 dias
  } | null
  motivos: Array<{ classe: string; codigo: string; qtd: number; exemplo: string | null }>
  contas: Array<{ conta: string; enviadas: number; falhas: number; motivo_top: string }>
  fila: Record<string, number>
  barradas_offline: number
  avisos: string[]
}

const esc = (s: unknown): string =>
  String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

function formatarData(iso: string): string {
  const [ano, mes, dia] = iso.split('-')
  return `${dia}/${mes}/${ano}`
}

// Rótulos de negócio para as classes técnicas. O e-mail é lido de manhã, no
// celular — "permanente" não diz nada; "número não existe no WhatsApp" diz.
const ROTULO_CLASSE: Record<string, string> = {
  transitoria:   'Infraestrutura (reenvio resolve)',
  permanente:    'Cadastro: número não existe no WhatsApp',
  config:        'Credencial/instância inválida (nosso)',
  indeterminada: 'Motivo não informado pelo provedor',
  nao_tentada:   'Nunca tentada (lote abortado)',
  sem_classe:    'Sem classificação',
}

const ROTULO_FILA: Record<string, string> = {
  barrada:  'Barradas (WhatsApp desconectado no disparo)',
  expirada: 'Expiradas (passou da janela sem enviar)',
  falhou:   'Falharam no worker',
  enviando: 'Presas em "enviando"',
}

/** Monta a lista de coisas que exigem ação humana hoje. Vazia = dia bom. */
function montarAlertas(r: Relatorio): string[] {
  const alertas: string[] = []
  const pct = Number(r.resumo.pct_falha ?? 0)
  const total = Number(r.resumo.total_registros ?? 0)
  const refDow = Number(r.comparativo?.media_dia_semana ?? 0)

  // O silêncio é o pior estado: se a rodagem das 9h morrer inteira, não há
  // falha para contar e o relatório sairia dizendo "nada exige ação" com zero
  // enviado. Volume ausente ou muito abaixo do normal é alerta por si só —
  // foi assim que a PAINEIRAS passou 17 dias sem enviar nada sem ninguém ver.
  if (total === 0) {
    alertas.push('NENHUMA mensagem registrada no dia — a rodagem das 9h provavelmente não aconteceu.')
  } else if (refDow > 0 && total < refDow * QUEDA_VOLUME) {
    alertas.push(`Volume de ${total} registros contra média de ${refDow} nos últimos ${DIA_SEMANA[r.dia_semana] || 'dias equivalentes'} — queda de ${Math.round((1 - total / refDow) * 100)}%. Pode ter faltado disparo.`)
  }

  if (pct >= PCT_FALHA_ALERTA) {
    alertas.push(`Taxa de falha em ${pct}% — acima do limiar de ${PCT_FALHA_ALERTA}%.`)
  }

  // Conta que não entregou NADA e falhou várias vezes não é número errado:
  // é a instância dela fora do ar. Foi assim que a PAINEIRAS ficou 17 dias
  // sem ninguém ver.
  for (const c of r.contas) {
    if (c.enviadas === 0 && c.falhas >= FALHAS_CONTA_MORTA) {
      alertas.push(`"${c.conta}": ${c.falhas} falhas e NENHUM envio (${c.motivo_top}) — provável instância fora do ar.`)
    }
  }

  if (r.barradas_offline > 0) {
    alertas.push(`${r.barradas_offline} parcela(s) barradas por WhatsApp offline — não entraram na régua, não geraram log.`)
  }

  const presas = Number(r.fila.enviando || 0)
  if (presas > 0) alertas.push(`${presas} mensagem(ns) presas em "enviando" — worker pode ter morrido no meio.`)

  for (const a of r.avisos || []) alertas.push(a)

  return alertas
}

function montarHtml(r: Relatorio, alertas: string[]): string {
  const res = r.resumo
  const pct = Number(res.pct_falha ?? 0)
  const mediaFalhas = Number(r.comparativo?.media_falhas ?? 0)
  const falhas = Number(res.falhas_reais ?? 0)

  // Comparação com a média de 7 dias: o número sozinho não diz se hoje foi bom.
  let tendencia = ''
  if (mediaFalhas > 0) {
    const delta = falhas - mediaFalhas
    const sinal = delta > 0 ? '▲' : delta < 0 ? '▼' : '='
    const cor = delta > 0 ? '#b42318' : '#067647'
    tendencia = `<span style="color:${cor};font-weight:600">${sinal} ${Math.abs(delta).toFixed(1)}</span>
      <span style="color:#667085">vs. média de 7 dias (${mediaFalhas})</span>`
  }

  const card = (rotulo: string, valor: unknown, cor: string) => `
    <td style="padding:14px 16px;background:#f9fafb;border:1px solid #eaecf0;border-radius:8px;text-align:center">
      <div style="font-size:26px;font-weight:700;color:${cor};line-height:1.1">${esc(valor)}</div>
      <div style="font-size:11px;color:#667085;text-transform:uppercase;letter-spacing:.4px;margin-top:4px">${esc(rotulo)}</div>
    </td>`

  const blocoAlertas = alertas.length
    ? `<div style="background:#fef3f2;border:1px solid #fda29b;border-radius:8px;padding:14px 16px;margin:0 0 22px">
         <div style="font-weight:700;color:#b42318;font-size:14px;margin-bottom:8px">Exige atenção</div>
         <ul style="margin:0;padding-left:18px;color:#912018;font-size:13px;line-height:1.6">
           ${alertas.map((a) => `<li>${esc(a)}</li>`).join('')}
         </ul>
       </div>`
    : `<div style="background:#ecfdf3;border:1px solid #abefc6;border-radius:8px;padding:12px 16px;margin:0 0 22px;color:#067647;font-size:13px;font-weight:600">
         Nada exige ação hoje.
       </div>`

  const linhasMotivos = r.motivos.length
    ? r.motivos.map((m) => `
        <tr>
          <td style="padding:9px 10px;border-bottom:1px solid #eaecf0;font-size:13px">${esc(ROTULO_CLASSE[m.classe] || m.classe)}</td>
          <td style="padding:9px 10px;border-bottom:1px solid #eaecf0;font-size:12px;font-family:ui-monospace,Menlo,monospace;color:#475467">${esc(m.codigo)}</td>
          <td style="padding:9px 10px;border-bottom:1px solid #eaecf0;font-size:13px;text-align:right;font-weight:600">${m.qtd}</td>
        </tr>
        <tr><td colspan="3" style="padding:0 10px 9px;border-bottom:1px solid #eaecf0;font-size:11px;color:#667085;font-family:ui-monospace,Menlo,monospace;word-break:break-all">${esc(m.exemplo || '')}</td></tr>`).join('')
    : `<tr><td colspan="3" style="padding:12px 10px;font-size:13px;color:#667085">Nenhuma falha.</td></tr>`

  const linhasContas = r.contas.length
    ? r.contas.map((c) => `
        <tr>
          <td style="padding:9px 10px;border-bottom:1px solid #eaecf0;font-size:13px">${esc(c.conta)}</td>
          <td style="padding:9px 10px;border-bottom:1px solid #eaecf0;font-size:13px;text-align:right;color:#067647">${c.enviadas}</td>
          <td style="padding:9px 10px;border-bottom:1px solid #eaecf0;font-size:13px;text-align:right;color:#b42318;font-weight:600">${c.falhas}</td>
          <td style="padding:9px 10px;border-bottom:1px solid #eaecf0;font-size:12px;font-family:ui-monospace,Menlo,monospace;color:#475467">${esc(c.motivo_top)}</td>
        </tr>`).join('')
    : `<tr><td colspan="4" style="padding:12px 10px;font-size:13px;color:#667085">Nenhuma conta com falha.</td></tr>`

  const itensFila = Object.entries(r.fila || {})
  const blocoFila = `
    <h3 style="font-size:14px;color:#101828;margin:26px 0 4px">Não chegou a virar mensagem</h3>
    <p style="font-size:12px;color:#667085;margin:0 0 10px">O log só registra o que foi tentado. Isto aqui é o que nem tentou.</p>
    <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">
      ${itensFila.length
        ? itensFila.map(([estado, qtd]) => `
          <tr>
            <td style="padding:9px 10px;border-bottom:1px solid #eaecf0;font-size:13px">${esc(ROTULO_FILA[estado] || estado)}</td>
            <td style="padding:9px 10px;border-bottom:1px solid #eaecf0;font-size:13px;text-align:right;font-weight:600">${qtd}</td>
          </tr>`).join('')
        : `<tr><td style="padding:12px 10px;font-size:13px;color:#667085">Fila limpa.</td></tr>`}
      <tr>
        <td style="padding:9px 10px;border-bottom:1px solid #eaecf0;font-size:13px">Parcelas barradas por WhatsApp offline (agora)</td>
        <td style="padding:9px 10px;border-bottom:1px solid #eaecf0;font-size:13px;text-align:right;font-weight:600;color:${r.barradas_offline > 0 ? '#b42318' : '#101828'}">${r.barradas_offline}</td>
      </tr>
    </table>`

  const th = 'padding:8px 10px;background:#f9fafb;border-bottom:1px solid #eaecf0;font-size:11px;color:#667085;text-transform:uppercase;letter-spacing:.4px;text-align:left'

  return `<!doctype html>
<html><body style="margin:0;padding:24px 12px;background:#f2f4f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:640px;margin:0 auto;background:#fff;border-radius:12px;border:1px solid #eaecf0">
<tr><td style="padding:26px 26px 22px">

  <div style="font-size:11px;color:#667085;text-transform:uppercase;letter-spacing:.6px">Mensalli · Relatório diário</div>
  <h1 style="font-size:21px;color:#101828;margin:5px 0 2px">Mensagens de ${formatarData(r.dia)}</h1>
  <div style="font-size:12px;color:#667085;margin-bottom:22px">Fechamento após a rodagem das 9h. ${tendencia}</div>

  ${blocoAlertas}

  <table width="100%" cellpadding="0" cellspacing="6" style="border-collapse:separate;margin-bottom:8px"><tr>
    ${card('Enviadas', res.enviadas, '#067647')}
    ${card('Falhas reais', res.falhas_reais, falhas > 0 ? '#b42318' : '#101828')}
    ${card('% falha', `${pct}%`, pct >= PCT_FALHA_ALERTA ? '#b42318' : '#101828')}
  </tr></table>
  <table width="100%" cellpadding="0" cellspacing="6" style="border-collapse:separate"><tr>
    ${card('Infra', res.falha_infra, '#101828')}
    ${card('Cadastro', res.falha_cadastro, '#101828')}
    ${card('Entregues (JID alt.)', res.entregues_jid_alt, '#101828')}
  </tr></table>

  <h3 style="font-size:14px;color:#101828;margin:26px 0 4px">Por que falharam</h3>
  <p style="font-size:12px;color:#667085;margin:0 0 10px">"Infraestrutura" reenvia sozinho. "Cadastro" precisa de alguém corrigir o telefone.</p>
  <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">
    <tr><th style="${th}">Classe</th><th style="${th}">Código</th><th style="${th};text-align:right">Qtd</th></tr>
    ${linhasMotivos}
  </table>

  <h3 style="font-size:14px;color:#101828;margin:26px 0 4px">Contas com falha</h3>
  <p style="font-size:12px;color:#667085;margin:0 0 10px">Muitas falhas com zero envio = instância caída, não número errado.</p>
  <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">
    <tr><th style="${th}">Conta</th><th style="${th};text-align:right">OK</th><th style="${th};text-align:right">Falhas</th><th style="${th}">Motivo</th></tr>
    ${linhasContas}
  </table>

  ${blocoFila}

  <p style="font-size:11px;color:#98a2b3;margin:26px 0 0;border-top:1px solid #eaecf0;padding-top:14px">
    Gerado por <code>relatorio-mensagens</code> · fonte: logs_mensagens + mensagens_fila · nenhuma chamada à Evolution.
  </p>

</td></tr></table></body></html>`
}

function montarTexto(r: Relatorio, alertas: string[]): string {
  const res = r.resumo
  const l: string[] = [
    `Mensalli - Mensagens de ${formatarData(r.dia)}`,
    '',
    `Enviadas: ${res.enviadas}   Falhas: ${res.falhas_reais} (${res.pct_falha}%)`,
    `Infra: ${res.falha_infra}   Cadastro: ${res.falha_cadastro}   Entregues via JID alt.: ${res.entregues_jid_alt}`,
    '',
  ]
  if (alertas.length) {
    l.push('EXIGE ATENCAO:', ...alertas.map((a) => `  - ${a}`), '')
  } else {
    l.push('Nada exige acao hoje.', '')
  }
  if (r.motivos.length) {
    l.push('Por que falharam:')
    for (const m of r.motivos) l.push(`  ${m.qtd}x  ${ROTULO_CLASSE[m.classe] || m.classe} [${m.codigo}]`)
    l.push('')
  }
  if (r.contas.length) {
    l.push('Contas com falha:')
    for (const c of r.contas) l.push(`  ${c.conta}: ${c.enviadas} ok / ${c.falhas} falhas (${c.motivo_top})`)
    l.push('')
  }
  l.push(`Parcelas barradas por WhatsApp offline: ${r.barradas_offline}`)
  return l.join('\n')
}

// ------------------------------------------------------------
// Canal WhatsApp
// ------------------------------------------------------------

interface Falha {
  conta: string
  aluno: string | null
  telefone: string | null
  classe: string
  codigo: string
  recuperada: boolean
}

// Rótulo curto por classe — a linha do WhatsApp tem que caber na tela.
const ROTULO_CURTO: Record<string, string> = {
  transitoria:   'instabilidade',
  permanente:    'número não existe no WhatsApp',
  config:        'credencial/instância inválida',
  indeterminada: 'motivo não informado',
}

// Num dia de instância caída são centenas de falhas; a mensagem não pode
// virar um rolo. Até N nomes por conta e M linhas no total, o resto em "+X".
const NOMES_POR_CONTA = 5
const LINHAS_MAX = 30

function formatarTelefone(t: string | null): string {
  let n = String(t || '').replace(/\D/g, '')
  if (n.startsWith('55') && n.length >= 12) n = n.slice(2)
  if (n.length === 11) return `(${n.slice(0, 2)}) ${n.slice(2, 7)}-${n.slice(7)}`
  if (n.length === 10) return `(${n.slice(0, 2)}) ${n.slice(2, 6)}-${n.slice(6)}`
  return n || 'sem telefone'
}

function montarWhatsapp(r: Relatorio, falhas: Falha[], alertas: string[]): string {
  const res = r.resumo
  const total = Number(res.falhas_reais ?? 0)
  const l: string[] = [`📊 *Mensalli · Mensagens de ${formatarData(r.dia)}*`, '']

  l.push(`✅ ${res.enviadas} enviadas`)
  if (total === 0) {
    l.push('Nenhuma falha. 👍')
  } else {
    const recuperadas = falhas.filter((f) => f.recuperada).length
    l.push(`❌ ${total} falharam (${String(res.pct_falha).replace('.', ',')}%)`)
    if (recuperadas > 0) l.push(`↩️ ${recuperadas} já receberam depois, no reenvio`)
  }

  if (alertas.length) {
    l.push('', '⚠️ *Atenção*')
    for (const a of alertas) l.push(`• ${a}`)
  }

  // Só quem AINDA não recebeu. Quem foi recuperado já está no número acima.
  // Agrupa por pessoa: o retry gera várias falhas para o mesmo aluno, e listar
  // "Célia, Alisson, Célia, Alisson" esconde quantas pessoas ficaram sem mensagem.
  const pendentes = falhas.filter((f) => !f.recuperada)
  if (pendentes.length) {
    const porConta = new Map<string, Map<string, Falha & { vezes: number }>>()
    for (const f of pendentes) {
      if (!porConta.has(f.conta)) porConta.set(f.conta, new Map())
      const pessoas = porConta.get(f.conta)!
      const chave = String(f.telefone || '').replace(/\D/g, '') || `nome:${f.aluno}`
      const atual = pessoas.get(chave)
      if (atual) atual.vezes++
      else pessoas.set(chave, { ...f, vezes: 1 })
    }

    l.push('', '*Quem não recebeu*')
    let linhas = 0
    let omitidas = 0
    // Conta com mais gente sem mensagem primeiro: é onde está o problema.
    const contas = [...porConta.entries()]
      .map(([conta, m]) => [conta, [...m.values()]] as const)
      .sort((a, b) => b[1].length - a[1].length)
    for (const [conta, lista] of contas) {
      if (linhas >= LINHAS_MAX) { omitidas += lista.length; continue }
      l.push('', `🏢 *${conta}* — ${lista.length} aluno(s)`)
      const mostrar = lista.slice(0, Math.min(NOMES_POR_CONTA, LINHAS_MAX - linhas))
      for (const f of mostrar) {
        const vezes = f.vezes > 1 ? ` (${f.vezes}x)` : ''
        l.push(`• ${f.aluno || 'sem nome'} — ${formatarTelefone(f.telefone)} — ${ROTULO_CURTO[f.classe] || f.codigo}${vezes}`)
      }
      linhas += mostrar.length
      if (lista.length > mostrar.length) l.push(`  _+${lista.length - mostrar.length} desta conta_`)
    }
    if (omitidas > 0) l.push('', `_+${omitidas} aluno(s) em outras contas — detalhes no e-mail das 11h._`)
  }

  return l.join('\n')
}

/** Credenciais da Evolution, mesma leitura do whatsapp-health-check. */
async function configEvolution(supabase: ReturnType<typeof createClient>) {
  const { data } = await supabase
    .from('config')
    .select('chave, valor')
    .in('chave', ['evolution_api_key', 'evolution_api_url', 'evolution_master_instance'])
  const m: Record<string, string> = {}
  data?.forEach((c: { chave: string; valor: string }) => { m[c.chave] = c.valor })
  return {
    apiKey: m.evolution_api_key,
    apiUrl: m.evolution_api_url || 'https://service-evolution-api.tnvro1.easypanel.host',
    master: m.evolution_master_instance || 'mensalli_master',
  }
}

async function enviarWhatsapp(
  supabase: ReturnType<typeof createClient>,
  texto: string,
  destinoForcado: string | null,
): Promise<{ enviado: boolean; destino?: string; motivo?: string }> {
  const { apiKey, apiUrl, master } = await configEvolution(supabase)
  if (!apiKey) return { enviado: false, motivo: 'evolution_api_key não configurada na tabela config' }

  // Destino: o próprio número conectado no master (de mim para mim), salvo
  // se um número for passado no body ou no segredo.
  let destino = destinoForcado
  if (!destino) {
    const r = await fetch(`${apiUrl}/instance/fetchInstances?instanceName=${encodeURIComponent(master)}`, {
      headers: { apikey: apiKey },
    })
    if (!r.ok) return { enviado: false, motivo: `fetchInstances HTTP ${r.status}` }
    const d = await r.json()
    const i = (Array.isArray(d) ? d : [d])[0]
    // Versões antigas da Evolution aninhavam em .instance (ver AdminWhatsAppMaster.js).
    const estado = i?.connectionStatus || i?.instance?.status
    destino = i?.ownerJid || i?.instance?.owner || null
    if (estado && estado !== 'open') return { enviado: false, motivo: `instância master "${master}" está ${estado}` }
    if (!destino) return { enviado: false, motivo: `instância master "${master}" sem número conectado` }
  }
  const number = destino.includes('@') ? destino : `${destino.replace(/\D/g, '')}@s.whatsapp.net`

  const resp = await fetch(`${apiUrl}/message/sendText/${master}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: apiKey },
    body: JSON.stringify({ number, text: texto }),
  })
  if (resp.ok) return { enviado: true, destino: number }
  const corpo = await resp.text().catch(() => '')
  return { enviado: false, destino: number, motivo: `sendText HTTP ${resp.status}: ${corpo.slice(0, 200)}` }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const body = await req.json().catch(() => ({}))
    const dia: string | null = body?.dia ?? null
    const dryRun: boolean = body?.dryRun === true
    const destino: string = body?.to || EMAIL_TO || ''

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    // Única leitura do banco na execução inteira.
    const { data, error } = await supabase.rpc('relatorio_mensagens_dia', { p_dia: dia })
    if (error) throw new Error(`RPC relatorio_mensagens_dia falhou: ${error.message}`)

    const relatorio = data as Relatorio
    const alertas = montarAlertas(relatorio)

    if (body?.canal === 'whatsapp') {
      const { data: falhas, error: errF } = await supabase.rpc('relatorio_mensagens_falhas_dia', { p_dia: dia })
      if (errF) throw new Error(`RPC relatorio_mensagens_falhas_dia falhou: ${errF.message}`)
      const texto = montarWhatsapp(relatorio, (falhas || []) as Falha[], alertas)

      if (dryRun) {
        return new Response(JSON.stringify({ dryRun: true, canal: 'whatsapp', texto }), {
          status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      // Mesmo critério do e-mail: 200 com enviado:false para o cron não
      // ficar em retry, mas dizendo por que não saiu.
      const r = await enviarWhatsapp(supabase, texto, body?.to || WHATSAPP_TO || null)
      return new Response(JSON.stringify({ canal: 'whatsapp', ...r, resumo: relatorio.resumo }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const html = montarHtml(relatorio, alertas)
    const texto = montarTexto(relatorio, alertas)

    const res = relatorio.resumo
    const assunto = alertas.length
      ? `[ATENCAO] Mensagens ${formatarData(relatorio.dia)}: ${res.enviadas} ok, ${res.falhas_reais} falhas (${res.pct_falha}%)`
      : `Mensagens ${formatarData(relatorio.dia)}: ${res.enviadas} ok, ${res.falhas_reais} falhas (${res.pct_falha}%)`

    if (dryRun) {
      return new Response(JSON.stringify({ dryRun: true, assunto, alertas, relatorio, html }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Falta de configuração não pode passar por "enviado". Devolve 200 com
    // enviado:false para o cron não ficar em retry, mas diz o que falta.
    if (!RESEND_API_KEY || !destino) {
      return new Response(JSON.stringify({
        enviado: false,
        motivo: !RESEND_API_KEY
          ? 'RESEND_API_KEY não configurada'
          : 'RELATORIO_EMAIL_TO não configurado (ou passe { "to": "..." })',
        assunto, alertas, relatorio,
      }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const resp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: EMAIL_FROM,
        to: destino.split(',').map((e) => e.trim()).filter(Boolean),
        subject: assunto,
        html,
        text: texto,
      }),
    })
    const respBody = await resp.json().catch(() => null)

    return new Response(JSON.stringify({
      enviado: resp.ok,
      status: resp.status,
      resend: respBody,
      assunto,
      alertas,
      resumo: relatorio.resumo,
    }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

  } catch (err) {
    return new Response(JSON.stringify({ enviado: false, erro: String(err) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
