// Edge Function: organico-coletar
// ---------------------------------------------------------------------------
// Lê do Instagram (Graph API, token META_IG_TOKEN do usuário do sistema
// claude-organico) as publicações e os números de cada uma, e liga o post
// planejado (organico_posts) ao que saiu de verdade (organico_ig_midias).
//
// Modos (body { modo }):
//   'hora' (cron de hora em hora): lista as últimas mídias + stories no ar;
//          números dos posts dos últimos 3 dias e dos stories (que só têm
//          métrica nas 24h em que estão no ar).
//   'dia'  (cron 06h30 BRT): números dos posts de até 30 dias + números da conta
//          (seguidores, alcance, views, contas engajadas, interações).
// Admin logado também pode chamar (botão "Atualizar agora" da tela).
//
// Só LEITURA na Meta. O token nunca é logado nem devolvido.
// Publicar COM --no-verify-jwt (cron via x-cron-secret, admin via rpc is_admin).

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import {
  adminClient, autorizadoAdminOuCron, corsHeaders, dataBRT, ErroGraph, graph, json,
  normalizar, registrarExecucao, tokenDaMarca,
} from '../_shared/organico.ts'

const DIA = 86400000

const METRICAS: Record<string, string[]> = {
  REELS: ['views', 'reach', 'likes', 'comments', 'saved', 'shares', 'total_interactions', 'ig_reels_avg_watch_time'],
  FEED: ['views', 'reach', 'likes', 'comments', 'saved', 'shares', 'total_interactions', 'profile_visits'],
  STORY: ['views', 'reach', 'replies', 'shares', 'total_interactions', 'follows', 'profile_visits'],
}

// nome da Meta -> coluna nossa
const COLUNA: Record<string, string> = {
  views: 'views', reach: 'alcance', likes: 'curtidas', comments: 'comentarios', saved: 'salvamentos',
  shares: 'compartilhamentos', total_interactions: 'interacoes', replies: 'respostas', follows: 'seguiu',
  profile_visits: 'visitas_perfil', ig_reels_avg_watch_time: 'reel_tempo_medio_ms',
}

const valorDe = (item: any): number | null => {
  const v = item?.total_value?.value ?? item?.values?.[0]?.value
  return typeof v === 'number' ? v : null
}

// Pede tudo de uma vez; se a Meta recusar uma métrica (erro 100 = métrica
// inválida para esse tipo/versão), pede uma a uma e fica com as que funcionam.
async function lerInsights(token: string, caminho: string, metricas: string[], extra = ''): Promise<{ valores: Record<string, number>; erro: string | null }> {
  const valores: Record<string, number> = {}
  const aplicar = (j: any) => {
    for (const item of j?.data || []) {
      const v = valorDe(item)
      if (v !== null) valores[item.name] = v
    }
  }
  try {
    aplicar(await graph(token, `${caminho}?metric=${metricas.join(',')}${extra}`))
    return { valores, erro: null }
  } catch (e) {
    if (!(e instanceof ErroGraph) || e.codigo !== 100) return { valores, erro: (e as Error).message }
  }
  let ultimoErro: string | null = null
  for (const m of metricas) {
    try { aplicar(await graph(token, `${caminho}?metric=${m}${extra}`)) } catch (e) { ultimoErro = (e as Error).message }
  }
  return { valores, erro: Object.keys(valores).length ? null : ultimoErro }
}

const tipoPlanejado = (m: any): string | null => {
  if (m.media_product_type === 'STORY') return 'story'
  if (m.media_product_type === 'REELS') return 'reel'
  if (m.media_type === 'CAROUSEL_ALBUM') return 'carrossel'
  if (m.media_type === 'IMAGE') return 'foto'
  if (m.media_type === 'VIDEO') return 'reel'
  return null
}

const limparPermalink = (u: string | null | undefined) =>
  (u || '').split('?')[0].replace(/\/+$/, '').replace(/^https?:\/\/(www\.)?/, '').toLowerCase()

async function coletarMarca(sb: ReturnType<typeof adminClient>, marca: any, modo: 'hora' | 'dia') {
  const token = tokenDaMarca(marca)
  if (!token) throw new Error(`segredo ${marca.token_segredo || 'META_IG_TOKEN'} ausente ou com nome inválido`)
  const ig = marca.ig_user_id
  const agora = Date.now()
  const janelaDias = modo === 'dia' ? 30 : 3
  const resumo: Record<string, unknown> = { modo }

  // ---------- 1. Lista das publicações ----------
  const campos = 'id,caption,media_type,media_product_type,timestamp,permalink,like_count,comments_count'
  const midias: any[] = []
  let prox: string | null = `/${ig}/media?fields=${campos}&limit=50`
  let paginas = 0
  while (prox && paginas < (modo === 'dia' ? 4 : 1)) {
    const j = await graph(token, prox)
    midias.push(...(j.data || []))
    paginas++
    const ultima = j.data?.[j.data.length - 1]
    if (ultima && agora - new Date(ultima.timestamp).getTime() > 31 * DIA) break
    prox = j.paging?.next || null // contém token: só usado aqui dentro
  }
  let stories: any[] = []
  try {
    const j = await graph(token, `/${ig}/stories?fields=id,media_type,media_product_type,timestamp,permalink`)
    stories = (j.data || []).map((s: any) => ({ ...s, media_product_type: 'STORY' }))
  } catch (e) {
    resumo.stories_erro = (e as Error).message
  }
  resumo.midias_lidas = midias.length
  resumo.stories_no_ar = stories.length

  const todas = [...midias, ...stories]
  if (todas.length) {
    const { error } = await sb.from('organico_ig_midias').upsert(todas.map((m) => ({
      ig_media_id: m.id,
      marca_id: marca.id,
      media_type: m.media_type || null,
      media_product_type: m.media_product_type || null,
      publicado_em: m.timestamp || null,
      legenda: m.caption ?? null,
      permalink: m.permalink || null,
    })), { onConflict: 'ig_media_id' })
    if (error) throw new Error(`falha ao gravar mídias: ${error.message}`)
  }

  // ---------- 2. Números de cada mídia ----------
  const alvo = [
    ...midias.filter((m) => agora - new Date(m.timestamp).getTime() <= janelaDias * DIA),
    ...stories,
  ]
  let comNumeros = 0
  for (const m of alvo) {
    const tipo = m.media_product_type === 'STORY' ? 'STORY' : m.media_product_type === 'REELS' ? 'REELS' : 'FEED'
    const { valores, erro } = await lerInsights(token, `/${m.id}/insights`, METRICAS[tipo])
    if (valores.likes === undefined && typeof m.like_count === 'number') valores.likes = m.like_count
    if (valores.comments === undefined && typeof m.comments_count === 'number') valores.comments = m.comments_count
    const upd: Record<string, unknown> = { metricas_em: new Date().toISOString(), metricas_erro: erro }
    for (const [nome, v] of Object.entries(valores)) if (COLUNA[nome]) upd[COLUNA[nome]] = v
    await sb.from('organico_ig_midias').update(upd).eq('ig_media_id', m.id)
    if (Object.keys(valores).length) {
      await sb.from('organico_metricas_snapshots').insert({ ig_media_id: m.id, metricas: valores })
      comNumeros++
    }
  }
  resumo.midias_com_numeros = comNumeros

  // ---------- 3. Liga planejado <-> publicado ----------
  resumo.ligacoes = await ligar(sb, marca.id, janelaDias)

  // ---------- 4. Conta (só no modo dia) ----------
  if (modo === 'dia') {
    try { resumo.conta = await coletarConta(sb, marca, token) } catch (e) { resumo.conta_erro = (e as Error).message }
  }

  return resumo
}

async function ligar(sb: ReturnType<typeof adminClient>, marcaId: string, janelaDias: number) {
  const desde = new Date(Date.now() - (janelaDias + 2) * DIA).toISOString()
  const { data: midias } = await sb.from('organico_ig_midias')
    .select('ig_media_id, post_id, media_type, media_product_type, publicado_em, legenda, permalink')
    .eq('marca_id', marcaId).gte('publicado_em', desde).order('publicado_em')
  const { data: posts } = await sb.from('organico_posts')
    .select('id, tipo, ordem, data_planejada, legenda, permalink, ig_media_id, postado_em, postado_por')
    .eq('marca_id', marcaId)
    .gte('data_planejada', dataBRT(new Date(Date.now() - (janelaDias + 3) * DIA)))
  const ms = midias || []
  const ps = posts || []
  const usados = new Set(ms.filter((m) => m.post_id).map((m) => m.post_id))
  const res = { auto: 0, por_link: 0, sugestoes: 0 }

  const vincular = async (m: any, p: any, como: string) => {
    usados.add(p.id)
    m.post_id = p.id
    p.ig_media_id = m.ig_media_id
    await sb.from('organico_ig_midias').update({ post_id: p.id, sugestao_post_id: null }).eq('ig_media_id', m.ig_media_id)
    await sb.from('organico_posts').update({
      ig_media_id: m.ig_media_id,
      permalink: m.permalink || p.permalink,
      postado_em: p.postado_em || m.publicado_em,
      postado_por: p.postado_por || como,
    }).eq('id', p.id)
  }

  // a) Post que já sabe o media id (publicado pela fase 3, ou ligado antes).
  for (const p of ps.filter((x) => x.ig_media_id)) {
    const m = ms.find((x) => x.ig_media_id === p.ig_media_id)
    if (m && m.post_id !== p.id) { await vincular(m, p, 'auto-publicacao'); res.auto++ }
  }
  // b) Link colado na tela.
  for (const p of ps.filter((x) => !x.ig_media_id && x.permalink && !usados.has(x.id))) {
    const m = ms.find((x) => !x.post_id && limparPermalink(x.permalink) === limparPermalink(p.permalink))
    if (m) { await vincular(m, p, 'manual'); res.por_link++ }
  }
  // c) Feed: mesmo tipo, dia planejado = dia publicado (±1) e começo da legenda igual.
  for (const m of ms.filter((x) => !x.post_id && x.media_product_type !== 'STORY')) {
    const tipo = tipoPlanejado(m)
    const d = dataBRT(m.publicado_em)
    const dias = [d, dataBRT(new Date(new Date(m.publicado_em).getTime() - DIA)), dataBRT(new Date(new Date(m.publicado_em).getTime() + DIA))]
    const cand = ps.filter((p) => !p.ig_media_id && !usados.has(p.id) && p.tipo === tipo && dias.includes(p.data_planejada))
    if (!cand.length) continue
    const cap = normalizar(m.legenda)
    const bate = cand.filter((p) => {
      const leg = normalizar(p.legenda).slice(0, 60)
      return leg.length >= 20 && cap.includes(leg)
    })
    if (bate.length === 1) { await vincular(m, bate[0], 'auto-ligacao'); res.auto++; continue }
    const mesmoDia = cand.filter((p) => p.data_planejada === d)
    if (mesmoDia.length >= 1) {
      await sb.from('organico_ig_midias').update({ sugestao_post_id: mesmoDia[0].id }).eq('ig_media_id', m.ig_media_id)
      res.sugestoes++
    }
  }
  // d) Stories: no mesmo dia, o 1º publicado liga ao story 1 planejado, e assim por diante.
  const storiesPorDia = new Map<string, any[]>()
  for (const m of ms.filter((x) => x.media_product_type === 'STORY')) {
    const d = dataBRT(m.publicado_em)
    storiesPorDia.set(d, [...(storiesPorDia.get(d) || []), m])
  }
  for (const [d, lista] of storiesPorDia) {
    const livres = lista.filter((m) => !m.post_id)
    const planejados = ps.filter((p) => p.tipo === 'story' && p.data_planejada === d && !p.ig_media_id && !usados.has(p.id))
      .sort((a, b) => a.ordem - b.ordem)
    for (let i = 0; i < Math.min(livres.length, planejados.length); i++) {
      await vincular(livres[i], planejados[i], 'auto-ligacao')
      res.auto++
    }
  }
  return res
}

async function coletarConta(sb: ReturnType<typeof adminClient>, marca: any, token: string) {
  const ig = marca.ig_user_id
  const hoje = dataBRT(new Date())
  const ontem = dataBRT(new Date(Date.now() - DIA))
  const out: Record<string, unknown> = {}

  const perfil = await graph(token, `/${ig}?fields=followers_count,media_count,username`)
  await sb.from('organico_conta_diaria').upsert({
    marca_id: marca.id, data: hoje, seguidores: perfil.followers_count ?? null, atualizado_em: new Date().toISOString(),
  }, { onConflict: 'marca_id,data' })
  if (perfil.username && perfil.username !== marca.ig_username) {
    await sb.from('organico_marcas').update({ ig_username: perfil.username }).eq('id', marca.id)
  }
  out.seguidores = perfil.followers_count

  // Totais de ontem (00h a 24h BRT).
  const ini = Math.floor(new Date(`${ontem}T00:00:00-03:00`).getTime() / 1000)
  const fim = Math.floor(new Date(`${hoje}T00:00:00-03:00`).getTime() / 1000)
  const { valores, erro } = await lerInsights(
    token, `/${ig}/insights`, ['reach', 'views', 'accounts_engaged', 'total_interactions'],
    `&period=day&metric_type=total_value&since=${ini}&until=${fim}`,
  )
  await sb.from('organico_conta_diaria').upsert({
    marca_id: marca.id, data: ontem,
    alcance: valores.reach ?? null, views: valores.views ?? null,
    contas_engajadas: valores.accounts_engaged ?? null, interacoes: valores.total_interactions ?? null,
    atualizado_em: new Date().toISOString(),
  }, { onConflict: 'marca_id,data' })
  out.ontem = valores
  if (erro) out.erro_totais = erro

  // Novos seguidores por dia (a Meta só guarda ~30 dias, sem o dia de hoje).
  try {
    const desde = Math.floor((Date.now() - 29 * DIA) / 1000)
    const j = await graph(token, `/${ig}/insights?metric=follower_count&period=day&since=${desde}&until=${fim}`)
    const serie = j.data?.[0]?.values || []
    for (const v of serie) {
      if (typeof v.value !== 'number' || !v.end_time) continue
      // end_time marca o fim do dia: volta 12h para cair no dia certo em BRT.
      const d = dataBRT(new Date(new Date(v.end_time).getTime() - 12 * 3600 * 1000))
      await sb.from('organico_conta_diaria').upsert(
        { marca_id: marca.id, data: d, novos_seguidores: v.value, atualizado_em: new Date().toISOString() },
        { onConflict: 'marca_id,data' },
      )
    }
    out.dias_seguidores = serie.length
  } catch (e) {
    out.erro_seguidores = (e as Error).message
  }
  return out
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  const auth = await autorizadoAdminOuCron(req)
  if (!auth.ok) return json({ erro: 'nao autorizado' }, 401)

  let body: any = {}
  try { body = await req.json() } catch { /* sem body */ }
  const modo: 'hora' | 'dia' = body.modo === 'dia' ? 'dia' : 'hora'

  const sb = adminClient()
  let q = sb.from('organico_marcas').select('*').eq('ativo', true).not('ig_user_id', 'is', null)
  if (typeof body.marca === 'string') q = q.eq('slug', body.marca)
  const { data: marcas, error } = await q
  if (error) return json({ erro: 'falha ao ler marcas', detalhe: error.message }, 500)

  const resultado: Record<string, unknown> = {}
  for (const marca of marcas || []) {
    const iniciado = new Date()
    try {
      const r = await coletarMarca(sb, marca, modo)
      resultado[marca.slug] = r
      await registrarExecucao(sb, marca.id, `coleta_${modo}`, iniciado, true, null, r)
    } catch (e) {
      const msg = (e as Error).message
      resultado[marca.slug] = { erro: msg }
      await registrarExecucao(sb, marca.id, `coleta_${modo}`, iniciado, false, msg, null)
    }
  }
  return json({ ok: true, modo, resultado })
})
