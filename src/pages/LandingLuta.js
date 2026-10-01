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
  { emoji: '💚', titulo: 'Cobranças automáticas', desc: 'PIX, cartão e boleto. Sem digitação manual.' },
  { emoji: '💬', titulo: 'Lembretes via WhatsApp', desc: 'Do seu próprio número. Antes, no dia e depois do vencimento.' },
  { emoji: '📊', titulo: 'Relatórios e controle', desc: 'Saiba exatamente quem pagou, quem deve e quanto falta receber.' },
  { emoji: '⏰', titulo: 'Agenda integrada', desc: 'Turmas, horários e alunos por nível em um só lugar.' },
  { emoji: '👥', titulo: 'Gestão de alunos', desc: 'Avançados, iniciantes, veteranos. Tudo organizado.' },
  { emoji: '✅', titulo: 'Tudo que você precisa', desc: 'Encerra a era da planilha e do caos administrativo.' }
]

const INTEGRATIONS = [
  { emoji: '💚', titulo: 'WhatsApp' },
  { emoji: '💳', titulo: 'PIX' },
  { emoji: '🏦', titulo: 'Cartão de crédito' },
  { emoji: '📑', titulo: 'Boleto' }
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
            google_lead_source: 'luta'
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
    <div style={{ minHeight: '100vh', background: '#f9fafb', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      {/* Hero */}
      <div style={{
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        color: 'white',
        padding: '60px 20px',
        textAlign: 'center',
        position: 'relative'
      }}>
        <div style={{ maxWidth: '1000px', margin: '0 auto' }}>
          <div style={{ fontSize: '60px', marginBottom: '20px' }}>🥋</div>
          <h1 style={{ fontSize: '44px', fontWeight: 'bold', marginBottom: '16px', lineHeight: 1.2 }}>
            Sistema para Academias de Artes Marciais e Centros de Treinamento
          </h1>
          <p style={{ fontSize: '18px', opacity: 0.95, marginBottom: '32px', maxWidth: '700px', margin: '0 auto 32px' }}>
            Descubra como Mensalli pode te ajudar a conquistar mais alunos, gerenciar mensalidades e cobranças automáticas.
          </p>
          <button
            onClick={() => document.getElementById('form').scrollIntoView({ behavior: 'smooth' })}
            style={{
              padding: '14px 36px',
              background: '#22c55e',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              fontSize: '16px',
              fontWeight: '600',
              cursor: 'pointer',
              transition: 'transform 0.2s, box-shadow 0.2s'
            }}
            onMouseOver={(e) => {
              e.target.style.transform = 'scale(1.05)'
              e.target.style.boxShadow = '0 8px 20px rgba(34, 197, 94, 0.4)'
            }}
            onMouseOut={(e) => {
              e.target.style.transform = 'scale(1)'
              e.target.style.boxShadow = 'none'
            }}
          >
            Começar Grátis
          </button>
        </div>
      </div>

      {/* Números */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: '20px',
        maxWidth: '900px',
        margin: '-40px auto 60px',
        padding: '0 20px',
        position: 'relative',
        zIndex: 1
      }}>
        {NUMEROS.map((n, i) => (
          <div key={i} style={{
            background: 'white',
            padding: '24px',
            borderRadius: '12px',
            textAlign: 'center',
            boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
            border: '1px solid #e5e7eb'
          }}>
            <div style={{ fontSize: '28px', fontWeight: 'bold', color: '#667eea', marginBottom: '8px' }}>
              {n.valor}
            </div>
            <div style={{ fontSize: '14px', color: '#6b7280' }}>
              {n.label}
            </div>
          </div>
        ))}
      </div>

      {/* Por que escolher */}
      <div style={{
        maxWidth: '1000px',
        margin: '0 auto 80px',
        padding: '0 20px'
      }}>
        <h2 style={{ fontSize: '32px', fontWeight: 'bold', marginBottom: '48px', textAlign: 'center', color: '#1f2937' }}>
          Tudo que você precisa para gerir sua academia
        </h2>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: '24px'
        }}>
          {FEATURES.map((f, i) => (
            <div key={i} style={{
              background: 'white',
              padding: '28px',
              borderRadius: '12px',
              border: '1px solid #e5e7eb',
              textAlign: 'center',
              transition: 'transform 0.2s, box-shadow 0.2s'
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.transform = 'translateY(-4px)'
              e.currentTarget.style.boxShadow = '0 12px 24px rgba(0,0,0,0.1)'
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.transform = 'translateY(0)'
              e.currentTarget.style.boxShadow = 'none'
            }}>
              <div style={{ fontSize: '40px', marginBottom: '12px' }}>{f.emoji}</div>
              <div style={{ fontWeight: '600', color: '#1f2937', marginBottom: '6px', fontSize: '16px' }}>
                {f.titulo}
              </div>
              <div style={{ fontSize: '14px', color: '#6b7280' }}>
                {f.desc}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Integrações */}
      <div style={{
        background: 'white',
        padding: '60px 20px',
        marginBottom: '60px',
        borderTop: '1px solid #e5e7eb'
      }}>
        <div style={{ maxWidth: '1000px', margin: '0 auto' }}>
          <h2 style={{ fontSize: '28px', fontWeight: 'bold', marginBottom: '40px', textAlign: 'center', color: '#1f2937' }}>
            Integrado com as ferramentas que você usa
          </h2>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: '20px'
          }}>
            {INTEGRATIONS.map((int, i) => (
              <div key={i} style={{
                background: '#f9fafb',
                padding: '24px',
                borderRadius: '8px',
                textAlign: 'center',
                border: '1px solid #e5e7eb'
              }}>
                <div style={{ fontSize: '32px', marginBottom: '8px' }}>{int.emoji}</div>
                <div style={{ fontWeight: '600', color: '#1f2937' }}>{int.titulo}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Formulário */}
      <div id="form" style={{
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        padding: '80px 20px',
        marginBottom: '60px'
      }}>
        <div style={{ maxWidth: '500px', margin: '0 auto' }}>
          <div style={{
            background: 'white',
            borderRadius: '16px',
            padding: '48px 32px',
            boxShadow: '0 20px 60px rgba(0,0,0,0.15)'
          }}>
            <h2 style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '8px', color: '#1f2937' }}>
              Teste Gratuito por 7 dias
            </h2>
            <p style={{ fontSize: '14px', color: '#6b7280', marginBottom: '32px' }}>
              Sem cartão de crédito. Cancele quando quiser.
            </p>

            <form onSubmit={handleSubmit}>
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', marginBottom: '6px', color: '#374151' }}>
                  Seu nome *
                </label>
                <input
                  type="text"
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                  placeholder="João Silva"
                  required
                  style={{
                    width: '100%',
                    padding: '11px 14px',
                    border: '1px solid #d1d5db',
                    borderRadius: '8px',
                    fontSize: '14px',
                    fontFamily: 'inherit',
                    boxSizing: 'border-box'
                  }}
                />
              </div>

              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', marginBottom: '6px', color: '#374151' }}>
                  Email *
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="seu@email.com"
                  required
                  style={{
                    width: '100%',
                    padding: '11px 14px',
                    border: '1px solid #d1d5db',
                    borderRadius: '8px',
                    fontSize: '14px',
                    fontFamily: 'inherit',
                    boxSizing: 'border-box'
                  }}
                />
              </div>

              <div style={{ marginBottom: '32px' }}>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', marginBottom: '6px', color: '#374151' }}>
                  WhatsApp *
                </label>
                <input
                  type="tel"
                  value={telefone}
                  onChange={(e) => setTelefone(e.target.value)}
                  placeholder="(11) 98765-4321"
                  required
                  style={{
                    width: '100%',
                    padding: '11px 14px',
                    border: '1px solid #d1d5db',
                    borderRadius: '8px',
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
                  padding: '14px',
                  background: loading ? '#d1d5db' : '#22c55e',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '15px',
                  fontWeight: '600',
                  cursor: loading ? 'not-allowed' : 'pointer',
                  transition: 'all 0.2s'
                }}
                onMouseOver={(e) => !loading && (e.target.style.transform = 'scale(1.02)')}
                onMouseOut={(e) => (e.target.style.transform = 'scale(1)')}
              >
                {loading ? '⏳ Criando conta...' : 'Começar Agora'}
              </button>
            </form>

            <p style={{ fontSize: '12px', color: '#9ca3af', marginTop: '20px', textAlign: 'center' }}>
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
        <h2 style={{ fontSize: '28px', fontWeight: 'bold', marginBottom: '40px', textAlign: 'center', color: '#1f2937' }}>
          Perguntas Frequentes
        </h2>
        {[
          { q: 'Consigo gerenciar alunos de diferentes níveis?', a: 'Sim! Você categoriza por iniciante, intermediário, avançado, etc. Cada grupo pode ter horários e mensalidades diferentes.' },
          { q: 'A cobrança sai do meu WhatsApp?', a: 'Sim! Tudo sai do seu número. Lembretes 3 dias antes, no dia e 3 dias depois. Sem intermediários, sem confusão.' },
          { q: 'E se usar múltiplos horários ou turmas?', a: 'Organize quantas turmas quiser. Cada uma com seu horário, quantidade de alunos e mensalidade específica.' },
          { q: 'Leva quanto tempo para começar?', a: 'Menos de 5 minutos. Você cria sua conta, adiciona os alunos e libera os lembretes. Pronto!' }
        ].map((faq, i) => (
          <div key={i} style={{
            background: 'white',
            padding: '20px',
            marginBottom: '12px',
            borderRadius: '8px',
            border: '1px solid #e5e7eb',
            cursor: 'pointer'
          }}
          onClick={() => setOpenFaq(openFaq === i ? null : i)}>
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              fontWeight: '600',
              color: '#1f2937'
            }}>
              {faq.q}
              <span style={{ fontSize: '20px' }}>{openFaq === i ? '−' : '+'}</span>
            </div>
            {openFaq === i && (
              <div style={{
                marginTop: '12px',
                paddingTop: '12px',
                borderTop: '1px solid #e5e7eb',
                color: '#6b7280',
                fontSize: '14px'
              }}>
                {faq.a}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Footer CTA */}
      <div style={{
        background: '#1f2937',
        color: 'white',
        textAlign: 'center',
        padding: '60px 20px'
      }}>
        <h2 style={{ fontSize: '28px', fontWeight: 'bold', marginBottom: '16px' }}>
          Pronto para crescer?
        </h2>
        <p style={{ marginBottom: '24px', fontSize: '16px', opacity: 0.9 }}>
          Comece seu teste gratuito agora. Sem cartão. Sem compromisso.
        </p>
        <button
          onClick={() => document.getElementById('form').scrollIntoView({ behavior: 'smooth' })}
          style={{
            padding: '14px 36px',
            background: '#22c55e',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            fontSize: '16px',
            fontWeight: '600',
            cursor: 'pointer'
          }}
        >
          Começar Agora
        </button>
      </div>

      {/* Footer */}
      <div style={{
        background: '#111827',
        color: '#9ca3af',
        textAlign: 'center',
        padding: '20px',
        fontSize: '12px'
      }}>
        © 2026 Mensalli. Todos os direitos reservados.
      </div>
    </div>
  )
}
