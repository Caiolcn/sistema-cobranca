import { useState, useEffect, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { supabase } from './supabaseClient'
import { Icon } from '@iconify/react'
import { showToast } from './Toast'
import ConfirmModal from './ConfirmModal'
import { exportarClientes } from './utils/exportUtils'
import { validarTelefone, validarCPF } from './utils/validators'
import { SkeletonList, SkeletonTable } from './components/Skeleton'
import useWindowSize from './hooks/useWindowSize'
import { useUserPlan } from './hooks/useUserPlan'
import { useUser } from './contexts/UserContext'

export default function Clientes() {
  const { isMobile, isTablet, isSmallScreen } = useWindowSize()
  const { limiteClientes, plano } = useUserPlan()
  const { userId, loading: loadingUser } = useUser()
  const [searchParams, setSearchParams] = useSearchParams()
  const [clientes, setClientes] = useState([])
  const [clientesFiltrados, setClientesFiltrados] = useState([])
  const [loading, setLoading] = useState(true)
  const [clienteSelecionado, setClienteSelecionado] = useState(null)
  const [mostrarModal, setMostrarModal] = useState(false)
  const [mensalidadesCliente, setMensalidadesCliente] = useState([])
  const [editando, setEditando] = useState(false)
  const [nomeEdit, setNomeEdit] = useState('')
  const [telefoneEdit, setTelefoneEdit] = useState('')
  const [cpfEdit, setCpfEdit] = useState('')
  const [dataNascimentoEdit, setDataNascimentoEdit] = useState('')
  const [busca, setBusca] = useState('')

  // Filtros
  const [mostrarFiltros, setMostrarFiltros] = useState(false)
  const [filtroStatus, setFiltroStatus] = useState(searchParams.get('status') || 'todos')
  const [filtroPlano, setFiltroPlano] = useState(searchParams.get('plano') || 'todos')
  const [filtroAssinatura, setFiltroAssinatura] = useState(searchParams.get('assinatura') || 'todos')
  const [filtroInadimplente, setFiltroInadimplente] = useState(searchParams.get('inadimplente') === 'true')
  const [confirmDelete, setConfirmDelete] = useState({ show: false, cliente: null })
  const [mostrarModalNovoCliente, setMostrarModalNovoCliente] = useState(false)
  const [novoClienteNome, setNovoClienteNome] = useState('')
  const [novoClienteTelefone, setNovoClienteTelefone] = useState('')
  const [novoClienteCpf, setNovoClienteCpf] = useState('')
  const [novoClienteDataNascimento, setNovoClienteDataNascimento] = useState('')
  const [criarAssinatura, setCriarAssinatura] = useState(false)
  const [dataInicioAssinatura, setDataInicioAssinatura] = useState('')
  const [planoSelecionado, setPlanoSelecionado] = useState('')
  const [planos, setPlanos] = useState([])
  const [mostrarModalCriarPlano, setMostrarModalCriarPlano] = useState(false)
  const [novoPlanoNome, setNovoPlanoNome] = useState('')
  const [novoPlanoValor, setNovoPlanoValor] = useState('')
  const [novoPlanoCiclo, setNovoPlanoCiclo] = useState('mensal')
  const [novoPlanoDescricao, setNovoPlanoDescricao] = useState('')

  // Estados para modais de confirmação
  const [confirmPagamento, setConfirmPagamento] = useState({ show: false, mensalidade: null, novoPago: false })
  const [confirmAssinatura, setConfirmAssinatura] = useState({ show: false, clienteId: null, novoStatus: false })
  const [mostrarModalSelecionarPlano, setMostrarModalSelecionarPlano] = useState({ show: false, clienteId: null })
  const [planoParaAtivar, setPlanoParaAtivar] = useState('')
  const [dataInicioAssinaturaModal, setDataInicioAssinaturaModal] = useState('')
  const [erroModalNovoCliente, setErroModalNovoCliente] = useState('')

  // Modal de Mensalidade
  const [mostrarModalMensalidade, setMostrarModalMensalidade] = useState(false)
  const [mensalidadeSelecionada, setMensalidadeSelecionada] = useState(null)
  const [clienteMensalidade, setClienteMensalidade] = useState(null)

  // Paginação
  const [paginaAtual, setPaginaAtual] = useState(1)
  const itensPorPagina = 20

  useEffect(() => {
    if (userId) {
      carregarClientes()
      carregarPlanos()
    }
  }, [userId])

  // Fechar popover ao clicar fora
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (mostrarFiltros && !event.target.closest('.popover-filtros') && !event.target.closest('.btn-filtrar')) {
        setMostrarFiltros(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [mostrarFiltros])

  useEffect(() => {
    // Filtrar clientes quando busca ou filtros mudarem
    let filtrados = [...clientes]

    // Filtro de busca por nome ou telefone
    if (busca.trim() !== '') {
      const termo = busca.toLowerCase()
      filtrados = filtrados.filter(cliente =>
        cliente.nome.toLowerCase().includes(termo) ||
        cliente.telefone.toLowerCase().includes(termo)
      )
    }

    // Filtro de Status (baseado em mensalidades e assinatura)
    if (filtroStatus !== 'todos') {
      filtrados = filtrados.filter(cliente => {
        if (filtroStatus === 'ativo') {
          // Cliente ativo = assinatura ativa OU status Em dia/Sem mensalidade (não atrasado)
          return cliente.assinatura_ativa || cliente.status === 'Em dia' || cliente.status === 'Sem mensalidade'
        } else if (filtroStatus === 'inadimplente') {
          return cliente.status === 'Atrasado'
        } else if (filtroStatus === 'cancelado') {
          return !cliente.assinatura_ativa
        }
        return true
      })
    }

    // Filtro de Plano
    if (filtroPlano !== 'todos') {
      filtrados = filtrados.filter(cliente => cliente.plano_id === filtroPlano)
    }

    // Filtro de Assinatura Ativa/Desativada
    if (filtroAssinatura === 'ativada') {
      filtrados = filtrados.filter(cliente => cliente.assinatura_ativa === true)
    } else if (filtroAssinatura === 'desativada') {
      filtrados = filtrados.filter(cliente => cliente.assinatura_ativa === false)
    }

    // Filtro de Inadimplente (query parameter da Home)
    if (filtroInadimplente) {
      filtrados = filtrados.filter(cliente => cliente.status === 'Atrasado')
    }

    setClientesFiltrados(filtrados)
    setPaginaAtual(1) // Resetar para primeira página quando filtros mudam
  }, [busca, clientes, filtroStatus, filtroPlano, filtroAssinatura, filtroInadimplente])

  // Calcular dados de paginação
  const totalPaginas = Math.ceil(clientesFiltrados.length / itensPorPagina)
  const indiceInicio = (paginaAtual - 1) * itensPorPagina
  const indiceFim = indiceInicio + itensPorPagina
  const clientesPaginados = clientesFiltrados.slice(indiceInicio, indiceFim)

  const carregarPlanos = useCallback(async () => {
    if (!userId) return

    try {
      const { data, error } = await supabase
        .from('planos')
        .select('*')
        .eq('user_id', userId)
        .eq('ativo', true)
        .order('nome', { ascending: true })

      if (error) throw error

      setPlanos(data || [])
    } catch (error) {
      console.error('Erro ao carregar planos:', error)
    }
  }, [userId])

  const carregarClientes = useCallback(async () => {
    if (!userId) return

    setLoading(true)
    try {
      // OTIMIZAÇÃO: Executar queries em paralelo
      const [
        { data: clientesData, error: clientesError },
        { data: mensalidadesData, error: mensalidadesError }
      ] = await Promise.all([
        // Buscar clientes com dados do plano (apenas ativos, lixo = false)
        supabase
          .from('devedores')
          .select(`
            id,
            nome,
            telefone,
            cpf,
            assinatura_ativa,
            plano_id,
            created_at,
            planos:plano_id (nome)
          `)
          .eq('user_id', userId)
          .or('lixo.is.null,lixo.eq.false')
          .order('nome', { ascending: true }),

        // Buscar próximas mensalidades (apenas futuras ou pendentes)
        supabase
          .from('mensalidades')
          .select('devedor_id, data_vencimento, status, is_mensalidade')
          .eq('user_id', userId)
          .eq('is_mensalidade', true)
          .in('status', ['pendente', 'atrasado'])
          .order('data_vencimento', { ascending: true })
      ])

      if (clientesError) throw clientesError
      if (mensalidadesError) throw mensalidadesError

      // OTIMIZAÇÃO: Usar Map para lookup O(1) ao invés de .find() O(N)
      // Isso elimina o padrão N+1 de busca
      const mensalidadesMap = new Map()
      mensalidadesData?.forEach(m => {
        // Só guarda a primeira (mais próxima) mensalidade por cliente
        if (!mensalidadesMap.has(m.devedor_id)) {
          mensalidadesMap.set(m.devedor_id, m)
        }
      })

      // Processar dados dos clientes - agora O(N) ao invés de O(N²)
      const hoje = new Date()
      hoje.setHours(0, 0, 0, 0)

      const clientesComDados = clientesData.map(cliente => {
        const proximaMensalidade = mensalidadesMap.get(cliente.id)

        // Calcular status baseado na próxima mensalidade
        let status = 'Sem mensalidade'
        if (proximaMensalidade) {
          const dataVenc = new Date(proximaMensalidade.data_vencimento)
          dataVenc.setHours(0, 0, 0, 0)

          if (proximaMensalidade.status === 'atrasado' || dataVenc < hoje) {
            status = 'Atrasado'
          } else {
            status = 'Em dia'
          }
        } else if (cliente.assinatura_ativa) {
          // Cliente com assinatura ativa mas sem mensalidade pendente = Em dia
          status = 'Em dia'
        }

        return {
          ...cliente,
          plano_nome: cliente.planos?.nome || null,
          proxima_mensalidade: proximaMensalidade?.data_vencimento || null,
          status
        }
      })

      setClientes(clientesComDados)
    } catch (error) {
      console.error('Erro ao carregar clientes:', error)
      alert('Erro ao carregar clientes: ' + error.message)
    } finally {
      setLoading(false)
    }
  }, [userId])

  const carregarMensalidadesCliente = async (clienteId) => {
    try {
      const { data, error } = await supabase
        .from('mensalidades')
        .select('*')
        .eq('devedor_id', clienteId)
        .order('data_vencimento', { ascending: true })

      if (error) throw error

      // Calcular status e ordenar: atrasado > aberto > pago
      const mensalidadesComStatus = (data || []).map(mensalidade => {
        let status = mensalidade.status

        if (status === 'pendente') {
          const hoje = new Date()
          hoje.setHours(0, 0, 0, 0)
          const vencimento = new Date(mensalidade.data_vencimento)
          vencimento.setHours(0, 0, 0, 0)

          if (vencimento < hoje) {
            status = 'atrasado'
          } else {
            status = 'aberto'
          }
        }

        return { ...mensalidade, statusCalculado: status }
      })

      // Ordenar por prioridade: atrasado (1), aberto (2), pago (3)
      mensalidadesComStatus.sort((a, b) => {
        const prioridade = { atrasado: 1, aberto: 2, pago: 3 }
        if (prioridade[a.statusCalculado] !== prioridade[b.statusCalculado]) {
          return prioridade[a.statusCalculado] - prioridade[b.statusCalculado]
        }
        // Se mesmo status, ordenar por data de vencimento (mais próximo primeiro)
        return new Date(a.data_vencimento) - new Date(b.data_vencimento)
      })

      setMensalidadesCliente(mensalidadesComStatus)
    } catch (error) {
      console.error('Erro ao carregar mensalidades:', error)
    }
  }

  const handleClienteClick = async (cliente) => {
    try {
      if (!cliente || !cliente.id) {
        console.error('Cliente inválido:', cliente)
        showToast('Erro ao abrir ficha do cliente', 'error')
        return
      }

      // Carregar mensalidades primeiro para calcular estatísticas
      const { data: mensalidadesData, error } = await supabase
        .from('mensalidades')
        .select('*')
        .eq('devedor_id', cliente.id)
        .order('data_vencimento', { ascending: true })

      if (error) throw error

      // Calcular estatísticas
      const mensalidades = mensalidadesData || []
      const totalMensalidades = mensalidades.length
      const mensalidadesPagas = mensalidades.filter(m => m.status === 'pago').length
      const valorDevido = mensalidades
        .filter(m => m.status === 'pendente' || m.status === 'atrasado')
        .reduce((total, m) => total + parseFloat(m.valor || 0), 0)

      // Novos cálculos para indicadores melhorados
      const valorPago = mensalidades
        .filter(m => m.status === 'pago')
        .reduce((total, m) => total + parseFloat(m.valor || 0), 0)

      const hoje = new Date()
      hoje.setHours(0, 0, 0, 0)

      const mensalidadesAtrasadas = mensalidades.filter(m => {
        if (m.status === 'pago') return false
        const vencimento = new Date(m.data_vencimento)
        vencimento.setHours(0, 0, 0, 0)
        return vencimento < hoje
      }).length

      const valorAtrasado = mensalidades
        .filter(m => {
          if (m.status === 'pago') return false
          const vencimento = new Date(m.data_vencimento)
          vencimento.setHours(0, 0, 0, 0)
          return vencimento < hoje
        })
        .reduce((total, m) => total + parseFloat(m.valor || 0), 0)

      const parcelasPendentes = totalMensalidades - mensalidadesPagas

      // Buscar logs de mensagens enviadas para este cliente
      const { data: logsData } = await supabase
        .from('logs_mensagens')
        .select('id, enviado_em')
        .eq('devedor_id', cliente.id)
        .order('enviado_em', { ascending: false })

      const totalMensagensEnviadas = logsData?.length || 0
      const ultimoContato = logsData?.[0]?.enviado_em || null

      // Calcular tempo de casa (baseado na primeira mensalidade ou data de criação)
      let tempoDeCasa = null
      if (mensalidades.length > 0) {
        const primeiraData = new Date(mensalidades[0].data_vencimento)
        const diffTime = Math.abs(hoje - primeiraData)
        const diffMonths = Math.ceil(diffTime / (1000 * 60 * 60 * 24 * 30))
        tempoDeCasa = diffMonths
      } else if (cliente.created_at) {
        const dataCreated = new Date(cliente.created_at)
        const diffTime = Math.abs(hoje - dataCreated)
        const diffMonths = Math.ceil(diffTime / (1000 * 60 * 60 * 24 * 30))
        tempoDeCasa = diffMonths
      }

      // Atualizar cliente com as estatísticas
      const clienteComEstatisticas = {
        ...cliente,
        totalMensalidades,
        mensalidadesPagas,
        valorDevido,
        valorPago,
        mensalidadesAtrasadas,
        valorAtrasado,
        parcelasPendentes,
        totalMensagensEnviadas,
        ultimoContato,
        tempoDeCasa
      }

      setClienteSelecionado(clienteComEstatisticas)
      setNomeEdit(cliente.nome || '')
      setTelefoneEdit(cliente.telefone || '')
      setCpfEdit(cliente.cpf || '')
      setDataNascimentoEdit(cliente.data_nascimento || '')
      setEditando(false)
      setMostrarModal(true)
      await carregarMensalidadesCliente(cliente.id)
    } catch (error) {
      console.error('Erro ao abrir ficha do cliente:', error)
      showToast('Erro ao carregar dados do cliente', 'error')
      setMostrarModal(false)
    }
  }

  const handleSalvarEdicao = async () => {
    if (!nomeEdit.trim() || !telefoneEdit.trim()) {
      showToast('Preencha nome e telefone', 'warning')
      return
    }

    // Validar telefone
    if (!validarTelefone(telefoneEdit)) {
      showToast('Telefone inválido. Use o formato (XX) XXXXX-XXXX', 'warning')
      return
    }

    // Validar CPF se preenchido
    if (cpfEdit.trim() && !validarCPF(cpfEdit)) {
      showToast('CPF inválido', 'warning')
      return
    }

    if (!userId) return

    try {
      // Verificar se já existe outro cliente com o mesmo telefone
      const telefoneFormatado = telefoneEdit.trim().replace(/\D/g, '')
      const { data: clienteExistente } = await supabase
        .from('devedores')
        .select('id, nome')
        .eq('user_id', userId)
        .neq('id', clienteSelecionado.id)

      const duplicado = clienteExistente?.find(c =>
        c.telefone?.replace(/\D/g, '') === telefoneFormatado
      ) || clientes.find(c =>
        c.id !== clienteSelecionado.id &&
        c.telefone?.replace(/\D/g, '') === telefoneFormatado
      )

      if (duplicado) {
        showToast(`Já existe um cliente com este telefone (${duplicado.nome})`, 'warning')
        return
      }

      const { error } = await supabase
        .from('devedores')
        .update({
          nome: nomeEdit.trim(),
          telefone: telefoneEdit.trim(),
          cpf: cpfEdit.trim() || null,
          data_nascimento: dataNascimentoEdit || null
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

  const handleAlterarStatusMensalidade = (mensalidade, novoPago) => {
    setConfirmPagamento({ show: true, mensalidade, novoPago })
  }

  const confirmarAlteracaoPagamento = async () => {
    const { mensalidade, novoPago } = confirmPagamento
    if (!mensalidade) return

    try {
      const { error } = await supabase
        .from('mensalidades')
        .update({ status: novoPago ? 'pago' : 'pendente' })
        .eq('id', mensalidade.id)

      if (error) throw error

      showToast(novoPago ? 'Pagamento confirmado!' : 'Pagamento desfeito!', 'success')

      // Atualizar mensalidades do cliente no modal
      await carregarMensalidadesCliente(clienteSelecionado.id)

      // Recarregar lista de clientes para atualizar valores
      carregarClientes()
    } catch (error) {
      showToast('Erro ao atualizar: ' + error.message, 'error')
    } finally {
      setConfirmPagamento({ show: false, mensalidade: null, novoPago: false })
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
      // Soft delete: marcar cliente como lixo = true
      const { error: clienteError } = await supabase
        .from('devedores')
        .update({
          lixo: true,
          deletado_em: new Date().toISOString()
        })
        .eq('id', cliente.id)

      if (clienteError) throw clienteError

      showToast('Cliente excluído com sucesso!', 'success')

      // Fechar o modal de detalhes do cliente
      setMostrarModal(false)
      setClienteSelecionado(null)

      // Fechar o modal de confirmação
      setConfirmDelete({ show: false, cliente: null })

      // Recarregar lista de clientes
      carregarClientes()
    } catch (error) {
      showToast('Erro ao excluir cliente: ' + error.message, 'error')
    }
  }

  const handleAlterarAssinatura = (clienteId, novoStatus) => {
    // Se está tentando ativar a assinatura
    if (novoStatus) {
      // Verificar se o cliente já tem um plano
      const cliente = clientes.find(c => c.id === clienteId) || clienteSelecionado
      if (!cliente?.plano_id) {
        // Se não tem plano, abrir modal para selecionar
        setPlanoParaAtivar('')
        setDataInicioAssinaturaModal(new Date().toISOString().split('T')[0])
        setMostrarModalSelecionarPlano({ show: true, clienteId })
        return
      }
    }
    // Se já tem plano ou está desativando, mostrar confirmação normal
    setConfirmAssinatura({ show: true, clienteId, novoStatus })
  }

  const confirmarAtivarAssinaturaComPlano = async () => {
    const { clienteId } = mostrarModalSelecionarPlano
    if (!clienteId || !planoParaAtivar || !dataInicioAssinaturaModal) {
      showToast('Selecione um plano e data de início', 'warning')
      return
    }

    if (!userId) return

    try {
      const plano = planos.find(p => p.id === planoParaAtivar)

      if (!plano) {
        showToast('Plano não encontrado', 'error')
        return
      }

      // Atualizar o cliente com o plano e ativar a assinatura
      const { error } = await supabase
        .from('devedores')
        .update({
          assinatura_ativa: true,
          plano_id: planoParaAtivar
        })
        .eq('id', clienteId)

      if (error) throw error

      // Criar primeira mensalidade
      const dataInicio = new Date(dataInicioAssinaturaModal + 'T00:00:00')
      const dataVencimento = new Date(dataInicio)
      dataVencimento.setDate(dataVencimento.getDate() + 30)

      const { error: mensalidadeError } = await supabase
        .from('mensalidades')
        .insert({
          user_id: userId,
          devedor_id: clienteId,
          valor: parseFloat(plano.valor),
          data_vencimento: dataVencimento.toISOString().split('T')[0],
          status: 'pendente',
          is_mensalidade: true,
          numero_mensalidade: 1
        })

      if (mensalidadeError) {
        console.error('Erro ao criar mensalidade:', mensalidadeError)
        showToast('Assinatura ativada, mas houve erro ao criar mensalidade', 'warning')
      } else {
        showToast('Assinatura ativada e primeira mensalidade criada!', 'success')
      }

      // Atualizar cliente selecionado se existir
      if (clienteSelecionado?.id === clienteId) {
        setClienteSelecionado(prev => ({
          ...prev,
          assinatura_ativa: true,
          plano_id: planoParaAtivar,
          plano_nome: plano?.nome
        }))
      }

      // Recarregar lista de clientes
      await carregarClientes()
    } catch (error) {
      console.error('Erro ao ativar assinatura:', error)
      showToast('Erro ao ativar assinatura: ' + error.message, 'error')
    } finally {
      setMostrarModalSelecionarPlano({ show: false, clienteId: null })
      setPlanoParaAtivar('')
      setDataInicioAssinaturaModal('')
    }
  }

  const confirmarAlteracaoAssinatura = async () => {
    const { clienteId, novoStatus } = confirmAssinatura
    if (!clienteId) return

    try {
      const { error } = await supabase
        .from('devedores')
        .update({ assinatura_ativa: novoStatus })
        .eq('id', clienteId)

      if (error) throw error

      showToast(
        novoStatus ? 'Assinatura ativada com sucesso!' : 'Assinatura desativada!',
        'success'
      )

      // Atualizar cliente selecionado se existir
      if (clienteSelecionado?.id === clienteId) {
        setClienteSelecionado(prev => ({ ...prev, assinatura_ativa: novoStatus }))
      }

      // Recarregar lista de clientes
      await carregarClientes()
    } catch (error) {
      console.error('Erro ao alterar assinatura:', error)
      showToast('Erro ao alterar assinatura: ' + error.message, 'error')
    } finally {
      setConfirmAssinatura({ show: false, clienteId: null, novoStatus: false })
    }
  }

  const formatarTelefone = (value) => {
    const numbers = value.replace(/\D/g, '')
    if (numbers.length <= 11) {
      return numbers
        .replace(/^(\d{2})(\d)/, '($1) $2')
        .replace(/(\d{5})(\d)/, '$1-$2')
    }
    return value
  }

  const formatarCpfCnpj = (value) => {
    const numeros = value.replace(/\D/g, '')
    if (numeros.length <= 11) {
      // CPF: 000.000.000-00
      if (numeros.length <= 3) return numeros
      if (numeros.length <= 6) return numeros.replace(/(\d{3})(\d+)/, '$1.$2')
      if (numeros.length <= 9) return numeros.replace(/(\d{3})(\d{3})(\d+)/, '$1.$2.$3')
      return numeros.replace(/(\d{3})(\d{3})(\d{3})(\d+)/, '$1.$2.$3-$4')
    } else {
      // CNPJ: 00.000.000/0000-00
      if (numeros.length <= 2) return numeros
      if (numeros.length <= 5) return numeros.replace(/(\d{2})(\d+)/, '$1.$2')
      if (numeros.length <= 8) return numeros.replace(/(\d{2})(\d{3})(\d+)/, '$1.$2.$3')
      if (numeros.length <= 12) return numeros.replace(/(\d{2})(\d{3})(\d{3})(\d+)/, '$1.$2.$3/$4')
      return numeros.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d+)/, '$1.$2.$3/$4-$5').slice(0, 18)
    }
  }

  const handleMensalidadeClick = async (cliente, event) => {
    event.stopPropagation()

    if (!cliente.proxima_mensalidade) return

    try {
      // Buscar a mensalidade do cliente
      const { data: mensalidade, error } = await supabase
        .from('mensalidades')
        .select('*')
        .eq('devedor_id', cliente.id)
        .eq('data_vencimento', cliente.proxima_mensalidade)
        .single()

      if (error) throw error

      // Calcular status
      let statusCalculado = mensalidade.status
      if (statusCalculado === 'pendente') {
        const hoje = new Date()
        hoje.setHours(0, 0, 0, 0)
        const vencimento = new Date(mensalidade.data_vencimento)
        vencimento.setHours(0, 0, 0, 0)
        statusCalculado = vencimento < hoje ? 'atrasado' : 'aberto'
      }

      setMensalidadeSelecionada({ ...mensalidade, statusCalculado })
      setClienteMensalidade(cliente)
      setMostrarModalMensalidade(true)
    } catch (error) {
      console.error('Erro ao carregar mensalidade:', error)
      showToast('Erro ao carregar detalhes da mensalidade', 'error')
    }
  }

  const handleMarcarMensalidadePaga = async () => {
    if (!mensalidadeSelecionada) return

    const novoPago = mensalidadeSelecionada.status !== 'pago'
    const confirmar = window.confirm(
      novoPago
        ? `Confirmar pagamento de R$ ${parseFloat(mensalidadeSelecionada.valor).toFixed(2)}?`
        : 'Desfazer o pagamento desta mensalidade?'
    )

    if (!confirmar) return

    try {
      const { error } = await supabase
        .from('mensalidades')
        .update({ status: novoPago ? 'pago' : 'pendente' })
        .eq('id', mensalidadeSelecionada.id)

      if (error) throw error

      showToast(novoPago ? 'Pagamento confirmado!' : 'Pagamento desfeito!', 'success')
      setMostrarModalMensalidade(false)
      setMensalidadeSelecionada(null)
      carregarClientes()
    } catch (error) {
      showToast('Erro ao atualizar: ' + error.message, 'error')
    }
  }

  const handleCriarPlanoRapido = async () => {
    if (!novoPlanoNome.trim() || !novoPlanoValor || parseFloat(novoPlanoValor) <= 0) {
      showToast('Preencha o nome e valor do plano', 'warning')
      return
    }

    if (!userId) return

    try {
      const { data, error } = await supabase.from('planos').insert({
        user_id: userId,
        nome: novoPlanoNome.trim(),
        valor: parseFloat(novoPlanoValor),
        ciclo_cobranca: novoPlanoCiclo,
        descricao: novoPlanoDescricao.trim() || null,
        ativo: true
      }).select()

      if (error) throw error

      showToast('Plano criado com sucesso!', 'success')
      setMostrarModalCriarPlano(false)
      setNovoPlanoNome('')
      setNovoPlanoValor('')
      setNovoPlanoCiclo('mensal')
      setNovoPlanoDescricao('')

      // Recarregar planos e selecionar o recém-criado
      await carregarPlanos()
      if (data && data.length > 0) {
        setPlanoSelecionado(data[0].id)
      }
    } catch (error) {
      console.error('Erro ao criar plano:', error)
      showToast('Erro ao criar plano: ' + error.message, 'error')
    }
  }

  const handleCriarCliente = async () => {
    setErroModalNovoCliente('')

    if (!novoClienteNome.trim() || !novoClienteTelefone.trim()) {
      setErroModalNovoCliente('Preencha nome e telefone')
      return
    }

    // Validar telefone
    if (!validarTelefone(novoClienteTelefone)) {
      setErroModalNovoCliente('Telefone inválido. Use o formato (XX) XXXXX-XXXX')
      return
    }

    // Validar CPF se preenchido
    if (novoClienteCpf.trim() && !validarCPF(novoClienteCpf)) {
      setErroModalNovoCliente('CPF inválido')
      return
    }

    if (criarAssinatura && (!dataInicioAssinatura || !planoSelecionado)) {
      setErroModalNovoCliente('Preencha a data de início e selecione um plano')
      return
    }

    // Verificar limite de clientes do plano (apenas clientes com assinatura ativa contam)
    const clientesAtivos = clientes.filter(c => c.assinatura_ativa && !c.deleted_at).length
    if (clientesAtivos >= limiteClientes) {
      setErroModalNovoCliente(`Limite de ${limiteClientes} clientes ativos atingido no plano ${plano?.toUpperCase() || 'atual'}. Faça upgrade para adicionar mais clientes.`)
      return
    }

    if (!userId) return

    try {
      // Verificar se já existe cliente com o mesmo telefone
      const telefoneFormatado = novoClienteTelefone.trim().replace(/\D/g, '')
      const duplicado = clientes.find(c =>
        c.telefone?.replace(/\D/g, '') === telefoneFormatado
      )

      if (duplicado) {
        setErroModalNovoCliente(`Já existe um cliente com este telefone (${duplicado.nome})`)
        return
      }

      // Criar cliente
      const { data: clienteData, error: clienteError } = await supabase
        .from('devedores')
        .insert({
          user_id: userId,
          nome: novoClienteNome.trim(),
          telefone: novoClienteTelefone.trim(),
          cpf: novoClienteCpf.trim() || null,
          data_nascimento: novoClienteDataNascimento || null,
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
        const planoEncontrado = planos.find(p => p.id === planoSelecionado)
        if (!planoEncontrado) {
          showToast('Plano não encontrado', 'error')
          return
        }

        // Calcular data de vencimento (data_inicio + 30 dias)
        const dataInicio = new Date(dataInicioAssinatura + 'T00:00:00')
        const dataVencimento = new Date(dataInicio)
        dataVencimento.setDate(dataVencimento.getDate() + 30)

        const { error: mensalidadeError } = await supabase
          .from('mensalidades')
          .insert({
            user_id: userId,
            devedor_id: clienteData[0].id,
            valor: planoEncontrado.valor,
            data_vencimento: dataVencimento.toISOString().split('T')[0],
            status: 'pendente',
            is_mensalidade: true,
            numero_mensalidade: 1
          })

        if (mensalidadeError) throw mensalidadeError
      }

      showToast('Cliente criado com sucesso!', 'success')
      setMostrarModalNovoCliente(false)
      setNovoClienteNome('')
      setNovoClienteTelefone('')
      setNovoClienteCpf('')
      setNovoClienteDataNascimento('')
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

  const getStatusBadge = (mensalidade) => {
    // Usar statusCalculado se disponível, senão calcular
    let status = mensalidade.statusCalculado || mensalidade.status

    if (!mensalidade.statusCalculado && status === 'pendente') {
      const hoje = new Date()
      hoje.setHours(0, 0, 0, 0)
      const vencimento = new Date(mensalidade.data_vencimento)
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
      <div style={{ flex: 1, padding: isSmallScreen ? '16px' : '25px 30px', backgroundColor: '#f5f5f5', minHeight: '100vh' }}>
        {isSmallScreen ? (
          <SkeletonList count={8} />
        ) : (
          <SkeletonTable rows={10} columns={5} />
        )}
      </div>
    )
  }

  // Verificar se existem filtros ativos
  const temFiltrosAtivos = filtroStatus !== 'todos' || filtroPlano !== 'todos' ||
                           filtroAssinatura !== 'todos' || filtroInadimplente

  return (
    <div style={{ flex: 1, padding: isSmallScreen ? '16px' : '25px 30px', backgroundColor: '#f5f5f5', minHeight: '100vh' }}>
      {/* Header */}
      <div style={{
        backgroundColor: 'white',
        borderRadius: '8px',
        padding: isSmallScreen ? '16px' : '20px',
        marginBottom: isSmallScreen ? '16px' : '25px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.08)'
      }}>
        <div style={{ display: 'flex', flexDirection: isSmallScreen ? 'column' : 'row', justifyContent: 'space-between', alignItems: isSmallScreen ? 'stretch' : 'flex-start', marginBottom: '16px', gap: isSmallScreen ? '16px' : '0' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: isSmallScreen ? '16px' : '18px', fontWeight: '600', color: '#344848' }}>
              Clientes
            </h2>
            <p style={{ margin: '5px 0 0 0', fontSize: isSmallScreen ? '13px' : '14px', color: '#666' }}>
              {clientesFiltrados.length} de {clientes.filter(c => !c.deleted_at).length} cliente(s)
              <span style={{
                marginLeft: '10px',
                padding: '2px 8px',
                backgroundColor: clientes.filter(c => c.assinatura_ativa && !c.deleted_at).length >= limiteClientes ? '#ffebee' : '#e8f5e9',
                color: clientes.filter(c => c.assinatura_ativa && !c.deleted_at).length >= limiteClientes ? '#c62828' : '#2e7d32',
                borderRadius: '10px',
                fontSize: '11px',
                fontWeight: '600'
              }}>
                {clientes.filter(c => c.assinatura_ativa && !c.deleted_at).length}/{limiteClientes} ativos
              </span>
            </p>
          </div>

          {/* Botões */}
          <div style={{ display: 'flex', gap: '8px', position: 'relative' }}>
            <button
              onClick={() => exportarClientes(clientesFiltrados)}
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
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = '#344848'
                e.currentTarget.style.color = '#344848'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = '#ddd'
                e.currentTarget.style.color = '#333'
              }}
            >
              <Icon icon="ph:export-light" width="18" height="18" />
            </button>

            <button
              className="btn-filtrar"
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
              onMouseEnter={(e) => {
                if (!temFiltrosAtivos) {
                  e.currentTarget.style.borderColor = '#344848'
                  e.currentTarget.style.color = '#344848'
                }
              }}
              onMouseLeave={(e) => {
                if (!temFiltrosAtivos) {
                  e.currentTarget.style.borderColor = '#ddd'
                  e.currentTarget.style.color = '#333'
                }
              }}
            >
              <Icon icon="mdi:filter-outline" width="18" height="18" />
              {!isSmallScreen && 'Filtrar'}
              {temFiltrosAtivos && (
                <span style={{
                  position: 'absolute',
                  top: '-6px',
                  right: '-6px',
                  backgroundColor: '#f44336',
                  color: 'white',
                  borderRadius: '50%',
                  width: '20px',
                  height: '20px',
                  fontSize: '11px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: '700',
                  border: '2px solid white'
                }}>
                  {(filtroStatus !== 'todos' ? 1 : 0) + (filtroPlano !== 'todos' ? 1 : 0) +
                   (filtroAssinatura !== 'todos' ? 1 : 0) + (filtroInadimplente ? 1 : 0)}
                </span>
              )}
            </button>

            <button
              onClick={() => {
                setErroModalNovoCliente('')
                setMostrarModalNovoCliente(true)
              }}
              style={{
                padding: isSmallScreen ? '10px 14px' : '10px 20px',
                backgroundColor: '#333',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                fontSize: '14px',
                fontWeight: '500',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                transition: 'background-color 0.2s',
                flex: isSmallScreen ? 1 : 'none'
              }}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#222'}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#333'}
            >
              <Icon icon="mdi:plus" width="18" height="18" />
              {!isSmallScreen && 'Adicionar'}
            </button>

            {/* Popover de filtros */}
            {mostrarFiltros && (
              <div
                className="popover-filtros"
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
                {/* Header do popover */}
                <div style={{
                  padding: '16px',
                  borderBottom: '1px solid #f0f0f0',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  position: isSmallScreen ? 'sticky' : 'relative',
                  top: 0,
                  backgroundColor: 'white',
                  zIndex: 1
                }}>
                  <h3 style={{ margin: 0, fontSize: '15px', fontWeight: '600', color: '#333' }}>
                    Filtros
                  </h3>
                  <button
                    onClick={() => setMostrarFiltros(false)}
                    style={{
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      padding: '4px',
                      display: 'flex',
                      alignItems: 'center',
                      color: '#999'
                    }}
                  >
                    <Icon icon="mdi:close" width="20" height="20" />
                  </button>
                </div>

                {/* Conteúdo dos filtros */}
                <div style={{ padding: '16px' }}>
                  {/* Filtro por Nome */}
                  <div style={{ marginBottom: '16px' }}>
                    <label style={{ display: 'block', fontSize: '13px', color: '#666', marginBottom: '8px', fontWeight: '500' }}>
                      Nome do Cliente
                    </label>
                    <div style={{ position: 'relative' }}>
                      <Icon
                        icon="mdi:magnify"
                        width="18"
                        height="18"
                        style={{
                          position: 'absolute',
                          left: '10px',
                          top: '50%',
                          transform: 'translateY(-50%)',
                          color: '#999'
                        }}
                      />
                      <input
                        type="text"
                        value={busca}
                        onChange={(e) => setBusca(e.target.value)}
                        placeholder="Buscar por nome..."
                        style={{
                          width: '100%',
                          padding: '8px 12px 8px 36px',
                          fontSize: '16px',
                          border: '1px solid #ddd',
                          borderRadius: '6px',
                          backgroundColor: 'white',
                          outline: 'none',
                          boxSizing: 'border-box'
                        }}
                      />
                      {busca && (
                        <button
                          onClick={() => setBusca('')}
                          style={{
                            position: 'absolute',
                            right: '8px',
                            top: '50%',
                            transform: 'translateY(-50%)',
                            background: 'none',
                            border: 'none',
                            cursor: 'pointer',
                            padding: '2px',
                            display: 'flex',
                            alignItems: 'center',
                            color: '#999'
                          }}
                        >
                          <Icon icon="mdi:close-circle" width="16" height="16" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Filtro Status */}
                  <div style={{ marginBottom: '16px' }}>
                    <label style={{ display: 'block', fontSize: '13px', color: '#666', marginBottom: '8px', fontWeight: '500' }}>
                      Status
                    </label>
                    <select
                      value={filtroStatus}
                      onChange={(e) => setFiltroStatus(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '8px 12px',
                        fontSize: '16px',
                        border: '1px solid #ddd',
                        borderRadius: '6px',
                        backgroundColor: 'white',
                        cursor: 'pointer',
                        outline: 'none',
                        boxSizing: 'border-box'
                      }}
                    >
                      <option value="todos">Todos</option>
                      <option value="ativo">Ativo</option>
                      <option value="inadimplente">Inadimplente</option>
                      <option value="cancelado">Cancelado</option>
                    </select>
                  </div>

                  {/* Filtro Plano */}
                  <div style={{ marginBottom: '16px' }}>
                    <label style={{ display: 'block', fontSize: '13px', color: '#666', marginBottom: '8px', fontWeight: '500' }}>
                      Plano
                    </label>
                    <select
                      value={filtroPlano}
                      onChange={(e) => setFiltroPlano(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '8px 12px',
                        fontSize: '16px',
                        border: '1px solid #ddd',
                        borderRadius: '6px',
                        backgroundColor: 'white',
                        cursor: 'pointer',
                        outline: 'none',
                        boxSizing: 'border-box'
                      }}
                    >
                      <option value="todos">Todos os planos</option>
                      {planos.map(plano => (
                        <option key={plano.id} value={plano.id}>{plano.nome}</option>
                      ))}
                    </select>
                  </div>

                  {/* Filtro Assinatura */}
                  <div style={{ marginBottom: '16px' }}>
                    <label style={{ display: 'block', fontSize: '13px', color: '#666', marginBottom: '8px', fontWeight: '500' }}>
                      Assinatura
                    </label>
                    <select
                      value={filtroAssinatura}
                      onChange={(e) => setFiltroAssinatura(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '8px 12px',
                        fontSize: '16px',
                        border: '1px solid #ddd',
                        borderRadius: '6px',
                        backgroundColor: 'white',
                        cursor: 'pointer',
                        outline: 'none',
                        boxSizing: 'border-box'
                      }}
                    >
                      <option value="todos">Todas</option>
                      <option value="ativada">Ativada</option>
                      <option value="desativada">Desativada</option>
                    </select>
                  </div>

                  {/* Botão Limpar Filtros */}
                  <button
                    onClick={() => {
                      setFiltroStatus('todos')
                      setFiltroPlano('todos')
                      setFiltroAssinatura('todos')
                      setFiltroInadimplente(false)
                      setBusca('')
                      setSearchParams({})
                      setMostrarFiltros(false)
                    }}
                    style={{
                      width: '100%',
                      padding: '10px',
                      backgroundColor: '#f5f5f5',
                      color: '#666',
                      border: '1px solid #ddd',
                      borderRadius: '6px',
                      fontSize: '14px',
                      fontWeight: '500',
                      cursor: 'pointer',
                      transition: 'all 0.2s'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = '#ebebeb'
                      e.currentTarget.style.borderColor = '#999'
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = '#f5f5f5'
                      e.currentTarget.style.borderColor = '#ddd'
                    }}
                  >
                    Limpar Filtros
                  </button>
                </div>
              </div>
            )}
          </div>
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
              fontSize: '16px',
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
        backgroundColor: isSmallScreen ? 'transparent' : 'white',
        borderRadius: isSmallScreen ? 0 : '8px',
        boxShadow: isSmallScreen ? 'none' : '0 1px 3px rgba(0,0,0,0.08)',
        overflow: 'hidden'
      }}>
        {clientes.length === 0 ? (
          <div style={{ padding: '60px 20px', textAlign: 'center', backgroundColor: 'white', borderRadius: '8px' }}>
            <Icon icon="mdi:account-off-outline" width="64" height="64" style={{ color: '#ccc', marginBottom: '16px' }} />
            <p style={{ color: '#999', fontSize: '16px', margin: '0' }}>
              Nenhum cliente cadastrado ainda
            </p>
            <p style={{ color: '#ccc', fontSize: '14px', margin: '8px 0 0 0' }}>
              Adicione mensalidades pela tela Financeiro para criar clientes automaticamente
            </p>
          </div>
        ) : clientesFiltrados.length === 0 ? (
          <div style={{ padding: '60px 20px', textAlign: 'center', backgroundColor: 'white', borderRadius: '8px' }}>
            <Icon icon="material-symbols:search-off" width="64" height="64" style={{ color: '#ccc', marginBottom: '16px' }} />
            <p style={{ color: '#999', fontSize: '16px', margin: '0' }}>
              Nenhum cliente encontrado
            </p>
            <p style={{ color: '#ccc', fontSize: '14px', margin: '8px 0 0 0' }}>
              Tente buscar por outro nome ou telefone
            </p>
          </div>
        ) : isSmallScreen ? (
          /* Cards para Mobile */
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {clientesPaginados.map((cliente) => (
              <div
                key={cliente.id}
                onClick={() => handleClienteClick(cliente)}
                style={{
                  backgroundColor: 'white',
                  borderRadius: '8px',
                  padding: '16px',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
                  cursor: 'pointer'
                }}
              >
                {/* Header do card */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{
                      width: '40px',
                      height: '40px',
                      borderRadius: '50%',
                      backgroundColor: '#344848',
                      color: 'white',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '16px',
                      fontWeight: '600'
                    }}>
                      {cliente.nome.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <p style={{ fontSize: '15px', fontWeight: '600', color: '#333', margin: '0 0 2px 0' }}>
                        {cliente.nome}
                      </p>
                      <p style={{ fontSize: '13px', color: '#666', margin: 0 }}>
                        {cliente.telefone}
                      </p>
                    </div>
                  </div>
                  <span style={{
                    backgroundColor: cliente.assinatura_ativa ? '#e8f5e9' : '#ffebee',
                    color: cliente.assinatura_ativa ? '#2e7d32' : '#c62828',
                    padding: '4px 10px',
                    borderRadius: '12px',
                    fontSize: '11px',
                    fontWeight: '600'
                  }}>
                    {cliente.assinatura_ativa ? 'Ativa' : 'Inativa'}
                  </span>
                </div>

                {/* Info do card */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <p style={{ fontSize: '12px', color: '#888', margin: '0 0 2px 0' }}>Plano</p>
                    <p style={{ fontSize: '14px', fontWeight: '500', color: '#333', margin: 0 }}>
                      {cliente.plano_nome || <span style={{ color: '#999', fontStyle: 'italic' }}>Sem plano</span>}
                    </p>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <p style={{ fontSize: '12px', color: '#888', margin: '0 0 2px 0' }}>Próx. Venc.</p>
                    <p style={{
                      fontSize: '14px',
                      fontWeight: '500',
                      color: cliente.proxima_mensalidade && new Date(cliente.proxima_mensalidade) < new Date() ? '#f44336' : '#333',
                      margin: 0
                    }}>
                      {cliente.proxima_mensalidade
                        ? new Date(cliente.proxima_mensalidade + 'T00:00:00').toLocaleDateString('pt-BR')
                        : '-'}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          /* Tabela para Desktop */
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ backgroundColor: '#f9f9f9', borderBottom: '1px solid #e0e0e0' }}>
                  <th style={{ padding: '12px 24px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: '#666', textTransform: 'uppercase', width: '22%' }}>
                    Cliente
                  </th>
                  <th style={{ padding: '12px 24px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: '#666', textTransform: 'uppercase', width: '16%' }}>
                    Telefone
                  </th>
                  <th style={{ padding: '12px 24px', textAlign: 'center', fontSize: '12px', fontWeight: '600', color: '#666', textTransform: 'uppercase', width: '13%' }}>
                    Status
                  </th>
                  <th style={{ padding: '12px 24px', textAlign: 'center', fontSize: '12px', fontWeight: '600', color: '#666', textTransform: 'uppercase', width: '17%' }}>
                    Plano
                  </th>
                  <th style={{ padding: '12px 24px', textAlign: 'center', fontSize: '12px', fontWeight: '600', color: '#666', textTransform: 'uppercase', width: '20%' }}>
                    Próximo Vencimento
                  </th>
                  <th style={{ padding: '12px 24px', textAlign: 'center', fontSize: '12px', fontWeight: '600', color: '#666', textTransform: 'uppercase', width: '12%' }}>
                    Assinatura
                  </th>
                </tr>
              </thead>
              <tbody>
                {clientesPaginados.map((cliente) => (
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
                    <td style={{ padding: '16px 24px', fontSize: '14px', color: '#666' }}>
                      {cliente.telefone}
                    </td>
                    <td style={{ padding: '16px 24px', textAlign: 'center' }}>
                      <span style={{
                        backgroundColor: cliente.assinatura_ativa ? '#e8f5e9' : '#ffebee',
                        color: cliente.assinatura_ativa ? '#2e7d32' : '#c62828',
                        padding: '4px 12px',
                        borderRadius: '12px',
                        fontSize: '12px',
                        fontWeight: '600',
                        display: 'inline-block'
                      }}>
                        {cliente.assinatura_ativa ? 'Ativa' : 'Inativa'}
                      </span>
                    </td>
                    <td style={{ padding: '16px 24px', fontSize: '14px', color: '#333', textAlign: 'center' }}>
                      {cliente.plano_nome || <span style={{ color: '#999', fontStyle: 'italic' }}>Sem plano</span>}
                    </td>
                    <td
                      style={{ padding: '16px 24px', fontSize: '14px', color: '#666', textAlign: 'center' }}
                      onClick={(e) => handleMensalidadeClick(cliente, e)}
                    >
                      {cliente.proxima_mensalidade ? (
                        <span style={{
                          color: new Date(cliente.proxima_mensalidade) < new Date() ? '#f44336' : '#333',
                          cursor: 'pointer',
                          padding: '4px 8px',
                          borderRadius: '4px',
                          transition: 'background-color 0.2s'
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f0f0f0'}
                        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                        >
                          {new Date(cliente.proxima_mensalidade + 'T00:00:00').toLocaleDateString('pt-BR')}
                        </span>
                      ) : (
                        <span style={{ color: '#999', fontStyle: 'italic' }}>-</span>
                      )}
                    </td>
                    <td style={{ padding: '16px 24px', textAlign: 'center' }}>
                      <div onClick={(e) => e.stopPropagation()}>
                        <label style={{ position: 'relative', display: 'inline-block', width: '44px', height: '22px', cursor: 'pointer' }}>
                          <input
                            type="checkbox"
                            checked={cliente.assinatura_ativa}
                            onChange={(e) => {
                              e.stopPropagation()
                              handleAlterarAssinatura(cliente.id, e.target.checked)
                            }}
                            onClick={(e) => e.stopPropagation()}
                            style={{ opacity: 0, width: 0, height: 0 }}
                            title={cliente.assinatura_ativa ? 'Desativar assinatura' : 'Ativar assinatura'}
                          />
                        <span style={{
                          position: 'absolute',
                          cursor: 'pointer',
                          top: 0,
                          left: 0,
                          right: 0,
                          bottom: 0,
                          backgroundColor: cliente.assinatura_ativa ? '#4CAF50' : '#ccc',
                          transition: '0.3s',
                          borderRadius: '22px'
                        }}>
                          <span style={{
                            position: 'absolute',
                            content: '',
                            height: '16px',
                            width: '16px',
                            left: cliente.assinatura_ativa ? '25px' : '3px',
                            bottom: '3px',
                            backgroundColor: 'white',
                            transition: '0.3s',
                            borderRadius: '50%'
                          }} />
                        </span>
                      </label>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Paginação */}
        {totalPaginas > 1 && (
          <div style={{
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            gap: '8px',
            marginTop: '24px',
            flexWrap: 'wrap'
          }}>
            <button
              onClick={() => setPaginaAtual(p => Math.max(1, p - 1))}
              disabled={paginaAtual === 1}
              style={{
                padding: '8px 12px',
                border: '1px solid #e0e0e0',
                borderRadius: '6px',
                backgroundColor: paginaAtual === 1 ? '#f5f5f5' : 'white',
                cursor: paginaAtual === 1 ? 'not-allowed' : 'pointer',
                color: paginaAtual === 1 ? '#999' : '#344848',
                display: 'flex',
                alignItems: 'center',
                gap: '4px'
              }}
            >
              <Icon icon="mdi:chevron-left" width="20" height="20" />
              {!isMobile && 'Anterior'}
            </button>

            <div style={{ display: 'flex', gap: '4px' }}>
              {Array.from({ length: Math.min(5, totalPaginas) }, (_, i) => {
                let pagina
                if (totalPaginas <= 5) {
                  pagina = i + 1
                } else if (paginaAtual <= 3) {
                  pagina = i + 1
                } else if (paginaAtual >= totalPaginas - 2) {
                  pagina = totalPaginas - 4 + i
                } else {
                  pagina = paginaAtual - 2 + i
                }
                return (
                  <button
                    key={pagina}
                    onClick={() => setPaginaAtual(pagina)}
                    style={{
                      width: '36px',
                      height: '36px',
                      border: paginaAtual === pagina ? 'none' : '1px solid #e0e0e0',
                      borderRadius: '6px',
                      backgroundColor: paginaAtual === pagina ? '#344848' : 'white',
                      color: paginaAtual === pagina ? 'white' : '#344848',
                      cursor: 'pointer',
                      fontWeight: paginaAtual === pagina ? '600' : '400',
                      fontSize: '14px'
                    }}
                  >
                    {pagina}
                  </button>
                )
              })}
            </div>

            <button
              onClick={() => setPaginaAtual(p => Math.min(totalPaginas, p + 1))}
              disabled={paginaAtual === totalPaginas}
              style={{
                padding: '8px 12px',
                border: '1px solid #e0e0e0',
                borderRadius: '6px',
                backgroundColor: paginaAtual === totalPaginas ? '#f5f5f5' : 'white',
                cursor: paginaAtual === totalPaginas ? 'not-allowed' : 'pointer',
                color: paginaAtual === totalPaginas ? '#999' : '#344848',
                display: 'flex',
                alignItems: 'center',
                gap: '4px'
              }}
            >
              {!isMobile && 'Próxima'}
              <Icon icon="mdi:chevron-right" width="20" height="20" />
            </button>

            <span style={{
              marginLeft: '16px',
              fontSize: '14px',
              color: '#666'
            }}>
              {clientesFiltrados.length} cliente{clientesFiltrados.length !== 1 ? 's' : ''}
            </span>
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
          backgroundColor: isSmallScreen ? 'white' : 'rgba(0, 0, 0, 0.5)',
          display: 'flex',
          alignItems: isSmallScreen ? 'stretch' : 'center',
          justifyContent: 'center',
          zIndex: 1000,
          padding: isSmallScreen ? 0 : '20px'
        }}>
          <div style={{
            backgroundColor: 'white',
            borderRadius: isSmallScreen ? 0 : '12px',
            width: '100%',
            maxWidth: isSmallScreen ? '100%' : '800px',
            height: isSmallScreen ? '100%' : 'auto',
            maxHeight: isSmallScreen ? '100%' : '90vh',
            overflow: 'auto',
            boxShadow: isSmallScreen ? 'none' : '0 4px 20px rgba(0,0,0,0.15)',
            display: 'flex',
            flexDirection: 'column'
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
                      onChange={(e) => setTelefoneEdit(formatarTelefone(e.target.value))}
                      disabled={!editando}
                      maxLength="15"
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
                      CPF/CNPJ
                    </label>
                    <input
                      type="text"
                      value={cpfEdit}
                      onChange={(e) => setCpfEdit(formatarCpfCnpj(e.target.value))}
                      disabled={!editando}
                      maxLength="18"
                      placeholder="000.000.000-00"
                      style={{
                        width: '100%',
                        padding: '10px',
                        fontSize: '14px',
                        border: '1px solid #ddd',
                        borderRadius: '6px',
                        backgroundColor: editando ? 'white' : '#f5f5f5',
                        color: cpfEdit ? '#333' : '#999',
                        boxSizing: 'border-box'
                      }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', color: '#666', fontWeight: '500' }}>
                      Data de Nascimento
                    </label>
                    <input
                      type="date"
                      value={dataNascimentoEdit}
                      onChange={(e) => setDataNascimentoEdit(e.target.value)}
                      disabled={!editando}
                      style={{
                        width: '100%',
                        padding: '10px',
                        fontSize: '14px',
                        border: '1px solid #ddd',
                        borderRadius: '6px',
                        backgroundColor: editando ? 'white' : '#f5f5f5',
                        color: dataNascimentoEdit ? '#333' : '#999',
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
                        setCpfEdit(clienteSelecionado.cpf || '')
                        setDataNascimentoEdit(clienteSelecionado.data_nascimento || '')
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

              {/* Indicadores do Cliente - 4 Cards */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(4, 1fr)',
                gap: '12px',
                marginBottom: '24px'
              }}>
                {/* Card 1: Total Pago */}
                <div style={{
                  backgroundColor: '#f0fdf4',
                  borderRadius: '10px',
                  padding: '14px',
                  border: '1px solid #bbf7d0',
                  textAlign: 'center'
                }}>
                  <div style={{
                    width: '36px',
                    height: '36px',
                    borderRadius: '8px',
                    backgroundColor: '#dcfce7',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    margin: '0 auto 8px'
                  }}>
                    <Icon icon="mdi:currency-usd" width="20" style={{ color: '#22c55e' }} />
                  </div>
                  <p style={{ margin: 0, fontSize: '11px', color: '#666', fontWeight: '500' }}>Total Pago</p>
                  <p style={{ margin: '2px 0 0 0', fontSize: '18px', fontWeight: '700', color: '#22c55e' }}>
                    R$ {formatCurrency(clienteSelecionado.valorPago || 0)}
                  </p>
                  <p style={{ margin: '2px 0 0 0', fontSize: '10px', color: '#888' }}>desde o início</p>
                </div>

                {/* Card 2: Tempo de Casa */}
                <div style={{
                  backgroundColor: '#eff6ff',
                  borderRadius: '10px',
                  padding: '14px',
                  border: '1px solid #bfdbfe',
                  textAlign: 'center'
                }}>
                  <div style={{
                    width: '36px',
                    height: '36px',
                    borderRadius: '8px',
                    backgroundColor: '#dbeafe',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    margin: '0 auto 8px'
                  }}>
                    <Icon icon="mdi:calendar-clock" width="20" style={{ color: '#3b82f6' }} />
                  </div>
                  <p style={{ margin: 0, fontSize: '11px', color: '#666', fontWeight: '500' }}>Tempo de Casa</p>
                  <p style={{ margin: '2px 0 0 0', fontSize: '18px', fontWeight: '700', color: '#3b82f6' }}>
                    {clienteSelecionado.tempoDeCasa ? (
                      clienteSelecionado.tempoDeCasa >= 12
                        ? `${Math.floor(clienteSelecionado.tempoDeCasa / 12)} ano${Math.floor(clienteSelecionado.tempoDeCasa / 12) !== 1 ? 's' : ''}`
                        : `${clienteSelecionado.tempoDeCasa} ${clienteSelecionado.tempoDeCasa === 1 ? 'mês' : 'meses'}`
                    ) : '-'}
                  </p>
                  <p style={{ margin: '2px 0 0 0', fontSize: '10px', color: '#888' }}>como cliente</p>
                </div>

                {/* Card 3: Mensagens Enviadas */}
                <div style={{
                  backgroundColor: '#faf5ff',
                  borderRadius: '10px',
                  padding: '14px',
                  border: '1px solid #e9d5ff',
                  textAlign: 'center'
                }}>
                  <div style={{
                    width: '36px',
                    height: '36px',
                    borderRadius: '8px',
                    backgroundColor: '#f3e8ff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    margin: '0 auto 8px'
                  }}>
                    <Icon icon="mdi:message-text-outline" width="20" style={{ color: '#a855f7' }} />
                  </div>
                  <p style={{ margin: 0, fontSize: '11px', color: '#666', fontWeight: '500' }}>Mensagens</p>
                  <p style={{ margin: '2px 0 0 0', fontSize: '18px', fontWeight: '700', color: '#a855f7' }}>
                    {clienteSelecionado.totalMensagensEnviadas || 0}
                  </p>
                  <p style={{ margin: '2px 0 0 0', fontSize: '10px', color: '#888' }}>enviadas</p>
                </div>

                {/* Card 4: Último Contato */}
                <div style={{
                  backgroundColor: '#fefce8',
                  borderRadius: '10px',
                  padding: '14px',
                  border: '1px solid #fef08a',
                  textAlign: 'center'
                }}>
                  <div style={{
                    width: '36px',
                    height: '36px',
                    borderRadius: '8px',
                    backgroundColor: '#fef9c3',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    margin: '0 auto 8px'
                  }}>
                    <Icon icon="mdi:clock-check-outline" width="20" style={{ color: '#ca8a04' }} />
                  </div>
                  <p style={{ margin: 0, fontSize: '11px', color: '#666', fontWeight: '500' }}>Último Contato</p>
                  <p style={{ margin: '2px 0 0 0', fontSize: '14px', fontWeight: '700', color: '#ca8a04' }}>
                    {clienteSelecionado.ultimoContato
                      ? new Date(clienteSelecionado.ultimoContato).toLocaleDateString('pt-BR')
                      : 'Nunca'}
                  </p>
                  <p style={{ margin: '2px 0 0 0', fontSize: '10px', color: '#888' }}>
                    {clienteSelecionado.ultimoContato
                      ? new Date(clienteSelecionado.ultimoContato).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
                      : 'sem registro'}
                  </p>
                </div>
              </div>

              {/* Resumo Financeiro */}
              <div style={{
                backgroundColor: clienteSelecionado.mensalidadesAtrasadas > 0 ? '#fef2f2' : '#f8f9fa',
                borderRadius: '10px',
                padding: '16px',
                marginBottom: '24px',
                border: clienteSelecionado.mensalidadesAtrasadas > 0 ? '1px solid #fecaca' : '1px solid #e9ecef'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                  <span style={{ fontSize: '13px', fontWeight: '600', color: '#333' }}>Resumo Financeiro</span>
                  {clienteSelecionado.mensalidadesAtrasadas > 0 && (
                    <span style={{
                      fontSize: '11px',
                      fontWeight: '600',
                      color: '#ef4444',
                      backgroundColor: '#fee2e2',
                      padding: '2px 8px',
                      borderRadius: '10px'
                    }}>
                      {clienteSelecionado.mensalidadesAtrasadas} em atraso
                    </span>
                  )}
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '20px' }}>
                  <div style={{ flex: 1 }}>
                    <p style={{ margin: 0, fontSize: '11px', color: '#666' }}>Mensalidades</p>
                    <p style={{ margin: '2px 0 0 0', fontSize: '16px', fontWeight: '600', color: '#333' }}>
                      {clienteSelecionado.mensalidadesPagas}/{clienteSelecionado.totalMensalidades} pagas
                    </p>
                  </div>
                  <div style={{ flex: 1, textAlign: 'right' }}>
                    <p style={{ margin: 0, fontSize: '11px', color: '#666' }}>Em Aberto</p>
                    <p style={{ margin: '2px 0 0 0', fontSize: '16px', fontWeight: '600', color: clienteSelecionado.mensalidadesAtrasadas > 0 ? '#ef4444' : '#f59e0b' }}>
                      R$ {formatCurrency(clienteSelecionado.valorDevido)}
                    </p>
                  </div>
                </div>
                {clienteSelecionado.totalMensalidades > 0 && (
                  <div style={{ marginTop: '12px' }}>
                    <div style={{ backgroundColor: '#e5e7eb', borderRadius: '4px', height: '6px', overflow: 'hidden' }}>
                      <div style={{
                        width: `${(clienteSelecionado.mensalidadesPagas / clienteSelecionado.totalMensalidades) * 100}%`,
                        backgroundColor: '#22c55e',
                        height: '100%',
                        borderRadius: '4px',
                        transition: 'width 0.3s ease'
                      }} />
                    </div>
                    <p style={{ margin: '4px 0 0 0', fontSize: '10px', color: '#888', textAlign: 'right' }}>
                      {Math.round((clienteSelecionado.mensalidadesPagas / clienteSelecionado.totalMensalidades) * 100)}% quitado
                    </p>
                  </div>
                )}
              </div>

              {/* Lista de Mensalidades */}
              <div>
                <h3 style={{ margin: '0 0 16px 0', fontSize: '16px', fontWeight: '600', color: '#344848' }}>
                  Histórico de Mensalidades ({mensalidadesCliente.length})
                </h3>
                {mensalidadesCliente.length === 0 ? (
                  <p style={{ textAlign: 'center', color: '#999', padding: '20px' }}>
                    Nenhuma mensalidade encontrada
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
                        {mensalidadesCliente.map((mensalidade) => (
                          <tr key={mensalidade.id} style={{ borderBottom: '1px solid #f0f0f0' }}>
                            <td style={{ padding: '12px', fontSize: '14px', color: '#333' }}>
                              {formatDate(mensalidade.data_vencimento)}
                            </td>
                            <td style={{ padding: '12px', fontSize: '14px', fontWeight: '600', color: '#333', textAlign: 'right' }}>
                              R$ {formatCurrency(parseFloat(mensalidade.valor))}
                            </td>
                            <td style={{ padding: '12px', textAlign: 'center' }}>
                              {getStatusBadge(mensalidade)}
                            </td>
                            <td style={{ padding: '12px', textAlign: 'center' }}>
                              <label style={{ position: 'relative', display: 'inline-block', width: '44px', height: '22px' }}>
                                <input
                                  type="checkbox"
                                  checked={mensalidade.status === 'pago'}
                                  onChange={(e) => handleAlterarStatusMensalidade(mensalidade, e.target.checked)}
                                  style={{ opacity: 0, width: 0, height: 0 }}
                                />
                                <span style={{
                                  position: 'absolute',
                                  cursor: 'pointer',
                                  top: 0,
                                  left: 0,
                                  right: 0,
                                  bottom: 0,
                                  backgroundColor: mensalidade.status === 'pago' ? '#4CAF50' : '#ccc',
                                  transition: '0.3s',
                                  borderRadius: '22px'
                                }}>
                                  <span style={{
                                    position: 'absolute',
                                    content: '',
                                    height: '16px',
                                    width: '16px',
                                    left: mensalidade.status === 'pago' ? '25px' : '3px',
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

              {/* Botão de excluir no rodapé do modal */}
              <div style={{
                marginTop: '24px',
                paddingTop: '20px',
                borderTop: '1px solid #e0e0e0',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    handleExcluirCliente(clienteSelecionado, e)
                  }}
                  style={{
                    padding: '10px 20px',
                    backgroundColor: 'transparent',
                    color: '#f44336',
                    border: '2px solid #f44336',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontSize: '14px',
                    fontWeight: '600',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    transition: 'all 0.2s'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = '#f44336'
                    e.currentTarget.style.color = 'white'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = 'transparent'
                    e.currentTarget.style.color = '#f44336'
                  }}
                >
                  <Icon icon="mdi:delete-outline" width="18" />
                  Excluir Cliente
                </button>
                <button
                  onClick={() => setMostrarModal(false)}
                  style={{
                    padding: '10px 24px',
                    backgroundColor: '#344848',
                    color: 'white',
                    border: 'none',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontSize: '14px',
                    fontWeight: '500'
                  }}
                >
                  Fechar
                </button>
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
        message={`ATENÇÃO: Todas as ${confirmDelete.cliente?.totalMensalidades || 0} mensalidade(s) associadas também serão excluídas!`}
        confirmText="OK"
        cancelText="Cancelar"
        type="danger"
      />

      {/* Modal de confirmação de pagamento */}
      <ConfirmModal
        isOpen={confirmPagamento.show}
        onClose={() => setConfirmPagamento({ show: false, mensalidade: null, novoPago: false })}
        onConfirm={confirmarAlteracaoPagamento}
        title={confirmPagamento.novoPago ? 'Confirmar Pagamento' : 'Desfazer Pagamento'}
        message={
          confirmPagamento.novoPago
            ? `Confirmar pagamento de R$ ${confirmPagamento.mensalidade ? parseFloat(confirmPagamento.mensalidade.valor).toFixed(2) : '0.00'}?`
            : 'Deseja desfazer o pagamento desta mensalidade?'
        }
        confirmText={confirmPagamento.novoPago ? 'Confirmar' : 'Desfazer'}
        cancelText="Cancelar"
        type={confirmPagamento.novoPago ? 'success' : 'warning'}
      />

      {/* Modal de confirmação de assinatura */}
      <ConfirmModal
        isOpen={confirmAssinatura.show}
        onClose={() => setConfirmAssinatura({ show: false, clienteId: null, novoStatus: false })}
        onConfirm={confirmarAlteracaoAssinatura}
        title={confirmAssinatura.novoStatus ? 'Ativar Assinatura' : 'Desativar Assinatura'}
        message={
          confirmAssinatura.novoStatus
            ? 'Deseja ativar a assinatura deste cliente?'
            : 'Deseja desativar a assinatura deste cliente?'
        }
        confirmText={confirmAssinatura.novoStatus ? 'Ativar' : 'Desativar'}
        cancelText="Cancelar"
        type={confirmAssinatura.novoStatus ? 'success' : 'warning'}
      />

      {/* Modal para selecionar plano ao ativar assinatura */}
      {mostrarModalSelecionarPlano.show && (
        <div
          onClick={() => {
            setMostrarModalSelecionarPlano({ show: false, clienteId: null })
            setPlanoParaAtivar('')
            setDataInicioAssinaturaModal('')
          }}
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
              width: '90%',
              maxWidth: '450px',
              boxShadow: '0 8px 32px rgba(0,0,0,0.2)'
            }}
          >
            {/* Header */}
            <div style={{
              padding: '20px 24px',
              borderBottom: '1px solid #e0e0e0',
              display: 'flex',
              alignItems: 'center',
              gap: '12px'
            }}>
              <div style={{
                width: '40px',
                height: '40px',
                borderRadius: '50%',
                backgroundColor: '#e8f5e9',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                <Icon icon="mdi:card-account-details" width="24" style={{ color: '#4CAF50' }} />
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: '18px', fontWeight: '600', color: '#333' }}>
                  Selecione um Plano
                </h3>
                <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#666' }}>
                  Para ativar a assinatura, selecione um plano
                </p>
              </div>
            </div>

            {/* Body */}
            <div style={{ padding: '24px' }}>
              {planos.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '20px' }}>
                  <Icon icon="mdi:package-variant-closed" width="48" style={{ color: '#ccc' }} />
                  <p style={{ color: '#666', margin: '12px 0 0' }}>Nenhum plano cadastrado</p>
                  <button
                    onClick={() => {
                      setMostrarModalSelecionarPlano({ show: false, clienteId: null })
                      setMostrarModalCriarPlano(true)
                    }}
                    style={{
                      marginTop: '16px',
                      padding: '10px 20px',
                      backgroundColor: '#2196F3',
                      color: 'white',
                      border: 'none',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      fontSize: '14px',
                      fontWeight: '500'
                    }}
                  >
                    Criar Plano
                  </button>
                </div>
              ) : (
                <>
                  <div style={{ marginBottom: '16px' }}>
                    <label style={{
                      display: 'block',
                      marginBottom: '8px',
                      fontSize: '14px',
                      fontWeight: '500',
                      color: '#333'
                    }}>
                      Plano
                    </label>
                    <select
                      value={planoParaAtivar}
                      onChange={(e) => setPlanoParaAtivar(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '12px',
                        border: '1px solid #ddd',
                        borderRadius: '6px',
                        fontSize: '14px',
                        cursor: 'pointer',
                        backgroundColor: 'white'
                      }}
                    >
                      <option value="">Selecione um plano</option>
                      {planos.map(plano => (
                        <option key={plano.id} value={plano.id}>
                          {plano.nome} - R$ {formatCurrency(parseFloat(plano.valor))}/mês
                        </option>
                      ))}
                    </select>
                  </div>

                  <div style={{ marginBottom: '16px' }}>
                    <label style={{
                      display: 'block',
                      marginBottom: '8px',
                      fontSize: '14px',
                      fontWeight: '500',
                      color: '#333'
                    }}>
                      Data de Início
                    </label>
                    <input
                      type="date"
                      value={dataInicioAssinaturaModal}
                      onChange={(e) => setDataInicioAssinaturaModal(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '12px',
                        border: '1px solid #ddd',
                        borderRadius: '6px',
                        fontSize: '14px',
                        backgroundColor: 'white'
                      }}
                    />
                    <p style={{ margin: '6px 0 0', fontSize: '12px', color: '#888' }}>
                      A primeira mensalidade será criada com vencimento 30 dias após esta data
                    </p>
                  </div>

                  <button
                    onClick={() => {
                      setMostrarModalSelecionarPlano({ show: false, clienteId: null })
                      setMostrarModalCriarPlano(true)
                    }}
                    style={{
                      marginTop: '12px',
                      padding: '10px 16px',
                      backgroundColor: 'transparent',
                      color: '#2196F3',
                      border: '2px dashed #2196F3',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      fontSize: '13px',
                      fontWeight: '500',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      width: '100%',
                      justifyContent: 'center'
                    }}
                  >
                    <Icon icon="material-symbols:add" width="18" />
                    Criar novo plano
                  </button>
                </>
              )}
            </div>

            {/* Footer */}
            <div style={{
              padding: '16px 24px',
              borderTop: '1px solid #e0e0e0',
              display: 'flex',
              justifyContent: 'flex-end',
              gap: '12px'
            }}>
              <button
                onClick={() => {
                  setMostrarModalSelecionarPlano({ show: false, clienteId: null })
                  setPlanoParaAtivar('')
                  setDataInicioAssinaturaModal('')
                }}
                style={{
                  padding: '10px 20px',
                  backgroundColor: 'transparent',
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
                onClick={confirmarAtivarAssinaturaComPlano}
                disabled={!planoParaAtivar || !dataInicioAssinaturaModal}
                style={{
                  padding: '10px 20px',
                  backgroundColor: (planoParaAtivar && dataInicioAssinaturaModal) ? '#4CAF50' : '#ccc',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: (planoParaAtivar && dataInicioAssinaturaModal) ? 'pointer' : 'not-allowed',
                  fontSize: '14px',
                  fontWeight: '500'
                }}
              >
                Ativar Assinatura
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de novo cliente */}
      {mostrarModalNovoCliente && (
        <div
          onClick={() => {
            setMostrarModalNovoCliente(false)
            setErroModalNovoCliente('')
          }}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: isSmallScreen ? 'white' : 'rgba(0, 0, 0, 0.5)',
            zIndex: 10000,
            display: 'flex',
            alignItems: isSmallScreen ? 'stretch' : 'center',
            justifyContent: 'center'
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              backgroundColor: 'white',
              borderRadius: isSmallScreen ? 0 : '12px',
              padding: isSmallScreen ? '20px' : '28px',
              maxWidth: isSmallScreen ? '100%' : '500px',
              width: isSmallScreen ? '100%' : '90%',
              maxHeight: isSmallScreen ? '100%' : '90vh',
              boxShadow: isSmallScreen ? 'none' : '0 8px 32px rgba(0,0,0,0.2)',
              overflowY: 'auto',
              display: 'flex',
              flexDirection: 'column'
            }}
          >
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '24px'
            }}>
              <h3 style={{
                margin: 0,
                fontSize: isSmallScreen ? '18px' : '20px',
                fontWeight: '600',
                color: '#1a1a1a'
              }}>
                Adicionar Novo Cliente
              </h3>
              <button
                onClick={() => setMostrarModalNovoCliente(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  padding: '4px',
                  display: 'flex',
                  alignItems: 'center'
                }}
              >
                <Icon icon="mdi:close" width="24" height="24" style={{ color: '#666' }} />
              </button>
            </div>

            {/* Mensagem de erro */}
            {erroModalNovoCliente && (
              <div style={{
                padding: '12px 14px',
                borderRadius: '6px',
                marginBottom: '16px',
                backgroundColor: '#fef2f2',
                border: '1px solid #fecaca',
                color: '#dc2626',
                fontSize: '14px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}>
                <Icon icon="mdi:alert-circle" width="18" height="18" />
                {erroModalNovoCliente}
              </div>
            )}

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
                  fontSize: '16px',
                  outline: 'none',
                  transition: 'border-color 0.2s',
                  boxSizing: 'border-box'
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
                onChange={(e) => setNovoClienteTelefone(formatarTelefone(e.target.value))}
                placeholder="(00) 00000-0000"
                maxLength="15"
                style={{
                  width: '100%',
                  padding: '12px',
                  border: '1px solid #e0e0e0',
                  borderRadius: '6px',
                  fontSize: '16px',
                  outline: 'none',
                  transition: 'border-color 0.2s',
                  boxSizing: 'border-box'
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
                  fontSize: '16px',
                  outline: 'none',
                  transition: 'border-color 0.2s',
                  boxSizing: 'border-box'
                }}
                onFocus={(e) => e.target.style.borderColor = '#333'}
                onBlur={(e) => e.target.style.borderColor = '#e0e0e0'}
              />
            </div>

            {/* Data de Nascimento */}
            <div style={{ marginBottom: '20px' }}>
              <label style={{
                display: 'block',
                marginBottom: '8px',
                fontSize: '14px',
                fontWeight: '500',
                color: '#333'
              }}>
                Data de Nascimento (opcional)
              </label>
              <input
                type="date"
                value={novoClienteDataNascimento}
                onChange={(e) => setNovoClienteDataNascimento(e.target.value)}
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
                    onClick={(e) => {
                      e.target.showPicker?.()
                    }}
                    style={{
                      width: '100%',
                      padding: '12px',
                      border: '1px solid #ddd',
                      borderRadius: '6px',
                      fontSize: '16px',
                      outline: 'none',
                      transition: 'border-color 0.2s',
                      cursor: 'pointer',
                      boxSizing: 'border-box'
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
                      fontSize: '16px',
                      outline: 'none',
                      transition: 'border-color 0.2s',
                      cursor: 'pointer',
                      backgroundColor: 'white',
                      boxSizing: 'border-box'
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
                  <button
                    type="button"
                    onClick={() => setMostrarModalCriarPlano(true)}
                    style={{
                      marginTop: '12px',
                      padding: '10px 16px',
                      backgroundColor: 'transparent',
                      color: '#2196F3',
                      border: '2px dashed #2196F3',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      fontSize: '13px',
                      fontWeight: '600',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      width: '100%',
                      justifyContent: 'center',
                      transition: 'all 0.2s'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = '#e3f2fd'
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = 'transparent'
                    }}
                  >
                    <Icon icon="material-symbols:add" width="18" />
                    Criar Novo Plano
                  </button>
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
                  setNovoClienteDataNascimento('')
                  setCriarAssinatura(false)
                  setDataInicioAssinatura('')
                  setPlanoSelecionado('')
                  setErroModalNovoCliente('')
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

      {/* Modal de Detalhes da Mensalidade */}
      {mostrarModalMensalidade && mensalidadeSelecionada && clienteMensalidade && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: isSmallScreen ? 'white' : 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: isSmallScreen ? 'stretch' : 'center',
            justifyContent: 'center',
            zIndex: 2000,
            padding: isSmallScreen ? 0 : '20px'
          }}
          onClick={() => {
            setMostrarModalMensalidade(false)
            setMensalidadeSelecionada(null)
            setClienteMensalidade(null)
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              backgroundColor: 'white',
              borderRadius: isSmallScreen ? 0 : '12px',
              padding: isSmallScreen ? '20px' : '24px',
              maxWidth: isSmallScreen ? '100%' : '400px',
              width: '100%',
              height: isSmallScreen ? '100%' : 'auto',
              boxShadow: isSmallScreen ? 'none' : '0 8px 32px rgba(0,0,0,0.2)',
              display: 'flex',
              flexDirection: 'column'
            }}
          >
            {/* Header */}
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '20px',
              paddingBottom: '16px',
              borderBottom: '1px solid #e8e8e8'
            }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '18px', fontWeight: '600', color: '#344848' }}>
                  Detalhes da Mensalidade
                </h3>
                <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: '#666' }}>
                  {clienteMensalidade.nome}
                </p>
              </div>
              <button
                onClick={() => {
                  setMostrarModalMensalidade(false)
                  setMensalidadeSelecionada(null)
                  setClienteMensalidade(null)
                }}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  padding: '4px',
                  borderRadius: '4px'
                }}
              >
                <Icon icon="mdi:close" width="20" height="20" style={{ color: '#666' }} />
              </button>
            </div>

            {/* Status Badge */}
            <div style={{ marginBottom: '20px', textAlign: 'center' }}>
              <span style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '8px 16px',
                borderRadius: '20px',
                fontSize: '13px',
                fontWeight: '600',
                backgroundColor: mensalidadeSelecionada.statusCalculado === 'pago'
                  ? '#e8f5e9'
                  : mensalidadeSelecionada.statusCalculado === 'atrasado'
                    ? '#ffebee'
                    : '#fff3e0',
                color: mensalidadeSelecionada.statusCalculado === 'pago'
                  ? '#2e7d32'
                  : mensalidadeSelecionada.statusCalculado === 'atrasado'
                    ? '#c62828'
                    : '#e65100'
              }}>
                <Icon
                  icon={
                    mensalidadeSelecionada.statusCalculado === 'pago'
                      ? 'mdi:check-circle'
                      : mensalidadeSelecionada.statusCalculado === 'atrasado'
                        ? 'mdi:alert-circle'
                        : 'mdi:clock-outline'
                  }
                  width="18"
                />
                {mensalidadeSelecionada.statusCalculado === 'pago'
                  ? 'Pago'
                  : mensalidadeSelecionada.statusCalculado === 'atrasado'
                    ? 'Atrasado'
                    : 'Em Aberto'}
              </span>
            </div>

            {/* Informações */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '24px' }}>
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '12px',
                backgroundColor: '#f9f9f9',
                borderRadius: '8px'
              }}>
                <span style={{ fontSize: '13px', color: '#666' }}>Valor</span>
                <span style={{ fontSize: '16px', fontWeight: '600', color: '#333' }}>
                  R$ {parseFloat(mensalidadeSelecionada.valor).toFixed(2)}
                </span>
              </div>

              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '12px',
                backgroundColor: '#f9f9f9',
                borderRadius: '8px'
              }}>
                <span style={{ fontSize: '13px', color: '#666' }}>Vencimento</span>
                <span style={{ fontSize: '14px', fontWeight: '500', color: '#333' }}>
                  {new Date(mensalidadeSelecionada.data_vencimento + 'T00:00:00').toLocaleDateString('pt-BR')}
                </span>
              </div>

              {mensalidadeSelecionada.data_inicio && (
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '12px',
                  backgroundColor: '#f9f9f9',
                  borderRadius: '8px'
                }}>
                  <span style={{ fontSize: '13px', color: '#666' }}>Início da Assinatura</span>
                  <span style={{ fontSize: '14px', fontWeight: '500', color: '#333' }}>
                    {new Date(mensalidadeSelecionada.data_inicio + 'T00:00:00').toLocaleDateString('pt-BR')}
                  </span>
                </div>
              )}

              {mensalidadeSelecionada.statusCalculado === 'atrasado' && (
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '12px',
                  backgroundColor: '#ffebee',
                  borderRadius: '8px'
                }}>
                  <span style={{ fontSize: '13px', color: '#c62828' }}>Dias em Atraso</span>
                  <span style={{ fontSize: '14px', fontWeight: '600', color: '#c62828' }}>
                    {Math.floor((new Date() - new Date(mensalidadeSelecionada.data_vencimento + 'T00:00:00')) / (1000 * 60 * 60 * 24))} dias
                  </span>
                </div>
              )}
            </div>

            {/* Botão de Ação */}
            <button
              onClick={handleMarcarMensalidadePaga}
              style={{
                width: '100%',
                padding: '14px',
                borderRadius: '8px',
                border: 'none',
                backgroundColor: mensalidadeSelecionada.status === 'pago' ? '#ff9800' : '#4CAF50',
                color: 'white',
                fontSize: '14px',
                fontWeight: '600',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                transition: 'background-color 0.2s'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = mensalidadeSelecionada.status === 'pago' ? '#f57c00' : '#43a047'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = mensalidadeSelecionada.status === 'pago' ? '#ff9800' : '#4CAF50'
              }}
            >
              <Icon
                icon={mensalidadeSelecionada.status === 'pago' ? 'mdi:undo' : 'mdi:check-circle'}
                width="20"
              />
              {mensalidadeSelecionada.status === 'pago' ? 'Desfazer Pagamento' : 'Marcar como Pago'}
            </button>
          </div>
        </div>
      )}

      {/* Mini-modal para criar plano rápido */}
      {mostrarModalCriarPlano && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: isSmallScreen ? 'white' : 'rgba(0, 0, 0, 0.6)',
            display: 'flex',
            alignItems: isSmallScreen ? 'stretch' : 'center',
            justifyContent: 'center',
            zIndex: 15000,
            padding: isSmallScreen ? 0 : '20px'
          }}
          onClick={() => {
            setMostrarModalCriarPlano(false)
            setNovoPlanoNome('')
            setNovoPlanoValor('')
            setNovoPlanoCiclo('mensal')
            setNovoPlanoDescricao('')
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              backgroundColor: 'white',
              borderRadius: isSmallScreen ? 0 : '12px',
              padding: isSmallScreen ? '20px' : '24px',
              maxWidth: isSmallScreen ? '100%' : '400px',
              width: '100%',
              height: isSmallScreen ? '100%' : 'auto',
              boxShadow: isSmallScreen ? 'none' : '0 8px 32px rgba(0,0,0,0.2)',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'auto'
            }}
          >
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '20px'
            }}>
              <h3 style={{
                margin: 0,
                fontSize: '18px',
                fontWeight: '600',
                color: '#1a1a1a',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}>
                <Icon icon="material-symbols:add-circle-outline" width="24" style={{ color: '#2196F3' }} />
                Criar Novo Plano
              </h3>
              {isMobile && (
                <button
                  onClick={() => {
                    setMostrarModalCriarPlano(false)
                    setNovoPlanoNome('')
                    setNovoPlanoValor('')
                    setNovoPlanoCiclo('mensal')
                    setNovoPlanoDescricao('')
                  }}
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    padding: '4px',
                    display: 'flex',
                    alignItems: 'center'
                  }}
                >
                  <Icon icon="mdi:close" width="24" height="24" style={{ color: '#666' }} />
                </button>
              )}
            </div>

            {/* Nome do plano */}
            <div style={{ marginBottom: '16px' }}>
              <label style={{
                display: 'block',
                marginBottom: '8px',
                fontSize: '14px',
                fontWeight: '500',
                color: '#333'
              }}>
                Nome do Plano *
              </label>
              <input
                type="text"
                value={novoPlanoNome}
                onChange={(e) => setNovoPlanoNome(e.target.value)}
                placeholder="Ex: Plano Mensal"
                autoFocus
                style={{
                  width: '100%',
                  padding: '12px',
                  border: '1px solid #e0e0e0',
                  borderRadius: '6px',
                  fontSize: '14px',
                  outline: 'none',
                  transition: 'border-color 0.2s'
                }}
                onFocus={(e) => e.target.style.borderColor = '#2196F3'}
                onBlur={(e) => e.target.style.borderColor = '#e0e0e0'}
              />
            </div>

            {/* Valor do plano */}
            <div style={{ marginBottom: '16px' }}>
              <label style={{
                display: 'block',
                marginBottom: '8px',
                fontSize: '14px',
                fontWeight: '500',
                color: '#333'
              }}>
                Valor (R$) *
              </label>
              <input
                type="number"
                value={novoPlanoValor}
                onChange={(e) => setNovoPlanoValor(e.target.value)}
                placeholder="0.00"
                step="0.01"
                min="0"
                style={{
                  width: '100%',
                  padding: '12px',
                  border: '1px solid #e0e0e0',
                  borderRadius: '6px',
                  fontSize: '14px',
                  outline: 'none',
                  transition: 'border-color 0.2s'
                }}
                onFocus={(e) => e.target.style.borderColor = '#2196F3'}
                onBlur={(e) => e.target.style.borderColor = '#e0e0e0'}
              />
            </div>

            {/* Ciclo de cobrança */}
            <div style={{ marginBottom: '16px' }}>
              <label style={{
                display: 'block',
                marginBottom: '8px',
                fontSize: '14px',
                fontWeight: '500',
                color: '#333'
              }}>
                Ciclo de Cobrança *
              </label>
              <select
                value={novoPlanoCiclo}
                onChange={(e) => setNovoPlanoCiclo(e.target.value)}
                style={{
                  width: '100%',
                  padding: '12px',
                  border: '1px solid #e0e0e0',
                  borderRadius: '6px',
                  fontSize: '14px',
                  outline: 'none',
                  transition: 'border-color 0.2s',
                  backgroundColor: 'white',
                  cursor: 'pointer'
                }}
                onFocus={(e) => e.target.style.borderColor = '#2196F3'}
                onBlur={(e) => e.target.style.borderColor = '#e0e0e0'}
              >
                <option value="mensal">Mensal</option>
                <option value="trimestral">Trimestral</option>
                <option value="anual">Anual</option>
              </select>
            </div>

            {/* Descrição/Observação */}
            <div style={{ marginBottom: '24px' }}>
              <label style={{
                display: 'block',
                marginBottom: '8px',
                fontSize: '14px',
                fontWeight: '500',
                color: '#333'
              }}>
                Observação
              </label>
              <textarea
                value={novoPlanoDescricao}
                onChange={(e) => setNovoPlanoDescricao(e.target.value)}
                placeholder="Descrição ou observação sobre o plano (opcional)"
                rows="3"
                style={{
                  width: '100%',
                  padding: '12px',
                  border: '1px solid #e0e0e0',
                  borderRadius: '6px',
                  fontSize: '14px',
                  outline: 'none',
                  transition: 'border-color 0.2s',
                  resize: 'vertical',
                  fontFamily: 'inherit'
                }}
                onFocus={(e) => e.target.style.borderColor = '#2196F3'}
                onBlur={(e) => e.target.style.borderColor = '#e0e0e0'}
              />
            </div>

            {/* Botões */}
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button
                onClick={() => {
                  setMostrarModalCriarPlano(false)
                  setNovoPlanoNome('')
                  setNovoPlanoValor('')
                  setNovoPlanoCiclo('mensal')
                  setNovoPlanoDescricao('')
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
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'white'
                }}
              >
                Cancelar
              </button>
              <button
                onClick={handleCriarPlanoRapido}
                style={{
                  padding: '10px 24px',
                  borderRadius: '6px',
                  border: 'none',
                  backgroundColor: '#2196F3',
                  color: 'white',
                  fontSize: '14px',
                  fontWeight: '500',
                  cursor: 'pointer',
                  transition: 'background-color 0.2s'
                }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#1976D2'}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#2196F3'}
              >
                Criar Plano
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
