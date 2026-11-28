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
import { baixarRecibo, imprimirRecibo, gerarReciboBlob } from './utils/pdfGenerator'
import { resolverDestinatario } from './utils/destinatario'
import { calcularMultaJuros, valorEfetivoMensalidade, resumoValorEfetivo, corValorEfetivo } from './utils/multaJuros'
import { hojeISO } from './utils/dataLocal'
import { QRCodeSVG } from 'qrcode.react'
import { gerarPixCopiaCola, gerarTxId } from './services/pixService'
import Despesas from './Despesas'
import CobrancasAvulsas from './CobrancasAvulsas'
import ConfirmModal from './ConfirmModal'
import { validarCPF } from './utils/validators'
import DateInput from './components/DateInput'
import SearchInput from './design-system/components/SearchInput'
import Button from './design-system/components/Button'
import Select from './design-system/components/Select'
import Dropdown from './design-system/components/Dropdown'
import Table from './design-system/components/Table'
import Card from './design-system/components/Card'
import Checkbox from './design-system/components/Checkbox'
import Tabs from './design-system/components/Tabs'
import StatCard from './design-system/components/StatCard'
import Badge from './design-system/components/Badge'
import EmptyState from './design-system/components/EmptyState'
import Modal from './design-system/components/Modal'
import Input from './design-system/components/Input'
import DateField from './components/DateField'
import buscarTodas from './utils/buscarTodas'

// Gravadas como texto em mensalidades.forma_pagamento — não renomear sem migrar os dados
const FORMAS_PAGAMENTO_BAIXA = ['Dinheiro', 'PIX', 'Cartão de Crédito', 'Cartão de Débito', 'Transferência Bancária', 'Boleto', 'Cheque', 'Outro']

const formatarMoeda = (valor) =>
  `R$ ${(parseFloat(valor) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

const formatarData = (data) =>
  data ? new Date(data + 'T00:00:00').toLocaleDateString('pt-BR') : '-'

const formatarMesAno = (data) =>
  data ? new Date(data + 'T00:00:00').toLocaleDateString('pt-BR', { month: '2-digit', year: 'numeric' }) : '-'

/**
 * Próximo vencimento a partir de uma data, respeitando o ciclo do plano.
 * Se o dia não existir no mês alvo (31/01 → fevereiro), cai no último dia do mês.
 */
const calcularProximoVencimento = (dataVencimento, cicloCobranca) => {
  const meses = { trimestral: 3, semestral: 6, anual: 12 }[cicloCobranca] || 1
  const atual = new Date(dataVencimento + 'T00:00:00')
  const proximo = new Date(atual)
  proximo.setMonth(proximo.getMonth() + meses)
  if (proximo.getDate() !== atual.getDate()) proximo.setDate(0)
  // Formatação manual: toISOString() converte pra UTC e pode voltar um dia
  const mes = String(proximo.getMonth() + 1).padStart(2, '0')
  const dia = String(proximo.getDate()).padStart(2, '0')
  return `${proximo.getFullYear()}-${mes}-${dia}`
}

// Linha "rótulo → valor" pra resumos/detalhes
function InfoRow({ label, value, valueColor, isFirst, big }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px',
      padding: big ? '12px 0' : '9px 0', borderTop: isFirst ? 'none' : '1px solid #f1f5f9'
    }}>
      <span style={{ fontSize: big ? '14px' : '13px', color: '#64748b' }}>{label}</span>
      <span style={{ fontSize: big ? '18px' : '14px', fontWeight: 700, color: valueColor || '#1e293b', textAlign: 'right' }}>{value}</span>
    </div>
  )
}

export default function Financeiro({ onAbrirPerfil, onSair }) {
  const { isMobile, isTablet, isSmallScreen } = useWindowSize()
  const { userId, nomeEmpresa, chavePix, cpfCnpj, emailEmpresa, telefoneEmpresa, logoUrl, loading: loadingUser } = useUser()
  const [searchParams] = useSearchParams()
  const [mensalidades, setMensalidades] = useState([])
  const [vendas, setVendas] = useState([])
  const [mensalidadesFiltradas, setMensalidadesFiltradas] = useState([])
  const [loading, setLoading] = useState(true)
  const [mostrarFiltros, setMostrarFiltros] = useState(false)

  // Inicializa filtroStatus com o valor da URL, se existir
  const statusFromUrl = searchParams.get('status')
  const [filtroStatus, setFiltroStatus] = useState(statusFromUrl ? [statusFromUrl] : [])
  const [filtroVencimento, setFiltroVencimento] = useState(null)
  const [filtroDataInicio, setFiltroDataInicio] = useState(searchParams.get('dataInicio') || '')
  const [filtroDataFim, setFiltroDataFim] = useState(searchParams.get('dataFim') || '')
  // Eixo de data do período personalizado: 'vencimento' (quando vence) ou 'pagamento' (quando a baixa foi dada)
  const [filtroTipoData, setFiltroTipoData] = useState(
    searchParams.get('tipoData') === 'pagamento' ? 'pagamento' : 'vencimento'
  )
  const [filtroNome, setFiltroNome] = useState('')
  const [filtroNomeDebounced, setFiltroNomeDebounced] = useState('')

  // Aba ativa do menu financeiro (?aba=despesas abre a aba sem disparar o modal de nova despesa)
  const [abaAtiva, setAbaAtiva] = useState(
    (searchParams.get('aba') === 'despesas' || searchParams.get('novadespesa') === 'true') ? 'despesas' : 'mensalidades'
  )
  const [autoAbrirNovaDespesa, setAutoAbrirNovaDespesa] = useState(
    searchParams.get('novadespesa') === 'true'
  )

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
  // Multa/juros por atraso na baixa manual (pré-preenchido pela config, editável)
  const [multaJurosConfig, setMultaJurosConfig] = useState({ ativo: false, multa_percent: 0, juros_mes_percent: 0 })
  const [baixaMulta, setBaixaMulta] = useState('0.00')
  const [baixaJuros, setBaixaJuros] = useState('0.00')
  // Data em que o aluno pagou de fato. Nasce com hoje, mas o gestor pode voltar
  // pra quando recebeu (ex.: pagou dia 3 e a baixa só foi dada dia 10).
  const [dataBaixa, setDataBaixa] = useState(hojeISO())
  // Desconto concedido na baixa (sempre disponível, não só em parcela vencida).
  // Nasce vazio de propósito: com '0.00' pré-preenchido, o gestor tem que apagar
  // antes de digitar. Vazio conta como zero em todo o cálculo.
  const [baixaDesconto, setBaixaDesconto] = useState('')

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

  // Modal de Boleto Asaas
  const [mostrarModalBoleto, setMostrarModalBoleto] = useState(false)
  const [boletoData, setBoletoData] = useState(null)
  const [gerandoBoleto, setGerandoBoleto] = useState(false)
  const [linhaDigitavelCopied, setLinhaDigitavelCopied] = useState(false)
  const [pixBoletoCopied, setPixBoletoCopied] = useState(false)
  const [asaasConfigurado, setAsaasConfigurado] = useState(false)
  const [modoIntegracao, setModoIntegracao] = useState('manual') // 'asaas' ou 'manual'
  // Mesma chave que as mensagens automáticas usam (whatsappService): 'asaas_link' manda o
  // aluno pro portal, onde a fatura do Asaas é gerada; 'pix_manual' usa a chave Pix da escola.
  const [metodoPagamento, setMetodoPagamento] = useState('pix_manual')

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
  const [quantidadeEmAberto, setQuantidadeEmAberto] = useState(0)
  const [percentualAberto, setPercentualAberto] = useState(0)

  // Estados para exclusão e desfazer pagamento
  const [confirmDesfazerPagoMensalidade, setConfirmDesfazerPagoMensalidade] = useState({ show: false, mensalidade: null })
  const [confirmPularMes, setConfirmPularMes] = useState({ show: false, mensalidade: null })
  const [confirmExcluirMensalidade, setConfirmExcluirMensalidade] = useState({ show: false, mensalidade: null })

  useEffect(() => {
    if (userId) {
      carregarDados()
      // Verificar se Asaas está configurado
      asaasService.isConfigured().then(setAsaasConfigurado)
      // Carregar modo de integração
      supabase
        .from('usuarios')
        .select('modo_integracao, asaas_multa_juros')
        .eq('id', userId)
        .single()
        .then(({ data }) => {
          if (data?.modo_integracao) {
            setModoIntegracao(data.modo_integracao)
          }
          if (data?.asaas_multa_juros) {
            setMultaJurosConfig(data.asaas_multa_juros)
          }
        })
      supabase
        .from('config')
        .select('valor')
        .eq('chave', `${userId}_metodo_pagamento_whatsapp`)
        .maybeSingle()
        .then(({ data }) => setMetodoPagamento(data?.valor || 'pix_manual'))
    }
  }, [userId])

  // Atualizar filtro quando a URL mudar (navegação da dashboard)
  useEffect(() => {
    const statusFromUrl = searchParams.get('status')
    if (statusFromUrl) {
      setFiltroStatus([statusFromUrl])
    }
    const tipoDataFromUrl = searchParams.get('tipoData')
    if (tipoDataFromUrl) {
      setFiltroTipoData(tipoDataFromUrl === 'pagamento' ? 'pagamento' : 'vencimento')
    }
    const inicioFromUrl = searchParams.get('dataInicio')
    if (inicioFromUrl) setFiltroDataInicio(inicioFromUrl)
    const fimFromUrl = searchParams.get('dataFim')
    if (fimFromUrl) setFiltroDataFim(fimFromUrl)
  }, [searchParams])

  useEffect(() => {
    aplicarFiltros()
  }, [mensalidades, vendas, filtroStatus, filtroVencimento, filtroTipoData, filtroDataInicio, filtroDataFim, filtroNomeDebounced])

  // OTIMIZAÇÃO: Consolidar carregarMensalidades, carregarClientes e calcularMRR em uma única função
  const carregarDados = useCallback(async () => {
    if (!userId) return

    setLoading(true)
    try {
      // Executar todas as queries em paralelo
      // Em páginas: o Supabase corta em 1000 linhas (ver utils/buscarTodas.js).
      const [
        { data: mensalidadesData, error: mensalidadesError },
        { data: vendasData, error: vendasError }
      ] = await Promise.all([
        // 1. Mensalidades com dados do devedor e boleto (se existir)
        buscarTodas(() => supabase
          .from('mensalidades')
          .select(`
            *,
            devedor:devedores(
              nome,
              telefone,
              cpf,
              portal_token,
              assinatura_ativa,
              plano:planos(nome, tipo, valor, ciclo_cobranca)
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
          // id desempata: sem ordem total, páginas podem repetir/pular linhas
          .order('data_vencimento', { ascending: true })
          .order('id', { ascending: true })),

        // 2. Vendas (cobranças avulsas) para incluir nos totais
        buscarTodas(() => supabase
          .from('cobrancas_avulsas')
          .select('id, valor, data_vencimento, status, data_pagamento')
          .eq('user_id', userId)
          .or('lixo.is.null,lixo.eq.false')
          .order('id', { ascending: true }))
      ])

      if (mensalidadesError) throw mensalidadesError
      if (vendasError) throw vendasError

      // Processar mensalidades
      const mensalidadesComStatus = (mensalidadesData || []).map(p => ({
        ...p,
        statusCalculado: calcularStatus(p)
      }))

      setMensalidades(mensalidadesComStatus)
      setVendas(vendasData || [])
      // Os totais dos cards são recalculados em aplicarFiltros (useEffect),
      // para que respeitem os filtros ativos.

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
    const vencimento = new Date(mensalidade.data_vencimento + 'T12:00:00')
    vencimento.setHours(0, 0, 0, 0)

    if (vencimento < hoje) return 'atrasado'
    return 'aberto'
  }

  const calcularTotais = (lista, vendas = []) => {
    let emAtraso = 0
    let emAberto = 0
    let recebido = 0
    let qtdAtraso = 0
    let qtdAberto = 0
    let qtdRecebido = 0
    let qtdHoje = 0
    let qtd7Dias = 0
    let totalProx = 0

    const hoje = new Date()
    hoje.setHours(0, 0, 0, 0)

    lista.forEach(p => {
      const status = p.statusCalculado || calcularStatus(p)
      const valor = parseFloat(p.valor) || 0
      const venc = new Date(p.data_vencimento + 'T12:00:00')
      venc.setHours(0, 0, 0, 0)
      const diffDias = Math.ceil((venc - hoje) / (1000 * 60 * 60 * 24))

      if (status === 'atrasado') {
        emAtraso += valor
        qtdAtraso++
      } else if (status === 'aberto') {
        emAberto += valor
        qtdAberto++

        // Contar vencimentos próximos
        if (diffDias === 0) {
          qtdHoje++
          totalProx += valor
        }
        if (diffDias >= 0 && diffDias <= 7) {
          qtd7Dias++
        }
      } else if (status === 'pago') {
        // Recebido = dinheiro que entrou de fato (com multa/juros da baixa), não o valor base
        recebido += valorEfetivoMensalidade(p, multaJurosConfig).total
        qtdRecebido++
      }
    })

    // Incluir vendas (cobranças avulsas) nos totais
    vendas.forEach(v => {
      const valor = parseFloat(v.valor) || 0
      const venc = new Date(v.data_vencimento + 'T12:00:00')
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
        qtdAberto++
        if (diffDias === 0) { qtdHoje++; totalProx += valor }
        if (diffDias >= 0 && diffDias <= 7) { qtd7Dias++ }
      }
    })

    const total = (lista.length + vendas.length) || 1
    setTotalEmAtraso(emAtraso)
    setTotalEmAberto(emAberto)
    setTotalRecebido(recebido)
    setQuantidadeEmAtraso(qtdAtraso)
    setQuantidadeEmAberto(qtdAberto)
    setQuantidadeRecebido(qtdRecebido)
    setPercentualAtrasado(Math.round((qtdAtraso / total) * 100))
    setPercentualAberto(Math.round((qtdAberto / total) * 100))
    setPercentualRecebido(Math.round((qtdRecebido / total) * 100))
    setVencemHoje(qtdHoje)
    setVencemProximos7(qtd7Dias)
    setTotalProximosVencimentos(totalProx)
  }

  // Período personalizado: olha o vencimento (padrão) ou a data da baixa, conforme filtroTipoData.
  // Usa T12:00:00 porque `new Date('2026-07-30')` é lido como UTC e volta um dia no fuso de Brasília.
  const dentroDoPeriodo = (item) => {
    const dataRef = filtroTipoData === 'pagamento' ? item.data_pagamento : item.data_vencimento
    if (!dataRef) return false

    const data = new Date(String(dataRef).slice(0, 10) + 'T12:00:00')
    data.setHours(0, 0, 0, 0)

    if (filtroDataInicio && data < new Date(filtroDataInicio + 'T00:00:00')) return false
    if (filtroDataFim && data > new Date(filtroDataFim + 'T00:00:00')) return false
    return true
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
        const venc = new Date(p.data_vencimento + 'T12:00:00')
        venc.setHours(0, 0, 0, 0)
        const diffDias = Math.ceil((venc - hoje) / (1000 * 60 * 60 * 24))

        if (filtroVencimento === 'hoje') return diffDias === 0
        if (filtroVencimento === '7dias') return diffDias >= 0 && diffDias <= 7
        if (filtroVencimento === '30dias') return diffDias >= 0 && diffDias <= 30
        return true
      })
    }

    // Filtro por período personalizado (vencimento ou data da baixa)
    if (filtroDataInicio || filtroDataFim) {
      resultado = resultado.filter(dentroDoPeriodo)
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

    // Filtrar vendas (cobranças avulsas) com os mesmos critérios, para os cards
    const vendasFiltradas = filtrarVendas(vendas)

    // Recalcular os totais dos cards sobre o conjunto FILTRADO
    calcularTotais(resultado, vendasFiltradas)
  }

  // Aplica os mesmos filtros da tela às vendas (cobranças avulsas)
  const filtrarVendas = (lista) => {
    if (!lista || lista.length === 0) return []

    const hoje = new Date()
    hoje.setHours(0, 0, 0, 0)

    const statusVenda = (v) => {
      if (v.status === 'pago') return 'pago'
      const venc = new Date(v.data_vencimento + 'T12:00:00')
      venc.setHours(0, 0, 0, 0)
      return venc < hoje ? 'atrasado' : 'aberto'
    }

    let resultado = [...lista]

    // Filtro por nome: vendas avulsas não têm nome de aluno aqui, então
    // qualquer busca por nome as exclui dos totais.
    if (filtroNomeDebounced.trim() !== '') {
      return []
    }

    // Filtro por status (mesmos valores de statusCalculado)
    if (filtroStatus.length > 0) {
      resultado = resultado.filter(v => filtroStatus.includes(statusVenda(v)))
    }

    // Filtro por vencimento
    if (filtroVencimento) {
      resultado = resultado.filter(v => {
        const venc = new Date(v.data_vencimento + 'T12:00:00')
        venc.setHours(0, 0, 0, 0)
        const diffDias = Math.ceil((venc - hoje) / (1000 * 60 * 60 * 24))

        if (filtroVencimento === 'hoje') return diffDias === 0
        if (filtroVencimento === '7dias') return diffDias >= 0 && diffDias <= 7
        if (filtroVencimento === '30dias') return diffDias >= 0 && diffDias <= 30
        return true
      })
    }

    // Filtro por período personalizado (vencimento ou data da baixa)
    if (filtroDataInicio || filtroDataFim) {
      resultado = resultado.filter(dentroDoPeriodo)
    }

    return resultado
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
      const proximoVencimentoStr = calcularProximoVencimento(
        mensalidadeAtual.data_vencimento,
        devedor.plano?.ciclo_cobranca
      )

      // 5. Verificar se já existe mensalidade para esta data (ignorar lixo)
      const { data: jaExiste } = await supabase
        .from('mensalidades')
        .select('id')
        .eq('devedor_id', mensalidadeAtual.devedor_id)
        .eq('data_vencimento', proximoVencimentoStr)
        .eq('lixo', false)
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
      const dataFormatada = formatarData(proximoVencimentoStr)
      showToast(`Próxima mensalidade criada automaticamente para ${dataFormatada}`, 'success')

      return novaMensalidade

    } catch (error) {
      console.error('Erro na criação automática da próxima mensalidade:', error)
    }
  }

  // Multa/juros sugeridos contam o atraso até a data do pagamento, não até hoje:
  // quem pagou no dia 3 não deve juros dos dias em que a baixa ficou esquecida.
  const sugerirMultaJuros = (mensalidade, dataPagamento) => {
    const { multa, juros } = calcularMultaJuros(mensalidade.valor, mensalidade.data_vencimento, multaJurosConfig, dataPagamento)
    setBaixaMulta(multa.toFixed(2))
    setBaixaJuros(juros.toFixed(2))
  }

  const alterarDataBaixa = (novaData) => {
    setDataBaixa(novaData)
    if (novaData && mensalidadeParaAtualizar) sugerirMultaJuros(mensalidadeParaAtualizar, novaData)
  }

  const alterarStatusPagamento = (mensalidade, novoPago) => {
    setMensalidadeParaAtualizar(mensalidade)
    setNovoStatusPagamento(novoPago)
    setDataBaixa(hojeISO())
    // Pré-calcular multa/juros sugeridos (só quando estiver dando baixa numa parcela vencida)
    if (novoPago) {
      sugerirMultaJuros(mensalidade, hojeISO())
    } else {
      setBaixaMulta('0.00')
      setBaixaJuros('0.00')
    }
    // Desconto nunca é sugerido: é decisão do gestor, caso a caso
    setBaixaDesconto('')
    setMostrarModalConfirmacao(true)
  }

  const confirmarAlteracaoStatus = async () => {
    if (!mensalidadeParaAtualizar) return

    // Validar forma de pagamento se estiver marcando como pago
    if (novoStatusPagamento && !formaPagamento) {
      showToast('Por favor, selecione a forma de pagamento', 'warning')
      return
    }

    if (novoStatusPagamento && (!dataBaixa || dataBaixa > hojeISO())) {
      showToast('Informe a data do pagamento (não pode ser no futuro)', 'warning')
      return
    }

    // Desconto maior que a cobrança daria recibo negativo — 100% (cortesia) é o limite
    if (novoStatusPagamento) {
      const bruto = (parseFloat(mensalidadeParaAtualizar.valor) || 0)
        + Math.max(0, parseFloat(baixaMulta) || 0)
        + Math.max(0, parseFloat(baixaJuros) || 0)
      if ((parseFloat(baixaDesconto) || 0) > bruto + 0.005) {
        showToast('O desconto não pode ser maior que o valor da parcela', 'warning')
        return
      }
    }

    try {
      const updateData = {
        status: novoStatusPagamento ? 'pago' : 'pendente'
      }

      // Adicionar forma e data de pagamento se estiver marcando como pago
      if (novoStatusPagamento) {
        updateData.forma_pagamento = formaPagamento
        updateData.data_pagamento = dataBaixa
        // Multa/juros informados na baixa (pré-preenchidos pela config, editáveis)
        const multa = Math.max(0, parseFloat(baixaMulta) || 0)
        const juros = Math.max(0, parseFloat(baixaJuros) || 0)
        const base = parseFloat(mensalidadeParaAtualizar.valor) || 0
        // Desconto vai em coluna própria: `valor` é a base do plano e é dela que a
        // próxima parcela nasce — abater ali propagaria o desconto pra sempre.
        const desconto = Math.min(
          Math.max(0, parseFloat(baixaDesconto) || 0),
          base + multa + juros
        )
        updateData.valor_multa = multa
        updateData.valor_juros = juros
        updateData.valor_desconto = desconto
        updateData.valor_pago = Math.round((base + multa + juros - desconto) * 100) / 100
      } else {
        // Limpar forma e data se estiver desfazendo
        updateData.forma_pagamento = null
        updateData.data_pagamento = null
        updateData.valor_multa = 0
        updateData.valor_juros = 0
        updateData.valor_desconto = 0
        updateData.valor_pago = null
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
            data_pagamento: novoStatusPagamento ? updateData.data_pagamento : null,
            valor_multa: updateData.valor_multa,
            valor_juros: updateData.valor_juros,
            valor_desconto: updateData.valor_desconto,
            valor_pago: updateData.valor_pago
          }
          atualizada.statusCalculado = calcularStatus(atualizada)
          return atualizada
        }
        return p
      })

      setMensalidades(novasMensalidades)
      // Totais recalculados via useEffect/aplicarFiltros ao atualizar mensalidades
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
          data_pagamento: updateData.data_pagamento,
          valor_multa: updateData.valor_multa,
          valor_juros: updateData.valor_juros,
          valor_desconto: updateData.valor_desconto,
          valor_pago: updateData.valor_pago
        })
        setMostrarModalRecibo(true)
      } else {
        showToast('Pagamento desfeito!', 'success')
      }

      setFormaPagamento('')
      setBaixaMulta('0.00')
      setBaixaJuros('0.00')
      setBaixaDesconto('')
    } catch (error) {
      showToast('Erro ao atualizar: ' + error.message, 'error')
      setMostrarModalConfirmacao(false)
      setMensalidadeParaAtualizar(null)
      setFormaPagamento('')
      setBaixaMulta('0.00')
      setBaixaJuros('0.00')
      setBaixaDesconto('')
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
        // Zera o registro de dinheiro junto: desfazer e deixar multa/juros/desconto
        // gravados faria a parcela voltar pra régua carregando a baixa antiga
        .update({
          status: 'pendente',
          data_pagamento: null,
          forma_pagamento: null,
          valor_multa: 0,
          valor_juros: 0,
          valor_desconto: 0,
          valor_pago: null
        })
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

  // ---------------------------------------------------------------------------
  // Pular mês (aluno não treina neste mês)
  //
  // Remove a mensalidade do mês e JÁ CRIA a do mês seguinte. O simples "excluir"
  // foi removido de propósito (commit a0fb0a2): apagar a última mensalidade
  // válida tirava o aluno do cron gerar_proximas_mensalidades PARA SEMPRE, já que
  // ele projeta a próxima a partir da última mensalidade não-lixo. Gerando a
  // seguinte no mesmo ato, sempre sobra âncora de data.
  // ---------------------------------------------------------------------------

  // Só faz sentido pular mensalidade recorrente, em aberto, de aluno ativo.
  // Plano 'pacote' fica de fora: não tem "próximo mês" a projetar.
  const podePularMes = (mensalidade) => (
    mensalidade?.status !== 'pago' &&
    mensalidade?.is_mensalidade !== false &&
    mensalidade?.devedor?.assinatura_ativa === true &&
    mensalidade?.devedor?.plano?.tipo !== 'pacote'
  )

  // Cobrança do Asaas que o aluno ainda consegue pagar
  const boletoAtivoDaMensalidade = (mensalidade) =>
    (mensalidade?.boletos || []).find(b => b.asaas_id && ['PENDING', 'OVERDUE'].includes(b.status)) || null

  const confirmarPularMes = async () => {
    const mensalidade = confirmPularMes.mensalidade
    if (!mensalidade) return

    if (!podePularMes(mensalidade)) {
      showToast('Esta mensalidade não pode ser pulada', 'warning')
      setConfirmPularMes({ show: false, mensalidade: null })
      return
    }

    try {
      // 1. Cobrança viva no Asaas precisa ser cancelada ANTES — senão o aluno
      //    continua conseguindo pagar um mês que deixou de existir aqui.
      const boletoAtivo = boletoAtivoDaMensalidade(mensalidade)
      if (boletoAtivo) {
        try {
          await asaasService.cancelarBoleto(boletoAtivo.id)
        } catch (erroAsaas) {
          showToast(`Não foi possível cancelar a cobrança no Asaas (${erroAsaas.message}). Nada foi alterado.`, 'error')
          setConfirmPularMes({ show: false, mensalidade: null })
          return
        }
      }

      // 2. Já existe mensalidade futura? Então não gera outra (evita duplicata e
      //    o índice único uniq_mensalidade_devedor_data_valor).
      const { data: futuras, error: erroFuturas } = await supabase
        .from('mensalidades')
        .select('id, data_vencimento')
        .eq('devedor_id', mensalidade.devedor_id)
        .neq('id', mensalidade.id)
        .gt('data_vencimento', mensalidade.data_vencimento)
        .or('lixo.is.null,lixo.eq.false')
        .order('data_vencimento', { ascending: true })
        .limit(1)

      if (erroFuturas) throw erroFuturas
      const jaTemFutura = futuras?.[0] || null

      // 3. Cria a próxima ANTES de apagar a atual: se algo falhar no meio, sobra
      //    uma mensalidade a mais (visível e corrigível) em vez de um aluno órfão.
      let novaData = null
      if (!jaTemFutura) {
        const proximaData = calcularProximoVencimento(
          mensalidade.data_vencimento,
          mensalidade.devedor?.plano?.ciclo_cobranca
        )

        const { data: nova, error: erroInsert } = await supabase
          .from('mensalidades')
          .insert({
            user_id: mensalidade.user_id,
            devedor_id: mensalidade.devedor_id,
            valor: mensalidade.devedor?.plano?.valor || mensalidade.valor,
            data_vencimento: proximaData,
            status: 'pendente',
            is_mensalidade: true,
            numero_mensalidade: (mensalidade.numero_mensalidade || 0) + 1,
            recorrencia: mensalidade.recorrencia || {
              isRecurring: true,
              recurrenceType: 'monthly',
              startDate: mensalidade.data_vencimento
            },
            observacao: `Gerada ao pular ${formatarMesAno(mensalidade.data_vencimento)}`,
            enviado_hoje: false,
            total_mensagens_enviadas: 0
          })
          .select('id, data_vencimento')
          .single()

        // 23505 = índice único: já existe mensalidade igual, o objetivo está cumprido
        if (erroInsert && erroInsert.code !== '23505') throw erroInsert
        novaData = nova?.data_vencimento || proximaData
      }

      // 4. Soft delete do mês pulado (a linha continua no banco, com carimbo)
      const carimbo = `[mês pulado em ${new Date().toLocaleDateString('pt-BR')}]`
      const { error: erroDelete } = await supabase
        .from('mensalidades')
        .update({
          lixo: true,
          deletado_em: new Date().toISOString(),
          observacao: [mensalidade.observacao, carimbo].filter(Boolean).join(' ')
        })
        .eq('id', mensalidade.id)

      if (erroDelete) throw erroDelete

      // 5. Rastro de autoria — delete de mensalidade nunca deixou rastro, e foi
      //    por isso que não deu pra atribuir os alunos travados a ninguém.
      supabase.from('log_auditoria').insert({
        user_id: mensalidade.user_id,
        devedor_id: mensalidade.devedor_id,
        acao: 'mensalidade_pulada',
        campo: 'lixo',
        valor_anterior: 'false',
        valor_novo: 'true',
        detalhes: `Mês ${formatarMesAno(mensalidade.data_vencimento)} pulado (${formatarMoeda(mensalidade.valor)}, venc. ${formatarData(mensalidade.data_vencimento)}). ` +
          (jaTemFutura
            ? `Já existia mensalidade em ${formatarData(jaTemFutura.data_vencimento)}, nenhuma nova criada.`
            : `Próxima gerada para ${formatarData(novaData)}.`)
      }).then(() => {}, e => console.error('Erro log auditoria:', e))

      showToast(
        jaTemFutura
          ? `Mês pulado! Já havia mensalidade em ${formatarData(jaTemFutura.data_vencimento)} — nenhuma nova foi criada.`
          : `Mês pulado! Próxima mensalidade criada para ${formatarData(novaData)}.`,
        'success'
      )
      carregarDados()
    } catch (error) {
      showToast('Erro ao pular mês: ' + error.message, 'error')
    } finally {
      setConfirmPularMes({ show: false, mensalidade: null })
    }
  }

  // ---------------------------------------------------------------------------
  // Excluir mensalidade (lançamento errado / duplicata)
  //
  // Volta ao menu, mas com a trava que faltava: excluir a ÚLTIMA mensalidade
  // válida de um aluno ativo tira ele do cron para sempre (foi assim que 150
  // alunos travaram). Nesse caso a ação é bloqueada e o modal aponta a saída
  // certa — "Pular mês" ou desativar a assinatura.
  // ---------------------------------------------------------------------------
  const exclusaoBloqueada = (mensalidade) => {
    if (!mensalidade) return false
    if (mensalidade.devedor?.assinatura_ativa !== true) return false
    // `mensalidades` é a lista completa da conta (só não-lixo), não a filtrada
    const outras = mensalidades.filter(m => m.id !== mensalidade.id && m.devedor_id === mensalidade.devedor_id)
    return outras.length === 0
  }

  const confirmarExclusaoMensalidade = async () => {
    const mensalidade = confirmExcluirMensalidade.mensalidade
    if (!mensalidade) return

    if (exclusaoBloqueada(mensalidade)) {
      setConfirmExcluirMensalidade({ show: false, mensalidade: null })
      return
    }

    try {
      // Cobrança viva no Asaas some junto — senão fica link pagável de uma
      // mensalidade que não existe mais
      const boletoAtivo = boletoAtivoDaMensalidade(mensalidade)
      if (boletoAtivo) {
        try {
          await asaasService.cancelarBoleto(boletoAtivo.id)
        } catch (erroAsaas) {
          showToast(`Não foi possível cancelar a cobrança no Asaas (${erroAsaas.message}). Nada foi alterado.`, 'error')
          setConfirmExcluirMensalidade({ show: false, mensalidade: null })
          return
        }
      }

      const { error } = await supabase
        .from('mensalidades')
        .update({ lixo: true, deletado_em: new Date().toISOString() })
        .eq('id', mensalidade.id)

      if (error) throw error

      supabase.from('log_auditoria').insert({
        user_id: mensalidade.user_id,
        devedor_id: mensalidade.devedor_id,
        acao: 'mensalidade_excluida',
        campo: 'lixo',
        valor_anterior: 'false',
        valor_novo: 'true',
        detalhes: `Mensalidade de ${formatarData(mensalidade.data_vencimento)} (${formatarMoeda(mensalidade.valor)}, ${mensalidade.status}) excluída`
      }).then(() => {}, e => console.error('Erro log auditoria:', e))

      showToast('Mensalidade excluída!', 'success')
      carregarDados()
    } catch (error) {
      showToast('Erro ao excluir: ' + error.message, 'error')
    } finally {
      setConfirmExcluirMensalidade({ show: false, mensalidade: null })
    }
  }

  // Menu "..." de ações da linha/card — compartilhado pelas duas listagens.
  // Função (e não componente) de propósito: componente declarado aqui dentro
  // muda de identidade a cada render e o menu fecharia sozinho.
  const renderMenuAcoes = (mensalidade) => (
    <Dropdown
      align="end"
      trigger={<Button variant="gray" size="sm" iconOnly icon="mdi:dots-vertical" aria-label="Ações" />}
    >
      <Dropdown.Item
        icon={mensalidade.status === 'pago' ? 'mdi:undo' : 'mdi:check-circle-outline'}
        onClick={() => handleMarcarPagoRapido(mensalidade)}
      >
        {mensalidade.status === 'pago' ? 'Desfazer pagamento' : 'Marcar como pago'}
      </Dropdown.Item>

      {podePularMes(mensalidade) && (
        <Dropdown.Item
          icon="mdi:calendar-remove-outline"
          onClick={() => setConfirmPularMes({ show: true, mensalidade })}
        >
          Pular mês
        </Dropdown.Item>
      )}

      <Dropdown.Divider />

      <Dropdown.Item
        icon="mdi:trash-can-outline"
        danger
        onClick={() => setConfirmExcluirMensalidade({ show: true, mensalidade })}
      >
        Excluir
      </Dropdown.Item>
    </Dropdown>
  )

  const handleGerarRecibo = async (tipo, mensalidade = mensalidadePaga) => {
    if (!mensalidade) return

    const dadosRecibo = {
      nomeCliente: mensalidade.devedor?.nome || mensalidade.devedores?.nome || 'Aluno',
      telefoneCliente: mensalidade.devedor?.telefone || mensalidade.devedores?.telefone || '',
      // != null, nao `||`: cortesia grava valor_pago = 0 e o zero e o valor real
      valor: mensalidade.valor_pago != null ? mensalidade.valor_pago : mensalidade.valor,
      valorBase: mensalidade.valor,
      valorMulta: mensalidade.valor_multa,
      valorJuros: mensalidade.valor_juros,
      valorDesconto: mensalidade.valor_desconto,
      dataVencimento: mensalidade.data_vencimento,
      dataPagamento: mensalidade.data_pagamento,
      formaPagamento: mensalidade.forma_pagamento,
      nomeEmpresa: nomeEmpresa || 'Empresa',
      chavePix: chavePix || '',
      cpfCnpj: cpfCnpj || '',
      emailEmpresa: emailEmpresa || '',
      telefoneEmpresa: telefoneEmpresa || '',
      logoUrl: logoUrl || '',
      descricao: mensalidade.is_mensalidade ? 'Mensalidade' : `Parcela ${mensalidade.numero_mensalidade || 1}`
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

  const [enviandoReciboWhatsApp, setEnviandoReciboWhatsApp] = useState(false)

  const handleEnviarReciboWhatsApp = async (mensalidade = mensalidadePaga) => {
    if (!mensalidade) return

    const devedor = mensalidade.devedor || mensalidade.devedores
    const destinatario = resolverDestinatario(devedor)

    if (!destinatario.telefone) {
      showToast('Telefone do aluno não encontrado', 'error')
      return
    }

    const status = await whatsappService.verificarStatus()
    if (!status.conectado) {
      showToast('WhatsApp não conectado. Conecte na aba WhatsApp primeiro.', 'error')
      return
    }

    setEnviandoReciboWhatsApp(true)

    try {
      const nomeAluno = destinatario.primeiroNomeAluno || 'Aluno'

      const dadosRecibo = {
        nomeCliente: devedor?.nome || 'Aluno',
        telefoneCliente: devedor?.telefone || '',
        valor: mensalidade.valor_pago != null ? mensalidade.valor_pago : mensalidade.valor,
        valorBase: mensalidade.valor,
        valorMulta: mensalidade.valor_multa,
        valorJuros: mensalidade.valor_juros,
        valorDesconto: mensalidade.valor_desconto,
        dataVencimento: mensalidade.data_vencimento,
        dataPagamento: mensalidade.data_pagamento,
        formaPagamento: mensalidade.forma_pagamento,
        nomeEmpresa: nomeEmpresa || 'Empresa',
        chavePix: chavePix || '',
        cpfCnpj: cpfCnpj || '',
        emailEmpresa: emailEmpresa || '',
        telefoneEmpresa: telefoneEmpresa || '',
        logoUrl: logoUrl || '',
        descricao: mensalidade.is_mensalidade ? 'Mensalidade' : `Parcela ${mensalidade.numero_mensalidade || 1}`
      }

      const pdfBlob = await gerarReciboBlob(dadosRecibo)
      const base64 = await new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onloadend = () => resolve(reader.result.split(',')[1])
        reader.onerror = reject
        reader.readAsDataURL(pdfBlob)
      })

      const dataArquivo = new Date().toISOString().split('T')[0]
      const fileName = `recibo_${(devedor?.nome || 'aluno').replace(/\s+/g, '_')}_${dataArquivo}.pdf`
      const caption = `Olá, ${nomeAluno}! Segue seu recibo de pagamento. - ${nomeEmpresa || 'Empresa'}`

      const resultado = await whatsappService.enviarDocumento(
        destinatario.telefone,
        base64,
        caption,
        fileName,
        'document'
      )

      if (resultado.sucesso) {
        showToast('Recibo enviado via WhatsApp!', 'success')
        setMostrarModalRecibo(false)
        setMensalidadePaga(null)
      } else {
        showToast('Erro ao enviar: ' + resultado.erro, 'error')
      }
    } catch (error) {
      console.error('Erro ao enviar recibo via WhatsApp:', error)
      showToast('Erro ao enviar: ' + error.message, 'error')
    } finally {
      setEnviandoReciboWhatsApp(false)
    }
  }

  // Escola no Asaas: manda o link do portal do aluno. É no portal que a fatura do
  // Asaas é gerada (portal-pagar), com baixa automática e multa/juros certos. Antes
  // este botão montava um Pix estático com a chave da escola, por fora do Asaas.
  const enviarLinkPortal = async (mensalidade) => {
    const portalToken = mensalidade.devedor?.portal_token
    if (!portalToken) {
      showToast('Este aluno ainda não tem link do portal. Abra o cadastro dele e salve para gerar.', 'error')
      return
    }
    const url = `${window.location.origin}/portal/${portalToken}`
    const telefone = mensalidade.devedor?.telefone
    if (!telefone) {
      try { await navigator.clipboard.writeText(url) } catch { /* segue */ }
      showToast('Aluno sem telefone. Link do portal copiado.', 'info')
      return
    }

    setGerandoLink(true)
    try {
      const status = await whatsappService.verificarStatus()
      if (!status.conectado) {
        try { await navigator.clipboard.writeText(url) } catch { /* segue */ }
        showToast('WhatsApp não conectado. Link do portal copiado para você enviar.', 'error')
        return
      }
      const nome = mensalidade.devedor?.nome?.split(' ')[0] || 'Aluno'
      const msg = `Olá, ${nome}! 👋\n\nAcesse seu portal de pagamentos pelo link abaixo:\n\n${url}\n\nPor lá você pode consultar suas mensalidades e realizar pagamentos.`
      const resultado = await whatsappService.enviarMensagem(telefone, msg)
      if (resultado.sucesso) showToast('Link do portal enviado por WhatsApp!', 'success')
      else showToast('Erro ao enviar: ' + resultado.erro, 'error')
    } catch (error) {
      console.error('Erro ao enviar link do portal:', error)
      showToast('Erro ao enviar: ' + error.message, 'error')
    } finally {
      setGerandoLink(false)
    }
  }

  // Pix manual: abre a janela com QR Code e Pix copia e cola da chave da escola.
  // Não gera mais o link /pagar (quase ninguém abria e ele saía do fluxo).
  const handleGerarLinkPagamento = async (mensalidade) => {
    if (mensalidade.status === 'pago') {
      showToast('Esta mensalidade já foi paga.', 'info')
      return
    }

    if (metodoPagamento === 'asaas_link') {
      await enviarLinkPortal(mensalidade)
      return
    }

    if (!chavePix) {
      showToast('Configure sua chave PIX em Configurações antes de gerar o Pix.', 'error')
      return
    }

    setGerandoLink(true)

    try {
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
      setLinkPagamentoData({
        pixCode: codigoPix,
        valor: mensalidade.valor,
        cliente: mensalidade.devedor?.nome || 'Aluno',
        vencimento: mensalidade.data_vencimento
      })

      setMostrarModalLinkPagamento(true)
    } catch (error) {
      console.error('Erro ao gerar Pix:', error)
      showToast('Erro ao gerar o Pix: ' + error.message, 'error')
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
      mensagem += `Segue o Pix para pagamento da sua mensalidade:\n\n`
      mensagem += `*Valor:* ${valorFormatado}\n`
      mensagem += `*Vencimento:* ${vencimentoFormatado}\n\n`
      mensagem += `Copie o código abaixo e cole no app do seu banco, em Pix Copia e Cola:\n\n`
      mensagem += `${linkPagamentoData.pixCode}\n\n`
      mensagem += `Qualquer dúvida, estou à disposição!`

      const resultado = await whatsappService.enviarMensagem(telefone, mensagem)

      if (resultado.sucesso) {
        showToast('Pix enviado via WhatsApp!', 'success')
      } else {
        showToast('Erro ao enviar: ' + resultado.erro, 'error')
      }
    } catch (error) {
      console.error('Erro ao enviar Pix via WhatsApp:', error)
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
      showToast('Configure sua API Key do Asaas em Configurações › Recebimentos.', 'error')
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
      pago: { variant: 'success', text: 'Pago' },
      aberto: { variant: 'info', text: 'Em aberto' },
      atrasado: { variant: 'danger', text: 'Em atraso' }
    }
    const config = configs[status] || configs.aberto
    return <Badge variant={config.variant} solid>{config.text}</Badge>
  }

  const limparFiltros = () => {
    setFiltroStatus([])
    setFiltroVencimento(null)
    setFiltroTipoData('vencimento')
    setFiltroDataInicio('')
    setFiltroDataFim('')
    setFiltroNome('')
  }

  const toggleFiltroStatus = (status) => {
    if (filtroStatus.includes(status)) {
      setFiltroStatus(filtroStatus.filter(s => s !== status))
    } else {
      setFiltroStatus([...filtroStatus, status])
    }
  }

  // Filtros em rascunho: o que a pessoa muda na janela de Filtros só vale ao
  // tocar em "Ver resultados". Fechar no X, no Esc ou tocando fora descarta.
  const FILTRO_VAZIO = { filtroStatus: [], filtroVencimento: null, filtroTipoData: 'vencimento', filtroDataInicio: '', filtroDataFim: '' }
  const [rascunho, setRascunho] = useState(FILTRO_VAZIO)
  const abrirFiltros = () => {
    setRascunho({ filtroStatus, filtroVencimento, filtroTipoData, filtroDataInicio, filtroDataFim })
    setMostrarFiltros(true)
  }
  const mudarRascunho = (campo, valor) => setRascunho(r => ({ ...r, [campo]: valor }))
  // Limpar zera o que está aplicado e já fecha a janela (pedido do dono).
  const limparRascunho = () => {
    setRascunho(FILTRO_VAZIO)
    setFiltroStatus(FILTRO_VAZIO.filtroStatus)
    setFiltroVencimento(FILTRO_VAZIO.filtroVencimento)
    setFiltroTipoData(FILTRO_VAZIO.filtroTipoData)
    setFiltroDataInicio(FILTRO_VAZIO.filtroDataInicio)
    setFiltroDataFim(FILTRO_VAZIO.filtroDataFim)
    setMostrarFiltros(false)
  }
  const verResultadosFiltro = () => {
    setFiltroStatus(rascunho.filtroStatus)
    setFiltroVencimento(rascunho.filtroVencimento)
    setFiltroTipoData(rascunho.filtroTipoData)
    setFiltroDataInicio(rascunho.filtroDataInicio)
    setFiltroDataFim(rascunho.filtroDataFim)
    setMostrarFiltros(false)
  }
  const rascunhoTemFiltro = rascunho.filtroStatus.length > 0 || rascunho.filtroVencimento !== null || rascunho.filtroDataInicio !== '' || rascunho.filtroDataFim !== '' || rascunho.filtroTipoData !== 'vencimento'

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
      <div style={{ display: 'flex', flexDirection: 'column', gap: isSmallScreen ? '16px' : '25px', marginBottom: isSmallScreen ? '16px' : '25px' }}>
        {/* Linha: abas + ações de Vendas/Despesas */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
        <Tabs
          variant="segmented"
          value={abaAtiva}
          onChange={setAbaAtiva}
          items={[
            { value: 'mensalidades', label: 'Mensalidades', icon: isMobile ? undefined : 'fluent:receipt-20-regular' },
            { value: 'avulsas', label: 'Vendas', icon: isMobile ? undefined : 'mdi:cart-outline' },
            { value: 'despesas', label: 'Despesas', icon: isMobile ? undefined : 'mdi:wallet-outline' }
          ]}
        />
        {/* Portal target para botões de Vendas/Despesas */}
        <div ref={(el) => { buttonsPortalRef.current = el; if (el && !portalReady) setPortalReady(true) }} style={{ display: 'contents' }} />
        </div>

        {/* Toolbar Mensalidades — busca full width + ações à direita */}
        {abaAtiva === 'mensalidades' && (
          <div style={{ display: 'flex', flexDirection: isSmallScreen ? 'column' : 'row', alignItems: isSmallScreen ? 'stretch' : 'center', gap: '8px' }}>
            <SearchInput
              placeholder="Buscar aluno..."
              value={filtroNome}
              onChange={(e) => setFiltroNome(e.target.value)}
              style={{ flex: 1 }}
            />
            <div style={{ display: 'flex', gap: '8px', position: 'relative' }}>

            <Button
              variant="outline"
              icon={isSmallScreen ? undefined : 'ph:export-light'}
                    aria-label="Exportar"
              title="Exportar"
              onClick={() => exportarMensalidades(mensalidadesFiltradas)}
              style={{ flex: isSmallScreen ? 1 : 'none' }}
            >
              Exportar
            </Button>

            <Button
              className="btn-filtrar"
              variant={temFiltrosAtivos ? 'secondary' : 'outline'}
              icon={isSmallScreen ? undefined : 'mdi:filter-outline'}
              onClick={abrirFiltros}
              aria-expanded={mostrarFiltros}
              style={{ flex: isSmallScreen ? 1 : 'none' }}
            >
              Filtrar
              {temFiltrosAtivos && (
                <span style={{
                  position: 'absolute',
                  top: '-6px',
                  right: '-6px',
                  backgroundColor: 'var(--danger-700)',
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
                  {filtroStatus.length + (filtroVencimento ? 1 : 0) + ((filtroDataInicio || filtroDataFim) ? 1 : 0)}
                </span>
              )}
            </Button>

            {/* Filtros — Modal do DS (folha que sobe no celular, janela no computador).
                Os filtros já valem enquanto a pessoa mexe; o botão só fecha. */}
            <Modal
              isOpen={mostrarFiltros}
              onClose={() => setMostrarFiltros(false)}
              title="Filtros"
              size="sm"
            >
              <Modal.Body>
                <div>
                  {/* Seção Status */}
                  <div style={{ marginBottom: '20px' }}>
                    <label className="ds-input-label" style={{ display: 'block', marginBottom: '12px' }}>
                      Status
                    </label>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      {['pago', 'aberto', 'atrasado'].map(status => (
                        <Checkbox
                          key={status}
                          checked={rascunho.filtroStatus.includes(status)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              mudarRascunho('filtroStatus', [...rascunho.filtroStatus, status])
                            } else {
                              mudarRascunho('filtroStatus', rascunho.filtroStatus.filter(s => s !== status))
                            }
                          }}
                          label={status === 'pago' ? 'Pago' : status === 'aberto' ? 'Em aberto' : 'Em atraso'}
                        />
                      ))}
                    </div>
                  </div>

                  {/* Seção Vencimento */}
                  <div style={{ marginBottom: '20px' }}>
                    <Select
                      label="Vencimento"
                      portal
                      placeholder="Todos"
                      value={rascunho.filtroVencimento || ''}
                      onChange={(v) => mudarRascunho('filtroVencimento', v || null)}
                      options={[
                        { value: '', label: 'Todos' },
                        { value: 'hoje', label: 'Hoje' },
                        { value: '7dias', label: 'Próximos 7 dias' },
                        { value: '30dias', label: 'Próximos 30 dias' },
                      ]}
                    />
                  </div>

                  {/* Período Personalizado */}
                  <div>
                    <label className="ds-input-label" style={{ display: 'block', marginBottom: '10px' }}>
                      Período Personalizado
                    </label>
                    <div style={{ marginBottom: '10px' }}>
                      <Select
                        portal
                        value={rascunho.filtroTipoData}
                        onChange={(v) => mudarRascunho('filtroTipoData', v || 'vencimento')}
                        options={[
                          { value: 'vencimento', label: 'Por data de vencimento' },
                          { value: 'pagamento', label: 'Por data de pagamento' },
                        ]}
                      />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      <DateField value={rascunho.filtroDataInicio} onChange={(v) => mudarRascunho('filtroDataInicio', v)} />
                      <div style={{ textAlign: 'center', color: '#999', fontSize: '12px', fontWeight: '500' }}>
                        até
                      </div>
                      <DateField value={rascunho.filtroDataFim} onChange={(v) => mudarRascunho('filtroDataFim', v)} />
                    </div>
                  </div>
                </div>

              </Modal.Body>
              <Modal.Footer>
                <Button variant="outline" disabled={!rascunhoTemFiltro && !(filtroStatus.length > 0 || filtroVencimento !== null || filtroDataInicio !== '' || filtroDataFim !== '')} onClick={limparRascunho} style={{ flex: 1 }}>
                  Limpar
                </Button>
                <Button variant="primary" onClick={verResultadosFiltro} style={{ flex: 2 }}>
                  Ver resultados
                </Button>
              </Modal.Footer>
      </Modal>
            </div>
          </div>
        )}
      </div>

      {/* ========== ABA: COBRANÇAS AVULSAS ========== */}
      {abaAtiva === 'avulsas' && <CobrancasAvulsas embedded buttonsPortal={buttonsPortalRef.current} onCountUpdate={handleVendasCountUpdate} />}

      {/* ========== ABA: DESPESAS ========== */}
      {abaAtiva === 'despesas' && <Despesas embedded buttonsPortal={buttonsPortalRef.current} onCountUpdate={handleDespesasCountUpdate} autoAbrirNova={autoAbrirNovaDespesa} onAutoAbrirConsumido={() => setAutoAbrirNovaDespesa(false)} />}

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
          gridTemplateColumns: isSmallScreen ? 'repeat(2, minmax(0, 1fr))' : 'repeat(4, minmax(0, 1fr))',
          gap: isSmallScreen ? '10px' : '16px'
        }}>
            {/* Cartões de resumo — StatCard do DS. Os clicáveis ligam/desligam
                o filtro de status da lista (antes era o link "Ver detalhes"). */}
            <StatCard
              label="Em atraso"
              icon="solar:danger-triangle-linear"
              accent="danger"
              tinted
              size={isMobile ? 'sm' : 'md'}
              value={`R$ ${totalEmAtraso.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
              hint={isMobile
                ? `${quantidadeEmAtraso} mensalidade${quantidadeEmAtraso !== 1 ? 's' : ''}`
                : `${quantidadeEmAtraso} mensalidade${quantidadeEmAtraso !== 1 ? 's' : ''} · ${percentualAtrasado}% do total`}
              onClick={() => toggleFiltroStatus('atrasado')}
              aria-pressed={filtroStatus.includes('atrasado')}
              title="Filtrar a lista pelas mensalidades em atraso"
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
              label="Recebido"
              icon="fluent-emoji-high-contrast:money-bag"
              accent="success"
              tinted
              size={isMobile ? 'sm' : 'md'}
              value={`R$ ${totalRecebido.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
              hint={isMobile
                ? `${quantidadeRecebido} mensalidade${quantidadeRecebido !== 1 ? 's' : ''}`
                : `${quantidadeRecebido} mensalidade${quantidadeRecebido !== 1 ? 's' : ''} · ${percentualRecebido}% do total`}
              onClick={() => toggleFiltroStatus('pago')}
              aria-pressed={filtroStatus.includes('pago')}
              title="Filtrar a lista pelas mensalidades pagas"
            />
            <StatCard
              label="Em aberto"
              icon="solar:wallet-money-linear"
              accent="info"
              tinted
              size={isMobile ? 'sm' : 'md'}
              value={`R$ ${totalEmAberto.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
              hint={isMobile
                ? `${quantidadeEmAberto} mensalidade${quantidadeEmAberto !== 1 ? 's' : ''}`
                : `${quantidadeEmAberto} mensalidade${quantidadeEmAberto !== 1 ? 's' : ''} a vencer · ${percentualAberto}% do total`}
              onClick={() => toggleFiltroStatus('aberto')}
              aria-pressed={filtroStatus.includes('aberto')}
              title="Filtrar a lista pelas mensalidades em aberto"
            />
          </div>
        </div>

      {/* Tabela/Cards de Mensalidades — a moldura vem do Table do DS (desktop)
          e dos cards (mobile), então o wrapper não desenha nada por cima */}
      <div style={{ marginBottom: '40px' }}>
        {mensalidadesFiltradas.length === 0 ? (
          temFiltrosAtivos ? (
            <EmptyState
              variant="no-matches"
              title="Nenhuma mensalidade com esses filtros"
              description="Mude a busca ou os filtros para ver outras mensalidades."
              action={<Button variant="outline" onClick={limparFiltros}>Limpar filtros</Button>}
            />
          ) : (
            <EmptyState
              variant="first-use"
              icon="mdi:receipt-text-outline"
              title="Nenhuma mensalidade ainda"
              description="As mensalidades aparecem aqui quando você cadastra alunos com plano."
            />
          )
        ) : isSmallScreen ? (
          /* Cards para Mobile/Tablet */
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {mensalidadesPaginadas.map(mensalidade => (
              <Card
                key={mensalidade.id}
                accent={
                  mensalidade.statusCalculado === 'atrasado' ? 'danger' :
                  mensalidade.statusCalculado === 'pago' ? 'success' : 'info'
                }
                onClick={() => abrirDetalhesMensalidade(mensalidade)}
                role="button"
                tabIndex={0}
                aria-label={`Ver mensalidade de ${mensalidade.devedor?.nome || 'aluno'}`}
                onKeyDown={(e) => {
                  if (e.target !== e.currentTarget) return
                  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); abrirDetalhesMensalidade(mensalidade) }
                }}
                style={{ cursor: 'pointer' }}
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
                  {(() => {
                    const efetivo = valorEfetivoMensalidade(mensalidade, multaJurosConfig)
                    return (
                      <div>
                        <p style={{ fontSize: '20px', fontWeight: '700', color: '#333', margin: '0 0 4px 0' }}>
                          {formatarMoeda(efetivo.projetado ? efetivo.base : efetivo.total)}
                        </p>
                        {resumoValorEfetivo(efetivo, formatarMoeda) && (
                          <p style={{ fontSize: '12px', fontWeight: '500', color: corValorEfetivo(efetivo), margin: '0 0 4px 0' }}>
                            {resumoValorEfetivo(efetivo, formatarMoeda)}
                          </p>
                        )}
                        <p style={{ fontSize: '13px', color: '#666', margin: 0 }}>
                          Venc: {new Date(mensalidade.data_vencimento + 'T00:00:00').toLocaleDateString('pt-BR')}
                        </p>
                      </div>
                    )
                  })()}

                  {/* Ações */}
                  <div onClick={(e) => e.stopPropagation()}>
                    {renderMenuAcoes(mensalidade)}
                  </div>
                </div>
              </Card>
            ))}
          </div>
        ) : (
          /* Tabela para Desktop — Table do DS */
          <Table
            data={mensalidadesPaginadas}
            rowKey="id"
            onRowClick={(mensalidade) => abrirDetalhesMensalidade(mensalidade)}
            emptyTitle="Nenhuma mensalidade"
            emptyMessage="Nenhuma mensalidade encontrada com os filtros atuais."
            emptyIcon="solar:wallet-money-linear"
            columns={[
              {
                key: 'aluno',
                label: 'Aluno',
                render: (m) => (
                  <span style={{ fontWeight: 600, color: '#1e293b' }}>{m.devedor?.nome || 'N/A'}</span>
                )
              },
              {
                key: 'vencimento',
                label: 'Vencimento',
                align: 'center',
                render: (m) => formatarData(m.data_vencimento)
              },
              {
                key: 'valor',
                label: 'Valor',
                align: 'center',
                render: (m) => {
                  // Paga: mostra o que entrou de fato. Em atraso: base + projeção do acréscimo.
                  const efetivo = valorEfetivoMensalidade(m, multaJurosConfig)
                  const destaque = efetivo.projetado ? efetivo.base : efetivo.total
                  return (
                    <>
                      <span style={{ fontSize: '15px', fontWeight: 700, color: '#1e293b' }}>
                        {formatarMoeda(destaque)}
                      </span>
                      {resumoValorEfetivo(efetivo, formatarMoeda) && (
                        <div style={{ fontSize: '11px', fontWeight: 500, color: corValorEfetivo(efetivo), marginTop: '2px', whiteSpace: 'nowrap' }}>
                          {resumoValorEfetivo(efetivo, formatarMoeda)}
                        </div>
                      )}
                    </>
                  )
                }
              },
              {
                key: 'plano',
                label: 'Plano',
                align: 'center',
                render: (m) => m.devedor?.plano?.nome || '-'
              },
              {
                key: 'status',
                label: 'Status',
                align: 'center',
                render: (m) => getStatusBadge(m.statusCalculado)
              },
              {
                key: 'forma_pagamento',
                label: 'Forma Pagamento',
                align: 'center',
                render: (m) => m.forma_pagamento || '-'
              },
              {
                key: 'data_pagamento',
                label: 'Data Pagamento',
                align: 'center',
                render: (m) => formatarData(m.data_pagamento)
              },
              {
                key: 'acoes',
                label: 'Ações',
                align: 'center',
                width: 80,
                render: (m) => (
                  <div data-no-row-click style={{ display: 'flex', justifyContent: 'center' }}>
                    {renderMenuAcoes(m)}
                  </div>
                )
              }
            ]}
          />
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
            <nav aria-label="Páginas" style={{ display: 'flex', alignItems: 'center', gap: '4px', flexWrap: 'wrap', justifyContent: 'center' }}>
              <Button
                variant="outline"
                size="sm"
                icon="mdi:chevron-left"
                iconOnly={isMobile}
                aria-label="Página anterior"
                onClick={() => setPaginaAtual(p => Math.max(1, p - 1))}
                disabled={paginaAtual === 1}
              >
                {!isMobile && 'Anterior'}
              </Button>

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
                const atual = paginaAtual === pagina
                return (
                  <Button
                    key={pagina}
                    variant={atual ? 'secondary' : 'outline'}
                    size="sm"
                    aria-label={`Página ${pagina}`}
                    aria-current={atual ? 'page' : undefined}
                    onClick={() => setPaginaAtual(pagina)}
                    style={{ minWidth: '40px' }}
                  >
                    {pagina}
                  </Button>
                )
              })}

              <Button
                variant="outline"
                size="sm"
                iconRight={isMobile ? undefined : 'mdi:chevron-right'}
                icon={isMobile ? 'mdi:chevron-right' : undefined}
                iconOnly={isMobile}
                aria-label="Próxima página"
                onClick={() => setPaginaAtual(p => Math.min(totalPaginas, p + 1))}
                disabled={paginaAtual === totalPaginas}
              >
                {!isMobile && 'Próxima'}
              </Button>
            </nav>

            <span className="ds-text-body-sm" style={{ color: 'var(--color-text-muted)' }}>
              {mensalidadesFiltradas.length} mensalidade{mensalidadesFiltradas.length !== 1 ? 's' : ''}
            </span>
          </div>
        )}
      </div>
      </>)}

      {/* Modal de Confirmação de Pagamento */}
      {/* Modal de Detalhes da Mensalidade — Modal do DS */}
      <Modal
        isOpen={!!(mostrarModalDetalhes && mensalidadeDetalhes)}
        onClose={() => setMostrarModalDetalhes(false)}
        title="Detalhes da mensalidade"
        size="sm"
      >
        {mensalidadeDetalhes && (<>
            <Modal.Body>
              {/* Card de resumo da mensalidade */}
              <div style={{ border: '1px solid #e5e7eb', borderRadius: '12px', overflow: 'hidden' }}>
                {/* Hero: nome do aluno (título) + status à direita */}
                <div style={{ padding: '16px 18px', backgroundColor: '#f8fafc', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px' }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: '13px', color: '#94a3b8', marginBottom: '2px' }}>Aluno</div>
                    <div style={{ fontSize: '17px', fontWeight: 700, color: '#1e293b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {mensalidadeDetalhes.devedor?.nome || 'N/A'}
                    </div>
                  </div>
                  <div style={{ flexShrink: 0 }}>
                    {getStatusBadge(mensalidadeDetalhes.statusCalculado)}
                  </div>
                </div>

                {/* Detalhes em linhas */}
                <div style={{ padding: '4px 18px 10px' }}>
                  {(() => {
                    const efetivo = valorEfetivoMensalidade(mensalidadeDetalhes, multaJurosConfig)
                    return (
                      <>
                        <InfoRow isFirst big label="Valor" value={formatarMoeda(efetivo.base)} />
                        {(efetivo.temAcrescimo || efetivo.temDesconto) && (
                          <>
                            {efetivo.multa > 0 && <InfoRow label="Multa por atraso" valueColor="#b45309" value={`+ ${formatarMoeda(efetivo.multa)}`} />}
                            {efetivo.juros > 0 && <InfoRow label="Juros por atraso" valueColor="#b45309" value={`+ ${formatarMoeda(efetivo.juros)}`} />}
                            {efetivo.temAcrescimo && efetivo.multa === 0 && efetivo.juros === 0 && (
                              <InfoRow label="Multa/juros" valueColor="#b45309" value={`+ ${formatarMoeda(efetivo.acrescimo)}`} />
                            )}
                            {efetivo.temDesconto && (
                              <InfoRow label="Desconto concedido" valueColor="#0f766e" value={`− ${formatarMoeda(efetivo.desconto)}`} />
                            )}
                            <InfoRow
                              big
                              label={efetivo.projetado ? 'Total se pagar hoje' : 'Total pago'}
                              valueColor={efetivo.projetado ? '#b45309' : '#16a34a'}
                              value={formatarMoeda(efetivo.total)}
                            />
                          </>
                        )}
                      </>
                    )
                  })()}
                  <InfoRow label="Vencimento" value={new Date(mensalidadeDetalhes.data_vencimento + 'T00:00:00').toLocaleDateString('pt-BR')} />
                  <InfoRow label="Plano" value={mensalidadeDetalhes.devedor?.plano?.nome || '—'} />

                  {mensalidadeDetalhes.statusCalculado === 'atrasado' && (() => {
                    const hoje = new Date()
                    hoje.setHours(0, 0, 0, 0)
                    const vencimento = new Date(mensalidadeDetalhes.data_vencimento + 'T12:00:00')
                    const diffDays = Math.ceil((hoje.getTime() - vencimento.getTime()) / (1000 * 60 * 60 * 24))
                    return <InfoRow label="Dias em atraso" valueColor="#dc2626" value={`${diffDays} ${diffDays === 1 ? 'dia' : 'dias'}`} />
                  })()}

                  {mensalidadeDetalhes.data_pagamento && (
                    <InfoRow label="Data do pagamento" valueColor="#16a34a" value={new Date(mensalidadeDetalhes.data_pagamento + 'T00:00:00').toLocaleDateString('pt-BR')} />
                  )}

                  {mensalidadeDetalhes.forma_pagamento && (
                    <InfoRow label="Forma de pagamento" value={mensalidadeDetalhes.forma_pagamento} />
                  )}
                </div>
              </div>
            </Modal.Body>

            <Modal.Footer>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', width: '100%' }}>
              {/* Ações secundárias (não pago): Link e Boleto — outline neutro */}
              {mensalidadeDetalhes.status !== 'pago' && (
                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                  <Button
                    variant="outline"
                    icon="mdi:link-variant"
                    loading={gerandoLink}
                    onClick={() => handleGerarLinkPagamento(mensalidadeDetalhes)}
                    style={{ flex: 1 }}
                  >
                    {metodoPagamento === 'asaas_link' ? 'Enviar link do portal' : 'Pix da mensalidade'}
                  </Button>

                  {modoIntegracao === 'asaas' && asaasConfigurado && (
                    mensalidadeDetalhes.boletos?.length > 0 ? (
                      <Button
                        variant="outline"
                        icon="mdi:file-document-outline"
                        onClick={() => handleVisualizarBoleto(mensalidadeDetalhes)}
                        style={{ flex: 1 }}
                      >
                        Ver Boleto
                      </Button>
                    ) : (
                      <Button
                        variant="outline"
                        icon="mdi:barcode"
                        loading={gerandoBoleto}
                        onClick={() => handleGerarBoleto(mensalidadeDetalhes)}
                        style={{ flex: 1 }}
                      >
                        Gerar Boleto
                      </Button>
                    )
                  )}
                </div>
              )}

              {/* Recibo (pago) */}
              {mensalidadeDetalhes.status === 'pago' && (
                <Button
                  variant="outline"
                  icon="mdi:whatsapp"
                  loading={enviandoReciboWhatsApp}
                  fullWidth
                  onClick={() => handleEnviarReciboWhatsApp(mensalidadeDetalhes)}
                >
                  Enviar Recibo via WhatsApp
                </Button>
              )}

              {/* Ação principal: Marcar como Pago / Desfazer */}
              <Button
                variant={mensalidadeDetalhes.status === 'pago' ? 'danger-soft' : 'primary'}
                icon={mensalidadeDetalhes.status === 'pago' ? 'mdi:undo' : 'mdi:check-circle'}
                fullWidth
                onClick={marcarPagoDoModal}
              >
                {mensalidadeDetalhes.status === 'pago' ? 'Desfazer Pagamento' : 'Marcar como Pago'}
              </Button>

              {/* Pular mês — remove a do mês e já cria a do mês seguinte */}
              {podePularMes(mensalidadeDetalhes) && (
                <Button
                  variant="outline"
                  icon="mdi:calendar-remove-outline"
                  fullWidth
                  onClick={() => {
                    setMostrarModalDetalhes(false)
                    setConfirmPularMes({ show: true, mensalidade: mensalidadeDetalhes })
                  }}
                >
                  Pular Mês
                </Button>
              )}

              {/* Excluir — lançamento errado/duplicado */}
              <Button
                variant="danger-soft"
                icon="mdi:trash-can-outline"
                fullWidth
                onClick={() => {
                  setMostrarModalDetalhes(false)
                  setConfirmExcluirMensalidade({ show: true, mensalidade: mensalidadeDetalhes })
                }}
              >
                Excluir Mensalidade
              </Button>

              {/* Fechar — discreto */}
              <Button variant="ghost" fullWidth onClick={() => setMostrarModalDetalhes(false)}>
                Fechar
              </Button>
            </div>
            </Modal.Footer>
        </>)}
      </Modal>

      {/* Modal de confirmação de pagamento (baixa manual) — Modal do DS.
          A lógica é a mesma de antes; só a moldura e os campos mudaram. */}
      <Modal
        isOpen={mostrarModalConfirmacao}
        onClose={() => {
          setMostrarModalConfirmacao(false)
          setMensalidadeParaAtualizar(null)
          setFormaPagamento('')
          setBaixaMulta('0.00')
          setBaixaJuros('0.00')
          setBaixaDesconto('')
        }}
        title={novoStatusPagamento ? 'Confirmar pagamento' : 'Desfazer pagamento'}
        size="sm"
      >
        <Modal.Body>
              <p className="ds-text-body" style={{ color: 'var(--color-text-secondary)', margin: '0 0 16px 0' }}>
                {novoStatusPagamento ? (
                  <>
                    Confirmar pagamento de <strong style={{ color: 'var(--color-text-primary)' }}>
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
                  <Select
                    label="Forma de pagamento"
                    required
                    portal
                    placeholder="Selecione a forma de pagamento"
                    value={formaPagamento}
                    onChange={(v) => setFormaPagamento(v || '')}
                    options={FORMAS_PAGAMENTO_BAIXA.map(f => ({ value: f, label: f }))}
                  />

                  <div style={{ marginTop: '16px' }}>
                    <DateField
                      label="Data do pagamento"
                      required
                      value={dataBaixa}
                      onChange={alterarDataBaixa}
                      maxDate={hojeISO()}
                    />
                  </div>
                </div>
              )}

              {/* Ajustes do valor - só ao confirmar pagamento.
                  Multa/juros aparecem apenas em parcela vencida (é o que a config calcula);
                  desconto vale sempre, porque negociação acontece com parcela em dia também. */}
              {novoStatusPagamento && mensalidadeParaAtualizar && (() => {
                // Atraso medido na data do pagamento: pago antes do vencimento não tem multa
                const atrasado = !!dataBaixa && mensalidadeParaAtualizar.data_vencimento < dataBaixa
                const base = parseFloat(mensalidadeParaAtualizar.valor) || 0
                const multa = atrasado ? Math.max(0, parseFloat(baixaMulta) || 0) : 0
                const juros = atrasado ? Math.max(0, parseFloat(baixaJuros) || 0) : 0
                const bruto = Math.round((base + multa + juros) * 100) / 100
                const descontoInformado = Math.max(0, parseFloat(baixaDesconto) || 0)
                const excedeu = descontoInformado > bruto + 0.005
                const total = Math.round((bruto - Math.min(descontoInformado, bruto)) * 100) / 100
                return (
                  <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid var(--color-border-subtle)', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    {atrasado && (
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '12px' }}>
                        <Input
                          label="Multa"
                          prefix="R$"
                          type="number" min="0" step="0.01" inputMode="decimal"
                          value={baixaMulta}
                          onChange={(e) => setBaixaMulta(e.target.value)}
                        />
                        <Input
                          label="Juros"
                          prefix="R$"
                          type="number" min="0" step="0.01" inputMode="decimal"
                          value={baixaJuros}
                          onChange={(e) => setBaixaJuros(e.target.value)}
                        />
                      </div>
                    )}

                    <Input
                      label="Desconto (opcional)"
                      prefix="R$"
                      type="number" min="0" step="0.01" inputMode="decimal"
                      value={baixaDesconto}
                      placeholder="0,00"
                      onChange={(e) => setBaixaDesconto(e.target.value)}
                      error={excedeu ? `Máximo R$ ${bruto.toFixed(2)} — o desconto não pode passar do valor da parcela` : undefined}
                      helper="Abatido do valor recebido. Não altera a mensalidade dos próximos meses."
                    />

                    <div style={{ paddingTop: 12, borderTop: '1px solid var(--color-border-subtle)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span className="ds-text-body" style={{ color: 'var(--color-text-secondary)' }}>Total a receber</span>
                      <strong style={{ fontSize: 'var(--text-lg)', color: 'var(--color-text-primary)' }}>R$ {total.toFixed(2)}</strong>
                    </div>
                  </div>
                )
              })()}
        </Modal.Body>
        <Modal.Footer>
          <Button variant="outline" onClick={() => {
          setMostrarModalConfirmacao(false)
          setMensalidadeParaAtualizar(null)
          setFormaPagamento('')
          setBaixaMulta('0.00')
          setBaixaJuros('0.00')
          setBaixaDesconto('')
        }}>Cancelar</Button>
          <Button variant={novoStatusPagamento ? 'primary' : 'danger'} onClick={confirmarAlteracaoStatus}>
            {novoStatusPagamento ? 'Confirmar' : 'Desfazer'}
          </Button>
        </Modal.Footer>
      </Modal>

      {/* Modal de Sucesso de Pagamento com Opção de Recibo — Modal do DS */}
      <Modal
        isOpen={!!(mostrarModalRecibo && mensalidadePaga)}
        onClose={() => {
          setMostrarModalRecibo(false)
          setMensalidadePaga(null)
        }}
        title="Pagamento confirmado"
        size="sm"
      >
        {mensalidadePaga && (
        <Modal.Body>
          <div style={{ textAlign: 'center' }}>
            <div style={{
              width: '64px', height: '64px', borderRadius: '50%',
              backgroundColor: 'var(--success-50)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto 16px'
            }}>
              <Icon icon="mdi:check-circle" width="40" height="40" style={{ color: 'var(--color-brand-fill)' }} />
            </div>

            <p className="ds-text-body" style={{ margin: '0 0 8px 0', color: 'var(--color-text-primary)' }}>
              {mensalidadePaga.devedor?.nome || mensalidadePaga.devedores?.nome || 'Aluno'} -{' '}
              <strong>
                R$ {parseFloat((mensalidadePaga.valor_pago != null ? mensalidadePaga.valor_pago : mensalidadePaga.valor) || 0).toLocaleString('pt-BR', {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2
                })}
              </strong>
            </p>

            <p className="ds-text-body-sm" style={{ margin: '0 0 20px 0', color: 'var(--color-text-muted)' }}>
              Deseja gerar o recibo de pagamento?
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <Button variant="secondary" icon="mdi:download" fullWidth onClick={() => handleGerarRecibo('baixar')}>
                Baixar recibo
              </Button>
              <Button variant="whatsapp" icon="mdi:whatsapp" fullWidth loading={enviandoReciboWhatsApp} onClick={handleEnviarReciboWhatsApp}>
                Enviar pelo WhatsApp
              </Button>
              <Button variant="ghost" fullWidth onClick={() => {
          setMostrarModalRecibo(false)
          setMensalidadePaga(null)
        }}>
                Fechar
              </Button>
            </div>
          </div>
        </Modal.Body>
        )}
      </Modal>

      {/* Modal de Link de Pagamento PIX — Modal do DS */}
      <Modal
        isOpen={!!(mostrarModalLinkPagamento && linkPagamentoData)}
        onClose={() => {
          setMostrarModalLinkPagamento(false)
          setLinkPagamentoData(null)
          setPixCopied(false)
        }}
        title="Pix da mensalidade"
        size="sm"
      >
        {linkPagamentoData && (<>
        <Modal.Body>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', paddingBottom: '16px', borderBottom: '1px solid var(--color-border-subtle)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px' }}>
              <span className="ds-text-body" style={{ color: 'var(--color-text-muted)' }}>Aluno</span>
              <span style={{ fontWeight: 600, color: 'var(--color-text-primary)', textAlign: 'right' }}>{linkPagamentoData.cliente}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span className="ds-text-body" style={{ color: 'var(--color-text-muted)' }}>Valor</span>
              <span style={{ fontWeight: 700, color: 'var(--color-brand-fill)', fontSize: 'var(--text-xl)' }}>
                R$ {parseFloat(linkPagamentoData.valor).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span className="ds-text-body" style={{ color: 'var(--color-text-muted)' }}>Vencimento</span>
              <span style={{ fontWeight: 600, color: 'var(--color-text-primary)' }}>
                {new Date(linkPagamentoData.vencimento + 'T00:00:00').toLocaleDateString('pt-BR')}
              </span>
            </div>
          </div>

          <div style={{ padding: '20px 0', textAlign: 'center' }}>
            <p className="ds-text-body-sm" style={{ margin: '0 0 12px', color: 'var(--color-text-secondary)' }}>QR Code PIX</p>
            <div style={{
              display: 'inline-block', padding: '16px', backgroundColor: 'var(--color-bg-surface)',
              borderRadius: 'var(--radius-xl)', border: '2px solid var(--color-border-subtle)'
            }}>
              <QRCodeSVG value={linkPagamentoData.pixCode} size={180} level="M" includeMargin={false} />
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <Button
              variant={pixCopied ? 'outline' : 'secondary'}
              selected={pixCopied}
              icon={pixCopied ? 'mdi:check' : 'mdi:content-copy'}
              fullWidth
              size="lg"
              onClick={copiarPix}
            >
              {pixCopied ? 'PIX copiado!' : 'Copiar código PIX'}
            </Button>
            <Button variant="whatsapp" icon="mdi:whatsapp" fullWidth size="lg" loading={enviandoLinkWhatsApp} onClick={enviarLinkWhatsApp}>
              Enviar pelo WhatsApp
            </Button>
          </div>

          <p className="ds-text-caption" style={{ margin: '16px 0 0', textAlign: 'center', color: 'var(--warning-700)' }}>
            <Icon icon="mdi:clock-outline" width="14" style={{ verticalAlign: 'middle', marginRight: '4px' }} />
            Link válido por 24 horas
          </p>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="outline" onClick={() => {
          setMostrarModalLinkPagamento(false)
          setLinkPagamentoData(null)
          setPixCopied(false)
        }}>Fechar</Button>
        </Modal.Footer>
        </>)}
      </Modal>

      {/* Modal de Boleto Asaas — Modal do DS */}
      <Modal
        isOpen={!!(mostrarModalBoleto && boletoData)}
        onClose={() => {
          setMostrarModalBoleto(false)
          setBoletoData(null)
          setLinhaDigitavelCopied(false)
          setPixBoletoCopied(false)
        }}
        title="Boleto gerado"
        subtitle={boletoData?.cliente}
        size="md"
      >
        {boletoData && (<>
        <Modal.Body>
          <div style={{
            display: 'flex', justifyContent: 'space-between', gap: '12px',
            marginBottom: '20px', padding: '16px',
            backgroundColor: 'var(--neutral-50)', borderRadius: 'var(--radius-xl)'
          }}>
            <div>
              <p className="ds-text-caption" style={{ color: 'var(--color-text-muted)', margin: '0 0 4px 0' }}>Valor</p>
              <p style={{ fontSize: 'var(--text-3xl)', fontWeight: 700, color: 'var(--color-text-primary)', margin: 0 }}>
                R$ {parseFloat(boletoData.valor).toFixed(2)}
              </p>
            </div>
            <div style={{ textAlign: 'right' }}>
              <p className="ds-text-caption" style={{ color: 'var(--color-text-muted)', margin: '0 0 4px 0' }}>Vencimento</p>
              <p style={{ fontSize: 'var(--text-lg)', fontWeight: 600, color: 'var(--color-text-primary)', margin: 0 }}>
                {new Date(boletoData.data_vencimento + 'T00:00:00').toLocaleDateString('pt-BR')}
              </p>
            </div>
          </div>

          {boletoData.linha_digitavel && (
            <div style={{ marginBottom: '16px' }}>
              <p className="ds-input-label" style={{ margin: '0 0 8px 0' }}>
                <Icon icon="mdi:barcode" width="16" style={{ verticalAlign: 'middle', marginRight: '6px' }} />
                Linha digitável
              </p>
              <div className="ds-text-mono" style={{
                padding: '12px', backgroundColor: 'var(--neutral-100)', borderRadius: 'var(--radius-lg)',
                wordBreak: 'break-all', color: 'var(--color-text-primary)'
              }}>
                {boletoData.linha_digitavel}
              </div>
              <Button
                variant={linhaDigitavelCopied ? 'outline' : 'secondary'}
                selected={linhaDigitavelCopied}
                icon={linhaDigitavelCopied ? 'mdi:check' : 'mdi:content-copy'}
                fullWidth
                onClick={copiarLinhaDigitavel}
                style={{ marginTop: '8px' }}
              >
                {linhaDigitavelCopied ? 'Copiado!' : 'Copiar linha digitável'}
              </Button>
            </div>
          )}

          {boletoData.pix_copia_cola && (
            <div style={{ marginBottom: '16px' }}>
              <p className="ds-input-label" style={{ margin: '0 0 8px 0' }}>
                <Icon icon="mdi:qrcode" width="16" style={{ verticalAlign: 'middle', marginRight: '6px' }} />
                Pague via PIX
              </p>
              {boletoData.pix_qrcode_base64 && (
                <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '12px' }}>
                  <img
                    src={`data:image/png;base64,${boletoData.pix_qrcode_base64}`}
                    alt="QR Code PIX"
                    style={{ width: '180px', height: '180px' }}
                  />
                </div>
              )}
              <Button
                variant={pixBoletoCopied ? 'outline' : 'secondary'}
                selected={pixBoletoCopied}
                icon={pixBoletoCopied ? 'mdi:check' : 'mdi:content-copy'}
                fullWidth
                onClick={copiarPixBoleto}
              >
                {pixBoletoCopied ? 'Copiado!' : 'Copiar código PIX'}
              </Button>
            </div>
          )}

          {(boletoData.boleto_url || boletoData.invoice_url) && (
            <Button
              as="a"
              variant="outline"
              icon="mdi:file-pdf-box"
              fullWidth
              href={boletoData.boleto_url || boletoData.invoice_url}
              target="_blank"
              rel="noopener noreferrer"
              style={{ marginBottom: '16px' }}
            >
              Ver / baixar boleto em PDF
            </Button>
          )}

          <Button variant="whatsapp" icon="mdi:whatsapp" fullWidth size="lg" loading={enviandoBoletoWhatsApp} onClick={enviarBoletoWhatsApp}>
            Enviar pelo WhatsApp
          </Button>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="outline" onClick={() => {
          setMostrarModalBoleto(false)
          setBoletoData(null)
          setLinhaDigitavelCopied(false)
          setPixBoletoCopied(false)
        }}>Fechar</Button>
        </Modal.Footer>
        </>)}
      </Modal>

      {/* Modal para solicitar CPF — Modal do DS */}
      <Modal
        isOpen={mostrarModalCpf}
        onClose={() => {
          setMostrarModalCpf(false)
          setCpfInput('')
          setMensalidadeParaBoleto(null)
        }}
        title="CPF necessário"
        size="sm"
      >
        <Modal.Body>
          <p className="ds-text-body" style={{ color: 'var(--color-text-secondary)', margin: '0 0 16px 0' }}>
            O Asaas exige o CPF do aluno para emitir boletos.
            Informe o CPF de <strong style={{ color: 'var(--color-text-primary)' }}>{mensalidadeParaBoleto?.devedor?.nome}</strong>:
          </p>
          <Input
            label="CPF"
            value={cpfInput}
            onChange={(e) => setCpfInput(formatarCpf(e.target.value))}
            placeholder="000.000.000-00"
            inputMode="numeric"
            maxLength={14}
          />
        </Modal.Body>
        <Modal.Footer>
          <Button variant="outline" onClick={() => {
          setMostrarModalCpf(false)
          setCpfInput('')
          setMensalidadeParaBoleto(null)
        }}>Cancelar</Button>
          <Button
            variant="primary"
            loading={salvandoCpf}
            disabled={cpfInput.replace(/\D/g, '').length < 11}
            onClick={handleSalvarCpfEGerarBoleto}
          >
            Salvar e gerar boleto
          </Button>
        </Modal.Footer>
      </Modal>

      {/* Modal Excluir Mensalidade */}
      {(() => {
        const m = confirmExcluirMensalidade.mensalidade
        const bloqueado = exclusaoBloqueada(m)
        return (
          <ConfirmModal
            isOpen={confirmExcluirMensalidade.show}
            onClose={() => setConfirmExcluirMensalidade({ show: false, mensalidade: null })}
            onConfirm={confirmarExclusaoMensalidade}
            title={bloqueado ? 'Não dá pra excluir esta mensalidade' : 'Excluir mensalidade'}
            message={bloqueado
              ? `${m?.devedor?.nome || 'O aluno'} tem assinatura ativa e esta é a única mensalidade dele.\n\n` +
                `Excluindo, ele sai da geração automática e nunca mais é cobrado sozinho.\n\n` +
                `Se ele não treina neste mês, use "Pular mês" (tira o mês e já cria o seguinte). ` +
                `Se ele saiu de vez, desative a assinatura na ficha do aluno.`
              : `Excluir a mensalidade de ${m?.devedor?.nome || 'N/A'}?\n\n` +
                `Valor: ${formatarMoeda(m?.valor)}\nVencimento: ${formatarData(m?.data_vencimento)}\n\n` +
                `Use só para lançamento errado ou duplicado — a cobrança deste mês deixa de existir.` +
                (boletoAtivoDaMensalidade(m) ? `\n\n⚠️ A cobrança gerada no Asaas será cancelada.` : '')
            }
            confirmText={bloqueado ? 'Entendi' : 'Excluir'}
            cancelText={bloqueado ? '' : 'Cancelar'}
            type={bloqueado ? 'info' : 'danger'}
          />
        )
      })()}

      {/* Modal Pular Mês */}
      <ConfirmModal
        isOpen={confirmPularMes.show}
        onClose={() => setConfirmPularMes({ show: false, mensalidade: null })}
        onConfirm={confirmarPularMes}
        title="Pular mês"
        message={(() => {
          const m = confirmPularMes.mensalidade
          if (!m) return ''
          const proxima = calcularProximoVencimento(m.data_vencimento, m.devedor?.plano?.ciclo_cobranca)
          const temBoleto = !!boletoAtivoDaMensalidade(m)
          return `Aluno: ${m.devedor?.nome || 'N/A'}\n\n` +
            `A mensalidade de ${formatarMesAno(m.data_vencimento)} (${formatarMoeda(m.valor)}, venc. ${formatarData(m.data_vencimento)}) será removida ` +
            `e a próxima será criada para ${formatarData(proxima)}.\n\n` +
            `Use quando o aluno não treina neste mês: a cobrança deste mês para de ser enviada e o aluno continua na régua nos meses seguintes.` +
            (temBoleto ? `\n\n⚠️ Já existe cobrança gerada no Asaas para este mês — ela será cancelada.` : '')
        })()}
        confirmText="Pular mês"
        cancelText="Cancelar"
        type="warning"
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
