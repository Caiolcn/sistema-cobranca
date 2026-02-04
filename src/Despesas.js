import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from './supabaseClient'
import { Icon } from '@iconify/react'
import { showToast } from './Toast'
import ConfirmModal from './ConfirmModal'
import { SkeletonList, SkeletonTable, SkeletonCard } from './components/Skeleton'
import useWindowSize from './hooks/useWindowSize'
import { useUserPlan } from './hooks/useUserPlan'
import { useUser } from './contexts/UserContext'
import { exportarDespesas } from './utils/exportUtils'
import { gerarRelatorioDespesasPDF } from './utils/pdfGenerator'

export default function Despesas({ embedded = false }) {
  const navigate = useNavigate()
  const { isMobile, isTablet, isSmallScreen } = useWindowSize()
  const { isLocked, loading: loadingPlan } = useUserPlan()
  const { userId, nomeEmpresa, loading: loadingUser } = useUser()

  // Dados
  const [despesas, setDespesas] = useState([])
  const [despesasFiltradas, setDespesasFiltradas] = useState([])
  const [categorias, setCategorias] = useState([])
  const [loading, setLoading] = useState(true)

  // Filtros
  const [busca, setBusca] = useState('')
  const [buscaDebounced, setBuscaDebounced] = useState('')
  const [filtroCategoria, setFiltroCategoria] = useState('todos')
  const [filtroStatus, setFiltroStatus] = useState('todos')
  const [filtroDataInicio, setFiltroDataInicio] = useState('')
  const [filtroDataFim, setFiltroDataFim] = useState('')
  const [mostrarFiltros, setMostrarFiltros] = useState(false)

  // Paginação
  const [paginaAtual, setPaginaAtual] = useState(1)
  const itensPorPagina = 20

  // Modal de despesa (criar/editar)
  const [mostrarModalDespesa, setMostrarModalDespesa] = useState(false)
  const [despesaEditando, setDespesaEditando] = useState(null)

  // Campos do formulário
  const [formDescricao, setFormDescricao] = useState('')
  const [formValor, setFormValor] = useState('')
  const [formCategoriaId, setFormCategoriaId] = useState('')
  const [formDataVencimento, setFormDataVencimento] = useState('')
  const [formStatus, setFormStatus] = useState('pendente')
  const [formFormaPagamento, setFormFormaPagamento] = useState('')
  const [formObservacoes, setFormObservacoes] = useState('')
  const [formIsRecorrente, setFormIsRecorrente] = useState(false)
  const [formRecorrenciaTipo, setFormRecorrenciaTipo] = useState('mensal')
  const [salvando, setSalvando] = useState(false)

  // Confirmação de exclusão
  const [confirmDelete, setConfirmDelete] = useState({ show: false, despesa: null })
  const [confirmDesfazerPago, setConfirmDesfazerPago] = useState({ show: false, despesa: null })

  // Modal de categorias
  const [mostrarModalCategoria, setMostrarModalCategoria] = useState(false)
  const [novaCategoriaLabel, setNovaCategoriaLabel] = useState('')
  const [novaCategoriaCor, setNovaCategoriaCor] = useState('#666666')
  const [salvandoCategoria, setSalvandoCategoria] = useState(false)

  // Resumo
  const [totalPendente, setTotalPendente] = useState(0)
  const [totalPagoMes, setTotalPagoMes] = useState(0)
  const [totalMes, setTotalMes] = useState(0)
  const [quantidadePendente, setQuantidadePendente] = useState(0)
  const [quantidadePagoMes, setQuantidadePagoMes] = useState(0)
  const [percentualPago, setPercentualPago] = useState(0)
  const [percentualPendente, setPercentualPendente] = useState(0)
  const [vencemProximos7, setVencemProximos7] = useState(0)
  const [totalProximosVencimentos, setTotalProximosVencimentos] = useState(0)
  const [vencemHoje, setVencemHoje] = useState(0)

  const formatarMoeda = (valor) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valor || 0)
  }

  // ==================== CARREGAR DADOS ====================

  const carregarDados = useCallback(async () => {
    if (!userId) return
    setLoading(true)
    try {
      const [
        { data: despesasData, error: despesasError },
        { data: categoriasData, error: categoriasError }
      ] = await Promise.all([
        supabase
          .from('despesas')
          .select('*, categorias_despesas(nome, icone, cor)')
          .eq('user_id', userId)
          .order('data_vencimento', { ascending: false }),
        supabase
          .from('categorias_despesas')
          .select('*')
          .eq('user_id', userId)
          .eq('ativo', true)
          .order('nome', { ascending: true })
      ])

      if (despesasError) throw despesasError
      if (categoriasError) throw categoriasError

      setDespesas(despesasData || [])
      setCategorias(categoriasData || [])

      // Se não tem categorias, criar padrões
      if (!categoriasData || categoriasData.length === 0) {
        await seedCategoriasDefault()
      }
    } catch (error) {
      showToast('Erro ao carregar despesas: ' + error.message, 'error')
    } finally {
      setLoading(false)
    }
  }, [userId])

  const seedCategoriasDefault = async () => {
    const defaults = [
      { nome: 'Aluguel', icone: 'mdi:home-outline', cor: '#E91E63' },
      { nome: 'Salários', icone: 'mdi:account-group-outline', cor: '#9C27B0' },
      { nome: 'Internet/Telefone', icone: 'mdi:wifi', cor: '#2196F3' },
      { nome: 'Fornecedores', icone: 'mdi:truck-delivery-outline', cor: '#FF9800' },
      { nome: 'Marketing', icone: 'mdi:bullhorn-outline', cor: '#4CAF50' },
      { nome: 'Impostos', icone: 'mdi:file-document-outline', cor: '#f44336' },
      { nome: 'Água/Luz/Gás', icone: 'mdi:flash-outline', cor: '#FFC107' },
      { nome: 'Software/Assinaturas', icone: 'mdi:laptop', cor: '#00BCD4' },
      { nome: 'Material de Escritório', icone: 'mdi:pencil-outline', cor: '#795548' },
      { nome: 'Outros', icone: 'mdi:dots-horizontal-circle-outline', cor: '#607D8B' }
    ]
    const rows = defaults.map(d => ({ ...d, user_id: userId, is_default: true }))
    const { data, error } = await supabase.from('categorias_despesas').insert(rows).select()
    if (!error && data) setCategorias(data)
  }

  useEffect(() => {
    if (userId) carregarDados()
  }, [userId, carregarDados])

  // ==================== DEBOUNCE BUSCA ====================

  useEffect(() => {
    const timer = setTimeout(() => setBuscaDebounced(busca), 300)
    return () => clearTimeout(timer)
  }, [busca])

  // ==================== FILTROS ====================

  useEffect(() => {
    let resultado = [...despesas]

    if (buscaDebounced.trim()) {
      const termo = buscaDebounced.toLowerCase()
      resultado = resultado.filter(d =>
        d.descricao.toLowerCase().includes(termo) ||
        d.categorias_despesas?.nome?.toLowerCase().includes(termo)
      )
    }

    if (filtroCategoria !== 'todos') {
      resultado = resultado.filter(d => d.categoria_id === filtroCategoria)
    }

    if (filtroStatus !== 'todos') {
      resultado = resultado.filter(d => {
        if (filtroStatus === 'pendente') return d.status === 'pendente'
        if (filtroStatus === 'pago') return d.status === 'pago'
        if (filtroStatus === 'atrasado') {
          const hoje = new Date()
          hoje.setHours(0, 0, 0, 0)
          const venc = new Date(d.data_vencimento + 'T00:00:00')
          return d.status === 'pendente' && venc < hoje
        }
        return true
      })
    }

    if (filtroDataInicio) {
      resultado = resultado.filter(d => d.data_vencimento >= filtroDataInicio)
    }
    if (filtroDataFim) {
      resultado = resultado.filter(d => d.data_vencimento <= filtroDataFim)
    }

    setDespesasFiltradas(resultado)
    setPaginaAtual(1)
    calcularTotais(resultado)
  }, [despesas, buscaDebounced, filtroCategoria, filtroStatus, filtroDataInicio, filtroDataFim])

  const calcularTotais = (lista) => {
    const hoje = new Date()
    hoje.setHours(0, 0, 0, 0)
    const mesAtual = hoje.getMonth()
    const anoAtual = hoje.getFullYear()

    let pendente = 0
    let qtdPendente = 0
    let pagoMes = 0
    let qtdPagoMes = 0
    let totalDoMes = 0
    let qtdHoje = 0
    let qtd7Dias = 0
    let totalProx = 0

    lista.forEach(d => {
      const valor = parseFloat(d.valor) || 0
      const venc = new Date(d.data_vencimento + 'T00:00:00')
      const vencNoMes = venc.getMonth() === mesAtual && venc.getFullYear() === anoAtual
      const diffDias = Math.ceil((venc - hoje) / (1000 * 60 * 60 * 24))

      if (d.status === 'pendente') {
        pendente += valor
        qtdPendente++

        if (diffDias === 0) {
          qtdHoje++
          totalProx += valor
        }
        if (diffDias >= 0 && diffDias <= 7) {
          qtd7Dias++
        }
      }

      // Pago no Mês: usa data_pagamento (quando foi pago de fato)
      if (d.status === 'pago' && d.data_pagamento) {
        const pagto = new Date(d.data_pagamento + 'T00:00:00')
        if (pagto.getMonth() === mesAtual && pagto.getFullYear() === anoAtual) {
          pagoMes += valor
          qtdPagoMes++
        }
      }

      // Total do Mês: despesas com vencimento no mês
      if (vencNoMes) {
        totalDoMes += valor
      }
    })

    const total = lista.length || 1
    setTotalPendente(pendente)
    setQuantidadePendente(qtdPendente)
    setTotalPagoMes(pagoMes)
    setQuantidadePagoMes(qtdPagoMes)
    setTotalMes(totalDoMes)
    setPercentualPendente(Math.round((qtdPendente / total) * 100))
    setPercentualPago(totalDoMes > 0 ? Math.round((pagoMes / totalDoMes) * 100) : 0)
    setVencemHoje(qtdHoje)
    setVencemProximos7(qtd7Dias)
    setTotalProximosVencimentos(totalProx)
  }

  const temFiltrosAtivos = filtroCategoria !== 'todos' || filtroStatus !== 'todos' || filtroDataInicio !== '' || filtroDataFim !== '' || busca.trim() !== ''

  const limparFiltros = () => {
    setBusca('')
    setFiltroCategoria('todos')
    setFiltroStatus('todos')
    setFiltroDataInicio('')
    setFiltroDataFim('')
    setMostrarFiltros(false)
  }

  // Fechar popover ao clicar fora
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (mostrarFiltros && !event.target.closest('.popover-filtros-despesas') && !event.target.closest('.btn-filtrar-despesas')) {
        setMostrarFiltros(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [mostrarFiltros])

  // ==================== PAGINAÇÃO ====================

  const totalPaginas = Math.ceil(despesasFiltradas.length / itensPorPagina)
  const indiceInicio = (paginaAtual - 1) * itensPorPagina
  const indiceFim = indiceInicio + itensPorPagina
  const despesasPaginadas = despesasFiltradas.slice(indiceInicio, indiceFim)

  // ==================== CRUD ====================

  const abrirModalNovaDespesa = () => {
    setDespesaEditando(null)
    setFormDescricao('')
    setFormValor('')
    setFormCategoriaId(categorias.length > 0 ? categorias[0].id : '')
    setFormDataVencimento(new Date().toISOString().split('T')[0])
    setFormStatus('pendente')
    setFormFormaPagamento('')
    setFormObservacoes('')
    setFormIsRecorrente(false)
    setFormRecorrenciaTipo('mensal')
    setMostrarModalDespesa(true)
  }

  const abrirModalEditarDespesa = (despesa) => {
    setDespesaEditando(despesa)
    setFormDescricao(despesa.descricao)
    setFormValor(despesa.valor.toString())
    setFormCategoriaId(despesa.categoria_id || '')
    setFormDataVencimento(despesa.data_vencimento)
    setFormStatus(despesa.status)
    setFormFormaPagamento(despesa.forma_pagamento || '')
    setFormObservacoes(despesa.observacoes || '')
    setFormIsRecorrente(despesa.is_recorrente || false)
    setFormRecorrenciaTipo(despesa.recorrencia_tipo || 'mensal')
    setMostrarModalDespesa(true)
  }

  const fecharModalDespesa = () => {
    setMostrarModalDespesa(false)
    setDespesaEditando(null)
  }

  const handleSalvarDespesa = async () => {
    if (!formDescricao.trim()) {
      showToast('Informe a descrição da despesa', 'warning')
      return
    }
    if (!formValor || parseFloat(formValor) <= 0) {
      showToast('Informe um valor válido', 'warning')
      return
    }
    if (!formDataVencimento) {
      showToast('Informe a data de vencimento', 'warning')
      return
    }

    setSalvando(true)
    try {
      const dados = {
        user_id: userId,
        descricao: formDescricao.trim(),
        valor: parseFloat(formValor),
        categoria_id: formCategoriaId || null,
        data_vencimento: formDataVencimento,
        status: formStatus,
        forma_pagamento: formStatus === 'pago' ? (formFormaPagamento || null) : null,
        data_pagamento: formStatus === 'pago' ? new Date().toISOString().split('T')[0] : null,
        observacoes: formObservacoes.trim() || null,
        is_recorrente: formIsRecorrente,
        recorrencia_tipo: formIsRecorrente ? formRecorrenciaTipo : null
      }

      if (despesaEditando) {
        const { error } = await supabase
          .from('despesas')
          .update(dados)
          .eq('id', despesaEditando.id)
        if (error) throw error
        showToast('Despesa atualizada!', 'success')
      } else {
        const { error } = await supabase
          .from('despesas')
          .insert(dados)
        if (error) throw error
        showToast('Despesa criada!', 'success')
      }

      fecharModalDespesa()
      carregarDados()
    } catch (error) {
      showToast('Erro ao salvar: ' + error.message, 'error')
    } finally {
      setSalvando(false)
    }
  }

  const handleMarcarPago = async (despesa) => {
    // Se já está paga, pedir confirmação antes de desfazer
    if (despesa.status === 'pago') {
      setConfirmDesfazerPago({ show: true, despesa })
      return
    }

    try {
      const updateData = {
        status: 'pago',
        data_pagamento: new Date().toISOString().split('T')[0]
      }
      const { error } = await supabase
        .from('despesas')
        .update(updateData)
        .eq('id', despesa.id)
      if (error) throw error

      // Auto-gerar próxima despesa recorrente quando paga
      if (despesa.is_recorrente) {
        await criarProximaDespesaRecorrente(despesa)
      }

      showToast('Despesa marcada como paga!', 'success')
      carregarDados()
    } catch (error) {
      showToast('Erro ao atualizar: ' + error.message, 'error')
    }
  }

  const criarProximaDespesaRecorrente = async (despesaAtual) => {
    if (!despesaAtual.is_recorrente) return

    const dataAtual = new Date(despesaAtual.data_vencimento + 'T00:00:00')
    const proximoVencimento = new Date(dataAtual)

    if (despesaAtual.recorrencia_tipo === 'mensal') {
      proximoVencimento.setMonth(proximoVencimento.getMonth() + 1)
      if (proximoVencimento.getDate() !== dataAtual.getDate()) {
        proximoVencimento.setDate(0)
      }
    } else if (despesaAtual.recorrencia_tipo === 'semanal') {
      proximoVencimento.setDate(proximoVencimento.getDate() + 7)
    } else if (despesaAtual.recorrencia_tipo === 'anual') {
      proximoVencimento.setFullYear(proximoVencimento.getFullYear() + 1)
    }

    const proximoStr = proximoVencimento.toISOString().split('T')[0]

    // Verificar se já existe
    const { data: jaExiste } = await supabase
      .from('despesas')
      .select('id')
      .eq('user_id', userId)
      .eq('descricao', despesaAtual.descricao)
      .eq('data_vencimento', proximoStr)
      .maybeSingle()

    if (jaExiste) return

    const { error } = await supabase
      .from('despesas')
      .insert({
        user_id: userId,
        descricao: despesaAtual.descricao,
        valor: despesaAtual.valor,
        categoria_id: despesaAtual.categoria_id,
        data_vencimento: proximoStr,
        status: 'pendente',
        is_recorrente: true,
        recorrencia_tipo: despesaAtual.recorrencia_tipo,
        recorrencia_pai_id: despesaAtual.recorrencia_pai_id || despesaAtual.id,
        observacoes: despesaAtual.observacoes
      })

    if (!error) {
      const dataFormatada = proximoVencimento.toLocaleDateString('pt-BR')
      showToast(`Próxima despesa recorrente criada para ${dataFormatada}`, 'info')
    }
  }

  const confirmarExclusao = async () => {
    const despesa = confirmDelete.despesa
    if (!despesa) return
    try {
      const { error } = await supabase
        .from('despesas')
        .delete()
        .eq('id', despesa.id)
      if (error) throw error
      showToast('Despesa excluída!', 'success')
      setConfirmDelete({ show: false, despesa: null })
      carregarDados()
    } catch (error) {
      showToast('Erro ao excluir: ' + error.message, 'error')
    }
  }

  const confirmarDesfazerPago = async () => {
    const despesa = confirmDesfazerPago.despesa
    if (!despesa) return
    try {
      const { error } = await supabase
        .from('despesas')
        .update({ status: 'pendente', data_pagamento: null })
        .eq('id', despesa.id)
      if (error) throw error
      showToast('Pagamento desfeito!', 'success')
      setConfirmDesfazerPago({ show: false, despesa: null })
      carregarDados()
    } catch (error) {
      showToast('Erro ao desfazer: ' + error.message, 'error')
    }
  }

  // ==================== CATEGORIAS ====================

  const handleCriarCategoria = async () => {
    if (!novaCategoriaLabel.trim()) {
      showToast('Informe o nome da categoria', 'warning')
      return
    }
    setSalvandoCategoria(true)
    try {
      const { data, error } = await supabase
        .from('categorias_despesas')
        .insert({
          user_id: userId,
          nome: novaCategoriaLabel.trim(),
          cor: novaCategoriaCor,
          icone: 'mdi:tag-outline'
        })
        .select()
        .single()
      if (error) throw error
      setCategorias([...categorias, data])
      setFormCategoriaId(data.id)
      setNovaCategoriaLabel('')
      setNovaCategoriaCor('#666666')
      setMostrarModalCategoria(false)
      showToast('Categoria criada!', 'success')
    } catch (error) {
      showToast('Erro ao criar categoria: ' + error.message, 'error')
    } finally {
      setSalvandoCategoria(false)
    }
  }

  // ==================== STATUS BADGE ====================

  const getStatusDespesa = (despesa) => {
    if (despesa.status === 'pago') return 'pago'
    if (despesa.status === 'cancelado') return 'cancelado'
    const hoje = new Date()
    hoje.setHours(0, 0, 0, 0)
    const venc = new Date(despesa.data_vencimento + 'T00:00:00')
    if (despesa.status === 'pendente' && venc < hoje) return 'atrasado'
    return 'pendente'
  }

  const getStatusBadge = (despesa) => {
    const status = getStatusDespesa(despesa)
    const configs = {
      pago: { bg: '#4CAF50', text: 'Pago' },
      pendente: { bg: '#2196F3', text: 'Pendente' },
      atrasado: { bg: '#f44336', text: 'Atrasado' },
      cancelado: { bg: '#9e9e9e', text: 'Cancelado' }
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

  // ==================== EXPORTAR ====================

  const handleExportarCSV = () => {
    if (despesasFiltradas.length === 0) {
      showToast('Nenhuma despesa para exportar', 'warning')
      return
    }
    exportarDespesas(despesasFiltradas)
    showToast('CSV exportado!', 'success')
  }

  const handleExportarPDF = () => {
    if (despesasFiltradas.length === 0) {
      showToast('Nenhuma despesa para exportar', 'warning')
      return
    }
    const resumo = {
      totalPendente,
      totalPagoMes,
      totalMes,
      quantidadePendente,
      totalDespesas: despesasFiltradas.length
    }
    gerarRelatorioDespesasPDF(despesasFiltradas, resumo, nomeEmpresa)
    showToast('PDF gerado!', 'success')
  }

  // ==================== PLAN GATING ====================

  if (!loadingPlan && isLocked('pro')) {
    const lockContent = (
      <div style={{
        backgroundColor: 'white',
        borderRadius: '12px',
        padding: '60px 40px',
        textAlign: 'center',
        boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
        maxWidth: '500px',
        margin: '80px auto'
      }}>
        <div style={{
          width: '64px', height: '64px', borderRadius: '50%',
          backgroundColor: '#fff3e0', display: 'flex',
          alignItems: 'center', justifyContent: 'center',
          margin: '0 auto 20px auto'
        }}>
          <Icon icon="mdi:lock" width="32" height="32" style={{ color: '#ff9800' }} />
        </div>
        <h2 style={{ margin: '0 0 12px 0', fontSize: '22px', fontWeight: '600', color: '#1a1a1a' }}>
          Controle de Despesas
        </h2>
        <p style={{ margin: '0 0 24px 0', fontSize: '15px', color: '#666', lineHeight: '1.6' }}>
          Gerencie suas despesas, categorize gastos e exporte relatórios.
          Disponível no plano <strong>Pro</strong> ou superior.
        </p>
        <button
          onClick={() => navigate('/app/configuracao?aba=upgrade')}
          style={{
            padding: '12px 32px', backgroundColor: '#ff9800', color: 'white',
            border: 'none', borderRadius: '8px', fontSize: '15px',
            fontWeight: '600', cursor: 'pointer'
          }}
        >
          Fazer Upgrade
        </button>
      </div>
    )
    if (embedded) return lockContent
    return (
      <div style={{ flex: 1, padding: isSmallScreen ? '16px' : '25px 30px', backgroundColor: '#f5f5f5', minHeight: '100vh' }}>
        {lockContent}
      </div>
    )
  }

  // ==================== LOADING ====================

  if (loading || loadingUser) {
    const loadingContent = (
      <>
        <div style={{
          display: 'grid',
          gridTemplateColumns: isSmallScreen ? '1fr' : 'repeat(3, 1fr)',
          gap: '16px',
          marginBottom: '24px'
        }}>
          {Array.from({ length: 3 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
        {isSmallScreen ? (
          <SkeletonList count={8} />
        ) : (
          <SkeletonTable rows={10} columns={6} />
        )}
      </>
    )
    if (embedded) return loadingContent
    return (
      <div style={{ flex: 1, padding: isSmallScreen ? '16px' : '25px 30px', backgroundColor: '#f5f5f5', minHeight: '100vh' }}>
        {loadingContent}
      </div>
    )
  }

  // ==================== RENDER ====================

  const content = (
    <>
      {/* ========== HEADER ========== */}
      <div style={{
        backgroundColor: 'white',
        borderRadius: '8px',
        padding: isSmallScreen ? '16px' : '20px',
        marginBottom: isSmallScreen ? '12px' : '16px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.08)'
      }}>
        <div style={{ display: 'flex', flexDirection: isSmallScreen ? 'column' : 'row', justifyContent: 'space-between', alignItems: isSmallScreen ? 'stretch' : 'center', gap: isSmallScreen ? '16px' : '0' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: isSmallScreen ? '16px' : '18px', fontWeight: '600', color: '#344848' }}>
              Despesas
            </h2>
            <p style={{ margin: '5px 0 0 0', fontSize: isSmallScreen ? '13px' : '14px', color: '#666' }}>
              {despesasFiltradas.length} de {despesas.length} despesa(s)
            </p>
          </div>

          <div style={{ display: 'flex', gap: '8px', position: 'relative', justifyContent: isSmallScreen ? 'stretch' : 'flex-end', flexWrap: 'wrap' }}>
            {/* Exportar CSV */}
            <button
              onClick={handleExportarCSV}
              title="Exportar CSV"
              style={{
                padding: isSmallScreen ? '10px 14px' : '10px 20px',
                backgroundColor: 'white',
                color: '#333',
                border: '1px solid #ddd',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: '500',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                transition: 'all 0.2s',
                flex: isSmallScreen ? 1 : 'none'
              }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#344848'; e.currentTarget.style.color = '#344848' }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#ddd'; e.currentTarget.style.color = '#333' }}
            >
              <Icon icon="ph:export-light" width="18" height="18" />
            </button>

            {/* Filtrar */}
            <button
              className="btn-filtrar-despesas"
              onClick={() => setMostrarFiltros(!mostrarFiltros)}
              style={{
                padding: isSmallScreen ? '10px 14px' : '10px 20px',
                backgroundColor: temFiltrosAtivos ? '#344848' : 'white',
                color: temFiltrosAtivos ? 'white' : '#333',
                border: temFiltrosAtivos ? 'none' : '1px solid #ddd',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: '500',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                position: 'relative',
                transition: 'all 0.2s',
                flex: isSmallScreen ? 1 : 'none'
              }}
              onMouseEnter={(e) => { if (!temFiltrosAtivos) e.currentTarget.style.backgroundColor = '#f5f5f5' }}
              onMouseLeave={(e) => { if (!temFiltrosAtivos) e.currentTarget.style.backgroundColor = temFiltrosAtivos ? '#344848' : 'white' }}
            >
              <Icon icon="mdi:filter-outline" width="18" height="18" />
              {!isSmallScreen && 'Filtrar'}
              {temFiltrosAtivos && (
                <span style={{
                  position: 'absolute', top: '-6px', right: '-6px',
                  backgroundColor: '#f44336', color: 'white', borderRadius: '50%',
                  width: '20px', height: '20px', fontSize: '11px',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontWeight: '700', border: '2px solid white'
                }}>!</span>
              )}
            </button>

            {/* Nova Despesa */}
            <button
              onClick={abrirModalNovaDespesa}
              style={{
                padding: isSmallScreen ? '10px 14px' : '10px 20px',
                backgroundColor: '#344848',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: '500',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                transition: 'all 0.2s',
                flex: isSmallScreen ? 1 : 'none'
              }}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#2a3a3a'}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#344848'}
            >
              <Icon icon="mdi:plus" width="18" height="18" />
              {!isSmallScreen && 'Nova Despesa'}
            </button>

            {/* ========== POPOVER DE FILTROS ========== */}
            {mostrarFiltros && (
              <div
                className="popover-filtros-despesas"
                style={{
                  position: isSmallScreen ? 'fixed' : 'absolute',
                  top: isSmallScreen ? 0 : '50px',
                  right: isSmallScreen ? 0 : '0',
                  left: isSmallScreen ? 0 : 'auto',
                  bottom: isSmallScreen ? 0 : 'auto',
                  width: isSmallScreen ? '100%' : '340px',
                  height: isSmallScreen ? '100vh' : 'auto',
                  backgroundColor: 'white',
                  borderRadius: isSmallScreen ? 0 : '8px',
                  boxShadow: isSmallScreen ? 'none' : '0 4px 12px rgba(0,0,0,0.15)',
                  border: isSmallScreen ? 'none' : '1px solid #e0e0e0',
                  zIndex: 1001,
                  overflow: isSmallScreen ? 'auto' : 'hidden',
                  display: 'flex',
                  flexDirection: 'column'
                }}
              >
                {/* Header filtros mobile */}
                {isSmallScreen && (
                  <div style={{
                    padding: '16px 20px', borderBottom: '1px solid #e0e0e0',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    backgroundColor: 'white', position: 'sticky', top: 0, zIndex: 1
                  }}>
                    <h3 style={{ margin: 0, fontSize: '18px', fontWeight: '600', color: '#344848' }}>Filtros</h3>
                    <button onClick={() => setMostrarFiltros(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', display: 'flex', alignItems: 'center' }}>
                      <Icon icon="mdi:close" width="24" height="24" color="#666" />
                    </button>
                  </div>
                )}

                <div style={{ padding: '16px 20px' }}>
                  {/* Busca */}
                  <div style={{ marginBottom: '16px' }}>
                    <label style={{ fontSize: '13px', fontWeight: '600', color: '#344848', display: 'block', marginBottom: '6px' }}>Buscar</label>
                    <input
                      type="text"
                      placeholder="Descrição ou categoria..."
                      value={busca}
                      onChange={(e) => setBusca(e.target.value)}
                      style={{
                        width: '100%', padding: '10px 12px', border: '1px solid #ddd',
                        borderRadius: '6px', fontSize: '14px', outline: 'none',
                        boxSizing: 'border-box'
                      }}
                    />
                  </div>

                  {/* Categoria */}
                  <div style={{ marginBottom: '16px' }}>
                    <label style={{ fontSize: '13px', fontWeight: '600', color: '#344848', display: 'block', marginBottom: '6px' }}>Categoria</label>
                    <select
                      value={filtroCategoria}
                      onChange={(e) => setFiltroCategoria(e.target.value)}
                      style={{
                        width: '100%', padding: '10px 12px', border: '1px solid #ddd',
                        borderRadius: '6px', fontSize: '14px', outline: 'none',
                        boxSizing: 'border-box', backgroundColor: 'white'
                      }}
                    >
                      <option value="todos">Todas</option>
                      {categorias.map(cat => (
                        <option key={cat.id} value={cat.id}>{cat.nome}</option>
                      ))}
                    </select>
                  </div>

                  {/* Status */}
                  <div style={{ marginBottom: '16px' }}>
                    <label style={{ fontSize: '13px', fontWeight: '600', color: '#344848', display: 'block', marginBottom: '6px' }}>Status</label>
                    <select
                      value={filtroStatus}
                      onChange={(e) => setFiltroStatus(e.target.value)}
                      style={{
                        width: '100%', padding: '10px 12px', border: '1px solid #ddd',
                        borderRadius: '6px', fontSize: '14px', outline: 'none',
                        boxSizing: 'border-box', backgroundColor: 'white'
                      }}
                    >
                      <option value="todos">Todos</option>
                      <option value="pendente">Pendente</option>
                      <option value="pago">Pago</option>
                      <option value="atrasado">Atrasado</option>
                    </select>
                  </div>

                  {/* Período */}
                  <div style={{ marginBottom: '16px' }}>
                    <label style={{ fontSize: '13px', fontWeight: '600', color: '#344848', display: 'block', marginBottom: '6px' }}>Período</label>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <input
                        type="date"
                        value={filtroDataInicio}
                        onChange={(e) => setFiltroDataInicio(e.target.value)}
                        style={{
                          flex: 1, padding: '10px 8px', border: '1px solid #ddd',
                          borderRadius: '6px', fontSize: '13px', outline: 'none'
                        }}
                      />
                      <input
                        type="date"
                        value={filtroDataFim}
                        onChange={(e) => setFiltroDataFim(e.target.value)}
                        style={{
                          flex: 1, padding: '10px 8px', border: '1px solid #ddd',
                          borderRadius: '6px', fontSize: '13px', outline: 'none'
                        }}
                      />
                    </div>
                  </div>

                  {/* Limpar filtros */}
                  {temFiltrosAtivos && (
                    <button
                      onClick={limparFiltros}
                      style={{
                        width: '100%', padding: '10px', backgroundColor: '#344848',
                        color: 'white', border: 'none', borderRadius: '6px',
                        fontSize: '14px', cursor: 'pointer', fontWeight: '500',
                        transition: 'all 0.2s'
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#2a3a3a'}
                      onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#344848'}
                    >
                      Limpar filtros
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ========== CARDS DE INDICADORES ========== */}
      <div style={{
        backgroundColor: 'white',
        borderRadius: '8px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
        padding: isSmallScreen ? '16px' : '20px',
        marginBottom: isSmallScreen ? '16px' : '20px'
      }}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: isMobile ? '1fr' : isSmallScreen ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)',
          gap: isSmallScreen ? '12px' : '16px'
        }}>
          {/* Card 1: Pendente */}
          <div style={{
            flex: 1,
            padding: '14px 18px',
            borderLeft: '3px solid #f44336',
            backgroundColor: '#fff5f5',
            borderRadius: '8px',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <p style={{ fontSize: '13px', color: '#666', margin: '0 0 6px 0' }}>Pendente</p>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Icon icon="solar:danger-triangle-linear" width="18" height="18" style={{ color: '#f44336' }} />
                  <span style={{ fontSize: '20px', fontWeight: '700', color: '#344848' }}>
                    R$ {totalPendente.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
                <p style={{ fontSize: '12px', color: '#888', margin: '4px 0 0 0' }}>
                  {quantidadePendente} despesa{quantidadePendente !== 1 ? 's' : ''}
                </p>
              </div>
              <span style={{
                backgroundColor: '#f44336',
                color: 'white',
                padding: '4px 10px',
                borderRadius: '12px',
                fontSize: '12px',
                fontWeight: '600'
              }}>
                {percentualPendente}%
              </span>
            </div>
            <button
              onClick={() => setFiltroStatus('pendente')}
              style={{
                background: 'none', color: '#f44336', border: 'none',
                cursor: 'pointer', fontSize: '12px', textDecoration: 'underline',
                padding: 0, fontWeight: '600', textAlign: 'left'
              }}
            >
              Ver detalhes →
            </button>
          </div>

          {/* Card 2: Próximos Vencimentos */}
          <div style={{
            flex: 1,
            padding: '14px 18px',
            borderLeft: '3px solid #ff9800',
            backgroundColor: '#fff8f0',
            borderRadius: '8px',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <p style={{ fontSize: '13px', color: '#666', margin: '0 0 6px 0' }}>Próximos Vencimentos</p>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
                  <Icon icon="tabler:clock" width="18" height="18" style={{ color: '#ff9800' }} />
                  <span style={{ fontSize: '16px', fontWeight: '600', color: '#344848' }}>
                    {vencemHoje} vencem hoje
                  </span>
                </div>
                <p style={{ fontSize: '12px', color: '#888', margin: '0' }}>
                  {vencemProximos7} nos próximos 7 dias
                </p>
              </div>
              <span style={{
                backgroundColor: '#ff9800',
                color: 'white',
                padding: '4px 10px',
                borderRadius: '12px',
                fontSize: '11px',
                fontWeight: '600'
              }}>
                R$ {totalProximosVencimentos.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
          </div>

          {/* Card 3: Pago no Mês */}
          <div style={{
            flex: 1,
            padding: '14px 18px',
            borderLeft: '3px solid #4CAF50',
            backgroundColor: '#f1f8f4',
            borderRadius: '8px',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <p style={{ fontSize: '13px', color: '#666', margin: '0 0 6px 0' }}>Pago no Mês</p>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Icon icon="fluent-emoji-high-contrast:money-bag" width="18" height="18" style={{ color: '#4CAF50' }} />
                  <span style={{ fontSize: '20px', fontWeight: '700', color: '#344848' }}>
                    R$ {totalPagoMes.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
                <p style={{ fontSize: '12px', color: '#888', margin: '4px 0 0 0' }}>
                  {quantidadePagoMes} despesa{quantidadePagoMes !== 1 ? 's' : ''}
                </p>
              </div>
              <span style={{
                backgroundColor: '#4CAF50',
                color: 'white',
                padding: '4px 10px',
                borderRadius: '12px',
                fontSize: '12px',
                fontWeight: '600'
              }}>
                {percentualPago}%
              </span>
            </div>
            <button
              onClick={() => setFiltroStatus('pago')}
              style={{
                background: 'none', color: '#4CAF50', border: 'none',
                cursor: 'pointer', fontSize: '12px', textDecoration: 'underline',
                padding: 0, fontWeight: '600', textAlign: 'left'
              }}
            >
              Ver detalhes →
            </button>
          </div>

          {/* Card 4: Total do Mês */}
          <div style={{
            flex: 1,
            padding: '14px 18px',
            borderLeft: '3px solid #2196F3',
            backgroundColor: '#f0f7ff',
            borderRadius: '8px',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px'
          }}>
            <div>
              <p style={{ fontSize: '13px', color: '#666', margin: '0 0 6px 0' }}>Total do Mês</p>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Icon icon="mdi:chart-line" width="18" height="18" style={{ color: '#2196F3' }} />
                <span style={{ fontSize: '20px', fontWeight: '700', color: '#344848' }}>
                  R$ {totalMes.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
              <p style={{ fontSize: '11px', color: '#888', margin: '4px 0 0 0' }}>
                Todas despesas do mês
              </p>
              <p style={{ fontSize: '12px', color: '#2196F3', margin: '8px 0 0 0', fontWeight: '600' }}>
                {despesasFiltradas.filter(d => {
                  const v = new Date(d.data_vencimento + 'T00:00:00')
                  return v.getMonth() === new Date().getMonth() && v.getFullYear() === new Date().getFullYear()
                }).length} despesa{despesasFiltradas.filter(d => {
                  const v = new Date(d.data_vencimento + 'T00:00:00')
                  return v.getMonth() === new Date().getMonth() && v.getFullYear() === new Date().getFullYear()
                }).length !== 1 ? 's' : ''} no mês
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* ========== LISTA DE DESPESAS ========== */}
      {despesasFiltradas.length === 0 ? (
        <div style={{
          backgroundColor: 'white', borderRadius: '8px', padding: '60px 20px',
          textAlign: 'center', boxShadow: '0 1px 3px rgba(0,0,0,0.08)'
        }}>
          <Icon icon="mdi:wallet-outline" width="48" height="48" style={{ color: '#ccc', marginBottom: '12px' }} />
          <h3 style={{ margin: '0 0 8px 0', fontSize: '16px', color: '#666' }}>
            {despesas.length === 0 ? 'Nenhuma despesa cadastrada' : 'Nenhuma despesa encontrada'}
          </h3>
          <p style={{ margin: 0, fontSize: '14px', color: '#999' }}>
            {despesas.length === 0
              ? 'Clique em "Nova Despesa" para adicionar sua primeira despesa.'
              : 'Tente ajustar os filtros de busca.'
            }
          </p>
        </div>
      ) : isSmallScreen ? (
        /* ===== MOBILE: CARDS ===== */
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {despesasPaginadas.map(despesa => (
            <div
              key={despesa.id}
              onClick={() => abrirModalEditarDespesa(despesa)}
              style={{
                backgroundColor: 'white', borderRadius: '8px', padding: '14px',
                boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
                borderLeft: `4px solid ${despesa.categorias_despesas?.cor || '#666'}`,
                cursor: 'pointer'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '14px', fontWeight: '600', color: '#1a1a1a', marginBottom: '4px' }}>
                    {despesa.descricao}
                    {despesa.is_recorrente && (
                      <Icon icon="mdi:refresh" width="14" height="14" style={{ marginLeft: '6px', color: '#2196F3', verticalAlign: 'middle' }} />
                    )}
                  </div>
                  <div style={{ fontSize: '12px', color: '#999' }}>
                    {despesa.categorias_despesas?.nome || 'Sem categoria'}
                  </div>
                  {despesa.observacoes && (
                    <div
                      title={despesa.observacoes}
                      style={{
                        fontSize: '11px', color: '#aaa', marginTop: '3px', fontStyle: 'italic',
                        maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
                      }}
                    >
                      {despesa.observacoes}
                    </div>
                  )}
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '15px', fontWeight: '700', color: '#1a1a1a' }}>{formatarMoeda(despesa.valor)}</div>
                  <div style={{ marginTop: '4px' }}>{getStatusBadge(despesa)}</div>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid #f0f0f0', paddingTop: '8px' }}>
                <div style={{ fontSize: '12px', color: '#999' }}>
                  Venc: {new Date(despesa.data_vencimento + 'T00:00:00').toLocaleDateString('pt-BR')}
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleMarcarPago(despesa) }}
                    title={despesa.status === 'pago' ? 'Desfazer pagamento' : 'Marcar como pago'}
                    style={{
                      padding: '6px 10px', backgroundColor: despesa.status === 'pago' ? '#e8f5e9' : '#f5f5f5',
                      color: despesa.status === 'pago' ? '#4CAF50' : '#666',
                      border: 'none', borderRadius: '4px', cursor: 'pointer',
                      fontSize: '12px', fontWeight: '500', display: 'flex', alignItems: 'center', gap: '4px'
                    }}
                  >
                    <Icon icon={despesa.status === 'pago' ? 'mdi:check-circle' : 'mdi:check-circle-outline'} width="16" height="16" />
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); setConfirmDelete({ show: true, despesa }) }}
                    style={{
                      padding: '6px 10px', backgroundColor: '#ffebee',
                      color: '#f44336', border: 'none', borderRadius: '4px',
                      cursor: 'pointer', display: 'flex', alignItems: 'center'
                    }}
                  >
                    <Icon icon="mdi:delete-outline" width="16" height="16" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        /* ===== DESKTOP: TABELA ===== */
        <div style={{
          backgroundColor: 'white', borderRadius: '8px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.08)', overflow: 'hidden'
        }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #f0f0f0' }}>
                <th style={{ padding: '14px 16px', textAlign: 'left', fontSize: '13px', fontWeight: '600', color: '#666', width: '15%' }}>Descrição</th>
                <th style={{ padding: '14px 16px', textAlign: 'center', fontSize: '13px', fontWeight: '600', color: '#666' }}>Categoria</th>
                <th style={{ padding: '14px 16px', textAlign: 'center', fontSize: '13px', fontWeight: '600', color: '#666' }}>Vencimento</th>
                <th style={{ padding: '14px 16px', textAlign: 'center', fontSize: '13px', fontWeight: '600', color: '#666' }}>Valor</th>
                <th style={{ padding: '14px 16px', textAlign: 'center', fontSize: '13px', fontWeight: '600', color: '#666' }}>Status</th>
                <th style={{ padding: '14px 16px', textAlign: 'center', fontSize: '13px', fontWeight: '600', color: '#666' }}>Ações</th>
              </tr>
            </thead>
            <tbody>
              {despesasPaginadas.map(despesa => (
                <tr key={despesa.id} style={{ borderBottom: '1px solid #f5f5f5', transition: 'background-color 0.15s', cursor: 'pointer' }}
                  onClick={() => abrirModalEditarDespesa(despesa)}
                  onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#fafafa'}
                  onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                >
                  <td style={{ padding: '12px 16px', fontSize: '14px', color: '#1a1a1a', fontWeight: '500' }}>
                    <div>
                      {despesa.descricao}
                      {despesa.is_recorrente && (
                        <Icon icon="mdi:refresh" width="14" height="14" style={{ marginLeft: '6px', color: '#2196F3', verticalAlign: 'middle' }} title="Recorrente" />
                      )}
                    </div>
                    {despesa.observacoes && (
                      <div
                        title={despesa.observacoes}
                        style={{
                          fontSize: '12px', color: '#999', fontWeight: '400', marginTop: '2px', fontStyle: 'italic',
                          maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
                        }}
                      >
                        {despesa.observacoes}
                      </div>
                    )}
                  </td>
                  <td style={{ padding: '12px 16px', fontSize: '13px', textAlign: 'center' }}>
                    {despesa.categorias_despesas ? (
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', gap: '6px',
                        backgroundColor: despesa.categorias_despesas.cor + '15',
                        color: despesa.categorias_despesas.cor,
                        padding: '4px 10px', borderRadius: '14px', fontSize: '12px', fontWeight: '600'
                      }}>
                        <Icon icon={despesa.categorias_despesas.icone || 'mdi:tag-outline'} width="14" height="14" />
                        {despesa.categorias_despesas.nome}
                      </span>
                    ) : (
                      <span style={{ color: '#999', fontSize: '12px' }}>Sem categoria</span>
                    )}
                  </td>
                  <td style={{ padding: '12px 16px', fontSize: '13px', color: '#666', textAlign: 'center' }}>
                    {new Date(despesa.data_vencimento + 'T00:00:00').toLocaleDateString('pt-BR')}
                  </td>
                  <td style={{ padding: '12px 16px', fontSize: '14px', fontWeight: '600', color: '#1a1a1a', textAlign: 'center' }}>
                    {formatarMoeda(despesa.valor)}
                  </td>
                  <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                    {getStatusBadge(despesa)}
                  </td>
                  <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                    <div style={{ display: 'flex', gap: '6px', justifyContent: 'center' }}>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleMarcarPago(despesa) }}
                        title={despesa.status === 'pago' ? 'Desfazer pagamento' : 'Marcar como pago'}
                        style={{
                          padding: '6px 8px', backgroundColor: despesa.status === 'pago' ? '#e8f5e9' : '#f5f5f5',
                          color: despesa.status === 'pago' ? '#4CAF50' : '#666',
                          border: 'none', borderRadius: '4px', cursor: 'pointer',
                          display: 'flex', alignItems: 'center', transition: 'all 0.2s'
                        }}
                      >
                        <Icon icon={despesa.status === 'pago' ? 'mdi:check-circle' : 'mdi:check-circle-outline'} width="18" height="18" />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); setConfirmDelete({ show: true, despesa }) }}
                        title="Excluir"
                        style={{
                          padding: '6px 8px', backgroundColor: '#ffebee', color: '#f44336',
                          border: 'none', borderRadius: '4px', cursor: 'pointer',
                          display: 'flex', alignItems: 'center', transition: 'all 0.2s'
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#ffcdd2'}
                        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#ffebee'}
                      >
                        <Icon icon="mdi:delete-outline" width="18" height="18" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ========== PAGINAÇÃO ========== */}
      {totalPaginas > 1 && (
        <div style={{
          display: 'flex', justifyContent: 'center', alignItems: 'center',
          gap: '8px', marginTop: '20px', flexWrap: 'wrap'
        }}>
          <button
            onClick={() => setPaginaAtual(Math.max(1, paginaAtual - 1))}
            disabled={paginaAtual === 1}
            style={{
              padding: '8px 12px', backgroundColor: 'white', color: paginaAtual === 1 ? '#ccc' : '#333',
              border: '1px solid #ddd', borderRadius: '6px', cursor: paginaAtual === 1 ? 'default' : 'pointer',
              fontSize: '13px'
            }}
          >
            <Icon icon="mdi:chevron-left" width="18" height="18" />
          </button>

          {Array.from({ length: totalPaginas }, (_, i) => i + 1)
            .filter(p => p === 1 || p === totalPaginas || Math.abs(p - paginaAtual) <= 2)
            .map((pagina, index, arr) => (
              <span key={pagina}>
                {index > 0 && pagina - arr[index - 1] > 1 && (
                  <span style={{ color: '#999', padding: '0 4px' }}>...</span>
                )}
                <button
                  onClick={() => setPaginaAtual(pagina)}
                  style={{
                    padding: '8px 12px',
                    backgroundColor: paginaAtual === pagina ? '#344848' : 'white',
                    color: paginaAtual === pagina ? 'white' : '#333',
                    border: paginaAtual === pagina ? 'none' : '1px solid #ddd',
                    borderRadius: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: '500',
                    minWidth: '36px'
                  }}
                >
                  {pagina}
                </button>
              </span>
            ))
          }

          <button
            onClick={() => setPaginaAtual(Math.min(totalPaginas, paginaAtual + 1))}
            disabled={paginaAtual === totalPaginas}
            style={{
              padding: '8px 12px', backgroundColor: 'white', color: paginaAtual === totalPaginas ? '#ccc' : '#333',
              border: '1px solid #ddd', borderRadius: '6px', cursor: paginaAtual === totalPaginas ? 'default' : 'pointer',
              fontSize: '13px'
            }}
          >
            <Icon icon="mdi:chevron-right" width="18" height="18" />
          </button>
        </div>
      )}

      {/* ========== MODAL CRIAR/EDITAR DESPESA ========== */}
      {mostrarModalDespesa && (
        <div
          onClick={fecharModalDespesa}
          style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)', zIndex: 10000,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            animation: 'fadeIn 0.2s ease-out'
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              backgroundColor: 'white', borderRadius: '12px',
              padding: isSmallScreen ? '20px' : '28px',
              maxWidth: '520px', width: '90%', maxHeight: '90vh', overflowY: 'auto',
              boxShadow: '0 8px 32px rgba(0,0,0,0.2)', animation: 'slideUp 0.3s ease-out'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h3 style={{ margin: 0, fontSize: '18px', fontWeight: '600', color: '#1a1a1a' }}>
                {despesaEditando ? 'Editar Despesa' : 'Nova Despesa'}
              </h3>
              <button onClick={fecharModalDespesa} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px' }}>
                <Icon icon="mdi:close" width="24" height="24" color="#666" />
              </button>
            </div>

            {/* Descrição */}
            <div style={{ marginBottom: '14px' }}>
              <label style={{ fontSize: '13px', fontWeight: '600', color: '#344848', display: 'block', marginBottom: '6px' }}>Descrição *</label>
              <input
                type="text"
                value={formDescricao}
                onChange={(e) => setFormDescricao(e.target.value)}
                placeholder="Ex: Aluguel do escritório"
                style={{
                  width: '100%', padding: '10px 12px', border: '1px solid #ddd',
                  borderRadius: '6px', fontSize: '14px', outline: 'none', boxSizing: 'border-box'
                }}
                onFocus={(e) => e.currentTarget.style.borderColor = '#344848'}
                onBlur={(e) => e.currentTarget.style.borderColor = '#ddd'}
              />
            </div>

            {/* Valor */}
            <div style={{ marginBottom: '14px' }}>
              <label style={{ fontSize: '13px', fontWeight: '600', color: '#344848', display: 'block', marginBottom: '6px' }}>Valor (R$) *</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={formValor}
                onChange={(e) => setFormValor(e.target.value)}
                placeholder="0.00"
                style={{
                  width: '100%', padding: '10px 12px', border: '1px solid #ddd',
                  borderRadius: '6px', fontSize: '14px', outline: 'none', boxSizing: 'border-box'
                }}
                onFocus={(e) => e.currentTarget.style.borderColor = '#344848'}
                onBlur={(e) => e.currentTarget.style.borderColor = '#ddd'}
              />
            </div>

            {/* Categoria */}
            <div style={{ marginBottom: '14px' }}>
              <label style={{ fontSize: '13px', fontWeight: '600', color: '#344848', display: 'block', marginBottom: '6px' }}>Categoria</label>
              <div style={{ display: 'flex', gap: '8px' }}>
                <select
                  value={formCategoriaId}
                  onChange={(e) => {
                    if (e.target.value === '__nova__') {
                      setMostrarModalCategoria(true)
                    } else {
                      setFormCategoriaId(e.target.value)
                    }
                  }}
                  style={{
                    flex: 1, padding: '10px 12px', border: '1px solid #ddd',
                    borderRadius: '6px', fontSize: '14px', outline: 'none', backgroundColor: 'white'
                  }}
                >
                  <option value="">Sem categoria</option>
                  {categorias.map(cat => (
                    <option key={cat.id} value={cat.id}>{cat.nome}</option>
                  ))}
                  <option value="__nova__">+ Nova categoria</option>
                </select>
              </div>
            </div>

            {/* Data de vencimento */}
            <div style={{ marginBottom: '14px' }}>
              <label style={{ fontSize: '13px', fontWeight: '600', color: '#344848', display: 'block', marginBottom: '6px' }}>Data de vencimento *</label>
              <input
                type="date"
                value={formDataVencimento}
                onChange={(e) => setFormDataVencimento(e.target.value)}
                style={{
                  width: '100%', padding: '10px 12px', border: '1px solid #ddd',
                  borderRadius: '6px', fontSize: '14px', outline: 'none', boxSizing: 'border-box'
                }}
                onFocus={(e) => e.currentTarget.style.borderColor = '#344848'}
                onBlur={(e) => e.currentTarget.style.borderColor = '#ddd'}
              />
            </div>

            {/* Status */}
            <div style={{ marginBottom: '14px' }}>
              <label style={{ fontSize: '13px', fontWeight: '600', color: '#344848', display: 'block', marginBottom: '6px' }}>Status</label>
              <select
                value={formStatus}
                onChange={(e) => setFormStatus(e.target.value)}
                style={{
                  width: '100%', padding: '10px 12px', border: '1px solid #ddd',
                  borderRadius: '6px', fontSize: '14px', outline: 'none',
                  boxSizing: 'border-box', backgroundColor: 'white'
                }}
              >
                <option value="pendente">Pendente</option>
                <option value="pago">Pago</option>
                <option value="cancelado">Cancelado</option>
              </select>
            </div>

            {/* Forma de pagamento (só se pago) */}
            {formStatus === 'pago' && (
              <div style={{ marginBottom: '14px' }}>
                <label style={{ fontSize: '13px', fontWeight: '600', color: '#344848', display: 'block', marginBottom: '6px' }}>Forma de pagamento</label>
                <select
                  value={formFormaPagamento}
                  onChange={(e) => setFormFormaPagamento(e.target.value)}
                  style={{
                    width: '100%', padding: '10px 12px', border: '1px solid #ddd',
                    borderRadius: '6px', fontSize: '14px', outline: 'none',
                    boxSizing: 'border-box', backgroundColor: 'white'
                  }}
                >
                  <option value="">Não informado</option>
                  <option value="PIX">PIX</option>
                  <option value="Transferência">Transferência</option>
                  <option value="Cartão de crédito">Cartão de crédito</option>
                  <option value="Cartão de débito">Cartão de débito</option>
                  <option value="Boleto">Boleto</option>
                  <option value="Dinheiro">Dinheiro</option>
                </select>
              </div>
            )}

            {/* Recorrente */}
            <div style={{
              marginBottom: '14px', padding: '14px', backgroundColor: '#f8f9fa',
              borderRadius: '8px', border: '1px solid #e0e0e0'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}
                onClick={() => setFormIsRecorrente(!formIsRecorrente)}
              >
                <div style={{
                  width: '20px', height: '20px', borderRadius: '4px',
                  border: formIsRecorrente ? 'none' : '2px solid #ccc',
                  backgroundColor: formIsRecorrente ? '#2196F3' : 'white',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  transition: 'all 0.2s', flexShrink: 0
                }}>
                  {formIsRecorrente && <Icon icon="mdi:check" width="16" height="16" color="white" />}
                </div>
                <div>
                  <span style={{ fontSize: '14px', fontWeight: '500', color: '#1a1a1a' }}>Despesa recorrente</span>
                  <p style={{ margin: '2px 0 0 0', fontSize: '12px', color: '#999' }}>
                    Ao pagar, cria automaticamente a próxima
                  </p>
                </div>
              </div>

              {formIsRecorrente && (
                <div style={{ marginTop: '12px' }}>
                  <select
                    value={formRecorrenciaTipo}
                    onChange={(e) => setFormRecorrenciaTipo(e.target.value)}
                    style={{
                      width: '100%', padding: '8px 12px', border: '1px solid #ddd',
                      borderRadius: '6px', fontSize: '13px', outline: 'none', backgroundColor: 'white'
                    }}
                  >
                    <option value="mensal">Mensal</option>
                    <option value="semanal">Semanal</option>
                    <option value="anual">Anual</option>
                  </select>
                </div>
              )}
            </div>

            {/* Observações */}
            <div style={{ marginBottom: '20px' }}>
              <label style={{ fontSize: '13px', fontWeight: '600', color: '#344848', display: 'block', marginBottom: '6px' }}>Observações</label>
              <textarea
                value={formObservacoes}
                onChange={(e) => setFormObservacoes(e.target.value)}
                placeholder="Anotações opcionais..."
                rows={3}
                style={{
                  width: '100%', padding: '10px 12px', border: '1px solid #ddd',
                  borderRadius: '6px', fontSize: '14px', outline: 'none',
                  resize: 'vertical', boxSizing: 'border-box', fontFamily: 'inherit'
                }}
                onFocus={(e) => e.currentTarget.style.borderColor = '#344848'}
                onBlur={(e) => e.currentTarget.style.borderColor = '#ddd'}
              />
            </div>

            {/* Botões */}
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button
                onClick={fecharModalDespesa}
                style={{
                  padding: '10px 20px', borderRadius: '6px', border: '1px solid #e0e0e0',
                  backgroundColor: 'white', color: '#666', fontSize: '14px',
                  fontWeight: '500', cursor: 'pointer', minWidth: '100px'
                }}
              >
                Cancelar
              </button>
              <button
                onClick={handleSalvarDespesa}
                disabled={salvando}
                style={{
                  padding: '10px 20px', borderRadius: '6px', border: 'none',
                  backgroundColor: '#344848', color: 'white', fontSize: '14px',
                  fontWeight: '500', cursor: salvando ? 'default' : 'pointer',
                  minWidth: '100px', opacity: salvando ? 0.7 : 1
                }}
              >
                {salvando ? 'Salvando...' : (despesaEditando ? 'Salvar' : 'Criar')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========== MODAL NOVA CATEGORIA ========== */}
      {mostrarModalCategoria && (
        <div
          onClick={() => setMostrarModalCategoria(false)}
          style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)', zIndex: 10001,
            display: 'flex', alignItems: 'center', justifyContent: 'center'
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              backgroundColor: 'white', borderRadius: '12px', padding: '24px',
              maxWidth: '380px', width: '90%', boxShadow: '0 8px 32px rgba(0,0,0,0.2)'
            }}
          >
            <h3 style={{ margin: '0 0 16px 0', fontSize: '16px', fontWeight: '600', color: '#1a1a1a' }}>
              Nova Categoria
            </h3>

            <div style={{ marginBottom: '14px' }}>
              <label style={{ fontSize: '13px', fontWeight: '600', color: '#344848', display: 'block', marginBottom: '6px' }}>Nome</label>
              <input
                type="text"
                value={novaCategoriaLabel}
                onChange={(e) => setNovaCategoriaLabel(e.target.value)}
                placeholder="Ex: Manutenção"
                style={{
                  width: '100%', padding: '10px 12px', border: '1px solid #ddd',
                  borderRadius: '6px', fontSize: '14px', outline: 'none', boxSizing: 'border-box'
                }}
              />
            </div>

            <div style={{ marginBottom: '20px' }}>
              <label style={{ fontSize: '13px', fontWeight: '600', color: '#344848', display: 'block', marginBottom: '6px' }}>Cor</label>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                {['#E91E63', '#9C27B0', '#2196F3', '#FF9800', '#4CAF50', '#f44336', '#FFC107', '#00BCD4', '#795548', '#607D8B'].map(cor => (
                  <div
                    key={cor}
                    onClick={() => setNovaCategoriaCor(cor)}
                    style={{
                      width: '32px', height: '32px', borderRadius: '50%',
                      backgroundColor: cor, cursor: 'pointer',
                      border: novaCategoriaCor === cor ? '3px solid #333' : '3px solid transparent',
                      transition: 'all 0.2s'
                    }}
                  />
                ))}
              </div>
            </div>

            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setMostrarModalCategoria(false)}
                style={{
                  padding: '10px 20px', borderRadius: '6px', border: '1px solid #e0e0e0',
                  backgroundColor: 'white', color: '#666', fontSize: '14px', cursor: 'pointer'
                }}
              >
                Cancelar
              </button>
              <button
                onClick={handleCriarCategoria}
                disabled={salvandoCategoria}
                style={{
                  padding: '10px 20px', borderRadius: '6px', border: 'none',
                  backgroundColor: '#344848', color: 'white', fontSize: '14px',
                  fontWeight: '500', cursor: salvandoCategoria ? 'default' : 'pointer',
                  opacity: salvandoCategoria ? 0.7 : 1
                }}
              >
                {salvandoCategoria ? 'Criando...' : 'Criar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========== MODAL CONFIRMAR EXCLUSÃO ========== */}
      <ConfirmModal
        isOpen={confirmDelete.show}
        onClose={() => setConfirmDelete({ show: false, despesa: null })}
        onConfirm={confirmarExclusao}
        title="Excluir despesa"
        message={`Tem certeza que deseja excluir a despesa "${confirmDelete.despesa?.descricao}"?\n\nEsta ação não pode ser desfeita.`}
        confirmText="Excluir"
        cancelText="Cancelar"
        type="danger"
      />

      <ConfirmModal
        isOpen={confirmDesfazerPago.show}
        onClose={() => setConfirmDesfazerPago({ show: false, despesa: null })}
        onConfirm={confirmarDesfazerPago}
        title="Desfazer pagamento"
        message={`Deseja desfazer o pagamento da despesa "${confirmDesfazerPago.despesa?.descricao}"?\n\nO status voltará para pendente.`}
        confirmText="Desfazer"
        cancelText="Cancelar"
        type="warning"
      />

      <style>
        {`
          @keyframes fadeIn {
            from { opacity: 0; }
            to { opacity: 1; }
          }
          @keyframes slideUp {
            from { transform: translateY(20px); opacity: 0; }
            to { transform: translateY(0); opacity: 1; }
          }
        `}
      </style>
    </>
  )

  if (embedded) return content
  return (
    <div style={{ flex: 1, padding: isSmallScreen ? '16px' : '25px 30px', backgroundColor: '#f5f5f5', minHeight: '100vh' }}>
      {content}
    </div>
  )
}
