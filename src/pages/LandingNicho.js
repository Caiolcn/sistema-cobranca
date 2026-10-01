import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { showSuccess, showError } from '../Toast'

const NUMEROS = [
  { valor: '2.700+', label: 'alunos gerenciados' },
  { valor: '8.500+', label: 'mensagens enviadas' },
  { valor: 'R$ 490k', label: 'administrados' }
]

export default function LandingNicho({ nicho, titulo, subtitulo, beneficios, cta, imagem }) {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [telefone, setTelefone] = useState('')
  const [nome, setNome] = useState('')
  const [loading, setLoading] = useState(false)
  const [step, setStep] = useState(1)

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
            google_lead_source: nicho
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
    <div style={{ minHeight: '100vh', background: '#f9fafb' }}>
      {/* Hero Section */}
      <div style={{
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        color: 'white',
        padding: '60px 20px',
        textAlign: 'center'
      }}>
        <div style={{ fontSize: '80px', marginBottom: '20px' }}>{imagem}</div>
        <h1 style={{ fontSize: '48px', fontWeight: 'bold', marginBottom: '16px', maxWidth: '800px', margin: '0 auto 16px' }}>
          {titulo}
        </h1>
        <p style={{ fontSize: '18px', opacity: 0.95, maxWidth: '600px', margin: '0 auto 32px' }}>
          {subtitulo}
        </p>
        <button
          onClick={() => document.getElementById('form').scrollIntoView({ behavior: 'smooth' })}
          style={{
            padding: '14px 32px',
            background: 'white',
            color: '#667eea',
            border: 'none',
            borderRadius: '8px',
            fontSize: '16px',
            fontWeight: 600,
            cursor: 'pointer',
            transition: 'transform 0.2s'
          }}
          onMouseOver={(e) => e.target.style.transform = 'scale(1.05)'}
          onMouseOut={(e) => e.target.style.transform = 'scale(1)'}
        >
          Começar Agora
        </button>
      </div>

      {/* Números Reais */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: '20px',
        maxWidth: '900px',
        margin: '40px auto',
        padding: '0 20px'
      }}>
        {NUMEROS.map((n, i) => (
          <div key={i} style={{
            background: 'white',
            padding: '24px',
            borderRadius: '12px',
            textAlign: 'center',
            boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
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

      {/* Benefícios */}
      <div style={{
        maxWidth: '900px',
        margin: '40px auto',
        padding: '0 20px'
      }}>
        <h2 style={{ fontSize: '28px', fontWeight: 'bold', marginBottom: '32px', textAlign: 'center', color: '#1f2937' }}>
          Por que escolher Mensalli?
        </h2>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
          gap: '20px'
        }}>
          {beneficios.map((b, i) => (
            <div key={i} style={{
              background: 'white',
              padding: '24px',
              borderRadius: '12px',
              border: '1px solid #e5e7eb',
              display: 'flex',
              gap: '16px'
            }}>
              <div style={{ fontSize: '24px', flexShrink: 0 }}>✓</div>
              <div>
                <div style={{ fontWeight: 600, color: '#1f2937', marginBottom: '4px' }}>
                  {b.split(' - ')[0]}
                </div>
                {b.includes(' - ') && (
                  <div style={{ fontSize: '13px', color: '#6b7280' }}>
                    {b.split(' - ')[1]}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Formulário */}
      <div id="form" style={{
        background: '#f3f4f6',
        padding: '60px 20px',
        marginTop: '40px'
      }}>
        <div style={{ maxWidth: '500px', margin: '0 auto' }}>
          <div style={{
            background: 'white',
            borderRadius: '16px',
            padding: '40px',
            boxShadow: '0 10px 40px rgba(0,0,0,0.1)'
          }}>
            <h2 style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '8px', color: '#1f2937' }}>
              Teste Gratuito
            </h2>
            <p style={{ fontSize: '14px', color: '#6b7280', marginBottom: '28px' }}>
              7 dias sem cartão. Cancele quando quiser.
            </p>

            <form onSubmit={handleSubmit}>
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px', color: '#374151' }}>
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
                    fontFamily: 'inherit'
                  }}
                />
              </div>

              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px', color: '#374151' }}>
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
                    fontFamily: 'inherit'
                  }}
                />
              </div>

              <div style={{ marginBottom: '28px' }}>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px', color: '#374151' }}>
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
                    fontFamily: 'inherit'
                  }}
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                style={{
                  width: '100%',
                  padding: '14px',
                  background: loading ? '#d1d5db' : 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '15px',
                  fontWeight: 600,
                  cursor: loading ? 'not-allowed' : 'pointer',
                  transition: 'transform 0.2s'
                }}
                onMouseOver={(e) => !loading && (e.target.style.transform = 'scale(1.02)')}
                onMouseOut={(e) => (e.target.style.transform = 'scale(1)')}
              >
                {loading ? '⏳ Criando conta...' : cta}
              </button>
            </form>

            <p style={{ fontSize: '12px', color: '#9ca3af', marginTop: '20px', textAlign: 'center' }}>
              Ao se cadastrar, você concorda com nossos<br/>Termos de Uso e Política de Privacidade
            </p>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div style={{
        background: '#1f2937',
        color: 'white',
        textAlign: 'center',
        padding: '40px 20px',
        fontSize: '13px'
      }}>
        <p>© 2026 Mensalli. Todos os direitos reservados.</p>
      </div>
    </div>
  )
}
