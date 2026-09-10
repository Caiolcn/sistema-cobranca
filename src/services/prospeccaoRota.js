import { supabase, FUNCTIONS_URL } from '../supabaseClient'

/**
 * Único caminho do front para a ferramenta de prospecção por rota.
 *
 * A chave do Google Maps Platform NÃO vive aqui — ela é secret da edge function
 * `prospeccao-rota`. Chave de Maps no navegador é chave faturada por chamada
 * exposta a quem abrir o DevTools; o padrão é o mesmo do evolutionProxy.
 */
async function chamar(corpo) {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.access_token) return { ok: false, erro: 'Sessão expirada' }

  try {
    const resposta = await fetch(`${FUNCTIONS_URL}/prospeccao-rota`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify(corpo),
    })
    const dados = await resposta.json().catch(() => ({}))
    if (!resposta.ok) return { ok: false, erro: dados?.error || `Erro ${resposta.status}` }
    return { ok: true, ...dados }
  } catch (erro) {
    return { ok: false, erro: erro?.message || 'Falha de rede' }
  }
}

/** Trajetos possíveis entre dois endereços, com as alternativas do Google. */
export const buscarRotas = (origem, destino) => chamar({ op: 'rotas', origem, destino })

/** Lugares dentro do corredor da rota, já ordenados na ordem de passagem. */
export const buscarLugares = (polyline, termos, raio_m) =>
  chamar({ op: 'buscar', polyline, termos, raio_m })

// A edge function ainda tem um op `mapa`, que devolvia o trajeto como imagem
// estática. A tela largou: numa rota de 20 km os pinos empilham todos em cima da
// cidade e não dá zoom, então a imagem não respondia a pergunta que ela existia
// para responder. Quem mostra o trajeto agora é o próprio Google Maps, aberto
// pelo link com as paradas (ver `linkRoteiro` em AbaProspeccao.js).

/**
 * Marca uma porta como batida. Grava SÓ o place_id — nome e endereço são dados
 * do Places e os termos do Google proíbem persistir. Na próxima busca o lugar
 * volta da API e é cruzado por place_id.
 */
export async function marcarVisita(placeId, status, nota = null) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, erro: 'Sessão expirada' }

  const { error } = await supabase
    .from('prospeccao_visitados')
    .upsert(
      { user_id: user.id, place_id: placeId, status, nota, atualizado_em: new Date().toISOString() },
      { onConflict: 'user_id,place_id' },
    )

  return error ? { ok: false, erro: error.message } : { ok: true }
}

/** Desfaz a marcação (errei o card, quero ele de volta na lista). */
export async function limparVisita(placeId) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, erro: 'Sessão expirada' }

  const { error } = await supabase
    .from('prospeccao_visitados')
    .delete()
    .eq('user_id', user.id)
    .eq('place_id', placeId)

  return error ? { ok: false, erro: error.message } : { ok: true }
}
