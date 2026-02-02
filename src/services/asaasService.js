// Service: Asaas
// Centraliza toda lógica de integração com Asaas para emissão de boletos

import { supabase } from '../supabaseClient'

const FUNCTIONS_URL = 'https://zvlnkkmcytjtridiojxx.supabase.co/functions/v1'

// URLs base do Asaas
const ASAAS_URLS = {
  sandbox: 'https://sandbox.asaas.com/api/v3',
  production: 'https://api.asaas.com/v3'
}

export const asaasService = {
  /**
   * Obtém a configuração do Asaas do usuário atual
   * @returns {Promise<{apiKey: string, ambiente: string}>}
   */
  async getConfig() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('Usuário não autenticado')

    const { data, error } = await supabase
      .from('usuarios')
      .select('asaas_api_key, asaas_ambiente')
      .eq('id', user.id)
      .single()

    if (error) throw new Error('Erro ao buscar configuração do Asaas')

    return {
      apiKey: data?.asaas_api_key,
      ambiente: data?.asaas_ambiente || 'sandbox'
    }
  },

  /**
   * Verifica se o Asaas está configurado
   * @returns {Promise<boolean>}
   */
  async isConfigured() {
    try {
      const config = await this.getConfig()
      return !!config.apiKey
    } catch {
      return false
    }
  },

  /**
   * Salva a configuração do Asaas
   * @param {string} apiKey - API Key do Asaas
   * @param {string} ambiente - 'sandbox' ou 'production'
   */
  async salvarConfig(apiKey, ambiente = 'sandbox') {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('Usuário não autenticado')

    const { error } = await supabase
      .from('usuarios')
      .update({
        asaas_api_key: apiKey,
        asaas_ambiente: ambiente
      })
      .eq('id', user.id)

    if (error) throw new Error('Erro ao salvar configuração do Asaas')
  },

  /**
   * Testa a conexão com o Asaas
   * @returns {Promise<{success: boolean, message: string}>}
   */
  async testarConexao() {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error('Usuário não autenticado')

      const response = await fetch(`${FUNCTIONS_URL}/asaas-test-connection`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        }
      })

      const data = await response.json()

      if (!response.ok) {
        return { success: false, message: data.error || 'Erro ao conectar com Asaas' }
      }

      return { success: true, message: 'Conexão estabelecida com sucesso!' }
    } catch (error) {
      return { success: false, message: error.message }
    }
  },

  /**
   * Cria ou busca um cliente no Asaas
   * @param {Object} devedor - Dados do devedor
   * @returns {Promise<string>} ID do cliente no Asaas
   */
  async getOrCreateCustomer(devedor) {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) throw new Error('Usuário não autenticado')

    // Verifica se já existe cache do cliente
    const { data: cached } = await supabase
      .from('asaas_clientes')
      .select('asaas_customer_id')
      .eq('devedor_id', devedor.id)
      .single()

    if (cached?.asaas_customer_id) {
      return cached.asaas_customer_id
    }

    // Cria cliente no Asaas via Edge Function
    const response = await fetch(`${FUNCTIONS_URL}/asaas-create-customer`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        devedor_id: devedor.id,
        nome: devedor.nome,
        cpf_cnpj: devedor.cpf_cnpj,
        email: devedor.email,
        telefone: devedor.telefone
      })
    })

    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.error || 'Erro ao criar cliente no Asaas')
    }

    const data = await response.json()
    return data.customer_id
  },

  /**
   * Cria um boleto para uma mensalidade
   * @param {Object} params - Parâmetros do boleto
   * @param {string} params.mensalidadeId - ID da mensalidade
   * @param {string} params.devedorId - ID do devedor
   * @param {number} params.valor - Valor do boleto
   * @param {string} params.dataVencimento - Data de vencimento (YYYY-MM-DD)
   * @param {string} params.descricao - Descrição do boleto
   * @returns {Promise<Object>} Dados do boleto criado
   */
  async criarBoleto({ mensalidadeId, devedorId, valor, dataVencimento, descricao }) {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error('Usuário não autenticado')

      console.log('📄 Criando boleto via Asaas...')

      const response = await fetch(`${FUNCTIONS_URL}/asaas-create-payment`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          mensalidade_id: mensalidadeId,
          devedor_id: devedorId,
          valor,
          data_vencimento: dataVencimento,
          descricao,
          billing_type: 'BOLETO' // BOLETO, PIX, ou UNDEFINED (BolePix)
        })
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Erro ao criar boleto')
      }

      const data = await response.json()
      console.log('✅ Boleto criado:', data.boleto_id)

      return data
    } catch (error) {
      console.error('❌ Erro ao criar boleto:', error)
      throw error
    }
  },

  /**
   * Cria uma cobrança PIX para uma mensalidade
   * @param {Object} params - Parâmetros
   * @returns {Promise<Object>} Dados da cobrança criada
   */
  async criarBolePix({ mensalidadeId, devedorId, valor, dataVencimento, descricao }) {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error('Usuário não autenticado')

      console.log('📄 Criando cobrança PIX via Asaas...')

      const response = await fetch(`${FUNCTIONS_URL}/asaas-create-payment`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          mensalidade_id: mensalidadeId,
          devedor_id: devedorId,
          valor,
          data_vencimento: dataVencimento,
          descricao,
          billing_type: 'PIX' // Apenas PIX - boleto é gerado manualmente se necessário
        })
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Erro ao criar BolePix')
      }

      const data = await response.json()
      console.log('✅ BolePix criado:', data.boleto_id)

      return data
    } catch (error) {
      console.error('❌ Erro ao criar BolePix:', error)
      throw error
    }
  },

  /**
   * Consulta um boleto existente
   * @param {string} boletoId - ID do boleto no sistema
   * @returns {Promise<Object>} Dados do boleto
   */
  async consultarBoleto(boletoId) {
    const { data, error } = await supabase
      .from('boletos')
      .select(`
        *,
        devedor:devedores(nome, telefone),
        mensalidade:mensalidades(data_vencimento, valor)
      `)
      .eq('id', boletoId)
      .single()

    if (error) throw new Error('Boleto não encontrado')
    return data
  },

  /**
   * Lista boletos de uma mensalidade
   * @param {string} mensalidadeId - ID da mensalidade
   * @returns {Promise<Array>} Lista de boletos
   */
  async listarBoletosMensalidade(mensalidadeId) {
    const { data, error } = await supabase
      .from('boletos')
      .select('*')
      .eq('mensalidade_id', mensalidadeId)
      .order('created_at', { ascending: false })

    if (error) throw new Error('Erro ao listar boletos')
    return data || []
  },

  /**
   * Lista todos os boletos do usuário
   * @param {Object} filtros - Filtros opcionais
   * @returns {Promise<Array>} Lista de boletos
   */
  async listarBoletos(filtros = {}) {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('Usuário não autenticado')

    let query = supabase
      .from('boletos')
      .select(`
        *,
        devedor:devedores(nome, telefone),
        mensalidade:mensalidades(data_vencimento, valor)
      `)
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })

    if (filtros.status) {
      query = query.eq('status', filtros.status)
    }

    if (filtros.devedorId) {
      query = query.eq('devedor_id', filtros.devedorId)
    }

    if (filtros.limite) {
      query = query.limit(filtros.limite)
    }

    const { data, error } = await query

    if (error) throw new Error('Erro ao listar boletos')
    return data || []
  },

  /**
   * Cancela um boleto
   * @param {string} boletoId - ID do boleto no sistema
   * @returns {Promise<void>}
   */
  async cancelarBoleto(boletoId) {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error('Usuário não autenticado')

      const response = await fetch(`${FUNCTIONS_URL}/asaas-cancel-payment`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ boleto_id: boletoId })
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Erro ao cancelar boleto')
      }

      console.log('✅ Boleto cancelado:', boletoId)
    } catch (error) {
      console.error('❌ Erro ao cancelar boleto:', error)
      throw error
    }
  },

  /**
   * Obtém o QR Code PIX de um boleto (se for BolePix)
   * @param {string} boletoId - ID do boleto no sistema
   * @returns {Promise<Object>} Dados do PIX
   */
  async getPixQrCode(boletoId) {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) throw new Error('Usuário não autenticado')

    const response = await fetch(`${FUNCTIONS_URL}/asaas-get-pix-qrcode`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ boleto_id: boletoId })
    })

    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.error || 'Erro ao obter QR Code PIX')
    }

    return await response.json()
  },

  // ============================================
  // UTILITÁRIOS
  // ============================================

  /**
   * Traduz o status do Asaas para português
   */
  traduzirStatus(status) {
    const statusMap = {
      'PENDING': 'Pendente',
      'RECEIVED': 'Recebido',
      'CONFIRMED': 'Confirmado',
      'OVERDUE': 'Vencido',
      'REFUNDED': 'Estornado',
      'RECEIVED_IN_CASH': 'Recebido em dinheiro',
      'REFUND_REQUESTED': 'Estorno solicitado',
      'REFUND_IN_PROGRESS': 'Estorno em processamento',
      'CHARGEBACK_REQUESTED': 'Chargeback solicitado',
      'CHARGEBACK_DISPUTE': 'Disputa de chargeback',
      'AWAITING_CHARGEBACK_REVERSAL': 'Aguardando reversão',
      'DUNNING_REQUESTED': 'Negativação solicitada',
      'DUNNING_RECEIVED': 'Negativação recebida',
      'AWAITING_RISK_ANALYSIS': 'Aguardando análise de risco',
      'CANCELED': 'Cancelado'
    }
    return statusMap[status] || status
  },

  /**
   * Retorna a cor do badge baseado no status
   */
  getStatusColor(status) {
    const colorMap = {
      'PENDING': '#f59e0b',      // Amarelo
      'RECEIVED': '#10b981',     // Verde
      'CONFIRMED': '#10b981',    // Verde
      'OVERDUE': '#ef4444',      // Vermelho
      'REFUNDED': '#6b7280',     // Cinza
      'CANCELED': '#6b7280'      // Cinza
    }
    return colorMap[status] || '#6b7280'
  },

  /**
   * Formata valor em reais
   */
  formatarValor(valor) {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(valor)
  },

  /**
   * Formata data
   */
  formatarData(data) {
    if (!data) return '-'
    return new Date(data).toLocaleDateString('pt-BR')
  }
}

export default asaasService
