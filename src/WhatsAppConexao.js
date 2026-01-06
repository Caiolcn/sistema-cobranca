import { useState, useEffect, useCallback } from 'react'
import { supabase } from './supabaseClient'
import { Icon } from '@iconify/react'

// Estado global do status de conexão do WhatsApp
let globalStatus = 'disconnected'
const statusListeners = []

export const subscribeToWhatsAppStatus = (callback) => {
  statusListeners.push(callback)
  // Retornar função para cancelar inscrição
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
  const [activeTab, setActiveTab] = useState('conexao') // 'conexao' ou 'templates'
  const [loading, setLoading] = useState(false)
  const [qrCode, setQrCode] = useState(null)
  const [instanceName, setInstanceName] = useState('')
  const [status, setStatus] = useState('disconnected') // disconnected, connecting, connected
  const [erro, setErro] = useState('')
  const [showInstructions, setShowInstructions] = useState(true)
  const [evolutionApiKey, setEvolutionApiKey] = useState('')
  const [evolutionApiUrl, setEvolutionApiUrl] = useState('')

  // Estados para templates
  const [templates, setTemplates] = useState([])
  const [editandoTemplate, setEditandoTemplate] = useState(null)
  const [templateAtual, setTemplateAtual] = useState({
    titulo: 'Lembrete de Cobrança',
    mensagem: MENSAGEM_PADRAO
  })

  // Função para gerar preview com dados de exemplo
  const gerarPreview = (mensagem) => {
    return mensagem
      .replace(/\{\{nomeCliente\}\}/g, 'João Silva')
      .replace(/\{\{telefone\}\}/g, '(62) 98246-6639')
      .replace(/\{\{valorParcela\}\}/g, 'R$ 150,00')
      .replace(/\{\{dataVencimento\}\}/g, '06/01/2026')
      .replace(/\{\{diasAtraso\}\}/g, '5')
      .replace(/\{\{nomeEmpresa\}\}/g, 'Minha Empresa')
  }

  // Função para restaurar mensagem padrão
  const restaurarMensagemPadrao = () => {
    setTemplateAtual({
      ...templateAtual,
      mensagem: MENSAGEM_PADRAO
    })
  }

  // Atualizar status global quando mudar
  useEffect(() => {
    updateGlobalStatus(status)
  }, [status])

  // Buscar configurações da Evolution API do Supabase
  useEffect(() => {
    const carregarConfig = async () => {
      try {
        const { data, error } = await supabase
          .from('config')
          .select('chave, valor')
          .in('chave', ['evolution_api_key', 'evolution_api_url'])

        if (error) throw error

        const config = {}
        data.forEach(item => {
          config[item.chave] = item.valor
        })

        setEvolutionApiKey(config.evolution_api_key || '')
        setEvolutionApiUrl(config.evolution_api_url || 'https://service-evolution-api.tnvro1.easypanel.host')
      } catch (error) {
        console.error('Erro ao carregar configurações:', error)
        setErro('Erro ao carregar configurações da Evolution API')
      }
    }

    carregarConfig()
  }, [])

  useEffect(() => {
    // Gerar nome da instância baseado no usuário
    const gerarNomeInstancia = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        setInstanceName(`instance_${user.id.substring(0, 8)}`)
      }
    }
    gerarNomeInstancia()
  }, [])

  useEffect(() => {
    // Verificar status da conexão ao carregar
    if (instanceName) {
      verificarStatus()
    }
  }, [instanceName])

  const verificarStatus = async () => {
    if (!evolutionApiKey || !evolutionApiUrl) return

    try {
      const response = await fetch(`${evolutionApiUrl}/instance/connectionState/${instanceName}`, {
        method: 'GET',
        headers: {
          'apikey': evolutionApiKey
        }
      })

      if (response.ok) {
        const data = await response.json()
        const state = data.instance?.state || 'close'

        if (state === 'open') {
          setStatus('connected')
          setQrCode(null)
        } else if (state === 'connecting') {
          setStatus('connecting')
        } else {
          setStatus('disconnected')
        }
      }
    } catch (error) {
      console.error('Erro ao verificar status:', error)
    }
  }

  const criarInstancia = async () => {
    if (!evolutionApiKey || !evolutionApiUrl) {
      setErro('Configurações da Evolution API não carregadas')
      return
    }

    setLoading(true)
    setErro('')

    try {
      const response = await fetch(`${evolutionApiUrl}/instance/create`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': evolutionApiKey
        },
        body: JSON.stringify({
          instanceName: instanceName,
          qrcode: true,
          integration: 'WHATSAPP-BAILEYS'
        })
      })

      if (!response.ok) {
        throw new Error('Erro ao criar instância')
      }

      // Aguardar um pouco e então conectar
      setTimeout(() => {
        conectarWhatsApp()
      }, 2000)
    } catch (error) {
      setErro('Erro ao criar instância: ' + error.message)
      setLoading(false)
    }
  }

  const conectarWhatsApp = async () => {
    if (!evolutionApiKey || !evolutionApiUrl) {
      setErro('Configurações da Evolution API não carregadas')
      return
    }

    setLoading(true)
    setErro('')
    setStatus('connecting')

    try {
      const response = await fetch(`${evolutionApiUrl}/instance/connect/${instanceName}`, {
        method: 'GET',
        headers: {
          'apikey': evolutionApiKey
        }
      })

      if (!response.ok) {
        throw new Error('Erro ao gerar QR Code')
      }

      const data = await response.json()

      if (data.base64) {
        setQrCode(data.base64)
        setShowInstructions(false)
        iniciarPolling()
      } else {
        throw new Error('QR Code não foi gerado')
      }
    } catch (error) {
      setErro('Erro ao conectar: ' + error.message)
      setStatus('disconnected')
    } finally {
      setLoading(false)
    }
  }

  const iniciarPolling = useCallback(() => {
    const interval = setInterval(async () => {
      await verificarStatus()

      // Se conectou, parar polling
      if (status === 'connected') {
        clearInterval(interval)
      }
    }, 3000)

    // Limpar após 2 minutos (QR Code expira)
    setTimeout(() => {
      clearInterval(interval)
      if (status !== 'connected') {
        setErro('QR Code expirado. Clique em "Gerar Novo QR Code".')
        setQrCode(null)
        setStatus('disconnected')
      }
    }, 120000)

    return () => clearInterval(interval)
  }, [status])

  const desconectar = async () => {
    if (!window.confirm('Tem certeza que deseja desconectar o WhatsApp?')) return

    if (!evolutionApiKey || !evolutionApiUrl) {
      setErro('Configurações da Evolution API não carregadas')
      return
    }

    setLoading(true)
    try {
      const response = await fetch(`${evolutionApiUrl}/instance/logout/${instanceName}`, {
        method: 'DELETE',
        headers: {
          'apikey': evolutionApiKey
        }
      })

      if (response.ok) {
        setStatus('disconnected')
        setQrCode(null)
        alert('WhatsApp desconectado com sucesso!')
      }
    } catch (error) {
      setErro('Erro ao desconectar: ' + error.message)
    } finally {
      setLoading(false)
    }
  }

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

      {/* Renderizar conteúdo baseado na aba ativa */}
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

          {/* Conteúdo Principal - Conexão */}
          <div style={{
            backgroundColor: 'white',
            borderRadius: '8px',
            padding: '40px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.08)'
          }}>
        {status === 'connected' ? (
          // Já conectado
          <div style={{ textAlign: 'center', padding: '40px 20px' }}>
            <Icon icon="mdi:check-circle" width="80" height="80" style={{ color: '#4CAF50', marginBottom: '20px' }} />
            <h3 style={{ margin: '0 0 10px 0', fontSize: '20px', fontWeight: '600', color: '#344848' }}>
              WhatsApp Conectado!
            </h3>
            <p style={{ margin: 0, fontSize: '14px', color: '#666' }}>
              Seu WhatsApp está conectado e pronto para enviar mensagens automáticas.
            </p>
          </div>
        ) : showInstructions && !qrCode ? (
          // Instruções
          <div>
            <h3 style={{ margin: '0 0 20px 0', fontSize: '18px', fontWeight: '600', color: '#344848' }}>
              Etapas para conectar
            </h3>

            <div style={{ marginBottom: '30px' }}>
              {[
                { num: 1, text: 'Abra o WhatsApp no seu celular' },
                { num: 2, text: 'Toque em Mais opções (⋮) no Android ou em Configurações (⚙) no iPhone' },
                { num: 3, text: 'Toque em Dispositivos conectados e, em seguida, em Conectar dispositivo' },
                { num: 4, text: 'Clique no botão abaixo para gerar o QR Code' },
                { num: 5, text: 'Aponte seu celular para esta tela para escanear o QR Code' }
              ].map((etapa) => (
                <div key={etapa.num} style={{
                  display: 'flex',
                  gap: '16px',
                  marginBottom: '16px',
                  paddingBottom: '16px',
                  borderBottom: etapa.num === 5 ? 'none' : '1px solid #f0f0f0'
                }}>
                  <div style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '50%',
                    backgroundColor: '#25D366',
                    color: 'white',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '16px',
                    fontWeight: '600',
                    flexShrink: 0
                  }}>
                    {etapa.num}
                  </div>
                  <p style={{ margin: '6px 0 0 0', fontSize: '14px', color: '#344848', lineHeight: '1.5' }}>
                    {etapa.text}
                  </p>
                </div>
              ))}
            </div>

            <button
              onClick={criarInstancia}
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
                  Gerando QR Code...
                </>
              ) : (
                <>
                  <Icon icon="mdi:qrcode" width="24" height="24" />
                  Gerar QR Code
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
                fontSize: '14px',
                display: 'flex',
                alignItems: 'center',
                gap: '10px'
              }}>
                <Icon icon="mdi:alert-circle" width="20" height="20" />
                {erro}
              </div>
            )}
          </div>
        ) : (
          // QR Code
          <div style={{ textAlign: 'center' }}>
            <h3 style={{ margin: '0 0 10px 0', fontSize: '18px', fontWeight: '600', color: '#344848' }}>
              Escaneie o QR Code
            </h3>
            <p style={{ margin: '0 0 30px 0', fontSize: '14px', color: '#666' }}>
              Aponte a câmera do seu WhatsApp para este código
            </p>

            {qrCode ? (
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
            ) : (
              <div style={{
                width: '340px',
                height: '340px',
                margin: '0 auto 30px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: '#f9f9f9',
                borderRadius: '12px'
              }}>
                <Icon icon="eos-icons:loading" width="48" height="48" style={{ color: '#999' }} />
              </div>
            )}

            <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
              <button
                onClick={() => {
                  setQrCode(null)
                  setShowInstructions(true)
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
                Voltar
              </button>
              <button
                onClick={conectarWhatsApp}
                disabled={loading}
                style={{
                  padding: '10px 20px',
                  backgroundColor: '#25D366',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: loading ? 'not-allowed' : 'pointer',
                  fontSize: '14px',
                  fontWeight: '500',
                  opacity: loading ? 0.7 : 1
                }}
              >
                Gerar Novo QR Code
              </button>
            </div>

            {status === 'connecting' && (
              <div style={{
                marginTop: '30px',
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
          <strong>Importante:</strong> Mantenha o WhatsApp conectado ao seu celular com internet para que as mensagens sejam enviadas automaticamente. Não desconecte o dispositivo.
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

          {/* Editor e Preview lado a lado */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '30px', marginBottom: '30px' }}>
            {/* Editor */}
            <div>
              <h4 style={{ margin: '0 0 16px 0', fontSize: '15px', fontWeight: '600', color: '#344848' }}>
                Editor de Template
              </h4>

              {/* Título do template */}
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

              {/* Mensagem do template */}
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

              {/* Variáveis disponíveis - compacto */}
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

              {/* Botão Salvar */}
              <button
                onClick={() => alert('Template salvo! (Funcionalidade em desenvolvimento)')}
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

              {/* Simulação visual do WhatsApp */}
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
                {/* Mensagem do WhatsApp */}
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
                  {/* Ícone de balão */}
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

                  {/* Conteúdo da mensagem */}
                  <div style={{
                    fontSize: '14px',
                    lineHeight: '1.6',
                    color: '#303030',
                    whiteSpace: 'pre-wrap',
                    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif'
                  }}>
                    {gerarPreview(templateAtual.mensagem)}
                  </div>

                  {/* Hora de envio */}
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

                {/* Legenda */}
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
