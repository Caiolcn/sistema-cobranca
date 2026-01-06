import React, { useState, useEffect } from 'react'
import { supabase } from './supabaseClient'

export default function DevedorForm({ devedor, onClose }) {
  const [nome, setNome] = useState('')
  const [telefone, setTelefone] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (devedor) {
      setNome(devedor.nome)
      setTelefone(devedor.telefone)
    }
  }, [devedor])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)

    const { data: { user } } = await supabase.auth.getUser()

    const dados = {
      user_id: user.id,
      nome,
      telefone,
      valor_devido: 0, // Valor calculado será a soma das parcelas
      data_vencimento: new Date().toISOString().split('T')[0], // Data padrão
      status: 'pendente'
    }

    let error
    if (devedor) {
      // Atualizar apenas nome e telefone
      ({ error } = await supabase.from('devedores')
        .update({ nome, telefone })
        .eq('id', devedor.id))
    } else {
      ({ error } = await supabase.from('devedores').insert([dados]))
    }

    if (error) {
      alert('Erro: ' + error.message)
    } else {
      alert(devedor ? 'Devedor atualizado!' : 'Devedor criado! Agora adicione as parcelas clicando em "Ver Parcelas"')
      onClose()
    }
    setLoading(false)
  }

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
      <div style={{ backgroundColor: 'white', padding: '30px', borderRadius: '10px', maxWidth: '500px', width: '100%' }}>
        <h2>{devedor ? 'Editar Devedor' : 'Adicionar Devedor'}</h2>
        {!devedor && (
          <p style={{ color: '#666', fontSize: '14px', marginBottom: '15px' }}>
            Após criar o devedor, você poderá adicionar parcelas clicando em "Ver Parcelas"
          </p>
        )}
        <form onSubmit={handleSubmit}>
          <input
            type="text"
            placeholder="Nome completo"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            required
            style={{ width: '100%', padding: '10px', marginBottom: '10px', border: '1px solid #ddd', borderRadius: '4px' }}
          />
          <input
            type="tel"
            placeholder="Telefone (com DDD) - Ex: 62982466639"
            value={telefone}
            onChange={(e) => setTelefone(e.target.value)}
            required
            style={{ width: '100%', padding: '10px', marginBottom: '10px', border: '1px solid #ddd', borderRadius: '4px' }}
          />
          <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
            <button
              type="submit"
              disabled={loading}
              style={{
                flex: 1,
                padding: '12px',
                backgroundColor: '#4CAF50',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: loading ? 'not-allowed' : 'pointer',
                fontWeight: 'bold'
              }}
            >
              {loading ? 'Salvando...' : devedor ? 'Atualizar' : 'Criar Devedor'}
            </button>
            <button
              type="button"
              onClick={onClose}
              style={{
                flex: 1,
                padding: '12px',
                backgroundColor: '#ccc',
                color: '#333',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontWeight: 'bold'
              }}
            >
              Cancelar
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}