// ==========================================
// /comece — página de VSL antes do cadastro (tráfego pago)
//
// Veio de docs/vsl-prototipo.html. Mesmo visual e comportamento:
// - Modo "aberto" (padrão): a página toda aparece desde o início.
// - Modo "delay" (?modo=delay): só o vídeo; o resto abre quando o vídeo
//   chega em 80% com som, ou no link "Já conheço o Mensalli". Depois de
//   revelada uma vez, fica revelada naquele navegador.
//
// Atribuição: o capturarAtribuicao() do App.js já guarda UTMs/fbclid no boot
// (landing_url = /comece...). Os botões repassam as mesmas UTMs no link do
// /signup só como reforço — é o mesmo caminho, nada paralelo.
//
// noindex: é página de anúncio com o mesmo conteúdo da home; não entra no
// Google nem no sitemap. O meta é removido ao sair, senão a navegação SPA
// levaria o noindex pra home.
// ==========================================

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { PLANOS } from '../planosMensalli'
import { trackViewContent } from '../utils/metaPixel'
import './VslComece.css'

const VSL_URL = '/vsl.mp4'
const VSL_POSTER = '/vsl-poster.jpg'
const REVELAR_EM = 0.8
const WHATSAPP = '5562981618862'
const WHATSAPP_TEXTO = 'Oi! Vi o vídeo do Mensalli e fiquei com uma dúvida.'
const WHATSAPP_URL = `https://wa.me/${WHATSAPP}?text=${encodeURIComponent(WHATSAPP_TEXTO)}`
const CHAVE_REVELADO = 'mensalli_vsl_revelado'
const PARAMS_CAMPANHA = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'fbclid']

const TITULO = 'Mensalli — Veja como funciona em 1 minuto'
const DESCRICAO = 'Cobrança automática de mensalidades pelo WhatsApp. Assista ao vídeo, veja os planos e teste grátis por 3 dias.'
const FONTE_EXTRA = 'https://fonts.googleapis.com/css2?family=Inter:wght@800;900&display=swap'

// Loja online é vendida por fora (add-on Mensalli Vendas): não aparece na VSL.
const esconderNaVsl = (feature) => /^loja online/i.test(feature)

const lerStorage = (k) => { try { return window.localStorage.getItem(k) } catch { return null } }
const gravarStorage = (k, v) => { try { window.localStorage.setItem(k, v) } catch { /* aba anônima */ } }

// Eventos personalizados do pixel (VSL_*). Medição nunca derruba a página.
function track(nome, dados) {
  try { if (window.fbq) window.fbq('trackCustom', nome, dados || {}) } catch { /* sem pixel */ }
}

// Mexe num <meta> do <head> e devolve como desfazer.
function trocarMeta(nome, conteudo, attr = 'name') {
  let el = document.querySelector(`meta[${attr}="${nome}"]`)
  const criado = !el
  const anterior = el ? el.getAttribute('content') : null
  if (!el) {
    el = document.createElement('meta')
    el.setAttribute(attr, nome)
    document.head.appendChild(el)
  }
  el.setAttribute('content', conteudo)
  return () => {
    if (criado) el.remove()
    else el.setAttribute('content', anterior)
  }
}

const Ico = ({ id, size = 18, style }) => (
  <svg width={size} height={size} style={style} aria-hidden="true"><use href={`#vsl-i-${id}`} /></svg>
)

const Sprite = () => (
  <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true">
    <symbol id="vsl-i-check" viewBox="0 0 24 24"><path fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" d="M5 12.5l4.2 4.2L19 7" /></symbol>
    <symbol id="vsl-i-x" viewBox="0 0 24 24"><path fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" d="M7 7l10 10M17 7L7 17" /></symbol>
    <symbol id="vsl-i-arrow" viewBox="0 0 24 24"><path fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" d="M5 12h14M13 6l6 6-6 6" /></symbol>
    <symbol id="vsl-i-plus" viewBox="0 0 24 24"><path fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" d="M12 5v14M5 12h14" /></symbol>
    <symbol id="vsl-i-play" viewBox="0 0 24 24"><path fill="currentColor" d="M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z" /></symbol>
    <symbol id="vsl-i-wa" viewBox="0 0 24 24"><path fill="currentColor" d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38a9.9 9.9 0 0 0 4.74 1.21c5.46 0 9.91-4.45 9.91-9.91S17.5 2 12.04 2zm5.8 14.13c-.24.68-1.42 1.3-1.95 1.35-.5.05-1.13.07-1.82-.11-.42-.13-.96-.31-1.65-.61-2.9-1.25-4.79-4.17-4.94-4.36-.14-.19-1.18-1.57-1.18-3s.75-2.13 1.02-2.42c.27-.29.58-.36.78-.36h.56c.18 0 .42-.07.66.5.24.58.82 2.01.89 2.16.07.15.12.32.02.51-.1.19-.15.31-.29.48-.15.17-.31.38-.44.51-.15.15-.3.31-.13.6.17.29.76 1.25 1.63 2.03 1.12 1 2.06 1.31 2.35 1.45.29.15.46.12.63-.07.17-.19.73-.85.92-1.14.19-.29.39-.24.65-.15.27.1 1.69.8 1.98.94.29.15.48.22.56.34.07.12.07.7-.17 1.38z" /></symbol>
    <symbol id="vsl-i-bell" viewBox="0 0 24 24"><path fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" d="M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15L6 16zM10 20a2 2 0 0 0 4 0" /></symbol>
    <symbol id="vsl-i-edit" viewBox="0 0 24 24"><path fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" d="M4 20h4L19 9l-4-4L4 16v4zM13.5 6.5l4 4" /></symbol>
    <symbol id="vsl-i-chart" viewBox="0 0 24 24"><path fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" d="M4 20V4M4 20h16M8 16v-4M12 16V8M16 16v-6" /></symbol>
    <symbol id="vsl-i-phone" viewBox="0 0 24 24"><rect x="6" y="2.5" width="12" height="19" rx="2.5" fill="none" stroke="currentColor" strokeWidth="2.2" /><path stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" d="M11 18h2" /></symbol>
    <symbol id="vsl-i-list" viewBox="0 0 24 24"><path fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" d="M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01" /></symbol>
    <symbol id="vsl-i-shield" viewBox="0 0 24 24"><path fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round" d="M12 3l7 3v5c0 4.5-3 8.3-7 10-4-1.7-7-5.5-7-10V6l7-3z" /></symbol>
  </svg>
)

const ABAS = [
  {
    id: 1, icone: 'bell', rotulo: 'Cobrança automática',
    titulo: 'A régua de cobrança trabalha por você',
    texto: 'Ligue os envios que fazem sentido pro seu negócio e o Mensalli manda tudo sozinho pelo seu WhatsApp.',
    itens: ['3 dias antes do vencimento', 'No dia, com a chave Pix pra pagar na hora', '3 dias depois, só se continuar em aberto', 'Confirmação de pagamento automática'],
    img: '/automacoes.png', alt: 'Tela de automações do Mensalli com os envios de cobrança ligados'
  },
  {
    id: 2, icone: 'edit', rotulo: 'Mensagens do seu jeito',
    titulo: 'Mensagens com a sua cara, que não parecem robô',
    texto: 'Os textos já vêm prontos. Edite o que quiser e veja na hora como chega no WhatsApp do aluno.',
    itens: ['Nome, valor, vencimento e Pix preenchidos sozinhos', 'Um texto para cada momento da cobrança', 'Sai do seu número, com o seu tom'],
    img: '/templates.png', alt: 'Editor de mensagens do Mensalli com prévia do WhatsApp'
  },
  {
    id: 3, icone: 'chart', rotulo: 'Financeiro',
    titulo: 'Saiba quem pagou e quanto tem a receber',
    texto: 'Em atraso, próximos vencimentos e recebido do mês logo no topo. Nenhuma mensalidade passa batido.',
    itens: ['Total em atraso e mensalidades pendentes', 'O que vence hoje e nos próximos 7 dias', 'Receita do mês e recorrente no painel'],
    img: '/mensalidades.png', alt: 'Tela de mensalidades com valores em atraso, a vencer e recebidos'
  },
  {
    id: 4, icone: 'phone', rotulo: 'Portal do aluno',
    titulo: 'Seu aluno paga em poucos cliques',
    texto: 'A cobrança leva o link do portal. O aluno abre no celular, vê o que está em aberto e paga sem precisar te chamar.',
    itens: ['Pix, cartão de crédito ou boleto, via Asaas', 'Link enviado junto da cobrança', 'Pagou, a régua para de enviar'],
    img: '/portal-aluno.png', alt: 'Portal do aluno no celular com mensalidade pendente e botão de pagar', celular: true
  },
  {
    id: 5, icone: 'list', rotulo: 'Fila de quem atrasou',
    titulo: 'Quem atrasou aparece numa fila',
    texto: 'Os alunos que precisam de atenção ficam separados, com o valor e há quantos dias estão em atraso. Um toque e você fala com ele no WhatsApp.',
    itens: ['Há quanto tempo cada um está devendo', 'Acesso direto à conversa'],
    img: '/fila-whatsapp.png', alt: 'Fila de WhatsApp com alunos em atraso'
  }
]

const DEPOIMENTOS = [
  { video: '/depoimentos/carol-ribeiro.mp4', capa: '/depoimentos/carol-ribeiro.jpg', nome: 'Carol Ribeiro', negocio: 'Studio de Pilates', aria: 'Assistir depoimento de Carol Ribeiro, Studio de Pilates' },
  { video: '/depoimentos/treinador-george.mp4', capa: '/depoimentos/treinador-george.jpg', nome: 'Treinador George', negocio: 'Escolinha Portovilla', aria: 'Assistir depoimento do Treinador George, Escolinha Portovilla' },
  { video: '/depoimentos/treinador-maguilla.mp4', capa: '/depoimentos/treinador-maguilla.jpg', nome: 'Treinador Maguilla', negocio: 'CT Personal Fight Trainer', aria: 'Assistir depoimento do Treinador Maguilla, CT Personal Fight Trainer' }
]

const FAQ = [
  { p: 'Como funciona a conexão com o WhatsApp?', r: 'Você escaneia um QR Code que vincula seu número ao sistema, igual ao WhatsApp Web. As mensagens saem do seu número, mantendo o relacionamento direto com os alunos.' },
  { p: 'O WhatsApp pode bloquear meu número?', r: 'Usando corretamente, não. O Mensalli envia apenas para alunos que você cadastrou, sem spam.' },
  { p: 'Preciso instalar alguma coisa?', r: 'Não. É 100% online, funciona no navegador do computador e do celular.' },
  { p: 'Vocês cadastram meus alunos pra mim?', r: 'Sim. Depois de criar sua conta, é só mandar sua lista no WhatsApp (planilha, print ou foto) que a gente cadastra.' },
  { p: 'Quais formas de pagamento meus alunos podem usar?', r: 'Pix direto na sua chave, ou Pix, cartão de crédito e boleto via Asaas, pelo link de pagamento.' },
  { p: 'Posso cancelar quando quiser?', r: 'Sim, sem multa e sem burocracia. Cancele direto no painel e o sistema para de cobrar no próximo ciclo.' },
  { p: 'O que acontece depois dos 3 dias grátis?', r: 'Você escolhe o plano que cabe no seu número de alunos e continua usando. Se não quiser continuar, não paga nada.' }
]

const formatarPreco = (v) => Number(v).toFixed(2).replace('.', ',')
const formatarNumero = (n) => Number(n).toLocaleString('pt-BR')

export default function VslComece() {
  const { search } = useLocation()
  const qs = useMemo(() => new URLSearchParams(search), [search])
  const modo = qs.get('modo') === 'delay' ? 'delay' : 'aberto'

  const [revelado, setRevelado] = useState(() => modo !== 'delay' || lerStorage(CHAVE_REVELADO) === '1')
  const [animarRevelacao, setAnimarRevelacao] = useState(false)
  const [iniciado, setIniciado] = useState(false)
  const [progresso, setProgresso] = useState(0)
  const [abaAtiva, setAbaAtiva] = useState(1)
  const [depAbertos, setDepAbertos] = useState([])
  const [stickyVisivel, setStickyVisivel] = useState(false)

  const videoRef = useRef(null)
  const vslRef = useRef(null)
  const conteudoRef = useRef(null)
  const abasRef = useRef([])
  const depVideosRef = useRef({})
  const marcasRef = useRef({})
  const reveladoRef = useRef(revelado)

  // Link do cadastro com as UTMs/fbclid da campanha (+ origem e plano).
  const linkSignup = useCallback((plano) => {
    const p = new URLSearchParams()
    PARAMS_CAMPANHA.forEach((k) => { if (qs.get(k)) p.set(k, qs.get(k)) })
    p.set('origem', 'vsl')
    if (plano) p.set('plano', plano)
    return `/signup?${p.toString()}`
  }, [qs])

  const cliqueCadastro = (plano) => () => track('VSL_clique_cadastro', { plano: plano || '' })
  const cliqueWhatsapp = () => track('VSL_clique_whatsapp')

  // Título, descrição, noindex e a Inter 800/900 só enquanto a página está aberta.
  useEffect(() => {
    trackViewContent('vsl-comece')
    const tituloAnterior = document.title
    document.title = TITULO
    const desfazer = [
      trocarMeta('description', DESCRICAO),
      trocarMeta('robots', 'noindex, follow')
    ]
    const fonte = document.createElement('link')
    fonte.rel = 'stylesheet'
    fonte.href = FONTE_EXTRA
    document.head.appendChild(fonte)
    return () => {
      document.title = tituloAnterior
      desfazer.forEach((f) => f())
      fonte.remove()
    }
  }, [])

  const revelar = useCallback((rolar) => {
    if (reveladoRef.current) return
    reveladoRef.current = true
    setRevelado(true)
    setAnimarRevelacao(true)
    gravarStorage(CHAVE_REVELADO, '1')
    track('VSL_pagina_aberta')
    if (rolar) {
      setTimeout(() => { conteudoRef.current?.scrollIntoView({ behavior: 'smooth' }) }, 150)
    }
  }, [])

  // Começa mudo em autoplay pra prender o olho. O React não escreve o
  // atributo `muted` no HTML, e sem ele o iPhone não faz autoplay: liga no
  // elemento antes do play().
  useEffect(() => {
    const v = videoRef.current
    if (!v) return
    v.muted = true
    v.defaultMuted = true
    v.setAttribute('muted', '')
    v.play().catch(() => {})
  }, [])

  const aoAtualizarVideo = () => {
    const v = videoRef.current
    if (!v || v.muted || !v.duration) return
    const p = v.currentTime / v.duration
    setProgresso(p)
    ;[0.25, 0.5, 0.8, 1].forEach((m) => {
      if (p >= m && !marcasRef.current[m]) {
        marcasRef.current[m] = true
        track('VSL_' + Math.round(m * 100))
      }
    })
    if (p >= REVELAR_EM) revelar(false)
  }

  // O evento "ended" garante o 100% (o último timeupdate às vezes para em 99,x%).
  const aoTerminarVideo = () => {
    const v = videoRef.current
    if (!v || v.muted) return
    setProgresso(1)
    if (!marcasRef.current[1]) { marcasRef.current[1] = true; track('VSL_100') }
    revelar(false)
  }

  const assistirComSom = () => {
    const v = videoRef.current
    if (!v) return
    v.muted = false
    v.currentTime = 0
    v.play().catch(() => {})
    setIniciado(true)
    track('VSL_play')
  }

  const pausarOuTocar = () => {
    const v = videoRef.current
    if (!v || !iniciado) return
    if (v.paused) v.play().catch(() => {})
    else v.pause()
  }

  // Barra "otimista": anda mais rápido no começo.
  const larguraBarra = (progresso < 1 ? 1 - Math.pow(1 - progresso, 1.6) : 1) * 100

  // Barra fixa no celular depois que passa do vídeo (só com a página aberta).
  useEffect(() => {
    const aoRolar = () => {
      const el = vslRef.current
      if (!el) return
      setStickyVisivel(el.getBoundingClientRect().bottom < 0 && reveladoRef.current)
    }
    window.addEventListener('scroll', aoRolar, { passive: true })
    return () => window.removeEventListener('scroll', aoRolar)
  }, [])

  const teclaAba = (i) => (e) => {
    const n = e.key === 'ArrowDown' || e.key === 'ArrowRight' ? 1 : e.key === 'ArrowUp' || e.key === 'ArrowLeft' ? -1 : 0
    if (!n) return
    e.preventDefault()
    const prox = (i + n + ABAS.length) % ABAS.length
    setAbaAtiva(ABAS[prox].id)
    abasRef.current[prox]?.focus()
  }

  // Depoimento: o vídeo só carrega no clique; os outros pausam.
  const abrirDepoimento = (d) => {
    if (depAbertos.includes(d.video)) return
    Object.values(depVideosRef.current).forEach((v) => { try { v && v.pause() } catch { /* ok */ } })
    setDepAbertos((lista) => [...lista, d.video])
    track('VSL_depoimento', { video: d.video.replace(/^\//, '') })
  }

  const planos = PLANOS.map((p) => ({
    ...p,
    // O primeiro item é o "Até N clientes ativos", que já vai na caixa verde.
    itens: p.features.slice(1).filter((f) => !esconderNaVsl(f))
  }))

  const classeConteudo = `reveal${animarRevelacao ? ' reveal-anim' : ''}`

  return (
    <div className={`vsl-pg${revelado ? '' : ' locked'}`}>
      <Sprite />

      <header className="top">
        <div className="wrap">
          <img src="/Logo-Full.png" alt="Mensalli" width="117" height="30" />
          <span className="top-tag">Cobrança automática pelo WhatsApp</span>
        </div>
      </header>

      {/* ===================== HERO + VSL ===================== */}
      <section className="hero" id="topo">
        <div className="wrap">
          <span className="pill"><i></i> Assista antes de criar sua conta · 1 minuto</span>
          <h1>Nunca mais cobre aluno por aluno <span>no WhatsApp.</span></h1>
          <p className="lead">Veja em 1 minuto como o Mensalli cobra seus alunos sozinho, do seu próprio número, antes, no dia e depois do vencimento.</p>

          <div className="vsl" ref={vslRef}>
            <video
              ref={videoRef}
              src={VSL_URL}
              poster={VSL_POSTER}
              playsInline
              muted
              autoPlay
              preload="metadata"
              onTimeUpdate={aoAtualizarVideo}
              onEnded={aoTerminarVideo}
              onClick={pausarOuTocar}
            />

            {!iniciado && (
              <button className="vsl-overlay" type="button" aria-label="Assistir ao vídeo com som" onClick={assistirComSom}>
                <span className="vsl-play"><Ico id="play" size={38} style={{ color: '#05230f', marginLeft: 4 }} /></span>
                <strong>Clique para assistir com som</strong>
                <small>Dura cerca de 1 minuto</small>
              </button>
            )}
            <div className="vsl-bar" aria-hidden="true"><span style={{ width: `${larguraBarra.toFixed(1)}%` }}></span></div>
          </div>

          <p className="waiting">Assista ao vídeo: <b>os planos e o botão de cadastro aparecem logo abaixo</b> quando ele estiver terminando.<br />
            <button className="hero-skip" type="button" onClick={() => { track('VSL_pulou'); revelar(true) }}>Já conheço o Mensalli, quero ver os planos</button>
          </p>

          <div className="hero-cta">
            <Link className="btn btn-main" to={linkSignup()} onClick={cliqueCadastro()}>Criar minha conta grátis <Ico id="arrow" size={20} /></Link>
            <span className="btn-sub">3 dias grátis · sem cartão de crédito · cancele quando quiser</span>
          </div>

          <div className="proof">
            <div><strong>+5.000</strong><span>alunos cobrados pelo Mensalli</span></div>
            <div><strong>+8.500</strong><span>mensagens de cobrança enviadas</span></div>
            <div><strong>R$ 490 mil</strong><span>em mensalidades administradas</span></div>
          </div>
        </div>
      </section>

      <main className={classeConteudo} id="conteudo" ref={conteudoRef}>

        {/* ===================== ANTES x DEPOIS ===================== */}
        <section className="sec">
          <div className="wrap narrow">
            <div className="sec-head">
              <span className="eyebrow">O que muda na sua rotina</span>
              <h2>Cobrar não precisa ser a pior parte do seu mês.</h2>
            </div>
            <div className="compare">
              <div className="cmp bad">
                <h3><Ico id="x" size={22} style={{ color: '#dc2626' }} /> Cobrando na mão</h3>
                <ul>
                  {['Manda mensagem aluno por aluno, todo mês', 'Esquece quem já pagou e quem está devendo', 'Fica sem graça de cobrar quem atrasou', 'Controle espalhado em caderno e planilha'].map((t) => (
                    <li key={t}><Ico id="x" style={{ color: '#dc2626' }} />{t}</li>
                  ))}
                </ul>
              </div>
              <div className="cmp good">
                <h3><Ico id="check" size={22} style={{ color: 'var(--green)' }} /> Com o Mensalli</h3>
                <ul>
                  {['A cobrança sai sozinha, do seu WhatsApp', 'Lembrete antes, no dia e depois do vencimento', 'Pagou, a régua para de mandar mensagem', 'Você vê num olhar quem pagou e quem deve'].map((t) => (
                    <li key={t}><Ico id="check" style={{ color: 'var(--green)' }} />{t}</li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </section>

        {/* ===================== PARA QUEM É ===================== */}
        <section className="sec" style={{ background: 'var(--soft)', paddingTop: 72 }}>
          <div className="wrap">
            <div className="sec-head">
              <span className="eyebrow">Para quem é</span>
              <h2>Feito para quem vive de mensalidade.</h2>
            </div>
            <div className="niches">
              <div className="niche"><img src="/nichos/escolinhas.jpg" alt="" loading="lazy" /><span>Escolinhas de futebol</span></div>
              <div className="niche"><img src="/nichos/luta.jpg" alt="" loading="lazy" /><span>CTs e academias de luta</span></div>
              <div className="niche"><img src="/nichos/pilates.jpg" alt="" loading="lazy" /><span>Studios de pilates e dança</span></div>
              <div className="niche"><img src="/nichos/natacao.jpg" alt="" loading="lazy" /><span>Escolas de natação</span></div>
            </div>
            <p className="niche-more">E também personal trainers, academias pequenas, escolas de música e reforço escolar.</p>
          </div>
        </section>

        {/* ===================== COMO FUNCIONA ===================== */}
        <section className="sec">
          <div className="wrap">
            <div className="sec-head">
              <span className="eyebrow">Como funciona</span>
              <h2>Configure uma vez. <span className="hl">O Mensalli cobra todo mês.</span></h2>
              <p>Uns 5 minutos de configuração e, daí pra frente, a cobrança roda sozinha.</p>
            </div>
            <div className="steps">
              <div className="step">
                <div className="step-n">1</div>
                <h3>Conecte seu WhatsApp</h3>
                <p>Escaneie um QR Code, igual ao WhatsApp Web. As mensagens saem do seu número.</p>
                <em>Leva menos de 1 minuto</em>
              </div>
              <div className="step">
                <div className="step-n">2</div>
                <h3>Cadastre seus alunos</h3>
                <p>Nome, WhatsApp, valor e dia de vencimento. Veio de planilha? Dá pra importar.</p>
                <em>Ou a gente cadastra pra você</em>
              </div>
              <div className="step">
                <div className="step-n">3</div>
                <h3>Pronto, ele cobra sozinho</h3>
                <p>Os textos já vêm prontos, com nome, valor e chave Pix. Você ajusta do seu jeito.</p>
                <em>Funciona 24h, todo mês</em>
              </div>
            </div>
          </div>
        </section>

        {/* ===================== FUNCIONALIDADES ===================== */}
        <section className="sec" style={{ background: 'var(--soft)' }}>
          <div className="wrap">
            <div className="sec-head">
              <span className="eyebrow">Por dentro do sistema</span>
              <h2>Tudo que você precisa para receber em dia.</h2>
            </div>
            <div className="feat">
              <div className="tabs" role="tablist" aria-label="Funcionalidades">
                {ABAS.map((a, i) => (
                  <button
                    key={a.id}
                    ref={(el) => { abasRef.current[i] = el }}
                    className="tab"
                    role="tab"
                    id={`vsl-t${a.id}`}
                    aria-controls={`vsl-p${a.id}`}
                    aria-selected={abaAtiva === a.id ? 'true' : 'false'}
                    tabIndex={abaAtiva === a.id ? 0 : -1}
                    onClick={() => setAbaAtiva(a.id)}
                    onKeyDown={teclaAba(i)}
                    type="button"
                  >
                    <Ico id={a.icone} size={22} />{a.rotulo}
                  </button>
                ))}
              </div>

              <div>
                {ABAS.map((a) => (
                  <div key={a.id} className="panel" role="tabpanel" id={`vsl-p${a.id}`} aria-labelledby={`vsl-t${a.id}`} hidden={abaAtiva !== a.id}>
                    <div>
                      <h3>{a.titulo}</h3>
                      <p>{a.texto}</p>
                      <ul>
                        {a.itens.map((t) => <li key={t}><Ico id="check" />{t}</li>)}
                      </ul>
                    </div>
                    <div className={`shot${a.celular ? ' phone' : ''}`}><img src={a.img} alt={a.alt} loading="lazy" /></div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ===================== OFERTA: A GENTE CADASTRA ===================== */}
        <section className="sec">
          <div className="wrap">
            <div className="offer">
              <div>
                <span className="eyebrow">Sem tempo pra configurar?</span>
                <h2>Me manda sua lista de alunos <span>que eu monto tudo pra você.</span></h2>
                <p>Você não precisa cadastrar aluno por aluno. Cria sua conta, manda a lista do jeito que ela estiver e a gente deixa o sistema pronto pra cobrar.</p>
              </div>
              <div className="offer-box">
                <ol>
                  <li><b>1</b>Crie sua conta grátis (leva 1 minuto)</li>
                  <li><b>2</b>Mande sua lista no WhatsApp: planilha, print ou até foto do caderno</li>
                  <li><b>3</b>A gente cadastra e você só conecta seu WhatsApp</li>
                </ol>
                <Link className="btn btn-main" to={linkSignup()} onClick={cliqueCadastro()}>Criar conta e mandar minha lista</Link>
              </div>
            </div>
          </div>
        </section>

        {/* ===================== DEPOIMENTOS ===================== */}
        <section className="sec" style={{ background: 'var(--soft)' }}>
          <div className="wrap">
            <div className="sec-head">
              <span className="eyebrow">Quem já usa</span>
              <h2>O que nossos clientes falam do Mensalli.</h2>
            </div>
            <div className="testis">
              {DEPOIMENTOS.map((d) => (
                <button key={d.video} className="testi" type="button" aria-label={d.aria} onClick={() => abrirDepoimento(d)}>
                  <img src={d.capa} alt="" loading="lazy" />
                  <span className="play"><Ico id="play" size={26} style={{ color: '#111', marginLeft: 3 }} /></span>
                  <span className="who"><strong>{d.nome}</strong><span>{d.negocio}</span></span>
                  {depAbertos.includes(d.video) && (
                    <video
                      ref={(el) => { depVideosRef.current[d.video] = el }}
                      src={d.video}
                      controls
                      playsInline
                      autoPlay
                    />
                  )}
                </button>
              ))}
            </div>
          </div>
        </section>

        {/* ===================== PLANOS (src/planosMensalli.js) ===================== */}
        <section className="sec" id="planos">
          <div className="wrap">
            <div className="sec-head">
              <span className="eyebrow">Planos</span>
              <h2>Escolha pelo número de alunos.</h2>
              <p>Todos começam com 3 dias grátis. Sem fidelidade, cancele quando quiser.</p>
            </div>
            <div className="plans">
              {planos.map((p) => (
                <div key={p.id} className={`plan${p.destaque ? ' star' : ''}`}>
                  {p.destaque && <span className="badge">Melhor custo-benefício</span>}
                  <h3>{p.nome}</h3>
                  <p className="sub">{p.subtitulo}</p>
                  <div className="price"><small>R$</small><strong>{formatarPreco(p.preco)}</strong><em>/mês</em></div>
                  <div className="cap">Até {formatarNumero(p.limiteClientes)} alunos</div>
                  <ul>
                    {p.itens.map((f) => <li key={f}><Ico id="check" size={16} />{f}</li>)}
                  </ul>
                  <Link className={`btn ${p.destaque ? 'btn-main' : 'btn-ghost'}`} to={linkSignup(p.id)} onClick={cliqueCadastro(p.id)}>Testar grátis</Link>
                </div>
              ))}
            </div>
            <div className="plans-note">
              <span><Ico id="check" />3 dias grátis</span>
              <span><Ico id="check" />Sem cartão de crédito</span>
              <span><Ico id="check" />Sem fidelidade</span>
              <span><Ico id="shield" />Mensagens só para alunos que você cadastrou</span>
            </div>
          </div>
        </section>

        {/* ===================== FAQ ===================== */}
        <section className="sec" style={{ background: 'var(--soft)' }}>
          <div className="wrap narrow">
            <div className="sec-head">
              <span className="eyebrow">Dúvidas</span>
              <h2>Perguntas frequentes</h2>
            </div>
            <div className="faq">
              {FAQ.map((f) => (
                <details key={f.p}>
                  <summary>{f.p}<Ico id="plus" size={22} /></summary>
                  <p>{f.r}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* ===================== CTA FINAL ===================== */}
        <section className="final">
          <div className="wrap">
            <h2>Pronto para parar de cobrar na mão?</h2>
            <p>Crie sua conta, teste 3 dias grátis e deixe o Mensalli cobrar seus alunos no automático.</p>
            <div className="row">
              <Link className="btn btn-main" to={linkSignup()} onClick={cliqueCadastro()}>Criar minha conta grátis <Ico id="arrow" size={20} /></Link>
              <a className="btn btn-ghost" href={WHATSAPP_URL} target="_blank" rel="noopener noreferrer" onClick={cliqueWhatsapp}><Ico id="wa" size={20} /> Tirar dúvida no WhatsApp</a>
            </div>
          </div>
        </section>

      </main>

      <footer className="vsl-footer">© 2026 Mensalli · Cobrança automática pelo WhatsApp para quem vive de mensalidade.</footer>

      <div className={`sticky${stickyVisivel ? ' show' : ''}`}>
        <Link className="btn btn-main" to={linkSignup()} onClick={cliqueCadastro()}>Criar conta grátis</Link>
        <a className="btn btn-wa wa" href={WHATSAPP_URL} target="_blank" rel="noopener noreferrer" aria-label="Falar no WhatsApp" onClick={cliqueWhatsapp}><Ico id="wa" size={24} /></a>
      </div>
    </div>
  )
}
