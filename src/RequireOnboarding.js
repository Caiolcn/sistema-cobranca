import { useState, useEffect } from 'react'
import { Navigate } from 'react-router-dom'
import { supabase } from './supabaseClient'
import { useUser } from './contexts/UserContext'

/**
 * Guard das rotas internas (/app/*).
 *
 * Antes disso o wizard era uma porta que fechava: o Signup mandava pro
 * /app/onboarding, mas nada obrigava a passar por lá. Quem fechava a aba no meio
 * caía no /app/home no próximo login e nunca mais via o wizard — 21 das 50 contas
 * novas ficaram travadas em onboarding_step = 0, e 14 delas preencheram empresa
 * por fora, pelas Configurações.
 *
 * Regra deliberadamente conservadora, pra não sequestrar quem já está usando:
 *   redireciona só se NÃO concluiu, NÃO chegou ao fim do wizard e tem ZERO alunos.
 *
 * - Quem já cadastrou aluno está trabalhando: nunca é redirecionado (o checklist
 *   flutuante do Home continua sendo a rede de segurança).
 * - Quem chegou ao passo 4 (concluiu ou pulou até o fim) não é redirecionado de
 *   novo — senão vira loop, já que "Pular e Concluir" deixa completed = false.
 * - Admin (inclusive vendo como cliente) nunca é redirecionado.
 */
export default function RequireOnboarding({ children }) {
  const { userId, userData, loading, isAdmin, adminViewingAs } = useUser()
  const [decisao, setDecisao] = useState(null) // null = ainda checando

  useEffect(() => {
    let cancelado = false

    const decidir = async () => {
      if (loading) return

      // Sem sessão/contexto ainda: deixa passar, quem barra é a rota do App.
      if (!userId || !userData) {
        if (!cancelado) setDecisao('liberado')
        return
      }

      if (isAdmin || adminViewingAs) {
        if (!cancelado) setDecisao('liberado')
        return
      }

      if (userData.onboarding_completed === true || (userData.onboarding_step ?? 0) >= 4) {
        if (!cancelado) setDecisao('liberado')
        return
      }

      // Último critério: quem já tem aluno está usando o produto de verdade.
      const { count, error } = await supabase
        .from('devedores')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .or('lixo.is.null,lixo.eq.false')

      if (cancelado) return
      // Na dúvida (erro de rede/RLS), libera: nunca prender o usuário fora do app.
      setDecisao(error || (count ?? 0) > 0 ? 'liberado' : 'onboarding')
    }

    decidir()
    return () => { cancelado = true }
  }, [userId, userData, loading, isAdmin, adminViewingAs])

  if (decisao === null) {
    return (
      <div style={{
        display: 'flex', justifyContent: 'center', alignItems: 'center',
        height: '100dvh', color: '#344848'
      }}>
        Carregando...
      </div>
    )
  }

  if (decisao === 'onboarding') {
    return <Navigate to="/app/onboarding" replace />
  }

  return children
}
