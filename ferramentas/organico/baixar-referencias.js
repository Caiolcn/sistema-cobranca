#!/usr/bin/env node
// Baixa para o computador as referências guardadas no /admin/organico (aba
// Referências): as imagens dos melhores posts de cada perfil e um resumo com
// legenda e números. É daqui que o Claude (espiao-conteudo, roteirista-reels)
// lê as artes, sem ninguém precisar tirar print.
// ---------------------------------------------------------------------------
// Uso (no PowerShell, na pasta do repositório). No PowerShell o @ PRECISA de
// aspas ("@perfil"), senão ele some; sem o @ também funciona:
//   node ferramentas/organico/baixar-referencias.js                  todos os perfis
//   node ferramentas/organico/baixar-referencias.js "@perfil"        um perfil
//   node ferramentas/organico/baixar-referencias.js --adicionar "@perfil"
//                                                                    cadastra, coleta e baixa
// Opções:
//   --top <n>        quantos posts por perfil (padrão 10)
//   --atualizar      lê o perfil de novo na Meta antes de baixar
//   --saida <pasta>  padrão: C:\Users\cttca\Documents\Mensalli\Conteudo\Referencias
//   --marca <slug>   padrão: mensalli
//   --env <arquivo>  padrão: C:\Users\cttca\.mensalli\organico.env (o mesmo do enviar-semana)
//
// Sai assim:
//   Referencias\@perfil\_resumo.md
//   Referencias\@perfil\01-carrossel-1234curt-01.jpg ...
'use strict'
const fs = require('fs')
const os = require('os')
const path = require('path')

function args(argv) {
  const out = { _: [] }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--adicionar') out.adicionar = argv[++i]
    else if (a === '--atualizar') out.atualizar = true
    else if (a === '--top') out.top = Number(argv[++i])
    else if (a === '--saida') out.saida = argv[++i]
    else if (a === '--marca') out.marca = argv[++i]
    else if (a === '--env') out.env = argv[++i]
    else out._.push(a)
  }
  return out
}

function lerEnv(arquivo) {
  if (!fs.existsSync(arquivo)) throw new Error(`Não achei ${arquivo}. Crie com SUPABASE_URL e ORGANICO_IMPORT_TOKEN (veja organico.env.exemplo).`)
  const env = {}
  for (const linha of fs.readFileSync(arquivo, 'utf8').split(/\r?\n/)) {
    const m = linha.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/)
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
  if (!env.SUPABASE_URL || !env.ORGANICO_IMPORT_TOKEN) throw new Error(`${arquivo} precisa de SUPABASE_URL e ORGANICO_IMPORT_TOKEN.`)
  return env
}

const TIPO = (p) => (p.media_product_type === 'REELS' || p.media_type === 'VIDEO' ? 'reel' : p.media_type === 'CAROUSEL_ALBUM' ? 'carrossel' : 'foto')
const dataBR = (iso) => (iso ? new Date(new Date(iso).getTime() - 3 * 3600 * 1000).toISOString().slice(0, 10).split('-').reverse().join('/') : '')
const n = (v) => (v === null || v === undefined ? '—' : Number(v).toLocaleString('pt-BR'))

async function main() {
  const o = args(process.argv.slice(2))
  const env = lerEnv(o.env || path.join(os.homedir(), '.mensalli', 'organico.env'))
  const url = `${env.SUPABASE_URL.replace(/\/+$/, '')}/functions/v1/organico-referencias`
  const chamar = async (body) => {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-organico-token': env.ORGANICO_IMPORT_TOKEN },
      body: JSON.stringify({ marca: o.marca || 'mensalli', ...body }),
    })
    const j = await r.json().catch(() => ({}))
    if (!r.ok) throw new Error(`Erro ${r.status}: ${j.erro || ''}${j.detalhe ? ` (${j.detalhe})` : ''}`)
    return j
  }

  let alvo = o.adicionar || o._[0] || null
  if (o.adicionar) {
    console.log(`Cadastrando e lendo ${o.adicionar}...`)
    const r = await chamar({ acao: 'adicionar', username: o.adicionar })
    if (r.ok === false) throw new Error(`@${r.username}: ${r.erro}`)
    console.log(`  ${r.posts_lidos} posts lidos, ${r.imagens_copiadas} imagens guardadas.`)
    alvo = r.username
  }

  let { perfis } = await chamar({ acao: 'listar', username: alvo, top: o.top || 10 })
  if (alvo && !perfis.length) throw new Error(`${alvo} não está nas referências. Use --adicionar ${alvo}.`)
  if (o.atualizar && !o.adicionar) {
    for (const p of perfis) {
      process.stdout.write(`Atualizando @${p.username}... `)
      const r = await chamar({ acao: 'coletar', perfil_id: p.id })
      console.log(r.ok === false ? `ERRO ${r.erro}` : `${r.posts_lidos} posts, ${r.imagens_copiadas} imagens novas`)
    }
    ;({ perfis } = await chamar({ acao: 'listar', username: alvo, top: o.top || 10 }))
  }
  if (!perfis.length) { console.log('Nenhum perfil nas referências. Use --adicionar @perfil.'); return }

  const raiz = o.saida || path.join(os.homedir(), 'Documents', 'Mensalli', 'Conteudo', 'Referencias')
  for (const p of perfis) {
    const pasta = path.join(raiz, `@${p.username}`)
    fs.mkdirSync(pasta, { recursive: true })
    const md = [
      `# @${p.username}${p.nome ? ` — ${p.nome}` : ''}`,
      '',
      `${n(p.seguidores)} seguidores · ${n(p.total_posts)} posts · lido em ${dataBR(p.coletado_em)}`,
      p.coleta_erro ? `\n**Erro na última coleta:** ${p.coleta_erro}` : null,
      p.nota ? `\n**Nota:** ${p.nota}` : null,
      '',
      'Ordenado por curtidas + comentários. Engajamento = (curtidas + comentários) / seguidores.',
      '',
    ]
    let baixadas = 0
    for (let i = 0; i < p.posts.length; i++) {
      const post = p.posts[i]
      const pos = String(i + 1).padStart(2, '0')
      const arquivos = []
      for (const img of post.imagens || []) {
        if (!img.url) continue
        const nome = `${pos}-${TIPO(post)}-${post.curtidas ?? 0}curt-${String(img.ordem).padStart(2, '0')}.jpg`
        const destino = path.join(pasta, nome)
        if (!fs.existsSync(destino)) {
          const r = await fetch(img.url)
          if (!r.ok) continue
          fs.writeFileSync(destino, Buffer.from(await r.arrayBuffer()))
          baixadas++
        }
        arquivos.push(nome)
      }
      md.push(
        `## ${pos}. ${TIPO(post)} · ${dataBR(post.publicado_em)}`,
        '',
        `${n(post.curtidas)} curtidas · ${n(post.comentarios)} comentários · engajamento ${post.engajamento ?? '—'}%`,
        post.permalink ? `Link: ${post.permalink}` : '',
        arquivos.length ? `Imagens: ${arquivos.join(', ')}` : 'Imagens: (não guardadas)',
        '',
        '```',
        (post.legenda || '(sem legenda)').trim(),
        '```',
        '',
      )
    }
    fs.writeFileSync(path.join(pasta, '_resumo.md'), md.filter((l) => l !== null).join('\n'), 'utf8')
    console.log(`@${p.username}: ${p.posts.length} posts, ${baixadas} imagens novas -> ${pasta}`)
  }
}

main().catch((e) => { console.error(e.message || e); process.exit(1) })
