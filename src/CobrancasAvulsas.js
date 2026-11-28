import { useState, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from './supabaseClient'
import { showToast } from './Toast'
import ConfirmModal from './ConfirmModal'
import { SkeletonList, SkeletonTable, SkeletonCard } from './components/Skeleton'
import useWindowSize from './hooks/useWindowSize'
import { useUser } from './contexts/UserContext'
import { exportarCobrancasAvulsas } from './utils/exportUtils'
import whatsappService from './services/whatsappService'
import Button from './design-system/components/Button'
import SearchInput from './design-system/components/SearchInput'
import Input from './design-system/components/Input'
import Select from './design-system/components/Select'
import Badge from './design-system/components/Badge'
import StatCard from './design-system/components/StatCard'
import EmptyState from './design-system/components/EmptyState'
import Card from './design-system/components/Card'
import Table from './design-system/components/Table'
import Modal from './design-system/components/Modal'
import Textarea from './design-system/components/Textarea'
import DateField from './components/DateField'
import { hojeISO } from './utils/dataLocal'

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
        data_pagamento: formStatus === 'pago' ? hojeISO() : null,
        devedor_id: formDevedorId || null,
        observacoes: formObservacoes.trim() || null
      }

      // Só confirma no WhatsApp quando o status vira 'pago' agora (não em edição que já era pago)
      const virouPago = formStatus === 'pago' && (!editando || editando.status !== 'pago')
      let cobrancaId = editando?.id

      if (editando) {
        const { error } = await supabase
          .from('cobrancas_avulsas')
          .update(dados)
          .eq('id', editando.id)
        if (error) throw error
        showToast('Cobrança atualizada!', 'success')
      } else {
        const { data: inserida, error } = await supabase
          .from('cobrancas_avulsas')
          .insert(dados)
          .select('id')
          .single()
        if (error) throw error
        cobrancaId = inserida?.id
        showToast('Cobrança criada!', 'success')
      }

      // Confirmação de pagamento ao aluno (só se houver aluno vinculado)
      if (virouPago && cobrancaId && dados.devedor_id) {
        whatsappService.enviarConfirmacaoPagamentoAvulsa(cobrancaId).catch(() => {})
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
          data_pagamento: hojeISO()
        })
        .eq('id', cobranca.id)
      if (error) throw error
      showToast('Cobrança marcada como paga!', 'success')
      // Confirmação de pagamento ao aluno (só se houver aluno vinculado)
      if (cobranca.devedor_id) {
        whatsappService.enviarConfirmacaoPagamentoAvulsa(cobranca.id).catch(() => {})
      }
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
        className="btn-filtrar-avulsas"
        variant={temFiltrosAtivos ? 'secondary' : 'outline'}
        icon={isSmallScreen ? undefined : 'mdi:filter-outline'}
        aria-expanded={mostrarFiltros}
        onClick={abrirFiltros}
        style={{ flex: isSmallScreen ? 1 : 'none' }}
      >
        Filtrar
        {temFiltrosAtivos && (
          <span style={{
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
        onClick={abrirModalNova}
        style={{ flex: isSmallScreen ? 1 : 'none' }}
      >
        {isSmallScreen ? 'Adicionar' : 'Nova cobrança'}
      </Button>

      {/* Filtros — Modal do DS, igual ao de Nova cobrança */}
      <Modal
        isOpen={mostrarFiltros}
        onClose={() => setMostrarFiltros(false)}
        title="Filtros"
        size="sm"
      >
        <Modal.Body>
          <div>
            <div style={{ marginBottom: '16px' }}>
              <SearchInput
                label="Buscar"
                placeholder="Descrição ou nome do aluno..."
                value={rascunho.busca}
                onChange={(e) => mudarRascunho('busca', e.target.value)}
              />
            </div>

            <div style={{ marginBottom: '16px' }}>
              <Select
                label="Categoria"
                portal
                options={[{ value: 'todos', label: 'Todas' }, ...todasCategorias.map(cat => ({ value: cat.value, label: cat.label, icon: cat.icon }))]}
                value={rascunho.filtroCategoria}
                onChange={(v) => mudarRascunho('filtroCategoria', v)}
              />
            </div>

            <div style={{ marginBottom: '16px' }}>
              <Select
                label="Status"
                portal
                options={[
                  { value: 'todos', label: 'Todos' },
                  { value: 'pendente', label: 'Pendente' },
                  { value: 'pago', label: 'Pago' },
                  { value: 'atrasado', label: 'Atrasado' },
                  { value: 'cancelado', label: 'Cancelado' }
                ]}
                value={rascunho.filtroStatus}
                onChange={(v) => mudarRascunho('filtroStatus', v)}
              />
            </div>

            <div style={{ marginBottom: '16px' }}>
              <span className="ds-input-label" style={{ display: 'block', marginBottom: '6px' }}>Período</span>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <DateField value={rascunho.filtroDataInicio} onChange={(v) => mudarRascunho('filtroDataInicio', v)} />
                <span style={{ color: 'var(--color-text-muted)', fontSize: 'var(--text-xs)', fontWeight: 500 }}>até</span>
                <DateField value={rascunho.filtroDataFim} onChange={(v) => mudarRascunho('filtroDataFim', v)} />
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
        display: 'grid',
        gridTemplateColumns: isSmallScreen ? 'repeat(2, minmax(0, 1fr))' : 'repeat(4, minmax(0, 1fr))',
        gap: isSmallScreen ? '10px' : '16px',
        marginBottom: isSmallScreen ? '16px' : '20px'
      }}>
        <StatCard
          label="Vendas"
          icon="mdi:receipt-text-outline"
          accent="info"
          tinted
          size={isMobile ? 'sm' : 'md'}
          value={String(quantidadeTotal)}
          hint={`cobrança${quantidadeTotal !== 1 ? 's' : ''} no total`}
        />
        <StatCard
          label="Recebido"
          icon="mdi:check-circle-outline"
          accent="success"
          tinted
          size={isMobile ? 'sm' : 'md'}
          value={formatarMoeda(totalRecebido)}
          hint="já pago"
          onClick={() => setFiltroStatus(filtroStatus === 'pago' ? 'todos' : 'pago')}
          aria-pressed={filtroStatus === 'pago'}
          title="Filtrar a lista pelas vendas pagas"
        />
        <StatCard
          label="Pendente"
          icon="solar:danger-triangle-linear"
          accent="danger"
          tinted
          size={isMobile ? 'sm' : 'md'}
          value={formatarMoeda(totalPendente)}
          hint="a receber"
          onClick={() => setFiltroStatus(filtroStatus === 'pendente' ? 'todos' : 'pendente')}
          aria-pressed={filtroStatus === 'pendente'}
          title="Filtrar a lista pelas vendas pendentes"
        />
        <StatCard
          label="Valor total"
          icon="mdi:chart-line"
          accent="warning"
          tinted
          size={isMobile ? 'sm' : 'md'}
          value={formatarMoeda(totalGeral)}
          hint="recebido + pendente"
        />
      </div>

      {/* ========== LISTA ========== */}
      {cobrancasFiltradas.length === 0 ? (
        cobrancas.length === 0 ? (
          <EmptyState
            variant="first-use"
            icon="mdi:receipt-text-plus-outline"
            title="Nenhuma venda registrada"
            description="Registre uniforme, luva, aula avulsa ou qualquer cobrança fora da mensalidade."
            action={<Button variant="primary" icon="mdi:plus" onClick={abrirModalNova}>Nova cobrança</Button>}
          />
        ) : (
          <EmptyState
            variant="no-matches"
            title="Nenhuma venda com esses filtros"
            description="Mude a busca ou os filtros para ver outras vendas."
            action={<Button variant="outline" onClick={limparFiltros}>Limpar filtros</Button>}
          />
        )
      ) : isSmallScreen ? (
        /* ===== CELULAR: CARTÕES ===== */
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {cobrancasPaginadas.map(cobranca => {
            const catInfo = getCategoriaInfo(cobranca.categoria)
            return (
              <Card
                key={cobranca.id}
                padding="tight"
                onClick={() => abrirModalEditar(cobranca)}
                role="button"
                tabIndex={0}
                aria-label={`Editar venda ${cobranca.descricao}`}
                onKeyDown={(e) => {
                  if (e.target !== e.currentTarget) return
                  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); abrirModalEditar(cobranca) }
                }}
                style={{ cursor: 'pointer', borderLeft: `4px solid ${catInfo.cor}` }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', marginBottom: '8px' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 'var(--text-md)', fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: '2px' }}>
                      {cobranca.descricao}
                    </div>
                    <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
                      {catInfo.label}
                      {cobranca.devedores?.nome && ` · ${cobranca.devedores.nome}`}
                    </div>
                    {cobranca.observacoes && (
                      <div title={cobranca.observacoes} style={{ fontSize: 'var(--text-2xs)', color: 'var(--color-text-muted)', marginTop: '3px', fontStyle: 'italic', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {cobranca.observacoes}
                      </div>
                    )}
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--color-text-primary)' }}>{formatarMoeda(cobranca.valor)}</div>
                    <div style={{ marginTop: '4px' }}>{getStatusBadge(cobranca)}</div>
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--color-border-subtle)', paddingTop: '8px' }}>
                  <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
                    Venc: {new Date(cobranca.data_vencimento + 'T00:00:00').toLocaleDateString('pt-BR')}
                  </div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <Button
                      variant={cobranca.status === 'pago' ? 'outline' : 'gray'}
                      size="sm"
                      selected={cobranca.status === 'pago'}
                      icon={cobranca.status === 'pago' ? 'mdi:check-circle' : 'mdi:check-circle-outline'}
                      iconOnly
                      aria-label={cobranca.status === 'pago' ? 'Desfazer pagamento' : 'Marcar como pago'}
                      title={cobranca.status === 'pago' ? 'Desfazer pagamento' : 'Marcar como pago'}
                      onClick={(e) => { e.stopPropagation(); handleMarcarPago(cobranca) }}
                    />
                    <Button
                      variant="danger-soft"
                      size="sm"
                      icon="mdi:delete-outline"
                      iconOnly
                      aria-label="Excluir venda"
                      title="Excluir"
                      onClick={(e) => { e.stopPropagation(); setConfirmDelete({ show: true, cobranca }) }}
                    />
                  </div>
                </div>
              </Card>
            )
          })}
        </div>
      ) : (
        /* ===== COMPUTADOR: TABELA DO DS ===== */
        <Table
          data={cobrancasPaginadas}
          rowKey="id"
          onRowClick={(cobranca) => abrirModalEditar(cobranca)}
          columns={[
            {
              key: 'descricao',
              label: 'Descrição',
              render: (cobranca) => (
                <>
                  <div style={{ fontWeight: 600, color: 'var(--color-text-primary)' }}>{cobranca.descricao}</div>
                  {cobranca.observacoes && (
                    <div title={cobranca.observacoes} style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', marginTop: '2px', fontStyle: 'italic', maxWidth: '220px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {cobranca.observacoes}
                    </div>
                  )}
                </>
              )
            },
            {
              key: 'aluno',
              label: 'Aluno',
              align: 'center',
              render: (cobranca) => cobranca.devedores?.nome || <span style={{ color: 'var(--color-text-muted)' }}>—</span>
            },
            {
              key: 'categoria',
              label: 'Categoria',
              align: 'center',
              render: (cobranca) => {
                const catInfo = getCategoriaInfo(cobranca.categoria)
                return (
                  <Badge icon={catInfo.icon} customColor={catInfo.cor + '1A'} customTextColor={catInfo.cor}>
                    {catInfo.label}
                  </Badge>
                )
              }
            },
            {
              key: 'valor',
              label: 'Valor',
              align: 'center',
              render: (cobranca) => <span style={{ fontWeight: 700, color: 'var(--color-text-primary)' }}>{formatarMoeda(cobranca.valor)}</span>
            },
            {
              key: 'vencimento',
              label: 'Vencimento',
              align: 'center',
              render: (cobranca) => new Date(cobranca.data_vencimento + 'T00:00:00').toLocaleDateString('pt-BR')
            },
            {
              key: 'status',
              label: 'Status',
              align: 'center',
              render: (cobranca) => getStatusBadge(cobranca)
            },
            {
              key: 'acoes',
              label: 'Ações',
              align: 'center',
              width: 110,
              render: (cobranca) => (
                <div data-no-row-click style={{ display: 'flex', gap: '6px', justifyContent: 'center' }}>
                  <Button
                    variant={cobranca.status === 'pago' ? 'outline' : 'gray'}
                    size="sm"
                    selected={cobranca.status === 'pago'}
                    icon={cobranca.status === 'pago' ? 'mdi:check-circle' : 'mdi:check-circle-outline'}
                    iconOnly
                    aria-label={cobranca.status === 'pago' ? 'Desfazer pagamento' : 'Marcar como pago'}
                    title={cobranca.status === 'pago' ? 'Desfazer pagamento' : 'Marcar como pago'}
                    onClick={(e) => { e.stopPropagation(); handleMarcarPago(cobranca) }}
                  />
                  <Button
                    variant="danger-soft"
                    size="sm"
                    icon="mdi:delete-outline"
                    iconOnly
                    aria-label="Excluir venda"
                    title="Excluir"
                    onClick={(e) => { e.stopPropagation(); setConfirmDelete({ show: true, cobranca }) }}
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

      {/* ========== MODAL CRIAR/EDITAR ========== */}
      <Modal
        isOpen={mostrarModal}
        onClose={fecharModal}
        title={editando ? 'Editar cobrança' : 'Nova cobrança avulsa'}
        size="md"
        closeOnEsc={!mostrarModalCategoria}
        closeOnBackdrop={!mostrarModalCategoria}
      >
        <Modal.Body>

            {/* Descrição */}
            <div style={{ marginBottom: '14px' }}>
              <Input
                label="Descrição"
                required
                value={formDescricao}
                onChange={(e) => setFormDescricao(e.target.value)}
                placeholder="Ex: Uniforme GG, Luva de boxe..."
              />
            </div>

            {/* Valor + Categoria lado a lado */}
            <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: '12px', marginBottom: '14px' }}>
              <div style={{ flex: 1 }}>
                <Input
                  label="Valor"
                  required
                  type="number"
                  step="0.01"
                  min="0"
                  prefix="R$"
                  inputMode="decimal"
                  value={formValor}
                  onChange={(e) => setFormValor(e.target.value)}
                  placeholder="0,00"
                />
              </div>
              <div style={{ flex: 1 }}>
                <Select
                  label="Categoria"
                  portal
                  options={todasCategorias.map(cat => ({ value: cat.value, label: cat.label, icon: cat.icon }))}
                  value={formCategoria}
                  onChange={(v) => setFormCategoria(v)}
                  onCreate={() => setMostrarModalCategoria(true)}
                  createLabel="Nova categoria"
                />
              </div>
            </div>

            {/* Data vencimento */}
            <div style={{ marginBottom: '14px' }}>
              <DateField
                label="Data de vencimento (opcional)"
                value={formDataVencimento}
                onChange={setFormDataVencimento}
              />
            </div>

            {/* Aluno (opcional) */}
            <div style={{ marginBottom: '14px' }}>
              <Select
                label="Aluno (opcional)"
                portal
                searchable
                clearable
                placeholder="Sem vínculo"
                searchPlaceholder="Buscar aluno…"
                options={alunos.map(a => ({ value: a.id, label: a.nome }))}
                value={formDevedorId}
                onChange={(v) => setFormDevedorId(v || '')}
              />
            </div>

            {/* Status */}
            <div style={{ marginBottom: '14px' }}>
              <Select
                label="Status"
                portal
                options={[
                  { value: 'pendente', label: 'Pendente' },
                  { value: 'pago', label: 'Pago' },
                  { value: 'cancelado', label: 'Cancelado' }
                ]}
                value={formStatus}
                onChange={(v) => setFormStatus(v)}
              />
            </div>

            {/* Forma de pagamento (só se pago) */}
            {formStatus === 'pago' && (
              <div style={{ marginBottom: '14px' }}>
                <Select
                  label="Forma de pagamento"
                  portal
                  clearable
                  placeholder="Não informado"
                  options={FORMAS_PAGAMENTO.map(f => ({ value: f.value, label: f.label }))}
                  value={formFormaPagamento}
                  onChange={(v) => setFormFormaPagamento(v || '')}
                />
              </div>
            )}

            {/* Observações */}
            <Textarea
              label="Observações"
              value={formObservacoes}
              onChange={(e) => setFormObservacoes(e.target.value)}
              placeholder="Anotações opcionais..."
              rows={3}
            />
        </Modal.Body>
        <Modal.Footer>
          <Button variant="outline" onClick={fecharModal}>Cancelar</Button>
          <Button variant="primary" loading={salvando} onClick={handleSalvar}>
            {editando ? 'Salvar' : 'Criar'}
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

            <div style={{ marginBottom: '16px' }}>
              <Input
                label="Nome"
                value={novaCategoriaLabel}
                onChange={(e) => setNovaCategoriaLabel(e.target.value)}
                placeholder="Ex: Luvas, Quimono..."
              />
            </div>

            <div>
              <span className="ds-input-label" id="nova-cat-venda-cor" style={{ display: 'block', marginBottom: '8px' }}>Cor</span>
              <div role="radiogroup" aria-labelledby="nova-cat-venda-cor" style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                {CORES_CUSTOM.map(cor => (
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
        </Modal.Body>
        <Modal.Footer>
              <Button variant="outline" onClick={() => setMostrarModalCategoria(false)}>
                Cancelar
              </Button>
              <Button
                variant="primary"
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
              >
                Criar
              </Button>
        </Modal.Footer>
      </Modal>

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

    </>
  )

  if (embedded) return content
  return (
    <div style={{ flex: 1, padding: isSmallScreen ? '16px' : '25px 30px', backgroundColor: '#ffffff', minHeight: '100vh' }}>
      {content}
    </div>
  )
}
