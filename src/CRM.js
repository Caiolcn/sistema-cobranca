import { useState, useEffect, useMemo } from 'react'
import { useUser } from './contexts/UserContext'
import { useNavigate } from 'react-router-dom'
import { supabase } from './supabaseClient'
import useWindowSize from './hooks/useWindowSize'
import { Icon } from '@iconify/react'

export default function CRM() {
  const { isAdmin, loading: userLoading } = useUser()
  const navigate = useNavigate()
  const { isMobile, isSmallScreen } = useWindowSize()

  const [clientes, setClientes] = useState([])
  const [loading, setLoading] = useState(true)
  const [filtro, setFiltro] = useState('todos')
  const [buscaTexto, setBuscaTexto] = useState('')
  const [ordenacao, setOrdenacao] = useState('nome')
  const [filtroMes, setFiltroMes] = useState('todos')

  // Redirecionar se não for admin
  useEffect(() => {
    if (!userLoading && !isAdmin) navigate('/app/home')
  }, [isAdmin, userLoading, navigate])

  // Carregar dados
  useEffect(() => {
    if (isAdmin) carregarDados()
  }, [isAdmin])

  const carregarDados = async () => {
    setLoading(true)
    try {
      const [
        { data: usuariosData },
        { data: mensallizapData },
        { data: controlePlanoData },
        { data: whatsappData }
      ] = await Promise.all([
        supabase
          .from('usuarios')
          .select('id, email, nome_empresa, nome_completo, telefone, plano, plano_pago, plano_vencimento, trial_fim, role, created_at')
          .neq('role', 'admin')
          .order('nome_empresa', { ascending: true, nullsFirst: false }),
        supabase
          .from('mensallizap')
          .select('user_id, telefone, whatsapp_numero, conectado, ultima_conexao, total_mensagens_enviadas, mensagens_mes_atual'),
        supabase
          .from('controle_planos')
          .select('user_id, usage_count, limite_mensal, mes_referencia'),
        supabase
          .from('whatsapp_connections')
          .select('user_id, status, last_connected_at')
      ])

      // Merge por user_id
      const mzMap = {}
      ;(mensallizapData || []).forEach(m => { mzMap[m.user_id] = m })
      const cpMap = {}
      ;(controlePlanoData || []).forEach(c => { cpMap[c.user_id] = c })
      const wcMap = {}
      ;(whatsappData || []).forEach(w => { wcMap[w.user_id] = w })

      const merged = (usuariosData || []).map(u => ({
        ...u,
        mz: mzMap[u.id] || null,
        cp: cpMap[u.id] || null,
        wc: wcMap[u.id] || null
      }))

      setClientes(merged)
    } catch (error) {
      console.error('Erro ao carregar dados do CRM:', error)
    } finally {
      setLoading(false)
    }
  }

  // KPIs calculados
  const kpis = useMemo(() => {
    const hoje = new Date()
    const total = clientes.length
    const pagos = clientes.filter(c => c.plano_pago === true).length
    const emTrial = clientes.filter(c => !c.plano_pago && c.trial_fim && new Date(c.trial_fim) > hoje).length
    const trialExpirado = clientes.filter(c => !c.plano_pago && c.trial_fim && new Date(c.trial_fim) <= hoje).length
    const whatsappConectado = clientes.filter(c => c.mz?.conectado === true).length
    const mensagensMes = clientes.reduce((sum, c) => sum + (c.cp?.usage_count || 0), 0)

    return { total, pagos, emTrial, trialExpirado, whatsappConectado, mensagensMes }
  }, [clientes])

  // Distribuição de planos
  const distribuicaoPlanos = useMemo(() => {
    const total = clientes.length || 1
    const starter = clientes.filter(c => c.plano === 'starter' || !c.plano).length
    const pro = clientes.filter(c => c.plano === 'pro').length
    const premium = clientes.filter(c => c.plano === 'premium').length
    return {
      starter: { count: starter, pct: Math.round((starter / total) * 100) },
      pro: { count: pro, pct: Math.round((pro / total) * 100) },
      premium: { count: premium, pct: Math.round((premium / total) * 100) }
    }
  }, [clientes])

  // Filtros e busca
  const clientesFiltrados = useMemo(() => {
    const hoje = new Date()
    let result = clientes

    // Filtro por status
    if (filtro === 'pagos') result = result.filter(c => c.plano_pago === true)
    else if (filtro === 'trial') result = result.filter(c => !c.plano_pago && c.trial_fim && new Date(c.trial_fim) > hoje)
    else if (filtro === 'expirados') result = result.filter(c => !c.plano_pago && c.trial_fim && new Date(c.trial_fim) <= hoje)
    else if (filtro === 'conectados') result = result.filter(c => c.mz?.conectado === true)
    else if (filtro === 'desconectados') result = result.filter(c => c.mz && c.mz.conectado !== true)

    // Filtro por mês de criação
    if (filtroMes !== 'todos') {
      result = result.filter(c => {
        if (!c.created_at) return false
        return c.created_at.slice(0, 7) === filtroMes
      })
    }

    // Busca por texto
    if (buscaTexto) {
      const busca = buscaTexto.toLowerCase()
      result = result.filter(c =>
        c.nome_empresa?.toLowerCase().includes(busca) ||
        c.nome_completo?.toLowerCase().includes(busca) ||
        c.email?.toLowerCase().includes(busca)
      )
    }

    // Ordenação
    result = [...result].sort((a, b) => {
      if (ordenacao === 'nome') {
        return (a.nome_empresa || a.nome_completo || '').localeCompare(b.nome_empresa || b.nome_completo || '')
      }
      if (ordenacao === 'plano') {
        const ordem = { premium: 0, pro: 1, starter: 2 }
        return (ordem[a.plano] ?? 2) - (ordem[b.plano] ?? 2)
      }
      if (ordenacao === 'mensagens') {
        return (b.cp?.usage_count || 0) - (a.cp?.usage_count || 0)
      }
      if (ordenacao === 'criacao') {
        return new Date(b.created_at || 0) - new Date(a.created_at || 0)
      }
      return 0
    })

    return result
  }, [clientes, filtro, filtroMes, buscaTexto, ordenacao])

  // Meses disponíveis para filtro (baseado nas datas de criação dos clientes)
  const mesesDisponiveis = useMemo(() => {
    const mesesSet = new Set()
    clientes.forEach(c => {
      if (c.created_at) mesesSet.add(c.created_at.slice(0, 7))
    })
    return [...mesesSet].sort().reverse()
  }, [clientes])

  const formatarMes = (mesISO) => {
    const [ano, mes] = mesISO.split('-')
    const nomes = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']
    return `${nomes[parseInt(mes) - 1]}/${ano}`
  }

  const formatarData = (dataISO) => {
    if (!dataISO) return '-'
    return new Date(dataISO).toLocaleString('pt-BR', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
      timeZone: 'America/Sao_Paulo'
    })
  }

  const getStatusPagamento = (cliente) => {
    if (cliente.plano_pago) return { label: 'Pago', cor: '#4CAF50', bg: '#e8f5e9' }
    if (!cliente.trial_fim) return { label: 'Sem trial', cor: '#999', bg: '#f5f5f5' }
    const diasRestantes = Math.ceil((new Date(cliente.trial_fim) - new Date()) / (1000 * 60 * 60 * 24))
    if (diasRestantes > 0) return { label: `Trial (${diasRestantes}d)`, cor: '#ff9800', bg: '#fff3e0' }
    return { label: 'Expirado', cor: '#f44336', bg: '#ffebee' }
  }

  const getPlanoBadge = (plano) => {
    const config = {
      premium: { cor: '#1976d2', bg: '#e3f2fd' },
      pro: { cor: '#7b1fa2', bg: '#f3e5f5' },
      starter: { cor: '#f57c00', bg: '#fff3e0' }
    }
    return config[plano] || config.starter
  }

  if (userLoading) return null

  const kpiCards = [
    { label: 'Total de Clientes', valor: kpis.total, icon: 'mdi:account-group', cor: '#667eea', bg: '#f0f4ff' },
    { label: 'Planos Pagos', valor: kpis.pagos, icon: 'mdi:check-decagram', cor: '#4CAF50', bg: '#e8f5e9' },
    { label: 'Em Trial', valor: kpis.emTrial, icon: 'mdi:clock-outline', cor: '#ff9800', bg: '#fff3e0' },
    { label: 'Trial Expirado', valor: kpis.trialExpirado, icon: 'mdi:alert-circle', cor: '#f44336', bg: '#ffebee' },
    { label: 'WhatsApp Conectado', valor: kpis.whatsappConectado, icon: 'mdi:whatsapp', cor: '#25D366', bg: '#e8f5e9' },
    { label: 'Mensagens no Mês', valor: kpis.mensagensMes.toLocaleString('pt-BR'), icon: 'mdi:message-text', cor: '#2196F3', bg: '#e3f2fd' }
  ]

  const filtros = [
    { key: 'todos', label: 'Todos', count: kpis.total, cor: '#667eea' },
    { key: 'pagos', label: 'Pagos', count: kpis.pagos, cor: '#4CAF50' },
    { key: 'trial', label: 'Trial', count: kpis.emTrial, cor: '#ff9800' },
    { key: 'expirados', label: 'Expirados', count: kpis.trialExpirado, cor: '#f44336' },
    { key: 'conectados', label: 'Conectados', count: kpis.whatsappConectado, cor: '#25D366' },
    { key: 'desconectados', label: 'Desconectados', count: kpis.total - kpis.whatsappConectado, cor: '#999' }
  ]

  return (
    <div style={{ padding: isMobile ? '16px' : '24px', maxWidth: '1800px', margin: '0 auto' }}>
      {/* Cabeçalho */}
      <div style={{ marginBottom: '28px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 style={{ fontSize: isMobile ? '22px' : '28px', fontWeight: 'bold', color: '#333', margin: '0 0 6px 0' }}>
            CRM Mensalli
          </h1>
          <p style={{ color: '#666', fontSize: '14px', margin: 0 }}>
            Visão geral de clientes e métricas do sistema
          </p>
        </div>
        <button
          onClick={carregarDados}
          disabled={loading}
          style={{
            padding: '10px 20px', borderRadius: '8px', border: 'none',
            backgroundColor: '#667eea', color: 'white', fontWeight: '500',
            cursor: loading ? 'not-allowed' : 'pointer', fontSize: '14px',
            display: 'flex', alignItems: 'center', gap: '8px',
            opacity: loading ? 0.6 : 1
          }}
        >
          <Icon icon="mdi:refresh" width="18" />
          {loading ? 'Atualizando...' : 'Atualizar'}
        </button>
      </div>

      {/* KPI Cards */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : isSmallScreen ? 'repeat(3, 1fr)' : 'repeat(6, 1fr)',
        gap: isMobile ? '10px' : '14px',
        marginBottom: '24px'
      }}>
        {kpiCards.map(kpi => (
          <div key={kpi.label} style={{
            padding: isMobile ? '14px' : '18px',
            borderLeft: `3px solid ${kpi.cor}`,
            backgroundColor: kpi.bg,
            borderRadius: '10px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
              <Icon icon={kpi.icon} width="20" style={{ color: kpi.cor }} />
              <span style={{ fontSize: '12px', color: '#666', fontWeight: '500' }}>{kpi.label}</span>
            </div>
            <div style={{ fontSize: isMobile ? '22px' : '28px', fontWeight: 'bold', color: '#333' }}>
              {kpi.valor}
            </div>
          </div>
        ))}
      </div>

      {/* Distribuição de Planos */}
      <div style={{
        backgroundColor: 'white', padding: isMobile ? '16px' : '20px',
        borderRadius: '12px', border: '1px solid #e0e0e0', marginBottom: '24px'
      }}>
        <h3 style={{ fontSize: '15px', fontWeight: '600', color: '#333', margin: '0 0 14px 0' }}>
          Distribuição de Planos
        </h3>
        <div style={{ display: 'flex', borderRadius: '8px', overflow: 'hidden', height: '32px', backgroundColor: '#f0f0f0' }}>
          {distribuicaoPlanos.starter.pct > 0 && (
            <div style={{
              width: `${distribuicaoPlanos.starter.pct}%`, backgroundColor: '#ff9800',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: 'white', fontSize: '11px', fontWeight: '600', minWidth: distribuicaoPlanos.starter.pct > 10 ? 'auto' : '0'
            }}>
              {distribuicaoPlanos.starter.pct > 10 && `Starter ${distribuicaoPlanos.starter.pct}%`}
            </div>
          )}
          {distribuicaoPlanos.pro.pct > 0 && (
            <div style={{
              width: `${distribuicaoPlanos.pro.pct}%`, backgroundColor: '#7b1fa2',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: 'white', fontSize: '11px', fontWeight: '600', minWidth: distribuicaoPlanos.pro.pct > 10 ? 'auto' : '0'
            }}>
              {distribuicaoPlanos.pro.pct > 10 && `Pro ${distribuicaoPlanos.pro.pct}%`}
            </div>
          )}
          {distribuicaoPlanos.premium.pct > 0 && (
            <div style={{
              width: `${distribuicaoPlanos.premium.pct}%`, backgroundColor: '#1976d2',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: 'white', fontSize: '11px', fontWeight: '600', minWidth: distribuicaoPlanos.premium.pct > 10 ? 'auto' : '0'
            }}>
              {distribuicaoPlanos.premium.pct > 10 && `Premium ${distribuicaoPlanos.premium.pct}%`}
            </div>
          )}
        </div>
        <div style={{ display: 'flex', gap: '20px', marginTop: '10px', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '12px', color: '#666', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ width: '10px', height: '10px', borderRadius: '2px', backgroundColor: '#ff9800', display: 'inline-block' }} />
            Starter: {distribuicaoPlanos.starter.count}
          </span>
          <span style={{ fontSize: '12px', color: '#666', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ width: '10px', height: '10px', borderRadius: '2px', backgroundColor: '#7b1fa2', display: 'inline-block' }} />
            Pro: {distribuicaoPlanos.pro.count}
          </span>
          <span style={{ fontSize: '12px', color: '#666', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ width: '10px', height: '10px', borderRadius: '2px', backgroundColor: '#1976d2', display: 'inline-block' }} />
            Premium: {distribuicaoPlanos.premium.count}
          </span>
        </div>
      </div>

      {/* Filtros e Busca */}
      <div style={{
        backgroundColor: 'white', padding: isMobile ? '14px' : '20px',
        borderRadius: '12px', border: '1px solid #e0e0e0', marginBottom: '20px',
        display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap'
      }}>
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
          {filtros.map(f => (
            <button
              key={f.key}
              onClick={() => setFiltro(f.key)}
              style={{
                padding: '6px 12px', borderRadius: '6px', fontSize: '13px',
                border: filtro === f.key ? `2px solid ${f.cor}` : '1px solid #ddd',
                backgroundColor: filtro === f.key ? `${f.cor}15` : 'white',
                color: filtro === f.key ? f.cor : '#666',
                fontWeight: filtro === f.key ? '600' : '400',
                cursor: 'pointer', whiteSpace: 'nowrap'
              }}
            >
              {f.label} ({f.count})
            </button>
          ))}
        </div>

        <div style={{ flex: 1, minWidth: '200px' }}>
          <input
            type="text"
            placeholder="Buscar por nome, empresa ou email..."
            value={buscaTexto}
            onChange={(e) => setBuscaTexto(e.target.value)}
            style={{
              width: '100%', padding: '8px 14px', border: '1px solid #ddd',
              borderRadius: '6px', fontSize: '16px', boxSizing: 'border-box'
            }}
          />
        </div>

        <select
          value={filtroMes}
          onChange={(e) => setFiltroMes(e.target.value)}
          style={{
            padding: '8px 12px', border: '1px solid #ddd', borderRadius: '6px',
            fontSize: '13px', color: '#333', backgroundColor: 'white', cursor: 'pointer'
          }}
        >
          <option value="todos">Todos os meses</option>
          {mesesDisponiveis.map(mes => (
            <option key={mes} value={mes}>{formatarMes(mes)}</option>
          ))}
        </select>

        <select
          value={ordenacao}
          onChange={(e) => setOrdenacao(e.target.value)}
          style={{
            padding: '8px 12px', border: '1px solid #ddd', borderRadius: '6px',
            fontSize: '13px', color: '#333', backgroundColor: 'white', cursor: 'pointer'
          }}
        >
          <option value="nome">Ordenar por nome</option>
          <option value="plano">Ordenar por plano</option>
          <option value="mensagens">Ordenar por mensagens</option>
          <option value="criacao">Ordenar por criação</option>
        </select>
      </div>

      {/* Tabela de Clientes */}
      <div style={{
        backgroundColor: 'white', borderRadius: '12px',
        border: '1px solid #e0e0e0', overflow: 'hidden'
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
            <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'auto' }}>
              <thead>
                <tr style={{ backgroundColor: '#f8f9fa', borderBottom: '2px solid #e0e0e0' }}>
                  {['Empresa/Nome', 'Telefone', 'Email', 'User ID', 'Plano', 'Pagamento', 'Vencimento Plano', 'Criação da Conta', 'WhatsApp', 'Mensagens', 'Última Conexão'].map(col => (
                    <th key={col} style={{
                      padding: '10px 8px', textAlign: 'left', fontSize: '11px',
                      fontWeight: '600', color: '#666', textTransform: 'uppercase', letterSpacing: '0.3px', whiteSpace: 'nowrap'
                    }}>
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {clientesFiltrados.map(cliente => {
                  const statusPgto = getStatusPagamento(cliente)
                  const planoBadge = getPlanoBadge(cliente.plano)
                  const usageCount = cliente.cp?.usage_count || 0
                  const limiteMsg = cliente.cp?.limite_mensal || 0
                  const usagePct = limiteMsg > 0 ? Math.min((usageCount / limiteMsg) * 100, 100) : 0
                  const wcConectado = cliente.mz?.conectado === true

                  return (
                    <tr
                      key={cliente.id}
                      style={{ borderBottom: '1px solid #f0f0f0', transition: 'background-color 0.2s' }}
                      onMouseEnter={e => e.currentTarget.style.backgroundColor = '#f8f9fa'}
                      onMouseLeave={e => e.currentTarget.style.backgroundColor = 'white'}
                    >
                      {/* Empresa/Nome */}
                      <td style={{ padding: '8px 6px' }}>
                        <div style={{ fontSize: '13px', fontWeight: '500', color: '#333', whiteSpace: 'nowrap' }}>
                          {cliente.nome_empresa || cliente.nome_completo || '-'}
                        </div>
                        {cliente.nome_empresa && cliente.nome_completo && (
                          <div style={{ fontSize: '11px', color: '#999', marginTop: '1px' }}>
                            {cliente.nome_completo}
                          </div>
                        )}
                      </td>

                      {/* Telefone */}
                      <td style={{ padding: '8px 6px' }}>
                        {(() => {
                          const tel = cliente.telefone || cliente.mz?.telefone || cliente.mz?.whatsapp_numero
                          if (!tel) return <span style={{ fontSize: '12px', color: '#666' }}>-</span>
                          return (
                            <span
                              onClick={() => { navigator.clipboard.writeText(tel) }}
                              title="Clique para copiar"
                              style={{
                                fontSize: '12px', color: '#666', cursor: 'pointer',
                                padding: '2px 4px', borderRadius: '4px',
                                backgroundColor: '#f5f5f5', whiteSpace: 'nowrap'
                              }}
                            >
                              {tel}
                            </span>
                          )
                        })()}
                      </td>

                      {/* Email */}
                      <td style={{ padding: '8px 6px', fontSize: '12px', color: '#666', maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {cliente.email || '-'}
                      </td>

                      {/* User ID */}
                      <td style={{ padding: '8px 6px' }}>
                        <span
                          onClick={() => { navigator.clipboard.writeText(cliente.id); }}
                          title="Clique para copiar"
                          style={{
                            fontSize: '10px', color: '#999', fontFamily: 'monospace',
                            cursor: 'pointer', padding: '2px 4px', borderRadius: '4px',
                            backgroundColor: '#f5f5f5', userSelect: 'all'
                          }}
                        >
                          {cliente.id?.substring(0, 8)}...
                        </span>
                      </td>

                      {/* Plano */}
                      <td style={{ padding: '8px 6px' }}>
                        <span style={{
                          padding: '3px 8px', borderRadius: '6px', fontSize: '11px',
                          fontWeight: '500', textTransform: 'capitalize',
                          color: planoBadge.cor, backgroundColor: planoBadge.bg, whiteSpace: 'nowrap'
                        }}>
                          {cliente.plano || 'starter'}
                        </span>
                      </td>

                      {/* Status Pagamento */}
                      <td style={{ padding: '8px 6px' }}>
                        <span style={{
                          padding: '3px 8px', borderRadius: '6px', fontSize: '11px',
                          fontWeight: '500', color: statusPgto.cor, backgroundColor: statusPgto.bg, whiteSpace: 'nowrap'
                        }}>
                          {statusPgto.label}
                        </span>
                      </td>

                      {/* Vencimento Plano */}
                      <td style={{ padding: '8px 6px', fontSize: '11px', whiteSpace: 'nowrap' }}>
                        {(() => {
                          const dataVenc = cliente.plano_pago ? cliente.plano_vencimento : cliente.trial_fim
                          if (!dataVenc) return <span style={{ color: '#ccc' }}>-</span>
                          const venc = new Date(dataVenc)
                          const hoje = new Date()
                          const dias = Math.ceil((venc - hoje) / (1000 * 60 * 60 * 24))
                          const cor = dias <= 0 ? '#f44336' : dias <= 3 ? '#ff9800' : dias <= 7 ? '#ff9800' : '#666'
                          return (
                            <span style={{ color: cor }}>
                              {venc.toLocaleDateString('pt-BR')}
                              <span style={{ fontSize: '10px', marginLeft: '3px' }}>
                                {dias <= 0 ? '(vencido)' : dias <= 7 ? `(${dias}d)` : ''}
                              </span>
                            </span>
                          )
                        })()}
                      </td>

                      {/* Criação da Conta */}
                      <td style={{ padding: '8px 6px', fontSize: '11px', color: '#666', whiteSpace: 'nowrap' }}>
                        {cliente.created_at
                          ? new Date(cliente.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'America/Sao_Paulo' })
                          : '-'}
                      </td>

                      {/* WhatsApp */}
                      <td style={{ padding: '8px 6px' }}>
                        <div style={{
                          display: 'inline-flex', alignItems: 'center', gap: '4px',
                          padding: '3px 8px', borderRadius: '12px', fontSize: '11px', fontWeight: '500',
                          backgroundColor: wcConectado ? '#e8f5e9' : '#f5f5f5',
                          color: wcConectado ? '#4caf50' : '#999', whiteSpace: 'nowrap'
                        }}>
                          <div style={{
                            width: '6px', height: '6px', borderRadius: '50%',
                            backgroundColor: wcConectado ? '#4caf50' : '#ccc'
                          }} />
                          {wcConectado ? 'Sim' : cliente.mz ? 'Não' : '-'}
                        </div>
                      </td>

                      {/* Mensagens */}
                      <td style={{ padding: '8px 6px' }}>
                        <div style={{ fontSize: '12px', fontWeight: '500', color: '#333', marginBottom: '3px', whiteSpace: 'nowrap' }}>
                          {usageCount}/{limiteMsg}
                        </div>
                        <div style={{
                          width: '60px', height: '3px', backgroundColor: '#f0f0f0',
                          borderRadius: '2px', overflow: 'hidden'
                        }}>
                          <div style={{
                            width: `${usagePct}%`, height: '100%', borderRadius: '2px',
                            backgroundColor: usagePct > 90 ? '#f44336' : usagePct > 70 ? '#ff9800' : '#4CAF50'
                          }} />
                        </div>
                      </td>

                      {/* Última Conexão */}
                      <td style={{ padding: '8px 6px', fontSize: '11px', color: '#666', whiteSpace: 'nowrap' }}>
                        {formatarData(cliente.mz?.ultima_conexao || cliente.wc?.last_connected_at)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Rodapé */}
      <div style={{ marginTop: '14px', textAlign: 'center', fontSize: '12px', color: '#999' }}>
        {clientesFiltrados.length} cliente{clientesFiltrados.length !== 1 ? 's' : ''} exibido{clientesFiltrados.length !== 1 ? 's' : ''}
      </div>
    </div>
  )
}
