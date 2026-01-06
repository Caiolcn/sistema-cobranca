import React, { useState, useEffect } from 'react'
import { supabase } from './supabaseClient'
import DevedorForm from './DevedorForm'
import ParcelasList from './ParcelasList'

export default function Devedores() {
  const [devedores, setDevedores] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editando, setEditando] = useState(null)
  const [devedorSelecionado, setDevedorSelecionado] = useState(null)

  useEffect(() => {
    carregarDevedores()
  }, [])

  const carregarDevedores = async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('devedores')
      .select('*')
      .order('created_at', { ascending: false })
    
    if (error) {
      alert('Erro ao carregar devedores: ' + error.message)
    } else {
      setDevedores(data || [])
    }
    setLoading(false)
  }

  const deletarDevedor = async (id) => {
    if (!window.confirm('Tem certeza que deseja excluir?')) return
    
    const { error } = await supabase.from('devedores').delete().eq('id', id)
    if (error) {
      alert('Erro ao excluir: ' + error.message)
    } else {
      carregarDevedores()
    }
  }

  const handleEdit = (devedor) => {
    setEditando(devedor)
    setShowForm(true)
  }

  const handleFormClose = () => {
    setShowForm(false)
    setEditando(null)
    carregarDevedores()
  }

  const handleVerParcelas = (devedor) => {
    setDevedorSelecionado(devedor)
  }

  const handleVoltarLista = () => {
    setDevedorSelecionado(null)
  }

  if (loading) return <p>Carregando...</p>

  // Se um devedor está selecionado, mostra as parcelas
  if (devedorSelecionado) {
    return (
      <div>
        <button
          onClick={handleVoltarLista}
          style={{ padding: '10px 20px', marginBottom: '20px', backgroundColor: '#666', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
        >
          ← Voltar para Lista de Devedores
        </button>
        <ParcelasList devedor={devedorSelecionado} />
      </div>
    )
  }

  // Lista de devedores
  return (
    <div>
      <button onClick={() => setShowForm(true)} style={{ padding: '10px 20px', marginBottom: '20px', backgroundColor: '#4CAF50', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
        + Adicionar Devedor
      </button>

      {showForm && <DevedorForm devedor={editando} onClose={handleFormClose} />}

      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ backgroundColor: '#f0f0f0' }}>
            <th style={{ padding: '10px', textAlign: 'left' }}>Nome</th>
            <th style={{ padding: '10px', textAlign: 'left' }}>Telefone</th>
            <th style={{ padding: '10px', textAlign: 'left' }}>Valor Total</th>
            <th style={{ padding: '10px', textAlign: 'left' }}>Vencimento</th>
            <th style={{ padding: '10px', textAlign: 'left' }}>Status</th>
            <th style={{ padding: '10px', textAlign: 'left' }}>Ações</th>
          </tr>
        </thead>
        <tbody>
          {devedores.map((dev) => (
            <tr key={dev.id} style={{ borderBottom: '1px solid #ddd' }}>
              <td style={{ padding: '10px' }}>{dev.nome}</td>
              <td style={{ padding: '10px' }}>{dev.telefone}</td>
              <td style={{ padding: '10px' }}>R$ {parseFloat(dev.valor_devido).toFixed(2)}</td>
              <td style={{ padding: '10px' }}>{new Date(dev.data_vencimento).toLocaleDateString('pt-BR')}</td>
              <td style={{ padding: '10px' }}>{dev.status}</td>
              <td style={{ padding: '10px' }}>
                <button
                  onClick={() => handleVerParcelas(dev)}
                  style={{ marginRight: '10px', padding: '6px 12px', backgroundColor: '#2196F3', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                >
                  Ver Parcelas
                </button>
                <button
                  onClick={() => handleEdit(dev)}
                  style={{ marginRight: '10px', padding: '6px 12px', backgroundColor: '#FF9800', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                >
                  Editar
                </button>
                <button
                  onClick={() => deletarDevedor(dev.id)}
                  style={{ padding: '6px 12px', backgroundColor: '#F44336', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                >
                  Excluir
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {devedores.length === 0 && <p style={{ textAlign: 'center', marginTop: '20px' }}>Nenhum devedor cadastrado.</p>}
    </div>
  )
}