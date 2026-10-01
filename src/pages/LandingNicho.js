import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { showSuccess, showError } from '../Toast'

export default function LandingNicho({ nicho, titulo, subtitulo, beneficios, cta, imagem }) {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [telefone, setTelefone] = useState('')
  const [nome, setNome] = useState('')
  const [loading, setLoading] = useState(false)

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
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      display: 'flex',
      alignItems: 'center',
      padding: '20px'
    }}>
      <div style={{
        maxWidth: '900px',
        margin: '0 auto',
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
        gap: '40px',
        alignItems: 'center'
      }}>
        <div style={{ color: 'white' }}>
          <div style={{ fontSize: '60px', marginBottom: '20px' }}>{imagem}</div>
          <h1 style={{ fontSize: '32px', fontWeight: 'bold', marginBottom: '12px', lineHeight: 1.2 }}>
            {titulo}
          </h1>
          <p style={{ fontSize: '16px', marginBottom: '24px', opacity: 0.9 }}>
            {subtitulo}
          </p>
          <div style={{ marginBottom: '24px' }}>
            {beneficios.map((b, i) => (
              <div key={i} style={{ display: 'flex', gap: '12px', marginBottom: '12px', fontSize: '14px' }}>
                <span>✓</span>
                <span>{b}</span>
              </div>
            ))}
          </div>
        </div>

        <div style={{
          background: 'white',
          borderRadius: '16px',
          padding: '32px',
          boxShadow: '0 20px 60px rgba(0,0,0,0.3)'
        }}>
          <h2 style={{ fontSize: '20px', fontWeight: 'bold', marginBottom: '8px', color: '#1f2937' }}>
            Teste Grátis por 7 dias
          </h2>
          <p style={{ fontSize: '13px', color: '#6b7280', marginBottom: '24px' }}>
            Sem cartão de crédito. Cancele a qualquer momento.
          </p>

          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '6px', color: '#374151' }}>
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
                  padding: '12px',
                  border: '1px solid #d1d5db',
                  borderRadius: '8px',
                  fontSize: '14px'
                }}
              />
            </div>

            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '6px', color: '#374151' }}>
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
                  padding: '12px',
                  border: '1px solid #d1d5db',
                  borderRadius: '8px',
                  fontSize: '14px'
                }}
              />
            </div>

            <div style={{ marginBottom: '24px' }}>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '6px', color: '#374151' }}>
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
                  padding: '12px',
                  border: '1px solid #d1d5db',
                  borderRadius: '8px',
                  fontSize: '14px'
                }}
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              style={{
                width: '100%',
                padding: '12px',
                background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                fontSize: '14px',
                fontWeight: 600,
                cursor: loading ? 'not-allowed' : 'pointer',
                opacity: loading ? 0.7 : 1
              }}
            >
              {loading ? 'Criando conta...' : cta}
            </button>
          </form>

          <p style={{ fontSize: '11px', color: '#9ca3af', marginTop: '16px', textAlign: 'center' }}>
            Ao se cadastrar, você concorda com nossos Termos de Uso
          </p>
        </div>
      </div>
    </div>
  )
}
