import { useState, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
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
import { hojeISO } from './utils/dataLocal'
import Button from './design-system/components/Button'
import Badge from './design-system/components/Badge'
import StatCard from './design-system/components/StatCard'
import EmptyState from './design-system/components/EmptyState'
import Card from './design-system/components/Card'
import Table from './design-system/components/Table'
import Modal from './design-system/components/Modal'
import Input from './design-system/components/Input'
import NativeSelect from './design-system/components/NativeSelect'
import Textarea from './design-system/components/Textarea'
import Switch from './design-system/components/Switch'

export default function Despesas({ embedded = false, buttonsPortal = null, onCountUpdate = null, autoAbrirNova = false, onAutoAbrirConsumido = null }) {
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

    // Ordenar: vencidos primeiro (antigo→recente), depois pendentes (antigo→recente), depois pagos (recente→antigo)
    const hoje = new Date()
    hoje.setHours(0, 0, 0, 0)

    resultado.sort((a, b) => {
      const vencA = new Date(a.data_vencimento + 'T00:00:00')
      const vencB = new Date(b.data_vencimento + 'T00:00:00')
      const aVencido = a.status === 'pendente' && vencA < hoje
      const bVencido = b.status === 'pendente' && vencB < hoje
      const aPendente = a.status === 'pendente' && vencA >= hoje
      const bPendente = b.status === 'pendente' && vencB >= hoje
      const aPago = a.status === 'pago'
      const bPago = b.status === 'pago'

      // Grupo: vencido=0, pendente=1, pago=2, cancelado=3
      const grupoA = aVencido ? 0 : aPendente ? 1 : aPago ? 2 : 3
      const grupoB = bVencido ? 0 : bPendente ? 1 : bPago ? 2 : 3

      if (grupoA !== grupoB) return grupoA - grupoB

      // Dentro do grupo: vencidos e pendentes = mais antigo primeiro, pagos = mais recente primeiro
      if (aPago && bPago) {
        const pagtoA = a.data_pagamento ? new Date(a.data_pagamento + 'T00:00:00') : vencA
        const pagtoB = b.data_pagamento ? new Date(b.data_pagamento + 'T00:00:00') : vencB
        return pagtoB - pagtoA
      }
      return vencA - vencB
    })

    setDespesasFiltradas(resultado)
    setPaginaAtual(1)
    calcularTotais(resultado)
  }, [despesas, buscaDebounced, filtroCategoria, filtroStatus, filtroDataInicio, filtroDataFim])

  // Callback de contagem para o Financeiro
  useEffect(() => {
    if (onCountUpdate) onCountUpdate(despesas.length, despesasFiltradas.length)
  }, [despesas.length, despesasFiltradas.length, onCountUpdate])

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
    setPercentualPago(totalDoMes > 0 ? Math.min(100, Math.round((pagoMes / totalDoMes) * 100)) : 0)
    setVencemHoje(qtdHoje)
    setVencemProximos7(qtd7Dias)
    setTotalProximosVencimentos(totalProx)
  }

  // Filtros em rascunho: o que a pessoa muda na janela de Filtros só vale ao
  // tocar em "Ver resultados". Fechar no X, no Esc ou tocando fora descarta.
  const FILTRO_VAZIO = { busca: '', filtroCategoria: 'todos', filtroStatus: 'todos', filtroDataInicio: '', filtroDataFim: '' }
  const [rascunho, setRascunho] = useState(FILTRO_VAZIO)
  const abrirFiltros = () => {
    setRascunho({ busca, filtroCategoria, filtroStatus, filtroDataInicio, filtroDataFim })
    setMostrarFiltros(true)
  }
  const mudarRascunho = (campo, valor) => setRascunho(r => ({ ...r, [campo]: valor }))
  // Limpar zera o que está aplicado e já fecha a janela (pedido do dono).
  const limparRascunho = () => {
    setRascunho(FILTRO_VAZIO)
    setBusca(FILTRO_VAZIO.busca)
    setFiltroCategoria(FILTRO_VAZIO.filtroCategoria)
    setFiltroStatus(FILTRO_VAZIO.filtroStatus)
    setFiltroDataInicio(FILTRO_VAZIO.filtroDataInicio)
    setFiltroDataFim(FILTRO_VAZIO.filtroDataFim)
    setMostrarFiltros(false)
  }
  const verResultadosFiltro = () => {
    setBusca(rascunho.busca)
    setFiltroCategoria(rascunho.filtroCategoria)
    setFiltroStatus(rascunho.filtroStatus)
    setFiltroDataInicio(rascunho.filtroDataInicio)
    setFiltroDataFim(rascunho.filtroDataFim)
    setMostrarFiltros(false)
  }
  const rascunhoTemFiltro = rascunho.busca.trim() !== '' || rascunho.filtroCategoria !== 'todos' || rascunho.filtroStatus !== 'todos' || rascunho.filtroDataInicio !== '' || rascunho.filtroDataFim !== ''

  const temFiltrosAtivos = filtroCategoria !== 'todos' || filtroStatus !== 'todos' || filtroDataInicio !== '' || filtroDataFim !== '' || busca.trim() !== ''

  const limparFiltros = () => {
    setBusca('')
    setFiltroCategoria('todos')
    setFiltroStatus('todos')
    setFiltroDataInicio('')
    setFiltroDataFim('')
  }


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

  // Auto-abrir modal quando vier do atalho da busca global
  useEffect(() => {
    if (autoAbrirNova && categorias.length >= 0 && !loading) {
      abrirModalNovaDespesa()
      if (onAutoAbrirConsumido) onAutoAbrirConsumido()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoAbrirNova, loading])

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
        data_pagamento: formStatus === 'pago' ? hojeISO() : null,
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
        data_pagamento: hojeISO()
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
      pago: { variant: 'success', text: 'Pago' },
      pendente: { variant: 'info', text: 'Pendente' },
      atrasado: { variant: 'danger', text: 'Atrasado' },
      cancelado: { variant: 'default', text: 'Cancelado' }
    }
    const config = configs[status] || configs.pendente
    return <Badge variant={config.variant} solid>{config.text}</Badge>
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
      <EmptyState
        variant="forbidden"
        icon="mdi:lock"
        size="large"
        title="Controle de Despesas"
        description="Gerencie suas despesas, categorize gastos e exporte relatórios. Disponível no plano Pro ou superior."
        action={<Button variant="primary" onClick={() => navigate('/app/configuracao?aba=assinatura')}>Fazer upgrade</Button>}
      />
    )
    if (embedded) return lockContent
    return (
      <div style={{ flex: 1, padding: isSmallScreen ? '16px' : '25px 30px', backgroundColor: '#ffffff', minHeight: '100vh' }}>
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
      <div style={{ flex: 1, padding: isSmallScreen ? '16px' : '25px 30px', backgroundColor: '#ffffff', minHeight: '100vh' }}>
        {loadingContent}
      </div>
    )
  }

  // ==================== RENDER ====================

  const buttonsBlock = (
    <div style={{ display: 'flex', gap: '8px', position: 'relative', alignItems: 'center', flexWrap: 'wrap', width: isSmallScreen ? '100%' : 'auto' }}>
      <Button
        variant="outline"
        icon={isSmallScreen ? undefined : 'ph:export-light'}
        aria-label="Exportar CSV"
        title="Exportar CSV"
        onClick={handleExportarCSV}
        style={{ flex: isSmallScreen ? 1 : 'none' }}
      >
        Exportar
      </Button>

      <Button
        className="btn-filtrar-despesas"
        variant={temFiltrosAtivos ? 'secondary' : 'outline'}
        icon={isSmallScreen ? undefined : 'mdi:filter-outline'}
        aria-expanded={mostrarFiltros}
        onClick={abrirFiltros}
        style={{ flex: isSmallScreen ? 1 : 'none' }}
      >
        Filtrar
        {temFiltrosAtivos && (
          <span aria-label="filtros ativos" style={{
            position: 'absolute', top: '-6px', right: '-6px',
            backgroundColor: 'var(--danger-700)', color: 'white', borderRadius: '50%',
            width: '20px', height: '20px', fontSize: '11px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontWeight: '700', border: '2px solid white'
          }}>!</span>
        )}
      </Button>

      <Button
        variant="primary"
        icon={isSmallScreen ? undefined : 'mdi:plus'}
        onClick={abrirModalNovaDespesa}
        style={{ flex: isSmallScreen ? 1 : 'none' }}
      >
        {isSmallScreen ? 'Adicionar' : 'Nova despesa'}
      </Button>

      {/* Filtros — Modal do DS, igual ao de Nova despesa */}
      <Modal
        isOpen={mostrarFiltros}
        onClose={() => setMostrarFiltros(false)}
        title="Filtros"
        size="sm"
      >
        <Modal.Body>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <Input
              label="Buscar"
              icon="mdi:magnify"
              placeholder="Descrição ou categoria..."
              value={rascunho.busca}
              onChange={(e) => mudarRascunho('busca', e.target.value)}
              clearable
            />

            <NativeSelect
              label="Categoria"
              value={rascunho.filtroCategoria}
              onChange={(e) => mudarRascunho('filtroCategoria', e.target.value)}
            >
              <option value="todos">Todas</option>
              {categorias.map(cat => (
                <option key={cat.id} value={cat.id}>{cat.nome}</option>
              ))}
            </NativeSelect>

            <NativeSelect
              label="Status"
              value={rascunho.filtroStatus}
              onChange={(e) => mudarRascunho('filtroStatus', e.target.value)}
              options={[
                { value: 'todos', label: 'Todos' },
                { value: 'pendente', label: 'Pendente' },
                { value: 'pago', label: 'Pago' },
                { value: 'atrasado', label: 'Atrasado' },
              ]}
            />

            <div>
              <span className="ds-input-label" style={{ display: 'block', marginBottom: '6px' }}>Período</span>
              <div style={{ display: 'flex', gap: '8px' }}>
                <Input type="date" aria-label="Data inicial" value={rascunho.filtroDataInicio} onChange={(e) => mudarRascunho('filtroDataInicio', e.target.value)} />
                <Input type="date" aria-label="Data final" value={rascunho.filtroDataFim} onChange={(e) => mudarRascunho('filtroDataFim', e.target.value)} />
              </div>
            </div>

          </div>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="outline" disabled={!rascunhoTemFiltro && !temFiltrosAtivos} onClick={limparRascunho} style={{ flex: 1 }}>
            Limpar
          </Button>
          <Button variant="primary" onClick={verResultadosFiltro} style={{ flex: 2 }}>
            Ver resultados
          </Button>
        </Modal.Footer>
      </Modal>
    </div>
  )

  const content = (
    <>
      {/* ========== TÍTULO (apenas quando não está embedded) ========== */}
      {!embedded && (
      <div style={{ marginBottom: isSmallScreen ? '16px' : '20px' }}>
        <h2 className="ds-text-h4" style={{ margin: 0, color: 'var(--color-brand-dark)' }}>
          Despesas
        </h2>
        <p style={{ margin: '5px 0 0 0', fontSize: isSmallScreen ? '13px' : '14px', color: '#666' }}>
          {despesasFiltradas.length} de {despesas.length} despesa(s)
        </p>
      </div>
      )}

      {/* ========== BOTÕES ========== */}
      {embedded && buttonsPortal ? createPortal(buttonsBlock, buttonsPortal) : (
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: isSmallScreen ? '12px' : '16px' }}>
        {buttonsBlock}
      </div>
      )}

      {/* ========== CARDS DE INDICADORES ========== */}
      {(() => {
        const qtdNoMes = despesasFiltradas.filter(d => {
          const v = new Date(d.data_vencimento + 'T00:00:00')
          return v.getMonth() === new Date().getMonth() && v.getFullYear() === new Date().getFullYear()
        }).length
        return (
          <div style={{
            display: 'grid',
            gridTemplateColumns: isSmallScreen ? 'repeat(2, minmax(0, 1fr))' : 'repeat(4, minmax(0, 1fr))',
            gap: isSmallScreen ? '10px' : '16px',
            marginBottom: isSmallScreen ? '16px' : '20px'
          }}>
            <StatCard
              label="Pendente"
              icon="solar:danger-triangle-linear"
              accent="danger"
              tinted
              size={isMobile ? 'sm' : 'md'}
              value={`R$ ${totalPendente.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
              hint={isMobile
                ? `${quantidadePendente} despesa${quantidadePendente !== 1 ? 's' : ''}`
                : `${quantidadePendente} despesa${quantidadePendente !== 1 ? 's' : ''} · ${percentualPendente}% do total`}
              onClick={() => setFiltroStatus(filtroStatus === 'pendente' ? 'todos' : 'pendente')}
              aria-pressed={filtroStatus === 'pendente'}
              title="Filtrar a lista pelas despesas pendentes"
            />
            <StatCard
              label={isMobile ? 'Vencem hoje' : 'Próximos vencimentos'}
              icon="tabler:clock"
              accent="warning"
              tinted
              size={isMobile ? 'sm' : 'md'}
              value={isMobile ? String(vencemHoje) : `${vencemHoje} ${vencemHoje === 1 ? 'vence' : 'vencem'} hoje`}
              hint={isMobile
                ? `${vencemProximos7} em 7 dias`
                : `${vencemProximos7} nos próximos 7 dias · R$ ${totalProximosVencimentos.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
            />
            <StatCard
              label="Pago no mês"
              icon="fluent-emoji-high-contrast:money-bag"
              accent="success"
              tinted
              size={isMobile ? 'sm' : 'md'}
              value={`R$ ${totalPagoMes.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
              hint={isMobile
                ? `${quantidadePagoMes} despesa${quantidadePagoMes !== 1 ? 's' : ''}`
                : `${quantidadePagoMes} despesa${quantidadePagoMes !== 1 ? 's' : ''} · ${percentualPago}% do total`}
              onClick={() => setFiltroStatus(filtroStatus === 'pago' ? 'todos' : 'pago')}
              aria-pressed={filtroStatus === 'pago'}
              title="Filtrar a lista pelas despesas pagas"
            />
            <StatCard
              label="Total do mês"
              icon="mdi:chart-line"
              accent="info"
              tinted
              size={isMobile ? 'sm' : 'md'}
              value={`R$ ${totalMes.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
              hint={`${qtdNoMes} despesa${qtdNoMes !== 1 ? 's' : ''} no mês`}
            />
          </div>
        )
      })()}

      {/* ========== LISTA DE DESPESAS ========== */}
      {despesasFiltradas.length === 0 ? (
        despesas.length === 0 ? (
          <EmptyState
            variant="first-use"
            icon="mdi:wallet-outline"
            title="Nenhuma despesa cadastrada"
            description="Registre aluguel, contas e outros gastos para ver o resultado real do mês."
            action={<Button variant="primary" icon="mdi:plus" onClick={abrirModalNovaDespesa}>Nova despesa</Button>}
          />
        ) : (
          <EmptyState
            variant="no-matches"
            title="Nenhuma despesa com esses filtros"
            description="Mude a busca ou os filtros para ver outras despesas."
            action={<Button variant="outline" onClick={limparFiltros}>Limpar filtros</Button>}
          />
        )
      ) : isSmallScreen ? (
        /* ===== CELULAR: CARTÕES ===== */
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {despesasPaginadas.map(despesa => (
            <Card
              key={despesa.id}
              padding="tight"
              onClick={() => abrirModalEditarDespesa(despesa)}
              role="button"
              tabIndex={0}
              aria-label={`Editar despesa ${despesa.descricao}`}
              onKeyDown={(e) => {
                if (e.target !== e.currentTarget) return
                if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); abrirModalEditarDespesa(despesa) }
              }}
              style={{ cursor: 'pointer', borderLeft: `4px solid ${despesa.categorias_despesas?.cor || 'var(--neutral-400)'}` }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', marginBottom: '8px' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 'var(--text-md)', fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: '2px' }}>
                    {despesa.descricao}
                    {despesa.is_recorrente && (
                      <Icon icon="mdi:refresh" width="14" height="14" aria-label="Recorrente" style={{ marginLeft: '6px', color: 'var(--info-700)', verticalAlign: 'middle' }} />
                    )}
                  </div>
                  <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
                    {despesa.categorias_despesas?.nome || 'Sem categoria'}
                  </div>
                  {despesa.observacoes && (
                    <div title={despesa.observacoes} style={{ fontSize: 'var(--text-2xs)', color: 'var(--color-text-muted)', marginTop: '3px', fontStyle: 'italic', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {despesa.observacoes}
                    </div>
                  )}
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--color-text-primary)' }}>{formatarMoeda(despesa.valor)}</div>
                  <div style={{ marginTop: '4px' }}>{getStatusBadge(despesa)}</div>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--color-border-subtle)', paddingTop: '8px' }}>
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
                  Venc: {new Date(despesa.data_vencimento + 'T00:00:00').toLocaleDateString('pt-BR')}
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <Button
                    variant={despesa.status === 'pago' ? 'outline' : 'gray'}
                    size="sm"
                    selected={despesa.status === 'pago'}
                    icon={despesa.status === 'pago' ? 'mdi:check-circle' : 'mdi:check-circle-outline'}
                    iconOnly
                    aria-label={despesa.status === 'pago' ? 'Desfazer pagamento' : 'Marcar como pago'}
                    title={despesa.status === 'pago' ? 'Desfazer pagamento' : 'Marcar como pago'}
                    onClick={(e) => { e.stopPropagation(); handleMarcarPago(despesa) }}
                  />
                  <Button
                    variant="danger-soft"
                    size="sm"
                    icon="mdi:delete-outline"
                    iconOnly
                    aria-label="Excluir despesa"
                    title="Excluir"
                    onClick={(e) => { e.stopPropagation(); setConfirmDelete({ show: true, despesa }) }}
                  />
                </div>
              </div>
            </Card>
          ))}
        </div>
      ) : (
        /* ===== COMPUTADOR: TABELA DO DS ===== */
        <Table
          data={despesasPaginadas}
          rowKey="id"
          onRowClick={(despesa) => abrirModalEditarDespesa(despesa)}
          columns={[
            {
              key: 'descricao',
              label: 'Descrição',
              render: (despesa) => (
                <>
                  <div style={{ fontWeight: 600, color: 'var(--color-text-primary)' }}>
                    {despesa.descricao}
                    {despesa.is_recorrente && (
                      <Icon icon="mdi:refresh" width="14" height="14" aria-label="Recorrente" style={{ marginLeft: '6px', color: 'var(--info-700)', verticalAlign: 'middle' }} />
                    )}
                  </div>
                  {despesa.observacoes && (
                    <div title={despesa.observacoes} style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', marginTop: '2px', fontStyle: 'italic', maxWidth: '220px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {despesa.observacoes}
                    </div>
                  )}
                </>
              )
            },
            {
              key: 'categoria',
              label: 'Categoria',
              align: 'center',
              render: (despesa) => despesa.categorias_despesas ? (
                <Badge
                  icon={despesa.categorias_despesas.icone || 'mdi:tag-outline'}
                  customColor={despesa.categorias_despesas.cor + '1A'}
                  customTextColor={despesa.categorias_despesas.cor}
                >
                  {despesa.categorias_despesas.nome}
                </Badge>
              ) : (
                <span style={{ color: 'var(--color-text-muted)', fontSize: 'var(--text-xs)' }}>Sem categoria</span>
              )
            },
            {
              key: 'vencimento',
              label: 'Vencimento',
              align: 'center',
              render: (despesa) => new Date(despesa.data_vencimento + 'T00:00:00').toLocaleDateString('pt-BR')
            },
            {
              key: 'valor',
              label: 'Valor',
              align: 'center',
              render: (despesa) => <span style={{ fontWeight: 700, color: 'var(--color-text-primary)' }}>{formatarMoeda(despesa.valor)}</span>
            },
            {
              key: 'status',
              label: 'Status',
              align: 'center',
              render: (despesa) => getStatusBadge(despesa)
            },
            {
              key: 'acoes',
              label: 'Ações',
              align: 'center',
              width: 110,
              render: (despesa) => (
                <div data-no-row-click style={{ display: 'flex', gap: '6px', justifyContent: 'center' }}>
                  <Button
                    variant={despesa.status === 'pago' ? 'outline' : 'gray'}
                    size="sm"
                    selected={despesa.status === 'pago'}
                    icon={despesa.status === 'pago' ? 'mdi:check-circle' : 'mdi:check-circle-outline'}
                    iconOnly
                    aria-label={despesa.status === 'pago' ? 'Desfazer pagamento' : 'Marcar como pago'}
                    title={despesa.status === 'pago' ? 'Desfazer pagamento' : 'Marcar como pago'}
                    onClick={(e) => { e.stopPropagation(); handleMarcarPago(despesa) }}
                  />
                  <Button
                    variant="danger-soft"
                    size="sm"
                    icon="mdi:delete-outline"
                    iconOnly
                    aria-label="Excluir despesa"
                    title="Excluir"
                    onClick={(e) => { e.stopPropagation(); setConfirmDelete({ show: true, despesa }) }}
                  />
                </div>
              )
            }
          ]}
        />
      )}

      {/* ========== PAGINAÇÃO ========== */}
      {totalPaginas > 1 && (
        <nav aria-label="Páginas" style={{
          display: 'flex', justifyContent: 'center', alignItems: 'center',
          gap: '4px', marginTop: '20px', flexWrap: 'wrap'
        }}>
          <Button
            variant="outline"
            size="sm"
            icon="mdi:chevron-left"
            iconOnly
            aria-label="Página anterior"
            onClick={() => setPaginaAtual(Math.max(1, paginaAtual - 1))}
            disabled={paginaAtual === 1}
          />

          {Array.from({ length: totalPaginas }, (_, i) => i + 1)
            .filter(p => p === 1 || p === totalPaginas || Math.abs(p - paginaAtual) <= 2)
            .map((pagina, index, arr) => (
              <span key={pagina} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                {index > 0 && pagina - arr[index - 1] > 1 && (
                  <span aria-hidden="true" style={{ color: 'var(--color-text-muted)', padding: '0 4px' }}>…</span>
                )}
                <Button
                  variant={paginaAtual === pagina ? 'secondary' : 'outline'}
                  size="sm"
                  aria-label={`Página ${pagina}`}
                  aria-current={paginaAtual === pagina ? 'page' : undefined}
                  onClick={() => setPaginaAtual(pagina)}
                  style={{ minWidth: '40px' }}
                >
                  {pagina}
                </Button>
              </span>
            ))
          }

          <Button
            variant="outline"
            size="sm"
            icon="mdi:chevron-right"
            iconOnly
            aria-label="Próxima página"
            onClick={() => setPaginaAtual(Math.min(totalPaginas, paginaAtual + 1))}
            disabled={paginaAtual === totalPaginas}
          />
        </nav>
      )}

      {/* ========== MODAL CRIAR/EDITAR DESPESA ========== */}
      <Modal
        isOpen={mostrarModalDespesa}
        onClose={fecharModalDespesa}
        title={despesaEditando ? 'Editar despesa' : 'Nova despesa'}
        size="md"
        closeOnEsc={!mostrarModalCategoria}
        closeOnBackdrop={!mostrarModalCategoria}
      >
        <Modal.Body>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <Input
              label="Descrição"
              required
              value={formDescricao}
              onChange={(e) => setFormDescricao(e.target.value)}
              placeholder="Ex: Aluguel do escritório"
            />

            <Input
              label="Valor"
              required
              prefix="R$"
              type="number"
              inputMode="decimal"
              step="0.01"
              min="0"
              value={formValor}
              onChange={(e) => setFormValor(e.target.value)}
              placeholder="0,00"
            />

            <NativeSelect
              label="Categoria"
              value={formCategoriaId}
              onChange={(e) => {
                if (e.target.value === '__nova__') {
                  setMostrarModalCategoria(true)
                } else {
                  setFormCategoriaId(e.target.value)
                }
              }}
            >
              <option value="">Sem categoria</option>
              {categorias.map(cat => (
                <option key={cat.id} value={cat.id}>{cat.nome}</option>
              ))}
              <option value="__nova__">+ Nova categoria</option>
            </NativeSelect>

            <Input
              label="Data de vencimento"
              required
              type="date"
              value={formDataVencimento}
              onChange={(e) => setFormDataVencimento(e.target.value)}
            />

            <NativeSelect
              label="Status"
              value={formStatus}
              onChange={(e) => setFormStatus(e.target.value)}
              options={[
                { value: 'pendente', label: 'Pendente' },
                { value: 'pago', label: 'Pago' },
                { value: 'cancelado', label: 'Cancelado' },
              ]}
            />

            {formStatus === 'pago' && (
              <NativeSelect
                label="Forma de pagamento"
                value={formFormaPagamento}
                onChange={(e) => setFormFormaPagamento(e.target.value)}
                options={[
                  { value: '', label: 'Não informado' },
                  { value: 'PIX', label: 'PIX' },
                  { value: 'Transferência', label: 'Transferência' },
                  { value: 'Cartão de crédito', label: 'Cartão de crédito' },
                  { value: 'Cartão de débito', label: 'Cartão de débito' },
                  { value: 'Boleto', label: 'Boleto' },
                  { value: 'Dinheiro', label: 'Dinheiro' },
                ]}
              />
            )}

            <Card padding="tight" tinted accent={formIsRecorrente ? 'info' : undefined} style={{ backgroundColor: formIsRecorrente ? undefined : 'var(--neutral-50)' }}>
              <Switch
                checked={formIsRecorrente}
                onChange={(e) => setFormIsRecorrente(e.target.checked)}
                label="Despesa recorrente"
                description="Ao pagar, cria automaticamente a próxima"
              />
              {formIsRecorrente && (
                <div style={{ marginTop: '12px' }}>
                  <NativeSelect
                    aria-label="Frequência da recorrência"
                    value={formRecorrenciaTipo}
                    onChange={(e) => setFormRecorrenciaTipo(e.target.value)}
                    options={[
                      { value: 'mensal', label: 'Mensal' },
                      { value: 'semanal', label: 'Semanal' },
                      { value: 'anual', label: 'Anual' },
                    ]}
                  />
                </div>
              )}
            </Card>

            <Textarea
              label="Observações"
              value={formObservacoes}
              onChange={(e) => setFormObservacoes(e.target.value)}
              placeholder="Anotações opcionais..."
              rows={3}
            />
          </div>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="outline" onClick={fecharModalDespesa}>Cancelar</Button>
          <Button variant="primary" loading={salvando} onClick={handleSalvarDespesa}>
            {despesaEditando ? 'Salvar' : 'Criar'}
          </Button>
        </Modal.Footer>
      </Modal>

      {/* ========== MODAL NOVA CATEGORIA ========== */}
      <Modal
        isOpen={mostrarModalCategoria}
        onClose={() => setMostrarModalCategoria(false)}
        title="Nova categoria"
        size="sm"
      >
        <Modal.Body>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <Input
              label="Nome"
              value={novaCategoriaLabel}
              onChange={(e) => setNovaCategoriaLabel(e.target.value)}
              placeholder="Ex: Manutenção"
            />
            <div>
              <span className="ds-input-label" id="nova-cat-cor" style={{ display: 'block', marginBottom: '8px' }}>Cor</span>
              <div role="radiogroup" aria-labelledby="nova-cat-cor" style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                {['#E91E63', '#9C27B0', '#2196F3', '#FF9800', '#4CAF50', '#f44336', '#FFC107', '#00BCD4', '#795548', '#607D8B'].map(cor => (
                  <button
                    key={cor}
                    type="button"
                    role="radio"
                    aria-checked={novaCategoriaCor === cor}
                    aria-label={`Cor ${cor}`}
                    onClick={() => setNovaCategoriaCor(cor)}
                    style={{
                      width: '36px', height: '36px', borderRadius: '50%', padding: 0,
                      backgroundColor: cor, cursor: 'pointer',
                      border: novaCategoriaCor === cor ? '3px solid var(--neutral-800)' : '3px solid transparent',
                      boxShadow: novaCategoriaCor === cor ? '0 0 0 2px var(--color-bg-surface) inset' : 'none',
                      transition: 'border-color var(--duration-150) var(--ease-out)'
                    }}
                  />
                ))}
              </div>
            </div>
          </div>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="outline" onClick={() => setMostrarModalCategoria(false)}>Cancelar</Button>
          <Button variant="primary" loading={salvandoCategoria} onClick={handleCriarCategoria}>Criar</Button>
        </Modal.Footer>
      </Modal>

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

    </>
  )

  if (embedded) return content
  return (
    <div style={{ flex: 1, padding: isSmallScreen ? '16px' : '25px 30px', backgroundColor: '#ffffff', minHeight: '100vh' }}>
      {content}
    </div>
  )
}
