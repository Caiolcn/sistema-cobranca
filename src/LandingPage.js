import { useNavigate } from 'react-router-dom'
import {
  MdCheckCircle, MdCheck, MdArrowForward, MdStar,
  MdChevronLeft, MdChevronRight, MdShowChart, MdTimeline,
  MdTrendingUp, MdMessage, MdCode, MdDescription,
  MdMusicNote, MdFitnessCenter, MdSelfImprovement, MdPalette,
  MdAdd, MdRemove, MdLocalFireDepartment, MdClose, MdWarning
} from 'react-icons/md'
import { FaWhatsapp } from 'react-icons/fa'
import { useState } from 'react'
import useWindowSize from './hooks/useWindowSize'

export default function LandingPage() {
  const navigate = useNavigate()
  const { isMobile, isSmallScreen } = useWindowSize()
  const [faqAberto, setFaqAberto] = useState(null)

  const comoFunciona = [
    {
      numero: '01',
      titulo: 'Conecte seu WhatsApp',
      descricao: 'Escaneie o QR Code e vincule seu número ao sistema. Leva menos de 1 minuto.'
    },
    {
      numero: '02',
      titulo: 'Cadastre seus clientes',
      descricao: 'Adicione seus clientes. Configure planos de mensalidade e datas de vencimento.'
    },
    {
      numero: '03',
      titulo: 'Ative a automação',
      descricao: 'Personalize suas mensagens. Pronto! Sistema cobra automaticamente.'
    }
  ]

  const depoimentos = [
    {
      nome: 'Roberto Carlos',
      empresa: 'Escola de Música Crescendo',
      cargo: 'Fundador',
      texto: 'Reduzi a inadimplência em 40% no primeiro mês! Os lembretes automáticos pelo WhatsApp são mais eficientes que ligações.',
      foto: '/testimonials/men32.jpg'
    },
    {
      nome: 'Mariana Ferreira',
      empresa: 'Studio de Pilates Renascer',
      cargo: 'Dona',
      texto: 'Antes eu perdia horas ligando para cobrar. Agora o sistema faz tudo sozinho e ainda consigo acompanhar quem está em dia pelo dashboard.',
      foto: '/testimonials/women44.jpg'
    },
    {
      nome: 'Paulo Lima',
      empresa: 'Escola de Música Cultura Musical',
      cargo: 'Diretor',
      texto: 'O dashboard me mostra exatamente quanto vou receber no mês. Consegui planejar melhor o fluxo de caixa da minha escola.',
      foto: '/testimonials/men67.jpg'
    },
    {
      nome: 'Fernanda Santos',
      empresa: 'Academia Vida Ativa',
      cargo: 'Proprietária',
      texto: 'Meus alunos adoram receber o lembrete pelo WhatsApp. A taxa de pagamento em dia subiu de 60% para 90%!',
      foto: '/testimonials/women68.jpg'
    },
    {
      nome: 'Carlos Eduardo',
      empresa: 'Escola de Inglês GlobalSpeak',
      cargo: 'Diretor Administrativo',
      texto: 'O suporte é excelente e o sistema muito intuitivo. Em uma semana já estava com tudo funcionando perfeitamente.',
      foto: '/testimonials/men45.jpg'
    },
    {
      nome: 'Ana Paula',
      empresa: 'Personal Trainer',
      cargo: 'Autônoma',
      texto: 'Uso para cobrar os planos mensais dos meus alunos. Nunca mais tive problema com esquecimento de pagamento.',
      foto: '/testimonials/women33.jpg'
    }
  ]

  const [depoimentoIndex, setDepoimentoIndex] = useState(0)

  const faqs = [
    {
      pergunta: 'Qual a diferença entre os planos?',
      resposta: 'A diferença está no número de clientes ativos, mensagens mensais e recursos avançados. O Starter é ideal para testar, o Pro para a maioria dos negócios, e o Premium para quem tem volume alto ou quer consultoria.'
    },
    {
      pergunta: 'Como funciona a conexão com WhatsApp?',
      resposta: 'Você escaneia um QR Code que vincula seu número WhatsApp Business ao sistema. As mensagens saem do SEU número, mantendo o relacionamento direto com clientes.'
    },
    {
      pergunta: 'Posso cancelar a qualquer momento?',
      resposta: 'Sim! Sem multa, sem burocracia. Você pode cancelar direto no painel e o sistema para de cobrar no próximo ciclo.'
    },
    {
      pergunta: 'Meus dados estão seguros?',
      resposta: 'Sim. Usamos criptografia de ponta e nunca compartilhamos dados de clientes. Seus dados financeiros ficam apenas no seu painel.'
    },
    {
      pergunta: 'O WhatsApp pode banir meu número?',
      resposta: 'Não, se você usar corretamente. O Mensalli envia mensagens apenas para clientes que VOCÊ cadastrou (com consentimento implícito). Não fazemos spam.'
    },
    {
      pergunta: 'Como funciona a automação de cobranças?',
      resposta: 'Você define regras (ex: lembrete 3 dias antes do vencimento). O sistema envia automaticamente a mensagem personalizada via seu WhatsApp.'
    },
    {
      pergunta: 'O que acontece se eu atingir o limite de mensagens?',
      resposta: 'Você recebe um aviso quando chegar perto do limite. Pode fazer upgrade de plano ou comprar pacotes adicionais de mensagens avulsas.'
    },
    {
      pergunta: 'Funciona com WhatsApp Business?',
      resposta: 'Sim! Recomendamos WhatsApp Business para separar uso pessoal do profissional, mas funciona com WhatsApp comum também.'
    }
  ]

  return (
    <div style={{
      fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      backgroundColor: '#fafafa',
      color: '#1a1a1a'
    }}>
      {/* Navbar */}
      <nav style={{
        backgroundColor: 'white',
        padding: '16px 0',
        borderBottom: '1px solid #eee',
        position: 'sticky',
        top: 0,
        zIndex: 1000
      }}>
        <div style={{
          maxWidth: '1100px',
          margin: '0 auto',
          padding: '0 24px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <a href="https://www.mensalli.com.br" style={{ display: 'flex', alignItems: 'center', textDecoration: 'none' }}>
            <img
              src="/Logo-Full.png"
              alt="Mensalli"
              style={{ height: '40px', width: 'auto', cursor: 'pointer' }}
            />
          </a>

          <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
            {!isMobile && (
              <button
                onClick={() => document.getElementById('precos').scrollIntoView({ behavior: 'smooth' })}
                style={{
                  padding: '8px 16px',
                  backgroundColor: 'transparent',
                  color: '#666',
                  border: 'none',
                  fontSize: '14px',
                  fontWeight: '500',
                  cursor: 'pointer'
                }}
              >
                Preços
              </button>
            )}
            <button
              onClick={() => navigate('/login')}
              style={{
                padding: '10px 20px',
                backgroundColor: '#1a1a1a',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                fontSize: '14px',
                fontWeight: '600',
                cursor: 'pointer',
                transition: 'opacity 0.2s'
              }}
              onMouseOver={(e) => e.target.style.opacity = '0.85'}
              onMouseOut={(e) => e.target.style.opacity = '1'}
            >
              Entrar
            </button>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section style={{
        padding: isSmallScreen ? '60px 24px 80px' : '100px 24px 120px',
        textAlign: 'center',
        backgroundColor: 'white'
      }}>
        <div style={{ maxWidth: '800px', margin: '0 auto' }}>
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            backgroundColor: '#f0fdf4',
            color: '#16a34a',
            padding: '8px 16px',
            borderRadius: '100px',
            fontSize: '13px',
            fontWeight: '600',
            marginBottom: '32px'
          }}>
            <MdCheckCircle size={16} />
            A partir de R$ 49,90/mês
          </div>

          <h1 style={{
            fontSize: isSmallScreen ? '32px' : '52px',
            fontWeight: '800',
            lineHeight: '1.1',
            marginBottom: '24px',
            letterSpacing: '-1.5px',
            color: '#1a1a1a'
          }}>
            Mensalidades em dia,
            <br />
            <span style={{
              background: 'linear-gradient(135deg, #25D366 0%, #128C7E 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text'
            }}>
              automaticamente
            </span>
          </h1>

          <p style={{
            fontSize: isSmallScreen ? '17px' : '20px',
            color: '#666',
            marginBottom: '40px',
            lineHeight: '1.6',
            maxWidth: '650px',
            margin: '0 auto 40px'
          }}>
            Deixe o Mensalli cobrar por você via WhatsApp. Configure uma vez, receba em dia sempre.
          </p>

          <div style={{
            display: 'flex',
            gap: '12px',
            justifyContent: 'center',
            flexDirection: isSmallScreen ? 'column' : 'row',
            alignItems: 'center'
          }}>
            <button
              onClick={() => navigate('/signup')}
              style={{
                padding: '16px 32px',
                backgroundColor: '#1a1a1a',
                color: 'white',
                border: 'none',
                borderRadius: '12px',
                fontSize: '16px',
                fontWeight: '600',
                cursor: 'pointer',
                transition: 'all 0.2s',
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                width: isSmallScreen ? '100%' : 'auto',
                justifyContent: 'center'
              }}
              onMouseOver={(e) => {
                e.currentTarget.style.transform = 'translateY(-2px)'
                e.currentTarget.style.boxShadow = '0 8px 24px rgba(0,0,0,0.15)'
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.transform = 'translateY(0)'
                e.currentTarget.style.boxShadow = 'none'
              }}
            >
              Começar agora
              <MdArrowForward size={20} />
            </button>
          </div>

          <p style={{
            marginTop: '20px',
            fontSize: '13px',
            color: '#999'
          }}>
            Sem cartão • 3 dias grátis • Cancele quando quiser
          </p>

          {/* Hero Image */}
          <div style={{
            marginTop: '48px',
            borderRadius: '16px',
            overflow: 'hidden',
            boxShadow: '0 8px 32px rgba(0,0,0,0.12)'
          }}>
            <img
              src="/dashboard.png"
              alt="Dashboard do Mensalli"
              width="1800"
              height="940"
              fetchpriority="high"
              style={{ width: '100%', height: 'auto', display: 'block', aspectRatio: '1800 / 940' }}
            />
          </div>
        </div>
      </section>

      {/* Social Proof Section */}
      <section style={{
        padding: isSmallScreen ? '40px 24px' : '60px 24px',
        backgroundColor: '#fafafa',
        borderTop: '1px solid #eee',
        borderBottom: '1px solid #eee'
      }}>
        <div style={{ maxWidth: '1000px', margin: '0 auto', textAlign: 'center' }}>
          <p style={{
            fontSize: '15px',
            color: '#888',
            marginBottom: '32px',
            fontWeight: '500'
          }}>
            Mais de 500 negócios já automatizaram suas cobranças
          </p>

          {/* Métricas */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: isSmallScreen ? '1fr' : 'repeat(3, 1fr)',
            gap: '32px',
            marginBottom: '40px'
          }}>
            <div>
              <p style={{ fontSize: isSmallScreen ? '36px' : '48px', fontWeight: '800', color: '#1a1a1a', margin: '0 0 8px' }}>
                2.400+
              </p>
              <p style={{ fontSize: '14px', color: '#666', margin: 0 }}>
                Mensalidades cobradas este mês
              </p>
            </div>
            <div>
              <p style={{ fontSize: isSmallScreen ? '36px' : '48px', fontWeight: '800', color: '#25D366', margin: '0 0 8px' }}>
                70%
              </p>
              <p style={{ fontSize: '14px', color: '#666', margin: 0 }}>
                Redução média em inadimplência
              </p>
            </div>
            <div>
              <p style={{ fontSize: isSmallScreen ? '36px' : '48px', fontWeight: '800', color: '#1a1a1a', margin: '0 0 8px' }}>
                98%
              </p>
              <p style={{ fontSize: '14px', color: '#666', margin: 0 }}>
                Taxa de abertura das mensagens
              </p>
            </div>
          </div>

        </div>
      </section>

      {/* Produto vs Alternativas - Tabela Comparativa */}
      <section style={{
        padding: isSmallScreen ? '60px 24px' : '100px 24px',
        backgroundColor: 'white'
      }}>
        <div style={{ maxWidth: '900px', margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: '48px' }}>
            <h2 style={{
              fontSize: isSmallScreen ? '28px' : '40px',
              fontWeight: '800',
              marginBottom: '16px',
              letterSpacing: '-1px',
              color: '#1a1a1a'
            }}>
              Por que Mensalli em vez de...
            </h2>
          </div>

          <div style={{
            backgroundColor: '#fafafa',
            borderRadius: '16px',
            overflow: 'hidden',
            border: '1px solid #eee'
          }}>
            {/* Header */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: isSmallScreen ? '1fr' : '1.5fr 1fr 1fr 1fr',
              backgroundColor: '#f5f5f5',
              padding: '16px 24px',
              fontWeight: '600',
              fontSize: '14px',
              color: '#666'
            }}>
              <div></div>
              {!isSmallScreen && (
                <>
                  <div style={{ textAlign: 'center' }}>Cobrar manualmente</div>
                  <div style={{ textAlign: 'center' }}>Sistemas bancários</div>
                  <div style={{ textAlign: 'center', color: '#25D366' }}>Mensalli</div>
                </>
              )}
            </div>

            {/* Rows */}
            {[
              { label: 'Tempo gasto', manual: '2-5h/semana', banco: 'Setup complexo', mensallizap: '5 min/mês' },
              { label: 'Relacionamento', manual: 'Constrangedor', banco: 'Impessoal', mensallizap: 'Tom amigável' },
              { label: 'Custo', manual: 'Seu tempo vale mais', banco: 'R$ 200-500/mês', mensallizap: 'A partir de R$ 49' },
              { label: 'Automação', manual: 'Zero', banco: 'Emails ignorados', mensallizap: 'WhatsApp (98% abertura)', icons: { manual: MdClose, banco: MdWarning, mensallizap: MdCheck } },
              { label: 'Dashboard', manual: 'Planilhas manuais', banco: 'Complexo', mensallizap: 'Visual e simples', icons: { manual: MdClose, banco: MdWarning, mensallizap: MdCheck } }
            ].map((row, i) => (
              <div key={i} style={{
                display: 'grid',
                gridTemplateColumns: isSmallScreen ? '1fr' : '1.5fr 1fr 1fr 1fr',
                padding: '16px 24px',
                borderTop: '1px solid #eee',
                fontSize: '14px'
              }}>
                <div style={{ fontWeight: '600', color: '#1a1a1a', marginBottom: isSmallScreen ? '12px' : 0 }}>
                  {row.label}
                </div>
                {isSmallScreen ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: '#999', fontSize: '12px' }}>Manual:</span>
                      <span style={{ color: '#666' }}>{row.manual}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: '#999', fontSize: '12px' }}>Bancos:</span>
                      <span style={{ color: '#666' }}>{row.banco}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: '#999', fontSize: '12px' }}>Mensalli:</span>
                      <span style={{ color: '#25D366', fontWeight: '600' }}>{row.mensallizap}</span>
                    </div>
                  </div>
                ) : (
                  <>
                    <div style={{ textAlign: 'center', color: '#666', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                      {row.icons && <row.icons.manual size={16} />}
                      {row.manual}
                    </div>
                    <div style={{ textAlign: 'center', color: '#666', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                      {row.icons && <row.icons.banco size={16} />}
                      {row.banco}
                    </div>
                    <div style={{ textAlign: 'center', color: '#25D366', fontWeight: '600', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                      {row.icons && <row.icons.mensallizap size={16} />}
                      {row.mensallizap}
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features Detalhadas */}
      <section style={{
        padding: isSmallScreen ? '60px 24px' : '100px 24px',
        backgroundColor: '#fafafa'
      }}>
        <div style={{ maxWidth: '1000px', margin: '0 auto' }}>
          {/* Feature 1 - Automação WhatsApp */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: isSmallScreen ? '1fr' : '1fr 1fr',
            gap: '48px',
            alignItems: 'center',
            marginBottom: '80px'
          }}>
            <div>
              <div style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                backgroundColor: '#dcfce7',
                color: '#16a34a',
                padding: '6px 12px',
                borderRadius: '100px',
                fontSize: '12px',
                fontWeight: '600',
                marginBottom: '16px'
              }}>
                <FaWhatsapp size={14} />
                Automação Inteligente
              </div>
              <h3 style={{
                fontSize: isSmallScreen ? '24px' : '32px',
                fontWeight: '800',
                marginBottom: '16px',
                color: '#1a1a1a',
                lineHeight: '1.2'
              }}>
                Configure lembretes automáticos e esqueça a inadimplência
              </h3>
              <p style={{
                fontSize: '16px',
                color: '#666',
                lineHeight: '1.7',
                marginBottom: '24px'
              }}>
               O sistema envia automaticamente via WhatsApp - o canal que eles já usam todo dia. Sem apps novos, sem emails ignorados.
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: '#444', fontSize: '15px' }}>
                  <MdCheckCircle size={20} style={{ color: '#25D366' }} />
                  Taxa de abertura de 98% (vs. 20% do email)
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: '#444', fontSize: '15px' }}>
                  <MdCheckCircle size={20} style={{ color: '#25D366' }} />
                  Resposta em minutos, não dias
                </div>
              </div>
            </div>
            <div style={{
              borderRadius: '16px',
              overflow: 'hidden',
              boxShadow: '0 4px 20px rgba(0,0,0,0.1)',
              order: isSmallScreen ? -1 : 0
            }}>
              <img
                src="/fila-whatsapp.png"
                alt="Fila de WhatsApp com lembretes automáticos"
                width="900"
                height="380"
                loading="lazy"
                style={{ width: '100%', height: 'auto', display: 'block', aspectRatio: '900 / 380' }}
              />
            </div>
          </div>

          {/* Feature 2 - Dashboard */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: isSmallScreen ? '1fr' : '1fr 1fr',
            gap: '48px',
            alignItems: 'center',
            marginBottom: '80px'
          }}>
            <div style={{
              borderRadius: '16px',
              overflow: 'hidden',
              boxShadow: '0 4px 20px rgba(0,0,0,0.1)'
            }}>
              <img
                src="/mensalidades.png"
                alt="Dashboard de mensalidades e pagamentos"
                width="900"
                height="450"
                loading="lazy"
                style={{ width: '100%', height: 'auto', display: 'block', aspectRatio: '900 / 450' }}
              />
            </div>
            <div>
              <div style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                backgroundColor: '#dbeafe',
                color: '#2563eb',
                padding: '6px 12px',
                borderRadius: '100px',
                fontSize: '12px',
                fontWeight: '600',
                marginBottom: '16px'
              }}>
                <MdShowChart size={14} />
                Dashboard em Tempo Real
              </div>
              <h3 style={{
                fontSize: isSmallScreen ? '24px' : '32px',
                fontWeight: '800',
                marginBottom: '16px',
                color: '#1a1a1a',
                lineHeight: '1.2'
              }}>
                Veja quem está devendo (e por quanto tempo) em segundos
              </h3>
              <p style={{
                fontSize: '16px',
                color: '#666',
                lineHeight: '1.7',
                marginBottom: '24px'
              }}>
                Acabou a bagunça de planilhas. Dashboard visual mostra inadimplência por período, histórico de cada cliente e tendências. Você sabe exatamente a saúde financeira do seu negócio.
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: '#444', fontSize: '15px' }}>
                  <MdTimeline size={20} style={{ color: '#2563eb' }} />
                  Métricas atualizadas em tempo real
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: '#444', fontSize: '15px' }}>
                  <MdTrendingUp size={20} style={{ color: '#2563eb' }} />
                  Identifique padrões antes de virar bola de neve
                </div>
              </div>
            </div>
          </div>

          {/* Feature 3 - Templates */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: isSmallScreen ? '1fr' : '1fr 1fr',
            gap: '48px',
            alignItems: 'center'
          }}>
            <div>
              <div style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                backgroundColor: '#fef3c7',
                color: '#d97706',
                padding: '6px 12px',
                borderRadius: '100px',
                fontSize: '12px',
                fontWeight: '600',
                marginBottom: '16px'
              }}>
                <MdMessage size={14} />
                Templates Personalizáveis
              </div>
              <h3 style={{
                fontSize: isSmallScreen ? '24px' : '32px',
                fontWeight: '800',
                marginBottom: '16px',
                color: '#1a1a1a',
                lineHeight: '1.2'
              }}>
                Mensagens automáticas, mas que parecem feitas por você
              </h3>
              <p style={{
                fontSize: '16px',
                color: '#666',
                lineHeight: '1.7',
                marginBottom: '24px'
              }}>
                Personalize o tom das mensagens para combinar com seu negócio. Seja formal ou amigável, use emojis ou não - a automação se adapta ao seu estilo. Seus clientes nunca vão sentir que estão falando com um robô.
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: '#444', fontSize: '15px' }}>
                  <MdCode size={20} style={{ color: '#d97706' }} />
                  Variáveis dinâmicas (nome, valor, data)
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: '#444', fontSize: '15px' }}>
                  <MdDescription size={20} style={{ color: '#d97706' }} />
                  3 templates prontos + crie os seus
                </div>
              </div>
            </div>
            <div style={{
              borderRadius: '16px',
              overflow: 'hidden',
              boxShadow: '0 4px 20px rgba(0,0,0,0.1)',
              order: isSmallScreen ? -1 : 0
            }}>
              <img
                src="/templates.png"
                alt="Editor de templates de mensagens"
                width="900"
                height="500"
                loading="lazy"
                style={{ width: '100%', height: 'auto', display: 'block', aspectRatio: '900 / 500' }}
              />
            </div>
          </div>
        </div>
      </section>

      {/* Como Funciona */}
      <section style={{
        padding: isSmallScreen ? '60px 24px' : '100px 24px',
        backgroundColor: 'white'
      }}>
        <div style={{ maxWidth: '900px', margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: '60px' }}>
            <h2 style={{
              fontSize: isSmallScreen ? '28px' : '40px',
              fontWeight: '800',
              marginBottom: '16px',
              letterSpacing: '-1px',
              color: '#1a1a1a'
            }}>
              3 passos para automatizar suas cobranças
            </h2>
            <p style={{ fontSize: '17px', color: '#666' }}>
              Configure uma vez e deixe o sistema trabalhar por você
            </p>
          </div>

          <div style={{
            display: 'grid',
            gridTemplateColumns: isSmallScreen ? '1fr' : 'repeat(3, 1fr)',
            gap: '40px'
          }}>
            {comoFunciona.map((passo, index) => (
              <div key={index} style={{ textAlign: 'center' }}>
                <div style={{
                  width: '64px',
                  height: '64px',
                  backgroundColor: '#1a1a1a',
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  margin: '0 auto 20px',
                  color: 'white',
                  fontSize: '20px',
                  fontWeight: '700'
                }}>
                  {passo.numero}
                </div>
                <h3 style={{
                  fontSize: '18px',
                  fontWeight: '700',
                  marginBottom: '10px',
                  color: '#1a1a1a'
                }}>
                  {passo.titulo}
                </h3>
                <p style={{
                  color: '#666',
                  lineHeight: '1.6',
                  fontSize: '15px'
                }}>
                  {passo.descricao}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section id="precos" style={{
        padding: isSmallScreen ? '60px 24px' : '100px 24px',
        backgroundColor: 'white'
      }}>
        <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: '60px' }}>
            <h2 style={{
              fontSize: isSmallScreen ? '28px' : '40px',
              fontWeight: '800',
              marginBottom: '16px',
              letterSpacing: '-1px',
              color: '#1a1a1a'
            }}>
              Escolha seu plano
            </h2>
            <p style={{ fontSize: '17px', color: '#666' }}>
              Comece a automatizar suas cobranças hoje mesmo
            </p>
          </div>

          <div style={{
            display: 'grid',
            gridTemplateColumns: isSmallScreen ? '1fr' : 'repeat(3, 1fr)',
            gap: '24px'
          }}>
            {/* Plano Starter */}
            <div style={{
              backgroundColor: '#fafafa',
              padding: '32px',
              borderRadius: '16px',
              border: '1px solid #eee'
            }}>
              <p style={{
                fontSize: '12px',
                fontWeight: '600',
                color: '#888',
                marginBottom: '4px',
                textTransform: 'uppercase',
                letterSpacing: '0.5px'
              }}>
                Ideal para começar
              </p>
              <h3 style={{
                fontSize: '20px',
                fontWeight: '700',
                color: '#1a1a1a',
                marginBottom: '16px'
              }}>
                Starter
              </h3>
              <div style={{ marginBottom: '24px' }}>
                <span style={{ fontSize: '42px', fontWeight: '800', color: '#1a1a1a' }}>R$49</span>
                <span style={{ fontSize: '16px', color: '#999' }}>/mês</span>
              </div>
              <ul style={{ listStyle: 'none', padding: 0, marginBottom: '32px' }}>
                {[
                  'Até 50 clientes ativos',
                  '200 mensagens/mês',
                  'Mensagem automática no vencimento',
                  '1 template de mensagem personalizado',
                  'Automação via WhatsApp',
                  'Dashboard básico'
                ].map((item, i) => (
                  <li key={i} style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '10px',
                    marginBottom: '12px',
                    fontSize: '14px',
                    color: '#444'
                  }}>
                    <MdCheck size={18} style={{ color: '#16a34a', flexShrink: 0, marginTop: '2px' }} />
                    {item}
                  </li>
                ))}
              </ul>
              <button
                onClick={() => navigate('/signup')}
                style={{
                  width: '100%',
                  padding: '14px',
                  backgroundColor: 'transparent',
                  color: '#1a1a1a',
                  border: '1px solid #1a1a1a',
                  borderRadius: '10px',
                  fontSize: '15px',
                  fontWeight: '600',
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
                onMouseOver={(e) => {
                  e.currentTarget.style.backgroundColor = '#1a1a1a'
                  e.currentTarget.style.color = 'white'
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.backgroundColor = 'transparent'
                  e.currentTarget.style.color = '#1a1a1a'
                }}
              >
                Começar no Starter
              </button>
            </div>

            {/* Plano Pro */}
            <div style={{
              backgroundColor: '#25D366',
              padding: '32px',
              borderRadius: '16px',
              color: 'white',
              position: 'relative',
              transform: isSmallScreen ? 'none' : 'scale(1.05)',
              boxShadow: '0 8px 32px rgba(37,211,102,0.3)'
            }}>
              <div style={{
                position: 'absolute',
                top: '-12px',
                left: '50%',
                transform: 'translateX(-50%)',
                backgroundColor: '#1a1a1a',
                color: 'white',
                padding: '6px 16px',
                borderRadius: '100px',
                fontSize: '12px',
                fontWeight: '600'
              }}>
                Mais popular
              </div>
              <p style={{
                fontSize: '12px',
                fontWeight: '600',
                color: 'rgba(255,255,255,0.7)',
                marginBottom: '4px',
                textTransform: 'uppercase',
                letterSpacing: '0.5px'
              }}>
                Para negócios em crescimento
              </p>
              <h3 style={{
                fontSize: '20px',
                fontWeight: '700',
                color: 'white',
                marginBottom: '16px'
              }}>
                Pro
              </h3>
              <div style={{ marginBottom: '24px' }}>
                <span style={{ fontSize: '42px', fontWeight: '800' }}>R$99</span>
                <span style={{ fontSize: '16px', color: 'rgba(255,255,255,0.7)' }}>/mês</span>
              </div>
              <ul style={{ listStyle: 'none', padding: 0, marginBottom: '32px' }}>
                {[
                  'Até 150 clientes ativos',
                  '600 mensagens/mês',
                  '3 templates personalizados',
                  'Regras de cobrança (3 dias, no vencimento e 3 dias depois)',
                  'Dashboard completo com gráficos',
                  'Suporte via WhatsApp',
                  'Aging Report (relatório de atrasos)'
                ].map((item, i) => (
                  <li key={i} style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '10px',
                    marginBottom: '12px',
                    fontSize: '14px',
                    color: 'rgba(255,255,255,0.95)'
                  }}>
                    <MdCheck size={18} style={{ color: 'white', flexShrink: 0, marginTop: '2px' }} />
                    {item}
                  </li>
                ))}
              </ul>
              <button
                onClick={() => navigate('/signup')}
                style={{
                  width: '100%',
                  padding: '14px',
                  backgroundColor: 'white',
                  color: '#25D366',
                  border: 'none',
                  borderRadius: '10px',
                  fontSize: '15px',
                  fontWeight: '600',
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
                onMouseOver={(e) => {
                  e.target.style.opacity = '0.9'
                }}
                onMouseOut={(e) => {
                  e.target.style.opacity = '1'
                }}
              >
                Escolher mais popular
              </button>
              <p style={{
                marginTop: '16px',
                fontSize: '13px',
                color: 'rgba(255,255,255,0.8)',
                textAlign: 'center'
              }}>
                Economize R$ 150/mês vs. sistemas tradicionais
              </p>
            </div>

            {/* Plano Premium */}
            <div style={{
              backgroundColor: '#fafafa',
              padding: '32px',
              borderRadius: '16px',
              border: '1px solid #eee'
            }}>
              <p style={{
                fontSize: '12px',
                fontWeight: '600',
                color: '#888',
                marginBottom: '4px',
                textTransform: 'uppercase',
                letterSpacing: '0.5px'
              }}>
                Gestão profissional
              </p>
              <h3 style={{
                fontSize: '20px',
                fontWeight: '700',
                color: '#1a1a1a',
                marginBottom: '16px'
              }}>
                Premium
              </h3>
              <div style={{ marginBottom: '24px' }}>
                <span style={{ fontSize: '42px', fontWeight: '800', color: '#1a1a1a' }}>R$149</span>
                <span style={{ fontSize: '16px', color: '#999' }}>/mês</span>
              </div>
              <ul style={{ listStyle: 'none', padding: 0, marginBottom: '32px' }}>
                {[
                  'Até 500 clientes ativos',
                  '3.000 mensagens/mês',
                  'Tudo do plano Pro',
                  'Templates ilimitados',
                  'Consultoria inicial (1h)',
                  'Suporte prioritário via WhatsApp',
                  'Acesso antecipado a novas features',
                ].map((item, i) => (
                  <li key={i} style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '10px',
                    marginBottom: '12px',
                    fontSize: '14px',
                    color: '#444'
                  }}>
                    <MdCheck size={18} style={{ color: '#16a34a', flexShrink: 0, marginTop: '2px' }} />
                    {item}
                  </li>
                ))}
              </ul>
              <button
                onClick={() => navigate('/signup')}
                style={{
                  width: '100%',
                  padding: '14px',
                  backgroundColor: 'transparent',
                  color: '#1a1a1a',
                  border: '1px solid #1a1a1a',
                  borderRadius: '10px',
                  fontSize: '15px',
                  fontWeight: '600',
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
                onMouseOver={(e) => {
                  e.currentTarget.style.backgroundColor = '#1a1a1a'
                  e.currentTarget.style.color = 'white'
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.backgroundColor = 'transparent'
                  e.currentTarget.style.color = '#1a1a1a'
                }}
              >
                Ativar Premium
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Depoimentos Section */}
      <section style={{
        padding: isSmallScreen ? '60px 24px' : '100px 24px',
        backgroundColor: '#fafafa'
      }}>
        <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: '48px' }}>
            <h2 style={{
              fontSize: isSmallScreen ? '28px' : '40px',
              fontWeight: '800',
              marginBottom: '16px',
              letterSpacing: '-1px',
              color: '#1a1a1a'
            }}>
              O que nossos clientes dizem
            </h2>
          </div>

          <div style={{ position: 'relative' }}>
            {/* Botão anterior */}
            {!isSmallScreen && (
              <button
                onClick={() => setDepoimentoIndex(prev => prev === 0 ? Math.ceil(depoimentos.length / 3) - 1 : prev - 1)}
                style={{
                  position: 'absolute',
                  left: '-20px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  width: '40px',
                  height: '40px',
                  borderRadius: '50%',
                  backgroundColor: 'white',
                  border: '1px solid #eee',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
                  zIndex: 10
                }}
              >
                <MdChevronLeft size={24} style={{ color: '#333' }} />
              </button>
            )}

            <div style={{
              display: 'grid',
              gridTemplateColumns: isSmallScreen ? '1fr' : 'repeat(3, 1fr)',
              gap: '24px'
            }}>
              {depoimentos.slice(
                isSmallScreen ? depoimentoIndex : depoimentoIndex * 3,
                isSmallScreen ? depoimentoIndex + 1 : depoimentoIndex * 3 + 3
              ).map((dep, index) => (
                <div key={index} style={{
                  backgroundColor: 'white',
                  borderRadius: '16px',
                  padding: '28px',
                  boxShadow: '0 2px 12px rgba(0,0,0,0.06)'
                }}>
                  <div style={{ display: 'flex', gap: '4px', marginBottom: '16px' }}>
                    {[1, 2, 3, 4, 5].map((star) => (
                      <MdStar key={star} size={18} style={{ color: '#FFD700' }} />
                    ))}
                  </div>
                  <p style={{
                    fontSize: '15px',
                    color: '#444',
                    lineHeight: '1.6',
                    marginBottom: '20px'
                  }}>
                    "{dep.texto}"
                  </p>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <img
                      src={dep.foto}
                      alt={dep.nome}
                      loading="lazy"
                      style={{
                        width: '48px',
                        height: '48px',
                        borderRadius: '50%',
                        objectFit: 'cover'
                      }}
                    />
                    <div>
                      <p style={{ fontWeight: '600', color: '#1a1a1a', margin: 0, fontSize: '14px' }}>{dep.nome}</p>
                      <p style={{ fontSize: '12px', color: '#666', margin: 0 }}>{dep.cargo}, {dep.empresa}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Botão próximo */}
            {!isSmallScreen && (
              <button
                onClick={() => setDepoimentoIndex(prev => prev === Math.ceil(depoimentos.length / 3) - 1 ? 0 : prev + 1)}
                style={{
                  position: 'absolute',
                  right: '-20px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  width: '40px',
                  height: '40px',
                  borderRadius: '50%',
                  backgroundColor: 'white',
                  border: '1px solid #eee',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
                  zIndex: 10
                }}
              >
                <MdChevronRight size={24} style={{ color: '#333' }} />
              </button>
            )}
          </div>

          {/* Indicadores do carrossel */}
          <div style={{
            display: 'flex',
            justifyContent: 'center',
            gap: '8px',
            marginTop: '32px'
          }}>
            {Array.from({ length: isSmallScreen ? depoimentos.length : Math.ceil(depoimentos.length / 3) }).map((_, i) => (
              <button
                key={i}
                onClick={() => setDepoimentoIndex(i)}
                style={{
                  width: depoimentoIndex === i ? '24px' : '8px',
                  height: '8px',
                  borderRadius: '4px',
                  backgroundColor: depoimentoIndex === i ? '#25D366' : '#ddd',
                  border: 'none',
                  cursor: 'pointer',
                  transition: 'all 0.3s ease'
                }}
              />
            ))}
          </div>
        </div>
      </section>

      {/* Target Customers */}
      <section style={{
        padding: isSmallScreen ? '60px 24px' : '100px 24px',
        backgroundColor: 'white'
      }}>
        <div style={{ maxWidth: '1000px', margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: '48px' }}>
            <h2 style={{
              fontSize: isSmallScreen ? '28px' : '40px',
              fontWeight: '800',
              marginBottom: '16px',
              letterSpacing: '-1px',
              color: '#1a1a1a'
            }}>
              Para quem é o Mensalli?
            </h2>
            <p style={{ fontSize: '17px', color: '#666' }}>
              Ideal para qualquer negócio que cobra mensalidades
            </p>
          </div>

          <div style={{
            display: 'grid',
            gridTemplateColumns: isSmallScreen ? '1fr' : 'repeat(2, 1fr)',
            gap: '20px'
          }}>
            {[
              {
                icon: MdMusicNote,
                titulo: 'Escolas de Música/Idiomas',
                descricao: 'Automatize lembretes para dezenas de alunos. Pais recebem mensagens 3 dias antes, você não perde tempo cobrando um por um.'
              },
              {
                icon: MdFitnessCenter,
                titulo: 'Academias & Box de CrossFit',
                descricao: 'Chega de constrangimento ao cobrar aluno. Mensalidades automáticas via WhatsApp preservam o relacionamento e garantem pagamento.'
              },
              {
                icon: MdSelfImprovement,
                titulo: 'Studios de Pilates & Yoga',
                descricao: 'Seus alunos esquecem de pagar e você fica sem jeito de cobrar? Lembretes automáticos fazem isso por você, sem desconforto.'
              },
              {
                icon: MdPalette,
                titulo: 'Estúdios & Consultórios',
                descricao: 'Qualquer negócio com mensalidades pode usar. Se cobra todo mês, Mensalli é pra você.'
              }
            ].map((perfil, i) => (
              <div key={i} style={{
                backgroundColor: '#fafafa',
                padding: '28px',
                borderRadius: '16px',
                display: 'flex',
                gap: '16px',
                alignItems: 'flex-start',
                border: '1px solid #eee',
                transition: 'all 0.2s'
              }}
              onMouseOver={(e) => {
                e.currentTarget.style.borderColor = '#25D366'
                e.currentTarget.style.boxShadow = '0 4px 20px rgba(37,211,102,0.1)'
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.borderColor = '#eee'
                e.currentTarget.style.boxShadow = 'none'
              }}
              >
                <div style={{
                  width: '48px',
                  height: '48px',
                  backgroundColor: '#dcfce7',
                  borderRadius: '12px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0
                }}>
                  <perfil.icon size={24} style={{ color: '#25D366' }} />
                </div>
                <div>
                  <h3 style={{
                    fontSize: '17px',
                    fontWeight: '700',
                    marginBottom: '8px',
                    color: '#1a1a1a'
                  }}>
                    {perfil.titulo}
                  </h3>
                  <p style={{
                    color: '#666',
                    lineHeight: '1.6',
                    fontSize: '14px',
                    margin: 0
                  }}>
                    {perfil.descricao}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section style={{
        padding: isSmallScreen ? '60px 24px' : '100px 24px',
        backgroundColor: 'white'
      }}>
        <div style={{ maxWidth: '600px', margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: '48px' }}>
            <h2 style={{
              fontSize: isSmallScreen ? '28px' : '40px',
              fontWeight: '800',
              marginBottom: '16px',
              letterSpacing: '-1px',
              color: '#1a1a1a'
            }}>
              Dúvidas frequentes
            </h2>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {faqs.map((faq, index) => (
              <div
                key={index}
                style={{
                  backgroundColor: '#fafafa',
                  borderRadius: '12px',
                  overflow: 'hidden',
                  cursor: 'pointer'
                }}
                onClick={() => setFaqAberto(faqAberto === index ? null : index)}
              >
                <div style={{
                  padding: '20px 24px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}>
                  <span style={{
                    fontSize: '16px',
                    fontWeight: '600',
                    color: '#1a1a1a'
                  }}>
                    {faq.pergunta}
                  </span>
{faqAberto === index
                    ? <MdRemove size={20} style={{ color: '#666', flexShrink: 0 }} />
                    : <MdAdd size={20} style={{ color: '#666', flexShrink: 0 }} />
                  }
                </div>
                {faqAberto === index && (
                  <div style={{
                    padding: '0 24px 20px',
                    color: '#666',
                    fontSize: '15px',
                    lineHeight: '1.6'
                  }}>
                    {faq.resposta}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Final */}
      <section style={{
        padding: isSmallScreen ? '60px 24px' : '100px 24px',
        backgroundColor: '#1a1a1a',
        textAlign: 'center'
      }}>
        <div style={{ maxWidth: '600px', margin: '0 auto' }}>
          <p style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            backgroundColor: 'rgba(37,211,102,0.15)',
            color: '#25D366',
            padding: '8px 16px',
            borderRadius: '100px',
            fontSize: '14px',
            fontWeight: '600',
            marginBottom: '24px'
          }}>
            <MdLocalFireDepartment size={18} />
            234 negócios começaram esta semana
          </p>
          <h2 style={{
            fontSize: isSmallScreen ? '28px' : '40px',
            fontWeight: '800',
            marginBottom: '20px',
            color: 'white',
            letterSpacing: '-1px'
          }}>
            Pronto para automatizar suas cobranças?
          </h2>
          <p style={{
            fontSize: '17px',
            color: 'rgba(255,255,255,0.7)',
            marginBottom: '32px',
            lineHeight: '1.6'
          }}>
            Comece hoje mesmo. Sem compromisso. Configure sua primeira cobrança automática em minutos.
          </p>
          <button
            onClick={() => navigate('/signup')}
            style={{
              padding: '16px 40px',
              backgroundColor: 'white',
              color: '#1a1a1a',
              border: 'none',
              borderRadius: '12px',
              fontSize: '16px',
              fontWeight: '600',
              cursor: 'pointer',
              transition: 'all 0.2s',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px'
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.transform = 'translateY(-2px)'
              e.currentTarget.style.boxShadow = '0 8px 24px rgba(255,255,255,0.2)'
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.transform = 'translateY(0)'
              e.currentTarget.style.boxShadow = 'none'
            }}
          >
            Começar teste grátis
            <MdArrowForward size={20} />
          </button>
          <div style={{
            marginTop: '24px',
            display: 'flex',
            justifyContent: 'center',
            gap: '24px',
            flexWrap: 'wrap',
            fontSize: '14px',
            color: 'rgba(255,255,255,0.6)'
          }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <MdCheck size={16} style={{ color: '#25D366' }} />
              Sem cartão de crédito
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <MdCheck size={16} style={{ color: '#25D366' }} />
              Cancele quando quiser
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <MdCheck size={16} style={{ color: '#25D366' }} />
              Suporte em português
            </span>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer style={{
        backgroundColor: '#111',
        color: 'rgba(255,255,255,0.6)',
        padding: '40px 24px',
        textAlign: 'center'
      }}>
        <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
          <a href="https://www.mensalli.com.br" style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: '24px',
            textDecoration: 'none'
          }}>
            <img
              src="/Logo-Full.png"
              alt="Mensalli"
              style={{ height: '36px', width: 'auto', filter: 'brightness(0) invert(1)', cursor: 'pointer' }}
            />
          </a>

          <div style={{
            display: 'flex',
            justifyContent: 'center',
            gap: '24px',
            marginBottom: '24px',
            flexWrap: 'wrap',
            fontSize: '14px'
          }}>
            <a href="#" style={{ color: 'rgba(255,255,255,0.6)', textDecoration: 'none' }}>
              Termos de Uso
            </a>
            <a href="#" style={{ color: 'rgba(255,255,255,0.6)', textDecoration: 'none' }}>
              Privacidade
            </a>
            <a href="#" style={{ color: 'rgba(255,255,255,0.6)', textDecoration: 'none' }}>
              Contato
            </a>
          </div>

          <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.4)' }}>
            © 2026 Mensalli. Todos os direitos reservados.
          </p>
        </div>
      </footer>
    </div>
  )
}
