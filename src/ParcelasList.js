import React, { useState, useEffect } from 'react'
import { supabase } from './supabaseClient'
import ParcelaForm from './ParcelaForm'

export default function ParcelasList({ devedor }) {
  const [parcelas, setParcelas] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editando, setEditando] = useState(null)

  useEffect(() => {
    if (devedor) {
      carregarParcelas()
    }
  }, [devedor])

  const carregarParcelas = async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('parcelas')
      .select('*')
      .eq('devedor_id', devedor.id)
      .order('numero_parcela', { ascending: true })

    if (error) {
      console.error('Erro ao carregar parcelas:', error)
      alert('Erro ao carregar parcelas: ' + error.message)
    } else {
      setParcelas(data || [])
    }
    setLoading(false)
  }

  const deletarParcela = async (id) => {
    if (!window.confirm('Tem certeza que deseja excluir esta parcela?')) return

    const { error } = await supabase.from('parcelas').delete().eq('id', id)
    if (error) {
      alert('Erro ao excluir: ' + error.message)
    } else {
      carregarParcelas()
    }
  }

  const alterarStatus = async (parcela, novoStatus) => {
    const { error } = await supabase
      .from('parcelas')
      .update({ status: novoStatus })
      .eq('id', parcela.id)

    if (error) {
      alert('Erro ao atualizar status: ' + error.message)
    } else {
      carregarParcelas()
    }
  }

  const handleEdit = (parcela) => {
    setEditando(parcela)
    setShowForm(true)
  }

  const handleFormClose = () => {
    setShowForm(false)
    setEditando(null)
    carregarParcelas()
  }

  const getStatusColor = (status) => {
    switch (status) {
      case 'pago': return '#4CAF50'
      case 'pendente': return '#FF9800'
      case 'atrasado': return '#F44336'
      case 'cancelado': return '#9E9E9E'
      default: return '#757575'
    }
  }

  const getStatusLabel = (status) => {
    switch (status) {
      case 'pago': return 'Pago'
      case 'pendente': return 'Pendente'
      case 'atrasado': return 'Atrasado'
      case 'cancelado': return 'Cancelado'
      default: return status
    }
  }

  if (loading) return <p>Carregando parcelas...</p>

  return (
    <div style={{ marginTop: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
        <h3>Parcelas de {devedor.nome}</h3>
        <button
          onClick={() => setShowForm(true)}
          style={{ padding: '8px 16px', backgroundColor: '#2196F3', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
        >
          + Adicionar Parcela
        </button>
      </div>

      {showForm && (
        <ParcelaForm
          devedor={devedor}
          parcela={editando}
          onClose={handleFormClose}
        />
      )}

      {parcelas.length === 0 ? (
        <p style={{ textAlign: 'center', color: '#666' }}>Nenhuma parcela cadastrada. Clique em "Adicionar Parcela" para começar.</p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '10px' }}>
          <thead>
            <tr style={{ backgroundColor: '#f5f5f5' }}>
              <th style={{ padding: '12px', textAlign: 'left', borderBottom: '2px solid #ddd' }}>Parcela</th>
              <th style={{ padding: '12px', textAlign: 'left', borderBottom: '2px solid #ddd' }}>Valor</th>
              <th style={{ padding: '12px', textAlign: 'left', borderBottom: '2px solid #ddd' }}>Vencimento</th>
              <th style={{ padding: '12px', textAlign: 'left', borderBottom: '2px solid #ddd' }}>Status</th>
              <th style={{ padding: '12px', textAlign: 'left', borderBottom: '2px solid #ddd' }}>Enviado</th>
              <th style={{ padding: '12px', textAlign: 'left', borderBottom: '2px solid #ddd' }}>Ações</th>
            </tr>
          </thead>
          <tbody>
            {parcelas.map((parcela) => {
              const vencimento = new Date(parcela.data_vencimento)
              const hoje = new Date()
              const diasAtraso = Math.floor((hoje - vencimento) / (1000 * 60 * 60 * 24))

              return (
                <tr key={parcela.id} style={{ borderBottom: '1px solid #eee' }}>
                  <td style={{ padding: '12px' }}>
                    <strong>#{parcela.numero_parcela}</strong>
                    {parcela.descricao && <div style={{ fontSize: '12px', color: '#666' }}>{parcela.descricao}</div>}
                  </td>
                  <td style={{ padding: '12px' }}>R$ {parseFloat(parcela.valor).toFixed(2)}</td>
                  <td style={{ padding: '12px' }}>
                    {vencimento.toLocaleDateString('pt-BR')}
                    {diasAtraso > 0 && parcela.status === 'pendente' && (
                      <div style={{ fontSize: '12px', color: '#F44336' }}>
                        {diasAtraso} dia(s) em atraso
                      </div>
                    )}
                  </td>
                  <td style={{ padding: '12px' }}>
                    <span style={{
                      backgroundColor: getStatusColor(parcela.status),
                      color: 'white',
                      padding: '4px 8px',
                      borderRadius: '4px',
                      fontSize: '12px',
                      fontWeight: 'bold'
                    }}>
                      {getStatusLabel(parcela.status)}
                    </span>
                  </td>
                  <td style={{ padding: '12px', fontSize: '12px' }}>
                    {parcela.enviado_hoje ? (
                      <span style={{ color: '#4CAF50' }}>✓ Enviado hoje</span>
                    ) : (
                      <span style={{ color: '#999' }}>Não enviado</span>
                    )}
                    {parcela.total_envios > 0 && (
                      <div style={{ color: '#666' }}>{parcela.total_envios} envio(s)</div>
                    )}
                  </td>
                  <td style={{ padding: '12px' }}>
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                      {parcela.status !== 'pago' && (
                        <button
                          onClick={() => alterarStatus(parcela, 'pago')}
                          style={{ padding: '4px 8px', fontSize: '12px', backgroundColor: '#4CAF50', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                        >
                          Marcar Pago
                        </button>
                      )}
                      {parcela.status === 'pago' && (
                        <button
                          onClick={() => alterarStatus(parcela, 'pendente')}
                          style={{ padding: '4px 8px', fontSize: '12px', backgroundColor: '#FF9800', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                        >
                          Marcar Pendente
                        </button>
                      )}
                      <button
                        onClick={() => handleEdit(parcela)}
                        style={{ padding: '4px 8px', fontSize: '12px', backgroundColor: '#2196F3', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                      >
                        Editar
                      </button>
                      <button
                        onClick={() => deletarParcela(parcela.id)}
                        style={{ padding: '4px 8px', fontSize: '12px', backgroundColor: '#F44336', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                      >
                        Excluir
                      </button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}

      <div style={{ marginTop: '20px', padding: '15px', backgroundColor: '#f5f5f5', borderRadius: '4px' }}>
        <strong>Resumo:</strong>
        <div style={{ marginTop: '8px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '10px' }}>
          <div>
            <div style={{ fontSize: '12px', color: '#666' }}>Total de Parcelas</div>
            <div style={{ fontSize: '18px', fontWeight: 'bold' }}>{parcelas.length}</div>
          </div>
          <div>
            <div style={{ fontSize: '12px', color: '#666' }}>Pagas</div>
            <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#4CAF50' }}>
              {parcelas.filter(p => p.status === 'pago').length}
            </div>
          </div>
          <div>
            <div style={{ fontSize: '12px', color: '#666' }}>Pendentes</div>
            <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#FF9800' }}>
              {parcelas.filter(p => p.status === 'pendente').length}
            </div>
          </div>
          <div>
            <div style={{ fontSize: '12px', color: '#666' }}>Valor Total</div>
            <div style={{ fontSize: '18px', fontWeight: 'bold' }}>
              R$ {parcelas.reduce((sum, p) => sum + parseFloat(p.valor), 0).toFixed(2)}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
