import { useState, useEffect, useCallback } from 'react'
import { supabase } from './supabaseClient'
import { Icon } from '@iconify/react'
import AddInstallmentsModal from './AddInstallmentsModal'
import { showToast } from './Toast'
import whatsappService from './services/whatsappService'
import { exportarMensalidades } from './utils/exportUtils'
import useWindowSize from './hooks/useWindowSize'
import { useUser } from './contexts/UserContext'

export default function Financeiro({ onAbrirPerfil, onSair }) {
  const { isMobile, isTablet, isSmallScreen } = useWindowSize()
  const { userId, loading: loadingUser } = useUser()
  const [mensalidades, setMensalidades] = useState([])
  const [mensalidadesFiltradas, setMensalidadesFiltradas] = useState([])
  const [loading, setLoading] = useState(true)
  const [mostrarFiltros, setMostrarFiltros] = useState(false)
  const [filtroStatus, setFiltroStatus] = useState([])
  const [filtroVencimento, setFiltroVencimento] = useState(null)
  const [filtroDataInicio, setFiltroDataInicio] = useState('')
  const [filtroDataFim, setFiltroDataFim] = useState('')
  const [filtroNome, setFiltroNome] = useState('')

  // Modal de Detalhes da Mensalidade
  const [mostrarModalDetalhes, setMostrarModalDetalhes] = useState(false)
  const [mensalidadeDetalhes, setMensalidadeDetalhes] = useState(null)
  const [mostrarModalAdicionar, setMostrarModalAdicionar] = useState(false)
  const [clientes, setClientes] = useState([])
  const [mostrarModalConfirmacao, setMostrarModalConfirmacao] = useState(false)
  const [mensalidadeParaAtualizar, setMensalidadeParaAtualizar] = useState(null)
  const [novoStatusPagamento, setNovoStatusPagamento] = useState(false)
  const [formaPagamento, setFormaPagamento] = useState('')

  // Cards de resumo
  const [totalEmAtraso, setTotalEmAtraso] = useState(0)
  const [totalEmAberto, setTotalEmAberto] = useState(0)
  const [totalRecebido, setTotalRecebido] = useState(0)
  const [quantidadeEmAtraso, setQuantidadeEmAtraso] = useState(0)
  const [quantidadeRecebido, setQuantidadeRecebido] = useState(0)
  const [percentualAtrasado, setPercentualAtrasado] = useState(0)
  const [percentualRecebido, setPercentualRecebido] = useState(0)
  const [vencemHoje, setVencemHoje] = useState(0)
  const [vencemProximos7, setVencemProximos7] = useState(0)
  const [totalProximosVencimentos, setTotalProximosVencimentos] = useState(0)
  const [mrr, setMrr] = useState(0)
  const [assinaturasAtivas, setAssinaturasAtivas] = useState(0)

  useEffect(() => {
    if (userId) {
      carregarDados()
    }
  }, [userId])

  useEffect(() => {
    aplicarFiltros()
  }, [mensalidades, filtroStatus, filtroVencimento, filtroDataInicio, filtroDataFim, filtroNome])

  // OTIMIZAÇÃO: Consolidar carregarMensalidades, carregarClientes e calcularMRR em uma única função
  const carregarDados = useCallback(async () => {
    if (!userId) return

    setLoading(true)
    try {
      // Executar todas as queries em paralelo
      const [
        { data: mensalidadesData, error: mensalidadesError },
        { data: clientesData, error: clientesError }
      ] = await Promise.all([
        // 1. Mensalidades com dados do devedor
        supabase
          .from('mensalidades')
          .select(`
            *,
            devedor:devedores(
              nome,
              plano:planos(nome)
            )
          `)
          .eq('user_id', userId)
          .order('data_vencimento', { ascending: true }),

        // 2. Clientes com assinaturas para MRR (consolidado)
        supabase
          .from('devedores')
          .select('id, nome, assinatura_ativa, plano:planos(valor)')
          .eq('user_id', userId)
          .order('nome', { ascending: true })
      ])

      if (mensalidadesError) throw mensalidadesError
      if (clientesError) throw clientesError

      // Processar mensalidades
      const mensalidadesComStatus = (mensalidadesData || []).map(p => ({
        ...p,
        statusCalculado: calcularStatus(p)
      }))

      setMensalidades(mensalidadesComStatus)
      calcularTotais(mensalidadesComStatus)

      // Processar clientes
      setClientes(clientesData || [])

      // Calcular MRR a partir dos clientes já carregados
      const assinaturasAtivasList = clientesData?.filter(c => c.assinatura_ativa && c.plano?.valor) || []
      const ativas = assinaturasAtivasList.length
      const mrrCalculado = assinaturasAtivasList.reduce((sum, assin) => {
        return sum + (parseFloat(assin.plano?.valor) || 0)
      }, 0)

      setAssinaturasAtivas(ativas)
      setMrr(mrrCalculado)

    } catch (error) {
      console.error('Erro ao carregar dados:', error)
      showToast('Erro ao carregar dados: ' + error.message, 'error')
    } finally {
      setLoading(false)
    }
  }, [userId])

  const salvarMensalidades = async (dataToSave) => {
    if (!userId) return

    try {
      // Criar mensalidades no banco de dados
      const mensalidadesParaInserir = dataToSave.mensalidades.map(mensalidade => {
        const mensalidadeBase = {
          user_id: userId,
          devedor_id: dataToSave.devedor_id,
          valor: mensalidade.valor,
          data_vencimento: mensalidade.vencimento,
          status: 'pendente',
          numero_mensalidade: mensalidade.numero,
          total_mensalidades: dataToSave.is_mensalidade ? null : dataToSave.numero_mensalidades,
          is_mensalidade: dataToSave.is_mensalidade
        }

        // Adicionar dados de recorrência se for mensalidade
        if (dataToSave.is_mensalidade && mensalidade.recorrencia) {
          mensalidadeBase.recorrencia = mensalidade.recorrencia
        }

        return mensalidadeBase
      })

      const { error } = await supabase
        .from('mensalidades')
        .insert(mensalidadesParaInserir)

      if (error) throw error

      showToast(dataToSave.is_mensalidade
        ? 'Mensalidade criada com sucesso!'
        : 'Mensalidades criadas com sucesso!', 'success')
      carregarDados()
    } catch (error) {
      console.error('Erro ao salvar mensalidades:', error)
      showToast('Erro ao salvar mensalidades: ' + error.message, 'error')
    }
  }

  const calcularStatus = (mensalidade) => {
    if (mensalidade.status === 'pago') return 'pago'

    const hoje = new Date()
    hoje.setHours(0, 0, 0, 0)
    const vencimento = new Date(mensalidade.data_vencimento)
    vencimento.setHours(0, 0, 0, 0)

    if (vencimento < hoje) return 'atrasado'
    return 'aberto'
  }

  const calcularTotais = (lista) => {
    let emAtraso = 0
    let emAberto = 0
    let recebido = 0
    let qtdAtraso = 0
    let qtdRecebido = 0
    let qtdHoje = 0
    let qtd7Dias = 0
    let totalProx = 0

    const hoje = new Date()
    hoje.setHours(0, 0, 0, 0)

    lista.forEach(p => {
      const status = p.statusCalculado || calcularStatus(p)
      const valor = parseFloat(p.valor) || 0
      const venc = new Date(p.data_vencimento)
      venc.setHours(0, 0, 0, 0)
      const diffDias = Math.ceil((venc - hoje) / (1000 * 60 * 60 * 24))

      if (status === 'atrasado') {
        emAtraso += valor
        qtdAtraso++
      } else if (status === 'aberto') {
        emAberto += valor

        // Contar vencimentos próximos
        if (diffDias === 0) {
          qtdHoje++
          totalProx += valor
        }
        if (diffDias >= 0 && diffDias <= 7) {
          qtd7Dias++
        }
      } else if (status === 'pago') {
        recebido += valor
        qtdRecebido++
      }
    })

    const total = lista.length || 1
    setTotalEmAtraso(emAtraso)
    setTotalEmAberto(emAberto)
    setTotalRecebido(recebido)
    setQuantidadeEmAtraso(qtdAtraso)
    setQuantidadeRecebido(qtdRecebido)
    setPercentualAtrasado(Math.round((qtdAtraso / total) * 100))
    setPercentualRecebido(Math.round((qtdRecebido / total) * 100))
    setVencemHoje(qtdHoje)
    setVencemProximos7(qtd7Dias)
    setTotalProximosVencimentos(totalProx)
  }

  const aplicarFiltros = () => {
    let resultado = [...mensalidades]

    // Filtro por nome do cliente
    if (filtroNome.trim() !== '') {
      const termo = filtroNome.toLowerCase()
      resultado = resultado.filter(p =>
        p.devedor?.nome?.toLowerCase().includes(termo)
      )
    }

    // Filtro por status (checkboxes ou card clicado)
    if (filtroStatus.length > 0) {
      resultado = resultado.filter(p => filtroStatus.includes(p.statusCalculado))
    }

    // Filtro por vencimento
    if (filtroVencimento) {
      const hoje = new Date()
      hoje.setHours(0, 0, 0, 0)

      resultado = resultado.filter(p => {
        const venc = new Date(p.data_vencimento)
        venc.setHours(0, 0, 0, 0)
        const diffDias = Math.ceil((venc - hoje) / (1000 * 60 * 60 * 24))

        if (filtroVencimento === 'hoje') return diffDias === 0
        if (filtroVencimento === '7dias') return diffDias >= 0 && diffDias <= 7
        if (filtroVencimento === '30dias') return diffDias >= 0 && diffDias <= 30
        return true
      })
    }

    // Filtro por período personalizado
    if (filtroDataInicio || filtroDataFim) {
      resultado = resultado.filter(p => {
        const venc = new Date(p.data_vencimento)
        venc.setHours(0, 0, 0, 0)

        if (filtroDataInicio && filtroDataFim) {
          const inicio = new Date(filtroDataInicio + 'T00:00:00')
          const fim = new Date(filtroDataFim + 'T00:00:00')
          return venc >= inicio && venc <= fim
        } else if (filtroDataInicio) {
          const inicio = new Date(filtroDataInicio + 'T00:00:00')
          return venc >= inicio
        } else if (filtroDataFim) {
          const fim = new Date(filtroDataFim + 'T00:00:00')
          return venc <= fim
        }
        return true
      })
    }

    // Ordenar: atrasado > aberto > pago
    resultado.sort((a, b) => {
      const prioridade = { atrasado: 1, aberto: 2, pago: 3 }
      if (prioridade[a.statusCalculado] !== prioridade[b.statusCalculado]) {
        return prioridade[a.statusCalculado] - prioridade[b.statusCalculado]
      }
      return new Date(a.data_vencimento) - new Date(b.data_vencimento)
    })

    setMensalidadesFiltradas(resultado)
  }

  /**
   * Cria automaticamente a próxima mensalidade quando a atual for paga
   * Apenas para mensalidades recorrentes (is_mensalidade = true)
   */
  const criarProximaMensalidade = async (mensalidadeAtual) => {
    try {
      // 1. Verificar se é recorrente
      if (!mensalidadeAtual.is_mensalidade) {
        console.log('Mensalidade não é recorrente, pulando criação automática')
        return
      }

      // 2. Buscar dados completos do cliente e plano
      const devedor = mensalidadeAtual.devedores

      if (!devedor) {
        console.error('Erro: devedor não encontrado na mensalidade')
        return
      }

      // 3. Verificar se assinatura está ativa
      if (!devedor.assinatura_ativa) {
        console.log('Assinatura inativa, não criar próxima mensalidade')
        return
      }

      // 4. Calcular próximo vencimento (mesmo dia do próximo mês)
      const dataVencimentoAtual = new Date(mensalidadeAtual.data_vencimento + 'T00:00:00')
      const proximoVencimento = new Date(dataVencimentoAtual)

      // Adicionar 1 mês mantendo o mesmo dia
      proximoVencimento.setMonth(proximoVencimento.getMonth() + 1)

      // Ajustar caso o dia não exista no próximo mês (ex: 31 de jan → 28/29 de fev)
      if (proximoVencimento.getDate() !== dataVencimentoAtual.getDate()) {
        proximoVencimento.setDate(0) // Vai para o último dia do mês anterior
      }

      const proximoVencimentoStr = proximoVencimento.toISOString().split('T')[0]

      // 5. Verificar se já existe mensalidade para esta data
      const { data: jaExiste } = await supabase
        .from('mensalidades')
        .select('id')
        .eq('devedor_id', mensalidadeAtual.devedor_id)
        .eq('data_vencimento', proximoVencimentoStr)
        .maybeSingle()

      if (jaExiste) {
        console.log('Próxima mensalidade já existe, pulando criação')
        return
      }

      // 6. Criar nova mensalidade
      const { data: novaMensalidade, error: errorInsert } = await supabase
        .from('mensalidades')
        .insert({
          user_id: mensalidadeAtual.user_id,
          devedor_id: mensalidadeAtual.devedor_id,
          valor: devedor.plano?.valor || mensalidadeAtual.valor,
          data_vencimento: proximoVencimentoStr,
          status: 'pendente',
          is_mensalidade: true,
          numero_mensalidade: (mensalidadeAtual.numero_mensalidade || 0) + 1,
          recorrencia: mensalidadeAtual.recorrencia || {
            isRecurring: true,
            recurrenceType: 'monthly',
            startDate: mensalidadeAtual.data_vencimento
          },
          enviado_hoje: false,
          total_mensagens_enviadas: 0
        })
        .select()
        .single()

      if (errorInsert) {
        console.error('Erro ao criar próxima mensalidade:', errorInsert)
        return
      }

      console.log('✅ Próxima mensalidade criada:', novaMensalidade)

      // Mostrar notificação de sucesso
      const dataFormatada = new Date(proximoVencimentoStr).toLocaleDateString('pt-BR')
      showToast(`Próxima mensalidade criada automaticamente para ${dataFormatada}`, 'success')

      return novaMensalidade

    } catch (error) {
      console.error('Erro na criação automática da próxima mensalidade:', error)
    }
  }

  const alterarStatusPagamento = (mensalidade, novoPago) => {
    setMensalidadeParaAtualizar(mensalidade)
    setNovoStatusPagamento(novoPago)
    setMostrarModalConfirmacao(true)
  }

  const confirmarAlteracaoStatus = async () => {
    if (!mensalidadeParaAtualizar) return

    // Validar forma de pagamento se estiver marcando como pago
    if (novoStatusPagamento && !formaPagamento) {
      showToast('Por favor, selecione a forma de pagamento', 'warning')
      return
    }

    try {
      const updateData = {
        status: novoStatusPagamento ? 'pago' : 'pendente'
      }

      // Adicionar forma e data de pagamento se estiver marcando como pago
      if (novoStatusPagamento) {
        updateData.forma_pagamento = formaPagamento
        updateData.data_pagamento = new Date().toISOString().split('T')[0] // Data atual em formato ISO
      } else {
        // Limpar forma e data se estiver desfazendo
        updateData.forma_pagamento = null
        updateData.data_pagamento = null
      }

      const { data: mensalidadeAtualizada, error } = await supabase
        .from('mensalidades')
        .update(updateData)
        .eq('id', mensalidadeParaAtualizar.id)
        .select('*, devedores(nome, telefone, assinatura_ativa, plano:planos(valor))')
        .single()

      if (error) throw error

      // Atualizar localmente
      const novasMensalidades = mensalidades.map(p => {
        if (p.id === mensalidadeParaAtualizar.id) {
          const atualizada = {
            ...p,
            status: novoStatusPagamento ? 'pago' : 'pendente',
            forma_pagamento: novoStatusPagamento ? formaPagamento : null,
            data_pagamento: novoStatusPagamento ? updateData.data_pagamento : null
          }
          atualizada.statusCalculado = calcularStatus(atualizada)
          return atualizada
        }
        return p
      })

      setMensalidades(novasMensalidades)
      calcularTotais(novasMensalidades)
      showToast(novoStatusPagamento ? 'Pagamento confirmado!' : 'Pagamento desfeito!', 'success')
      setMostrarModalConfirmacao(false)
      setMensalidadeParaAtualizar(null)
      setFormaPagamento('')

      // 🆕 CRIAR PRÓXIMA MENSALIDADE AUTOMATICAMENTE (apenas se estiver marcando como pago)
      if (novoStatusPagamento && mensalidadeAtualizada) {
        await criarProximaMensalidade(mensalidadeAtualizada)
        // Recarregar lista para mostrar nova mensalidade
        carregarDados()
      }
    } catch (error) {
      showToast('Erro ao atualizar: ' + error.message, 'error')
      setMostrarModalConfirmacao(false)
      setMensalidadeParaAtualizar(null)
      setFormaPagamento('')
    }
  }

  const handleEnviarCobranca = async (mensalidade) => {
    if (mensalidade.status === 'pago' || mensalidade.statusCalculado === 'pago') {
      showToast('Esta mensalidade já foi paga', 'info')
      return
    }

    // Verificar conexão WhatsApp primeiro
    const status = await whatsappService.verificarStatus()
    if (!status.conectado) {
      showToast('WhatsApp não está conectado. Conecte primeiro na aba WhatsApp.', 'error')
      return
    }

    // Confirmação
    const confirmar = window.confirm(
      `Enviar cobrança de R$ ${parseFloat(mensalidade.valor).toFixed(2)} para ${mensalidade.devedor.nome}?`
    )
    if (!confirmar) return

    try {
      setLoading(true)
      const resultado = await whatsappService.enviarCobranca(mensalidade.id)

      if (resultado.sucesso) {
        showToast('Cobrança enviada com sucesso!', 'success')
        carregarDados() // Reload to update sent status
      } else {
        showToast('Erro ao enviar: ' + resultado.erro, 'error')
      }
    } catch (error) {
      console.error('Erro ao enviar cobrança:', error)
      showToast('Erro ao enviar cobrança: ' + error.message, 'error')
    } finally {
      setLoading(false)
    }
  }

  const getStatusBadge = (status) => {
    const configs = {
      pago: { bg: '#4CAF50', text: 'Pago' },
      aberto: { bg: '#2196F3', text: 'Em aberto' },
      atrasado: { bg: '#f44336', text: 'Em atraso' }
    }

    const config = configs[status] || configs.aberto

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

  const limparFiltros = () => {
    setFiltroStatus([])
    setFiltroVencimento(null)
    setFiltroDataInicio('')
    setFiltroDataFim('')
    setFiltroNome('')
    setMostrarFiltros(false)
  }

  const toggleFiltroStatus = (status) => {
    if (filtroStatus.includes(status)) {
      setFiltroStatus(filtroStatus.filter(s => s !== status))
    } else {
      setFiltroStatus([...filtroStatus, status])
    }
  }

  const temFiltrosAtivos = filtroStatus.length > 0 || filtroVencimento !== null || filtroDataInicio !== '' || filtroDataFim !== '' || filtroNome.trim() !== ''

  // Abrir modal de detalhes da mensalidade
  const abrirDetalhesMensalidade = (mensalidade) => {
    setMensalidadeDetalhes(mensalidade)
    setMostrarModalDetalhes(true)
  }

  // Marcar como pago direto do modal de detalhes
  const marcarPagoDoModal = () => {
    if (!mensalidadeDetalhes) return
    setMostrarModalDetalhes(false)
    alterarStatusPagamento(mensalidadeDetalhes, mensalidadeDetalhes.status !== 'pago')
  }

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

  if (loading) {
    return (
      <div style={{ padding: '40px', textAlign: 'center' }}>
        <p>Carregando...</p>
      </div>
    )
  }

  return (
    <div style={{ flex: 1, padding: isSmallScreen ? '16px' : '25px 30px', backgroundColor: '#f5f5f5', minHeight: '100vh' }}>
      {/* Header - Título e Botões */}
      <div style={{
        backgroundColor: 'white',
        borderRadius: '8px',
        padding: isSmallScreen ? '16px' : '20px',
        marginBottom: isSmallScreen ? '12px' : '16px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.08)'
      }}>
        <div style={{ display: 'flex', flexDirection: isSmallScreen ? 'column' : 'row', justifyContent: 'space-between', alignItems: isSmallScreen ? 'stretch' : 'center', gap: isSmallScreen ? '16px' : '0' }}>
          {/* Título */}
          <div>
            <h2 style={{ margin: 0, fontSize: isSmallScreen ? '16px' : '18px', fontWeight: '600', color: '#344848' }}>
              Mensalidades
            </h2>
            <p style={{ margin: '5px 0 0 0', fontSize: isSmallScreen ? '13px' : '14px', color: '#666' }}>
              {mensalidadesFiltradas.length} de {mensalidades.length} mensalidade(s)
            </p>
          </div>

          {/* Botões */}
          <div style={{ display: 'flex', gap: '8px', position: 'relative', justifyContent: isSmallScreen ? 'stretch' : 'flex-end' }}>
            <button
              onClick={() => exportarMensalidades(mensalidadesFiltradas)}
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
                if (!temFiltrosAtivos) e.currentTarget.style.backgroundColor = '#f5f5f5'
              }}
              onMouseLeave={(e) => {
                if (!temFiltrosAtivos) e.currentTarget.style.backgroundColor = 'white'
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
                  {filtroStatus.length + (filtroVencimento ? 1 : 0)}
                </span>
              )}
            </button>
            <button
              onClick={() => setMostrarModalAdicionar(true)}
              style={{
                padding: isSmallScreen ? '10px 14px' : '10px 20px',
                backgroundColor: '#333',
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
                {/* Header do popover (mobile/tablet) */}
                {isSmallScreen && (
                  <div style={{
                    padding: '16px 20px',
                    borderBottom: '1px solid #e0e0e0',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    backgroundColor: 'white',
                    position: 'sticky',
                    top: 0,
                    zIndex: 1
                  }}>
                    <h3 style={{ margin: 0, fontSize: '18px', fontWeight: '600', color: '#344848' }}>
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
                        alignItems: 'center'
                      }}
                    >
                      <Icon icon="mdi:close" width="24" height="24" style={{ color: '#666' }} />
                    </button>
                  </div>
                )}

                {/* Conteúdo do popover */}
                <div style={{ padding: '20px', flex: 1 }}>
                  {/* Filtro por Nome */}
                  <div style={{ marginBottom: '20px' }}>
                    <label style={{ display: 'block', fontSize: '14px', color: '#333', marginBottom: '8px', fontWeight: '600' }}>
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
                        value={filtroNome}
                        onChange={(e) => setFiltroNome(e.target.value)}
                        placeholder="Buscar por nome..."
                        style={{
                          width: '100%',
                          padding: '10px 12px 10px 36px',
                          fontSize: '16px',
                          border: '1px solid #ddd',
                          borderRadius: '6px',
                          backgroundColor: 'white',
                          outline: 'none',
                          boxSizing: 'border-box'
                        }}
                      />
                      {filtroNome && (
                        <button
                          onClick={() => setFiltroNome('')}
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

                  {/* Seção Status */}
                  <div style={{ marginBottom: '20px' }}>
                    <label style={{ display: 'block', fontWeight: '600', marginBottom: '12px', fontSize: '14px', color: '#333' }}>
                      Status
                    </label>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      {['pago', 'aberto', 'atrasado'].map(status => (
                        <label key={status} style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                          <input
                            type="checkbox"
                            checked={filtroStatus.includes(status)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setFiltroStatus([...filtroStatus, status])
                              } else {
                                setFiltroStatus(filtroStatus.filter(s => s !== status))
                              }
                            }}
                            style={{
                              width: '16px',
                              height: '16px',
                              cursor: 'pointer',
                              accentColor: '#2196F3'
                            }}
                          />
                          <span style={{ fontSize: '14px', color: '#555' }}>
                            {status === 'pago' && 'Pago'}
                            {status === 'aberto' && 'Em aberto'}
                            {status === 'atrasado' && 'Em atraso'}
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>

                  {/* Seção Vencimento */}
                  <div style={{ marginBottom: '20px' }}>
                    <label style={{ display: 'block', fontWeight: '600', marginBottom: '8px', fontSize: '14px', color: '#333' }}>
                      Vencimento
                    </label>
                    <select
                      value={filtroVencimento || ''}
                      onChange={(e) => setFiltroVencimento(e.target.value || null)}
                      style={{
                        width: '100%',
                        padding: '10px 12px',
                        borderRadius: '6px',
                        border: '1px solid #ddd',
                        fontSize: '16px',
                        backgroundColor: 'white',
                        cursor: 'pointer',
                        outline: 'none',
                        boxSizing: 'border-box'
                      }}
                    >
                      <option value="">Todos</option>
                      <option value="hoje">Hoje</option>
                      <option value="7dias">Próximos 7 dias</option>
                      <option value="30dias">Próximos 30 dias</option>
                    </select>
                  </div>

                  {/* Período Personalizado */}
                  <div>
                    <label style={{
                      display: 'block',
                      marginBottom: '10px',
                      fontSize: '14px',
                      fontWeight: '600',
                      color: '#333'
                    }}>
                      Período Personalizado
                    </label>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      <input
                        type="date"
                        value={filtroDataInicio}
                        onChange={(e) => setFiltroDataInicio(e.target.value)}
                        placeholder="Data início"
                        style={{
                          width: '100%',
                          padding: '10px 12px',
                          borderRadius: '6px',
                          border: '1px solid #ddd',
                          fontSize: '16px',
                          outline: 'none',
                          cursor: 'pointer',
                          boxSizing: 'border-box'
                        }}
                      />
                      <div style={{ textAlign: 'center', color: '#999', fontSize: '12px', fontWeight: '500' }}>
                        até
                      </div>
                      <input
                        type="date"
                        value={filtroDataFim}
                        onChange={(e) => setFiltroDataFim(e.target.value)}
                        placeholder="Data fim"
                        style={{
                          width: '100%',
                          padding: '10px 12px',
                          borderRadius: '6px',
                          border: '1px solid #ddd',
                          fontSize: '16px',
                          outline: 'none',
                          cursor: 'pointer',
                          boxSizing: 'border-box'
                        }}
                      />
                    </div>
                  </div>
                </div>

                {/* Rodapé com botão Limpar filtros */}
                <div style={{
                  borderTop: '1px solid #e0e0e0',
                  padding: '12px 20px',
                  backgroundColor: '#f9f9f9'
                }}>
                  <button
                    onClick={limparFiltros}
                    disabled={!temFiltrosAtivos}
                    style={{
                      width: '100%',
                      padding: '10px',
                      backgroundColor: temFiltrosAtivos ? '#344848' : '#e0e0e0',
                      color: temFiltrosAtivos ? 'white' : '#999',
                      border: 'none',
                      borderRadius: '6px',
                      cursor: temFiltrosAtivos ? 'pointer' : 'not-allowed',
                      fontSize: '14px',
                      fontWeight: '600',
                      transition: 'all 0.2s'
                    }}
                  >
                    Limpar filtros
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Cards de Indicadores - em seção separada */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: isMobile ? '1fr' : isSmallScreen ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)',
        gap: isSmallScreen ? '12px' : '16px',
        marginBottom: isSmallScreen ? '16px' : '20px'
      }}>
            {/* Card 1: Em Atraso */}
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
                  <p style={{ fontSize: '13px', color: '#666', margin: '0 0 6px 0' }}>Em Atraso</p>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Icon icon="solar:danger-triangle-linear" width="18" height="18" style={{ color: '#f44336' }} />
                    <span style={{ fontSize: '20px', fontWeight: '700', color: '#344848' }}>
                      R$ {totalEmAtraso.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                  <p style={{ fontSize: '12px', color: '#888', margin: '4px 0 0 0' }}>
                    {quantidadeEmAtraso} mensalidade{quantidadeEmAtraso !== 1 ? 's' : ''}
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
                  {percentualAtrasado}%
                </span>
              </div>
              <button
                onClick={() => toggleFiltroStatus('atrasado')}
                style={{
                  background: 'none',
                  color: '#f44336',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: '12px',
                  textDecoration: 'underline',
                  padding: 0,
                  fontWeight: '600',
                  textAlign: 'left'
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

            {/* Card 3: Recebido */}
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
                  <p style={{ fontSize: '13px', color: '#666', margin: '0 0 6px 0' }}>Recebido</p>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Icon icon="fluent-emoji-high-contrast:money-bag" width="18" height="18" style={{ color: '#4CAF50' }} />
                    <span style={{ fontSize: '20px', fontWeight: '700', color: '#344848' }}>
                      R$ {totalRecebido.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                  <p style={{ fontSize: '12px', color: '#888', margin: '4px 0 0 0' }}>
                    {quantidadeRecebido} mensalidade{quantidadeRecebido !== 1 ? 's' : ''}
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
                  {percentualRecebido}%
                </span>
              </div>
              <button
                onClick={() => toggleFiltroStatus('pago')}
                style={{
                  background: 'none',
                  color: '#4CAF50',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: '12px',
                  textDecoration: 'underline',
                  padding: 0,
                  fontWeight: '600',
                  textAlign: 'left'
                }}
              >
                Ver detalhes →
              </button>
            </div>

            {/* Card 4: MRR */}
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
                <p style={{ fontSize: '13px', color: '#666', margin: '0 0 6px 0' }}>MRR</p>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Icon icon="mdi:chart-line" width="18" height="18" style={{ color: '#2196F3' }} />
                  <span style={{ fontSize: '20px', fontWeight: '700', color: '#344848' }}>
                    R$ {mrr.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
                <p style={{ fontSize: '11px', color: '#888', margin: '4px 0 0 0' }}>
                  Receita mensal esperada
                </p>
                <p style={{ fontSize: '12px', color: '#2196F3', margin: '8px 0 0 0', fontWeight: '600' }}>
                  {assinaturasAtivas} assinatura{assinaturasAtivas !== 1 ? 's' : ''} ativa{assinaturasAtivas !== 1 ? 's' : ''}
                </p>
              </div>
            </div>
          </div>

      {/* Tabela/Cards de Mensalidades */}
      <div style={{
        backgroundColor: isSmallScreen ? 'transparent' : 'white',
        borderRadius: isSmallScreen ? 0 : '8px',
        boxShadow: isSmallScreen ? 'none' : '0 1px 3px rgba(0,0,0,0.08)',
        overflow: 'hidden'
      }}>
        {mensalidadesFiltradas.length === 0 ? (
          <div style={{ padding: '60px 20px', textAlign: 'center', backgroundColor: 'white', borderRadius: '8px' }}>
            <Icon icon="mdi:receipt-text-outline" width="64" height="64" style={{ color: '#ccc', marginBottom: '16px' }} />
            <p style={{ color: '#999', fontSize: '16px', margin: '0' }}>
              Nenhuma mensalidade encontrada
            </p>
            <p style={{ color: '#ccc', fontSize: '14px', margin: '8px 0 0 0' }}>
              Clique em "Adicionar" para criar mensalidades
            </p>
          </div>
        ) : isSmallScreen ? (
          /* Cards para Mobile/Tablet */
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {mensalidadesFiltradas.map(mensalidade => (
              <div
                key={mensalidade.id}
                onClick={() => abrirDetalhesMensalidade(mensalidade)}
                style={{
                  backgroundColor: 'white',
                  borderRadius: '8px',
                  padding: '16px',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
                  cursor: 'pointer',
                  borderLeft: `4px solid ${
                    mensalidade.statusCalculado === 'atrasado' ? '#f44336' :
                    mensalidade.statusCalculado === 'pago' ? '#4CAF50' : '#2196F3'
                  }`
                }}
              >
                {/* Header do card */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                  <div>
                    <p style={{ fontSize: '15px', fontWeight: '600', color: '#333', margin: '0 0 4px 0' }}>
                      {mensalidade.devedor?.nome || 'N/A'}
                    </p>
                    <p style={{ fontSize: '12px', color: '#888', margin: 0 }}>
                      {mensalidade.devedor?.plano?.nome || 'Sem plano'}
                    </p>
                  </div>
                  {getStatusBadge(mensalidade.statusCalculado)}
                </div>

                {/* Info do card */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <p style={{ fontSize: '20px', fontWeight: '700', color: '#333', margin: '0 0 4px 0' }}>
                      R$ {parseFloat(mensalidade.valor).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </p>
                    <p style={{ fontSize: '13px', color: '#666', margin: 0 }}>
                      Venc: {new Date(mensalidade.data_vencimento + 'T00:00:00').toLocaleDateString('pt-BR')}
                    </p>
                  </div>

                  {/* Toggle de pagamento */}
                  <div onClick={(e) => e.stopPropagation()}>
                    <label style={{ position: 'relative', display: 'inline-block', width: '44px', height: '22px' }}>
                      <input
                        type="checkbox"
                        checked={mensalidade.status === 'pago'}
                        onChange={(e) => alterarStatusPagamento(mensalidade, e.target.checked)}
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
                  <th style={{ padding: '12px 20px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: '#666', width: '20%' }}>
                    Cliente
                  </th>
                  <th style={{ padding: '12px 20px', textAlign: 'center', fontSize: '12px', fontWeight: '600', color: '#666', width: '15%' }}>
                    Vencimento
                  </th>
                  <th style={{ padding: '12px 20px', textAlign: 'center', fontSize: '12px', fontWeight: '600', color: '#666', width: '15%' }}>
                    Valor
                  </th>
                  <th style={{ padding: '12px 20px', textAlign: 'center', fontSize: '12px', fontWeight: '600', color: '#666', width: '18%' }}>
                    Plano
                  </th>
                  <th style={{ padding: '12px 20px', textAlign: 'center', fontSize: '12px', fontWeight: '600', color: '#666', width: '12%' }}>
                    Status
                  </th>
                  <th style={{ padding: '12px 20px', textAlign: 'center', fontSize: '12px', fontWeight: '600', color: '#666', width: '12%' }}>
                    Forma Pagamento
                  </th>
                  <th style={{ padding: '12px 20px', textAlign: 'center', fontSize: '12px', fontWeight: '600', color: '#666', width: '12%' }}>
                    Data Pagamento
                  </th>
                  <th style={{ padding: '12px 20px', textAlign: 'center', fontSize: '12px', fontWeight: '600', color: '#666', width: '10%' }}>
                    Pagou
                  </th>
                </tr>
              </thead>
              <tbody>
                {mensalidadesFiltradas.map(mensalidade => (
                  <tr
                    key={mensalidade.id}
                    onClick={() => abrirDetalhesMensalidade(mensalidade)}
                    style={{ borderBottom: '1px solid #f0f0f0', transition: 'background-color 0.2s', cursor: 'pointer' }}
                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f9f9f9'}
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'white'}
                  >
                    <td style={{ padding: '16px 20px', fontSize: '14px', color: '#333', fontWeight: '500', textAlign: 'left' }}>
                      {mensalidade.devedor?.nome || 'N/A'}
                    </td>
                    <td style={{ padding: '16px 20px', fontSize: '14px', color: '#666', textAlign: 'center' }}>
                      {new Date(mensalidade.data_vencimento + 'T00:00:00').toLocaleDateString('pt-BR')}
                    </td>
                    <td style={{ padding: '16px 20px', fontSize: '16px', fontWeight: '700', color: '#333', textAlign: 'center' }}>
                      R$ {parseFloat(mensalidade.valor).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td style={{ padding: '16px 20px', fontSize: '13px', color: '#666', textAlign: 'center' }}>
                      {mensalidade.devedor?.plano?.nome || '-'}
                    </td>
                    <td style={{ padding: '16px 20px', textAlign: 'center' }}>
                      {getStatusBadge(mensalidade.statusCalculado)}
                    </td>
                    <td style={{ padding: '16px 20px', fontSize: '13px', color: '#666', textAlign: 'center' }}>
                      {mensalidade.forma_pagamento || '-'}
                    </td>
                    <td style={{ padding: '16px 20px', fontSize: '13px', color: '#666', textAlign: 'center' }}>
                      {mensalidade.data_pagamento
                        ? new Date(mensalidade.data_pagamento + 'T00:00:00').toLocaleDateString('pt-BR')
                        : '-'
                      }
                    </td>
                    <td style={{ padding: '16px 20px', textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
                      <label style={{ position: 'relative', display: 'inline-block', width: '44px', height: '22px' }}>
                        <input
                          type="checkbox"
                          checked={mensalidade.status === 'pago'}
                          onChange={(e) => alterarStatusPagamento(mensalidade, e.target.checked)}
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

      {/* Modal de Adicionar Mensalidades/Mensalidade */}
      <AddInstallmentsModal
        isOpen={mostrarModalAdicionar}
        onClose={() => setMostrarModalAdicionar(false)}
        clientes={clientes}
        onSave={salvarMensalidades}
        onClienteAdicionado={carregarDados}
      />

      {/* Modal de Confirmação de Pagamento */}
      {/* Modal de Detalhes da Mensalidade */}
      {mostrarModalDetalhes && mensalidadeDetalhes && (
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
          zIndex: 1000
        }}>
          <div style={{
            backgroundColor: 'white',
            borderRadius: isSmallScreen ? 0 : '12px',
            width: isSmallScreen ? '100%' : '90%',
            maxWidth: isSmallScreen ? '100%' : '450px',
            height: isSmallScreen ? '100%' : 'auto',
            maxHeight: isSmallScreen ? '100%' : 'calc(100vh - 40px)',
            boxShadow: isSmallScreen ? 'none' : '0 4px 20px rgba(0, 0, 0, 0.15)',
            display: 'flex',
            flexDirection: 'column'
          }}>
            {/* Header */}
            <div style={{
              padding: '20px 24px',
              borderBottom: '1px solid #e8e8e8',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <h3 style={{ fontSize: '18px', fontWeight: '600', color: '#344848', margin: 0 }}>
                Detalhes da Mensalidade
              </h3>
              <button
                onClick={() => setMostrarModalDetalhes(false)}
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

            {/* Body */}
            <div style={{ padding: '24px', flex: 1, overflow: 'auto' }}>
              {/* Cliente */}
              <div style={{ marginBottom: '20px' }}>
                <p style={{ fontSize: '13px', color: '#999', marginBottom: '4px' }}>Cliente</p>
                <p style={{ fontSize: '16px', fontWeight: '600', color: '#333', margin: 0 }}>
                  {mensalidadeDetalhes.devedor?.nome || 'N/A'}
                </p>
              </div>

              {/* Grid de informações */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '20px' }}>
                {/* Valor */}
                <div>
                  <p style={{ fontSize: '13px', color: '#999', marginBottom: '4px' }}>Valor</p>
                  <p style={{ fontSize: '20px', fontWeight: '700', color: '#333', margin: 0 }}>
                    R$ {parseFloat(mensalidadeDetalhes.valor).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </p>
                </div>

                {/* Status */}
                <div>
                  <p style={{ fontSize: '13px', color: '#999', marginBottom: '4px' }}>Status</p>
                  {getStatusBadge(mensalidadeDetalhes.statusCalculado)}
                </div>

                {/* Vencimento */}
                <div>
                  <p style={{ fontSize: '13px', color: '#999', marginBottom: '4px' }}>Vencimento</p>
                  <p style={{ fontSize: '15px', fontWeight: '500', color: '#333', margin: 0 }}>
                    {new Date(mensalidadeDetalhes.data_vencimento + 'T00:00:00').toLocaleDateString('pt-BR')}
                  </p>
                </div>

                {/* Plano */}
                <div>
                  <p style={{ fontSize: '13px', color: '#999', marginBottom: '4px' }}>Plano</p>
                  <p style={{ fontSize: '15px', fontWeight: '500', color: '#333', margin: 0 }}>
                    {mensalidadeDetalhes.devedor?.plano?.nome || '-'}
                  </p>
                </div>

                {/* Data Pagamento (se pago) */}
                {mensalidadeDetalhes.data_pagamento && (
                  <div>
                    <p style={{ fontSize: '13px', color: '#999', marginBottom: '4px' }}>Data do Pagamento</p>
                    <p style={{ fontSize: '15px', fontWeight: '500', color: '#4CAF50', margin: 0 }}>
                      {new Date(mensalidadeDetalhes.data_pagamento + 'T00:00:00').toLocaleDateString('pt-BR')}
                    </p>
                  </div>
                )}

                {/* Forma Pagamento (se pago) */}
                {mensalidadeDetalhes.forma_pagamento && (
                  <div>
                    <p style={{ fontSize: '13px', color: '#999', marginBottom: '4px' }}>Forma de Pagamento</p>
                    <p style={{ fontSize: '15px', fontWeight: '500', color: '#333', margin: 0 }}>
                      {mensalidadeDetalhes.forma_pagamento}
                    </p>
                  </div>
                )}

                {/* Dias em Atraso (se atrasado) */}
                {mensalidadeDetalhes.statusCalculado === 'atrasado' && (() => {
                  const hoje = new Date()
                  hoje.setHours(0, 0, 0, 0)
                  const vencimento = new Date(mensalidadeDetalhes.data_vencimento + 'T00:00:00')
                  const diffTime = hoje.getTime() - vencimento.getTime()
                  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
                  return (
                    <div>
                      <p style={{ fontSize: '13px', color: '#999', marginBottom: '4px' }}>Dias em Atraso</p>
                      <p style={{ fontSize: '15px', fontWeight: '600', color: '#f44336', margin: 0 }}>
                        {diffDays} {diffDays === 1 ? 'dia' : 'dias'}
                      </p>
                    </div>
                  )
                })()}
              </div>
            </div>

            {/* Footer */}
            <div style={{
              padding: '16px 24px',
              borderTop: '1px solid #e8e8e8',
              display: 'flex',
              justifyContent: 'flex-end',
              gap: '12px'
            }}>
              <button
                onClick={() => setMostrarModalDetalhes(false)}
                style={{
                  padding: '10px 20px',
                  backgroundColor: 'white',
                  color: '#666',
                  border: '1px solid #ddd',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: '500'
                }}
              >
                Fechar
              </button>
              <button
                onClick={marcarPagoDoModal}
                style={{
                  padding: '10px 20px',
                  backgroundColor: mensalidadeDetalhes.status === 'pago' ? '#f44336' : '#4CAF50',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: '500',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}
              >
                <Icon icon={mensalidadeDetalhes.status === 'pago' ? 'mdi:close-circle' : 'mdi:check-circle'} width="18" />
                {mensalidadeDetalhes.status === 'pago' ? 'Desfazer Pagamento' : 'Marcar como Pago'}
              </button>
            </div>
          </div>
        </div>
      )}

      {mostrarModalConfirmacao && (
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
          zIndex: 1002
        }}>
          <div style={{
            backgroundColor: 'white',
            borderRadius: isSmallScreen ? 0 : '8px',
            width: isSmallScreen ? '100%' : '90%',
            maxWidth: isSmallScreen ? '100%' : '450px',
            height: isSmallScreen ? '100%' : 'auto',
            boxShadow: isSmallScreen ? 'none' : '0 4px 6px rgba(0, 0, 0, 0.1)',
            display: 'flex',
            flexDirection: 'column'
          }}>
            {/* Header */}
            <div style={{
              padding: '20px',
              borderBottom: '1px solid #e8e8e8',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <h3 style={{ fontSize: '18px', fontWeight: '600', color: '#344848', margin: 0 }}>
                {novoStatusPagamento ? 'Confirmar Pagamento' : 'Desfazer Pagamento'}
              </h3>
              <button
                onClick={() => {
                  setMostrarModalConfirmacao(false)
                  setMensalidadeParaAtualizar(null)
                  setFormaPagamento('')
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
            </div>

            {/* Body */}
            <div style={{ padding: '20px', flex: 1 }}>
              <p style={{ fontSize: '14px', color: '#666', margin: '0 0 16px 0', lineHeight: '1.5' }}>
                {novoStatusPagamento ? (
                  <>
                    Confirmar pagamento de <strong style={{ color: '#344848' }}>
                      R$ {mensalidadeParaAtualizar ? parseFloat(mensalidadeParaAtualizar.valor).toFixed(2) : '0.00'}
                    </strong>?
                  </>
                ) : (
                  'Tem certeza que deseja desfazer o pagamento desta mensalidade?'
                )}
              </p>

              {/* Campo de forma de pagamento - só aparece ao confirmar pagamento */}
              {novoStatusPagamento && (
                <div style={{ marginTop: '16px' }}>
                  <label style={{ display: 'block', marginBottom: '6px', fontSize: '14px', color: '#344848', fontWeight: '500' }}>
                    Forma de Pagamento *
                  </label>
                  <select
                    value={formaPagamento}
                    onChange={(e) => setFormaPagamento(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '10px',
                      fontSize: '16px',
                      border: '1px solid #ddd',
                      borderRadius: '4px',
                      backgroundColor: 'white',
                      color: '#344848',
                      cursor: 'pointer',
                      boxSizing: 'border-box'
                    }}
                  >
                    <option value="">Selecione a forma de pagamento</option>
                    <option value="Dinheiro">Dinheiro</option>
                    <option value="PIX">PIX</option>
                    <option value="Cartão de Crédito">Cartão de Crédito</option>
                    <option value="Cartão de Débito">Cartão de Débito</option>
                    <option value="Transferência Bancária">Transferência Bancária</option>
                    <option value="Boleto">Boleto</option>
                    <option value="Cheque">Cheque</option>
                    <option value="Outro">Outro</option>
                  </select>
                </div>
              )}
            </div>

            {/* Footer */}
            <div style={{
              padding: '16px 20px',
              borderTop: '1px solid #e8e8e8',
              display: 'flex',
              justifyContent: 'flex-end',
              gap: '10px'
            }}>
              <button
                onClick={() => {
                  setMostrarModalConfirmacao(false)
                  setMensalidadeParaAtualizar(null)
                  setFormaPagamento('')
                }}
                style={{
                  padding: '10px 20px',
                  backgroundColor: 'white',
                  color: '#666',
                  border: '1px solid #ddd',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: '500'
                }}
              >
                Cancelar
              </button>
              <button
                onClick={confirmarAlteracaoStatus}
                style={{
                  padding: '10px 20px',
                  backgroundColor: novoStatusPagamento ? '#4CAF50' : '#f44336',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: '500'
                }}
              >
                {novoStatusPagamento ? 'Confirmar' : 'Desfazer'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
