import { useNavigate } from 'react-router-dom'
import {
  MdCheckCircle, MdCheck, MdArrowForward, MdStar,
  MdChevronLeft, MdChevronRight, MdShowChart, MdTimeline,
  MdTrendingUp, MdMessage, MdCode, MdDescription,
  MdMusicNote, MdFitnessCenter, MdSelfImprovement, MdPalette,
  MdAdd, MdRemove, MdLocalFireDepartment, MdClose, MdWarning
} from 'react-icons/md'
import { FaWhatsapp } from 'react-icons/fa'
import { useState, useMemo } from 'react'
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
      nome: 'Juliana M.',
      empresa: 'Studio de Pilates',
      cargo: 'Proprietária',
      texto: 'Gastava horas toda semana mandando mensagem pra cobrar. Agora o sistema faz tudo sozinho e minha inadimplência caiu pela metade.',
      foto: null
    },
    {
      nome: 'Rafael S.',
      empresa: 'Academia de Natação',
      cargo: 'Dono',
      texto: 'Com mais de 50 alunos ficava impossível controlar quem pagou. O dashboard resolve isso em segundos.',
      foto: null
    },
    {
      nome: 'Cláudia R.',
      empresa: 'Escola de Música',
      cargo: 'Diretora',
      texto: 'A mensagem vai pelo meu WhatsApp, então parece que fui eu que mandei. Meus alunos respondem na hora.',
      foto: null
    },
    {
      nome: 'Marcos A.',
      empresa: 'Personal Trainer',
      cargo: 'Autônomo',
      texto: 'O plano se paga no primeiro mês. Antes eu esquecia de cobrar e perdia dinheiro sem nem perceber.',
      foto: null
    },
    {
      nome: 'Tatiane L.',
      empresa: 'Studio de Yoga',
      cargo: 'Fundadora',
      texto: 'Simples de usar e o suporte responde rápido. Montei tudo em uma tarde e já saiu cobrando sozinho.',
      foto: null
    },
    {
      nome: 'Diego F.',
      empresa: 'Escola de Lutas',
      cargo: 'Professor',
      texto: 'Cobrar aluno era a parte que eu mais odiava. Agora não preciso mais pensar nisso, o sistema resolve.',
      foto: null
    }
  ]

  const [depoimentoIndex, setDepoimentoIndex] = useState(0)

  // Calculadora de ROI
  const [roiClientes, setRoiClientes] = useState('50')
  const [roiValorMedio, setRoiValorMedio] = useState('150')
  const [roiInadimplencia, setRoiInadimplencia] = useState('30')
  const roiPerdaMensal = useMemo(() => (Number(roiClientes) || 0) * (Number(roiValorMedio) || 0) * ((Number(roiInadimplencia) || 0) / 100), [roiClientes, roiValorMedio, roiInadimplencia])
  const roiRecuperacao = useMemo(() => roiPerdaMensal * 0.7, [roiPerdaMensal])

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
    },
    {
      pergunta: 'Quanto custa cada mensagem enviada?',
      resposta: 'Depende do plano: de R$0,05 (Premium) a R$0,25 (Starter) por mensagem. Muito menos que o custo do seu tempo ligando ou enviando mensagens manualmente.'
    },
    {
      pergunta: 'Existe algum sistema mais barato?',
      resposta: 'Existem disparadores de mensagem por R$29/mês, mas enviam apenas 50 mensagens e não têm gestão financeira, dashboard, aging report ou automação inteligente. O Mensalli é um sistema completo de gestão de cobranças, não apenas um disparador de mensagens.'
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
            <FaWhatsapp size={16} />
            98% de taxa de abertura — seu cliente vai ler
          </div>

          <h1 style={{
            fontSize: isSmallScreen ? '32px' : '52px',
            fontWeight: '800',
            lineHeight: '1.1',
            marginBottom: '24px',
            letterSpacing: '-1.5px',
            color: '#1a1a1a'
          }}>
            Seus alunos esquecem de pagar?
            <br />
            <span style={{
              background: 'linear-gradient(135deg, #25D366 0%, #128C7E 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text'
            }}>
              O WhatsApp deles não.
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
            O Mensalli envia cobranças automáticas pelo WhatsApp dos seus clientes — com seu tom de voz, no horário certo. Sem constrangimento, sem planilha, sem esquecimento.
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
                padding: '16px 36px',
                backgroundColor: '#25D366',
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
                justifyContent: 'center',
                boxShadow: '0 4px 14px rgba(37, 211, 102, 0.3)'
              }}
              onMouseOver={(e) => {
                e.currentTarget.style.transform = 'translateY(-2px)'
                e.currentTarget.style.boxShadow = '0 8px 24px rgba(37, 211, 102, 0.4)'
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.transform = 'translateY(0)'
                e.currentTarget.style.boxShadow = '0 4px 14px rgba(37, 211, 102, 0.3)'
              }}
            >
              Testar grátis por 3 dias
              <MdArrowForward size={20} />
            </button>
            {!isSmallScreen && (
              <button
                onClick={() => document.getElementById('precos').scrollIntoView({ behavior: 'smooth' })}
                style={{
                  padding: '16px 28px',
                  backgroundColor: 'transparent',
                  color: '#666',
                  border: '1px solid #ddd',
                  borderRadius: '12px',
                  fontSize: '16px',
                  fontWeight: '500',
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
                onMouseOver={(e) => { e.currentTarget.style.borderColor = '#999'; e.currentTarget.style.color = '#333' }}
                onMouseOut={(e) => { e.currentTarget.style.borderColor = '#ddd'; e.currentTarget.style.color = '#666' }}
              >
                Ver preços
              </button>
            )}
          </div>

          <p style={{
            marginTop: '20px',
            fontSize: '13px',
            color: '#999'
          }}>
            Sem cartão de crédito • Cancele quando quiser
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
            Números que falam por si
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
                R$ 847 mil
              </p>
              <p style={{ fontSize: '14px', color: '#666', margin: 0 }}>
                Já ajudamos a cobrar em mensalidades
              </p>
            </div>
            <div>
              <p style={{ fontSize: isSmallScreen ? '36px' : '48px', fontWeight: '800', color: '#25D366', margin: '0 0 8px' }}>
                4,7 min
              </p>
              <p style={{ fontSize: '14px', color: '#666', margin: 0 }}>
                Tempo médio de resposta dos clientes
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
              { label: 'Custo/mensagem', manual: 'Seu tempo', banco: 'R$1-2/boleto', mensallizap: 'R$0,05 a R$0,25', icons: { manual: MdClose, banco: MdWarning, mensallizap: MdCheck } },
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

      {/* Calculadora de ROI */}
      <section style={{
        padding: isSmallScreen ? '60px 24px' : '100px 24px',
        backgroundColor: '#fafafa',
        borderTop: '1px solid #eee',
        borderBottom: '1px solid #eee'
      }}>
        <div style={{ maxWidth: '700px', margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: '40px' }}>
            <h2 style={{
              fontSize: isSmallScreen ? '28px' : '40px',
              fontWeight: '800',
              marginBottom: '16px',
              letterSpacing: '-1px',
              color: '#1a1a1a'
            }}>
              Quanto você perde com inadimplência?
            </h2>
            <p style={{ fontSize: '16px', color: '#666', margin: 0 }}>
              Descubra em 10 segundos quanto dinheiro está ficando para trás
            </p>
          </div>

          <div style={{
            backgroundColor: 'white',
            borderRadius: '16px',
            padding: isSmallScreen ? '24px' : '40px',
            boxShadow: '0 2px 12px rgba(0,0,0,0.06)',
            border: '1px solid #eee'
          }}>
            {/* Inputs */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', marginBottom: '32px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', color: '#344848', marginBottom: '8px' }}>
                  Quantos clientes você tem?
                </label>
                <input
                  type="number"
                  value={roiClientes}
                  onChange={(e) => setRoiClientes(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '12px 16px',
                    fontSize: '16px',
                    border: '2px solid #e0e0e0',
                    borderRadius: '10px',
                    outline: 'none',
                    boxSizing: 'border-box',
                    transition: 'border-color 0.2s'
                  }}
                  onFocus={(e) => e.target.style.borderColor = '#25D366'}
                  onBlur={(e) => e.target.style.borderColor = '#e0e0e0'}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', color: '#344848', marginBottom: '8px' }}>
                  Valor médio da mensalidade (R$)
                </label>
                <input
                  type="number"
                  value={roiValorMedio}
                  onChange={(e) => setRoiValorMedio(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '12px 16px',
                    fontSize: '16px',
                    border: '2px solid #e0e0e0',
                    borderRadius: '10px',
                    outline: 'none',
                    boxSizing: 'border-box',
                    transition: 'border-color 0.2s'
                  }}
                  onFocus={(e) => e.target.style.borderColor = '#25D366'}
                  onBlur={(e) => e.target.style.borderColor = '#e0e0e0'}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', color: '#344848', marginBottom: '8px' }}>
                  % de inadimplência atual
                </label>
                <input
                  type="number"
                  value={roiInadimplencia}
                  onChange={(e) => setRoiInadimplencia(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '12px 16px',
                    fontSize: '16px',
                    border: '2px solid #e0e0e0',
                    borderRadius: '10px',
                    outline: 'none',
                    boxSizing: 'border-box',
                    transition: 'border-color 0.2s'
                  }}
                  onFocus={(e) => e.target.style.borderColor = '#25D366'}
                  onBlur={(e) => e.target.style.borderColor = '#e0e0e0'}
                />
              </div>
            </div>

            {/* Resultado */}
            <div style={{
              backgroundColor: '#fef2f2',
              borderRadius: '12px',
              padding: '20px 24px',
              marginBottom: '16px',
              border: '1px solid #fecaca'
            }}>
              <p style={{ fontSize: '14px', color: '#991b1b', margin: '0 0 4px', fontWeight: '500' }}>
                Você perde por mês:
              </p>
              <p style={{ fontSize: isSmallScreen ? '28px' : '36px', fontWeight: '800', color: '#dc2626', margin: 0 }}>
                R$ {roiPerdaMensal.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
            </div>

            <div style={{
              backgroundColor: '#f0fdf4',
              borderRadius: '12px',
              padding: '20px 24px',
              marginBottom: '24px',
              border: '1px solid #bbf7d0'
            }}>
              <p style={{ fontSize: '14px', color: '#166534', margin: '0 0 4px', fontWeight: '500' }}>
                Com Mensalli, recupere até 70%:
              </p>
              <p style={{ fontSize: isSmallScreen ? '28px' : '36px', fontWeight: '800', color: '#16a34a', margin: '0 0 8px' }}>
                +R$ {roiRecuperacao.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}/mês
              </p>
              <p style={{ fontSize: '13px', color: '#166534', margin: 0 }}>
                O plano Pro (R$ 99/mês) se paga {roiRecuperacao >= 99 ? `em ${Math.max(1, Math.ceil(99 / (roiRecuperacao / 30)))} dia${Math.ceil(99 / (roiRecuperacao / 30)) > 1 ? 's' : ''}` : 'rapidamente'}.
              </p>
            </div>

            <button
              onClick={() => navigate('/signup')}
              style={{
                width: '100%',
                padding: '16px',
                backgroundColor: '#25D366',
                color: 'white',
                border: 'none',
                borderRadius: '12px',
                fontSize: '16px',
                fontWeight: '600',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '10px',
                transition: 'all 0.2s'
              }}
              onMouseOver={(e) => {
                e.currentTarget.style.transform = 'translateY(-2px)'
                e.currentTarget.style.boxShadow = '0 8px 24px rgba(37,211,102,0.3)'
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.transform = 'translateY(0)'
                e.currentTarget.style.boxShadow = 'none'
              }}
            >
              Começar a recuperar agora
              <MdArrowForward size={20} />
            </button>
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
                <p style={{ fontSize: '12px', color: '#25D366', fontWeight: '600', margin: '8px 0 0' }}>apenas R$0,25 por mensagem</p>
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
                <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.85)', fontWeight: '600', margin: '8px 0 0' }}>apenas R$0,17 por mensagem</p>
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
                <p style={{ fontSize: '12px', color: '#25D366', fontWeight: '600', margin: '8px 0 0' }}>apenas R$0,05 por mensagem</p>
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
                    <div style={{
                      width: '44px',
                      height: '44px',
                      borderRadius: '50%',
                      backgroundColor: '#f0fdf4',
                      color: '#25D366',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '16px',
                      fontWeight: '700',
                      flexShrink: 0
                    }}>
                      {dep.nome.charAt(0)}
                    </div>
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
            Enquanto você lê isso, seus clientes estão esquecendo de pagar
          </h2>
          <p style={{
            fontSize: '17px',
            color: 'rgba(255,255,255,0.7)',
            marginBottom: '32px',
            lineHeight: '1.6'
          }}>
            Cada dia sem automação é dinheiro que você não recebe. Configure em 5 minutos e comece a receber amanhã.
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

      {/* Botão flutuante do WhatsApp */}
      <a
        href="https://wa.me/5562981618862"
        target="_blank"
        rel="noopener noreferrer"
        style={{
          position: 'fixed',
          bottom: isSmallScreen ? '80px' : '20px',
          right: '20px',
          width: '60px',
          height: '60px',
          backgroundColor: '#25d366',
          borderRadius: '50%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '2px 2px 10px rgba(0,0,0,0.3)',
          zIndex: 1000,
          transition: 'transform 0.3s ease, box-shadow 0.3s ease'
        }}
        onMouseEnter={e => {
          e.currentTarget.style.transform = 'scale(1.1)'
          e.currentTarget.style.boxShadow = '2px 2px 15px rgba(0,0,0,0.4)'
        }}
        onMouseLeave={e => {
          e.currentTarget.style.transform = 'scale(1)'
          e.currentTarget.style.boxShadow = '2px 2px 10px rgba(0,0,0,0.3)'
        }}
      >
        <FaWhatsapp size={32} color="white" />
      </a>

      {/* Sticky CTA Mobile */}
      {isSmallScreen && (
        <div style={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          backgroundColor: 'white',
          borderTop: '1px solid #eee',
          padding: '12px 20px',
          zIndex: 999,
          display: 'flex',
          gap: '10px',
          alignItems: 'center',
          boxShadow: '0 -2px 10px rgba(0,0,0,0.06)'
        }}>
          <button
            onClick={() => navigate('/signup')}
            style={{
              flex: 1,
              padding: '14px',
              backgroundColor: '#25D366',
              color: 'white',
              border: 'none',
              borderRadius: '10px',
              fontSize: '15px',
              fontWeight: '600',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px'
            }}
          >
            Testar grátis
            <MdArrowForward size={18} />
          </button>
          <button
            onClick={() => navigate('/login')}
            style={{
              padding: '14px 20px',
              backgroundColor: 'transparent',
              color: '#666',
              border: '1px solid #ddd',
              borderRadius: '10px',
              fontSize: '14px',
              fontWeight: '500',
              cursor: 'pointer'
            }}
          >
            Entrar
          </button>
        </div>
      )}
    </div>
  )
}
