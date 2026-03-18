import { useState, useEffect, useCallback, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import { supabase } from './supabaseClient'
import { Icon } from '@iconify/react'
import { showToast } from './Toast'
import whatsappService from './services/whatsappService'
import { asaasService } from './services/asaasService'
import { exportarMensalidades } from './utils/exportUtils'
import useWindowSize from './hooks/useWindowSize'
import { useUser } from './contexts/UserContext'
import { SkeletonList, SkeletonTable, SkeletonCard } from './components/Skeleton'
import { baixarRecibo, imprimirRecibo } from './utils/pdfGenerator'
import { QRCodeSVG } from 'qrcode.react'
import { gerarPixCopiaCola, gerarTxId } from './services/pixService'
import Despesas from './Despesas'
import CobrancasAvulsas from './CobrancasAvulsas'
import ConfirmModal from './ConfirmModal'
import { validarCPF } from './utils/validators'
import DateInput from './components/DateInput'

export default function Financeiro({ onAbrirPerfil, onSair }) {
  const { isMobile, isTablet, isSmallScreen } = useWindowSize()
  const { userId, nomeEmpresa, chavePix, loading: loadingUser } = useUser()
  const [searchParams] = useSearchParams()
  const [mensalidades, setMensalidades] = useState([])
  const [mensalidadesFiltradas, setMensalidadesFiltradas] = useState([])
  const [loading, setLoading] = useState(true)
  const [mostrarFiltros, setMostrarFiltros] = useState(false)

  // Inicializa filtroStatus com o valor da URL, se existir
  const statusFromUrl = searchParams.get('status')
  const [filtroStatus, setFiltroStatus] = useState(statusFromUrl ? [statusFromUrl] : [])
  const [filtroVencimento, setFiltroVencimento] = useState(null)
  const [filtroDataInicio, setFiltroDataInicio] = useState('')
  const [filtroDataFim, setFiltroDataFim] = useState('')
  const [filtroNome, setFiltroNome] = useState('')
  const [filtroNomeDebounced, setFiltroNomeDebounced] = useState('')

  // Aba ativa do menu financeiro
  const [abaAtiva, setAbaAtiva] = useState('mensalidades')

  // Portal para botões das abas embarcadas + contagens
  const buttonsPortalRef = useRef(null)
  const [portalReady, setPortalReady] = useState(false)
  const [vendasCount, setVendasCount] = useState({ total: 0, filtered: 0 })
  const [despesasCount, setDespesasCount] = useState({ total: 0, filtered: 0 })

  const handleVendasCountUpdate = useCallback((t, f) => {
    setVendasCount(prev => (prev.total === t && prev.filtered === f) ? prev : { total: t, filtered: f })
  }, [])

  const handleDespesasCountUpdate = useCallback((t, f) => {
    setDespesasCount(prev => (prev.total === t && prev.filtered === f) ? prev : { total: t, filtered: f })
  }, [])

  // Debounce do filtro de nome (300ms)
  useEffect(() => {
    const timer = setTimeout(() => {
      setFiltroNomeDebounced(filtroNome)
    }, 300)
    return () => clearTimeout(timer)
  }, [filtroNome])

  // Modal de Detalhes da Mensalidade
  const [mostrarModalDetalhes, setMostrarModalDetalhes] = useState(false)
  const [mensalidadeDetalhes, setMensalidadeDetalhes] = useState(null)
  const [mostrarModalConfirmacao, setMostrarModalConfirmacao] = useState(false)
  const [mensalidadeParaAtualizar, setMensalidadeParaAtualizar] = useState(null)
  const [novoStatusPagamento, setNovoStatusPagamento] = useState(false)
  const [formaPagamento, setFormaPagamento] = useState('')

  // Paginação
  const [paginaAtual, setPaginaAtual] = useState(1)
  const itensPorPagina = 20

  // Modal de recibo após pagamento
  const [mostrarModalRecibo, setMostrarModalRecibo] = useState(false)
  const [mensalidadePaga, setMensalidadePaga] = useState(null)

  // Modal de Link de Pagamento PIX
  const [mostrarModalLinkPagamento, setMostrarModalLinkPagamento] = useState(false)
  const [linkPagamentoData, setLinkPagamentoData] = useState(null)
  const [gerandoLink, setGerandoLink] = useState(false)
  const [pixCopied, setPixCopied] = useState(false)
  const [linkCopied, setLinkCopied] = useState(false)

  // Modal de Boleto Asaas
  const [mostrarModalBoleto, setMostrarModalBoleto] = useState(false)
  const [boletoData, setBoletoData] = useState(null)
  const [gerandoBoleto, setGerandoBoleto] = useState(false)
  const [linhaDigitavelCopied, setLinhaDigitavelCopied] = useState(false)
  const [pixBoletoCopied, setPixBoletoCopied] = useState(false)
  const [asaasConfigurado, setAsaasConfigurado] = useState(false)
  const [modoIntegracao, setModoIntegracao] = useState('manual') // 'asaas' ou 'manual'

  // Modal para solicitar CPF do cliente
  const [mostrarModalCpf, setMostrarModalCpf] = useState(false)
  const [cpfInput, setCpfInput] = useState('')
  const [mensalidadeParaBoleto, setMensalidadeParaBoleto] = useState(null)
  const [salvandoCpf, setSalvandoCpf] = useState(false)

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

  // Estados para exclusão e desfazer pagamento
  const [confirmDeleteMensalidade, setConfirmDeleteMensalidade] = useState({ show: false, mensalidade: null })
  const [confirmDesfazerPagoMensalidade, setConfirmDesfazerPagoMensalidade] = useState({ show: false, mensalidade: null })

  useEffect(() => {
    if (userId) {
      carregarDados()
      // Verificar se Asaas está configurado
      asaasService.isConfigured().then(setAsaasConfigurado)
      // Carregar modo de integração
      supabase
        .from('usuarios')
        .select('modo_integracao')
        .eq('id', userId)
        .single()
        .then(({ data }) => {
          if (data?.modo_integracao) {
            setModoIntegracao(data.modo_integracao)
          }
        })
    }
  }, [userId])

  // Atualizar filtro quando a URL mudar (navegação da dashboard)
  useEffect(() => {
    const statusFromUrl = searchParams.get('status')
    if (statusFromUrl) {
      setFiltroStatus([statusFromUrl])
    }
  }, [searchParams])

  useEffect(() => {
    aplicarFiltros()
  }, [mensalidades, filtroStatus, filtroVencimento, filtroDataInicio, filtroDataFim, filtroNomeDebounced])

  // OTIMIZAÇÃO: Consolidar carregarMensalidades, carregarClientes e calcularMRR em uma única função
  const carregarDados = useCallback(async () => {
    if (!userId) return

    setLoading(true)
    try {
      // Executar todas as queries em paralelo
      const [
        { data: mensalidadesData, error: mensalidadesError },
        { data: clientesData, error: clientesError },
        { data: vendasData, error: vendasError }
      ] = await Promise.all([
        // 1. Mensalidades com dados do devedor e boleto (se existir)
        supabase
          .from('mensalidades')
          .select(`
            *,
            devedor:devedores(
              nome,
              telefone,
              cpf,
              plano:planos(nome)
            ),
            boletos(
              id,
              asaas_id,
              status,
              valor,
              data_vencimento,
              boleto_url,
              invoice_url,
              linha_digitavel,
              pix_qrcode_url,
              pix_copia_cola
            )
          `)
          .eq('user_id', userId)
          .or('lixo.is.null,lixo.eq.false')
          .order('data_vencimento', { ascending: true }),

        // 2. Clientes com assinaturas para MRR (consolidado, excluindo deletados)
        supabase
          .from('devedores')
          .select('id, nome, assinatura_ativa, plano:planos(valor)')
          .eq('user_id', userId)
          .or('lixo.is.null,lixo.eq.false')
          .order('nome', { ascending: true }),

        // 3. Vendas (cobranças avulsas) para incluir nos totais
        supabase
          .from('cobrancas_avulsas')
          .select('id, valor, data_vencimento, status, data_pagamento')
          .eq('user_id', userId)
          .or('lixo.is.null,lixo.eq.false')
      ])

      if (mensalidadesError) throw mensalidadesError
      if (clientesError) throw clientesError
      if (vendasError) throw vendasError

      // Processar mensalidades
      const mensalidadesComStatus = (mensalidadesData || []).map(p => ({
        ...p,
        statusCalculado: calcularStatus(p)
      }))

      setMensalidades(mensalidadesComStatus)
      calcularTotais(mensalidadesComStatus, vendasData || [])

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

  const calcularStatus = (mensalidade) => {
    if (mensalidade.status === 'pago') return 'pago'

    const hoje = new Date()
    hoje.setHours(0, 0, 0, 0)
    const vencimento = new Date(mensalidade.data_vencimento)
    vencimento.setHours(0, 0, 0, 0)

    if (vencimento < hoje) return 'atrasado'
    return 'aberto'
  }

  const calcularTotais = (lista, vendas = []) => {
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

    // Incluir vendas (cobranças avulsas) nos totais
    vendas.forEach(v => {
      const valor = parseFloat(v.valor) || 0
      const venc = new Date(v.data_vencimento)
      venc.setHours(0, 0, 0, 0)
      const diffDias = Math.ceil((venc - hoje) / (1000 * 60 * 60 * 24))

      if (v.status === 'pago') {
        recebido += valor
        qtdRecebido++
      } else if (v.status === 'pendente' && venc < hoje) {
        emAtraso += valor
        qtdAtraso++
      } else if (v.status === 'pendente') {
        emAberto += valor
        if (diffDias === 0) { qtdHoje++; totalProx += valor }
        if (diffDias >= 0 && diffDias <= 7) { qtd7Dias++ }
      }
    })

    const total = (lista.length + vendas.length) || 1
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

    // Filtro por nome do cliente (usando valor com debounce)
    if (filtroNomeDebounced.trim() !== '') {
      const termo = filtroNomeDebounced.toLowerCase()
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
    setPaginaAtual(1) // Resetar para primeira página quando filtros mudam
  }

  // Calcular dados de paginação
  const totalPaginas = Math.ceil(mensalidadesFiltradas.length / itensPorPagina)
  const indiceInicio = (paginaAtual - 1) * itensPorPagina
  const indiceFim = indiceInicio + itensPorPagina
  const mensalidadesPaginadas = mensalidadesFiltradas.slice(indiceInicio, indiceFim)

  /**
   * Cria automaticamente a próxima mensalidade quando a atual for paga
   * Apenas para mensalidades recorrentes (is_mensalidade = true)
   */
  const criarProximaMensalidade = async (mensalidadeAtual) => {
    try {
      // 1. Buscar dados completos do cliente
      const devedor = mensalidadeAtual.devedores

      if (!devedor) {
        console.error('Erro: devedor não encontrado na mensalidade')
        showToast('Erro ao criar próxima parcela: aluno não encontrado', 'error')
        return
      }

      // 2. Verificar se assinatura está ativa (condição principal para gerar próxima)
      if (!devedor.assinatura_ativa) {
        console.log('Assinatura inativa, não criar próxima mensalidade')
        return
      }

      // 3. Verificar se é mensalidade recorrente
      // Se assinatura está ativa mas is_mensalidade não está definido, assumir como recorrente
      const isRecorrente = mensalidadeAtual.is_mensalidade === true ||
                           (mensalidadeAtual.is_mensalidade == null && devedor.assinatura_ativa)

      if (!isRecorrente) {
        console.log('Mensalidade não é recorrente (is_mensalidade=false), pulando criação automática')
        return
      }

      // 4. Calcular próximo vencimento baseado no ciclo do plano
      const dataVencimentoAtual = new Date(mensalidadeAtual.data_vencimento + 'T00:00:00')
      const proximoVencimento = new Date(dataVencimentoAtual)

      // Buscar ciclo do plano do devedor
      let mesesParaAdicionar = 1 // padrão mensal
      if (devedor.plano?.ciclo_cobranca === 'trimestral') mesesParaAdicionar = 3
      else if (devedor.plano?.ciclo_cobranca === 'anual') mesesParaAdicionar = 12

      proximoVencimento.setMonth(proximoVencimento.getMonth() + mesesParaAdicionar)

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
        .select('*, devedores(nome, telefone, assinatura_ativa, plano:planos(valor, ciclo_cobranca))')
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
      setMostrarModalConfirmacao(false)
      setMensalidadeParaAtualizar(null)

      // 🆕 CRIAR PRÓXIMA MENSALIDADE AUTOMATICAMENTE (apenas se estiver marcando como pago)
      if (novoStatusPagamento && mensalidadeAtualizada) {
        // Enviar confirmação via WhatsApp ao cliente
        whatsappService.enviarConfirmacaoPagamento(mensalidadeParaAtualizar.id)
          .then(r => {
            if (r.sucesso) {
              showToast('Confirmação enviada via WhatsApp', 'success')
            } else {
              showToast('Não foi possível enviar confirmação via WhatsApp: ' + (r.erro || 'erro desconhecido'), 'warning')
            }
          })
          .catch((err) => {
            showToast('Falha ao enviar confirmação via WhatsApp', 'warning')
            console.error('Erro ao enviar confirmação WhatsApp:', err)
          })

        await criarProximaMensalidade(mensalidadeAtualizada)
        // Recarregar lista para mostrar nova mensalidade
        carregarDados()

        // Mostrar modal para gerar recibo
        setMensalidadePaga({
          ...mensalidadeAtualizada,
          forma_pagamento: formaPagamento,
          data_pagamento: updateData.data_pagamento
        })
        setMostrarModalRecibo(true)
      } else {
        showToast('Pagamento desfeito!', 'success')
      }

      setFormaPagamento('')
    } catch (error) {
      showToast('Erro ao atualizar: ' + error.message, 'error')
      setMostrarModalConfirmacao(false)
      setMensalidadeParaAtualizar(null)
      setFormaPagamento('')
    }
  }

  // Marcar como pago rapidamente (igual padrão Despesas)
  const handleMarcarPagoRapido = (mensalidade) => {
    if (mensalidade.status === 'pago') {
      // Se já está paga, pedir confirmação antes de desfazer
      setConfirmDesfazerPagoMensalidade({ show: true, mensalidade })
      return
    }
    // Se pendente, usa o fluxo existente (abre modal de forma de pagamento)
    alterarStatusPagamento(mensalidade, true)
  }

  // Confirmar desfazer pagamento
  const confirmarDesfazerPagoMensalidade = async () => {
    const mensalidade = confirmDesfazerPagoMensalidade.mensalidade
    if (!mensalidade) return

    try {
      const { error } = await supabase
        .from('mensalidades')
        .update({ status: 'pendente', data_pagamento: null, forma_pagamento: null })
        .eq('id', mensalidade.id)

      if (error) throw error

      showToast('Pagamento desfeito!', 'success')
      carregarDados()
    } catch (error) {
      showToast('Erro ao desfazer: ' + error.message, 'error')
    } finally {
      setConfirmDesfazerPagoMensalidade({ show: false, mensalidade: null })
    }
  }

  // Confirmar exclusão de mensalidade (soft delete)
  const confirmarExclusaoMensalidade = async () => {
    const mensalidade = confirmDeleteMensalidade.mensalidade
    if (!mensalidade) return

    try {
      const { error } = await supabase
        .from('mensalidades')
        .update({ lixo: true, deletado_em: new Date().toISOString() })
        .eq('id', mensalidade.id)

      if (error) throw error

      showToast('Mensalidade excluída!', 'success')
      carregarDados()
    } catch (error) {
      showToast('Erro ao excluir: ' + error.message, 'error')
    } finally {
      setConfirmDeleteMensalidade({ show: false, mensalidade: null })
    }
  }

  const handleGerarRecibo = async (tipo) => {
    if (!mensalidadePaga) return

    const dadosRecibo = {
      nomeCliente: mensalidadePaga.devedor?.nome || mensalidadePaga.devedores?.nome || 'Aluno',
      telefoneCliente: mensalidadePaga.devedor?.telefone || mensalidadePaga.devedores?.telefone || '',
      valor: mensalidadePaga.valor,
      dataVencimento: mensalidadePaga.data_vencimento,
      dataPagamento: mensalidadePaga.data_pagamento,
      formaPagamento: mensalidadePaga.forma_pagamento,
      nomeEmpresa: nomeEmpresa || 'Empresa',
      chavePix: chavePix || '',
      descricao: mensalidadePaga.is_mensalidade ? 'Mensalidade' : `Parcela ${mensalidadePaga.numero_mensalidade || 1}`
    }

    try {
      if (tipo === 'baixar') {
        await baixarRecibo(dadosRecibo)
        showToast('Recibo baixado com sucesso!', 'success')
      } else if (tipo === 'imprimir') {
        await imprimirRecibo(dadosRecibo)
      }
    } catch (error) {
      showToast('Erro ao gerar recibo: ' + error.message, 'error')
    }
  }

  // Função para gerar link de pagamento PIX
  const handleGerarLinkPagamento = async (mensalidade) => {
    if (!chavePix) {
      showToast('Configure sua chave PIX em Configurações antes de gerar links de pagamento.', 'error')
      return
    }

    if (mensalidade.status === 'pago') {
      showToast('Esta mensalidade já foi paga.', 'info')
      return
    }

    setGerandoLink(true)

    try {
      // Gerar token único
      const token = crypto.randomUUID().replace(/-/g, '').substring(0, 32)

      // Salvar link no banco com todos os dados necessários
      const { data: linkData, error: linkError } = await supabase
        .from('links_pagamento')
        .insert({
          user_id: userId,
          mensalidade_id: mensalidade.id,
          token: token,
          valor: mensalidade.valor,
          cliente_nome: mensalidade.devedor?.nome || 'Aluno',
          data_vencimento: mensalidade.data_vencimento,
          nome_empresa: nomeEmpresa || 'Empresa',
          chave_pix: chavePix
        })
        .select()
        .single()

      if (linkError) throw linkError

      // Gerar código PIX
      const codigoPix = gerarPixCopiaCola({
        chavePix: chavePix,
        valor: parseFloat(mensalidade.valor),
        nomeRecebedor: nomeEmpresa || 'Empresa',
        cidadeRecebedor: 'BRASIL',
        txid: gerarTxId(mensalidade.id),
        descricao: `Mensalidade ${mensalidade.devedor?.nome || ''}`
      })

      // Montar dados para o modal
      const baseUrl = window.location.origin
      setLinkPagamentoData({
        token: token,
        url: `${baseUrl}/pagar/${token}`,
        pixCode: codigoPix,
        valor: mensalidade.valor,
        cliente: mensalidade.devedor?.nome || 'Aluno',
        vencimento: mensalidade.data_vencimento
      })

      setMostrarModalLinkPagamento(true)
    } catch (error) {
      console.error('Erro ao gerar link:', error)
      showToast('Erro ao gerar link de pagamento: ' + error.message, 'error')
    } finally {
      setGerandoLink(false)
    }
  }

  const copiarPix = async () => {
    if (!linkPagamentoData?.pixCode) return
    try {
      await navigator.clipboard.writeText(linkPagamentoData.pixCode)
      setPixCopied(true)
      setTimeout(() => setPixCopied(false), 3000)
      showToast('Código PIX copiado!', 'success')
    } catch (error) {
      showToast('Erro ao copiar', 'error')
    }
  }

  const copiarLink = async () => {
    if (!linkPagamentoData?.url) return
    try {
      await navigator.clipboard.writeText(linkPagamentoData.url)
      setLinkCopied(true)
      setTimeout(() => setLinkCopied(false), 3000)
      showToast('Link copiado!', 'success')
    } catch (error) {
      showToast('Erro ao copiar', 'error')
    }
  }

  const [enviandoLinkWhatsApp, setEnviandoLinkWhatsApp] = useState(false)

  const enviarLinkWhatsApp = async () => {
    if (!linkPagamentoData || !mensalidadeDetalhes?.devedor?.telefone) {
      showToast('Telefone do aluno não encontrado', 'error')
      return
    }

    // Verificar se WhatsApp está conectado
    const status = await whatsappService.verificarStatus()
    if (!status.conectado) {
      showToast('WhatsApp não conectado. Conecte na aba WhatsApp primeiro.', 'error')
      return
    }

    setEnviandoLinkWhatsApp(true)

    try {
      const telefone = mensalidadeDetalhes.devedor.telefone
      const nomeCliente = mensalidadeDetalhes.devedor?.nome?.split(' ')[0] || 'Aluno'
      const valorFormatado = parseFloat(linkPagamentoData.valor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
      const vencimentoFormatado = new Date(linkPagamentoData.vencimento + 'T00:00:00').toLocaleDateString('pt-BR')

      let mensagem = `Olá, ${nomeCliente}! Tudo bem?\n\n`
      mensagem += `Segue o link para pagamento da sua fatura:\n\n`
      mensagem += `*Valor:* ${valorFormatado}\n`
      mensagem += `*Vencimento:* ${vencimentoFormatado}\n\n`
      mensagem += `Pague via PIX pelo link abaixo:\n\n`
      mensagem += `${linkPagamentoData.url}\n\n`
      mensagem += `Qualquer dúvida, estou à disposição!`

      const resultado = await whatsappService.enviarMensagem(telefone, mensagem)

      if (resultado.sucesso) {
        showToast('Link de pagamento enviado via WhatsApp!', 'success')
      } else {
        showToast('Erro ao enviar: ' + resultado.erro, 'error')
      }
    } catch (error) {
      console.error('Erro ao enviar link via WhatsApp:', error)
      showToast('Erro ao enviar: ' + error.message, 'error')
    } finally {
      setEnviandoLinkWhatsApp(false)
    }
  }

  // Função para formatar CPF
  const formatarCpf = (value) => {
    const numeros = value.replace(/\D/g, '').slice(0, 11)
    if (numeros.length <= 3) return numeros
    if (numeros.length <= 6) return numeros.replace(/(\d{3})(\d+)/, '$1.$2')
    if (numeros.length <= 9) return numeros.replace(/(\d{3})(\d{3})(\d+)/, '$1.$2.$3')
    return numeros.replace(/(\d{3})(\d{3})(\d{3})(\d+)/, '$1.$2.$3-$4')
  }

  // Função para gerar boleto com CPF já validado
  const gerarBoletoComCpf = async (mensalidade) => {
    setGerandoBoleto(true)

    try {
      const resultado = await asaasService.criarBolePix({
        mensalidadeId: mensalidade.id,
        devedorId: mensalidade.devedor_id,
        valor: mensalidade.valor,
        dataVencimento: mensalidade.data_vencimento,
        descricao: `Mensalidade - ${mensalidade.devedor?.nome || 'Aluno'}`
      })

      setBoletoData({
        ...resultado,
        cliente: mensalidade.devedor?.nome || 'Aluno',
        vencimento: mensalidade.data_vencimento
      })

      setMostrarModalBoleto(true)
      showToast('Boleto gerado com sucesso!', 'success')

      // Atualizar mensalidadeDetalhes com o boleto gerado
      if (mensalidadeDetalhes && mensalidadeDetalhes.id === mensalidade.id) {
        setMensalidadeDetalhes({
          ...mensalidadeDetalhes,
          boletos: [resultado]
        })
      }

      // Recarregar dados para atualizar a lista com o boleto gerado
      carregarDados()
    } catch (error) {
      console.error('Erro ao gerar boleto:', error)
      showToast('Erro ao gerar boleto: ' + error.message, 'error')
    } finally {
      setGerandoBoleto(false)
    }
  }

  // Função para salvar CPF e gerar boleto
  const handleSalvarCpfEGerarBoleto = async () => {
    if (!validarCPF(cpfInput)) {
      showToast('CPF inválido', 'error')
      return
    }

    setSalvandoCpf(true)
    try {
      // Salvar CPF no devedor
      const { error } = await supabase
        .from('devedores')
        .update({ cpf: formatarCpf(cpfInput) })
        .eq('id', mensalidadeParaBoleto.devedor_id)

      if (error) throw error

      // Atualizar dados locais
      const mensalidadeAtualizada = {
        ...mensalidadeParaBoleto,
        devedor: {
          ...mensalidadeParaBoleto.devedor,
          cpf: formatarCpf(cpfInput)
        }
      }

      // Fechar modal e gerar boleto
      setMostrarModalCpf(false)
      await gerarBoletoComCpf(mensalidadeAtualizada)

      // Recarregar dados para atualizar a lista
      carregarDados()
    } catch (error) {
      showToast('Erro ao salvar CPF: ' + error.message, 'error')
    } finally {
      setSalvandoCpf(false)
    }
  }

  // Função para gerar boleto via Asaas
  const handleGerarBoleto = async (mensalidade) => {
    if (modoIntegracao !== 'asaas') {
      showToast('Ative a integração Asaas em Configurações para gerar boletos.', 'error')
      return
    }

    if (!asaasConfigurado) {
      showToast('Configure sua API Key do Asaas em Configurações > Integrações.', 'error')
      return
    }

    if (mensalidade.status === 'pago') {
      showToast('Esta mensalidade já foi paga.', 'info')
      return
    }

    // Verificar se devedor tem CPF
    const cpfDevedor = mensalidade.devedor?.cpf?.replace(/\D/g, '') || ''
    if (!cpfDevedor || cpfDevedor.length < 11) {
      // Abrir modal para pedir CPF
      setMensalidadeParaBoleto(mensalidade)
      setCpfInput(mensalidade.devedor?.cpf || '')
      setMostrarModalCpf(true)
      return
    }

    // Se tem CPF, continuar normalmente
    await gerarBoletoComCpf(mensalidade)
  }

  const copiarLinhaDigitavel = async () => {
    if (!boletoData?.linha_digitavel) return
    try {
      await navigator.clipboard.writeText(boletoData.linha_digitavel)
      setLinhaDigitavelCopied(true)
      setTimeout(() => setLinhaDigitavelCopied(false), 3000)
      showToast('Linha digitável copiada!', 'success')
    } catch (error) {
      showToast('Erro ao copiar', 'error')
    }
  }

  const copiarPixBoleto = async () => {
    if (!boletoData?.pix_copia_cola) return
    try {
      await navigator.clipboard.writeText(boletoData.pix_copia_cola)
      setPixBoletoCopied(true)
      setTimeout(() => setPixBoletoCopied(false), 3000)
      showToast('Código PIX copiado!', 'success')
    } catch (error) {
      showToast('Erro ao copiar', 'error')
    }
  }

  const [enviandoBoletoWhatsApp, setEnviandoBoletoWhatsApp] = useState(false)

  const enviarBoletoWhatsApp = async () => {
    if (!boletoData || !mensalidadeDetalhes?.devedor?.telefone) {
      showToast('Telefone do aluno não encontrado', 'error')
      return
    }

    // Verificar se WhatsApp está conectado
    const status = await whatsappService.verificarStatus()
    if (!status.conectado) {
      showToast('WhatsApp não conectado. Conecte na aba WhatsApp primeiro.', 'error')
      return
    }

    setEnviandoBoletoWhatsApp(true)

    try {
      const telefone = mensalidadeDetalhes.devedor.telefone
      const nomeCliente = mensalidadeDetalhes.devedor?.nome?.split(' ')[0] || 'Aluno'
      const valorFormatado = parseFloat(boletoData.valor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
      const vencimentoFormatado = new Date(boletoData.data_vencimento + 'T00:00:00').toLocaleDateString('pt-BR')
      const linkPagamento = boletoData.invoice_url || boletoData.boleto_url

      // Montar mensagem completa
      let mensagem = `Olá, ${nomeCliente}! Tudo bem?\n\n`
      mensagem += `Segue o boleto para pagamento da sua fatura:\n\n`
      mensagem += `*Valor:* ${valorFormatado}\n`
      mensagem += `*Vencimento:* ${vencimentoFormatado}\n\n`

      if (linkPagamento) {
        mensagem += `Ou se preferir, pague via PIX pelo link abaixo:\n\n`
        mensagem += `${linkPagamento}\n\n`
      }

      mensagem += `Qualquer dúvida, estou à disposição!`

      // Enviar PDF do boleto com a mensagem como legenda
      if (boletoData.boleto_url) {
        const resultadoPdf = await whatsappService.enviarDocumento(
          telefone,
          boletoData.boleto_url,
          mensagem,
          `boleto-${vencimentoFormatado.replace(/\//g, '-')}.pdf`,
          'document'
        )

        if (resultadoPdf.sucesso) {
          showToast('Boleto enviado via WhatsApp!', 'success')
        } else {
          // Se falhar enviar PDF, tenta enviar só a mensagem de texto
          console.warn('Não foi possível enviar PDF, enviando mensagem de texto:', resultadoPdf.erro)
          const resultadoTexto = await whatsappService.enviarMensagem(telefone, mensagem)
          if (resultadoTexto.sucesso) {
            showToast('Mensagem enviada (sem PDF)', 'warning')
          } else {
            showToast('Erro ao enviar: ' + resultadoTexto.erro, 'error')
          }
        }
      } else {
        // Sem PDF, envia só mensagem de texto
        const resultado = await whatsappService.enviarMensagem(telefone, mensagem)
        if (resultado.sucesso) {
          showToast('Mensagem enviada via WhatsApp!', 'success')
        } else {
          showToast('Erro ao enviar: ' + resultado.erro, 'error')
        }
      }

    } catch (error) {
      console.error('Erro ao enviar boleto via WhatsApp:', error)
      showToast('Erro ao enviar boleto: ' + error.message, 'error')
    } finally {
      setEnviandoBoletoWhatsApp(false)
    }
  }

  // Função para visualizar boleto já existente
  const handleVisualizarBoleto = (mensalidade) => {
    // Pega o boleto mais recente (boletos é um array)
    const boleto = mensalidade.boletos?.[0]
    if (!boleto) {
      showToast('Boleto não encontrado', 'error')
      return
    }

    setBoletoData({
      ...boleto,
      cliente: mensalidade.devedor?.nome || 'Aluno',
      vencimento: boleto.data_vencimento
    })
    setMostrarModalBoleto(true)
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
      <div style={{ flex: 1, padding: isSmallScreen ? '16px' : '25px 30px', backgroundColor: '#ffffff', minHeight: '100vh' }}>
        {/* Cards skeleton */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: isSmallScreen ? '1fr' : 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '16px',
          marginBottom: '24px'
        }}>
          {Array.from({ length: 4 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
        {/* List/Table skeleton */}
        {isSmallScreen ? (
          <SkeletonList count={8} />
        ) : (
          <SkeletonTable rows={10} columns={6} />
        )}
      </div>
    )
  }

  return (
    <div style={{ flex: 1, padding: isSmallScreen ? '16px' : '25px 30px', backgroundColor: '#ffffff', minHeight: '100vh' }}>
      {/* Título dinâmico por aba */}
      <div style={{ marginBottom: isSmallScreen ? '16px' : '20px' }}>
        <h2 style={{ margin: 0, fontSize: isSmallScreen ? '16px' : '18px', fontWeight: '600', color: '#344848' }}>
          {abaAtiva === 'mensalidades' && 'Mensalidades'}
          {abaAtiva === 'avulsas' && 'Cobranças Avulsas'}
          {abaAtiva === 'despesas' && 'Despesas'}
        </h2>
        <p style={{ margin: '5px 0 0 0', fontSize: isSmallScreen ? '13px' : '14px', color: '#666' }}>
          {abaAtiva === 'mensalidades' && `${mensalidadesFiltradas.length} de ${mensalidades.length} mensalidade(s)`}
          {abaAtiva === 'avulsas' && `${vendasCount.filtered} de ${vendasCount.total} cobrança(s)`}
          {abaAtiva === 'despesas' && `${despesasCount.filtered} de ${despesasCount.total} despesa(s)`}
        </p>
      </div>

      {/* Menu de Abas + Botões */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', marginBottom: isSmallScreen ? '16px' : '24px', flexWrap: 'wrap' }}>
        {/* Tabs segmented control */}
        <div style={{
          display: 'inline-flex',
          gap: '4px',
          backgroundColor: '#f3f4f6',
          borderRadius: '10px',
          padding: '4px'
        }}>
          {[
            { id: 'mensalidades', label: 'Mensalidades', icon: 'fluent:receipt-20-regular' },
            { id: 'avulsas', label: 'Vendas', icon: 'mdi:cart-outline' },
            { id: 'despesas', label: 'Despesas', icon: 'mdi:wallet-outline' }
          ].map(aba => (
            <button
              key={aba.id}
              onClick={() => setAbaAtiva(aba.id)}
              style={{
                padding: isSmallScreen ? '8px 16px' : '8px 20px',
                backgroundColor: abaAtiva === aba.id ? 'white' : 'transparent',
                color: abaAtiva === aba.id ? '#1a1a1a' : '#555',
                border: 'none',
                borderRadius: '8px',
                cursor: 'pointer',
                fontSize: isSmallScreen ? '13px' : '14px',
                fontWeight: abaAtiva === aba.id ? '600' : '400',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                whiteSpace: 'nowrap',
                transition: 'all 0.2s',
                boxShadow: abaAtiva === aba.id ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                opacity: abaAtiva === aba.id ? 1 : 0.75
              }}
            >
              <Icon icon={aba.icon} width={isSmallScreen ? 16 : 18} />
              {aba.label}
            </button>
          ))}
        </div>

        {/* Busca + Botões (apenas aba Mensalidades) */}
        {abaAtiva === 'mensalidades' && (
          <div style={{ display: 'flex', gap: '8px', position: 'relative', justifyContent: isSmallScreen ? 'stretch' : 'flex-end', alignItems: 'center' }}>
            {/* Busca por nome */}
            <div style={{ position: 'relative', flex: isSmallScreen ? 1 : 'none' }}>
              <Icon icon="mdi:magnify" width="18" style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#999' }} />
              <input
                type="text"
                value={filtroNome}
                onChange={(e) => setFiltroNome(e.target.value)}
                placeholder="Buscar aluno..."
                style={{
                  width: isSmallScreen ? '100%' : '200px',
                  padding: '9px 32px 9px 34px',
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
                  style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', padding: '2px', display: 'flex', color: '#999' }}
                >
                  <Icon icon="mdi:close-circle" width="16" />
                </button>
              )}
            </div>

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
                    borderBottom: '1px solid #e5e7eb',
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
                        style={{
                          width: '100%', padding: '10px 12px', borderRadius: '6px',
                          border: '1px solid #ddd', fontSize: '16px', outline: 'none',
                          cursor: 'pointer', boxSizing: 'border-box'
                        }}
                      />
                      <div style={{ textAlign: 'center', color: '#999', fontSize: '12px', fontWeight: '500' }}>
                        até
                      </div>
                      <input
                        type="date"
                        value={filtroDataFim}
                        onChange={(e) => setFiltroDataFim(e.target.value)}
                        style={{
                          width: '100%', padding: '10px 12px', borderRadius: '6px',
                          border: '1px solid #ddd', fontSize: '16px', outline: 'none',
                          cursor: 'pointer', boxSizing: 'border-box'
                        }}
                      />
                    </div>
                  </div>
                </div>

                {/* Rodapé com botões */}
                <div style={{
                  borderTop: '1px solid #e0e0e0',
                  padding: '12px 20px',
                  backgroundColor: '#f9f9f9',
                  display: 'flex',
                  gap: '10px',
                  ...(isSmallScreen ? { position: 'sticky', bottom: 0, paddingBottom: '20px' } : {})
                }}>
                  <button
                    onClick={limparFiltros}
                    disabled={!temFiltrosAtivos}
                    style={{
                      flex: 1,
                      padding: '12px',
                      backgroundColor: 'white',
                      color: temFiltrosAtivos ? '#344848' : '#999',
                      border: '1px solid #ddd',
                      borderRadius: '8px',
                      cursor: temFiltrosAtivos ? 'pointer' : 'not-allowed',
                      fontSize: '14px',
                      fontWeight: '600',
                      transition: 'all 0.2s'
                    }}
                  >
                    Limpar
                  </button>
                  <button
                    onClick={() => setMostrarFiltros(false)}
                    style={{
                      flex: 2,
                      padding: '12px',
                      backgroundColor: '#344848',
                      color: 'white',
                      border: 'none',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      fontSize: '14px',
                      fontWeight: '600',
                      transition: 'all 0.2s'
                    }}
                  >
                    Aplicar Filtros
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Portal target para botões de Vendas/Despesas */}
        <div ref={(el) => { buttonsPortalRef.current = el; if (el && !portalReady) setPortalReady(true) }} style={{ display: 'contents' }} />
      </div>

      {/* ========== ABA: COBRANÇAS AVULSAS ========== */}
      {abaAtiva === 'avulsas' && <CobrancasAvulsas embedded buttonsPortal={buttonsPortalRef.current} onCountUpdate={handleVendasCountUpdate} />}

      {/* ========== ABA: DESPESAS ========== */}
      {abaAtiva === 'despesas' && <Despesas embedded buttonsPortal={buttonsPortalRef.current} onCountUpdate={handleDespesasCountUpdate} />}

      {/* ========== ABA: MENSALIDADES ========== */}
      {abaAtiva === 'mensalidades' && (<>
      {/* Cards de Indicadores - em seção separada */}
      <div style={{
        backgroundColor: 'white',
        borderRadius: '0',
        border: 'none',
        boxShadow: 'none',
        padding: isSmallScreen ? '0 0 16px 0' : '0 0 20px 0',
        marginBottom: 0
      }}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: isMobile ? '1fr' : isSmallScreen ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)',
          gap: isSmallScreen ? '12px' : '16px'
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
        </div>

      {/* Tabela/Cards de Mensalidades */}
      <div style={{
        backgroundColor: isSmallScreen ? 'transparent' : 'white',
        borderRadius: isSmallScreen ? 0 : '8px',
        border: isSmallScreen ? 'none' : '1px solid #e5e7eb',
        boxShadow: 'none',
        overflow: 'hidden',
        marginBottom: '40px'
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
            {mensalidadesPaginadas.map(mensalidade => (
              <div
                key={mensalidade.id}
                onClick={() => abrirDetalhesMensalidade(mensalidade)}
                style={{
                  backgroundColor: 'white',
                  borderRadius: '8px',
                  padding: '16px',
                  boxShadow: 'none',
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

                  {/* Ações rápidas */}
                  <div onClick={(e) => e.stopPropagation()} style={{ display: 'flex', gap: '8px' }}>
                    <button
                      onClick={() => handleMarcarPagoRapido(mensalidade)}
                      title={mensalidade.status === 'pago' ? 'Desfazer pagamento' : 'Marcar como pago'}
                      style={{
                        padding: '6px 10px',
                        backgroundColor: mensalidade.status === 'pago' ? '#e8f5e9' : '#f5f5f5',
                        color: mensalidade.status === 'pago' ? '#4CAF50' : '#666',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        fontSize: '12px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px'
                      }}
                    >
                      <Icon icon={mensalidade.status === 'pago' ? 'mdi:check-circle' : 'mdi:check-circle-outline'} width="16" height="16" />
                    </button>
                    <button
                      onClick={() => setConfirmDeleteMensalidade({ show: true, mensalidade })}
                      title="Excluir"
                      style={{
                        padding: '6px 10px',
                        backgroundColor: '#ffebee',
                        color: '#f44336',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center'
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
          /* Tabela para Desktop */
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ backgroundColor: '#f9f9f9', borderBottom: '1px solid #e5e7eb' }}>
                  <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: '#666' }}>
                    Aluno
                  </th>
                  <th style={{ padding: '12px 16px', textAlign: 'center', fontSize: '12px', fontWeight: '600', color: '#666' }}>
                    Vencimento
                  </th>
                  <th style={{ padding: '12px 16px', textAlign: 'center', fontSize: '12px', fontWeight: '600', color: '#666' }}>
                    Valor
                  </th>
                  <th style={{ padding: '12px 16px', textAlign: 'center', fontSize: '12px', fontWeight: '600', color: '#666' }}>
                    Plano
                  </th>
                  <th style={{ padding: '12px 16px', textAlign: 'center', fontSize: '12px', fontWeight: '600', color: '#666' }}>
                    Status
                  </th>
                  <th style={{ padding: '12px 16px', textAlign: 'center', fontSize: '12px', fontWeight: '600', color: '#666', whiteSpace: 'nowrap' }}>
                    Forma Pagamento
                  </th>
                  <th style={{ padding: '12px 16px', textAlign: 'center', fontSize: '12px', fontWeight: '600', color: '#666', whiteSpace: 'nowrap' }}>
                    Data Pagamento
                  </th>
                  <th style={{ padding: '12px 16px', textAlign: 'center', fontSize: '12px', fontWeight: '600', color: '#666' }}>
                    Ações
                  </th>
                </tr>
              </thead>
              <tbody>
                {mensalidadesPaginadas.map(mensalidade => (
                  <tr
                    key={mensalidade.id}
                    onClick={() => abrirDetalhesMensalidade(mensalidade)}
                    style={{ borderBottom: '1px solid #e5e7eb', transition: 'background-color 0.2s', cursor: 'pointer' }}
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
                    <td style={{ padding: '12px 16px', textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
                      <div style={{ display: 'flex', gap: '6px', justifyContent: 'center' }}>
                        <button
                          onClick={() => handleMarcarPagoRapido(mensalidade)}
                          title={mensalidade.status === 'pago' ? 'Desfazer pagamento' : 'Marcar como pago'}
                          style={{
                            padding: '6px 8px',
                            backgroundColor: mensalidade.status === 'pago' ? '#e8f5e9' : '#f5f5f5',
                            color: mensalidade.status === 'pago' ? '#4CAF50' : '#666',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            transition: 'all 0.2s'
                          }}
                        >
                          <Icon icon={mensalidade.status === 'pago' ? 'mdi:check-circle' : 'mdi:check-circle-outline'} width="18" height="18" />
                        </button>
                        <button
                          onClick={() => setConfirmDeleteMensalidade({ show: true, mensalidade })}
                          title="Excluir"
                          style={{
                            padding: '6px 8px',
                            backgroundColor: '#ffebee',
                            color: '#f44336',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            transition: 'all 0.2s'
                          }}
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

        {/* Paginação */}
        {totalPaginas > 1 && (
          <div style={{
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            gap: '8px',
            marginTop: '24px',
            marginBottom: '24px',
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
              {mensalidadesFiltradas.length} mensalidade{mensalidadesFiltradas.length !== 1 ? 's' : ''}
            </span>
          </div>
        )}
      </div>
      </>)}

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
              borderBottom: '1px solid #e5e7eb',
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
                <p style={{ fontSize: '13px', color: '#999', marginBottom: '4px' }}>Aluno</p>
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
              padding: '20px 24px',
              borderTop: '1px solid #e8e8e8',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px'
            }}>
              {/* Botões de ação principais - só aparece se não está pago */}
              {mensalidadeDetalhes.status !== 'pago' && (
                <div style={{ display: 'flex', gap: '10px' }}>
                  {/* Botão Link de Pagamento */}
                  <button
                    onClick={() => handleGerarLinkPagamento(mensalidadeDetalhes)}
                    disabled={gerandoLink}
                    style={{
                      flex: 1,
                      padding: '12px 16px',
                      backgroundColor: '#2196F3',
                      color: 'white',
                      border: 'none',
                      borderRadius: '8px',
                      cursor: gerandoLink ? 'wait' : 'pointer',
                      fontSize: '14px',
                      fontWeight: '600',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px',
                      opacity: gerandoLink ? 0.7 : 1
                    }}
                  >
                    <Icon icon={gerandoLink ? 'mdi:loading' : 'mdi:link-variant'} width="18" style={gerandoLink ? { animation: 'spin 1s linear infinite' } : {}} />
                    {gerandoLink ? 'Gerando...' : 'Link de Pagamento'}
                  </button>

                  {/* Botão Gerar/Visualizar Boleto - só aparece se modo é Asaas E está configurado */}
                  {modoIntegracao === 'asaas' && asaasConfigurado && (
                    mensalidadeDetalhes.boletos?.length > 0 ? (
                      <button
                        onClick={() => handleVisualizarBoleto(mensalidadeDetalhes)}
                        style={{
                          flex: 1,
                          padding: '12px 16px',
                          backgroundColor: '#FF9800',
                          color: 'white',
                          border: 'none',
                          borderRadius: '8px',
                          cursor: 'pointer',
                          fontSize: '14px',
                          fontWeight: '600',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '8px'
                        }}
                      >
                        <Icon icon="mdi:file-document-outline" width="18" />
                        Ver Boleto
                      </button>
                    ) : (
                      <button
                        onClick={() => handleGerarBoleto(mensalidadeDetalhes)}
                        disabled={gerandoBoleto}
                        style={{
                          flex: 1,
                          padding: '12px 16px',
                          backgroundColor: '#FF9800',
                          color: 'white',
                          border: 'none',
                          borderRadius: '8px',
                          cursor: gerandoBoleto ? 'wait' : 'pointer',
                          fontSize: '14px',
                          fontWeight: '600',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '8px',
                          opacity: gerandoBoleto ? 0.7 : 1
                        }}
                      >
                        <Icon icon={gerandoBoleto ? 'mdi:loading' : 'mdi:barcode'} width="18" style={gerandoBoleto ? { animation: 'spin 1s linear infinite' } : {}} />
                        {gerandoBoleto ? 'Gerando...' : 'Gerar Boleto'}
                      </button>
                    )
                  )}
                </div>
              )}

              {/* Botão principal de ação: Marcar como Pago / Desfazer */}
              <button
                onClick={marcarPagoDoModal}
                style={{
                  width: '100%',
                  padding: '14px 20px',
                  backgroundColor: mensalidadeDetalhes.status === 'pago' ? '#f44336' : '#4CAF50',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontSize: '15px',
                  fontWeight: '600',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px'
                }}
              >
                <Icon icon={mensalidadeDetalhes.status === 'pago' ? 'mdi:undo' : 'mdi:check-circle'} width="20" />
                {mensalidadeDetalhes.status === 'pago' ? 'Desfazer Pagamento' : 'Marcar como Pago'}
              </button>

              {/* Botão Fechar - secundário */}
              <button
                onClick={() => setMostrarModalDetalhes(false)}
                style={{
                  width: '100%',
                  padding: '12px 20px',
                  backgroundColor: 'transparent',
                  color: '#666',
                  border: '1px solid #ddd',
                  borderRadius: '8px',
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
              borderBottom: '1px solid #e5e7eb',
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

      {/* Modal de Sucesso de Pagamento com Opção de Recibo */}
      {mostrarModalRecibo && mensalidadePaga && (
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
          zIndex: 1000,
          padding: '20px'
        }}>
          <div style={{
            backgroundColor: 'white',
            borderRadius: '12px',
            padding: '24px',
            width: '100%',
            maxWidth: '400px',
            textAlign: 'center'
          }}>
            {/* Ícone de sucesso */}
            <div style={{
              width: '64px',
              height: '64px',
              borderRadius: '50%',
              backgroundColor: '#e8f5e9',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 16px'
            }}>
              <Icon icon="mdi:check-circle" width="40" height="40" style={{ color: '#4CAF50' }} />
            </div>

            <h3 style={{ margin: '0 0 8px 0', fontSize: '18px', fontWeight: '600', color: '#344848' }}>
              Pagamento Confirmado!
            </h3>

            <p style={{ margin: '0 0 20px 0', fontSize: '14px', color: '#666' }}>
              {mensalidadePaga.devedor?.nome || mensalidadePaga.devedores?.nome || 'Aluno'} -{' '}
              <strong>
                R$ {parseFloat(mensalidadePaga.valor || 0).toLocaleString('pt-BR', {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2
                })}
              </strong>
            </p>

            <p style={{ margin: '0 0 20px 0', fontSize: '13px', color: '#888' }}>
              Deseja gerar o recibo de pagamento?
            </p>

            <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap' }}>
              <button
                onClick={() => handleGerarRecibo('baixar')}
                style={{
                  padding: '10px 20px',
                  backgroundColor: '#344848',
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
                <Icon icon="mdi:download" width="18" />
                Baixar Recibo
              </button>

              <button
                onClick={() => handleGerarRecibo('imprimir')}
                style={{
                  padding: '10px 20px',
                  backgroundColor: 'white',
                  color: '#344848',
                  border: '1px solid #344848',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: '500',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}
              >
                <Icon icon="mdi:printer" width="18" />
                Imprimir
              </button>
            </div>

            <button
              onClick={() => {
                setMostrarModalRecibo(false)
                setMensalidadePaga(null)
              }}
              style={{
                marginTop: '16px',
                padding: '8px 16px',
                backgroundColor: 'transparent',
                color: '#666',
                border: 'none',
                cursor: 'pointer',
                fontSize: '13px'
              }}
            >
              Fechar
            </button>
          </div>
        </div>
      )}

      {/* Modal de Link de Pagamento PIX */}
      {mostrarModalLinkPagamento && linkPagamentoData && (
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
          zIndex: 1003,
          padding: '20px'
        }}>
          <style>{`
            @keyframes spin {
              from { transform: rotate(0deg); }
              to { transform: rotate(360deg); }
            }
          `}</style>
          <div style={{
            backgroundColor: 'white',
            borderRadius: '16px',
            width: '100%',
            maxWidth: '420px',
            maxHeight: '90vh',
            overflow: 'auto'
          }}>
            {/* Header */}
            <div style={{
              backgroundColor: '#344848',
              borderRadius: '16px 16px 0 0',
              padding: '20px',
              textAlign: 'center',
              color: 'white'
            }}>
              <Icon icon="mdi:qrcode" width="36" height="36" />
              <h2 style={{ margin: '8px 0 0', fontSize: '18px', fontWeight: '600' }}>
                Link de Pagamento
              </h2>
            </div>

            {/* Detalhes */}
            <div style={{ padding: '20px', borderBottom: '1px solid #e5e7eb' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
                <span style={{ color: '#888', fontSize: '14px' }}>Aluno</span>
                <span style={{ fontWeight: '500', color: '#333' }}>{linkPagamentoData.cliente}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
                <span style={{ color: '#888', fontSize: '14px' }}>Valor</span>
                <span style={{ fontWeight: '600', color: '#4CAF50', fontSize: '18px' }}>
                  R$ {parseFloat(linkPagamentoData.valor).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#888', fontSize: '14px' }}>Vencimento</span>
                <span style={{ fontWeight: '500', color: '#333' }}>
                  {new Date(linkPagamentoData.vencimento + 'T00:00:00').toLocaleDateString('pt-BR')}
                </span>
              </div>
            </div>

            {/* QR Code */}
            <div style={{ padding: '20px', textAlign: 'center' }}>
              <p style={{ margin: '0 0 16px', fontSize: '14px', color: '#666' }}>
                QR Code PIX
              </p>
              <div style={{
                display: 'inline-block',
                padding: '16px',
                backgroundColor: 'white',
                borderRadius: '12px',
                border: '2px solid #eee'
              }}>
                <QRCodeSVG
                  value={linkPagamentoData.pixCode}
                  size={180}
                  level="M"
                  includeMargin={false}
                />
              </div>
            </div>

            {/* Ações */}
            <div style={{ padding: '0 20px 20px' }}>
              {/* Copiar Link */}
              <button
                onClick={copiarLink}
                style={{
                  width: '100%',
                  padding: '14px',
                  backgroundColor: linkCopied ? '#4CAF50' : '#2196F3',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '14px',
                  fontWeight: '600',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  marginBottom: '10px'
                }}
              >
                <Icon icon={linkCopied ? 'mdi:check' : 'mdi:link'} width="20" />
                {linkCopied ? 'Link Copiado!' : 'Copiar Link de Pagamento'}
              </button>

              {/* Copiar PIX */}
              <button
                onClick={copiarPix}
                style={{
                  width: '100%',
                  padding: '14px',
                  backgroundColor: pixCopied ? '#4CAF50' : '#344848',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '14px',
                  fontWeight: '600',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  marginBottom: '10px'
                }}
              >
                <Icon icon={pixCopied ? 'mdi:check' : 'mdi:content-copy'} width="20" />
                {pixCopied ? 'PIX Copiado!' : 'Copiar Código PIX'}
              </button>

              {/* Enviar via WhatsApp */}
              <button
                onClick={enviarLinkWhatsApp}
                disabled={enviandoLinkWhatsApp}
                style={{
                  width: '100%',
                  padding: '14px',
                  backgroundColor: enviandoLinkWhatsApp ? '#1a9b4a' : '#25D366',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '14px',
                  fontWeight: '600',
                  cursor: enviandoLinkWhatsApp ? 'wait' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  opacity: enviandoLinkWhatsApp ? 0.8 : 1
                }}
              >
                <Icon icon={enviandoLinkWhatsApp ? 'mdi:loading' : 'mdi:whatsapp'} width="20" style={enviandoLinkWhatsApp ? { animation: 'spin 1s linear infinite' } : {}} />
                {enviandoLinkWhatsApp ? 'Enviando...' : 'Enviar via WhatsApp'}
              </button>
            </div>

            {/* Link URL */}
            <div style={{ padding: '0 20px 16px' }}>
              <div style={{
                padding: '10px 12px',
                backgroundColor: '#f5f5f5',
                borderRadius: '6px',
                fontSize: '11px',
                color: '#666',
                wordBreak: 'break-all',
                fontFamily: 'monospace'
              }}>
                {linkPagamentoData.url}
              </div>
            </div>

            {/* Fechar */}
            <div style={{ padding: '0 20px 20px', textAlign: 'center' }}>
              <button
                onClick={() => {
                  setMostrarModalLinkPagamento(false)
                  setLinkPagamentoData(null)
                  setPixCopied(false)
                  setLinkCopied(false)
                }}
                style={{
                  padding: '10px 24px',
                  backgroundColor: 'transparent',
                  color: '#666',
                  border: '1px solid #ddd',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '14px'
                }}
              >
                Fechar
              </button>
            </div>

            {/* Aviso */}
            <div style={{
              padding: '12px 20px',
              backgroundColor: '#fff8e1',
              borderRadius: '0 0 16px 16px',
              textAlign: 'center'
            }}>
              <p style={{ margin: 0, fontSize: '12px', color: '#f57c00' }}>
                <Icon icon="mdi:clock-outline" width="14" style={{ verticalAlign: 'middle', marginRight: '4px' }} />
                Link válido por 24 horas
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Boleto Asaas */}
      {mostrarModalBoleto && boletoData && (
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
          zIndex: 1003,
          padding: '20px'
        }}>
          <div style={{
            backgroundColor: 'white',
            borderRadius: '16px',
            width: '100%',
            maxWidth: '500px',
            maxHeight: '90vh',
            overflow: 'auto',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)'
          }}>
            {/* Header */}
            <div style={{
              padding: '20px',
              borderBottom: '1px solid #e5e7eb',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{
                  width: '40px',
                  height: '40px',
                  backgroundColor: '#fff3e0',
                  borderRadius: '10px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}>
                  <Icon icon="mdi:barcode" width="24" height="24" style={{ color: '#FF9800' }} />
                </div>
                <div>
                  <h3 style={{ fontSize: '18px', fontWeight: '600', color: '#344848', margin: 0 }}>
                    Boleto Gerado
                  </h3>
                  <p style={{ fontSize: '13px', color: '#888', margin: 0 }}>
                    {boletoData.cliente}
                  </p>
                </div>
              </div>
              <button
                onClick={() => {
                  setMostrarModalBoleto(false)
                  setBoletoData(null)
                  setLinhaDigitavelCopied(false)
                  setPixBoletoCopied(false)
                }}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  padding: '4px'
                }}
              >
                <Icon icon="mdi:close" width="24" height="24" style={{ color: '#666' }} />
              </button>
            </div>

            {/* Body */}
            <div style={{ padding: '20px' }}>
              {/* Valor e Vencimento */}
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                marginBottom: '20px',
                padding: '16px',
                backgroundColor: '#f8f9fa',
                borderRadius: '12px'
              }}>
                <div>
                  <p style={{ fontSize: '12px', color: '#888', margin: '0 0 4px 0' }}>Valor</p>
                  <p style={{ fontSize: '24px', fontWeight: '700', color: '#344848', margin: 0 }}>
                    R$ {parseFloat(boletoData.valor).toFixed(2)}
                  </p>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <p style={{ fontSize: '12px', color: '#888', margin: '0 0 4px 0' }}>Vencimento</p>
                  <p style={{ fontSize: '16px', fontWeight: '600', color: '#344848', margin: 0 }}>
                    {new Date(boletoData.data_vencimento + 'T00:00:00').toLocaleDateString('pt-BR')}
                  </p>
                </div>
              </div>

              {/* Linha Digitável */}
              {boletoData.linha_digitavel && (
                <div style={{ marginBottom: '16px' }}>
                  <p style={{ fontSize: '14px', fontWeight: '600', color: '#344848', margin: '0 0 8px 0' }}>
                    <Icon icon="mdi:barcode" width="16" style={{ verticalAlign: 'middle', marginRight: '6px' }} />
                    Linha Digitável
                  </p>
                  <div style={{
                    padding: '12px',
                    backgroundColor: '#f5f5f5',
                    borderRadius: '8px',
                    fontFamily: 'monospace',
                    fontSize: '13px',
                    wordBreak: 'break-all',
                    color: '#333'
                  }}>
                    {boletoData.linha_digitavel}
                  </div>
                  <button
                    onClick={copiarLinhaDigitavel}
                    style={{
                      width: '100%',
                      marginTop: '8px',
                      padding: '12px',
                      backgroundColor: linhaDigitavelCopied ? '#4CAF50' : '#FF9800',
                      color: 'white',
                      border: 'none',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      fontSize: '14px',
                      fontWeight: '500',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px'
                    }}
                  >
                    <Icon icon={linhaDigitavelCopied ? 'mdi:check' : 'mdi:content-copy'} width="18" />
                    {linhaDigitavelCopied ? 'Copiado!' : 'Copiar Linha Digitável'}
                  </button>
                </div>
              )}

              {/* PIX (BolePix) */}
              {boletoData.pix_copia_cola && (
                <div style={{ marginBottom: '16px' }}>
                  <p style={{ fontSize: '14px', fontWeight: '600', color: '#344848', margin: '0 0 8px 0' }}>
                    <Icon icon="mdi:qrcode" width="16" style={{ verticalAlign: 'middle', marginRight: '6px' }} />
                    Pague via PIX
                  </p>

                  {/* QR Code */}
                  {boletoData.pix_qrcode_base64 && (
                    <div style={{
                      display: 'flex',
                      justifyContent: 'center',
                      marginBottom: '12px'
                    }}>
                      <img
                        src={`data:image/png;base64,${boletoData.pix_qrcode_base64}`}
                        alt="QR Code PIX"
                        style={{ width: '180px', height: '180px' }}
                      />
                    </div>
                  )}

                  <button
                    onClick={copiarPixBoleto}
                    style={{
                      width: '100%',
                      padding: '12px',
                      backgroundColor: pixBoletoCopied ? '#4CAF50' : '#00C853',
                      color: 'white',
                      border: 'none',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      fontSize: '14px',
                      fontWeight: '500',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px'
                    }}
                  >
                    <Icon icon={pixBoletoCopied ? 'mdi:check' : 'mdi:content-copy'} width="18" />
                    {pixBoletoCopied ? 'Copiado!' : 'Copiar Código PIX'}
                  </button>
                </div>
              )}

              {/* Link do Boleto PDF */}
              {(boletoData.boleto_url || boletoData.invoice_url) && (
                <div style={{ marginBottom: '16px' }}>
                  <a
                    href={boletoData.boleto_url || boletoData.invoice_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px',
                      padding: '12px',
                      backgroundColor: '#f5f5f5',
                      color: '#344848',
                      borderRadius: '8px',
                      textDecoration: 'none',
                      fontSize: '14px',
                      fontWeight: '500'
                    }}
                  >
                    <Icon icon="mdi:file-pdf-box" width="20" />
                    Visualizar/Baixar Boleto PDF
                  </a>
                </div>
              )}

              {/* Botão Enviar WhatsApp */}
              <button
                onClick={enviarBoletoWhatsApp}
                disabled={enviandoBoletoWhatsApp}
                style={{
                  width: '100%',
                  padding: '14px',
                  backgroundColor: enviandoBoletoWhatsApp ? '#1a9b4a' : '#25d366',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: enviandoBoletoWhatsApp ? 'wait' : 'pointer',
                  fontSize: '14px',
                  fontWeight: '600',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  opacity: enviandoBoletoWhatsApp ? 0.8 : 1
                }}
              >
                <Icon
                  icon={enviandoBoletoWhatsApp ? 'mdi:loading' : 'mdi:whatsapp'}
                  width="20"
                  style={enviandoBoletoWhatsApp ? { animation: 'spin 1s linear infinite' } : {}}
                />
                {enviandoBoletoWhatsApp ? 'Enviando...' : 'Enviar via WhatsApp'}
              </button>
            </div>

            {/* Footer */}
            <div style={{
              padding: '16px 20px',
              borderTop: '1px solid #e8e8e8',
              display: 'flex',
              justifyContent: 'center'
            }}>
              <button
                onClick={() => {
                  setMostrarModalBoleto(false)
                  setBoletoData(null)
                  setLinhaDigitavelCopied(false)
                  setPixBoletoCopied(false)
                }}
                style={{
                  padding: '10px 24px',
                  backgroundColor: 'transparent',
                  color: '#666',
                  border: '1px solid #ddd',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '14px'
                }}
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal para solicitar CPF */}
      {mostrarModalCpf && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 1004,
          padding: '20px'
        }}>
          <div style={{
            background: 'white',
            borderRadius: '16px',
            padding: '24px',
            maxWidth: '400px',
            width: '90%',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
              <div style={{
                width: '40px',
                height: '40px',
                backgroundColor: '#fff3e0',
                borderRadius: '10px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                <Icon icon="mdi:card-account-details" width="24" height="24" style={{ color: '#FF9800' }} />
              </div>
              <h3 style={{ fontSize: '18px', fontWeight: '600', color: '#344848', margin: 0 }}>
                CPF necessário
              </h3>
            </div>
            <p style={{ color: '#666', marginBottom: '16px', fontSize: '14px', lineHeight: '1.5' }}>
              O Asaas exige o CPF do aluno para emitir boletos.
              Informe o CPF de <strong style={{ color: '#344848' }}>{mensalidadeParaBoleto?.devedor?.nome}</strong>:
            </p>
            <input
              type="text"
              value={cpfInput}
              onChange={(e) => setCpfInput(formatarCpf(e.target.value))}
              placeholder="000.000.000-00"
              maxLength="14"
              style={{
                width: '100%',
                padding: '14px',
                borderRadius: '8px',
                border: '1px solid #ddd',
                background: '#f8f9fa',
                color: '#344848',
                fontSize: '16px',
                marginBottom: '20px',
                boxSizing: 'border-box',
                outline: 'none'
              }}
              onFocus={(e) => e.target.style.borderColor = '#FF9800'}
              onBlur={(e) => e.target.style.borderColor = '#ddd'}
            />
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button
                onClick={() => {
                  setMostrarModalCpf(false)
                  setCpfInput('')
                  setMensalidadeParaBoleto(null)
                }}
                style={{
                  padding: '12px 20px',
                  borderRadius: '8px',
                  background: 'transparent',
                  color: '#666',
                  border: '1px solid #ddd',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: '500'
                }}
              >
                Cancelar
              </button>
              <button
                onClick={handleSalvarCpfEGerarBoleto}
                disabled={salvandoCpf || cpfInput.replace(/\D/g, '').length < 11}
                style={{
                  padding: '12px 20px',
                  borderRadius: '8px',
                  background: '#FF9800',
                  color: 'white',
                  border: 'none',
                  cursor: (salvandoCpf || cpfInput.replace(/\D/g, '').length < 11) ? 'not-allowed' : 'pointer',
                  fontSize: '14px',
                  fontWeight: '600',
                  opacity: (salvandoCpf || cpfInput.replace(/\D/g, '').length < 11) ? 0.6 : 1,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}
              >
                {salvandoCpf && <Icon icon="mdi:loading" width="18" style={{ animation: 'spin 1s linear infinite' }} />}
                {salvandoCpf ? 'Salvando...' : 'Salvar e Gerar Boleto'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Confirmar Exclusão de Mensalidade */}
      <ConfirmModal
        isOpen={confirmDeleteMensalidade.show}
        onClose={() => setConfirmDeleteMensalidade({ show: false, mensalidade: null })}
        onConfirm={confirmarExclusaoMensalidade}
        title="Excluir mensalidade"
        message={`Tem certeza que deseja excluir a mensalidade de ${confirmDeleteMensalidade.mensalidade?.devedor?.nome || 'N/A'}?\n\nValor: R$ ${parseFloat(confirmDeleteMensalidade.mensalidade?.valor || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}\nVencimento: ${confirmDeleteMensalidade.mensalidade?.data_vencimento ? new Date(confirmDeleteMensalidade.mensalidade.data_vencimento + 'T00:00:00').toLocaleDateString('pt-BR') : '-'}`}
        confirmText="Excluir"
        cancelText="Cancelar"
        type="danger"
      />

      {/* Modal Desfazer Pagamento */}
      <ConfirmModal
        isOpen={confirmDesfazerPagoMensalidade.show}
        onClose={() => setConfirmDesfazerPagoMensalidade({ show: false, mensalidade: null })}
        onConfirm={confirmarDesfazerPagoMensalidade}
        title="Desfazer pagamento"
        message={`Deseja desfazer o pagamento da mensalidade de ${confirmDesfazerPagoMensalidade.mensalidade?.devedor?.nome || 'N/A'}?\n\nO status voltará para pendente.`}
        confirmText="Desfazer"
        cancelText="Cancelar"
        type="warning"
      />
    </div>
  )
}
