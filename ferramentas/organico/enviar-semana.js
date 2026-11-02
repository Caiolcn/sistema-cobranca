#!/usr/bin/env node
// Envia uma semana de conteúdo do Instagram (pasta local) para o /admin/organico.
// ---------------------------------------------------------------------------
// Uso (no PowerShell, na pasta do repositório):
//   node ferramentas/organico/enviar-semana.js "C:\Users\cttca\Documents\Mensalli\Conteudo\Semana 02-08 nov" --dry-run
//   node ferramentas/organico/enviar-semana.js "C:\...\Semana 02-08 nov"
//
// Opções:
//   --dry-run        só lê a pasta e mostra o que seria enviado (não chama nada)
//   --json           no dry-run, imprime o pacote completo em JSON
//   --marca <slug>   marca de destino (padrão: mensalli)
//   --ano <AAAA>     ano das datas do Word (padrão: ano atual)
//   --limite-mb <n>  pula arquivo maior que isso (padrão 50 = limite do plano Free do Storage)
//   --env <arquivo>  arquivo com as chaves (padrão: C:\Users\cttca\.mensalli\organico.env)
//
// O arquivo .env (FORA do repositório) tem só duas linhas:
//   SUPABASE_URL=https://<projeto>.supabase.co
//   ORGANICO_IMPORT_TOKEN=<o mesmo valor do segredo no Supabase>
// Esse token só sabe importar conteúdo do Orgânico. NUNCA coloque a service_role aqui.
//
// Imagens do feed (foto/carrossel/capa) em PNG são convertidas para JPEG antes
// de subir (o Instagram só publica JPEG pela API). Stories sobem como estão.
'use strict'
const fs = require('fs')
const os = require('os')
const path = require('path')
const crypto = require('crypto')
const { spawnSync } = require('child_process')
const { lerSemana } = require('./lib/ler-semana')

function args(argv) {
  const out = { _: [] }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--dry-run') out.dryRun = true
    else if (a === '--json') out.json = true
    else if (a === '--marca') out.marca = argv[++i]
    else if (a === '--ano') out.ano = argv[++i]
    else if (a === '--limite-mb') out.limiteMb = Number(argv[++i])
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

const mb = (b) => `${(b / 1024 / 1024).toFixed(1)} MB`

// PNG -> JPEG com fundo branco (transparência vira branco), via .NET do Windows.
function converterParaJpeg(origem) {
  const pasta = path.join(os.tmpdir(), 'mensalli-organico-jpeg')
  fs.mkdirSync(pasta, { recursive: true })
  const st = fs.statSync(origem)
  const hash = crypto.createHash('sha1').update(`${origem}|${st.size}|${st.mtimeMs}`).digest('hex').slice(0, 16)
  const destino = path.join(pasta, `${hash}.jpg`)
  if (fs.existsSync(destino)) return destino
  const ps = `
Add-Type -AssemblyName System.Drawing
$img = [System.Drawing.Image]::FromFile($env:ORIGEM)
$bmp = New-Object System.Drawing.Bitmap $img.Width, $img.Height
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.Clear([System.Drawing.Color]::White)
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$g.DrawImage($img, 0, 0, $img.Width, $img.Height)
$codec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq 'image/jpeg' }
$p = New-Object System.Drawing.Imaging.EncoderParameters 1
$p.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter ([System.Drawing.Imaging.Encoder]::Quality), 92L
$bmp.Save($env:DESTINO, $codec, $p)
$g.Dispose(); $bmp.Dispose(); $img.Dispose()
`
  const r = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps], {
    env: { ...process.env, ORIGEM: origem, DESTINO: destino }, encoding: 'utf8',
  })
  if (r.status !== 0 || !fs.existsSync(destino)) throw new Error(`Falha ao converter ${origem} para JPEG: ${(r.stderr || '').slice(0, 300)}`)
  return destino
}

function prepararArquivos(pacote, { converter, limiteBytes }) {
  const pulados = []
  for (const p of pacote.posts) {
    const feed = p.tipo !== 'story'
    p.arquivos = p.arquivos.filter((a) => {
      if (a.tamanho_bytes > limiteBytes) {
        pulados.push(`${a.nome_relativo} (${mb(a.tamanho_bytes)}) acima de ${mb(limiteBytes)} — não enviado`)
        return false
      }
      return true
    })
    for (const a of p.arquivos) {
      if (feed && a.tipo !== 'video' && /\.png$/i.test(a.local)) {
        a.converter = true
        a.nome_relativo = a.nome_relativo.replace(/\.png$/i, '.jpg')
        a.content_type = 'image/jpeg'
        if (converter) {
          a.local = converterParaJpeg(a.local)
          a.tamanho_bytes = fs.statSync(a.local).size
        }
      }
    }
  }
  return pulados
}

function imprimirResumo(pacote, pulados) {
  const nomesDia = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']
  console.log(`\nSemana: ${pacote.semana.nome}  (segunda = ${pacote.semana.inicio})`)
  console.log(`Word:   ${pacote.docx}\n`)
  let total = 0
  for (const p of pacote.posts) {
    const dow = nomesDia[new Date(`${p.data}T12:00:00Z`).getUTCDay()]
    const hora = p.hora || '--:--'
    console.log(`${p.data} ${dow} ${hora}  [${p.tipo.toUpperCase()}] ${p.titulo || ''}`)
    if (p.tipo !== 'story') {
      const leg = (p.legenda || '').replace(/\s+/g, ' ')
      console.log(`    legenda: ${leg.slice(0, 90)}${leg.length > 90 ? '…' : ''} (${(p.legenda || '').length} caracteres)`)
      if (p.hashtags) console.log(`    hashtags: ${p.hashtags}`)
      if (p.texto_alt) console.log('    texto alternativo: sim')
      if (p.dica) console.log(`    dica: ${p.dica.replace(/\s+/g, ' ').slice(0, 90)}`)
    } else {
      const s = p.story
      console.log(`    figurinha: ${s.figurinha || '-'} | texto: ${s.texto_figurinha || '-'} | opções: ${s.opcoes || '-'}`)
    }
    for (const a of p.arquivos) {
      total += a.tamanho_bytes
      console.log(`    - ${a.tipo.padEnd(6)} ${a.nome_relativo}  ${mb(a.tamanho_bytes)}${a.converter ? '  (PNG -> JPEG no envio)' : ''}`)
    }
    if (!p.arquivos.length) console.log('    - (sem arquivo)')
  }
  console.log(`\n${pacote.posts.length} itens, ${mb(total)} em arquivos.`)
  if (pacote.avisos.length) { console.log('\nAVISOS:'); pacote.avisos.forEach((a) => console.log(`  ! ${a}`)) }
  if (pulados.length) { console.log('\nPULADOS (tamanho):'); pulados.forEach((a) => console.log(`  ! ${a}`)) }
  if (pacote.sobras.length) {
    console.log('\nNa pasta mas NÃO citados no Word (não vão ser enviados):')
    pacote.sobras.forEach((s) => console.log(`  - ${s}`))
  }
}

async function main() {
  const o = args(process.argv.slice(2))
  const pasta = o._[0]
  if (!pasta || !fs.existsSync(pasta)) {
    console.error('Informe a pasta da semana. Ex.: node ferramentas/organico/enviar-semana.js "C:\\...\\Semana 02-08 nov" --dry-run')
    process.exit(1)
  }
  const limiteBytes = (o.limiteMb || 50) * 1024 * 1024
  const pacote = lerSemana(path.resolve(pasta), { ano: o.ano })
  const pulados = prepararArquivos(pacote, { converter: !o.dryRun, limiteBytes })

  const corpo = {
    marca: o.marca || 'mensalli',
    semana: pacote.semana,
    posts: pacote.posts.map((p) => ({
      ...p,
      arquivos: p.arquivos.map(({ local, converter, ...resto }) => resto),
    })),
  }

  imprimirResumo(pacote, pulados)
  if (o.dryRun) {
    if (o.json) console.log(`\n${JSON.stringify(corpo, null, 2)}`)
    console.log('\n(dry-run: nada foi enviado)')
    return
  }

  const env = lerEnv(o.env || path.join(os.homedir(), '.mensalli', 'organico.env'))
  const url = `${env.SUPABASE_URL.replace(/\/+$/, '')}/functions/v1/organico-importar`
  console.log('\nEnviando conteúdo...')
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-organico-token': env.ORGANICO_IMPORT_TOKEN },
    body: JSON.stringify(corpo),
  })
  const j = await r.json().catch(() => ({}))
  if (!r.ok) {
    console.error(`Erro ${r.status}: ${j.erro || ''}`)
    if (j.detalhes) j.detalhes.forEach((d) => console.error(`  - ${d}`))
    if (j.detalhe) console.error(`  ${j.detalhe}`)
    process.exit(1)
  }
  const res = j.resumo || {}
  console.log(`Posts: ${res.novos || 0} novos, ${res.atualizados || 0} atualizados, ${res.sem_mudanca || 0} sem mudança.`)
  if (res.travados_publicados?.length) console.log(`Não mexi (já publicados): ${res.travados_publicados.join(', ')}`)
  if (res.aprovacao_cancelada?.length) console.log(`ATENÇÃO, mudaram e precisam ser aprovados de novo: ${res.aprovacao_cancelada.join(', ')}`)

  // Sobe os arquivos pelos links assinados (direto para o Storage).
  const porCaminho = new Map()
  for (const p of pacote.posts) for (const a of p.arquivos) porCaminho.set(a.nome_relativo, a)
  const uploads = j.uploads || []
  console.log(`Arquivos: ${uploads.length} para subir, ${j.ja_no_storage || 0} já estavam lá.`)
  let falhas = 0
  for (const u of uploads) {
    const a = porCaminho.get(u.nome_original)
    if (!a) { console.error(`  ! não achei o arquivo local de ${u.caminho}`); falhas++; continue }
    process.stdout.write(`  subindo ${u.nome_original} (${mb(a.tamanho_bytes)})... `)
    const up = await fetch(u.signedUrl, {
      method: 'PUT',
      headers: { 'Content-Type': u.content_type || a.content_type, 'x-upsert': 'true' },
      body: fs.readFileSync(a.local),
    })
    if (up.ok) console.log('ok')
    else { falhas++; console.log(`ERRO ${up.status} ${(await up.text()).slice(0, 200)}`) }
  }
  console.log(falhas ? `\nTerminou com ${falhas} falha(s). Rode de novo: o que já subiu não sobe outra vez.` : '\nPronto. Abra /admin/organico.')
  if (falhas) process.exit(1)
}

if (require.main === module) {
  main().catch((e) => { console.error(e.message || e); process.exit(1) })
}

module.exports = { converterParaJpeg }
