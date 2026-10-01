import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { showSuccess, showError } from '../Toast'

const NUMEROS = [
  { valor: '2.700+', label: 'alunos gerenciados' },
  { valor: '+8.500', label: 'mensagens enviadas' },
  { valor: 'R$ 490k', label: 'em mensalidades' }
]

const FEATURES = [
  { emoji: '💚', titulo: 'Cobranças automáticas', desc: 'PIX, cartão e boleto saem sozinhos' },
  { emoji: '💬', titulo: 'Lembretes via WhatsApp', desc: '3 dias antes, no dia e 3 dias depois' },
  { emoji: '📊', titulo: 'Relatórios completos', desc: 'Saiba quem pagou, quem deve e quanto falta' },
  { emoji: '⏰', titulo: 'Agenda integrada', desc: 'Turmas, horários e níveis em um só lugar' },
  { emoji: '👥', titulo: 'Gestão de alunos', desc: 'Organize por iniciante, intermediário, avançado' },
  { emoji: '✅', titulo: 'Sem planilha', desc: 'Tchau Excel. Tudo automatizado e organizado.' }
]

const FAQ = [
  { q: 'Como funciona a cobrança automática?', a: 'Você configura a data de vencimento e o sistema envia lembretes 3 dias antes, no dia e 3 dias depois. O aluno paga pelo WhatsApp e a cobrança é baixada sozinha.' },
  { q: 'Sai do meu próprio WhatsApp?', a: 'Sim! Tudo sai do seu número, sem intermediários. Seus alunos conversam direto com você, como sempre fizeram.' },
  { q: 'E se o aluno não pagar?', a: 'Você continua recebendo lembretes automáticos. E vê um relatório claro de quem está atrasado para você cobrar pessoalmente se precisar.' },
  { q: 'Consigo gerenciar múltiplas turmas?', a: 'Sim! Crie quantas turmas quiser com horários, níveis e mensalidades diferentes. Tudo organizado em um só lugar.' },
  { q: 'Quanto tempo leva para configurar?', a: 'Menos de 5 minutos. Você cria a conta, adiciona os alunos, define o vencimento e libera os lembretes. Pronto!' },
  { q: 'Preciso de conhecimento técnico?', a: 'Não! Tudo é intuitivo e pensado para ser usado por você. Temos suporte em caso de dúvida.' }
]

export default function LandingLuta() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [telefone, setTelefone] = useState('')
  const [nome, setNome] = useState('')
  const [loading, setLoading] = useState(false)
  const [openFaq, setOpenFaq] = useState(null)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)

    try {
      const params = new URLSearchParams(window.location.search)
      const gclid = params.get('gclid')

      const { error } = await supabase.auth.signUp({
        email,
        password: Math.random().toString(36).slice(-12),
        options: {
          data: {
            nome_completo: nome,
            telefone: telefone.replace(/\D/g, ''),
            plano: 'pro',
            gclid: gclid || null,
            google_lead_source: 'academia-de-luta'
          }
        }
      })

      if (error) throw error
      showSuccess('Conta criada! Confira seu email.')
      setTimeout(() => navigate('/app/home'), 2000)
    } catch (erro) {
      showError(erro.message || 'Erro ao criar conta')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: '#ffffff', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      {/* Header */}
      <div style={{
        borderBottom: '1px solid #f0f0f0',
        padding: '16px 20px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }}>
        <div style={{ fontWeight: 'bold', fontSize: '18px', color: '#1f2937' }}>Mensalli 🥋</div>
        <button
          onClick={() => document.getElementById('form').scrollIntoView({ behavior: 'smooth' })}
          style={{
            padding: '8px 16px',
            background: '#22c55e',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            fontSize: '14px',
            fontWeight: '600',
            cursor: 'pointer'
          }}
        >
          Começar
        </button>
      </div>

      {/* Hero */}
      <div style={{
        padding: '80px 20px',
        textAlign: 'center',
        maxWidth: '900px',
        margin: '0 auto'
      }}>
        <h1 style={{
          fontSize: '48px',
          fontWeight: '700',
          marginBottom: '16px',
          color: '#1f2937',
          lineHeight: 1.2
        }}>
          Nunca mais cobre aluno por aluno no WhatsApp.
        </h1>
        <p style={{
          fontSize: '18px',
          color: '#6b7280',
          marginBottom: '32px',
          maxWidth: '700px',
          margin: '0 auto 32px'
        }}>
          A cobrança que funciona por você, no WhatsApp.
        </p>
        <button
          onClick={() => document.getElementById('form').scrollIntoView({ behavior: 'smooth' })}
          style={{
            padding: '14px 32px',
            background: '#22c55e',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            fontSize: '16px',
            fontWeight: '600',
            cursor: 'pointer'
          }}
        >
          Teste grátis
        </button>
      </div>

      {/* Números */}
      <div style={{
        background: '#f9fafb',
        padding: '60px 20px',
        marginBottom: '60px'
      }}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '20px',
          maxWidth: '900px',
          margin: '0 auto'
        }}>
          {NUMEROS.map((n, i) => (
            <div key={i} style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '32px', fontWeight: 'bold', color: '#22c55e', marginBottom: '8px' }}>
                {n.valor}
              </div>
              <div style={{ fontSize: '14px', color: '#6b7280' }}>
                {n.label}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* O que faz funcionar */}
      <div style={{
        maxWidth: '900px',
        margin: '0 auto 80px',
        padding: '0 20px'
      }}>
        <h2 style={{
          fontSize: '32px',
          fontWeight: 'bold',
          marginBottom: '48px',
          textAlign: 'center',
          color: '#1f2937'
        }}>
          O que faz seu cliente realmente ficar
        </h2>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
          gap: '32px'
        }}>
          {FEATURES.map((f, i) => (
            <div key={i}>
              <div style={{ fontSize: '32px', marginBottom: '12px' }}>{f.emoji}</div>
              <h3 style={{ fontSize: '16px', fontWeight: '600', color: '#1f2937', marginBottom: '6px' }}>
                {f.titulo}
              </h3>
              <p style={{ fontSize: '14px', color: '#6b7280' }}>
                {f.desc}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Formulário */}
      <div id="form" style={{
        background: '#f9fafb',
        padding: '80px 20px',
        marginBottom: '60px'
      }}>
        <div style={{ maxWidth: '500px', margin: '0 auto' }}>
          <div style={{
            background: 'white',
            borderRadius: '8px',
            padding: '48px 32px',
            border: '1px solid #e5e7eb'
          }}>
            <h2 style={{
              fontSize: '24px',
              fontWeight: 'bold',
              marginBottom: '8px',
              color: '#1f2937'
            }}>
              Teste 7 dias grátis
            </h2>
            <p style={{
              fontSize: '14px',
              color: '#6b7280',
              marginBottom: '32px'
            }}>
              Sem cartão de crédito. Sem pegadinhas.
            </p>

            <form onSubmit={handleSubmit}>
              <div style={{ marginBottom: '16px' }}>
                <label style={{
                  display: 'block',
                  fontSize: '13px',
                  fontWeight: '600',
                  marginBottom: '6px',
                  color: '#374151'
                }}>
                  Seu nome
                </label>
                <input
                  type="text"
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                  placeholder="João Silva"
                  required
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    fontSize: '14px',
                    fontFamily: 'inherit',
                    boxSizing: 'border-box'
                  }}
                />
              </div>

              <div style={{ marginBottom: '16px' }}>
                <label style={{
                  display: 'block',
                  fontSize: '13px',
                  fontWeight: '600',
                  marginBottom: '6px',
                  color: '#374151'
                }}>
                  Email
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="seu@email.com"
                  required
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    fontSize: '14px',
                    fontFamily: 'inherit',
                    boxSizing: 'border-box'
                  }}
                />
              </div>

              <div style={{ marginBottom: '32px' }}>
                <label style={{
                  display: 'block',
                  fontSize: '13px',
                  fontWeight: '600',
                  marginBottom: '6px',
                  color: '#374151'
                }}>
                  WhatsApp
                </label>
                <input
                  type="tel"
                  value={telefone}
                  onChange={(e) => setTelefone(e.target.value)}
                  placeholder="(11) 98765-4321"
                  required
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    fontSize: '14px',
                    fontFamily: 'inherit',
                    boxSizing: 'border-box'
                  }}
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                style={{
                  width: '100%',
                  padding: '12px',
                  background: loading ? '#d1d5db' : '#22c55e',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  fontSize: '15px',
                  fontWeight: '600',
                  cursor: loading ? 'not-allowed' : 'pointer'
                }}
              >
                {loading ? 'Criando conta...' : 'Começar'}
              </button>
            </form>

            <p style={{
              fontSize: '12px',
              color: '#9ca3af',
              marginTop: '20px',
              textAlign: 'center'
            }}>
              Ao se cadastrar, você concorda com nossos Termos de Uso
            </p>
          </div>
        </div>
      </div>

      {/* FAQ */}
      <div style={{
        maxWidth: '800px',
        margin: '0 auto 80px',
        padding: '0 20px'
      }}>
        <h2 style={{
          fontSize: '28px',
          fontWeight: 'bold',
          marginBottom: '40px',
          textAlign: 'center',
          color: '#1f2937'
        }}>
          Quanto você perde com atraso?
        </h2>
        <div style={{ display: 'grid', gap: '12px' }}>
          {FAQ.map((faq, i) => (
            <div
              key={i}
              onClick={() => setOpenFaq(openFaq === i ? null : i)}
              style={{
                background: 'white',
                padding: '20px',
                borderRadius: '6px',
                border: '1px solid #e5e7eb',
                cursor: 'pointer'
              }}
            >
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                fontWeight: '600',
                color: '#1f2937'
              }}>
                {faq.q}
                <span style={{ fontSize: '18px', color: '#22c55e' }}>
                  {openFaq === i ? '−' : '+'}
                </span>
              </div>
              {openFaq === i && (
                <div style={{
                  marginTop: '12px',
                  paddingTop: '12px',
                  borderTop: '1px solid #e5e7eb',
                  color: '#6b7280',
                  fontSize: '14px',
                  lineHeight: 1.6
                }}>
                  {faq.a}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* CTA Final */}
      <div style={{
        background: '#1f2937',
        color: 'white',
        textAlign: 'center',
        padding: '60px 20px',
        marginBottom: '0'
      }}>
        <h2 style={{ fontSize: '28px', fontWeight: 'bold', marginBottom: '16px' }}>
          Pronto para automatizar?
        </h2>
        <p style={{ marginBottom: '24px', fontSize: '16px', opacity: 0.9 }}>
          7 dias grátis. Sem cartão. Teste agora.
        </p>
        <button
          onClick={() => document.getElementById('form').scrollIntoView({ behavior: 'smooth' })}
          style={{
            padding: '12px 32px',
            background: '#22c55e',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            fontSize: '16px',
            fontWeight: '600',
            cursor: 'pointer'
          }}
        >
          Começar
        </button>
      </div>

      {/* Footer */}
      <div style={{
        background: '#111827',
        color: '#6b7280',
        textAlign: 'center',
        padding: '20px',
        fontSize: '12px'
      }}>
        © 2026 Mensalli. Todos os direitos reservados.
      </div>
    </div>
  )
}
