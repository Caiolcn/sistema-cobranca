import { useState } from 'react'
import { supabase } from './supabaseClient'

export default function Login({ onLogin }) {
  const [loading, setLoading] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [focusedField, setFocusedField] = useState(null)

  // Validar se o formulário está completo
  const isFormValid = email.trim() !== '' && password.trim() !== ''

  const handleAuth = async (e) => {
    e.preventDefault()
    setLoading(true)

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password
      })

      if (error) throw error
      onLogin()
    } catch (error) {
      alert('Erro ao fazer login: ' + error.message)
    } finally {
      setLoading(false)
    }
  }

  const handleForgotPassword = async () => {
    if (!email) {
      alert('Por favor, digite seu e-mail primeiro')
      return
    }

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin + '/reset-password'
      })

      if (error) throw error
      alert('Email de recuperação enviado! Verifique sua caixa de entrada.')
    } catch (error) {
      alert('Erro ao enviar email: ' + error.message)
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: '#344848',
      padding: '20px'
    }}>
      <div style={{
        backgroundColor: 'white',
        borderRadius: '12px',
        padding: '40px',
        width: '100%',
        maxWidth: '400px',
        boxShadow: '0 4px 20px rgba(0,0,0,0.1)'
      }}>
        <h2 style={{
          textAlign: 'center',
          marginBottom: '30px',
          fontSize: '24px',
          fontWeight: '500',
          color: '#333'
        }}>
          Boas vindas!
        </h2>

        <form onSubmit={handleAuth}>
          {/* Campo E-mail */}
          <div style={{ marginBottom: '16px' }}>
            <label style={{
              display: 'block',
              fontSize: '12px',
              color: '#999',
              marginBottom: '6px'
            }}>
              E-mail
            </label>
            <input
              type="email"
              placeholder="E-mail"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onFocus={() => setFocusedField('email')}
              onBlur={() => setFocusedField(null)}
              required
              style={{
                width: '100%',
                padding: '12px 14px',
                fontSize: '14px',
                border: focusedField === 'email' ? '1px solid #333' : '1px solid #e0e0e0',
                borderRadius: '6px',
                outline: 'none',
                transition: 'border-color 0.2s',
                backgroundColor: '#f8f8f8',
                boxSizing: 'border-box'
              }}
            />
          </div>

          {/* Campo Senha */}
          <div style={{ marginBottom: '8px', position: 'relative' }}>
            <label style={{
              display: 'block',
              fontSize: '12px',
              color: '#999',
              marginBottom: '6px'
            }}>
              Senha de Acesso
            </label>
            <div style={{ position: 'relative' }}>
              <input
                type={showPassword ? 'text' : 'password'}
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onFocus={() => setFocusedField('password')}
                onBlur={() => setFocusedField(null)}
                required
                style={{
                  width: '100%',
                  padding: '12px 14px',
                  paddingRight: '45px',
                  fontSize: '14px',
                  border: focusedField === 'password' ? '1px solid #333' : '1px solid #e0e0e0',
                  borderRadius: '6px',
                  outline: 'none',
                  transition: 'border-color 0.2s',
                  backgroundColor: '#f8f8f8',
                  boxSizing: 'border-box'
                }}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                style={{
                  position: 'absolute',
                  right: '12px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  padding: '4px',
                  color: '#999'
                }}
              >
                <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
                  {showPassword ? (
                    // Ícone de olho fechado
                    <path d="M10 4C5 4 1.73 7.11 1 10c.73 2.89 4 6 9 6s8.27-3.11 9-6c-.73-2.89-4-6-9-6zm0 10c-2.21 0-4-1.79-4-4s1.79-4 4-4 4 1.79 4 4-1.79 4-4 4zm0-6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z"/>
                  ) : (
                    // Ícone de olho aberto
                    <path d="M10 4C5 4 1.73 7.11 1 10c.73 2.89 4 6 9 6s8.27-3.11 9-6c-.73-2.89-4-6-9-6zM2 10c.7-2.24 3.39-5 8-5s7.3 2.76 8 5c-.7 2.24-3.39 5-8 5s-7.3-2.76-8-5zm8 3c-1.66 0-3-1.34-3-3s1.34-3 3-3 3 1.34 3 3-1.34 3-3 3z"/>
                  )}
                </svg>
              </button>
            </div>
          </div>

          {/* Link Esqueci minha senha */}
          <div style={{
            textAlign: 'left',
            marginBottom: '24px'
          }}>
            <button
              type="button"
              onClick={handleForgotPassword}
              style={{
                background: 'none',
                border: 'none',
                color: '#666',
                fontSize: '13px',
                cursor: 'pointer',
                padding: 0,
                textDecoration: 'none',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px'
              }}
            >
              Esqueci minha senha
              <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor">
                <path d="M10 3l7 7-7 7-1.41-1.41L13.17 11H3V9h10.17L8.59 4.41z"/>
              </svg>
            </button>
          </div>

          {/* Botão Continuar */}
          <button
            type="submit"
            disabled={!isFormValid || loading}
            style={{
              width: '100%',
              padding: '14px',
              fontSize: '15px',
              fontWeight: '500',
              backgroundColor: isFormValid && !loading ? '#4285F4' : '#E8EAED',
              color: isFormValid && !loading ? 'white' : '#B0B0B0',
              border: 'none',
              borderRadius: '6px',
              cursor: isFormValid && !loading ? 'pointer' : 'not-allowed',
              transition: 'all 0.2s',
              opacity: loading ? 0.7 : 1
            }}
          >
            {loading ? 'Carregando...' : 'Continuar'}
          </button>
        </form>
      </div>
    </div>
  )
}
