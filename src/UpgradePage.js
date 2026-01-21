import { useState, useEffect, useRef } from 'react'
import { Icon } from '@iconify/react'
import { useNavigate } from 'react-router-dom'
import { useTrialStatus } from './useTrialStatus'
import { mercadoPagoService } from './services/mercadoPagoService'
import { supabase } from './supabaseClient'

export default function UpgradePage() {
  const navigate = useNavigate()
  const { diasRestantes, isExpired } = useTrialStatus()
  const [loading, setLoading] = useState(false)
  const [assinaturaAtiva, setAssinaturaAtiva] = useState(null)
  const [erro, setErro] = useState(null)
  const [planoSelecionado, setPlanoSelecionado] = useState(null)
  const [metodoPagamento, setMetodoPagamento] = useState(null) // 'cartao' ou 'pix'
  const [pixData, setPixData] = useState(null) // Dados do Pix gerado
  const [copiado, setCopiado] = useState(false)
  const [pagamentoConfirmado, setPagamentoConfirmado] = useState(false) // Tela de sucesso
  const [verificandoPagamento, setVerificandoPagamento] = useState(false)
  const pollingRef = useRef(null)

  // Verificar se já tem assinatura ativa
  useEffect(() => {
    verificarAssinatura()
  }, [])

  // Polling para verificar pagamento Pix
  useEffect(() => {
    if (pixData && !pagamentoConfirmado) {
      setVerificandoPagamento(true)

      // Verificar a cada 5 segundos
      pollingRef.current = setInterval(async () => {
        try {
          const { data: { user } } = await supabase.auth.getUser()
          if (!user) return

          // Verificar se o usuário foi ativado
          const { data: usuario } = await supabase
            .from('usuarios')
            .select('plano_pago, plano')
            .eq('id', user.id)
            .single()

          if (usuario?.plano_pago) {
            clearInterval(pollingRef.current)
            setVerificandoPagamento(false)
            setPagamentoConfirmado(true)
          }
        } catch (error) {
          console.error('Erro ao verificar pagamento:', error)
        }
      }, 5000)

      // Limpar intervalo após 10 minutos (timeout)
      const timeout = setTimeout(() => {
        if (pollingRef.current) {
          clearInterval(pollingRef.current)
          setVerificandoPagamento(false)
        }
      }, 600000)

      return () => {
        if (pollingRef.current) clearInterval(pollingRef.current)
        clearTimeout(timeout)
      }
    }
  }, [pixData, pagamentoConfirmado])

  const verificarAssinatura = async () => {
    const assinatura = await mercadoPagoService.verificarAssinaturaAtiva()
    setAssinaturaAtiva(assinatura)
  }

  const handleSelecionarPlano = (planoId) => {
    setPlanoSelecionado(planoId)
    setMetodoPagamento(null)
    setPixData(null)
    setErro(null)
  }

  const handleSelecionarMetodo = async (metodo) => {
    setMetodoPagamento(metodo)
    setErro(null)

    if (metodo === 'cartao') {
      // Redirecionar para checkout do MP
      await handlePagarCartao()
    } else if (metodo === 'pix') {
      // Gerar QR Code Pix
      await handleGerarPix()
    }
  }

  const handlePagarCartao = async () => {
    try {
      setLoading(true)
      setErro(null)

      console.log('🚀 Criando assinatura para plano:', planoSelecionado)

      // Criar assinatura via Edge Function
      const { init_point, subscription_id } = await mercadoPagoService.criarAssinatura(planoSelecionado)

      console.log('✅ Assinatura criada:', subscription_id)
      console.log('🔗 Redirecionando para:', init_point)

      // Redirecionar para checkout do Mercado Pago
      window.location.href = init_point

    } catch (error) {
      console.error('❌ Erro ao contratar plano:', error)
      setErro(error.message || 'Erro ao processar pagamento. Tente novamente.')
      setLoading(false)
    }
  }

  const handleGerarPix = async () => {
    try {
      setLoading(true)
      setErro(null)

      console.log('💠 Gerando Pix para plano:', planoSelecionado)

      // Criar pagamento Pix via Edge Function
      const data = await mercadoPagoService.criarPagamentoPix(planoSelecionado)

      console.log('✅ Pix gerado:', data.payment_id)

      setPixData(data)
      setLoading(false)

    } catch (error) {
      console.error('❌ Erro ao gerar Pix:', error)
      setErro(error.message || 'Erro ao gerar Pix. Tente novamente.')
      setLoading(false)
    }
  }

  const handleCopiarPix = () => {
    if (pixData?.pix?.qr_code) {
      navigator.clipboard.writeText(pixData.pix.qr_code)
      setCopiado(true)
      setTimeout(() => setCopiado(false), 3000)
    }
  }

  const handleCancelarAssinatura = async () => {
    if (!window.confirm('Tem certeza que deseja cancelar sua assinatura?')) {
      return
    }

    try {
      setLoading(true)
      await mercadoPagoService.cancelarAssinatura()
      window.alert('Assinatura cancelada com sucesso!')
      setAssinaturaAtiva(null)
      setLoading(false)
    } catch (error) {
      window.alert(`Erro ao cancelar: ${error.message}`)
      setLoading(false)
    }
  }

  const handleVoltar = () => {
    if (pixData) {
      setPixData(null)
      setMetodoPagamento(null)
    } else if (metodoPagamento) {
      setMetodoPagamento(null)
    } else if (planoSelecionado) {
      setPlanoSelecionado(null)
    } else {
      navigate('/app/home')
    }
  }

  const handleSuporteWhatsApp = () => {
    window.open('https://wa.me/5562999999999?text=Olá! Preciso de ajuda com o MensalliZap', '_blank')
  }

  const planos = [
    {
      id: 'starter',
      nome: 'Starter',
      preco: 'R$ 49,90',
      periodo: '/mês',
      paraQuem: 'Ideal para studios e escolas com até 50 alunos',
      features: [
        'Até 50 clientes ativos',
        '200 mensagens automáticas por mês',
        '1 template de cobrança personalizável',
        'Lembretes 3 dias antes do vencimento',
        'Dashboard com visão geral',
        'Exportação de relatórios (CSV)',
        'Suporte por e-mail (48h)'
      ],
      destaque: false,
      cor: '#78909c',
      dica: '💡 Você economiza ~2h/semana em cobranças manuais',
      cta: 'Começar com Starter'
    },
    {
      id: 'pro',
      nome: 'Pro',
      preco: 'R$ 99,90',
      periodo: '/mês',
      paraQuem: 'Ideal para academias e escolas com 50-150 alunos',
      features: [
        'Até 150 clientes ativos',
        '500 mensagens automáticas por mês',
        '3 templates personalizáveis',
        'Lembretes inteligentes (3 e 5 dias antes)',
        'Dashboard completo com gráficos',
        'Aging Report e Receita Projetada',
        'Suporte via WhatsApp (24h)'
      ],
      destaque: true,
      cor: '#667eea',
      dica: '💡 Você economiza ~5h/semana + Reduz inadimplência em 40%',
      cta: 'Assinar mais popular'
    },
    {
      id: 'premium',
      nome: 'Premium',
      preco: 'R$ 149,90',
      periodo: '/mês',
      paraQuem: 'Ideal para redes e grandes negócios com 150+ alunos',
      features: [
        'Até 500 clientes ativos',
        '3.000 mensagens automáticas por mês',
        'Templates ilimitados',
        'Tudo do plano Pro incluído',
        'Webhooks para integração (n8n)',
        'Consultoria inicial de setup (1h)',
        'Suporte prioritário (4h)',
        'Acesso antecipado a novos recursos'
      ],
      destaque: false,
      cor: '#764ba2',
      dica: '💡 Você economiza ~10h/semana + Suporte VIP',
      cta: 'Ativar Premium'
    }
  ]

  // Tela de Sucesso - Pagamento Confirmado
  if (pagamentoConfirmado) {
    return (
      <div style={{
        padding: '40px 24px',
        maxWidth: '600px',
        margin: '0 auto',
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}>
        <div style={{
          backgroundColor: 'white',
          padding: '60px 40px',
          borderRadius: '16px',
          border: '2px solid #4caf50',
          boxShadow: '0 8px 32px rgba(76, 175, 80, 0.2)',
          textAlign: 'center',
          width: '100%'
        }}>
          {/* Ícone de sucesso animado */}
          <div style={{
            width: '100px',
            height: '100px',
            borderRadius: '50%',
            backgroundColor: '#e8f5e9',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 24px',
            animation: 'scaleIn 0.5s ease-out'
          }}>
            <Icon icon="mdi:check-circle" width="64" style={{ color: '#4caf50' }} />
          </div>

          <h2 style={{
            fontSize: '32px',
            fontWeight: 'bold',
            marginBottom: '12px',
            color: '#333'
          }}>
            Pagamento Confirmado!
          </h2>

          <p style={{
            fontSize: '18px',
            color: '#666',
            marginBottom: '8px'
          }}>
            Seu plano foi ativado com sucesso.
          </p>

          <p style={{
            fontSize: '16px',
            color: '#4caf50',
            fontWeight: '600',
            marginBottom: '32px'
          }}>
            Plano {pixData?.plano?.charAt(0).toUpperCase() + pixData?.plano?.slice(1)} - 30 dias
          </p>

          {/* Confete visual */}
          <div style={{
            backgroundColor: '#f5f5f5',
            padding: '20px',
            borderRadius: '12px',
            marginBottom: '32px'
          }}>
            <p style={{ fontSize: '14px', color: '#666', marginBottom: '8px' }}>
              Agora você pode aproveitar todos os recursos do MensalliZap!
            </p>
            <ul style={{
              listStyle: 'none',
              padding: 0,
              margin: 0,
              display: 'flex',
              flexWrap: 'wrap',
              justifyContent: 'center',
              gap: '16px'
            }}>
              <li style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#666', fontSize: '14px' }}>
                <Icon icon="mdi:check" width="18" style={{ color: '#4caf50' }} /> Mensagens ilimitadas
              </li>
              <li style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#666', fontSize: '14px' }}>
                <Icon icon="mdi:check" width="18" style={{ color: '#4caf50' }} /> Automação completa
              </li>
              <li style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#666', fontSize: '14px' }}>
                <Icon icon="mdi:check" width="18" style={{ color: '#4caf50' }} /> Suporte prioritário
              </li>
            </ul>
          </div>

          <button
            onClick={() => navigate('/app/home')}
            style={{
              width: '100%',
              padding: '18px 32px',
              backgroundColor: '#4caf50',
              color: 'white',
              border: 'none',
              borderRadius: '12px',
              fontSize: '18px',
              fontWeight: '600',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              transition: 'all 0.2s'
            }}
            onMouseOver={(e) => {
              e.target.style.backgroundColor = '#43a047'
              e.target.style.transform = 'translateY(-2px)'
            }}
            onMouseOut={(e) => {
              e.target.style.backgroundColor = '#4caf50'
              e.target.style.transform = 'translateY(0)'
            }}
          >
            <Icon icon="mdi:home" width="24" />
            Ir para o Dashboard
          </button>
        </div>

        <style>{`
          @keyframes scaleIn {
            0% { transform: scale(0); opacity: 0; }
            50% { transform: scale(1.1); }
            100% { transform: scale(1); opacity: 1; }
          }
        `}</style>
      </div>
    )
  }

  // Tela de QR Code Pix
  if (pixData) {
    return (
      <div style={{
        padding: '40px 24px',
        maxWidth: '600px',
        margin: '0 auto',
        minHeight: '100vh',
        textAlign: 'center'
      }}>
        <div style={{
          backgroundColor: 'white',
          padding: '40px',
          borderRadius: '16px',
          border: '1px solid #e0e0e0',
          boxShadow: '0 4px 12px rgba(0,0,0,0.08)'
        }}>
          <Icon icon="mdi:qrcode" width="64" style={{ color: '#00b894', marginBottom: '16px' }} />

          <h2 style={{ fontSize: '28px', fontWeight: '600', marginBottom: '8px', color: '#333' }}>
            Pague com Pix
          </h2>

          <p style={{ fontSize: '16px', color: '#666', marginBottom: '24px' }}>
            Escaneie o QR Code ou copie o código abaixo
          </p>

          {/* QR Code */}
          {pixData.pix?.qr_code_base64 && (
            <div style={{ marginBottom: '24px' }}>
              <img
                src={`data:image/png;base64,${pixData.pix.qr_code_base64}`}
                alt="QR Code Pix"
                style={{
                  width: '220px',
                  height: '220px',
                  border: '4px solid #00b894',
                  borderRadius: '12px'
                }}
              />
            </div>
          )}

          {/* Valor */}
          <div style={{
            backgroundColor: '#f5f5f5',
            padding: '16px',
            borderRadius: '8px',
            marginBottom: '24px'
          }}>
            <p style={{ fontSize: '14px', color: '#666', marginBottom: '4px' }}>Valor</p>
            <p style={{ fontSize: '32px', fontWeight: 'bold', color: '#333' }}>
              {mercadoPagoService.formatarValor(pixData.valor)}
            </p>
            <p style={{ fontSize: '14px', color: '#666' }}>
              Plano {pixData.plano?.charAt(0).toUpperCase() + pixData.plano?.slice(1)} - 30 dias
            </p>
          </div>

          {/* Código copia-cola */}
          <div style={{ marginBottom: '24px' }}>
            <p style={{ fontSize: '14px', color: '#666', marginBottom: '8px' }}>Pix Copia e Cola:</p>
            <div style={{
              backgroundColor: '#f9f9f9',
              border: '1px solid #e0e0e0',
              borderRadius: '8px',
              padding: '12px',
              wordBreak: 'break-all',
              fontSize: '12px',
              color: '#666',
              maxHeight: '80px',
              overflow: 'auto'
            }}>
              {pixData.pix?.qr_code}
            </div>
          </div>

          {/* Botão Copiar */}
          <button
            onClick={handleCopiarPix}
            style={{
              width: '100%',
              padding: '16px',
              backgroundColor: copiado ? '#4caf50' : '#00b894',
              color: 'white',
              border: 'none',
              borderRadius: '10px',
              fontSize: '16px',
              fontWeight: '600',
              cursor: 'pointer',
              marginBottom: '16px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px'
            }}
          >
            <Icon icon={copiado ? 'mdi:check' : 'mdi:content-copy'} width="20" />
            {copiado ? 'Código Copiado!' : 'Copiar Código Pix'}
          </button>

          {/* Aviso */}
          <div style={{
            backgroundColor: '#fff8e1',
            padding: '16px',
            borderRadius: '8px',
            marginBottom: '24px'
          }}>
            <p style={{ fontSize: '14px', color: '#f57c00', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Icon icon="mdi:information" width="20" />
              Após o pagamento, aguarde alguns segundos para ativação automática.
            </p>
          </div>

          {/* Botão Voltar */}
          <button
            onClick={handleVoltar}
            style={{
              padding: '12px 32px',
              backgroundColor: 'transparent',
              color: '#666',
              border: '1px solid #e0e0e0',
              borderRadius: '8px',
              fontSize: '14px',
              cursor: 'pointer'
            }}
          >
            ← Voltar
          </button>
        </div>
      </div>
    )
  }

  // Tela de seleção de método de pagamento
  if (planoSelecionado && !metodoPagamento) {
    const plano = planos.find(p => p.id === planoSelecionado)

    return (
      <div style={{
        padding: '40px 24px',
        maxWidth: '600px',
        margin: '0 auto',
        minHeight: '100vh'
      }}>
        <div style={{ textAlign: 'center', marginBottom: '40px' }}>
          <h2 style={{ fontSize: '28px', fontWeight: '600', marginBottom: '8px', color: '#333' }}>
            Como você quer pagar?
          </h2>
          <p style={{ fontSize: '16px', color: '#666' }}>
            Plano {plano.nome} - {plano.preco}{plano.periodo}
          </p>
        </div>

        {/* Mensagem de Erro */}
        {erro && (
          <div style={{
            backgroundColor: '#ffebee',
            color: '#c62828',
            padding: '16px 24px',
            borderRadius: '8px',
            marginBottom: '24px',
            textAlign: 'center',
            fontSize: '15px'
          }}>
            <Icon icon="mdi:alert-circle" width="20" style={{ marginRight: '8px', verticalAlign: 'middle' }} />
            {erro}
          </div>
        )}

        {/* Opção Cartão */}
        <button
          onClick={() => handleSelecionarMetodo('cartao')}
          disabled={loading}
          style={{
            width: '100%',
            padding: '24px',
            backgroundColor: 'white',
            border: '2px solid #667eea',
            borderRadius: '12px',
            marginBottom: '16px',
            cursor: loading ? 'not-allowed' : 'pointer',
            opacity: loading ? 0.6 : 1,
            display: 'flex',
            alignItems: 'center',
            gap: '16px',
            textAlign: 'left'
          }}
        >
          <div style={{
            width: '56px',
            height: '56px',
            borderRadius: '12px',
            backgroundColor: '#667eea20',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <Icon icon="mdi:credit-card" width="32" style={{ color: '#667eea' }} />
          </div>
          <div style={{ flex: 1 }}>
            <h3 style={{ fontSize: '18px', fontWeight: '600', color: '#333', marginBottom: '4px' }}>
              Cartão de Crédito
            </h3>
            <p style={{ fontSize: '14px', color: '#666' }}>
              Cobrança automática todo mês
            </p>
          </div>
          <Icon icon="mdi:chevron-right" width="24" style={{ color: '#667eea' }} />
        </button>

        {/* Opção Pix */}
        <button
          onClick={() => handleSelecionarMetodo('pix')}
          disabled={loading}
          style={{
            width: '100%',
            padding: '24px',
            backgroundColor: 'white',
            border: '2px solid #00b894',
            borderRadius: '12px',
            marginBottom: '32px',
            cursor: loading ? 'not-allowed' : 'pointer',
            opacity: loading ? 0.6 : 1,
            display: 'flex',
            alignItems: 'center',
            gap: '16px',
            textAlign: 'left'
          }}
        >
          <div style={{
            width: '56px',
            height: '56px',
            borderRadius: '12px',
            backgroundColor: '#00b89420',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <Icon icon="mdi:qrcode" width="32" style={{ color: '#00b894' }} />
          </div>
          <div style={{ flex: 1 }}>
            <h3 style={{ fontSize: '18px', fontWeight: '600', color: '#333', marginBottom: '4px' }}>
              Pix
            </h3>
            <p style={{ fontSize: '14px', color: '#666' }}>
              Pagamento único - renovar manualmente após 30 dias
            </p>
          </div>
          <Icon icon="mdi:chevron-right" width="24" style={{ color: '#00b894' }} />
        </button>

        {loading && (
          <div style={{ textAlign: 'center', marginBottom: '24px' }}>
            <Icon icon="mdi:loading" width="32" style={{ color: '#667eea', animation: 'spin 1s linear infinite' }} />
            <p style={{ color: '#666', marginTop: '8px' }}>Processando...</p>
          </div>
        )}

        {/* Botão Voltar */}
        <div style={{ textAlign: 'center' }}>
          <button
            onClick={handleVoltar}
            style={{
              padding: '12px 32px',
              backgroundColor: 'transparent',
              color: '#666',
              border: '1px solid #e0e0e0',
              borderRadius: '8px',
              fontSize: '14px',
              cursor: 'pointer'
            }}
          >
            ← Escolher outro plano
          </button>
        </div>
      </div>
    )
  }

  // Tela principal - Seleção de Plano
  return (
    <div style={{
      padding: '40px 24px',
      maxWidth: '1200px',
      margin: '0 auto',
      minHeight: '100vh'
    }}>
      {/* Header */}
      <div style={{ textAlign: 'center', marginBottom: '60px' }}>
        <div style={{
          display: 'inline-block',
          padding: '12px 24px',
          backgroundColor: '#ffebee',
          borderRadius: '12px',
          marginBottom: '24px'
        }}>
          <span style={{
            fontSize: '18px',
            fontWeight: '700',
            color: '#d32f2f',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}>
            🔒 Seu plano expirou
          </span>
        </div>

        <p style={{
          fontSize: '16px',
          color: '#666',
          marginBottom: '16px'
        }}>
          Escolha um plano para continuar recebendo suas mensalidades em dia
        </p>

        <h1 style={{
          fontSize: '40px',
          fontWeight: 'bold',
          marginBottom: '12px',
          color: '#333'
        }}>
          Continue recebendo em dia
        </h1>
        <p style={{
          fontSize: '18px',
          color: '#666',
          maxWidth: '600px',
          margin: '0 auto'
        }}>
          Escolha seu plano e volte a automatizar cobranças imediatamente
        </p>
      </div>

      {/* Mensagem de Erro */}
      {erro && (
        <div style={{
          backgroundColor: '#ffebee',
          color: '#c62828',
          padding: '16px 24px',
          borderRadius: '8px',
          marginBottom: '32px',
          textAlign: 'center',
          fontSize: '15px'
        }}>
          <Icon icon="mdi:alert-circle" width="20" style={{ marginRight: '8px', verticalAlign: 'middle' }} />
          {erro}
        </div>
      )}

      {/* Assinatura Ativa */}
      {assinaturaAtiva && (
        <div style={{
          backgroundColor: '#e8f5e9',
          padding: '32px',
          borderRadius: '16px',
          marginBottom: '40px',
          textAlign: 'center',
          border: '2px solid #4caf50'
        }}>
          <Icon icon="mdi:check-circle" width="48" style={{ color: '#4caf50', marginBottom: '16px' }} />
          <h3 style={{ fontSize: '24px', fontWeight: '600', marginBottom: '12px', color: '#333' }}>
            Você já tem uma assinatura ativa!
          </h3>
          <p style={{ fontSize: '16px', color: '#666', marginBottom: '8px' }}>
            Plano: <strong style={{ color: '#333' }}>{assinaturaAtiva.plano.charAt(0).toUpperCase() + assinaturaAtiva.plano.slice(1)}</strong>
          </p>
          <p style={{ fontSize: '14px', color: '#666', marginBottom: '24px' }}>
            Status: <span style={{ color: '#4caf50', fontWeight: '600' }}>Ativo</span>
          </p>
          <button
            onClick={handleCancelarAssinatura}
            disabled={loading}
            style={{
              padding: '12px 32px',
              backgroundColor: loading ? '#ccc' : '#f44336',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              fontSize: '15px',
              fontWeight: '600',
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.6 : 1,
              transition: 'all 0.2s'
            }}
          >
            {loading ? 'Processando...' : 'Cancelar Assinatura'}
          </button>
        </div>
      )}

      {/* Cards de Planos */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
        gap: '24px',
        marginBottom: '60px'
      }}>
        {planos.map((plano, index) => (
          <div
            key={index}
            style={{
              backgroundColor: 'white',
              padding: '32px',
              borderRadius: '16px',
              border: plano.destaque ? `3px solid ${plano.cor}` : '2px solid #e0e0e0',
              boxShadow: plano.destaque ? `0 8px 32px ${plano.cor}40` : '0 4px 12px rgba(0,0,0,0.08)',
              transform: plano.destaque ? 'scale(1.02)' : 'scale(1)',
              position: 'relative'
            }}
          >
            {plano.destaque && (
              <div style={{
                position: 'absolute',
                top: '-14px',
                left: '50%',
                transform: 'translateX(-50%)',
                backgroundColor: plano.cor,
                color: 'white',
                padding: '8px 20px',
                borderRadius: '20px',
                fontSize: '12px',
                fontWeight: '700',
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}>
                🏆 Mais Popular
              </div>
            )}

            <h3 style={{
              fontSize: '24px',
              fontWeight: '700',
              marginBottom: '8px',
              color: '#333',
              marginTop: plano.destaque ? '8px' : '0'
            }}>
              {plano.nome}
            </h3>

            <div style={{ marginBottom: '16px' }}>
              <span style={{ fontSize: '40px', fontWeight: 'bold', color: '#333' }}>
                {plano.preco}
              </span>
              <span style={{ fontSize: '16px', color: '#666' }}>
                {plano.periodo}
              </span>
            </div>

            <p style={{
              fontSize: '14px',
              color: '#888',
              marginBottom: '24px',
              paddingBottom: '20px',
              borderBottom: '1px solid #e0e0e0',
              fontStyle: 'italic'
            }}>
              {plano.paraQuem}
            </p>

            <ul style={{
              listStyle: 'none',
              padding: 0,
              marginBottom: '24px'
            }}>
              {plano.features.map((feature, i) => (
                <li key={i} style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '10px',
                  marginBottom: '12px',
                  fontSize: '14px',
                  color: '#555'
                }}>
                  <Icon
                    icon="mdi:check-circle"
                    width="18"
                    style={{ color: '#4CAF50', flexShrink: 0, marginTop: '2px' }}
                  />
                  <span>{feature}</span>
                </li>
              ))}
            </ul>

            {/* Dica de economia */}
            <div style={{
              backgroundColor: '#f5f5f5',
              padding: '12px 16px',
              borderRadius: '8px',
              marginBottom: '20px',
              fontSize: '13px',
              color: '#666'
            }}>
              {plano.dica}
            </div>

            <button
              onClick={() => handleSelecionarPlano(plano.id)}
              disabled={loading || assinaturaAtiva}
              style={{
                display: 'block',
                width: '100%',
                padding: '16px',
                backgroundColor: (loading || assinaturaAtiva) ? '#ccc' : plano.cor,
                color: 'white',
                border: 'none',
                borderRadius: '10px',
                fontSize: '16px',
                fontWeight: '600',
                textAlign: 'center',
                cursor: (loading || assinaturaAtiva) ? 'not-allowed' : 'pointer',
                transition: 'all 0.2s',
                opacity: (loading || assinaturaAtiva) ? 0.6 : 1
              }}
              onMouseOver={(e) => {
                if (!loading && !assinaturaAtiva) {
                  e.target.style.transform = 'translateY(-2px)'
                  e.target.style.boxShadow = `0 4px 12px ${plano.cor}80`
                }
              }}
              onMouseOut={(e) => {
                if (!loading && !assinaturaAtiva) {
                  e.target.style.transform = 'translateY(0)'
                  e.target.style.boxShadow = 'none'
                }
              }}
            >
              {loading ? 'Processando...' : assinaturaAtiva ? 'Já Assinante' : plano.cta}
            </button>
          </div>
        ))}
      </div>

      {/* Garantias e Benefícios */}
      <div style={{
        backgroundColor: 'white',
        padding: '40px',
        borderRadius: '16px',
        border: '1px solid #e0e0e0',
        marginBottom: '40px'
      }}>
        <div style={{
          display: 'flex',
          flexWrap: 'wrap',
          justifyContent: 'center',
          gap: '32px',
          marginBottom: '32px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Icon icon="mdi:check-circle" width="24" style={{ color: '#4CAF50' }} />
            <span style={{ fontSize: '15px', color: '#333' }}>Cancele quando quiser, sem multa</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Icon icon="mdi:check-circle" width="24" style={{ color: '#4CAF50' }} />
            <span style={{ fontSize: '15px', color: '#333' }}>Seus dados continuam salvos por 30 dias</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Icon icon="mdi:check-circle" width="24" style={{ color: '#4CAF50' }} />
            <span style={{ fontSize: '15px', color: '#333' }}>Upgrade ou downgrade a qualquer momento</span>
          </div>
        </div>

        <div style={{
          textAlign: 'center',
          paddingTop: '24px',
          borderTop: '1px solid #e0e0e0'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', marginBottom: '8px' }}>
            <Icon icon="mdi:shield-check" width="24" style={{ color: '#2196F3' }} />
            <span style={{ fontSize: '16px', fontWeight: '600', color: '#333' }}>
              Pagamento 100% seguro via Mercado Pago
            </span>
          </div>
          <p style={{ fontSize: '14px', color: '#666' }}>
            Seus dados financeiros estão protegidos com criptografia SSL
          </p>
        </div>
      </div>

      {/* Botão de Suporte */}
      <div style={{ textAlign: 'center', marginBottom: '40px' }}>
        <button
          onClick={handleSuporteWhatsApp}
          style={{
            padding: '14px 28px',
            backgroundColor: '#25D366',
            color: 'white',
            border: 'none',
            borderRadius: '50px',
            fontSize: '15px',
            fontWeight: '600',
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '10px',
            transition: 'all 0.2s',
            boxShadow: '0 4px 12px rgba(37, 211, 102, 0.3)'
          }}
          onMouseOver={(e) => {
            e.target.style.transform = 'translateY(-2px)'
            e.target.style.boxShadow = '0 6px 16px rgba(37, 211, 102, 0.4)'
          }}
          onMouseOut={(e) => {
            e.target.style.transform = 'translateY(0)'
            e.target.style.boxShadow = '0 4px 12px rgba(37, 211, 102, 0.3)'
          }}
        >
          <Icon icon="mdi:whatsapp" width="22" />
          Precisa de ajuda? Fale conosco
        </button>
      </div>

      {/* Botão Voltar */}
      {!isExpired && (
        <div style={{ textAlign: 'center' }}>
          <button
            onClick={() => navigate('/app/home')}
            style={{
              padding: '12px 32px',
              backgroundColor: 'transparent',
              color: '#667eea',
              border: '2px solid #667eea',
              borderRadius: '8px',
              fontSize: '15px',
              fontWeight: '600',
              cursor: 'pointer',
              transition: 'all 0.2s'
            }}
            onMouseOver={(e) => {
              e.target.style.backgroundColor = '#f0f4ff'
            }}
            onMouseOut={(e) => {
              e.target.style.backgroundColor = 'transparent'
            }}
          >
            ← Voltar ao Dashboard
          </button>
        </div>
      )}

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  )
}
