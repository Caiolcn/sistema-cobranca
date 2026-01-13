import { useState, useEffect } from 'react'
import { supabase } from './supabaseClient'

export function useTrialStatus() {
  const [trialStatus, setTrialStatus] = useState({
    loading: true,
    isExpired: false,
    diasRestantes: 0,
    planoPago: false,
    trialFim: null
  })

  useEffect(() => {
    checkTrialStatus()

    // Verificar a cada 5 minutos
    const interval = setInterval(checkTrialStatus, 5 * 60 * 1000)

    return () => clearInterval(interval)
  }, [])

  const checkTrialStatus = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        setTrialStatus({
          loading: false,
          isExpired: false,
          diasRestantes: 0,
          planoPago: false,
          trialFim: null
        })
        return
      }

      // Buscar dados do usuário
      const { data: usuario, error } = await supabase
        .from('usuarios')
        .select('trial_fim, plano_pago, plano')
        .eq('id', user.id)
        .single()

      if (error) throw error

      // Se tem plano pago, trial não se aplica
      if (usuario.plano_pago) {
        setTrialStatus({
          loading: false,
          isExpired: false,
          diasRestantes: -1, // Ilimitado
          planoPago: true,
          trialFim: null
        })
        return
      }

      // Calcular dias restantes
      const agora = new Date()
      const trialFim = new Date(usuario.trial_fim)
      const diffMs = trialFim - agora
      const diffDias = Math.ceil(diffMs / (1000 * 60 * 60 * 24))

      const isExpired = diffDias <= 0

      setTrialStatus({
        loading: false,
        isExpired,
        diasRestantes: Math.max(0, diffDias),
        planoPago: false,
        trialFim: usuario.trial_fim
      })

      console.log('📅 Status do Trial:', {
        isExpired,
        diasRestantes: Math.max(0, diffDias),
        trialFim: usuario.trial_fim
      })

    } catch (error) {
      console.error('Erro ao verificar status do trial:', error)
      setTrialStatus(prev => ({ ...prev, loading: false }))
    }
  }

  return {
    ...trialStatus,
    refresh: checkTrialStatus
  }
}
