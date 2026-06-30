import { useNavigate } from 'react-router-dom'
import {
  MdCheck, MdCheckCircle, MdArrowForward, MdStar,
  MdDashboardCustomize, MdMessage,
  MdReceiptLong, MdPayments, MdTrendingUp, MdRule, MdLink,
  MdShield, MdQrCode2, MdLock,
  MdVerifiedUser, MdFactCheck, MdVisibility, MdSupportAgent, MdAutorenew,
  MdSwapHoriz, MdSchool, MdAdd, MdRemove, MdDoneAll, MdBolt, MdAutoAwesome,
  MdLanguage, MdGroups, MdSmartToy, MdEventAvailable, MdCampaign,
  MdSchedule, MdTrendingDown, MdNotificationsActive
} from 'react-icons/md'
import { FaWhatsapp, FaInstagram } from 'react-icons/fa'
import { useState, useMemo } from 'react'
import useWindowSize from './hooks/useWindowSize'

// Paleta clara + degradê verde-WhatsApp
const INK = '#0f1115'
const BODY = '#5b636e'
const MUTED = '#9aa1ab'
const BORDER = '#ececf0'
const BG = '#ffffff'
const BG_SOFT = '#f7faf8'
const GREEN = '#16a34a'
const GREEN_DK = '#15803d'
const GREEN_BRIGHT = '#22c55e'
const GREEN_SOFT = '#ecfdf3'
const DARK = '#0d100e'
const GRAD = 'linear-gradient(135deg, #22c55e 0%, #0ea372 100%)'
const GRAD_TEXT = 'linear-gradient(120deg, #16a34a, #0ea372)'

export default function LandingPage() {
  const navigate = useNavigate()
  const { isMobile, isSmallScreen } = useWindowSize()
  const [faqAberto, setFaqAberto] = useState(null)

  // Calculadora de ROI
  const [roiClientes, setRoiClientes] = useState('50')
  const [roiValor, setRoiValor] = useState('150')
  const [roiInad, setRoiInad] = useState('30')
  const perdaMensal = useMemo(() => (Number(roiClientes) || 0) * (Number(roiValor) || 0) * ((Number(roiInad) || 0) / 100), [roiClientes, roiValor, roiInad])
  const recuperacao = useMemo(() => perdaMensal * 0.7, [perdaMensal])

  // Formulário do CTA final
  const [formDesafio, setFormDesafio] = useState('')
  const [formClientes, setFormClientes] = useState('')
  const [formSistema, setFormSistema] = useState('')

  const comoFunciona = [
    { numero: '01', titulo: 'Conecte seu WhatsApp', descricao: 'Escaneie o QR Code e vincule seu número. Leva menos de 1 minuto.' },
    { numero: '02', titulo: 'Cadastre seus clientes', descricao: 'Adicione clientes, planos de mensalidade e datas de vencimento.' },
    { numero: '03', titulo: 'Ative a automação', descricao: 'Personalize as mensagens. Pronto, o sistema cobra sozinho.' }
  ]

  const features = [
    { icon: FaWhatsapp, titulo: 'Cobrança automática', desc: 'Lembretes saem sozinhos pelo seu WhatsApp, no horário certo.' },
    { icon: MdDashboardCustomize, titulo: 'Dashboard em tempo real', desc: 'Veja quem está devendo e por quanto tempo, em segundos.' },
    { icon: MdMessage, titulo: 'Templates com a sua cara', desc: 'Mensagens personalizadas que não parecem robô.' },
    { icon: MdRule, titulo: 'Régua de cobrança', desc: 'Antes, no dia e após o vencimento — você define as regras.' },
    { icon: MdReceiptLong, titulo: 'Relatório de atrasos', desc: 'Veja há quanto tempo cada cliente está devendo e aja antes da bola de neve.' },
    { icon: MdLink, titulo: 'Portal de pagamento', desc: 'O cliente paga por um link, sem você correr atrás.' },
    { icon: MdPayments, titulo: 'Pix, cartão e boleto', desc: 'O cliente escolhe como pagar. Você só recebe.' },
    { icon: MdTrendingUp, titulo: 'Indicadores do financeiro', desc: 'Recebido, a vencer e inadimplência num só lugar.' }
  ]

  const suite = [
    { icon: MdLanguage, titulo: 'Criador de Sites', desc: 'Monte o site da sua empresa em minutos — com planos, horários e botão direto pro WhatsApp. Sem precisar de programador.' },
    { icon: MdGroups, titulo: 'CRM completo', desc: 'Acompanhe cada lead e aluno num só lugar, do primeiro contato à matrícula. Ninguém escapa pelo caminho.' },
    { icon: MdSmartToy, titulo: 'Bot de WhatsApp', desc: 'Um assistente que responde sozinho: o aluno consulta mensalidade, horários e agenda aula sem te interromper.' },
    { icon: MdEventAvailable, titulo: 'Agendamento online', desc: 'Compartilhe um link e deixe seus alunos marcarem aula ou avaliação direto na sua agenda.' },
    { icon: MdCampaign, titulo: 'Campanhas de WhatsApp', desc: 'Avisos, promoções e comunicados para toda a sua base de uma vez, em poucos cliques.' }
  ]

  const resultados = [
    { icon: MdSchedule, titulo: 'Horas da sua semana de volta', desc: 'O sistema cobra sozinho pelo seu WhatsApp. Você para de mandar mensagem aluno por aluno.' },
    { icon: MdTrendingDown, titulo: 'Menos inadimplência', desc: 'Lembrete certo, na hora certa. Quem esquecia de pagar passa a pagar em dia.' },
    { icon: MdDashboardCustomize, titulo: 'Controle em segundos', desc: 'Num olhar você vê quem está em dia, quem atrasou e quanto tem a receber.' },
    { icon: FaWhatsapp, titulo: 'A cobrança continua sendo sua', desc: 'As mensagens saem do seu próprio número, com o seu tom. O aluno responde como sempre.' },
    { icon: MdNotificationsActive, titulo: 'Nunca mais esquece de cobrar', desc: 'A régua dispara antes, no dia e após o vencimento. Nenhuma mensalidade passa batido.' },
    { icon: MdAutoAwesome, titulo: 'A parte chata, resolvida', desc: 'Aquela tarefa que ninguém gosta de fazer roda no automático, todo mês, sem você pensar nela.' }
  ]

  const lgpd = [
    { icon: MdLock, titulo: 'Proteção total dos dados', desc: 'Criptografia de ponta a ponta. Seus dados financeiros ficam só no seu painel.' },
    { icon: MdVerifiedUser, titulo: 'Consentimento e transparência', desc: 'Você cobra apenas clientes que cadastrou. Nada de spam.' },
    { icon: MdVisibility, titulo: 'Controle nas suas mãos', desc: 'Exporte, edite ou apague dados de clientes quando quiser.' },
    { icon: MdFactCheck, titulo: 'Pronto para auditorias', desc: 'Histórico completo de cada cobrança enviada e recebida.' }
  ]

  const motivos = [
    { icon: MdSupportAgent, titulo: 'Suporte em português', desc: 'Gente de verdade no WhatsApp, sem robô e sem fila eterna.' },
    { icon: MdSwapHoriz, titulo: 'Migração facilitada', desc: 'Traga seus clientes da planilha ou de outro sistema sem dor.' },
    { icon: MdAutorenew, titulo: 'Atualizações constantes', desc: 'Novas features toda semana, guiadas pelo seu feedback.' },
    { icon: MdSchool, titulo: 'Setup em 5 minutos', desc: 'Configure uma vez e o sistema cobra sozinho daí pra frente.' }
  ]

  const planos = [
    { nome: 'Starter', eyebrow: 'Ideal para começar', preco: 49, perMsg: 'R$0,25 por mensagem', cta: 'Começar no Starter', destaque: false,
      features: ['Até 50 clientes ativos', '200 mensagens/mês', 'Mensagem automática no vencimento', '1 template personalizado', 'Dashboard básico'] },
    { nome: 'Pro', eyebrow: 'Para negócios em crescimento', preco: 99, perMsg: 'R$0,17 por mensagem', cta: 'Escolher o Pro', destaque: false,
      features: ['Até 150 clientes ativos', '600 mensagens/mês', '3 templates personalizados', 'Régua de cobrança completa', 'Dashboard com gráficos', 'Contratos com assinatura', 'Anamnese / Ficha do aluno', 'Suporte via WhatsApp'] },
    { nome: 'Premium', eyebrow: 'Gestão profissional', preco: 149, perMsg: 'R$0,05 por mensagem', cta: 'Ativar Premium', destaque: true,
      features: ['Até 500 clientes ativos', '3.000 mensagens/mês', 'Tudo do plano Pro', 'Criador de Sites', 'CRM completo', 'Bot de WhatsApp', 'Agendamento online (link de agendamento)', 'Campanhas de WhatsApp', 'Templates ilimitados', 'Consultoria inicial (1h)', 'Suporte prioritário'] }
  ]

  const faqs = [
    { p: 'O que é o Mensalli?', r: 'Um sistema completo de cobrança de mensalidades que envia lembretes automáticos pelo seu WhatsApp e organiza tudo num dashboard.' },
    { p: 'Como funciona a conexão com WhatsApp?', r: 'Você escaneia um QR Code que vincula seu número ao sistema. As mensagens saem do SEU número, mantendo o relacionamento direto com os clientes.' },
    { p: 'Preciso instalar algo?', r: 'Não. É 100% online, funciona no navegador do computador e do celular.' },
    { p: 'Posso cancelar quando quiser?', r: 'Sim, sem multa e sem burocracia. Cancele direto no painel e o sistema para de cobrar no próximo ciclo.' },
    { p: 'O WhatsApp pode banir meu número?', r: 'Não, se usar corretamente. O Mensalli envia apenas para clientes que você cadastrou, sem spam.' },
    { p: 'Quais formas de pagamento meus clientes podem usar?', r: 'Pix, cartão de crédito e boleto, via Asaas. O cliente escolhe e você só recebe.' },
    { p: 'Está em conformidade com a LGPD?', r: 'Sim. Criptografia, consentimento, controle e histórico completo para auditorias.' }
  ]

  const sectionPad = isSmallScreen ? '64px 22px' : '110px 24px'
  const h2 = { fontSize: isSmallScreen ? '30px' : '44px', fontWeight: '800', letterSpacing: '-1.4px', color: INK, lineHeight: '1.1', margin: '0 0 16px' }
  const eyebrow = { display: 'inline-flex', alignItems: 'center', gap: '7px', fontSize: '13px', fontWeight: '700', color: GREEN_DK, backgroundColor: GREEN_SOFT, padding: '6px 14px', borderRadius: '100px', marginBottom: '18px' }
  const sub = { fontSize: '17px', color: BODY, lineHeight: '1.6', maxWidth: '620px', margin: '0 auto' }

  return (
    <div style={{ fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif', backgroundColor: BG, color: INK, WebkitFontSmoothing: 'antialiased', overflowX: 'hidden' }}>
      <style>{`
        @keyframes lpFadeUp { from { opacity: 0; transform: translateY(18px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes lpFloat { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-12px); } }
        @keyframes lpFloatSlow { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-18px); } }
        @keyframes lpBlob { 0%,100% { transform: translate(0,0) scale(1); } 50% { transform: translate(20px,-20px) scale(1.08); } }
        @keyframes lpTick { 0%,55% { color: #9aa7b0; } 70%,100% { color: #53bdeb; } }
        .lp-card { transition: transform .25s ease, box-shadow .25s ease, border-color .25s ease; }
        .lp-card:hover { transform: translateY(-4px); box-shadow: 0 20px 50px rgba(16,24,40,.10); border-color: #d7f0e0 !important; }
        .lp-float { animation: lpFloat 6s ease-in-out infinite; }
        .lp-floatslow { animation: lpFloatSlow 8s ease-in-out infinite; }
        @media (prefers-reduced-motion: reduce){ .lp-float,.lp-floatslow{ animation:none!important } }
        input::placeholder { color: ${MUTED}; }
      `}</style>

      {/* Navbar */}
      <nav style={{ backgroundColor: 'rgba(255,255,255,0.82)', backdropFilter: 'saturate(180%) blur(14px)', WebkitBackdropFilter: 'saturate(180%) blur(14px)', padding: '14px 0', borderBottom: `1px solid ${BORDER}`, position: 'sticky', top: 0, zIndex: 1000 }}>
        <div style={{ maxWidth: '1180px', margin: '0 auto', padding: '0 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <a href="https://www.mensalli.com.br" style={{ display: 'flex', alignItems: 'center', textDecoration: 'none' }}>
            <img src="/Logo-Full.png" alt="Mensalli" style={{ height: '34px', width: 'auto', cursor: 'pointer' }} />
          </a>
          <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
            {!isMobile && (
              <>
                <button onClick={() => scrollToId('recursos')} style={navLink}>Recursos</button>
                <button onClick={() => scrollToId('precos')} style={navLink}>Preços</button>
                <button onClick={() => scrollToId('faq')} style={navLink}>Dúvidas</button>
                <button onClick={() => navigate('/login')} style={{ ...navLink, color: INK, fontWeight: '600' }}>Entrar</button>
              </>
            )}
            <button onClick={() => navigate('/signup')} style={btnGrad('10px 18px', '14px')} onMouseOver={e => e.currentTarget.style.opacity = '.9'} onMouseOut={e => e.currentTarget.style.opacity = '1'}>
              Teste grátis
            </button>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section style={{ position: 'relative', padding: isSmallScreen ? '52px 22px 0' : '92px 24px 0', overflow: 'hidden', background: 'linear-gradient(180deg, #f3fbf6 0%, #ffffff 60%)' }}>
        <div style={{ maxWidth: '860px', margin: '0 auto', textAlign: 'center', position: 'relative', zIndex: 1 }}>
          <div style={eyebrow}><FaWhatsapp size={14} /> Cobrança automática pelo WhatsApp</div>
          <h1 style={{ fontSize: isSmallScreen ? '38px' : '62px', fontWeight: '800', lineHeight: '1.05', letterSpacing: '-2.2px', margin: '0 0 22px' }}>
            Nunca mais cobre <span style={gradText}>aluno por aluno</span> no WhatsApp.
          </h1>
          <p style={{ ...sub, fontSize: isSmallScreen ? '17px' : '20px', marginBottom: '32px' }}>
            Enquanto você trabalha, o Mensalli cobra seus alunos automaticamente pelo WhatsApp. Feito para estúdios, academias e escolas que vivem de mensalidade.
          </p>
          <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexDirection: isSmallScreen ? 'column' : 'row', alignItems: 'center' }}>
            <button onClick={() => navigate('/signup')} style={{ ...btnGrad('15px 30px', '16px'), width: isSmallScreen ? '100%' : 'auto' }}
              onMouseOver={e => { e.currentTarget.style.transform = 'translateY(-2px)' }} onMouseOut={e => { e.currentTarget.style.transform = 'translateY(0)' }}>
              Crie sua conta grátis <MdArrowForward size={20} />
            </button>
            <button onClick={() => scrollToId('como-funciona')} style={btnGhost('15px 26px', isSmallScreen ? '100%' : 'auto')}
              onMouseOver={e => e.currentTarget.style.borderColor = '#cfd3da'} onMouseOut={e => e.currentTarget.style.borderColor = BORDER}>
              Veja como funciona
            </button>
          </div>
          <div style={{ display: 'flex', gap: isSmallScreen ? '14px' : '26px', justifyContent: 'center', flexWrap: 'wrap', marginTop: '22px', fontSize: '13.5px', color: BODY }}>
            {['Usa seu próprio WhatsApp', 'Sem cartão de crédito', 'Cancele quando quiser'].map((t, i) => (
              <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}><MdCheckCircle size={16} style={{ color: GREEN }} /> {t}</span>
            ))}
          </div>
        </div>

        {/* Visual do produto */}
        <div style={{ maxWidth: '1040px', margin: isSmallScreen ? '44px auto 0' : '64px auto 0', position: 'relative', zIndex: 1, animation: 'lpFadeUp .7s ease both' }}>
          <div style={{ borderRadius: '16px', overflow: 'hidden', border: `1px solid ${BORDER}`, boxShadow: '0 40px 90px rgba(16,24,40,0.18)', backgroundColor: 'white' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '7px', padding: '11px 15px', borderBottom: `1px solid ${BORDER}`, backgroundColor: BG_SOFT }}>
              <span style={dot('#ff5f57')} /><span style={dot('#febc2e')} /><span style={dot('#28c840')} />
              {!isSmallScreen && <span style={{ margin: '0 auto', fontSize: '12px', color: MUTED, backgroundColor: 'white', border: `1px solid ${BORDER}`, borderRadius: '6px', padding: '4px 40px' }}>app.mensalli.com.br</span>}
            </div>
            <img src="/dashboard.png" alt="Dashboard do Mensalli" width="1800" height="940" fetchPriority="high" style={{ width: '100%', height: 'auto', display: 'block', aspectRatio: '1800 / 940' }} />
          </div>

          {/* Cards flutuantes */}
          {!isSmallScreen && (
            <>
              <div className="lp-float" style={{ position: 'absolute', top: '70px', right: '-14px', zIndex: 3, backgroundColor: 'white', borderRadius: '14px', border: `1px solid ${BORDER}`, boxShadow: '0 16px 40px rgba(16,24,40,0.16)', padding: '12px 14px', width: '210px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                  <span style={{ width: '26px', height: '26px', borderRadius: '50%', background: GRAD, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><FaWhatsapp size={14} color="white" /></span>
                  <span style={{ fontSize: '12px', fontWeight: '700', color: INK }}>Mensagem entregue</span>
                </div>
                <p style={{ margin: 0, fontSize: '12px', color: BODY, lineHeight: 1.4 }}>Oi, Maria! Sua mensalidade vence amanhã 🙂</p>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '3px', marginTop: '4px' }}>
                  <span style={{ fontSize: '10px', color: MUTED }}>09:41</span>
                  <MdDoneAll size={14} style={{ animation: 'lpTick 4s ease-in-out infinite' }} />
                </div>
              </div>
              <div className="lp-floatslow" style={{ position: 'absolute', bottom: '40px', left: '-14px', zIndex: 3, backgroundColor: 'white', borderRadius: '14px', border: `1px solid ${BORDER}`, boxShadow: '0 16px 40px rgba(16,24,40,0.16)', padding: '14px 16px' }}>
                <p style={{ margin: '0 0 2px', fontSize: '12px', color: MUTED, fontWeight: '600' }}>Inadimplência</p>
                <p style={{ margin: 0, fontSize: '24px', fontWeight: '800', color: INK }}>−42% <span style={{ fontSize: '13px', color: GREEN, fontWeight: '700' }}>▾</span></p>
              </div>
            </>
          )}
        </div>
      </section>

      {/* Stats band — fatos honestos do canal */}
      <section style={{ padding: isSmallScreen ? '56px 22px' : '88px 24px' }}>
        <div style={{ maxWidth: '1080px', margin: '0 auto', background: `linear-gradient(135deg, ${GREEN_SOFT}, #eefaf4)`, border: `1px solid ${BORDER}`, borderRadius: '24px', padding: isSmallScreen ? '36px 24px' : '52px' }}>
          <div style={{ textAlign: 'center', marginBottom: '36px' }}>
            <p style={eyebrow}><MdBolt size={15} /> Por que cobrar pelo WhatsApp</p>
            <h2 style={{ ...h2, margin: 0 }}>O canal que seu cliente <span style={gradText}>realmente lê</span></h2>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: isSmallScreen ? '1fr' : 'repeat(3, 1fr)', gap: isSmallScreen ? '28px' : '24px' }}>
            {[
              { num: '98%', label: 'das mensagens de WhatsApp são abertas — contra ~20% do e-mail.' },
              { num: 'Minutos', label: 'até a primeira leitura, não dias como no boleto.' },
              { num: '5 min', label: 'para configurar uma vez e deixar cobrando sozinho.' }
            ].map((m, i) => (
              <div key={i} style={{ textAlign: isSmallScreen ? 'center' : 'left' }}>
                <p style={{ fontSize: isSmallScreen ? '40px' : '46px', fontWeight: '800', margin: '0 0 8px', letterSpacing: '-1.5px', background: GRAD_TEXT, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>{m.num}</p>
                <p style={{ fontSize: '15px', color: BODY, margin: 0, lineHeight: 1.5 }}>{m.label}</p>
              </div>
            ))}
          </div>
          <p style={{ fontSize: '12px', color: MUTED, marginTop: '24px', textAlign: 'center' }}>Médias de mercado do canal WhatsApp, não resultados individuais.</p>
        </div>
      </section>

      {/* Destaque — automação 24h com mockup de celular */}
      <section style={{ padding: sectionPad, position: 'relative', overflow: 'hidden' }}>
        <div style={{ maxWidth: '1080px', margin: '0 auto', display: 'grid', gridTemplateColumns: isSmallScreen ? '1fr' : '1fr 1fr', gap: isSmallScreen ? '40px' : '64px', alignItems: 'center' }}>
          <div style={{ order: isSmallScreen ? 2 : 1 }}>
            <p style={eyebrow}><MdAutoAwesome size={15} /> Automação 24h</p>
            <h2 style={h2}>A cobrança que trabalha por você, <span style={gradText}>dia e noite</span></h2>
            <p style={{ fontSize: '17px', color: BODY, lineHeight: 1.65, marginBottom: '24px' }}>
              Defina a régua uma vez — 3 dias antes, no dia e após o vencimento — e o Mensalli envia tudo sozinho pelo seu WhatsApp. Você acorda com as mensagens já entregues e os pagamentos entrando.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '28px' }}>
              {['Mensagens no seu tom de voz, com nome, valor e data', 'Para de enviar quando o cliente paga', 'Link de pagamento direto na conversa'].map((t, i) => (
                <span key={i} style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '15px', color: INK, fontWeight: '500' }}><MdCheckCircle size={20} style={{ color: GREEN }} /> {t}</span>
              ))}
            </div>
            <button onClick={() => navigate('/signup')} style={btnGrad('14px 26px', '15px')}
              onMouseOver={e => { e.currentTarget.style.transform = 'translateY(-2px)' }} onMouseOut={e => { e.currentTarget.style.transform = 'translateY(0)' }}>
              Quero automatizar <MdArrowForward size={18} />
            </button>
          </div>
          <div style={{ order: isSmallScreen ? 1 : 2, position: 'relative', display: 'flex', justifyContent: 'center' }}>
            <Blob style={{ top: '-40px', left: '50%', marginLeft: '-220px', width: '440px', height: '440px', opacity: 0.8 }} />
            <PhoneChat isSmall={isSmallScreen} />
          </div>
        </div>
      </section>

      {/* Tudo-em-um — grid de features */}
      <section id="recursos" style={{ padding: sectionPad, backgroundColor: BG_SOFT }}>
        <div style={{ maxWidth: '1080px', margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: '52px' }}>
            <p style={eyebrow}><MdDashboardCustomize size={15} /> Tudo-em-um</p>
            <h2 style={h2}>Um sistema que resolve a <span style={gradText}>sua cobrança inteira</span></h2>
            <p style={sub}>Da primeira mensagem ao dinheiro na conta, sem você correr atrás de ninguém. E isso é só o começo.</p>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: isSmallScreen ? '1fr' : 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px' }}>
            {features.map((f, i) => (
              <div key={i} className="lp-card" style={{ backgroundColor: 'white', border: `1px solid ${BORDER}`, borderRadius: '18px', padding: '26px' }}>
                <div style={{ width: '46px', height: '46px', borderRadius: '13px', background: GREEN_SOFT, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '16px' }}>
                  <f.icon size={22} style={{ color: GREEN_DK }} />
                </div>
                <h3 style={{ fontSize: '16.5px', fontWeight: '700', color: INK, margin: '0 0 7px' }}>{f.titulo}</h3>
                <p style={{ fontSize: '14px', color: BODY, margin: 0, lineHeight: 1.55 }}>{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Muito além da cobrança — suíte Premium */}
      <section style={{ padding: sectionPad }}>
        <div style={{ maxWidth: '1080px', margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: '52px' }}>
            <p style={eyebrow}><MdAutoAwesome size={15} /> Exclusivo do Premium</p>
            <h2 style={h2}>O Mensalli começa na cobrança. <span style={gradText}>Mas não para aí.</span></h2>
            <p style={sub}>Quando seu negócio precisa de mais, a gente cuida do resto — site, relacionamento, atendimento e agenda, tudo no mesmo lugar.</p>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '16px' }}>
            {suite.map((f, i) => (
              <div key={i} className="lp-card" style={{ flex: '1 1 300px', maxWidth: isSmallScreen ? '100%' : '330px', backgroundColor: 'white', border: `1px solid ${BORDER}`, borderRadius: '18px', padding: '26px' }}>
                <div style={{ width: '46px', height: '46px', borderRadius: '13px', background: GREEN_SOFT, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '16px' }}>
                  <f.icon size={22} style={{ color: GREEN_DK }} />
                </div>
                <h3 style={{ fontSize: '16.5px', fontWeight: '700', color: INK, margin: '0 0 7px' }}>{f.titulo}</h3>
                <p style={{ fontSize: '14px', color: BODY, margin: 0, lineHeight: 1.55 }}>{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Como funciona */}
      <section id="como-funciona" style={{ padding: sectionPad }}>
        <div style={{ maxWidth: '980px', margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: '52px' }}>
            <p style={eyebrow}><MdBolt size={15} /> Em 3 passos</p>
            <h2 style={h2}>Configure uma vez. <span style={gradText}>Esqueça pra sempre.</span></h2>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: isSmallScreen ? '1fr' : 'repeat(3, 1fr)', gap: '20px' }}>
            {comoFunciona.map((p, i) => (
              <div key={i} className="lp-card" style={{ backgroundColor: 'white', border: `1px solid ${BORDER}`, borderRadius: '18px', padding: '30px' }}>
                <div style={{ width: '46px', height: '46px', borderRadius: '12px', background: GRAD, color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px', fontWeight: '800', marginBottom: '18px' }}>{p.numero}</div>
                <h3 style={{ fontSize: '18px', fontWeight: '700', margin: '0 0 9px', color: INK }}>{p.titulo}</h3>
                <p style={{ color: BODY, lineHeight: 1.6, fontSize: '15px', margin: 0 }}>{p.descricao}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* O que muda no seu dia a dia */}
      <section style={{ padding: sectionPad, backgroundColor: BG_SOFT }}>
        <div style={{ maxWidth: '1080px', margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: '48px' }}>
            <p style={eyebrow}><MdAutoAwesome size={15} /> No dia a dia</p>
            <h2 style={h2}>O que muda quando o Mensalli <span style={gradText}>cobra por você</span></h2>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: isSmallScreen ? '1fr' : 'repeat(3, 1fr)', gap: '20px' }}>
            {resultados.map((r, i) => (
              <div key={i} className="lp-card" style={{ backgroundColor: 'white', border: `1px solid ${BORDER}`, borderRadius: '18px', padding: '28px' }}>
                <div style={{ width: '46px', height: '46px', borderRadius: '13px', background: GREEN_SOFT, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '16px' }}>
                  <r.icon size={22} style={{ color: GREEN_DK }} />
                </div>
                <h3 style={{ fontSize: '16.5px', fontWeight: '700', color: INK, margin: '0 0 7px' }}>{r.titulo}</h3>
                <p style={{ fontSize: '14px', color: BODY, margin: 0, lineHeight: 1.55 }}>{r.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* LGPD — seção escura */}
      <section style={{ padding: isSmallScreen ? '24px 16px' : '40px 24px' }}>
        <div style={{ maxWidth: '1100px', margin: '0 auto', background: DARK, borderRadius: '28px', padding: isSmallScreen ? '48px 26px' : '72px 56px', position: 'relative', overflow: 'hidden' }}>
          <Blob style={{ bottom: '-180px', right: '-120px', width: '500px', height: '500px', opacity: 0.5 }} />
          <div style={{ position: 'relative', zIndex: 1 }}>
            <div style={{ textAlign: 'center', marginBottom: '48px' }}>
              <p style={{ ...eyebrow, backgroundColor: 'rgba(34,197,94,0.14)', color: GREEN_BRIGHT }}><MdShield size={15} /> Segurança</p>
              <h2 style={{ ...h2, color: 'white' }}>Seus dados seguros e <span style={gradText}>em conformidade com a LGPD</span></h2>
              <p style={{ ...sub, color: 'rgba(255,255,255,0.65)' }}>Privacidade e segurança em primeiro lugar — dados protegidos e sob seu controle.</p>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: isSmallScreen ? '1fr' : 'repeat(4, 1fr)', gap: '20px' }}>
              {lgpd.map((c, i) => (
                <div key={i} style={{ borderLeft: `2px solid rgba(34,197,94,0.4)`, paddingLeft: '18px' }}>
                  <c.icon size={24} style={{ color: GREEN_BRIGHT, marginBottom: '14px' }} />
                  <h3 style={{ fontSize: '16px', fontWeight: '700', color: 'white', margin: '0 0 8px' }}>{c.titulo}</h3>
                  <p style={{ fontSize: '13.5px', color: 'rgba(255,255,255,0.6)', margin: 0, lineHeight: 1.55 }}>{c.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Calculadora ROI */}
      <section style={{ padding: sectionPad }}>
        <div style={{ maxWidth: '700px', margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: '40px' }}>
            <p style={eyebrow}><MdTrendingUp size={15} /> Calculadora</p>
            <h2 style={h2}>Quanto você perde com <span style={gradText}>inadimplência?</span></h2>
            <p style={sub}>Descubra em 10 segundos quanto dinheiro está ficando para trás.</p>
          </div>
          <div style={{ backgroundColor: 'white', borderRadius: '22px', padding: isSmallScreen ? '24px' : '40px', border: `1px solid ${BORDER}`, boxShadow: '0 20px 50px rgba(16,24,40,0.06)' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '18px', marginBottom: '26px' }}>
              {[{ l: 'Quantos clientes você tem?', v: roiClientes, s: setRoiClientes }, { l: 'Valor médio da mensalidade (R$)', v: roiValor, s: setRoiValor }, { l: '% de inadimplência atual', v: roiInad, s: setRoiInad }].map((f, i) => (
                <div key={i}>
                  <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', color: INK, marginBottom: '8px' }}>{f.l}</label>
                  <input type="number" value={f.v} onChange={e => f.s(e.target.value)}
                    style={{ width: '100%', padding: '13px 16px', fontSize: '16px', backgroundColor: BG_SOFT, color: INK, border: `1.5px solid ${BORDER}`, borderRadius: '11px', outline: 'none', boxSizing: 'border-box', transition: 'border-color .2s' }}
                    onFocus={e => { e.target.style.borderColor = GREEN; e.target.select() }} onBlur={e => e.target.style.borderColor = BORDER} />
                </div>
              ))}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: isSmallScreen ? '1fr' : '1fr 1fr', gap: '12px', marginBottom: '24px' }}>
              <div style={{ backgroundColor: '#fef2f2', borderRadius: '14px', padding: '20px', border: '1px solid #fecaca' }}>
                <p style={{ fontSize: '13px', color: '#b91c1c', margin: '0 0 4px', fontWeight: '600' }}>Você perde por mês</p>
                <p style={{ fontSize: '26px', fontWeight: '800', color: '#dc2626', margin: 0 }}>R$ {perdaMensal.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
              </div>
              <div style={{ background: `linear-gradient(135deg, ${GREEN_SOFT}, #e9fbf1)`, borderRadius: '14px', padding: '20px', border: '1px solid #bbf7d0' }}>
                <p style={{ fontSize: '13px', color: GREEN_DK, margin: '0 0 4px', fontWeight: '600' }}>Recupere até 70%</p>
                <p style={{ fontSize: '26px', fontWeight: '800', color: GREEN, margin: 0 }}>+R$ {recuperacao.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
              </div>
            </div>
            <button onClick={() => navigate('/signup')} style={{ ...btnGrad('16px', '16px'), width: '100%' }}
              onMouseOver={e => { e.currentTarget.style.transform = 'translateY(-2px)' }} onMouseOut={e => { e.currentTarget.style.transform = 'translateY(0)' }}>
              Começar a recuperar agora <MdArrowForward size={20} />
            </button>
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="precos" style={{ padding: sectionPad, backgroundColor: BG_SOFT }}>
        <div style={{ maxWidth: '1080px', margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: '48px' }}>
            <p style={eyebrow}><MdStar size={15} /> Planos</p>
            <h2 style={h2}>Escolha o plano ideal para <span style={gradText}>o seu negócio</span></h2>
            <p style={sub}>Comece a automatizar suas cobranças hoje mesmo.</p>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: isSmallScreen ? '1fr' : 'repeat(3, 1fr)', gap: '20px', alignItems: 'start' }}>
            {planos.map((pl, i) => {
              const d = pl.destaque
              return (
                <div key={i} style={{ backgroundColor: 'white', padding: '34px', borderRadius: '22px', border: d ? `2px solid ${GREEN}` : `1px solid ${BORDER}`, position: 'relative', transform: (d && !isSmallScreen) ? 'scale(1.04)' : 'none', boxShadow: d ? '0 26px 60px rgba(22,163,74,0.18)' : '0 12px 30px rgba(16,24,40,0.05)' }}>
                  {d && <div style={{ position: 'absolute', top: '-13px', left: '50%', transform: 'translateX(-50%)', background: GRAD, color: 'white', padding: '6px 16px', borderRadius: '100px', fontSize: '12px', fontWeight: '700' }}>Melhor custo-benefício</div>}
                  <p style={{ fontSize: '12px', fontWeight: '700', color: MUTED, margin: '0 0 6px', textTransform: 'uppercase', letterSpacing: '.5px' }}>{pl.eyebrow}</p>
                  <h3 style={{ fontSize: '22px', fontWeight: '700', color: INK, margin: '0 0 16px' }}>{pl.nome}</h3>
                  <div style={{ marginBottom: '24px' }}>
                    <span style={{ fontSize: '46px', fontWeight: '800', letterSpacing: '-1.5px', color: INK }}>R${pl.preco}</span>
                    <span style={{ fontSize: '16px', color: MUTED }}>/mês</span>
                    <p style={{ fontSize: '12px', color: MUTED, margin: '6px 0 0' }}>{pl.perMsg}</p>
                  </div>
                  <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 30px' }}>
                    {pl.features.map((it, j) => (
                      <li key={j} style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', marginBottom: '12px', fontSize: '14px', color: BODY }}>
                        <MdCheck size={18} style={{ color: GREEN, flexShrink: 0, marginTop: '2px' }} /> {it}
                      </li>
                    ))}
                  </ul>
                  <button onClick={() => navigate('/signup')} style={d ? { ...btnGrad('14px', '15px'), width: '100%' } : { ...btnGhost('14px', '100%') }}
                    onMouseOver={e => { if (d) e.currentTarget.style.opacity = '.9'; else e.currentTarget.style.borderColor = '#cfd3da' }}
                    onMouseOut={e => { if (d) e.currentTarget.style.opacity = '1'; else e.currentTarget.style.borderColor = BORDER }}>
                    {pl.cta}
                  </button>
                </div>
              )
            })}
          </div>
        </div>
      </section>

      {/* Motivos para assinar */}
      <section style={{ padding: sectionPad }}>
        <div style={{ maxWidth: '1080px', margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: '48px' }}>
            <p style={eyebrow}><MdCheckCircle size={15} /> Diferenciais</p>
            <h2 style={h2}>Mais motivos para <span style={gradText}>assinar o Mensalli</span></h2>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: isSmallScreen ? '1fr' : 'repeat(4, 1fr)', gap: '18px' }}>
            {motivos.map((m, i) => (
              <div key={i} className="lp-card" style={{ backgroundColor: 'white', border: `1px solid ${BORDER}`, borderRadius: '18px', padding: '26px' }}>
                <div style={{ width: '46px', height: '46px', borderRadius: '13px', background: GREEN_SOFT, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '16px' }}>
                  <m.icon size={22} style={{ color: GREEN_DK }} />
                </div>
                <h3 style={{ fontSize: '16px', fontWeight: '700', color: INK, margin: '0 0 7px' }}>{m.titulo}</h3>
                <p style={{ fontSize: '14px', color: BODY, margin: 0, lineHeight: 1.55 }}>{m.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" style={{ padding: sectionPad, backgroundColor: BG_SOFT }}>
        <div style={{ maxWidth: '780px', margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: '48px' }}>
            <p style={eyebrow}><MdMessage size={15} /> Dúvidas frequentes</p>
            <h2 style={h2}>Tudo que você <span style={gradText}>precisa saber</span></h2>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {faqs.map((f, i) => {
              const open = faqAberto === i
              return (
                <div key={i} style={{ border: `1px solid ${open ? '#cdeed8' : BORDER}`, borderRadius: '14px', overflow: 'hidden', cursor: 'pointer', backgroundColor: 'white', transition: 'border-color .2s' }} onClick={() => setFaqAberto(open ? null : i)}>
                  <div style={{ padding: '20px 22px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '16px' }}>
                    <span style={{ fontSize: '16px', fontWeight: '600', color: INK }}>{f.p}</span>
                    {open ? <MdRemove size={20} style={{ color: GREEN, flexShrink: 0 }} /> : <MdAdd size={20} style={{ color: MUTED, flexShrink: 0 }} />}
                  </div>
                  {open && <div style={{ padding: '0 22px 20px', color: BODY, fontSize: '15px', lineHeight: 1.6 }}>{f.r}</div>}
                </div>
              )
            })}
          </div>
        </div>
      </section>

      {/* CTA final com formulário */}
      <section style={{ padding: isSmallScreen ? '24px 16px 64px' : '40px 24px 110px' }}>
        <div style={{ maxWidth: '1080px', margin: '0 auto', background: DARK, borderRadius: '28px', padding: isSmallScreen ? '40px 26px' : '60px', position: 'relative', overflow: 'hidden' }}>
          <Blob style={{ top: '-160px', left: '-100px', width: '460px', height: '460px', opacity: 0.5 }} />
          <div style={{ position: 'relative', zIndex: 1, display: 'grid', gridTemplateColumns: isSmallScreen ? '1fr' : '1fr 1fr', gap: isSmallScreen ? '36px' : '56px', alignItems: 'center' }}>
            <div>
              <h2 style={{ fontSize: isSmallScreen ? '30px' : '42px', fontWeight: '800', color: 'white', letterSpacing: '-1.5px', lineHeight: 1.1, margin: '0 0 16px' }}>
                Pronto para <span style={gradText}>parar de cobrar na mão?</span>
              </h2>
              <p style={{ fontSize: '17px', color: 'rgba(255,255,255,0.7)', lineHeight: 1.6, margin: '0 0 24px' }}>
                Configure em 5 minutos e comece a receber amanhã. Sem cartão de crédito, cancele quando quiser.
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {['Teste grátis por 3 dias', 'Suporte em português', 'Migração de dados facilitada'].map((t, i) => (
                  <span key={i} style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '15px', color: 'rgba(255,255,255,0.85)' }}><MdCheckCircle size={20} style={{ color: GREEN_BRIGHT }} /> {t}</span>
                ))}
              </div>
            </div>
            <div style={{ backgroundColor: 'white', borderRadius: '20px', padding: isSmallScreen ? '24px' : '32px' }}>
              <p style={{ fontSize: '17px', fontWeight: '700', color: INK, margin: '0 0 20px' }}>Para agilizar, conta pra gente:</p>
              <label style={formLabel}>Seu maior desafio com cobrança hoje</label>
              <select value={formDesafio} onChange={e => setFormDesafio(e.target.value)} style={formField}>
                <option value="">Selecione…</option>
                <option>Inadimplência alta</option>
                <option>Perco tempo cobrando na mão</option>
                <option>Esqueço de cobrar</option>
                <option>Outro</option>
              </select>
              <label style={formLabel}>Quantos clientes você tem?</label>
              <input type="number" value={formClientes} onChange={e => setFormClientes(e.target.value)} placeholder="Ex: 80" style={formField} />
              <label style={formLabel}>Usa algum sistema hoje?</label>
              <div style={{ display: 'flex', gap: '10px', marginBottom: '22px' }}>
                {['Sim', 'Não'].map(op => (
                  <button key={op} onClick={() => setFormSistema(op)} style={{ flex: 1, padding: '12px', borderRadius: '11px', border: `1.5px solid ${formSistema === op ? GREEN : BORDER}`, backgroundColor: formSistema === op ? GREEN_SOFT : 'white', color: formSistema === op ? GREEN_DK : BODY, fontWeight: '600', fontSize: '14px', cursor: 'pointer', transition: 'all .2s' }}>{op}</button>
                ))}
              </div>
              <button onClick={() => navigate('/signup')} style={{ ...btnGrad('15px', '16px'), width: '100%' }}
                onMouseOver={e => { e.currentTarget.style.transform = 'translateY(-2px)' }} onMouseOut={e => { e.currentTarget.style.transform = 'translateY(0)' }}>
                Continuar <MdArrowForward size={20} />
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer style={{ backgroundColor: '#0a0c0a', color: 'rgba(255,255,255,0.62)', padding: isSmallScreen ? '48px 24px 28px' : '64px 24px 32px' }}>
        <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
          <div style={{ display: 'grid', gridTemplateColumns: isSmallScreen ? '1fr' : '1.6fr 1fr 1fr 1fr', gap: isSmallScreen ? '36px' : '40px', marginBottom: '40px' }}>
            <div>
              <img src="/Logo-Full.png" alt="Mensalli" style={{ height: '32px', width: 'auto', filter: 'brightness(0) invert(1)', marginBottom: '16px' }} />
              <p style={{ fontSize: '14px', color: 'rgba(255,255,255,0.5)', lineHeight: 1.6, maxWidth: '300px', margin: '0 0 18px' }}>
                Cobrança automática pelo WhatsApp para quem vive de mensalidade. Menos inadimplência, sem constrangimento.
              </p>
              <div style={{ display: 'flex', gap: '10px' }}>
                {[{ icon: FaWhatsapp, href: 'https://wa.me/5562981618862' }, { icon: FaInstagram, href: 'https://instagram.com/mensalli' }].map((s, i) => (
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
              { t: 'Produto', links: [{ l: 'Recursos', id: 'recursos' }, { l: 'Preços', id: 'precos' }, { l: 'Dúvidas', id: 'faq' }] },
              { t: 'Empresa', links: [{ l: 'Entrar', to: '/login' }, { l: 'Criar conta', to: '/signup' }, { l: 'Contato', href: 'https://wa.me/5562981618862' }] },
              { t: 'Legal', links: [{ l: 'Termos de Uso', href: '#' }, { l: 'Privacidade', href: '#' }, { l: 'LGPD', href: '#' }] }
            ].map((col, ci) => (
              <div key={ci}>
                <p style={{ fontSize: '12px', fontWeight: '700', color: 'white', textTransform: 'uppercase', letterSpacing: '.5px', margin: '0 0 16px' }}>{col.t}</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {col.links.map((lk, li) => (
                    <button key={li} onClick={() => { if (lk.id) scrollToId(lk.id); else if (lk.to) navigate(lk.to); else if (lk.href) window.open(lk.href, lk.href.startsWith('http') ? '_blank' : '_self') }}
                      style={{ background: 'none', border: 'none', padding: 0, textAlign: 'left', cursor: 'pointer', fontSize: '14px', color: 'rgba(255,255,255,0.62)', transition: 'color .2s', width: 'fit-content' }}
                      onMouseOver={e => e.currentTarget.style.color = GREEN_BRIGHT} onMouseOut={e => e.currentTarget.style.color = 'rgba(255,255,255,0.62)'}>{lk.l}</button>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', flexDirection: isSmallScreen ? 'column' : 'row', justifyContent: 'space-between', alignItems: isSmallScreen ? 'flex-start' : 'center', gap: '14px', paddingTop: '24px', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
            <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.4)', margin: 0 }}>© 2026 Mensalli. Todos os direitos reservados.</p>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '7px', fontSize: '12px', fontWeight: '600', color: 'rgba(255,255,255,0.7)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '100px', padding: '6px 12px' }}>
              <MdLock size={14} color={GREEN_BRIGHT} /> Pagamento seguro · LGPD
            </span>
          </div>
        </div>
      </footer>

      {/* Botão flutuante WhatsApp */}
      <a href="https://wa.me/5562981618862" target="_blank" rel="noopener noreferrer"
        style={{ position: 'fixed', bottom: isSmallScreen ? '80px' : '20px', right: '20px', width: '58px', height: '58px', background: GRAD, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 6px 20px rgba(22,163,74,0.45)', zIndex: 1000, transition: 'transform .3s' }}
        onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.1)' }} onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)' }}>
        <FaWhatsapp size={30} color="white" />
      </a>

      {/* Sticky CTA mobile */}
      {isSmallScreen && (
        <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(255,255,255,0.95)', backdropFilter: 'blur(10px)', borderTop: `1px solid ${BORDER}`, padding: '12px 18px', zIndex: 999, display: 'flex', gap: '10px', alignItems: 'center' }}>
          <button onClick={() => navigate('/signup')} style={{ ...btnGrad('14px', '15px'), flex: 1 }}>Teste grátis <MdArrowForward size={18} /></button>
          <button onClick={() => navigate('/login')} style={btnGhost('14px 20px', 'auto')}>Entrar</button>
        </div>
      )}
    </div>
  )
}

// ---- componentes e estilos auxiliares ----
function scrollToId(id) { const el = document.getElementById(id); if (el) el.scrollIntoView({ behavior: 'smooth' }) }

function Blob({ style }) {
  return <div className="lp-float" style={{ position: 'absolute', zIndex: 0, pointerEvents: 'none', borderRadius: '50%', filter: 'blur(60px)', background: 'radial-gradient(circle at 30% 30%, rgba(34,197,94,0.45), rgba(14,163,114,0.25) 45%, rgba(34,197,94,0) 70%)', animation: 'lpBlob 12s ease-in-out infinite', ...style }} />
}

function PhoneChat({ isSmall }) {
  const W = isSmall ? 240 : 280
  return (
    <div className="lp-floatslow" style={{ position: 'relative', zIndex: 1, width: W, borderRadius: '38px', border: '10px solid #111', background: '#111', boxShadow: '0 40px 80px rgba(16,24,40,0.3)' }}>
      <div style={{ borderRadius: '28px', overflow: 'hidden', backgroundColor: '#e7ded5' }}>
        <div style={{ background: 'linear-gradient(135deg,#0ea372,#16a34a)', padding: '14px 14px 12px', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ width: '34px', height: '34px', borderRadius: '50%', backgroundColor: 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><FaWhatsapp size={18} color="white" /></span>
          <div style={{ lineHeight: 1.2 }}>
            <p style={{ margin: 0, fontSize: '14px', fontWeight: '700', color: 'white' }}>Mensalli</p>
            <p style={{ margin: 0, fontSize: '11px', color: 'rgba(255,255,255,0.85)' }}>online</p>
          </div>
        </div>
        <div style={{ padding: '18px 14px', display: 'flex', flexDirection: 'column', gap: '10px', minHeight: '300px' }}>
          <div style={{ alignSelf: 'flex-end', maxWidth: '85%', backgroundColor: '#d9fdd3', borderRadius: '12px 12px 4px 12px', padding: '9px 11px', boxShadow: '0 1px 1px rgba(0,0,0,0.08)' }}>
            <p style={{ margin: 0, fontSize: '13px', color: '#111b21', lineHeight: 1.45 }}>Oi, Maria! 👋 Sua mensalidade de R$ 150 vence amanhã.</p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '3px', marginTop: '3px' }}>
              <span style={{ fontSize: '10px', color: '#667781' }}>09:41</span>
              <MdDoneAll size={14} style={{ animation: 'lpTick 4s ease-in-out infinite' }} />
            </div>
          </div>
          <div style={{ alignSelf: 'flex-end', maxWidth: '85%', backgroundColor: '#d9fdd3', borderRadius: '12px', padding: '9px 11px', boxShadow: '0 1px 1px rgba(0,0,0,0.08)' }}>
            <p style={{ margin: 0, fontSize: '13px', color: '#111b21', lineHeight: 1.45 }}>Pode pagar por aqui no Pix 👇</p>
            <div style={{ marginTop: '7px', backgroundColor: 'rgba(0,0,0,0.05)', borderRadius: '8px', padding: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <MdQrCode2 size={20} style={{ color: GREEN_DK }} />
              <span style={{ fontSize: '12px', fontWeight: '600', color: '#111b21' }}>Link de pagamento</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '3px', marginTop: '4px' }}>
              <span style={{ fontSize: '10px', color: '#667781' }}>09:41</span>
              <MdDoneAll size={14} style={{ color: '#53bdeb' }} />
            </div>
          </div>
          <div style={{ alignSelf: 'flex-start', maxWidth: '80%', backgroundColor: 'white', borderRadius: '12px 12px 12px 4px', padding: '9px 11px', boxShadow: '0 1px 1px rgba(0,0,0,0.08)' }}>
            <p style={{ margin: 0, fontSize: '13px', color: '#111b21', lineHeight: 1.45 }}>Acabei de pagar, obrigada! 🙏</p>
            <span style={{ fontSize: '10px', color: '#667781', float: 'right', marginTop: '3px' }}>09:43</span>
          </div>
        </div>
      </div>
    </div>
  )
}

const navLink = { padding: '8px 14px', backgroundColor: 'transparent', color: BODY, border: 'none', fontSize: '14px', fontWeight: '500', cursor: 'pointer' }
const gradText = { background: GRAD_TEXT, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }
const formLabel = { display: 'block', fontSize: '13px', fontWeight: '600', color: INK, marginBottom: '7px' }
const formField = { width: '100%', padding: '12px 14px', fontSize: '15px', backgroundColor: BG_SOFT, color: INK, border: `1.5px solid ${BORDER}`, borderRadius: '11px', outline: 'none', boxSizing: 'border-box', marginBottom: '16px' }

function btnGrad(padding, fontSize) {
  return { padding, fontSize, background: GRAD, color: 'white', border: 'none', borderRadius: '12px', fontWeight: '700', cursor: 'pointer', transition: 'all .2s', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '9px', boxShadow: '0 8px 24px rgba(22,163,74,0.28)' }
}
function btnGhost(padding, width) {
  return { padding, width, fontSize: '15px', backgroundColor: 'white', color: INK, border: `1px solid ${BORDER}`, borderRadius: '12px', fontWeight: '600', cursor: 'pointer', transition: 'all .2s', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }
}
function dot(c) { return { width: '11px', height: '11px', borderRadius: '50%', backgroundColor: c } }
