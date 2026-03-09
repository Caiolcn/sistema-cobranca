import { useState } from 'react'
import { supabase } from './supabaseClient'
import { useNavigate } from 'react-router-dom'
import { trackLead, trackCompleteRegistration, trackStartTrial } from './utils/metaPixel'

export default function Signup() {
  const navigate = useNavigate()

  const [nomeCompleto, setNomeCompleto] = useState('')
  const [telefone, setTelefone] = useState('')
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [loading, setLoading] = useState(false)
  const [erro, setErro] = useState('')
  const [focusField, setFocusField] = useState(null)

  const formatarTelefone = (valor) => {
    const nums = valor.replace(/\D/g, '').slice(0, 11)
    if (nums.length <= 2) return nums
    if (nums.length <= 7) return `(${nums.slice(0, 2)}) ${nums.slice(2)}`
    return `(${nums.slice(0, 2)}) ${nums.slice(2, 7)}-${nums.slice(7)}`
  }

  const getLimitePorPlano = (plano) => {
    const limites = { starter: 200, pro: 600, premium: 3000 }
    return limites[plano] || 600
  }

  const tratarErro = (error) => {
    if (error.message.includes('already registered')) {
      return 'Este email já está cadastrado. Faça login ou recupere sua senha.'
    }
    if (error.message.includes('invalid email')) {
      return 'Email inválido. Verifique e tente novamente.'
    }
    if (error.message.includes('weak password') || error.message.includes('Password should be at least')) {
      return 'Senha muito fraca. Use pelo menos 6 caracteres.'
    }
    return error.message || 'Erro ao criar conta. Tente novamente.'
  }

  const handleCadastro = async (e) => {
    e.preventDefault()
    setLoading(true)
    setErro('')

    try {
      if (!nomeCompleto || nomeCompleto.trim().length < 3) {
        setErro('Nome deve ter pelo menos 3 caracteres')
        setLoading(false)
        return
      }

      const telefoneLimpo = telefone.replace(/\D/g, '')
      if (telefoneLimpo.length < 10 || telefoneLimpo.length > 11) {
        setErro('WhatsApp inválido. Use DDD + número.')
        setLoading(false)
        return
      }

      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
      if (!emailRegex.test(email)) {
        setErro('Email inválido')
        setLoading(false)
        return
      }

      if (senha.length < 6) {
        setErro('Senha deve ter pelo menos 6 caracteres')
        setLoading(false)
        return
      }

      const planoSelecionado = 'pro'

      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: email,
        password: senha,
        options: {
          data: {
            nome_completo: nomeCompleto,
            plano: planoSelecionado
          }
        }
      })

      if (authError) throw authError

      const userId = authData.user.id

      const { error: upsertError } = await supabase
        .from('usuarios')
        .upsert({
          id: userId,
          email: email,
          nome_completo: nomeCompleto,
          telefone: telefoneLimpo,
          plano: planoSelecionado,
          limite_mensal: getLimitePorPlano(planoSelecionado),
          trial_fim: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
          trial_ativo: true,
          plano_pago: false,
          status_conta: 'ativo'
        }, { onConflict: 'id' })

      if (upsertError) throw new Error(`Database error: ${upsertError.message || upsertError.code}`)

      const mesReferencia = new Date().toISOString().slice(0, 7)
      const { error: controleError } = await supabase
        .from('controle_planos')
        .insert({
          user_id: userId,
          plano: planoSelecionado,
          limite_mensal: getLimitePorPlano(planoSelecionado),
          usage_count: 0,
          mes_referencia: mesReferencia,
          status: 'ativo'
        })

      if (controleError) throw controleError

      const { error: configError } = await supabase
        .from('configuracoes_cobranca')
        .insert({
          user_id: userId,
          enviar_no_dia: true,
          enviar_3_dias_antes: true,
          enviar_3_dias_depois: true,
          envio_habilitado: true
        })

      if (configError) console.error('Erro ao criar config de cobrança:', configError)

      trackLead()
      trackCompleteRegistration()
      trackStartTrial()

      navigate('/app/home')

    } catch (error) {
      console.error('Erro ao cadastrar:', error)
      setErro(tratarErro(error))
    } finally {
      setLoading(false)
    }
  }

  const inputStyle = (field) => ({
    width: '100%',
    padding: '14px 16px',
    border: `2px solid ${focusField === field ? '#25D366' : '#e8e8e8'}`,
    borderRadius: '10px',
    fontSize: '15px',
    boxSizing: 'border-box',
    outline: 'none',
    transition: 'border-color 0.2s, box-shadow 0.2s',
    backgroundColor: '#fafafa',
    boxShadow: focusField === field ? '0 0 0 3px rgba(37, 211, 102, 0.1)' : 'none'
  })

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: '#f8faf9',
      padding: '20px',
      fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
    }}>
      <a href="/" style={{ display: 'flex', alignItems: 'center', textDecoration: 'none', marginBottom: '28px' }}>
        <img
          src="/Logo-Full.png"
          alt="Mensalli"
          style={{ height: '44px', width: 'auto' }}
        />
      </a>

      <div style={{
        backgroundColor: 'white',
        padding: '40px',
        borderRadius: '16px',
        boxShadow: '0 4px 24px rgba(0,0,0,0.06)',
        border: '1px solid #eee',
        maxWidth: '440px',
        width: '100%'
      }}>
        <h2 style={{
          textAlign: 'center',
          marginBottom: '8px',
          color: '#1a1a1a',
          fontSize: '24px',
          fontWeight: '700'
        }}>
          Comece seu teste grátis
        </h2>
        <p style={{
          textAlign: 'center',
          marginBottom: '28px',
          color: '#888',
          fontSize: '14px',
          lineHeight: '1.5'
        }}>
          3 dias grátis, sem cartão de crédito
        </p>

        {erro && (
          <div style={{
            marginBottom: '20px',
            padding: '12px 16px',
            backgroundColor: '#fef2f2',
            border: '1px solid #fecaca',
            borderRadius: '10px',
            color: '#dc2626',
            fontSize: '14px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}>
            <span style={{ fontSize: '16px' }}>!</span>
            {erro}
          </div>
        )}

        <form onSubmit={handleCadastro}>
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', marginBottom: '6px', color: '#444', fontSize: '13px', fontWeight: '600' }}>
              Seu nome
            </label>
            <input
              type="text"
              value={nomeCompleto}
              onChange={(e) => setNomeCompleto(e.target.value)}
              placeholder="Como seus clientes te conhecem"
              required
              onFocus={() => setFocusField('nome')}
              onBlur={() => setFocusField(null)}
              style={inputStyle('nome')}
            />
          </div>

          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', marginBottom: '6px', color: '#444', fontSize: '13px', fontWeight: '600' }}>
              WhatsApp
            </label>
            <input
              type="tel"
              value={telefone}
              onChange={(e) => setTelefone(formatarTelefone(e.target.value))}
              placeholder="(11) 99999-9999"
              required
              onFocus={() => setFocusField('telefone')}
              onBlur={() => setFocusField(null)}
              style={inputStyle('telefone')}
            />
          </div>

          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', marginBottom: '6px', color: '#444', fontSize: '13px', fontWeight: '600' }}>
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="seu@email.com"
              required
              onFocus={() => setFocusField('email')}
              onBlur={() => setFocusField(null)}
              style={inputStyle('email')}
            />
          </div>

          <div style={{ marginBottom: '24px' }}>
            <label style={{ display: 'block', marginBottom: '6px', color: '#444', fontSize: '13px', fontWeight: '600' }}>
              Senha
            </label>
            <input
              type="password"
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              placeholder="Mínimo 6 caracteres"
              required
              onFocus={() => setFocusField('senha')}
              onBlur={() => setFocusField(null)}
              style={inputStyle('senha')}
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%',
              padding: '15px',
              backgroundColor: loading ? '#9ca3af' : '#25D366',
              color: 'white',
              border: 'none',
              borderRadius: '10px',
              fontSize: '16px',
              fontWeight: '600',
              cursor: loading ? 'not-allowed' : 'pointer',
              transition: 'all 0.2s',
              boxShadow: loading ? 'none' : '0 4px 14px rgba(37, 211, 102, 0.3)'
            }}
            onMouseOver={(e) => { if (!loading) { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 6px 20px rgba(37, 211, 102, 0.4)' } }}
            onMouseOut={(e) => { if (!loading) { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 4px 14px rgba(37, 211, 102, 0.3)' } }}
          >
            {loading ? 'Criando conta...' : 'Criar conta grátis'}
          </button>
        </form>

        <p style={{
          textAlign: 'center',
          marginTop: '12px',
          fontSize: '12px',
          color: '#aaa',
          lineHeight: '1.5'
        }}>
          Ao criar sua conta, você concorda com nossos Termos de Uso
        </p>

        <div style={{
          marginTop: '20px',
          paddingTop: '20px',
          borderTop: '1px solid #f0f0f0',
          textAlign: 'center'
        }}>
          <p style={{ fontSize: '14px', color: '#666', margin: 0 }}>
            Já tem uma conta?{' '}
            <a
              href="/login"
              style={{
                color: '#25D366',
                fontWeight: '600',
                textDecoration: 'none'
              }}
              onMouseOver={(e) => e.currentTarget.style.textDecoration = 'underline'}
              onMouseOut={(e) => e.currentTarget.style.textDecoration = 'none'}
            >
              Entrar
            </a>
          </p>
        </div>
      </div>

      {/* Social proof sutil */}
      <p style={{
        marginTop: '24px',
        fontSize: '13px',
        color: '#999',
        textAlign: 'center'
      }}>
        Usado por academias, escolas de música, studios e personal trainers
      </p>
    </div>
  )
}
