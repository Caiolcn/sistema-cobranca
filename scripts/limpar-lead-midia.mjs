// Limpeza do bucket lead-midia (22/11/2026)
// ---------------------------------------------------------------------------
// O projeto estourou a cota de 1 GB de arquivos do plano Free. ~1,6 GB eram
// vídeos e documentos que o PRÓPRIO Mensalli mandou para leads (depoimento,
// apresentação): o whatsapp-bot salvava uma cópia nova a cada envio — o mesmo
// vídeo de 8,5 MB estava salvo 54 vezes. Os originais estão com a gente.
//
// Apaga só mídia ENVIADA (direcao = 'out') de vídeo e documento. Áudio, imagem
// e tudo que o lead mandou ficam. A mensagem continua na conversa, marcada
// como 'erro' (a tela mostra "abrir no WhatsApp" em vez do player).
//
// Uso (PowerShell, na pasta do projeto):
//   $env:SUPABASE_SERVICE_KEY = "<chave secreta: Settings > API Keys>"
//   node scripts/limpar-lead-midia.mjs            # só mostra o que apagaria
//   node scripts/limpar-lead-midia.mjs --apagar   # apaga de verdade
// A chave não é gravada em lugar nenhum: some quando o terminal fecha.

import { createClient } from '@supabase/supabase-js'

const URL = 'https://zvlnkkmcytjtridiojxx.supabase.co'
const KEY = process.env.SUPABASE_SERVICE_KEY
const APAGAR = process.argv.includes('--apagar')
const LOTE = 100

if (!KEY) {
  console.error('Defina antes: $env:SUPABASE_SERVICE_KEY = "<chave secreta>"')
  process.exit(1)
}

const sb = createClient(URL, KEY, { auth: { persistSession: false } })
const mb = (b) => (b / 1024 / 1024).toFixed(0) + ' MB'

const { data: msgs, error } = await sb
  .from('mensalli_lead_mensagens')
  .select('id, midia_path, midia_bytes, tipo')
  .eq('direcao', 'out')
  .in('tipo', ['video', 'documento'])
  .not('midia_path', 'is', null)

if (error) {
  console.error('Não consegui ler as mensagens:', error.message)
  console.error('Se a mensagem fala em "restricted", o projeto bloqueou a API também: só o upgrade libera.')
  process.exit(1)
}

const total = msgs.reduce((s, m) => s + Number(m.midia_bytes || 0), 0)
console.log(`${msgs.length} arquivos enviados (vídeo/documento), ${mb(total)}.`)
if (!APAGAR) {
  console.log('Simulação. Para apagar: node scripts/limpar-lead-midia.mjs --apagar')
  process.exit(0)
}

let apagados = 0, liberado = 0
for (let i = 0; i < msgs.length; i += LOTE) {
  const lote = msgs.slice(i, i + LOTE)
  const { error: errRm } = await sb.storage.from('lead-midia').remove(lote.map((m) => m.midia_path))
  if (errRm) {
    console.error(`Lote ${i / LOTE + 1}: storage recusou —`, errRm.message)
    continue
  }
  const { error: errUp } = await sb
    .from('mensalli_lead_mensagens')
    .update({ midia_path: null, midia_status: 'erro' })
    .in('id', lote.map((m) => m.id))
  if (errUp) console.error(`Lote ${i / LOTE + 1}: arquivos apagados, mas não marquei as mensagens —`, errUp.message)
  apagados += lote.length
  liberado += lote.reduce((s, m) => s + Number(m.midia_bytes || 0), 0)
  console.log(`  ${apagados}/${msgs.length} apagados (${mb(liberado)})`)
}
console.log(`Pronto: ${apagados} arquivos, ${mb(liberado)} liberados.`)
