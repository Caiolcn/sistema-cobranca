import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { supabase } from '../supabaseClient'

const UserContext = createContext(null)

export function UserProvider({ children }) {
  const [user, setUser] = useState(null)
  const [userData, setUserData] = useState(null)
  const [loading, setLoading] = useState(true)

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

      // Buscar dados adicionais do usuário
      const { data: usuarioData } = await supabase
        .from('usuarios')
        .select('*')
        .eq('id', authUser.id)
        .maybeSingle()

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

    const { data } = await supabase
      .from('usuarios')
      .select('*')
      .eq('id', user.id)
      .maybeSingle()

    setUserData(data)
  }, [user])

  const value = {
    user,
    userData,
    loading,
    refreshUserData,
    // Helpers úteis
    userId: user?.id,
    plano: userData?.plano || 'starter',
    nomeEmpresa: userData?.nome_empresa || '',
    chavePix: userData?.chave_pix || ''
  }

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
