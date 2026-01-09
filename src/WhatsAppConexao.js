import { useState, useEffect } from 'react'
import { supabase } from './supabaseClient'
import { Icon } from '@iconify/react'

// Estado global do status de conexão do WhatsApp
let globalStatus = 'disconnected'
const statusListeners = []

export const subscribeToWhatsAppStatus = (callback) => {
  statusListeners.push(callback)
  return () => {
    const index = statusListeners.indexOf(callback)
    if (index > -1) statusListeners.splice(index, 1)
  }
}

const updateGlobalStatus = (newStatus) => {
  globalStatus = newStatus
  statusListeners.forEach(listener => listener(newStatus))
}

export const getWhatsAppStatus = () => globalStatus

// Mensagem padrão do template
const MENSAGEM_PADRAO = `Olá {{nomeCliente}},

Identificamos que a parcela no valor de {{valorParcela}} com vencimento em {{dataVencimento}} está em atraso há {{diasAtraso}} dias.

Por favor, regularize sua situação o quanto antes.

Atenciosamente,
{{nomeEmpresa}}`

export default function WhatsAppConexao() {
  const [activeTab, setActiveTab] = useState('conexao')

  // ESTADOS SIMPLIFICADOS (6 essenciais)
  const [status, setStatus] = useState('disconnected') // 'disconnected' | 'connecting' | 'connected'
  const [qrCode, setQrCode] = useState(null)
  const [loading, setLoading] = useState(false)
  const [erro, setErro] = useState('')
  const [config, setConfig] = useState({ apiKey: '', apiUrl: '', instanceName: '' })
  const [tempoRestante, setTempoRestante] = useState(120) // Contador de 2 minutos (120 segundos)

  // Estados para templates
  const [templates, setTemplates] = useState([])
  const [templateAtual, setTemplateAtual] = useState({
    titulo: 'Lembrete de Cobrança',
    mensagem: MENSAGEM_PADRAO
  })

  // Atualizar status global quando mudar
  useEffect(() => {
    updateGlobalStatus(status)
  }, [status])

  // Carregar configurações da Evolution API e verificar status inicial
  useEffect(() => {
    const init = async () => {
      try {
        // 1. Buscar config do Supabase
        const { data, error } = await supabase
          .from('config')
          .select('chave, valor')
          .in('chave', ['evolution_api_key', 'evolution_api_url'])

        if (error) throw error

        const configMap = {}
        data.forEach(item => { configMap[item.chave] = item.valor })

        // 2. Gerar instanceName baseado no user ID
        const { data: { user } } = await supabase.auth.getUser()
        const instanceName = user ? `instance_${user.id.substring(0, 8)}` : ''

        setConfig({
          apiKey: configMap.evolution_api_key || '',
          apiUrl: configMap.evolution_api_url || 'https://service-evolution-api.tnvro1.easypanel.host',
          instanceName
        })

        // 3. Verificar status inicial (se já está conectado)
        if (configMap.evolution_api_key && instanceName) {
          try {
            const response = await fetch(
              `${configMap.evolution_api_url || 'https://service-evolution-api.tnvro1.easypanel.host'}/instance/connectionState/${instanceName}`,
              { headers: { 'apikey': configMap.evolution_api_key } }
            )

            if (response.ok) {
              const data = await response.json()
              const state = data.instance?.state || 'close'
              if (state === 'open') {
                setStatus('connected')
              }
            }
          } catch (error) {
            console.log('Instância não existe ou está desconectada')
          }
        }
      } catch (error) {
        console.error('Erro ao carregar configurações:', error)
        setErro('Erro ao carregar configurações da Evolution API')
      }
    }

    init()
    carregarTemplates()
  }, [])

  // FUNÇÃO UNIFICADA: Conectar WhatsApp
  const conectarWhatsApp = async () => {
    setLoading(true)
    setErro('')

    try {
      console.log('📱 Conectando WhatsApp...')

      // 1. Verificar se instância existe
      console.log('🔍 Verificando instância...')
      const response = await fetch(`${config.apiUrl}/instance/fetchInstances`, {
        headers: { 'apikey': config.apiKey }
      })

      let instanciaExiste = false
      let estadoInstancia = null
      if (response.ok) {
        const data = await response.json()
        const minhaInstancia = data.find(inst => inst.instance?.instanceName === config.instanceName)
        instanciaExiste = !!minhaInstancia
        estadoInstancia = minhaInstancia?.instance?.state || null
      }

      console.log(`ℹ️ Instância existe: ${instanciaExiste}`)
      if (instanciaExiste && estadoInstancia) {
        console.log(`📊 Estado da instância: ${estadoInstancia}`)
      }

      // 2. Se não existe, criar
      if (!instanciaExiste) {
        console.log('🔄 Criando instância...')
        const createResponse = await fetch(`${config.apiUrl}/instance/create`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': config.apiKey
          },
          body: JSON.stringify({
            instanceName: config.instanceName,
            qrcode: true,
            integration: 'WHATSAPP-BAILEYS'
          })
        })

        // 403/409 = já existe, não é erro
        if (createResponse.status !== 403 && createResponse.status !== 409 && !createResponse.ok) {
          const errorData = await createResponse.json().catch(() => ({}))
          throw new Error(errorData.message || `Erro ao criar instância: HTTP ${createResponse.status}`)
        }

        console.log('✅ Instância criada/já existe')
      }

      // 3. Gerar QR Code
      console.log('📡 Gerando QR Code...')
      const connectResponse = await fetch(`${config.apiUrl}/instance/connect/${config.instanceName}`, {
        headers: { 'apikey': config.apiKey }
      })

      if (!connectResponse.ok) {
        const errorData = await connectResponse.json().catch(() => ({}))
        throw new Error(errorData.message || `HTTP ${connectResponse.status}`)
      }

      const data = await connectResponse.json()
      console.log('📦 Resposta completa da API:', data)

      // Tentar extrair QR Code de múltiplos formatos
      const qr = data.base64 || data.qrcode?.base64 || data.code || data.qr

      if (!qr) {
        console.error('❌ QR Code não encontrado. Estrutura da resposta:', Object.keys(data))
        throw new Error('QR Code não foi gerado pela API. Abra o console (F12) para ver detalhes.')
      }

      console.log('✅ QR Code gerado!')
      setQrCode(qr)
      setStatus('connecting')
      setTempoRestante(120) // Resetar contador para 2 minutos

    } catch (error) {
      console.error('❌ Erro completo:', error)
      setErro(error.message)
      setStatus('disconnected')
    } finally {
      setLoading(false)
    }
  }

  // POLLING SIMPLIFICADO
  useEffect(() => {
    if (status !== 'connecting' || !qrCode || !config.apiKey) return

    console.log('🔄 Iniciando polling...')

    const intervalId = setInterval(async () => {
      try {
        const response = await fetch(
          `${config.apiUrl}/instance/connectionState/${config.instanceName}`,
          { headers: { 'apikey': config.apiKey } }
        )

        if (response.ok) {
          const data = await response.json()
          const state = data.instance?.state || 'close'

          console.log(`📊 Status: ${state}`)

          if (state === 'open') {
            console.log('✅ Conectado!')
            setStatus('connected')
            setQrCode(null)
          }
        }
      } catch (error) {
        console.error('Erro no polling:', error)
      }
    }, 3000)

    // Contador regressivo de 1 em 1 segundo
    const countdownId = setInterval(() => {
      setTempoRestante(prev => {
        if (prev <= 1) {
          return 0
        }
        return prev - 1
      })
    }, 1000)

    const timeoutId = setTimeout(() => {
      console.log('⏱️ QR Code expirado')
      clearInterval(intervalId)
      clearInterval(countdownId)
      setQrCode(null)
      setStatus('disconnected')
      setTempoRestante(120)
      setErro('QR Code expirou. Clique em "Conectar WhatsApp" novamente.')
    }, 120000)

    return () => {
      console.log('🧹 Limpando polling...')
      clearInterval(intervalId)
      clearInterval(countdownId)
      clearTimeout(timeoutId)
    }
  }, [status, qrCode, config])

  // Desconectar
  const desconectar = async () => {
    if (!window.confirm('Tem certeza que deseja desconectar o WhatsApp?')) return

    setLoading(true)
    try {
      await fetch(`${config.apiUrl}/instance/logout/${config.instanceName}`, {
        method: 'DELETE',
        headers: { 'apikey': config.apiKey }
      })

      setStatus('disconnected')
      setQrCode(null)
      alert('WhatsApp desconectado com sucesso!')
    } catch (error) {
      setErro('Erro ao desconectar: ' + error.message)
    } finally {
      setLoading(false)
    }
  }

  // ========== TEMPLATES ==========

  const gerarPreview = (mensagem) => {
    return mensagem
      .replace(/\{\{nomeCliente\}\}/g, 'João Silva')
      .replace(/\{\{telefone\}\}/g, '(62) 98246-6639')
      .replace(/\{\{valorParcela\}\}/g, 'R$ 150,00')
      .replace(/\{\{dataVencimento\}\}/g, '06/01/2026')
      .replace(/\{\{diasAtraso\}\}/g, '5')
      .replace(/\{\{nomeEmpresa\}\}/g, 'Minha Empresa')
  }

  const restaurarMensagemPadrao = () => {
    setTemplateAtual({
      ...templateAtual,
      mensagem: MENSAGEM_PADRAO
    })
  }

  const carregarTemplates = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()

      const { data, error } = await supabase
        .from('templates')
        .select('*')
        .eq('user_id', user.id)
        .eq('ativo', true)
        .order('is_padrao', { ascending: false })
        .order('created_at', { ascending: false })

      if (error) throw error

      setTemplates(data || [])

      const templatePadrao = data?.find(t => t.is_padrao)
      if (templatePadrao) {
        setTemplateAtual({
          id: templatePadrao.id,
          titulo: templatePadrao.titulo,
          mensagem: templatePadrao.mensagem
        })
      }
    } catch (error) {
      console.error('Erro ao carregar templates:', error)
    }
  }

  const salvarTemplate = async () => {
    if (!templateAtual.titulo.trim() || !templateAtual.mensagem.trim()) {
      alert('Preencha o título e a mensagem do template')
      return
    }

    try {
      const { data: { user } } = await supabase.auth.getUser()

      const templateData = {
        user_id: user.id,
        titulo: templateAtual.titulo.trim(),
        mensagem: templateAtual.mensagem.trim(),
        ativo: true
      }

      let error

      if (templateAtual.id) {
        const result = await supabase
          .from('templates')
          .update({
            titulo: templateData.titulo,
            mensagem: templateData.mensagem,
            updated_at: new Date().toISOString()
          })
          .eq('id', templateAtual.id)

        error = result.error
      } else {
        const temTemplatePadrao = templates.some(t => t.is_padrao)
        templateData.is_padrao = !temTemplatePadrao

        const result = await supabase
          .from('templates')
          .insert(templateData)

        error = result.error
      }

      if (error) throw error

      alert('Template salvo com sucesso!')
      await carregarTemplates()
    } catch (error) {
      console.error('Erro ao salvar template:', error)
      alert('Erro ao salvar template: ' + error.message)
    }
  }

  // ========== RENDER ==========

  return (
    <div style={{ flex: 1, padding: '25px 30px', backgroundColor: '#f5f5f5', minHeight: '100vh' }}>
      {/* Header */}
      <div style={{
        backgroundColor: 'white',
        borderRadius: '8px',
        padding: '20px',
        marginBottom: '25px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.08)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <Icon icon="mdi:whatsapp" width="32" height="32" style={{ color: '#25D366' }} />
          <div>
            <h2 style={{ margin: 0, fontSize: '18px', fontWeight: '600', color: '#344848' }}>
              WhatsApp
            </h2>
            <p style={{ margin: '5px 0 0 0', fontSize: '14px', color: '#666' }}>
              Gerencie sua conexão e templates de mensagens
            </p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{
        backgroundColor: 'white',
        borderRadius: '8px',
        marginBottom: '25px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
        display: 'flex',
        gap: '4px',
        padding: '4px'
      }}>
        <button
          onClick={() => setActiveTab('conexao')}
          style={{
            flex: 1,
            padding: '12px 20px',
            backgroundColor: activeTab === 'conexao' ? '#25D366' : 'transparent',
            color: activeTab === 'conexao' ? 'white' : '#666',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer',
            fontSize: '14px',
            fontWeight: '500',
            transition: 'all 0.2s',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px'
          }}
        >
          <Icon icon="mdi:connection" width="18" />
          Conexão
        </button>
        <button
          onClick={() => setActiveTab('templates')}
          style={{
            flex: 1,
            padding: '12px 20px',
            backgroundColor: activeTab === 'templates' ? '#25D366' : 'transparent',
            color: activeTab === 'templates' ? 'white' : '#666',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer',
            fontSize: '14px',
            fontWeight: '500',
            transition: 'all 0.2s',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px'
          }}
        >
          <Icon icon="mdi:message-text" width="18" />
          Templates de Mensagens
        </button>
      </div>

      {/* Conteúdo */}
      {activeTab === 'conexao' ? (
        <>
          {/* Status Badge */}
          <div style={{
            backgroundColor: 'white',
            borderRadius: '8px',
            padding: '16px 20px',
            marginBottom: '25px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{
                width: '12px',
                height: '12px',
                borderRadius: '50%',
                backgroundColor: status === 'connected' ? '#4CAF50' : status === 'connecting' ? '#ff9800' : '#f44336'
              }} />
              <span style={{ fontSize: '14px', fontWeight: '500', color: '#344848' }}>
                {status === 'connected' ? 'Conectado' : status === 'connecting' ? 'Conectando...' : 'Desconectado'}
              </span>
            </div>
            {status === 'connected' && (
              <button
                onClick={desconectar}
                disabled={loading}
                style={{
                  padding: '8px 16px',
                  backgroundColor: '#f44336',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: loading ? 'not-allowed' : 'pointer',
                  fontSize: '14px',
                  fontWeight: '500',
                  opacity: loading ? 0.7 : 1
                }}
              >
                Desconectar
              </button>
            )}
          </div>

          {/* Conteúdo Principal */}
          <div style={{
            backgroundColor: 'white',
            borderRadius: '8px',
            padding: '40px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.08)'
          }}>
            {status === 'connected' ? (
              // ESTADO 1: CONECTADO
              <div style={{ textAlign: 'center', padding: '40px 20px' }}>
                <Icon icon="mdi:check-circle" width="80" height="80" style={{ color: '#4CAF50', marginBottom: '20px' }} />
                <h3 style={{ margin: '0 0 10px 0', fontSize: '20px', fontWeight: '600', color: '#344848' }}>
                  WhatsApp Conectado!
                </h3>
                <p style={{ margin: 0, fontSize: '14px', color: '#666' }}>
                  Seu WhatsApp está conectado e pronto para enviar mensagens automáticas.
                </p>
              </div>
            ) : qrCode ? (
              // ESTADO 2: CONECTANDO (QR Code visível)
              <div style={{ textAlign: 'center' }}>
                <h3 style={{ margin: '0 0 10px 0', fontSize: '18px', fontWeight: '600', color: '#344848' }}>
                  Escaneie o QR Code
                </h3>
                <p style={{ margin: '0 0 30px 0', fontSize: '14px', color: '#666' }}>
                  Aponte a câmera do seu WhatsApp para este código
                </p>

                <div style={{
                  display: 'inline-block',
                  padding: '20px',
                  backgroundColor: 'white',
                  borderRadius: '12px',
                  border: '2px solid #e0e0e0',
                  marginBottom: '30px'
                }}>
                  <img
                    src={qrCode}
                    alt="QR Code WhatsApp"
                    style={{
                      width: '300px',
                      height: '300px',
                      display: 'block'
                    }}
                  />
                </div>

                {/* Contador de tempo */}
                <div style={{ marginBottom: '20px' }}>
                  <div style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '8px 16px',
                    backgroundColor: tempoRestante <= 30 ? '#fff3cd' : '#f5f5f5',
                    borderRadius: '20px',
                    border: `1px solid ${tempoRestante <= 30 ? '#ffc107' : '#e0e0e0'}`
                  }}>
                    <Icon icon="mdi:clock-outline" width="18" height="18" style={{ color: tempoRestante <= 30 ? '#ff9800' : '#666' }} />
                    <span style={{ fontSize: '14px', fontWeight: '500', color: tempoRestante <= 30 ? '#856404' : '#666' }}>
                      {Math.floor(tempoRestante / 60)}:{(tempoRestante % 60).toString().padStart(2, '0')}
                    </span>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', marginBottom: '20px' }}>
                  <button
                    onClick={() => {
                      setQrCode(null)
                      setStatus('disconnected')
                      setTempoRestante(120)
                    }}
                    style={{
                      padding: '10px 20px',
                      backgroundColor: 'white',
                      color: '#666',
                      border: '1px solid #ddd',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      fontSize: '14px',
                      fontWeight: '500'
                    }}
                  >
                    Cancelar
                  </button>
                </div>

                {status === 'connecting' && (
                  <div style={{
                    padding: '16px',
                    backgroundColor: '#e3f2fd',
                    border: '1px solid #2196F3',
                    borderRadius: '8px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '10px'
                  }}>
                    <Icon icon="eos-icons:loading" width="20" height="20" style={{ color: '#2196F3' }} />
                    <span style={{ fontSize: '14px', color: '#2196F3', fontWeight: '500' }}>
                      Aguardando leitura do QR Code...
                    </span>
                  </div>
                )}
              </div>
            ) : (
              // ESTADO 3: DESCONECTADO
              <div>
                <h3 style={{ margin: '0 0 20px 0', fontSize: '18px', fontWeight: '600', color: '#344848' }}>
                  Conectar WhatsApp
                </h3>

                <div style={{ marginBottom: '30px' }}>
                  <p style={{ margin: '0 0 16px 0', fontSize: '14px', color: '#666', lineHeight: '1.6' }}>
                    Para conectar seu WhatsApp:
                  </p>
                  <ol style={{ margin: 0, paddingLeft: '20px', fontSize: '14px', color: '#666', lineHeight: '1.8' }}>
                    <li>Abra o WhatsApp no seu celular</li>
                    <li>Toque em Mais opções (⋮) ou Configurações (⚙)</li>
                    <li>Toque em Dispositivos conectados</li>
                    <li>Toque em Conectar dispositivo</li>
                    <li>Clique no botão abaixo e escaneie o QR Code que aparecer</li>
                  </ol>
                </div>

                <button
                  onClick={conectarWhatsApp}
                  disabled={loading}
                  style={{
                    width: '100%',
                    padding: '14px',
                    backgroundColor: '#25D366',
                    color: 'white',
                    border: 'none',
                    borderRadius: '8px',
                    cursor: loading ? 'not-allowed' : 'pointer',
                    fontSize: '16px',
                    fontWeight: '600',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '10px',
                    opacity: loading ? 0.7 : 1,
                    transition: 'all 0.2s'
                  }}
                  onMouseEnter={(e) => !loading && (e.currentTarget.style.backgroundColor = '#20BA5A')}
                  onMouseLeave={(e) => !loading && (e.currentTarget.style.backgroundColor = '#25D366')}
                >
                  {loading ? (
                    <>
                      <Icon icon="eos-icons:loading" width="24" height="24" />
                      Conectando...
                    </>
                  ) : (
                    <>
                      <Icon icon="mdi:qrcode" width="24" height="24" />
                      Conectar WhatsApp
                    </>
                  )}
                </button>

                {erro && (
                  <div style={{
                    marginTop: '20px',
                    padding: '12px 16px',
                    backgroundColor: '#ffebee',
                    border: '1px solid #f44336',
                    borderRadius: '6px',
                    color: '#f44336',
                    fontSize: '14px'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                      <Icon icon="mdi:alert-circle" width="20" height="20" style={{ flexShrink: 0, marginTop: '2px' }} />
                      <div style={{ flex: 1 }}>
                        <strong style={{ display: 'block', marginBottom: '8px' }}>{erro}</strong>
                        <details style={{ fontSize: '13px', cursor: 'pointer' }}>
                          <summary style={{ marginBottom: '8px' }}>Ver ajuda para resolver</summary>
                          <div style={{ paddingLeft: '8px', borderLeft: '2px solid #f44336', marginTop: '8px' }}>
                            <p style={{ margin: '0 0 8px 0' }}>1. Abra o console do navegador (pressione F12)</p>
                            <p style={{ margin: '0 0 8px 0' }}>2. Procure por mensagens detalhadas do erro</p>
                            <p style={{ margin: '0 0 8px 0' }}>3. Verifique se a Evolution API está online</p>
                            <p style={{ margin: '0' }}>4. Verifique se a API Key está configurada corretamente</p>
                          </div>
                        </details>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Aviso */}
          <div style={{
            marginTop: '25px',
            padding: '16px',
            backgroundColor: '#fff3cd',
            border: '1px solid #ffc107',
            borderRadius: '8px',
            display: 'flex',
            gap: '12px'
          }}>
            <Icon icon="mdi:information" width="24" height="24" style={{ color: '#ff9800', flexShrink: 0 }} />
            <div style={{ fontSize: '13px', color: '#856404', lineHeight: '1.6' }}>
              <strong>Importante:</strong> Mantenha o WhatsApp conectado ao seu celular com internet para que as mensagens sejam enviadas automaticamente.
            </div>
          </div>
        </>
      ) : (
        /* Aba de Templates */
        <div style={{
          backgroundColor: 'white',
          borderRadius: '8px',
          padding: '30px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.08)'
        }}>
          <div style={{ marginBottom: '30px' }}>
            <h3 style={{ margin: '0 0 8px 0', fontSize: '18px', fontWeight: '600', color: '#344848' }}>
              Templates de Mensagens
            </h3>
            <p style={{ margin: 0, fontSize: '14px', color: '#666' }}>
              Crie e gerencie templates de mensagens personalizadas para enviar aos seus clientes
            </p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '30px', marginBottom: '30px' }}>
            {/* Editor */}
            <div>
              <h4 style={{ margin: '0 0 16px 0', fontSize: '15px', fontWeight: '600', color: '#344848' }}>
                Editor de Template
              </h4>

              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', marginBottom: '8px', fontSize: '13px', fontWeight: '500', color: '#666' }}>
                  Título do Template
                </label>
                <input
                  type="text"
                  value={templateAtual.titulo}
                  onChange={(e) => setTemplateAtual({ ...templateAtual, titulo: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    border: '1px solid #e0e0e0',
                    borderRadius: '6px',
                    fontSize: '14px',
                    fontFamily: 'inherit',
                    outline: 'none'
                  }}
                  placeholder="Ex: Lembrete de Cobrança"
                />
              </div>

              <div style={{ marginBottom: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <label style={{ fontSize: '13px', fontWeight: '500', color: '#666' }}>
                    Mensagem
                  </label>
                  <button
                    onClick={restaurarMensagemPadrao}
                    style={{
                      padding: '6px 12px',
                      backgroundColor: 'white',
                      border: '1px solid #e0e0e0',
                      borderRadius: '6px',
                      fontSize: '12px',
                      color: '#666',
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = '#f5f5f5'
                      e.currentTarget.style.borderColor = '#ccc'
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = 'white'
                      e.currentTarget.style.borderColor = '#e0e0e0'
                    }}
                  >
                    <Icon icon="material-symbols:refresh" width="14" />
                    Restaurar Padrão
                  </button>
                </div>
                <textarea
                  value={templateAtual.mensagem}
                  onChange={(e) => setTemplateAtual({ ...templateAtual, mensagem: e.target.value })}
                  style={{
                    width: '100%',
                    minHeight: '300px',
                    padding: '14px',
                    border: '1px solid #e0e0e0',
                    borderRadius: '6px',
                    fontSize: '14px',
                    fontFamily: 'inherit',
                    lineHeight: '1.6',
                    resize: 'vertical',
                    outline: 'none'
                  }}
                  placeholder="Digite sua mensagem aqui..."
                />
              </div>

              <div style={{
                padding: '14px',
                backgroundColor: '#f8f9fa',
                borderRadius: '6px',
                marginBottom: '16px'
              }}>
                <h5 style={{ margin: '0 0 10px 0', fontSize: '12px', fontWeight: '600', color: '#344848' }}>
                  Variáveis Disponíveis (clique para copiar):
                </h5>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                  {[
                    '{{nomeCliente}}',
                    '{{telefone}}',
                    '{{valorParcela}}',
                    '{{dataVencimento}}',
                    '{{diasAtraso}}',
                    '{{nomeEmpresa}}'
                  ].map((varName, index) => (
                    <code
                      key={index}
                      onClick={() => {
                        navigator.clipboard.writeText(varName)
                        alert(`${varName} copiado!`)
                      }}
                      style={{
                        padding: '4px 8px',
                        backgroundColor: 'white',
                        border: '1px solid #e0e0e0',
                        borderRadius: '4px',
                        fontSize: '11px',
                        color: '#8867A1',
                        cursor: 'pointer',
                        fontWeight: '600'
                      }}
                    >
                      {varName}
                    </code>
                  ))}
                </div>
              </div>

              <button
                onClick={salvarTemplate}
                style={{
                  width: '100%',
                  padding: '12px',
                  backgroundColor: '#25D366',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  fontSize: '14px',
                  fontWeight: '600',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px'
                }}
              >
                <Icon icon="mdi:content-save" width="18" />
                Salvar Template
              </button>
            </div>

            {/* Preview WhatsApp */}
            <div>
              <h4 style={{ margin: '0 0 16px 0', fontSize: '15px', fontWeight: '600', color: '#344848' }}>
                Preview da Mensagem
              </h4>

              <div style={{
                backgroundColor: '#e5ddd5',
                backgroundImage: 'url(/whatsapp-bg.png)',
                backgroundSize: 'contain',
                backgroundRepeat: 'repeat',
                backgroundPosition: 'center',
                borderRadius: '8px',
                padding: '20px',
                minHeight: '500px',
                boxShadow: 'inset 0 2px 8px rgba(0,0,0,0.1)'
              }}>
                <div style={{
                  backgroundColor: '#dcf8c6',
                  borderRadius: '8px',
                  padding: '10px 14px',
                  position: 'relative',
                  maxWidth: '85%',
                  marginLeft: 'auto',
                  boxShadow: '0 1px 2px rgba(0,0,0,0.1)',
                  wordWrap: 'break-word'
                }}>
                  <div style={{
                    position: 'absolute',
                    right: '-6px',
                    bottom: '6px',
                    width: '0',
                    height: '0',
                    borderLeft: '8px solid #dcf8c6',
                    borderRight: '8px solid transparent',
                    borderTop: '4px solid transparent',
                    borderBottom: '4px solid transparent'
                  }} />

                  <div style={{
                    fontSize: '14px',
                    lineHeight: '1.6',
                    color: '#303030',
                    whiteSpace: 'pre-wrap',
                    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif'
                  }}>
                    {gerarPreview(templateAtual.mensagem)}
                  </div>

                  <div style={{
                    fontSize: '11px',
                    color: '#667781',
                    marginTop: '6px',
                    textAlign: 'right',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'flex-end',
                    gap: '4px',
                    height: '16px'
                  }}>
                    <span style={{ lineHeight: '16px' }}>{new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
                    <Icon icon="mdi:check-all" width="16" height="16" style={{ color: '#53bdeb', display: 'block' }} />
                  </div>
                </div>

                <div style={{
                  marginTop: '20px',
                  padding: '12px',
                  backgroundColor: 'rgba(255,255,255,0.7)',
                  borderRadius: '6px',
                  fontSize: '12px',
                  color: '#666',
                  lineHeight: '1.5'
                }}>
                  <Icon icon="mdi:information" width="16" style={{ verticalAlign: 'middle', marginRight: '6px' }} />
                  <strong>Exemplo:</strong> As variáveis foram substituídas por dados de exemplo para você visualizar como ficará a mensagem real.
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
