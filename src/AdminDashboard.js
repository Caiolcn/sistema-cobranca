import { useState, useEffect } from 'react'
import { supabase } from './supabaseClient'
import { Icon } from '@iconify/react'

export default function AdminDashboard() {
  const [clientes, setClientes] = useState([])
  const [stats, setStats] = useState({
    total: 0,
    conectados: 0,
    desconectados: 0,
    totalMensagensEnviadas: 0,
    mensagensMesAtual: 0
  })
  const [filtro, setFiltro] = useState('todos') // todos, conectados, desconectados
  const [loading, setLoading] = useState(true)
  const [buscaTexto, setBuscaTexto] = useState('')

  useEffect(() => {
    carregarDados()

    // Atualizar a cada 30 segundos
    const interval = setInterval(carregarDados, 30000)
    return () => clearInterval(interval)
  }, [])

  const carregarDados = async () => {
    setLoading(true)
    try {
      // Buscar todos os clientes
      const { data: clientesData, error: clientesError } = await supabase
        .from('mensallizap')
        .select('*')
        .order('ultima_conexao', { ascending: false, nullsFirst: false })

      if (clientesError) throw clientesError

      setClientes(clientesData || [])

      // Calcular estatísticas
      const total = clientesData.length
      const conectados = clientesData.filter(c => c.conectado).length
      const desconectados = total - conectados
      const totalMensagensEnviadas = clientesData.reduce((sum, c) => sum + (c.total_mensagens_enviadas || 0), 0)
      const mensagensMesAtual = clientesData.reduce((sum, c) => sum + (c.mensagens_mes_atual || 0), 0)

      setStats({
        total,
        conectados,
        desconectados,
        totalMensagensEnviadas,
        mensagensMesAtual
      })
    } catch (error) {
      console.error('Erro ao carregar dados:', error)
    } finally {
      setLoading(false)
    }
  }

  const formatarData = (dataISO) => {
    if (!dataISO) return '-'
    const data = new Date(dataISO)
    return data.toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'America/Sao_Paulo'
    })
  }

  const formatarTelefone = (telefone) => {
    if (!telefone) return '-'
    // Remove o código do país se tiver
    let numero = telefone.replace(/\D/g, '')
    if (numero.startsWith('55')) numero = numero.substring(2)

    if (numero.length === 11) {
      return `(${numero.substring(0, 2)}) ${numero.substring(2, 7)}-${numero.substring(7)}`
    }
    return telefone
  }

  const clientesFiltrados = clientes
    .filter(cliente => {
      if (filtro === 'conectados') return cliente.conectado
      if (filtro === 'desconectados') return !cliente.conectado
      return true
    })
    .filter(cliente => {
      if (!buscaTexto) return true
      const busca = buscaTexto.toLowerCase()
      return (
        cliente.nome_completo?.toLowerCase().includes(busca) ||
        cliente.email?.toLowerCase().includes(busca) ||
        cliente.telefone?.includes(busca) ||
        cliente.whatsapp_numero?.includes(busca)
      )
    })

  return (
    <div style={{ padding: '24px', maxWidth: '1400px', margin: '0 auto' }}>
      {/* Cabeçalho */}
      <div style={{ marginBottom: '32px' }}>
        <h1 style={{ fontSize: '28px', fontWeight: 'bold', color: '#333', marginBottom: '8px' }}>
          MensalliZap - Dashboard Admin
        </h1>
        <p style={{ color: '#666', fontSize: '14px' }}>
          Gerencie todos os clientes conectados no sistema
        </p>
      </div>

      {/* Cards de Estatísticas */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: '16px',
        marginBottom: '32px'
      }}>
        {/* Total de Clientes */}
        <div style={{
          backgroundColor: 'white',
          padding: '20px',
          borderRadius: '12px',
          border: '1px solid #e0e0e0',
          boxShadow: '0 2px 8px rgba(0,0,0,0.05)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
            <Icon icon="mdi:account-group" width="24" style={{ color: '#667eea' }} />
            <span style={{ fontSize: '14px', color: '#666', fontWeight: '500' }}>Total de Clientes</span>
          </div>
          <div style={{ fontSize: '32px', fontWeight: 'bold', color: '#333' }}>
            {stats.total}
          </div>
        </div>

        {/* Conectados */}
        <div style={{
          backgroundColor: 'white',
          padding: '20px',
          borderRadius: '12px',
          border: '1px solid #e0e0e0',
          boxShadow: '0 2px 8px rgba(0,0,0,0.05)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
            <Icon icon="mdi:check-circle" width="24" style={{ color: '#4caf50' }} />
            <span style={{ fontSize: '14px', color: '#666', fontWeight: '500' }}>Conectados</span>
          </div>
          <div style={{ fontSize: '32px', fontWeight: 'bold', color: '#4caf50' }}>
            {stats.conectados}
          </div>
        </div>

        {/* Desconectados */}
        <div style={{
          backgroundColor: 'white',
          padding: '20px',
          borderRadius: '12px',
          border: '1px solid #e0e0e0',
          boxShadow: '0 2px 8px rgba(0,0,0,0.05)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
            <Icon icon="mdi:close-circle" width="24" style={{ color: '#f44336' }} />
            <span style={{ fontSize: '14px', color: '#666', fontWeight: '500' }}>Desconectados</span>
          </div>
          <div style={{ fontSize: '32px', fontWeight: 'bold', color: '#f44336' }}>
            {stats.desconectados}
          </div>
        </div>

        {/* Mensagens Mês Atual */}
        <div style={{
          backgroundColor: 'white',
          padding: '20px',
          borderRadius: '12px',
          border: '1px solid #e0e0e0',
          boxShadow: '0 2px 8px rgba(0,0,0,0.05)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
            <Icon icon="mdi:message-text" width="24" style={{ color: '#2196f3' }} />
            <span style={{ fontSize: '14px', color: '#666', fontWeight: '500' }}>Mensagens (Mês)</span>
          </div>
          <div style={{ fontSize: '32px', fontWeight: 'bold', color: '#333' }}>
            {stats.mensagensMesAtual.toLocaleString('pt-BR')}
          </div>
        </div>

        {/* Total de Mensagens */}
        <div style={{
          backgroundColor: 'white',
          padding: '20px',
          borderRadius: '12px',
          border: '1px solid #e0e0e0',
          boxShadow: '0 2px 8px rgba(0,0,0,0.05)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
            <Icon icon="mdi:chart-line" width="24" style={{ color: '#ff9800' }} />
            <span style={{ fontSize: '14px', color: '#666', fontWeight: '500' }}>Total de Mensagens</span>
          </div>
          <div style={{ fontSize: '32px', fontWeight: 'bold', color: '#333' }}>
            {stats.totalMensagensEnviadas.toLocaleString('pt-BR')}
          </div>
        </div>
      </div>

      {/* Filtros e Busca */}
      <div style={{
        backgroundColor: 'white',
        padding: '20px',
        borderRadius: '12px',
        border: '1px solid #e0e0e0',
        marginBottom: '24px',
        display: 'flex',
        gap: '16px',
        alignItems: 'center',
        flexWrap: 'wrap'
      }}>
        {/* Botões de Filtro */}
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={() => setFiltro('todos')}
            style={{
              padding: '8px 16px',
              borderRadius: '6px',
              border: filtro === 'todos' ? '2px solid #667eea' : '1px solid #ddd',
              backgroundColor: filtro === 'todos' ? '#f0f4ff' : 'white',
              color: filtro === 'todos' ? '#667eea' : '#666',
              fontWeight: filtro === 'todos' ? '600' : '400',
              cursor: 'pointer',
              fontSize: '14px'
            }}
          >
            Todos ({stats.total})
          </button>
          <button
            onClick={() => setFiltro('conectados')}
            style={{
              padding: '8px 16px',
              borderRadius: '6px',
              border: filtro === 'conectados' ? '2px solid #4caf50' : '1px solid #ddd',
              backgroundColor: filtro === 'conectados' ? '#e8f5e9' : 'white',
              color: filtro === 'conectados' ? '#4caf50' : '#666',
              fontWeight: filtro === 'conectados' ? '600' : '400',
              cursor: 'pointer',
              fontSize: '14px'
            }}
          >
            Conectados ({stats.conectados})
          </button>
          <button
            onClick={() => setFiltro('desconectados')}
            style={{
              padding: '8px 16px',
              borderRadius: '6px',
              border: filtro === 'desconectados' ? '2px solid #f44336' : '1px solid #ddd',
              backgroundColor: filtro === 'desconectados' ? '#ffebee' : 'white',
              color: filtro === 'desconectados' ? '#f44336' : '#666',
              fontWeight: filtro === 'desconectados' ? '600' : '400',
              cursor: 'pointer',
              fontSize: '14px'
            }}
          >
            Desconectados ({stats.desconectados})
          </button>
        </div>

        {/* Campo de Busca */}
        <div style={{ flex: 1, minWidth: '250px' }}>
          <input
            type="text"
            placeholder="Buscar por nome, email ou telefone..."
            value={buscaTexto}
            onChange={(e) => setBuscaTexto(e.target.value)}
            style={{
              width: '100%',
              padding: '10px 16px',
              border: '1px solid #ddd',
              borderRadius: '6px',
              fontSize: '14px',
              boxSizing: 'border-box'
            }}
          />
        </div>

        {/* Botão Atualizar */}
        <button
          onClick={carregarDados}
          disabled={loading}
          style={{
            padding: '10px 20px',
            borderRadius: '6px',
            border: 'none',
            backgroundColor: '#667eea',
            color: 'white',
            fontWeight: '500',
            cursor: loading ? 'not-allowed' : 'pointer',
            fontSize: '14px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            opacity: loading ? 0.6 : 1
          }}
        >
          <Icon icon="mdi:refresh" width="18" />
          {loading ? 'Atualizando...' : 'Atualizar'}
        </button>
      </div>

      {/* Tabela de Clientes */}
      <div style={{
        backgroundColor: 'white',
        borderRadius: '12px',
        border: '1px solid #e0e0e0',
        overflow: 'hidden'
      }}>
        {loading && clientes.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', color: '#666' }}>
            Carregando dados...
          </div>
        ) : clientesFiltrados.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', color: '#666' }}>
            Nenhum cliente encontrado
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ backgroundColor: '#f8f9fa', borderBottom: '2px solid #e0e0e0' }}>
                  <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '13px', fontWeight: '600', color: '#666' }}>
                    Status
                  </th>
                  <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '13px', fontWeight: '600', color: '#666' }}>
                    Nome
                  </th>
                  <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '13px', fontWeight: '600', color: '#666' }}>
                    Email
                  </th>
                  <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '13px', fontWeight: '600', color: '#666' }}>
                    Telefone
                  </th>
                  <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '13px', fontWeight: '600', color: '#666' }}>
                    WhatsApp
                  </th>
                  <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '13px', fontWeight: '600', color: '#666' }}>
                    Plano
                  </th>
                  <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '13px', fontWeight: '600', color: '#666' }}>
                    Mensagens (Mês)
                  </th>
                  <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '13px', fontWeight: '600', color: '#666' }}>
                    Última Conexão
                  </th>
                </tr>
              </thead>
              <tbody>
                {clientesFiltrados.map((cliente) => (
                  <tr
                    key={cliente.id}
                    style={{
                      borderBottom: '1px solid #f0f0f0',
                      transition: 'background-color 0.2s'
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f8f9fa'}
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'white'}
                  >
                    <td style={{ padding: '12px 16px' }}>
                      {cliente.conectado ? (
                        <div style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px',
                          padding: '4px 12px',
                          backgroundColor: '#e8f5e9',
                          borderRadius: '12px',
                          fontSize: '12px',
                          fontWeight: '500',
                          color: '#4caf50'
                        }}>
                          <div style={{
                            width: '8px',
                            height: '8px',
                            borderRadius: '50%',
                            backgroundColor: '#4caf50'
                          }} />
                          Conectado
                        </div>
                      ) : (
                        <div style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px',
                          padding: '4px 12px',
                          backgroundColor: '#ffebee',
                          borderRadius: '12px',
                          fontSize: '12px',
                          fontWeight: '500',
                          color: '#f44336'
                        }}>
                          <div style={{
                            width: '8px',
                            height: '8px',
                            borderRadius: '50%',
                            backgroundColor: '#f44336'
                          }} />
                          Desconectado
                        </div>
                      )}
                    </td>
                    <td style={{ padding: '12px 16px', fontSize: '14px', color: '#333', fontWeight: '500' }}>
                      {cliente.nome_completo || '-'}
                    </td>
                    <td style={{ padding: '12px 16px', fontSize: '13px', color: '#666' }}>
                      {cliente.email || '-'}
                    </td>
                    <td style={{ padding: '12px 16px', fontSize: '13px', color: '#666' }}>
                      {formatarTelefone(cliente.telefone)}
                    </td>
                    <td style={{ padding: '12px 16px', fontSize: '13px', color: '#666' }}>
                      {formatarTelefone(cliente.whatsapp_numero)}
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <span style={{
                        padding: '4px 10px',
                        backgroundColor: cliente.plano === 'enterprise' ? '#e3f2fd' : cliente.plano === 'premium' ? '#f3e5f5' : '#fff3e0',
                        color: cliente.plano === 'enterprise' ? '#1976d2' : cliente.plano === 'premium' ? '#7b1fa2' : '#f57c00',
                        borderRadius: '6px',
                        fontSize: '12px',
                        fontWeight: '500',
                        textTransform: 'capitalize'
                      }}>
                        {cliente.plano || 'básico'}
                      </span>
                    </td>
                    <td style={{ padding: '12px 16px', fontSize: '14px', color: '#333', fontWeight: '500' }}>
                      {cliente.mensagens_mes_atual || 0}
                    </td>
                    <td style={{ padding: '12px 16px', fontSize: '13px', color: '#666' }}>
                      {formatarData(cliente.ultima_conexao)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Rodapé com info */}
      <div style={{ marginTop: '16px', textAlign: 'center', fontSize: '12px', color: '#999' }}>
        Atualização automática a cada 30 segundos • {clientesFiltrados.length} cliente{clientesFiltrados.length !== 1 ? 's' : ''} exibido{clientesFiltrados.length !== 1 ? 's' : ''}
      </div>
    </div>
  )
}
