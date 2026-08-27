// Landing de nicho: escolinhas de futebol (/escolinha).
//
// Existe pra receber trafego pago com a linguagem do dono de escolinha —
// "atleta", "responsavel", "turma", "Sub-11" — em vez do "cliente" generico da
// landing raiz. As primitivas visuais (paleta, botoes, PhoneChat) vem de
// ./landing/ui pra nao divergir da landing principal.
//
// Atribuicao: capturarAtribuicao() na montagem grava landing_url = /escolinha
// em first-touch. E' assim que a gente separa depois, em meta_atribuicao, quem
// veio por esta pagina de quem veio pela raiz — sem coluna nova em lugar nenhum.

import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  MdCheck, MdCheckCircle, MdArrowForward, MdAdd, MdRemove,
  MdBolt, MdStar, MdTrendingUp, MdTrendingDown, MdLanguage,
  MdEventAvailable, MdLink, MdPayments, MdSentimentDissatisfied,
  MdTableChart, MdForum, MdPersonOff, MdGroups, MdSchedule,
  MdInsights, MdSportsSoccer
} from 'react-icons/md'
import { FaWhatsapp, FaInstagram } from 'react-icons/fa'
import useWindowSize from '../hooks/useWindowSize'
import { capturarAtribuicao } from '../utils/metaAttribution'
import { trackViewContent } from '../utils/metaPixel'
import {
  INK, BODY, MUTED, BORDER, BG, BG_SOFT,
  GREEN, GREEN_DK, GREEN_BRIGHT, GREEN_SOFT, DARK, GRAD,
  gradText, LANDING_CSS, scrollToId, btnGrad, btnGhost,
  Blob, PhoneChat
} from './landing/ui'

const WA_MENSALLI = 'https://wa.me/5562981618862?text=' + encodeURIComponent('Oi! Tenho uma escolinha de futebol e quero saber mais sobre o Mensalli.')

// SPA sem render no servidor: o Google executa JS e le isso, mas o preview de
// link no WhatsApp/Meta continua vindo do index.html estatico. Pra trafego pago
// nao importa (o criativo do anuncio e' outro); se um dia a gente for compartilhar
// o link na mao, ai vale um prerender de verdade.
function setMeta(nome, conteudo, attr = 'name') {
  if (!conteudo) return
  let el = document.querySelector(`meta[${attr}="${nome}"]`)
  if (!el) {
    el = document.createElement('meta')
    el.setAttribute(attr, nome)
    document.head.appendChild(el)
  }
  el.setAttribute('content', conteudo)
}

const TITULO_SEO = 'Sistema para escolinha de futebol — cobrança de mensalidade no WhatsApp | Mensalli'
const DESC_SEO = 'O Mensalli cobra a mensalidade da sua escolinha de futebol sozinho, pelo WhatsApp da própria escolinha. Turmas, chamada, Pix com baixa automática e portal do responsável. Teste grátis por 3 dias.'

export default function LandingEscolinha() {
  const navigate = useNavigate()
  const { isSmallScreen } = useWindowSize()
  const [faqAberto, setFaqAberto] = useState(null)
  const [abaPainel, setAbaPainel] = useState(0)

  // Calculadora de perda — mesmos numeros da landing raiz, mas com os defaults
  // de uma escolinha media (80 atletas, R$130, inadimplencia alta).
  const [roiAtletas, setRoiAtletas] = useState('80')
  const [roiValor, setRoiValor] = useState('130')
  const [roiInad, setRoiInad] = useState('25')
  const perdaMensal = useMemo(
    () => (Number(roiAtletas) || 0) * (Number(roiValor) || 0) * ((Number(roiInad) || 0) / 100),
    [roiAtletas, roiValor, roiInad]
  )
  const recuperacao = useMemo(() => perdaMensal * 0.7, [perdaMensal])

  useEffect(() => {
    capturarAtribuicao()
    trackViewContent('landing-escolinha')

    const tituloAnterior = document.title
    document.title = TITULO_SEO
    setMeta('description', DESC_SEO)
    setMeta('og:title', TITULO_SEO, 'property')
    setMeta('og:description', DESC_SEO, 'property')
    setMeta('og:url', 'https://www.mensalli.com.br/escolinha', 'property')
    return () => { document.title = tituloAnterior }
  }, [])

  // Preserva a querystring que trouxe a pessoa (utm_*, fbclid) e marca a origem.
  const irParaSignup = () => {
    const params = new URLSearchParams(window.location.search)
    params.set('origem', 'escolinha')
    navigate(`/signup?${params.toString()}`)
  }

  const dores = [
    { icon: MdSentimentDissatisfied, titulo: 'O "semana que vem eu levo"', desc: 'O responsável promete no portão, você anota de cabeça, e o mês vira sem o dinheiro entrar.' },
    { icon: MdTableChart, titulo: 'A planilha que só você entende', desc: 'Quem pagou, quem deve, quem saiu. Se você não abrir o arquivo, ninguém na escolinha sabe de nada.' },
    { icon: MdForum, titulo: 'O WhatsApp virou secretaria', desc: 'Aviso de treino, 2ª via, remarcação e cobrança no mesmo lugar — e sempre no meio do treino.' },
    { icon: MdPersonOff, titulo: 'O atleta que sumiu e ninguém viu', desc: 'Faltou três semanas seguidas, ninguém ligou, e no fim do mês virou cancelamento.' }
  ]

  const abas = [
    {
      nome: 'Cobrança',
      titulo: 'A mensalidade chega antes de você precisar pedir',
      desc: 'O sistema avisa o responsável 3 dias antes, no dia e depois do vencimento — pelo WhatsApp da escolinha. Quem paga pelo link do Pix tem baixa automática e sai da fila na hora.',
      bullets: ['Régua de lembretes que você configura uma vez', 'Pix, cartão e boleto no mesmo link', 'Parou de cobrar sozinho quando o dinheiro cai']
    },
    {
      nome: 'Turmas e horários',
      titulo: 'Cada categoria no seu dia, no seu horário',
      desc: 'Sub-9, Sub-11, Sub-13, turma da manhã, turma da tarde. Monte a grade uma vez e a agenda da semana fica montada — com chamada por turma e por dia.',
      bullets: ['Grade semanal por categoria', 'Chamada de presença em dois toques', 'Lembrete de treino automático pro responsável']
    },
    {
      nome: 'Atletas e responsáveis',
      titulo: 'A ficha do atleta e o contato de quem paga',
      desc: 'Cada atleta com ficha, responsável, telefone e histórico. O responsável recebe as cobranças e acompanha tudo pelo portal, sem te pedir 2ª via.',
      bullets: ['Ficha do atleta e do responsável legal', 'Portal do responsável com histórico e link de pagamento', 'Contrato de matrícula assinado pelo celular']
    },
    {
      nome: 'Visão do dono',
      titulo: 'Quanto entra, quanto falta, quem sumiu',
      desc: 'Num olhar você vê o que já caiu no mês, o que ainda falta e a inadimplência real da escolinha. E o Radar de Evasão aponta o atleta que começou a faltar.',
      bullets: ['Recebido, a receber e inadimplência do mês', 'Radar de evasão por queda de presença', 'Relatório por turma e por período']
    }
  ]

  const passos = [
    { numero: '01', titulo: 'Conecte o WhatsApp da escolinha', desc: 'Escaneia o QR Code com o número que os responsáveis já conhecem. Leva menos de um minuto.' },
    { numero: '02', titulo: 'Cadastre atletas, turmas e valores', desc: 'Traga sua planilha ou cadastre na mão. Categoria, dia de treino e dia do vencimento.' },
    { numero: '03', titulo: 'Ligue a régua e volte pro campo', desc: 'A partir daí a cobrança sai sozinha, todo mês, sem você mandar uma mensagem.' }
  ]

  const diferenciais = [
    { icon: FaWhatsapp, titulo: 'Sai do seu próprio número', desc: 'O responsável recebe do WhatsApp da escolinha, não de um número estranho de sistema. E responde pra você, como sempre.' },
    { icon: MdPayments, titulo: 'Pix com baixa automática', desc: 'Pagou pelo link, o sistema registra na hora e para de cobrar aquele atleta. Sem você conferir extrato.' },
    { icon: MdLink, titulo: 'Portal do responsável', desc: 'Ele abre um link e vê mensalidade, histórico e 2ª via sozinho. Um assunto a menos no seu WhatsApp.' },
    { icon: MdLanguage, titulo: 'Site da escolinha incluso', desc: 'Sua página em mensalli.com.br/sua-escolinha, com turmas, valores e botão de WhatsApp. Sem programador.' },
    { icon: MdEventAvailable, titulo: 'Link de aula experimental', desc: 'Manda o link no Instagram e o pai marca a experimental ou a peneira direto na sua agenda.' },
    { icon: MdTrendingDown, titulo: 'Radar de evasão', desc: 'O atleta que começou a faltar aparece pra você antes de virar cancelamento — dá tempo de ligar.' }
  ]

  const planos = [
    {
      nome: 'Starter', eyebrow: 'Escolinha começando', preco: 49, destaque: false,
      features: ['Até 50 atletas ativos', '200 mensagens/mês', 'Cobrança automática no vencimento', '1 template de mensagem', 'Painel do financeiro']
    },
    {
      nome: 'Pro', eyebrow: 'A maioria das escolinhas', preco: 99, destaque: true,
      features: ['Até 150 atletas ativos', '600 mensagens/mês', 'Régua completa (antes, no dia e depois)', 'Turmas, grade e chamada', 'Contrato com assinatura', 'Ficha do atleta', 'Suporte no WhatsApp']
    },
    {
      nome: 'Premium', eyebrow: 'Mais de uma unidade', preco: 149, destaque: false,
      features: ['Até 500 atletas ativos', '3.000 mensagens/mês', 'Tudo do Pro', 'Site da escolinha', 'Link de aula experimental', 'Bot que responde o responsável', 'Campanhas de WhatsApp', 'Suporte prioritário']
    }
  ]

  const faqs = [
    { p: 'As mensagens saem do meu número mesmo?', r: 'Saem. Você conecta o WhatsApp da escolinha por QR Code e as cobranças partem dele. O responsável recebe do número que já conhece e responde pra você, como sempre fez.' },
    { p: 'Meu número pode ser banido?', r: 'Não, usando como o sistema foi feito pra ser usado: mensagem de cobrança e aviso só pra quem você cadastrou. O que derruba número é lista comprada e disparo em massa pra desconhecido — isso o Mensalli não faz.' },
    { p: 'E o responsável que paga em dinheiro na mão?', r: 'Você dá baixa manual em dois toques e o sistema para de cobrar aquele atleta na hora. Quem paga pelo link do Pix tem baixa automática, sem você mexer.' },
    { p: 'Dá pra separar por categoria e turma?', r: 'Dá. Sub-9, Sub-11, Sub-13, turma da manhã, turma da tarde — cada atleta na sua turma, com horário de treino e chamada de presença.' },
    { p: 'Tenho dois irmãos na escolinha. Como fica?', r: 'Cada atleta tem a própria mensalidade e a própria ficha, mas o mesmo responsável recebe as cobranças no mesmo WhatsApp.' },
    { p: 'Consigo controlar presença?', r: 'Sim. Chamada por turma e por dia, e um radar que aponta o atleta cuja frequência começou a cair — antes de virar cancelamento.' },
    { p: 'Quanto tempo leva pra configurar?', r: 'Cerca de cinco minutos pra conectar o WhatsApp e cadastrar as primeiras turmas. Se você já tem planilha, dá pra importar.' },
    { p: 'Preciso instalar alguma coisa?', r: 'Não. É tudo pelo navegador, no celular e no computador. Nada pra instalar em máquina nenhuma.' }
  ]

  const sectionPad = isSmallScreen ? '64px 22px' : '110px 24px'
  const h2 = { fontSize: isSmallScreen ? '30px' : '44px', fontWeight: '800', letterSpacing: '-1.4px', color: INK, lineHeight: '1.1', margin: '0 0 16px' }
  const eyebrow = { display: 'inline-flex', alignItems: 'center', gap: '7px', fontSize: '13px', fontWeight: '700', color: GREEN_DK, backgroundColor: GREEN_SOFT, padding: '6px 14px', borderRadius: '100px', marginBottom: '18px' }
  const sub = { fontSize: '17px', color: BODY, lineHeight: '1.6', maxWidth: '620px', margin: '0 auto' }
  const navLink = { padding: '8px 14px', backgroundColor: 'transparent', color: BODY, border: 'none', fontSize: '14px', fontWeight: '500', cursor: 'pointer' }

  return (
    <div style={{ fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif', backgroundColor: BG, color: INK, WebkitFontSmoothing: 'antialiased', overflowX: 'hidden' }}>
      <style>{LANDING_CSS}</style>

      {/* Navbar */}
      <nav style={{ backgroundColor: 'rgba(255,255,255,0.82)', backdropFilter: 'saturate(180%) blur(14px)', WebkitBackdropFilter: 'saturate(180%) blur(14px)', padding: '14px 0', borderBottom: `1px solid ${BORDER}`, position: 'sticky', top: 0, zIndex: 1000 }}>
        <div style={{ maxWidth: '1180px', margin: '0 auto', padding: '0 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <a href="/" style={{ display: 'flex', alignItems: 'center', textDecoration: 'none' }}>
            <img src="/Logo-Full.png" alt="Mensalli" style={{ height: '34px', width: 'auto', cursor: 'pointer' }} />
          </a>
          <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
            {!isSmallScreen && (
              <>
                <button onClick={() => scrollToId('painel')} style={navLink}>O sistema</button>
                <button onClick={() => scrollToId('como-funciona')} style={navLink}>Como funciona</button>
                <button onClick={() => scrollToId('precos')} style={navLink}>Planos</button>
                <button onClick={() => scrollToId('faq')} style={navLink}>Dúvidas</button>
                <button onClick={() => navigate('/login')} style={{ ...navLink, color: INK, fontWeight: '600' }}>Entrar</button>
              </>
            )}
            <button onClick={irParaSignup} style={btnGrad('10px 18px', '14px')}
              onMouseOver={e => e.currentTarget.style.opacity = '.9'} onMouseOut={e => e.currentTarget.style.opacity = '1'}>
              Teste grátis
            </button>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section style={{ position: 'relative', padding: isSmallScreen ? '48px 22px 60px' : '84px 24px 96px', overflow: 'hidden', background: 'linear-gradient(180deg, #f3fbf6 0%, #ffffff 70%)' }}>
        <Blob style={{ top: '-120px', right: '-80px', width: '520px', height: '520px', opacity: 0.55 }} />
        <div style={{ maxWidth: '1120px', margin: '0 auto', position: 'relative', zIndex: 1, display: 'grid', gridTemplateColumns: isSmallScreen ? '1fr' : '1.05fr .95fr', gap: isSmallScreen ? '44px' : '56px', alignItems: 'center' }}>
          <div style={{ textAlign: isSmallScreen ? 'center' : 'left' }}>
            <div style={eyebrow}><MdSportsSoccer size={15} /> Gestão para escolinhas de futebol</div>
            <h1 style={{ fontSize: isSmallScreen ? '36px' : '58px', fontWeight: '800', lineHeight: '1.05', letterSpacing: '-2px', margin: '0 0 20px' }}>
              A mensalidade da escolinha <span style={gradText}>cobra sozinha</span>. No seu WhatsApp.
            </h1>
            <p style={{ fontSize: isSmallScreen ? '17px' : '19px', color: BODY, lineHeight: 1.6, margin: '0 0 30px', maxWidth: '520px', marginLeft: isSmallScreen ? 'auto' : 0, marginRight: isSmallScreen ? 'auto' : 0 }}>
              O Mensalli lembra cada responsável, manda o Pix e dá baixa quando o dinheiro cai. Você volta pro campo.
            </p>
            <div style={{ display: 'flex', gap: '12px', flexDirection: isSmallScreen ? 'column' : 'row', alignItems: 'center', justifyContent: isSmallScreen ? 'center' : 'flex-start' }}>
              <button onClick={irParaSignup} style={{ ...btnGrad('15px 30px', '16px'), width: isSmallScreen ? '100%' : 'auto' }}
                onMouseOver={e => { e.currentTarget.style.transform = 'translateY(-2px)' }} onMouseOut={e => { e.currentTarget.style.transform = 'translateY(0)' }}>
                Testar grátis por 3 dias <MdArrowForward size={20} />
              </button>
              <button onClick={() => scrollToId('painel')} style={btnGhost('15px 26px', isSmallScreen ? '100%' : 'auto')}
                onMouseOver={e => e.currentTarget.style.borderColor = '#cfd3da'} onMouseOut={e => e.currentTarget.style.borderColor = BORDER}>
                Ver o sistema
              </button>
            </div>
            <div style={{ display: 'flex', gap: isSmallScreen ? '14px' : '22px', flexWrap: 'wrap', marginTop: '22px', fontSize: '13.5px', color: BODY, justifyContent: isSmallScreen ? 'center' : 'flex-start' }}>
              {['Sai do seu próprio número', 'Sem cartão de crédito', 'Cancele quando quiser'].map((t, i) => (
                <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}><MdCheckCircle size={16} style={{ color: GREEN }} /> {t}</span>
              ))}
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'center', position: 'relative' }}>
            <PhoneChat
              isSmall={isSmallScreen}
              titulo="Escolinha do Craque"
              subtitulo="online"
              mensagens={[
                { de: 'nos', texto: 'Oi, Dona Cláudia! 👋 A mensalidade do Miguel (Sub-11) vence amanhã — R$ 130.', hora: '09:12', tickAnimado: true },
                { de: 'nos', texto: 'Pode pagar no Pix por aqui 👇', hora: '09:12', anexo: 'pix' },
                { de: 'eles', texto: 'Pago! Mandei agorinha 🙏', hora: '09:26' },
                { de: 'nos', texto: 'Recebemos, obrigado! Bom treino quinta ⚽', hora: '09:26' }
              ]}
            />
          </div>
        </div>
      </section>

      {/* Faixa marquee */}
      <div style={{ background: GRAD, padding: '13px 0', overflow: 'hidden', position: 'relative' }}>
        <div className="lp-marquee" style={{ display: 'flex', width: 'max-content' }}>
          {[0, 1].map(rep => (
            <div key={rep} style={{ display: 'flex', alignItems: 'center' }} aria-hidden={rep === 1}>
              {['Mensalidade em dia', 'Chamada feita', 'Turma cheia', 'Pix na conta', 'Responsável avisado', 'Zero planilha', 'Treino na hora', 'Caixa fechado'].map((t, i) => (
                <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: '14px', padding: '0 20px', fontSize: '13px', fontWeight: '700', letterSpacing: '.08em', textTransform: 'uppercase', color: 'white', whiteSpace: 'nowrap' }}>
                  {t}
                  <MdSportsSoccer size={14} style={{ opacity: 0.6 }} />
                </span>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* Dor */}
      <section style={{ padding: sectionPad, backgroundColor: BG_SOFT }}>
        <div style={{ maxWidth: '1080px', margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: '48px' }}>
            <p style={eyebrow}><MdSportsSoccer size={15} /> A real de quem toca escolinha</p>
            <h2 style={h2}>Você não abriu uma escolinha <span style={gradText}>pra virar cobrador</span>.</h2>
            <p style={sub}>Todo mês a mesma coisa: conferir quem pagou, cobrar no portão, refazer a planilha. O treino fica pro fim do dia — e a escolinha para de crescer junto.</p>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: isSmallScreen ? '1fr' : 'repeat(2, 1fr)', gap: '16px' }}>
            {dores.map((d, i) => (
              <div key={i} className="lp-card" style={{ backgroundColor: 'white', border: `1px solid ${BORDER}`, borderRadius: '18px', padding: '26px', display: 'flex', gap: '16px', alignItems: 'flex-start' }}>
                <div style={{ width: '44px', height: '44px', borderRadius: '13px', backgroundColor: '#fef2f2', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <d.icon size={21} style={{ color: '#dc2626' }} />
                </div>
                <div>
                  <h3 style={{ fontSize: '16.5px', fontWeight: '700', color: INK, margin: '0 0 7px' }}>{d.titulo}</h3>
                  <p style={{ fontSize: '14px', color: BODY, margin: 0, lineHeight: 1.55 }}>{d.desc}</p>
                </div>
              </div>
            ))}
          </div>
          <p style={{ textAlign: 'center', marginTop: '40px', fontSize: isSmallScreen ? '19px' : '23px', fontWeight: '700', color: INK, letterSpacing: '-.6px' }}>
            O Mensalli existe pra devolver <span style={gradText}>o seu tempo pro campo.</span>
          </p>
        </div>
      </section>

      {/* Painel com abas */}
      <section id="painel" style={{ padding: sectionPad }}>
        <div style={{ maxWidth: '1080px', margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: '40px' }}>
            <p style={eyebrow}><MdInsights size={15} /> Um painel só</p>
            <h2 style={h2}>A escolinha inteira <span style={gradText}>numa tela</span></h2>
            <p style={sub}>Cobrança, turmas, atletas e o caixa do mês — sem trocar de aba.</p>
          </div>

          {/* Abas */}
          <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', flexWrap: 'wrap', marginBottom: '32px' }}>
            {abas.map((a, i) => {
              const ativa = abaPainel === i
              return (
                <button key={i} onClick={() => setAbaPainel(i)} style={{
                  padding: '10px 18px', fontSize: '14px', fontWeight: ativa ? '700' : '500',
                  borderRadius: '100px', cursor: 'pointer', transition: 'all .2s',
                  border: `1px solid ${ativa ? 'transparent' : BORDER}`,
                  background: ativa ? GRAD : 'white',
                  color: ativa ? 'white' : BODY
                }}
                  onMouseOver={e => { if (!ativa) e.currentTarget.style.background = BG_SOFT }}
                  onMouseOut={e => { if (!ativa) e.currentTarget.style.background = 'white' }}>
                  {a.nome}
                </button>
              )
            })}
          </div>

          <div style={{ backgroundColor: BG_SOFT, border: `1px solid ${BORDER}`, borderRadius: '24px', padding: isSmallScreen ? '28px 22px' : '44px', display: 'grid', gridTemplateColumns: isSmallScreen ? '1fr' : '.9fr 1.1fr', gap: isSmallScreen ? '30px' : '44px', alignItems: 'center' }}>
            <div>
              <h3 style={{ fontSize: isSmallScreen ? '22px' : '27px', fontWeight: '800', color: INK, letterSpacing: '-.8px', lineHeight: 1.2, margin: '0 0 14px' }}>{abas[abaPainel].titulo}</h3>
              <p style={{ fontSize: '15.5px', color: BODY, lineHeight: 1.65, margin: '0 0 22px' }}>{abas[abaPainel].desc}</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '11px' }}>
                {abas[abaPainel].bullets.map((b, i) => (
                  <span key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', fontSize: '14.5px', color: INK, fontWeight: '500' }}>
                    <MdCheckCircle size={19} style={{ color: GREEN, flexShrink: 0, marginTop: '1px' }} /> {b}
                  </span>
                ))}
              </div>
            </div>
            <MockPainel aba={abaPainel} isSmall={isSmallScreen} />
          </div>
        </div>
      </section>

      {/* Como funciona — bloco escuro */}
      <section id="como-funciona" style={{ padding: isSmallScreen ? '24px 16px' : '40px 24px' }}>
        <div style={{ maxWidth: '1100px', margin: '0 auto', background: DARK, borderRadius: '28px', padding: isSmallScreen ? '48px 26px' : '72px 56px', position: 'relative', overflow: 'hidden' }}>
          <LinhasCampo />
          <Blob style={{ bottom: '-200px', right: '-140px', width: '520px', height: '520px', opacity: 0.45 }} />
          <div style={{ position: 'relative', zIndex: 1 }}>
            <div style={{ textAlign: 'center', marginBottom: '48px' }}>
              <p style={{ ...eyebrow, backgroundColor: 'rgba(34,197,94,0.14)', color: GREEN_BRIGHT }}><MdBolt size={15} /> Como funciona</p>
              <h2 style={{ ...h2, color: 'white' }}>Três passos. <span style={gradText}>Nenhuma planilha.</span></h2>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: isSmallScreen ? '1fr' : 'repeat(3, 1fr)', gap: '20px' }}>
              {passos.map((p, i) => (
                <div key={i} style={{ backgroundColor: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.09)', borderRadius: '18px', padding: '28px' }}>
                  <div style={{ width: '44px', height: '44px', borderRadius: '12px', background: GRAD, color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '15px', fontWeight: '800', marginBottom: '18px' }}>{p.numero}</div>
                  <h3 style={{ fontSize: '17px', fontWeight: '700', margin: '0 0 9px', color: 'white' }}>{p.titulo}</h3>
                  <p style={{ color: 'rgba(255,255,255,0.62)', lineHeight: 1.6, fontSize: '14.5px', margin: 0 }}>{p.desc}</p>
                </div>
              ))}
            </div>
            <div style={{ textAlign: 'center', marginTop: '40px' }}>
              <button onClick={irParaSignup} style={{ ...btnGrad('15px 30px', '16px'), margin: '0 auto', width: isSmallScreen ? '100%' : 'auto' }}
                onMouseOver={e => { e.currentTarget.style.transform = 'translateY(-2px)' }} onMouseOut={e => { e.currentTarget.style.transform = 'translateY(0)' }}>
                Começar agora — grátis por 3 dias <MdArrowForward size={20} />
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Diferenciais */}
      <section style={{ padding: sectionPad }}>
        <div style={{ maxWidth: '1080px', margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: '48px' }}>
            <p style={eyebrow}><MdStar size={15} /> Feito pra escolinha</p>
            <h2 style={h2}>O que você <span style={gradText}>não acha em planilha nenhuma</span></h2>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: isSmallScreen ? '1fr' : 'repeat(3, 1fr)', gap: '16px' }}>
            {diferenciais.map((d, i) => (
              <div key={i} className="lp-card" style={{ backgroundColor: 'white', border: `1px solid ${BORDER}`, borderRadius: '18px', padding: '26px' }}>
                <div style={{ width: '46px', height: '46px', borderRadius: '13px', background: GREEN_SOFT, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '16px' }}>
                  <d.icon size={22} style={{ color: GREEN_DK }} />
                </div>
                <h3 style={{ fontSize: '16.5px', fontWeight: '700', color: INK, margin: '0 0 7px' }}>{d.titulo}</h3>
                <p style={{ fontSize: '14px', color: BODY, margin: 0, lineHeight: 1.55 }}>{d.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Calculadora */}
      <section style={{ padding: sectionPad, backgroundColor: BG_SOFT }}>
        <div style={{ maxWidth: '700px', margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: '40px' }}>
            <p style={eyebrow}><MdTrendingUp size={15} /> Faz a conta</p>
            <h2 style={h2}>Quanto a sua escolinha <span style={gradText}>deixa na mesa?</span></h2>
            <p style={sub}>Coloque os números da sua realidade e veja o tamanho do buraco.</p>
          </div>
          <div style={{ backgroundColor: 'white', borderRadius: '22px', padding: isSmallScreen ? '24px' : '40px', border: `1px solid ${BORDER}`, boxShadow: '0 20px 50px rgba(16,24,40,0.06)' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '18px', marginBottom: '26px' }}>
              {[
                { l: 'Quantos atletas você tem?', v: roiAtletas, s: setRoiAtletas },
                { l: 'Valor da mensalidade (R$)', v: roiValor, s: setRoiValor },
                { l: '% que atrasa todo mês', v: roiInad, s: setRoiInad }
              ].map((f, i) => (
                <div key={i}>
                  <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', color: INK, marginBottom: '8px' }}>{f.l}</label>
                  <input type="number" inputMode="numeric" value={f.v} onChange={e => f.s(e.target.value)}
                    style={{ width: '100%', padding: '13px 16px', fontSize: '16px', backgroundColor: BG_SOFT, color: INK, border: `1.5px solid ${BORDER}`, borderRadius: '11px', outline: 'none', boxSizing: 'border-box', transition: 'border-color .2s' }}
                    onFocus={e => { e.target.style.borderColor = GREEN; e.target.select() }} onBlur={e => e.target.style.borderColor = BORDER} />
                </div>
              ))}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: isSmallScreen ? '1fr' : '1fr 1fr', gap: '12px', marginBottom: '20px' }}>
              <div style={{ backgroundColor: '#fef2f2', borderRadius: '14px', padding: '20px', border: '1px solid #fecaca' }}>
                <p style={{ fontSize: '13px', color: '#b91c1c', margin: '0 0 4px', fontWeight: '600' }}>Fica pra trás por mês</p>
                <p style={{ fontSize: '26px', fontWeight: '800', color: '#dc2626', margin: 0 }}>R$ {perdaMensal.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
              </div>
              <div style={{ background: `linear-gradient(135deg, ${GREEN_SOFT}, #e9fbf1)`, borderRadius: '14px', padding: '20px', border: '1px solid #bbf7d0' }}>
                <p style={{ fontSize: '13px', color: GREEN_DK, margin: '0 0 4px', fontWeight: '600' }}>Recupere até 70%</p>
                <p style={{ fontSize: '26px', fontWeight: '800', color: GREEN, margin: 0 }}>+R$ {recuperacao.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
              </div>
            </div>
            <p style={{ fontSize: '12px', color: MUTED, margin: '0 0 20px', textAlign: 'center' }}>
              Estimativa a partir dos seus números — não é promessa de resultado.
            </p>
            <button onClick={irParaSignup} style={{ ...btnGrad('16px', '16px'), width: '100%' }}
              onMouseOver={e => { e.currentTarget.style.transform = 'translateY(-2px)' }} onMouseOut={e => { e.currentTarget.style.transform = 'translateY(0)' }}>
              Quero recuperar isso <MdArrowForward size={20} />
            </button>
          </div>
        </div>
      </section>

      {/* Preços */}
      <section id="precos" style={{ padding: sectionPad }}>
        <div style={{ maxWidth: '1080px', margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: '48px' }}>
            <p style={eyebrow}><MdStar size={15} /> Planos</p>
            <h2 style={h2}>Custa menos que <span style={gradText}>uma mensalidade de atleta</span></h2>
            <p style={sub}>Um atleta paga o sistema inteiro. Três dias grátis, sem cartão.</p>
          </div>
          {/* alignItems stretch + o ul crescendo (flex:1) mantem os botoes dos tres
              planos na mesma linha, independente de quantas features cada um tem */}
          <div style={{ display: 'grid', gridTemplateColumns: isSmallScreen ? '1fr' : 'repeat(3, 1fr)', gap: '20px', alignItems: 'stretch' }}>
            {planos.map((pl, i) => {
              const d = pl.destaque
              return (
                <div key={i} style={{ backgroundColor: 'white', padding: '34px', borderRadius: '22px', border: d ? `2px solid ${GREEN}` : `1px solid ${BORDER}`, position: 'relative', transform: (d && !isSmallScreen) ? 'scale(1.04)' : 'none', boxShadow: d ? '0 26px 60px rgba(22,163,74,0.18)' : '0 12px 30px rgba(16,24,40,0.05)', display: 'flex', flexDirection: 'column' }}>
                  {d && <div style={{ position: 'absolute', top: '-13px', left: '50%', transform: 'translateX(-50%)', background: GRAD, color: 'white', padding: '6px 16px', borderRadius: '100px', fontSize: '12px', fontWeight: '700', whiteSpace: 'nowrap' }}>Mais escolhido</div>}
                  <p style={{ fontSize: '12px', fontWeight: '700', color: MUTED, margin: '0 0 6px', textTransform: 'uppercase', letterSpacing: '.5px' }}>{pl.eyebrow}</p>
                  <h3 style={{ fontSize: '22px', fontWeight: '700', color: INK, margin: '0 0 16px' }}>{pl.nome}</h3>
                  <div style={{ marginBottom: '24px' }}>
                    <span style={{ fontSize: '46px', fontWeight: '800', letterSpacing: '-1.5px', color: INK }}>R${pl.preco}</span>
                    <span style={{ fontSize: '16px', color: MUTED }}>/mês</span>
                  </div>
                  <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 30px', flex: 1 }}>
                    {pl.features.map((it, j) => (
                      <li key={j} style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', marginBottom: '12px', fontSize: '14px', color: BODY }}>
                        <MdCheck size={18} style={{ color: GREEN, flexShrink: 0, marginTop: '2px' }} /> {it}
                      </li>
                    ))}
                  </ul>
                  <button onClick={irParaSignup} style={d ? { ...btnGrad('14px', '15px'), width: '100%' } : { ...btnGhost('14px', '100%') }}
                    onMouseOver={e => { if (d) e.currentTarget.style.opacity = '.9'; else e.currentTarget.style.borderColor = '#cfd3da' }}
                    onMouseOut={e => { if (d) e.currentTarget.style.opacity = '1'; else e.currentTarget.style.borderColor = BORDER }}>
                    Testar grátis
                  </button>
                </div>
              )
            })}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" style={{ padding: sectionPad, backgroundColor: BG_SOFT }}>
        <div style={{ maxWidth: '1080px', margin: '0 auto', display: 'grid', gridTemplateColumns: isSmallScreen ? '1fr' : '.8fr 1.2fr', gap: isSmallScreen ? '32px' : '56px', alignItems: 'start' }}>
          <div>
            <h2 style={{ ...h2, fontSize: isSmallScreen ? '28px' : '38px' }}>O que todo dono de escolinha <span style={gradText}>pergunta</span></h2>
            <p style={{ fontSize: '15.5px', color: BODY, lineHeight: 1.6, margin: '0 0 22px' }}>
              Não achou a sua? Chama a gente no WhatsApp — responde gente de verdade.
            </p>
            <a href={WA_MENSALLI} target="_blank" rel="noopener noreferrer"
              style={{ ...btnGhost('13px 22px', 'fit-content'), textDecoration: 'none', display: 'inline-flex' }}>
              <FaWhatsapp size={18} style={{ color: GREEN }} /> Falar no WhatsApp
            </a>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {faqs.map((f, i) => {
              const open = faqAberto === i
              return (
                <div key={i} style={{ border: `1px solid ${open ? '#cdeed8' : BORDER}`, borderRadius: '14px', overflow: 'hidden', cursor: 'pointer', backgroundColor: 'white', transition: 'border-color .2s' }} onClick={() => setFaqAberto(open ? null : i)}>
                  <div style={{ padding: '18px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '16px' }}>
                    <span style={{ fontSize: '15.5px', fontWeight: '600', color: INK }}>{f.p}</span>
                    {open ? <MdRemove size={20} style={{ color: GREEN, flexShrink: 0 }} /> : <MdAdd size={20} style={{ color: MUTED, flexShrink: 0 }} />}
                  </div>
                  {open && <div style={{ padding: '0 20px 18px', color: BODY, fontSize: '14.5px', lineHeight: 1.6 }}>{f.r}</div>}
                </div>
              )
            })}
          </div>
        </div>
      </section>

      {/* CTA final */}
      <section style={{ padding: isSmallScreen ? '24px 16px 64px' : '40px 24px 110px' }}>
        <div style={{ maxWidth: '1080px', margin: '0 auto', background: DARK, borderRadius: '28px', padding: isSmallScreen ? '48px 26px' : '76px 56px', position: 'relative', overflow: 'hidden', textAlign: 'center' }}>
          <LinhasCampo />
          <Blob style={{ top: '-160px', left: '-100px', width: '460px', height: '460px', opacity: 0.5 }} />
          <div style={{ position: 'relative', zIndex: 1 }}>
            <p style={{ ...eyebrow, backgroundColor: 'rgba(34,197,94,0.14)', color: GREEN_BRIGHT }}><MdSportsSoccer size={15} /> Bola pra frente</p>
            <h2 style={{ fontSize: isSmallScreen ? '32px' : '46px', fontWeight: '800', color: 'white', letterSpacing: '-1.8px', lineHeight: 1.08, margin: '0 0 16px' }}>
              Menos planilha. <span style={gradText}>Mais campo.</span>
            </h2>
            <p style={{ fontSize: '17px', color: 'rgba(255,255,255,0.68)', lineHeight: 1.6, margin: '0 auto 32px', maxWidth: '520px' }}>
              Configure em cinco minutos e comece a cobrar amanhã sem mandar uma mensagem na mão.
            </p>
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexDirection: isSmallScreen ? 'column' : 'row', alignItems: 'center' }}>
              <button onClick={irParaSignup} style={{ ...btnGrad('16px 32px', '16px'), width: isSmallScreen ? '100%' : 'auto' }}
                onMouseOver={e => { e.currentTarget.style.transform = 'translateY(-2px)' }} onMouseOut={e => { e.currentTarget.style.transform = 'translateY(0)' }}>
                Criar minha conta grátis <MdArrowForward size={20} />
              </button>
              <a href={WA_MENSALLI} target="_blank" rel="noopener noreferrer"
                style={{ padding: '16px 28px', fontSize: '15px', backgroundColor: 'rgba(255,255,255,0.06)', color: 'white', border: '1px solid rgba(255,255,255,0.16)', borderRadius: '12px', fontWeight: '600', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '9px', textDecoration: 'none', width: isSmallScreen ? '100%' : 'auto', boxSizing: 'border-box' }}>
                <FaWhatsapp size={18} /> Tirar uma dúvida
              </a>
            </div>
            <div style={{ display: 'flex', gap: '20px', justifyContent: 'center', flexWrap: 'wrap', marginTop: '26px', fontSize: '13.5px', color: 'rgba(255,255,255,0.6)' }}>
              {['3 dias grátis', 'Sem cartão de crédito', 'Suporte no WhatsApp'].map((t, i) => (
                <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}><MdCheckCircle size={16} style={{ color: GREEN_BRIGHT }} /> {t}</span>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer style={{ backgroundColor: '#0a0c0a', color: 'rgba(255,255,255,0.62)', padding: isSmallScreen ? '48px 24px 28px' : '64px 24px 32px' }}>
        <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
          <div style={{ display: 'grid', gridTemplateColumns: isSmallScreen ? '1fr' : '1.6fr 1fr 1fr', gap: isSmallScreen ? '36px' : '40px', marginBottom: '40px' }}>
            <div>
              <img src="/Logo-Full.png" alt="Mensalli" style={{ height: '32px', width: 'auto', filter: 'brightness(0) invert(1)', marginBottom: '16px' }} />
              <p style={{ fontSize: '14px', color: 'rgba(255,255,255,0.5)', lineHeight: 1.6, maxWidth: '320px', margin: '0 0 18px' }}>
                Cobrança automática pelo WhatsApp para escolinhas de futebol. Menos planilha, menos inadimplência, mais tempo no campo.
              </p>
              <div style={{ display: 'flex', gap: '10px' }}>
                {[{ icon: FaWhatsapp, href: WA_MENSALLI }, { icon: FaInstagram, href: 'https://instagram.com/mensalli' }].map((s, i) => (
                  <a key={i} href={s.href} target="_blank" rel="noopener noreferrer"
                    style={{ width: '38px', height: '38px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.7)', transition: 'all .2s' }}
                    onMouseOver={e => { e.currentTarget.style.color = GREEN_BRIGHT; e.currentTarget.style.borderColor = 'rgba(34,197,94,0.4)' }}
                    onMouseOut={e => { e.currentTarget.style.color = 'rgba(255,255,255,0.7)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.12)' }}>
                    <s.icon size={18} />
                  </a>
                ))}
              </div>
            </div>
            {[
              { t: 'Sistema', links: [{ l: 'O sistema', id: 'painel' }, { l: 'Como funciona', id: 'como-funciona' }, { l: 'Planos', id: 'precos' }, { l: 'Dúvidas', id: 'faq' }] },
              { t: 'Mensalli', links: [{ l: 'Entrar', to: '/login' }, { l: 'Criar conta', to: '/signup' }, { l: 'Para outros negócios', to: '/' }, { l: 'Privacidade', to: '/privacidade' }] }
            ].map((col, ci) => (
              <div key={ci}>
                <p style={{ fontSize: '12px', fontWeight: '700', color: 'white', textTransform: 'uppercase', letterSpacing: '.5px', margin: '0 0 16px' }}>{col.t}</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {col.links.map((lk, li) => (
                    <button key={li} onClick={() => { if (lk.id) scrollToId(lk.id); else if (lk.to) navigate(lk.to) }}
                      style={{ background: 'none', border: 'none', padding: 0, textAlign: 'left', cursor: 'pointer', fontSize: '14px', color: 'rgba(255,255,255,0.62)', transition: 'color .2s', width: 'fit-content' }}
                      onMouseOver={e => e.currentTarget.style.color = GREEN_BRIGHT} onMouseOut={e => e.currentTarget.style.color = 'rgba(255,255,255,0.62)'}>{lk.l}</button>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div style={{ paddingTop: '24px', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
            <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.4)', margin: 0 }}>© 2026 Mensalli. Todos os direitos reservados.</p>
          </div>
        </div>
      </footer>

      {/* Botão flutuante WhatsApp */}
      <a href={WA_MENSALLI} target="_blank" rel="noopener noreferrer" aria-label="Falar no WhatsApp"
        style={{ position: 'fixed', bottom: isSmallScreen ? '80px' : '20px', right: '20px', width: '58px', height: '58px', background: GRAD, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 6px 20px rgba(22,163,74,0.45)', zIndex: 1000, transition: 'transform .3s' }}
        onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.1)' }} onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)' }}>
        <FaWhatsapp size={30} color="white" />
      </a>

      {/* Sticky CTA mobile */}
      {isSmallScreen && (
        <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(255,255,255,0.95)', backdropFilter: 'blur(10px)', borderTop: `1px solid ${BORDER}`, padding: '12px 18px', zIndex: 999, display: 'flex', gap: '10px', alignItems: 'center' }}>
          <button onClick={irParaSignup} style={{ ...btnGrad('14px', '15px'), flex: 1 }}>Teste grátis <MdArrowForward size={18} /></button>
          <button onClick={() => navigate('/login')} style={btnGhost('14px 20px', 'auto')}>Entrar</button>
        </div>
      )}
    </div>
  )
}

// ---- auxiliares ----

// Marcacao de campo pros blocos escuros: circulo central, linha do meio e grande
// area. Fica bem baixo no contraste — e' textura, nao ilustracao.
function LinhasCampo() {
  return (
    <svg viewBox="0 0 400 300" preserveAspectRatio="none" aria-hidden="true"
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', zIndex: 0, pointerEvents: 'none' }}>
      <g fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="1.2">
        <circle cx="200" cy="150" r="52" />
        <line x1="200" y1="0" x2="200" y2="300" />
        <rect x="0" y="90" width="52" height="120" />
        <rect x="348" y="90" width="52" height="120" />
      </g>
    </svg>
  )
}

// Mockups do painel. Sao desenhados em CSS de proposito: print de tela real do
// sistema hoje mostra dado de academia ("cliente", "plano mensal"), e o que
// vende aqui e' ver "Sub-11" e "responsavel" na tela.
function MockPainel({ aba, isSmall }) {
  const moldura = {
    borderRadius: '16px', overflow: 'hidden', border: '1px solid #1c2620',
    backgroundColor: '#0f1613', boxShadow: '0 30px 70px rgba(16,24,40,0.22)'
  }
  const barra = (
    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '10px 13px', borderBottom: '1px solid #1c2620', backgroundColor: '#131b17' }}>
      <span style={{ width: '9px', height: '9px', borderRadius: '50%', backgroundColor: '#ff5f57' }} />
      <span style={{ width: '9px', height: '9px', borderRadius: '50%', backgroundColor: '#febc2e' }} />
      <span style={{ width: '9px', height: '9px', borderRadius: '50%', backgroundColor: '#28c840' }} />
      <span style={{ marginLeft: 'auto', fontSize: '10.5px', color: 'rgba(255,255,255,0.35)' }}>app.mensalli.com.br</span>
    </div>
  )
  return (
    <div style={moldura}>
      {barra}
      <div style={{ padding: isSmall ? '16px' : '20px' }}>
        {aba === 0 && <MockCobranca />}
        {aba === 1 && <MockTurmas isSmall={isSmall} />}
        {aba === 2 && <MockAtletas />}
        {aba === 3 && <MockDono />}
      </div>
    </div>
  )
}

const rotuloMock = { fontSize: '11px', fontWeight: '700', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '.6px', margin: '0 0 12px' }
const linhaMock = { display: 'flex', alignItems: 'center', gap: '10px', padding: '11px 12px', borderRadius: '10px', backgroundColor: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }

function Selo({ texto, cor, fundo }) {
  return <span style={{ fontSize: '10.5px', fontWeight: '700', color: cor, backgroundColor: fundo, padding: '3px 9px', borderRadius: '100px', whiteSpace: 'nowrap' }}>{texto}</span>
}

function MockCobranca() {
  const linhas = [
    { nome: 'Miguel Souza', turma: 'Sub-11', valor: 'R$ 130', selo: { texto: 'Pago', cor: '#4ade80', fundo: 'rgba(34,197,94,0.16)' } },
    { nome: 'Ana Beatriz Lima', turma: 'Sub-9', valor: 'R$ 130', selo: { texto: 'Vence amanhã', cor: '#fbbf24', fundo: 'rgba(251,191,36,0.14)' } },
    { nome: 'Lucas Ferreira', turma: 'Sub-13', valor: 'R$ 150', selo: { texto: '5 dias em atraso', cor: '#f87171', fundo: 'rgba(248,113,113,0.14)' } },
    { nome: 'Pedro Henrique', turma: 'Sub-11', valor: 'R$ 130', selo: { texto: 'Pago', cor: '#4ade80', fundo: 'rgba(34,197,94,0.16)' } }
  ]
  return (
    <div>
      <p style={rotuloMock}>Mensalidades de julho</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {linhas.map((l, i) => (
          <div key={i} style={linhaMock}>
            <div style={{ minWidth: 0, flex: 1 }}>
              <p style={{ margin: 0, fontSize: '13px', fontWeight: '600', color: 'white', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.nome}</p>
              <p style={{ margin: '2px 0 0', fontSize: '11px', color: 'rgba(255,255,255,0.42)' }}>{l.turma} · {l.valor}</p>
            </div>
            <Selo {...l.selo} />
          </div>
        ))}
      </div>
      <div style={{ marginTop: '14px', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '11.5px', color: '#4ade80' }}>
        <FaWhatsapp size={13} /> 4 lembretes enviados hoje — automático
      </div>
    </div>
  )
}

function MockTurmas({ isSmall }) {
  const dias = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex']
  // [dia] => bloco da turma naquele dia (null = sem treino)
  const grade = [
    { turma: 'Sub-9', hora: '17h', dias: [1, 3], cor: 'rgba(34,197,94,0.22)', borda: 'rgba(34,197,94,0.45)' },
    { turma: 'Sub-11', hora: '18h', dias: [0, 2, 4], cor: 'rgba(56,189,248,0.18)', borda: 'rgba(56,189,248,0.4)' },
    { turma: 'Sub-13', hora: '19h', dias: [1, 3], cor: 'rgba(251,191,36,0.16)', borda: 'rgba(251,191,36,0.38)' }
  ]
  return (
    <div>
      <p style={rotuloMock}>Grade da semana</p>
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${dias.length}, 1fr)`, gap: '5px', marginBottom: '8px' }}>
        {dias.map(d => (
          <span key={d} style={{ fontSize: '10.5px', fontWeight: '600', color: 'rgba(255,255,255,0.4)', textAlign: 'center' }}>{d}</span>
        ))}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
        {grade.map((g, gi) => (
          <div key={gi} style={{ display: 'grid', gridTemplateColumns: `repeat(${dias.length}, 1fr)`, gap: '5px' }}>
            {dias.map((_, di) => (
              g.dias.includes(di) ? (
                <div key={di} style={{ backgroundColor: g.cor, border: `1px solid ${g.borda}`, borderRadius: '7px', padding: isSmall ? '8px 3px' : '10px 5px', textAlign: 'center' }}>
                  <p style={{ margin: 0, fontSize: isSmall ? '10px' : '11px', fontWeight: '700', color: 'white' }}>{g.turma}</p>
                  <p style={{ margin: '1px 0 0', fontSize: '9.5px', color: 'rgba(255,255,255,0.55)' }}>{g.hora}</p>
                </div>
              ) : (
                <div key={di} style={{ backgroundColor: 'rgba(255,255,255,0.02)', border: '1px dashed rgba(255,255,255,0.06)', borderRadius: '7px' }} />
              )
            ))}
          </div>
        ))}
      </div>
      <div style={{ marginTop: '14px', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '11.5px', color: 'rgba(255,255,255,0.5)' }}>
        <MdSchedule size={13} /> Chamada da Sub-11 aberta às 18h
      </div>
    </div>
  )
}

function MockAtletas() {
  const atletas = [
    { nome: 'Miguel Souza', ini: 'MS', resp: 'Cláudia Souza · mãe', freq: '92%', cor: '#4ade80' },
    { nome: 'Ana Beatriz Lima', ini: 'AL', resp: 'Rogério Lima · pai', freq: '88%', cor: '#4ade80' },
    { nome: 'Lucas Ferreira', ini: 'LF', resp: 'Simone Ferreira · mãe', freq: '54%', cor: '#f87171' }
  ]
  return (
    <div>
      <p style={rotuloMock}>Atletas e responsáveis</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {atletas.map((a, i) => (
          <div key={i} style={linhaMock}>
            <span style={{ width: '32px', height: '32px', borderRadius: '50%', background: GRAD, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: '700', color: 'white', flexShrink: 0 }}>{a.ini}</span>
            <div style={{ minWidth: 0, flex: 1 }}>
              <p style={{ margin: 0, fontSize: '13px', fontWeight: '600', color: 'white', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.nome}</p>
              <p style={{ margin: '2px 0 0', fontSize: '11px', color: 'rgba(255,255,255,0.42)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.resp}</p>
            </div>
            <div style={{ textAlign: 'right', flexShrink: 0 }}>
              <p style={{ margin: 0, fontSize: '13px', fontWeight: '700', color: a.cor }}>{a.freq}</p>
              <p style={{ margin: 0, fontSize: '9.5px', color: 'rgba(255,255,255,0.35)' }}>presença</p>
            </div>
          </div>
        ))}
      </div>
      <div style={{ marginTop: '14px', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '11.5px', color: '#fbbf24' }}>
        <MdGroups size={13} /> Lucas caiu de 90% para 54% — vale uma ligação
      </div>
    </div>
  )
}

function MockDono() {
  const barras = [42, 58, 51, 67, 74, 69, 88]
  return (
    <div>
      <p style={rotuloMock}>Caixa do mês</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', marginBottom: '14px' }}>
        {[
          { l: 'Recebido', v: 'R$ 9.230', c: '#4ade80' },
          { l: 'A receber', v: 'R$ 3.250', c: 'white' },
          { l: 'Em atraso', v: 'R$ 890', c: '#f87171' }
        ].map((s, i) => (
          <div key={i} style={{ backgroundColor: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '10px', padding: '12px 10px' }}>
            <p style={{ margin: '0 0 4px', fontSize: '10px', color: 'rgba(255,255,255,0.42)', fontWeight: '600' }}>{s.l}</p>
            <p style={{ margin: 0, fontSize: '15px', fontWeight: '800', color: s.c, letterSpacing: '-.4px' }}>{s.v}</p>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: '6px', height: '78px', padding: '0 2px' }}>
        {barras.map((h, i) => (
          <div key={i} style={{ flex: 1, height: `${h}%`, borderRadius: '5px 5px 2px 2px', background: i === barras.length - 1 ? GRAD : 'rgba(255,255,255,0.10)' }} />
        ))}
      </div>
      <div style={{ marginTop: '12px', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '11.5px', color: '#4ade80' }}>
        <MdTrendingUp size={13} /> Melhor mês desde que a régua foi ligada
      </div>
    </div>
  )
}
