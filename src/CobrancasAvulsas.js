import { useState, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from './supabaseClient'
import { Icon } from '@iconify/react'
import { showToast } from './Toast'
import ConfirmModal from './ConfirmModal'
import { SkeletonList, SkeletonTable, SkeletonCard } from './components/Skeleton'
import useWindowSize from './hooks/useWindowSize'
import { useUser } from './contexts/UserContext'
import { exportarCobrancasAvulsas } from './utils/exportUtils'

const CATEGORIAS_PADRAO = [
  { value: 'uniforme', label: 'Uniforme', icon: 'mdi:tshirt-crew-outline', cor: '#E91E63' },
  { value: 'suplemento', label: 'Suplemento', icon: 'mdi:pill', cor: '#9C27B0' },
  { value: 'aula_extra', label: 'Aula Extra', icon: 'mdi:school-outline', cor: '#2196F3' },
  { value: 'material', label: 'Material', icon: 'mdi:package-variant', cor: '#FF9800' },
  { value: 'taxa', label: 'Taxa', icon: 'mdi:receipt-text-outline', cor: '#f44336' },
  { value: 'evento', label: 'Evento', icon: 'mdi:calendar-star', cor: '#4CAF50' },
  { value: 'outros', label: 'Outros', icon: 'mdi:dots-horizontal-circle-outline', cor: '#607D8B' }
]

const CORES_CUSTOM = ['#E91E63', '#9C27B0', '#2196F3', '#FF9800', '#4CAF50', '#f44336', '#FFC107', '#00BCD4', '#795548', '#607D8B']

const FORMAS_PAGAMENTO = [
  { value: 'PIX', label: 'PIX' },
  { value: 'Dinheiro', label: 'Dinheiro' },
  { value: 'Cartão de crédito', label: 'Cartão de crédito' },
  { value: 'Cartão de débito', label: 'Cartão de débito' },
  { value: 'Transferência', label: 'Transferência' },
  { value: 'Boleto', label: 'Boleto' }
]

export default function CobrancasAvulsas({ embedded = false, buttonsPortal = null, onCountUpdate = null }) {
  const { isMobile, isSmallScreen } = useWindowSize()
  const { userId, loading: loadingUser } = useUser()

  // Dados
  const [cobrancas, setCobrancas] = useState([])
  const [cobrancasFiltradas, setCobrancasFiltradas] = useState([])
  const [alunos, setAlunos] = useState([])
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

  // Modal criar/editar
  const [mostrarModal, setMostrarModal] = useState(false)
  const [editando, setEditando] = useState(null)

  // Campos do formulário
  const [formDescricao, setFormDescricao] = useState('')
  const [formValor, setFormValor] = useState('')
  const [formCategoria, setFormCategoria] = useState('outros')
  const [formDataVencimento, setFormDataVencimento] = useState('')
  const [formStatus, setFormStatus] = useState('pendente')
  const [formFormaPagamento, setFormFormaPagamento] = useState('')
  const [formDevedorId, setFormDevedorId] = useState('')
  const [formObservacoes, setFormObservacoes] = useState('')
  const [salvando, setSalvando] = useState(false)

  // Categorias dinâmicas (padrão + custom do usuário)
  const [categoriasCustom, setCategoriasCustom] = useState([])
  const [mostrarModalCategoria, setMostrarModalCategoria] = useState(false)
  const [novaCategoriaLabel, setNovaCategoriaLabel] = useState('')
  const [novaCategoriaCor, setNovaCategoriaCor] = useState('#607D8B')

  // Confirmações
  const [confirmDelete, setConfirmDelete] = useState({ show: false, cobranca: null })
  const [confirmDesfazerPago, setConfirmDesfazerPago] = useState({ show: false, cobranca: null })

  // Resumo
  const [totalPendente, setTotalPendente] = useState(0)
  const [totalRecebido, setTotalRecebido] = useState(0)
  const [totalGeral, setTotalGeral] = useState(0)
  const [quantidadeTotal, setQuantidadeTotal] = useState(0)

  // Todas as categorias = padrão + custom
  const todasCategorias = [...CATEGORIAS_PADRAO, ...categoriasCustom]

  const formatarMoeda = (valor) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valor || 0)
  }

  const getCategoriaInfo = (valor) => {
    return todasCategorias.find(c => c.value === valor) || { value: valor, label: valor, icon: 'mdi:tag-outline', cor: '#607D8B' }
  }

  // ==================== CARREGAR DADOS ====================

  const carregarDados = useCallback(async () => {
    if (!userId) return
    setLoading(true)
    try {
      const [
        { data: cobrancasData, error: cobrancasError },
        { data: alunosData, error: alunosError }
      ] = await Promise.all([
        supabase
          .from('cobrancas_avulsas')
          .select('*, devedores(nome, telefone)')
          .eq('user_id', userId)
          .or('lixo.is.null,lixo.eq.false')
          .order('data_vencimento', { ascending: false }),
        supabase
          .from('devedores')
          .select('id, nome')
          .eq('user_id', userId)
          .or('lixo.is.null,lixo.eq.false')
          .order('nome', { ascending: true })
      ])

      if (cobrancasError) throw cobrancasError
      if (alunosError) throw alunosError

      setCobrancas(cobrancasData || [])
      setAlunos(alunosData || [])

      // Extrair categorias custom (que não estão nas padrão)
      const valoresPadrao = new Set(CATEGORIAS_PADRAO.map(c => c.value))
      const customSet = new Set()
      ;(cobrancasData || []).forEach(c => {
        if (c.categoria && !valoresPadrao.has(c.categoria)) customSet.add(c.categoria)
      })
      setCategoriasCustom(Array.from(customSet).map(v => ({
        value: v, label: v, icon: 'mdi:tag-outline', cor: '#607D8B'
      })))
    } catch (error) {
      showToast('Erro ao carregar cobranças: ' + error.message, 'error')
    } finally {
      setLoading(false)
    }
  }, [userId])

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
    let resultado = [...cobrancas]

    if (buscaDebounced.trim()) {
      const termo = buscaDebounced.toLowerCase()
      resultado = resultado.filter(c =>
        c.descricao?.toLowerCase().includes(termo) ||
        c.devedores?.nome?.toLowerCase().includes(termo)
      )
    }

    if (filtroCategoria !== 'todos') {
      resultado = resultado.filter(c => c.categoria === filtroCategoria)
    }

    if (filtroStatus !== 'todos') {
      resultado = resultado.filter(c => {
        if (filtroStatus === 'pendente') return c.status === 'pendente'
        if (filtroStatus === 'pago') return c.status === 'pago'
        if (filtroStatus === 'atrasado') {
          const hoje = new Date()
          hoje.setHours(0, 0, 0, 0)
          const venc = new Date(c.data_vencimento + 'T00:00:00')
          return c.status === 'pendente' && venc < hoje
        }
        if (filtroStatus === 'cancelado') return c.status === 'cancelado'
        return true
      })
    }

    if (filtroDataInicio) {
      resultado = resultado.filter(c => c.data_vencimento >= filtroDataInicio)
    }
    if (filtroDataFim) {
      resultado = resultado.filter(c => c.data_vencimento <= filtroDataFim)
    }

    // Ordenar: vencidos primeiro, depois pendentes, depois pagos
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

      const grupoA = aVencido ? 0 : aPendente ? 1 : aPago ? 2 : 3
      const grupoB = bVencido ? 0 : bPendente ? 1 : bPago ? 2 : 3

      if (grupoA !== grupoB) return grupoA - grupoB

      if (aPago && bPago) {
        const pagtoA = a.data_pagamento ? new Date(a.data_pagamento + 'T00:00:00') : vencA
        const pagtoB = b.data_pagamento ? new Date(b.data_pagamento + 'T00:00:00') : vencB
        return pagtoB - pagtoA
      }
      return vencA - vencB
    })

    setCobrancasFiltradas(resultado)
    setPaginaAtual(1)
    calcularTotais(resultado)
  }, [cobrancas, buscaDebounced, filtroCategoria, filtroStatus, filtroDataInicio, filtroDataFim])

  // Callback de contagem para o Financeiro
  useEffect(() => {
    if (onCountUpdate) onCountUpdate(cobrancas.length, cobrancasFiltradas.length)
  }, [cobrancas.length, cobrancasFiltradas.length, onCountUpdate])

  const calcularTotais = (lista) => {
    let pendente = 0
    let recebido = 0
    let geral = 0

    lista.forEach(c => {
      const valor = parseFloat(c.valor) || 0
      geral += valor
      if (c.status === 'pago') recebido += valor
      else if (c.status === 'pendente') pendente += valor
    })

    setTotalPendente(pendente)
    setTotalRecebido(recebido)
    setTotalGeral(geral)
    setQuantidadeTotal(lista.length)
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
      if (mostrarFiltros && !event.target.closest('.popover-filtros-avulsas') && !event.target.closest('.btn-filtrar-avulsas')) {
        setMostrarFiltros(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [mostrarFiltros])

  // ==================== PAGINAÇÃO ====================

  const totalPaginas = Math.ceil(cobrancasFiltradas.length / itensPorPagina)
  const indiceInicio = (paginaAtual - 1) * itensPorPagina
  const indiceFim = indiceInicio + itensPorPagina
  const cobrancasPaginadas = cobrancasFiltradas.slice(indiceInicio, indiceFim)

  // ==================== CRUD ====================

  const abrirModalNova = () => {
    setEditando(null)
    setFormDescricao('')
    setFormValor('')
    setFormCategoria('outros')
    setFormDataVencimento(new Date().toISOString().split('T')[0])
    setFormStatus('pendente')
    setFormFormaPagamento('')
    setFormDevedorId('')
    setFormObservacoes('')
    setMostrarModal(true)
  }

  const abrirModalEditar = (cobranca) => {
    setEditando(cobranca)
    setFormDescricao(cobranca.descricao)
    setFormValor(cobranca.valor.toString())
    setFormCategoria(cobranca.categoria || 'outros')
    setFormDataVencimento(cobranca.data_vencimento)
    setFormStatus(cobranca.status)
    setFormFormaPagamento(cobranca.forma_pagamento || '')
    setFormDevedorId(cobranca.devedor_id || '')
    setFormObservacoes(cobranca.observacoes || '')
    setMostrarModal(true)
  }

  const fecharModal = () => {
    setMostrarModal(false)
    setEditando(null)
  }

  const handleSalvar = async () => {
    if (!formDescricao.trim()) {
      showToast('Informe a descrição', 'warning')
      return
    }
    if (!formValor || parseFloat(formValor) <= 0) {
      showToast('Informe um valor válido', 'warning')
      return
    }
    setSalvando(true)
    try {
      const dados = {
        user_id: userId,
        descricao: formDescricao.trim(),
        valor: parseFloat(formValor),
        categoria: formCategoria,
        data_vencimento: formDataVencimento || new Date().toISOString().split('T')[0],
        status: formStatus,
        forma_pagamento: formStatus === 'pago' ? (formFormaPagamento || null) : null,
        data_pagamento: formStatus === 'pago' ? new Date().toISOString().split('T')[0] : null,
        devedor_id: formDevedorId || null,
        observacoes: formObservacoes.trim() || null
      }

      if (editando) {
        const { error } = await supabase
          .from('cobrancas_avulsas')
          .update(dados)
          .eq('id', editando.id)
        if (error) throw error
        showToast('Cobrança atualizada!', 'success')
      } else {
        const { error } = await supabase
          .from('cobrancas_avulsas')
          .insert(dados)
        if (error) throw error
        showToast('Cobrança criada!', 'success')
      }

      fecharModal()
      carregarDados()
    } catch (error) {
      showToast('Erro ao salvar: ' + error.message, 'error')
    } finally {
      setSalvando(false)
    }
  }

  const handleMarcarPago = async (cobranca) => {
    if (cobranca.status === 'pago') {
      setConfirmDesfazerPago({ show: true, cobranca })
      return
    }

    try {
      const { error } = await supabase
        .from('cobrancas_avulsas')
        .update({
          status: 'pago',
          data_pagamento: new Date().toISOString().split('T')[0]
        })
        .eq('id', cobranca.id)
      if (error) throw error
      showToast('Cobrança marcada como paga!', 'success')
      carregarDados()
    } catch (error) {
      showToast('Erro ao atualizar: ' + error.message, 'error')
    }
  }

  const confirmarExclusao = async () => {
    const cobranca = confirmDelete.cobranca
    if (!cobranca) return
    try {
      const { error } = await supabase
        .from('cobrancas_avulsas')
        .update({ lixo: true, deletado_em: new Date().toISOString() })
        .eq('id', cobranca.id)
      if (error) throw error
      showToast('Cobrança excluída!', 'success')
      setConfirmDelete({ show: false, cobranca: null })
      carregarDados()
    } catch (error) {
      showToast('Erro ao excluir: ' + error.message, 'error')
    }
  }

  const confirmarDesfazerPago = async () => {
    const cobranca = confirmDesfazerPago.cobranca
    if (!cobranca) return
    try {
      const { error } = await supabase
        .from('cobrancas_avulsas')
        .update({ status: 'pendente', data_pagamento: null, forma_pagamento: null })
        .eq('id', cobranca.id)
      if (error) throw error
      showToast('Pagamento desfeito!', 'success')
      setConfirmDesfazerPago({ show: false, cobranca: null })
      carregarDados()
    } catch (error) {
      showToast('Erro ao desfazer: ' + error.message, 'error')
    }
  }

  // ==================== STATUS BADGE ====================

  const getStatusCobranca = (cobranca) => {
    if (cobranca.status === 'pago') return 'pago'
    if (cobranca.status === 'cancelado') return 'cancelado'
    const hoje = new Date()
    hoje.setHours(0, 0, 0, 0)
    const venc = new Date(cobranca.data_vencimento + 'T00:00:00')
    if (cobranca.status === 'pendente' && venc < hoje) return 'atrasado'
    return 'pendente'
  }

  const getStatusBadge = (cobranca) => {
    const status = getStatusCobranca(cobranca)
    const configs = {
      pago: { bg: '#4CAF50', text: 'Pago' },
      pendente: { bg: '#2196F3', text: 'Pendente' },
      atrasado: { bg: '#f44336', text: 'Atrasado' },
      cancelado: { bg: '#9e9e9e', text: 'Cancelado' }
    }
    const config = configs[status] || configs.pendente
    return (
      <span style={{
        backgroundColor: config.bg, color: 'white',
        padding: '3px 10px', borderRadius: '12px',
        fontSize: '11px', fontWeight: 'bold'
      }}>
        {config.text}
      </span>
    )
  }

  // ==================== EXPORTAR ====================

  const handleExportarCSV = () => {
    if (cobrancasFiltradas.length === 0) {
      showToast('Nenhuma cobrança para exportar', 'warning')
      return
    }
    exportarCobrancasAvulsas(cobrancasFiltradas)
    showToast('CSV exportado!', 'success')
  }

  // ==================== LOADING ====================

  if (loading || loadingUser) {
    const loadingContent = (
      <>
        <div style={{
          display: 'grid',
          gridTemplateColumns: isSmallScreen ? '1fr' : 'repeat(4, 1fr)',
          gap: '16px', marginBottom: '24px'
        }}>
          {Array.from({ length: 4 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
        {isSmallScreen ? (
          <SkeletonList count={8} />
        ) : (
          <SkeletonTable rows={10} columns={7} />
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
    <div style={{ display: 'flex', gap: '8px', position: 'relative', alignItems: 'center', flexWrap: 'wrap' }}>
      <button
        onClick={handleExportarCSV}
        title="Exportar CSV"
        style={{
          padding: isSmallScreen ? '10px 14px' : '10px 20px',
          backgroundColor: 'white', color: '#333',
          border: '1px solid #ddd', borderRadius: '6px',
          cursor: 'pointer', fontSize: '14px', fontWeight: '500',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          gap: '8px', transition: 'all 0.2s'
        }}
        onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#344848'; e.currentTarget.style.color = '#344848' }}
        onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#ddd'; e.currentTarget.style.color = '#333' }}
      >
        <Icon icon="ph:export-light" width="18" height="18" />
      </button>

      <button
        className="btn-filtrar-avulsas"
        onClick={() => setMostrarFiltros(!mostrarFiltros)}
        style={{
          padding: isSmallScreen ? '10px 14px' : '10px 20px',
          backgroundColor: temFiltrosAtivos ? '#344848' : 'white',
          color: temFiltrosAtivos ? 'white' : '#333',
          border: temFiltrosAtivos ? 'none' : '1px solid #ddd',
          borderRadius: '6px', cursor: 'pointer', fontSize: '14px',
          fontWeight: '500', display: 'flex', alignItems: 'center',
          justifyContent: 'center', gap: '8px', position: 'relative',
          transition: 'all 0.2s'
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

      <button
        onClick={abrirModalNova}
        style={{
          padding: isSmallScreen ? '10px 14px' : '10px 20px',
          backgroundColor: '#344848', color: 'white',
          border: 'none', borderRadius: '6px',
          cursor: 'pointer', fontSize: '14px', fontWeight: '500',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          gap: '8px', transition: 'all 0.2s'
        }}
        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#2a3a3a'}
        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#344848'}
      >
        <Icon icon="mdi:plus" width="18" height="18" />
        {!isSmallScreen && 'Nova Cobrança'}
      </button>

      {mostrarFiltros && (
        <div
          className="popover-filtros-avulsas"
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
            zIndex: 1001, overflow: isSmallScreen ? 'auto' : 'hidden',
            display: 'flex', flexDirection: 'column'
          }}
        >
          {isSmallScreen && (
            <div style={{
              padding: '16px 20px', borderBottom: '1px solid #e5e7eb',
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
            <div style={{ marginBottom: '16px' }}>
              <label style={{ fontSize: '13px', fontWeight: '600', color: '#344848', display: 'block', marginBottom: '6px' }}>Buscar</label>
              <input
                type="text"
                placeholder="Descrição ou nome do aluno..."
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                style={{
                  width: '100%', padding: '10px 12px', border: '1px solid #ddd',
                  borderRadius: '6px', fontSize: '16px', outline: 'none', boxSizing: 'border-box'
                }}
              />
            </div>

            <div style={{ marginBottom: '16px' }}>
              <label style={{ fontSize: '13px', fontWeight: '600', color: '#344848', display: 'block', marginBottom: '6px' }}>Categoria</label>
              <select
                value={filtroCategoria}
                onChange={(e) => setFiltroCategoria(e.target.value)}
                style={{
                  width: '100%', padding: '10px 12px', border: '1px solid #ddd',
                  borderRadius: '6px', fontSize: '16px', outline: 'none',
                  boxSizing: 'border-box', backgroundColor: 'white'
                }}
              >
                <option value="todos">Todas</option>
                {todasCategorias.map(cat => (
                  <option key={cat.value} value={cat.value}>{cat.label}</option>
                ))}
              </select>
            </div>

            <div style={{ marginBottom: '16px' }}>
              <label style={{ fontSize: '13px', fontWeight: '600', color: '#344848', display: 'block', marginBottom: '6px' }}>Status</label>
              <select
                value={filtroStatus}
                onChange={(e) => setFiltroStatus(e.target.value)}
                style={{
                  width: '100%', padding: '10px 12px', border: '1px solid #ddd',
                  borderRadius: '6px', fontSize: '16px', outline: 'none',
                  boxSizing: 'border-box', backgroundColor: 'white'
                }}
              >
                <option value="todos">Todos</option>
                <option value="pendente">Pendente</option>
                <option value="pago">Pago</option>
                <option value="atrasado">Atrasado</option>
                <option value="cancelado">Cancelado</option>
              </select>
            </div>

            <div style={{ marginBottom: '16px' }}>
              <label style={{ fontSize: '13px', fontWeight: '600', color: '#344848', display: 'block', marginBottom: '6px' }}>Período</label>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input
                  type="date"
                  value={filtroDataInicio}
                  onChange={(e) => setFiltroDataInicio(e.target.value)}
                  style={{
                    flex: 1, padding: '10px 8px', border: '1px solid #ddd',
                    borderRadius: '6px', fontSize: '16px', outline: 'none'
                  }}
                />
                <input
                  type="date"
                  value={filtroDataFim}
                  onChange={(e) => setFiltroDataFim(e.target.value)}
                  style={{
                    flex: 1, padding: '10px 8px', border: '1px solid #ddd',
                    borderRadius: '6px', fontSize: '16px', outline: 'none'
                  }}
                />
              </div>
            </div>

            {temFiltrosAtivos && (
              <button
                onClick={limparFiltros}
                style={{
                  width: '100%', padding: '10px', backgroundColor: '#344848',
                  color: 'white', border: 'none', borderRadius: '6px',
                  fontSize: '14px', cursor: 'pointer', fontWeight: '500', transition: 'all 0.2s'
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
  )

  const content = (
    <>
      {/* ========== TÍTULO (apenas quando não está embedded) ========== */}
      {!embedded && (
      <div style={{ marginBottom: isSmallScreen ? '16px' : '20px' }}>
        <h2 style={{ margin: 0, fontSize: isSmallScreen ? '16px' : '18px', fontWeight: '600', color: '#344848' }}>
          Cobranças Avulsas
        </h2>
        <p style={{ margin: '5px 0 0 0', fontSize: isSmallScreen ? '13px' : '14px', color: '#666' }}>
          {cobrancasFiltradas.length} de {cobrancas.length} cobrança(s)
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
      <div style={{
        backgroundColor: 'white', borderRadius: '0',
        border: 'none', boxShadow: 'none',
        padding: isSmallScreen ? '0 0 16px 0' : '0 0 20px 0',
        marginBottom: 0
      }}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)',
          gap: isSmallScreen ? '12px' : '16px'
        }}>
          {/* Card 1: Total Cobranças */}
          <div style={{
            padding: '14px 18px', borderLeft: '3px solid #2196F3',
            backgroundColor: '#f0f7ff', borderRadius: '8px'
          }}>
            <p style={{ fontSize: '13px', color: '#666', margin: '0 0 6px 0' }}>Total</p>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Icon icon="mdi:receipt-text-outline" width="18" height="18" style={{ color: '#2196F3' }} />
              <span style={{ fontSize: '20px', fontWeight: '700', color: '#344848' }}>
                {quantidadeTotal}
              </span>
            </div>
            <p style={{ fontSize: '12px', color: '#888', margin: '4px 0 0 0' }}>
              cobrança{quantidadeTotal !== 1 ? 's' : ''}
            </p>
          </div>

          {/* Card 2: Valor Recebido */}
          <div style={{
            padding: '14px 18px', borderLeft: '3px solid #4CAF50',
            backgroundColor: '#f1f8f4', borderRadius: '8px'
          }}>
            <p style={{ fontSize: '13px', color: '#666', margin: '0 0 6px 0' }}>Recebido</p>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Icon icon="mdi:check-circle-outline" width="18" height="18" style={{ color: '#4CAF50' }} />
              <span style={{ fontSize: isSmallScreen ? '16px' : '20px', fontWeight: '700', color: '#344848' }}>
                {formatarMoeda(totalRecebido)}
              </span>
            </div>
          </div>

          {/* Card 3: Valor Pendente */}
          <div style={{
            padding: '14px 18px', borderLeft: '3px solid #f44336',
            backgroundColor: '#fff5f5', borderRadius: '8px'
          }}>
            <p style={{ fontSize: '13px', color: '#666', margin: '0 0 6px 0' }}>Pendente</p>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Icon icon="solar:danger-triangle-linear" width="18" height="18" style={{ color: '#f44336' }} />
              <span style={{ fontSize: isSmallScreen ? '16px' : '20px', fontWeight: '700', color: '#344848' }}>
                {formatarMoeda(totalPendente)}
              </span>
            </div>
          </div>

          {/* Card 4: Valor Total */}
          <div style={{
            padding: '14px 18px', borderLeft: '3px solid #ff9800',
            backgroundColor: '#fff8f0', borderRadius: '8px'
          }}>
            <p style={{ fontSize: '13px', color: '#666', margin: '0 0 6px 0' }}>Valor Total</p>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Icon icon="mdi:chart-line" width="18" height="18" style={{ color: '#ff9800' }} />
              <span style={{ fontSize: isSmallScreen ? '16px' : '20px', fontWeight: '700', color: '#344848' }}>
                {formatarMoeda(totalGeral)}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ========== LISTA ========== */}
      {cobrancasFiltradas.length === 0 ? (
        <div style={{
          backgroundColor: 'white', borderRadius: '8px', padding: '60px 20px',
          textAlign: 'center', border: '1px solid #e5e7eb', boxShadow: 'none'
        }}>
          <Icon icon="mdi:receipt-text-plus-outline" width="48" height="48" style={{ color: '#ccc', marginBottom: '12px' }} />
          <h3 style={{ margin: '0 0 8px 0', fontSize: '16px', color: '#666' }}>
            {cobrancas.length === 0 ? 'Nenhuma cobrança avulsa cadastrada' : 'Nenhuma cobrança encontrada'}
          </h3>
          <p style={{ margin: 0, fontSize: '14px', color: '#999' }}>
            {cobrancas.length === 0
              ? 'Clique em "Nova Cobrança" para registrar uma venda avulsa.'
              : 'Tente ajustar os filtros de busca.'
            }
          </p>
        </div>
      ) : isSmallScreen ? (
        /* ===== MOBILE: CARDS ===== */
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {cobrancasPaginadas.map(cobranca => {
            const catInfo = getCategoriaInfo(cobranca.categoria)
            return (
              <div
                key={cobranca.id}
                onClick={() => abrirModalEditar(cobranca)}
                style={{
                  backgroundColor: 'white', borderRadius: '8px', padding: '14px',
                  border: '1px solid #e5e7eb', boxShadow: 'none',
                  borderLeft: `4px solid ${catInfo.cor}`,
                  cursor: 'pointer'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '14px', fontWeight: '600', color: '#1a1a1a', marginBottom: '4px' }}>
                      {cobranca.descricao}
                    </div>
                    <div style={{ fontSize: '12px', color: '#999' }}>
                      {catInfo.label}
                      {cobranca.devedores?.nome && ` · ${cobranca.devedores.nome}`}
                    </div>
                    {cobranca.observacoes && (
                      <div style={{
                        fontSize: '11px', color: '#aaa', marginTop: '3px', fontStyle: 'italic',
                        maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
                      }}>
                        {cobranca.observacoes}
                      </div>
                    )}
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '15px', fontWeight: '700', color: '#1a1a1a' }}>{formatarMoeda(cobranca.valor)}</div>
                    <div style={{ marginTop: '4px' }}>{getStatusBadge(cobranca)}</div>
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid #f0f0f0', paddingTop: '8px' }}>
                  <div style={{ fontSize: '12px', color: '#999' }}>
                    Venc: {new Date(cobranca.data_vencimento + 'T00:00:00').toLocaleDateString('pt-BR')}
                  </div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleMarcarPago(cobranca) }}
                      title={cobranca.status === 'pago' ? 'Desfazer pagamento' : 'Marcar como pago'}
                      style={{
                        padding: '6px 10px',
                        backgroundColor: cobranca.status === 'pago' ? '#e8f5e9' : '#f5f5f5',
                        color: cobranca.status === 'pago' ? '#4CAF50' : '#666',
                        border: 'none', borderRadius: '4px', cursor: 'pointer',
                        fontSize: '12px', fontWeight: '500', display: 'flex', alignItems: 'center', gap: '4px'
                      }}
                    >
                      <Icon icon={cobranca.status === 'pago' ? 'mdi:check-circle' : 'mdi:check-circle-outline'} width="16" height="16" />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); setConfirmDelete({ show: true, cobranca }) }}
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
            )
          })}
        </div>
      ) : (
        /* ===== DESKTOP: TABELA ===== */
        <div style={{
          backgroundColor: 'white', borderRadius: '8px',
          border: '1px solid #e5e7eb', boxShadow: 'none', overflow: 'hidden'
        }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #f0f0f0' }}>
                <th style={{ padding: '14px 16px', textAlign: 'left', fontSize: '13px', fontWeight: '600', color: '#666' }}>Descrição</th>
                <th style={{ padding: '14px 16px', textAlign: 'center', fontSize: '13px', fontWeight: '600', color: '#666' }}>Aluno</th>
                <th style={{ padding: '14px 16px', textAlign: 'center', fontSize: '13px', fontWeight: '600', color: '#666' }}>Categoria</th>
                <th style={{ padding: '14px 16px', textAlign: 'center', fontSize: '13px', fontWeight: '600', color: '#666' }}>Valor</th>
                <th style={{ padding: '14px 16px', textAlign: 'center', fontSize: '13px', fontWeight: '600', color: '#666' }}>Vencimento</th>
                <th style={{ padding: '14px 16px', textAlign: 'center', fontSize: '13px', fontWeight: '600', color: '#666' }}>Status</th>
                <th style={{ padding: '14px 16px', textAlign: 'center', fontSize: '13px', fontWeight: '600', color: '#666' }}>Ações</th>
              </tr>
            </thead>
            <tbody>
              {cobrancasPaginadas.map(cobranca => {
                const catInfo = getCategoriaInfo(cobranca.categoria)
                return (
                  <tr key={cobranca.id} style={{ borderBottom: '1px solid #f5f5f5', transition: 'background-color 0.15s', cursor: 'pointer' }}
                    onClick={() => abrirModalEditar(cobranca)}
                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#fafafa'}
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                  >
                    <td style={{ padding: '12px 16px', fontSize: '14px', color: '#1a1a1a', fontWeight: '500' }}>
                      <div>{cobranca.descricao}</div>
                      {cobranca.observacoes && (
                        <div title={cobranca.observacoes} style={{
                          fontSize: '12px', color: '#999', fontWeight: '400', marginTop: '2px', fontStyle: 'italic',
                          maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
                        }}>
                          {cobranca.observacoes}
                        </div>
                      )}
                    </td>
                    <td style={{ padding: '12px 16px', fontSize: '13px', color: '#666', textAlign: 'center' }}>
                      {cobranca.devedores?.nome || <span style={{ color: '#ccc' }}>-</span>}
                    </td>
                    <td style={{ padding: '12px 16px', fontSize: '13px', textAlign: 'center' }}>
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', gap: '6px',
                        backgroundColor: catInfo.cor + '15', color: catInfo.cor,
                        padding: '4px 10px', borderRadius: '14px', fontSize: '12px', fontWeight: '600'
                      }}>
                        <Icon icon={catInfo.icon} width="14" height="14" />
                        {catInfo.label}
                      </span>
                    </td>
                    <td style={{ padding: '12px 16px', fontSize: '14px', fontWeight: '600', color: '#1a1a1a', textAlign: 'center' }}>
                      {formatarMoeda(cobranca.valor)}
                    </td>
                    <td style={{ padding: '12px 16px', fontSize: '13px', color: '#666', textAlign: 'center' }}>
                      {new Date(cobranca.data_vencimento + 'T00:00:00').toLocaleDateString('pt-BR')}
                    </td>
                    <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                      {getStatusBadge(cobranca)}
                    </td>
                    <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                      <div style={{ display: 'flex', gap: '6px', justifyContent: 'center' }}>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleMarcarPago(cobranca) }}
                          title={cobranca.status === 'pago' ? 'Desfazer pagamento' : 'Marcar como pago'}
                          style={{
                            padding: '6px 8px',
                            backgroundColor: cobranca.status === 'pago' ? '#e8f5e9' : '#f5f5f5',
                            color: cobranca.status === 'pago' ? '#4CAF50' : '#666',
                            border: 'none', borderRadius: '4px', cursor: 'pointer',
                            display: 'flex', alignItems: 'center', transition: 'all 0.2s'
                          }}
                        >
                          <Icon icon={cobranca.status === 'pago' ? 'mdi:check-circle' : 'mdi:check-circle-outline'} width="18" height="18" />
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); setConfirmDelete({ show: true, cobranca }) }}
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
                )
              })}
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
              border: '1px solid #ddd', borderRadius: '6px', cursor: paginaAtual === 1 ? 'default' : 'pointer', fontSize: '13px'
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
                    borderRadius: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: '500', minWidth: '36px'
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
              border: '1px solid #ddd', borderRadius: '6px', cursor: paginaAtual === totalPaginas ? 'default' : 'pointer', fontSize: '13px'
            }}
          >
            <Icon icon="mdi:chevron-right" width="18" height="18" />
          </button>
        </div>
      )}

      {/* ========== MODAL CRIAR/EDITAR ========== */}
      {mostrarModal && (
        <div
          onClick={fecharModal}
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
                {editando ? 'Editar Cobrança' : 'Nova Cobrança Avulsa'}
              </h3>
              <button onClick={fecharModal} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px' }}>
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
                placeholder="Ex: Uniforme GG, Luva de boxe..."
                style={{
                  width: '100%', padding: '10px 12px', border: '1px solid #ddd',
                  borderRadius: '6px', fontSize: '16px', outline: 'none', boxSizing: 'border-box'
                }}
                onFocus={(e) => e.currentTarget.style.borderColor = '#344848'}
                onBlur={(e) => e.currentTarget.style.borderColor = '#ddd'}
              />
            </div>

            {/* Valor + Categoria lado a lado */}
            <div style={{ display: 'flex', gap: '12px', marginBottom: '14px' }}>
              <div style={{ flex: 1 }}>
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
                    borderRadius: '6px', fontSize: '16px', outline: 'none', boxSizing: 'border-box'
                  }}
                  onFocus={(e) => e.currentTarget.style.borderColor = '#344848'}
                  onBlur={(e) => e.currentTarget.style.borderColor = '#ddd'}
                />
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: '13px', fontWeight: '600', color: '#344848', display: 'block', marginBottom: '6px' }}>Categoria</label>
                <select
                  value={formCategoria}
                  onChange={(e) => {
                    if (e.target.value === '__nova__') {
                      setMostrarModalCategoria(true)
                    } else {
                      setFormCategoria(e.target.value)
                    }
                  }}
                  style={{
                    width: '100%', padding: '10px 12px', border: '1px solid #ddd',
                    borderRadius: '6px', fontSize: '16px', outline: 'none', backgroundColor: 'white', boxSizing: 'border-box'
                  }}
                >
                  {todasCategorias.map(cat => (
                    <option key={cat.value} value={cat.value}>{cat.label}</option>
                  ))}
                  <option value="__nova__">+ Nova categoria</option>
                </select>
              </div>
            </div>

            {/* Data vencimento */}
            <div style={{ marginBottom: '14px' }}>
              <label style={{ fontSize: '13px', fontWeight: '600', color: '#344848', display: 'block', marginBottom: '6px' }}>Data de vencimento <span style={{ fontWeight: '400', color: '#999' }}>(opcional)</span></label>
              <input
                type="date"
                value={formDataVencimento}
                onChange={(e) => setFormDataVencimento(e.target.value)}
                style={{
                  width: '100%', padding: '10px 12px', border: '1px solid #ddd',
                  borderRadius: '6px', fontSize: '16px', outline: 'none', boxSizing: 'border-box',
                  backgroundColor: 'white', WebkitAppearance: 'none', color: '#333'
                }}
                onFocus={(e) => e.currentTarget.style.borderColor = '#344848'}
                onBlur={(e) => e.currentTarget.style.borderColor = '#ddd'}
              />
            </div>

            {/* Aluno (opcional) */}
            <div style={{ marginBottom: '14px' }}>
              <label style={{ fontSize: '13px', fontWeight: '600', color: '#344848', display: 'block', marginBottom: '6px' }}>
                Aluno <span style={{ fontWeight: '400', color: '#999' }}>(opcional)</span>
              </label>
              <select
                value={formDevedorId}
                onChange={(e) => setFormDevedorId(e.target.value)}
                style={{
                  width: '100%', padding: '10px 12px', border: '1px solid #ddd',
                  borderRadius: '6px', fontSize: '16px', outline: 'none', backgroundColor: 'white', boxSizing: 'border-box'
                }}
              >
                <option value="">Sem vínculo</option>
                {alunos.map(a => (
                  <option key={a.id} value={a.id}>{a.nome}</option>
                ))}
              </select>
            </div>

            {/* Status */}
            <div style={{ marginBottom: '14px' }}>
              <label style={{ fontSize: '13px', fontWeight: '600', color: '#344848', display: 'block', marginBottom: '6px' }}>Status</label>
              <select
                value={formStatus}
                onChange={(e) => setFormStatus(e.target.value)}
                style={{
                  width: '100%', padding: '10px 12px', border: '1px solid #ddd',
                  borderRadius: '6px', fontSize: '16px', outline: 'none',
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
                    borderRadius: '6px', fontSize: '16px', outline: 'none',
                    boxSizing: 'border-box', backgroundColor: 'white'
                  }}
                >
                  <option value="">Não informado</option>
                  {FORMAS_PAGAMENTO.map(f => (
                    <option key={f.value} value={f.value}>{f.label}</option>
                  ))}
                </select>
              </div>
            )}

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
                  borderRadius: '6px', fontSize: '16px', outline: 'none',
                  resize: 'vertical', boxSizing: 'border-box', fontFamily: 'inherit'
                }}
                onFocus={(e) => e.currentTarget.style.borderColor = '#344848'}
                onBlur={(e) => e.currentTarget.style.borderColor = '#ddd'}
              />
            </div>

            {/* Botões */}
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button
                onClick={fecharModal}
                style={{
                  padding: '10px 20px', borderRadius: '6px', border: '1px solid #e0e0e0',
                  backgroundColor: 'white', color: '#666', fontSize: '14px',
                  fontWeight: '500', cursor: 'pointer', minWidth: '100px'
                }}
              >
                Cancelar
              </button>
              <button
                onClick={handleSalvar}
                disabled={salvando}
                style={{
                  padding: '10px 20px', borderRadius: '6px', border: 'none',
                  backgroundColor: '#344848', color: 'white', fontSize: '14px',
                  fontWeight: '500', cursor: salvando ? 'default' : 'pointer',
                  minWidth: '100px', opacity: salvando ? 0.7 : 1
                }}
              >
                {salvando ? 'Salvando...' : (editando ? 'Salvar' : 'Criar')}
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
                placeholder="Ex: Luvas, Quimono..."
                style={{
                  width: '100%', padding: '10px 12px', border: '1px solid #ddd',
                  borderRadius: '6px', fontSize: '16px', outline: 'none', boxSizing: 'border-box'
                }}
              />
            </div>

            <div style={{ marginBottom: '20px' }}>
              <label style={{ fontSize: '13px', fontWeight: '600', color: '#344848', display: 'block', marginBottom: '6px' }}>Cor</label>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                {CORES_CUSTOM.map(cor => (
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
                onClick={() => {
                  const nome = novaCategoriaLabel.trim()
                  if (!nome) { showToast('Informe o nome da categoria', 'warning'); return }
                  const value = nome.toLowerCase().replace(/\s+/g, '_').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
                  if (todasCategorias.find(c => c.value === value)) {
                    showToast('Essa categoria já existe', 'warning')
                    return
                  }
                  const nova = { value, label: nome, icon: 'mdi:tag-outline', cor: novaCategoriaCor }
                  setCategoriasCustom(prev => [...prev, nova])
                  setFormCategoria(value)
                  setNovaCategoriaLabel('')
                  setNovaCategoriaCor('#607D8B')
                  setMostrarModalCategoria(false)
                  showToast('Categoria criada!', 'success')
                }}
                style={{
                  padding: '10px 20px', borderRadius: '6px', border: 'none',
                  backgroundColor: '#344848', color: 'white', fontSize: '14px',
                  fontWeight: '500', cursor: 'pointer'
                }}
              >
                Criar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========== MODAIS DE CONFIRMAÇÃO ========== */}
      <ConfirmModal
        isOpen={confirmDelete.show}
        onClose={() => setConfirmDelete({ show: false, cobranca: null })}
        onConfirm={confirmarExclusao}
        title="Excluir cobrança"
        message={`Tem certeza que deseja excluir "${confirmDelete.cobranca?.descricao}"?\n\nEsta ação não pode ser desfeita.`}
        confirmText="Excluir"
        cancelText="Cancelar"
        type="danger"
      />

      <ConfirmModal
        isOpen={confirmDesfazerPago.show}
        onClose={() => setConfirmDesfazerPago({ show: false, cobranca: null })}
        onConfirm={confirmarDesfazerPago}
        title="Desfazer pagamento"
        message={`Deseja desfazer o pagamento de "${confirmDesfazerPago.cobranca?.descricao}"?\n\nO status voltará para pendente.`}
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
    <div style={{ flex: 1, padding: isSmallScreen ? '16px' : '25px 30px', backgroundColor: '#ffffff', minHeight: '100vh' }}>
      {content}
    </div>
  )
}
