import { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'

/**
 * Hook para verificar o plano do usuário
 * Retorna informações sobre o plano e helpers para verificar features
 *
 * Planos: 'starter' | 'pro' | 'premium'
 * Hierarquia: starter (1) < pro (2) < premium (3)
 */
export function useUserPlan() {
  const [planData, setPlanData] = useState({
    loading: true,
    plano: null, // 'starter', 'pro', 'premium'
    planoPago: false,
    limiteMensal: 200,
    limiteClientes: 50
  })

  useEffect(() => {
    fetchUserPlan()
  }, [])

  // Limites de clientes por plano
  const limiteClientesPorPlano = {
    'starter': 50,
    'pro': 150,
    'premium': 500
  }

  const fetchUserPlan = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        setPlanData({ loading: false, plano: null, planoPago: false, limiteMensal: 0, limiteClientes: 0 })
        return
      }

      const { data: usuario, error } = await supabase
        .from('usuarios')
        .select('plano, plano_pago, limite_mensal')
        .eq('id', user.id)
        .single()

      if (error) throw error

      // Mapear planos antigos para novos (caso ainda não migrado)
      let planoAtual = usuario.plano || 'starter'
      if (planoAtual === 'basico') planoAtual = 'starter'
      if (planoAtual === 'enterprise') planoAtual = 'premium'
      if (planoAtual === 'business') planoAtual = 'premium'

      setPlanData({
        loading: false,
        plano: planoAtual,
        planoPago: usuario.plano_pago || false,
        limiteMensal: usuario.limite_mensal || 200,
        limiteClientes: limiteClientesPorPlano[planoAtual] || 50
      })

    } catch (error) {
      console.error('Erro ao buscar plano do usuário:', error)
      setPlanData({ loading: false, plano: 'starter', planoPago: false, limiteMensal: 200, limiteClientes: 50 })
    }
  }

  // Hierarquia de planos: starter < pro < premium
  const planLevel = {
    'starter': 1,
    'pro': 2,
    'premium': 3
  }

  /**
   * Verifica se uma feature está disponível para o plano atual
   * @param {string} requiredPlan - Plano mínimo necessário ('starter', 'pro', 'premium')
   * @returns {boolean} - true se a feature está disponível
   */
  const hasFeature = (requiredPlan) => {
    const currentLevel = planLevel[planData.plano] || 1
    const requiredLevel = planLevel[requiredPlan] || 1
    return currentLevel >= requiredLevel
  }

  /**
   * Verifica se uma feature está BLOQUEADA para o plano atual
   * @param {string} requiredPlan - Plano mínimo necessário
   * @returns {boolean} - true se a feature está BLOQUEADA
   */
  const isLocked = (requiredPlan) => {
    return !hasFeature(requiredPlan)
  }

  /**
   * Helpers para verificar planos específicos
   */
  const isStarter = planData.plano === 'starter'
  const isPro = planData.plano === 'pro'
  const isPremium = planData.plano === 'premium'
  const isProOrAbove = hasFeature('pro')
  const isPremiumOrAbove = hasFeature('premium')

  return {
    ...planData,
    hasFeature,
    isLocked,
    isStarter,
    isPro,
    isPremium,
    isProOrAbove,
    isPremiumOrAbove,
    // Aliases para compatibilidade (código antigo usava 'business')
    isBusiness: isPremium,
    isBusinessOrAbove: isPremiumOrAbove,
    refresh: fetchUserPlan
  }
}
