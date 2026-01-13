import { useState, useEffect } from 'react'
import { supabase } from './supabaseClient'
import { Icon } from '@iconify/react'
import AddInstallmentsModal from './AddInstallmentsModal'
import { showToast } from './Toast'
import whatsappService from './services/whatsappService'
import { exportarMensalidades } from './utils/exportUtils'

export default function Financeiro({ onAbrirPerfil, onSair }) {
  const [mensalidades, setMensalidades] = useState([])
  const [mensalidadesFiltradas, setMensalidadesFiltradas] = useState([])
  const [loading, setLoading] = useState(true)
  const [mostrarFiltros, setMostrarFiltros] = useState(false)
  const [filtroStatus, setFiltroStatus] = useState([])
  const [filtroVencimento, setFiltroVencimento] = useState(null)
  const [filtroDataInicio, setFiltroDataInicio] = useState('')
  const [filtroDataFim, setFiltroDataFim] = useState('')
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
    carregarMensalidades()
    carregarClientes()
    calcularMRR()
  }, [])

  useEffect(() => {
    aplicarFiltros()
  }, [mensalidades, filtroStatus, filtroVencimento, filtroDataInicio, filtroDataFim])

  const carregarMensalidades = async () => {
    setLoading(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()

      const { data, error } = await supabase
        .from('mensalidades')
        .select(`
          *,
          devedor:devedores(
            nome,
            plano:planos(nome)
          )
        `)
        .eq('user_id', user.id)
        .order('data_vencimento', { ascending: true })

      if (error) throw error

      const mensalidadesComStatus = data.map(p => ({
        ...p,
        statusCalculado: calcularStatus(p)
      }))

      setMensalidades(mensalidadesComStatus)
      calcularTotais(mensalidadesComStatus)
    } catch (error) {
      console.error('Erro ao carregar mensalidades:', error)
      showToast('Erro ao carregar mensalidades: ' + error.message, 'error')
    } finally {
      setLoading(false)
    }
  }

  const carregarClientes = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()

      const { data, error } = await supabase
        .from('devedores')
        .select('id, nome')
        .eq('user_id', user.id)
        .order('nome', { ascending: true })

      if (error) throw error

      setClientes(data || [])
    } catch (error) {
      console.error('Erro ao carregar clientes:', error)
    }
  }

  const salvarMensalidades = async (dataToSave) => {
    try {
      const { data: { user } } = await supabase.auth.getUser()

      // Criar mensalidades no banco de dados
      const mensalidadesParaInserir = dataToSave.mensalidades.map(mensalidade => {
        const mensalidadeBase = {
          user_id: user.id,
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
      carregarMensalidades()
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

  const calcularMRR = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()

      // Buscar assinaturas ativas com seus planos
      const { data: assinaturas, error } = await supabase
        .from('devedores')
        .select(`
          id,
          assinatura_ativa,
          plano:planos(valor)
        `)
        .eq('user_id', user.id)
        .eq('assinatura_ativa', true)
        .not('plano_id', 'is', null)

      if (error) throw error

      const ativas = assinaturas?.length || 0
      const mrrCalculado = assinaturas?.reduce((sum, assin) => {
        return sum + (parseFloat(assin.plano?.valor) || 0)
      }, 0) || 0

      setAssinaturasAtivas(ativas)
      setMrr(mrrCalculado)
    } catch (error) {
      console.error('Erro ao calcular MRR:', error)
    }
  }

  const aplicarFiltros = () => {
    let resultado = [...mensalidades]

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
        carregarMensalidades()
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
        carregarMensalidades() // Reload to update sent status
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
    setMostrarFiltros(false)
  }

  const toggleFiltroStatus = (status) => {
    if (filtroStatus.includes(status)) {
      setFiltroStatus(filtroStatus.filter(s => s !== status))
    } else {
      setFiltroStatus([...filtroStatus, status])
    }
  }

  const temFiltrosAtivos = filtroStatus.length > 0 || filtroVencimento !== null || filtroDataInicio !== '' || filtroDataFim !== ''

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
    <div style={{ flex: 1, padding: '25px 30px', backgroundColor: '#f5f5f5', minHeight: '100vh' }}>
      {/* Header - tudo em uma linha */}
      <div style={{
        backgroundColor: 'white',
        borderRadius: '8px',
        padding: '20px',
        marginBottom: '20px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.08)'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          {/* Título */}
          <div style={{ minWidth: '150px' }}>
            <h2 style={{ margin: 0, fontSize: '18px', fontWeight: '600', color: '#344848' }}>
              Mensalidades
            </h2>
            <p style={{ margin: '5px 0 0 0', fontSize: '14px', color: '#666' }}>
              {mensalidadesFiltradas.length} de {mensalidades.length} mensalidade(s)
            </p>
          </div>

          {/* Indicadores */}
          <div style={{
            display: 'flex',
            alignItems: 'stretch',
            gap: '16px',
            flex: 1,
            marginLeft: '40px'
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

          {/* Botões */}
          <div style={{ display: 'flex', gap: '8px', position: 'relative', marginLeft: '40px' }}>
            <button
              onClick={() => exportarMensalidades(mensalidadesFiltradas)}
              style={{
                padding: '10px 20px',
                backgroundColor: 'white',
                color: '#333',
                border: '1px solid #ddd',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: '500',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                transition: 'all 0.2s'
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
                padding: '10px 20px',
                backgroundColor: temFiltrosAtivos ? '#344848' : 'white',
                color: temFiltrosAtivos ? 'white' : '#333',
                border: temFiltrosAtivos ? 'none' : '1px solid #ddd',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: '500',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                position: 'relative',
                transition: 'all 0.2s'
              }}
              onMouseEnter={(e) => {
                if (!temFiltrosAtivos) e.currentTarget.style.backgroundColor = '#f5f5f5'
              }}
              onMouseLeave={(e) => {
                if (!temFiltrosAtivos) e.currentTarget.style.backgroundColor = 'white'
              }}
            >
              <Icon icon="mdi:filter-outline" width="18" height="18" />
              Filtrar
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
                padding: '10px 20px',
                backgroundColor: '#333',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: '500',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                transition: 'background-color 0.2s'
              }}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#222'}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#333'}
            >
              <Icon icon="mdi:plus" width="18" height="18" />
              Adicionar
            </button>

            {/* Popover de filtros */}
            {mostrarFiltros && (
              <div
                className="popover-filtros"
                style={{
                  position: 'absolute',
                  top: '50px',
                  right: '0',
                  width: '340px',
                  backgroundColor: 'white',
                  borderRadius: '8px',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                  border: '1px solid #e0e0e0',
                  zIndex: 1000,
                  overflow: 'hidden'
                }}
              >
                {/* Conteúdo do popover */}
                <div style={{ padding: '20px' }}>
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
                        fontSize: '14px',
                        backgroundColor: 'white',
                        cursor: 'pointer',
                        outline: 'none'
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
                          fontSize: '14px',
                          outline: 'none',
                          cursor: 'pointer'
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
                          fontSize: '14px',
                          outline: 'none',
                          cursor: 'pointer'
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

      {/* Tabela de Mensalidades */}
      <div style={{
        backgroundColor: 'white',
        borderRadius: '8px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
        overflow: 'hidden'
      }}>
        {mensalidadesFiltradas.length === 0 ? (
          <div style={{ padding: '60px 20px', textAlign: 'center' }}>
            <Icon icon="mdi:receipt-text-outline" width="64" height="64" style={{ color: '#ccc', marginBottom: '16px' }} />
            <p style={{ color: '#999', fontSize: '16px', margin: '0' }}>
              Nenhuma mensalidade encontrada
            </p>
            <p style={{ color: '#ccc', fontSize: '14px', margin: '8px 0 0 0' }}>
              Clique em "Adicionar" para criar mensalidades
            </p>
          </div>
        ) : (
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
                  <th style={{ padding: '12px 20px', textAlign: 'center', fontSize: '12px', fontWeight: '600', color: '#666', width: '15%' }}>
                    Ações
                  </th>
                </tr>
              </thead>
              <tbody>
                {mensalidadesFiltradas.map(mensalidade => (
                  <tr
                    key={mensalidade.id}
                    style={{ borderBottom: '1px solid #f0f0f0', transition: 'background-color 0.2s' }}
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
                    <td style={{ padding: '16px 20px', textAlign: 'center' }}>
                      <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', alignItems: 'center' }}>
                        <button
                          onClick={() => handleEnviarCobranca(mensalidade)}
                          disabled={mensalidade.status === 'pago' || mensalidade.statusCalculado === 'pago'}
                          style={{
                            padding: '8px',
                            backgroundColor: 'transparent',
                            border: 'none',
                            borderRadius: '6px',
                            cursor: (mensalidade.status === 'pago' || mensalidade.statusCalculado === 'pago') ? 'not-allowed' : 'pointer',
                            color: (mensalidade.status === 'pago' || mensalidade.statusCalculado === 'pago') ? '#ccc' : '#25D366',
                            display: 'flex',
                            alignItems: 'center',
                            transition: 'all 0.2s'
                          }}
                          title={(mensalidade.status === 'pago' || mensalidade.statusCalculado === 'pago') ? 'Já pago' : 'Enviar cobrança por WhatsApp'}
                          onMouseEnter={(e) => {
                            if (mensalidade.status !== 'pago' && mensalidade.statusCalculado !== 'pago') {
                              e.currentTarget.style.backgroundColor = '#e8f5e9'
                            }
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.backgroundColor = 'transparent'
                          }}
                        >
                          <Icon icon="mdi:whatsapp" width="20" />
                        </button>

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
        onClienteAdicionado={carregarClientes}
      />

      {/* Modal de Confirmação de Pagamento */}
      {mostrarModalConfirmacao && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000
        }}>
          <div style={{
            backgroundColor: 'white',
            borderRadius: '8px',
            width: '90%',
            maxWidth: '450px',
            boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)'
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
            <div style={{ padding: '20px' }}>
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
                      fontSize: '14px',
                      border: '1px solid #ddd',
                      borderRadius: '4px',
                      backgroundColor: 'white',
                      color: '#344848',
                      cursor: 'pointer'
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
