// Edge Function: worker da régua de cobrança
//
// Substitui o lote do n8n (workflow gdPzIzuqTqVNyCWx) por envio em ritmo,
// puxando de mensagens_fila. Motivo, medido em 20/08/26:
//
//   - O disparo em rajada das 9h matou SEIS contas no mesmo minuto e perdeu 34
//     mensagens. O Lucas Saulo entregou às 10:02 e caiu às 10:05, quando o lote
//     bateu. Não é queda espontânea: é o nosso próprio pico.
//   - O nó Code do n8n aborta em 300s. Naquele dia 16 mensagens ficaram como
//     'adiado_sem_tempo' e não saíram.
//   - Falha era sentença: sem nova tentativa no mesmo dia, o aluno não era
//     cobrado. Aqui, falha transitória volta para 'pendente' e sai na rodada
//     seguinte (ver concluir_fila).
//
// A fila já era montada às 8:45 por materializar_fila_dia; até agora ela só
// OBSERVAVA o n8n (reconciliar_fila). Esta função a faz COMANDAR.
//
// Chamada:
//   - pg_cron a cada 2 min na janela da manhã, sem body
//   - { dryRun: true }  -> não envia e não marca nada; devolve o texto que sairia
//   - { force: true }   -> ignora fila_worker_cfg.ativo (para teste manual)
//
// Nasce inerte: fila_worker_cfg.ativo = false e contas = allowlist do piloto.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { montarMensagem, normalizarTelefone, COLUNA_FLAG, type Alvo } from './render.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Orçamento por rodada. O runtime derruba a função por volta de 2 min; saímos
// antes para nunca deixar linha presa em 'enviando'.
const ORCAMENTO_MS = 90_000
const TIMEOUT_ENVIO_MS = 45_000
// Respiro entre mensagens da mesma rodada. O ritmo grosso vem do cron (2 min) e
// do teto por conta; isto só evita duas chamadas coladas na mesma instância.
const PAUSA_MS = 1_500


interface Veredito {
  ok: boolean
  transitoria: boolean
  erroCodigo: string | null
  erro: string | null
  httpStatus: number | null
  corpo: unknown
}

/** Classificação idêntica à de src/services/whatsappService.js, que já foi
 *  corrigida em produção. O n8n não tem isto, e foi por isso que aluno recebeu
 *  cobrança duplicada: 500 de pool esgotado é ENTREGA, não desconexão. */
function classificar(status: number, corpo: unknown, textoCru: string): Veredito {
  const s = `${textoCru} ${JSON.stringify(corpo ?? {})}`

  if (status >= 200 && status < 300) {
    return { ok: true, transitoria: false, erroCodigo: null, erro: null, httpStatus: status, corpo }
  }

  // A Evolution entrega ao WhatsApp e SÓ DEPOIS grava no banco dela. Com o pool
  // do Prisma esgotado ela devolve 500 com a mensagem já entregue. Reenviar
  // duplica a cobrança do aluno — então isto conclui a linha, não repete.
  if (status === 500 && /connection pool|PrismaClient|pris\.ly/i.test(s)) {
    return {
      ok: true, transitoria: false, erroCodigo: 'evolution_db_pool',
      erro: 'Evolution sem conexão de banco (pool esgotado) — mensagem provavelmente ENTREGUE',
      httpStatus: status, corpo,
    }
  }

  if (/Connection Closed/i.test(s)) {
    return {
      ok: false, transitoria: true, erroCodigo: 'connection_closed',
      erro: 'WhatsApp desconectado (Connection Closed)', httpStatus: status, corpo,
    }
  }

  // "exists": false — o WhatsApp diz que o número não existe. Não é veredito
  // confiável logo após pareamento (ver classificar_falha no banco), então
  // conta como transitória e ganha nova tentativa.
  if (/exists["\\\s:]*false/i.test(s)) {
    return {
      ok: false, transitoria: true, erroCodigo: 'numero_inexistente',
      erro: 'WhatsApp recusou o número', httpStatus: status, corpo,
    }
  }

  if (status >= 500) {
    return {
      ok: false, transitoria: true, erroCodigo: 'instance_500',
      erro: `Instância retornou ${status}`, httpStatus: status, corpo,
    }
  }

  return {
    ok: false, transitoria: true, erroCodigo: 'bad_request',
    erro: textoCru.slice(0, 300) || `HTTP ${status}`, httpStatus: status, corpo,
  }
}

async function executar(opts: { dryRun: boolean; force: boolean }) {
  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
  const inicio = Date.now()

  const { data: cfg } = await admin
    .from('fila_worker_cfg')
    .select('ativo, contas, max_por_rodada, max_por_conta_rodada')
    .eq('id', true)
    .maybeSingle()

  if (!cfg) return { pulou: 'sem configuração' }
  if (!cfg.ativo && !opts.force) return { pulou: 'worker desligado (fila_worker_cfg.ativo = false)' }

  const { data: alvos, error: erroClaim } = await admin.rpc('reivindicar_fila_lote', {
    p_limite: cfg.max_por_rodada ?? 20,
    p_por_conta: cfg.max_por_conta_rodada ?? 2,
    p_contas: cfg.contas ?? null,
  })

  if (erroClaim) {
    console.error('❌ claim falhou:', erroClaim.message)
    return { erro: erroClaim.message }
  }

  const lista = (alvos || []) as Alvo[]
  if (lista.length === 0) return { rodada: 'vazia' }

  const relatorio: Record<string, unknown>[] = []
  let enviadas = 0, falhadas = 0, devolvidas = 0

  for (const a of lista) {
    // Sem tempo: devolve para 'pendente' em vez de deixar preso em 'enviando'.
    if (Date.now() - inicio > ORCAMENTO_MS) {
      await admin.rpc('concluir_fila', {
        p_fila_id: a.fila_id, p_log_id: null, p_ok: false,
        p_transitoria: true, p_motivo: 'sem tempo nesta rodada',
      })
      devolvidas++
      continue
    }

    const mensagem = montarMensagem(a)
    const numero = normalizarTelefone(a.telefone)

    if (opts.dryRun) {
      relatorio.push({
        conta: a.nome_empresa, aluno: a.nome_cliente, janela: a.janela,
        telefone: numero, mensagem,
      })
      // Devolve a linha SEM passar por concluir_fila: aquela função incrementa
      // tentativas, e simular não pode gastar as tentativas de uma mensagem
      // real — algumas conferências seguidas a levariam a 'falhou' sozinha.
      await admin
        .from('mensagens_fila')
        .update({ estado: 'pendente', atualizado_em: new Date().toISOString() })
        .eq('id', a.fila_id)
      continue
    }

    if (!a.instance_name || !a.api_key || !a.api_url || !numero || !mensagem.trim()) {
      await admin.rpc('concluir_fila', {
        p_fila_id: a.fila_id, p_log_id: null, p_ok: false,
        p_transitoria: false, p_motivo: 'dados incompletos (instância, telefone ou texto)',
      })
      falhadas++
      continue
    }

    let veredito: Veredito
    try {
      const ctrl = new AbortController()
      const t = setTimeout(() => ctrl.abort(), TIMEOUT_ENVIO_MS)
      const resp = await fetch(`${a.api_url}/message/sendText/${a.instance_name}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: a.api_key },
        body: JSON.stringify({ number: numero, text: mensagem }),
        signal: ctrl.signal,
      })
      clearTimeout(t)
      const texto = await resp.text()
      let corpo: unknown = null
      try { corpo = JSON.parse(texto) } catch { corpo = { raw: texto.slice(0, 500) } }
      veredito = classificar(resp.status, corpo, texto)
    } catch (e) {
      veredito = {
        ok: false, transitoria: true, erroCodigo: 'timeout',
        erro: e instanceof Error ? e.message : String(e),
        httpStatus: null, corpo: null,
      }
    }

    // Log primeiro: a Central de Mensagens lê daqui, e mensagem entregue sem
    // log é pior que log sem mensagem.
    const { data: log } = await admin
      .from('logs_mensagens')
      .insert({
        user_id: a.user_id,
        devedor_id: a.devedor_id,
        mensalidade_id: a.mensalidade_id,
        telefone: a.telefone,
        mensagem,
        valor_mensalidade: a.valor,
        data_vencimento: a.data_vencimento,
        numero_parcela: null,
        status: veredito.ok ? 'enviado' : 'falha',
        erro: veredito.erro,
        erro_codigo: veredito.erroCodigo,
        http_status: veredito.httpStatus,
        response_api: veredito.corpo,
        tipo: a.tipo,
      })
      .select('id')
      .maybeSingle()

    if (veredito.ok) {
      const coluna = COLUNA_FLAG[a.janela]
      if (coluna) {
        await admin
          .from('mensalidades')
          .update({
            [coluna]: true,
            total_envios: (a.total_envios ?? 0) + 1,
            updated_at: new Date().toISOString(),
          })
          .eq('id', a.mensalidade_id)
      }
      enviadas++
    } else if (veredito.transitoria) {
      devolvidas++
    } else {
      falhadas++
    }

    await admin.rpc('concluir_fila', {
      p_fila_id: a.fila_id,
      p_log_id: log?.id ?? null,
      p_ok: veredito.ok,
      p_transitoria: veredito.transitoria,
      p_motivo: veredito.erroCodigo,
    })

    await new Promise((r) => setTimeout(r, PAUSA_MS))
  }

  const resumo = {
    reivindicadas: lista.length, enviadas, devolvidas, falhadas,
    dryRun: opts.dryRun, segundos: Math.round((Date.now() - inicio) / 1000),
    ...(opts.dryRun ? { previa: relatorio } : {}),
  }
  console.log('✅ worker da fila:', JSON.stringify({ ...resumo, previa: undefined }))
  return resumo
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  let body: { dryRun?: boolean; force?: boolean } = {}
  try { body = await req.json() } catch { /* cron chama sem body */ }

  const opts = { dryRun: !!body.dryRun, force: !!body.force }

  // dryRun responde na hora (é para conferência humana). O cron não espera.
  if (opts.dryRun) {
    const r = await executar(opts)
    return new Response(JSON.stringify(r), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  // @ts-ignore — EdgeRuntime é injetado pelo runtime do Supabase
  EdgeRuntime.waitUntil(
    executar(opts).catch((e) =>
      console.error('❌ erro no worker da fila:', e instanceof Error ? e.message : String(e))),
  )
  return new Response(
    JSON.stringify({ success: true, message: 'Rodada iniciada em background.' }),
    { status: 202, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  )
})
