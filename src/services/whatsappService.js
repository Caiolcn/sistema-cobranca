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
      '{{valorParcela}}': dados.valorParcela || '',
      '{{dataVencimento}}': dados.dataVencimento || '',
      '{{diasAtraso}}': dados.diasAtraso || '0',
      '{{nomeEmpresa}}': dados.nomeEmpresa || ''
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
   * Envia cobrança para uma parcela específica
   */
  async enviarCobranca(parcelaId) {
    await this.ensureInitialized()

    try {
      const { data: { user } } = await supabase.auth.getUser()

      // Buscar dados da parcela com informações do devedor
      const { data: parcela, error: parcelaError } = await supabase
        .from('parcelas')
        .select(`
          *,
          devedor:devedores(nome, telefone)
        `)
        .eq('id', parcelaId)
        .single()

      if (parcelaError) throw parcelaError
      if (!parcela) throw new Error('Parcela não encontrada')

      // Buscar dados do usuário/empresa
      const { data: usuario } = await supabase
        .from('usuarios')
        .select('nome_fantasia, razao_social, nome_completo')
        .eq('id', user.id)
        .single()

      const nomeEmpresa = usuario?.nome_fantasia || usuario?.razao_social || usuario?.nome_completo || 'Empresa'

      // Buscar template padrão ou usar o primeiro template ativo
      const { data: template } = await supabase
        .from('templates')
        .select('mensagem')
        .eq('user_id', user.id)
        .eq('ativo', true)
        .order('is_padrao', { ascending: false })
        .limit(1)
        .single()

      if (!template) {
        throw new Error('Nenhum template de mensagem configurado')
      }

      // Calcular dias de atraso
      const hoje = new Date()
      const vencimento = new Date(parcela.data_vencimento)
      const diasAtraso = Math.max(0, Math.floor((hoje - vencimento) / (1000 * 60 * 60 * 24)))

      // Preparar dados para substituição
      const dadosSubstituicao = {
        nomeCliente: parcela.devedor?.nome || 'Cliente',
        telefone: parcela.devedor?.telefone || '',
        valorParcela: `R$ ${parseFloat(parcela.valor).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
        dataVencimento: new Date(parcela.data_vencimento + 'T00:00:00').toLocaleDateString('pt-BR'),
        diasAtraso: diasAtraso.toString(),
        nomeEmpresa: nomeEmpresa
      }

      // Gerar mensagem final
      const mensagemFinal = this.substituirVariaveis(template.mensagem, dadosSubstituicao)

      // Enviar via Evolution API
      const resultado = await this.enviarMensagem(parcela.devedor.telefone, mensagemFinal)

      // Registrar log no banco
      console.log('💾 Salvando log no Supabase...')
      console.log('📝 Dados do log:', {
        user_id: user.id,
        devedor_id: parcela.devedor_id,
        parcela_id: parcela.id,
        telefone: parcela.devedor.telefone,
        status: resultado.sucesso ? 'enviado' : 'erro'
      })

      const { data: logData, error: logError } = await supabase
        .from('logs_mensagens')
        .insert({
          user_id: user.id,
          devedor_id: parcela.devedor_id,
          parcela_id: parcela.id,
          telefone: parcela.devedor.telefone,
          mensagem: mensagemFinal,
          valor_parcela: parcela.valor,
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

      // Atualizar parcela
      if (resultado.sucesso) {
        const { error: updateError } = await supabase
          .from('parcelas')
          .update({
            enviado_hoje: true,
            ultima_mensagem_enviada_em: new Date().toISOString(),
            total_mensagens_enviadas: (parcela.total_mensagens_enviadas || 0) + 1
          })
          .eq('id', parcelaId)

        if (updateError) {
          console.error('Erro ao atualizar parcela:', updateError)
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
  async enviarCobrancasLote(parcelaIds) {
    const resultados = []

    for (const parcelaId of parcelaIds) {
      const resultado = await this.enviarCobranca(parcelaId)
      resultados.push({
        parcelaId,
        ...resultado
      })

      // Delay de 2 segundos entre envios para não sobrecarregar a API
      if (parcelaIds.indexOf(parcelaId) < parcelaIds.length - 1) {
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
