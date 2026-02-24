import { useState, useEffect, useCallback } from 'react'
import { supabase } from './supabaseClient'
import { Icon } from '@iconify/react'

export default function AdminDashboard() {
  const [clientes, setClientes] = useState([])
  const [stats, setStats] = useState({
    total: 0,
    conectados: 0,
    desconectados: 0,
    totalMensagensEnviadas: 0,
    mensagensMesAtual: 0,
    totalPendentes: 0
  })
  const [filtro, setFiltro] = useState('todos') // todos, conectados, desconectados, pendentes
  const [loading, setLoading] = useState(true)
  const [buscaTexto, setBuscaTexto] = useState('')
  const [restartingCliente, setRestartingCliente] = useState(null)

  const carregarDados = useCallback(async () => {
    setLoading(true)
    try {
      // Buscar clientes e pendentes em paralelo
      const [clientesResult, pendentesResult] = await Promise.all([
        supabase
          .from('mensallizap')
          .select('id, user_id, conectado, ultima_conexao, total_mensagens_enviadas, mensagens_mes_atual, nome_empresa, nome_completo, email, telefone, whatsapp_numero, plano, instance_name')
          .order('ultima_conexao', { ascending: false, nullsFirst: false }),
        supabase
          .rpc('admin_mensagens_pendentes')
      ])

      if (clientesResult.error) throw clientesResult.error

      const clientesData = clientesResult.data || []

      // Mapear pendentes por user_id
      const pendentesMap = {}
      if (pendentesResult.data) {
        pendentesResult.data.forEach(p => {
          pendentesMap[p.user_id] = {
            pendentes: Number(p.total_pendentes) || 0,
            falhas: Number(p.total_falhas_recentes) || 0
          }
        })
      }

      // Enriquecer clientes com dados de pendentes
      const clientesEnriquecidos = clientesData.map(c => ({
        ...c,
        msgs_pendentes: pendentesMap[c.user_id]?.pendentes || 0,
        msgs_falhas: pendentesMap[c.user_id]?.falhas || 0
      }))

      setClientes(clientesEnriquecidos)

      // Calcular estatísticas
      const total = clientesData.length
      const conectados = clientesData.filter(c => c.conectado).length
      const desconectados = total - conectados
      const totalMensagensEnviadas = clientesData.reduce((sum, c) => sum + (c.total_mensagens_enviadas || 0), 0)
      const mensagensMesAtual = clientesData.reduce((sum, c) => sum + (c.mensagens_mes_atual || 0), 0)
      const totalPendentes = clientesEnriquecidos.reduce((sum, c) => sum + c.msgs_pendentes, 0)

      setStats({
        total,
        conectados,
        desconectados,
        totalMensagensEnviadas,
        mensagensMesAtual,
        totalPendentes
      })
    } catch (error) {
      console.error('Erro ao carregar dados:', error)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    carregarDados()

    let interval = null

    const startPolling = () => {
      if (!interval) {
        interval = setInterval(carregarDados, 120000)
      }
    }

    const stopPolling = () => {
      if (interval) {
        clearInterval(interval)
        interval = null
      }
    }

    const handleVisibilityChange = () => {
      if (document.hidden) {
        stopPolling()
      } else {
        carregarDados()
        startPolling()
      }
    }

    if (!document.hidden) {
      startPolling()
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      stopPolling()
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [carregarDados])

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

  const restartInstancia = async (cliente) => {
    const instanceName = cliente.instance_name || `instance_${cliente.user_id.substring(0, 8)}`
    setRestartingCliente(cliente.user_id)

    try {
      // Buscar API key e URL
      const { data: configs } = await supabase
        .from('config')
        .select('chave, valor')
        .in('chave', ['evolution_api_key', 'evolution_api_url'])

      const configMap = {}
      configs?.forEach(item => { configMap[item.chave] = item.valor })

      const apiKey = configMap.evolution_api_key
      const apiUrl = configMap.evolution_api_url || 'https://service-evolution-api.tnvro1.easypanel.host'

      if (!apiKey) {
        alert('API key da Evolution não encontrada')
        return
      }

      // Chamar restart
      const response = await fetch(`${apiUrl}/instance/restart/${instanceName}`, {
        method: 'PUT',
        headers: { 'apikey': apiKey }
      })

      if (!response.ok) {
        alert(`Erro ao reiniciar instância: ${response.status}`)
        return
      }

      // Aguardar e verificar
      await new Promise(resolve => setTimeout(resolve, 5000))

      const statusResponse = await fetch(`${apiUrl}/instance/connectionState/${instanceName}`, {
        method: 'GET',
        headers: { 'apikey': apiKey }
      })

      if (statusResponse.ok) {
        const data = await statusResponse.json()
        const state = data.instance?.state || 'close'

        if (state === 'open') {
          alert(`Instância ${instanceName} reconectada com sucesso!`)
        } else {
          alert(`Restart executado mas status: ${state}. O cliente pode precisar reconectar manualmente.`)
        }
      }

      // Recarregar dados
      carregarDados()
    } catch (error) {
      console.error('Erro ao reiniciar instância:', error)
      alert(`Erro: ${error.message}`)
    } finally {
      setRestartingCliente(null)
    }
  }

  const clientesFiltrados = clientes
    .filter(cliente => {
      if (filtro === 'conectados') return cliente.conectado
      if (filtro === 'desconectados') return !cliente.conectado
      if (filtro === 'pendentes') return cliente.msgs_pendentes > 0
      return true
    })
    .filter(cliente => {
      if (!buscaTexto) return true
      const busca = buscaTexto.toLowerCase()
      return (
        cliente.nome_completo?.toLowerCase().includes(busca) ||
        cliente.nome_empresa?.toLowerCase().includes(busca) ||
        cliente.email?.toLowerCase().includes(busca) ||
        cliente.telefone?.includes(busca) ||
        cliente.whatsapp_numero?.includes(busca)
      )
    })

  const cardStyle = {
    backgroundColor: 'white',
    padding: '20px',
    borderRadius: '12px',
    border: '1px solid #e0e0e0',
    boxShadow: '0 2px 8px rgba(0,0,0,0.05)'
  }

  return (
    <div style={{ padding: '24px', maxWidth: '1400px', margin: '0 auto' }}>
      {/* Cabeçalho */}
      <div style={{ marginBottom: '32px' }}>
        <h1 style={{ fontSize: '28px', fontWeight: 'bold', color: '#333', marginBottom: '8px' }}>
          Mensalli - Dashboard Admin
        </h1>
        <p style={{ color: '#666', fontSize: '14px' }}>
          Gerencie todos os alunos conectados no sistema
        </p>
      </div>

      {/* Cards de Estatísticas */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
        gap: '16px',
        marginBottom: '32px'
      }}>
        <div style={cardStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
            <Icon icon="mdi:account-group" width="24" style={{ color: '#667eea' }} />
            <span style={{ fontSize: '14px', color: '#666', fontWeight: '500' }}>Total de Alunos</span>
          </div>
          <div style={{ fontSize: '32px', fontWeight: 'bold', color: '#333' }}>
            {stats.total}
          </div>
        </div>

        <div style={cardStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
            <Icon icon="mdi:check-circle" width="24" style={{ color: '#4caf50' }} />
            <span style={{ fontSize: '14px', color: '#666', fontWeight: '500' }}>Conectados</span>
          </div>
          <div style={{ fontSize: '32px', fontWeight: 'bold', color: '#4caf50' }}>
            {stats.conectados}
          </div>
        </div>

        <div style={cardStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
            <Icon icon="mdi:close-circle" width="24" style={{ color: '#f44336' }} />
            <span style={{ fontSize: '14px', color: '#666', fontWeight: '500' }}>Desconectados</span>
          </div>
          <div style={{ fontSize: '32px', fontWeight: 'bold', color: '#f44336' }}>
            {stats.desconectados}
          </div>
        </div>

        {/* Novo card: Msgs Pendentes */}
        <div style={{ ...cardStyle, border: stats.totalPendentes > 0 ? '1px solid #ff9800' : '1px solid #e0e0e0' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
            <Icon icon="mdi:message-alert" width="24" style={{ color: '#ff9800' }} />
            <span style={{ fontSize: '14px', color: '#666', fontWeight: '500' }}>Msgs Pendentes</span>
          </div>
          <div style={{ fontSize: '32px', fontWeight: 'bold', color: stats.totalPendentes > 0 ? '#ff9800' : '#333' }}>
            {stats.totalPendentes}
          </div>
        </div>

        <div style={cardStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
            <Icon icon="mdi:message-text" width="24" style={{ color: '#2196f3' }} />
            <span style={{ fontSize: '14px', color: '#666', fontWeight: '500' }}>Mensagens (Mês)</span>
          </div>
          <div style={{ fontSize: '32px', fontWeight: 'bold', color: '#333' }}>
            {stats.mensagensMesAtual.toLocaleString('pt-BR')}
          </div>
        </div>

        <div style={cardStyle}>
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
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {[
            { id: 'todos', label: `Todos (${stats.total})`, color: '#667eea' },
            { id: 'conectados', label: `Conectados (${stats.conectados})`, color: '#4caf50' },
            { id: 'desconectados', label: `Desconectados (${stats.desconectados})`, color: '#f44336' },
            { id: 'pendentes', label: `Pendentes (${clientes.filter(c => c.msgs_pendentes > 0).length})`, color: '#ff9800' }
          ].map(f => (
            <button
              key={f.id}
              onClick={() => setFiltro(f.id)}
              style={{
                padding: '8px 16px',
                borderRadius: '6px',
                border: filtro === f.id ? `2px solid ${f.color}` : '1px solid #ddd',
                backgroundColor: filtro === f.id ? `${f.color}15` : 'white',
                color: filtro === f.id ? f.color : '#666',
                fontWeight: filtro === f.id ? '600' : '400',
                cursor: 'pointer',
                fontSize: '14px'
              }}
            >
              {f.label}
            </button>
          ))}
        </div>

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
            Nenhum aluno encontrado
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ backgroundColor: '#f8f9fa', borderBottom: '2px solid #e0e0e0' }}>
                  {['Status', 'Nome', 'Email', 'Plano', 'Msgs (Mês)', 'Pendentes', 'Última Conexão', 'Ações'].map(header => (
                    <th key={header} style={{ padding: '12px 16px', textAlign: 'left', fontSize: '13px', fontWeight: '600', color: '#666' }}>
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {clientesFiltrados.map((cliente) => (
                  <tr
                    key={cliente.id}
                    style={{
                      borderBottom: '1px solid #e5e7eb',
                      transition: 'background-color 0.2s'
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f8f9fa'}
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'white'}
                  >
                    {/* Status */}
                    <td style={{ padding: '12px 16px' }}>
                      <div style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        padding: '4px 12px',
                        backgroundColor: cliente.conectado ? '#e8f5e9' : '#ffebee',
                        borderRadius: '12px',
                        fontSize: '12px',
                        fontWeight: '500',
                        color: cliente.conectado ? '#4caf50' : '#f44336'
                      }}>
                        <div style={{
                          width: '8px',
                          height: '8px',
                          borderRadius: '50%',
                          backgroundColor: cliente.conectado ? '#4caf50' : '#f44336'
                        }} />
                        {cliente.conectado ? 'Conectado' : 'Desconectado'}
                      </div>
                    </td>

                    {/* Nome */}
                    <td style={{ padding: '12px 16px' }}>
                      <div style={{ fontSize: '14px', color: '#333', fontWeight: '500' }}>
                        {cliente.nome_completo || cliente.nome_empresa || '-'}
                      </div>
                      <div style={{ fontSize: '12px', color: '#999' }}>
                        {cliente.nome_empresa && cliente.nome_completo ? cliente.nome_empresa : ''}
                      </div>
                    </td>

                    {/* Email */}
                    <td style={{ padding: '12px 16px', fontSize: '13px', color: '#666' }}>
                      {cliente.email || '-'}
                    </td>

                    {/* Plano */}
                    <td style={{ padding: '12px 16px' }}>
                      <span style={{
                        padding: '4px 10px',
                        backgroundColor: cliente.plano === 'business' ? '#e3f2fd' : cliente.plano === 'pro' ? '#f3e5f5' : '#fff3e0',
                        color: cliente.plano === 'business' ? '#1976d2' : cliente.plano === 'pro' ? '#7b1fa2' : '#f57c00',
                        borderRadius: '6px',
                        fontSize: '12px',
                        fontWeight: '500',
                        textTransform: 'capitalize'
                      }}>
                        {cliente.plano || 'starter'}
                      </span>
                    </td>

                    {/* Mensagens Mês */}
                    <td style={{ padding: '12px 16px', fontSize: '14px', color: '#333', fontWeight: '500' }}>
                      {cliente.mensagens_mes_atual || 0}
                    </td>

                    {/* Pendentes */}
                    <td style={{ padding: '12px 16px' }}>
                      {cliente.msgs_pendentes > 0 ? (
                        <span style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                          padding: '4px 10px',
                          backgroundColor: '#fff3e0',
                          color: '#e65100',
                          borderRadius: '12px',
                          fontSize: '12px',
                          fontWeight: '600'
                        }}>
                          <Icon icon="mdi:alert-circle" width="14" />
                          {cliente.msgs_pendentes}
                        </span>
                      ) : (
                        <span style={{ fontSize: '13px', color: '#999' }}>0</span>
                      )}
                    </td>

                    {/* Última Conexão */}
                    <td style={{ padding: '12px 16px', fontSize: '13px', color: '#666' }}>
                      {formatarData(cliente.ultima_conexao)}
                    </td>

                    {/* Ações */}
                    <td style={{ padding: '12px 16px' }}>
                      <button
                        onClick={() => restartInstancia(cliente)}
                        disabled={restartingCliente === cliente.user_id}
                        title="Restart da instância WhatsApp"
                        style={{
                          padding: '6px 12px',
                          borderRadius: '6px',
                          border: '1px solid #ddd',
                          backgroundColor: restartingCliente === cliente.user_id ? '#f5f5f5' : 'white',
                          color: '#666',
                          cursor: restartingCliente === cliente.user_id ? 'not-allowed' : 'pointer',
                          fontSize: '12px',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                          opacity: restartingCliente === cliente.user_id ? 0.6 : 1
                        }}
                      >
                        <Icon
                          icon={restartingCliente === cliente.user_id ? "mdi:loading" : "mdi:restart"}
                          width="16"
                          style={restartingCliente === cliente.user_id ? { animation: 'spin 1s linear infinite' } : {}}
                        />
                        {restartingCliente === cliente.user_id ? 'Reiniciando...' : 'Restart'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Rodapé */}
      <div style={{ marginTop: '16px', textAlign: 'center', fontSize: '12px', color: '#999' }}>
        Atualização automática a cada 2 minutos • {clientesFiltrados.length} aluno{clientesFiltrados.length !== 1 ? 's' : ''} exibido{clientesFiltrados.length !== 1 ? 's' : ''}
      </div>

      {/* CSS para animação de spin */}
      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  )
}
