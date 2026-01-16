import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from './supabaseClient'
import { Icon } from '@iconify/react'
import useWindowSize from './hooks/useWindowSize'
import ConfirmModal from './ConfirmModal'
import { useUserPlan } from './hooks/useUserPlan'

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

Identificamos que a mensalidade no valor de {{valorMensalidade}} com vencimento em {{dataVencimento}} está em atraso há {{diasAtraso}} dias.

Por favor, regularize sua situação o quanto antes.

Atenciosamente,
{{nomeEmpresa}}`

export default function WhatsAppConexao() {
  const navigate = useNavigate()
  const { isMobile, isTablet, isSmallScreen } = useWindowSize()
  const { isLocked } = useUserPlan()
  const templateEditLocked = isLocked('pro') // true se plano é starter
  const automacaoLocked = isLocked('pro') // Automações de 3 e 5 dias são Pro+
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
  const [tipoTemplateSelecionado, setTipoTemplateSelecionado] = useState('overdue')
  const [templatesAgrupados, setTemplatesAgrupados] = useState({
    overdue: null,
    pre_due_3days: null,
    pre_due_5days: null
  })
  const [tituloTemplate, setTituloTemplate] = useState('Mensagem de Cobrança - Em Atraso')
  const [mensagemTemplate, setMensagemTemplate] = useState(MENSAGEM_PADRAO)

  // Estados para automação
  const [automacao3DiasAtiva, setAutomacao3DiasAtiva] = useState(false)
  const [automacao5DiasAtiva, setAutomacao5DiasAtiva] = useState(false)
  const [automacaoEmAtrasoAtiva, setAutomacaoEmAtrasoAtiva] = useState(true) // Ativo por padrão

  // Estado para modal de feedback
  const [feedbackModal, setFeedbackModal] = useState({ isOpen: false, type: 'success', title: '', message: '' })

  // Estado para modal de upgrade (recurso bloqueado)
  const [upgradeModal, setUpgradeModal] = useState({ isOpen: false, featureName: '' })

  // Estado para modal de confirmação de desconexão
  const [confirmDesconexaoModal, setConfirmDesconexaoModal] = useState(false)

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
    carregarConfiguracoesAutomacao()
  }, [])

  // Salvar conexão WhatsApp no banco de dados (na tabela config E mensallizap)
  const salvarConexaoNoBanco = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        console.error('Usuário não autenticado')
        return
      }

      console.log('🔍 Salvando conexão WhatsApp...')
      console.log('User ID:', user.id)
      console.log('Instance Name:', config.instanceName)

      // Salvar instance_name na tabela config (GLOBAL para o usuário)
      const { data: dataInstanceName, error: errorInstanceName } = await supabase
        .from('config')
        .upsert({
          user_id: user.id,
          chave: 'evolution_instance_name',
          valor: config.instanceName,
          descricao: 'Nome da instância conectada na Evolution API',
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'chave'
        })
        .select()

      if (errorInstanceName) {
        console.error('❌ Erro ao salvar instance name:', errorInstanceName)
        return
      }

      console.log('✅ Instance name salvo:', dataInstanceName)

      // Salvar status de conexão (conectado = true)
      const { data: dataStatus, error: errorStatus } = await supabase
        .from('config')
        .upsert({
          user_id: user.id,
          chave: 'whatsapp_conectado',
          valor: 'true',
          descricao: 'Status de conexão do WhatsApp',
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'chave'
        })
        .select()

      if (errorStatus) {
        console.error('❌ Erro ao salvar status:', errorStatus)
      } else {
        console.log('✅ Status salvo:', dataStatus)
        console.log('✅ Conexão WhatsApp salva no banco de dados')

        // Verificar o que foi salvo
        const { data: verificacao, error: errorVerificacao } = await supabase
          .from('config')
          .select('chave, valor')
          .in('chave', ['evolution_instance_name', 'whatsapp_conectado'])

        console.log('📊 Verificação no banco:', verificacao)
        if (errorVerificacao) console.error('Erro na verificação:', errorVerificacao)
      }

      // ===================================
      // ATUALIZAR TABELA MENSALLIZAP
      // ===================================
      console.log('💾 Atualizando tabela mensallizap...')

      // Buscar dados do usuário
      const { data: usuarioData, error: usuarioError } = await supabase
        .from('usuarios')
        .select('nome_completo, email, telefone, plano')
        .eq('id', user.id)
        .single()

      if (usuarioError) {
        console.error('❌ Erro ao buscar dados do usuário:', usuarioError)
      }

      // Buscar número do WhatsApp conectado (tentativa via Evolution API)
      let whatsappNumero = null
      try {
        const profileResponse = await fetch(
          `${config.apiUrl}/instance/fetchProfile/${config.instanceName}`,
          { headers: { 'apikey': config.apiKey } }
        )
        if (profileResponse.ok) {
          const profileData = await profileResponse.json()
          whatsappNumero = profileData.wuid || profileData.id || null
          console.log('📱 Número WhatsApp detectado:', whatsappNumero)
        }
      } catch (err) {
        console.log('⚠️ Não foi possível buscar o número do WhatsApp:', err.message)
      }

      // Atualizar ou criar registro na mensallizap
      const agora = new Date().toISOString()
      const { data: mensallizapData, error: mensallizapError } = await supabase
        .from('mensallizap')
        .upsert({
          user_id: user.id,
          nome_completo: usuarioData?.nome_completo || null,
          email: usuarioData?.email || user.email,
          telefone: usuarioData?.telefone || null,
          plano: usuarioData?.plano || 'starter',
          whatsapp_numero: whatsappNumero,
          instance_name: config.instanceName,
          conectado: true,
          ultima_conexao: agora,
          updated_at: agora
        }, {
          onConflict: 'user_id',
          ignoreDuplicates: false
        })
        .select()

      if (mensallizapError) {
        console.error('❌ Erro ao atualizar mensallizap:', mensallizapError)
        console.error('❌ Detalhes do erro:', JSON.stringify(mensallizapError, null, 2))
      } else {
        console.log('✅ Mensallizap atualizada com sucesso!', mensallizapData)
        console.log('📅 Horário salvo (ISO):', agora)
        console.log('📅 Horário local:', new Date(agora).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }))
      }

    } catch (error) {
      console.error('Erro ao salvar conexão:', error)
    }
  }

  // Carregar configurações de automação
  const carregarConfiguracoesAutomacao = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      // Chaves únicas por usuário (prefixadas com user_id)
      const chaves = [
        `${user.id}_automacao_3dias_ativa`,
        `${user.id}_automacao_5dias_ativa`,
        `${user.id}_automacao_ematraso_ativa`
      ]

      const { data, error } = await supabase
        .from('config')
        .select('chave, valor')
        .in('chave', chaves)

      if (error) {
        console.error('Erro ao carregar configurações de automação:', error)
        return
      }

      const configMap = {}
      data?.forEach(item => {
        // Remover o prefixo do user_id para facilitar o acesso
        const chaveSimples = item.chave.replace(`${user.id}_`, '')
        configMap[chaveSimples] = item.valor
      })

      setAutomacao3DiasAtiva(configMap['automacao_3dias_ativa'] === 'true')
      setAutomacao5DiasAtiva(configMap['automacao_5dias_ativa'] === 'true')
      // Em Atraso vem ativo por padrão se não houver configuração
      setAutomacaoEmAtrasoAtiva(configMap['automacao_ematraso_ativa'] !== 'false')
    } catch (error) {
      console.error('Erro ao carregar configurações de automação:', error)
    }
  }

  // Salvar configuração de automação
  const salvarConfiguracaoAutomacao = async (chave, valor) => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        setFeedbackModal({ isOpen: true, type: 'danger', title: 'Erro', message: 'Usuário não autenticado' })
        return
      }

      let descricao = ''
      if (chave === 'automacao_3dias_ativa') {
        descricao = 'Automação de mensagens 3 dias antes do vencimento'
      } else if (chave === 'automacao_5dias_ativa') {
        descricao = 'Automação de mensagens 5 dias antes do vencimento'
      } else if (chave === 'automacao_ematraso_ativa') {
        descricao = 'Automação de mensagens para mensalidades em atraso'
      }

      // Chave única por usuário: prefixar com user_id
      const chaveUnica = `${user.id}_${chave}`

      // Primeiro tentar atualizar
      const { data: existing, error: selectError } = await supabase
        .from('config')
        .select('id')
        .eq('chave', chaveUnica)
        .maybeSingle()

      if (selectError) {
        console.error('Erro ao verificar configuração:', selectError)
      }

      if (existing) {
        // Atualizar registro existente
        const { error } = await supabase
          .from('config')
          .update({
            valor: valor.toString(),
            descricao: descricao,
            updated_at: new Date().toISOString()
          })
          .eq('chave', chaveUnica)

        if (error) {
          console.error('Erro ao atualizar configuração:', error)
          setFeedbackModal({ isOpen: true, type: 'danger', title: 'Erro', message: 'Erro ao salvar configuração: ' + error.message })
          return false
        }
      } else {
        // Inserir novo registro
        const { error } = await supabase
          .from('config')
          .insert({
            user_id: user.id,
            chave: chaveUnica,
            valor: valor.toString(),
            descricao: descricao,
            updated_at: new Date().toISOString()
          })

        if (error) {
          console.error('Erro ao inserir configuração:', error)
          setFeedbackModal({ isOpen: true, type: 'danger', title: 'Erro', message: 'Erro ao salvar configuração: ' + error.message })
          return false
        }
      }

      return true
    } catch (error) {
      console.error('Erro ao salvar configuração de automação:', error)
      setFeedbackModal({ isOpen: true, type: 'danger', title: 'Erro', message: 'Erro ao salvar configuração' })
      return false
    }
  }

  // Toggle automação 3 dias
  const toggleAutomacao3Dias = async () => {
    const novoValor = !automacao3DiasAtiva
    const sucesso = await salvarConfiguracaoAutomacao('automacao_3dias_ativa', novoValor)
    if (sucesso) {
      setAutomacao3DiasAtiva(novoValor)
    }
  }

  // Toggle automação 5 dias
  const toggleAutomacao5Dias = async () => {
    const novoValor = !automacao5DiasAtiva
    const sucesso = await salvarConfiguracaoAutomacao('automacao_5dias_ativa', novoValor)
    if (sucesso) {
      setAutomacao5DiasAtiva(novoValor)
    }
  }

  // Toggle automação em atraso
  const toggleAutomacaoEmAtraso = async () => {
    const novoValor = !automacaoEmAtrasoAtiva
    const sucesso = await salvarConfiguracaoAutomacao('automacao_ematraso_ativa', novoValor)
    if (sucesso) {
      setAutomacaoEmAtrasoAtiva(novoValor)
    }
  }

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

            // Salvar conexão no banco de dados
            salvarConexaoNoBanco()
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

      // Atualizar status no banco de dados (tabela config)
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        await supabase
          .from('config')
          .upsert({
            user_id: user.id,
            chave: 'whatsapp_conectado',
            valor: 'false',
            descricao: 'Status de conexão do WhatsApp',
            updated_at: new Date().toISOString()
          }, {
            onConflict: 'chave'
          })

        // Atualizar tabela mensallizap (marcar como desconectado)
        console.log('💾 Atualizando mensallizap (desconexão)...')
        const { error: mensallizapError } = await supabase
          .from('mensallizap')
          .update({
            conectado: false,
            ultima_desconexao: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })
          .eq('user_id', user.id)

        if (mensallizapError) {
          console.error('❌ Erro ao atualizar mensallizap:', mensallizapError)
        } else {
          console.log('✅ Mensallizap atualizada (desconectado)')
        }
      }

      setStatus('disconnected')
      setQrCode(null)
      setFeedbackModal({ isOpen: true, type: 'success', title: 'Desconectado', message: 'WhatsApp desconectado com sucesso!' })
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
      .replace(/\{\{valorMensalidade\}\}/g, 'R$ 150,00')
      .replace(/\{\{dataVencimento\}\}/g, '06/01/2026')
      .replace(/\{\{diasAtraso\}\}/g, '5')
      .replace(/\{\{nomeEmpresa\}\}/g, 'Minha Empresa')
  }

  const getTituloDefault = (tipo) => {
    const titulos = {
      overdue: 'Mensagem de Cobrança - Em Atraso',
      pre_due_3days: 'Lembrete - 3 Dias Antes do Vencimento',
      pre_due_5days: 'Lembrete - 5 Dias Antes do Vencimento'
    }
    return titulos[tipo] || ''
  }

  const getMensagemDefault = (tipo) => {
    if (tipo === 'overdue') {
      return `Olá {{nomeCliente}},

Identificamos que a mensalidade no valor de {{valorMensalidade}} com vencimento em {{dataVencimento}} está em atraso há {{diasAtraso}} dias.

Por favor, regularize sua situação o quanto antes.

Atenciosamente,
{{nomeEmpresa}}`
    } else if (tipo === 'pre_due_3days') {
      return `Olá {{nomeCliente}},

Este é um lembrete de que sua mensalidade no valor de {{valorMensalidade}} vence em 3 dias ({{dataVencimento}}).

Para evitar atrasos, você pode realizar o pagamento antecipadamente.

Atenciosamente,
{{nomeEmpresa}}`
    } else if (tipo === 'pre_due_5days') {
      return `Olá {{nomeCliente}},

Lembramos que sua mensalidade no valor de {{valorMensalidade}} vence em 5 dias ({{dataVencimento}}).

Fique atento ao prazo para evitar juros e multas.

Atenciosamente,
{{nomeEmpresa}}`
    }
    return ''
  }

  const restaurarMensagemPadrao = () => {
    setTituloTemplate(getTituloDefault(tipoTemplateSelecionado))
    setMensagemTemplate(getMensagemDefault(tipoTemplateSelecionado))
    setFeedbackModal({ isOpen: true, type: 'info', title: 'Restaurado', message: 'Mensagem padrão restaurada' })
  }

  const carregarTemplates = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()

      const { data: templates, error } = await supabase
        .from('templates')
        .select('*')
        .eq('user_id', user.id)
        .eq('ativo', true)
        .order('created_at', { ascending: false })

      if (error) throw error

      // Group templates by type
      const agrupados = {
        overdue: templates?.find(t => t.tipo === 'overdue') || null,
        pre_due_3days: templates?.find(t => t.tipo === 'pre_due_3days') || null,
        pre_due_5days: templates?.find(t => t.tipo === 'pre_due_5days') || null
      }

      setTemplatesAgrupados(agrupados)

      // Load current selected type template
      const templateAtual = agrupados[tipoTemplateSelecionado]
      if (templateAtual) {
        setTituloTemplate(templateAtual.titulo)
        setMensagemTemplate(templateAtual.mensagem)
      } else {
        // Load default for this type
        setTituloTemplate(getTituloDefault(tipoTemplateSelecionado))
        setMensagemTemplate(getMensagemDefault(tipoTemplateSelecionado))
      }
    } catch (error) {
      console.error('Erro ao carregar templates:', error)
      setFeedbackModal({ isOpen: true, type: 'danger', title: 'Erro', message: 'Erro ao carregar templates' })
    }
  }

  const salvarTemplate = async () => {
    if (!tituloTemplate.trim() || !mensagemTemplate.trim()) {
      setFeedbackModal({ isOpen: true, type: 'warning', title: 'Atenção', message: 'Preencha o título e a mensagem do template' })
      return
    }

    try {
      const { data: { user } } = await supabase.auth.getUser()

      const templateExistente = templatesAgrupados[tipoTemplateSelecionado]

      if (templateExistente) {
        // Update existing
        const { error } = await supabase
          .from('templates')
          .update({
            titulo: tituloTemplate,
            mensagem: mensagemTemplate,
            updated_at: new Date().toISOString()
          })
          .eq('id', templateExistente.id)

        if (error) throw error
      } else {
        // Create new
        const { error } = await supabase
          .from('templates')
          .insert({
            user_id: user.id,
            titulo: tituloTemplate,
            mensagem: mensagemTemplate,
            tipo: tipoTemplateSelecionado,
            ativo: true,
            is_padrao: false
          })

        if (error) throw error
      }

      setFeedbackModal({ isOpen: true, type: 'success', title: 'Sucesso', message: 'Template salvo com sucesso!' })
      await carregarTemplates()
    } catch (error) {
      console.error('Erro ao salvar template:', error)
      setFeedbackModal({ isOpen: true, type: 'danger', title: 'Erro', message: 'Erro ao salvar template: ' + error.message })
    }
  }

  // ========== RENDER ==========

  return (
    <div style={{ flex: 1, padding: isSmallScreen ? '16px' : '25px 30px', backgroundColor: '#f5f5f5', minHeight: '100vh' }}>
      {/* Header */}
      <div style={{
        backgroundColor: 'white',
        borderRadius: '8px',
        padding: isSmallScreen ? '16px' : '20px',
        marginBottom: isSmallScreen ? '16px' : '25px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.08)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <Icon icon="mdi:whatsapp" width={isSmallScreen ? 28 : 32} height={isSmallScreen ? 28 : 32} style={{ color: '#25D366' }} />
          <div>
            <h2 style={{ margin: 0, fontSize: isSmallScreen ? '16px' : '18px', fontWeight: '600', color: '#344848' }}>
              WhatsApp
            </h2>
            <p style={{ margin: '5px 0 0 0', fontSize: isSmallScreen ? '13px' : '14px', color: '#666' }}>
              Gerencie sua conexão e templates de mensagens
            </p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{
        backgroundColor: 'white',
        borderRadius: '8px',
        marginBottom: isSmallScreen ? '16px' : '25px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
        display: 'flex',
        gap: '4px',
        padding: '4px'
      }}>
        <button
          onClick={() => setActiveTab('conexao')}
          style={{
            flex: 1,
            padding: isSmallScreen ? '10px 12px' : '12px 20px',
            backgroundColor: activeTab === 'conexao' ? '#25D366' : 'transparent',
            color: activeTab === 'conexao' ? 'white' : '#666',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer',
            fontSize: isSmallScreen ? '13px' : '14px',
            fontWeight: '500',
            transition: 'all 0.2s',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px'
          }}
        >
          <Icon icon="mdi:connection" width="18" />
          {isSmallScreen ? 'Conexão' : 'Conexão'}
        </button>
        <button
          onClick={() => setActiveTab('templates')}
          style={{
            flex: 1,
            padding: isSmallScreen ? '10px 12px' : '12px 20px',
            backgroundColor: activeTab === 'templates' ? '#25D366' : 'transparent',
            color: activeTab === 'templates' ? 'white' : '#666',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer',
            fontSize: isSmallScreen ? '13px' : '14px',
            fontWeight: '500',
            transition: 'all 0.2s',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px'
          }}
        >
          <Icon icon="mdi:message-text" width="18" />
          {isSmallScreen ? 'Templates' : 'Templates de Mensagens'}
        </button>
      </div>

      {/* Conteúdo */}
      {activeTab === 'conexao' ? (
        <>
          {/* Status Badge */}
          <div style={{
            backgroundColor: 'white',
            borderRadius: '8px',
            padding: isSmallScreen ? '12px 16px' : '16px 20px',
            marginBottom: isSmallScreen ? '16px' : '25px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
            display: 'flex',
            flexDirection: isSmallScreen ? 'column' : 'row',
            justifyContent: 'space-between',
            alignItems: isSmallScreen ? 'stretch' : 'center',
            gap: isSmallScreen ? '12px' : '0'
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
            padding: isSmallScreen ? '20px' : '40px',
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
                  padding: isSmallScreen ? '12px' : '20px',
                  backgroundColor: 'white',
                  borderRadius: '12px',
                  border: '2px solid #e0e0e0',
                  marginBottom: '30px'
                }}>
                  <img
                    src={qrCode}
                    alt="QR Code WhatsApp"
                    style={{
                      width: isSmallScreen ? '220px' : '300px',
                      height: isSmallScreen ? '220px' : '300px',
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
          padding: isSmallScreen ? '16px' : '30px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.08)'
        }}>
          <div style={{ marginBottom: isSmallScreen ? '20px' : '30px' }}>
            <h3 style={{ margin: '0 0 8px 0', fontSize: isSmallScreen ? '16px' : '18px', fontWeight: '600', color: '#344848' }}>
              Templates de Mensagens
            </h3>
            <p style={{ margin: 0, fontSize: isSmallScreen ? '13px' : '14px', color: '#666' }}>
              Crie e gerencie templates de mensagens personalizadas para enviar aos seus clientes
            </p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: isMobile || isTablet ? '1fr' : '1fr 1fr', gap: isSmallScreen ? '20px' : '30px', marginBottom: isSmallScreen ? '20px' : '30px' }}>
            {/* Editor */}
            <div>
              <h4 style={{ margin: '0 0 16px 0', fontSize: '15px', fontWeight: '600', color: '#344848' }}>
                Editor de Template
              </h4>

              {/* Toggles de Automação - MOVIDO PARA O TOPO */}
              <div style={{
                backgroundColor: '#f8f9fa',
                border: '1px solid #e0e0e0',
                borderRadius: '8px',
                padding: '16px',
                marginBottom: '20px'
              }}>
                <div style={{ marginBottom: '12px' }}>
                  <h4 style={{ margin: '0 0 4px 0', fontSize: '14px', fontWeight: '600', color: '#344848', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Icon icon="mdi:robot-outline" width="18" />
                    Automação de Mensagens
                  </h4>
                  <p style={{ margin: 0, fontSize: '12px', color: '#666' }}>
                    Ative ou desative o envio automático de mensagens
                  </p>
                </div>

                {/* Toggle 3 Dias */}
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '12px',
                  backgroundColor: 'white',
                  borderRadius: '6px',
                  marginBottom: '8px',
                  border: '1px solid #e0e0e0',
                  opacity: automacaoLocked ? 0.7 : 1,
                  position: 'relative'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <Icon icon="mdi:calendar-clock" width="20" style={{ color: '#2196F3' }} />
                    <div>
                      <div style={{ fontSize: '13px', fontWeight: '500', color: '#344848' }}>
                        3 Dias Antes
                      </div>
                      <div style={{ fontSize: '11px', color: '#999' }}>
                        Enviar lembretes 3 dias antes do vencimento
                      </div>
                    </div>
                  </div>
                  {automacaoLocked ? (
                    <button
                      onClick={() => setUpgradeModal({ isOpen: true, featureName: 'Automação 3 Dias Antes' })}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        padding: '6px 12px',
                        backgroundColor: '#fff3e0',
                        border: '1px solid #ffcc80',
                        borderRadius: '16px',
                        cursor: 'pointer',
                        fontSize: '12px',
                        fontWeight: '500',
                        color: '#e65100'
                      }}
                    >
                      <Icon icon="mdi:lock" width="14" />
                      Pro
                    </button>
                  ) : (
                    <button
                      onClick={toggleAutomacao3Dias}
                      style={{
                        position: 'relative',
                        width: '50px',
                        height: '26px',
                        backgroundColor: automacao3DiasAtiva ? '#4CAF50' : '#ccc',
                        borderRadius: '13px',
                        border: 'none',
                        cursor: 'pointer',
                        transition: 'background-color 0.3s',
                        padding: 0
                      }}
                    >
                      <div style={{
                        position: 'absolute',
                        top: '3px',
                        left: automacao3DiasAtiva ? '26px' : '3px',
                        width: '20px',
                        height: '20px',
                        backgroundColor: 'white',
                        borderRadius: '50%',
                        transition: 'left 0.3s',
                        boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
                      }} />
                    </button>
                  )}
                </div>

                {/* Toggle 5 Dias */}
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '12px',
                  backgroundColor: 'white',
                  borderRadius: '6px',
                  border: '1px solid #e0e0e0',
                  opacity: automacaoLocked ? 0.7 : 1,
                  position: 'relative'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <Icon icon="mdi:calendar-alert" width="20" style={{ color: '#ff9800' }} />
                    <div>
                      <div style={{ fontSize: '13px', fontWeight: '500', color: '#344848' }}>
                        5 Dias Antes
                      </div>
                      <div style={{ fontSize: '11px', color: '#999' }}>
                        Enviar lembretes 5 dias antes do vencimento
                      </div>
                    </div>
                  </div>
                  {automacaoLocked ? (
                    <button
                      onClick={() => setUpgradeModal({ isOpen: true, featureName: 'Automação 5 Dias Antes' })}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        padding: '6px 12px',
                        backgroundColor: '#fff3e0',
                        border: '1px solid #ffcc80',
                        borderRadius: '16px',
                        cursor: 'pointer',
                        fontSize: '12px',
                        fontWeight: '500',
                        color: '#e65100'
                      }}
                    >
                      <Icon icon="mdi:lock" width="14" />
                      Pro
                    </button>
                  ) : (
                    <button
                      onClick={toggleAutomacao5Dias}
                      style={{
                        position: 'relative',
                        width: '50px',
                        height: '26px',
                        backgroundColor: automacao5DiasAtiva ? '#4CAF50' : '#ccc',
                        borderRadius: '13px',
                        border: 'none',
                        cursor: 'pointer',
                        transition: 'background-color 0.3s',
                        padding: 0
                      }}
                    >
                      <div style={{
                        position: 'absolute',
                        top: '3px',
                        left: automacao5DiasAtiva ? '26px' : '3px',
                        width: '20px',
                        height: '20px',
                        backgroundColor: 'white',
                        borderRadius: '50%',
                        transition: 'left 0.3s',
                        boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
                      }} />
                    </button>
                  )}
                </div>

                {/* Toggle Em Atraso */}
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '12px',
                  backgroundColor: 'white',
                  borderRadius: '6px',
                  marginTop: '8px',
                  border: '1px solid #e0e0e0'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <Icon icon="mdi:alert-circle" width="20" style={{ color: '#f44336' }} />
                    <div>
                      <div style={{ fontSize: '13px', fontWeight: '500', color: '#344848' }}>
                        Em Atraso
                      </div>
                      <div style={{ fontSize: '11px', color: '#999' }}>
                        Enviar cobranças para mensalidades vencidas
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={toggleAutomacaoEmAtraso}
                    style={{
                      position: 'relative',
                      width: '50px',
                      height: '26px',
                      backgroundColor: automacaoEmAtrasoAtiva ? '#4CAF50' : '#ccc',
                      borderRadius: '13px',
                      border: 'none',
                      cursor: 'pointer',
                      transition: 'background-color 0.3s',
                      padding: 0
                    }}
                  >
                    <div style={{
                      position: 'absolute',
                      top: '3px',
                      left: automacaoEmAtrasoAtiva ? '26px' : '3px',
                      width: '20px',
                      height: '20px',
                      backgroundColor: 'white',
                      borderRadius: '50%',
                      transition: 'left 0.3s',
                      boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
                    }} />
                  </button>
                </div>
              </div>

              {/* Template Type Selector */}
              <div style={{ marginBottom: '20px' }}>
                <label style={{
                  display: 'block',
                  marginBottom: '10px',
                  fontSize: '14px',
                  fontWeight: '600',
                  color: '#344848'
                }}>
                  Tipo de Mensagem
                </label>
                <div style={{ display: 'flex', flexDirection: isSmallScreen ? 'column' : 'row', gap: isSmallScreen ? '8px' : '12px' }}>
                  <button
                    disabled={!automacao3DiasAtiva || automacaoLocked}
                    onClick={() => {
                      if (automacaoLocked) {
                        setUpgradeModal({ isOpen: true, featureName: 'Template 3 Dias Antes' })
                        return
                      }
                      if (!automacao3DiasAtiva) return
                      setTipoTemplateSelecionado('pre_due_3days')
                      const template = templatesAgrupados.pre_due_3days
                      if (template) {
                        setTituloTemplate(template.titulo)
                        setMensagemTemplate(template.mensagem)
                      } else {
                        setTituloTemplate(getTituloDefault('pre_due_3days'))
                        setMensagemTemplate(getMensagemDefault('pre_due_3days'))
                      }
                    }}
                    style={{
                      flex: 1,
                      padding: '12px 16px',
                      backgroundColor: tipoTemplateSelecionado === 'pre_due_3days' && !automacaoLocked ? '#2196F3' : 'white',
                      color: tipoTemplateSelecionado === 'pre_due_3days' && !automacaoLocked ? 'white' : '#666',
                      border: tipoTemplateSelecionado === 'pre_due_3days' && !automacaoLocked ? 'none' : '2px solid #e0e0e0',
                      borderRadius: '8px',
                      cursor: automacaoLocked ? 'pointer' : (automacao3DiasAtiva ? 'pointer' : 'not-allowed'),
                      fontSize: '13px',
                      fontWeight: '600',
                      transition: 'all 0.2s',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: '4px',
                      opacity: automacaoLocked ? 0.6 : (automacao3DiasAtiva ? 1 : 0.5),
                      position: 'relative'
                    }}
                    title={automacaoLocked ? 'Disponível no plano Pro' : (!automacao3DiasAtiva ? 'Ative a automação de 3 dias para editar este template' : '')}
                  >
                    {automacaoLocked && (
                      <Icon icon="mdi:lock" width="14" style={{ position: 'absolute', top: '8px', right: '8px', color: '#e65100' }} />
                    )}
                    <Icon icon="mdi:calendar-clock" width="20" />
                    <span>3 Dias Antes</span>
                    {templatesAgrupados.pre_due_3days && automacao3DiasAtiva && !automacaoLocked && (
                      <Icon icon="mdi:check-circle" width="16" style={{ color: tipoTemplateSelecionado === 'pre_due_3days' ? 'white' : '#4CAF50' }} />
                    )}
                  </button>

                  <button
                    disabled={!automacao5DiasAtiva || automacaoLocked}
                    onClick={() => {
                      if (automacaoLocked) {
                        setUpgradeModal({ isOpen: true, featureName: 'Template 5 Dias Antes' })
                        return
                      }
                      if (!automacao5DiasAtiva) return
                      setTipoTemplateSelecionado('pre_due_5days')
                      const template = templatesAgrupados.pre_due_5days
                      if (template) {
                        setTituloTemplate(template.titulo)
                        setMensagemTemplate(template.mensagem)
                      } else {
                        setTituloTemplate(getTituloDefault('pre_due_5days'))
                        setMensagemTemplate(getMensagemDefault('pre_due_5days'))
                      }
                    }}
                    style={{
                      flex: 1,
                      padding: '12px 16px',
                      backgroundColor: tipoTemplateSelecionado === 'pre_due_5days' && !automacaoLocked ? '#ff9800' : 'white',
                      color: tipoTemplateSelecionado === 'pre_due_5days' && !automacaoLocked ? 'white' : '#666',
                      border: tipoTemplateSelecionado === 'pre_due_5days' && !automacaoLocked ? 'none' : '2px solid #e0e0e0',
                      borderRadius: '8px',
                      cursor: automacaoLocked ? 'pointer' : (automacao5DiasAtiva ? 'pointer' : 'not-allowed'),
                      fontSize: '13px',
                      fontWeight: '600',
                      transition: 'all 0.2s',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: '4px',
                      opacity: automacaoLocked ? 0.6 : (automacao5DiasAtiva ? 1 : 0.5),
                      position: 'relative'
                    }}
                    title={automacaoLocked ? 'Disponível no plano Pro' : (!automacao5DiasAtiva ? 'Ative a automação de 5 dias para editar este template' : '')}
                  >
                    {automacaoLocked && (
                      <Icon icon="mdi:lock" width="14" style={{ position: 'absolute', top: '8px', right: '8px', color: '#e65100' }} />
                    )}
                    <Icon icon="mdi:calendar-alert" width="20" />
                    <span>5 Dias Antes</span>
                    {templatesAgrupados.pre_due_5days && automacao5DiasAtiva && !automacaoLocked && (
                      <Icon icon="mdi:check-circle" width="16" style={{ color: tipoTemplateSelecionado === 'pre_due_5days' ? 'white' : '#4CAF50' }} />
                    )}
                  </button>

                  <button
                    disabled={!automacaoEmAtrasoAtiva}
                    onClick={() => {
                      if (!automacaoEmAtrasoAtiva) return
                      setTipoTemplateSelecionado('overdue')
                      const template = templatesAgrupados.overdue
                      if (template) {
                        setTituloTemplate(template.titulo)
                        setMensagemTemplate(template.mensagem)
                      } else {
                        setTituloTemplate(getTituloDefault('overdue'))
                        setMensagemTemplate(getMensagemDefault('overdue'))
                      }
                    }}
                    style={{
                      flex: 1,
                      padding: '12px 16px',
                      backgroundColor: tipoTemplateSelecionado === 'overdue' ? '#f44336' : 'white',
                      color: tipoTemplateSelecionado === 'overdue' ? 'white' : '#666',
                      border: tipoTemplateSelecionado === 'overdue' ? 'none' : '2px solid #e0e0e0',
                      borderRadius: '8px',
                      cursor: automacaoEmAtrasoAtiva ? 'pointer' : 'not-allowed',
                      fontSize: '13px',
                      fontWeight: '600',
                      transition: 'all 0.2s',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: '4px',
                      opacity: automacaoEmAtrasoAtiva ? 1 : 0.5,
                      position: 'relative'
                    }}
                    title={!automacaoEmAtrasoAtiva ? 'Ative a automação de Em Atraso para editar este template' : ''}
                  >
                    <Icon icon="mdi:alert-circle" width="20" />
                    <span>Em Atraso</span>
                    {templatesAgrupados.overdue && automacaoEmAtrasoAtiva && (
                      <Icon icon="mdi:check-circle" width="16" style={{ color: tipoTemplateSelecionado === 'overdue' ? 'white' : '#4CAF50' }} />
                    )}
                  </button>
                </div>
              </div>

              {/* Aviso de bloqueio para Starter */}
              {templateEditLocked && (
                <div style={{
                  padding: '12px 16px',
                  backgroundColor: '#fff3e0',
                  border: '1px solid #ffcc80',
                  borderRadius: '8px',
                  marginBottom: '16px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px'
                }}>
                  <Icon icon="mdi:lock" width="20" style={{ color: '#ff9800', flexShrink: 0 }} />
                  <div>
                    <span style={{ fontSize: '13px', fontWeight: '600', color: '#e65100' }}>
                      Personalização bloqueada
                    </span>
                    <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: '#666' }}>
                      A edição de templates está disponível a partir do plano Pro.
                    </p>
                  </div>
                </div>
              )}

              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', marginBottom: '8px', fontSize: '13px', fontWeight: '500', color: '#666' }}>
                  Título do Template
                </label>
                <input
                  type="text"
                  value={tituloTemplate}
                  onChange={(e) => setTituloTemplate(e.target.value)}
                  disabled={templateEditLocked}
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    border: '1px solid #e0e0e0',
                    borderRadius: '6px',
                    fontSize: '16px',
                    fontFamily: 'inherit',
                    outline: 'none',
                    boxSizing: 'border-box',
                    backgroundColor: templateEditLocked ? '#f5f5f5' : 'white',
                    cursor: templateEditLocked ? 'not-allowed' : 'text',
                    opacity: templateEditLocked ? 0.7 : 1
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
                    disabled={templateEditLocked}
                    style={{
                      padding: '6px 12px',
                      backgroundColor: 'white',
                      border: '1px solid #e0e0e0',
                      borderRadius: '6px',
                      fontSize: '12px',
                      color: templateEditLocked ? '#aaa' : '#666',
                      cursor: templateEditLocked ? 'not-allowed' : 'pointer',
                      transition: 'all 0.2s',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      opacity: templateEditLocked ? 0.6 : 1
                    }}
                    onMouseEnter={(e) => {
                      if (!templateEditLocked) {
                        e.currentTarget.style.backgroundColor = '#f5f5f5'
                        e.currentTarget.style.borderColor = '#ccc'
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!templateEditLocked) {
                        e.currentTarget.style.backgroundColor = 'white'
                        e.currentTarget.style.borderColor = '#e0e0e0'
                      }
                    }}
                  >
                    <Icon icon="material-symbols:refresh" width="14" />
                    Restaurar Padrão
                  </button>
                </div>
                <textarea
                  value={mensagemTemplate}
                  onChange={(e) => setMensagemTemplate(e.target.value)}
                  disabled={templateEditLocked}
                  style={{
                    width: '100%',
                    minHeight: isSmallScreen ? '200px' : '300px',
                    padding: '14px',
                    border: '1px solid #e0e0e0',
                    borderRadius: '6px',
                    fontSize: '16px',
                    fontFamily: 'inherit',
                    lineHeight: '1.6',
                    resize: templateEditLocked ? 'none' : 'vertical',
                    outline: 'none',
                    boxSizing: 'border-box',
                    backgroundColor: templateEditLocked ? '#f5f5f5' : 'white',
                    cursor: templateEditLocked ? 'not-allowed' : 'text',
                    opacity: templateEditLocked ? 0.7 : 1
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
                  <code
                    onClick={() => {
                      navigator.clipboard.writeText('{{nomeCliente}}')
                      setFeedbackModal({ isOpen: true, type: 'success', title: 'Copiado!', message: '{{nomeCliente}} copiado para a área de transferência' })
                    }}
                    style={{
                      padding: '4px 8px',
                      backgroundColor: '#e3f2fd',
                      border: '1px solid #e0e0e0',
                      borderRadius: '4px',
                      fontSize: '11px',
                      color: '#8867A1',
                      cursor: 'pointer',
                      fontWeight: '600'
                    }}
                  >
                    {`{{nomeCliente}}`}
                  </code>
                  <code
                    onClick={() => {
                      navigator.clipboard.writeText('{{valorMensalidade}}')
                      setFeedbackModal({ isOpen: true, type: 'success', title: 'Copiado!', message: '{{valorMensalidade}} copiado para a área de transferência' })
                    }}
                    style={{
                      padding: '4px 8px',
                      backgroundColor: '#e3f2fd',
                      border: '1px solid #e0e0e0',
                      borderRadius: '4px',
                      fontSize: '11px',
                      color: '#8867A1',
                      cursor: 'pointer',
                      fontWeight: '600'
                    }}
                  >
                    {`{{valorMensalidade}}`}
                  </code>
                  <code
                    onClick={() => {
                      navigator.clipboard.writeText('{{dataVencimento}}')
                      setFeedbackModal({ isOpen: true, type: 'success', title: 'Copiado!', message: '{{dataVencimento}} copiado para a área de transferência' })
                    }}
                    style={{
                      padding: '4px 8px',
                      backgroundColor: '#e3f2fd',
                      border: '1px solid #e0e0e0',
                      borderRadius: '4px',
                      fontSize: '11px',
                      color: '#8867A1',
                      cursor: 'pointer',
                      fontWeight: '600'
                    }}
                  >
                    {`{{dataVencimento}}`}
                  </code>
                  {tipoTemplateSelecionado === 'overdue' && (
                    <code
                      onClick={() => {
                        navigator.clipboard.writeText('{{diasAtraso}}')
                        setFeedbackModal({ isOpen: true, type: 'success', title: 'Copiado!', message: '{{diasAtraso}} copiado para a área de transferência' })
                      }}
                      style={{
                        padding: '4px 8px',
                        backgroundColor: '#ffebee',
                        border: '1px solid #e0e0e0',
                        borderRadius: '4px',
                        fontSize: '11px',
                        color: '#8867A1',
                        cursor: 'pointer',
                        fontWeight: '600'
                      }}
                    >
                      {`{{diasAtraso}}`}
                    </code>
                  )}
                  <code
                    onClick={() => {
                      navigator.clipboard.writeText('{{nomeEmpresa}}')
                      setFeedbackModal({ isOpen: true, type: 'success', title: 'Copiado!', message: '{{nomeEmpresa}} copiado para a área de transferência' })
                    }}
                    style={{
                      padding: '4px 8px',
                      backgroundColor: '#e3f2fd',
                      border: '1px solid #e0e0e0',
                      borderRadius: '4px',
                      fontSize: '11px',
                      color: '#8867A1',
                      cursor: 'pointer',
                      fontWeight: '600'
                    }}
                  >
                    {`{{nomeEmpresa}}`}
                  </code>
                </div>
                {tipoTemplateSelecionado !== 'overdue' && (
                  <p style={{ fontSize: '11px', color: '#999', marginTop: '8px', fontStyle: 'italic', margin: '8px 0 0 0' }}>
                    Nota: {`{{diasAtraso}}`} não está disponível para mensagens pré-vencimento
                  </p>
                )}
              </div>

              <button
                onClick={salvarTemplate}
                disabled={templateEditLocked}
                style={{
                  width: '100%',
                  padding: '12px',
                  backgroundColor: templateEditLocked ? '#ccc' : '#25D366',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  fontSize: '14px',
                  fontWeight: '600',
                  cursor: templateEditLocked ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  opacity: templateEditLocked ? 0.7 : 1
                }}
              >
                <Icon icon={templateEditLocked ? 'mdi:lock' : 'mdi:content-save'} width="18" />
                {templateEditLocked ? 'Edição bloqueada no Starter' : 'Salvar Template'}
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
                    {gerarPreview(mensagemTemplate)}
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

      {/* Modal de Feedback */}
      <ConfirmModal
        isOpen={feedbackModal.isOpen}
        onClose={() => setFeedbackModal({ ...feedbackModal, isOpen: false })}
        onConfirm={() => setFeedbackModal({ ...feedbackModal, isOpen: false })}
        title={feedbackModal.title}
        message={feedbackModal.message}
        confirmText="OK"
        cancelText=""
        type={feedbackModal.type}
      />

      {/* Modal de Upgrade (Recurso Bloqueado) */}
      {upgradeModal.isOpen && (
        <>
          {/* Backdrop */}
          <div
            onClick={() => setUpgradeModal({ isOpen: false, featureName: '' })}
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: 'rgba(0, 0, 0, 0.5)',
              zIndex: 10000,
              animation: 'fadeIn 0.2s ease-out'
            }}
          />

          {/* Modal */}
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              position: 'fixed',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              backgroundColor: 'white',
              borderRadius: '12px',
              padding: '24px',
              boxShadow: '0 8px 32px rgba(0, 0, 0, 0.2)',
              zIndex: 10001,
              minWidth: '280px',
              maxWidth: '90vw',
              textAlign: 'center',
              animation: 'slideUp 0.3s ease-out'
            }}
          >
            <div style={{
              width: '48px',
              height: '48px',
              borderRadius: '50%',
              backgroundColor: '#fff3e0',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 12px auto'
            }}>
              <Icon icon="mdi:lock" width="24" height="24" style={{ color: '#ff9800' }} />
            </div>

            <h4 style={{
              margin: '0 0 8px 0',
              fontSize: '18px',
              fontWeight: '600',
              color: '#1a1a1a'
            }}>
              Recurso Bloqueado
            </h4>

            <p style={{
              margin: '0 0 20px 0',
              fontSize: '14px',
              color: '#666',
              lineHeight: '1.5'
            }}>
              <strong>{upgradeModal.featureName}</strong> está disponível no plano <strong>Pro</strong> ou superior.
            </p>

            <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
              <button
                onClick={() => setUpgradeModal({ isOpen: false, featureName: '' })}
                style={{
                  padding: '10px 20px',
                  backgroundColor: 'white',
                  color: '#666',
                  border: '1px solid #e0e0e0',
                  borderRadius: '6px',
                  fontSize: '14px',
                  cursor: 'pointer',
                  fontWeight: '500',
                  minWidth: '100px',
                  transition: 'all 0.2s'
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
                Fechar
              </button>
              <button
                onClick={() => {
                  setUpgradeModal({ isOpen: false, featureName: '' })
                  navigate('/app/configuracao?aba=upgrade')
                }}
                style={{
                  padding: '10px 20px',
                  backgroundColor: '#ff9800',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  fontSize: '14px',
                  cursor: 'pointer',
                  fontWeight: '600',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                  minWidth: '100px',
                  transition: 'all 0.2s'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = '#f57c00'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = '#ff9800'
                }}
              >
                <Icon icon="mdi:rocket-launch" width="16" height="16" />
                Fazer Upgrade
              </button>
            </div>
          </div>

          <style>
            {`
              @keyframes fadeIn {
                from { opacity: 0; }
                to { opacity: 1; }
              }
              @keyframes slideUp {
                from { transform: translate(-50%, -50%) translateY(20px); opacity: 0; }
                to { transform: translate(-50%, -50%) translateY(0); opacity: 1; }
              }
            `}
          </style>
        </>
      )}
    </div>
  )
}
