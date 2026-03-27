import { useEffect, useRef, useCallback } from 'react'
import { supabase } from '../supabaseClient'
import { showToast } from '../Toast'

/**
 * Hook que escuta mudancas em tempo real na tabela agendamentos.
 * Mostra toast quando um aluno agenda ou cancela uma aula.
 *
 * Requer: tabela agendamentos adicionada na publicacao realtime do Supabase
 */
export function useAgendamentoNotifications(userId) {
  const channelRef = useRef(null)

  const handleInsert = useCallback(async (payload) => {
    if (payload.new.status !== 'confirmado') return

    let alunoNome = 'Aluno'
    try {
      const { data: devedor } = await supabase
        .from('devedores')
        .select('nome')
        .eq('id', payload.new.devedor_id)
        .maybeSingle()
      if (devedor?.nome) alunoNome = devedor.nome.split(' ')[0]
    } catch {}

    showToast(`${alunoNome} agendou uma aula para ${new Date(payload.new.data + 'T12:00:00').toLocaleDateString('pt-BR')}`, 'success')
  }, [])

  const handleUpdate = useCallback(async (payload) => {
    if (payload.new.status !== 'cancelado') return
    if (payload.old && payload.old.status === 'cancelado') return

    let alunoNome = 'Aluno'
    try {
      const { data: devedor } = await supabase
        .from('devedores')
        .select('nome')
        .eq('id', payload.new.devedor_id)
        .maybeSingle()
      if (devedor?.nome) alunoNome = devedor.nome.split(' ')[0]
    } catch {}

    showToast(`${alunoNome} cancelou um agendamento`, 'warning')
  }, [])

  useEffect(() => {
    if (!userId) return

    const channel = supabase
      .channel(`agendamento-updates-${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'agendamentos',
          filter: `user_id=eq.${userId}`
        },
        handleInsert
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'agendamentos',
          filter: `user_id=eq.${userId}`
        },
        handleUpdate
      )
      .subscribe()

    channelRef.current = channel

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current)
      }
    }
  }, [userId, handleInsert, handleUpdate])
}
