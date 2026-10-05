import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { FaWhatsapp, FaInstagram } from 'react-icons/fa'
import { MdArrowForward, MdBolt, MdCalendarMonth, MdCheck, MdCheckCircle, MdDashboard, MdDoneAll, MdExpandMore, MdGroups, MdHistory, MdLink, MdPayments, MdQrCode2, MdSecurity, MdSelfImprovement, MdVisibility } from 'react-icons/md'
import { capturarAtribuicao } from '../utils/metaAttribution'
import { trackViewContent } from '../utils/metaPixel'
import pilatesHero from '../assets/pilates-hero.png'
import './LandingLuta.css'
import './LandingLutaRefinements.css'
import './LandingPilates.css'

const WA = 'https://wa.me/5562981618862?text=' + encodeURIComponent('Oi! Tenho um estúdio de Pilates e quero conhecer o Mensalli.')
const dores = [
  ['Entre uma aula e outra','O WhatsApp virou sua recepção','Remarcação, horário, comprovante e cobrança chegam enquanto você está cuidando de outro aluno.'],
  ['Todo mês','Cobrar quebra a leveza da relação','Você acompanha cada evolução de perto. Por isso, lembrar uma mensalidade atrasada pode ser desconfortável.'],
  ['Na agenda','Planos e horários ficam espalhados','Duas ou três aulas por semana, reposições e professores diferentes exigem uma organização que a planilha não acompanha.'],
  ['Sem perceber','A frequência cai antes do cancelamento','Quando o aluno começa a faltar e ninguém age, o vínculo enfraquece e a renovação fica mais distante.']
]
const recursos = [
  [FaWhatsapp,'Cobrança no WhatsApp','O aluno recebe pelo número do estúdio e pode responder normalmente.'],
  [MdPayments,'Planos e mensalidades','Acompanhe vencimentos, pagamentos e atrasos sem conferir conversa por conversa.'],
  [MdLink,'Link de pagamento','Envie Pix, cartão ou boleto na própria mensagem e facilite o acerto.'],
  [MdDashboard,'Visão financeira','Veja recebido, a receber e pendências do mês em um único painel.'],
  [MdGroups,'Ficha do aluno','Mantenha contato, plano, histórico e informações importantes centralizados.'],
  [MdCalendarMonth,'Agenda do estúdio','Organize horários, professores, turmas reduzidas e aulas individuais.'],
  [MdSelfImprovement,'Presença e frequência','Faça a chamada e identifique alunos que começaram a faltar.'],
  [MdSecurity,'Dados protegidos','Permissões e histórico para cuidar das informações do estúdio e dos alunos.']
]
const planos = [
  {nome:'Starter',eyebrow:'Ideal para começar',preco:49,cta:'Começar no Starter',features:['Até 50 alunos ativos','200 mensagens/mês','Mensagem automática no vencimento','1 template personalizado','Dashboard básico']},
  {nome:'Pro',eyebrow:'Estúdios em crescimento',preco:99,cta:'Escolher o Pro',features:['Até 150 alunos ativos','600 mensagens/mês','Cobranças automáticas','Agenda e presença','Contratos e ficha do aluno','Suporte via WhatsApp']},
  {nome:'Premium',eyebrow:'Gestão profissional',preco:149,cta:'Ativar Premium',destaque:true,features:['Até 500 alunos ativos','3.000 mensagens/mês','Tudo do plano Pro','Link na bio com botão de agendar','CRM completo','Bot de WhatsApp','Agendamento online','Campanhas de WhatsApp','Suporte prioritário']}
]
const faqs = [
  ['As mensagens saem do WhatsApp do estúdio?','Sim. Você conecta o número do estúdio por QR Code e os alunos recebem do contato que já conhecem.'],
  ['Consigo organizar planos com frequências diferentes?','Sim. Você pode manter os planos e vencimentos dos alunos organizados conforme a rotina do estúdio.'],
  ['E quando o aluno paga em dinheiro?','Você registra a baixa manualmente e mantém o histórico da mensalidade organizado.'],
  ['Consigo controlar presença?','Sim. A chamada ajuda a acompanhar a frequência e perceber quem começou a faltar.'],
  ['Preciso instalar alguma coisa?','Não. O Mensalli funciona online no computador e no celular.'],
  ['Existe fidelidade?','Não. Os planos são mensais e o teste inicial não exige cartão de crédito.']
]
function setMeta(name,content,attr='name'){let el=document.querySelector(`meta[${attr}="${name}"]`);if(!el){el=document.createElement('meta');el.setAttribute(attr,name);document.head.appendChild(el)}el.setAttribute('content',content)}

export default function LandingPilates(){
  const navigate=useNavigate(),[faq,setFaq]=useState(null)
  useEffect(()=>{capturarAtribuicao();trackViewContent('landing-estudio-pilates');const old=document.title;const title='Sistema para estúdio de Pilates — mensalidades no WhatsApp | Mensalli';const desc='Organize alunos, planos, horários, presença e mensalidades do seu estúdio de Pilates com o Mensalli.';document.title=title;setMeta('description',desc);setMeta('og:title',title,'property');setMeta('og:description',desc,'property');return()=>{document.title=old}},[])
  const signup=()=>navigate('/signup')
  return <main className="fight-page pilates-page">
    <nav className="fight-nav"><a href="/"><img src="/Logo-Full.png" alt="Mensalli"/></a><div className="nav-links"><a href="#como">Como funciona</a><a href="#recursos">Recursos</a><a href="#planos">Planos</a></div><div><button className="nav-login" onClick={()=>navigate('/login')}>Entrar</button><button className="green-btn small" onClick={signup}>Testar grátis</button></div></nav>
    <section className="fight-hero"><div className="hero-photo" style={{backgroundImage:`url(${pilatesHero})`}}/><div className="hero-shade"/><div className="hero-copy"><span className="eyebrow"><i/>Feito para estúdios de Pilates</span><h1>Seu aluno evolui.<br/><em>O Mensalli cobra.</em></h1><p>Planos, mensalidades, horários e presença organizados — para você cuidar de cada movimento sem transformar o WhatsApp em recepção.</p><Actions signup={signup}/><Notes/></div><PilatesStatus/></section>
    <div className="styles-strip">PILATES SOLO <i/> REFORMER <i/> AULAS INDIVIDUAIS <i/> DUPLAS <i/> GRUPOS REDUZIDOS</div>
    <section className="section"><Intro kicker="A rotina real de um estúdio de Pilates" title={<>Você cuida de cada movimento.<br/>A gestão não pode <em>tirar seu equilíbrio.</em></>} text="Entre uma aula e outra, ainda é preciso responder alunos, conferir pagamentos, organizar horários e acompanhar faltas."/><div className="pain-grid">{dores.map((d,i)=><article className="pain-card" key={d[1]}><span>0{i+1}</span><small>{d[0]}</small><h3>{d[1]}</h3><p>{d[2]}</p></article>)}</div></section>
    <section className="dark-section" id="como"><Intro light kicker="Cobrança Invisível Mensalli" title={<>Configure uma vez.<br/><em>Respire todo mês.</em></>} text="Cadastre sua base, conecte o WhatsApp do estúdio e deixe o Mensalli organizar as cobranças."/><div className="flow"><Flow n="01" icon={MdGroups} title="Cadastre os alunos" text="Cadastre, importe ou envie sua base para nossa equipe ajudar você."/><MdArrowForward/><Flow n="02" icon={MdQrCode2} title="Conecte o WhatsApp" text="Leia o QR Code com o número que seus alunos já conhecem."/><MdArrowForward/><Flow n="03" icon={MdBolt} title="Deixe rodando" text="O Mensalli envia, registra e organiza as cobranças."/></div><PilatesChat/></section>
    <section className="section feature-section" id="recursos"><Intro kicker="Muito além de cobrar mensalidade" title={<>O estúdio organizado<br/><em>da agenda ao financeiro.</em></>} text="Recursos para acompanhar alunos, horários e pagamentos sem perder a proximidade do atendimento."/><div className="feature-grid">{recursos.map(([I,t,x])=><article className="feature-card" key={t}><span><I/></span><h3>{t}</h3><p>{x}</p></article>)}</div></section>
    <section className="visual-section"><div className="visual-copy"><span className="kicker">Clareza para quem administra</span><h2>Quem pagou, quem faltou<br/>e quem precisa de <em>atenção.</em></h2><p>Abra o painel e encontre as informações importantes sem procurar em planilhas e conversas.</p><div className="visual-list"><span><MdVisibility/>Visão financeira do mês</span><span><MdSelfImprovement/>Agenda e frequência</span><span><MdHistory/>Histórico organizado</span></div></div><div className="dashboard-frame"><div className="browser"><i/><i/><i/><span>app.mensalli.com.br</span></div><img src="/dashboard.png" alt="Painel financeiro do Mensalli"/></div></section>
    <section className="plans-section" id="planos"><Intro kicker="Planos para cada fase" title={<>Escolha o plano ideal para <em>o seu estúdio.</em></>} text="Teste por 3 dias, sem cartão, e escolha quando fizer sentido para sua rotina."/><div className="plans-grid">{planos.map(p=><article className={`plan-card ${p.destaque?'featured':''}`} key={p.nome}>{p.destaque&&<span className="popular">Melhor custo-benefício</span>}<small>{p.eyebrow}</small><h3>{p.nome}</h3><div className="price"><strong>R${p.preco}</strong><span>/mês</span></div><ul>{p.features.map(x=><li key={x}><MdCheck/>{x}</li>)}</ul><button className={p.destaque?'green-btn':'outline-dark'} onClick={signup}>{p.cta}</button></article>)}</div></section>
    <section className="section faq-section"><Intro kicker="Dúvidas frequentes" title={<>Tudo o que você precisa saber<br/><em>antes de começar.</em></>}/><div className="faq-list">{faqs.map(([q,a],i)=><button className={faq===i?'open':''} key={q} onClick={()=>setFaq(faq===i?null:i)}><span><b>{q}</b>{faq===i&&<p>{a}</p>}</span><MdExpandMore/></button>)}</div></section>
    <section className="final-cta pilates-final"><span className="kicker">Seu estúdio merece uma gestão mais leve</span><h2>Você cuida da evolução dos alunos.<br/><em>O Mensalli cuida da cobrança.</em></h2><p>Comece agora e organize sua rotina financeira sem perder o foco no atendimento.</p><Actions signup={signup}/><Notes/></section>
    <footer><div><img src="/Logo-Full.png" alt="Mensalli"/><p>Cobrança automática e gestão de mensalidades para quem vive do próprio negócio.</p><a href="https://www.instagram.com/mensalli.br/" target="_blank" rel="noreferrer"><FaInstagram/></a></div><small>© 2026 Mensalli. Todos os direitos reservados.</small></footer><a className="floating-wa" href={WA} target="_blank" rel="noreferrer"><FaWhatsapp/></a>
  </main>
}
function Intro({kicker,title,text,light}){return <div className={`section-intro ${light?'light':''}`}><span className="kicker">{kicker}</span><h2>{title}</h2>{text&&<p>{text}</p>}</div>}
function Actions({signup}){return <div className="actions"><button className="green-btn" onClick={signup}>Começar teste grátis <MdArrowForward/></button><a className="outline-btn" href={WA} target="_blank" rel="noreferrer"><FaWhatsapp/>Falar com a equipe</a></div>}
function Notes(){return <div className="notes"><span><MdCheck/>3 dias grátis</span><span><MdCheck/>Sem cartão</span><span><MdCheck/>Cancele quando quiser</span></div>}
function Flow({n,icon:I,title,text}){return <div className="flow-step"><span>{n}</span><I/><h3>{title}</h3><p>{text}</p></div>}
function PilatesStatus(){return <div className="status-card"><div className="status-head"><div><small>Visão do estúdio</small><b>Mensalidades de outubro</b></div><span>● AO VIVO</span></div><div className="status-grid"><div><small>Recebido</small><b>R$ 8.240</b><span>↑ entrando</span></div><div><small>Em aberto</small><b>R$ 1.180</b><span>7 alunos</span></div></div><Student ini="AM" nome="Ana Martins" turma="Plano 2x por semana" status="Pago"/><Student ini="RP" nome="Rafael Prado" turma="Plano individual" status="Lembrete enviado"/><div className="whats-note"><FaWhatsapp/><div><b>Cobranças trabalhando</b><small>Mensagens enviadas automaticamente hoje</small></div><MdDoneAll/></div></div>}
function Student({ini,nome,turma,status}){return <div className="student"><span>{ini}</span><div><b>{nome}</b><small>{turma}</small></div><em>{status}</em></div>}
function PilatesChat(){return <div className="chat-demo"><div className="phone"><div className="phone-top"><span>‹</span><b>Studio Movimento<small>online</small></b></div><div className="phone-body"><i>Hoje</i><p>Oi, Mariana! Sua mensalidade do Pilates vence hoje. Para facilitar, o link está aqui:<br/><b>mensalli.com.br/pagar</b><small>09:12 <MdDoneAll/></small></p><p className="answer">Obrigada! Acabei de pagar.<small>09:15</small></p><p>Pagamento identificado ✓<small>09:16</small></p></div></div><div className="chat-copy"><span className="kicker">O estúdio fala pelo próprio número</span><h3>O aluno recebe onde já conversa com você.</h3><p>A cobrança chega pelo WhatsApp do estúdio, com clareza e sem depender da memória da recepção.</p><ul>{['Contato conhecido','Link na conversa','Histórico registrado','Menos conferência manual'].map(x=><li key={x}><MdCheckCircle/>{x}</li>)}</ul></div></div>}
