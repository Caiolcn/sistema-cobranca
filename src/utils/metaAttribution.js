/**
 * Atribuição do Meta (clique do anúncio → cadastro)
 *
 * Sem `_fbp`/`_fbc` o evento que sai do servidor (Conversions API) não casa com
 * o clique que o Meta pagou — ele até entra, mas com match ruim e sem crédito
 * pra campanha. Por isso a gente captura os cookies do pixel + as UTMs assim
 * que a pessoa chega e guarda no navegador até o cadastro acontecer, que pode
 * ser dias depois.
 *
 * Regra de first-touch: o que ficou gravado NÃO é sobrescrito por uma visita
 * orgânica posterior. Quem trouxe a pessoa foi o primeiro toque.
 */

const STORAGE_KEY = 'mensalli_meta_attr'

// 90 dias — mesma janela de atribuição padrão de clique do Meta.
const VALIDADE_MS = 90 * 24 * 60 * 60 * 1000

const lerCookie = (nome) => {
  if (typeof document === 'undefined') return null
  const match = document.cookie.match(new RegExp(`(^|;\\s*)${nome}=([^;]*)`))
  return match ? decodeURIComponent(match[2]) : null
}

const lerStorage = () => {
  try {
    const bruto = window.localStorage.getItem(STORAGE_KEY)
    if (!bruto) return null
    const dados = JSON.parse(bruto)
    if (dados?.capturado_em && Date.now() - dados.capturado_em > VALIDADE_MS) return null
    return dados
  } catch {
    return null
  }
}

/**
 * Captura o contexto do clique. Chamar uma vez, no boot do app.
 * Idempotente: se já tem first-touch guardado, só completa o que faltava
 * (o `_fbp` costuma nascer depois, quando o pixel termina de carregar).
 */
export const capturarAtribuicao = () => {
  if (typeof window === 'undefined') return null

  try {
    const params = new URLSearchParams(window.location.search)
    const fbclid = params.get('fbclid')

    // O pixel monta o _fbc sozinho a partir do fbclid, mas leva alguns ms.
    // Se a pessoa cadastrar rápido demais, a gente perde — então monta aqui
    // no mesmo formato (fb.1.<timestamp>.<fbclid>) como rede de segurança.
    const fbc = lerCookie('_fbc') || (fbclid ? `fb.1.${Date.now()}.${fbclid}` : null)

    const anterior = lerStorage()

    const atual = {
      fbp: lerCookie('_fbp') || anterior?.fbp || null,
      fbc: anterior?.fbc || fbc || null,
      fbclid: anterior?.fbclid || fbclid || null,
      utm_source: anterior?.utm_source || params.get('utm_source') || null,
      utm_medium: anterior?.utm_medium || params.get('utm_medium') || null,
      utm_campaign: anterior?.utm_campaign || params.get('utm_campaign') || null,
      utm_content: anterior?.utm_content || params.get('utm_content') || null,
      utm_term: anterior?.utm_term || params.get('utm_term') || null,
      landing_url: anterior?.landing_url || window.location.href,
      user_agent: window.navigator?.userAgent || null,
      capturado_em: anterior?.capturado_em || Date.now()
    }

    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(atual))
    return atual
  } catch {
    // localStorage bloqueado (aba anônima, cookie policy). Não pode derrubar o app.
    return null
  }
}

/** Devolve a atribuição guardada, já atualizada com o _fbp mais recente. */
export const obterAtribuicao = () => capturarAtribuicao() || lerStorage()

/**
 * ID único do evento. O MESMO id vai no pixel (navegador) e na CAPI (servidor)
 * — é isso que faz o Meta entender que são o mesmo evento e não contar duas vezes.
 */
export const gerarEventId = (prefixo) => {
  const aleatorio =
    typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `${Date.now()}${Math.random().toString(36).slice(2)}`
  return `${prefixo}_${aleatorio}`
}
