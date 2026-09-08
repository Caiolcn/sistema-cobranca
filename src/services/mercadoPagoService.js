// Service: Mercado Pago
// Centraliza toda lógica de integração com Mercado Pago

import { supabase } from '../supabaseClient'

const FUNCTIONS_URL = 'https://zvlnkkmcytjtridiojxx.supabase.co/functions/v1'

// As leituras abaixo filtram por user_id explicitamente em vez de confiar só
// na RLS. A política "Service role gerencia ..." dessas duas tabelas foi
// criada como FOR ALL TO public USING (true) — service_role já ignora RLS, e
// o que essa linha fez de fato foi liberar as duas tabelas pra qualquer um.
// Sem este filtro, "meus pagamentos" trazia os pagamentos de todo mundo.
// Ver sql-fix-rls-mercadopago.sql: quando as políticas forem corrigidas o
// filtro vira redundante, e é pra ficar assim mesmo.
async function usuarioAtualId() {
  const { data: { session } } = await supabase.auth.getSession()
  return session?.user?.id || null
}

export const mercadoPagoService = {
  /**
   * Cria uma assinatura recorrente no Mercado Pago
   * @param {string} plano - 'pro' ou 'business'
   * @returns {Promise<{init_point: string, subscription_id: string}>}
   */
  /**
   * Cria um pagamento único via Pix
   * @param {string} plano - 'pro' ou 'business'
   * @returns {Promise<{pix: {qr_code, qr_code_base64}, payment_id, valor}>}
   */
  async criarPagamentoPix(plano) {
    try {
      const { data: { session } } = await supabase.auth.getSession()

      if (!session) {
        throw new Error('Usuário não autenticado')
      }

      console.log('💠 Criando pagamento Pix:', plano)

      const response = await fetch(`${FUNCTIONS_URL}/create-pix-payment`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ plano }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Erro ao criar pagamento Pix')
      }

      const data = await response.json()
      console.log('✅ Pix criado:', data.payment_id)

      return data // { pix: { qr_code, qr_code_base64 }, payment_id, valor, plano }

    } catch (error) {
      console.error('❌ Erro ao criar pagamento Pix:', error)
      throw error
    }
  },

  async criarAssinatura(plano) {
    try {
      const { data: { session } } = await supabase.auth.getSession()

      if (!session) {
        throw new Error('Usuário não autenticado')
      }

      console.log('🚀 Criando assinatura:', plano)

      const response = await fetch(`${FUNCTIONS_URL}/create-subscription`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ plano }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Erro ao criar assinatura')
      }

      const data = await response.json()
      console.log('✅ Assinatura criada:', data.subscription_id)

      return data // { init_point, subscription_id }

    } catch (error) {
      console.error('❌ Erro ao criar assinatura:', error)
      throw error
    }
  },

  /**
   * Cancela a assinatura ativa do usuário
   * @returns {Promise<{success: boolean, message: string}>}
   */
  async cancelarAssinatura() {
    try {
      const { data: { session } } = await supabase.auth.getSession()

      if (!session) {
        throw new Error('Usuário não autenticado')
      }

      console.log('🚫 Cancelando assinatura...')

      const response = await fetch(`${FUNCTIONS_URL}/cancel-subscription`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Erro ao cancelar assinatura')
      }

      const data = await response.json()
      console.log('✅ Assinatura cancelada')

      return data

    } catch (error) {
      console.error('❌ Erro ao cancelar assinatura:', error)
      throw error
    }
  },

  /**
   * Busca assinatura ativa do usuário
   * @returns {Promise<Object|null>}
   */
  async verificarAssinaturaAtiva() {
    try {
      const userId = await usuarioAtualId()
      if (!userId) return null

      const { data, error } = await supabase
        .from('assinaturas_mercadopago')
        .select('*')
        .eq('user_id', userId)
        .eq('status', 'authorized')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (error && error.code !== 'PGRST116') {
        // PGRST116 = no rows returned (não é erro)
        throw error
      }

      return data || null

    } catch (error) {
      console.error('Erro ao verificar assinatura:', error)
      return null
    }
  },

  /**
   * Busca todas as assinaturas do usuário (histórico)
   * @returns {Promise<Array>}
   */
  async buscarMinhasAssinaturas() {
    try {
      const userId = await usuarioAtualId()
      if (!userId) return []

      const { data, error } = await supabase
        .from('assinaturas_mercadopago')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })

      if (error) throw error

      return data || []

    } catch (error) {
      console.error('Erro ao buscar assinaturas:', error)
      return []
    }
  },

  /**
   * Busca histórico de pagamentos do usuário
   * @returns {Promise<Array>}
   */
  async buscarMeusPagamentos() {
    try {
      const userId = await usuarioAtualId()
      if (!userId) return []

      const { data, error } = await supabase
        .from('pagamentos_mercadopago')
        .select('*')
        .eq('user_id', userId)
        .order('data_pagamento', { ascending: false })

      if (error) throw error

      return data || []

    } catch (error) {
      console.error('Erro ao buscar pagamentos:', error)
      return []
    }
  },

  /**
   * Formata valor para exibição
   * @param {number} valor
   * @returns {string}
   */
  formatarValor(valor) {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(valor)
  },

  /**
   * Formata data para exibição
   * @param {string} dataISO
   * @returns {string}
   */
  formatarData(dataISO) {
    if (!dataISO) return '-'
    return new Date(dataISO).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    })
  },

  /**
   * Traduz status de assinatura
   * @param {string} status
   * @returns {string}
   */
  traduzirStatus(status) {
    const statusMap = {
      'pending': 'Pendente',
      'authorized': 'Ativo',
      'paused': 'Pausado',
      'cancelled': 'Cancelado'
    }
    return statusMap[status] || status
  },

  /**
   * Traduz status de pagamento
   * @param {string} status
   * @returns {string}
   */
  traduzirStatusPagamento(status) {
    const statusMap = {
      'approved': 'Aprovado',
      'pending': 'Pendente',
      'rejected': 'Rejeitado',
      'refunded': 'Reembolsado',
      'cancelled': 'Cancelado'
    }
    return statusMap[status] || status
  }
}
