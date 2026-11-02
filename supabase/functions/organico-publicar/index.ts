// Edge Function: organico-publicar
// ---------------------------------------------------------------------------
// Publica no Instagram, sozinho, o post de FEED (reel, carrossel até 10, foto)
// que o dono APROVOU na tela, quando chega a data/hora planejada (BRT).
// Stories não: continuam manuais.
//
// Roda pelo cron a cada 5 min. Não faz NADA se:
//   - o interruptor "Publicação automática" da marca (organico_marcas.publicacao_ativa)
//     estiver desligado — ele nasce desligado;
//   - o post não tiver aprovado_em;
//   - o post já tiver postado_em (o dono postou na mão) ou publicado_em.
//
// Como a Meta publica (2 passos):
//   1. cria o "container" com o link da mídia (link assinado do bucket privado,
//      válido por 24h) e a legenda;
//   2. quando o container fica FINISHED (vídeo pode levar minutos), chama
//      media_publish. Entre um passo e outro o estado fica no banco e o cron
//      seguinte continua de onde parou.
//
// Envio único: publicando_em (passo 1) e publicar_chamado_em (passo 2) são
// carimbos gravados com "WHERE ... IS NULL" — duas execuções ao mesmo tempo
// não publicam duas vezes. Se der erro, grava publicacao_erro e PARA: não tenta
// de novo sozinho. O dono vê o erro na tela e clica "Tentar de novo".
//
// Atrasou mais de 3h (cron parado, interruptor ligado tarde)? Não publica:
// marca erro "passou do horário" para o dono decidir.
//
// Publicar SEM --no-verify-jwt.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { adminClient, autorizadoAdminOuCron, corsHeaders, graph, json, registrarExecucao, tokenDaMarca } from '../_shared/organico.ts'

const BUCKET = 'organico'
const VALIDADE_LINK = 24 * 3600            // segundos
const JANELA_ATRASO_MS = 3 * 3600 * 1000   // publica até 3h depois do horário
const LIMITE_PROCESSANDO_MS = 45 * 60 * 1000
const MAX_NOVOS_POR_RODADA = 3
const TIPOS_FEED = ['reel', 'carrossel', 'foto']

const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms))

type SB = ReturnType<typeof adminClient>

export function montarLegenda(p: any): string {
  return [p.legenda, p.hashtags].filter((x) => x && String(x).trim()).join('\n\n').trim()
}

// Mesmas regras que a tela usa para liberar o botão "Aprovar".
function problemas(p: any, arquivos: any[]): string[] {
  const out: string[] = []
  const legenda = montarLegenda(p)
  const midia = arquivos.filter((a) => a.tipo !== 'capa')
  if (!p.planejado_para) out.push('sem horário planejado')
  if (!legenda) out.push('sem legenda')
  if (legenda.length > 2200) out.push('legenda acima de 2.200 caracteres')
  if ((legenda.match(/#[\p{L}\p{N}_]+/gu) || []).length > 30) out.push('mais de 30 hashtags')
  if (/SE FOR O /i.test(legenda)) out.push('legenda com duas versões ("SE FOR O ...") — deixe só uma')
  if (p.tipo === 'reel' && !(midia.length === 1 && midia[0].tipo === 'video')) out.push('reel precisa de exatamente 1 vídeo')
  if (p.tipo === 'foto' && !(midia.length === 1 && midia[0].tipo === 'imagem')) out.push('foto precisa de exatamente 1 imagem')
  if (p.tipo === 'carrossel' && (midia.length < 2 || midia.length > 10)) out.push('carrossel precisa de 2 a 10 mídias')
  if (p.tipo !== 'reel' && midia.some((a) => a.tipo === 'imagem' && !/\.jpe?g$/i.test(a.caminho))) {
    out.push('imagem do feed precisa ser JPEG (o script converte; reenvie a semana)')
  }
  return out
}

async function linkAssinado(sb: SB, caminho: string): Promise<string> {
  const { data, error } = await sb.storage.from(BUCKET).createSignedUrl(caminho, VALIDADE_LINK)
  if (error || !data?.signedUrl) throw new Error(`não gerou link do arquivo ${caminho}: ${error?.message || ''}`)
  return data.signedUrl
}

async function marcarErro(sb: SB, id: string, msg: string) {
  await sb.from('organico_posts').update({
    publicacao_erro: String(msg).slice(0, 800),
    publicacao_erro_em: new Date().toISOString(),
  }).eq('id', id)
}

async function statusContainer(token: string, id: string): Promise<string> {
  const j = await graph(token, `/${id}?fields=status_code`)
  return j.status_code || 'IN_PROGRESS'
}

// Passo 1: reserva o post e cria o(s) container(s).
async function iniciar(sb: SB, token: string, marca: any, p: any): Promise<string> {
  const { data: arquivos } = await sb.from('organico_arquivos').select('*').eq('post_id', p.id).order('ordem')
  const arqs = arquivos || []
  const prob = problemas(p, arqs)
  if (prob.length) {
    await marcarErro(sb, p.id, `Não publiquei: ${prob.join('; ')}.`)
    return 'bloqueado'
  }

  // Reserva (envio único).
  const { data: reservado } = await sb.from('organico_posts')
    .update({ publicando_em: new Date().toISOString() })
    .eq('id', p.id).is('publicando_em', null).is('publicado_em', null).is('postado_em', null)
    .select('id')
  if (!reservado?.length) return 'ja-reservado'

  try {
    const ig = marca.ig_user_id
    const caption = montarLegenda(p)
    const midia = arqs.filter((a) => a.tipo !== 'capa')
    if (p.tipo === 'reel') {
      const form: Record<string, string> = {
        media_type: 'REELS',
        video_url: await linkAssinado(sb, midia[0].caminho),
        caption,
        share_to_feed: 'true', // áudio original do vídeo é mantido
      }
      const capa = arqs.find((a) => a.tipo === 'capa')
      if (capa) form.cover_url = await linkAssinado(sb, capa.caminho)
      const c = await graph(token, `/${ig}/media`, { method: 'POST', form })
      await sb.from('organico_posts').update({ ig_container_id: c.id }).eq('id', p.id)
      p.ig_container_id = c.id
    } else if (p.tipo === 'foto') {
      const c = await graph(token, `/${ig}/media`, {
        method: 'POST', form: { image_url: await linkAssinado(sb, midia[0].caminho), caption },
      })
      await sb.from('organico_posts').update({ ig_container_id: c.id }).eq('id', p.id)
      p.ig_container_id = c.id
    } else {
      const filhos: string[] = []
      for (const a of midia) {
        const url = await linkAssinado(sb, a.caminho)
        const form: Record<string, string> = a.tipo === 'video'
          ? { media_type: 'VIDEO', video_url: url, is_carousel_item: 'true' }
          : { image_url: url, is_carousel_item: 'true' }
        const c = await graph(token, `/${ig}/media`, { method: 'POST', form })
        filhos.push(c.id)
      }
      await sb.from('organico_posts').update({ ig_filhos: filhos }).eq('id', p.id)
      p.ig_filhos = filhos
    }
    p.publicando_em = new Date().toISOString()
    return 'container-criado'
  } catch (e) {
    await marcarErro(sb, p.id, `Erro ao enviar para o Instagram: ${(e as Error).message}`)
    return 'erro'
  }
}

// Passo 2: acompanha o container e publica quando ficar pronto.
async function avancar(sb: SB, token: string, marca: any, p: any): Promise<string> {
  const ig = marca.ig_user_id
  const idade = Date.now() - new Date(p.publicando_em).getTime()
  try {
    if (p.publicar_chamado_em) {
      await marcarErro(sb, p.id, 'Estado incerto: o pedido de publicação foi feito, mas a resposta não voltou. Confira no Instagram se o post saiu antes de tentar de novo.')
      return 'incerto'
    }

    // Carrossel: espera os itens e cria o container "pai".
    if (p.tipo === 'carrossel' && !p.ig_container_id) {
      const filhos: string[] = p.ig_filhos || []
      if (!filhos.length) { await marcarErro(sb, p.id, 'Carrossel sem itens enviados.'); return 'erro' }
      const sts = []
      for (const f of filhos) sts.push(await statusContainer(token, f))
      if (sts.some((s) => s === 'ERROR' || s === 'EXPIRED')) {
        await marcarErro(sb, p.id, `Um item do carrossel falhou no processamento do Instagram (${sts.join(', ')}).`)
        return 'erro'
      }
      if (!sts.every((s) => s === 'FINISHED')) {
        if (idade > LIMITE_PROCESSANDO_MS) { await marcarErro(sb, p.id, 'O Instagram demorou mais de 45 min para processar o carrossel.'); return 'erro' }
        return 'processando'
      }
      const c = await graph(token, `/${ig}/media`, {
        method: 'POST', form: { media_type: 'CAROUSEL', children: filhos.join(','), caption: montarLegenda(p) },
      })
      await sb.from('organico_posts').update({ ig_container_id: c.id }).eq('id', p.id)
      p.ig_container_id = c.id
    }

    const st = await statusContainer(token, p.ig_container_id)
    if (st === 'ERROR' || st === 'EXPIRED') {
      await marcarErro(sb, p.id, `O Instagram não aceitou a mídia (status ${st}). Confira formato e tamanho do arquivo.`)
      return 'erro'
    }
    if (st !== 'FINISHED') {
      if (idade > LIMITE_PROCESSANDO_MS) { await marcarErro(sb, p.id, 'O Instagram demorou mais de 45 min para processar o vídeo.'); return 'erro' }
      return 'processando'
    }

    // Trava do passo 2.
    const { data: trava } = await sb.from('organico_posts')
      .update({ publicar_chamado_em: new Date().toISOString() })
      .eq('id', p.id).is('publicar_chamado_em', null).is('publicado_em', null)
      .select('id')
    if (!trava?.length) return 'ja-publicando'

    const pub = await graph(token, `/${ig}/media_publish`, { method: 'POST', form: { creation_id: p.ig_container_id } })
    let permalink: string | null = null
    try { permalink = (await graph(token, `/${pub.id}?fields=permalink`)).permalink || null } catch { /* fica para a coleta */ }
    const agora = new Date().toISOString()
    await sb.from('organico_posts').update({
      publicado_em: agora,
      ig_media_id: pub.id,
      permalink,
      postado_em: agora,
      postado_por: 'auto-publicacao',
      publicacao_erro: null,
      publicacao_erro_em: null,
    }).eq('id', p.id)
    return 'publicado'
  } catch (e) {
    await marcarErro(sb, p.id, `Erro ao publicar: ${(e as Error).message}. Confira no Instagram se o post saiu antes de tentar de novo.`)
    return 'erro'
  }
}

async function rodarMarca(sb: SB, marca: any) {
  const token = tokenDaMarca(marca)
  if (!token) throw new Error(`segredo ${marca.token_segredo || 'META_IG_TOKEN'} ausente ou com nome inválido`)
  const res: Record<string, string> = {}

  // 1. Continua o que está no meio do caminho.
  const { data: andamento } = await sb.from('organico_posts').select('*')
    .eq('marca_id', marca.id).in('tipo', TIPOS_FEED)
    .not('publicando_em', 'is', null).is('publicado_em', null).is('publicacao_erro', null)
  for (const p of andamento || []) res[p.chave] = await avancar(sb, token, marca, p)

  // 2. Posts aprovados cujo horário chegou.
  const agora = Date.now()
  const { data: fila } = await sb.from('organico_posts').select('*')
    .eq('marca_id', marca.id).in('tipo', TIPOS_FEED)
    .not('aprovado_em', 'is', null).is('publicando_em', null).is('publicado_em', null)
    .is('postado_em', null).is('publicacao_erro', null)
    .lte('planejado_para', new Date(agora).toISOString())
    .order('planejado_para')
  if (!fila?.length) return res

  // Cota da Meta (100 publicações / 24h).
  try {
    const q = await graph(token, `/${marca.ig_user_id}/content_publishing_limit?fields=quota_usage,config`)
    const uso = q.data?.[0]?.quota_usage ?? 0
    const total = q.data?.[0]?.config?.quota_total ?? 100
    if (uso >= total) { res._cota = `cota cheia (${uso}/${total})`; return res }
  } catch { /* se não der para ler a cota, segue: a própria publicação acusa */ }

  let novos = 0
  for (const p of fila) {
    if (agora - new Date(p.planejado_para).getTime() > JANELA_ATRASO_MS) {
      await marcarErro(sb, p.id, 'Passou do horário (mais de 3h de atraso) e não publiquei sozinho. Publique na mão ou mude o horário e clique "Tentar de novo".')
      res[p.chave] = 'atrasado'
      continue
    }
    if (novos >= MAX_NOVOS_POR_RODADA) break
    novos++
    const r = await iniciar(sb, token, marca, p)
    res[p.chave] = r
    if (r === 'container-criado') {
      // Foto costuma ficar pronta na hora: tenta publicar já.
      await dormir(p.tipo === 'reel' ? 15000 : 5000)
      res[p.chave] = await avancar(sb, token, marca, p)
    }
  }
  return res
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  const auth = await autorizadoAdminOuCron(req)
  if (!auth.ok) return json({ erro: 'nao autorizado' }, 401)

  const sb = adminClient()
  const { data: marcas, error } = await sb.from('organico_marcas').select('*').eq('ativo', true).not('ig_user_id', 'is', null)
  if (error) return json({ erro: 'falha ao ler marcas', detalhe: error.message }, 500)

  const resultado: Record<string, unknown> = {}
  for (const marca of marcas || []) {
    if (marca.publicacao_ativa !== true) { resultado[marca.slug] = 'publicação automática desligada'; continue }
    const iniciado = new Date()
    try {
      const r = await rodarMarca(sb, marca)
      resultado[marca.slug] = r
      if (Object.keys(r).length) await registrarExecucao(sb, marca.id, 'publicacao', iniciado, true, null, r)
    } catch (e) {
      const msg = (e as Error).message
      resultado[marca.slug] = { erro: msg }
      await registrarExecucao(sb, marca.id, 'publicacao', iniciado, false, msg, null)
    }
  }
  return json({ ok: true, resultado })
})
