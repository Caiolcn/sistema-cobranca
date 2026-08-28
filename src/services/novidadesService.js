import { supabase } from '../supabaseClient'

/* --------------------------------------------------------------------------
   Novidades do produto ("O que mudou no Mensalli")

   Uma fonte só para os dois lugares que mostram changelog: a barra da Home
   (NovidadesPainel) e o sino do topo (NotificacoesDropdown). Antes o sino
   tinha um array hardcoded — e por isso ficou 3 meses parado, já que publicar
   exigia deploy.

   Sobre QUAL id usar (o detalhe que quebra em silêncio):
     - listagem usa o id da CONTA (contexto), porque a segmentação por público
       olha o plano da conta que está sendo vista;
     - gravação de "visto"/"clicou" usa o id REAL de quem está logado
       (realUserId), porque a RLS de novidades_lidas exige user_id = auth.uid().
       Com o seletor admin ligado, gravar com o id da conta visitada é rejeitado
       pela policy — e marcaria a leitura na pessoa errada.
-------------------------------------------------------------------------- */

// A barra e o sino não são changelog completo: mostram o período recente.
const LIMITE = 20

/* Cache em memória, por usuário. Dois motivos:

   1. A Home só monta o NovidadesPainel DEPOIS de trocar o SkeletonDashboard
      pelo conteúdo. Se a busca começasse só aí, a barra entraria na tela um
      tempo depois de tudo, empurrando o resto pra baixo. Com o prefetch
      disparado lá do Dashboard, quando a Home pinta o dado já chegou.
   2. Sair da Home e voltar não refaz a busca — a barra reaparece pronta,
      sem o pisca.

   Guardamos a PROMISE, não só o resultado: duas chamadas simultâneas (o
   prefetch e a montagem do painel) compartilham a mesma ida ao banco. */
const cache = new Map()  // userId -> Promise<{ lista, dispensadoEm, dispensaDisponivel }>

/**
 * Lista as novidades visíveis para a conta, já marcando o que ainda não foi visto.
 *
 * @param {string} realUserId  id de quem está logado (dono do "visto")
 * @param {object} opts
 * @param {boolean} opts.planoPago  conta pagante? filtra novidades segmentadas
 * @param {boolean} opts.recarregar  ignora o cache
 * @returns {Promise<{lista: object[], dispensadoEm: string|null, dispensaDisponivel: boolean}>}
 */
export function carregarNovidades(realUserId, { planoPago = false, recarregar = false } = {}) {
  if (!recarregar && cache.has(realUserId)) return cache.get(realUserId)

  const promessa = buscar(realUserId, planoPago).catch((e) => {
    // Erro não pode ficar grudado no cache: a próxima entrada na Home tenta de novo.
    cache.delete(realUserId)
    throw e
  })

  cache.set(realUserId, promessa)
  return promessa
}

/**
 * Aquece o cache antes de a Home montar o painel. Chamado do Dashboard, que
 * já está na tela enquanto a Home ainda mostra o skeleton.
 */
export function prefetchNovidades(realUserId, opts) {
  if (!realUserId) return
  carregarNovidades(realUserId, opts).catch(() => {})
}

async function buscar(realUserId, planoPago) {
  // As três em paralelo: nenhuma depende do resultado da outra (a lista de
  // "lidas" de um usuário tem no máximo o tamanho do catálogo, dezenas de linhas).
  // Sequencial, isto custava três idas ao banco e era o atraso da barra.
  const [{ data: novidades, error }, { data: lidas }, dispensa] = await Promise.all([
    supabase
      .from('novidades')
      .select('*')
      .eq('ativo', true)
      .lte('publicado_em', new Date().toISOString())
      .order('publicado_em', { ascending: false })
      .limit(LIMITE),
    realUserId
      ? supabase
          .from('novidades_lidas')
          .select('novidade_id, clicado_em')
          .eq('user_id', realUserId)
      : Promise.resolve({ data: [] }),
    realUserId
      ? supabase
          .from('usuarios')
          .select('novidades_dispensadas_em')
          .eq('id', realUserId)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ])

  /* `dispensaDisponivel` existe por causa da migração: enquanto
     sql-criar-dispensa-novidades.sql não tiver rodado, a coluna não existe e
     este select falha. Sem ela não há ONDE gravar a dispensa — e um pop-up que
     não consegue registrar que foi fechado reabre a cada carregamento da Home.
     Então o padrão é fail-safe: coluna ausente, pop-up desligado. A barra e o
     selo "novo pra você" continuam funcionando normalmente. */
  const dispensaDisponivel = !dispensa?.error

  if (error || !novidades) {
    return { lista: [], dispensadoEm: null, dispensaDisponivel }
  }

  const permitido = (publico) =>
    publico === 'todos' ||
    (publico === 'pagantes' && planoPago) ||
    (publico === 'trial' && !planoPago)

  const mapa = new Map((lidas || []).map((l) => [l.novidade_id, l]))

  const lista = novidades
    .filter((n) => permitido(n.publico))
    .map((n) => ({
      ...n,
      visto: mapa.has(n.id),
      clicado: !!mapa.get(n.id)?.clicado_em,
    }))

  return {
    lista,
    dispensadoEm: dispensa?.data?.novidades_dispensadas_em || null,
    dispensaDisponivel,
  }
}

/* Aplica no cache o que acabou de ser gravado. Sem isto, voltar pra Home
   ressuscitaria o selo "novo pra você" — e, pior, reabriria o modal de destaque
   que a pessoa já fechou, porque o cache ainda diria "não visto". */
async function patchCache(realUserId, ids, campos) {
  const pendente = cache.get(realUserId)
  if (!pendente) return
  try {
    const dados = await pendente
    ids.forEach((id) => {
      const item = dados.lista.find((n) => n.id === id)
      if (item) Object.assign(item, campos)
    })
  } catch {
    /* cache já invalidado por erro na busca — nada a corrigir */
  }
}

/**
 * Registra que a pessoa fechou o modal de atualizações. É ISTO que desarma o
 * pop-up: daqui pra frente ele só volta quando existir novidade publicada
 * depois desta marca.
 *
 * Separado de `marcarVistas` de propósito. Fechar o aviso não é o mesmo que ter
 * lido cada novidade dele — se fosse, o selo "novo pra você" da barra sumiria
 * de itens que a pessoa nunca abriu, e ele deixaria de significar qualquer coisa.
 */
export async function dispensarNovidades(realUserId) {
  if (!realUserId) return
  const agora = new Date().toISOString()

  // Corrige o cache antes da rede: sair da Home e voltar não pode reabrir o
  // pop-up enquanto o UPDATE ainda está em voo.
  const pendente = cache.get(realUserId)
  if (pendente) {
    pendente.then((dados) => { dados.dispensadoEm = agora }).catch(() => {})
  }

  await supabase
    .from('usuarios')
    .update({ novidades_dispensadas_em: agora })
    .eq('id', realUserId)
}

/**
 * Marca novidades como vistas. Idempotente: se a linha já existe não sobrescreve
 * o visto_em original (nem apaga o clicado_em de quem já clicou).
 */
export async function marcarVistas(realUserId, ids) {
  if (!realUserId || !ids?.length) return
  patchCache(realUserId, ids, { visto: true })
  await supabase
    .from('novidades_lidas')
    .upsert(
      ids.map((novidade_id) => ({ user_id: realUserId, novidade_id })),
      { onConflict: 'user_id,novidade_id', ignoreDuplicates: true }
    )
}

/**
 * Registra que a pessoa clicou no CTA e foi para a tela da feature.
 * É esta a métrica que vale: "viu" não prova descoberta, "clicou" prova.
 */
export async function registrarClique(realUserId, novidadeId) {
  if (!realUserId || !novidadeId) return
  patchCache(realUserId, [novidadeId], { visto: true, clicado: true })
  await supabase
    .from('novidades_lidas')
    .upsert(
      { user_id: realUserId, novidade_id: novidadeId, clicado_em: new Date().toISOString() },
      { onConflict: 'user_id,novidade_id' }
    )
}
