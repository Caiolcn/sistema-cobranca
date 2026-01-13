import { Icon } from '@iconify/react'
import { useNavigate } from 'react-router-dom'

export default function LandingPage() {
  const navigate = useNavigate()

  const planos = [
    {
      nome: 'Básico',
      preco: 'Grátis',
      periodo: 'para sempre',
      limite: '100 mensagens/mês',
      features: [
        'Até 100 mensagens por mês',
        'Gestão de clientes ilimitada',
        'Templates de mensagens',
        'Controle de mensalidades',
        'Suporte por email'
      ],
      destaque: false,
      buttonText: 'Começar Grátis'
    },
    {
      nome: 'Premium',
      preco: 'R$ 49,90',
      periodo: '/mês',
      limite: '500 mensagens/mês',
      features: [
        'Até 500 mensagens por mês',
        'Tudo do plano Básico',
        'Automação de cobranças',
        'Relatórios avançados',
        'Suporte prioritário'
      ],
      destaque: true,
      buttonText: 'Experimentar Premium'
    },
    {
      nome: 'Enterprise',
      preco: 'R$ 149,90',
      periodo: '/mês',
      limite: 'Mensagens ilimitadas',
      features: [
        'Mensagens ilimitadas',
        'Tudo do plano Premium',
        'API de integração',
        'Suporte 24/7',
        'Gerente de conta dedicado'
      ],
      destaque: false,
      buttonText: 'Falar com Vendas'
    }
  ]

  const features = [
    {
      icon: 'mdi:whatsapp',
      titulo: 'WhatsApp Integrado',
      descricao: 'Conecte seu WhatsApp e envie cobranças automáticas direto para seus clientes.',
      color: '#25D366'
    },
    {
      icon: 'mdi:clock-outline',
      titulo: 'Automação Inteligente',
      descricao: 'Configure lembretes automáticos 3 e 5 dias antes do vencimento e para mensalidades em atraso.',
      color: '#2196F3'
    },
    {
      icon: 'mdi:account-group',
      titulo: 'Gestão Completa',
      descricao: 'Cadastre clientes, controle mensalidades e acompanhe pagamentos em um só lugar.',
      color: '#FF9800'
    },
    {
      icon: 'mdi:chart-line',
      titulo: 'Relatórios em Tempo Real',
      descricao: 'Visualize receitas, taxas de inadimplência e mensagens enviadas com dashboards intuitivos.',
      color: '#9C27B0'
    },
    {
      icon: 'mdi:message-text',
      titulo: 'Templates Personalizados',
      descricao: 'Crie mensagens personalizadas com variáveis dinâmicas como nome, valor e data.',
      color: '#F44336'
    },
    {
      icon: 'mdi:shield-check',
      titulo: '100% Seguro',
      descricao: 'Seus dados e dos seus clientes protegidos com criptografia de ponta a ponta.',
      color: '#4CAF50'
    }
  ]

  const faqs = [
    {
      pergunta: 'Como funciona o período de teste?',
      resposta: 'O plano Básico é gratuito para sempre! Você pode começar imediatamente e fazer upgrade quando precisar de mais mensagens.'
    },
    {
      pergunta: 'Posso trocar de plano depois?',
      resposta: 'Sim! Você pode fazer upgrade ou downgrade a qualquer momento. As mudanças são aplicadas imediatamente.'
    },
    {
      pergunta: 'Preciso ter conhecimento técnico?',
      resposta: 'Não! O MensalliZap foi desenvolvido para ser extremamente fácil de usar. Basta conectar seu WhatsApp e começar.'
    },
    {
      pergunta: 'Como funciona a integração com WhatsApp?',
      resposta: 'Você conecta seu WhatsApp através de um QR Code, igual ao WhatsApp Web. Não precisa instalar nada no celular.'
    },
    {
      pergunta: 'Os dados dos meus clientes estão seguros?',
      resposta: 'Sim! Todos os dados são criptografados e armazenados em servidores seguros. Seguimos todas as melhores práticas de segurança.'
    },
    {
      pergunta: 'Posso cancelar a qualquer momento?',
      resposta: 'Sim, você pode cancelar sua assinatura a qualquer momento, sem multas ou taxas. Seu acesso continua até o fim do período pago.'
    }
  ]

  return (
    <div style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen, Ubuntu, sans-serif' }}>
      {/* Navbar */}
      <nav style={{
        backgroundColor: 'white',
        padding: '20px 0',
        boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
        position: 'sticky',
        top: 0,
        zIndex: 1000
      }}>
        <div style={{
          maxWidth: '1200px',
          margin: '0 auto',
          padding: '0 24px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <Icon icon="mdi:whatsapp" width="32" style={{ color: '#25D366' }} />
            <span style={{ fontSize: '24px', fontWeight: 'bold', color: '#333' }}>MensalliZap</span>
          </div>
          <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
            <button
              onClick={() => navigate('/login')}
              style={{
                padding: '10px 24px',
                backgroundColor: 'transparent',
                color: '#667eea',
                border: '2px solid #667eea',
                borderRadius: '8px',
                fontSize: '15px',
                fontWeight: '600',
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
              onMouseOver={(e) => {
                e.target.style.backgroundColor = '#f0f4ff'
              }}
              onMouseOut={(e) => {
                e.target.style.backgroundColor = 'transparent'
              }}
            >
              Entrar
            </button>
            <button
              onClick={() => navigate('/signup')}
              style={{
                padding: '10px 24px',
                backgroundColor: '#667eea',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                fontSize: '15px',
                fontWeight: '600',
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
              onMouseOver={(e) => {
                e.target.style.backgroundColor = '#5568d3'
              }}
              onMouseOut={(e) => {
                e.target.style.backgroundColor = '#667eea'
              }}
            >
              Criar Conta Grátis
            </button>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section style={{
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        padding: '80px 24px',
        color: 'white',
        textAlign: 'center'
      }}>
        <div style={{ maxWidth: '900px', margin: '0 auto' }}>
          <h1 style={{
            fontSize: '48px',
            fontWeight: 'bold',
            marginBottom: '24px',
            lineHeight: '1.2'
          }}>
            Automatize suas Cobranças via WhatsApp
          </h1>
          <p style={{
            fontSize: '20px',
            marginBottom: '40px',
            opacity: 0.95,
            lineHeight: '1.6'
          }}>
            Gerencie mensalidades, envie cobranças automáticas e reduza a inadimplência com o MensalliZap.
            Conecte seu WhatsApp em segundos e comece hoje mesmo!
          </p>
          <div style={{ display: 'flex', gap: '16px', justifyContent: 'center', flexWrap: 'wrap' }}>
            <button
              onClick={() => navigate('/signup')}
              style={{
                padding: '16px 40px',
                backgroundColor: 'white',
                color: '#667eea',
                border: 'none',
                borderRadius: '10px',
                fontSize: '18px',
                fontWeight: '600',
                cursor: 'pointer',
                boxShadow: '0 4px 16px rgba(0,0,0,0.2)',
                transition: 'all 0.2s',
                display: 'flex',
                alignItems: 'center',
                gap: '10px'
              }}
              onMouseOver={(e) => {
                e.target.style.transform = 'translateY(-2px)'
                e.target.style.boxShadow = '0 6px 20px rgba(0,0,0,0.3)'
              }}
              onMouseOut={(e) => {
                e.target.style.transform = 'translateY(0)'
                e.target.style.boxShadow = '0 4px 16px rgba(0,0,0,0.2)'
              }}
            >
              <Icon icon="mdi:rocket-launch" width="24" />
              Começar Grátis Agora
            </button>
            <button
              onClick={() => document.getElementById('precos').scrollIntoView({ behavior: 'smooth' })}
              style={{
                padding: '16px 40px',
                backgroundColor: 'transparent',
                color: 'white',
                border: '2px solid white',
                borderRadius: '10px',
                fontSize: '18px',
                fontWeight: '600',
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
              onMouseOver={(e) => {
                e.target.style.backgroundColor = 'rgba(255,255,255,0.1)'
              }}
              onMouseOut={(e) => {
                e.target.style.backgroundColor = 'transparent'
              }}
            >
              Ver Planos
            </button>
          </div>
          <p style={{ marginTop: '24px', fontSize: '14px', opacity: 0.9 }}>
            ✓ Sem cartão de crédito • ✓ Grátis para sempre • ✓ Cancele quando quiser
          </p>
        </div>
      </section>

      {/* Features Section */}
      <section style={{ padding: '80px 24px', backgroundColor: '#f8f9fa' }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
          <h2 style={{
            fontSize: '36px',
            fontWeight: 'bold',
            textAlign: 'center',
            marginBottom: '16px',
            color: '#333'
          }}>
            Tudo que você precisa para gerenciar suas cobranças
          </h2>
          <p style={{
            textAlign: 'center',
            color: '#666',
            fontSize: '18px',
            marginBottom: '60px',
            maxWidth: '700px',
            margin: '0 auto 60px'
          }}>
            Funcionalidades completas para facilitar sua gestão financeira e melhorar o relacionamento com seus clientes
          </p>

          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
            gap: '32px'
          }}>
            {features.map((feature, index) => (
              <div
                key={index}
                style={{
                  backgroundColor: 'white',
                  padding: '32px',
                  borderRadius: '16px',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
                  transition: 'all 0.3s'
                }}
                onMouseOver={(e) => {
                  e.currentTarget.style.transform = 'translateY(-8px)'
                  e.currentTarget.style.boxShadow = '0 8px 24px rgba(0,0,0,0.15)'
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.transform = 'translateY(0)'
                  e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.08)'
                }}
              >
                <div style={{
                  width: '56px',
                  height: '56px',
                  backgroundColor: feature.color + '15',
                  borderRadius: '12px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: '20px'
                }}>
                  <Icon icon={feature.icon} width="32" style={{ color: feature.color }} />
                </div>
                <h3 style={{ fontSize: '20px', fontWeight: '600', marginBottom: '12px', color: '#333' }}>
                  {feature.titulo}
                </h3>
                <p style={{ color: '#666', lineHeight: '1.6', fontSize: '15px' }}>
                  {feature.descricao}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section id="precos" style={{ padding: '80px 24px', backgroundColor: 'white' }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
          <h2 style={{
            fontSize: '36px',
            fontWeight: 'bold',
            textAlign: 'center',
            marginBottom: '16px',
            color: '#333'
          }}>
            Planos para todos os tamanhos de negócio
          </h2>
          <p style={{
            textAlign: 'center',
            color: '#666',
            fontSize: '18px',
            marginBottom: '60px'
          }}>
            Escolha o plano ideal para o seu negócio. Faça upgrade ou downgrade quando quiser.
          </p>

          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
            gap: '32px',
            maxWidth: '1000px',
            margin: '0 auto'
          }}>
            {planos.map((plano, index) => (
              <div
                key={index}
                style={{
                  backgroundColor: plano.destaque ? '#667eea' : 'white',
                  color: plano.destaque ? 'white' : '#333',
                  padding: '40px',
                  borderRadius: '16px',
                  border: plano.destaque ? 'none' : '2px solid #e0e0e0',
                  boxShadow: plano.destaque ? '0 8px 32px rgba(102, 126, 234, 0.3)' : '0 4px 12px rgba(0,0,0,0.08)',
                  transform: plano.destaque ? 'scale(1.05)' : 'scale(1)',
                  position: 'relative',
                  transition: 'all 0.3s'
                }}
                onMouseOver={(e) => {
                  if (!plano.destaque) {
                    e.currentTarget.style.transform = 'scale(1.03)'
                    e.currentTarget.style.boxShadow = '0 8px 24px rgba(0,0,0,0.15)'
                  }
                }}
                onMouseOut={(e) => {
                  if (!plano.destaque) {
                    e.currentTarget.style.transform = 'scale(1)'
                    e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.08)'
                  }
                }}
              >
                {plano.destaque && (
                  <div style={{
                    position: 'absolute',
                    top: '-12px',
                    left: '50%',
                    transform: 'translateX(-50%)',
                    backgroundColor: '#FF9800',
                    color: 'white',
                    padding: '6px 20px',
                    borderRadius: '20px',
                    fontSize: '12px',
                    fontWeight: '600',
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px'
                  }}>
                    Mais Popular
                  </div>
                )}

                <h3 style={{
                  fontSize: '24px',
                  fontWeight: '600',
                  marginBottom: '12px',
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px'
                }}>
                  {plano.nome}
                </h3>

                <div style={{ marginBottom: '24px' }}>
                  <span style={{ fontSize: '48px', fontWeight: 'bold' }}>
                    {plano.preco}
                  </span>
                  <span style={{ fontSize: '16px', opacity: 0.8 }}>
                    {plano.periodo}
                  </span>
                </div>

                <p style={{
                  fontSize: '14px',
                  marginBottom: '32px',
                  opacity: 0.9,
                  paddingBottom: '24px',
                  borderBottom: plano.destaque ? '1px solid rgba(255,255,255,0.2)' : '1px solid #e0e0e0'
                }}>
                  {plano.limite}
                </p>

                <ul style={{
                  listStyle: 'none',
                  padding: 0,
                  marginBottom: '32px'
                }}>
                  {plano.features.map((feature, i) => (
                    <li key={i} style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                      marginBottom: '16px',
                      fontSize: '15px'
                    }}>
                      <Icon
                        icon="mdi:check-circle"
                        width="20"
                        style={{ color: plano.destaque ? '#4CAF50' : '#4CAF50', flexShrink: 0 }}
                      />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>

                <button
                  onClick={() => navigate('/signup')}
                  style={{
                    width: '100%',
                    padding: '14px',
                    backgroundColor: plano.destaque ? 'white' : '#667eea',
                    color: plano.destaque ? '#667eea' : 'white',
                    border: 'none',
                    borderRadius: '8px',
                    fontSize: '16px',
                    fontWeight: '600',
                    cursor: 'pointer',
                    transition: 'all 0.2s'
                  }}
                  onMouseOver={(e) => {
                    e.target.style.transform = 'translateY(-2px)'
                    e.target.style.boxShadow = '0 4px 12px rgba(0,0,0,0.2)'
                  }}
                  onMouseOut={(e) => {
                    e.target.style.transform = 'translateY(0)'
                    e.target.style.boxShadow = 'none'
                  }}
                >
                  {plano.buttonText}
                </button>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section style={{ padding: '80px 24px', backgroundColor: '#f8f9fa' }}>
        <div style={{ maxWidth: '800px', margin: '0 auto' }}>
          <h2 style={{
            fontSize: '36px',
            fontWeight: 'bold',
            textAlign: 'center',
            marginBottom: '16px',
            color: '#333'
          }}>
            Perguntas Frequentes
          </h2>
          <p style={{
            textAlign: 'center',
            color: '#666',
            fontSize: '18px',
            marginBottom: '60px'
          }}>
            Tire suas dúvidas sobre o MensalliZap
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {faqs.map((faq, index) => (
              <details
                key={index}
                style={{
                  backgroundColor: 'white',
                  padding: '24px',
                  borderRadius: '12px',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
                  cursor: 'pointer'
                }}
              >
                <summary style={{
                  fontSize: '18px',
                  fontWeight: '600',
                  color: '#333',
                  listStyle: 'none',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}>
                  {faq.pergunta}
                  <Icon icon="mdi:chevron-down" width="24" style={{ color: '#667eea' }} />
                </summary>
                <p style={{
                  marginTop: '16px',
                  color: '#666',
                  lineHeight: '1.6',
                  paddingTop: '16px',
                  borderTop: '1px solid #f0f0f0'
                }}>
                  {faq.resposta}
                </p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Final */}
      <section style={{
        padding: '80px 24px',
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        color: 'white',
        textAlign: 'center'
      }}>
        <div style={{ maxWidth: '700px', margin: '0 auto' }}>
          <h2 style={{
            fontSize: '40px',
            fontWeight: 'bold',
            marginBottom: '24px'
          }}>
            Pronto para reduzir sua inadimplência?
          </h2>
          <p style={{
            fontSize: '18px',
            marginBottom: '40px',
            opacity: 0.95
          }}>
            Junte-se a centenas de empresas que já automatizaram suas cobranças com o MensalliZap
          </p>
          <button
            onClick={() => navigate('/signup')}
            style={{
              padding: '18px 48px',
              backgroundColor: 'white',
              color: '#667eea',
              border: 'none',
              borderRadius: '10px',
              fontSize: '18px',
              fontWeight: '600',
              cursor: 'pointer',
              boxShadow: '0 4px 16px rgba(0,0,0,0.2)',
              transition: 'all 0.2s'
            }}
            onMouseOver={(e) => {
              e.target.style.transform = 'translateY(-2px)'
              e.target.style.boxShadow = '0 6px 20px rgba(0,0,0,0.3)'
            }}
            onMouseOut={(e) => {
              e.target.style.transform = 'translateY(0)'
              e.target.style.boxShadow = '0 4px 16px rgba(0,0,0,0.2)'
            }}
          >
            Criar Conta Grátis
          </button>
        </div>
      </section>

      {/* Footer */}
      <footer style={{
        backgroundColor: '#2c3e50',
        color: 'white',
        padding: '40px 24px',
        textAlign: 'center'
      }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px', marginBottom: '24px' }}>
            <Icon icon="mdi:whatsapp" width="32" style={{ color: '#25D366' }} />
            <span style={{ fontSize: '24px', fontWeight: 'bold' }}>MensalliZap</span>
          </div>
          <p style={{ color: '#bdc3c7', marginBottom: '24px' }}>
            Automatize suas cobranças via WhatsApp de forma simples e eficiente
          </p>
          <div style={{
            display: 'flex',
            justifyContent: 'center',
            gap: '32px',
            marginBottom: '24px',
            flexWrap: 'wrap'
          }}>
            <a href="#" style={{ color: '#bdc3c7', textDecoration: 'none' }}>Termos de Uso</a>
            <a href="#" style={{ color: '#bdc3c7', textDecoration: 'none' }}>Política de Privacidade</a>
            <a href="#" style={{ color: '#bdc3c7', textDecoration: 'none' }}>Contato</a>
          </div>
          <p style={{ color: '#7f8c8d', fontSize: '14px' }}>
            © 2026 MensalliZap. Todos os direitos reservados.
          </p>
        </div>
      </footer>
    </div>
  )
}
