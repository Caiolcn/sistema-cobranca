import { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from '../supabaseClient'

const UserContext = createContext(null)

// Campos da conta que a UI inteira depende. Estava copiado em 4 selects, e
// esquecer um campo num deles é como o gate de acesso passa a mentir em só
// uma das rotas de carga.
//
// `virou_pagante_em` e `cancelado_em` são o trilho de assinatura (ver
// sql-ciclo-vida-conta.sql): é `virou_pagante_em`, não `plano_pago`, que decide
// se a conta é lida pelo plano ou pelo trial.
const CAMPOS_CONTA =
  'id, email, plano, plano_pago, plano_vencimento, limite_mensal, nome_empresa, ' +
  'nome_completo, chave_pix, cpf_cnpj, email_empresa, telefone, logo_url, ' +
  'trial_fim, virou_pagante_em, cancelado_em, role'

const CAMPOS_CONTA_COM_ONBOARDING = `${CAMPOS_CONTA}, onboarding_completed, onboarding_step`

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
        .select(CAMPOS_CONTA_COM_ONBOARDING)
        .eq('id', authUser.id)
        .maybeSingle()

      // Fallback: se colunas de onboarding ainda nao existem no banco
      let falhouBuscar = false
      if (error && !usuarioData) {
        const { data: fallback, error: fallbackError } = await supabase
          .from('usuarios')
          .select(CAMPOS_CONTA)
          .eq('id', authUser.id)
          .maybeSingle()
        usuarioData = fallback ? { ...fallback, onboarding_completed: true, onboarding_step: 4 } : null
        falhouBuscar = !fallback && !!fallbackError
      }

      // Se a busca falhou (rede/RLS), mantém os dados anteriores: zerar userData
      // rebaixa a conta pro/premium para os padrões de starter em toda a UI
      setUserData(prev => (falhouBuscar ? prev : usuarioData))
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
      .select(CAMPOS_CONTA_COM_ONBOARDING)
      .eq('id', user.id)
      .maybeSingle()

    // Fallback: se colunas de onboarding ainda nao existem no banco
    let falhouBuscar = false
    if (error && !data) {
      const { data: fallback, error: fallbackError } = await supabase
        .from('usuarios')
        .select(CAMPOS_CONTA)
        .eq('id', user.id)
        .maybeSingle()
      data = fallback ? { ...fallback, onboarding_completed: true, onboarding_step: 4 } : null
      falhouBuscar = !fallback && !!fallbackError
    }

    // Falha de rede não pode zerar userData (rebaixaria o plano na UI)
    setUserData(prev => (falhouBuscar ? prev : data))
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
      .select(CAMPOS_CONTA_COM_ONBOARDING)
      .eq('id', clientUserId)
      .maybeSingle()

    setAdminClientData(data)
  }, [])

  // Status de acesso da conta — SEMPRE por data, nunca por flag.
  //
  // Nada no sistema desliga `plano_pago` quando o plano vence, então tratar a
  // flag como permissão dava acesso vitalício a quem parou de pagar: a conta
  // ficava `isExpired: true, planoPago: true` e o Dashboard soltava ela.
  // Mesma regra do gate das automações no banco (usuario_pode_enviar, em
  // sql-gate-plano-pagamento-automacoes.sql): o dia do vencimento ainda é dia
  // de acesso, o corte cai no dia seguinte. Se mudar a regra aqui, mude lá —
  // senão a conta perde a cobrança automática num dia e o login no outro.
  //
  // E o TRILHO é `virou_pagante_em`, não `plano_pago`. Enquanto o boolean
  // escolhia a data-limite, desligá-lo jogava um ex-pagante no slot do trial:
  // o cliente que parou de pagar via "Seu período de teste de 3 dias terminou".
  // `virou_pagante_em` é write-once — uma vez pagante, sempre lido pelo plano.
  const trialStatus = useMemo(() => {
    const semDados = {
      isExpired: false, bloqueado: false, diasRestantes: 0,
      planoPago: false, eraPagante: false, cancelado: false,
      trialFim: null, motivo: null
    }
    if (!userData) return semDados

    // O vencimento vale até o fim do dia: gravado como 00:00, cortaria a conta
    // na virada do próprio dia que ela pagou para usar.
    const fimDoDia = (valor) => {
      if (!valor) return null
      const d = new Date(valor)
      if (isNaN(d.getTime())) return null
      d.setHours(23, 59, 59, 999)
      return d
    }

    const agora = new Date()
    const planoPago = !!userData.plano_pago
    const eraPagante = !!userData.virou_pagante_em
    const cancelado = !!userData.cancelado_em

    // Cancelamento explícito corta na hora, sem esperar data vencer — é o
    // "marcar como expirado" do /admin e o pedido de saída do cliente.
    if (cancelado) {
      return {
        ...semDados,
        planoPago, eraPagante, cancelado: true,
        isExpired: true, bloqueado: true,
        trialFim: userData.plano_vencimento || userData.trial_fim,
        // Cancelar uma conta que NUNCA pagou não a torna ex-pagante: ela
        // continua sendo um trial que acabou, e a copy tem que dizer isso.
        motivo: eraPagante ? 'cancelado' : 'trial_expirado'
      }
    }

    // Quem já foi pagante é lido pelo plano PARA SEMPRE, mesmo com plano_pago
    // desligado. Sem isso, o ex-pagante caía no trial_fim e virava "trial expirado".
    const dataLimite = fimDoDia(eraPagante ? userData.plano_vencimento : userData.trial_fim)

    if (!dataLimite) {
      // Ex-pagante sem data de vencimento é dado quebrado, não licença vitalícia
      // (o Admin e o webhook do Mercado Pago gravam os dois campos juntos):
      // fail-closed, igual ao gate do banco. Trial sem data segue liberado —
      // conta recém-criada pode ainda não ter trial_fim gravado.
      return {
        ...semDados,
        planoPago, eraPagante,
        isExpired: eraPagante,
        bloqueado: eraPagante,
        motivo: eraPagante ? 'pago_sem_vencimento' : null
      }
    }

    const venceu = dataLimite < agora
    const diffDias = Math.ceil((dataLimite - agora) / (1000 * 60 * 60 * 24))

    return {
      isExpired: venceu,
      bloqueado: venceu,
      diasRestantes: venceu ? 0 : Math.max(0, diffDias),
      planoPago,
      eraPagante,
      cancelado: false,
      trialFim: eraPagante ? userData.plano_vencimento : userData.trial_fim,
      motivo: venceu ? (eraPagante ? 'plano_vencido' : 'trial_expirado') : null
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
    cpfCnpj: effectiveData?.cpf_cnpj || '',
    emailEmpresa: effectiveData?.email_empresa || effectiveData?.email || '',
    telefoneEmpresa: effectiveData?.telefone || '',
    logoUrl: effectiveData?.logo_url || '',
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
