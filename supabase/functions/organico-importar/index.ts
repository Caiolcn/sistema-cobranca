// Edge Function: organico-importar
// ---------------------------------------------------------------------------
// Recebe o conteúdo de uma semana do Instagram (lido da pasta local pelo
// script ferramentas/organico/enviar-semana.js) e:
//   1. grava/atualiza os posts em organico_posts (chave estável: reenviar a
//      mesma semana atualiza, não duplica);
//   2. registra os arquivos em organico_arquivos;
//   3. devolve links de upload ASSINADOS do bucket privado "organico" para o
//      script mandar os vídeos/imagens direto ao Storage (sem passar o arquivo
//      pela função, que tem limite de tamanho de corpo).
//
// Autenticação: header x-organico-token == segredo ORGANICO_IMPORT_TOKEN.
// Esse token só sabe fazer isto (não é a service_role). Por isso a função é
// publicada com --no-verify-jwt: o script não tem JWT do Supabase.
//
// Proteções:
//   - post já publicado/em publicação: o conteúdo NÃO é alterado;
//   - post aprovado cujo conteúdo mudou: a aprovação cai (precisa aprovar de novo);
//   - arquivo igual (mesmo caminho e tamanho) já no Storage: não sobe de novo.
//
// Corpo: { marca: 'mensalli', semana: { inicio: 'YYYY-MM-DD', nome }, posts: [...], dryRun?: true }

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { adminClient, corsHeaders, json, registrarExecucao } from '../_shared/organico.ts'

const IMPORT_TOKEN = Deno.env.get('ORGANICO_IMPORT_TOKEN') || ''
const BUCKET = 'organico'
const TAMANHO_MAX = 100 * 1024 * 1024
const TIPOS_POST = ['reel', 'carrossel', 'foto', 'story']
const TIPOS_ARQ = ['imagem', 'video', 'capa']

function iguaisTempoConstante(a: string, b: string): boolean {
  const ea = new TextEncoder().encode(a)
  const eb = new TextEncoder().encode(b)
  let dif = ea.length ^ eb.length
  const n = Math.max(ea.length, eb.length)
  for (let i = 0; i < n; i++) dif |= (ea[i] || 0) ^ (eb[i] || 0)
  return dif === 0
}

const txt = (v: unknown, max: number) => (typeof v === 'string' && v.trim() ? v.slice(0, max) : null)
const ehData = (v: unknown) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)
const ehHora = (v: unknown) => typeof v === 'string' && /^\d{2}:\d{2}$/.test(v)

// "Stories/story-01 seg.png" -> "stories/story-01-seg.png" (cada pedaço limpo)
function caminhoSeguro(rel: string): string | null {
  const partes = String(rel || '').split(/[\\/]+/).filter(Boolean)
  if (!partes.length || partes.some((p) => p === '..' || p === '.')) return null
  const limpas = partes.map((p) =>
    p.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
      .replace(/[^a-z0-9._-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, ''),
  )
  if (limpas.some((p) => !p)) return null
  return limpas.join('/')
}

// Campos de conteúdo: se algum mudar num post aprovado, a aprovação cai.
const CAMPOS_CONTEUDO = ['tipo', 'ordem', 'data_planejada', 'hora_planejada', 'planejado_para', 'titulo', 'legenda', 'hashtags', 'texto_alt', 'dica', 'story']

function assinatura(p: Record<string, unknown>): string {
  return JSON.stringify(CAMPOS_CONTEUDO.map((c) => {
    const v = p[c]
    if (c === 'hora_planejada' && typeof v === 'string') return v.slice(0, 5)
    if (c === 'planejado_para' && v) return new Date(String(v)).toISOString()
    // jsonb volta do banco com as chaves em outra ordem: compara ordenado.
    if (c === 'story' && v && typeof v === 'object') {
      return Object.keys(v as Record<string, unknown>).sort().map((k) => [k, (v as Record<string, unknown>)[k]])
    }
    return v ?? null
  }))
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ erro: 'use POST' }, 405)
  if (!IMPORT_TOKEN) return json({ erro: 'segredo ORGANICO_IMPORT_TOKEN ausente' }, 500)
  const enviado = req.headers.get('x-organico-token') || ''
  if (!enviado || !iguaisTempoConstante(enviado, IMPORT_TOKEN)) return json({ erro: 'nao autorizado' }, 401)

  let body: any
  try { body = await req.json() } catch { return json({ erro: 'JSON inválido' }, 400) }

  const slug = txt(body?.marca, 60) || 'mensalli'
  const semanaInicio = body?.semana?.inicio
  const semanaNome = txt(body?.semana?.nome, 120)
  const posts: any[] = Array.isArray(body?.posts) ? body.posts : []
  const dryRun = body?.dryRun === true
  if (!ehData(semanaInicio)) return json({ erro: 'semana.inicio inválida (YYYY-MM-DD)' }, 400)
  if (!posts.length || posts.length > 80) return json({ erro: 'posts vazio ou acima de 80' }, 400)

  const sb = adminClient()
  const iniciado = new Date()

  const { data: marca } = await sb.from('organico_marcas').select('id, slug').eq('slug', slug).maybeSingle()
  if (!marca) return json({ erro: `marca "${slug}" não existe em organico_marcas` }, 400)

  // ---------- valida e monta as linhas ----------
  const linhas: any[] = []
  const erros: string[] = []
  for (const [i, p] of posts.entries()) {
    const chave = txt(p?.chave, 200)
    if (!chave) { erros.push(`post ${i}: sem chave`); continue }
    if (!TIPOS_POST.includes(p?.tipo)) { erros.push(`${chave}: tipo inválido`); continue }
    if (!ehData(p?.data)) { erros.push(`${chave}: data inválida`); continue }
    const hora = ehHora(p?.hora) ? p.hora : null
    const arquivos: any[] = Array.isArray(p?.arquivos) ? p.arquivos.slice(0, 20) : []
    const arqs = []
    for (const [k, a] of arquivos.entries()) {
      const caminhoRel = caminhoSeguro(a?.nome_relativo)
      const tam = Number(a?.tamanho_bytes) || 0
      if (!caminhoRel) { erros.push(`${chave}: nome de arquivo inválido`); continue }
      if (!TIPOS_ARQ.includes(a?.tipo)) { erros.push(`${chave}: tipo de arquivo inválido`); continue }
      if (tam <= 0 || tam > TAMANHO_MAX) { erros.push(`${chave}: ${a?.nome_relativo} com tamanho inválido ou acima de 100 MB`); continue }
      arqs.push({
        caminho: `${marca.slug}/${semanaInicio}/${caminhoRel}`,
        nome_original: txt(a?.nome_relativo, 300),
        tipo: a.tipo,
        ordem: Number(a?.ordem) || k + 1,
        tamanho_bytes: tam,
        content_type: txt(a?.content_type, 60) || 'application/octet-stream',
      })
    }
    linhas.push({
      chave,
      arqs,
      dados: {
        marca_id: marca.id,
        chave,
        semana_inicio: semanaInicio,
        semana_nome: semanaNome,
        tipo: p.tipo,
        ordem: Math.max(1, Math.min(99, Number(p?.ordem) || 1)),
        data_planejada: p.data,
        hora_planejada: hora,
        // BRT fixo (UTC-3).
        planejado_para: hora ? new Date(`${p.data}T${hora}:00-03:00`).toISOString() : null,
        titulo: txt(p?.titulo, 300),
        legenda: txt(p?.legenda, 2200),
        hashtags: txt(p?.hashtags, 1000),
        texto_alt: txt(p?.texto_alt, 1000),
        dica: txt(p?.dica, 2000),
        story: p?.tipo === 'story' && p?.story && typeof p.story === 'object'
          ? Object.fromEntries(Object.entries(p.story).filter(([, v]) => typeof v === 'string').map(([k, v]) => [k, String(v).slice(0, 2000)]))
          : null,
        importado_em: new Date().toISOString(),
      },
    })
  }
  if (erros.length) return json({ erro: 'conteúdo inválido', detalhes: erros.slice(0, 30) }, 400)

  // ---------- compara com o que já existe ----------
  const { data: existentes, error: errEx } = await sb
    .from('organico_posts').select('*')
    .eq('marca_id', marca.id)
    .in('chave', linhas.map((l) => l.chave))
  if (errEx) return json({ erro: 'falha ao ler posts', detalhe: errEx.message }, 500)
  const porChave = new Map((existentes || []).map((e: any) => [e.chave, e]))

  const resumo = { novos: 0, atualizados: 0, sem_mudanca: 0, travados_publicados: [] as string[], aprovacao_cancelada: [] as string[] }
  const gravar: any[] = []
  const travados = new Set<string>()
  for (const l of linhas) {
    const e: any = porChave.get(l.chave)
    if (!e) { resumo.novos++; gravar.push(l.dados); continue }
    if (e.publicado_em || e.publicando_em) {
      resumo.travados_publicados.push(l.chave)
      travados.add(l.chave)
      continue
    }
    if (assinatura(e) === assinatura(l.dados)) { resumo.sem_mudanca++; continue }
    resumo.atualizados++
    const d: any = { ...l.dados }
    if ('aprovado_em' in e && e.aprovado_em) {
      d.aprovado_em = null
      d.aprovado_por = null
      resumo.aprovacao_cancelada.push(l.chave)
    }
    gravar.push(d)
  }

  if (dryRun) return json({ dryRun: true, marca: marca.slug, resumo })

  if (gravar.length) {
    const { error } = await sb.from('organico_posts').upsert(gravar, { onConflict: 'marca_id,chave' })
    if (error) return json({ erro: 'falha ao gravar posts', detalhe: error.message }, 500)
  }

  const { data: atuais } = await sb.from('organico_posts').select('id, chave')
    .eq('marca_id', marca.id).in('chave', linhas.map((l) => l.chave))
  const idPorChave = new Map((atuais || []).map((a: any) => [a.chave, a.id]))

  // ---------- arquivos ----------
  // O que já está no Storage desta semana (para não subir de novo).
  const noStorage = new Map<string, number>()
  const listar = async (pasta: string) => {
    const { data } = await sb.storage.from(BUCKET).list(pasta, { limit: 1000 })
    for (const o of data || []) {
      if (o.id === null) await listar(`${pasta}/${o.name}`) // subpasta
      else noStorage.set(`${pasta}/${o.name}`, Number((o.metadata as any)?.size) || 0)
    }
  }
  await listar(`${marca.slug}/${semanaInicio}`)

  const uploads: { caminho: string; nome_original: string; content_type: string; signedUrl: string }[] = []
  const arquivosJaNoStorage: string[] = []
  for (const l of linhas) {
    if (travados.has(l.chave)) continue
    const postId = idPorChave.get(l.chave)
    if (!postId) continue

    const linhasArq = l.arqs.map((a: any) => ({
      post_id: postId, caminho: a.caminho, nome_original: a.nome_original,
      tipo: a.tipo, ordem: a.ordem, tamanho_bytes: a.tamanho_bytes,
    }))
    if (linhasArq.length) {
      const { error } = await sb.from('organico_arquivos').upsert(linhasArq, { onConflict: 'post_id,caminho' })
      if (error) return json({ erro: 'falha ao gravar arquivos', detalhe: error.message }, 500)
    }
    // Tira do post os arquivos que saíram do Word (o objeto no Storage fica).
    const manter = l.arqs.map((a: any) => a.caminho)
    let del = sb.from('organico_arquivos').delete().eq('post_id', postId)
    if (manter.length) del = del.not('caminho', 'in', `(${manter.map((c: string) => `"${c}"`).join(',')})`)
    await del

    for (const a of l.arqs) {
      if (noStorage.get(a.caminho) === a.tamanho_bytes) { arquivosJaNoStorage.push(a.caminho); continue }
      if (uploads.some((u) => u.caminho === a.caminho)) continue
      const { data: up, error } = await sb.storage.from(BUCKET).createSignedUploadUrl(a.caminho, { upsert: true })
      if (error || !up) return json({ erro: 'falha ao gerar link de upload', detalhe: error?.message }, 500)
      uploads.push({ caminho: a.caminho, nome_original: a.nome_original, content_type: a.content_type, signedUrl: up.signedUrl })
    }
  }

  await registrarExecucao(sb, marca.id, 'importacao', iniciado, true, null, {
    semana: semanaInicio, ...resumo, uploads: uploads.length, ja_no_storage: arquivosJaNoStorage.length,
  })

  return json({ ok: true, marca: marca.slug, resumo, uploads, ja_no_storage: arquivosJaNoStorage.length })
})
