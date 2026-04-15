import { useState, useEffect, useMemo } from 'react'
import { useUser } from './contexts/UserContext'
import { useNavigate } from 'react-router-dom'
import { supabase } from './supabaseClient'
import useWindowSize from './hooks/useWindowSize'
import { Icon } from '@iconify/react'
// import RetencaoSaas from './components/RetencaoSaas' // TODO: reativar quando estiver pronto

export default function Admin() {
  const { isAdmin, loading: userLoading } = useUser()
  const navigate = useNavigate()
  const { isMobile, isSmallScreen } = useWindowSize()

  const [clientes, setClientes] = useState([])
  const [pagamentos, setPagamentos] = useState([])
  const [assinaturas, setAssinaturas] = useState([])
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
        { data: whatsappData },
        { data: pagamentosData },
        { data: assinaturasData },
        { data: logsMensagensData }
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
          .select('user_id, usage_count, limite_mensal, mes_referencia')
          .eq('mes_referencia', `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`),
        supabase
          .from('whatsapp_connections')
          .select('user_id, status, last_connected_at'),
        supabase
          .from('pagamentos_mercadopago')
          .select('id, user_id, valor, status, data_pagamento, data_aprovacao, payment_type_id, created_at')
          .eq('status', 'approved'),
        supabase
          .from('assinaturas_mercadopago')
          .select('id, user_id, plano, status, valor, data_inicio, proxima_cobranca, created_at'),
        supabase
          .from('logs_mensagens')
          .select('user_id, enviado_em')
          .gte('enviado_em', `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}-01`)
      ])

      // Merge por user_id
      const mzMap = {}
      ;(mensallizapData || []).forEach(m => { mzMap[m.user_id] = m })
      const cpMap = {}
      ;(controlePlanoData || []).forEach(c => { cpMap[c.user_id] = c })
      const wcMap = {}
      ;(whatsappData || []).forEach(w => { wcMap[w.user_id] = w })

      // Contar mensagens reais do mês por user_id
      const msgCountMap = {}
      ;(logsMensagensData || []).forEach(l => {
        msgCountMap[l.user_id] = (msgCountMap[l.user_id] || 0) + 1
      })

      const merged = (usuariosData || []).map(u => ({
        ...u,
        mz: mzMap[u.id] || null,
        mensagensReaisMes: msgCountMap[u.id] || 0,
        cp: cpMap[u.id] || null,
        wc: wcMap[u.id] || null
      }))

      setClientes(merged)
      setPagamentos(pagamentosData || [])
      setAssinaturas(assinaturasData || [])
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
    const mensagensMes = clientes.reduce((sum, c) => sum + (c.mensagensReaisMes || 0), 0)

    return { total, pagos, emTrial, trialExpirado, whatsappConectado, mensagensMes }
  }, [clientes])

  // Distribuição de planos (só pagos)
  const distribuicaoPlanos = useMemo(() => {
    const pagos = clientes.filter(c => c.plano_pago === true)
    const total = pagos.length || 1
    const starter = pagos.filter(c => c.plano === 'starter' || !c.plano).length
    const pro = pagos.filter(c => c.plano === 'pro').length
    const premium = pagos.filter(c => c.plano === 'premium').length
    return {
      total: pagos.length,
      starter: { count: starter, pct: Math.round((starter / total) * 100) },
      pro: { count: pro, pct: Math.round((pro / total) * 100) },
      premium: { count: premium, pct: Math.round((premium / total) * 100) }
    }
  }, [clientes])

  // KPIs Financeiros
  const kpisFinanceiros = useMemo(() => {
    const hoje = new Date()
    const mesAtual = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}`
    const mesAnterior = hoje.getMonth() === 0
      ? `${hoje.getFullYear() - 1}-12`
      : `${hoje.getFullYear()}-${String(hoje.getMonth()).padStart(2, '0')}`

    // Faturamento do mês atual
    const pagamentosMes = pagamentos.filter(p => (p.data_aprovacao || p.created_at)?.slice(0, 7) === mesAtual)
    const faturamentoMes = pagamentosMes.reduce((sum, p) => sum + Number(p.valor || 0), 0)

    // Faturamento do mês anterior
    const pagamentosMesAnterior = pagamentos.filter(p => (p.data_aprovacao || p.created_at)?.slice(0, 7) === mesAnterior)
    const faturamentoMesAnterior = pagamentosMesAnterior.reduce((sum, p) => sum + Number(p.valor || 0), 0)

    // Faturamento total (todos os tempos)
    const faturamentoTotal = pagamentos.reduce((sum, p) => sum + Number(p.valor || 0), 0)

    // Assinaturas ativas (authorized)
    const assinaturasAtivas = assinaturas.filter(a => a.status === 'authorized')

    // MRR (receita mensal recorrente) = soma dos valores das assinaturas ativas
    const mrr = assinaturasAtivas.reduce((sum, a) => sum + Number(a.valor || 0), 0)

    // Faturamento de assinaturas = baseado nos clientes com plano_pago ativo
    const precosPlano = { starter: 49.90, pro: 99.90, premium: 149.90 }
    const clientesPagos = clientes.filter(c => c.plano_pago === true)
    const faturamentoAssinaturas = clientesPagos.reduce((sum, c) => sum + (precosPlano[c.plano] || precosPlano.starter), 0)

    // Total de pagamentos recebidos
    const totalPagamentos = pagamentos.length

    // Variação mês a mês
    const variacao = faturamentoMesAnterior > 0
      ? ((faturamentoMes - faturamentoMesAnterior) / faturamentoMesAnterior * 100).toFixed(0)
      : null

    // Faturamento por mês (últimos 6 meses)
    const faturamentoPorMes = []
    for (let i = 5; i >= 0; i--) {
      const d = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1)
      const mesKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      const nomes = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']
      const total = pagamentos
        .filter(p => (p.data_aprovacao || p.created_at)?.slice(0, 7) === mesKey)
        .reduce((sum, p) => sum + Number(p.valor || 0), 0)
      faturamentoPorMes.push({ mes: `${nomes[d.getMonth()]}/${String(d.getFullYear()).slice(2)}`, valor: total })
    }

    return {
      faturamentoMes, faturamentoMesAnterior, faturamentoTotal,
      mrr, assinaturasAtivas: assinaturasAtivas.length,
      faturamentoAssinaturas, clientesPagos: clientesPagos.length,
      totalPagamentos, variacao, faturamentoPorMes
    }
  }, [pagamentos, assinaturas])

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
        return (b.mensagensReaisMes || 0) - (a.mensagensReaisMes || 0)
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
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '0 0 14px 0' }}>
          <h3 style={{ fontSize: '15px', fontWeight: '600', color: '#333', margin: 0 }}>
            Distribuição de Planos Pagos
          </h3>
          <span style={{ fontSize: '13px', color: '#666', fontWeight: '500' }}>
            {distribuicaoPlanos.total} cliente{distribuicaoPlanos.total !== 1 ? 's' : ''} pagante{distribuicaoPlanos.total !== 1 ? 's' : ''}
          </span>
        </div>
        <div style={{ display: 'flex', gap: isMobile ? '8px' : '14px', flexWrap: 'wrap', marginBottom: '16px' }}>
          {[
            { key: 'starter', label: 'Starter', cor: '#ff9800', bg: '#fff3e0', preco: 'R$ 49,90' },
            { key: 'pro', label: 'Pro', cor: '#7b1fa2', bg: '#f3e5f5', preco: 'R$ 99,90' },
            { key: 'premium', label: 'Premium', cor: '#1976d2', bg: '#e3f2fd', preco: 'R$ 149,90' }
          ].map(p => (
            <div key={p.key} style={{
              flex: 1, minWidth: '120px', padding: '14px', borderRadius: '10px',
              backgroundColor: p.bg, borderLeft: `3px solid ${p.cor}`, textAlign: 'center'
            }}>
              <div style={{ fontSize: '12px', color: p.cor, fontWeight: '600', marginBottom: '4px' }}>{p.label}</div>
              <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#333' }}>{distribuicaoPlanos[p.key].count}</div>
              <div style={{ fontSize: '11px', color: '#999', marginTop: '2px' }}>{p.preco}/mês</div>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', borderRadius: '8px', overflow: 'hidden', height: '28px', backgroundColor: '#f0f0f0' }}>
          {[
            { key: 'starter', cor: '#ff9800' },
            { key: 'pro', cor: '#7b1fa2' },
            { key: 'premium', cor: '#1976d2' }
          ].map(p => distribuicaoPlanos[p.key].pct > 0 && (
            <div key={p.key} style={{
              width: `${distribuicaoPlanos[p.key].pct}%`, backgroundColor: p.cor,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: 'white', fontSize: '11px', fontWeight: '600',
              minWidth: distribuicaoPlanos[p.key].pct > 8 ? 'auto' : '0'
            }}>
              {distribuicaoPlanos[p.key].pct > 8 && `${distribuicaoPlanos[p.key].pct}%`}
            </div>
          ))}
        </div>
      </div>

      {/* Indicadores Financeiros */}
      <div style={{
        backgroundColor: 'white', padding: isMobile ? '16px' : '20px',
        borderRadius: '12px', border: '1px solid #e0e0e0', marginBottom: '24px'
      }}>
        <h3 style={{ fontSize: '15px', fontWeight: '600', color: '#333', margin: '0 0 16px 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Icon icon="mdi:finance" width="20" style={{ color: '#667eea' }} />
          Financeiro
        </h3>

        {/* Cards financeiros */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : isSmallScreen ? 'repeat(3, 1fr)' : 'repeat(5, 1fr)',
          gap: isMobile ? '10px' : '14px',
          marginBottom: '20px'
        }}>
          <div style={{ padding: '16px', borderRadius: '10px', backgroundColor: '#f0f9f0', borderLeft: '3px solid #4CAF50' }}>
            <div style={{ fontSize: '12px', color: '#666', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Icon icon="mdi:cash" width="16" style={{ color: '#4CAF50' }} />
              Faturamento do Mês
            </div>
            <div style={{ fontSize: isMobile ? '20px' : '26px', fontWeight: 'bold', color: '#333' }}>
              R$ {kpisFinanceiros.faturamentoMes.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </div>
            {kpisFinanceiros.variacao !== null && (
              <div style={{
                fontSize: '11px', marginTop: '4px',
                color: Number(kpisFinanceiros.variacao) >= 0 ? '#4CAF50' : '#f44336',
                display: 'flex', alignItems: 'center', gap: '3px'
              }}>
                <Icon icon={Number(kpisFinanceiros.variacao) >= 0 ? 'mdi:trending-up' : 'mdi:trending-down'} width="14" />
                {Number(kpisFinanceiros.variacao) >= 0 ? '+' : ''}{kpisFinanceiros.variacao}% vs mês anterior
              </div>
            )}
          </div>

          <div style={{ padding: '16px', borderRadius: '10px', backgroundColor: '#f0f4ff', borderLeft: '3px solid #667eea' }}>
            <div style={{ fontSize: '12px', color: '#666', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Icon icon="mdi:autorenew" width="16" style={{ color: '#667eea' }} />
              MRR (Recorrente)
            </div>
            <div style={{ fontSize: isMobile ? '20px' : '26px', fontWeight: 'bold', color: '#333' }}>
              R$ {kpisFinanceiros.mrr.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </div>
            <div style={{ fontSize: '11px', color: '#999', marginTop: '4px' }}>
              {kpisFinanceiros.assinaturasAtivas} assinatura{kpisFinanceiros.assinaturasAtivas !== 1 ? 's' : ''} ativa{kpisFinanceiros.assinaturasAtivas !== 1 ? 's' : ''}
            </div>
          </div>

          <div style={{ padding: '16px', borderRadius: '10px', backgroundColor: '#fce4ec', borderLeft: '3px solid #e91e63' }}>
            <div style={{ fontSize: '12px', color: '#666', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Icon icon="mdi:account-cash" width="16" style={{ color: '#e91e63' }} />
              Receita em Assinaturas
            </div>
            <div style={{ fontSize: isMobile ? '20px' : '26px', fontWeight: 'bold', color: '#333' }}>
              R$ {kpisFinanceiros.faturamentoAssinaturas.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </div>
            <div style={{ fontSize: '11px', color: '#999', marginTop: '4px' }}>
              {kpisFinanceiros.clientesPagos} cliente{kpisFinanceiros.clientesPagos !== 1 ? 's' : ''} com plano ativo
            </div>
          </div>

          <div style={{ padding: '16px', borderRadius: '10px', backgroundColor: '#fff8e1', borderLeft: '3px solid #ff9800' }}>
            <div style={{ fontSize: '12px', color: '#666', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Icon icon="mdi:chart-timeline-variant" width="16" style={{ color: '#ff9800' }} />
              Faturamento Total
            </div>
            <div style={{ fontSize: isMobile ? '20px' : '26px', fontWeight: 'bold', color: '#333' }}>
              R$ {kpisFinanceiros.faturamentoTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </div>
            <div style={{ fontSize: '11px', color: '#999', marginTop: '4px' }}>
              {kpisFinanceiros.totalPagamentos} pagamento{kpisFinanceiros.totalPagamentos !== 1 ? 's' : ''} recebido{kpisFinanceiros.totalPagamentos !== 1 ? 's' : ''}
            </div>
          </div>

          <div style={{ padding: '16px', borderRadius: '10px', backgroundColor: '#e3f2fd', borderLeft: '3px solid #2196F3' }}>
            <div style={{ fontSize: '12px', color: '#666', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Icon icon="mdi:calendar-month" width="16" style={{ color: '#2196F3' }} />
              Mês Anterior
            </div>
            <div style={{ fontSize: isMobile ? '20px' : '26px', fontWeight: 'bold', color: '#333' }}>
              R$ {kpisFinanceiros.faturamentoMesAnterior.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </div>
          </div>
        </div>

        {/* Gráfico de barras simples - Faturamento últimos 6 meses */}
        <div>
          <div style={{ fontSize: '13px', fontWeight: '500', color: '#666', marginBottom: '12px' }}>
            Faturamento - Últimos 6 meses
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: isMobile ? '6px' : '12px', height: '120px' }}>
            {(() => {
              const maxValor = Math.max(...kpisFinanceiros.faturamentoPorMes.map(m => m.valor), 1)
              return kpisFinanceiros.faturamentoPorMes.map((m, i) => (
                <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', height: '100%', justifyContent: 'flex-end' }}>
                  <div style={{ fontSize: '10px', color: '#666', fontWeight: '500' }}>
                    {m.valor > 0 ? `R$${m.valor.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}` : ''}
                  </div>
                  <div style={{
                    width: '100%', maxWidth: '60px',
                    height: `${Math.max((m.valor / maxValor) * 90, m.valor > 0 ? 8 : 3)}px`,
                    backgroundColor: i === kpisFinanceiros.faturamentoPorMes.length - 1 ? '#667eea' : '#c5caf0',
                    borderRadius: '4px 4px 0 0',
                    transition: 'height 0.3s ease'
                  }} />
                  <div style={{ fontSize: '11px', color: '#999' }}>{m.mes}</div>
                </div>
              ))
            })()}
          </div>
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
                  const msgReais = cliente.mensagensReaisMes || 0
                  const limiteMsg = cliente.cp?.limite_mensal || 0
                  const usagePct = limiteMsg > 0 ? Math.min((msgReais / limiteMsg) * 100, 100) : 0
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
                          {msgReais}/{limiteMsg}
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

      {/* Retenção SaaS - painel de retenção manual (em estruturação — reativar depois) */}
      {/* <div style={{ marginTop: '40px' }}>
        <RetencaoSaas />
      </div> */}
    </div>
  )
}
