import { useState } from 'react'
import { supabase } from './supabaseClient'
import { useNavigate } from 'react-router-dom'
import PlanCard from './components/PlanCard'

export default function Signup() {
  const navigate = useNavigate()

  // Estados do formulário
  const [nomeCompleto, setNomeCompleto] = useState('')
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [confirmarSenha, setConfirmarSenha] = useState('')
  const [telefone, setTelefone] = useState('')
  const [cpfCnpj, setCpfCnpj] = useState('')
  const [planoSelecionado, setPlanoSelecionado] = useState('starter')

  // Estados de controle
  const [loading, setLoading] = useState(false)
  const [erro, setErro] = useState('')
  const [etapa, setEtapa] = useState(1) // 1 = dados, 2 = plano

  // Função para aplicar máscara de telefone
  const formatarTelefone = (value) => {
    const numeros = value.replace(/\D/g, '')
    if (numeros.length <= 2) {
      return `(${numeros}`
    } else if (numeros.length <= 6) {
      return `(${numeros.slice(0, 2)}) ${numeros.slice(2)}`
    } else if (numeros.length <= 10) {
      return `(${numeros.slice(0, 2)}) ${numeros.slice(2, 6)}-${numeros.slice(6)}`
    } else {
      return `(${numeros.slice(0, 2)}) ${numeros.slice(2, 7)}-${numeros.slice(7, 11)}`
    }
  }

  // Função para aplicar máscara de CPF ou CNPJ
  const formatarCpfCnpj = (value) => {
    const numeros = value.replace(/\D/g, '')
    if (numeros.length <= 11) {
      // CPF: 000.000.000-00
      if (numeros.length <= 3) {
        return numeros
      } else if (numeros.length <= 6) {
        return `${numeros.slice(0, 3)}.${numeros.slice(3)}`
      } else if (numeros.length <= 9) {
        return `${numeros.slice(0, 3)}.${numeros.slice(3, 6)}.${numeros.slice(6)}`
      } else {
        return `${numeros.slice(0, 3)}.${numeros.slice(3, 6)}.${numeros.slice(6, 9)}-${numeros.slice(9)}`
      }
    } else {
      // CNPJ: 00.000.000/0000-00
      if (numeros.length <= 2) {
        return numeros
      } else if (numeros.length <= 5) {
        return `${numeros.slice(0, 2)}.${numeros.slice(2)}`
      } else if (numeros.length <= 8) {
        return `${numeros.slice(0, 2)}.${numeros.slice(2, 5)}.${numeros.slice(5)}`
      } else if (numeros.length <= 12) {
        return `${numeros.slice(0, 2)}.${numeros.slice(2, 5)}.${numeros.slice(5, 8)}/${numeros.slice(8)}`
      } else {
        return `${numeros.slice(0, 2)}.${numeros.slice(2, 5)}.${numeros.slice(5, 8)}/${numeros.slice(8, 12)}-${numeros.slice(12, 14)}`
      }
    }
  }

  const handleTelefoneChange = (e) => {
    const formatted = formatarTelefone(e.target.value)
    setTelefone(formatted)
  }

  const handleCpfCnpjChange = (e) => {
    const formatted = formatarCpfCnpj(e.target.value)
    setCpfCnpj(formatted)
  }

  const getLimitePorPlano = (plano) => {
    const limites = {
      starter: 200,
      pro: 600,
      premium: 3000
    }
    return limites[plano] || 200
  }

  const validarFormulario = () => {
    // Validar nome
    if (!nomeCompleto || nomeCompleto.trim().length < 3) {
      setErro('Nome deve ter pelo menos 3 caracteres')
      return false
    }

    // Validar email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      setErro('Email inválido')
      return false
    }

    // Validar senha
    if (senha.length < 8) {
      setErro('Senha deve ter pelo menos 8 caracteres')
      return false
    }

    if (senha !== confirmarSenha) {
      setErro('Senhas não conferem')
      return false
    }

    // Validar telefone
    const telefoneNumeros = telefone.replace(/\D/g, '')
    if (telefoneNumeros.length < 10 || telefoneNumeros.length > 11) {
      setErro('Telefone inválido (DDD + número)')
      return false
    }

    // Validar CPF/CNPJ
    const cpfCnpjNumeros = cpfCnpj.replace(/\D/g, '')
    if (cpfCnpjNumeros.length !== 11 && cpfCnpjNumeros.length !== 14) {
      setErro('CPF/CNPJ inválido')
      return false
    }

    return true
  }

  const tratarErro = (error) => {
    if (error.message.includes('already registered')) {
      return 'Este email já está cadastrado. Faça login ou recupere sua senha.'
    }
    if (error.message.includes('invalid email')) {
      return 'Email inválido. Verifique e tente novamente.'
    }
    if (error.message.includes('weak password') || error.message.includes('Password should be at least')) {
      return 'Senha muito fraca. Use pelo menos 8 caracteres.'
    }
    return error.message || 'Erro ao criar conta. Tente novamente mais tarde.'
  }

  const handleProximaEtapa = (e) => {
    e.preventDefault()
    setErro('')

    // Validar apenas os campos da etapa 1
    if (!nomeCompleto || nomeCompleto.trim().length < 3) {
      setErro('Nome deve ter pelo menos 3 caracteres')
      return
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      setErro('Email inválido')
      return
    }

    if (senha.length < 8) {
      setErro('Senha deve ter pelo menos 8 caracteres')
      return
    }

    if (senha !== confirmarSenha) {
      setErro('Senhas não conferem')
      return
    }

    const telefoneNumeros = telefone.replace(/\D/g, '')
    if (telefoneNumeros.length < 10 || telefoneNumeros.length > 11) {
      setErro('Telefone inválido (DDD + número)')
      return
    }

    const cpfCnpjNumeros = cpfCnpj.replace(/\D/g, '')
    if (cpfCnpjNumeros.length !== 11 && cpfCnpjNumeros.length !== 14) {
      setErro('CPF/CNPJ inválido')
      return
    }

    // Se tudo válido, avança para etapa 2
    setEtapa(2)
  }

  const handleCadastro = async (e) => {
    e.preventDefault()
    setLoading(true)
    setErro('')

    try {
      // 1. Validar formulário completo
      if (!validarFormulario()) {
        setLoading(false)
        return
      }

      // 2. Criar usuário no Supabase Auth
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: email,
        password: senha,
        options: {
          data: {
            nome_completo: nomeCompleto,
            telefone: telefone,
            cpf_cnpj: cpfCnpj,
            plano: planoSelecionado
          }
        }
      })

      if (authError) throw authError

      const userId = authData.user.id

      // 3. Atualizar/criar registro completo em usuarios (UPSERT)
      // O Supabase já cria o registro automaticamente, então vamos atualizar
      const { error: upsertError } = await supabase
        .from('usuarios')
        .upsert({
          id: userId,
          email: email,
          nome_completo: nomeCompleto,
          telefone: telefone,
          cpf_cnpj: cpfCnpj,
          plano: planoSelecionado,
          limite_mensal: getLimitePorPlano(planoSelecionado),
          trial_fim: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(), // 3 dias
          trial_ativo: true,
          plano_pago: false,
          status_conta: 'ativo'
        }, {
          onConflict: 'id'
        })

      if (upsertError) {
        console.error('Erro detalhado ao salvar usuário:', upsertError)
        throw new Error(`Database error: ${upsertError.message || upsertError.code || 'Unknown error'}`)
      }

      // 4. Criar registro em controle_planos
      const mesReferencia = new Date().toISOString().slice(0, 7) // YYYY-MM
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

      // 5. Login automático já está ativo (sessão criada pelo signUp)
      // 6. Redirecionar para dashboard
      navigate('/app/home')

    } catch (error) {
      console.error('Erro ao cadastrar:', error)
      setErro(tratarErro(error))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      padding: '20px'
    }}>
      <div style={{
        backgroundColor: 'white',
        padding: '40px',
        borderRadius: '12px',
        boxShadow: '0 8px 32px rgba(0,0,0,0.1)',
        maxWidth: '500px',
        width: '100%'
      }}>
        <h2 style={{ textAlign: 'center', marginBottom: '10px', color: '#333' }}>
          {etapa === 1 ? 'Criar Conta' : 'Escolha seu plano'}
        </h2>
        <p style={{ textAlign: 'center', marginBottom: '30px', color: '#666', fontSize: '14px' }}>
          {etapa === 1 ? 'Preencha os dados abaixo para começar' : 'Teste grátis por 3 dias, sem compromisso'}
        </p>

        {erro && (
          <div style={{
            marginBottom: '20px',
            padding: '12px',
            backgroundColor: '#ffebee',
            border: '1px solid #f44336',
            borderRadius: '6px',
            color: '#c62828',
            fontSize: '14px'
          }}>
            {erro}
          </div>
        )}

        {/* ETAPA 1: Dados Pessoais */}
        {etapa === 1 && (
          <form onSubmit={handleProximaEtapa}>
            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', marginBottom: '6px', color: '#333', fontSize: '14px', fontWeight: '500' }}>
                Nome Completo
              </label>
              <input
                type="text"
                value={nomeCompleto}
                onChange={(e) => setNomeCompleto(e.target.value)}
                placeholder="João Silva"
                required
                style={{
                  width: '100%',
                  padding: '12px',
                  border: '1px solid #ddd',
                  borderRadius: '6px',
                  fontSize: '14px',
                  boxSizing: 'border-box'
                }}
              />
            </div>

            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', marginBottom: '6px', color: '#333', fontSize: '14px', fontWeight: '500' }}>
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="joao@exemplo.com"
                required
                style={{
                  width: '100%',
                  padding: '12px',
                  border: '1px solid #ddd',
                  borderRadius: '6px',
                  fontSize: '14px',
                  boxSizing: 'border-box'
                }}
              />
            </div>

            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', marginBottom: '6px', color: '#333', fontSize: '14px', fontWeight: '500' }}>
                Senha (mínimo 8 caracteres)
              </label>
              <input
                type="password"
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
                placeholder="••••••••"
                required
                style={{
                  width: '100%',
                  padding: '12px',
                  border: '1px solid #ddd',
                  borderRadius: '6px',
                  fontSize: '14px',
                  boxSizing: 'border-box'
                }}
              />
            </div>

            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', marginBottom: '6px', color: '#333', fontSize: '14px', fontWeight: '500' }}>
                Confirmar Senha
              </label>
              <input
                type="password"
                value={confirmarSenha}
                onChange={(e) => setConfirmarSenha(e.target.value)}
                placeholder="••••••••"
                required
                style={{
                  width: '100%',
                  padding: '12px',
                  border: '1px solid #ddd',
                  borderRadius: '6px',
                  fontSize: '14px',
                  boxSizing: 'border-box'
                }}
              />
            </div>

            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', marginBottom: '6px', color: '#333', fontSize: '14px', fontWeight: '500' }}>
                Telefone (com DDD)
              </label>
              <input
                type="tel"
                value={telefone}
                onChange={handleTelefoneChange}
                placeholder="(11) 99999-9999"
                maxLength={15}
                required
                style={{
                  width: '100%',
                  padding: '12px',
                  border: '1px solid #ddd',
                  borderRadius: '6px',
                  fontSize: '14px',
                  boxSizing: 'border-box'
                }}
              />
            </div>

            <div style={{ marginBottom: '24px' }}>
              <label style={{ display: 'block', marginBottom: '6px', color: '#333', fontSize: '14px', fontWeight: '500' }}>
                CPF ou CNPJ
              </label>
              <input
                type="text"
                value={cpfCnpj}
                onChange={handleCpfCnpjChange}
                placeholder="000.000.000-00"
                maxLength={18}
                required
                style={{
                  width: '100%',
                  padding: '12px',
                  border: '1px solid #ddd',
                  borderRadius: '6px',
                  fontSize: '14px',
                  boxSizing: 'border-box'
                }}
              />
            </div>

            <button
              type="submit"
              style={{
                width: '100%',
                padding: '14px',
                backgroundColor: '#667eea',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                fontSize: '16px',
                fontWeight: '600',
                cursor: 'pointer',
                transition: 'background-color 0.2s'
              }}
              onMouseOver={(e) => e.target.style.backgroundColor = '#5568d3'}
              onMouseOut={(e) => e.target.style.backgroundColor = '#667eea'}
            >
              Próximo: Escolher Plano →
            </button>
          </form>
        )}

        {/* ETAPA 2: Escolher Plano */}
        {etapa === 2 && (
          <form onSubmit={handleCadastro}>
            <div style={{ marginBottom: '24px' }}>
              <PlanCard
                plano="Starter"
                limite="200"
                preco="R$ 49,90/mês"
                descricao="50 clientes ativos"
                selected={planoSelecionado === 'starter'}
                onClick={() => setPlanoSelecionado('starter')}
              />
              <PlanCard
                plano="Pro"
                limite="600"
                preco="R$ 99,90/mês"
                descricao="150 clientes ativos"
                popular={true}
                selected={planoSelecionado === 'pro'}
                onClick={() => setPlanoSelecionado('pro')}
              />
              <PlanCard
                plano="Premium"
                limite="3.000"
                preco="R$ 149,90/mês"
                descricao="500 clientes ativos"
                selected={planoSelecionado === 'premium'}
                onClick={() => setPlanoSelecionado('premium')}
              />
            </div>

            {/* Info do trial */}
            <div style={{
              backgroundColor: '#f0fdf4',
              border: '1px solid #86efac',
              borderRadius: '8px',
              padding: '12px 16px',
              marginBottom: '20px',
              display: 'flex',
              alignItems: 'center',
              gap: '10px'
            }}>
              <span style={{ fontSize: '20px' }}>🎁</span>
              <div>
                <p style={{ margin: 0, fontSize: '14px', fontWeight: '600', color: '#166534' }}>
                  3 dias grátis para testar
                </p>
                <p style={{ margin: 0, fontSize: '12px', color: '#15803d' }}>
                  Você só será cobrado após o período de teste
                </p>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '12px' }}>
              <button
                type="button"
                onClick={() => setEtapa(1)}
                style={{
                  flex: 1,
                  padding: '14px',
                  backgroundColor: '#f5f5f5',
                  color: '#333',
                  border: 'none',
                  borderRadius: '6px',
                  fontSize: '16px',
                  fontWeight: '600',
                  cursor: 'pointer',
                  transition: 'background-color 0.2s'
                }}
                onMouseOver={(e) => e.target.style.backgroundColor = '#e0e0e0'}
                onMouseOut={(e) => e.target.style.backgroundColor = '#f5f5f5'}
              >
                ← Voltar
              </button>
              <button
                type="submit"
                disabled={loading}
                style={{
                  flex: 2,
                  padding: '14px',
                  backgroundColor: loading ? '#ccc' : '#22c55e',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  fontSize: '16px',
                  fontWeight: '600',
                  cursor: loading ? 'not-allowed' : 'pointer',
                  transition: 'background-color 0.2s'
                }}
                onMouseOver={(e) => {
                  if (!loading) e.target.style.backgroundColor = '#16a34a'
                }}
                onMouseOut={(e) => {
                  if (!loading) e.target.style.backgroundColor = '#22c55e'
                }}
              >
                {loading ? 'Criando conta...' : 'Iniciar Teste Grátis'}
              </button>
            </div>
          </form>
        )}

        <p style={{ textAlign: 'center', marginTop: '20px', fontSize: '14px', color: '#666' }}>
          Já tem uma conta?
          <a
            href="/login"
            style={{
              color: '#667eea',
              marginLeft: '5px',
              textDecoration: 'none',
              fontWeight: '500'
            }}
          >
            Fazer login
          </a>
        </p>
      </div>
    </div>
  )
}
