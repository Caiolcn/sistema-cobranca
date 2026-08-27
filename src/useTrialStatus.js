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
    // bloqueado = venceu por DATA (trial OU plano pago). Use este para travar
    // acesso; `isExpired` sozinho não diz nada sem olhar o motivo.
    bloqueado: trialStatus?.bloqueado || false,
    // motivo: 'trial_expirado' | 'plano_vencido' | 'pago_sem_vencimento' | 'cancelado'
    motivo: trialStatus?.motivo || null,
    diasRestantes: trialStatus?.diasRestantes || 0,
    planoPago: trialStatus?.planoPago || false,
    // eraPagante = a conta JÁ pagou alguma vez (usuarios.virou_pagante_em).
    // É o que separa churn de trial expirado — `planoPago` só diz se ela paga
    // AGORA, e é justamente ele que o /admin desliga ao marcar como expirado.
    eraPagante: trialStatus?.eraPagante || false,
    cancelado: trialStatus?.cancelado || false,
    trialFim: trialStatus?.trialFim || null,
    // refresh agora usa o refreshUserData do contexto
    refresh: refreshUserData
  }
}
