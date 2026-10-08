import { useEffect, useRef } from 'react'
import { supabase } from '../supabaseClient'
import { showToast } from '../Toast'

const PAGOS = new Set(['pago', 'turma_pendente', 'aguardando_retirada', 'concluido'])

/**
 * Toast em tempo real quando um pedido da Loja (Mensalli Vendas) é pago.
 * Escuta UPDATE em loja_pedidos (tabela entra na publicação realtime em
 * sql-criar-loja.sql). Mesmo padrão de usePaymentNotifications.
 */
export function useVendaNotifications(userId) {
  const channelRef = useRef(null)

  useEffect(() => {
    if (!userId) return

    const channel = supabase
      .channel(`loja-pedidos-${userId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'loja_pedidos', filter: `user_id=eq.${userId}` },
        (payload) => {
          const novo = payload.new || {}
          const antigo = payload.old || {}
          // só na virada para pago (o webhook passa por 'pago' e depois pelo status final)
          if (!PAGOS.has(novo.status)) return
          if (antigo.status && antigo.status !== 'aguardando_pagamento') return
          const valor = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(parseFloat(novo.valor || 0))
          showToast(`Nova venda na loja: ${novo.nome || 'Aluno'} comprou ${novo.item_nome || 'um item'} (${valor})`, 'success')
        }
      )
      .subscribe()

    channelRef.current = channel
    return () => {
      if (channelRef.current) supabase.removeChannel(channelRef.current)
    }
  }, [userId])
}
