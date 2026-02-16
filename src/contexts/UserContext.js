import { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from '../supabaseClient'

const UserContext = createContext(null)

export function UserProvider({ children }) {
  const [user, setUser] = useState(null)
  const [userData, setUserData] = useState(null)
  const [loading, setLoading] = useState(true)

  // Admin: estado para visualizar como outro usuário
  const [adminViewingAs, setAdminViewingAs] = useState(null)
  const [adminClientData, setAdminClientData] = useState(null)

  // Carregar usuário UMA vez ao iniciar
  const loadUser = useCallback(async () => {
    try {
      const { data: { user: authUser } } = await supabase.auth.getUser()

      if (!authUser) {
        setUser(null)
        setUserData(null)
        setLoading(false)
        return
      }

      setUser(authUser)

      // Buscar dados adicionais do usuário (incluindo trial_fim para evitar query duplicada)
      let { data: usuarioData, error } = await supabase
        .from('usuarios')
        .select('id, email, plano, plano_pago, limite_mensal, nome_empresa, nome_completo, chave_pix, trial_fim, onboarding_completed, onboarding_step, role')
        .eq('id', authUser.id)
        .maybeSingle()

      // Fallback: se colunas de onboarding ainda nao existem no banco
      if (error && !usuarioData) {
        const { data: fallback } = await supabase
          .from('usuarios')
          .select('id, email, plano, plano_pago, limite_mensal, nome_empresa, nome_completo, chave_pix, trial_fim, role')
          .eq('id', authUser.id)
          .maybeSingle()
        usuarioData = fallback ? { ...fallback, onboarding_completed: true, onboarding_step: 4 } : null
      }

      setUserData(usuarioData)
    } catch (error) {
      console.error('Erro ao carregar usuário:', error)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadUser()

    // Escutar mudanças de auth
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
        loadUser()
      } else if (event === 'SIGNED_OUT') {
        setUser(null)
        setUserData(null)
      }
    })

    return () => subscription.unsubscribe()
  }, [loadUser])

  // Função para recarregar dados do usuário (após update)
  const refreshUserData = useCallback(async () => {
    if (!user) return

    let { data, error } = await supabase
      .from('usuarios')
      .select('id, email, plano, plano_pago, limite_mensal, nome_empresa, nome_completo, chave_pix, trial_fim, onboarding_completed, onboarding_step, role')
      .eq('id', user.id)
      .maybeSingle()

    // Fallback: se colunas de onboarding ainda nao existem no banco
    if (error && !data) {
      const { data: fallback } = await supabase
        .from('usuarios')
        .select('id, email, plano, plano_pago, limite_mensal, nome_empresa, nome_completo, chave_pix, trial_fim, role')
        .eq('id', user.id)
        .maybeSingle()
      data = fallback ? { ...fallback, onboarding_completed: true, onboarding_step: 4 } : null
    }

    setUserData(data)
  }, [user])

  // Admin: verificar se é admin
  const isAdmin = userData?.role === 'admin'

  // Admin: função para selecionar cliente a visualizar
  const setAdminClient = useCallback(async (clientUserId) => {
    if (!clientUserId) {
      setAdminViewingAs(null)
      setAdminClientData(null)
      return
    }

    setAdminViewingAs(clientUserId)

    const { data } = await supabase
      .from('usuarios')
      .select('id, email, plano, plano_pago, limite_mensal, nome_empresa, nome_completo, chave_pix, trial_fim')
      .eq('id', clientUserId)
      .maybeSingle()

    setAdminClientData(data)
  }, [])

  // Calcular status do trial/plano uma vez (evita query duplicada no useTrialStatus)
  const trialStatus = useMemo(() => {
    if (!userData) return { isExpired: false, diasRestantes: 0, planoPago: false, trialFim: null }

    const agora = new Date()
    const trialFim = userData.trial_fim ? new Date(userData.trial_fim) : null

    // Se tem plano pago, calcular dias ate expirar o plano (trial_fim reutilizado como data de expiracao)
    if (userData.plano_pago) {
      if (!trialFim) {
        return { isExpired: false, diasRestantes: -1, planoPago: true, trialFim: null }
      }

      const diffMs = trialFim - agora
      const diffDias = Math.ceil(diffMs / (1000 * 60 * 60 * 24))
      const isExpired = diffDias <= 0

      return {
        isExpired,
        diasRestantes: isExpired ? 0 : diffDias,
        planoPago: true,
        trialFim: userData.trial_fim
      }
    }

    // Trial: calcular dias restantes
    if (!trialFim) {
      return { isExpired: false, diasRestantes: 0, planoPago: false, trialFim: null }
    }

    const diffMs = trialFim - agora
    const diffDias = Math.ceil(diffMs / (1000 * 60 * 60 * 24))
    const isExpired = diffDias <= 0

    return {
      isExpired,
      diasRestantes: Math.max(0, diffDias),
      planoPago: false,
      trialFim: userData.trial_fim
    }
  }, [userData])

  // Dados efetivos: se admin está visualizando um cliente, usa os dados do cliente
  const effectiveData = (isAdmin && adminViewingAs && adminClientData) ? adminClientData : userData

  const value = useMemo(() => ({
    user,
    userData,
    loading,
    refreshUserData,
    // Helpers úteis - usa dados efetivos (cliente selecionado ou próprio usuário)
    userId: (isAdmin && adminViewingAs) ? adminViewingAs : user?.id,
    plano: effectiveData?.plano || 'starter',
    nomeEmpresa: effectiveData?.nome_empresa || '',
    nomeCompleto: effectiveData?.nome_completo || '',
    chavePix: effectiveData?.chave_pix || '',
    // Trial status (calculado uma vez, evita query duplicada)
    trialStatus,
    // Admin
    isAdmin,
    adminViewingAs,
    setAdminClient,
    realUserId: user?.id
  }), [user, userData, loading, refreshUserData, trialStatus, isAdmin, adminViewingAs, setAdminClient, effectiveData])

  return (
    <UserContext.Provider value={value}>
      {children}
    </UserContext.Provider>
  )
}

export function useUser() {
  const context = useContext(UserContext)
  if (!context) {
    throw new Error('useUser deve ser usado dentro de um UserProvider')
  }
  return context
}

export default UserContext
