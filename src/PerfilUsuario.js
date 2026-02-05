import { useState, useEffect } from 'react'
import { supabase } from './supabaseClient'
import ConfirmModal from './ConfirmModal'

export default function PerfilUsuario({ onClose }) {
  const [loading, setLoading] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [feedbackModal, setFeedbackModal] = useState({ isOpen: false, type: 'success', title: '', message: '' })

  // Dados do usuário
  const [email, setEmail] = useState('')
  const [nomeCompleto, setNomeCompleto] = useState('')
  const [telefone, setTelefone] = useState('')
  const [cpfCnpj, setCpfCnpj] = useState('')
  const [plano, setPlano] = useState('starter')
  const [statusConta, setStatusConta] = useState('ativo')
  const [limiteMe, setLimiteMensal] = useState(100)
  const [mensagensUsadas, setMensagensUsadas] = useState(0)

  useEffect(() => {
    carregarDados()
  }, [])

  const carregarDados = async () => {
    setLoading(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()

      if (user) {
        // Buscar dados do usuário
        const { data, error } = await supabase
          .from('usuarios')
          .select('email, nome_completo, telefone, cpf_cnpj, plano, status_conta, limite_mensal')
          .eq('id', user.id)
          .single()

        if (data) {
          setEmail(data.email || '')
          setNomeCompleto(data.nome_completo || '')
          setTelefone(data.telefone || '')
          setCpfCnpj(data.cpf_cnpj || '')
          // Mapear planos antigos para novos
          let planoAtual = data.plano || 'starter'
          if (planoAtual === 'basico') planoAtual = 'starter'
          if (planoAtual === 'enterprise') planoAtual = 'premium'
          if (planoAtual === 'business') planoAtual = 'premium'
          setPlano(planoAtual)
          setStatusConta(data.status_conta || 'ativo')
          setLimiteMensal(data.limite_mensal || 100)
        } else if (error && error.code === 'PGRST116') {
          // Usuário não existe na tabela, usar dados do auth
          setEmail(user.email)
        }

        // Buscar uso de mensagens
        const { data: controleData } = await supabase
          .from('controle_planos')
          .select('usage_count')
          .eq('user_id', user.id)
          .single()

        if (controleData) {
          setMensagensUsadas(controleData.usage_count || 0)
        }
      }
    } catch (error) {
      console.error('Erro ao carregar dados:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSalvando(true)

    try {
      const { data: { user } } = await supabase.auth.getUser()

      const { error } = await supabase
        .from('usuarios')
        .upsert({
          id: user.id,
          email: user.email,
          nome_completo: nomeCompleto,
          telefone: telefone,
          cpf_cnpj: cpfCnpj,
          plano: plano,
          status_conta: statusConta
        })

      if (error) throw error

      setFeedbackModal({ isOpen: true, type: 'success', title: 'Salvo!', message: 'Dados atualizados com sucesso!' })
    } catch (error) {
      setFeedbackModal({ isOpen: true, type: 'danger', title: 'Erro', message: 'Erro ao salvar: ' + error.message })
    } finally {
      setSalvando(false)
    }
  }

  if (loading) {
    return (
      <div style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0,0,0,0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000
      }}>
        <div style={{ color: 'white', fontSize: '18px' }}>Carregando...</div>
      </div>
    )
  }

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.5)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000,
      padding: '20px'
    }}>
      <div style={{
        backgroundColor: 'white',
        borderRadius: '10px',
        padding: '30px',
        width: '100%',
        maxWidth: '600px',
        maxHeight: '90vh',
        overflowY: 'auto'
      }}>
        <h2 style={{ marginBottom: '20px' }}>Meu Perfil</h2>

        {/* Card de uso de mensagens */}
        <div style={{
          backgroundColor: '#f0f7ff',
          border: '2px solid #2196F3',
          borderRadius: '8px',
          padding: '20px',
          marginBottom: '25px'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
            <h3 style={{ margin: 0, fontSize: '16px', color: '#333' }}>Uso de Mensagens</h3>
            <span style={{ fontSize: '12px', color: '#666' }}>Mês atual</span>
          </div>

          <div style={{ marginBottom: '12px' }}>
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              fontSize: '14px',
              marginBottom: '6px',
              color: '#555'
            }}>
              <span>Enviadas: <strong>{mensagensUsadas}</strong></span>
              <span>Limite: <strong>{limiteMe}</strong></span>
            </div>

            {/* Barra de progresso */}
            <div style={{
              width: '100%',
              height: '10px',
              backgroundColor: '#e0e0e0',
              borderRadius: '5px',
              overflow: 'hidden'
            }}>
              <div style={{
                width: `${Math.min((mensagensUsadas / limiteMe) * 100, 100)}%`,
                height: '100%',
                backgroundColor: mensagensUsadas >= limiteMe ? '#f44336' : mensagensUsadas >= limiteMe * 0.8 ? '#ff9800' : '#4CAF50',
                transition: 'width 0.3s ease'
              }} />
            </div>
          </div>

          <div style={{ fontSize: '13px', color: '#666' }}>
            {limiteMe - mensagensUsadas > 0 ? (
              <span>Restam <strong style={{ color: '#2196F3' }}>{limiteMe - mensagensUsadas} mensagens</strong> neste mês</span>
            ) : (
              <span style={{ color: '#f44336', fontWeight: 'bold' }}>Limite mensal atingido!</span>
            )}
          </div>
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '15px' }}>
            <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
              E-mail
            </label>
            <input
              type="email"
              value={email}
              disabled
              style={{
                width: '100%',
                padding: '10px',
                border: '1px solid #ddd',
                borderRadius: '4px',
                backgroundColor: '#f5f5f5',
                boxSizing: 'border-box'
              }}
            />
            <p style={{ fontSize: '11px', color: '#666', marginTop: '3px' }}>
              O e-mail não pode ser alterado
            </p>
          </div>

          <div style={{ marginBottom: '15px' }}>
            <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
              Nome Completo *
            </label>
            <input
              type="text"
              placeholder="Seu nome completo"
              value={nomeCompleto}
              onChange={(e) => setNomeCompleto(e.target.value)}
              required
              style={{
                width: '100%',
                padding: '10px',
                border: '1px solid #ddd',
                borderRadius: '4px',
                boxSizing: 'border-box'
              }}
            />
          </div>

          <div style={{ marginBottom: '15px' }}>
            <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
              Telefone/WhatsApp
            </label>
            <input
              type="tel"
              placeholder="62982466639"
              value={telefone}
              onChange={(e) => setTelefone(e.target.value)}
              style={{
                width: '100%',
                padding: '10px',
                border: '1px solid #ddd',
                borderRadius: '4px',
                boxSizing: 'border-box'
              }}
            />
          </div>

          <div style={{ marginBottom: '15px' }}>
            <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
              CPF/CNPJ
            </label>
            <input
              type="text"
              placeholder="000.000.000-00"
              value={cpfCnpj}
              onChange={(e) => setCpfCnpj(e.target.value)}
              style={{
                width: '100%',
                padding: '10px',
                border: '1px solid #ddd',
                borderRadius: '4px',
                boxSizing: 'border-box'
              }}
            />
          </div>

          <div style={{ marginBottom: '15px' }}>
            <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
              Plano Atual
            </label>
            <select
              value={plano}
              onChange={(e) => setPlano(e.target.value)}
              disabled
              style={{
                width: '100%',
                padding: '10px',
                border: '1px solid #ddd',
                borderRadius: '4px',
                backgroundColor: '#f5f5f5',
                boxSizing: 'border-box'
              }}
            >
              <option value="starter">Starter (200 mensagens/mês)</option>
              <option value="pro">Pro (500 mensagens/mês)</option>
              <option value="premium">Premium (3.000 mensagens/mês)</option>
            </select>
            <p style={{ fontSize: '11px', color: '#666', marginTop: '3px' }}>
              Entre em contato para alterar seu plano
            </p>
          </div>

          <div style={{ marginBottom: '15px' }}>
            <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
              Status da Conta
            </label>
            <input
              type="text"
              value={statusConta === 'ativo' ? 'Ativa' : statusConta}
              disabled
              style={{
                width: '100%',
                padding: '10px',
                border: '1px solid #ddd',
                borderRadius: '4px',
                backgroundColor: '#f5f5f5',
                color: statusConta === 'ativo' ? '#4CAF50' : '#f44336',
                fontWeight: 'bold',
                boxSizing: 'border-box'
              }}
            />
          </div>

          <div style={{ display: 'flex', gap: '10px', marginTop: '25px' }}>
            <button
              type="submit"
              disabled={salvando}
              style={{
                flex: 1,
                padding: '12px',
                backgroundColor: '#4CAF50',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: salvando ? 'not-allowed' : 'pointer',
                fontWeight: 'bold',
                opacity: salvando ? 0.7 : 1
              }}
            >
              {salvando ? 'Salvando...' : 'Salvar Alterações'}
            </button>
            <button
              type="button"
              onClick={onClose}
              style={{
                flex: 1,
                padding: '12px',
                backgroundColor: '#ccc',
                color: '#333',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontWeight: 'bold'
              }}
            >
              Fechar
            </button>
          </div>
        </form>
      </div>

      {/* Modal de Feedback */}
      <ConfirmModal
        isOpen={feedbackModal.isOpen}
        onClose={() => {
          setFeedbackModal({ ...feedbackModal, isOpen: false })
          if (feedbackModal.type === 'success') onClose()
        }}
        onConfirm={() => {
          setFeedbackModal({ ...feedbackModal, isOpen: false })
          if (feedbackModal.type === 'success') onClose()
        }}
        title={feedbackModal.title}
        message={feedbackModal.message}
        confirmText="OK"
        type={feedbackModal.type}
      />
    </div>
  )
}
