import { useEffect, useRef, useCallback } from 'react'
import { supabase } from '../supabaseClient'
import { showToast } from '../Toast'

/**
 * Hook que escuta mudancas em tempo real na tabela mensalidades.
 * Mostra toast quando um pagamento e marcado como 'pago'.
 *
 * Requer: REPLICA IDENTITY FULL na tabela mensalidades
 * + tabela adicionada na publicacao realtime do Supabase
 */
export function usePaymentNotifications(userId, onPaymentReceived) {
  const channelRef = useRef(null)
  const callbackRef = useRef(onPaymentReceived)

  useEffect(() => {
    callbackRef.current = onPaymentReceived
  }, [onPaymentReceived])

  const handlePaymentChange = useCallback(async (payload) => {
    // So reagir quando status muda para 'pago'
    if (payload.new.status !== 'pago') return
    if (payload.old && payload.old.status === 'pago') return

    // Buscar nome do cliente
    let clientName = 'Cliente'
    try {
      const { data: devedor } = await supabase
        .from('devedores')
        .select('nome')
        .eq('id', payload.new.devedor_id)
        .maybeSingle()

      if (devedor?.nome) clientName = devedor.nome
    } catch (e) {
      // silenciar erro de lookup
    }

    const valor = parseFloat(payload.new.valor || 0)
    const valorFormatado = new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(valor)

    showToast(`Pagamento confirmado: ${clientName} - ${valorFormatado}`, 'success')

    if (callbackRef.current) {
      callbackRef.current({
        mensalidadeId: payload.new.id,
        devedorId: payload.new.devedor_id,
        clientName,
        valor,
        formaPagamento: payload.new.forma_pagamento,
        dataPagamento: payload.new.data_pagamento
      })
    }
  }, [])

  useEffect(() => {
    if (!userId) return

    const channel = supabase
      .channel(`payment-updates-${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'mensalidades',
          filter: `user_id=eq.${userId}`
        },
        handlePaymentChange
      )
      .subscribe()

    channelRef.current = channel

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current)
      }
    }
  }, [userId, handlePaymentChange])
}
