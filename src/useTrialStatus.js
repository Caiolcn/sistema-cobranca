import { useUser } from './contexts/UserContext'

/**
 * Hook para verificar status do trial
 * OTIMIZADO: Usa dados do UserContext em vez de fazer query separada
 * Isso elimina uma query duplicada por carregamento de página
 */
export function useTrialStatus() {
  const { loading, trialStatus, refreshUserData } = useUser()

  return {
    loading,
    isExpired: trialStatus?.isExpired || false,
    diasRestantes: trialStatus?.diasRestantes || 0,
    planoPago: trialStatus?.planoPago || false,
    trialFim: trialStatus?.trialFim || null,
    // refresh agora usa o refreshUserData do contexto
    refresh: refreshUserData
  }
}
