import { useMemo } from 'react'
import { useUser } from '../contexts/UserContext'

/**
 * Hook para verificar o plano do usuário
 * OTIMIZADO: Agora usa o UserContext para evitar chamadas duplicadas getUser()
 *
 * Planos: 'starter' | 'pro' | 'premium'
 * Hierarquia: starter (1) < pro (2) < premium (3)
 */
export function useUserPlan() {
  const { userData, loading, plano: planoFromContext } = useUser()

  // Limites de clientes por plano
  const limiteClientesPorPlano = {
    'starter': 50,
    'pro': 150,
    'premium': 500
  }

  // Hierarquia de planos: starter < pro < premium
  const planLevel = {
    'starter': 1,
    'pro': 2,
    'premium': 3
  }

  // Calcular dados do plano usando useMemo para evitar recálculos
  const planData = useMemo(() => {
    if (loading || !userData) {
      return {
        loading: true,
        plano: null,
        planoPago: false,
        limiteMensal: 200,
        limiteClientes: 50
      }
    }

    // Mapear planos antigos para novos (caso ainda não migrado)
    let planoAtual = userData.plano || planoFromContext || 'starter'
    if (planoAtual === 'basico') planoAtual = 'starter'
    if (planoAtual === 'enterprise') planoAtual = 'premium'
    if (planoAtual === 'business') planoAtual = 'premium'

    return {
      loading: false,
      plano: planoAtual,
      planoPago: userData.plano_pago || false,
      limiteMensal: userData.limite_mensal || 200,
      limiteClientes: limiteClientesPorPlano[planoAtual] || 50
    }
  }, [userData, loading, planoFromContext])

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
    isBusinessOrAbove: isPremiumOrAbove
  }
}
