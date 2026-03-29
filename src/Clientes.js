import { useState, useEffect, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { supabase } from './supabaseClient'
import { Icon } from '@iconify/react'
import { showToast } from './Toast'
import ConfirmModal from './ConfirmModal'
import whatsappService from './services/whatsappService'
import { exportarClientes } from './utils/exportUtils'
import CsvImportModal from './components/CsvImportModal'
import { validarTelefone, validarCPF } from './utils/validators'
import { SkeletonList, SkeletonTable } from './components/Skeleton'
import useWindowSize from './hooks/useWindowSize'
import { useUserPlan } from './hooks/useUserPlan'
import { useUser } from './contexts/UserContext'
import DateInput from './components/DateInput'

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
  const [diaVencimentoEdit, setDiaVencimentoEdit] = useState('')
  const [emailEdit, setEmailEdit] = useState('')
  const [responsavelNomeEdit, setResponsavelNomeEdit] = useState('')
  const [responsavelTelefoneEdit, setResponsavelTelefoneEdit] = useState('')
  const [busca, setBusca] = useState('')

  // Filtros
  const [mostrarFiltros, setMostrarFiltros] = useState(false)
  const [filtroStatus, setFiltroStatus] = useState(searchParams.get('status') || 'todos')
  const [filtroPlano, setFiltroPlano] = useState(searchParams.get('plano') || 'todos')
  const [filtroAssinatura, setFiltroAssinatura] = useState(searchParams.get('assinatura') || 'todos')
  const [filtroInadimplente, setFiltroInadimplente] = useState(searchParams.get('inadimplente') === 'true')
  const [filtroVencimentoDe, setFiltroVencimentoDe] = useState('')
  const [filtroVencimentoAte, setFiltroVencimentoAte] = useState('')
  const [filtroAniversariante, setFiltroAniversariante] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState({ show: false, cliente: null })
  const [excluirMensalidades, setExcluirMensalidades] = useState(false)
  const [mostrarModalNovoCliente, setMostrarModalNovoCliente] = useState(searchParams.get('novo') === 'true')
  const [novoClienteNome, setNovoClienteNome] = useState('')
  const [novoClienteTelefone, setNovoClienteTelefone] = useState('')
  const [novoClienteCpf, setNovoClienteCpf] = useState('')
  const [novoClienteDataNascimento, setNovoClienteDataNascimento] = useState('')
  const [novoClienteEmail, setNovoClienteEmail] = useState('')
  const [novoClienteResponsavelNome, setNovoClienteResponsavelNome] = useState('')
  const [novoClienteResponsavelTelefone, setNovoClienteResponsavelTelefone] = useState('')
  const [temResponsavel, setTemResponsavel] = useState(false)
  const [stepCadastro, setStepCadastro] = useState(1)
  const [criarAssinatura, setCriarAssinatura] = useState(false)
  const [dataInicioAssinatura, setDataInicioAssinatura] = useState('')
  const [dataVencimentoAssinatura, setDataVencimentoAssinatura] = useState('')
  const [planoSelecionado, setPlanoSelecionado] = useState('')
  const [planos, setPlanos] = useState([])
  const [mostrarModalCriarPlano, setMostrarModalCriarPlano] = useState(false)
  const [mostrarImportModal, setMostrarImportModal] = useState(false)
  const [novoPlanoNome, setNovoPlanoNome] = useState('')
  const [novoPlanoValor, setNovoPlanoValor] = useState('')
  const [novoPlanoCiclo, setNovoPlanoCiclo] = useState('mensal')
  const [novoPlanoDescricao, setNovoPlanoDescricao] = useState('')
  const [novoPlanoTipo, setNovoPlanoTipo] = useState('recorrente')
  const [novoPlanoNumeroAulas, setNovoPlanoNumeroAulas] = useState('')
  const [enviarBoasVindas, setEnviarBoasVindas] = useState(true)
  const [mostrarEdicaoBoasVindas, setMostrarEdicaoBoasVindas] = useState(false)
  const [mensagemBoasVindasCustom, setMensagemBoasVindasCustom] = useState('')

  // Estados para modais de confirmação
  const [confirmPagamento, setConfirmPagamento] = useState({ show: false, mensalidade: null, novoPago: false })
  const [confirmAssinatura, setConfirmAssinatura] = useState({ show: false, clienteId: null, novoStatus: false })
  const [mostrarModalSelecionarPlano, setMostrarModalSelecionarPlano] = useState({ show: false, clienteId: null })
  const [planoParaAtivar, setPlanoParaAtivar] = useState('')
  const [dataInicioAssinaturaModal, setDataInicioAssinaturaModal] = useState('')
  const [dataVencimentoAssinaturaModal, setDataVencimentoAssinaturaModal] = useState('')
  const [erroModalNovoCliente, setErroModalNovoCliente] = useState('')
  const [salvandoCliente, setSalvandoCliente] = useState(false)

  // Modal de Mensalidade
  const [mostrarModalMensalidade, setMostrarModalMensalidade] = useState(false)
  const [mensalidadeSelecionada, setMensalidadeSelecionada] = useState(null)
  const [clienteMensalidade, setClienteMensalidade] = useState(null)

  // Frequência do aluno
  const [presencasAluno, setPresencasAluno] = useState([])
  const [mostrarFrequencia, setMostrarFrequencia] = useState(false)

  // Recarregar créditos (pacote)
  const [mostrarRecarregar, setMostrarRecarregar] = useState(false)
  const [planoRecarregar, setPlanoRecarregar] = useState('')

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

    // Filtro por data de vencimento
    if (filtroVencimentoDe) {
      filtrados = filtrados.filter(cliente =>
        cliente.proxima_mensalidade && cliente.proxima_mensalidade >= filtroVencimentoDe
      )
    }
    if (filtroVencimentoAte) {
      filtrados = filtrados.filter(cliente =>
        cliente.proxima_mensalidade && cliente.proxima_mensalidade <= filtroVencimentoAte
      )
    }

    // Filtro de aniversariantes do mês
    if (filtroAniversariante) {
      const mesAtual = new Date().getMonth() + 1
      filtrados = filtrados.filter(cliente => {
        if (!cliente.data_nascimento) return false
        const mesNasc = new Date(cliente.data_nascimento + 'T00:00:00').getMonth() + 1
        return mesNasc === mesAtual
      })
    }

    setClientesFiltrados(filtrados)
    setPaginaAtual(1) // Resetar para primeira página quando filtros mudam
  }, [busca, clientes, filtroStatus, filtroPlano, filtroAssinatura, filtroInadimplente, filtroVencimentoDe, filtroVencimentoAte, filtroAniversariante])

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
            email,
            responsavel_nome,
            responsavel_telefone,
            bloquear_mensagens,
            data_nascimento,
            portal_token,
            aulas_restantes,
            aulas_total,
            foto_url,
            planos:plano_id (nome, tipo, numero_aulas, valor, ciclo_cobranca)
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
      alert('Erro ao carregar alunos: ' + error.message)
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
        .or('lixo.is.null,lixo.eq.false')
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
        showToast('Erro ao abrir ficha do aluno', 'error')
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
      let tempoDeCasaDias = null
      if (mensalidades.length > 0) {
        const primeiraData = new Date(mensalidades[0].data_vencimento)
        const diffTime = Math.abs(hoje - primeiraData)
        const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24))
        const diffMonths = Math.floor(diffTime / (1000 * 60 * 60 * 24 * 30))
        tempoDeCasaDias = diffDays
        tempoDeCasa = diffMonths
      } else if (cliente.created_at) {
        const dataCreated = new Date(cliente.created_at)
        const diffTime = Math.abs(hoje - dataCreated)
        const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24))
        const diffMonths = Math.floor(diffTime / (1000 * 60 * 60 * 24 * 30))
        tempoDeCasaDias = diffDays
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
        tempoDeCasa,
        tempoDeCasaDias
      }

      // Carregar presenças do aluno
      const { data: presencasData, error: presencasError } = await supabase
        .from('presencas')
        .select('*, grade_horarios(horario, descricao, dia_semana)')
        .eq('devedor_id', cliente.id)
        .order('data', { ascending: false })
        .limit(50)

      if (presencasError) {
        const { data: presencasFallback } = await supabase
          .from('presencas')
          .select('*')
          .eq('devedor_id', cliente.id)
          .order('data', { ascending: false })
          .limit(50)
        setPresencasAluno(presencasFallback || [])
      } else {
        setPresencasAluno(presencasData || [])
      }
      setMostrarFrequencia(false)

      setClienteSelecionado(clienteComEstatisticas)
      setNomeEdit(cliente.nome || '')
      setTelefoneEdit(cliente.telefone || '')
      setCpfEdit(cliente.cpf || '')
      setDataNascimentoEdit(cliente.data_nascimento || '')
      setEmailEdit(cliente.email || '')
      setResponsavelNomeEdit(cliente.responsavel_nome || '')
      setResponsavelTelefoneEdit(cliente.responsavel_telefone || '')
      const pendente = mensalidades.find(m => m.status === 'pendente')
      const refMens = pendente || mensalidades[mensalidades.length - 1]
      setDiaVencimentoEdit(refMens ? String(new Date(refMens.data_vencimento + 'T00:00:00').getDate()) : '')
      setEditando(false)
      setMostrarModal(true)
      await carregarMensalidadesCliente(cliente.id)
    } catch (error) {
      console.error('Erro ao abrir ficha do cliente:', error)
      showToast('Erro ao carregar dados do aluno', 'error')
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

    // Validar dia de vencimento se preenchido
    const diaNum = parseInt(diaVencimentoEdit, 10)
    if (diaVencimentoEdit !== '' && (isNaN(diaNum) || diaNum < 1 || diaNum > 31)) {
      showToast('Dia de vencimento inválido (1-31)', 'warning')
      return
    }

    if (!userId) return

    try {
      // Verificar se já existe outro cliente com o mesmo telefone
      // Permite duplicata quando o aluno tem responsável (telefone é do responsável)
      const temResponsavel = responsavelNomeEdit.trim() || responsavelTelefoneEdit.trim()
      if (!temResponsavel) {
        const telefoneFormatado = telefoneEdit.trim().replace(/\D/g, '')
        const duplicado = clientes.find(c =>
          c.id !== clienteSelecionado.id &&
          c.telefone?.replace(/\D/g, '') === telefoneFormatado
        )

        if (duplicado) {
          showToast(`Já existe um aluno com este telefone (${duplicado.nome})`, 'warning')
          return
        }
      }

      const { error } = await supabase
        .from('devedores')
        .update({
          nome: nomeEdit.trim(),
          telefone: telefoneEdit.trim(),
          cpf: cpfEdit.trim() || null,
          data_nascimento: dataNascimentoEdit || null,
          email: emailEdit.trim() || null,
          responsavel_nome: responsavelNomeEdit.trim() || null,
          responsavel_telefone: responsavelTelefoneEdit.trim() || null
        })
        .eq('id', clienteSelecionado.id)

      if (error) throw error

      // Atualizar dia de vencimento das mensalidades pendentes
      if (diaVencimentoEdit !== '' && !isNaN(diaNum)) {
        const { data: pendentes } = await supabase
          .from('mensalidades')
          .select('id, data_vencimento')
          .eq('devedor_id', clienteSelecionado.id)
          .eq('status', 'pendente')

        if (pendentes && pendentes.length > 0) {
          for (const m of pendentes) {
            const d = new Date(m.data_vencimento + 'T00:00:00')
            const ano = d.getFullYear()
            const mes = d.getMonth()
            const ultimoDiaMes = new Date(ano, mes + 1, 0).getDate()
            const diaFinal = Math.min(diaNum, ultimoDiaMes)
            const novaData = `${ano}-${String(mes + 1).padStart(2, '0')}-${String(diaFinal).padStart(2, '0')}`

            const { error: updateError } = await supabase
              .from('mensalidades')
              .update({ data_vencimento: novaData })
              .eq('id', m.id)

            if (updateError) throw updateError
          }
        }
      }

      showToast('Aluno atualizado com sucesso!', 'success')

      // Se telefone mudou ou não tem foto, tentar puxar do WhatsApp (fire-and-forget)
      const telefoneMudou = telefoneEdit.trim() !== clienteSelecionado.telefone
      if ((telefoneMudou || !clienteSelecionado.foto_url) && telefoneEdit.trim()) {
        whatsappService.buscarFotoPerfil(telefoneEdit.trim()).then(async (fotoUrl) => {
          if (fotoUrl) {
            await supabase.from('devedores').update({ foto_url: fotoUrl }).eq('id', clienteSelecionado.id)
            carregarClientes()
          }
        }).catch(() => {})
      }

      setEditando(false)
      setMostrarModal(false)
      carregarClientes()
    } catch (error) {
      showToast('Erro ao atualizar aluno: ' + error.message, 'error')
    }
  }

  // Criar próxima mensalidade automaticamente ao marcar como pago
  const criarProximaMensalidade = async (mensalidadeAtual) => {
    try {
      const devedor = mensalidadeAtual.devedores
      if (!devedor || !devedor.assinatura_ativa) return

      // Não criar próxima mensalidade para planos tipo pacote
      if (devedor.plano?.tipo === 'pacote') return

      const isRecorrente = mensalidadeAtual.is_mensalidade === true ||
                           (mensalidadeAtual.is_mensalidade == null && devedor.assinatura_ativa)
      if (!isRecorrente) return

      const dataVencimentoAtual = new Date(mensalidadeAtual.data_vencimento + 'T00:00:00')
      const proximoVencimento = new Date(dataVencimentoAtual)

      let mesesParaAdicionar = 1
      if (devedor.plano?.ciclo_cobranca === 'trimestral') mesesParaAdicionar = 3
      else if (devedor.plano?.ciclo_cobranca === 'anual') mesesParaAdicionar = 12

      proximoVencimento.setMonth(proximoVencimento.getMonth() + mesesParaAdicionar)
      if (proximoVencimento.getDate() !== dataVencimentoAtual.getDate()) {
        proximoVencimento.setDate(0)
      }

      const proximoVencimentoStr = proximoVencimento.toISOString().split('T')[0]

      // Verificar se já existe
      const { data: jaExiste } = await supabase
        .from('mensalidades')
        .select('id')
        .eq('devedor_id', mensalidadeAtual.devedor_id)
        .eq('data_vencimento', proximoVencimentoStr)
        .maybeSingle()

      if (jaExiste) return

      const { error: errorInsert } = await supabase
        .from('mensalidades')
        .insert({
          user_id: mensalidadeAtual.user_id,
          devedor_id: mensalidadeAtual.devedor_id,
          valor: devedor.plano?.valor || mensalidadeAtual.valor,
          data_vencimento: proximoVencimentoStr,
          status: 'pendente',
          is_mensalidade: true,
          numero_mensalidade: (mensalidadeAtual.numero_mensalidade || 0) + 1,
          enviado_hoje: false,
          total_mensagens_enviadas: 0
        })

      if (errorInsert) {
        console.error('Erro ao criar próxima mensalidade:', errorInsert)
        return
      }

      const dataFormatada = new Date(proximoVencimentoStr).toLocaleDateString('pt-BR')
      showToast(`Próxima mensalidade criada para ${dataFormatada}`, 'success')
    } catch (error) {
      console.error('Erro na criação automática:', error)
    }
  }

  const handleAlterarStatusMensalidade = (mensalidade, novoPago) => {
    setConfirmPagamento({ show: true, mensalidade, novoPago })
  }

  const confirmarAlteracaoPagamento = async () => {
    const { mensalidade, novoPago } = confirmPagamento
    if (!mensalidade) return

    try {
      const updateData = {
        status: novoPago ? 'pago' : 'pendente',
        forma_pagamento: novoPago ? (confirmPagamento.formaPagamento || 'pix') : null,
        data_pagamento: novoPago ? new Date().toISOString().split('T')[0] : null
      }

      const { data: mensalidadeAtualizada, error } = await supabase
        .from('mensalidades')
        .update(updateData)
        .eq('id', mensalidade.id)
        .select('*, devedores(nome, telefone, assinatura_ativa, plano:planos(valor, ciclo_cobranca, tipo))')
        .single()

      if (error) throw error

      showToast(novoPago ? 'Pagamento confirmado!' : 'Pagamento desfeito!', 'success')

      // Enviar confirmação via WhatsApp ao cliente (fire-and-forget)
      if (novoPago) {
        whatsappService.enviarConfirmacaoPagamento(mensalidade.id)
          .then(r => { if (r.sucesso) showToast('Confirmação enviada via WhatsApp', 'success') })
          .catch(() => {})

        // Criar próxima mensalidade automaticamente (não para pacotes)
        if (mensalidadeAtualizada) {
          await criarProximaMensalidade(mensalidadeAtualizada)
        }
      }

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
      // Se opção de excluir mensalidades marcada → soft delete das mensalidades
      if (excluirMensalidades) {
        await supabase
          .from('mensalidades')
          .update({ lixo: true, deletado_em: new Date().toISOString() })
          .eq('devedor_id', cliente.id)
      }

      // Soft delete: marcar cliente como lixo = true
      const { error: clienteError } = await supabase
        .from('devedores')
        .update({
          lixo: true,
          deletado_em: new Date().toISOString()
        })
        .eq('id', cliente.id)

      if (clienteError) throw clienteError

      const mensagem = excluirMensalidades
        ? 'Aluno e mensalidades excluídos com sucesso!'
        : 'Aluno excluído com sucesso!'
      showToast(mensagem, 'success')

      // Fechar o modal de detalhes do cliente
      setMostrarModal(false)
      setClienteSelecionado(null)

      // Fechar o modal de confirmação e resetar checkbox
      setConfirmDelete({ show: false, cliente: null })
      setExcluirMensalidades(false)

      // Recarregar lista de clientes
      carregarClientes()
    } catch (error) {
      showToast('Erro ao excluir aluno: ' + error.message, 'error')
    }
  }

  const handleAlterarAssinatura = (clienteId, novoStatus) => {
    // Se está tentando ativar a assinatura, sempre abrir modal com datas
    if (novoStatus) {
      const cliente = clientes.find(c => c.id === clienteId) || clienteSelecionado
      const hoje = new Date()
      setDataInicioAssinaturaModal(hoje.toISOString().split('T')[0])
      const vencimento = new Date(hoje)
      vencimento.setDate(vencimento.getDate() + 30)
      setDataVencimentoAssinaturaModal(vencimento.toISOString().split('T')[0])
      // Pré-selecionar plano se já tiver
      setPlanoParaAtivar(cliente?.plano_id || '')
      setMostrarModalSelecionarPlano({ show: true, clienteId })
      return
    }
    // Se está desativando, mostrar confirmação normal
    setConfirmAssinatura({ show: true, clienteId, novoStatus })
  }

  const confirmarAtivarAssinaturaComPlano = async () => {
    const { clienteId } = mostrarModalSelecionarPlano
    if (!clienteId || !planoParaAtivar || !dataInicioAssinaturaModal || !dataVencimentoAssinaturaModal) {
      showToast('Selecione um plano, data de início e data de vencimento', 'warning')
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
      const updateData = {
        assinatura_ativa: true,
        plano_id: planoParaAtivar
      }

      // Se for plano tipo pacote, setar créditos de aulas
      if (plano.tipo === 'pacote' && plano.numero_aulas) {
        updateData.aulas_restantes = plano.numero_aulas
        updateData.aulas_total = plano.numero_aulas
      } else {
        updateData.aulas_restantes = null
        updateData.aulas_total = null
      }

      const { error } = await supabase
        .from('devedores')
        .update(updateData)
        .eq('id', clienteId)

      if (error) throw error

      // Verificar se já existe mensalidade pendente para não duplicar
      if (plano.tipo !== 'pacote') {
        const { data: existentes } = await supabase
          .from('mensalidades')
          .select('id')
          .eq('devedor_id', clienteId)
          .eq('status', 'pendente')
          .eq('is_mensalidade', true)
          .or('lixo.is.null,lixo.eq.false')
          .limit(1)

        if (!existentes || existentes.length === 0) {
          const { error: mensalidadeError } = await supabase
            .from('mensalidades')
            .insert({
              user_id: userId,
              devedor_id: clienteId,
              valor: parseFloat(plano.valor),
              data_vencimento: dataVencimentoAssinaturaModal,
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
        } else {
          showToast('Assinatura ativada! Ja existe mensalidade pendente.', 'success')
        }
      } else {
        showToast('Assinatura ativada com plano pacote!', 'success')
      }

      // Atualizar cliente selecionado se existir
      if (clienteSelecionado?.id === clienteId) {
        setClienteSelecionado(prev => ({
          ...prev,
          assinatura_ativa: true,
          plano_id: planoParaAtivar,
          plano_nome: plano?.nome,
          aulas_restantes: plano.tipo === 'pacote' ? plano.numero_aulas : prev.aulas_restantes,
          aulas_total: plano.tipo === 'pacote' ? plano.numero_aulas : prev.aulas_total
        }))
      }

      // Recarregar lista de clientes e mensalidades
      await carregarClientes()
      if (clienteSelecionado?.id === clienteId) {
        await carregarMensalidadesCliente(clienteId)
      }
    } catch (error) {
      console.error('Erro ao ativar assinatura:', error)
      showToast('Erro ao ativar assinatura: ' + error.message, 'error')
    } finally {
      setMostrarModalSelecionarPlano({ show: false, clienteId: null })
      setPlanoParaAtivar('')
      setDataInicioAssinaturaModal('')
      setDataVencimentoAssinaturaModal('')
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
      const updateData = {
        status: novoPago ? 'pago' : 'pendente',
        forma_pagamento: novoPago ? 'pix' : null,
        data_pagamento: novoPago ? new Date().toISOString().split('T')[0] : null
      }

      const { data: mensalidadeAtualizada, error } = await supabase
        .from('mensalidades')
        .update(updateData)
        .eq('id', mensalidadeSelecionada.id)
        .select('*, devedores(nome, telefone, assinatura_ativa, plano:planos(valor, ciclo_cobranca, tipo))')
        .single()

      if (error) throw error

      // Criar próxima mensalidade automaticamente (não para pacotes)
      if (novoPago && mensalidadeAtualizada) {
        await criarProximaMensalidade(mensalidadeAtualizada)
      }

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

    if (novoPlanoTipo === 'pacote' && (!novoPlanoNumeroAulas || parseInt(novoPlanoNumeroAulas) <= 0)) {
      showToast('Preencha o número de aulas do pacote', 'warning')
      return
    }

    if (!userId) return

    try {
      const { data, error } = await supabase.from('planos').insert({
        user_id: userId,
        nome: novoPlanoNome.trim(),
        valor: parseFloat(novoPlanoValor),
        ciclo_cobranca: novoPlanoTipo === 'pacote' ? 'mensal' : novoPlanoCiclo,
        descricao: novoPlanoDescricao.trim() || null,
        tipo: novoPlanoTipo,
        numero_aulas: novoPlanoTipo === 'pacote' ? parseInt(novoPlanoNumeroAulas) : null,
        ativo: true
      }).select()

      if (error) throw error

      showToast('Plano criado com sucesso!', 'success')
      setMostrarModalCriarPlano(false)
      setNovoPlanoNome('')
      setNovoPlanoValor('')
      setNovoPlanoCiclo('mensal')
      setNovoPlanoDescricao('')
      setNovoPlanoTipo('recorrente')
      setNovoPlanoNumeroAulas('')

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
    if (salvandoCliente) return
    setErroModalNovoCliente('')

    // Validar campos obrigatórios
    if (temResponsavel) {
      if (!novoClienteNome.trim() || !novoClienteResponsavelNome.trim() || !novoClienteResponsavelTelefone.trim()) {
        setErroModalNovoCliente('Preencha nome do aluno, nome e telefone do responsável')
        return
      }
      if (!validarTelefone(novoClienteResponsavelTelefone)) {
        setErroModalNovoCliente('Telefone do responsável inválido. Use o formato (XX) XXXXX-XXXX')
        return
      }
    } else {
      if (!novoClienteNome.trim() || !novoClienteTelefone.trim()) {
        setErroModalNovoCliente('Preencha nome e telefone')
        return
      }
      if (!validarTelefone(novoClienteTelefone)) {
        setErroModalNovoCliente('Telefone inválido. Use o formato (XX) XXXXX-XXXX')
        return
      }
    }

    // Validar CPF apenas se preenchido (opcional no cadastro)
    if (novoClienteCpf.trim() && !validarCPF(novoClienteCpf)) {
      setErroModalNovoCliente('CPF inválido')
      return
    }

    if (criarAssinatura && (!dataInicioAssinatura || !dataVencimentoAssinatura || !planoSelecionado)) {
      setErroModalNovoCliente('Preencha a data de início, data de vencimento e selecione um plano')
      return
    }

    // Verificar limite de clientes do plano (apenas clientes com assinatura ativa contam)
    const clientesAtivos = clientes.filter(c => c.assinatura_ativa && !c.deleted_at).length
    if (clientesAtivos >= limiteClientes) {
      setErroModalNovoCliente(`Limite de ${limiteClientes} alunos ativos atingido no plano ${plano?.toUpperCase() || 'atual'}. Faça upgrade para adicionar mais alunos.`)
      return
    }

    if (!userId) return

    setSalvandoCliente(true)
    try {
      // Definir telefone principal: se tem responsável, usa o do responsável
      const telefoneParaSalvar = temResponsavel ? novoClienteResponsavelTelefone.trim() : novoClienteTelefone.trim()

      // Verificar se já existe cliente com o mesmo telefone
      // Permite duplicata quando o aluno tem responsável (telefone é do responsável)
      if (!temResponsavel) {
        const telefoneFormatado = telefoneParaSalvar.replace(/\D/g, '')
        const duplicado = clientes.find(c =>
          c.telefone?.replace(/\D/g, '') === telefoneFormatado
        )

        if (duplicado) {
          setErroModalNovoCliente(`Já existe um aluno com este telefone (${duplicado.nome})`)
          return
        }
      }

      // Criar cliente
      const { data: clienteData, error: clienteError } = await supabase
        .from('devedores')
        .insert({
          user_id: userId,
          nome: novoClienteNome.trim(),
          telefone: telefoneParaSalvar,
          cpf: novoClienteCpf.trim() || null,
          data_nascimento: novoClienteDataNascimento || null,
          email: novoClienteEmail.trim() || null,
          responsavel_nome: novoClienteResponsavelNome.trim() || null,
          responsavel_telefone: novoClienteResponsavelTelefone.trim() || null,
          valor_devido: 0,
          data_vencimento: new Date().toISOString().split('T')[0],
          status: 'pendente',
          assinatura_ativa: criarAssinatura,
          plano_id: criarAssinatura ? planoSelecionado : null,
          aulas_restantes: criarAssinatura && planos.find(p => p.id === planoSelecionado)?.tipo === 'pacote' ? planos.find(p => p.id === planoSelecionado)?.numero_aulas : null,
          aulas_total: criarAssinatura && planos.find(p => p.id === planoSelecionado)?.tipo === 'pacote' ? planos.find(p => p.id === planoSelecionado)?.numero_aulas : null,
          portal_token: crypto.randomUUID().replace(/-/g, '')
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

        // Usar data de vencimento definida pelo usuário
        const { error: mensalidadeError } = await supabase
          .from('mensalidades')
          .insert({
            user_id: userId,
            devedor_id: clienteData[0].id,
            valor: planoEncontrado.valor,
            data_vencimento: dataVencimentoAssinatura,
            status: 'pendente',
            is_mensalidade: true,
            numero_mensalidade: 1
          })

        if (mensalidadeError) throw mensalidadeError
      }

      // Tentar puxar foto do WhatsApp (fire-and-forget, uma vez só)
      if (clienteData && clienteData.length > 0) {
        whatsappService.buscarFotoPerfil(novoClienteTelefone.trim()).then(async (fotoUrl) => {
          if (fotoUrl) {
            await supabase.from('devedores').update({ foto_url: fotoUrl }).eq('id', clienteData[0].id)
          }
        }).catch(() => {})
      }

      // Enviar mensagem de boas-vindas se opção estiver ativa
      if (enviarBoasVindas && clienteData && clienteData.length > 0) {
        try {
          // Verificar se WhatsApp está conectado
          const statusWhatsApp = await whatsappService.verificarStatus()

          if (statusWhatsApp.conectado) {
            // Buscar nome da empresa
            const { data: usuarioData } = await supabase
              .from('usuarios')
              .select('nome_empresa')
              .eq('id', userId)
              .maybeSingle()

            const nomeEmpresa = usuarioData?.nome_empresa || 'nossa empresa'
            const primeiroNome = novoClienteNome.trim().split(' ')[0]

            // Buscar template de boas-vindas salvo
            const { data: templateWelcome } = await supabase
              .from('templates')
              .select('mensagem')
              .eq('user_id', userId)
              .eq('tipo', 'welcome')
              .eq('ativo', true)
              .order('created_at', { ascending: false })
              .limit(1)
              .maybeSingle()

            // Usar mensagem personalizada inline > template salvo > padrão
            let mensagemFinal
            if (mensagemBoasVindasCustom && mensagemBoasVindasCustom.trim()) {
              mensagemFinal = mensagemBoasVindasCustom
                .replace(/\[Nome\]/g, primeiroNome)
                .replace(/\{\{nomeCliente\}\}/g, primeiroNome)
                .replace(/\{\{nomeEmpresa\}\}/g, nomeEmpresa)
            } else if (templateWelcome?.mensagem) {
              mensagemFinal = templateWelcome.mensagem
                .replace(/\{\{nomeCliente\}\}/g, primeiroNome)
                .replace(/\{\{nomeEmpresa\}\}/g, nomeEmpresa)
            } else {
              mensagemFinal = `Olá, ${primeiroNome}! 👋

Seja muito bem-vindo(a) à ${nomeEmpresa}!

Este é nosso canal oficial de comunicação pelo WhatsApp. Por aqui você receberá:

✅ Lembretes de vencimento
✅ Confirmações de pagamento
✅ Comunicados importantes

*Salve nosso número* para não perder nenhuma mensagem!

Qualquer dúvida, estamos à disposição.

Abraços,
Equipe ${nomeEmpresa}`
            }

            const resultado = await whatsappService.enviarMensagem(
              novoClienteTelefone.trim(),
              mensagemFinal
            )

            if (resultado.sucesso) {
              showToast('Aluno criado e mensagem de boas-vindas enviada!', 'success')
            } else if (resultado.erro && resultado.erro.includes('desconectado')) {
              showToast('Aluno criado! Boas-vindas não enviada: WhatsApp desconectado. Reconecte em WhatsApp > Conexão.', 'warning')
            } else if (resultado.erro && resultado.erro.includes('não existe no WhatsApp')) {
              showToast('Aluno criado! Boas-vindas não enviada: número não tem WhatsApp.', 'warning')
            } else {
              showToast('Aluno criado! (Não foi possível enviar boas-vindas: ' + resultado.erro + ')', 'warning')
            }
          } else {
            showToast('Aluno criado! (WhatsApp desconectado - boas-vindas não enviada)', 'warning')
          }
        } catch (whatsappError) {
          console.error('Erro ao enviar boas-vindas:', whatsappError)
          showToast('Aluno criado! (Erro ao enviar boas-vindas)', 'warning')
        }
      } else {
        showToast('Aluno criado com sucesso!', 'success')
      }

      setMostrarModalNovoCliente(false)
      setNovoClienteNome('')
      setNovoClienteTelefone('')
      setNovoClienteCpf('')
      setNovoClienteDataNascimento('')
      setNovoClienteEmail('')
      setNovoClienteResponsavelNome('')
      setNovoClienteResponsavelTelefone('')
      setTemResponsavel(false)
      setStepCadastro(1)
      setCriarAssinatura(true)
      setDataInicioAssinatura('')
      setDataVencimentoAssinatura('')
      setPlanoSelecionado('')
      setEnviarBoasVindas(true)
      setMostrarEdicaoBoasVindas(false)
      setMensagemBoasVindasCustom('')
      carregarClientes()
    } catch (error) {
      showToast('Erro ao criar aluno: ' + error.message, 'error')
    } finally {
      setSalvandoCliente(false)
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
      <div style={{ flex: 1, padding: isSmallScreen ? '16px' : '25px 30px', backgroundColor: '#ffffff', minHeight: '100vh' }}>
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
    <div style={{ flex: 1, padding: isSmallScreen ? '16px' : '25px 30px', backgroundColor: '#ffffff', minHeight: '100vh' }}>
      {/* Header */}
      <div style={{
        backgroundColor: 'white',
        borderRadius: '0',
        padding: '0',
        marginBottom: isSmallScreen ? '16px' : '25px',
        border: 'none',
        boxShadow: 'none'
      }}>
        <div style={{ marginBottom: '16px' }}>
          <h2 style={{ margin: 0, fontSize: isSmallScreen ? '16px' : '18px', fontWeight: '600', color: '#344848' }}>
            Alunos
          </h2>
          <p style={{ margin: '5px 0 0 0', fontSize: isSmallScreen ? '13px' : '14px', color: '#666' }}>
            {clientesFiltrados.length} de {clientes.filter(c => !c.deleted_at).length} aluno(s)
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

        {/* Busca + Botões */}
        <div style={{ display: 'flex', flexDirection: isSmallScreen ? 'column' : 'row', alignItems: isSmallScreen ? 'stretch' : 'center', gap: '8px' }}>
          {/* Campo de busca */}
          <div style={{ position: 'relative', flex: 1 }}>
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

          {/* Botões */}
          <div style={{ display: 'flex', gap: '8px', position: 'relative' }}>
            <button
              onClick={() => setMostrarImportModal(true)}
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
              title="Importar alunos via CSV"
            >
              <Icon icon="iconoir:import" width="18" height="18" />
            </button>
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
                setNovoClienteNome(''); setNovoClienteTelefone(''); setNovoClienteCpf('')
                setNovoClienteDataNascimento(''); setNovoClienteEmail('')
                setNovoClienteResponsavelNome(''); setNovoClienteResponsavelTelefone('')
                setTemResponsavel(false); setStepCadastro(1)
                setCriarAssinatura(true); setDataInicioAssinatura(''); setDataVencimentoAssinatura('')
                setPlanoSelecionado(''); setEnviarBoasVindas(true)
                setMostrarEdicaoBoasVindas(false); setMensagemBoasVindasCustom('')
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
                  borderBottom: '1px solid #e5e7eb',
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
                      Nome do Aluno
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

                  {/* Filtro por Vencimento */}
                  <div style={{ marginBottom: '16px' }}>
                    <label style={{ display: 'block', fontSize: '13px', color: '#666', marginBottom: '8px', fontWeight: '500' }}>
                      Próximo Vencimento
                    </label>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                      <input
                        type="date"
                        value={filtroVencimentoDe}
                        onChange={(e) => setFiltroVencimentoDe(e.target.value)}
                        style={{
                          flex: 1,
                          padding: '8px 10px',
                          fontSize: '14px',
                          border: '1px solid #ddd',
                          borderRadius: '6px',
                          backgroundColor: 'white',
                          outline: 'none',
                          boxSizing: 'border-box'
                        }}
                      />
                      <span style={{ fontSize: '12px', color: '#999' }}>até</span>
                      <input
                        type="date"
                        value={filtroVencimentoAte}
                        onChange={(e) => setFiltroVencimentoAte(e.target.value)}
                        style={{
                          flex: 1,
                          padding: '8px 10px',
                          fontSize: '14px',
                          border: '1px solid #ddd',
                          borderRadius: '6px',
                          backgroundColor: 'white',
                          outline: 'none',
                          boxSizing: 'border-box'
                        }}
                      />
                    </div>
                  </div>

                  {/* Filtro Aniversariantes */}
                  <div style={{
                    marginBottom: '16px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '10px 12px',
                    backgroundColor: filtroAniversariante ? '#fef3c7' : '#f9fafb',
                    borderRadius: '8px',
                    border: `1px solid ${filtroAniversariante ? '#fbbf24' : '#e5e7eb'}`
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <Icon icon="mdi:cake-variant" width="16" style={{ color: filtroAniversariante ? '#d97706' : '#888' }} />
                      <span style={{ fontSize: '13px', fontWeight: '500', color: filtroAniversariante ? '#92400e' : '#555' }}>
                        Aniversariantes do mês
                      </span>
                    </div>
                    <label style={{ position: 'relative', display: 'inline-block', width: '36px', height: '20px', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={filtroAniversariante}
                        onChange={(e) => setFiltroAniversariante(e.target.checked)}
                        style={{ opacity: 0, width: 0, height: 0 }}
                      />
                      <span style={{
                        position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                        backgroundColor: filtroAniversariante ? '#4CAF50' : '#d1d5db',
                        borderRadius: '20px', transition: 'background-color 0.3s'
                      }} />
                      <span style={{
                        position: 'absolute', top: '2px',
                        left: filtroAniversariante ? '18px' : '2px',
                        width: '16px', height: '16px',
                        backgroundColor: 'white', borderRadius: '50%',
                        transition: 'left 0.3s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)'
                      }} />
                    </label>
                  </div>

                  {/* Botão Limpar Filtros */}
                  <button
                    onClick={() => {
                      setFiltroStatus('todos')
                      setFiltroPlano('todos')
                      setFiltroAssinatura('todos')
                      setFiltroInadimplente(false)
                      setFiltroVencimentoDe('')
                      setFiltroVencimentoAte('')
                      setFiltroAniversariante(false)
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
      </div>

      {/* Lista de Alunos */}
      <div style={{
        backgroundColor: isSmallScreen ? 'transparent' : 'white',
        borderRadius: isSmallScreen ? 0 : '8px',
        border: isSmallScreen ? 'none' : '1px solid #e5e7eb',
        boxShadow: 'none',
        overflow: 'hidden'
      }}>
        {clientes.length === 0 ? (
          <div style={{ padding: '60px 20px', textAlign: 'center', backgroundColor: 'white', borderRadius: '8px' }}>
            <Icon icon="mdi:account-off-outline" width="64" height="64" style={{ color: '#ccc', marginBottom: '16px' }} />
            <p style={{ color: '#999', fontSize: '16px', margin: '0' }}>
              Nenhum aluno cadastrado ainda
            </p>
            <p style={{ color: '#ccc', fontSize: '14px', margin: '8px 0 0 0' }}>
              Adicione mensalidades pela tela Financeiro para criar alunos automaticamente
            </p>
          </div>
        ) : clientesFiltrados.length === 0 ? (
          <div style={{ padding: '60px 20px', textAlign: 'center', backgroundColor: 'white', borderRadius: '8px' }}>
            <Icon icon="material-symbols:search-off" width="64" height="64" style={{ color: '#ccc', marginBottom: '16px' }} />
            <p style={{ color: '#999', fontSize: '16px', margin: '0' }}>
              Nenhum aluno encontrado
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
                  border: '1px solid #e5e7eb',
                  boxShadow: 'none',
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
                      fontWeight: '600',
                      overflow: 'hidden',
                      flexShrink: 0
                    }}>
                      {cliente.foto_url ? (
                        <img src={cliente.foto_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      ) : (
                        cliente.nome.charAt(0).toUpperCase()
                      )}
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
                <tr style={{ backgroundColor: '#f9f9f9', borderBottom: '1px solid #e5e7eb' }}>
                  <th style={{ padding: '12px 24px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: '#666', textTransform: 'uppercase', width: '22%' }}>
                    Aluno
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
                      borderBottom: '1px solid #e5e7eb',
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
                          fontWeight: '600',
                          overflow: 'hidden',
                          flexShrink: 0
                        }}>
                          {cliente.foto_url ? (
                            <img src={cliente.foto_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          ) : (
                            cliente.nome.charAt(0).toUpperCase()
                          )}
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
              {clientesFiltrados.length} aluno{clientesFiltrados.length !== 1 ? 's' : ''}
            </span>
          </div>
        )}
      </div>

      {/* Modal de Detalhes do Aluno */}
      {mostrarModal && clienteSelecionado && (
        <div style={{
          position: 'fixed',
          top: isSmallScreen ? '56px' : 0,
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
            WebkitOverflowScrolling: 'touch'
          }}>
            {/* Header do Modal */}
            <div style={{
              padding: isSmallScreen ? '16px' : '24px',
              borderBottom: '1px solid #e5e7eb',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              backgroundColor: 'white'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div
                  style={{
                    width: '48px',
                    height: '48px',
                    borderRadius: '50%',
                    backgroundColor: '#344848',
                    color: 'white',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '18px',
                    fontWeight: '600',
                    position: 'relative',
                    overflow: 'hidden',
                    cursor: 'pointer'
                  }}
                  title="Clique para alterar foto"
                  onClick={() => document.getElementById('input-foto-aluno')?.click()}
                >
                  {clienteSelecionado.foto_url ? (
                    <img src={clienteSelecionado.foto_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    clienteSelecionado.nome.charAt(0).toUpperCase()
                  )}
                  <div style={{
                    position: 'absolute',
                    bottom: 0,
                    left: 0,
                    right: 0,
                    height: '16px',
                    backgroundColor: 'rgba(0,0,0,0.5)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}>
                    <Icon icon="mdi:camera" width={10} style={{ color: 'white' }} />
                  </div>
                </div>
                <input
                  id="input-foto-aluno"
                  type="file"
                  accept="image/*"
                  style={{ display: 'none' }}
                  onChange={async (e) => {
                    const file = e.target.files?.[0]
                    if (!file) return
                    if (file.size > 2 * 1024 * 1024) {
                      showToast('Imagem muito grande. Máximo 2MB.', 'warning')
                      return
                    }
                    try {
                      const ext = file.name.split('.').pop()
                      const fileName = `${userId}/${clienteSelecionado.id}.${ext}`
                      const { error: uploadError } = await supabase.storage
                        .from('avatars')
                        .upload(fileName, file, { upsert: true })
                      if (uploadError) throw uploadError

                      const { data: urlData } = supabase.storage
                        .from('avatars')
                        .getPublicUrl(fileName)
                      const fotoUrl = urlData.publicUrl + '?t=' + Date.now()

                      await supabase.from('devedores').update({ foto_url: fotoUrl }).eq('id', clienteSelecionado.id)
                      setClienteSelecionado(prev => ({ ...prev, foto_url: fotoUrl }))
                      carregarClientes()
                      showToast('Foto atualizada!', 'success')
                    } catch (err) {
                      showToast('Erro ao enviar foto: ' + err.message, 'error')
                    }
                    e.target.value = ''
                  }}
                />
                <div>
                  <h2 style={{ margin: 0, fontSize: '20px', fontWeight: '600', color: '#344848' }}>
                    {clienteSelecionado.nome}
                  </h2>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
                    <p style={{ margin: 0, fontSize: '14px', color: '#666' }}>
                      {clienteSelecionado.telefone}
                    </p>
                    {clienteSelecionado.portal_token && (
                      <button
                        onClick={() => {
                          const url = `${window.location.origin}/portal/${clienteSelecionado.portal_token}`
                          navigator.clipboard.writeText(url)
                          showToast('Link do portal copiado!', 'success')
                        }}
                        title="Copiar link do portal do aluno"
                        style={{
                          background: '#e8f5e9',
                          border: '1px solid #c8e6c9',
                          borderRadius: '6px',
                          cursor: 'pointer',
                          padding: '3px 8px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px',
                          fontSize: '12px',
                          color: '#2e7d32',
                          fontWeight: '500',
                          transition: 'background-color 0.2s'
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#c8e6c9'}
                        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#e8f5e9'}
                      >
                        <Icon icon="mdi:link-variant" width="14" />
                        Copiar link do portal
                      </button>
                    )}
                  </div>
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
            <div style={{ padding: isSmallScreen ? '16px' : '24px' }}>
              {/* Informações do Aluno + Assinatura - Colapsável */}
              <details style={{
                backgroundColor: '#f8f9fa',
                borderRadius: '10px',
                border: '1px solid #e5e7eb',
                marginBottom: '16px',
                overflow: 'hidden'
              }}>
                <summary style={{
                  padding: '14px 16px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  listStyle: 'none',
                  userSelect: 'none'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <Icon icon="mdi:account-outline" width="18" style={{ color: '#344848' }} />
                    <span style={{ fontSize: '14px', fontWeight: '600', color: '#344848' }}>Informações do Aluno</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {(clienteSelecionado.assinatura_ativa || clienteSelecionado.plano_id) && (
                      <span style={{
                        padding: '2px 8px',
                        borderRadius: '10px',
                        fontSize: '11px',
                        fontWeight: '600',
                        backgroundColor: clienteSelecionado.assinatura_ativa ? '#dcfce7' : '#fee2e2',
                        color: clienteSelecionado.assinatura_ativa ? '#16a34a' : '#dc2626'
                      }}>
                        {planos.find(p => p.id === clienteSelecionado.plano_id)?.nome || 'Plano'} — {clienteSelecionado.assinatura_ativa ? 'Ativa' : 'Cancelada'}
                      </span>
                    )}
                    <Icon icon="mdi:chevron-down" width="18" style={{ color: '#888' }} />
                  </div>
                </summary>
                <div style={{ padding: '0 16px 16px' }}>
                  {/* Dados do aluno em modo leitura ou edição */}
                  {!editando ? (
                    <>
                      <div style={{ display: 'grid', gridTemplateColumns: isSmallScreen ? '1fr 1fr' : '1fr 1fr 1fr', gap: '12px', marginBottom: '14px' }}>
                        {[
                          { label: 'Telefone', value: clienteSelecionado.telefone },
                          { label: 'CPF/CNPJ', value: clienteSelecionado.cpf || '—' },
                          { label: 'Nascimento', value: clienteSelecionado.data_nascimento ? new Date(clienteSelecionado.data_nascimento + 'T00:00:00').toLocaleDateString('pt-BR') : '—' },
                          { label: 'E-mail', value: clienteSelecionado.email || '—' },
                          { label: 'Dia Vencimento', value: (() => { const pend = mensalidadesCliente.find(m => m.status === 'pendente'); const ref = pend || mensalidadesCliente[mensalidadesCliente.length - 1]; return ref ? String(new Date(ref.data_vencimento + 'T00:00:00').getDate()) : '—' })() },
                          { label: 'Responsável', value: clienteSelecionado.responsavel_nome || '—' },
                          { label: 'Tel. Responsável', value: clienteSelecionado.responsavel_telefone || '—' },
                        ].map((item, i) => (
                          <div key={i}>
                            <p style={{ margin: 0, fontSize: '11px', color: '#888', fontWeight: '500' }}>{item.label}</p>
                            <p style={{ margin: '2px 0 0 0', fontSize: '13px', fontWeight: '600', color: '#333' }}>{item.value}</p>
                          </div>
                        ))}
                      </div>

                      {/* Assinatura inline */}
                      {(clienteSelecionado.assinatura_ativa || clienteSelecionado.plano_id) && (
                        <div style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          padding: '10px 12px',
                          backgroundColor: 'white',
                          borderRadius: '8px',
                          border: '1px solid #e5e7eb',
                          marginBottom: '12px'
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <Icon icon="mdi:card-account-details" width="18" style={{ color: '#2196F3' }} />
                            <div>
                              <span style={{ fontSize: '13px', fontWeight: '600', color: '#333' }}>
                                {planos.find(p => p.id === clienteSelecionado.plano_id)?.nome || 'Não identificado'}
                              </span>
                              <span style={{ fontSize: '13px', color: '#2196F3', fontWeight: '600', marginLeft: '8px' }}>
                                R$ {formatCurrency(parseFloat(planos.find(p => p.id === clienteSelecionado.plano_id)?.valor || 0))}/mês
                              </span>
                            </div>
                          </div>
                          <div style={{ display: 'flex', gap: '6px' }}>
                            {clienteSelecionado.assinatura_ativa && (
                              <button
                                onClick={() => {
                                  setPlanoParaAtivar(clienteSelecionado.plano_id || '')
                                  const hoje = new Date()
                                  setDataInicioAssinaturaModal(hoje.toISOString().split('T')[0])
                                  const venc = new Date(hoje)
                                  venc.setDate(venc.getDate() + 30)
                                  setDataVencimentoAssinaturaModal(venc.toISOString().split('T')[0])
                                  setMostrarModalSelecionarPlano({ show: true, clienteId: clienteSelecionado.id })
                                }}
                                style={{
                                  padding: '5px 12px',
                                  backgroundColor: '#e0f2fe',
                                  color: '#0284c7',
                                  border: 'none',
                                  borderRadius: '6px',
                                  cursor: 'pointer',
                                  fontSize: '12px',
                                  fontWeight: '600'
                                }}
                              >
                                Alterar
                              </button>
                            )}
                            <button
                              onClick={() => handleAlterarAssinatura(clienteSelecionado.id, !clienteSelecionado.assinatura_ativa)}
                              style={{
                                padding: '5px 12px',
                                backgroundColor: clienteSelecionado.assinatura_ativa ? '#fee2e2' : '#dcfce7',
                                color: clienteSelecionado.assinatura_ativa ? '#dc2626' : '#16a34a',
                                border: 'none',
                                borderRadius: '6px',
                                cursor: 'pointer',
                                fontSize: '12px',
                                fontWeight: '600'
                              }}
                            >
                              {clienteSelecionado.assinatura_ativa ? 'Cancelar' : 'Reativar'}
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Toggle pausar cobranças */}
                      <div style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        padding: '8px 12px',
                        backgroundColor: clienteSelecionado.bloquear_mensagens ? '#fef3c7' : '#f9fafb',
                        borderRadius: '8px',
                        border: `1px solid ${clienteSelecionado.bloquear_mensagens ? '#fbbf24' : '#e5e7eb'}`,
                        marginBottom: '12px'
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <Icon icon={clienteSelecionado.bloquear_mensagens ? 'mdi:bell-off' : 'mdi:bell-ring'} width="16" style={{ color: clienteSelecionado.bloquear_mensagens ? '#d97706' : '#888' }} />
                          <span style={{ fontSize: '12px', fontWeight: '600', color: clienteSelecionado.bloquear_mensagens ? '#92400e' : '#555' }}>
                            {clienteSelecionado.bloquear_mensagens ? 'Cobranças pausadas' : 'Cobranças ativas'}
                          </span>
                        </div>
                        <label style={{ position: 'relative', display: 'inline-block', width: '36px', height: '20px', cursor: 'pointer' }}>
                          <input
                            type="checkbox"
                            checked={!clienteSelecionado.bloquear_mensagens}
                            onChange={async (e) => {
                              const novoValor = !e.target.checked
                              try {
                                await supabase.from('devedores').update({ bloquear_mensagens: novoValor }).eq('id', clienteSelecionado.id)
                                setClienteSelecionado({ ...clienteSelecionado, bloquear_mensagens: novoValor })
                                setClientes(prev => prev.map(c => c.id === clienteSelecionado.id ? { ...c, bloquear_mensagens: novoValor } : c))
                                showToast(novoValor ? 'Cobranças pausadas para este aluno' : 'Cobranças reativadas', 'success')
                              } catch { showToast('Erro ao atualizar', 'error') }
                            }}
                            style={{ opacity: 0, width: 0, height: 0 }}
                          />
                          <span style={{
                            position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                            backgroundColor: clienteSelecionado.bloquear_mensagens ? '#d1d5db' : '#4CAF50',
                            borderRadius: '20px', transition: 'background-color 0.3s'
                          }} />
                          <span style={{
                            position: 'absolute', top: '2px',
                            left: clienteSelecionado.bloquear_mensagens ? '2px' : '18px',
                            width: '16px', height: '16px',
                            backgroundColor: 'white', borderRadius: '50%',
                            transition: 'left 0.3s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)'
                          }} />
                        </label>
                      </div>

                      <button
                        onClick={() => setEditando(true)}
                        style={{
                          padding: '6px 14px',
                          backgroundColor: 'white',
                          color: '#344848',
                          border: '1px solid #d1d5db',
                          borderRadius: '6px',
                          cursor: 'pointer',
                          fontSize: '12px',
                          fontWeight: '600',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px'
                        }}
                      >
                        <Icon icon="mdi:pencil" width="14" />
                        Editar dados
                      </button>
                    </>
                  ) : (
                    <>
                      <div style={{ display: 'grid', gridTemplateColumns: isSmallScreen ? '1fr' : '1fr 1fr', gap: '12px' }}>
                        <div>
                          <label style={{ display: 'block', marginBottom: '4px', fontSize: '12px', color: '#666', fontWeight: '500' }}>Nome</label>
                          <input type="text" value={nomeEdit} onChange={(e) => setNomeEdit(e.target.value)}
                            style={{ width: '100%', padding: '8px 10px', fontSize: '13px', border: '1px solid #ddd', borderRadius: '6px', backgroundColor: 'white', color: '#333', boxSizing: 'border-box' }} />
                        </div>
                        <div>
                          <label style={{ display: 'block', marginBottom: '4px', fontSize: '12px', color: '#666', fontWeight: '500' }}>Telefone</label>
                          <input type="tel" value={telefoneEdit} onChange={(e) => setTelefoneEdit(formatarTelefone(e.target.value))} maxLength="15"
                            style={{ width: '100%', padding: '8px 10px', fontSize: '13px', border: '1px solid #ddd', borderRadius: '6px', backgroundColor: 'white', color: '#333', boxSizing: 'border-box' }} />
                        </div>
                        <div>
                          <label style={{ display: 'block', marginBottom: '4px', fontSize: '12px', color: '#666', fontWeight: '500' }}>CPF/CNPJ</label>
                          <input type="text" value={cpfEdit} onChange={(e) => setCpfEdit(formatarCpfCnpj(e.target.value))} maxLength="18" placeholder="000.000.000-00"
                            style={{ width: '100%', padding: '8px 10px', fontSize: '13px', border: '1px solid #ddd', borderRadius: '6px', backgroundColor: 'white', color: cpfEdit ? '#333' : '#999', boxSizing: 'border-box' }} />
                        </div>
                        <div>
                          <label style={{ display: 'block', marginBottom: '4px', fontSize: '12px', color: '#666', fontWeight: '500' }}>E-mail</label>
                          <input type="email" value={emailEdit} onChange={(e) => setEmailEdit(e.target.value)} placeholder="email@exemplo.com"
                            style={{ width: '100%', padding: '8px 10px', fontSize: '13px', border: '1px solid #ddd', borderRadius: '6px', backgroundColor: 'white', color: emailEdit ? '#333' : '#999', boxSizing: 'border-box' }} />
                        </div>
                        <div>
                          <label style={{ display: 'block', marginBottom: '4px', fontSize: '12px', color: '#666', fontWeight: '500' }}>Nascimento</label>
                          <input type="date" value={dataNascimentoEdit} onChange={(e) => setDataNascimentoEdit(e.target.value)}
                            style={{ width: '100%', padding: '8px 10px', fontSize: '13px', border: '1px solid #ddd', borderRadius: '6px', backgroundColor: 'white', color: dataNascimentoEdit ? '#333' : '#999', boxSizing: 'border-box' }} />
                        </div>
                        <div>
                          <label style={{ display: 'block', marginBottom: '4px', fontSize: '12px', color: '#666', fontWeight: '500' }}>Dia Vencimento</label>
                          <input type="number" min="1" max="31" value={diaVencimentoEdit} placeholder="1-31"
                            onChange={(e) => { const val = e.target.value; if (val === '' || (Number(val) >= 1 && Number(val) <= 31)) setDiaVencimentoEdit(val) }}
                            onFocus={(e) => e.target.select()}
                            style={{ width: '100%', padding: '8px 10px', fontSize: '13px', border: '1px solid #ddd', borderRadius: '6px', backgroundColor: 'white', color: diaVencimentoEdit ? '#333' : '#999', boxSizing: 'border-box' }} />
                        </div>
                        <div>
                          <label style={{ display: 'block', marginBottom: '4px', fontSize: '12px', color: '#666', fontWeight: '500' }}>Responsável Legal</label>
                          <input type="text" value={responsavelNomeEdit} onChange={(e) => setResponsavelNomeEdit(e.target.value)} placeholder="Nome do responsável"
                            style={{ width: '100%', padding: '8px 10px', fontSize: '13px', border: '1px solid #ddd', borderRadius: '6px', backgroundColor: 'white', color: responsavelNomeEdit ? '#333' : '#999', boxSizing: 'border-box' }} />
                        </div>
                        <div>
                          <label style={{ display: 'block', marginBottom: '4px', fontSize: '12px', color: '#666', fontWeight: '500' }}>Tel. Responsável</label>
                          <input type="tel" value={responsavelTelefoneEdit} onChange={(e) => setResponsavelTelefoneEdit(formatarTelefone(e.target.value))} maxLength="15" placeholder="(00) 00000-0000"
                            style={{ width: '100%', padding: '8px 10px', fontSize: '13px', border: '1px solid #ddd', borderRadius: '6px', backgroundColor: 'white', color: responsavelTelefoneEdit ? '#333' : '#999', boxSizing: 'border-box' }} />
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: '8px', marginTop: '12px', justifyContent: 'flex-end' }}>
                        <button
                          onClick={() => {
                            setEditando(false)
                            setNomeEdit(clienteSelecionado.nome)
                            setTelefoneEdit(clienteSelecionado.telefone)
                            setCpfEdit(clienteSelecionado.cpf || '')
                            setDataNascimentoEdit(clienteSelecionado.data_nascimento || '')
                            setEmailEdit(clienteSelecionado.email || '')
                            setResponsavelNomeEdit(clienteSelecionado.responsavel_nome || '')
                            setResponsavelTelefoneEdit(clienteSelecionado.responsavel_telefone || '')
                            const pend = mensalidadesCliente.find(m => m.status === 'pendente')
                            const ref = pend || mensalidadesCliente[mensalidadesCliente.length - 1]
                            setDiaVencimentoEdit(ref ? String(new Date(ref.data_vencimento + 'T00:00:00').getDate()) : '')
                          }}
                          style={{ padding: '6px 14px', backgroundColor: 'white', color: '#666', border: '1px solid #ddd', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: '500' }}
                        >
                          Cancelar
                        </button>
                        <button onClick={handleSalvarEdicao}
                          style={{ padding: '6px 14px', backgroundColor: '#4CAF50', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: '500' }}
                        >
                          Salvar
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </details>

              {/* Indicadores do Aluno - 4 Cards */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: isSmallScreen ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)',
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
                    {clienteSelecionado.tempoDeCasaDias !== null ? (
                      clienteSelecionado.tempoDeCasaDias < 30
                        ? clienteSelecionado.tempoDeCasaDias === 0
                          ? 'Hoje'
                          : `${clienteSelecionado.tempoDeCasaDias} dia${clienteSelecionado.tempoDeCasaDias !== 1 ? 's' : ''}`
                        : clienteSelecionado.tempoDeCasa >= 12
                          ? `${Math.floor(clienteSelecionado.tempoDeCasa / 12)} ano${Math.floor(clienteSelecionado.tempoDeCasa / 12) !== 1 ? 's' : ''}`
                          : `${clienteSelecionado.tempoDeCasa} ${clienteSelecionado.tempoDeCasa === 1 ? 'mês' : 'meses'}`
                    ) : '-'}
                  </p>
                  <p style={{ margin: '2px 0 0 0', fontSize: '10px', color: '#888' }}>como aluno</p>
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

              {/* Card Aulas Restantes (só para plano tipo pacote) */}
              {clienteSelecionado.aulas_restantes !== null && clienteSelecionado.aulas_restantes !== undefined && (
                <div style={{
                  backgroundColor: clienteSelecionado.aulas_restantes <= 0 ? '#fef2f2' : clienteSelecionado.aulas_restantes <= 2 ? '#fffbeb' : '#f0fdf4',
                  borderRadius: '10px',
                  padding: '16px',
                  marginBottom: '24px',
                  border: `1px solid ${clienteSelecionado.aulas_restantes <= 0 ? '#fecaca' : clienteSelecionado.aulas_restantes <= 2 ? '#fde68a' : '#bbf7d0'}`
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <Icon icon="mdi:school-outline" width={20} style={{ color: clienteSelecionado.aulas_restantes <= 0 ? '#dc2626' : clienteSelecionado.aulas_restantes <= 2 ? '#d97706' : '#16a34a' }} />
                      <span style={{ fontSize: '13px', fontWeight: '600', color: '#333' }}>Aulas Restantes</span>
                    </div>
                    <button
                      onClick={() => {
                        setMostrarRecarregar(!mostrarRecarregar)
                        setPlanoRecarregar(clienteSelecionado.plano_id || '')
                      }}
                      style={{
                        padding: '5px 12px',
                        borderRadius: '6px',
                        border: '1px solid #2196F3',
                        backgroundColor: mostrarRecarregar ? '#e3f2fd' : 'white',
                        color: '#2196F3',
                        fontSize: '11px',
                        fontWeight: '600',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px'
                      }}
                    >
                      <Icon icon="mdi:refresh" width={14} />
                      Renovar Pacote
                    </button>
                  </div>

                  {/* Painel de renovação expandido */}
                  {mostrarRecarregar && (
                    <div style={{
                      backgroundColor: 'white',
                      borderRadius: '8px',
                      padding: '12px',
                      marginBottom: '12px',
                      border: '1px solid #e0e0e0'
                    }}>
                      <label style={{ display: 'block', fontSize: '12px', fontWeight: '500', color: '#555', marginBottom: '6px' }}>
                        Selecione o pacote:
                      </label>
                      <select
                        value={planoRecarregar}
                        onChange={(e) => setPlanoRecarregar(e.target.value)}
                        style={{
                          width: '100%',
                          padding: '8px 10px',
                          border: '1px solid #ddd',
                          borderRadius: '6px',
                          fontSize: '16px',
                          backgroundColor: 'white',
                          cursor: 'pointer',
                          marginBottom: '10px'
                        }}
                      >
                        <option value="">Selecione...</option>
                        {planos.filter(p => p.tipo === 'pacote').map(p => (
                          <option key={p.id} value={p.id}>
                            {p.nome} - {p.numero_aulas} aulas - R$ {parseFloat(p.valor).toFixed(2)}
                          </option>
                        ))}
                      </select>
                      <button
                        disabled={!planoRecarregar}
                        onClick={async () => {
                          const plano = planos.find(p => p.id === planoRecarregar)
                          if (!plano) return
                          try {
                            // 1. Atualizar créditos do aluno
                            await supabase.from('devedores').update({
                              aulas_restantes: plano.numero_aulas,
                              aulas_total: plano.numero_aulas,
                              plano_id: plano.id
                            }).eq('id', clienteSelecionado.id)

                            // 2. Criar mensalidade já paga
                            await supabase.from('mensalidades').insert({
                              user_id: userId,
                              devedor_id: clienteSelecionado.id,
                              valor: parseFloat(plano.valor),
                              data_vencimento: new Date().toISOString().split('T')[0],
                              status: 'pago',
                              is_mensalidade: true,
                              numero_mensalidade: 1,
                              forma_pagamento: 'pix',
                              data_pagamento: new Date().toISOString().split('T')[0]
                            })

                            setClienteSelecionado(prev => ({
                              ...prev,
                              aulas_restantes: plano.numero_aulas,
                              aulas_total: plano.numero_aulas,
                              plano_id: plano.id
                            }))
                            setMostrarRecarregar(false)
                            showToast(`Pacote renovado: ${plano.numero_aulas} aulas! Pagamento de R$ ${parseFloat(plano.valor).toFixed(2)} registrado.`, 'success')
                            carregarClientes()
                            if (clienteSelecionado.id) carregarMensalidadesCliente(clienteSelecionado.id)
                          } catch (err) {
                            showToast('Erro ao renovar pacote: ' + err.message, 'error')
                          }
                        }}
                        style={{
                          width: '100%',
                          padding: '8px',
                          borderRadius: '6px',
                          border: 'none',
                          backgroundColor: planoRecarregar ? '#4CAF50' : '#ccc',
                          color: 'white',
                          fontSize: '13px',
                          fontWeight: '600',
                          cursor: planoRecarregar ? 'pointer' : 'not-allowed',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '6px'
                        }}
                      >
                        <Icon icon="mdi:check" width={16} />
                        Renovar Pacote
                      </button>
                    </div>
                  )}

                  <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px', marginBottom: '8px' }}>
                    <span style={{
                      fontSize: '28px',
                      fontWeight: '700',
                      color: clienteSelecionado.aulas_restantes <= 0 ? '#dc2626' : clienteSelecionado.aulas_restantes <= 2 ? '#d97706' : '#16a34a'
                    }}>
                      {clienteSelecionado.aulas_restantes}
                    </span>
                    <span style={{ fontSize: '16px', color: '#888', fontWeight: '500' }}>/ {clienteSelecionado.aulas_total}</span>
                    <span style={{ fontSize: '13px', color: '#888', marginLeft: '4px' }}>aulas</span>
                  </div>
                  <div style={{
                    height: '8px',
                    borderRadius: '4px',
                    backgroundColor: '#e5e7eb',
                    overflow: 'hidden'
                  }}>
                    <div style={{
                      height: '100%',
                      width: `${clienteSelecionado.aulas_total > 0 ? Math.max((clienteSelecionado.aulas_restantes / clienteSelecionado.aulas_total) * 100, 0) : 0}%`,
                      backgroundColor: clienteSelecionado.aulas_restantes <= 0 ? '#dc2626' : clienteSelecionado.aulas_restantes <= 2 ? '#d97706' : '#16a34a',
                      borderRadius: '4px',
                      transition: 'width 0.3s ease'
                    }} />
                  </div>
                  {clienteSelecionado.aulas_restantes <= 0 && (
                    <p style={{ margin: '8px 0 0 0', fontSize: '12px', color: '#dc2626', fontWeight: '600' }}>
                      Pacote esgotado! Renove o pacote para continuar.
                    </p>
                  )}
                  {clienteSelecionado.aulas_restantes > 0 && clienteSelecionado.aulas_restantes <= 2 && (
                    <p style={{ margin: '8px 0 0 0', fontSize: '12px', color: '#d97706', fontWeight: '600' }}>
                      Poucas aulas restantes!
                    </p>
                  )}
                </div>
              )}

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

              {/* Seção de Frequência */}
              {presencasAluno.length > 0 && (
                <div style={{
                  backgroundColor: '#f8f9fa',
                  borderRadius: '10px',
                  padding: '16px',
                  marginBottom: '24px',
                  border: '1px solid #e9ecef'
                }}>
                  <div
                    onClick={() => setMostrarFrequencia(!mostrarFrequencia)}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      cursor: 'pointer'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <Icon icon="mdi:clipboard-check-outline" width="20" style={{ color: '#344848' }} />
                      <span style={{ fontSize: '15px', fontWeight: '600', color: '#344848' }}>
                        Frequência
                      </span>
                      <span style={{
                        fontSize: '12px',
                        fontWeight: '600',
                        backgroundColor: (() => {
                          const total = presencasAluno.length
                          const presentes = presencasAluno.filter(p => p.presente).length
                          const pct = total > 0 ? (presentes / total) * 100 : 0
                          return pct >= 75 ? '#dcfce7' : pct >= 50 ? '#fef3c7' : '#fee2e2'
                        })(),
                        color: (() => {
                          const total = presencasAluno.length
                          const presentes = presencasAluno.filter(p => p.presente).length
                          const pct = total > 0 ? (presentes / total) * 100 : 0
                          return pct >= 75 ? '#16a34a' : pct >= 50 ? '#d97706' : '#dc2626'
                        })(),
                        padding: '2px 8px',
                        borderRadius: '10px'
                      }}>
                        {Math.round((presencasAluno.filter(p => p.presente).length / presencasAluno.length) * 100)}% presença
                      </span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '12px', color: '#888' }}>
                        {presencasAluno.filter(p => p.presente).length}/{presencasAluno.length} aulas
                      </span>
                      <Icon icon={mostrarFrequencia ? 'mdi:chevron-up' : 'mdi:chevron-down'} width="20" color="#888" />
                    </div>
                  </div>

                  {/* Barra de progresso */}
                  <div style={{ marginTop: '12px' }}>
                    <div style={{ backgroundColor: '#e5e7eb', borderRadius: '4px', height: '6px', overflow: 'hidden' }}>
                      <div style={{
                        width: `${(presencasAluno.filter(p => p.presente).length / presencasAluno.length) * 100}%`,
                        backgroundColor: (() => {
                          const pct = (presencasAluno.filter(p => p.presente).length / presencasAluno.length) * 100
                          return pct >= 75 ? '#22c55e' : pct >= 50 ? '#f59e0b' : '#ef4444'
                        })(),
                        height: '100%',
                        borderRadius: '4px',
                        transition: 'width 0.3s ease'
                      }} />
                    </div>
                  </div>

                  {/* Lista de presenças expandida */}
                  {mostrarFrequencia && (
                    <div style={{ marginTop: '16px', maxHeight: '300px', overflowY: 'auto' }}>
                      {presencasAluno.map(p => (
                        <div key={p.id} style={{
                          display: 'flex',
                          alignItems: 'flex-start',
                          gap: '10px',
                          padding: '10px 0',
                          borderBottom: '1px solid #e9ecef'
                        }}>
                          <Icon
                            icon={p.presente ? 'mdi:check-circle' : 'mdi:close-circle'}
                            width="20"
                            style={{ color: p.presente ? '#16a34a' : '#dc2626', marginTop: '1px', flexShrink: 0 }}
                          />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <span style={{ fontSize: '13px', fontWeight: '600', color: '#333' }}>
                                {new Date(p.data + 'T00:00:00').toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' })}
                              </span>
                              <span style={{ fontSize: '12px', color: '#888' }}>
                                {p.grade_horarios?.horario?.substring(0, 5)} {p.grade_horarios?.descricao ? `— ${p.grade_horarios.descricao}` : ''}
                              </span>
                            </div>
                            {p.observacao && (
                              <p style={{
                                margin: '4px 0 0 0',
                                fontSize: '12px',
                                color: '#666',
                                lineHeight: '1.4',
                                whiteSpace: 'pre-wrap'
                              }}>
                                {p.observacao}
                              </p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

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
                  <div style={{ maxHeight: isSmallScreen ? '200px' : '300px', overflowY: 'auto' }}>
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
                          <tr key={mensalidade.id} style={{ borderBottom: '1px solid #e5e7eb' }}>
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
                  Excluir Aluno
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
        onClose={() => { setConfirmDelete({ show: false, cliente: null }); setExcluirMensalidades(false) }}
        onConfirm={confirmarExclusao}
        title={`Excluir aluno "${confirmDelete.cliente?.nome}"?`}
        message={`Este aluno possui ${confirmDelete.cliente?.totalMensalidades || 0} mensalidade(s) associadas.`}
        confirmText="Excluir"
        cancelText="Cancelar"
        type="danger"
        showCheckbox={confirmDelete.cliente?.totalMensalidades > 0}
        checkboxLabel={`Também excluir as ${confirmDelete.cliente?.totalMensalidades || 0} mensalidades`}
        checkboxChecked={excluirMensalidades}
        onCheckboxChange={setExcluirMensalidades}
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
            ? 'Deseja ativar a assinatura deste aluno?'
            : 'Deseja desativar a assinatura deste aluno?'
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
            setDataVencimentoAssinaturaModal('')
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
              maxWidth: isSmallScreen ? '100%' : '450px',
              boxShadow: '0 8px 32px rgba(0,0,0,0.2)'
            }}
          >
            {/* Header */}
            <div style={{
              padding: '20px 24px',
              borderBottom: '1px solid #e5e7eb',
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
                  Ativar Assinatura
                </h3>
                <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#666' }}>
                  Defina o plano e as datas da assinatura
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
                          {plano.nome} - R$ {formatCurrency(parseFloat(plano.valor))}{plano.tipo === 'pacote' ? ` (${plano.numero_aulas} aulas)` : '/mês'}
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
                      onChange={(e) => {
                        setDataInicioAssinaturaModal(e.target.value)
                        if (e.target.value) {
                          const inicio = new Date(e.target.value + 'T00:00:00')
                          inicio.setDate(inicio.getDate() + 30)
                          setDataVencimentoAssinaturaModal(inicio.toISOString().split('T')[0])
                        }
                      }}
                      style={{
                        width: '100%',
                        padding: '12px',
                        border: '1px solid #ddd',
                        borderRadius: '6px',
                        fontSize: '14px',
                        backgroundColor: 'white'
                      }}
                    />
                  </div>

                  <div style={{ marginBottom: '16px' }}>
                    <label style={{
                      display: 'block',
                      marginBottom: '8px',
                      fontSize: '14px',
                      fontWeight: '500',
                      color: '#333'
                    }}>
                      Data de Vencimento
                    </label>
                    <input
                      type="date"
                      value={dataVencimentoAssinaturaModal}
                      onChange={(e) => setDataVencimentoAssinaturaModal(e.target.value)}
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
                      Data da primeira mensalidade. Auto-preenchido com início + 30 dias.
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
                  setDataVencimentoAssinaturaModal('')
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
                disabled={!planoParaAtivar || !dataInicioAssinaturaModal || !dataVencimentoAssinaturaModal}
                style={{
                  padding: '10px 20px',
                  backgroundColor: (planoParaAtivar && dataInicioAssinaturaModal && dataVencimentoAssinaturaModal) ? '#4CAF50' : '#ccc',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: (planoParaAtivar && dataInicioAssinaturaModal && dataVencimentoAssinaturaModal) ? 'pointer' : 'not-allowed',
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

      {/* Modal de novo aluno */}
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
            {/* Header com steps */}
            <div style={{ marginBottom: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <h3 style={{ margin: 0, fontSize: isSmallScreen ? '18px' : '20px', fontWeight: '600', color: '#1a1a1a' }}>
                  Novo Aluno
                </h3>
                <button onClick={() => { setMostrarModalNovoCliente(false); setStepCadastro(1); setErroModalNovoCliente('') }}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', display: 'flex' }}>
                  <Icon icon="mdi:close" width="24" style={{ color: '#666' }} />
                </button>
              </div>

              {/* Step indicator */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                {[
                  { n: 1, label: 'Dados' },
                  { n: 2, label: 'Plano' },
                  { n: 3, label: 'Confirmar' }
                ].map((s, i) => (
                  <div key={s.n} style={{ display: 'flex', alignItems: 'center', flex: i < 2 ? 1 : 'none' }}>
                    <div style={{
                      width: 28, height: 28, borderRadius: '50%',
                      background: stepCadastro >= s.n ? '#333' : '#e5e7eb',
                      color: stepCadastro >= s.n ? '#fff' : '#999',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: '12px', fontWeight: '700', flexShrink: 0,
                      transition: 'all 0.2s'
                    }}>
                      {stepCadastro > s.n ? <Icon icon="mdi:check" width="16" /> : s.n}
                    </div>
                    <span style={{ fontSize: '12px', fontWeight: stepCadastro === s.n ? '600' : '400', color: stepCadastro >= s.n ? '#333' : '#999', marginLeft: '6px', whiteSpace: 'nowrap' }}>
                      {s.label}
                    </span>
                    {i < 2 && <div style={{ flex: 1, height: '2px', background: stepCadastro > s.n ? '#333' : '#e5e7eb', margin: '0 8px', transition: 'background 0.2s' }} />}
                  </div>
                ))}
              </div>
            </div>

            {/* Mensagem de erro */}
            {erroModalNovoCliente && (
              <div style={{ padding: '10px 14px', borderRadius: '6px', marginBottom: '16px', backgroundColor: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Icon icon="mdi:alert-circle" width="18" />
                {erroModalNovoCliente}
              </div>
            )}

            {/* ===== STEP 1: Dados do Aluno ===== */}
            {stepCadastro === 1 && (
              <div>
                <div style={{ display: 'grid', gridTemplateColumns: isSmallScreen ? '1fr' : '1fr 1fr', gap: '14px', marginBottom: '16px' }}>
                  <div style={{ gridColumn: '1 / -1' }}>
                    <label style={{ display: 'block', marginBottom: '4px', fontSize: '13px', fontWeight: '500', color: '#333' }}>Nome do aluno *</label>
                    <input type="text" value={novoClienteNome} onChange={(e) => setNovoClienteNome(e.target.value)} placeholder="Nome completo"
                      style={{ width: '100%', padding: '10px 12px', border: '1px solid #e0e0e0', borderRadius: '6px', fontSize: '16px', outline: 'none', boxSizing: 'border-box' }}
                      onFocus={(e) => e.target.style.borderColor = '#333'} onBlur={(e) => e.target.style.borderColor = '#e0e0e0'} />
                  </div>
                  <div>
                    <label style={{ display: 'block', marginBottom: '4px', fontSize: '13px', fontWeight: '500', color: temResponsavel ? '#999' : '#333' }}>
                      Telefone {!temResponsavel && '*'}
                      {temResponsavel && <span style={{ fontSize: '11px', color: '#999' }}> (do responsável)</span>}
                    </label>
                    <input type="text" value={temResponsavel ? novoClienteResponsavelTelefone : novoClienteTelefone}
                      onChange={(e) => !temResponsavel && setNovoClienteTelefone(formatarTelefone(e.target.value))}
                      disabled={temResponsavel} placeholder="(00) 00000-0000" maxLength="15"
                      style={{ width: '100%', padding: '10px 12px', border: '1px solid #e0e0e0', borderRadius: '6px', fontSize: '16px', outline: 'none', boxSizing: 'border-box', backgroundColor: temResponsavel ? '#f5f5f5' : 'white', color: temResponsavel ? '#999' : '#333' }}
                      onFocus={(e) => !temResponsavel && (e.target.style.borderColor = '#333')} onBlur={(e) => e.target.style.borderColor = '#e0e0e0'} />
                  </div>
                  <div>
                    <label style={{ display: 'block', marginBottom: '4px', fontSize: '13px', fontWeight: '500', color: '#333' }}>
                      CPF <span style={{ color: '#999', fontSize: '11px' }}>(opcional)</span>
                    </label>
                    <input type="text" value={novoClienteCpf} onChange={(e) => setNovoClienteCpf(formatarCpfCnpj(e.target.value))} placeholder="000.000.000-00" maxLength="14"
                      style={{ width: '100%', padding: '10px 12px', border: '1px solid #e0e0e0', borderRadius: '6px', fontSize: '16px', outline: 'none', boxSizing: 'border-box' }}
                      onFocus={(e) => e.target.style.borderColor = '#333'} onBlur={(e) => e.target.style.borderColor = '#e0e0e0'} />
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <label style={{ display: 'block', marginBottom: '4px', fontSize: '13px', fontWeight: '500', color: '#333' }}>
                      Nascimento <span style={{ color: '#999', fontSize: '11px' }}>(opcional)</span>
                    </label>
                    <input type="date" value={novoClienteDataNascimento} onChange={(e) => setNovoClienteDataNascimento(e.target.value)}
                      style={{ display: 'block', width: '100%', padding: '10px 12px', border: '1px solid #e0e0e0', borderRadius: '6px', fontSize: '16px', backgroundColor: 'white', boxSizing: 'border-box', WebkitAppearance: 'none', appearance: 'none', height: '40px' }} />
                  </div>
                  <div>
                    <label style={{ display: 'block', marginBottom: '4px', fontSize: '13px', fontWeight: '500', color: '#333' }}>
                      E-mail <span style={{ color: '#999', fontSize: '11px' }}>(opcional)</span>
                    </label>
                    <input type="email" value={novoClienteEmail} onChange={(e) => setNovoClienteEmail(e.target.value)} placeholder="email@exemplo.com"
                      style={{ width: '100%', padding: '10px 12px', border: '1px solid #e0e0e0', borderRadius: '6px', fontSize: '16px', outline: 'none', boxSizing: 'border-box' }}
                      onFocus={(e) => e.target.style.borderColor = '#333'} onBlur={(e) => e.target.style.borderColor = '#e0e0e0'} />
                  </div>
                </div>

                {/* Toggle Responsável */}
                <div style={{ marginBottom: '16px', backgroundColor: '#f8f9fa', borderRadius: '8px', border: '1px solid #e5e7eb', overflow: 'hidden' }}>
                  <div onClick={() => {
                    const novo = !temResponsavel
                    setTemResponsavel(novo)
                    if (novo) setNovoClienteTelefone('')
                    else { setNovoClienteResponsavelNome(''); setNovoClienteResponsavelTelefone('') }
                  }} style={{ padding: '10px 14px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '13px', fontWeight: '500', color: '#333' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Icon icon="mdi:account-child-outline" width="18" style={{ color: '#666' }} />
                      Aluno menor de idade?
                    </div>
                    <div style={{ width: '40px', height: '22px', borderRadius: '11px', backgroundColor: temResponsavel ? '#4CAF50' : '#ddd', position: 'relative', transition: 'background-color 0.2s', flexShrink: 0 }}>
                      <div style={{ width: '18px', height: '18px', borderRadius: '50%', backgroundColor: 'white', position: 'absolute', top: '2px', left: temResponsavel ? '20px' : '2px', transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }} />
                    </div>
                  </div>
                  {temResponsavel && (
                    <div style={{ display: 'grid', gridTemplateColumns: isSmallScreen ? '1fr' : '1fr 1fr', gap: '12px', padding: '0 14px 14px' }}>
                      <div>
                        <label style={{ display: 'block', marginBottom: '4px', fontSize: '13px', color: '#333', fontWeight: '500' }}>Nome do Responsável *</label>
                        <input type="text" value={novoClienteResponsavelNome} onChange={(e) => setNovoClienteResponsavelNome(e.target.value)} placeholder="Nome Responsável"
                          style={{ width: '100%', padding: '10px 12px', border: '1px solid #e0e0e0', borderRadius: '6px', fontSize: '16px', outline: 'none', boxSizing: 'border-box', backgroundColor: 'white' }}
                          onFocus={(e) => e.target.style.borderColor = '#333'} onBlur={(e) => e.target.style.borderColor = '#e0e0e0'} />
                      </div>
                      <div>
                        <label style={{ display: 'block', marginBottom: '4px', fontSize: '13px', color: '#333', fontWeight: '500' }}>Telefone do Responsável *</label>
                        <input type="tel" value={novoClienteResponsavelTelefone} onChange={(e) => setNovoClienteResponsavelTelefone(formatarTelefone(e.target.value))} placeholder="(00) 00000-0000" maxLength="15"
                          style={{ width: '100%', padding: '10px 12px', border: '1px solid #e0e0e0', borderRadius: '6px', fontSize: '16px', outline: 'none', boxSizing: 'border-box', backgroundColor: 'white' }}
                          onFocus={(e) => e.target.style.borderColor = '#333'} onBlur={(e) => e.target.style.borderColor = '#e0e0e0'} />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ===== STEP 2: Plano e Mensalidade ===== */}
            {stepCadastro === 2 && (() => {
              // Auto-preencher datas ao entrar no step 2
              if (criarAssinatura && !dataInicioAssinatura) {
                const hoje = new Date()
                setTimeout(() => {
                  setDataInicioAssinatura(hoje.toISOString().split('T')[0])
                  const venc = new Date(hoje)
                  venc.setDate(venc.getDate() + 30)
                  setDataVencimentoAssinatura(venc.toISOString().split('T')[0])
                }, 0)
              }
              return (
              <div>
                {/* Toggle configurar depois */}
                <label style={{
                  display: 'flex', alignItems: 'center', gap: '8px',
                  marginBottom: '16px', cursor: 'pointer', fontSize: '13px', color: '#666'
                }}>
                  <input type="checkbox" checked={!criarAssinatura}
                    onChange={(e) => {
                      const pular = e.target.checked
                      setCriarAssinatura(!pular)
                      if (pular) {
                        setDataInicioAssinatura(''); setDataVencimentoAssinatura(''); setPlanoSelecionado('')
                      } else if (!dataInicioAssinatura) {
                        const hoje = new Date()
                        setDataInicioAssinatura(hoje.toISOString().split('T')[0])
                        const venc = new Date(hoje)
                        venc.setDate(venc.getDate() + 30)
                        setDataVencimentoAssinatura(venc.toISOString().split('T')[0])
                      }
                    }}
                    style={{ width: '16px', height: '16px', cursor: 'pointer', accentColor: '#666' }} />
                  Configurar mensalidade depois
                </label>

                {criarAssinatura ? (
                  <div style={{ padding: '14px', backgroundColor: '#f0f7ff', borderRadius: '8px', border: '1px solid #bbdefb', overflow: 'hidden' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: isSmallScreen ? '1fr' : '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                      <div style={{ minWidth: 0 }}>
                        <label style={{ display: 'block', marginBottom: '4px', fontSize: '13px', fontWeight: '500', color: '#333' }}>Data de Inicio</label>
                        <input type="date" value={dataInicioAssinatura}
                          onChange={(e) => {
                            setDataInicioAssinatura(e.target.value)
                            if (e.target.value) {
                              const inicio = new Date(e.target.value + 'T00:00:00')
                              inicio.setDate(inicio.getDate() + 30)
                              setDataVencimentoAssinatura(inicio.toISOString().split('T')[0])
                            }
                          }}
                          style={{ display: 'block', width: '100%', padding: '10px 12px', border: '1px solid #ddd', borderRadius: '6px', fontSize: '16px', backgroundColor: 'white', boxSizing: 'border-box', WebkitAppearance: 'none', appearance: 'none' }} />
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <label style={{ display: 'block', marginBottom: '4px', fontSize: '13px', fontWeight: '500', color: '#333' }}>Vencimento</label>
                        <input type="date" value={dataVencimentoAssinatura} onChange={(e) => setDataVencimentoAssinatura(e.target.value)}
                          style={{ display: 'block', width: '100%', padding: '10px 12px', border: '1px solid #ddd', borderRadius: '6px', fontSize: '16px', backgroundColor: 'white', boxSizing: 'border-box', WebkitAppearance: 'none', appearance: 'none' }} />
                      </div>
                    </div>
                    <div>
                      <label style={{ display: 'block', marginBottom: '4px', fontSize: '13px', fontWeight: '500', color: '#333' }}>Plano</label>
                      <select value={planoSelecionado} onChange={(e) => setPlanoSelecionado(e.target.value)}
                        style={{ width: '100%', padding: '10px 12px', border: '1px solid #ddd', borderRadius: '6px', fontSize: '16px', outline: 'none', cursor: 'pointer', backgroundColor: 'white', boxSizing: 'border-box' }}>
                        <option value="">Selecione um plano</option>
                        {planos.map(plano => (
                          <option key={plano.id} value={plano.id}>
                            {plano.nome} - R$ {formatCurrency(parseFloat(plano.valor))}{plano.tipo === 'pacote' ? ` (${plano.numero_aulas} aulas)` : '/mês'}
                          </option>
                        ))}
                      </select>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '8px' }}>
                        <button type="button" onClick={() => setMostrarModalCriarPlano(true)}
                          style={{ padding: '6px 12px', backgroundColor: 'transparent', color: '#2196F3', border: '1px dashed #2196F3', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <Icon icon="material-symbols:add" width="14" /> Novo Plano
                        </button>
                        <span style={{ fontSize: '11px', color: '#888' }}>Vencimento = inicio + 30 dias</span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div style={{ textAlign: 'center', padding: '24px 16px', color: '#777', fontSize: '13px', backgroundColor: '#f8f9fa', borderRadius: '8px', border: '1px solid #e5e7eb' }}>
                    <Icon icon="mdi:calendar-clock-outline" width="28" style={{ color: '#999', display: 'block', margin: '0 auto 8px' }} />
                    Voce poderá configurar o plano e mensalidade na ficha do aluno.
                  </div>
                )}
              </div>
              )
            })()}

            {/* ===== STEP 3: Resumo + Boas-vindas ===== */}
            {stepCadastro === 3 && (
              <div>
                {/* Resumo */}
                <div style={{ backgroundColor: '#f8f9fa', borderRadius: '8px', padding: '14px', marginBottom: '16px', border: '1px solid #e5e7eb' }}>
                  <div style={{ fontSize: '12px', fontWeight: '600', color: '#666', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '10px' }}>Resumo do cadastro</div>
                  <div style={{ display: 'grid', gap: '8px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                      <span style={{ color: '#666' }}>Aluno</span>
                      <span style={{ fontWeight: '600', color: '#333' }}>{novoClienteNome || '-'}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                      <span style={{ color: '#666' }}>Telefone</span>
                      <span style={{ fontWeight: '600', color: '#333' }}>{temResponsavel ? novoClienteResponsavelTelefone : novoClienteTelefone || '-'}</span>
                    </div>
                    {temResponsavel && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                        <span style={{ color: '#666' }}>Responsável</span>
                        <span style={{ fontWeight: '600', color: '#333' }}>{novoClienteResponsavelNome}</span>
                      </div>
                    )}
                    {criarAssinatura && planoSelecionado && (
                      <>
                        <div style={{ height: '1px', background: '#e5e7eb', margin: '4px 0' }} />
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                          <span style={{ color: '#666' }}>Plano</span>
                          <span style={{ fontWeight: '600', color: '#333' }}>{planos.find(p => p.id === planoSelecionado)?.nome || '-'}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                          <span style={{ color: '#666' }}>Valor</span>
                          <span style={{ fontWeight: '600', color: '#16a34a' }}>R$ {formatCurrency(parseFloat(planos.find(p => p.id === planoSelecionado)?.valor || 0))}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                          <span style={{ color: '#666' }}>Vencimento</span>
                          <span style={{ fontWeight: '600', color: '#333' }}>{dataVencimentoAssinatura ? new Date(dataVencimentoAssinatura + 'T00:00:00').toLocaleDateString('pt-BR') : '-'}</span>
                        </div>
                      </>
                    )}
                    {!criarAssinatura && (
                      <>
                        <div style={{ height: '1px', background: '#e5e7eb', margin: '4px 0' }} />
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                          <span style={{ color: '#666' }}>Mensalidade</span>
                          <span style={{ fontWeight: '500', color: '#999' }}>Não criada</span>
                        </div>
                      </>
                    )}
                  </div>
                </div>

                {/* Boas-vindas */}
                <div style={{ padding: '14px', backgroundColor: '#f0f7ff', borderRadius: '8px', border: '1px solid #bbdefb', marginBottom: '16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <label style={{ display: 'flex', alignItems: 'flex-start', cursor: 'pointer', fontSize: '13px', fontWeight: '500', color: '#333', gap: '8px', flex: 1 }}>
                      <input type="checkbox" checked={enviarBoasVindas} onChange={(e) => setEnviarBoasVindas(e.target.checked)}
                        style={{ width: '16px', height: '16px', marginTop: '2px', cursor: 'pointer', accentColor: '#2196F3' }} />
                      <div>
                        <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <Icon icon="mdi:whatsapp" width="16" style={{ color: '#25D366' }} />
                          Enviar mensagem de boas-vindas
                        </span>
                      </div>
                    </label>
                    {enviarBoasVindas && (
                      <button type="button" onClick={() => setMostrarEdicaoBoasVindas(!mostrarEdicaoBoasVindas)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px', color: '#2196F3', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', fontWeight: '500' }}>
                        <Icon icon={mostrarEdicaoBoasVindas ? 'mdi:chevron-up' : 'mdi:pencil'} width="14" />
                        {mostrarEdicaoBoasVindas ? 'Fechar' : 'Editar'}
                      </button>
                    )}
                  </div>
                  {enviarBoasVindas && mostrarEdicaoBoasVindas && (
                    <div style={{ marginTop: '12px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                        <label style={{ fontSize: '12px', fontWeight: '500', color: '#333' }}>Personalizar mensagem:</label>
                        {mensagemBoasVindasCustom && (
                          <button type="button" onClick={() => setMensagemBoasVindasCustom('')}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#999', fontSize: '11px', textDecoration: 'underline' }}>
                            Restaurar padrão
                          </button>
                        )}
                      </div>
                      <textarea
                        value={mensagemBoasVindasCustom || `Olá, ${novoClienteNome.trim().split(' ')[0] || '[Nome]'}! 👋\n\nSeja muito bem-vindo(a)!\n\nEste é nosso canal oficial de comunicação pelo WhatsApp. Por aqui você receberá:\n\n✅ Lembretes de vencimento\n✅ Confirmações de pagamento\n✅ Comunicados importantes\n\n*Salve nosso número* para não perder nenhuma mensagem!\n\nQualquer dúvida, estamos à disposição.`}
                        onChange={(e) => setMensagemBoasVindasCustom(e.target.value)}
                        style={{ width: '100%', minHeight: '120px', padding: '12px', border: '1px solid #ddd', borderRadius: '6px', fontSize: '13px', fontFamily: 'inherit', resize: 'vertical', backgroundColor: 'white', boxSizing: 'border-box', lineHeight: '1.5' }} />
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Botões de navegação */}
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'space-between', marginTop: '8px' }}>
              <button
                onClick={() => {
                  if (stepCadastro === 1) {
                    setMostrarModalNovoCliente(false); setStepCadastro(1); setErroModalNovoCliente('')
                    setNovoClienteNome(''); setNovoClienteTelefone(''); setNovoClienteCpf(''); setNovoClienteDataNascimento('')
                    setNovoClienteEmail(''); setNovoClienteResponsavelNome(''); setNovoClienteResponsavelTelefone('')
                    setTemResponsavel(false); setCriarAssinatura(true); setDataInicioAssinatura(''); setDataVencimentoAssinatura(''); setPlanoSelecionado('')
                    setEnviarBoasVindas(true); setMostrarEdicaoBoasVindas(false); setMensagemBoasVindasCustom('')
                  } else {
                    setStepCadastro(stepCadastro - 1)
                    setErroModalNovoCliente('')
                  }
                }}
                style={{
                  padding: '10px 20px', borderRadius: '6px', border: '1px solid #e0e0e0',
                  backgroundColor: 'white', color: '#666', fontSize: '14px', fontWeight: '500', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: '4px'
                }}
              >
                {stepCadastro === 1 ? 'Cancelar' : <><Icon icon="mdi:chevron-left" width="18" /> Voltar</>}
              </button>

              {stepCadastro < 3 ? (() => {
                const stepCompleto = stepCadastro === 1
                  ? temResponsavel
                    ? !!(novoClienteNome.trim() && novoClienteResponsavelNome.trim() && novoClienteResponsavelTelefone.trim())
                    : !!(novoClienteNome.trim() && novoClienteTelefone.trim())
                  : !criarAssinatura || !!(dataInicioAssinatura && dataVencimentoAssinatura && planoSelecionado)
                return (
                <button
                  onClick={() => {
                    setErroModalNovoCliente('')
                    if (stepCadastro === 1) {
                      // Validar step 1
                      if (temResponsavel) {
                        if (!novoClienteNome.trim() || !novoClienteResponsavelNome.trim() || !novoClienteResponsavelTelefone.trim()) {
                          setErroModalNovoCliente('Preencha nome do aluno, nome e telefone do responsável'); return
                        }
                        if (!validarTelefone(novoClienteResponsavelTelefone)) {
                          setErroModalNovoCliente('Telefone do responsável inválido'); return
                        }
                      } else {
                        if (!novoClienteNome.trim() || !novoClienteTelefone.trim()) {
                          setErroModalNovoCliente('Preencha nome e telefone'); return
                        }
                        if (!validarTelefone(novoClienteTelefone)) {
                          setErroModalNovoCliente('Telefone inválido. Use (XX) XXXXX-XXXX'); return
                        }
                      }
                    }
                    if (stepCadastro === 2 && criarAssinatura) {
                      if (!dataInicioAssinatura || !dataVencimentoAssinatura || !planoSelecionado) {
                        setErroModalNovoCliente('Selecione um plano ou marque "Configurar depois"'); return
                      }
                    }
                    setStepCadastro(stepCadastro + 1)
                  }}
                  style={{
                    padding: '10px 24px', borderRadius: '6px', border: 'none',
                    backgroundColor: '#333', color: 'white', fontSize: '14px', fontWeight: '500',
                    cursor: stepCompleto ? 'pointer' : 'default',
                    display: 'flex', alignItems: 'center', gap: '4px',
                    opacity: stepCompleto ? 1 : 0.4, transition: 'opacity 0.2s'
                  }}
                  onMouseEnter={(e) => { if (stepCompleto) e.currentTarget.style.backgroundColor = '#222' }}
                  onMouseLeave={(e) => { if (stepCompleto) e.currentTarget.style.backgroundColor = '#333' }}
                >
                  Próximo <Icon icon="mdi:chevron-right" width="18" />
                </button>
                )
              })() : (
                <button onClick={handleCriarCliente} disabled={salvandoCliente}
                  style={{
                    padding: '10px 24px', borderRadius: '6px', border: 'none',
                    backgroundColor: salvandoCliente ? '#999' : '#16a34a', color: 'white',
                    fontSize: '14px', fontWeight: '600', cursor: salvandoCliente ? 'not-allowed' : 'pointer',
                    display: 'flex', alignItems: 'center', gap: '6px', opacity: salvandoCliente ? 0.7 : 1
                  }}>
                  {salvandoCliente ? 'Salvando...' : <><Icon icon="mdi:check" width="18" /> Criar Aluno</>}
                </button>
              )}
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
              borderBottom: '1px solid #e5e7eb'
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

            {/* Tipo do plano */}
            <div style={{ marginBottom: '16px' }}>
              <label style={{
                display: 'block',
                marginBottom: '8px',
                fontSize: '14px',
                fontWeight: '500',
                color: '#333'
              }}>
                Tipo do Plano *
              </label>
              <div style={{ display: 'flex', gap: '8px' }}>
                {[
                  { value: 'recorrente', label: 'Recorrente', icon: 'mdi:refresh' },
                  { value: 'pacote', label: 'Pacote de Aulas', icon: 'mdi:package-variant' }
                ].map(opt => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setNovoPlanoTipo(opt.value)}
                    style={{
                      flex: 1,
                      padding: '10px 12px',
                      borderRadius: '8px',
                      border: `2px solid ${novoPlanoTipo === opt.value ? '#2196F3' : '#e0e0e0'}`,
                      backgroundColor: novoPlanoTipo === opt.value ? '#e3f2fd' : 'white',
                      color: novoPlanoTipo === opt.value ? '#1565C0' : '#666',
                      fontSize: '13px',
                      fontWeight: '600',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '6px',
                      transition: 'all 0.2s'
                    }}
                  >
                    <Icon icon={opt.icon} width={18} />
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Número de aulas (só para pacote) */}
            {novoPlanoTipo === 'pacote' && (
              <div style={{ marginBottom: '16px' }}>
                <label style={{
                  display: 'block',
                  marginBottom: '8px',
                  fontSize: '14px',
                  fontWeight: '500',
                  color: '#333'
                }}>
                  Número de Aulas *
                </label>
                <input
                  type="number"
                  value={novoPlanoNumeroAulas}
                  onChange={(e) => setNovoPlanoNumeroAulas(e.target.value)}
                  placeholder="Ex: 8"
                  min="1"
                  style={{
                    width: '100%',
                    padding: '12px',
                    border: '1px solid #e0e0e0',
                    borderRadius: '6px',
                    fontSize: '16px',
                    outline: 'none',
                    transition: 'border-color 0.2s'
                  }}
                  onFocus={(e) => e.target.style.borderColor = '#2196F3'}
                  onBlur={(e) => e.target.style.borderColor = '#e0e0e0'}
                />
                <span style={{ fontSize: '12px', color: '#888', marginTop: '4px', display: 'block' }}>
                  Quantidade de aulas que o aluno pode fazer com este pacote
                </span>
              </div>
            )}

            {/* Ciclo de cobrança (só para recorrente) */}
            {novoPlanoTipo === 'recorrente' && (
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
                  fontSize: '16px',
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
            )}

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
                  setNovoPlanoTipo('recorrente')
                  setNovoPlanoNumeroAulas('')
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

      {/* Modal de Importação CSV */}
      <CsvImportModal
        isOpen={mostrarImportModal}
        onClose={() => setMostrarImportModal(false)}
        onImportComplete={(count) => {
          setMostrarImportModal(false)
          carregarClientes()
          showToast(`${count} alunos importados com sucesso!`, 'success')
        }}
        userId={userId}
        existingClients={clientes}
        planos={planos}
        limiteClientes={limiteClientes}
        clientesAtivos={clientes.filter(c => c.assinatura_ativa && !c.deleted_at && !c.lixo).length}
      />
    </div>
  )
}
