import { supabase } from '../supabaseClient'

// Upload de imagem/vídeo para o bucket público `logos`.
// A policy do bucket (sql-logo-empresa.sql) exige que a primeira pasta do
// caminho seja o auth.uid() de quem envia, por isso o caminho é `${userId}/...`.
// Esse padrão estava copiado em BioEditor, Configuracao, WhatsAppConexao e
// Clientes; a loja é a primeira a usar a versão compartilhada.

export const MAX_FOTO = 3 * 1024 * 1024
export const MAX_VIDEO = 30 * 1024 * 1024

/**
 * @param {string} userId  dono do arquivo (precisa ser o usuário logado, pela policy)
 * @param {File} file
 * @param {{ prefixo?: string, maxMB?: number, bucket?: string, aceitar?: 'imagem'|'video'|'midia' }} opts
 * @returns {Promise<string>} URL pública
 */
export async function uploadPublico(userId, file, opts = {}) {
  const { prefixo = 'arquivo', bucket = 'logos', aceitar = 'imagem' } = opts
  if (!userId) throw new Error('Faça login para enviar arquivos.')
  if (!file) throw new Error('Nenhum arquivo selecionado.')

  const ehImagem = file.type.startsWith('image/')
  const ehVideo = file.type.startsWith('video/')
  if (aceitar === 'imagem' && !ehImagem) throw new Error('Envie uma imagem (JPG, PNG ou WebP).')
  if (aceitar === 'video' && !ehVideo) throw new Error('Envie um vídeo (MP4 ou WebM).')
  if (aceitar === 'midia' && !ehImagem && !ehVideo) throw new Error('Envie uma imagem ou um vídeo.')

  const limite = opts.maxMB ? opts.maxMB * 1024 * 1024 : (ehVideo ? MAX_VIDEO : MAX_FOTO)
  if (file.size > limite) {
    throw new Error(`Arquivo muito grande. Máximo ${Math.round(limite / 1024 / 1024)}MB.`)
  }

  const ext = (file.name.split('.').pop() || (ehVideo ? 'mp4' : 'jpg')).toLowerCase().replace(/[^a-z0-9]/g, '')
  const caminho = `${userId}/${prefixo}-${Date.now()}.${ext || 'jpg'}`

  const { error } = await supabase.storage.from(bucket).upload(caminho, file, { upsert: false, contentType: file.type })
  if (error) throw new Error(error.message || 'Falha ao enviar o arquivo.')

  const { data } = supabase.storage.from(bucket).getPublicUrl(caminho)
  return data.publicUrl
}

/**
 * Diminui a foto no próprio navegador antes de enviar: lado maior até `max` px,
 * JPEG com `qualidade`. Foto de celular (3–5 MB) vira ~100–250 KB, então o
 * limite de tamanho deixa de ser problema e a lista carrega mais rápido.
 * Se o navegador não conseguir abrir a imagem (ex.: HEIC no Chrome do
 * Windows), devolve o arquivo original — quem chama decide o que fazer.
 *
 * @param {File} file
 * @param {{ max?: number, qualidade?: number }} opts
 * @returns {Promise<File>}
 */
export async function reduzirImagem(file, { max = 800, qualidade = 0.82 } = {}) {
  if (!file?.type?.startsWith('image/') || file.type === 'image/gif') return file
  let bitmap
  try {
    bitmap = await carregarImagem(file)
  } catch {
    return file
  }
  const escala = Math.min(1, max / Math.max(bitmap.width, bitmap.height))
  const largura = Math.max(1, Math.round(bitmap.width * escala))
  const altura = Math.max(1, Math.round(bitmap.height * escala))

  const canvas = document.createElement('canvas')
  canvas.width = largura
  canvas.height = altura
  const ctx = canvas.getContext('2d')
  // Fundo branco: PNG com transparência viraria preto no JPEG.
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, largura, altura)
  ctx.drawImage(bitmap, 0, 0, largura, altura)
  bitmap.close?.()

  const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', qualidade))
  if (!blob) return file
  // Imagem já pequena que ficaria maior recomprimida: mantém a original.
  if (blob.size >= file.size && escala === 1) return file
  const nome = (file.name || 'foto').replace(/\.[^.]+$/, '') + '.jpg'
  return new File([blob], nome, { type: 'image/jpeg' })
}

// createImageBitmap respeita a rotação EXIF da foto do celular; o <img> é o
// plano B para navegadores sem essa opção.
async function carregarImagem(file) {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(file, { imageOrientation: 'from-image' })
    } catch { /* cai no <img> */ }
  }
  const url = URL.createObjectURL(file)
  try {
    return await new Promise((resolve, reject) => {
      const img = new Image()
      img.onload = () => resolve(img)
      img.onerror = reject
      img.src = url
    })
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 0)
  }
}
