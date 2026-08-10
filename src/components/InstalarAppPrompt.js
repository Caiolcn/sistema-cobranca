import { useState, useEffect, useCallback } from 'react'
import { useLocation } from 'react-router-dom'
import Button from '../design-system/components/Button'
import './InstalarAppPrompt.css'

/* ============================================================
   Convite de instalacao do app (PWA)

   Isto NAO e uma notificacao do navegador: e um card nosso, com
   position: fixed, que aparece na hora que a gente decide. A barrinha
   nativa "Instalar app" do Chrome e justamente cancelada (o
   preventDefault mora no <script> de captura em public/index.html),
   porque ela aparece feia e na hora errada.

   Sao DUAS pecas, e a segunda e a que todo mundo esquece:

     1) public/index.html — script inline que roda ANTES do React,
        segura o evento `beforeinstallprompt` em window.__mensalliInstallPrompt
        e avisa via evento 'mensalli:installprompt'.
     2) este componente.

   O motivo: o navegador dispara o `beforeinstallprompt` UMA vez so, na
   hora que ele quer, e quase sempre na primeira pagina aberta (landing
   ou login). Se so escutassemos o evento aqui dentro — num componente
   que vive na area logada — ele ja teria passado quando o componente
   monta, e o botao "Instalar" nunca apareceria.

   Regras pra nao ser chato:
     - 5s de atraso (aparecer no carregamento atropela a pessoa)
     - o "x" guarda um PRAZO, nao um "sim/nao": some ate a meia-noite
       DELA. Quem diz "agora nao" as 23h ve de novo de manha, que e o
       que "hoje nao" significa
     - `appinstalled` cala o convite pra sempre (da pra instalar pelo
       menu do navegador, sem passar por aqui)

   iOS: nenhum navegador do iPhone dispara `beforeinstallprompt` — por
   imposicao da Apple todo navegador la e o Safari com outra casca. Nao
   existe instalacao por clique. O maximo possivel e ensinar o caminho.
   ============================================================ */

/* Icones em SVG inline, de proposito — o resto do app usa @iconify/react, que
   busca o desenho na API da Iconify em runtime. Aqui isso nao serve: no passo a
   passo do iOS o icone e PARTE DA FRASE ("toque em [compartilhar] na barra do
   navegador"). Se ele nao chegar, sobra "Toque em na barra do navegador" — e a
   pessoa esta procurando um simbolo na tela, nao lendo um manual. */

const IconeCelular = (p) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...p}>
    <rect x="5" y="2" width="14" height="20" rx="2.5" />
    <path d="M12 7v7m0 0l-2.5-2.5M12 14l2.5-2.5" />
  </svg>
)

const IconeDownload = (p) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...p}>
    <path d="M12 3v12m0 0l-4-4m4 4l4-4M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2" />
  </svg>
)

const IconeFechar = (p) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
    strokeLinecap="round" aria-hidden="true" {...p}>
    <path d="M6 6l12 12M18 6L6 18" />
  </svg>
)

// O botao "Compartilhar" do iOS: quadrado com seta pra cima saindo dele
const IconeCompartilharIOS = (p) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...p}>
    <path d="M12 3v12" />
    <path d="M8.5 6.5L12 3l3.5 3.5" />
    <path d="M7 11H5.5A1.5 1.5 0 004 12.5v7A1.5 1.5 0 005.5 21h13a1.5 1.5 0 001.5-1.5v-7A1.5 1.5 0 0018.5 11H17" />
  </svg>
)

const IconeAdicionar = (p) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...p}>
    <rect x="3.5" y="3.5" width="17" height="17" rx="3.5" />
    <path d="M12 8.5v7M8.5 12h7" />
  </svg>
)

const CHAVE_SNOOZE = 'mensalli_pwa_snooze_ate'
const CHAVE_INSTALADO = 'mensalli_pwa_instalado'
const ATRASO_MS = 5000

// So faz sentido dentro do produto. Na landing/login a pessoa ainda nem
// sabe o que e o Mensalli.
const ROTAS_PERMITIDAS = ['/app', '/portal']

function jaEstaInstalado() {
  try {
    if (localStorage.getItem(CHAVE_INSTALADO) === '1') return true
  } catch { /* modo privado bloqueia o storage */ }
  return (
    window.matchMedia?.('(display-mode: standalone)').matches === true ||
    window.navigator.standalone === true
  )
}

function estaEmSnooze() {
  try {
    const ate = Number(localStorage.getItem(CHAVE_SNOOZE))
    return Number.isFinite(ate) && ate > Date.now()
  } catch {
    return false
  }
}

// "Hoje nao" = ate a meia-noite local, nao "daqui 24h".
function proximaMeiaNoite() {
  const d = new Date()
  d.setHours(24, 0, 0, 0)
  return d.getTime()
}

function ehIOS() {
  const ua = navigator.userAgent || ''
  // Desde o iPadOS 13 o iPad mente no user agent e se declara "Macintosh";
  // o maxTouchPoints desempata (Mac de verdade nao tem toque).
  const iPadDisfarcado = /Macintosh/.test(ua) && navigator.maxTouchPoints > 1
  return /iPad|iPhone|iPod/.test(ua) || iPadDisfarcado
}

// Firefox e Edge no iOS nem tem "Adicionar a Tela de Inicio" no menu de
// compartilhar — ensinar o caminho ali so gera frustracao.
function iOSPodeAdicionar() {
  return !/FxiOS|EdgiOS/.test(navigator.userAgent || '')
}

export default function InstalarAppPrompt() {
  const { pathname } = useLocation()
  const [visivel, setVisivel] = useState(false)
  const [prompt, setPrompt] = useState(null)
  const [modoIOS, setModoIOS] = useState(false)

  const rotaPermitida = ROTAS_PERMITIDAS.some(
    (r) => pathname === r || pathname.startsWith(`${r}/`)
  )

  useEffect(() => {
    if (!rotaPermitida) return
    if (jaEstaInstalado() || estaEmSnooze()) return

    let timer = null
    const mostrarDepois = () => {
      if (timer) return
      timer = setTimeout(() => setVisivel(true), ATRASO_MS)
    }

    // Caso 1 — iPhone/iPad: nao ha evento nenhum pra esperar, e o caminho
    // e sempre manual.
    if (ehIOS()) {
      if (!iOSPodeAdicionar()) return
      setModoIOS(true)
      mostrarDepois()
      return () => clearTimeout(timer)
    }

    // Caso 2 — Android/desktop: o evento pode JA ter acontecido (capturado
    // la no index.html) ou ainda estar por vir.
    const aceitar = (evento) => {
      if (!evento) return
      setPrompt(evento)
      mostrarDepois()
    }

    aceitar(window.__mensalliInstallPrompt)

    const aoCapturar = () => aceitar(window.__mensalliInstallPrompt)
    const aoInstalar = () => {
      clearTimeout(timer)
      setVisivel(false)
      setPrompt(null)
    }

    window.addEventListener('mensalli:installprompt', aoCapturar)
    window.addEventListener('appinstalled', aoInstalar)
    return () => {
      clearTimeout(timer)
      window.removeEventListener('mensalli:installprompt', aoCapturar)
      window.removeEventListener('appinstalled', aoInstalar)
    }
  }, [rotaPermitida])

  const instalar = useCallback(async () => {
    if (!prompt) return
    // prompt() e de uso unico: zera ANTES do await, senao um clique duplo
    // estoura ("prompt() can only be called once").
    setPrompt(null)
    window.__mensalliInstallPrompt = null
    try {
      // O await no prompt() nao e enfeite: ele devolve uma Promise e, sem o
      // await, uma rejeicao vira "unhandled rejection" — que em dev abre o
      // overlay vermelho do CRA com a stack trace por cima da tela inteira.
      await prompt.prompt()
      const { outcome } = await prompt.userChoice
      if (outcome === 'accepted') {
        try { localStorage.setItem(CHAVE_INSTALADO, '1') } catch { /* noop */ }
      } else {
        try { localStorage.setItem(CHAVE_SNOOZE, String(proximaMeiaNoite())) } catch { /* noop */ }
      }
    } catch { /* navegador recusou abrir o dialogo */ }
    setVisivel(false)
  }, [prompt])

  const dispensar = useCallback(() => {
    try { localStorage.setItem(CHAVE_SNOOZE, String(proximaMeiaNoite())) } catch { /* noop */ }
    setVisivel(false)
  }, [])

  if (!visivel || !rotaPermitida) return null
  // No Android/desktop sem evento capturado nao ha o que oferecer.
  if (!modoIOS && !prompt) return null

  return (
    <div className="pwa-prompt" role="dialog" aria-label="Instalar o app do Mensalli">
      <div className="pwa-prompt__icone">
        <IconeCelular width={24} height={24} />
      </div>

      <div className="pwa-prompt__corpo">
        <div className="pwa-prompt__titulo">Instalar o app</div>
        <div className="pwa-prompt__texto">Acesso rápido direto da tela inicial.</div>

        {modoIOS ? (
          <div className="pwa-prompt__passos">
            <div className="pwa-prompt__passo">
              <span className="pwa-prompt__passo-num">1</span>
              {/* "na barra do navegador", sem dizer em cima ou embaixo: a
                  posicao do icone Compartilhar muda entre Safari e Chrome,
                  iPhone e iPad */}
              <span>
                Toque em{' '}
                <IconeCompartilharIOS width={15} height={15} className="pwa-prompt__passo-icone" />{' '}
                na barra do navegador
              </span>
            </div>
            <div className="pwa-prompt__passo">
              <span className="pwa-prompt__passo-num">2</span>
              {/* Passo mais importante: "Adicionar a Tela de Inicio" NAO
                  aparece na primeira tela do menu de compartilhar do iOS.
                  Sem esta linha a pessoa abre o menu, nao acha e desiste. */}
              <span>Role a lista e toque em <strong>Mais</strong></span>
            </div>
            <div className="pwa-prompt__passo">
              <span className="pwa-prompt__passo-num">3</span>
              <span>
                Escolha{' '}
                <IconeAdicionar width={15} height={15} className="pwa-prompt__passo-icone" />{' '}
                <strong>Adicionar à Tela de Início</strong>
              </span>
            </div>
          </div>
        ) : (
          <div className="pwa-prompt__acao">
            <Button
              variant="primary"
              size="sm"
              icon={<IconeDownload width={16} height={16} />}
              onClick={instalar}
            >
              Instalar
            </Button>
          </div>
        )}
      </div>

      <button
        type="button"
        className="pwa-prompt__fechar"
        onClick={dispensar}
        aria-label="Agora não"
        title="Agora não"
      >
        <IconeFechar width={18} height={18} />
      </button>
    </div>
  )
}
