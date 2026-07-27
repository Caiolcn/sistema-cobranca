import { useState } from 'react'
import { supabase } from './supabaseClient'
import { useNavigate } from 'react-router-dom'
import { trackLead, trackCompleteRegistration, trackStartTrial } from './utils/metaPixel'
import whatsappService from './services/whatsappService'

// Instância WhatsApp da própria plataforma (Mensalli → novo cliente).
// Mesma usada pelos disparos do /admin. O novo usuário ainda não conectou
// a instância dele, então a boas-vindas sai daqui.
const INSTANCIA_MENSALLI = 'instance_c93b3e8d'

export default function Signup({ onCadastroIniciado }) {
  const navigate = useNavigate()

  const [nomeCompleto, setNomeCompleto] = useState('')
  const [telefone, setTelefone] = useState('')
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [loading, setLoading] = useState(false)
  const [erro, setErro] = useState('')
  const [focusField, setFocusField] = useState(null)
  const [mostrarSenha, setMostrarSenha] = useState(false)

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

      // Daqui pra frente a sessão já existe: segura o redirect automático do
      // /signup pro /app/home até este fluxo mandar a pessoa pro onboarding.
      if (onCadastroIniciado) onCadastroIniciado()

      // O telefone vai no metadata porque quem cria a conta agora é o trigger
      // on_auth_user_created (handle_new_user) — ele lê daqui. Os upserts abaixo
      // só complementam o que o banco já criou.
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: email,
        password: senha,
        options: {
          data: {
            nome_completo: nomeCompleto,
            telefone: telefoneLimpo,
            plano: planoSelecionado
          }
        }
      })

      if (authError) throw authError

      const userId = authData.user.id

      // Rede de segurança: se o trigger tiver falhado, o upsert cria a linha.
      // Se o trigger funcionou (caso normal), isso só reescreve os mesmos dados.
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

      // controle_planos e configuracoes_cobranca têm UNIQUE(user_id) e já nascem
      // pelo trigger. Precisa ser upsert com ignoreDuplicates, nunca insert:
      // um insert cru colidiria (23505) e derrubaria o cadastro inteiro.
      const mesReferencia = new Date().toISOString().slice(0, 7)
      const { error: controleError } = await supabase
        .from('controle_planos')
        .upsert({
          user_id: userId,
          plano: planoSelecionado,
          limite_mensal: getLimitePorPlano(planoSelecionado),
          usage_count: 0,
          mes_referencia: mesReferencia,
          status: 'ativo'
        }, { onConflict: 'user_id', ignoreDuplicates: true })

      if (controleError) console.error('Erro ao criar controle de plano:', controleError)

      const { error: configError } = await supabase
        .from('configuracoes_cobranca')
        .upsert({
          user_id: userId,
          enviar_no_dia: true,
          enviar_3_dias_antes: true,
          enviar_3_dias_depois: true
        }, { onConflict: 'user_id', ignoreDuplicates: true })

      if (configError) console.error('Erro ao criar config de cobrança:', configError)

      // Pixel PRIMEIRO: a conta já foi criada, então dispara os eventos de conversão
      // imediatamente — a campanha Meta paga por CompleteRegistration, não pode
      // depender do await da boas-vindas (que pode travar/demorar).
      trackLead()
      trackCompleteRegistration()
      trackStartTrial()

      // Boas-vindas via WhatsApp, enviada pelo número da plataforma (master).
      // Sem await de propósito: o envio pode levar segundos e não pode atrasar a
      // ida pro onboarding. Se falhar, a conta já está criada e a pessoa segue.
      const primeiroNome = nomeCompleto.trim().split(' ')[0]
      const mensagemBoasVindas =
`Oi ${primeiroNome}! 👋

Aqui é o Caio, da equipe do Mensalli. Vi que você acabou de criar sua conta de teste — seja muito bem-vindo(a)! 🎉

Seu teste grátis de 3 dias já está liberado com tudo desbloqueado. Pra ver a mágica acontecer, é só cadastrar seus alunos e ativar a cobrança automática no WhatsApp.

Ficou com qualquer dúvida na hora de configurar? Pode responder aqui mesmo que eu te ajudo. 😊`

      whatsappService
        .enviarMensagem(telefoneLimpo, mensagemBoasVindas, INSTANCIA_MENSALLI)
        .catch((erroBoasVindas) => {
          console.error('Falha ao enviar boas-vindas (não bloqueia cadastro):', erroBoasVindas)
        })

      navigate('/app/onboarding', { replace: true })

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
    // 16px é o mínimo que impede o Safari do iOS de dar zoom ao focar o campo
    fontSize: '16px',
    boxSizing: 'border-box',
    outline: 'none',
    transition: 'border-color 0.2s, box-shadow 0.2s',
    backgroundColor: '#fafafa',
    boxShadow: focusField === field ? '0 0 0 3px rgba(37, 211, 102, 0.1)' : 'none'
  })

  return (
    <div style={{
      // dvh em vez de vh: no Safari do iOS o 100vh conta a barra de endereço
      minHeight: '100dvh',
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
        // clamp encolhe o respiro no celular: com 40px fixos o botão "Criar conta"
        // nascia abaixo da dobra num iPhone SE
        padding: 'clamp(24px, 7vw, 40px)',
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
          Crie sua conta
        </h2>
        <p style={{
          textAlign: 'center',
          marginBottom: '28px',
          color: '#888',
          fontSize: '14px',
          lineHeight: '1.5'
        }}>
          Comece a automatizar suas cobranças agora
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
              autoComplete="name"
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
              autoComplete="tel-national"
              inputMode="numeric"
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
              autoComplete="email"
              inputMode="email"
              autoCapitalize="none"
              autoCorrect="off"
              onFocus={() => setFocusField('email')}
              onBlur={() => setFocusField(null)}
              style={inputStyle('email')}
            />
          </div>

          <div style={{ marginBottom: '24px' }}>
            <label style={{ display: 'block', marginBottom: '6px', color: '#444', fontSize: '13px', fontWeight: '600' }}>
              Senha
            </label>
            {/* Toggle de ver a senha: no celular, errar a senha aqui e só
                descobrir no primeiro login é motivo comum de abandono. */}
            <div style={{ position: 'relative' }}>
              <input
                type={mostrarSenha ? 'text' : 'password'}
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
                placeholder="Mínimo 6 caracteres"
                required
                autoComplete="new-password"
                onFocus={() => setFocusField('senha')}
                onBlur={() => setFocusField(null)}
                style={{ ...inputStyle('senha'), paddingRight: '48px' }}
              />
              <button
                type="button"
                onClick={() => setMostrarSenha(!mostrarSenha)}
                aria-label={mostrarSenha ? 'Ocultar senha' : 'Mostrar senha'}
                style={{
                  position: 'absolute',
                  right: '14px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  padding: '4px',
                  color: '#999',
                  display: 'flex',
                  alignItems: 'center'
                }}
                // App.css pinta todo button de azul no hover; neutraliza aqui
                onMouseOver={(e) => { e.currentTarget.style.background = 'none' }}
              >
                <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
                  {mostrarSenha ? (
                    <path d="M10 4C5 4 1.73 7.11 1 10c.73 2.89 4 6 9 6s8.27-3.11 9-6c-.73-2.89-4-6-9-6zm0 10c-2.21 0-4-1.79-4-4s1.79-4 4-4 4 1.79 4 4-1.79 4-4 4zm0-6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z"/>
                  ) : (
                    <path d="M10 4C5 4 1.73 7.11 1 10c.73 2.89 4 6 9 6s8.27-3.11 9-6c-.73-2.89-4-6-9-6zM2 10c.7-2.24 3.39-5 8-5s7.3 2.76 8 5c-.7 2.24-3.39 5-8 5s-7.3-2.76-8-5zm8 3c-1.66 0-3-1.34-3-3s1.34-3 3-3 3 1.34 3 3-1.34 3-3 3z"/>
                  )}
                </svg>
              </button>
            </div>
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
            {loading ? 'Criando conta...' : 'Criar conta'}
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
