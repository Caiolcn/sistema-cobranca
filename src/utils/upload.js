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
