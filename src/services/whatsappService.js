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
        lastError = new Error(`Erro HTTP: ${response.status}`)
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
      '{{linkPagamento}}': dados.linkPagamento || ''
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
   */
  formatarTelefone(telefone) {
    // Remove caracteres não numéricos
    let numero = telefone.replace(/\D/g, '')

    // Se não tem código do país, adiciona Brasil (55)
    if (!numero.startsWith('55')) {
      numero = '55' + numero
    }

    // Validação e correção de números brasileiros
    if (numero.startsWith('55')) {
      const somenteNumero = numero.substring(2) // Remove o 55
      const ddd = somenteNumero.substring(0, 2)
      const restante = somenteNumero.substring(2)

      // Se tem 10 dígitos (celular sem o 9), adiciona o 9
      if (restante.length === 10 && !restante.startsWith('9')) {
        console.log('⚠️ Número parece estar faltando o 9º dígito. Corrigindo...')
        numero = '55' + ddd + '9' + restante
      }
    }

    console.log('📱 Número formatado final:', numero)

    // Garante que tem o formato correto para WhatsApp
    return numero + '@s.whatsapp.net'
  }

  /**
   * Envia mensagem via Evolution API
   */
  async enviarMensagem(telefone, mensagem) {
    await this.ensureInitialized()

    try {
      const numeroFormatado = this.formatarTelefone(telefone)

      console.log('📡 Enviando para Evolution API...')
      console.log('🔗 URL:', `${this.apiUrl}/message/sendText/${this.instanceName}`)
      console.log('📞 Número formatado:', numeroFormatado)
      console.log('💬 Mensagem:', mensagem)

      const payload = {
        number: numeroFormatado,
        text: mensagem
      }

      console.log('📦 Payload completo:', JSON.stringify(payload, null, 2))

      const response = await this.fetchWithRetry(
        `${this.apiUrl}/message/sendText/${this.instanceName}`,
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
          throw new Error('📱 Seu WhatsApp está desconectado. Vá em WhatsApp → Conexão e escaneie o QR Code para reconectar.')
        }

        // Verificar se é erro de número não existe
        if (errorData.response?.message && Array.isArray(errorData.response.message)) {
          const numeroNaoExiste = errorData.response.message.some(msg => msg.exists === false)
          if (numeroNaoExiste) {
            const numeroProblema = errorData.response.message[0].number.replace('@s.whatsapp.net', '')
            throw new Error(`❌ O número ${numeroProblema} não existe no WhatsApp ou não está ativo. Verifique se:\n• O número está correto\n• A pessoa tem WhatsApp instalado\n• O número está ativo`)
          }
        }

        throw new Error(errorData.message || errorText || `Erro HTTP: ${response.status}`)
      }

      const result = await response.json()
      console.log('✅ Resposta de sucesso:', result)

      return {
        sucesso: true,
        messageId: result.key?.id || null,
        dados: result
      }
    } catch (error) {
      console.error('❌ Erro ao enviar mensagem:', error)

      // Tratar erro de timeout
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
  async enviarDocumento(telefone, mediaUrl, caption = '', fileName = 'documento.pdf', mediaType = 'document') {
    await this.ensureInitialized()

    try {
      const numeroFormatado = this.formatarTelefone(telefone)

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

      console.log('📦 Payload:', JSON.stringify(payload, null, 2))

      const response = await this.fetchWithRetry(
        `${this.apiUrl}/message/sendMedia/${this.instanceName}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': this.apiKey
          },
          body: JSON.stringify(payload)
        },
        2,
        3000 // 3 segundos de delay (arquivos podem demorar mais)
      )

      console.log('📊 Status da resposta:', response.status)

      if (!response.ok) {
        const errorText = await response.text()
        console.error('❌ Erro ao enviar documento:', errorText)

        let errorData = {}
        try {
          errorData = JSON.parse(errorText)
        } catch (e) {
          // Não é JSON válido
        }

        if (errorData.response?.message === 'Connection Closed' || errorText.includes('Connection Closed')) {
          throw new Error('📱 WhatsApp desconectado. Reconecte na aba WhatsApp.')
        }

        throw new Error(errorData.message || errorText || `Erro HTTP: ${response.status}`)
      }

      const result = await response.json()
      console.log('✅ Documento enviado:', result)

      return {
        sucesso: true,
        messageId: result.key?.id || null,
        dados: result
      }
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
    // Pro/Premium pode enviar: 3 dias antes (pre_due_3days), no dia (due_day), 3 dias depois (overdue)
    if (plano === 'starter' && (tipoMensagem === 'pre_due_3days' || tipoMensagem === 'overdue')) {
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
      const { data: { user } } = await supabase.auth.getUser()

      // Buscar dados da mensalidade
      const { data: mensalidade, error } = await supabase
        .from('mensalidades')
        .select(`*, devedor:devedores(nome, telefone)`)
        .eq('id', mensalidadeId)
        .single()

      if (error || !mensalidade) throw new Error('Mensalidade não encontrada')

      // Buscar dados do usuário
      const { data: usuario } = await supabase
        .from('usuarios')
        .select('nome_empresa, chave_pix')
        .eq('id', user.id)
        .maybeSingle()

      const nomeEmpresa = usuario?.nome_empresa || 'Empresa'
      const chavePix = usuario?.chave_pix || ''

      // Buscar template
      const tipoMensagem = this.calcularTipoMensagem(mensalidade.data_vencimento)
      const { data: template } = await supabase
        .from('templates')
        .select('mensagem')
        .eq('user_id', user.id)
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
        linkPagamento: ''
      }

      // Gerar link se template usa
      if (mensagemTemplate.includes('{{linkPagamento}}')) {
        dadosSubstituicao.linkPagamento = await this.gerarLinkPagamento(user.id, mensalidade, nomeEmpresa, chavePix)
      }

      const mensagemFinal = this.substituirVariaveis(mensagemTemplate, dadosSubstituicao)

      return { mensagem: mensagemFinal, dados: dadosSubstituicao }
    } catch (error) {
      console.error('Erro ao gerar preview:', error)
      return { mensagem: '', dados: {} }
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
      const { data: { user } } = await supabase.auth.getUser()

      // Buscar dados da mensalidade com informações do devedor
      const { data: mensalidade, error: mensalidadeError } = await supabase
        .from('mensalidades')
        .select(`
          *,
          devedor:devedores(nome, telefone)
        `)
        .eq('id', mensalidadeId)
        .single()

      if (mensalidadeError) throw mensalidadeError
      if (!mensalidade) throw new Error('Mensalidade não encontrada')

      // VALIDAÇÕES DE ENVIO
      const tipoMensagem = this.calcularTipoMensagem(mensalidade.data_vencimento)
      const validacao = await this.validarEnvio(user.id, tipoMensagem)

      if (!validacao.permitido) {
        return {
          sucesso: false,
          erro: validacao.erro,
          bloqueado: true
        }
      }

      // Buscar dados do usuário/empresa incluindo chave PIX
      const { data: usuario, error: usuarioError } = await supabase
        .from('usuarios')
        .select('nome_empresa, chave_pix')
        .eq('id', user.id)
        .maybeSingle()

      if (usuarioError) console.error('❌ Erro ao buscar usuário:', usuarioError)

      const nomeEmpresa = usuario?.nome_empresa || 'Empresa'
      const chavePix = usuario?.chave_pix || ''

      // Buscar template baseado no tipo de mensagem calculado
      const { data: template } = await supabase
        .from('templates')
        .select('mensagem')
        .eq('user_id', user.id)
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

      // Preparar dados para substituição
      const dadosSubstituicao = {
        nomeCliente: mensalidade.devedor?.nome || 'Cliente',
        telefone: mensalidade.devedor?.telefone || '',
        valorMensalidade: `R$ ${parseFloat(mensalidade.valor).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
        dataVencimento: new Date(mensalidade.data_vencimento + 'T00:00:00').toLocaleDateString('pt-BR'),
        diasAtraso: diasAtraso.toString(),
        nomeEmpresa: nomeEmpresa,
        chavePix: chavePix,
        linkPagamento: '' // Será preenchido se necessário
      }

      // Se o template usa {{linkPagamento}}, gerar o link automaticamente
      if (mensagemTemplate.includes('{{linkPagamento}}')) {
        console.log('🔗 Template usa linkPagamento, gerando link...')
        dadosSubstituicao.linkPagamento = await this.gerarLinkPagamento(
          user.id,
          mensalidade,
          nomeEmpresa,
          chavePix
        )
        console.log('🔗 Link gerado:', dadosSubstituicao.linkPagamento)
      }

      console.log('📝 Template usado:', mensagemTemplate)
      console.log('📊 Dados para substituição:', dadosSubstituicao)
      console.log('🔑 chavePix no dadosSubstituicao:', dadosSubstituicao.chavePix)

      // Gerar mensagem final (usa customizada se fornecida, senão gera do template)
      let mensagemFinal
      if (mensagemCustomizada && mensagemCustomizada.trim()) {
        console.log('📝 Usando mensagem customizada')
        mensagemFinal = mensagemCustomizada
      } else {
        mensagemFinal = this.substituirVariaveis(mensagemTemplate, dadosSubstituicao)
      }
      console.log('📨 Mensagem final após substituição:', mensagemFinal)

      // Enviar via Evolution API
      const resultado = await this.enviarMensagem(mensalidade.devedor.telefone, mensagemFinal)

      // Registrar log no banco
      console.log('💾 Salvando log no Supabase...')
      console.log('📝 Dados do log:', {
        user_id: user.id,
        devedor_id: mensalidade.devedor_id,
        mensalidade_id: mensalidade.id,
        telefone: mensalidade.devedor.telefone,
        status: resultado.sucesso ? 'enviado' : 'erro'
      })

      const { data: logData, error: logError } = await supabase
        .from('logs_mensagens')
        .insert({
          user_id: user.id,
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

        // Incrementar contador de uso no controle_planos
        const { data: controleAtual, error: controleError } = await supabase
          .from('controle_planos')
          .select('usage_count')
          .eq('user_id', user.id)
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
            .eq('user_id', user.id)

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
              user_id: user.id,
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

      // Buscar nome da empresa
      const { data: usuario } = await supabase
        .from('usuarios')
        .select('nome_empresa')
        .eq('id', mensalidade.user_id)
        .single()

      const valor = parseFloat(mensalidade.valor || 0)
      const valorFormatado = valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

      const dataVenc = mensalidade.data_vencimento
      const vencimentoFormatado = dataVenc
        ? new Date(dataVenc + 'T12:00:00').toLocaleDateString('pt-BR')
        : ''

      const empresa = usuario?.nome_empresa || ''
      const mensagemTexto = `Olá, ${mensalidade.devedores.nome}! ✅\n\nConfirmamos o recebimento do seu pagamento.\n\n💰 Valor: ${valorFormatado}\n📅 Vencimento: ${vencimentoFormatado}\n\nObrigado pela pontualidade! - ${empresa}`

      const resultado = await this.enviarMensagem(mensalidade.devedores.telefone, mensagemTexto)

      // Logar envio
      const { data: { user } } = await supabase.auth.getUser()
      await supabase.from('logs_mensagens').insert({
        user_id: user?.id || mensalidade.user_id,
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
}

// Exportar instância singleton
const whatsappService = new WhatsAppService()
export default whatsappService
