// Edge Function: organico-referencias
// ---------------------------------------------------------------------------
// Referências de outros perfis do Instagram para a criação de conteúdo.
// Lê os posts públicos de um perfil COMERCIAL ou de CRIADOR pela Graph API
// (business_discovery, com o token da marca), grava curtidas/comentários e
// copia para o bucket "organico" as imagens dos melhores posts.
//
// Ações (body { acao }):
//   'adicionar' { username }          cadastra (aceita @, link do perfil) e já coleta
//   'coletar'   { perfil_id }         coleta um perfil de novo (sem cron: só sob demanda)
//   'remover'   { perfil_id }         apaga o perfil, os posts e as imagens
//   'listar'    { username?, top? }   perfis + melhores posts com link assinado (1h)
//                                     das imagens — usado por ferramentas/organico/baixar-referencias.js
//
// Autenticação (publicada COM --no-verify-jwt, porque o script não tem JWT):
//   - header x-organico-token == ORGANICO_IMPORT_TOKEN (script no computador);
//   - Bearer de admin logado (validado no Auth, não só decodificado).
//
// Só LEITURA na Meta. O token nunca é logado nem devolvido.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
  adminClient, ANON_KEY, corsHeaders, ErroGraph, graph, json, registrarExecucao, SUPABASE_URL, tokenDaMarca,
} from '../_shared/organico.ts'

const IMPORT_TOKEN = Deno.env.get('ORGANICO_IMPORT_TOKEN') || ''
const BUCKET = 'organico'
const POSTS_LIDOS = 50          // posts mais recentes lidos por coleta
const DESTAQUES = 10            // melhores que ganham cópia das imagens
const SLIDES_MAX = 10           // imagens guardadas por carrossel

type SB = ReturnType<typeof adminClient>

function iguaisTempoConstante(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let r = 0
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return r === 0
}

async function autorizado(req: Request): Promise<boolean> {
  const tok = req.headers.get('x-organico-token') || ''
  if (tok && IMPORT_TOKEN && iguaisTempoConstante(tok, IMPORT_TOKEN)) return true
  const bearer = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '')
  if (!bearer) return false
  const cli = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: `Bearer ${bearer}` } } })
  const { data: u, error: eU } = await cli.auth.getUser()
  if (eU || !u?.user) return false
  const { data, error } = await cli.rpc('is_admin')
  return !error && data === true
}

// "@Fulano", "instagram.com/fulano/", "https://www.instagram.com/fulano?igsh=..." -> "fulano"
export function limparUsername(s: string): string | null {
  let t = String(s || '').trim()
  const m = t.match(/instagram\.com\/([^/?#\s]+)/i)
  if (m) t = m[1]
  t = t.replace(/^@/, '').toLowerCase()
  return /^[a-z0-9._]{1,30}$/.test(t) && !['p', 'reel', 'reels', 'stories', 'explore'].includes(t) ? t : null
}

const CAMPOS_MIDIA = 'id,caption,media_type,media_product_type,media_url,thumbnail_url,permalink,timestamp,like_count,comments_count'

async function lerPerfil(token: string, igMarca: string, username: string) {
  const perfil = 'username,name,profile_picture_url,followers_count,media_count'
  const tentar = (camposMidia: string) => graph(token,
    `/${igMarca}?fields=business_discovery.username(${username}){${perfil},media.limit(${POSTS_LIDOS}){${camposMidia}}}`)
  let j: any
  try {
    j = await tentar(`${CAMPOS_MIDIA},children{media_type,media_url,thumbnail_url}`)
  } catch (e) {
    // Algumas versões recusam children/media_product_type dentro do business_discovery.
    if (!(e instanceof ErroGraph) || e.codigo !== 100) throw e
    j = await tentar(CAMPOS_MIDIA.replace(',media_product_type', ''))
  }
  const bd = j?.business_discovery
  if (!bd) throw new Error('A Meta não devolveu o perfil.')
  return bd
}

function traduzirErro(e: unknown): string {
  const msg = (e as Error).message || String(e)
  if (e instanceof ErroGraph && (e.codigo === 110 || /cannot be found|nonexisting|does not exist/i.test(msg))) {
    return 'Perfil não encontrado ou não é comercial/criador (a Meta só mostra esses).'
  }
  if (e instanceof ErroGraph && (e.codigo === 10 || e.codigo === 200)) {
    return `O token não tem permissão para consultar outros perfis (business_discovery). Detalhe da Meta: ${msg}`
  }
  if (e instanceof ErroGraph && (e.codigo === 4 || e.codigo === 17 || e.codigo === 32 || e.codigo === 613)) {
    return 'Limite de consultas da Meta atingido. Tente de novo em 1 hora.'
  }
  return msg
}

async function copiarImagem(sb: SB, url: string, caminho: string): Promise<boolean> {
  try {
    const r = await fetch(url)
    if (!r.ok) return false
    const tipo = (r.headers.get('content-type') || 'image/jpeg').split(';')[0]
    if (!/^image\/(jpeg|png|webp)$/.test(tipo)) return false
    const { error } = await sb.storage.from(BUCKET).upload(caminho, new Uint8Array(await r.arrayBuffer()), { contentType: tipo, upsert: true })
    return !error
  } catch {
    return false
  }
}

async function coletarPerfil(sb: SB, marca: any, perfil: any) {
  const token = tokenDaMarca(marca)
  if (!token) throw new Error(`segredo ${marca.token_segredo || 'META_IG_TOKEN'} ausente ou com nome inválido`)
  const bd = await lerPerfil(token, marca.ig_user_id, perfil.username)
  const seguidores = typeof bd.followers_count === 'number' ? bd.followers_count : null
  const midias: any[] = bd.media?.data || []

  const linhas = midias.map((m) => {
    const curt = typeof m.like_count === 'number' ? m.like_count : null
    const com = typeof m.comments_count === 'number' ? m.comments_count : null
    const inter = (curt || 0) + (com || 0)
    return {
      m,
      inter,
      row: {
        ig_media_id: m.id,
        perfil_id: perfil.id,
        media_type: m.media_type || null,
        media_product_type: m.media_product_type || (m.media_type === 'VIDEO' ? 'REELS' : 'FEED'),
        publicado_em: m.timestamp || null,
        legenda: m.caption ?? null,
        permalink: m.permalink || null,
        curtidas: curt,
        comentarios: com,
        engajamento: seguidores ? Math.round((inter / seguidores) * 100000) / 1000 : null,
        destaque: false,
        coletado_em: new Date().toISOString(),
      } as Record<string, unknown>,
    }
  })

  // Melhores = mais interações entre os posts lidos.
  const ordenados = [...linhas].sort((a, b) => b.inter - a.inter)
  const destaques = new Set(ordenados.slice(0, DESTAQUES).map((l) => l.m.id))

  // Imagens que já estão guardadas não descem de novo.
  const { data: antigos } = await sb.from('organico_ref_posts').select('ig_media_id, imagens').eq('perfil_id', perfil.id)
  const imagensAntigas = new Map((antigos || []).map((a: any) => [a.ig_media_id, a.imagens || []]))

  let copiadas = 0
  for (const l of linhas) {
    const ja = imagensAntigas.get(l.m.id) || []
    if (!destaques.has(l.m.id)) { l.row.imagens = ja; continue }
    l.row.destaque = true
    if (ja.length) { l.row.imagens = ja; continue }
    const fontes: string[] = []
    if (l.m.media_type === 'CAROUSEL_ALBUM' && l.m.children?.data?.length) {
      for (const c of l.m.children.data.slice(0, SLIDES_MAX)) {
        const u = c.media_type === 'VIDEO' ? c.thumbnail_url : c.media_url
        if (u) fontes.push(u)
      }
    }
    if (!fontes.length) {
      const u = l.m.media_type === 'VIDEO' ? l.m.thumbnail_url : l.m.media_url
      if (u) fontes.push(u)
    }
    const imagens: { caminho: string; ordem: number }[] = []
    for (let i = 0; i < fontes.length; i++) {
      const caminho = `referencias/${perfil.username}/${l.m.id}-${String(i + 1).padStart(2, '0')}.jpg`
      if (await copiarImagem(sb, fontes[i], caminho)) { imagens.push({ caminho, ordem: i + 1 }); copiadas++ }
    }
    l.row.imagens = imagens
  }

  if (linhas.length) {
    const { error } = await sb.from('organico_ref_posts').upsert(linhas.map((l) => l.row), { onConflict: 'ig_media_id' })
    if (error) throw new Error(`falha ao gravar posts: ${error.message}`)
  }
  // Post que saiu do top continua no banco com a imagem já guardada; só perde o selo.
  const ids = linhas.map((l) => l.m.id)
  if (ids.length) {
    await sb.from('organico_ref_posts').update({ destaque: false })
      .eq('perfil_id', perfil.id).not('ig_media_id', 'in', `(${ids.map((i) => `"${i}"`).join(',')})`)
  }

  await sb.from('organico_ref_perfis').update({
    nome: bd.name || null,
    foto_url: bd.profile_picture_url || null,
    seguidores,
    total_posts: typeof bd.media_count === 'number' ? bd.media_count : null,
    coletado_em: new Date().toISOString(),
    coleta_erro: null,
  }).eq('id', perfil.id)

  return { username: perfil.username, posts_lidos: linhas.length, destaques: destaques.size, imagens_copiadas: copiadas }
}

async function coletarComRegistro(sb: SB, marca: any, perfil: any) {
  const iniciado = new Date()
  try {
    const r = await coletarPerfil(sb, marca, perfil)
    await registrarExecucao(sb, marca.id, 'referencias', iniciado, true, null, r)
    return { ok: true, ...r }
  } catch (e) {
    const msg = traduzirErro(e)
    await sb.from('organico_ref_perfis').update({ coleta_erro: msg.slice(0, 800), coletado_em: new Date().toISOString() }).eq('id', perfil.id)
    await registrarExecucao(sb, marca.id, 'referencias', iniciado, false, msg, { username: perfil.username })
    return { ok: false, username: perfil.username, erro: msg }
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ erro: 'use POST' }, 405)
  if (!(await autorizado(req))) return json({ erro: 'nao autorizado' }, 401)

  let body: any = {}
  try { body = await req.json() } catch { /* sem body */ }
  const sb = adminClient()
  const { data: marca, error: eM } = await sb.from('organico_marcas').select('*')
    .eq('slug', typeof body.marca === 'string' ? body.marca : 'mensalli').maybeSingle()
  if (eM || !marca) return json({ erro: 'marca não encontrada' }, 404)
  if (!marca.ig_user_id) return json({ erro: 'marca sem ig_user_id' }, 400)

  const acao = body.acao

  if (acao === 'adicionar') {
    const username = limparUsername(body.username)
    if (!username) return json({ erro: 'Informe um @ ou link de perfil válido.' }, 400)
    if (username === String(marca.ig_username || '').toLowerCase()) return json({ erro: 'Esse é o próprio perfil da marca.' }, 400)
    const { data: perfil, error } = await sb.from('organico_ref_perfis')
      .upsert({ marca_id: marca.id, username, nota: body.nota || null }, { onConflict: 'marca_id,username' })
      .select('*').single()
    if (error || !perfil) return json({ erro: 'falha ao cadastrar', detalhe: error?.message }, 500)
    return json(await coletarComRegistro(sb, marca, perfil))
  }

  if (acao === 'coletar') {
    const { data: perfil } = await sb.from('organico_ref_perfis').select('*').eq('id', body.perfil_id).eq('marca_id', marca.id).maybeSingle()
    if (!perfil) return json({ erro: 'perfil não encontrado' }, 404)
    return json(await coletarComRegistro(sb, marca, perfil))
  }

  if (acao === 'remover') {
    const { data: perfil } = await sb.from('organico_ref_perfis').select('*').eq('id', body.perfil_id).eq('marca_id', marca.id).maybeSingle()
    if (!perfil) return json({ erro: 'perfil não encontrado' }, 404)
    const { data: objs } = await sb.storage.from(BUCKET).list(`referencias/${perfil.username}`, { limit: 1000 })
    const caminhos = (objs || []).map((o: any) => `referencias/${perfil.username}/${o.name}`)
    if (caminhos.length) await sb.storage.from(BUCKET).remove(caminhos)
    await sb.from('organico_ref_perfis').delete().eq('id', perfil.id)
    return json({ ok: true, imagens_apagadas: caminhos.length })
  }

  if (acao === 'listar') {
    const top = Math.min(Math.max(Number(body.top) || DESTAQUES, 1), POSTS_LIDOS)
    let q = sb.from('organico_ref_perfis').select('*').eq('marca_id', marca.id).order('username')
    const u = body.username ? limparUsername(body.username) : null
    if (u) q = q.eq('username', u)
    const { data: perfis } = await q
    const saida = []
    for (const p of perfis || []) {
      const { data: posts } = await sb.from('organico_ref_posts').select('*').eq('perfil_id', p.id)
      const ordenados = (posts || [])
        .sort((a: any, b: any) => ((b.curtidas || 0) + (b.comentarios || 0)) - ((a.curtidas || 0) + (a.comentarios || 0)))
        .slice(0, top)
      for (const post of ordenados) {
        const imgs = post.imagens || []
        if (!imgs.length) { post.imagens = []; continue }
        const { data: urls } = await sb.storage.from(BUCKET).createSignedUrls(imgs.map((i: any) => i.caminho), 3600)
        post.imagens = imgs.map((i: any, k: number) => ({ ...i, url: urls?.[k]?.signedUrl || null }))
      }
      saida.push({ ...p, posts: ordenados })
    }
    return json({ ok: true, perfis: saida })
  }

  return json({ erro: 'acao inválida (adicionar | coletar | remover | listar)' }, 400)
})
