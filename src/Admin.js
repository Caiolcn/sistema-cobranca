import { useState, useEffect, useMemo } from 'react'
import { useUser } from './contexts/UserContext'
import { useNavigate } from 'react-router-dom'
import { supabase } from './supabaseClient'
import useWindowSize from './hooks/useWindowSize'
import { Icon } from '@iconify/react'
import RetencaoSaas from './components/RetencaoSaas'

export default function Admin() {
  const { isAdmin, loading: userLoading, userId, chavePix } = useUser()

  const PRECOS_PLANO = { starter: 49.90, pro: 99.90, premium: 149.90 }
  const NOMES_PLANO = { starter: 'Starter', pro: 'Pro', premium: 'Premium' }
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

  // Edição rápida de cliente (modal admin)
  const [clienteEditando, setClienteEditando] = useState(null)
  const [editForm, setEditForm] = useState({ plano_pago: false, plano: 'starter', plano_vencimento: '', trial_fim: '' })
  const [salvandoEdicao, setSalvandoEdicao] = useState(false)
  const [resultadoEdicao, setResultadoEdicao] = useState(null)

  // Recuperar Trial / Reativar Ex-pagante (modal + disparo n8n)
  const [recuperarModal, setRecuperarModal] = useState(false)
  const [grupoOrigem, setGrupoOrigem] = useState('trial') // 'trial' | 'churn'
  const [tipoOferta, setTipoOferta] = useState('extensao_14_dias')
  const [enviandoRecuperacao, setEnviandoRecuperacao] = useState(false)
  const [resultadoRecuperacao, setResultadoRecuperacao] = useState(null)
  const [selecionados, setSelecionados] = useState(new Set())
  const [buscaModal, setBuscaModal] = useState('')

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

  // Set de quem já pagou pelo menos uma vez (pagamentos já vem filtrado por status='approved')
  const everPaidSet = useMemo(() => new Set(pagamentos.map(p => p.user_id)), [pagamentos])

  // KPIs calculados
  const kpis = useMemo(() => {
    const hoje = new Date()
    const total = clientes.length
    const pagos = clientes.filter(c => c.plano_pago === true).length
    const emTrial = clientes.filter(c => !c.plano_pago && c.trial_fim && new Date(c.trial_fim) > hoje).length

    // Separação clara: trial puro (nunca pagou) × ex-pagante (churn)
    const trialNuncaPagou = clientes.filter(c =>
      !c.plano_pago && c.trial_fim && new Date(c.trial_fim) <= hoje && !everPaidSet.has(c.id)
    ).length
    const exPagante = clientes.filter(c =>
      !c.plano_pago && everPaidSet.has(c.id)
    ).length

    const whatsappConectado = clientes.filter(c => c.mz?.conectado === true).length
    const mensagensMes = clientes.reduce((sum, c) => sum + (c.mensagensReaisMes || 0), 0)

    // Taxa de conversão histórica: % dos trials que já concluíram e converteram pelo menos uma vez
    const converteramAlgumaVez = clientes.filter(c => everPaidSet.has(c.id)).length
    const trialsTerminados = converteramAlgumaVez + trialNuncaPagou
    const taxaConversao = trialsTerminados > 0 ? (converteramAlgumaVez / trialsTerminados) * 100 : 0

    return {
      total, pagos, emTrial, trialNuncaPagou, exPagante, whatsappConectado, mensagensMes,
      taxaConversao, trialsTerminados, converteramAlgumaVez
    }
  }, [clientes, everPaidSet])

  const trialNuncaPagouLista = useMemo(() => {
    const hoje = new Date()
    return clientes.filter(c =>
      !c.plano_pago && c.trial_fim && new Date(c.trial_fim) <= hoje && !everPaidSet.has(c.id)
    )
  }, [clientes, everPaidSet])

  const exPaganteLista = useMemo(() =>
    clientes.filter(c => !c.plano_pago && everPaidSet.has(c.id))
  , [clientes, everPaidSet])

  // Lembretes de vencimento — 3 buckets temporais (D-3, hoje, D+3)
  const vencimentoD3Lista = useMemo(() => {
    const hoje = new Date(); hoje.setHours(0, 0, 0, 0)
    return clientes.filter(c => {
      if (!c.plano_pago || !c.plano_vencimento) return false
      const venc = new Date(c.plano_vencimento); venc.setHours(0, 0, 0, 0)
      const diff = Math.round((venc - hoje) / (1000 * 60 * 60 * 24))
      return diff >= 1 && diff <= 3
    })
  }, [clientes])

  const vencimentoHojeLista = useMemo(() => {
    const hoje = new Date(); hoje.setHours(0, 0, 0, 0)
    return clientes.filter(c => {
      if (!c.plano_pago || !c.plano_vencimento) return false
      const venc = new Date(c.plano_vencimento); venc.setHours(0, 0, 0, 0)
      return venc.getTime() === hoje.getTime()
    })
  }, [clientes])

  const vencimentoVencidoLista = useMemo(() => {
    const hoje = new Date(); hoje.setHours(0, 0, 0, 0)
    return clientes.filter(c => {
      if (!c.plano_vencimento) return false
      const venc = new Date(c.plano_vencimento); venc.setHours(0, 0, 0, 0)
      const diff = Math.round((venc - hoje) / (1000 * 60 * 60 * 24))
      return diff >= -3 && diff <= -1
    })
  }, [clientes])

  const listaAlvo = (() => {
    switch (grupoOrigem) {
      case 'churn': return exPaganteLista
      case 'venc_d3': return vencimentoD3Lista
      case 'venc_hoje': return vencimentoHojeLista
      case 'venc_vencido': return vencimentoVencidoLista
      default: return trialNuncaPagouLista
    }
  })()

  const isLembrete = grupoOrigem.startsWith('venc_')

  const grupoVisual = {
    trial: { titulo: 'Recuperar Trials Expirados', icone: 'mdi:rocket-launch', cor: '#ef4444', bg: '#fef2f2' },
    churn: { titulo: 'Reativar Ex-Pagantes', icone: 'mdi:account-reactivate', cor: '#7c3aed', bg: '#f5f3ff' },
    venc_d3: { titulo: 'Lembrete — Vence em 3 dias', icone: 'mdi:calendar-arrow-right', cor: '#f59e0b', bg: '#fffbeb' },
    venc_hoje: { titulo: 'Lembrete — Vence hoje', icone: 'mdi:calendar-today', cor: '#f97316', bg: '#fff7ed' },
    venc_vencido: { titulo: 'Lembrete — Plano vencido', icone: 'mdi:calendar-alert', cor: '#dc2626', bg: '#fef2f2' }
  }[grupoOrigem] || { titulo: 'Recuperação', icone: 'mdi:rocket-launch', cor: '#ef4444', bg: '#fef2f2' }

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
    else if (filtro === 'trial_nunca_pagou') result = result.filter(c => !c.plano_pago && c.trial_fim && new Date(c.trial_fim) <= hoje && !everPaidSet.has(c.id))
    else if (filtro === 'ex_pagante') result = result.filter(c => !c.plano_pago && everPaidSet.has(c.id))
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
  }, [clientes, filtro, filtroMes, buscaTexto, ordenacao, everPaidSet])

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

  const dispararRecuperacaoTrial = async () => {
    const alvos = listaAlvo.filter(c => selecionados.has(c.id))
    if (alvos.length === 0) {
      setResultadoRecuperacao({ sucesso: false, erro: 'Selecione ao menos um usuário.' })
      return
    }
    setEnviandoRecuperacao(true)
    setResultadoRecuperacao(null)
    try {
      const { data: configData, error: configError } = await supabase
        .from('config')
        .select('chave, valor')
        .in('chave', ['n8n_webhook_recuperar_trial', 'evolution_api_url', 'evolution_api_key'])
      if (configError) throw configError

      const cfg = Object.fromEntries((configData || []).map(c => [c.chave, c.valor]))
      const webhookUrl = cfg.n8n_webhook_recuperar_trial
      if (!webhookUrl) {
        throw new Error('Webhook não configurado. Adicione a chave "n8n_webhook_recuperar_trial" na tabela config com a URL do fluxo n8n.')
      }
      if (!cfg.evolution_api_url || !cfg.evolution_api_key) {
        throw new Error('Credenciais Evolution não encontradas. Verifique as chaves "evolution_api_url" e "evolution_api_key" na tabela config.')
      }

      const ofertaLabels = {
        trial: {
          extensao_7_dias: 'Extensão de 7 dias',
          extensao_14_dias: 'Extensão de 14 dias',
          desconto_50_1mes: '50% off no 1º mês',
          desconto_30_3meses: '30% off por 3 meses'
        },
        churn: {
          extensao_7_dias: '7 dias grátis pra voltar',
          extensao_14_dias: '14 dias grátis pra voltar',
          desconto_50_proximo_mes: '50% off no próximo mês',
          desconto_30_proximo_mes: '30% off no próximo mês'
        }
      }

      const grupoMeta = {
        trial: { tipoLog: 'retencao_b', flag: 'retencao_b_enviado_em', rotulo: 'Recuperação trial' },
        churn: { tipoLog: 'retencao_c1', flag: 'retencao_c1_enviado_em', rotulo: 'Reativação ex-pagante' },
        venc_d3: { tipoLog: 'venc_d3', flag: null, rotulo: 'Lembrete vencimento (3 dias antes)' },
        venc_hoje: { tipoLog: 'venc_hoje', flag: null, rotulo: 'Lembrete vencimento (hoje)' },
        venc_vencido: { tipoLog: 'venc_vencido', flag: null, rotulo: 'Lembrete vencimento (vencido)' }
      }

      const meta = grupoMeta[grupoOrigem] || grupoMeta.trial
      const labelDaOferta = isLembrete ? null : (ofertaLabels[grupoOrigem]?.[tipoOferta] || tipoOferta)

      const payload = {
        grupo: grupoOrigem,
        ...(isLembrete ? {} : { oferta: tipoOferta, oferta_label: labelDaOferta }),
        evolution_api_url: cfg.evolution_api_url,
        evolution_api_key: cfg.evolution_api_key,
        chave_pix: chavePix || '',
        total: alvos.length,
        disparado_em: new Date().toISOString(),
        disparado_por: userId,
        usuarios: alvos.map(c => {
          const planoKey = c.plano || 'starter'
          return {
            id: c.id,
            email: c.email,
            nome_completo: c.nome_completo,
            nome_empresa: c.nome_empresa,
            telefone: c.telefone || c.mz?.telefone || c.mz?.whatsapp_numero,
            trial_fim: c.trial_fim,
            plano: planoKey,
            plano_nome: NOMES_PLANO[planoKey] || 'Starter',
            plano_valor: PRECOS_PLANO[planoKey] || PRECOS_PLANO.starter,
            plano_vencimento: c.plano_vencimento,
            created_at: c.created_at
          }
        })
      }

      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
      if (!response.ok) throw new Error(`Webhook respondeu HTTP ${response.status}`)

      const logs = alvos.map(c => ({
        usuario_id: c.id,
        tipo: meta.tipoLog,
        mensagem: isLembrete ? meta.rotulo : `${meta.rotulo} - ${labelDaOferta}`,
        canal: 'n8n_bulk',
        status: 'enviado',
        enviado_por: userId
      }))
      await supabase.from('retencao_saas_envios').insert(logs)

      // Lembretes não atualizam flag — podem reenviar no próximo ciclo
      if (meta.flag) {
        const ids = alvos.map(c => c.id)
        await supabase
          .from('usuarios')
          .update({ [meta.flag]: new Date().toISOString() })
          .in('id', ids)
      }

      setResultadoRecuperacao({ sucesso: true, total: alvos.length })
    } catch (err) {
      setResultadoRecuperacao({ sucesso: false, erro: err.message })
    } finally {
      setEnviandoRecuperacao(false)
    }
  }

  const isoParaInputDate = (iso) => {
    if (!iso) return ''
    const d = new Date(iso)
    if (isNaN(d.getTime())) return ''
    const ano = d.getFullYear()
    const mes = String(d.getMonth() + 1).padStart(2, '0')
    const dia = String(d.getDate()).padStart(2, '0')
    return `${ano}-${mes}-${dia}`
  }

  const abrirEdicao = (cliente) => {
    setClienteEditando(cliente)
    setEditForm({
      plano_pago: !!cliente.plano_pago,
      plano: cliente.plano || 'starter',
      plano_vencimento: isoParaInputDate(cliente.plano_vencimento),
      trial_fim: isoParaInputDate(cliente.trial_fim)
    })
    setResultadoEdicao(null)
  }

  const salvarEdicao = async () => {
    if (!clienteEditando) return
    setSalvandoEdicao(true)
    setResultadoEdicao(null)
    try {
      const updates = {
        plano_pago: editForm.plano_pago,
        plano: editForm.plano,
        plano_vencimento: editForm.plano_vencimento || null,
        trial_fim: editForm.trial_fim || null
      }
      const { error } = await supabase
        .from('usuarios')
        .update(updates)
        .eq('id', clienteEditando.id)
      if (error) throw error

      setClientes(prev => prev.map(c => c.id === clienteEditando.id ? { ...c, ...updates } : c))
      setResultadoEdicao({ sucesso: true })
      setTimeout(() => {
        setClienteEditando(null)
        setResultadoEdicao(null)
      }, 900)
    } catch (err) {
      setResultadoEdicao({ sucesso: false, erro: err.message })
    } finally {
      setSalvandoEdicao(false)
    }
  }

  if (userLoading) return null

  const kpiCards = [
    { label: 'Total de Clientes', valor: kpis.total, icon: 'mdi:account-group', cor: '#667eea', bg: '#f0f4ff' },
    { label: 'Planos Pagos', valor: kpis.pagos, icon: 'mdi:check-decagram', cor: '#4CAF50', bg: '#e8f5e9' },
    { label: 'Em Trial', valor: kpis.emTrial, icon: 'mdi:clock-outline', cor: '#ff9800', bg: '#fff3e0' },
    { label: 'Expirados (total)', valor: kpis.trialNuncaPagou + kpis.exPagante, icon: 'mdi:alert-circle', cor: '#f44336', bg: '#ffebee' },
    { label: 'WhatsApp Conectado', valor: kpis.whatsappConectado, icon: 'mdi:whatsapp', cor: '#25D366', bg: '#e8f5e9' },
    { label: 'Mensagens no Mês', valor: kpis.mensagensMes.toLocaleString('pt-BR'), icon: 'mdi:message-text', cor: '#2196F3', bg: '#e3f2fd' }
  ]

  const filtros = [
    { key: 'todos', label: 'Todos', count: kpis.total, cor: '#667eea' },
    { key: 'pagos', label: 'Pagos', count: kpis.pagos, cor: '#4CAF50' },
    { key: 'trial', label: 'Trial', count: kpis.emTrial, cor: '#ff9800' },
    { key: 'trial_nunca_pagou', label: 'Trial expirou', count: kpis.trialNuncaPagou, cor: '#f44336' },
    { key: 'ex_pagante', label: 'Churn', count: kpis.exPagante, cor: '#7c3aed' },
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

      {/* Foco em Retenção */}
      <div style={{
        backgroundColor: 'white', padding: isMobile ? '16px' : '20px',
        borderRadius: '12px', border: '1px solid #e0e0e0', marginBottom: '24px'
      }}>
        <h3 style={{ fontSize: '15px', fontWeight: '600', color: '#333', margin: '0 0 16px 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Icon icon="mdi:account-reactivate" width="20" style={{ color: '#7c3aed' }} />
          Foco em Retenção
        </h3>

        <div style={{
          display: 'grid',
          gridTemplateColumns: isMobile ? '1fr' : isSmallScreen ? '1fr' : 'repeat(3, 1fr)',
          gap: isMobile ? '12px' : '16px'
        }}>
          {/* Taxa de Conversão de Trial */}
          <div style={{ padding: '16px', borderRadius: '10px', backgroundColor: '#f0fdf4', borderLeft: '3px solid #16a34a' }}>
            <div style={{ fontSize: '12px', color: '#666', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Icon icon="mdi:swap-horizontal-bold" width="16" style={{ color: '#16a34a' }} />
              Taxa de Conversão de Trial
            </div>
            <div style={{ fontSize: isMobile ? '26px' : '30px', fontWeight: 'bold', color: '#333', lineHeight: 1.1 }}>
              {kpis.taxaConversao.toFixed(1)}%
            </div>
            <div style={{ fontSize: '11px', color: '#666', marginTop: '6px' }}>
              {kpis.converteramAlgumaVez} converteram de {kpis.trialsTerminados} trials concluídos
            </div>
            <div style={{ marginTop: '10px', height: '6px', backgroundColor: '#dcfce7', borderRadius: '3px', overflow: 'hidden' }}>
              <div style={{
                width: `${Math.min(kpis.taxaConversao, 100)}%`, height: '100%',
                backgroundColor: '#16a34a', borderRadius: '3px', transition: 'width 0.4s ease'
              }} />
            </div>
            <div style={{ fontSize: '11px', color: '#999', marginTop: '8px' }}>
              {kpis.taxaConversao >= 30
                ? 'Saudável — benchmark SaaS B2B é 25–30%'
                : kpis.taxaConversao >= 15
                ? 'Em linha com a média — espaço pra melhorar onboarding'
                : 'Abaixo do benchmark — investigue fricção no trial'}
            </div>
          </div>

          {/* Trial nunca pagou */}
          <div style={{ padding: '16px', borderRadius: '10px', backgroundColor: '#fef2f2', borderLeft: '3px solid #ef4444', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: '12px', color: '#666', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Icon icon="mdi:account-clock" width="16" style={{ color: '#ef4444' }} />
                Trial expirou (nunca pagou)
              </div>
              <div style={{ fontSize: isMobile ? '26px' : '30px', fontWeight: 'bold', color: '#333', lineHeight: 1.1 }}>
                {kpis.trialNuncaPagou}
              </div>
              <div style={{ fontSize: '11px', color: '#666', marginTop: '6px' }}>
                Conheceram o produto mas não converteram — oferte extensão ou desconto
              </div>
            </div>
            <button
              onClick={() => {
                setGrupoOrigem('trial')
                setTipoOferta('extensao_14_dias')
                setResultadoRecuperacao(null)
                setBuscaModal('')
                setSelecionados(new Set(trialNuncaPagouLista.map(c => c.id)))
                setRecuperarModal(true)
              }}
              disabled={kpis.trialNuncaPagou === 0}
              style={{
                marginTop: '12px', padding: '10px 16px', borderRadius: '8px', border: 'none',
                backgroundColor: kpis.trialNuncaPagou === 0 ? '#d1d5db' : '#ef4444',
                color: 'white', fontWeight: '600', fontSize: '13px',
                cursor: kpis.trialNuncaPagou === 0 ? 'not-allowed' : 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px'
              }}
            >
              <Icon icon="mdi:rocket-launch" width="16" />
              Recuperar {kpis.trialNuncaPagou} trial{kpis.trialNuncaPagou !== 1 ? 's' : ''}
            </button>
          </div>

          {/* Ex-pagante / Churn */}
          <div style={{ padding: '16px', borderRadius: '10px', backgroundColor: '#f5f3ff', borderLeft: '3px solid #7c3aed', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: '12px', color: '#666', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Icon icon="mdi:account-reactivate" width="16" style={{ color: '#7c3aed' }} />
                Ex-pagante (churn)
              </div>
              <div style={{ fontSize: isMobile ? '26px' : '30px', fontWeight: 'bold', color: '#333', lineHeight: 1.1 }}>
                {kpis.exPagante}
              </div>
              <div style={{ fontSize: '11px', color: '#666', marginTop: '6px' }}>
                Já pagaram antes — reativar tem custo de aquisição zero
              </div>
            </div>
            <button
              onClick={() => {
                setGrupoOrigem('churn')
                setTipoOferta('extensao_14_dias')
                setResultadoRecuperacao(null)
                setBuscaModal('')
                setSelecionados(new Set(exPaganteLista.map(c => c.id)))
                setRecuperarModal(true)
              }}
              disabled={kpis.exPagante === 0}
              style={{
                marginTop: '12px', padding: '10px 16px', borderRadius: '8px', border: 'none',
                backgroundColor: kpis.exPagante === 0 ? '#d1d5db' : '#7c3aed',
                color: 'white', fontWeight: '600', fontSize: '13px',
                cursor: kpis.exPagante === 0 ? 'not-allowed' : 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px'
              }}
            >
              <Icon icon="mdi:account-reactivate" width="16" />
              Reativar {kpis.exPagante} ex-pagante{kpis.exPagante !== 1 ? 's' : ''}
            </button>
          </div>
        </div>
      </div>

      {/* Lembretes de Vencimento */}
      <div style={{
        backgroundColor: 'white', padding: isMobile ? '16px' : '20px',
        borderRadius: '12px', border: '1px solid #e0e0e0', marginBottom: '24px'
      }}>
        <h3 style={{ fontSize: '15px', fontWeight: '600', color: '#333', margin: '0 0 4px 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Icon icon="mdi:calendar-clock" width="20" style={{ color: '#f97316' }} />
          Lembretes de Vencimento
        </h3>
        <p style={{ fontSize: '12px', color: '#666', margin: '0 0 16px 0' }}>
          Mesma cadência do sistema (3d antes / hoje / vencido), mas com botão pra você decidir quando disparar
        </p>

        <div style={{
          display: 'grid',
          gridTemplateColumns: isMobile ? '1fr' : isSmallScreen ? '1fr' : 'repeat(3, 1fr)',
          gap: isMobile ? '12px' : '16px'
        }}>
          {[
            {
              key: 'venc_d3',
              titulo: 'Vence em 3 dias',
              icone: 'mdi:calendar-arrow-right',
              cor: '#f59e0b',
              bg: '#fffbeb',
              count: vencimentoD3Lista.length,
              lista: vencimentoD3Lista,
              helper: 'Antecipa pagamento — evita interrupção do serviço',
              corBotao: '#f59e0b'
            },
            {
              key: 'venc_hoje',
              titulo: 'Vence hoje',
              icone: 'mdi:calendar-today',
              cor: '#f97316',
              bg: '#fff7ed',
              count: vencimentoHojeLista.length,
              lista: vencimentoHojeLista,
              helper: 'Lembrete crítico — paga hoje pra não perder acesso',
              corBotao: '#f97316'
            },
            {
              key: 'venc_vencido',
              titulo: 'Venceu (até 3d)',
              icone: 'mdi:calendar-alert',
              cor: '#dc2626',
              bg: '#fef2f2',
              count: vencimentoVencidoLista.length,
              lista: vencimentoVencidoLista,
              helper: 'Janela de recuperação rápida — antes de virar churn',
              corBotao: '#dc2626'
            }
          ].map(b => (
            <div key={b.key} style={{ padding: '16px', borderRadius: '10px', backgroundColor: b.bg, borderLeft: `3px solid ${b.cor}`, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontSize: '12px', color: '#666', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Icon icon={b.icone} width="16" style={{ color: b.cor }} />
                  {b.titulo}
                </div>
                <div style={{ fontSize: isMobile ? '26px' : '30px', fontWeight: 'bold', color: '#333', lineHeight: 1.1 }}>
                  {b.count}
                </div>
                <div style={{ fontSize: '11px', color: '#666', marginTop: '6px' }}>
                  {b.helper}
                </div>
              </div>
              <button
                onClick={() => {
                  setGrupoOrigem(b.key)
                  setResultadoRecuperacao(null)
                  setBuscaModal('')
                  setSelecionados(new Set(b.lista.map(c => c.id)))
                  setRecuperarModal(true)
                }}
                disabled={b.count === 0}
                style={{
                  marginTop: '12px', padding: '10px 16px', borderRadius: '8px', border: 'none',
                  backgroundColor: b.count === 0 ? '#d1d5db' : b.corBotao,
                  color: 'white', fontWeight: '600', fontSize: '13px',
                  cursor: b.count === 0 ? 'not-allowed' : 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px'
                }}
              >
                <Icon icon="mdi:whatsapp" width="16" />
                Avisar {b.count}
              </button>
            </div>
          ))}
        </div>
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
                  {['Empresa/Nome', 'Telefone', 'Email', 'User ID', 'Plano', 'Pagamento', 'Vencimento Plano', 'Criação da Conta', 'WhatsApp', 'Mensagens', 'Última Conexão', 'Ações'].map(col => (
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

                      {/* Ações */}
                      <td style={{ padding: '8px 6px' }}>
                        <button
                          onClick={() => abrirEdicao(cliente)}
                          title="Editar plano, vencimento e trial"
                          style={{
                            padding: '6px 10px', borderRadius: '6px',
                            border: '1px solid #d1d5db', backgroundColor: 'white',
                            color: '#667eea', cursor: 'pointer',
                            display: 'inline-flex', alignItems: 'center', gap: '4px',
                            fontSize: '12px', fontWeight: '500'
                          }}
                        >
                          <Icon icon="mdi:pencil" width="14" />
                          Editar
                        </button>
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

      {/* Retenção SaaS - painel de retenção manual */}
      <div style={{ marginTop: '40px' }}>
        <RetencaoSaas />
      </div>

      {/* Modal Recuperar Trial */}
      {recuperarModal && (
        <div
          onClick={() => !enviandoRecuperacao && setRecuperarModal(false)}
          style={{
            position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 10000, padding: '16px'
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              backgroundColor: 'white', borderRadius: '14px', width: '100%',
              maxWidth: '640px', maxHeight: '90vh', display: 'flex',
              flexDirection: 'column', boxShadow: '0 24px 48px rgba(0,0,0,0.2)'
            }}
          >
            <div style={{ padding: '20px 24px', borderBottom: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '18px', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Icon icon={grupoVisual.icone} width="22" style={{ color: grupoVisual.cor }} />
                  {grupoVisual.titulo}
                </h3>
                <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#666' }}>
                  {selecionados.size} de {listaAlvo.length} selecionado{selecionados.size !== 1 ? 's' : ''} ser{selecionados.size !== 1 ? 'ão' : 'á'} contatado{selecionados.size !== 1 ? 's' : ''} via n8n
                </p>
              </div>
              <button
                onClick={() => !enviandoRecuperacao && setRecuperarModal(false)}
                style={{ background: 'none', border: 'none', cursor: enviandoRecuperacao ? 'not-allowed' : 'pointer', padding: '4px', opacity: enviandoRecuperacao ? 0.4 : 1 }}
              >
                <Icon icon="mdi:close" width="22" style={{ color: '#666' }} />
              </button>
            </div>

            <div style={{ flex: 1, overflow: 'auto', padding: '20px 24px' }}>
              {!resultadoRecuperacao && (
                <>
                  {!isLembrete && (
                    <>
                      <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#344848', marginBottom: '8px' }}>
                        Escolha a oferta
                      </label>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '20px' }}>
                        {(grupoOrigem === 'churn' ? [
                          { id: 'extensao_7_dias', label: '7 dias grátis pra voltar', desc: 'Reativa o acesso por 1 semana — sem cobrança' },
                          { id: 'extensao_14_dias', label: '14 dias grátis pra voltar', desc: 'Reativa por 2 semanas — bom pra reengajar com calma' },
                          { id: 'desconto_50_proximo_mes', label: '50% OFF no próximo mês', desc: 'Reduz fricção financeira pro retorno imediato' },
                          { id: 'desconto_30_proximo_mes', label: '30% OFF no próximo mês', desc: 'Mesma promo aplicada no próximo mês de cobrança' }
                        ] : [
                          { id: 'extensao_7_dias', label: 'Extensão de 7 dias', desc: 'Mais tempo pra testar — sem custo pra você' },
                          { id: 'extensao_14_dias', label: 'Extensão de 14 dias', desc: 'Mais tempo + recomendado pra perfis indecisos' },
                          { id: 'desconto_50_1mes', label: '50% OFF no 1º mês', desc: 'Quebra de objeção financeira no curto prazo' },
                          { id: 'desconto_30_3meses', label: '30% OFF por 3 meses', desc: 'Maior LTV — boa pra trial expirado há mais tempo' }
                        ]).map(o => (
                          <label
                            key={o.id}
                            style={{
                              display: 'flex', alignItems: 'flex-start', gap: '10px',
                              padding: '12px', borderRadius: '8px', cursor: 'pointer',
                              border: tipoOferta === o.id ? `2px solid ${grupoVisual.cor}` : '1px solid #e5e7eb',
                              backgroundColor: tipoOferta === o.id ? grupoVisual.bg : 'white'
                            }}
                          >
                            <input
                              type="radio"
                              name="oferta"
                              value={o.id}
                              checked={tipoOferta === o.id}
                              onChange={(e) => setTipoOferta(e.target.value)}
                              style={{ marginTop: '2px', accentColor: grupoVisual.cor }}
                            />
                            <div>
                              <div style={{ fontSize: '14px', fontWeight: '600', color: '#1a1a1a' }}>{o.label}</div>
                              <div style={{ fontSize: '12px', color: '#666', marginTop: '2px' }}>{o.desc}</div>
                            </div>
                          </label>
                        ))}
                      </div>
                    </>
                  )}

                  {isLembrete && (
                    <div style={{ marginBottom: '20px', padding: '12px 14px', borderRadius: '8px', backgroundColor: grupoVisual.bg, border: `1px solid ${grupoVisual.cor}33`, fontSize: '13px', color: '#333' }}>
                      <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                        <Icon icon={grupoVisual.icone} width="18" style={{ color: grupoVisual.cor, flexShrink: 0, marginTop: '1px' }} />
                        <div>
                          Esse disparo envia um <strong>lembrete fixo</strong> (mensagem definida no n8n por bucket). Sem oferta — só o aviso de vencimento.
                        </div>
                      </div>
                    </div>
                  )}

                  {(() => {
                    const corAcento = grupoVisual.cor
                    const corBgSelecionado = grupoVisual.bg
                    const filtrados = listaAlvo.filter(u => {
                      if (!buscaModal) return true
                      const q = buscaModal.toLowerCase()
                      return (
                        u.nome_empresa?.toLowerCase().includes(q) ||
                        u.nome_completo?.toLowerCase().includes(q) ||
                        u.email?.toLowerCase().includes(q)
                      )
                    })
                    const idsFiltrados = filtrados.map(u => u.id)
                    const todosFiltradosSelecionados = idsFiltrados.length > 0 && idsFiltrados.every(id => selecionados.has(id))

                    const toggle = (id) => {
                      const novo = new Set(selecionados)
                      if (novo.has(id)) novo.delete(id); else novo.add(id)
                      setSelecionados(novo)
                    }
                    const toggleTodos = () => {
                      const novo = new Set(selecionados)
                      if (todosFiltradosSelecionados) {
                        idsFiltrados.forEach(id => novo.delete(id))
                      } else {
                        idsFiltrados.forEach(id => novo.add(id))
                      }
                      setSelecionados(novo)
                    }

                    return (
                      <div style={{ marginBottom: '8px' }}>
                        <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#344848', marginBottom: '8px' }}>
                          Selecione quem deve receber
                        </label>

                        <div style={{ display: 'flex', gap: '8px', marginBottom: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
                          <input
                            type="text"
                            value={buscaModal}
                            onChange={(e) => setBuscaModal(e.target.value)}
                            placeholder="Buscar por nome, empresa ou email..."
                            style={{
                              flex: 1, minWidth: '180px', padding: '8px 12px',
                              border: '1px solid #d1d5db', borderRadius: '6px',
                              fontSize: '13px', boxSizing: 'border-box'
                            }}
                          />
                          <button
                            type="button"
                            onClick={toggleTodos}
                            disabled={idsFiltrados.length === 0}
                            style={{
                              padding: '8px 12px', borderRadius: '6px',
                              border: '1px solid #d1d5db', backgroundColor: 'white',
                              fontSize: '12px', fontWeight: '600', color: '#374151',
                              cursor: idsFiltrados.length === 0 ? 'not-allowed' : 'pointer',
                              opacity: idsFiltrados.length === 0 ? 0.5 : 1, whiteSpace: 'nowrap'
                            }}
                          >
                            {todosFiltradosSelecionados ? 'Desmarcar todos' : 'Selecionar todos'}
                          </button>
                        </div>

                        <div style={{ maxHeight: '240px', overflow: 'auto', border: '1px solid #e5e7eb', borderRadius: '8px' }}>
                          {filtrados.length === 0 ? (
                            <div style={{ padding: '20px', textAlign: 'center', fontSize: '12px', color: '#999' }}>
                              Nenhum usuário corresponde à busca
                            </div>
                          ) : filtrados.map((u, i) => {
                            const checked = selecionados.has(u.id)
                            const tel = u.telefone || u.mz?.telefone || u.mz?.whatsapp_numero
                            const semTel = !tel
                            return (
                              <label
                                key={u.id}
                                style={{
                                  display: 'flex', alignItems: 'center', gap: '10px',
                                  padding: '10px 12px', cursor: 'pointer',
                                  borderBottom: i < filtrados.length - 1 ? '1px solid #f3f4f6' : 'none',
                                  backgroundColor: checked ? corBgSelecionado : 'white'
                                }}
                                onMouseEnter={e => { if (!checked) e.currentTarget.style.backgroundColor = '#fafafa' }}
                                onMouseLeave={e => { if (!checked) e.currentTarget.style.backgroundColor = 'white' }}
                              >
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={() => toggle(u.id)}
                                  style={{ accentColor: corAcento, cursor: 'pointer', flexShrink: 0 }}
                                />
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <div style={{ fontSize: '13px', fontWeight: '500', color: '#1a1a1a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                    {u.nome_empresa || u.nome_completo || 'Sem nome'}
                                  </div>
                                  <div style={{ fontSize: '11px', color: '#666', marginTop: '2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                    {u.email}
                                    {tel && <span style={{ marginLeft: '8px' }}>· {tel}</span>}
                                    {semTel && <span style={{ marginLeft: '8px', color: '#dc2626', fontWeight: '500' }}>· sem telefone</span>}
                                  </div>
                                </div>
                              </label>
                            )
                          })}
                        </div>
                        <div style={{ fontSize: '11px', color: '#999', marginTop: '6px', textAlign: 'right' }}>
                          {selecionados.size} de {listaAlvo.length} selecionado{selecionados.size !== 1 ? 's' : ''}
                        </div>
                      </div>
                    )
                  })()}

                  <div style={{ marginTop: '14px', padding: '10px 12px', borderRadius: '8px', backgroundColor: '#fffbeb', border: '1px solid #fde68a', fontSize: '12px', color: '#92400e', display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                    <Icon icon="mdi:information-outline" width="16" style={{ flexShrink: 0, marginTop: '1px' }} />
                    <span>
                      O fluxo n8n receberá o payload via webhook configurado em <code style={{ backgroundColor: '#fef3c7', padding: '1px 5px', borderRadius: '3px' }}>config.n8n_webhook_recuperar_trial</code>. Disparos são logados em <code style={{ backgroundColor: '#fef3c7', padding: '1px 5px', borderRadius: '3px' }}>retencao_saas_envios</code>.
                    </span>
                  </div>
                </>
              )}

              {resultadoRecuperacao?.sucesso && (
                <div style={{ padding: '16px', borderRadius: '8px', backgroundColor: '#f0fdf4', border: '1px solid #86efac', textAlign: 'center' }}>
                  <Icon icon="mdi:check-circle" width="40" style={{ color: '#16a34a' }} />
                  <div style={{ fontSize: '15px', fontWeight: '600', color: '#15803d', marginTop: '8px' }}>
                    Fluxo disparado com sucesso!
                  </div>
                  <div style={{ fontSize: '13px', color: '#166534', marginTop: '4px' }}>
                    {resultadoRecuperacao.total} usuário{resultadoRecuperacao.total !== 1 ? 's' : ''} enviado{resultadoRecuperacao.total !== 1 ? 's' : ''} pro n8n
                  </div>
                </div>
              )}

              {resultadoRecuperacao && !resultadoRecuperacao.sucesso && (
                <div style={{ padding: '16px', borderRadius: '8px', backgroundColor: '#fef2f2', border: '1px solid #fca5a5' }}>
                  <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                    <Icon icon="mdi:alert-circle" width="22" style={{ color: '#dc2626', flexShrink: 0 }} />
                    <div>
                      <div style={{ fontSize: '14px', fontWeight: '600', color: '#991b1b' }}>Falha ao disparar</div>
                      <div style={{ fontSize: '12px', color: '#7f1d1d', marginTop: '4px' }}>{resultadoRecuperacao.erro}</div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div style={{ padding: '16px 24px', borderTop: '1px solid #e5e7eb', display: 'flex', justifyContent: 'flex-end', gap: '8px', backgroundColor: '#fafafa' }}>
              <button
                onClick={() => setRecuperarModal(false)}
                disabled={enviandoRecuperacao}
                style={{
                  padding: '10px 18px', backgroundColor: 'white', color: '#666',
                  border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '14px',
                  fontWeight: '500', cursor: enviandoRecuperacao ? 'not-allowed' : 'pointer',
                  opacity: enviandoRecuperacao ? 0.5 : 1
                }}
              >
                {resultadoRecuperacao?.sucesso ? 'Fechar' : 'Cancelar'}
              </button>
              {!resultadoRecuperacao?.sucesso && (
                <button
                  onClick={dispararRecuperacaoTrial}
                  disabled={enviandoRecuperacao || selecionados.size === 0}
                  style={{
                    padding: '10px 24px',
                    backgroundColor: selecionados.size === 0 ? '#d1d5db' : grupoVisual.cor,
                    color: 'white', border: 'none', borderRadius: '8px',
                    fontSize: '14px', fontWeight: '600',
                    cursor: enviandoRecuperacao || selecionados.size === 0 ? 'not-allowed' : 'pointer',
                    opacity: enviandoRecuperacao ? 0.6 : 1,
                    display: 'flex', alignItems: 'center', gap: '6px'
                  }}
                >
                  {enviandoRecuperacao ? (
                    <><Icon icon="mdi:loading" width="16" style={{ animation: 'spin 1s linear infinite' }} /> Disparando...</>
                  ) : resultadoRecuperacao && !resultadoRecuperacao.sucesso ? (
                    <><Icon icon="mdi:refresh" width="16" /> Tentar novamente</>
                  ) : (
                    <><Icon icon="mdi:rocket-launch" width="16" /> Disparar para {selecionados.size}</>
                  )}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal Editar Cliente (admin) */}
      {clienteEditando && (
        <div
          onClick={() => !salvandoEdicao && setClienteEditando(null)}
          style={{
            position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 10001, padding: '16px'
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              backgroundColor: 'white', borderRadius: '14px', width: '100%',
              maxWidth: '460px', boxShadow: '0 24px 48px rgba(0,0,0,0.2)',
              display: 'flex', flexDirection: 'column'
            }}
          >
            <div style={{ padding: '18px 22px', borderBottom: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '17px', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Icon icon="mdi:account-edit" width="22" style={{ color: '#667eea' }} />
                  Editar cliente
                </h3>
                <p style={{ margin: '4px 0 0', fontSize: '12px', color: '#666' }}>
                  {clienteEditando.nome_empresa || clienteEditando.nome_completo || clienteEditando.email}
                </p>
              </div>
              <button
                onClick={() => !salvandoEdicao && setClienteEditando(null)}
                disabled={salvandoEdicao}
                style={{ background: 'none', border: 'none', cursor: salvandoEdicao ? 'not-allowed' : 'pointer', padding: '4px', opacity: salvandoEdicao ? 0.4 : 1 }}
              >
                <Icon icon="mdi:close" width="22" style={{ color: '#666' }} />
              </button>
            </div>

            <div style={{ padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {/* Pago */}
              <label style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '12px 14px', borderRadius: '8px',
                backgroundColor: editForm.plano_pago ? '#e8f5e9' : '#f8f9fa',
                border: `1px solid ${editForm.plano_pago ? '#4CAF50' : '#e5e7eb'}`,
                cursor: 'pointer'
              }}>
                <div>
                  <div style={{ fontSize: '14px', fontWeight: '600', color: '#333' }}>
                    Marcar como pago
                  </div>
                  <div style={{ fontSize: '12px', color: '#666', marginTop: '2px' }}>
                    Libera o sistema completo (sem trial)
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={editForm.plano_pago}
                  onChange={(e) => setEditForm(s => ({ ...s, plano_pago: e.target.checked }))}
                  style={{ width: '20px', height: '20px', accentColor: '#4CAF50', cursor: 'pointer' }}
                />
              </label>

              {/* Plano */}
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#344848', marginBottom: '6px' }}>
                  Plano
                </label>
                <select
                  value={editForm.plano}
                  onChange={(e) => setEditForm(s => ({ ...s, plano: e.target.value }))}
                  style={{
                    width: '100%', padding: '10px 12px', border: '1px solid #d1d5db',
                    borderRadius: '8px', fontSize: '14px', backgroundColor: 'white', boxSizing: 'border-box'
                  }}
                >
                  <option value="starter">Starter — R$ 49,90</option>
                  <option value="pro">Pro — R$ 99,90</option>
                  <option value="premium">Premium — R$ 149,90</option>
                </select>
              </div>

              {/* Vencimento do plano */}
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#344848', marginBottom: '6px' }}>
                  Vencimento do plano
                </label>
                <input
                  type="date"
                  value={editForm.plano_vencimento}
                  onChange={(e) => setEditForm(s => ({ ...s, plano_vencimento: e.target.value }))}
                  style={{
                    width: '100%', padding: '10px 12px', border: '1px solid #d1d5db',
                    borderRadius: '8px', fontSize: '14px', backgroundColor: 'white', boxSizing: 'border-box'
                  }}
                />
                <div style={{ fontSize: '11px', color: '#999', marginTop: '4px' }}>
                  Quando o plano ativo expira (aplicável a clientes pagos)
                </div>
              </div>

              {/* Fim do trial */}
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#344848', marginBottom: '6px' }}>
                  Fim do trial
                </label>
                <input
                  type="date"
                  value={editForm.trial_fim}
                  onChange={(e) => setEditForm(s => ({ ...s, trial_fim: e.target.value }))}
                  style={{
                    width: '100%', padding: '10px 12px', border: '1px solid #d1d5db',
                    borderRadius: '8px', fontSize: '14px', backgroundColor: 'white', boxSizing: 'border-box'
                  }}
                />
                <div style={{ fontSize: '11px', color: '#999', marginTop: '4px' }}>
                  Estende o período gratuito sem precisar marcar como pago
                </div>
              </div>

              {resultadoEdicao?.sucesso && (
                <div style={{
                  padding: '10px 12px', borderRadius: '8px',
                  backgroundColor: '#e8f5e9', border: '1px solid #4CAF50',
                  color: '#2e7d32', fontSize: '13px',
                  display: 'flex', alignItems: 'center', gap: '6px'
                }}>
                  <Icon icon="mdi:check-circle" width="18" /> Salvo com sucesso
                </div>
              )}

              {resultadoEdicao && !resultadoEdicao.sucesso && (
                <div style={{
                  padding: '10px 12px', borderRadius: '8px',
                  backgroundColor: '#ffebee', border: '1px solid #f44336',
                  color: '#c62828', fontSize: '13px'
                }}>
                  Erro ao salvar: {resultadoEdicao.erro}
                </div>
              )}
            </div>

            <div style={{ padding: '14px 22px', borderTop: '1px solid #e5e7eb', display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button
                onClick={() => setClienteEditando(null)}
                disabled={salvandoEdicao}
                style={{
                  padding: '10px 18px', backgroundColor: 'white', color: '#666',
                  border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '14px',
                  fontWeight: '500', cursor: salvandoEdicao ? 'not-allowed' : 'pointer',
                  opacity: salvandoEdicao ? 0.5 : 1
                }}
              >
                Cancelar
              </button>
              <button
                onClick={salvarEdicao}
                disabled={salvandoEdicao || resultadoEdicao?.sucesso}
                style={{
                  padding: '10px 22px', backgroundColor: '#667eea',
                  color: 'white', border: 'none', borderRadius: '8px',
                  fontSize: '14px', fontWeight: '600',
                  cursor: salvandoEdicao ? 'not-allowed' : 'pointer',
                  opacity: salvandoEdicao ? 0.6 : 1,
                  display: 'flex', alignItems: 'center', gap: '6px'
                }}
              >
                {salvandoEdicao ? (
                  <><Icon icon="mdi:loading" width="16" style={{ animation: 'spin 1s linear infinite' }} /> Salvando...</>
                ) : (
                  <><Icon icon="mdi:content-save" width="16" /> Salvar</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
