import { useState, useEffect } from 'react'
import { supabase } from './supabaseClient'
import { Icon } from '@iconify/react'
import { showToast } from './Toast'
import ConfirmModal from './ConfirmModal'

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
  const [confirmDelete, setConfirmDelete] = useState({ show: false, cliente: null })
  const [mostrarModalNovoCliente, setMostrarModalNovoCliente] = useState(false)
  const [novoClienteNome, setNovoClienteNome] = useState('')
  const [novoClienteTelefone, setNovoClienteTelefone] = useState('')
  const [novoClienteCpf, setNovoClienteCpf] = useState('')
  const [criarAssinatura, setCriarAssinatura] = useState(false)
  const [dataInicioAssinatura, setDataInicioAssinatura] = useState('')
  const [planoSelecionado, setPlanoSelecionado] = useState('')
  const [planos, setPlanos] = useState([])

  useEffect(() => {
    carregarClientes()
    carregarPlanos()
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

  const carregarPlanos = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()

      const { data, error } = await supabase
        .from('planos')
        .select('*')
        .eq('user_id', user.id)
        .eq('ativo', true)
        .order('nome', { ascending: true })

      if (error) throw error

      setPlanos(data || [])
    } catch (error) {
      console.error('Erro ao carregar planos:', error)
    }
  }

  const carregarClientes = async () => {
    setLoading(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()

      // Buscar clientes
      const { data: clientesData, error: clientesError } = await supabase
        .from('devedores')
        .select('id, nome, telefone, cpf, assinatura_ativa, plano_id, created_at')
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
      showToast('Preencha nome e telefone', 'warning')
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

      showToast('Cliente atualizado com sucesso!', 'success')
      setEditando(false)
      setMostrarModal(false)
      carregarClientes()
    } catch (error) {
      showToast('Erro ao atualizar cliente: ' + error.message, 'error')
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

      showToast(novoPago ? 'Pagamento confirmado!' : 'Pagamento desfeito!', 'success')

      // Atualizar parcelas do cliente no modal
      await carregarParcelasCliente(clienteSelecionado.id)

      // Recarregar lista de clientes para atualizar valores
      carregarClientes()
    } catch (error) {
      showToast('Erro ao atualizar: ' + error.message, 'error')
    }
  }

  const handleExcluirCliente = (cliente, event) => {
    event.stopPropagation()
    setConfirmDelete({ show: true, cliente })
  }

  const confirmarExclusao = async () => {
    const cliente = confirmDelete.cliente
    if (!cliente) return

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

      showToast('Cliente excluído com sucesso!', 'success')
      carregarClientes()
    } catch (error) {
      showToast('Erro ao excluir cliente: ' + error.message, 'error')
    }
  }

  const handleAlterarAssinatura = async (clienteId, novoStatus) => {
    const confirmar = window.confirm(
      novoStatus
        ? 'Deseja reativar a assinatura deste cliente?'
        : 'Deseja cancelar/pausar a assinatura deste cliente?'
    )

    if (!confirmar) return

    try {
      const { error } = await supabase
        .from('devedores')
        .update({ assinatura_ativa: novoStatus })
        .eq('id', clienteId)

      if (error) throw error

      showToast(
        novoStatus ? 'Assinatura reativada!' : 'Assinatura cancelada!',
        'success'
      )

      // Atualizar cliente selecionado
      setClienteSelecionado(prev => ({ ...prev, assinatura_ativa: novoStatus }))

      // Recarregar lista de clientes
      carregarClientes()
    } catch (error) {
      showToast('Erro ao alterar assinatura: ' + error.message, 'error')
    }
  }

  const handleCriarCliente = async () => {
    if (!novoClienteNome.trim() || !novoClienteTelefone.trim()) {
      showToast('Preencha nome e telefone', 'warning')
      return
    }

    if (criarAssinatura && (!dataInicioAssinatura || !planoSelecionado)) {
      showToast('Preencha a data de início e selecione um plano', 'warning')
      return
    }

    try {
      const { data: { user } } = await supabase.auth.getUser()

      // Criar cliente
      const { data: clienteData, error: clienteError } = await supabase
        .from('devedores')
        .insert({
          user_id: user.id,
          nome: novoClienteNome.trim(),
          telefone: novoClienteTelefone.trim(),
          cpf: novoClienteCpf.trim() || null,
          valor_devido: 0,
          data_vencimento: new Date().toISOString().split('T')[0],
          status: 'pendente',
          assinatura_ativa: criarAssinatura,
          plano_id: criarAssinatura ? planoSelecionado : null
        })
        .select()

      if (clienteError) throw clienteError

      // Se criar assinatura, criar primeira mensalidade
      if (criarAssinatura && clienteData && clienteData.length > 0) {
        const plano = planos.find(p => p.id === planoSelecionado)
        if (!plano) {
          showToast('Plano não encontrado', 'error')
          return
        }

        // Calcular data de vencimento (data_inicio + 30 dias)
        const dataInicio = new Date(dataInicioAssinatura + 'T00:00:00')
        const dataVencimento = new Date(dataInicio)
        dataVencimento.setDate(dataVencimento.getDate() + 30)

        const { error: parcelaError } = await supabase
          .from('parcelas')
          .insert({
            user_id: user.id,
            devedor_id: clienteData[0].id,
            valor: plano.valor,
            data_vencimento: dataVencimento.toISOString().split('T')[0],
            status: 'pendente',
            is_mensalidade: true
          })

        if (parcelaError) throw parcelaError
      }

      showToast('Cliente criado com sucesso!', 'success')
      setMostrarModalNovoCliente(false)
      setNovoClienteNome('')
      setNovoClienteTelefone('')
      setNovoClienteCpf('')
      setCriarAssinatura(false)
      setDataInicioAssinatura('')
      setPlanoSelecionado('')
      carregarClientes()
    } catch (error) {
      showToast('Erro ao criar cliente: ' + error.message, 'error')
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
          <button
            onClick={() => setMostrarModalNovoCliente(true)}
            style={{
              padding: '10px 20px',
              backgroundColor: '#333',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              fontSize: '14px',
              fontWeight: '500',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              transition: 'background-color 0.2s'
            }}
            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#222'}
            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#333'}
          >
            <Icon icon="mdi:plus" width="18" height="18" />
            Adicionar
          </button>
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
                  <div>
                    <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', color: '#666', fontWeight: '500' }}>
                      CPF
                    </label>
                    <input
                      type="text"
                      value={clienteSelecionado.cpf || 'Não informado'}
                      disabled
                      style={{
                        width: '100%',
                        padding: '10px',
                        fontSize: '14px',
                        border: '1px solid #ddd',
                        borderRadius: '6px',
                        backgroundColor: '#f5f5f5',
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

              {/* Seção de Assinatura */}
              {(clienteSelecionado.assinatura_ativa || clienteSelecionado.plano_id) && (
                <div style={{
                  backgroundColor: '#e8f4f8',
                  borderRadius: '8px',
                  padding: '20px',
                  marginBottom: '24px',
                  border: '2px solid #2196F3'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                    <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '600', color: '#344848', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <Icon icon="mdi:card-account-details" width="20" height="20" style={{ color: '#2196F3' }} />
                      Assinatura
                    </h3>
                    <span style={{
                      padding: '4px 12px',
                      borderRadius: '12px',
                      fontSize: '12px',
                      fontWeight: '600',
                      backgroundColor: clienteSelecionado.assinatura_ativa ? '#4CAF50' : '#f44336',
                      color: 'white'
                    }}>
                      {clienteSelecionado.assinatura_ativa ? 'ATIVA' : 'CANCELADA'}
                    </span>
                  </div>

                  <div style={{ marginBottom: '16px' }}>
                    <p style={{ margin: '0 0 8px 0', fontSize: '13px', color: '#666', fontWeight: '500' }}>
                      Plano Atual
                    </p>
                    <p style={{ margin: 0, fontSize: '16px', fontWeight: '600', color: '#333' }}>
                      {planos.find(p => p.id === clienteSelecionado.plano_id)?.nome || 'Não identificado'}
                    </p>
                    <p style={{ margin: '4px 0 0 0', fontSize: '14px', color: '#2196F3', fontWeight: '600' }}>
                      R$ {formatCurrency(parseFloat(planos.find(p => p.id === clienteSelecionado.plano_id)?.valor || 0))}/mês
                    </p>
                  </div>

                  <button
                    onClick={() => handleAlterarAssinatura(clienteSelecionado.id, !clienteSelecionado.assinatura_ativa)}
                    style={{
                      padding: '8px 16px',
                      backgroundColor: clienteSelecionado.assinatura_ativa ? '#f44336' : '#4CAF50',
                      color: 'white',
                      border: 'none',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      fontSize: '14px',
                      fontWeight: '500',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px'
                    }}
                  >
                    <Icon icon={clienteSelecionado.assinatura_ativa ? "mdi:pause-circle" : "mdi:play-circle"} width="18" height="18" />
                    {clienteSelecionado.assinatura_ativa ? 'Cancelar Assinatura' : 'Reativar Assinatura'}
                  </button>
                </div>
              )}

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

      {/* Modal de confirmação de exclusão */}
      <ConfirmModal
        isOpen={confirmDelete.show}
        onClose={() => setConfirmDelete({ show: false, cliente: null })}
        onConfirm={confirmarExclusao}
        title={`Tem certeza que deseja excluir o cliente "${confirmDelete.cliente?.nome}"?`}
        message={`ATENÇÃO: Todas as ${confirmDelete.cliente?.totalParcelas || 0} parcela(s) associadas também serão excluídas!`}
        confirmText="OK"
        cancelText="Cancelar"
        type="danger"
      />

      {/* Modal de novo cliente */}
      {mostrarModalNovoCliente && (
        <div
          onClick={() => setMostrarModalNovoCliente(false)}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            zIndex: 10000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              backgroundColor: 'white',
              borderRadius: '12px',
              padding: '28px',
              maxWidth: '500px',
              width: '90%',
              boxShadow: '0 8px 32px rgba(0,0,0,0.2)'
            }}
          >
            <h3 style={{
              margin: '0 0 24px 0',
              fontSize: '20px',
              fontWeight: '600',
              color: '#1a1a1a'
            }}>
              Adicionar Novo Cliente
            </h3>

            {/* Nome */}
            <div style={{ marginBottom: '20px' }}>
              <label style={{
                display: 'block',
                marginBottom: '8px',
                fontSize: '14px',
                fontWeight: '500',
                color: '#333'
              }}>
                Nome *
              </label>
              <input
                type="text"
                value={novoClienteNome}
                onChange={(e) => setNovoClienteNome(e.target.value)}
                placeholder="Digite o nome do cliente"
                style={{
                  width: '100%',
                  padding: '12px',
                  border: '1px solid #e0e0e0',
                  borderRadius: '6px',
                  fontSize: '14px',
                  outline: 'none',
                  transition: 'border-color 0.2s'
                }}
                onFocus={(e) => e.target.style.borderColor = '#333'}
                onBlur={(e) => e.target.style.borderColor = '#e0e0e0'}
              />
            </div>

            {/* Telefone */}
            <div style={{ marginBottom: '20px' }}>
              <label style={{
                display: 'block',
                marginBottom: '8px',
                fontSize: '14px',
                fontWeight: '500',
                color: '#333'
              }}>
                Telefone *
              </label>
              <input
                type="text"
                value={novoClienteTelefone}
                onChange={(e) => setNovoClienteTelefone(e.target.value)}
                placeholder="(00) 00000-0000"
                style={{
                  width: '100%',
                  padding: '12px',
                  border: '1px solid #e0e0e0',
                  borderRadius: '6px',
                  fontSize: '14px',
                  outline: 'none',
                  transition: 'border-color 0.2s'
                }}
                onFocus={(e) => e.target.style.borderColor = '#333'}
                onBlur={(e) => e.target.style.borderColor = '#e0e0e0'}
              />
            </div>

            {/* CPF */}
            <div style={{ marginBottom: '20px' }}>
              <label style={{
                display: 'block',
                marginBottom: '8px',
                fontSize: '14px',
                fontWeight: '500',
                color: '#333'
              }}>
                CPF (opcional)
              </label>
              <input
                type="text"
                value={novoClienteCpf}
                onChange={(e) => setNovoClienteCpf(e.target.value)}
                placeholder="000.000.000-00"
                style={{
                  width: '100%',
                  padding: '12px',
                  border: '1px solid #e0e0e0',
                  borderRadius: '6px',
                  fontSize: '14px',
                  outline: 'none',
                  transition: 'border-color 0.2s'
                }}
                onFocus={(e) => e.target.style.borderColor = '#333'}
                onBlur={(e) => e.target.style.borderColor = '#e0e0e0'}
              />
            </div>

            {/* Toggle para criar assinatura */}
            <div style={{
              marginBottom: criarAssinatura ? '20px' : '28px',
              padding: '16px',
              backgroundColor: '#f9f9f9',
              borderRadius: '8px',
              border: '1px solid #e0e0e0'
            }}>
              <label style={{
                display: 'flex',
                alignItems: 'center',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: '500',
                color: '#333'
              }}>
                <input
                  type="checkbox"
                  checked={criarAssinatura}
                  onChange={(e) => setCriarAssinatura(e.target.checked)}
                  style={{
                    width: '18px',
                    height: '18px',
                    marginRight: '10px',
                    cursor: 'pointer'
                  }}
                />
                Criar assinatura para este cliente
              </label>
            </div>

            {/* Campos de assinatura (mostrar apenas se toggle ativo) */}
            {criarAssinatura && (
              <div style={{
                padding: '16px',
                backgroundColor: '#e8f4f8',
                borderRadius: '8px',
                marginBottom: '28px',
                border: '2px solid #2196F3'
              }}>
                <h4 style={{
                  margin: '0 0 16px 0',
                  fontSize: '14px',
                  fontWeight: '600',
                  color: '#2196F3',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}>
                  <Icon icon="mdi:card-account-details" width="18" height="18" />
                  Detalhes da Assinatura
                </h4>

                {/* Data de início */}
                <div style={{ marginBottom: '16px' }}>
                  <label style={{
                    display: 'block',
                    marginBottom: '8px',
                    fontSize: '13px',
                    fontWeight: '500',
                    color: '#333'
                  }}>
                    Data de Início *
                  </label>
                  <input
                    type="date"
                    value={dataInicioAssinatura}
                    onChange={(e) => setDataInicioAssinatura(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '12px',
                      border: '1px solid #ddd',
                      borderRadius: '6px',
                      fontSize: '14px',
                      outline: 'none',
                      transition: 'border-color 0.2s'
                    }}
                    onFocus={(e) => e.target.style.borderColor = '#2196F3'}
                    onBlur={(e) => e.target.style.borderColor = '#ddd'}
                  />
                </div>

                {/* Seleção de plano */}
                <div>
                  <label style={{
                    display: 'block',
                    marginBottom: '8px',
                    fontSize: '13px',
                    fontWeight: '500',
                    color: '#333'
                  }}>
                    Selecione o Plano *
                  </label>
                  <select
                    value={planoSelecionado}
                    onChange={(e) => setPlanoSelecionado(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '12px',
                      border: '1px solid #ddd',
                      borderRadius: '6px',
                      fontSize: '14px',
                      outline: 'none',
                      transition: 'border-color 0.2s',
                      cursor: 'pointer',
                      backgroundColor: 'white'
                    }}
                    onFocus={(e) => e.target.style.borderColor = '#2196F3'}
                    onBlur={(e) => e.target.style.borderColor = '#ddd'}
                  >
                    <option value="">Selecione um plano</option>
                    {planos.map(plano => (
                      <option key={plano.id} value={plano.id}>
                        {plano.nome} - R$ {formatCurrency(parseFloat(plano.valor))}/mês
                      </option>
                    ))}
                  </select>
                  {planos.length === 0 && (
                    <p style={{
                      margin: '8px 0 0 0',
                      fontSize: '12px',
                      color: '#f44336'
                    }}>
                      Nenhum plano ativo encontrado. Crie um plano primeiro.
                    </p>
                  )}
                </div>

                <div style={{
                  marginTop: '12px',
                  padding: '12px',
                  backgroundColor: 'white',
                  borderRadius: '6px',
                  fontSize: '12px',
                  color: '#666'
                }}>
                  <Icon icon="mdi:information" width="16" height="16" style={{ verticalAlign: 'middle', marginRight: '6px', color: '#2196F3' }} />
                  A primeira mensalidade será criada com vencimento em 30 dias após a data de início.
                </div>
              </div>
            )}

            {/* Botões */}
            <div style={{
              display: 'flex',
              gap: '12px',
              justifyContent: 'flex-end'
            }}>
              <button
                onClick={() => {
                  setMostrarModalNovoCliente(false)
                  setNovoClienteNome('')
                  setNovoClienteTelefone('')
                  setNovoClienteCpf('')
                  setCriarAssinatura(false)
                  setDataInicioAssinatura('')
                  setPlanoSelecionado('')
                }}
                style={{
                  padding: '10px 20px',
                  borderRadius: '6px',
                  border: '1px solid #e0e0e0',
                  backgroundColor: 'white',
                  color: '#666',
                  fontSize: '14px',
                  fontWeight: '500',
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = '#f5f5f5'
                  e.currentTarget.style.borderColor = '#ccc'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'white'
                  e.currentTarget.style.borderColor = '#e0e0e0'
                }}
              >
                Cancelar
              </button>

              <button
                onClick={handleCriarCliente}
                style={{
                  padding: '10px 24px',
                  borderRadius: '6px',
                  border: 'none',
                  backgroundColor: '#333',
                  color: 'white',
                  fontSize: '14px',
                  fontWeight: '500',
                  cursor: 'pointer',
                  transition: 'background-color 0.2s'
                }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#222'}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#333'}
              >
                Criar Cliente
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
