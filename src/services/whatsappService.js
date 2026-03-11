import { supabase } from '../supabaseClient'

/**
 * Serviço para integração com Evolution API
 * Com cache para reduzir queries e timeout para evitar travamentos
 */
class WhatsAppService {
  constructor() {
    this.apiUrl = null
    this.apiKey = null
    this.instanceName = null
    this.initialized = false

    // Cache para reduzir queries desnecessárias
    this._cache = {
      userValidation: new Map(), // Cache de validação por userId
      lastInit: null,            // Timestamp da última inicialização
      initTTL: 5 * 60 * 1000     // 5 minutos de cache para credenciais
    }
  }

  /**
   * Limpa o cache (útil após mudanças de configuração)
   */
  clearCache() {
    this._cache.userValidation.clear()
    this._cache.lastInit = null
    this.initialized = false
  }

  /**
   * Fetch com timeout para evitar requisições que travam
   */
  async fetchWithTimeout(url, options = {}, timeoutMs = 30000) {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal
      })
      return response
    } finally {
      clearTimeout(timeoutId)
    }
  }

  /**
   * Fetch com retry e backoff exponencial
   * @param {string} url - URL da requisição
   * @param {object} options - Opções do fetch
   * @param {number} maxRetries - Número máximo de tentativas (default: 3)
   * @param {number} baseDelay - Delay base em ms (default: 1000)
   */
  async fetchWithRetry(url, options = {}, maxRetries = 3, baseDelay = 1000) {
    let lastError

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const response = await this.fetchWithTimeout(url, options, 30000)

        // Se sucesso ou erro de cliente (4xx), não retry
        if (response.ok || (response.status >= 400 && response.status < 500)) {
          return response
        }

        // Erro de servidor (5xx), tentar novamente
        // Guardar a response para o caller tratar com mensagens amigáveis
        if (attempt === maxRetries - 1) {
          return response // Última tentativa: retorna a response para o caller tratar
        }
        lastError = new Error(`Erro ao comunicar com WhatsApp (código ${response.status})`)
      } catch (error) {
        lastError = error

        // Se foi timeout ou erro de rede, tentar novamente
        if (error.name !== 'AbortError' && !error.message.includes('fetch')) {
          throw error // Erro inesperado, não fazer retry
        }
      }

      // Se não é a última tentativa, aguardar com backoff exponencial
      if (attempt < maxRetries - 1) {
        const delay = baseDelay * Math.pow(2, attempt) // 1s, 2s, 4s...
        console.log(`⏳ Tentativa ${attempt + 1} falhou. Aguardando ${delay}ms antes de retry...`)
        await new Promise(resolve => setTimeout(resolve, delay))
      }
    }

    throw lastError
  }

  /**
   * Inicializa o serviço com as configurações do Supabase
   */
  async initialize() {
    try {
      // Buscar configurações da Evolution API
      const { data: configs, error } = await supabase
        .from('config')
        .select('chave, valor')
        .in('chave', ['evolution_api_key', 'evolution_api_url'])

      if (error) throw error

      const configMap = {}
      configs.forEach(item => {
        configMap[item.chave] = item.valor
      })

      this.apiKey = configMap.evolution_api_key
      this.apiUrl = configMap.evolution_api_url || 'https://service-evolution-api.tnvro1.easypanel.host'

      // Gerar nome da instância baseado no usuário
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        this.instanceName = `instance_${user.id.substring(0, 8)}`
      }

      this.initialized = true
      return true
    } catch (error) {
      console.error('Erro ao inicializar WhatsAppService:', error)
      return false
    }
  }

  /**
   * Garante que o serviço está inicializado (com cache TTL)
   */
  async ensureInitialized() {
    const now = Date.now()

    // Verificar se cache expirou
    if (this.initialized && this._cache.lastInit) {
      const cacheAge = now - this._cache.lastInit
      if (cacheAge > this._cache.initTTL) {
        this.initialized = false
      }
    }

    if (!this.initialized) {
      await this.initialize()
      this._cache.lastInit = now
    }

    if (!this.apiKey || !this.apiUrl || !this.instanceName) {
      throw new Error('WhatsApp não configurado. Configure a Evolution API primeiro.')
    }
  }

  /**
   * Substitui variáveis do template com dados reais
   */
  substituirVariaveis(template, dados) {
    let mensagem = template

    // Substituições disponíveis
    const substituicoes = {
      '{{nomeCliente}}': dados.nomeCliente || '',
      '{{telefone}}': dados.telefone || '',
      '{{valorMensalidade}}': dados.valorMensalidade || '',
      '{{valorParcela}}': dados.valorMensalidade || '', // Alias para valorMensalidade
      '{{dataVencimento}}': dados.dataVencimento || '',
      '{{diasAtraso}}': dados.diasAtraso || '0',
      '{{nomeEmpresa}}': dados.nomeEmpresa || '',
      '{{chavePix}}': dados.chavePix || '',
      '{{linkPagamento}}': dados.linkPagamento || '',
      '{{portalCliente}}': dados.portalCliente || ''
    }

    // Aplicar todas as substituições
    Object.keys(substituicoes).forEach(variavel => {
      const regex = new RegExp(variavel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')
      mensagem = mensagem.replace(regex, substituicoes[variavel])
    })

    return mensagem
  }

  /**
   * Gera um link de pagamento PIX para a mensalidade
   * @returns {Promise<string>} URL do link de pagamento
   */
  async gerarLinkPagamento(userId, mensalidade, nomeEmpresa, chavePix) {
    try {
      // Gerar token único
      const token = crypto.randomUUID().replace(/-/g, '').substring(0, 32)

      // Determinar URL base
      const baseUrl = typeof window !== 'undefined'
        ? window.location.origin
        : 'https://app.mensallizap.com.br' // URL padrão para produção

      // Criar registro na tabela links_pagamento
      const { error } = await supabase
        .from('links_pagamento')
        .insert({
          user_id: userId,
          mensalidade_id: mensalidade.id,
          token: token,
          valor: mensalidade.valor,
          cliente_nome: mensalidade.devedor?.nome || 'Cliente',
          data_vencimento: mensalidade.data_vencimento,
          nome_empresa: nomeEmpresa || 'Empresa',
          chave_pix: chavePix || ''
        })

      if (error) {
        console.error('Erro ao criar link de pagamento:', error)
        return '' // Retorna vazio se falhar
      }

      return `${baseUrl}/pagar/${token}`
    } catch (error) {
      console.error('Erro ao gerar link de pagamento:', error)
      return ''
    }
  }

  /**
   * Formata número de telefone para o padrão internacional
   * Retorna o número SEM o sufixo @s.whatsapp.net (apenas dígitos com 55)
   */
  formatarTelefoneBase(telefone) {
    let numero = telefone.replace(/\D/g, '')

    // Se não tem código do país, adiciona Brasil (55)
    if (!numero.startsWith('55')) {
      numero = '55' + numero
    }

    return numero
  }

  /**
   * Gera variantes do número (com e sem o 9º dígito) para verificação
   * Retorna array de números no formato 55DDXXXXXXXXX
   */
  gerarVariantesNumero(telefone) {
    const numero = this.formatarTelefoneBase(telefone)
    const variantes = [numero]

    if (numero.startsWith('55') && numero.length >= 12) {
      const ddd = numero.substring(2, 4)
      const restante = numero.substring(4)

      if (restante.length === 9 && restante.startsWith('9')) {
        // Número tem 9 dígitos (com o 9): gerar variante SEM o 9
        const semNove = '55' + ddd + restante.substring(1)
        variantes.push(semNove)
        console.log(`📱 Variantes geradas: COM 9 = ${numero}, SEM 9 = ${semNove}`)
      } else if (restante.length === 8) {
        // Número tem 8 dígitos (sem o 9): gerar variante COM o 9
        const comNove = '55' + ddd + '9' + restante
        variantes.push(comNove)
        console.log(`📱 Variantes geradas: SEM 9 = ${numero}, COM 9 = ${comNove}`)
      }
    }

    return variantes
  }

  /**
   * Verifica qual versão do número existe no WhatsApp via Evolution API
   * Testa todas as variantes (com/sem 9) e retorna o número válido
   */
  async verificarNumeroWhatsApp(telefone, instanceNameOverride = null) {
    const instanceName = instanceNameOverride || this.instanceName
    const variantes = this.gerarVariantesNumero(telefone)

    // Se só tem uma variante, retorna direto
    if (variantes.length === 1) {
      return variantes[0] + '@s.whatsapp.net'
    }

    // Verificar qual número existe no WhatsApp
    try {
      const numerosParaVerificar = variantes.map(n => n + '@s.whatsapp.net')
      console.log('🔍 Verificando números no WhatsApp:', numerosParaVerificar)

      const response = await fetch(
        `${this.apiUrl}/chat/whatsappNumbers/${instanceName}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': this.apiKey
          },
          body: JSON.stringify({ numbers: numerosParaVerificar }),
          signal: AbortSignal.timeout(10000)
        }
      )

      if (response.ok) {
        const resultado = await response.json()
        console.log('🔍 Resultado da verificação:', resultado)

        // Procurar o número que existe
        const encontrados = (Array.isArray(resultado) ? resultado : resultado?.response || [])
        const valido = encontrados.find(r => r.exists === true)

        if (valido) {
          const numeroValido = valido.jid || valido.number
          console.log('✅ Número válido encontrado:', numeroValido)
          return numeroValido.includes('@') ? numeroValido : numeroValido + '@s.whatsapp.net'
        }

        console.log('⚠️ Nenhuma variante encontrada no WhatsApp, usando número original')
      } else {
        console.warn('⚠️ Falha na verificação de número, usando número original')
      }
    } catch (error) {
      console.warn('⚠️ Erro ao verificar número no WhatsApp:', error.message)
    }

    // Fallback: retorna o primeiro número (original)
    return variantes[0] + '@s.whatsapp.net'
  }

  /**
   * Formata número de telefone para o padrão WhatsApp (compatibilidade)
   * Mantido para casos que não passam pela verificação
   */
  formatarTelefone(telefone) {
    const numero = this.formatarTelefoneBase(telefone)
    console.log('📱 Número formatado (sem verificação):', numero)
    return numero + '@s.whatsapp.net'
  }

  /**
   * Retorna o nome da instância para um userId específico
   */
  getInstanceNameForUser(userId) {
    return `instance_${userId.substring(0, 8)}`
  }

  /**
   * Executa o envio real de mensagem via Evolution API (sem auto-recovery)
   * @param {string} instanceNameOverride - Nome da instância do dono da mensalidade (para admin viewing)
   * @returns {{ sucesso: boolean, messageId?: string, dados?: object, erro?: string, connectionClosed?: boolean }}
   */
  async _executarEnvio(telefone, mensagem, instanceNameOverride = null) {
    const instanceName = instanceNameOverride || this.instanceName
    const numeroFormatado = await this.verificarNumeroWhatsApp(telefone, instanceNameOverride)

    console.log('📡 Enviando para Evolution API...')
    console.log('🔗 URL:', `${this.apiUrl}/message/sendText/${instanceName}`)
    console.log('📞 Número verificado:', numeroFormatado)

    const payload = {
      number: numeroFormatado,
      text: mensagem
    }

    const response = await this.fetchWithRetry(
      `${this.apiUrl}/message/sendText/${instanceName}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': this.apiKey
        },
        body: JSON.stringify(payload)
      },
      2, // 2 tentativas (1 original + 1 retry)
      2000 // 2 segundos de delay base
    )

    console.log('📊 Status da resposta:', response.status)

    if (!response.ok) {
      const errorText = await response.text()
      console.error('❌ Resposta de erro (texto):', errorText)

      let errorData = {}
      try {
        errorData = JSON.parse(errorText)
        console.error('❌ Resposta de erro (JSON):', errorData)
      } catch (e) {
        // Não é JSON válido
      }

      // Verificar se é erro de conexão fechada (WhatsApp desconectado)
      if (errorData.response?.message === 'Connection Closed' || errorText.includes('Connection Closed')) {
        return { sucesso: false, erro: 'Connection Closed', connectionClosed: true }
      }

      // Erro 500 = geralmente WhatsApp desconectado ou instância com problema
      if (response.status === 500) {
        return { sucesso: false, erro: 'Connection Closed', connectionClosed: true }
      }

      // Verificar se é erro de número não existe
      if (errorData.response?.message && Array.isArray(errorData.response.message)) {
        const numeroNaoExiste = errorData.response.message.some(msg => msg.exists === false)
        if (numeroNaoExiste) {
          const numeroProblema = errorData.response.message[0].number.replace('@s.whatsapp.net', '')
          throw new Error(`O número ${numeroProblema} não existe no WhatsApp ou não está ativo. Verifique se:\n• O número está correto\n• A pessoa tem WhatsApp instalado\n• O número está ativo`)
        }
      }

      // Erro 404 = instância não encontrada
      if (response.status === 404) {
        throw new Error('Instância do WhatsApp não encontrada. Vá em WhatsApp → Conexão e reconecte.')
      }

      // Erro 401/403 = chave de API inválida
      if (response.status === 401 || response.status === 403) {
        throw new Error('Falha na autenticação com a API do WhatsApp. Verifique suas credenciais em Configurações.')
      }

      throw new Error(errorData.message || errorText || `Erro ao enviar mensagem (código ${response.status}). Tente novamente.`)
    }

    const result = await response.json()
    console.log('✅ Resposta de sucesso:', result)

    return {
      sucesso: true,
      messageId: result.key?.id || null,
      dados: result
    }
  }

  /**
   * Envia mensagem via Evolution API com auto-recovery
   * Se detectar "Connection Closed", tenta reiniciar a instância e reenviar
   * @param {string} telefone
   * @param {string} mensagem
   * @param {string|null} instanceNameOverride - Instância do dono da mensalidade (para admin viewing)
   */
  async enviarMensagem(telefone, mensagem, instanceNameOverride = null) {
    await this.ensureInitialized()

    try {
      // Primeira tentativa de envio
      const resultado = await this._executarEnvio(telefone, mensagem, instanceNameOverride)

      // Se conexão fechada, tentar auto-recovery
      if (resultado.connectionClosed) {
        console.log('🔄 Conexão fechada detectada. Tentando auto-recovery...')

        // Salvar instanceName original e usar o override para restart
        const originalInstanceName = this.instanceName
        if (instanceNameOverride) {
          this.instanceName = instanceNameOverride
        }

        const reconectou = await this.restartInstance()

        // Restaurar instanceName original
        this.instanceName = originalInstanceName

        if (reconectou) {
          console.log('✅ Instância reconectada! Reenviando mensagem...')
          const retryResult = await this._executarEnvio(telefone, mensagem, instanceNameOverride)

          if (retryResult.connectionClosed) {
            return {
              sucesso: false,
              erro: '📱 Tentamos reconectar automaticamente mas não foi possível enviar. Vá em WhatsApp → Conexão e escaneie o QR Code para reconectar.'
            }
          }

          return retryResult
        }

        return {
          sucesso: false,
          erro: '📱 Seu WhatsApp está desconectado e não foi possível reconectar automaticamente. Vá em WhatsApp → Conexão e escaneie o QR Code para reconectar.'
        }
      }

      return resultado
    } catch (error) {
      console.error('❌ Erro ao enviar mensagem:', error)

      if (error.name === 'AbortError') {
        return {
          sucesso: false,
          erro: 'Tempo limite excedido. A API do WhatsApp não respondeu em 30 segundos.'
        }
      }

      return {
        sucesso: false,
        erro: error.message
      }
    }
  }

  /**
   * Envia documento/arquivo via Evolution API (PDF, imagem, etc)
   * @param {string} telefone - Número do telefone
   * @param {string} mediaUrl - URL do arquivo (deve ser acessível publicamente)
   * @param {string} caption - Legenda opcional para o documento
   * @param {string} fileName - Nome do arquivo (ex: "boleto.pdf")
   * @param {string} mediaType - Tipo: "document", "image", "video", "audio"
   */
  /**
   * Executa o envio real de documento (sem auto-recovery)
   */
  async _executarEnvioDocumento(telefone, mediaUrl, caption, fileName, mediaType, instanceNameOverride = null) {
    const instanceName = instanceNameOverride || this.instanceName
    const numeroFormatado = await this.verificarNumeroWhatsApp(telefone, instanceNameOverride)

    console.log('📄 Enviando documento via Evolution API...')
    console.log('🔗 URL do arquivo:', mediaUrl)
    console.log('📞 Número:', numeroFormatado)

    const payload = {
      number: numeroFormatado,
      mediatype: mediaType,
      mimetype: mediaType === 'document' ? 'application/pdf' : 'image/png',
      caption: caption,
      media: mediaUrl,
      fileName: fileName
    }

    const response = await this.fetchWithRetry(
      `${this.apiUrl}/message/sendMedia/${instanceName}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': this.apiKey
        },
        body: JSON.stringify(payload)
      },
      2,
      3000
    )

    if (!response.ok) {
      const errorText = await response.text()
      console.error('❌ Erro ao enviar documento:', errorText)

      let errorData = {}
      try {
        errorData = JSON.parse(errorText)
      } catch (e) {
        // Não é JSON válido
      }

      if (errorData.response?.message === 'Connection Closed' || errorText.includes('Connection Closed') || response.status === 500) {
        return { sucesso: false, erro: 'Connection Closed', connectionClosed: true }
      }

      throw new Error(errorData.message || errorText || `Erro ao enviar documento (código ${response.status}). Tente novamente.`)
    }

    const result = await response.json()
    console.log('✅ Documento enviado:', result)

    return {
      sucesso: true,
      messageId: result.key?.id || null,
      dados: result
    }
  }

  /**
   * Envia documento via Evolution API com auto-recovery
   */
  async enviarDocumento(telefone, mediaUrl, caption = '', fileName = 'documento.pdf', mediaType = 'document', instanceNameOverride = null) {
    await this.ensureInitialized()

    try {
      const resultado = await this._executarEnvioDocumento(telefone, mediaUrl, caption, fileName, mediaType, instanceNameOverride)

      if (resultado.connectionClosed) {
        console.log('🔄 Conexão fechada detectada no envio de documento. Tentando auto-recovery...')

        // Usar instância correta para restart
        const originalInstanceName = this.instanceName
        if (instanceNameOverride) {
          this.instanceName = instanceNameOverride
        }

        const reconectou = await this.restartInstance()

        // Restaurar instanceName original
        this.instanceName = originalInstanceName

        if (reconectou) {
          console.log('✅ Instância reconectada! Reenviando documento...')
          const retryResult = await this._executarEnvioDocumento(telefone, mediaUrl, caption, fileName, mediaType, instanceNameOverride)

          if (retryResult.connectionClosed) {
            return {
              sucesso: false,
              erro: '📱 Não foi possível reconectar automaticamente. Vá em WhatsApp → Conexão e escaneie o QR Code.'
            }
          }

          return retryResult
        }

        return {
          sucesso: false,
          erro: '📱 WhatsApp desconectado. Não foi possível reconectar automaticamente. Vá em WhatsApp → Conexão e reconecte.'
        }
      }

      return resultado
    } catch (error) {
      console.error('❌ Erro ao enviar documento:', error)
      return {
        sucesso: false,
        erro: error.message
      }
    }
  }

  /**
   * Calcula o tipo de mensagem baseado na data de vencimento
   * Retorna o tipo que corresponde ao template no banco de dados
   */
  calcularTipoMensagem(dataVencimento) {
    const hoje = new Date()
    hoje.setHours(0, 0, 0, 0)
    const vencimento = new Date(dataVencimento + 'T00:00:00')
    const diffDias = Math.ceil((vencimento - hoje) / (1000 * 60 * 60 * 24))

    if (diffDias > 0) {
      return 'pre_due_3days' // Antes do vencimento (template: pre_due_3days)
    } else if (diffDias === 0) {
      return 'due_day' // No dia
    } else {
      return 'overdue' // Em atraso
    }
  }

  /**
   * Valida se o envio pode ser realizado (com cache de 60s)
   */
  async validarEnvio(userId, tipoMensagem) {
    const cacheKey = userId
    const now = Date.now()
    const cacheTTL = 60 * 1000 // 60 segundos

    // Verificar cache
    const cached = this._cache.userValidation.get(cacheKey)
    let config, plano, usageCount, limiteMensal

    if (cached && (now - cached.timestamp < cacheTTL)) {
      // Usar dados do cache
      config = cached.config
      plano = cached.plano
      usageCount = cached.usageCount
      limiteMensal = cached.limiteMensal
    } else {
      // Buscar dados em paralelo (3 queries → 1 round-trip)
      const [configResult, usuarioResult, controleResult] = await Promise.all([
        supabase
          .from('configuracoes_cobranca')
          .select('envio_habilitado')
          .eq('user_id', userId)
          .maybeSingle(),
        supabase
          .from('usuarios')
          .select('plano')
          .eq('id', userId)
          .maybeSingle(),
        supabase
          .from('controle_planos')
          .select('usage_count, limite_mensal')
          .eq('user_id', userId)
          .maybeSingle()
      ])

      config = configResult.data
      plano = usuarioResult.data?.plano || 'starter'
      usageCount = controleResult.data?.usage_count || 0
      limiteMensal = controleResult.data?.limite_mensal || 200

      // Salvar no cache
      this._cache.userValidation.set(cacheKey, {
        timestamp: now,
        config,
        plano,
        usageCount,
        limiteMensal
      })
    }

    // Se configuração existe e envio está desabilitado
    if (config && config.envio_habilitado === false) {
      return {
        permitido: false,
        erro: 'Envio de mensagens está desativado nas configurações'
      }
    }

    // 3. Verificar se plano Starter tentando enviar mensagem bloqueada
    // Starter só pode enviar "No Dia" (due_day)
    // Pro/Premium pode enviar: 3 dias antes (pre_due_3days), no dia (due_day), 3 dias depois (overdue), aniversário (birthday)
    if (plano === 'starter' && (tipoMensagem === 'pre_due_3days' || tipoMensagem === 'overdue' || tipoMensagem === 'birthday')) {
      return {
        permitido: false,
        erro: 'Este tipo de mensagem está disponível apenas para planos Pro e Premium. Faça upgrade para desbloquear.'
      }
    }

    // 4. Verificar limite mensal
    if (usageCount >= limiteMensal) {
      return {
        permitido: false,
        erro: `Limite mensal de ${limiteMensal} mensagens atingido. Faça upgrade do plano para continuar.`
      }
    }

    return { permitido: true }
  }

  /**
   * Gera preview da mensagem para uma mensalidade (para edição antes do envio)
   * @returns {Promise<{mensagem: string, dados: object}>}
   */
  async gerarPreviewMensagem(mensalidadeId) {
    try {
      // Buscar dados da mensalidade
      const { data: mensalidade, error } = await supabase
        .from('mensalidades')
        .select(`*, devedor:devedores(nome, telefone, portal_token)`)
        .eq('id', mensalidadeId)
        .single()

      if (error || !mensalidade) throw new Error('Mensalidade não encontrada')

      // Usar o user_id da mensalidade (dono real, não o admin logado)
      const ownerId = mensalidade.user_id

      // Buscar dados do usuário (dono da mensalidade)
      const { data: usuario } = await supabase
        .from('usuarios')
        .select('nome_empresa, chave_pix')
        .eq('id', ownerId)
        .maybeSingle()

      const nomeEmpresa = usuario?.nome_empresa || 'Empresa'
      const chavePix = usuario?.chave_pix || ''

      // Gerar link do portal do cliente
      const baseUrl = typeof window !== 'undefined'
        ? window.location.origin
        : 'https://app.mensallizap.com.br'
      const portalToken = mensalidade.devedor?.portal_token
      const portalLink = portalToken ? `${baseUrl}/portal/${portalToken}` : ''

      // Buscar template (do dono da mensalidade)
      const tipoMensagem = this.calcularTipoMensagem(mensalidade.data_vencimento)
      const { data: template } = await supabase
        .from('templates')
        .select('mensagem')
        .eq('user_id', ownerId)
        .eq('tipo', tipoMensagem)
        .eq('ativo', true)
        .limit(1)
        .maybeSingle()

      const TEMPLATES_PADRAO = {
        pre_due_3days: `Olá, {{nomeCliente}}! 👋\n\nSua mensalidade vence em {{dataVencimento}}.\n\n💰 Valor: {{valorMensalidade}}\n🔑 Chave Pix: {{chavePix}}\n\nPague com antecedência e evite esquecimento!\n\nQualquer dúvida, estamos à disposição.`,
        due_day: `Oi, {{nomeCliente}}! Tudo bem? 😃\n\nHoje vence sua mensalidade!\n\n💰 Valor: {{valorMensalidade}}\n🔑 Chave Pix: {{chavePix}}\n\nQualquer dúvida, estamos à disposição!`,
        overdue: `Olá, {{nomeCliente}}, como vai?\n\nNotamos que o pagamento da sua mensalidade (vencida em {{dataVencimento}}) ainda não consta em nosso sistema.\n\nSabemos que a rotina é corrida, por isso trouxemos os dados aqui para facilitar sua regularização agora mesmo:\n\n💰 Valor: {{valorMensalidade}}\n🔑 Chave Pix: {{chavePix}}\n\nSe você já realizou o pagamento e foi um atraso na nossa baixa manual, basta me enviar o comprovante por aqui! Obrigado! 🙏`
      }

      const mensagemTemplate = template?.mensagem || TEMPLATES_PADRAO[tipoMensagem] || TEMPLATES_PADRAO.overdue

      // Calcular dias de atraso
      const hoje = new Date()
      const vencimento = new Date(mensalidade.data_vencimento)
      const diasAtraso = Math.max(0, Math.floor((hoje - vencimento) / (1000 * 60 * 60 * 24)))

      // Preparar dados
      const dadosSubstituicao = {
        nomeCliente: mensalidade.devedor?.nome || 'Cliente',
        telefone: mensalidade.devedor?.telefone || '',
        valorMensalidade: `R$ ${parseFloat(mensalidade.valor).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
        dataVencimento: new Date(mensalidade.data_vencimento + 'T00:00:00').toLocaleDateString('pt-BR'),
        diasAtraso: diasAtraso.toString(),
        nomeEmpresa: nomeEmpresa,
        chavePix: chavePix,
        linkPagamento: '{{linkPagamento}}',
        portalCliente: '{{portalCliente}}'
      }

      // No preview, manter placeholders - link só é gerado no envio efetivo

      const mensagemFinal = this.substituirVariaveis(mensagemTemplate, dadosSubstituicao)

      return { mensagem: mensagemFinal, dados: dadosSubstituicao }
    } catch (error) {
      console.error('Erro ao gerar preview:', error)
      return { mensagem: '', dados: {} }
    }
  }

  /**
   * Busca link de pagamento Asaas existente (não cria novo)
   * Usado para preview - nunca gera custo no Asaas
   */
  async buscarLinkAsaasExistente(mensalidadeId) {
    try {
      const { data: boletoExistente } = await supabase
        .from('boletos')
        .select('invoice_url, asaas_id, status')
        .eq('mensalidade_id', mensalidadeId)
        .not('invoice_url', 'is', null)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (boletoExistente?.invoice_url) {
        return { sucesso: true, link: boletoExistente.invoice_url }
      }
      return { sucesso: false, erro: 'Nenhum boleto Asaas encontrado' }
    } catch (error) {
      return { sucesso: false, erro: error.message }
    }
  }

  /**
   * Gera link de pagamento via Asaas (BolePix)
   * Reutiliza boleto existente se houver, senão cria um novo
   * Usado apenas no envio efetivo (não no preview)
   */
  async gerarLinkPagamentoAsaas(mensalidade, devedorId) {
    try {
      // 1. Verificar se já existe boleto Asaas para esta mensalidade
      const existente = await this.buscarLinkAsaasExistente(mensalidade.id)
      if (existente.sucesso) {
        console.log('🔗 Reusando link Asaas existente:', existente.link)
        return existente
      }

      // 2. Importar e usar asaasService para criar BolePix
      const { asaasService } = await import('./asaasService')

      const isConfigured = await asaasService.isConfigured()
      if (!isConfigured) {
        return { sucesso: false, erro: 'Asaas não configurado' }
      }

      const resultado = await asaasService.criarBolePix({
        mensalidadeId: mensalidade.id,
        devedorId: devedorId,
        valor: mensalidade.valor,
        dataVencimento: mensalidade.data_vencimento,
        descricao: `Mensalidade - ${mensalidade.devedor?.nome || 'Cliente'}`
      })

      if (resultado?.invoice_url) {
        console.log('🔗 Link Asaas criado:', resultado.invoice_url)
        return { sucesso: true, link: resultado.invoice_url }
      }

      return { sucesso: false, erro: 'Sem invoice_url no retorno do Asaas' }
    } catch (error) {
      console.error('❌ Erro ao gerar link Asaas:', error)
      return { sucesso: false, erro: error.message }
    }
  }

  /**
   * Envia cobrança para uma mensalidade específica
   * @param {string} mensalidadeId - ID da mensalidade
   * @param {string} [mensagemCustomizada] - Mensagem customizada (opcional, usa template se não fornecida)
   */
  async enviarCobranca(mensalidadeId, mensagemCustomizada = null) {
    await this.ensureInitialized()

    try {
      // Buscar dados da mensalidade com informações do devedor
      const { data: mensalidade, error: mensalidadeError } = await supabase
        .from('mensalidades')
        .select(`
          *,
          devedor:devedores(nome, telefone, portal_token)
        `)
        .eq('id', mensalidadeId)
        .single()

      if (mensalidadeError) throw mensalidadeError
      if (!mensalidade) throw new Error('Mensalidade não encontrada')

      // Usar o user_id da mensalidade (dono real), não o admin logado
      const ownerId = mensalidade.user_id

      // VALIDAÇÕES DE ENVIO
      const tipoMensagem = this.calcularTipoMensagem(mensalidade.data_vencimento)
      const validacao = await this.validarEnvio(ownerId, tipoMensagem)

      if (!validacao.permitido) {
        return {
          sucesso: false,
          erro: validacao.erro,
          bloqueado: true
        }
      }

      // Buscar dados do usuário/empresa incluindo chave PIX (do dono da mensalidade)
      const { data: usuario, error: usuarioError } = await supabase
        .from('usuarios')
        .select('nome_empresa, chave_pix')
        .eq('id', ownerId)
        .maybeSingle()

      if (usuarioError) console.error('❌ Erro ao buscar usuário:', usuarioError)

      const nomeEmpresa = usuario?.nome_empresa || 'Empresa'
      const chavePix = usuario?.chave_pix || ''

      // Buscar template baseado no tipo de mensagem calculado (do dono da mensalidade)
      const { data: template } = await supabase
        .from('templates')
        .select('mensagem')
        .eq('user_id', ownerId)
        .eq('tipo', tipoMensagem)
        .eq('ativo', true)
        .limit(1)
        .maybeSingle()

      // Templates padrão do sistema para cada tipo
      const TEMPLATES_PADRAO = {
        pre_due_3days: `Olá, {{nomeCliente}}! 👋

Sua mensalidade vence em {{dataVencimento}}.

💰 Valor: {{valorMensalidade}}
🔑 Chave Pix: {{chavePix}}

Pague com antecedência e evite esquecimento!

Qualquer dúvida, estamos à disposição.`,

        due_day: `Oi, {{nomeCliente}}! Tudo bem? 😃

Hoje vence sua mensalidade!

💰 Valor: {{valorMensalidade}}
🔑 Chave Pix: {{chavePix}}

Qualquer dúvida, estamos à disposição!`,

        overdue: `Olá, {{nomeCliente}}, como vai?

Notamos que o pagamento da sua mensalidade (vencida em {{dataVencimento}}) ainda não consta em nosso sistema.

Sabemos que a rotina é corrida, por isso trouxemos os dados aqui para facilitar sua regularização agora mesmo:

💰 Valor: {{valorMensalidade}}
🔑 Chave Pix: {{chavePix}}

Se você já realizou o pagamento e foi um atraso na nossa baixa manual, basta me enviar o comprovante por aqui! Obrigado! 🙏`
      }

      // Usar template do usuário ou o padrão do tipo correto
      const mensagemTemplate = template?.mensagem || TEMPLATES_PADRAO[tipoMensagem] || TEMPLATES_PADRAO.overdue

      // Calcular dias de atraso
      const hoje = new Date()
      const vencimento = new Date(mensalidade.data_vencimento)
      const diasAtraso = Math.max(0, Math.floor((hoje - vencimento) / (1000 * 60 * 60 * 24)))

      // Gerar link do portal do cliente
      const baseUrl = typeof window !== 'undefined'
        ? window.location.origin
        : 'https://app.mensallizap.com.br'
      const portalToken = mensalidade.devedor?.portal_token
      const portalLink = portalToken ? `${baseUrl}/portal/${portalToken}` : ''

      // Preparar dados para substituição
      const dadosSubstituicao = {
        nomeCliente: mensalidade.devedor?.nome || 'Cliente',
        telefone: mensalidade.devedor?.telefone || '',
        valorMensalidade: `R$ ${parseFloat(mensalidade.valor).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
        dataVencimento: new Date(mensalidade.data_vencimento + 'T00:00:00').toLocaleDateString('pt-BR'),
        diasAtraso: diasAtraso.toString(),
        nomeEmpresa: nomeEmpresa,
        chavePix: chavePix,
        linkPagamento: '', // Será preenchido se necessário
        portalCliente: portalLink
      }

      // Verificar metodo de pagamento para decidir se envia link ou não
      if (mensagemTemplate.includes('{{linkPagamento}}') || mensagemTemplate.includes('{{portalCliente}}')) {
        const { data: configMetodo } = await supabase
          .from('config')
          .select('chave, valor')
          .eq('chave', `${ownerId}_metodo_pagamento_whatsapp`)
          .maybeSingle()

        const metodoPagamento = configMetodo?.valor || 'pix_manual'

        if (metodoPagamento === 'asaas_link') {
          // Asaas ativo: envia link do portal (checkout com QR do Asaas)
          dadosSubstituicao.linkPagamento = portalLink
          console.log('🔗 Asaas ativo - link do portal:', portalLink)
        } else {
          // PIX manual: sem link, só chave PIX na mensagem
          dadosSubstituicao.linkPagamento = ''
          console.log('🔑 PIX manual - sem link, usando chavePix')
        }
      }

      console.log('📝 Template usado:', mensagemTemplate)
      console.log('📊 Dados para substituição:', dadosSubstituicao)

      // Gerar mensagem final (usa customizada se fornecida, senão gera do template)
      let mensagemFinal
      if (mensagemCustomizada && mensagemCustomizada.trim()) {
        console.log('📝 Usando mensagem customizada')
        mensagemFinal = mensagemCustomizada

        // Verificar metodo para {{linkPagamento}} em msg customizada
        if (mensagemFinal.includes('{{linkPagamento}}')) {
          const { data: configMetodo } = await supabase
            .from('config')
            .select('chave, valor')
            .eq('chave', `${ownerId}_metodo_pagamento_whatsapp`)
            .maybeSingle()

          const metodoPagamento = configMetodo?.valor || 'pix_manual'
          const linkGerado = metodoPagamento === 'asaas_link' ? portalLink : ''
          mensagemFinal = mensagemFinal.replace(/\{\{linkPagamento\}\}/g, linkGerado)
        }

        // Se a mensagem customizada contém {{chavePix}}, substituir também
        if (mensagemFinal.includes('{{chavePix}}')) {
          mensagemFinal = mensagemFinal.replace(/\{\{chavePix\}\}/g, chavePix || '')
        }

        // Se a mensagem customizada contém {{portalCliente}}, substituir com link do portal
        if (mensagemFinal.includes('{{portalCliente}}')) {
          mensagemFinal = mensagemFinal.replace(/\{\{portalCliente\}\}/g, portalLink)
        }
      } else {
        mensagemFinal = this.substituirVariaveis(mensagemTemplate, dadosSubstituicao)
      }
      console.log('📨 Mensagem final após substituição:', mensagemFinal)

      // Enviar via Evolution API (usando instância do dono da mensalidade)
      const ownerInstanceName = this.getInstanceNameForUser(ownerId)
      const resultado = await this.enviarMensagem(mensalidade.devedor.telefone, mensagemFinal, ownerInstanceName)

      // Registrar log no banco
      console.log('💾 Salvando log no Supabase...')
      console.log('📝 Dados do log:', {
        user_id: ownerId,
        devedor_id: mensalidade.devedor_id,
        mensalidade_id: mensalidade.id,
        telefone: mensalidade.devedor.telefone,
        status: resultado.sucesso ? 'enviado' : 'erro'
      })

      const { data: logData, error: logError } = await supabase
        .from('logs_mensagens')
        .insert({
          user_id: ownerId,
          devedor_id: mensalidade.devedor_id,
          mensalidade_id: mensalidade.id,
          telefone: mensalidade.devedor.telefone,
          mensagem: mensagemFinal,
          valor_mensalidade: mensalidade.valor,
          status: resultado.sucesso ? 'enviado' : 'erro',
          erro: resultado.erro || null
        })
        .select()

      if (logError) {
        console.error('❌ Erro ao registrar log:', logError)
        console.error('❌ Detalhes completos do erro:', JSON.stringify(logError, null, 2))
      } else {
        console.log('✅ Log salvo com sucesso!', logData)
      }

      // Atualizar mensalidade e contabilizar uso
      if (resultado.sucesso) {
        const { error: updateError } = await supabase
          .from('mensalidades')
          .update({
            enviado_hoje: true,
            ultima_mensagem_enviada_em: new Date().toISOString(),
            total_mensagens_enviadas: (mensalidade.total_mensagens_enviadas || 0) + 1
          })
          .eq('id', mensalidadeId)

        if (updateError) {
          console.error('Erro ao atualizar mensalidade:', updateError)
        }

        // Incrementar contador de uso no controle_planos (do dono)
        const { data: controleAtual, error: controleError } = await supabase
          .from('controle_planos')
          .select('usage_count')
          .eq('user_id', ownerId)
          .maybeSingle()

        if (controleError) {
          console.error('Erro ao buscar controle de planos:', controleError)
        } else if (controleAtual) {
          // Atualizar registro existente
          const { error: updateUsageError } = await supabase
            .from('controle_planos')
            .update({
              usage_count: (controleAtual.usage_count || 0) + 1,
              updated_at: new Date().toISOString()
            })
            .eq('user_id', ownerId)

          if (updateUsageError) {
            console.error('Erro ao incrementar usage_count:', updateUsageError)
          } else {
            console.log('✅ Usage count incrementado para:', (controleAtual.usage_count || 0) + 1)
          }
        } else {
          // Criar registro se não existir
          const { error: insertUsageError } = await supabase
            .from('controle_planos')
            .insert({
              user_id: ownerId,
              usage_count: 1,
              limite_mensal: 100,
              updated_at: new Date().toISOString()
            })

          if (insertUsageError) {
            console.error('Erro ao criar controle de planos:', insertUsageError)
          } else {
            console.log('✅ Controle de planos criado com usage_count: 1')
          }
        }
      }

      return resultado
    } catch (error) {
      console.error('Erro ao enviar cobrança:', error)
      return {
        sucesso: false,
        erro: error.message
      }
    }
  }

  /**
   * Envia cobranças em lote
   */
  async enviarCobrancasLote(mensalidadeIds) {
    const resultados = []

    for (const mensalidadeId of mensalidadeIds) {
      const resultado = await this.enviarCobranca(mensalidadeId)
      resultados.push({
        mensalidadeId,
        ...resultado
      })

      // Delay de 2 segundos entre envios para não sobrecarregar a API
      if (mensalidadeIds.indexOf(mensalidadeId) < mensalidadeIds.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 2000))
      }
    }

    return resultados
  }

  /**
   * Verifica status da conexão com WhatsApp
   */
  /**
   * Envia confirmação de pagamento ao cliente via WhatsApp
   * Usado quando o gestor marca manualmente uma mensalidade como paga
   */
  async enviarConfirmacaoPagamento(mensalidadeId) {
    try {
      await this.ensureInitialized()

      // Buscar dados da mensalidade + devedor
      const { data: mensalidade } = await supabase
        .from('mensalidades')
        .select('*, devedores(id, nome, telefone)')
        .eq('id', mensalidadeId)
        .single()

      if (!mensalidade?.devedores?.telefone) {
        console.log('⏩ Confirmação WhatsApp: cliente sem telefone')
        return { sucesso: false, erro: 'Cliente sem telefone' }
      }

      // Verificar se automação de confirmação está ativa
      try {
        const { data: configCobranca } = await supabase
          .from('configuracoes_cobranca')
          .select('enviar_confirmacao_pagamento')
          .eq('user_id', mensalidade.user_id)
          .maybeSingle()

        if (configCobranca?.enviar_confirmacao_pagamento === false) {
          console.log('⏩ Confirmação WhatsApp: desativada pelo usuário')
          return { sucesso: false, erro: 'Confirmação de pagamento desativada' }
        }
      } catch (e) {
        // Coluna pode não existir ainda - continua com envio (padrão: ativo)
      }

      // Buscar nome da empresa e template personalizado em paralelo
      const [{ data: usuario }, { data: template }] = await Promise.all([
        supabase
          .from('usuarios')
          .select('nome_empresa')
          .eq('id', mensalidade.user_id)
          .single(),
        supabase
          .from('templates')
          .select('mensagem')
          .eq('user_id', mensalidade.user_id)
          .eq('tipo', 'payment_confirmed')
          .eq('ativo', true)
          .maybeSingle()
      ])

      const valor = parseFloat(mensalidade.valor || 0)
      const valorFormatado = valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

      const dataVenc = mensalidade.data_vencimento
      const vencimentoFormatado = dataVenc
        ? new Date(dataVenc + 'T12:00:00').toLocaleDateString('pt-BR')
        : ''

      const empresa = usuario?.nome_empresa || ''
      const nomeCliente = mensalidade.devedores.nome

      // Usar template personalizado ou mensagem padrão
      let mensagemTexto
      if (template?.mensagem) {
        mensagemTexto = template.mensagem
          .replace(/\{\{nomeCliente\}\}/g, nomeCliente)
          .replace(/\{\{valorMensalidade\}\}/g, valorFormatado)
          .replace(/\{\{dataVencimento\}\}/g, vencimentoFormatado)
          .replace(/\{\{nomeEmpresa\}\}/g, empresa)
      } else {
        mensagemTexto = `Olá, ${nomeCliente}! ✅\n\nConfirmamos o recebimento do seu pagamento.\n\n💰 Valor: ${valorFormatado}\n📅 Vencimento: ${vencimentoFormatado}\n\nObrigado pela pontualidade! - ${empresa}`
      }

      // Usar instância do dono da mensalidade (não do admin logado)
      const ownerId = mensalidade.user_id
      const ownerInstanceName = this.getInstanceNameForUser(ownerId)
      const resultado = await this.enviarMensagem(mensalidade.devedores.telefone, mensagemTexto, ownerInstanceName)

      // Logar envio (sempre com user_id do dono da mensalidade)
      await supabase.from('logs_mensagens').insert({
        user_id: ownerId,
        devedor_id: mensalidade.devedores.id,
        mensalidade_id: mensalidadeId,
        tipo: 'payment_confirmed',
        mensagem: mensagemTexto,
        status: resultado.sucesso ? 'enviado' : 'falha',
        telefone: mensalidade.devedores.telefone
      })

      return resultado
    } catch (error) {
      console.error('⚠️ Erro ao enviar confirmação de pagamento:', error)
      return { sucesso: false, erro: error.message }
    }
  }

  async verificarStatus() {
    await this.ensureInitialized()

    try {
      const response = await this.fetchWithTimeout(
        `${this.apiUrl}/instance/connectionState/${this.instanceName}`,
        {
          method: 'GET',
          headers: {
            'apikey': this.apiKey
          }
        },
        15000 // 15 segundos de timeout para status check
      )

      if (!response.ok) {
        return { conectado: false, estado: 'erro' }
      }

      const data = await response.json()
      const state = data.instance?.state || 'close'

      return {
        conectado: state === 'open',
        estado: state
      }
    } catch (error) {
      console.error('Erro ao verificar status:', error)

      // Tratar erro de timeout
      if (error.name === 'AbortError') {
        return {
          conectado: false,
          estado: 'timeout',
          erro: 'Tempo limite excedido ao verificar conexão'
        }
      }

      return { conectado: false, estado: 'erro', erro: error.message }
    }
  }

  /**
   * Tenta reiniciar a instância do WhatsApp na Evolution API
   * Útil quando a conexão aparece como "open" mas está travada
   * @returns {Promise<boolean>} true se reconectou com sucesso
   */
  async restartInstance() {
    await this.ensureInitialized()

    try {
      console.log('🔄 Tentando restart da instância:', this.instanceName)

      const response = await this.fetchWithTimeout(
        `${this.apiUrl}/instance/restart/${this.instanceName}`,
        {
          method: 'PUT',
          headers: {
            'apikey': this.apiKey
          }
        },
        15000
      )

      if (!response.ok) {
        console.warn('⚠️ Restart retornou status:', response.status)
        return false
      }

      // Aguardar a instância reiniciar
      console.log('⏳ Aguardando instância reiniciar (5s)...')
      await new Promise(resolve => setTimeout(resolve, 5000))

      // Verificar se reconectou
      const status = await this.verificarStatus()
      console.log('📡 Status após restart:', status.estado)

      return status.conectado
    } catch (error) {
      console.error('❌ Erro ao reiniciar instância:', error)
      return false
    }
  }
}

// Exportar instância singleton
const whatsappService = new WhatsAppService()
export default whatsappService
