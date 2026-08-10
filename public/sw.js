/* Service worker do Mensalli.
 *
 * Existe por dois motivos, nessa ordem de importancia:
 *
 * 1) O Chrome/Edge so dispara o `beforeinstallprompt` (o evento que permite o
 *    botao "Instalar" nativo) se a origem tiver um service worker com handler
 *    de fetch. Sem esse arquivo, o banner de instalacao NUNCA aparece no
 *    Android/desktop — so no iOS, que usa passo a passo manual.
 * 2) De quebra, deixa o app abrindo mais rapido e sobrevivendo a uma queda
 *    curta de rede.
 *
 * O cache e deliberadamente conservador: HTML sempre tenta a rede primeiro
 * (senao um deploy novo demoraria a chegar no usuario) e so os bundles com
 * hash no nome (/static/**) ficam em cache-first, porque sao imutaveis.
 * Requisicao pra Supabase, Evolution, pixel etc nem passa por aqui.
 */

const VERSAO = 'v1'
const CACHE_ESTATICO = `mensalli-estatico-${VERSAO}`
const CACHE_HTML = `mensalli-html-${VERSAO}`

// Guardado no install so pra ter um fallback offline minimo.
const SHELL = ['/', '/manifest.json', '/favicon.png', '/logo192.png', '/logo512.png']

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_HTML)
      .then((cache) => cache.addAll(SHELL))
      .catch(() => {}) // um asset faltando nao pode impedir a instalacao
      .then(() => self.skipWaiting())
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((chaves) => Promise.all(
        chaves
          .filter((c) => c.startsWith('mensalli-') && c !== CACHE_ESTATICO && c !== CACHE_HTML)
          .map((c) => caches.delete(c))
      ))
      .then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return

  let url
  try {
    url = new URL(req.url)
  } catch {
    return
  }

  // Nada de outra origem entra em cache (Supabase, Evolution, fontes, pixel).
  if (url.origin !== self.location.origin) return

  // Navegacao (abrir/recarregar uma rota): rede primeiro, cache so como
  // salva-vidas offline. Guarda sempre em '/' porque o CRA serve o mesmo
  // index.html pra qualquer rota do SPA.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copia = res.clone()
          caches.open(CACHE_HTML).then((cache) => cache.put('/', copia)).catch(() => {})
          return res
        })
        .catch(() => caches.match('/').then((hit) => hit || caches.match('/index.html')))
    )
    return
  }

  // Bundles com hash no nome: cache-first, sao imutaveis por definicao.
  if (url.pathname.startsWith('/static/')) {
    event.respondWith(
      caches.match(req).then((hit) => hit || fetch(req).then((res) => {
        if (res && res.ok) {
          const copia = res.clone()
          caches.open(CACHE_ESTATICO).then((cache) => cache.put(req, copia)).catch(() => {})
        }
        return res
      }))
    )
  }
})
