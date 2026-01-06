import { useState, useEffect } from 'react'
import { supabase } from './supabaseClient'
import { Icon } from '@iconify/react'

export default function Clientes() {
  const [clientes, setClientes] = useState([])
  const [clientesFiltrados, setClientesFiltrados] = useState([])
  const [loading, setLoading] = useState(true)
  const [clienteSelecionado, setClienteSelecionado] = useState(null)
  const [mostrarModal, setMostrarModal] = useState(false)
  const [parcelasCliente, setParcelasCliente] = useState([])
  const [editando, setEditando] = useState(false)
  const [nomeEdit, setNomeEdit] = useState('')
  const [telefoneEdit, setTelefoneEdit] = useState('')
  const [busca, setBusca] = useState('')

  useEffect(() => {
    carregarClientes()
  }, [])

  useEffect(() => {
    // Filtrar clientes quando a busca mudar
    if (busca.trim() === '') {
      setClientesFiltrados(clientes)
    } else {
      const termo = busca.toLowerCase()
      const filtrados = clientes.filter(cliente =>
        cliente.nome.toLowerCase().includes(termo) ||
        cliente.telefone.toLowerCase().includes(termo)
      )
      setClientesFiltrados(filtrados)
    }
  }, [busca, clientes])

  const carregarClientes = async () => {
    setLoading(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()

      // Buscar clientes
      const { data: clientesData, error: clientesError } = await supabase
        .from('devedores')
        .select('id, nome, telefone, created_at')
        .eq('user_id', user.id)
        .order('nome', { ascending: true })

      if (clientesError) throw clientesError

      // Buscar parcelas para calcular valor devido
      const { data: parcelasData, error: parcelasError } = await supabase
        .from('parcelas')
        .select('devedor_id, valor, status')
        .eq('user_id', user.id)

      if (parcelasError) throw parcelasError

      // Calcular valor devido por cliente
      const clientesComValor = clientesData.map(cliente => {
        const parcelasDoCliente = parcelasData.filter(p => p.devedor_id === cliente.id)
        const valorDevido = parcelasDoCliente
          .filter(p => p.status !== 'pago')
          .reduce((sum, p) => sum + parseFloat(p.valor || 0), 0)

        const totalParcelas = parcelasDoCliente.length
        const parcelasPendentes = parcelasDoCliente.filter(p => p.status === 'pendente').length
        const parcelasPagas = parcelasDoCliente.filter(p => p.status === 'pago').length

        return {
          ...cliente,
          valorDevido,
          totalParcelas,
          parcelasPendentes,
          parcelasPagas
        }
      })

      setClientes(clientesComValor)
    } catch (error) {
      console.error('Erro ao carregar clientes:', error)
      alert('Erro ao carregar clientes: ' + error.message)
    } finally {
      setLoading(false)
    }
  }

  const carregarParcelasCliente = async (clienteId) => {
    try {
      const { data, error } = await supabase
        .from('parcelas')
        .select('*')
        .eq('devedor_id', clienteId)
        .order('data_vencimento', { ascending: true })

      if (error) throw error

      // Calcular status e ordenar: atrasado > aberto > pago
      const parcelasComStatus = (data || []).map(parcela => {
        let status = parcela.status

        if (status === 'pendente') {
          const hoje = new Date()
          hoje.setHours(0, 0, 0, 0)
          const vencimento = new Date(parcela.data_vencimento)
          vencimento.setHours(0, 0, 0, 0)

          if (vencimento < hoje) {
            status = 'atrasado'
          } else {
            status = 'aberto'
          }
        }

        return { ...parcela, statusCalculado: status }
      })

      // Ordenar por prioridade: atrasado (1), aberto (2), pago (3)
      parcelasComStatus.sort((a, b) => {
        const prioridade = { atrasado: 1, aberto: 2, pago: 3 }
        if (prioridade[a.statusCalculado] !== prioridade[b.statusCalculado]) {
          return prioridade[a.statusCalculado] - prioridade[b.statusCalculado]
        }
        // Se mesmo status, ordenar por data de vencimento (mais próximo primeiro)
        return new Date(a.data_vencimento) - new Date(b.data_vencimento)
      })

      setParcelasCliente(parcelasComStatus)
    } catch (error) {
      console.error('Erro ao carregar parcelas:', error)
    }
  }

  const handleClienteClick = async (cliente) => {
    setClienteSelecionado(cliente)
    setNomeEdit(cliente.nome)
    setTelefoneEdit(cliente.telefone)
    setEditando(false)
    setMostrarModal(true)
    await carregarParcelasCliente(cliente.id)
  }

  const handleSalvarEdicao = async () => {
    if (!nomeEdit.trim() || !telefoneEdit.trim()) {
      alert('Preencha nome e telefone')
      return
    }

    try {
      const { error } = await supabase
        .from('devedores')
        .update({
          nome: nomeEdit.trim(),
          telefone: telefoneEdit.trim()
        })
        .eq('id', clienteSelecionado.id)

      if (error) throw error

      alert('Cliente atualizado com sucesso!')
      setEditando(false)
      setMostrarModal(false)
      carregarClientes()
    } catch (error) {
      alert('Erro ao atualizar cliente: ' + error.message)
    }
  }

  const handleAlterarStatusParcela = async (parcela, novoPago) => {
    const confirmar = window.confirm(
      novoPago
        ? `Confirmar pagamento de R$ ${parseFloat(parcela.valor).toFixed(2)}?`
        : 'Desfazer o pagamento desta parcela?'
    )

    if (!confirmar) return

    try {
      const { error } = await supabase
        .from('parcelas')
        .update({ status: novoPago ? 'pago' : 'pendente' })
        .eq('id', parcela.id)

      if (error) throw error

      // Atualizar parcelas do cliente no modal
      await carregarParcelasCliente(clienteSelecionado.id)

      // Recarregar lista de clientes para atualizar valores
      carregarClientes()
    } catch (error) {
      alert('Erro ao atualizar: ' + error.message)
    }
  }

  const handleExcluirCliente = async (cliente, event) => {
    event.stopPropagation()

    const confirmar = window.confirm(
      `Tem certeza que deseja excluir o cliente "${cliente.nome}"?\n\n` +
      `ATENÇÃO: Todas as ${cliente.totalParcelas} parcela(s) associadas também serão excluídas!`
    )

    if (!confirmar) return

    try {
      // Primeiro excluir parcelas
      const { error: parcelasError } = await supabase
        .from('parcelas')
        .delete()
        .eq('devedor_id', cliente.id)

      if (parcelasError) throw parcelasError

      // Depois excluir cliente
      const { error: clienteError } = await supabase
        .from('devedores')
        .delete()
        .eq('id', cliente.id)

      if (clienteError) throw clienteError

      alert('Cliente excluído com sucesso!')
      carregarClientes()
    } catch (error) {
      alert('Erro ao excluir cliente: ' + error.message)
    }
  }

  const formatCurrency = (value) => {
    return value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  }

  const formatDate = (dateString) => {
    const date = new Date(dateString + 'T00:00:00')
    return date.toLocaleDateString('pt-BR')
  }

  const getStatusBadge = (parcela) => {
    // Usar statusCalculado se disponível, senão calcular
    let status = parcela.statusCalculado || parcela.status

    if (!parcela.statusCalculado && status === 'pendente') {
      const hoje = new Date()
      hoje.setHours(0, 0, 0, 0)
      const vencimento = new Date(parcela.data_vencimento)
      vencimento.setHours(0, 0, 0, 0)

      if (vencimento < hoje) {
        status = 'atrasado'
      } else {
        status = 'aberto'
      }
    }

    const configs = {
      pago: { bg: '#4CAF50', text: 'Pago' },
      aberto: { bg: '#2196F3', text: 'Em aberto' },
      atrasado: { bg: '#f44336', text: 'Em atraso' },
      pendente: { bg: '#ff9800', text: 'Pendente' }
    }

    const config = configs[status] || configs.pendente

    return (
      <span style={{
        backgroundColor: config.bg,
        color: 'white',
        padding: '3px 10px',
        borderRadius: '12px',
        fontSize: '11px',
        fontWeight: 'bold'
      }}>
        {config.text}
      </span>
    )
  }

  if (loading) {
    return (
      <div style={{ padding: '40px', textAlign: 'center' }}>
        <p>Carregando clientes...</p>
      </div>
    )
  }

  return (
    <div style={{ flex: 1, padding: '25px 30px', backgroundColor: '#f5f5f5', minHeight: '100vh' }}>
      {/* Header */}
      <div style={{
        backgroundColor: 'white',
        borderRadius: '8px',
        padding: '20px',
        marginBottom: '25px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.08)'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '18px', fontWeight: '600', color: '#344848' }}>
              Clientes
            </h2>
            <p style={{ margin: '5px 0 0 0', fontSize: '14px', color: '#666' }}>
              {clientesFiltrados.length} de {clientes.length} cliente(s)
            </p>
          </div>
          <div style={{ textAlign: 'right' }}>
            <p style={{ margin: 0, fontSize: '12px', color: '#999' }}>Total em aberto</p>
            <p style={{ margin: '3px 0 0 0', fontSize: '18px', fontWeight: '700', color: '#f44336' }}>
              R$ {formatCurrency(clientes.reduce((sum, c) => sum + c.valorDevido, 0))}
            </p>
          </div>
        </div>

        {/* Campo de busca */}
        <div style={{ position: 'relative' }}>
          <Icon
            icon="material-symbols:search"
            width="20"
            height="20"
            style={{
              position: 'absolute',
              left: '12px',
              top: '50%',
              transform: 'translateY(-50%)',
              color: '#999'
            }}
          />
          <input
            type="text"
            placeholder="Buscar por nome ou telefone..."
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            style={{
              width: '100%',
              padding: '10px 12px 10px 40px',
              fontSize: '14px',
              border: '1px solid #ddd',
              borderRadius: '6px',
              outline: 'none',
              transition: 'border-color 0.2s',
              boxSizing: 'border-box'
            }}
            onFocus={(e) => e.target.style.borderColor = '#344848'}
            onBlur={(e) => e.target.style.borderColor = '#ddd'}
          />
          {busca && (
            <button
              onClick={() => setBusca('')}
              style={{
                position: 'absolute',
                right: '12px',
                top: '50%',
                transform: 'translateY(-50%)',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: '4px',
                display: 'flex',
                alignItems: 'center',
                color: '#999'
              }}
            >
              <Icon icon="mdi:close-circle" width="18" height="18" />
            </button>
          )}
        </div>
      </div>

      {/* Lista de Clientes */}
      <div style={{
        backgroundColor: 'white',
        borderRadius: '8px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
        overflow: 'hidden'
      }}>
        {clientes.length === 0 ? (
          <div style={{ padding: '60px 20px', textAlign: 'center' }}>
            <Icon icon="mdi:account-off-outline" width="64" height="64" style={{ color: '#ccc', marginBottom: '16px' }} />
            <p style={{ color: '#999', fontSize: '16px', margin: '0' }}>
              Nenhum cliente cadastrado ainda
            </p>
            <p style={{ color: '#ccc', fontSize: '14px', margin: '8px 0 0 0' }}>
              Adicione parcelas pela tela Financeiro para criar clientes automaticamente
            </p>
          </div>
        ) : clientesFiltrados.length === 0 ? (
          <div style={{ padding: '60px 20px', textAlign: 'center' }}>
            <Icon icon="material-symbols:search-off" width="64" height="64" style={{ color: '#ccc', marginBottom: '16px' }} />
            <p style={{ color: '#999', fontSize: '16px', margin: '0' }}>
              Nenhum cliente encontrado
            </p>
            <p style={{ color: '#ccc', fontSize: '14px', margin: '8px 0 0 0' }}>
              Tente buscar por outro nome ou telefone
            </p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ backgroundColor: '#f9f9f9', borderBottom: '1px solid #e0e0e0' }}>
                  <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: '#666' }}>
                    Cliente
                  </th>
                  <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: '#666' }}>
                    Telefone
                  </th>
                  <th style={{ padding: '12px 16px', textAlign: 'center', fontSize: '12px', fontWeight: '600', color: '#666' }}>
                    Parcelas
                  </th>
                  <th style={{ padding: '12px 16px', textAlign: 'right', fontSize: '12px', fontWeight: '600', color: '#666' }}>
                    Valor em Aberto
                  </th>
                  <th style={{ padding: '12px 16px', textAlign: 'center', fontSize: '12px', fontWeight: '600', color: '#666', width: '80px' }}>
                    Ações
                  </th>
                </tr>
              </thead>
              <tbody>
                {clientesFiltrados.map((cliente) => (
                  <tr
                    key={cliente.id}
                    onClick={() => handleClienteClick(cliente)}
                    style={{
                      borderBottom: '1px solid #f0f0f0',
                      cursor: 'pointer',
                      transition: 'background-color 0.2s'
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f9f9f9'}
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'white'}
                  >
                    <td style={{ padding: '16px', fontSize: '14px', color: '#333', fontWeight: '500' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div style={{
                          width: '36px',
                          height: '36px',
                          borderRadius: '50%',
                          backgroundColor: '#344848',
                          color: 'white',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '14px',
                          fontWeight: '600'
                        }}>
                          {cliente.nome.charAt(0).toUpperCase()}
                        </div>
                        {cliente.nome}
                      </div>
                    </td>
                    <td style={{ padding: '16px', fontSize: '14px', color: '#666' }}>
                      {cliente.telefone}
                    </td>
                    <td style={{ padding: '16px', fontSize: '13px', color: '#666', textAlign: 'center' }}>
                      <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
                        <div>
                          <span style={{ color: '#4CAF50', fontWeight: '600' }}>{cliente.parcelasPagas}</span>
                          <span style={{ color: '#999', fontSize: '11px' }}> pagas</span>
                        </div>
                        <div>
                          <span style={{ color: '#ff9800', fontWeight: '600' }}>{cliente.parcelasPendentes}</span>
                          <span style={{ color: '#999', fontSize: '11px' }}> pendentes</span>
                        </div>
                      </div>
                    </td>
                    <td style={{ padding: '16px', fontSize: '16px', fontWeight: '700', color: cliente.valorDevido > 0 ? '#f44336' : '#4CAF50', textAlign: 'right' }}>
                      R$ {formatCurrency(cliente.valorDevido)}
                    </td>
                    <td style={{ padding: '16px', textAlign: 'center' }}>
                      <button
                        onClick={(e) => handleExcluirCliente(cliente, e)}
                        style={{
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                          padding: '6px',
                          borderRadius: '4px',
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          transition: 'background-color 0.2s'
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#ffebee'}
                        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                        title="Excluir cliente"
                      >
                        <Icon icon="mdi:delete-outline" width="20" height="20" style={{ color: '#f44336' }} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal de Detalhes do Cliente */}
      {mostrarModal && clienteSelecionado && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          padding: '20px'
        }}>
          <div style={{
            backgroundColor: 'white',
            borderRadius: '12px',
            width: '100%',
            maxWidth: '800px',
            maxHeight: '90vh',
            overflow: 'auto',
            boxShadow: '0 4px 20px rgba(0,0,0,0.15)'
          }}>
            {/* Header do Modal */}
            <div style={{
              padding: '24px',
              borderBottom: '1px solid #e8e8e8',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              position: 'sticky',
              top: 0,
              backgroundColor: 'white',
              zIndex: 1
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{
                  width: '48px',
                  height: '48px',
                  borderRadius: '50%',
                  backgroundColor: '#344848',
                  color: 'white',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '18px',
                  fontWeight: '600'
                }}>
                  {clienteSelecionado.nome.charAt(0).toUpperCase()}
                </div>
                <div>
                  <h2 style={{ margin: 0, fontSize: '20px', fontWeight: '600', color: '#344848' }}>
                    {clienteSelecionado.nome}
                  </h2>
                  <p style={{ margin: '4px 0 0 0', fontSize: '14px', color: '#666' }}>
                    {clienteSelecionado.telefone}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setMostrarModal(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  padding: '8px',
                  borderRadius: '4px',
                  display: 'flex',
                  alignItems: 'center',
                  transition: 'background-color 0.2s'
                }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f5f5f5'}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
              >
                <Icon icon="mdi:close" width="24" height="24" style={{ color: '#666' }} />
              </button>
            </div>

            {/* Corpo do Modal */}
            <div style={{ padding: '24px' }}>
              {/* Seção de Edição */}
              <div style={{
                backgroundColor: '#f9f9f9',
                borderRadius: '8px',
                padding: '20px',
                marginBottom: '24px'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                  <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '600', color: '#344848' }}>
                    Informações do Cliente
                  </h3>
                  {!editando && (
                    <button
                      onClick={() => setEditando(true)}
                      style={{
                        padding: '6px 12px',
                        backgroundColor: '#344848',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        fontSize: '13px',
                        fontWeight: '500',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px'
                      }}
                    >
                      <Icon icon="mdi:pencil" width="16" height="16" />
                      Editar
                    </button>
                  )}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  <div>
                    <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', color: '#666', fontWeight: '500' }}>
                      Nome Completo
                    </label>
                    <input
                      type="text"
                      value={nomeEdit}
                      onChange={(e) => setNomeEdit(e.target.value)}
                      disabled={!editando}
                      style={{
                        width: '100%',
                        padding: '10px',
                        fontSize: '14px',
                        border: '1px solid #ddd',
                        borderRadius: '6px',
                        backgroundColor: editando ? 'white' : '#f5f5f5',
                        color: '#333',
                        boxSizing: 'border-box'
                      }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', color: '#666', fontWeight: '500' }}>
                      Telefone
                    </label>
                    <input
                      type="tel"
                      value={telefoneEdit}
                      onChange={(e) => setTelefoneEdit(e.target.value)}
                      disabled={!editando}
                      style={{
                        width: '100%',
                        padding: '10px',
                        fontSize: '14px',
                        border: '1px solid #ddd',
                        borderRadius: '6px',
                        backgroundColor: editando ? 'white' : '#f5f5f5',
                        color: '#333',
                        boxSizing: 'border-box'
                      }}
                    />
                  </div>
                </div>

                {editando && (
                  <div style={{ display: 'flex', gap: '10px', marginTop: '16px', justifyContent: 'flex-end' }}>
                    <button
                      onClick={() => {
                        setEditando(false)
                        setNomeEdit(clienteSelecionado.nome)
                        setTelefoneEdit(clienteSelecionado.telefone)
                      }}
                      style={{
                        padding: '8px 16px',
                        backgroundColor: 'white',
                        color: '#666',
                        border: '1px solid #ddd',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        fontSize: '14px',
                        fontWeight: '500'
                      }}
                    >
                      Cancelar
                    </button>
                    <button
                      onClick={handleSalvarEdicao}
                      style={{
                        padding: '8px 16px',
                        backgroundColor: '#4CAF50',
                        color: 'white',
                        border: 'none',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        fontSize: '14px',
                        fontWeight: '500'
                      }}
                    >
                      Salvar Alterações
                    </button>
                  </div>
                )}
              </div>

              {/* Resumo Financeiro */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: '16px',
                marginBottom: '24px'
              }}>
                <div style={{
                  backgroundColor: '#fff3e0',
                  border: '2px solid #ff9800',
                  borderRadius: '8px',
                  padding: '16px',
                  textAlign: 'center'
                }}>
                  <p style={{ margin: 0, fontSize: '12px', color: '#666' }}>Total de Parcelas</p>
                  <p style={{ margin: '8px 0 0 0', fontSize: '24px', fontWeight: '700', color: '#ff9800' }}>
                    {clienteSelecionado.totalParcelas}
                  </p>
                </div>
                <div style={{
                  backgroundColor: '#e8f5e9',
                  border: '2px solid #4CAF50',
                  borderRadius: '8px',
                  padding: '16px',
                  textAlign: 'center'
                }}>
                  <p style={{ margin: 0, fontSize: '12px', color: '#666' }}>Pagas</p>
                  <p style={{ margin: '8px 0 0 0', fontSize: '24px', fontWeight: '700', color: '#4CAF50' }}>
                    {clienteSelecionado.parcelasPagas}
                  </p>
                </div>
                <div style={{
                  backgroundColor: '#ffebee',
                  border: '2px solid #f44336',
                  borderRadius: '8px',
                  padding: '16px',
                  textAlign: 'center'
                }}>
                  <p style={{ margin: 0, fontSize: '12px', color: '#666' }}>Valor em Aberto</p>
                  <p style={{ margin: '8px 0 0 0', fontSize: '20px', fontWeight: '700', color: '#f44336' }}>
                    R$ {formatCurrency(clienteSelecionado.valorDevido)}
                  </p>
                </div>
              </div>

              {/* Lista de Parcelas */}
              <div>
                <h3 style={{ margin: '0 0 16px 0', fontSize: '16px', fontWeight: '600', color: '#344848' }}>
                  Histórico de Parcelas ({parcelasCliente.length})
                </h3>
                {parcelasCliente.length === 0 ? (
                  <p style={{ textAlign: 'center', color: '#999', padding: '20px' }}>
                    Nenhuma parcela encontrada
                  </p>
                ) : (
                  <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead style={{ position: 'sticky', top: 0, backgroundColor: 'white', zIndex: 1 }}>
                        <tr style={{ backgroundColor: '#f9f9f9', borderBottom: '2px solid #e0e0e0' }}>
                          <th style={{ padding: '10px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: '#666' }}>
                            Vencimento
                          </th>
                          <th style={{ padding: '10px', textAlign: 'right', fontSize: '12px', fontWeight: '600', color: '#666' }}>
                            Valor
                          </th>
                          <th style={{ padding: '10px', textAlign: 'center', fontSize: '12px', fontWeight: '600', color: '#666' }}>
                            Status
                          </th>
                          <th style={{ padding: '10px', textAlign: 'center', fontSize: '12px', fontWeight: '600', color: '#666' }}>
                            Pagou
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {parcelasCliente.map((parcela) => (
                          <tr key={parcela.id} style={{ borderBottom: '1px solid #f0f0f0' }}>
                            <td style={{ padding: '12px', fontSize: '14px', color: '#333' }}>
                              {formatDate(parcela.data_vencimento)}
                            </td>
                            <td style={{ padding: '12px', fontSize: '14px', fontWeight: '600', color: '#333', textAlign: 'right' }}>
                              R$ {formatCurrency(parseFloat(parcela.valor))}
                            </td>
                            <td style={{ padding: '12px', textAlign: 'center' }}>
                              {getStatusBadge(parcela)}
                            </td>
                            <td style={{ padding: '12px', textAlign: 'center' }}>
                              <label style={{ position: 'relative', display: 'inline-block', width: '44px', height: '22px' }}>
                                <input
                                  type="checkbox"
                                  checked={parcela.status === 'pago'}
                                  onChange={(e) => handleAlterarStatusParcela(parcela, e.target.checked)}
                                  style={{ opacity: 0, width: 0, height: 0 }}
                                />
                                <span style={{
                                  position: 'absolute',
                                  cursor: 'pointer',
                                  top: 0,
                                  left: 0,
                                  right: 0,
                                  bottom: 0,
                                  backgroundColor: parcela.status === 'pago' ? '#4CAF50' : '#ccc',
                                  transition: '0.3s',
                                  borderRadius: '22px'
                                }}>
                                  <span style={{
                                    position: 'absolute',
                                    content: '',
                                    height: '16px',
                                    width: '16px',
                                    left: parcela.status === 'pago' ? '25px' : '3px',
                                    bottom: '3px',
                                    backgroundColor: 'white',
                                    transition: '0.3s',
                                    borderRadius: '50%'
                                  }} />
                                </span>
                              </label>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
