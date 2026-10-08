import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Icon } from '@iconify/react'
import { supabase } from '../supabaseClient'

// Card da Home com o resumo da Loja (Mensalli Vendas). Só aparece quando a loja
// está no ar. Carrega os próprios números para não mexer na carga da Home.

const PAGOS = ['pago', 'turma_pendente', 'aguardando_retirada', 'concluido', 'retirado']
const fmt = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(v) || 0)

export default function LojaResumoCard({ userId }) {
  const navigate = useNavigate()
  const [dados, setDados] = useState(null)

  useEffect(() => {
    if (!userId) return
    let cancelado = false
    const inicioMes = new Date()
    inicioMes.setDate(1); inicioMes.setHours(0, 0, 0, 0)

    Promise.all([
      supabase.from('loja_pedidos').select('valor, status, pago_em').eq('user_id', userId).in('status', PAGOS).gte('pago_em', inicioMes.toISOString()),
      supabase.from('loja_pedidos').select('id, status').eq('user_id', userId).in('status', ['aguardando_pagamento', 'turma_pendente', 'aguardando_retirada']),
    ]).then(([mes, pend]) => {
      if (cancelado) return
      const vendas = mes.data || []
      const pendentes = pend.data || []
      setDados({
        totalMes: vendas.reduce((s, p) => s + Number(p.valor || 0), 0),
        qtdMes: vendas.length,
        aguardandoPagamento: pendentes.filter((p) => p.status === 'aguardando_pagamento').length,
        turmaPendente: pendentes.filter((p) => p.status === 'turma_pendente').length,
        retirada: pendentes.filter((p) => p.status === 'aguardando_retirada').length,
      })
    }).catch(() => { if (!cancelado) setDados(null) })

    return () => { cancelado = true }
  }, [userId])

  if (!dados) return null

  const pendencias = []
  if (dados.turmaPendente) pendencias.push(`${dados.turmaPendente} sem turma`)
  if (dados.retirada) pendencias.push(`${dados.retirada} p/ retirar`)
  if (dados.aguardandoPagamento) pendencias.push(`${dados.aguardandoPagamento} aguardando Pix`)

  return (
    <div className="home-card card-loja" onClick={() => navigate('/app/marketing?aba=loja')} style={{ cursor: 'pointer' }}>
      <div className="card-header">
        <span className="card-label">Vendas da loja</span>
        <div className="card-icon"><Icon icon="mdi:storefront-outline" width="20" /></div>
      </div>
      <div className="card-body">
        <span className="card-value">{fmt(dados.totalMes)}</span>
        <span className="card-subtitle">
          {dados.qtdMes} {dados.qtdMes === 1 ? 'venda no mês' : 'vendas no mês'}
          {pendencias.length ? ` · ${pendencias.join(' · ')}` : ''}
        </span>
      </div>
    </div>
  )
}
