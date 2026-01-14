import React, { useState, useEffect } from 'react'
import { supabase } from './supabaseClient'
import { useNavigate } from 'react-router-dom'

function ResetPassword() {
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [sessionReady, setSessionReady] = useState(false)
  const navigate = useNavigate()

  useEffect(() => {
    // Verificar se há uma sessão de recovery ativa
    const checkSession = async () => {
      const { data: { session } } = await supabase.auth.getSession()

      if (session) {
        setSessionReady(true)
      } else {
        // Aguardar o evento de auth state change (quando o token é processado)
        const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
          if (event === 'PASSWORD_RECOVERY') {
            setSessionReady(true)
          } else if (event === 'SIGNED_IN' && session) {
            setSessionReady(true)
          }
        })

        return () => subscription.unsubscribe()
      }
    }

    checkSession()
  }, [])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setMessage('')

    if (password !== confirmPassword) {
      setError('As senhas não coincidem')
      return
    }

    if (password.length < 6) {
      setError('A senha deve ter pelo menos 6 caracteres')
      return
    }

    setLoading(true)

    try {
      const { error } = await supabase.auth.updateUser({
        password: password
      })

      if (error) throw error

      setMessage('Senha alterada com sucesso! Redirecionando...')

      setTimeout(() => {
        navigate('/login')
      }, 2000)

    } catch (err) {
      setError('Erro ao alterar senha: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <h1 style={styles.title}>Redefinir Senha</h1>
        <p style={styles.subtitle}>Digite sua nova senha abaixo</p>

        {!sessionReady ? (
          <div style={styles.loadingContainer}>
            <p>Processando link de recuperação...</p>
            <p style={styles.hint}>Se demorar muito, solicite um novo link de recuperação.</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} style={styles.form}>
            <div style={styles.inputGroup}>
              <label style={styles.label}>Nova Senha</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                style={styles.input}
                placeholder="Digite sua nova senha"
                required
                minLength={6}
              />
            </div>

            <div style={styles.inputGroup}>
              <label style={styles.label}>Confirmar Senha</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                style={styles.input}
                placeholder="Confirme sua nova senha"
                required
                minLength={6}
              />
            </div>

            {error && <p style={styles.error}>{error}</p>}
            {message && <p style={styles.success}>{message}</p>}

            <button
              type="submit"
              style={styles.button}
              disabled={loading}
            >
              {loading ? 'Alterando...' : 'Alterar Senha'}
            </button>
          </form>
        )}

        <button
          onClick={() => navigate('/login')}
          style={styles.backButton}
        >
          Voltar para o Login
        </button>
      </div>
    </div>
  )
}

const styles = {
  container: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    padding: '20px',
  },
  card: {
    background: 'white',
    borderRadius: '16px',
    padding: '40px',
    maxWidth: '400px',
    width: '100%',
    boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
  },
  title: {
    fontSize: '28px',
    fontWeight: 'bold',
    color: '#1a1a2e',
    marginBottom: '8px',
    textAlign: 'center',
  },
  subtitle: {
    color: '#666',
    marginBottom: '30px',
    textAlign: 'center',
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '20px',
  },
  inputGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  label: {
    fontWeight: '600',
    color: '#333',
    fontSize: '14px',
  },
  input: {
    padding: '14px 16px',
    borderRadius: '10px',
    border: '2px solid #e0e0e0',
    fontSize: '16px',
    transition: 'border-color 0.2s',
    outline: 'none',
  },
  button: {
    padding: '14px',
    borderRadius: '10px',
    border: 'none',
    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    color: 'white',
    fontSize: '16px',
    fontWeight: '600',
    cursor: 'pointer',
    marginTop: '10px',
  },
  backButton: {
    padding: '12px',
    borderRadius: '10px',
    border: '2px solid #e0e0e0',
    background: 'transparent',
    color: '#666',
    fontSize: '14px',
    cursor: 'pointer',
    marginTop: '15px',
    width: '100%',
  },
  error: {
    color: '#e74c3c',
    fontSize: '14px',
    textAlign: 'center',
    margin: 0,
  },
  success: {
    color: '#27ae60',
    fontSize: '14px',
    textAlign: 'center',
    margin: 0,
  },
  loadingContainer: {
    textAlign: 'center',
    padding: '20px',
  },
  hint: {
    fontSize: '12px',
    color: '#999',
    marginTop: '10px',
  },
}

export default ResetPassword
