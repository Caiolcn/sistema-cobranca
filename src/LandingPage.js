import { useNavigate } from 'react-router-dom'
import {
  MdCheck, MdCheckCircle, MdArrowForward, MdMenu, MdClose, MdAdd,
  MdMessage, MdReceiptLong, MdTrendingUp, MdPeople, MdDoneAll,
  MdShield, MdVerifiedUser, MdVisibility, MdFactCheck, MdAutorenew,
  MdLanguage, MdGroups, MdSmartToy, MdEventAvailable, MdCampaign,
  MdSignalCellularAlt, MdWifi, MdBatteryFull, MdSentimentSatisfiedAlt, MdMic,
  MdSportsSoccer, MdSelfImprovement, MdSportsMma, MdPool
} from 'react-icons/md'
import { FaWhatsapp, FaInstagram } from 'react-icons/fa'
import { useState, useMemo, useEffect, useRef } from 'react'
import { LANDING_CSS, scrollToId } from './pages/landing/ui'
import Depoimentos from './pages/landing/Depoimentos'
import './LandingPage.css'

const WHATSAPP_CONTATO = 'https://wa.me/5562981618862'

const NAV = [
  { l: 'Recursos', id: 'recursos' },
  { l: 'Como funciona', id: 'como-funciona' },
  { l: 'Depoimentos', id: 'depoimentos' },
  { l: 'Preços', id: 'precos' },
  { l: 'Dúvidas', id: 'faq' }
]

// Régua demonstrada na seção de automação: trechos dos templates padrão
// (src/data/templatesPadrao.js) com dados de exemplo.
const REGUA = [
  { quando: '3 dias antes do vencimento', hora: '09:00', status: 'Lembrete entregue',
    texto: 'Olá, Maria! 👋\n\nPassando para te ajudar na organização da semana: sua mensalidade vence em 3 dias. 😃\n\n💰 Valor: R$ 150,00' },
  { quando: 'No dia do vencimento', hora: '09:00', status: 'Com a chave Pix pra pagar na hora',
    texto: 'Oi, Maria! Tudo bem? 😃\n\nHoje é o dia do vencimento da sua mensalidade.\n\n💰 Valor: R$ 150,00\n💳 Pix para pagamento: seustudio@pix' },
  { quando: '3 dias depois', hora: '09:00', status: 'Só sai se a mensalidade continuar em aberto', condicional: true,
    texto: 'Olá, Maria, como vai?\n\nNotamos que o pagamento da sua mensalidade (vencida em 10/10) ainda não consta em nosso sistema…' }
]

// ---- Demonstração animada do hero ----
// O celular é o WhatsApp do studio: a cobrança sai sozinha, o aluno lê,
// responde e, quando paga, a confirmação automática sai e a notificação
// de pago entra no topo da cascata ao lado. Textos = templates padrão
// (src/data/templatesPadrao.js: due_day, pre_due_3days, overdue e
// payment_confirmed) com dados de exemplo.
const CENAS = [
  { nome: 'Maria', ava: '#7C3AED', valor: 'R$ 150,00', venc: '10/10', horas: ['09:00', '09:11', '09:12'],
    cobranca: 'Oi, Maria! Tudo bem? 😃\n\nHoje é o dia do vencimento da sua mensalidade.\n\n💰 Valor: R$ 150,00\n💳 Pix para pagamento: seustudio@pix',
    resposta: 'Vou pagar agora pelo Pix 👍',
    detalhe: 'Pago no Pix, 12 min após a cobrança' },
  { nome: 'Lucas', ava: '#0EA5E9', valor: 'R$ 120,00', venc: '13/10', horas: ['09:00', '09:20', '09:22'],
    cobranca: 'Olá, Lucas! 👋\n\nPassando para te ajudar na organização da semana: sua mensalidade vence em 3 dias. 😃\n\n💰 Valor: R$ 120,00\n📆 Vencimento: 13/10\n\n🔑 Chave Pix: seustudio@pix',
    resposta: 'Opa, já vou adiantar! 🙌',
    detalhe: 'Pago no Pix, 3 dias antes do vencimento' },
  { nome: 'Ana Paula', ava: '#F97316', valor: 'R$ 180,00', venc: '07/10', horas: ['09:00', '10:02', '10:03'],
    cobranca: 'Olá, Ana Paula, como vai?\n\nNotamos que o pagamento da sua mensalidade (vencida em 07/10) ainda não consta em nosso sistema.\n\n💰 Valor: R$ 180,00\n🔑 Chave Pix: seustudio@pix',
    resposta: 'Nossa, tinha esquecido! Pagando agora 🙏',
    detalhe: 'Pago logo depois do lembrete' }
]

const confirmacao = c => `Olá, ${c.nome}! ✅\n\nConfirmamos o recebimento do seu pagamento.\n\n💰 Valor: ${c.valor}\n📅 Vencimento: ${c.venc}\n\nObrigado pela pontualidade! - Seu Studio`

// O que já está na cascata quando a página abre (mais nova primeiro).
const PAGOS_INICIAIS = [
  { id: 1, nome: 'Pedro', valor: 'R$ 135,00', detalhe: 'Pago no Pix, no dia do vencimento' },
  { id: 2, nome: 'Beatriz', valor: 'R$ 200,00', detalhe: 'Pago logo depois do lembrete' },
  { id: 3, nome: 'João', valor: 'R$ 89,90', detalhe: 'Pago no cartão pelo link' },
  { id: 4, nome: 'Carla', valor: 'R$ 99,00', detalhe: 'Pago no dia do vencimento' },
  { id: 5, nome: 'Rafael', valor: 'R$ 110,00', detalhe: 'Pago pelo link da cobrança' }
]
// 5 visíveis + 1 invisível embaixo, que é a que está saindo (assim ela
// some com transição em vez de desaparecer de uma vez).
const NOTIF_CAMADAS = 6

// A conversa roda mesmo com "redução de movimento" ligada (o Windows desliga
// as animações do sistema e muita gente usa assim): nesse caso o CSS tira
// os deslizes e zooms, e as mensagens só aparecem — a história continua sendo
// contada, sem movimento na tela.
function HeroDemo() {
  const raiz = useRef(null)
  const [cena, setCena] = useState(CENAS[0])
  const [msgs, setMsgs] = useState([])
  const [digitando, setDigitando] = useState(null) // texto parcial da resposta do aluno
  const [pagos, setPagos] = useState(PAGOS_INICIAIS)
  // abertura da cascata ao carregar: fechada -> abrindo (leque) -> aberta
  const [fase, setFase] = useState('fechada')

  useEffect(() => {
    const t1 = setTimeout(() => setFase('abrindo'), 350)
    const t2 = setTimeout(() => setFase('aberta'), 2000)
    return () => { clearTimeout(t1); clearTimeout(t2) }
  }, [])

  useEffect(() => {
    let vivo = true
    let visivel = true
    const io = new IntersectionObserver(([e]) => { visivel = e.isIntersecting }, { threshold: 0.1 })
    // observa o bloco do hero (e nao o celular): no mobile o celular fica
    // escondido e a animacao pausaria pra sempre
    if (raiz.current) io.observe(raiz.current.parentElement || raiz.current)

    // Espera "pausável": só conta o tempo com o hero na tela e a aba visível.
    const esperar = ms => new Promise(resolve => {
      let resta = ms
      const t = setInterval(() => {
        if (!vivo) { clearInterval(t); return }
        if (visivel && !document.hidden) resta -= 40
        if (resta <= 0) { clearInterval(t); resolve() }
      }, 40)
    })

    ;(async () => {
      let n = 0
      let id = 100
      while (vivo) {
        const c = CENAS[n % CENAS.length]
        const cob = { k: `cob${n}`, de: 'studio', texto: c.cobranca, hora: c.horas[0], lido: false }
        setCena(c); setMsgs([]); setDigitando(null)
        await esperar(700)
        setMsgs([cob])                                   // cobrança sai sozinha
        await esperar(1300)
        setMsgs([{ ...cob, lido: true }])                // aluno leu
        await esperar(600)
        const letras = Array.from(c.resposta)            // Array.from não quebra emoji
        for (let i = 1; i <= letras.length && vivo; i++) {
          setDigitando(letras.slice(0, i).join(''))
          await esperar(55)
        }
        await esperar(500)
        setDigitando(null)
        const resp = { k: `resp${n}`, de: 'aluno', texto: c.resposta, hora: c.horas[1] }
        setMsgs([{ ...cob, lido: true }, resp])
        await esperar(1700)
        const conf = { k: `conf${n}`, de: 'studio', texto: confirmacao(c), hora: c.horas[2], lido: false }
        setMsgs([{ ...cob, lido: true }, resp, conf])   // pagou: confirmação automática
        const novo = { id: id++, nome: c.nome, valor: c.valor, detalhe: c.detalhe, nova: true }
        setPagos(p => [novo, ...p].slice(0, NOTIF_CAMADAS))
        await esperar(900)
        setMsgs([{ ...cob, lido: true }, resp, { ...conf, lido: true }])
        await esperar(3600)
        n++
      }
    })()

    return () => { vivo = false; io.disconnect() }
  }, [])

  return (
    <>
      <div className="lp2-hv-phone" ref={raiz}>
        <PhoneDemo cena={cena} msgs={msgs} digitando={digitando} />
      </div>
      <NotifCascata itens={pagos} fase={fase} />
    </>
  )
}

function PhoneDemo({ cena, msgs, digitando }) {
  const iniciais = cena.nome.split(' ').map(p => p[0]).join('').slice(0, 2).toUpperCase()
  return (
    <div className="lp2-phone lp2-phone--demo" role="img" aria-label="Demonstração: o Mensalli manda a cobrança pelo WhatsApp do studio, o aluno responde e recebe a confirmação de pagamento automática">
      <div className="lp2-phone-screen" aria-hidden="true">
        <div className="lp2-phone-status">
          <span>9:41</span>
          <i className="lp2-phone-island" />
          <span className="lp2-phone-icons"><MdSignalCellularAlt size={14} /><MdWifi size={14} /><MdBatteryFull size={15} /></span>
        </div>
        <div className="lp2-wa-head">
          <span className="lp2-wa-ava" style={{ background: cena.ava }}>{iniciais}</span>
          <div><strong>{cena.nome}</strong><span>{digitando !== null ? 'digitando…' : 'online'}</span></div>
        </div>
        <div className="lp2-wa-body lp2-wa-body--demo">
          <span className="lp2-wa-day">Hoje</span>
          {msgs.map(m => {
            const doAluno = m.de === 'aluno'
            return (
              <div key={m.k} className={`lp2-bubble lp2-bubble--pop ${doAluno ? 'lp2-bubble--in' : 'lp2-bubble--out'}`}>
                {m.texto}
                <span className={`lp2-bubble-meta${m.lido ? '' : ' is-pend'}`}>{m.hora}{!doAluno && <MdDoneAll size={14} />}</span>
              </div>
            )
          })}
          {digitando !== null && (
            <div className="lp2-bubble lp2-bubble--in lp2-bubble--pop">
              {digitando}<span className="lp2-caret" />
            </div>
          )}
        </div>
        <div className="lp2-wa-input">
          <span className="lp2-wa-input-box"><MdSentimentSatisfiedAlt size={18} /> Mensagem</span>
          <span className="lp2-wa-mic"><MdMic size={18} /></span>
        </div>
        <i className="lp2-phone-home" />
      </div>
    </div>
  )
}

function NotifCascata({ itens, fase }) {
  return (
    <div className={`lp2-ncas is-${fase}`} aria-hidden="true">
      {itens.map((n, camada) => (
        <div key={n.id} className={`lp2-ncard${camada === 0 && n.nova ? ' is-new' : ''}`} data-camada={camada} style={{ '--i': camada }}>
          <span className="lp2-ncard-ico"><MdCheckCircle size={20} /></span>
          <span className="lp2-ncard-txt">
            <strong>{n.nome} · {n.valor} pago</strong>
            <span>{n.detalhe}</span>
          </span>
        </div>
      ))}
    </div>
  )
}

// Atalhos pras landings de nicho (rotas em App.js). Fotos em public/nichos,
// versoes leves (~60KB) das capas de cada landing. `carregar` baixa a pagina
// (lazy no App.js) ja no hover, pra troca ser instantanea no clique.
const NICHOS = [
  { to: '/sistema-para-escolinhas', titulo: 'Escolinhas esportivas', icon: MdSportsSoccer, img: '/nichos/escolinhas.jpg', pos: '74% 50%', carregar: () => import('./pages/LandingEscolinha') },
  { to: '/sistema-para-estudio-pilates', titulo: 'Studio de pilates', icon: MdSelfImprovement, img: '/nichos/pilates.jpg', pos: '86% 50%', carregar: () => import('./pages/LandingPilates') },
  { to: '/sistema-para-academia-de-luta', titulo: 'Academia de luta', icon: MdSportsMma, img: '/nichos/luta.jpg', pos: '80% 50%', carregar: () => import('./pages/LandingLuta') },
  { to: '/sistema-para-escola-natacao', titulo: 'Escola de natação', icon: MdPool, img: '/nichos/natacao.jpg', pos: '82% 50%', carregar: () => import('./pages/LandingNatacao') }
]

const SECUNDARIOS = [
  { icon: MdMessage, t: 'Templates personalizados', d: 'Mensagens com a sua cara, que não parecem robô.' },
  { icon: MdReceiptLong, t: 'Relatórios de atrasos', d: 'Há quanto tempo cada cliente está devendo.' },
  { icon: MdTrendingUp, t: 'Indicadores financeiros', d: 'Recebido, a vencer e inadimplência num só lugar.' },
  { icon: MdPeople, t: 'Clientes e mensalidades', d: 'Planos, vencimentos e histórico de cada aluno.' }
]

const PASSOS = [
  { titulo: 'Conecte seu WhatsApp', descricao: 'Escaneie o QR Code e vincule seu número. Leva menos de 1 minuto.', nota: 'As mensagens saem do seu número' },
  { titulo: 'Cadastre seus clientes', descricao: 'Adicione clientes, planos de mensalidade e datas de vencimento.', nota: 'Veio de planilha? Dá pra importar' },
  { titulo: 'Ative a automação', descricao: 'Personalize as mensagens. Pronto, o sistema cobra sozinho.', nota: 'Os textos já vêm prontos pra editar' }
]

// Recursos além da cobrança (seção verde-escura).
const SUITE = [
  { id: 'bio', icon: MdLanguage, titulo: 'Link na bio', plano: 'Pro e Premium',
    desc: 'Uma página para a bio do Instagram: botão de WhatsApp, redes, fotos e vídeos no ar em minutos, e no Premium o botão de agendar aula. Sem precisar de programador.' },
  { id: 'crm', icon: MdGroups, titulo: 'CRM completo', plano: 'Premium',
    desc: 'Acompanhe cada lead e aluno num só lugar, do primeiro contato à matrícula. Ninguém escapa pelo caminho.' },
  { id: 'bot', icon: MdSmartToy, titulo: 'Bot de WhatsApp', plano: 'Premium',
    desc: 'Um assistente que responde sozinho: o aluno consulta mensalidade, horários e agenda aula sem te interromper.' },
  { id: 'agenda', icon: MdEventAvailable, titulo: 'Agendamento online', plano: 'Premium',
    desc: 'Compartilhe um link e deixe seus alunos marcarem aula ou avaliação direto na sua agenda.' },
  { id: 'campanhas', icon: MdCampaign, titulo: 'Campanhas de WhatsApp', plano: 'Premium',
    desc: 'Avisos, promoções e comunicados para toda a sua base de uma vez, em poucos cliques.' }
]

const BENEFICIOS = [
  { titulo: 'Menos tempo cobrando.', desc: 'O sistema cobra sozinho pelo seu WhatsApp. Você para de mandar mensagem aluno por aluno e ganha horas da semana de volta.' },
  { titulo: 'Mais controle das mensalidades.', desc: 'Num olhar você vê quem está em dia, quem atrasou e quanto tem a receber. Nenhuma mensalidade passa batido.' },
  { titulo: 'Mais tranquilidade na rotina.', desc: 'A parte chata roda no automático, todo mês. E a cobrança continua sendo sua: sai do seu número, com o seu tom.' }
]

// Só o que o produto de fato faz — sem selo, certificação ou criptografia prometida.
const CONFIANCA = [
  { icon: MdVerifiedUser, t: 'Mensagens só para clientes que você cadastrou' },
  { icon: MdVisibility, t: 'Você edita ou remove os dados dos seus clientes quando quiser' },
  { icon: MdFactCheck, t: 'Histórico de cada mensagem enviada' },
  { icon: MdAutorenew, t: 'Atualizações constantes, guiadas pelo seu feedback' }
]

const PLANOS = [
  { nome: 'Starter', eyebrow: 'Ideal para começar', preco: 49, perMsg: 'R$0,25 por mensagem', cta: 'Começar no Starter', destaque: false,
    features: ['Até 50 clientes ativos', '200 mensagens/mês', 'Mensagem automática no vencimento', '1 template personalizado', 'Dashboard básico'] },
  { nome: 'Pro', eyebrow: 'Para negócios em crescimento', preco: 99, perMsg: 'R$0,17 por mensagem', cta: 'Escolher o Pro', destaque: false,
    features: ['Até 150 clientes ativos', '600 mensagens/mês', '3 templates personalizados', 'Régua de cobrança completa', 'Dashboard com gráficos', 'Contratos com assinatura', 'Link na bio', 'Anamnese / Ficha do aluno', 'Suporte via WhatsApp'] },
  { nome: 'Premium', eyebrow: 'Gestão profissional', preco: 149, perMsg: 'R$0,05 por mensagem', cta: 'Ativar Premium', destaque: true,
    features: ['Até 500 clientes ativos', '3.000 mensagens/mês', 'Tudo do plano Pro', 'Link na bio com botão de agendar', 'CRM completo', 'Bot de WhatsApp', 'Agendamento online (link de agendamento)', 'Campanhas de WhatsApp', 'Templates ilimitados', 'Consultoria inicial (1h)', 'Suporte prioritário'] }
]

const FAQS = [
  { p: 'O que é o Mensalli?', r: 'Um sistema completo de cobrança de mensalidades que envia lembretes automáticos pelo seu WhatsApp e organiza tudo num dashboard.' },
  { p: 'Como funciona a conexão com WhatsApp?', r: 'Você escaneia um QR Code que vincula seu número ao sistema. As mensagens saem do SEU número, mantendo o relacionamento direto com os clientes.' },
  { p: 'Preciso instalar algo?', r: 'Não. É 100% online, funciona no navegador do computador e do celular.' },
  { p: 'Posso cancelar quando quiser?', r: 'Sim, sem multa e sem burocracia. Cancele direto no painel e o sistema para de cobrar no próximo ciclo.' },
  { p: 'O WhatsApp pode banir meu número?', r: 'Não, se usar corretamente. O Mensalli envia apenas para clientes que você cadastrou, sem spam.' },
  { p: 'Quais formas de pagamento meus clientes podem usar?', r: 'Pix, cartão de crédito e boleto, via Asaas. O cliente escolhe e você só recebe.' },
  { p: 'Está em conformidade com a LGPD?', r: 'Sim. Você cobra apenas clientes que cadastrou, pode editar ou remover os dados deles quando quiser e tem o histórico de cada mensagem enviada. Os detalhes estão na nossa política de privacidade.' }
]

const RECUPERACAO_HIPOTESE = 0.7

const brl = v => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

// Screenshot real sem moldura de navegador, com recorte opcional
// (`ratio` = proporção da janela visível, `pos` = object-position).
function Shot({ src, alt, ratio, pos = 'left top', w = 900, h = 450 }) {
  return (
    <figure className="lp2-shot" style={ratio ? { aspectRatio: ratio } : undefined}>
      <img src={src} alt={alt} width={w} height={h} loading="lazy" decoding="async"
        style={ratio ? { height: '100%', objectFit: 'cover', objectPosition: pos } : undefined} />
    </figure>
  )
}

// Recursos além da cobrança: os 5 lado a lado, já abertos, separados só por
// linhas finas (sem cards nem screenshots).
function Suite({ onPlanos }) {
  return (
    <section id="premium" className="lp2-sec lp2-suite" aria-labelledby="suite-titulo">
      <div className="lp2-wrap">
        <div className="lp2-head2">
          <div>
            <p className="lp2-eyebrow">Além da cobrança</p>
            <h2 id="suite-titulo" className="lp2-h2">O Mensalli começa na cobrança. Mas não para aí.</h2>
          </div>
          <p className="lp2-lead">Quando seu negócio precisa de mais, a gente cuida do resto — site, relacionamento, atendimento e agenda, tudo no mesmo lugar.</p>
        </div>

        <ul className="lp2-suite-cols">
          {SUITE.map(s => (
            <li key={s.id} className="lp2-suite-col">
              <div className="lp2-suite-top">
                <span className="lp2-suite-ico"><s.icon size={22} /></span>
                <span className="lp2-suite-plano">{s.plano}</span>
              </div>
              <h3>{s.titulo}</h3>
              <p>{s.desc}</p>
            </li>
          ))}
        </ul>
        <button type="button" className="lp2-link lp2-suite-cta" onClick={onPlanos}>Ver o que vem em cada plano <MdArrowForward size={18} /></button>
      </div>
    </section>
  )
}

export default function LandingPage() {
  const navigate = useNavigate()
  const [faqAberto, setFaqAberto] = useState(null)
  const [menuAberto, setMenuAberto] = useState(false)
  const [rolou, setRolou] = useState(false)

  useEffect(() => {
    const onScroll = () => setRolou(window.scrollY > 8)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  // Calculadora de inadimplência
  const [roiClientes, setRoiClientes] = useState('50')
  const [roiValor, setRoiValor] = useState('150')
  const [roiInad, setRoiInad] = useState('30')
  const perdaMensal = useMemo(() => (Number(roiClientes) || 0) * (Number(roiValor) || 0) * ((Number(roiInad) || 0) / 100), [roiClientes, roiValor, roiInad])
  const recuperacao = useMemo(() => perdaMensal * RECUPERACAO_HIPOTESE, [perdaMensal])

  // Formulário do CTA final
  const [formDesafio, setFormDesafio] = useState('')
  const [formClientes, setFormClientes] = useState('')
  const [formSistema, setFormSistema] = useState('')

  const irPara = id => { setMenuAberto(false); scrollToId(id) }
  const signup = () => navigate('/signup')

  return (
    <div className="lp2">
      <style>{LANDING_CSS}</style>

      {/* Header */}
      <header className={`lp2-header${rolou ? ' is-scrolled' : ''}`}>
        <div className="lp2-wrap lp2-header-in">
          <a href="https://www.mensalli.com.br" className="lp2-logo" aria-label="Mensalli — início">
            <img src="/Logo-Full.png" alt="Mensalli" />
          </a>
          <nav className="lp2-nav" aria-label="Principal">
            {NAV.map(n => <button key={n.id} type="button" onClick={() => irPara(n.id)}>{n.l}</button>)}
          </nav>
          <div className="lp2-actions">
            <button type="button" className="lp2-entrar" onClick={() => navigate('/login')}>Entrar</button>
            <button type="button" className="lp2-btn lp2-btn--sm" onClick={signup}>Teste grátis</button>
            <button type="button" className="lp2-burger" aria-label={menuAberto ? 'Fechar menu' : 'Abrir menu'}
              aria-expanded={menuAberto} aria-controls="lp2-mnav" onClick={() => setMenuAberto(v => !v)}>
              {menuAberto ? <MdClose size={22} /> : <MdMenu size={22} />}
            </button>
          </div>
        </div>
        {menuAberto && (
          <nav id="lp2-mnav" className="lp2-mnav" aria-label="Menu">
            {NAV.map(n => <button key={n.id} type="button" onClick={() => irPara(n.id)}>{n.l}</button>)}
            <button type="button" onClick={() => navigate('/login')}>Entrar</button>
          </nav>
        )}
      </header>

      <main>
        {/* Hero */}
        <section className="lp2-hero">
          <div className="lp2-wrap lp2-hero-grid">
            <div>
              <p className="lp2-eyebrow">Cobrança automática pelo WhatsApp</p>
              <h1 className="lp2-h1">Nunca mais cobre aluno por aluno no WhatsApp.</h1>
              <p className="lp2-hero-sub">
                Enquanto você trabalha, o Mensalli cobra seus alunos automaticamente pelo WhatsApp. Feito para estúdios, academias e escolas que vivem de mensalidade.
              </p>
              <div className="lp2-ctas">
                <button type="button" className="lp2-btn" onClick={signup}>Crie sua conta grátis <MdArrowForward size={19} /></button>
                <button type="button" className="lp2-btn lp2-btn--ghost" onClick={() => scrollToId('como-funciona')}>Veja como funciona</button>
              </div>
              <ul className="lp2-trust">
                {['Use seu próprio WhatsApp', 'Sem cartão de crédito', 'Cancele quando quiser'].map(t => (
                  <li key={t}><MdCheck size={16} /> {t}</li>
                ))}
              </ul>
            </div>

            <div className="lp2-hv">
              <HeroDemo />
            </div>
          </div>
        </section>

        <Depoimentos onCta={signup} />

        {/* Atalhos pros nichos */}
        <section className="lp2-sec lp2-bg-off lp2-nichos" aria-labelledby="nichos-titulo">
          <div className="lp2-wrap">
            <div className="lp2-head2">
              <div>
                <p className="lp2-eyebrow">Para o seu negócio</p>
                <h2 id="nichos-titulo" className="lp2-h2">Feito para quem vive de mensalidade.</h2>
              </div>
              <p className="lp2-lead">Escolha o seu tipo de negócio e veja como o Mensalli funciona no seu dia a dia.</p>
            </div>
            <div className="lp2-nichos-grid">
              {NICHOS.map(n => (
                <a key={n.to} href={n.to} className="lp2-nicho"
                  onPointerEnter={n.carregar} onFocus={n.carregar}
                  onClick={e => { e.preventDefault(); n.carregar().then(() => navigate(n.to)) }}>
                  <img src={n.img} alt="" loading="lazy" decoding="async" width="840" height="473" style={{ objectPosition: n.pos }} />
                  <span className="lp2-nicho-ico"><n.icon size={20} /></span>
                  <span className="lp2-nicho-t">{n.titulo} <MdArrowForward size={20} /></span>
                </a>
              ))}
            </div>
          </div>
        </section>

        {/* Cobrança automática em destaque */}
        <section id="cobranca" className="lp2-sec lp2-auto" aria-labelledby="auto-titulo">
          <div className="lp2-wrap lp2-auto-grid">
            <div>
              <p className="lp2-eyebrow">Automação 24h</p>
              <h2 id="auto-titulo" className="lp2-h2">A cobrança que trabalha por você, dia e noite.</h2>
              <p className="lp2-lead">
                Defina a régua uma vez — antes, no dia e após o vencimento — e o Mensalli envia tudo sozinho pelo seu WhatsApp. Você acorda com as mensagens já entregues e os pagamentos entrando.
              </p>
              <ul className="lp2-checks">
                {['Mensagens no seu tom de voz, com nome, valor e data', 'Para de enviar quando o cliente paga', 'Link de pagamento direto na conversa'].map(t => (
                  <li key={t}><span><MdCheck size={16} /></span>{t}</li>
                ))}
              </ul>
              <button type="button" className="lp2-btn" onClick={signup}>Quero automatizar <MdArrowForward size={19} /></button>
            </div>

            <div>
              <div className="lp2-regua">
                {REGUA.map((r, i) => (
                  <div key={i} className={`lp2-step${r.condicional ? ' lp2-step--cond' : ''}`}>
                    <span className="lp2-step-pill"><b>{i + 1}</b>{r.quando}</span>
                    <div className="lp2-bubble lp2-bubble--out">
                      {r.texto}
                      <span className="lp2-bubble-meta">{r.hora} <MdDoneAll size={14} /></span>
                    </div>
                    <span className="lp2-step-status"><i />{r.status}</span>
                  </div>
                ))}
              </div>
              <p className="lp2-regua-note">Trechos dos textos padrão do Mensalli, com dados de exemplo. Você ajusta dias e mensagens do seu jeito.</p>
            </div>
          </div>
        </section>

        {/* Conheça o Mensalli por dentro */}
        <section id="recursos" className="lp2-sec lp2-bg-off" aria-labelledby="dentro-titulo">
          <div className="lp2-wrap">
            <div className="lp2-head2">
              <div>
                <p className="lp2-eyebrow">Por dentro do Mensalli</p>
                <h2 id="dentro-titulo" className="lp2-h2">Um sistema que resolve sua cobrança <em>inteira</em>.</h2>
              </div>
              <p className="lp2-lead">Da primeira mensagem ao dinheiro na conta, sem você correr atrás de ninguém.</p>
            </div>

            {/* A — Automação */}
            <div className="lp2-show">
              <div className="lp2-show-text">
                <p className="lp2-show-kicker">Régua de cobrança</p>
                <h3>Configure suas cobranças e deixe o Mensalli trabalhar.</h3>
                <p>Ligue os envios que fazem sentido pro seu negócio, ajuste o texto de cada um e veja na hora como a mensagem chega no WhatsApp do aluno.</p>
                <ul className="lp2-mini">
                  <li><MdCheck size={17} /> Antes, no dia e depois do vencimento, cada um com seu template</li>
                  <li><MdCheck size={17} /> Nome, valor, vencimento e chave Pix preenchidos sozinhos</li>
                  <li><MdCheck size={17} /> Confirmação de pagamento enviada sozinha quando o aluno paga</li>
                </ul>
              </div>
              <div className="lp2-stage">
                <Shot src="/automacoes.png" w={888} h={600} alt="Tela de automações do Mensalli com os envios de 3 dias antes, no dia, 3 dias depois, confirmação de pagamento e alerta de despesa, todos ativados" />
              </div>
            </div>

            {/* B — Financeiro */}
            <div className="lp2-show lp2-show--rev">
              <div className="lp2-show-text">
                <p className="lp2-show-kicker">Mensalidades e financeiro</p>
                <h3>Saiba quem pagou, quem está devendo e quanto você tem a receber.</h3>
                <p>Em atraso, próximos vencimentos e recebido do mês no topo da tela. Logo abaixo, cada mensalidade com cliente, vencimento, valor e plano.</p>
                <ul className="lp2-mini">
                  <li><MdCheck size={17} /> Total em atraso e quantas mensalidades estão pendentes</li>
                  <li><MdCheck size={17} /> O que vence hoje e nos próximos 7 dias</li>
                  <li><MdCheck size={17} /> Receita do mês, projetada e recorrente no dashboard</li>
                </ul>
              </div>
              <div className="lp2-stage lp2-stage--rev">
                <Shot src="/mensalidades.png" alt="Tela de mensalidades do Mensalli com totais em atraso, próximos vencimentos, recebido e lista de mensalidades" />
              </div>
            </div>

            {/* C — Portal de pagamento */}
            <div className="lp2-show">
              <div className="lp2-show-text">
                <p className="lp2-show-kicker">Portal do aluno</p>
                <h3>Seu aluno recebe a cobrança e paga em poucos cliques.</h3>
                <p>A mensagem leva o link do portal. O aluno abre no celular, vê o que está em aberto e paga sem precisar te chamar.</p>
                <ul className="lp2-mini">
                  <li><MdCheck size={17} /> Pix, cartão de crédito ou boleto, via Asaas</li>
                  <li><MdCheck size={17} /> Link enviado junto da cobrança no WhatsApp</li>
                  <li><MdCheck size={17} /> Pagou, a régua para de enviar</li>
                </ul>
              </div>
              <div className="lp2-stage lp2-stage--center">
                <div className="lp2-phone lp2-phone--demo lp2-phone--portal">
                  <div className="lp2-phone-screen">
                    <div className="lp2-phone-status" aria-hidden="true">
                      <span>9:41</span>
                      <i className="lp2-phone-island" />
                      <span className="lp2-phone-icons"><MdSignalCellularAlt size={14} /><MdWifi size={14} /><MdBatteryFull size={15} /></span>
                    </div>
                    <img className="lp2-portal-shot" src="/portal-aluno.png" width="540" height="938" loading="lazy" decoding="async"
                      alt="Portal do aluno no celular: plano, próxima aula, frequência e mensalidade pendente com o botão Pagar agora" />
                  </div>
                </div>
              </div>
            </div>

            {/* Recursos secundários */}
            <div className="lp2-strip">
              {SECUNDARIOS.map(s => (
                <div key={s.t}>
                  <s.icon size={22} />
                  <strong>{s.t}</strong>
                  <span>{s.d}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Como começar — linha do tempo */}
        <section id="como-funciona" className="lp2-sec" aria-labelledby="passos-titulo">
          <div className="lp2-wrap">
            <div className="lp2-head2">
              <div>
                <p className="lp2-eyebrow">Em 3 passos</p>
                <h2 id="passos-titulo" className="lp2-h2">Configure uma vez. Esqueça pra sempre.</h2>
              </div>
              <p className="lp2-lead">Uns 5 minutos de configuração e, daí pra frente, o Mensalli cobra sozinho todo mês.</p>
            </div>
            <ol className="lp2-tl">
              {PASSOS.map((p, i) => (
                <li key={i}>
                  <span className="lp2-tl-num">{String(i + 1).padStart(2, '0')}</span>
                  <h3>{p.titulo}</h3>
                  <p>{p.descricao}</p>
                  <span className="lp2-tl-nota">{p.nota}</span>
                </li>
              ))}
            </ol>
            <button type="button" className="lp2-btn lp2-tl-cta" onClick={signup}>Começar meu teste grátis <MdArrowForward size={19} /></button>
          </div>
        </section>

        <Suite onPlanos={() => scrollToId('precos')} />

        {/* Benefícios — editorial */}
        <section className="lp2-sec lp2-benef" aria-labelledby="benef-titulo">
          <div className="lp2-wrap">
            <p className="lp2-eyebrow">No dia a dia</p>
            <h2 id="benef-titulo" className="lp2-h2 lp2-h2--wide">O que muda quando o Mensalli cobra por você.</h2>
            <div className="lp2-benef-grid">
              {BENEFICIOS.map((b, i) => (
                <div key={i}>
                  <span className="lp2-benef-n">{String(i + 1).padStart(2, '0')}</span>
                  <h3>{b.titulo}</h3>
                  <p>{b.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Calculadora de inadimplência */}
        <section className="lp2-sec lp2-bg-green" aria-labelledby="calc-titulo">
          <div className="lp2-wrap lp2-calc-grid">
            <div>
              <p className="lp2-eyebrow">Calculadora</p>
              <h2 id="calc-titulo" className="lp2-h2">Quanto você perde com inadimplência?</h2>
              <p className="lp2-lead">Descubra em 30 segundos quanto dinheiro está ficando para trás.</p>
              <div className="lp2-calc-como">
                <strong>Como a conta é feita</strong>
                <p>Clientes × mensalidade média × % de inadimplência = quanto fica em aberto todo mês.</p>
                <p>A recuperação usa uma hipótese de {Math.round(RECUPERACAO_HIPOTESE * 100)}% só para dar a ordem de grandeza. Não é promessa de resultado.</p>
              </div>
            </div>

            <div className="lp2-calc">
              <div className="lp2-calc-fields">
                {[
                  { id: 'calc-clientes', l: 'Quantos clientes você tem?', v: roiClientes, s: setRoiClientes, full: true },
                  { id: 'calc-valor', l: 'Valor médio da mensalidade (R$)', v: roiValor, s: setRoiValor },
                  { id: 'calc-inad', l: '% de inadimplência atual', v: roiInad, s: setRoiInad }
                ].map(f => (
                  <div key={f.id} className={f.full ? 'lp2-field lp2-field--full' : 'lp2-field'}>
                    <label htmlFor={f.id}>{f.l}</label>
                    <input id={f.id} type="number" inputMode="decimal" min="0" value={f.v}
                      onChange={e => f.s(e.target.value)} onFocus={e => e.target.select()} />
                  </div>
                ))}
              </div>
              <div className="lp2-calc-res" aria-live="polite">
                <div>
                  <span>Fica em aberto por mês</span>
                  <strong className="lp2-calc-perda">R$ {brl(perdaMensal)}</strong>
                </div>
                <div>
                  <span>Se recuperar {Math.round(RECUPERACAO_HIPOTESE * 100)}% <em>(hipótese)</em></span>
                  <strong className="lp2-calc-ganho">+R$ {brl(recuperacao)}</strong>
                </div>
              </div>
              <button type="button" className="lp2-btn lp2-btn--block" onClick={signup}>Começar a recuperar agora <MdArrowForward size={19} /></button>
            </div>
          </div>
        </section>

        {/* Planos */}
        <section id="precos" className="lp2-sec lp2-bg-off" aria-labelledby="planos-titulo">
          <div className="lp2-wrap">
            <div className="lp2-head2">
              <div>
                <p className="lp2-eyebrow">Planos</p>
                <h2 id="planos-titulo" className="lp2-h2">Escolha o plano ideal para o seu negócio.</h2>
              </div>
              <p className="lp2-lead">Comece a automatizar suas cobranças hoje mesmo, com 3 dias grátis para testar.</p>
            </div>
            <div className="lp2-plans">
              {PLANOS.map(pl => (
                <div key={pl.nome} className={`lp2-plan${pl.destaque ? ' is-pick' : ''}`}>
                  <p className="lp2-plan-eb">{pl.eyebrow}</p>
                  <h3 className="lp2-plan-name">{pl.nome}{pl.destaque && <span className="lp2-plan-badge">Melhor custo-benefício</span>}</h3>
                  <p className="lp2-plan-price"><strong>R${pl.preco}</strong><span>/mês</span></p>
                  <p className="lp2-plan-msg">{pl.perMsg}</p>
                  <button type="button" className={`lp2-btn lp2-btn--block${pl.destaque ? '' : ' lp2-btn--ghost'}`} onClick={signup}>{pl.cta}</button>
                  <ul>
                    {pl.features.map(it => <li key={it}><MdCheck size={17} /> {it}</li>)}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Faixa de confiança (substitui a antiga seção grande de LGPD) */}
        <section className="lp2-trustband" aria-label="Privacidade e confiança">
          <div className="lp2-wrap lp2-trustband-in">
            {CONFIANCA.map(c => (
              <div key={c.t}><c.icon size={20} /><span>{c.t}</span></div>
            ))}
            <button type="button" className="lp2-link" onClick={() => navigate('/privacidade')}>Privacidade e LGPD <MdArrowForward size={17} /></button>
          </div>
        </section>

        {/* FAQ */}
        <section id="faq" className="lp2-sec" aria-labelledby="faq-titulo">
          <div className="lp2-wrap lp2-faq-grid">
            <div>
              <p className="lp2-eyebrow">Dúvidas frequentes</p>
              <h2 id="faq-titulo" className="lp2-h2">Tudo que você precisa saber.</h2>
              <p className="lp2-lead">Não achou sua dúvida? Chama a gente no WhatsApp: suporte em português, com gente de verdade, sem robô e sem fila eterna.</p>
              <a className="lp2-btn lp2-btn--ghost lp2-faq-wa" href={WHATSAPP_CONTATO} target="_blank" rel="noopener noreferrer">
                <FaWhatsapp size={18} /> Falar no WhatsApp
              </a>
            </div>
            <div className="lp2-faq">
              {FAQS.map((f, i) => {
                const open = faqAberto === i
                return (
                  <div key={i} className={`lp2-faq-item${open ? ' is-open' : ''}`}>
                    <h3>
                      <button type="button" id={`faq-q-${i}`} aria-expanded={open} aria-controls={`faq-r-${i}`}
                        onClick={() => setFaqAberto(open ? null : i)}>
                        <span>{f.p}</span><MdAdd size={22} aria-hidden="true" />
                      </button>
                    </h3>
                    <div id={`faq-r-${i}`} role="region" aria-labelledby={`faq-q-${i}`} hidden={!open}>
                      <p>{f.r}</p>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </section>

        {/* CTA final com formulário */}
        <section className="lp2-final" aria-labelledby="final-titulo">
          <div className="lp2-wrap">
            <div className="lp2-final-box">
              <div>
                <h2 id="final-titulo" className="lp2-h2">Pronto para parar de cobrar na mão?</h2>
                <p className="lp2-lead">Configure em 5 minutos e comece a receber amanhã. Sem cartão de crédito, cancele quando quiser.</p>
                <ul className="lp2-final-list">
                  {['Teste grátis por 3 dias', 'Suporte em português, com gente de verdade', 'Migração facilitada da planilha ou de outro sistema'].map(t => (
                    <li key={t}><MdCheckCircle size={20} /> {t}</li>
                  ))}
                </ul>
              </div>
              <div className="lp2-final-form">
                <p className="lp2-final-form-t">Para agilizar, conta pra gente:</p>
                <label htmlFor="cta-desafio">Seu maior desafio com cobrança hoje</label>
                <select id="cta-desafio" value={formDesafio} onChange={e => setFormDesafio(e.target.value)}>
                  <option value="">Selecione…</option>
                  <option>Inadimplência alta</option>
                  <option>Perco tempo cobrando na mão</option>
                  <option>Esqueço de cobrar</option>
                  <option>Outro</option>
                </select>
                <label htmlFor="cta-clientes">Quantos clientes você tem?</label>
                <input id="cta-clientes" type="number" inputMode="numeric" value={formClientes} onChange={e => setFormClientes(e.target.value)} placeholder="Ex: 80" />
                <span className="lp2-final-lbl" id="cta-sistema">Usa algum sistema hoje?</span>
                <div className="lp2-final-opts" role="group" aria-labelledby="cta-sistema">
                  {['Sim', 'Não'].map(op => (
                    <button key={op} type="button" aria-pressed={formSistema === op} className={formSistema === op ? 'is-on' : ''} onClick={() => setFormSistema(op)}>{op}</button>
                  ))}
                </div>
                <button type="button" className="lp2-btn lp2-btn--block" onClick={signup}>Continuar <MdArrowForward size={19} /></button>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="lp2-footer">
        <div className="lp2-wrap">
          <div className="lp2-footer-grid">
            <div>
              <img src="/Logo-Full.png" alt="Mensalli" className="lp2-footer-logo" />
              <p className="lp2-footer-desc">Cobrança automática pelo WhatsApp para quem vive de mensalidade. Menos inadimplência, sem constrangimento.</p>
              <div className="lp2-footer-social">
                <a href={WHATSAPP_CONTATO} target="_blank" rel="noopener noreferrer" aria-label="WhatsApp do Mensalli"><FaWhatsapp size={18} /></a>
                <a href="https://instagram.com/mensalli" target="_blank" rel="noopener noreferrer" aria-label="Instagram do Mensalli"><FaInstagram size={18} /></a>
              </div>
            </div>
            {[
              { t: 'Produto', links: [{ l: 'Recursos', id: 'recursos' }, { l: 'Preços', id: 'precos' }, { l: 'Dúvidas', id: 'faq' }] },
              { t: 'Empresa', links: [{ l: 'Entrar', to: '/login' }, { l: 'Criar conta', to: '/signup' }, { l: 'Contato', href: WHATSAPP_CONTATO }] },
              { t: 'Legal', links: [{ l: 'Termos de Uso', href: '#' }, { l: 'Privacidade', to: '/privacidade' }, { l: 'LGPD', to: '/privacidade' }] }
            ].map(col => (
              <div key={col.t}>
                <p className="lp2-footer-t">{col.t}</p>
                <div className="lp2-footer-links">
                  {col.links.map(lk => (
                    <button key={lk.l} type="button" onClick={() => { if (lk.id) scrollToId(lk.id); else if (lk.to) navigate(lk.to); else if (lk.href) window.open(lk.href, lk.href.startsWith('http') ? '_blank' : '_self') }}>{lk.l}</button>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div className="lp2-footer-bottom">
            <p>© 2026 Mensalli. Todos os direitos reservados.</p>
            <button type="button" onClick={() => navigate('/privacidade')}><MdShield size={14} /> Privacidade · LGPD</button>
          </div>
        </div>
      </footer>

      {/* Botão flutuante WhatsApp */}
      <a href={WHATSAPP_CONTATO} target="_blank" rel="noopener noreferrer" className="lp2-wa-float" aria-label="Falar com o Mensalli no WhatsApp">
        <FaWhatsapp size={30} />
      </a>

      {/* Barra fixa de CTA no mobile */}
      <div className="lp2-mbar">
        <button type="button" className="lp2-btn" onClick={signup}>Teste grátis <MdArrowForward size={18} /></button>
        <button type="button" className="lp2-btn lp2-btn--ghost" onClick={() => navigate('/login')}>Entrar</button>
      </div>
    </div>
  )
}
