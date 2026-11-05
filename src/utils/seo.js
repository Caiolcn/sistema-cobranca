// Canonical e og:url por página pública.
//
// O public/index.html traz <link rel="canonical"> e og:url fixos na home.
// Sem trocar isso, as landings de nicho diziam ao Google "a versão oficial
// sou a home" e nunca ranqueavam. Cada landing chama aplicarCanonical no
// useEffect e devolve o retorno como cleanup: ao sair da página (navegação
// do SPA), os valores da home voltam.

const SITE = 'https://www.mensalli.com.br'

function elementoCanonical() {
  let el = document.querySelector('link[rel="canonical"]')
  if (!el) {
    el = document.createElement('link')
    el.setAttribute('rel', 'canonical')
    document.head.appendChild(el)
  }
  return el
}

function elementoOgUrl() {
  let el = document.querySelector('meta[property="og:url"]')
  if (!el) {
    el = document.createElement('meta')
    el.setAttribute('property', 'og:url')
    document.head.appendChild(el)
  }
  return el
}

export function aplicarCanonical(caminho) {
  const url = SITE + caminho
  const canonical = elementoCanonical()
  const ogUrl = elementoOgUrl()
  const canonicalAnterior = canonical.getAttribute('href')
  const ogUrlAnterior = ogUrl.getAttribute('content')

  canonical.setAttribute('href', url)
  ogUrl.setAttribute('content', url)

  return () => {
    if (canonicalAnterior) canonical.setAttribute('href', canonicalAnterior)
    if (ogUrlAnterior) ogUrl.setAttribute('content', ogUrlAnterior)
  }
}
