import { Icon } from '@iconify/react'
import { useNavigate } from 'react-router-dom'
import { useState } from 'react'
import useWindowSize from './hooks/useWindowSize'

export default function LandingPage() {
  const navigate = useNavigate()
  const { isMobile, isSmallScreen } = useWindowSize()
  const [faqAberto, setFaqAberto] = useState(null)

  const features = [
    {
      icon: 'mdi:whatsapp',
      titulo: 'WhatsApp Conectado',
      descricao: 'Conecte via QR Code e envie cobranças automáticas direto do seu navegador.',
    },
    {
      icon: 'mdi:robot-outline',
      titulo: 'Automação Inteligente',
      descricao: 'Lembretes automáticos antes do vencimento e para mensalidades atrasadas.',
    },
    {
      icon: 'mdi:chart-timeline-variant',
      titulo: 'Dashboard Completo',
      descricao: 'Visualize receitas, inadimplência e métricas em tempo real.',
    }
  ]

  const comoFunciona = [
    {
      numero: '01',
      titulo: 'Conecte seu WhatsApp',
      descricao: 'Escaneie o QR Code para vincular seu WhatsApp ao sistema.'
    },
    {
      numero: '02',
      titulo: 'Cadastre seus clientes',
      descricao: 'Adicione clientes e configure planos de mensalidade.'
    },
    {
      numero: '03',
      titulo: 'Automatize as cobranças',
      descricao: 'Configure mensagens e deixe o sistema cobrar automaticamente.'
    }
  ]

  const faqs = [
    {
      pergunta: 'O plano gratuito tem alguma limitação?',
      resposta: 'O plano gratuito permite até 100 mensagens por mês, gestão ilimitada de clientes e acesso a todos os recursos básicos. Perfeito para começar!'
    },
    {
      pergunta: 'Como funciona a conexão com WhatsApp?',
      resposta: 'Você escaneia um QR Code, igual ao WhatsApp Web. Não precisa instalar nada no celular, apenas manter o app conectado à internet.'
    },
    {
      pergunta: 'Posso cancelar a qualquer momento?',
      resposta: 'Sim! Você pode cancelar, fazer upgrade ou downgrade quando quiser. Sem multas, sem burocracia.'
    },
    {
      pergunta: 'Meus dados estão seguros?',
      resposta: 'Absolutamente. Usamos criptografia de ponta a ponta e seguimos todas as melhores práticas de segurança. Seus dados são apenas seus.'
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
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{
              width: '36px',
              height: '36px',
              background: 'linear-gradient(135deg, #25D366 0%, #128C7E 100%)',
              borderRadius: '10px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <Icon icon="mdi:whatsapp" width="22" style={{ color: 'white' }} />
            </div>
            <span style={{ fontSize: '20px', fontWeight: '700', color: '#1a1a1a', letterSpacing: '-0.5px' }}>
              MensalliZap
            </span>
          </div>

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
            <Icon icon="mdi:check-circle" width="16" />
            Grátis para começar
          </div>

          <h1 style={{
            fontSize: isSmallScreen ? '36px' : '56px',
            fontWeight: '800',
            lineHeight: '1.1',
            marginBottom: '24px',
            letterSpacing: '-1.5px',
            color: '#1a1a1a'
          }}>
            Suas cobranças
            <br />
            <span style={{
              background: 'linear-gradient(135deg, #25D366 0%, #128C7E 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text'
            }}>
              no piloto automático
            </span>
          </h1>

          <p style={{
            fontSize: isSmallScreen ? '17px' : '20px',
            color: '#666',
            marginBottom: '40px',
            lineHeight: '1.6',
            maxWidth: '600px',
            margin: '0 auto 40px'
          }}>
            Conecte seu WhatsApp e automatize cobranças de mensalidades.
            Menos inadimplência, mais tempo para o que importa.
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
              Começar agora — é grátis
              <Icon icon="mdi:arrow-right" width="20" />
            </button>
          </div>

          <p style={{
            marginTop: '20px',
            fontSize: '13px',
            color: '#999'
          }}>
            Sem cartão de crédito • Setup em 2 minutos
          </p>
        </div>
      </section>

      {/* Features Section */}
      <section style={{
        padding: isSmallScreen ? '60px 24px' : '100px 24px',
        backgroundColor: '#fafafa'
      }}>
        <div style={{ maxWidth: '1000px', margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: '60px' }}>
            <h2 style={{
              fontSize: isSmallScreen ? '28px' : '40px',
              fontWeight: '800',
              marginBottom: '16px',
              letterSpacing: '-1px',
              color: '#1a1a1a'
            }}>
              Tudo que você precisa
            </h2>
            <p style={{ fontSize: '17px', color: '#666', maxWidth: '500px', margin: '0 auto' }}>
              Funcionalidades pensadas para simplificar sua gestão de cobranças
            </p>
          </div>

          <div style={{
            display: 'grid',
            gridTemplateColumns: isSmallScreen ? '1fr' : 'repeat(3, 1fr)',
            gap: '24px'
          }}>
            {features.map((feature, index) => (
              <div
                key={index}
                style={{
                  backgroundColor: 'white',
                  padding: '32px',
                  borderRadius: '16px',
                  border: '1px solid #eee',
                  transition: 'all 0.2s'
                }}
                onMouseOver={(e) => {
                  e.currentTarget.style.borderColor = '#ddd'
                  e.currentTarget.style.boxShadow = '0 4px 20px rgba(0,0,0,0.06)'
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.borderColor = '#eee'
                  e.currentTarget.style.boxShadow = 'none'
                }}
              >
                <div style={{
                  width: '48px',
                  height: '48px',
                  backgroundColor: '#f5f5f5',
                  borderRadius: '12px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: '20px'
                }}>
                  <Icon icon={feature.icon} width="24" style={{ color: '#1a1a1a' }} />
                </div>
                <h3 style={{
                  fontSize: '18px',
                  fontWeight: '700',
                  marginBottom: '10px',
                  color: '#1a1a1a'
                }}>
                  {feature.titulo}
                </h3>
                <p style={{
                  color: '#666',
                  lineHeight: '1.6',
                  fontSize: '15px'
                }}>
                  {feature.descricao}
                </p>
              </div>
            ))}
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
              Como funciona
            </h2>
            <p style={{ fontSize: '17px', color: '#666' }}>
              Três passos simples para automatizar suas cobranças
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
        backgroundColor: '#fafafa'
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
              Preços simples
            </h2>
            <p style={{ fontSize: '17px', color: '#666' }}>
              Comece grátis, faça upgrade quando precisar
            </p>
          </div>

          <div style={{
            display: 'grid',
            gridTemplateColumns: isSmallScreen ? '1fr' : 'repeat(2, 1fr)',
            gap: '24px',
            maxWidth: '700px',
            margin: '0 auto'
          }}>
            {/* Plano Grátis */}
            <div style={{
              backgroundColor: 'white',
              padding: '32px',
              borderRadius: '16px',
              border: '1px solid #eee'
            }}>
              <h3 style={{
                fontSize: '16px',
                fontWeight: '600',
                color: '#666',
                marginBottom: '8px',
                textTransform: 'uppercase',
                letterSpacing: '0.5px'
              }}>
                Grátis
              </h3>
              <div style={{ marginBottom: '24px' }}>
                <span style={{ fontSize: '48px', fontWeight: '800', color: '#1a1a1a' }}>R$0</span>
                <span style={{ fontSize: '16px', color: '#999' }}>/mês</span>
              </div>
              <ul style={{ listStyle: 'none', padding: 0, marginBottom: '32px' }}>
                {['100 mensagens/mês', 'Clientes ilimitados', 'Templates básicos', 'Dashboard completo'].map((item, i) => (
                  <li key={i} style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    marginBottom: '12px',
                    fontSize: '15px',
                    color: '#444'
                  }}>
                    <Icon icon="mdi:check" width="18" style={{ color: '#16a34a' }} />
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
                  color: '#1a1a1a',
                  border: '2px solid #1a1a1a',
                  borderRadius: '10px',
                  fontSize: '15px',
                  fontWeight: '600',
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
                onMouseOver={(e) => {
                  e.target.style.backgroundColor = '#1a1a1a'
                  e.target.style.color = 'white'
                }}
                onMouseOut={(e) => {
                  e.target.style.backgroundColor = 'white'
                  e.target.style.color = '#1a1a1a'
                }}
              >
                Começar grátis
              </button>
            </div>

            {/* Plano Pro */}
            <div style={{
              backgroundColor: '#1a1a1a',
              padding: '32px',
              borderRadius: '16px',
              color: 'white',
              position: 'relative'
            }}>
              <div style={{
                position: 'absolute',
                top: '-12px',
                left: '50%',
                transform: 'translateX(-50%)',
                backgroundColor: '#25D366',
                color: 'white',
                padding: '6px 16px',
                borderRadius: '100px',
                fontSize: '12px',
                fontWeight: '600'
              }}>
                Mais popular
              </div>
              <h3 style={{
                fontSize: '16px',
                fontWeight: '600',
                color: 'rgba(255,255,255,0.7)',
                marginBottom: '8px',
                textTransform: 'uppercase',
                letterSpacing: '0.5px'
              }}>
                Pro
              </h3>
              <div style={{ marginBottom: '24px' }}>
                <span style={{ fontSize: '48px', fontWeight: '800' }}>R$49</span>
                <span style={{ fontSize: '16px', color: 'rgba(255,255,255,0.6)' }}>/mês</span>
              </div>
              <ul style={{ listStyle: 'none', padding: 0, marginBottom: '32px' }}>
                {['Mensagens ilimitadas', 'Automação completa', 'Templates avançados', 'Suporte prioritário', 'Relatórios exportáveis'].map((item, i) => (
                  <li key={i} style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    marginBottom: '12px',
                    fontSize: '15px',
                    color: 'rgba(255,255,255,0.9)'
                  }}>
                    <Icon icon="mdi:check" width="18" style={{ color: '#25D366' }} />
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
                  color: '#1a1a1a',
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
                Começar com Pro
              </button>
            </div>
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
                  <Icon
                    icon={faqAberto === index ? 'mdi:minus' : 'mdi:plus'}
                    width="20"
                    style={{ color: '#666', flexShrink: 0 }}
                  />
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
          <h2 style={{
            fontSize: isSmallScreen ? '28px' : '40px',
            fontWeight: '800',
            marginBottom: '20px',
            color: 'white',
            letterSpacing: '-1px'
          }}>
            Pronto para automatizar?
          </h2>
          <p style={{
            fontSize: '17px',
            color: 'rgba(255,255,255,0.7)',
            marginBottom: '32px',
            lineHeight: '1.6'
          }}>
            Comece hoje mesmo, sem compromisso.
            Sua primeira cobrança automática em minutos.
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
              transition: 'all 0.2s'
            }}
            onMouseOver={(e) => {
              e.target.style.transform = 'translateY(-2px)'
              e.target.style.boxShadow = '0 8px 24px rgba(255,255,255,0.2)'
            }}
            onMouseOut={(e) => {
              e.target.style.transform = 'translateY(0)'
              e.target.style.boxShadow = 'none'
            }}
          >
            Criar conta grátis
          </button>
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
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '10px',
            marginBottom: '24px'
          }}>
            <div style={{
              width: '32px',
              height: '32px',
              background: 'linear-gradient(135deg, #25D366 0%, #128C7E 100%)',
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <Icon icon="mdi:whatsapp" width="18" style={{ color: 'white' }} />
            </div>
            <span style={{ fontSize: '18px', fontWeight: '700', color: 'white' }}>
              MensalliZap
            </span>
          </div>

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
            © 2026 MensalliZap. Todos os direitos reservados.
          </p>
        </div>
      </footer>
    </div>
  )
}
