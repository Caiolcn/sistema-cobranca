import { supabase } from '../supabaseClient'

/**
 * Serviço para integração com Evolution API
 */
class WhatsAppService {
  constructor() {
    this.apiUrl = null
    this.apiKey = null
    this.instanceName = null
    this.initialized = false
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
   * Garante que o serviço está inicializado
   */
  async ensureInitialized() {
    if (!this.initialized) {
      await this.initialize()
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
      '{{chavePix}}': dados.chavePix || ''
    }

    // Aplicar todas as substituições
    Object.keys(substituicoes).forEach(variavel => {
      const regex = new RegExp(variavel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')
      mensagem = mensagem.replace(regex, substituicoes[variavel])
    })

    return mensagem
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

      const response = await fetch(`${this.apiUrl}/message/sendText/${this.instanceName}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': this.apiKey
        },
        body: JSON.stringify(payload)
      })

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
      return {
        sucesso: false,
        erro: error.message
      }
    }
  }

  /**
   * Calcula o tipo de mensagem baseado na data de vencimento
   */
  calcularTipoMensagem(dataVencimento) {
    const hoje = new Date()
    hoje.setHours(0, 0, 0, 0)
    const vencimento = new Date(dataVencimento + 'T00:00:00')
    const diffDias = Math.ceil((vencimento - hoje) / (1000 * 60 * 60 * 24))

    if (diffDias > 0) {
      return 'pre_due' // Antes do vencimento
    } else if (diffDias === 0) {
      return 'due_day' // No dia
    } else {
      return 'overdue' // Em atraso
    }
  }

  /**
   * Valida se o envio pode ser realizado
   */
  async validarEnvio(userId, tipoMensagem) {
    // 1. Buscar configuração de envio
    const { data: config } = await supabase
      .from('configuracoes_cobranca')
      .select('envio_habilitado, enviar_3_dias_antes, enviar_no_dia, enviar_3_dias_depois')
      .eq('user_id', userId)
      .maybeSingle()

    // Se configuração existe e envio está desabilitado
    if (config && config.envio_habilitado === false) {
      return {
        permitido: false,
        erro: 'Envio de mensagens está desativado nas configurações'
      }
    }

    // 2. Buscar plano do usuário (da tabela usuarios, que é a fonte correta)
    const { data: usuario } = await supabase
      .from('usuarios')
      .select('plano')
      .eq('id', userId)
      .maybeSingle()

    const plano = usuario?.plano || 'starter'

    // Buscar controle de uso mensal
    const { data: controle } = await supabase
      .from('controle_planos')
      .select('usage_count, limite_mensal')
      .eq('user_id', userId)
      .maybeSingle()

    const usageCount = controle?.usage_count || 0
    const limiteMensal = controle?.limite_mensal || 200

    // 3. Verificar se plano Starter tentando enviar mensagem bloqueada
    // Starter só pode enviar "No Dia" (due_day)
    // Pro/Premium pode enviar: 3 dias antes (pre_due), no dia (due_day), 3 dias depois (overdue)
    if (plano === 'starter' && (tipoMensagem === 'pre_due' || tipoMensagem === 'overdue')) {
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
   * Envia cobrança para uma mensalidade específica
   */
  async enviarCobranca(mensalidadeId) {
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

      // Buscar template do tipo 'overdue' (em atraso) do usuário
      const { data: template } = await supabase
        .from('templates')
        .select('mensagem')
        .eq('user_id', user.id)
        .eq('tipo', 'overdue')
        .eq('ativo', true)
        .limit(1)
        .maybeSingle()

      // Template padrão do sistema caso o usuário não tenha configurado
      const TEMPLATE_PADRAO_OVERDUE = `Olá, {{nomeCliente}}, como vai?

Notamos que o pagamento da sua mensalidade (vencida em {{dataVencimento}}) ainda não consta em nosso sistema.

Sabemos que a rotina é corrida, por isso trouxemos os dados aqui para facilitar sua regularização agora mesmo:

💰 Valor: {{valorMensalidade}}
🔑 Chave Pix: {{chavePix}}

Se você já realizou o pagamento e foi um atraso na nossa baixa manual, basta me enviar o comprovante por aqui! Obrigado! 🙏`

      // Usar template do usuário ou o padrão do sistema
      const mensagemTemplate = template?.mensagem || TEMPLATE_PADRAO_OVERDUE

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
        chavePix: chavePix
      }

      console.log('📝 Template usado:', mensagemTemplate)
      console.log('📊 Dados para substituição:', dadosSubstituicao)
      console.log('🔑 chavePix no dadosSubstituicao:', dadosSubstituicao.chavePix)

      // Gerar mensagem final
      const mensagemFinal = this.substituirVariaveis(mensagemTemplate, dadosSubstituicao)
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
  async verificarStatus() {
    await this.ensureInitialized()

    try {
      const response = await fetch(`${this.apiUrl}/instance/connectionState/${this.instanceName}`, {
        method: 'GET',
        headers: {
          'apikey': this.apiKey
        }
      })

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
      return { conectado: false, estado: 'erro', erro: error.message }
    }
  }
}

// Exportar instância singleton
const whatsappService = new WhatsAppService()
export default whatsappService
