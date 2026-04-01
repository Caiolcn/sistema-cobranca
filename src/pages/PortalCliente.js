import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { Icon } from '@iconify/react'
import { QRCodeSVG } from 'qrcode.react'
import { gerarPixCopiaCola, gerarTxId } from '../services/pixService'
import { baixarRecibo } from '../utils/pdfGenerator'
import { FUNCTIONS_URL, SUPABASE_ANON_KEY as ANON_KEY } from '../supabaseClient'

export default function PortalCliente() {
  const { token } = useParams()
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState(null)
  const [dados, setDados] = useState(null)
  const [expandedId, setExpandedId] = useState(null)
  const [pixData, setPixData] = useState(null)
  const [pixCopied, setPixCopied] = useState(false)
  const [pagandoId, setPagandoId] = useState(null)

  // Tabs
  const [activeTab, setActiveTab] = useState('home')

  // Menu lateral
  const [menuAberto, setMenuAberto] = useState(false)

  // Agendamento (dentro do portal)
  const [agendamentoAulas, setAgendamentoAulas] = useState([])
  const [agendamentoContagem, setAgendamentoContagem] = useState({})
  const [agendamentoFixos, setAgendamentoFixos] = useState({})
  const [agendamentoFila, setAgendamentoFila] = useState({})
  const [meusAgendamentos, setMeusAgendamentos] = useState([])
  const [minhasFilas, setMinhasFilas] = useState([])
  const [agendamentoDia, setAgendamentoDia] = useState(null)
  const [agendando, setAgendando] = useState(null)
  const [cancelando, setCancelando] = useState(null)
  const [entrandoFila, setEntrandoFila] = useState(null)
  const [saindoFila, setSaindoFila] = useState(null)
  const [agendamentoTab, setAgendamentoTab] = useState('agendar') // 'agendar' | 'meus'
  const [agendamentoCarregado, setAgendamentoCarregado] = useState(false)

  // PWA Install
  const [deferredPrompt, setDeferredPrompt] = useState(null)
  const [mostrarBannerPWA, setMostrarBannerPWA] = useState(false)
  const [isIOS, setIsIOS] = useState(false)

  useEffect(() => {
    const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone
    setIsIOS(ios)

    if (isStandalone) return

    const dispensou = localStorage.getItem('pwa_banner_dispensado')
    if (dispensou) {
      const dataDispensa = new Date(dispensou)
      const agora = new Date()
      if ((agora - dataDispensa) < 7 * 24 * 60 * 60 * 1000) return
    }

    if (ios) {
      setMostrarBannerPWA(true)
      return
    }

    const handler = (e) => {
      e.preventDefault()
      setDeferredPrompt(e)
      setMostrarBannerPWA(true)
    }
    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  const instalarPWA = async () => {
    if (!deferredPrompt) return
    deferredPrompt.prompt()
    const { outcome } = await deferredPrompt.userChoice
    if (outcome === 'accepted') {
      setMostrarBannerPWA(false)
      setDeferredPrompt(null)
    }
  }

  const dispensarBannerPWA = () => {
    setMostrarBannerPWA(false)
    localStorage.setItem('pwa_banner_dispensado', new Date().toISOString())
  }

  useEffect(() => {
    carregarDados()
  }, []) // eslint-disable-line

  async function carregarDados() {
    try {
      const res = await fetch(`${FUNCTIONS_URL}/portal-dados?token=${token}`, {
        headers: { 'apikey': ANON_KEY, 'Authorization': `Bearer ${ANON_KEY}` }
      })
      if (!res.ok) throw new Error('Erro')
      const json = await res.json()
      if (json.error) { setErro(json.error); setLoading(false); return }
      setDados(json)
      // Salvar token pra redirect do PWA (cookie compartilha entre Safari e standalone)
      localStorage.setItem('portal_token', token)
      document.cookie = `portal_token=${token}; path=/; max-age=${365 * 24 * 60 * 60}; SameSite=Lax`
      setLoading(false)
    } catch {
      setErro('Erro ao carregar dados. Tente novamente.')
      setLoading(false)
    }
  }

  const handlePagar = async (mensalidade) => {
    if (expandedId === mensalidade.id) {
      setExpandedId(null); setPixData(null); setPixCopied(false); return
    }

    if (dados.asaas_configurado && dados.metodo_pagamento === 'asaas_link') {
      setPagandoId(mensalidade.id)
      setExpandedId(mensalidade.id)
      setPixData(null)
      try {
        const res = await fetch(`${FUNCTIONS_URL}/portal-pagar`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'apikey': ANON_KEY, 'Authorization': `Bearer ${ANON_KEY}` },
          body: JSON.stringify({ token, mensalidade_id: mensalidade.id })
        })
        const json = await res.json()
        if (json.success) {
          if (json.pix_copia_cola) {
            setPixData({ pixCode: json.pix_copia_cola, qrImage: json.pix_qr_code || null, invoiceUrl: json.invoice_url })
          } else if (json.invoice_url) {
            setPixData({ invoiceUrl: json.invoice_url })
            window.open(json.invoice_url, '_blank')
          }
          await carregarDados()
        } else { alert(json.error || 'Erro ao gerar pagamento'); setExpandedId(null) }
      } catch { alert('Erro ao processar pagamento'); setExpandedId(null) }
      finally { setPagandoId(null) }
      return
    }

    if (!dados.empresa.chave_pix) {
      alert('Chave PIX nao configurada. Entre em contato com o estabelecimento.'); return
    }

    const pixCode = gerarPixCopiaCola({
      chavePix: dados.empresa.chave_pix,
      valor: parseFloat(mensalidade.valor),
      nomeRecebedor: dados.empresa.nome || 'Empresa',
      cidadeRecebedor: 'SAO PAULO',
      txid: gerarTxId(mensalidade.id)
    })
    setExpandedId(mensalidade.id)
    setPixData({ pixCode })
    setPixCopied(false)
  }

  const copiarPix = async () => {
    if (!pixData?.pixCode) return
    try {
      await navigator.clipboard.writeText(pixData.pixCode)
      setPixCopied(true); setTimeout(() => setPixCopied(false), 3000)
    } catch {
      const ta = document.createElement('textarea')
      ta.value = pixData.pixCode; document.body.appendChild(ta)
      ta.select(); document.execCommand('copy'); document.body.removeChild(ta)
      setPixCopied(true); setTimeout(() => setPixCopied(false), 3000)
    }
  }

  const handleBaixarRecibo = async (mensalidade) => {
    try {
      await baixarRecibo({
        nomeEmpresa: dados.empresa.nome, nomeCliente: dados.devedor.nome,
        valor: mensalidade.valor, dataVencimento: mensalidade.data_vencimento,
        dataPagamento: mensalidade.updated_at, formaPagamento: mensalidade.forma_pagamento || 'PIX',
        chavePix: dados.empresa.chave_pix
      })
    } catch (error) { console.error('Erro ao gerar recibo:', error); alert('Erro ao gerar recibo.') }
  }

  const formatarValor = (valor) => parseFloat(valor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
  const formatarData = (data) => {
    if (!data) return '-'
    const d = new Date(data + 'T00:00:00')
    return d.toLocaleDateString('pt-BR')
  }

  const getStatusInfo = (mensalidade) => {
    if (mensalidade.status === 'pago') return { label: 'Pago', color: '#16a34a', bg: '#f0fdf4', icon: 'mdi:check-circle' }
    const h = new Date(); h.setHours(0, 0, 0, 0)
    const v = new Date(mensalidade.data_vencimento + 'T00:00:00')
    const diff = Math.floor((h - v) / (1000 * 60 * 60 * 24))
    if (v < h) return { label: 'Atrasado', color: '#dc2626', bg: '#fef2f2', icon: 'mdi:alert-circle', diasAtraso: diff }
    if (v.getTime() === h.getTime()) return { label: 'Vence hoje', color: '#f59e0b', bg: '#fffbeb', icon: 'mdi:clock-alert' }
    return { label: 'Em aberto', color: '#3b82f6', bg: '#eff6ff', icon: 'mdi:clock-outline' }
  }

  // Loading
  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{
            width: 56, height: 56, borderRadius: '50%',
            border: '3px solid rgba(255,255,255,0.1)', borderTopColor: '#22c55e',
            animation: 'spin 0.8s linear infinite', margin: '0 auto 20px'
          }} />
          <p style={{ margin: 0, color: 'rgba(255,255,255,0.6)', fontSize: 14, fontWeight: 500 }}>Carregando...</p>
          <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
        </div>
      </div>
    )
  }

  // Erro
  if (erro) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)', padding: 20 }}>
        <div style={{ textAlign: 'center', maxWidth: 400 }}>
          <div style={{
            width: 80, height: 80, borderRadius: '50%', background: 'rgba(239,68,68,0.15)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px'
          }}>
            <Icon icon="mdi:link-off" width="40" style={{ color: '#ef4444' }} />
          </div>
          <h2 style={{ margin: '0 0 8px', fontSize: 24, fontWeight: 800, color: '#fff' }}>Link invalido</h2>
          <p style={{ margin: 0, color: 'rgba(255,255,255,0.5)', fontSize: 15, lineHeight: 1.5 }}>{erro}</p>
        </div>
      </div>
    )
  }

  const hoje = new Date(); hoje.setHours(0, 0, 0, 0)
  const pendentes = dados.mensalidades.filter(m => {
    if (m.status === 'pago') return false
    const vencimento = new Date(m.data_vencimento + 'T00:00:00')
    const diffDias = Math.ceil((vencimento - hoje) / (1000 * 60 * 60 * 24))
    return diffDias <= 3
  })
  const pagas = dados.mensalidades.filter(m => m.status === 'pago')
  const temAtrasadas = pendentes.some(m => new Date(m.data_vencimento + 'T00:00:00') < hoje)
  const inicialEmpresa = (dados.empresa.nome || 'E').charAt(0).toUpperCase()
  const primeiroNome = dados.devedor.nome.split(' ')[0]

  // Stats
  const totalPago = pagas.reduce((acc, m) => acc + parseFloat(m.valor), 0)
  const presencasTotal = dados.presencas?.length || 0
  const presencasPresente = dados.presencas?.filter(p => p.presente).length || 0
  const pctFrequencia = presencasTotal > 0 ? Math.round((presencasPresente / presencasTotal) * 100) : null

  // Avisos reais do banco (vem da edge function portal-dados)
  const TIPOS_PORTAL = {
    aviso: { icon: 'mdi:alert-circle-outline', cor: '#f59e0b' },
    evento: { icon: 'mdi:trophy-outline', cor: '#8b5cf6' },
    novidade: { icon: 'mdi:plus-circle-outline', cor: '#22c55e' },
    promocao: { icon: 'mdi:tag-outline', cor: '#ef4444' },
    geral: { icon: 'mdi:chat-outline', cor: '#3b82f6' }
  }
  const avisosReais = (dados.avisos || []).map(a => {
    const tipoInfo = TIPOS_PORTAL[a.tipo] || TIPOS_PORTAL.geral
    return {
      id: a.id,
      tipo: a.tipo || 'geral',
      titulo: a.titulo,
      conteudo: a.conteudo || '',
      criado_em: a.created_at ? a.created_at.split('T')[0] : '',
      autor: dados.empresa.nome,
      icone: a.fixado ? 'mdi:pin' : tipoInfo.icon,
      cor: tipoInfo.cor,
      imagem_url: a.imagem_url || null
    }
  })

  const formatarDataRelativa = (dataStr) => {
    const data = new Date(dataStr + 'T00:00:00')
    const agora = new Date(); agora.setHours(0, 0, 0, 0)
    const diff = Math.floor((agora - data) / (1000 * 60 * 60 * 24))
    if (diff === 0) return 'Hoje'
    if (diff === 1) return 'Ontem'
    if (diff < 7) return `${diff} dias atras`
    return data.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })
  }

  // Avisos não lidos (compara com último visto salvo no localStorage)
  const ultimoAvisoVisto = localStorage.getItem(`avisos_visto_${token}`)
  const avisosNaoLidos = avisosReais.filter(a => !ultimoAvisoVisto || a.id > ultimoAvisoVisto).length

  // === AGENDAMENTO ===
  const agHeaders = { 'Content-Type': 'application/json', 'apikey': ANON_KEY, 'Authorization': `Bearer ${ANON_KEY}` }
  const slug = dados?.agendamento_slug
  const devedorId = dados?.devedor_id

  const carregarAgendamento = async () => {
    if (!slug || !devedorId) return
    try {
      const [dadosRes, idRes] = await Promise.all([
        fetch(`${FUNCTIONS_URL}/agendamento-dados?slug=${slug}`, { headers: agHeaders }),
        fetch(`${FUNCTIONS_URL}/agendamento-identificar`, {
          method: 'POST', headers: agHeaders,
          body: JSON.stringify({ slug, telefone: dados.devedor_telefone || '0', devedor_id: devedorId })
        })
      ])
      const dadosJson = await dadosRes.json()
      const idJson = await idRes.json()

      setAgendamentoAulas(dadosJson.aulas || [])
      setAgendamentoContagem(dadosJson.agendamentos_contagem || {})
      setAgendamentoFixos(dadosJson.fixos_contagem || {})
      setAgendamentoFila(dadosJson.fila_contagem || {})

      if (idJson.encontrado && !idJson.bloqueado) {
        setMeusAgendamentos(idJson.agendamentos || [])
        setMinhasFilas(idJson.filas || [])
      }
      setAgendamentoCarregado(true)
    } catch (e) { console.error('Erro carregar agendamento:', e) }
  }

  const agendarAula = async (aula, data) => {
    setAgendando(`${aula.id}_${data}`)
    try {
      const res = await fetch(`${FUNCTIONS_URL}/agendamento-agendar`, {
        method: 'POST', headers: agHeaders,
        body: JSON.stringify({ slug, devedor_id: devedorId, aula_id: aula.id, data })
      })
      const json = await res.json()
      if (json.sucesso) {
        const chave = `${aula.id}_${data}`
        setAgendamentoContagem(prev => ({ ...prev, [chave]: (prev[chave] || 0) + 1 }))
        setMeusAgendamentos(prev => [...prev, { ...json.agendamento, aula: { dia_semana: aula.dia_semana, horario: aula.horario, descricao: aula.descricao } }])
      } else {
        alert(json.error || 'Erro ao agendar')
      }
    } catch { alert('Erro ao agendar') }
    finally { setAgendando(null) }
  }

  const cancelarAgendamento = async (agendamento) => {
    setCancelando(agendamento.id)
    try {
      const res = await fetch(`${FUNCTIONS_URL}/agendamento-cancelar`, {
        method: 'POST', headers: agHeaders,
        body: JSON.stringify({ slug, devedor_id: devedorId, agendamento_id: agendamento.id })
      })
      const json = await res.json()
      if (json.sucesso) {
        const chave = `${agendamento.aula_id}_${agendamento.data}`
        setAgendamentoContagem(prev => ({ ...prev, [chave]: Math.max(0, (prev[chave] || 1) - 1) }))
        setMeusAgendamentos(prev => prev.filter(a => a.id !== agendamento.id))
      } else { alert(json.error || 'Erro ao cancelar') }
    } catch { alert('Erro ao cancelar') }
    finally { setCancelando(null) }
  }

  const entrarNaFila = async (aula, data) => {
    setEntrandoFila(`${aula.id}_${data}`)
    try {
      const res = await fetch(`${FUNCTIONS_URL}/agendamento-fila-entrar`, {
        method: 'POST', headers: agHeaders,
        body: JSON.stringify({ slug, devedor_id: devedorId, aula_id: aula.id, data })
      })
      const json = await res.json()
      if (json.sucesso) {
        setMinhasFilas(prev => [...prev, { id: json.fila_id, aula_id: aula.id, data, posicao: json.posicao, status: 'aguardando', aula: { dia_semana: aula.dia_semana, horario: aula.horario, descricao: aula.descricao } }])
        const key = `${aula.id}_${data}`
        setAgendamentoFila(prev => ({ ...prev, [key]: (prev[key] || 0) + 1 }))
      } else { alert(json.error || 'Erro ao entrar na fila') }
    } catch { alert('Erro ao entrar na fila') }
    finally { setEntrandoFila(null) }
  }

  const sairDaFila = async (fila) => {
    setSaindoFila(fila.id)
    try {
      const res = await fetch(`${FUNCTIONS_URL}/agendamento-fila-sair`, {
        method: 'POST', headers: agHeaders,
        body: JSON.stringify({ slug, devedor_id: devedorId, fila_id: fila.id })
      })
      const json = await res.json()
      if (json.sucesso) {
        setMinhasFilas(prev => prev.filter(f => f.id !== fila.id))
        const key = `${fila.aula_id}_${fila.data}`
        setAgendamentoFila(prev => ({ ...prev, [key]: Math.max(0, (prev[key] || 1) - 1) }))
      } else { alert(json.error || 'Erro') }
    } catch { alert('Erro') }
    finally { setSaindoFila(null) }
  }

  // Helpers agendamento
  const agVagasRestantes = (aulaId, data) => {
    const aula = agendamentoAulas.find(a => a.id === aulaId)
    if (!aula) return 0
    return aula.capacidade - (agendamentoFixos[aulaId] || 0) - (agendamentoContagem[`${aulaId}_${data}`] || 0)
  }
  const agJaAgendou = (aulaId, data) => meusAgendamentos.some(a => a.aula_id === aulaId && a.data === data)
  const agNaFila = (aulaId, data) => minhasFilas.find(f => f.aula_id === aulaId && f.data === data && (f.status === 'aguardando' || f.status === 'notificado'))
  const agFilaCount = (aulaId, data) => agendamentoFila[`${aulaId}_${data}`] || 0

  const gerarProximasDatasAg = () => {
    const datas = []
    const hoje = new Date()
    for (let i = 0; i < 14; i++) {
      const d = new Date(hoje)
      d.setDate(d.getDate() + i)
      if (agendamentoAulas.some(a => a.dia_semana === d.getDay())) datas.push(d)
    }
    return datas
  }

  const DIAS_SEMANA_AG = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
  const DIAS_SEMANA_FULL = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado']

  // Marcar avisos como lidos ao abrir a tab
  const handleTabChange = (tabId) => {
    setActiveTab(tabId)
    if (tabId === 'agendar' && !agendamentoCarregado) carregarAgendamento()
    if (tabId === 'feed' && avisosReais.length > 0) {
      localStorage.setItem(`avisos_visto_${token}`, avisosReais[0].id)
    }
  }

  // Tab content
  const tabs = [
    { id: 'home', icon: 'mdi:home-variant', label: 'Inicio' },
    { id: 'feed', icon: 'mdi:newspaper-variant-outline', label: 'Avisos' },
    { id: 'pagamentos', icon: 'mdi:credit-card-outline', label: 'Pagar' },
    { id: 'aulas', icon: 'mdi:calendar-check', label: 'Aulas' },
    ...(dados?.agendamento_ativo ? [{ id: 'agendar', icon: 'mdi:calendar-plus', label: 'Agendar' }] : [])
  ]

  return (
    <div style={{ minHeight: '100vh', background: '#f1f5f9', paddingBottom: 80 }}>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg) } }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(8px) } to { opacity: 1; transform: translateY(0) } }
        @keyframes expandIn { from { max-height: 0; opacity: 0 } to { max-height: 700px; opacity: 1 } }
        @keyframes pulse { 0%, 100% { transform: scale(1) } 50% { transform: scale(1.05) } }
        @keyframes shimmer { 0% { background-position: -200% 0 } 100% { background-position: 200% 0 } }
        .ptab { animation: fadeIn 0.3s ease both; }
        .ptab > *:nth-child(1) { animation: fadeIn 0.3s ease 0.05s both; }
        .ptab > *:nth-child(2) { animation: fadeIn 0.3s ease 0.1s both; }
        .ptab > *:nth-child(3) { animation: fadeIn 0.3s ease 0.15s both; }
        .ptab > *:nth-child(4) { animation: fadeIn 0.3s ease 0.2s both; }
        .ptab > *:nth-child(5) { animation: fadeIn 0.3s ease 0.25s both; }
      `}</style>

      {/* Top App Bar fixo */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 50,
        background: 'linear-gradient(135deg, #0f172a 0%, #1e3a5f 100%)',
        padding: '12px 16px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        boxShadow: '0 2px 10px rgba(0,0,0,0.2)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {dados.empresa.logo_url ? (
            <div style={{
              width: 36, height: 36, borderRadius: 10,
              background: '#fff', overflow: 'hidden',
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
            }}>
              <img src={dados.empresa.logo_url} alt={dados.empresa.nome}
                style={{ width: '100%', height: '100%', objectFit: 'contain', padding: 3 }} />
            </div>
          ) : (
            <div style={{
              width: 36, height: 36, borderRadius: 10,
              background: 'linear-gradient(135deg, #22c55e, #16a34a)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 16, fontWeight: 800, color: '#fff', flexShrink: 0
            }}>
              {inicialEmpresa}
            </div>
          )}
          <div style={{ minWidth: 0 }}>
            <div style={{
              fontSize: 15, fontWeight: 700, color: '#fff',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 200
            }}>
              {dados.empresa.nome}
            </div>
          </div>
        </div>
        {/* Avatar com dropdown */}
        <div style={{ position: 'relative' }}>
          <button
            onClick={() => setMenuAberto(!menuAberto)}
            style={{
              width: 34, height: 34, borderRadius: '50%',
              background: 'linear-gradient(135deg, #22c55e, #16a34a)',
              border: '2px solid rgba(255,255,255,0.3)',
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#fff', fontSize: 14, fontWeight: 700, padding: 0
            }}
          >
            {primeiroNome.charAt(0).toUpperCase()}
          </button>

          {/* Dropdown */}
          {menuAberto && (
            <>
              <div onClick={() => setMenuAberto(false)} style={{ position: 'fixed', inset: 0, zIndex: 199 }} />
              <div style={{
                position: 'absolute', top: 42, right: 0, zIndex: 200,
                background: '#fff', borderRadius: 12, padding: '6px',
                boxShadow: '0 4px 20px rgba(0,0,0,0.15)', border: '1px solid #e2e8f0',
                minWidth: 180, animation: 'fadeIn 0.15s ease'
              }}>
                <div style={{ padding: '10px 12px', borderBottom: '1px solid #f1f5f9' }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#0f172a' }}>{dados.devedor.nome}</div>
                  <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 1 }}>{dados.devedor.plano_nome || 'Aluno'}</div>
                </div>
                <button
                  onClick={() => { setActiveTab('perfil'); setMenuAberto(false) }}
                  style={{
                    width: '100%', padding: '10px 12px', background: 'transparent',
                    border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10,
                    borderRadius: 8, fontSize: 13, fontWeight: 500, color: '#334155'
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  <Icon icon="mdi:account-circle-outline" width="18" style={{ color: '#64748b' }} />
                  Meus Dados
                </button>
                <button
                  onClick={() => {
                    localStorage.removeItem('portal_token')
                    document.cookie = 'portal_token=; path=/; max-age=0'
                    window.location.href = '/'
                  }}
                  style={{
                    width: '100%', padding: '10px 12px', background: 'transparent',
                    border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10,
                    borderRadius: 8, fontSize: 13, fontWeight: 500, color: '#ef4444'
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = '#fef2f2'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  <Icon icon="mdi:logout" width="18" style={{ color: '#ef4444' }} />
                  Sair
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Hero section - esconde na tab feed */}
      <div style={{
        background: 'linear-gradient(135deg, #0f172a 0%, #1e3a5f 50%, #0f172a 100%)',
        padding: (activeTab === 'feed' || activeTab === 'pagamentos' || activeTab === 'aulas' || activeTab === 'agendar') ? '0' : '16px 20px 40px',
        maxHeight: (activeTab === 'feed' || activeTab === 'pagamentos' || activeTab === 'aulas' || activeTab === 'agendar') ? '0' : '300px',
        overflow: 'hidden', transition: 'all 0.3s ease',
        position: 'relative'
      }}>
        <div style={{
          position: 'absolute', top: -40, right: -40, width: 160, height: 160,
          borderRadius: '50%', background: 'rgba(34,197,94,0.08)'
        }} />
        <div style={{
          position: 'absolute', bottom: -20, left: -20, width: 100, height: 100,
          borderRadius: '50%', background: 'rgba(59,130,246,0.06)'
        }} />

        <div style={{ position: 'relative', zIndex: 1 }}>
          <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.5)', marginBottom: 2 }}>Ola,</div>
          <div style={{ fontSize: 28, fontWeight: 800, color: '#ffffff', letterSpacing: '-0.5px' }}>{primeiroNome}!</div>
        </div>

        <div style={{ marginTop: 16, position: 'relative', zIndex: 1 }}>
          {pendentes.length === 0 ? (
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              background: 'rgba(34,197,94,0.15)', backdropFilter: 'blur(8px)',
              padding: '8px 16px', borderRadius: 24, border: '1px solid rgba(34,197,94,0.2)'
            }}>
              <Icon icon="mdi:check-circle" width="18" style={{ color: '#4ade80' }} />
              <span style={{ fontSize: 13, fontWeight: 600, color: '#4ade80' }}>Tudo em dia</span>
            </div>
          ) : (
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              background: temAtrasadas ? 'rgba(239,68,68,0.15)' : 'rgba(251,191,36,0.15)',
              backdropFilter: 'blur(8px)',
              padding: '8px 16px', borderRadius: 24,
              border: `1px solid ${temAtrasadas ? 'rgba(239,68,68,0.2)' : 'rgba(251,191,36,0.2)'}`
            }}>
              <Icon icon={temAtrasadas ? 'mdi:alert-circle' : 'mdi:clock-outline'} width="18"
                style={{ color: temAtrasadas ? '#f87171' : '#fbbf24' }} />
              <span style={{ fontSize: 13, fontWeight: 600, color: temAtrasadas ? '#f87171' : '#fbbf24' }}>
                {pendentes.length} {pendentes.length === 1 ? 'pendencia' : 'pendencias'}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Content area com overlap */}
      <div style={{ maxWidth: 480, margin: '-16px auto 0', padding: '0 16px', position: 'relative', zIndex: 2 }}>

        {/* ===== TAB HOME ===== */}
        {activeTab === 'home' && (
          <div className="ptab">
            {/* Quick Stats */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
              {/* Plano card */}
              <div style={{
                background: '#fff', borderRadius: 16, padding: '16px 14px',
                boxShadow: '0 1px 3px rgba(0,0,0,0.06), 0 4px 12px rgba(0,0,0,0.04)',
                border: '1px solid rgba(0,0,0,0.04)'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                  <div style={{
                    width: 32, height: 32, borderRadius: 10,
                    background: 'linear-gradient(135deg, #dbeafe, #bfdbfe)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center'
                  }}>
                    <Icon icon="mdi:star-four-points" width="16" style={{ color: '#3b82f6' }} />
                  </div>
                  <span style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Plano</span>
                </div>
                <div style={{ fontSize: 15, fontWeight: 700, color: '#0f172a', lineHeight: 1.2 }}>
                  {dados.devedor.plano_nome || 'Sem plano'}
                </div>
                {dados.devedor.plano_valor && (
                  <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>{formatarValor(dados.devedor.plano_valor)}/mes</div>
                )}
              </div>

              {/* Próxima Aula */}
              <div onClick={() => setActiveTab('aulas')} style={{
                background: '#fff', borderRadius: 16, padding: '16px 14px',
                boxShadow: '0 1px 3px rgba(0,0,0,0.06), 0 4px 12px rgba(0,0,0,0.04)',
                border: '1px solid rgba(0,0,0,0.04)', cursor: 'pointer'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                  <div style={{
                    width: 32, height: 32, borderRadius: 10,
                    background: 'linear-gradient(135deg, #f3e8ff, #e9d5ff)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center'
                  }}>
                    <Icon icon="mdi:calendar-clock" width="16" style={{ color: '#8b5cf6' }} />
                  </div>
                  <span style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Proxima aula</span>
                </div>
                {dados.grade_horarios && dados.grade_horarios.length > 0 ? (() => {
                  const hojeDia = new Date().getDay()
                  const diasAbrev = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab']
                  for (let offset = 0; offset < 7; offset++) {
                    const dia = (hojeDia + offset) % 7
                    const aulas = dados.grade_horarios.filter(g => g.dia_semana === dia)
                    if (aulas.length > 0) {
                      const sorted = [...aulas].sort((a, b) => (a.horario || '').localeCompare(b.horario || ''))
                      const h = sorted[0].horario ? sorted[0].horario.slice(0, 5) : '--:--'
                      const label = offset === 0 ? 'Hoje' : offset === 1 ? 'Amanha' : diasAbrev[dia]
                      return (
                        <div key="prox">
                          <div style={{ fontSize: 15, fontWeight: 700, color: offset === 0 ? '#8b5cf6' : '#0f172a', lineHeight: 1.2 }}>
                            {label} as {h}
                          </div>
                          {sorted[0].descricao && (
                            <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
                              {sorted[0].descricao}
                            </div>
                          )}
                        </div>
                      )
                    }
                  }
                  return <div style={{ fontSize: 13, color: '#94a3b8' }}>Sem aulas</div>
                })() : (
                  <div style={{ fontSize: 13, color: '#94a3b8' }}>Sem aulas</div>
                )}
              </div>
            </div>

            {/* Frequencia + Aulas restantes row */}
            <div style={{ display: 'grid', gridTemplateColumns: pctFrequencia !== null && dados.devedor.aulas_restantes != null ? '1fr 1fr' : '1fr', gap: 10, marginBottom: 12 }}>
              {/* Frequencia mini */}
              {pctFrequencia !== null && (
                <div style={{
                  background: '#fff', borderRadius: 16, padding: '16px 14px',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.06), 0 4px 12px rgba(0,0,0,0.04)',
                  border: '1px solid rgba(0,0,0,0.04)'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                    <div style={{
                      width: 32, height: 32, borderRadius: 10,
                      background: `linear-gradient(135deg, ${pctFrequencia >= 75 ? '#dcfce7, #bbf7d0' : pctFrequencia >= 50 ? '#fef3c7, #fde68a' : '#fee2e2, #fecaca'})`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center'
                    }}>
                      <Icon icon="mdi:chart-arc" width="16" style={{ color: pctFrequencia >= 75 ? '#16a34a' : pctFrequencia >= 50 ? '#d97706' : '#dc2626' }} />
                    </div>
                    <span style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Frequencia</span>
                  </div>
                  <div style={{ fontSize: 28, fontWeight: 800, color: pctFrequencia >= 75 ? '#16a34a' : pctFrequencia >= 50 ? '#d97706' : '#dc2626', lineHeight: 1 }}>
                    {pctFrequencia}%
                  </div>
                  <div style={{
                    height: 4, borderRadius: 2, background: '#e5e7eb', marginTop: 8, overflow: 'hidden'
                  }}>
                    <div style={{
                      height: '100%', borderRadius: 2, transition: 'width 0.5s ease',
                      width: `${pctFrequencia}%`,
                      background: pctFrequencia >= 75 ? '#16a34a' : pctFrequencia >= 50 ? '#d97706' : '#dc2626'
                    }} />
                  </div>
                  <div style={{ fontSize: 12, color: '#64748b', marginTop: 6, fontWeight: 600 }}>
                    {presencasPresente}/{presencasTotal} aula{presencasTotal !== 1 ? 's' : ''}
                    {pctFrequencia === 100 ? ' - Nenhuma falta!' : presencasTotal - presencasPresente === 1 ? ' - 1 falta' : ` - ${presencasTotal - presencasPresente} faltas`}
                  </div>
                </div>
              )}

              {/* Aulas restantes mini */}
              {dados.devedor.aulas_restantes != null && (
                <div style={{
                  background: '#fff', borderRadius: 16, padding: '16px 14px',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.06), 0 4px 12px rgba(0,0,0,0.04)',
                  border: `1px solid ${dados.devedor.aulas_restantes <= 0 ? 'rgba(239,68,68,0.2)' : dados.devedor.aulas_restantes <= 2 ? 'rgba(217,119,6,0.2)' : 'rgba(0,0,0,0.04)'}`
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                    <div style={{
                      width: 32, height: 32, borderRadius: 10,
                      background: dados.devedor.aulas_restantes <= 0 ? 'linear-gradient(135deg, #fee2e2, #fecaca)' : dados.devedor.aulas_restantes <= 2 ? 'linear-gradient(135deg, #fef3c7, #fde68a)' : 'linear-gradient(135deg, #f3e8ff, #e9d5ff)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center'
                    }}>
                      <Icon icon="mdi:ticket-confirmation-outline" width="16" style={{
                        color: dados.devedor.aulas_restantes <= 0 ? '#dc2626' : dados.devedor.aulas_restantes <= 2 ? '#d97706' : '#8b5cf6'
                      }} />
                    </div>
                    <span style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Creditos</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 2 }}>
                    <span style={{
                      fontSize: 28, fontWeight: 800, lineHeight: 1,
                      color: dados.devedor.aulas_restantes <= 0 ? '#dc2626' : dados.devedor.aulas_restantes <= 2 ? '#d97706' : '#8b5cf6'
                    }}>
                      {dados.devedor.aulas_restantes}
                    </span>
                    <span style={{ fontSize: 14, color: '#94a3b8', fontWeight: 500 }}>/{dados.devedor.aulas_total}</span>
                  </div>
                  <div style={{
                    height: 4, borderRadius: 2, background: '#e5e7eb', marginTop: 8, overflow: 'hidden'
                  }}>
                    <div style={{
                      height: '100%', borderRadius: 2, transition: 'width 0.5s ease',
                      width: `${dados.devedor.aulas_total > 0 ? Math.max((dados.devedor.aulas_restantes / dados.devedor.aulas_total) * 100, 0) : 0}%`,
                      background: dados.devedor.aulas_restantes <= 0 ? '#dc2626' : dados.devedor.aulas_restantes <= 2 ? '#d97706' : '#8b5cf6'
                    }} />
                  </div>
                  {dados.devedor.aulas_restantes <= 0 && (
                    <div style={{ fontSize: 11, color: '#dc2626', fontWeight: 600, marginTop: 6 }}>Pacote esgotado</div>
                  )}
                </div>
              )}
            </div>

            {/* Barra de alerta de pendencias */}
            {pendentes.length > 0 && (
              <div
                onClick={() => { setActiveTab('pagamentos'); setTimeout(() => handlePagar(pendentes[0]), 150) }}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '12px 16px', borderRadius: 12, marginBottom: 12, cursor: 'pointer',
                  background: temAtrasadas ? 'linear-gradient(135deg, #fef2f2, #fee2e2)' : 'linear-gradient(135deg, #fffbeb, #fef3c7)',
                  border: `1px solid ${temAtrasadas ? '#fecaca' : '#fde68a'}`,
                  transition: 'transform 0.15s'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <Icon icon={temAtrasadas ? 'mdi:alert-circle' : 'mdi:clock-outline'} width="20"
                    style={{ color: temAtrasadas ? '#dc2626' : '#d97706' }} />
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: temAtrasadas ? '#991b1b' : '#92400e' }}>
                      {pendentes.length === 1
                        ? `Mensalidade de ${formatarValor(pendentes[0].valor)} pendente`
                        : `${pendentes.length} mensalidades pendentes`
                      }
                    </div>
                    {temAtrasadas && (
                      <div style={{ fontSize: 11, color: '#dc2626', marginTop: 1 }}>
                        {(() => { const info = getStatusInfo(pendentes[0]); return info.diasAtraso > 0 ? `${info.diasAtraso} dia${info.diasAtraso !== 1 ? 's' : ''} de atraso` : '' })()}
                      </div>
                    )}
                  </div>
                </div>
                <div style={{
                  padding: '6px 14px', borderRadius: 20, fontSize: 12, fontWeight: 700,
                  background: temAtrasadas ? '#dc2626' : '#d97706', color: '#fff',
                  whiteSpace: 'nowrap'
                }}>
                  Pagar agora
                </div>
              </div>
            )}

            {/* Ultimo aviso (se houver) */}
            {avisosReais.length > 0 && (
              <div
                onClick={() => setActiveTab('feed')}
                style={{
                  background: '#fff', borderRadius: 16, padding: '14px 16px',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.06), 0 4px 12px rgba(0,0,0,0.04)',
                  border: '1px solid rgba(0,0,0,0.04)', marginBottom: 12, cursor: 'pointer'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Icon icon="mdi:newspaper-variant-outline" width="16" style={{ color: '#3b82f6' }} />
                    <span style={{ fontSize: 12, fontWeight: 700, color: '#3b82f6', textTransform: 'uppercase', letterSpacing: '0.3px' }}>Mural</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#3b82f6', fontSize: 11, fontWeight: 600 }}>
                    {avisosReais.length > 1 && `+${avisosReais.length - 1} `}
                    Ver todos <Icon icon="mdi:chevron-right" width="14" />
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                  {avisosReais[0].imagem_url ? (
                    <img src={avisosReais[0].imagem_url} alt="" style={{
                      width: 48, height: 48, objectFit: 'cover',
                      borderRadius: 10, flexShrink: 0, border: '1px solid #e2e8f0'
                    }} />
                  ) : (
                    <div style={{
                      width: 48, height: 48, borderRadius: 10, flexShrink: 0,
                      background: `linear-gradient(135deg, ${avisosReais[0].cor}15, ${avisosReais[0].cor}08)`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      border: `1px solid ${avisosReais[0].cor}20`
                    }}>
                      <Icon icon={avisosReais[0].icone} width="20" style={{ color: avisosReais[0].cor }} />
                    </div>
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: '#0f172a', lineHeight: 1.3 }}>{avisosReais[0].titulo}</div>
                    {avisosReais[0].conteudo && (
                      <div style={{
                        fontSize: 12, color: '#94a3b8', marginTop: 2, lineHeight: 1.3,
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
                      }}>
                        {avisosReais[0].conteudo}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Card separado removido - próxima aula agora está dentro do card de frequência */}

            {/* PWA Banner */}
            {mostrarBannerPWA && (
              <div style={{
                background: 'linear-gradient(135deg, #0f172a 0%, #1e3a5f 100%)',
                borderRadius: 16, padding: '18px',
                border: '1px solid rgba(255,255,255,0.08)',
                position: 'relative', marginBottom: 12
              }}>
                <button onClick={dispensarBannerPWA} style={{
                  position: 'absolute', top: 10, right: 10, background: 'none', border: 'none',
                  cursor: 'pointer', padding: 4
                }}>
                  <Icon icon="mdi:close" width={16} style={{ color: 'rgba(255,255,255,0.3)' }} />
                </button>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{
                    width: 44, height: 44, borderRadius: 12,
                    background: 'rgba(34,197,94,0.15)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
                  }}>
                    <Icon icon="mdi:cellphone-arrow-down" width={24} style={{ color: '#4ade80' }} />
                  </div>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: '#fff' }}>Instale o app</div>
                    <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginTop: 1 }}>
                      Acesso rapido pela tela inicial
                    </div>
                  </div>
                </div>
                {isIOS ? (
                  <div style={{
                    marginTop: 12, padding: '10px 12px', background: 'rgba(255,255,255,0.06)',
                    borderRadius: 8, fontSize: 12, color: 'rgba(255,255,255,0.7)', lineHeight: 1.6
                  }}>
                    Toque em <Icon icon="mdi:export-variant" width={14} style={{ color: '#3b82f6', verticalAlign: 'middle' }} /> e depois em <strong>"Adicionar a Tela de Inicio"</strong>
                  </div>
                ) : (
                  <button onClick={instalarPWA} style={{
                    width: '100%', marginTop: 12, padding: '10px', borderRadius: 10,
                    border: 'none', background: '#22c55e', color: '#fff',
                    fontSize: 13, fontWeight: 700, cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6
                  }}>
                    <Icon icon="mdi:download" width={16} />
                    Instalar agora
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {/* ===== TAB PAGAMENTOS ===== */}
        {activeTab === 'pagamentos' && (
          <div className="ptab" style={{ marginTop: 40 }}>
            {/* Pendentes */}
            {pendentes.length > 0 ? (
              <div style={{
                background: '#fff', borderRadius: 16, padding: '20px', marginBottom: 12,
                boxShadow: '0 1px 3px rgba(0,0,0,0.06), 0 4px 12px rgba(0,0,0,0.04)',
                border: '1px solid rgba(0,0,0,0.04)'
              }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: '#0f172a', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Icon icon="mdi:clock-outline" width="20" style={{ color: '#f59e0b' }} />
                  Pendentes
                </div>
                {pendentes.map(m => {
                  const info = getStatusInfo(m)
                  const isExpanded = expandedId === m.id
                  return (
                    <div key={m.id} style={{
                      borderRadius: 14, marginBottom: 10, overflow: 'hidden',
                      border: isExpanded ? '2px solid #22c55e' : '1px solid #e2e8f0',
                      transition: 'all 0.2s ease'
                    }}>
                      <div style={{ padding: '16px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                          <span style={{ fontSize: 22, fontWeight: 800, color: '#0f172a' }}>{formatarValor(m.valor)}</span>
                          <span style={{
                            padding: '4px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600,
                            color: info.color, backgroundColor: info.bg,
                            display: 'flex', alignItems: 'center', gap: 4
                          }}>
                            <Icon icon={info.icon} width="13" /> {info.label}
                          </span>
                        </div>
                        <div style={{ fontSize: 13, color: '#64748b', display: 'flex', alignItems: 'center', gap: 4 }}>
                          <Icon icon="mdi:calendar-outline" width="14" /> Vencimento: {formatarData(m.data_vencimento)}
                        </div>
                        {info.diasAtraso > 0 && (
                          <div style={{ fontSize: 12, color: '#dc2626', fontWeight: 600, marginTop: 4 }}>
                            {info.diasAtraso} dia{info.diasAtraso !== 1 ? 's' : ''} de atraso
                          </div>
                        )}
                        <button
                          onClick={() => handlePagar(m)}
                          disabled={pagandoId === m.id}
                          style={{
                            width: '100%', padding: '14px', borderRadius: 12, marginTop: 14,
                            border: isExpanded ? '1px solid #e2e8f0' : 'none',
                            cursor: pagandoId === m.id ? 'wait' : 'pointer',
                            background: isExpanded ? '#f8fafc' : 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)',
                            color: isExpanded ? '#64748b' : '#fff',
                            fontSize: 15, fontWeight: 700,
                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                            opacity: pagandoId === m.id ? 0.7 : 1,
                            boxShadow: isExpanded ? 'none' : '0 2px 8px rgba(34,197,94,0.3)',
                            transition: 'all 0.2s ease'
                          }}
                        >
                          {pagandoId === m.id ? (
                            <><div style={{ width: 18, height: 18, borderRadius: '50%', border: '2px solid rgba(255,255,255,0.3)', borderTopColor: 'white', animation: 'spin 0.8s linear infinite' }} /> Gerando...</>
                          ) : isExpanded ? (
                            <><Icon icon="mdi:chevron-up" width="18" /> Fechar</>
                          ) : (
                            <><Icon icon="mdi:qrcode" width="18" /> Pagar agora</>
                          )}
                        </button>
                      </div>

                      {/* PIX Expandido */}
                      {isExpanded && pixData && pixData.pixCode && (
                        <div style={{
                          borderTop: '1px solid #e2e8f0', padding: '20px',
                          background: '#fafffe', animation: 'expandIn 0.3s ease-out'
                        }}>
                          {/* Valor em destaque */}
                          <div style={{ textAlign: 'center', marginBottom: 16 }}>
                            <div style={{ fontSize: 12, color: '#64748b', fontWeight: 600, marginBottom: 4 }}>Valor a pagar</div>
                            <div style={{ fontSize: 28, fontWeight: 800, color: '#0f172a' }}>{formatarValor(m.valor)}</div>
                          </div>

                          {/* Botão copiar PIX - principal */}
                          <button onClick={copiarPix} style={{
                            width: '100%', padding: '16px', borderRadius: 14, border: 'none', cursor: 'pointer',
                            background: pixCopied ? 'linear-gradient(135deg, #22c55e, #16a34a)' : 'linear-gradient(135deg, #0f172a, #1e3a5f)',
                            color: '#fff', fontSize: 16, fontWeight: 700,
                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                            boxShadow: pixCopied ? '0 4px 12px rgba(34,197,94,0.3)' : '0 4px 12px rgba(15,23,42,0.2)',
                            transition: 'all 0.2s', marginBottom: 12
                          }}>
                            <Icon icon={pixCopied ? 'mdi:check-circle' : 'mdi:content-copy'} width="20" />
                            {pixCopied ? 'Chave copiada!' : 'Copiar chave PIX'}
                          </button>

                          {/* Instruções compactas */}
                          <div style={{
                            display: 'flex', gap: 8, justifyContent: 'center', marginBottom: 16
                          }}>
                            {['1. Copie a chave', '2. Abra seu banco', '3. Pague com PIX'].map((text, i) => (
                              <div key={i} style={{
                                fontSize: 11, color: '#64748b', fontWeight: 500,
                                display: 'flex', alignItems: 'center', gap: 4
                              }}>
                                {i > 0 && <Icon icon="mdi:chevron-right" width="12" style={{ color: '#cbd5e1' }} />}
                                {text}
                              </div>
                            ))}
                          </div>

                          {/* QR Code colapsável */}
                          <details style={{ textAlign: 'center' }}>
                            <summary style={{
                              fontSize: 12, color: '#94a3b8', cursor: 'pointer', fontWeight: 600,
                              listStyle: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4
                            }}>
                              <Icon icon="mdi:qrcode" width="14" />
                              Ver QR Code
                            </summary>
                            <div style={{
                              background: '#fff', borderRadius: 12, padding: 20, display: 'inline-block',
                              border: '1px solid #e2e8f0', marginTop: 12
                            }}>
                              {pixData.qrImage ? (
                                <img src={`data:image/png;base64,${pixData.qrImage}`} alt="QR Code PIX" style={{ width: 180, height: 180 }} />
                              ) : (
                                <QRCodeSVG value={pixData.pixCode} size={180} />
                              )}
                            </div>
                          </details>
                        </div>
                      )}

                      {/* Asaas fallback */}
                      {isExpanded && pixData && !pixData.pixCode && pixData.invoiceUrl && (
                        <div style={{
                          borderTop: '1px solid #e2e8f0', padding: '24px 20px',
                          background: '#fafffe', textAlign: 'center', animation: 'expandIn 0.3s ease-out'
                        }}>
                          <Icon icon="mdi:open-in-new" width="32" style={{ color: '#3b82f6', marginBottom: 10 }} />
                          <div style={{ fontSize: 15, fontWeight: 700, color: '#0f172a', marginBottom: 4 }}>Pagamento aberto</div>
                          <div style={{ fontSize: 13, color: '#64748b', marginBottom: 16 }}>Conclua na pagina que foi aberta</div>
                          <button onClick={() => window.open(pixData.invoiceUrl, '_blank')} style={{
                            padding: '12px 24px', borderRadius: 10, border: '1px solid #e2e8f0',
                            cursor: 'pointer', background: '#fff', color: '#334155', fontSize: 14, fontWeight: 600,
                            display: 'inline-flex', alignItems: 'center', gap: 8
                          }}>
                            <Icon icon="mdi:open-in-new" width="16" />
                            Abrir novamente
                          </button>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            ) : (
              <div style={{
                background: '#fff', borderRadius: 16, padding: '32px 20px', marginBottom: 12,
                boxShadow: '0 1px 3px rgba(0,0,0,0.06)', textAlign: 'center',
                border: '1px solid rgba(0,0,0,0.04)'
              }}>
                <div style={{
                  width: 56, height: 56, borderRadius: '50%', background: '#f0fdf4',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px'
                }}>
                  <Icon icon="mdi:check-circle" width="32" style={{ color: '#22c55e' }} />
                </div>
                <div style={{ fontSize: 18, fontWeight: 700, color: '#166534' }}>Nenhuma pendencia!</div>
                <div style={{ fontSize: 13, color: '#4ade80', marginTop: 4 }}>Voce esta em dia</div>
              </div>
            )}

            {/* Historico */}
            {pagas.length > 0 && (
              <div style={{
                background: '#fff', borderRadius: 16, overflow: 'hidden',
                boxShadow: '0 1px 3px rgba(0,0,0,0.06), 0 4px 12px rgba(0,0,0,0.04)',
                border: '1px solid rgba(0,0,0,0.04)'
              }}>
                <div style={{
                  padding: '16px 20px', fontSize: 15, fontWeight: 700, color: '#0f172a',
                  display: 'flex', alignItems: 'center', gap: 8, borderBottom: '1px solid #f1f5f9'
                }}>
                  <Icon icon="mdi:receipt-text-check-outline" width="20" style={{ color: '#16a34a' }} />
                  Historico
                  <span style={{
                    background: '#f0fdf4', color: '#16a34a',
                    padding: '2px 8px', borderRadius: 12, fontSize: 11, fontWeight: 700
                  }}>{pagas.length}</span>
                </div>
                {pagas.map(m => (
                  <div key={m.id} style={{
                    padding: '14px 20px', borderBottom: '1px solid #f8fafc',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                  }}>
                    <div>
                      <div style={{ fontSize: 15, fontWeight: 700, color: '#0f172a' }}>{formatarValor(m.valor)}</div>
                      <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>{formatarData(m.data_vencimento)}</div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{
                        padding: '4px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600,
                        color: '#16a34a', backgroundColor: '#f0fdf4'
                      }}>Pago</span>
                      <button onClick={() => handleBaixarRecibo(m)} title="Baixar recibo" style={{
                        background: '#f1f5f9', border: 'none', cursor: 'pointer',
                        borderRadius: 8, padding: 8, display: 'flex', transition: 'background 0.15s'
                      }}
                        onMouseEnter={e => e.currentTarget.style.background = '#e2e8f0'}
                        onMouseLeave={e => e.currentTarget.style.background = '#f1f5f9'}
                      >
                        <Icon icon="mdi:download" width="18" style={{ color: '#64748b' }} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ===== TAB FEED/AVISOS ===== */}
        {activeTab === 'feed' && (
          <div className="ptab" style={{ marginTop: 40 }}>
            <div style={{
              background: '#fff', borderRadius: 16, padding: '20px', marginBottom: 12,
              boxShadow: '0 1px 3px rgba(0,0,0,0.06), 0 4px 12px rgba(0,0,0,0.04)',
              border: '1px solid rgba(0,0,0,0.04)'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <Icon icon="mdi:newspaper-variant-outline" width="20" style={{ color: '#8b5cf6' }} />
                <span style={{ fontSize: 15, fontWeight: 700, color: '#0f172a' }}>Mural de Avisos</span>
              </div>
              <div style={{ fontSize: 12, color: '#94a3b8' }}>Fique por dentro das novidades</div>
            </div>

            {avisosReais.map((aviso, index) => (
              <div key={aviso.id} style={{
                background: '#fff', borderRadius: 16, marginBottom: 10, overflow: 'hidden',
                boxShadow: '0 1px 3px rgba(0,0,0,0.06), 0 4px 12px rgba(0,0,0,0.04)',
                border: '1px solid rgba(0,0,0,0.04)',
                animation: `fadeIn 0.3s ease ${index * 0.05}s both`
              }}>
                {/* Barra de cor do tipo */}
                <div style={{ height: 3, background: aviso.cor }} />

                <div style={{ padding: '16px 18px' }}>
                  {/* Header do aviso */}
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                    <div style={{
                      width: 40, height: 40, borderRadius: 12,
                      background: `${aviso.cor}15`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
                    }}>
                      <Icon icon={aviso.icone} width="20" style={{ color: aviso.cor }} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        marginBottom: 2
                      }}>
                        <span style={{
                          fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px',
                          color: aviso.cor,
                          background: `${aviso.cor}12`,
                          padding: '2px 8px', borderRadius: 6
                        }}>
                          {aviso.tipo}
                        </span>
                        <span style={{ fontSize: 11, color: '#94a3b8', fontWeight: 500 }}>
                          {formatarDataRelativa(aviso.criado_em)}
                        </span>
                      </div>
                      <div style={{ fontSize: 15, fontWeight: 700, color: '#0f172a', marginTop: 4, lineHeight: 1.3 }}>
                        {aviso.titulo}
                      </div>
                    </div>
                  </div>

                  {/* Conteudo */}
                  <div style={{
                    fontSize: 13, color: '#475569', lineHeight: 1.6,
                    marginTop: 12, paddingLeft: 52
                  }}>
                    {aviso.conteudo}
                  </div>

                  {/* Imagem */}
                  {aviso.imagem_url && (
                    <div style={{ marginTop: 12, paddingLeft: 52 }}>
                      <img src={aviso.imagem_url} alt="" style={{
                        width: '100%', borderRadius: 10,
                        border: '1px solid #e2e8f0'
                      }} />
                    </div>
                  )}

                  {/* Footer do aviso */}
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    marginTop: 12, paddingLeft: 52
                  }}>
                    <div style={{
                      width: 18, height: 18, borderRadius: 6,
                      background: 'linear-gradient(135deg, #22c55e, #16a34a)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 8, fontWeight: 800, color: '#fff'
                    }}>
                      {inicialEmpresa}
                    </div>
                    <span style={{ fontSize: 11, color: '#94a3b8', fontWeight: 500 }}>{aviso.autor}</span>
                  </div>
                </div>
              </div>
            ))}

            {/* Fim dos avisos */}
            <div style={{
              textAlign: 'center', padding: '16px 0 8px'
            }}>
              <div style={{ fontSize: 12, color: '#cbd5e1' }}>Voce esta atualizado!</div>
            </div>
          </div>
        )}

        {/* ===== TAB AULAS ===== */}
        {activeTab === 'aulas' && (
          <div className="ptab" style={{ marginTop: 40 }}>
            {/* Grade de horarios */}
            {dados.grade_horarios && dados.grade_horarios.length > 0 ? (
              <div style={{
                background: '#fff', borderRadius: 16, padding: '20px', marginBottom: 12,
                boxShadow: '0 1px 3px rgba(0,0,0,0.06), 0 4px 12px rgba(0,0,0,0.04)',
                border: '1px solid rgba(0,0,0,0.04)'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                  <Icon icon="mdi:calendar-clock-outline" width="20" style={{ color: '#8b5cf6' }} />
                  <span style={{ fontSize: 15, fontWeight: 700, color: '#0f172a' }}>Minhas Aulas</span>
                  <span style={{
                    background: '#f5f3ff', color: '#8b5cf6',
                    padding: '2px 8px', borderRadius: 12, fontSize: 11, fontWeight: 700
                  }}>{dados.grade_horarios.length}</span>
                </div>
                {(() => {
                  const diasSemana = ['Domingo', 'Segunda', 'Terca', 'Quarta', 'Quinta', 'Sexta', 'Sabado']
                  const hojeDia = new Date().getDay()
                  const porDia = {}
                  dados.grade_horarios.forEach(g => {
                    if (!porDia[g.dia_semana]) porDia[g.dia_semana] = []
                    porDia[g.dia_semana].push(g)
                  })
                  const diasOrdenados = Object.keys(porDia).map(Number).sort((a, b) => {
                    return ((a - hojeDia + 7) % 7) - ((b - hojeDia + 7) % 7)
                  })
                  return diasOrdenados.map(dia => (
                    <div key={dia} style={{ marginBottom: 12 }}>
                      <div style={{
                        fontSize: 12, fontWeight: 700, marginBottom: 6,
                        color: dia === hojeDia ? '#8b5cf6' : '#64748b',
                        display: 'flex', alignItems: 'center', gap: 6,
                        textTransform: 'uppercase', letterSpacing: '0.5px'
                      }}>
                        {dia === hojeDia && <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#8b5cf6' }} />}
                        {diasSemana[dia]}
                        {dia === hojeDia && <span style={{ fontWeight: 500, color: '#8b5cf6', fontSize: 10, textTransform: 'none' }}>(hoje)</span>}
                      </div>
                      {porDia[dia].map(aula => (
                        <div key={aula.id} style={{
                          display: 'flex', alignItems: 'center', gap: 10,
                          padding: '10px 12px', borderRadius: 10,
                          background: dia === hojeDia ? 'linear-gradient(135deg, #faf5ff, #f5f3ff)' : '#f8fafc',
                          border: dia === hojeDia ? '1px solid #ede9fe' : '1px solid #f1f5f9',
                          marginBottom: 4
                        }}>
                          <span style={{ fontSize: 15, fontWeight: 700, color: dia === hojeDia ? '#8b5cf6' : '#334155', minWidth: 48 }}>
                            {aula.horario ? aula.horario.slice(0, 5) : '--:--'}
                          </span>
                          {aula.descricao && <span style={{ fontSize: 13, color: '#64748b' }}>{aula.descricao}</span>}
                        </div>
                      ))}
                    </div>
                  ))
                })()}
              </div>
            ) : (
              <div style={{
                background: '#fff', borderRadius: 16, padding: '32px 20px',
                boxShadow: '0 1px 3px rgba(0,0,0,0.06)', textAlign: 'center',
                border: '1px solid rgba(0,0,0,0.04)'
              }}>
                <Icon icon="mdi:calendar-blank-outline" width="40" style={{ color: '#cbd5e1', marginBottom: 8 }} />
                <div style={{ fontSize: 15, fontWeight: 600, color: '#64748b' }}>Nenhuma aula cadastrada</div>
              </div>
            )}

            {/* Frequencia */}
            {dados.presencas && dados.presencas.length > 0 && (
              <div style={{
                background: '#fff', borderRadius: 16, padding: '20px',
                boxShadow: '0 1px 3px rgba(0,0,0,0.06), 0 4px 12px rgba(0,0,0,0.04)',
                border: '1px solid rgba(0,0,0,0.04)'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                  <Icon icon="mdi:chart-line" width="20" style={{ color: '#f59e0b' }} />
                  <span style={{ fontSize: 15, fontWeight: 700, color: '#0f172a' }}>Frequencia</span>
                  {pctFrequencia !== null && (
                    <span style={{
                      background: pctFrequencia >= 75 ? '#f0fdf4' : pctFrequencia >= 50 ? '#fffbeb' : '#fef2f2',
                      color: pctFrequencia >= 75 ? '#16a34a' : pctFrequencia >= 50 ? '#d97706' : '#dc2626',
                      padding: '2px 8px', borderRadius: 12, fontSize: 11, fontWeight: 700
                    }}>{pctFrequencia}%</span>
                  )}
                </div>

                {/* Stats resumo */}
                <div style={{
                  display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 16
                }}>
                  <div style={{ textAlign: 'center', padding: '12px 8px', background: '#f0fdf4', borderRadius: 10 }}>
                    <div style={{ fontSize: 22, fontWeight: 800, color: '#16a34a' }}>{presencasPresente}</div>
                    <div style={{ fontSize: 11, color: '#64748b', fontWeight: 500 }}>Presencas</div>
                  </div>
                  <div style={{ textAlign: 'center', padding: '12px 8px', background: '#fef2f2', borderRadius: 10 }}>
                    <div style={{ fontSize: 22, fontWeight: 800, color: '#dc2626' }}>{presencasTotal - presencasPresente}</div>
                    <div style={{ fontSize: 11, color: '#64748b', fontWeight: 500 }}>Faltas</div>
                  </div>
                  <div style={{ textAlign: 'center', padding: '12px 8px', background: '#f8fafc', borderRadius: 10 }}>
                    <div style={{ fontSize: 22, fontWeight: 800, color: '#334155' }}>{presencasTotal}</div>
                    <div style={{ fontSize: 11, color: '#64748b', fontWeight: 500 }}>Total</div>
                  </div>
                </div>

                {/* Barra */}
                <div style={{
                  height: 6, borderRadius: 3, background: '#e5e7eb', overflow: 'hidden', marginBottom: 16
                }}>
                  <div style={{
                    height: '100%', borderRadius: 3, transition: 'width 0.5s ease',
                    width: `${pctFrequencia}%`,
                    background: pctFrequencia >= 75 ? 'linear-gradient(90deg, #22c55e, #16a34a)' : pctFrequencia >= 50 ? 'linear-gradient(90deg, #fbbf24, #d97706)' : 'linear-gradient(90deg, #f87171, #dc2626)'
                  }} />
                </div>

                {/* Lista */}
                <div style={{ maxHeight: 300, overflowY: 'auto' }}>
                  {dados.presencas.map(p => (
                    <div key={p.id} style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '8px 12px', borderRadius: 8,
                      background: p.presente ? '#f0fdf4' : '#fef2f2',
                      border: p.presente ? '1px solid #dcfce7' : '1px solid #fecaca',
                      marginBottom: 4
                    }}>
                      <Icon icon={p.presente ? 'mdi:check-circle' : 'mdi:close-circle'} width="18"
                        style={{ color: p.presente ? '#16a34a' : '#dc2626', flexShrink: 0 }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: '#334155' }}>{formatarData(p.data)}</div>
                        {p.observacao && (
                          <div style={{ fontSize: 12, color: '#64748b', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.observacao}</div>
                        )}
                      </div>
                      <span style={{ fontSize: 11, fontWeight: 600, color: p.presente ? '#16a34a' : '#dc2626' }}>
                        {p.presente ? 'Presente' : 'Falta'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ===== TAB AGENDAR ===== */}
        {activeTab === 'agendar' && dados?.agendamento_ativo && (
          <div className="ptab" style={{ padding: '16px 20px' }}>
            {/* Sub-tabs: Agendar / Meus */}
            <div style={{ display: 'flex', gap: 4, backgroundColor: '#f1f5f9', borderRadius: 10, padding: 4, marginBottom: 16 }}>
              {[{ id: 'agendar', label: 'Agendar', icon: 'mdi:calendar-plus' }, { id: 'meus', label: `Meus (${meusAgendamentos.length})`, icon: 'mdi:calendar-check' }].map(t => (
                <button key={t.id} onClick={() => setAgendamentoTab(t.id)} style={{
                  flex: 1, padding: '8px 12px', borderRadius: 8, border: 'none', cursor: 'pointer',
                  backgroundColor: agendamentoTab === t.id ? '#fff' : 'transparent',
                  color: agendamentoTab === t.id ? '#1e293b' : '#94a3b8',
                  fontWeight: agendamentoTab === t.id ? 600 : 400, fontSize: 13,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
                  boxShadow: agendamentoTab === t.id ? '0 1px 3px rgba(0,0,0,0.06)' : 'none'
                }}>
                  <Icon icon={t.icon} width={16} /> {t.label}
                </button>
              ))}
            </div>

            {agendamentoTab === 'agendar' && (
              <>
                {/* Seletor de datas */}
                <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 8, marginBottom: 16 }}>
                  {gerarProximasDatasAg().map(d => {
                    const str = d.toISOString().split('T')[0]
                    const isHoje = str === new Date().toISOString().split('T')[0]
                    const sel = agendamentoDia === str
                    return (
                      <button key={str} onClick={() => setAgendamentoDia(str)} style={{
                        minWidth: 56, padding: '8px 4px', borderRadius: 10, border: 'none', cursor: 'pointer',
                        backgroundColor: sel ? '#22c55e' : '#fff', color: sel ? '#fff' : '#1e293b',
                        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
                        boxShadow: '0 1px 3px rgba(0,0,0,0.06)', flexShrink: 0
                      }}>
                        <span style={{ fontSize: 11, fontWeight: 600, opacity: 0.7 }}>{DIAS_SEMANA_AG[d.getDay()]}</span>
                        <span style={{ fontSize: 18, fontWeight: 700 }}>{d.getDate()}</span>
                        {isHoje && <span style={{ fontSize: 9, fontWeight: 700 }}>Hoje</span>}
                      </button>
                    )
                  })}
                </div>

                {/* Aulas do dia */}
                {agendamentoDia ? (() => {
                  const dataSel = new Date(agendamentoDia + 'T12:00:00')
                  const hoje = new Date()
                  const hojeStr = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-${String(hoje.getDate()).padStart(2, '0')}`
                  const aulaDoDia = agendamentoAulas.filter(a => {
                    if (a.dia_semana !== dataSel.getDay()) return false
                    if (agendamentoDia === hojeStr && a.horario) {
                      const [h, m] = a.horario.split(':').map(Number)
                      const horarioAula = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate(), h, m)
                      if (horarioAula.getTime() - hoje.getTime() < 60 * 60 * 1000) return false
                    }
                    return true
                  })

                  return (
                    <>
                      <div style={{ fontSize: 14, fontWeight: 600, color: '#1e293b', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Icon icon="mdi:calendar" width={16} style={{ color: '#22c55e' }} />
                        {DIAS_SEMANA_FULL[dataSel.getDay()]}, {dataSel.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}
                        <span style={{ fontSize: 12, color: '#94a3b8', fontWeight: 400 }}>{aulaDoDia.length} aula{aulaDoDia.length !== 1 ? 's' : ''}</span>
                      </div>

                      {aulaDoDia.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: 32, color: '#94a3b8', fontSize: 13 }}>
                          <Icon icon="mdi:calendar-blank" width={40} style={{ color: '#e2e8f0', marginBottom: 8 }} />
                          <p style={{ margin: 0 }}>Sem aulas disponíveis</p>
                        </div>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                          {aulaDoDia.map(aula => {
                            const vagas = agVagasRestantes(aula.id, agendamentoDia)
                            const lotado = vagas <= 0
                            const agendado = agJaAgendou(aula.id, agendamentoDia)
                            const filaAtiva = agNaFila(aula.id, agendamentoDia)
                            const nFila = agFilaCount(aula.id, agendamentoDia)
                            const isAgendando = agendando === `${aula.id}_${agendamentoDia}`
                            const isEntrandoFila = entrandoFila === `${aula.id}_${agendamentoDia}`

                            return (
                              <div key={aula.id} style={{
                                background: '#fff', borderRadius: 12, padding: 14,
                                border: agendado ? '2px solid #22c55e' : filaAtiva ? '2px solid #f59e0b' : '1px solid #e2e8f0',
                                opacity: lotado && !agendado && !filaAtiva ? 0.7 : 1
                              }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                  <div>
                                    <div style={{ fontSize: 15, fontWeight: 700, color: '#1e293b' }}>{aula.horario?.substring(0, 5)}</div>
                                    {aula.descricao && <div style={{ fontSize: 12, color: '#64748b' }}>{aula.descricao}</div>}
                                  </div>
                                  <div style={{ textAlign: 'right' }}>
                                    {agendado ? (
                                      <span style={{ fontSize: 11, fontWeight: 700, color: '#22c55e', backgroundColor: '#f0fdf4', padding: '3px 8px', borderRadius: 6 }}>Agendado</span>
                                    ) : filaAtiva ? (
                                      <span style={{ fontSize: 11, fontWeight: 700, color: '#92400e', backgroundColor: '#fef3c7', padding: '3px 8px', borderRadius: 6 }}>Na fila ({filaAtiva.posicao}º)</span>
                                    ) : lotado ? (
                                      <div>
                                        <span style={{ fontSize: 11, fontWeight: 700, color: '#ef4444', backgroundColor: '#fef2f2', padding: '3px 8px', borderRadius: 6 }}>Esgotado</span>
                                        {nFila > 0 && <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 2, textAlign: 'right' }}>{nFila} na fila</div>}
                                      </div>
                                    ) : (
                                      <span style={{ fontSize: 12, color: vagas <= 3 ? '#f59e0b' : '#94a3b8', fontWeight: 600 }}>{vagas} vaga{vagas !== 1 ? 's' : ''}</span>
                                    )}
                                  </div>
                                </div>

                                {/* Botão agendar */}
                                {!agendado && !lotado && !filaAtiva && (
                                  <button onClick={() => agendarAula(aula, agendamentoDia)} disabled={isAgendando}
                                    style={{ width: '100%', marginTop: 10, padding: '10px', background: 'linear-gradient(135deg, #22c55e, #16a34a)', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                                    {isAgendando ? <div style={{ width: 16, height: 16, borderRadius: '50%', border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', animation: 'spin 0.6s linear infinite' }} /> : <><Icon icon="mdi:calendar-plus" width={16} /> Agendar</>}
                                  </button>
                                )}

                                {/* Botão fila */}
                                {lotado && !agendado && !filaAtiva && (
                                  <button onClick={() => entrarNaFila(aula, agendamentoDia)} disabled={isEntrandoFila}
                                    style={{ width: '100%', marginTop: 10, padding: '10px', background: 'linear-gradient(135deg, #f59e0b, #d97706)', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                                    {isEntrandoFila ? <div style={{ width: 16, height: 16, borderRadius: '50%', border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', animation: 'spin 0.6s linear infinite' }} /> : <><Icon icon="mdi:clock-plus-outline" width={16} /> Entrar na fila</>}
                                  </button>
                                )}

                                {/* Na fila */}
                                {filaAtiva && (
                                  <div style={{ marginTop: 10 }}>
                                    <div style={{ padding: '8px 12px', borderRadius: 8, backgroundColor: '#fef3c7', fontSize: 12, color: '#92400e', textAlign: 'center', marginBottom: 6 }}>
                                      <Icon icon="mdi:clock-outline" width={12} style={{ verticalAlign: 'middle', marginRight: 4 }} />
                                      Você é o <strong>{filaAtiva.posicao}º</strong> da fila
                                    </div>
                                    <button onClick={() => sairDaFila(filaAtiva)} disabled={saindoFila === filaAtiva.id}
                                      style={{ width: '100%', padding: '7px', backgroundColor: 'transparent', color: '#94a3b8', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
                                      {saindoFila === filaAtiva.id ? 'Saindo...' : 'Sair da fila'}
                                    </button>
                                  </div>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </>
                  )
                })() : (
                  <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}>
                    <Icon icon="mdi:gesture-tap" width={40} style={{ color: '#e2e8f0', marginBottom: 8 }} />
                    <p style={{ margin: 0, fontSize: 13 }}>Selecione um dia acima</p>
                  </div>
                )}
              </>
            )}

            {/* Meus agendamentos */}
            {agendamentoTab === 'meus' && (
              <div>
                {meusAgendamentos.length === 0 && minhasFilas.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}>
                    <Icon icon="mdi:calendar-blank" width={40} style={{ color: '#e2e8f0', marginBottom: 8 }} />
                    <p style={{ margin: 0, fontSize: 13 }}>Nenhum agendamento</p>
                  </div>
                ) : (
                  <>
                    {meusAgendamentos.map(ag => (
                      <div key={ag.id} style={{
                        background: '#fff', borderRadius: 12, padding: 14, marginBottom: 8,
                        border: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                      }}>
                        <div>
                          <div style={{ fontSize: 14, fontWeight: 700, color: '#1e293b' }}>
                            {ag.aula?.horario?.substring(0, 5)} {ag.aula?.descricao && `- ${ag.aula.descricao}`}
                          </div>
                          <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
                            {new Date(ag.data + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit' })}
                          </div>
                        </div>
                        <button onClick={() => cancelarAgendamento(ag)} disabled={cancelando === ag.id}
                          style={{ padding: '6px 12px', backgroundColor: '#fef2f2', color: '#ef4444', border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                          {cancelando === ag.id ? '...' : 'Cancelar'}
                        </button>
                      </div>
                    ))}
                    {minhasFilas.map(f => (
                      <div key={f.id} style={{
                        background: '#fefce8', borderRadius: 12, padding: 14, marginBottom: 8,
                        border: '1px solid #fde68a', display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                      }}>
                        <div>
                          <div style={{ fontSize: 14, fontWeight: 700, color: '#92400e' }}>
                            {f.aula?.horario?.substring(0, 5)} {f.aula?.descricao && `- ${f.aula.descricao}`}
                          </div>
                          <div style={{ fontSize: 12, color: '#a16207', marginTop: 2 }}>
                            Na fila ({f.posicao}º) — {new Date(f.data + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit' })}
                          </div>
                        </div>
                        <button onClick={() => sairDaFila(f)} disabled={saindoFila === f.id}
                          style={{ padding: '6px 12px', backgroundColor: '#fff', color: '#92400e', border: '1px solid #fde68a', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                          {saindoFila === f.id ? '...' : 'Sair'}
                        </button>
                      </div>
                    ))}
                  </>
                )}
              </div>
            )}
          </div>
        )}

        {/* ===== TAB PERFIL ===== */}
        {activeTab === 'perfil' && (
          <div className="ptab">
            {/* Dados pessoais */}
            <div style={{
              background: '#fff', borderRadius: 16, padding: '20px', marginBottom: 12,
              boxShadow: '0 1px 3px rgba(0,0,0,0.06), 0 4px 12px rgba(0,0,0,0.04)',
              border: '1px solid rgba(0,0,0,0.04)'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
                <Icon icon="mdi:account-circle-outline" width="20" style={{ color: '#3b82f6' }} />
                <span style={{ fontSize: 15, fontWeight: 700, color: '#0f172a' }}>Meus Dados</span>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div style={{ gridColumn: '1 / -1' }}>
                  <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 4 }}>Nome</div>
                  <div style={{ fontSize: 15, color: '#0f172a', fontWeight: 600 }}>{dados.devedor.nome}</div>
                </div>

                {dados.devedor.plano_nome && (
                  <div>
                    <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 4 }}>Plano</div>
                    <div style={{ fontSize: 14, color: '#0f172a', fontWeight: 500 }}>
                      {dados.devedor.plano_nome}
                      {dados.devedor.plano_valor && <span style={{ color: '#64748b', fontWeight: 400 }}> - {formatarValor(dados.devedor.plano_valor)}</span>}
                    </div>
                  </div>
                )}

                {dados.devedor.dia_vencimento && (
                  <div>
                    <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 4 }}>Vencimento</div>
                    <div style={{ fontSize: 14, color: '#0f172a', fontWeight: 500 }}>Todo dia {dados.devedor.dia_vencimento}</div>
                  </div>
                )}

                {dados.devedor.telefone && (
                  <div>
                    <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 4 }}>Telefone</div>
                    <div style={{ fontSize: 14, color: '#0f172a', fontWeight: 500 }}>{dados.devedor.telefone}</div>
                  </div>
                )}

                {dados.devedor.email && (
                  <div>
                    <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 4 }}>E-mail</div>
                    <div style={{ fontSize: 14, color: '#0f172a', fontWeight: 500, wordBreak: 'break-all' }}>{dados.devedor.email}</div>
                  </div>
                )}

                {dados.devedor.cpf && (
                  <div>
                    <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 4 }}>CPF</div>
                    <div style={{ fontSize: 14, color: '#0f172a', fontWeight: 500 }}>{dados.devedor.cpf}</div>
                  </div>
                )}

                {dados.devedor.data_nascimento && (
                  <div>
                    <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 4 }}>Nascimento</div>
                    <div style={{ fontSize: 14, color: '#0f172a', fontWeight: 500 }}>{formatarData(dados.devedor.data_nascimento)}</div>
                  </div>
                )}

                {dados.devedor.responsavel_nome && (
                  <div style={{ gridColumn: '1 / -1' }}>
                    <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 4 }}>Responsavel</div>
                    <div style={{ fontSize: 14, color: '#0f172a', fontWeight: 500 }}>
                      {dados.devedor.responsavel_nome}
                      {dados.devedor.responsavel_telefone && <span style={{ color: '#64748b', fontWeight: 400 }}> - {dados.devedor.responsavel_telefone}</span>}
                    </div>
                  </div>
                )}

                {dados.devedor.membro_desde && (
                  <div>
                    <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 4 }}>Aluno desde</div>
                    <div style={{ fontSize: 14, color: '#0f172a', fontWeight: 500 }}>{formatarData(dados.devedor.membro_desde)}</div>
                  </div>
                )}
              </div>
            </div>

            {/* Info da empresa */}
            <div style={{
              background: '#fff', borderRadius: 16, padding: '20px',
              boxShadow: '0 1px 3px rgba(0,0,0,0.06), 0 4px 12px rgba(0,0,0,0.04)',
              border: '1px solid rgba(0,0,0,0.04)'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                <Icon icon="mdi:store-outline" width="20" style={{ color: '#f59e0b' }} />
                <span style={{ fontSize: 15, fontWeight: 700, color: '#0f172a' }}>{dados.empresa.nome}</span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {dados.empresa.cnpj && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: '#475569' }}>
                    <Icon icon="mdi:card-account-details-outline" width="16" style={{ color: '#94a3b8', flexShrink: 0 }} />
                    {dados.empresa.cnpj}
                  </div>
                )}
                {dados.empresa.endereco && (
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, fontSize: 13, color: '#475569' }}>
                    <Icon icon="mdi:map-marker-outline" width="16" style={{ color: '#94a3b8', flexShrink: 0, marginTop: 1 }} />
                    <span>{dados.empresa.endereco}</span>
                  </div>
                )}
                {dados.empresa.telefone && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: '#475569' }}>
                    <Icon icon="mdi:phone-outline" width="16" style={{ color: '#94a3b8', flexShrink: 0 }} />
                    {dados.empresa.telefone}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div style={{ textAlign: 'center', padding: '24px 16px 16px' }}>
        <div style={{ fontSize: 11, color: '#94a3b8', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
          <Icon icon="mdi:shield-lock-outline" width="12" style={{ color: '#cbd5e1' }} />
          Powered by <span style={{ fontWeight: 700, color: '#16a34a' }}>Mensalli</span>
        </div>
      </div>

      {/* Botão flutuante WhatsApp */}
      {dados.empresa.telefone && (
        <a
          href={`https://wa.me/55${dados.empresa.telefone.replace(/\D/g, '')}`}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            position: 'fixed', bottom: 76, right: 16, zIndex: 99,
            width: 48, height: 48, borderRadius: '50%',
            background: '#25D366', color: '#fff',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 4px 12px rgba(37,211,102,0.4)',
            textDecoration: 'none', transition: 'transform 0.2s'
          }}
          onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.1)'}
          onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
        >
          <Icon icon="mdi:whatsapp" width="26" />
        </a>
      )}

      {/* Bottom Tab Bar */}
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0,
        background: '#ffffff',
        borderTop: '1px solid #e2e8f0',
        display: 'flex', justifyContent: 'space-around',
        padding: '10px 16px env(safe-area-inset-bottom, 16px)',
        zIndex: 100,
        boxShadow: '0 -2px 10px rgba(0,0,0,0.05)'
      }}>
        {tabs.map(tab => {
          const isActive = activeTab === tab.id
          const hasNotif = (tab.id === 'pagamentos' && pendentes.length > 0) || (tab.id === 'feed' && avisosNaoLidos > 0)
          return (
            <button
              key={tab.id}
              onClick={() => handleTabChange(tab.id)}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                display: 'flex', flexDirection: 'column', alignItems: 'center',
                padding: '6px 16px', position: 'relative',
                transition: 'all 0.2s ease'
              }}
            >
              <div style={{ position: 'relative' }}>
                <Icon
                  icon={tab.icon}
                  width="24"
                  style={{
                    color: isActive ? '#22c55e' : '#94a3b8',
                    transition: 'color 0.2s ease'
                  }}
                />
                {hasNotif && (
                  <div style={{
                    position: 'absolute', top: -2, right: -6,
                    width: 16, height: 16, borderRadius: '50%',
                    background: '#ef4444', color: '#fff',
                    fontSize: 9, fontWeight: 700,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    border: '2px solid #fff'
                  }}>
                    {tab.id === 'pagamentos' ? pendentes.length : avisosNaoLidos}
                  </div>
                )}
              </div>
              <span style={{
                fontSize: 10, fontWeight: isActive ? 700 : 500, marginTop: 2,
                color: isActive ? '#22c55e' : '#94a3b8',
                transition: 'color 0.2s ease'
              }}>
                {tab.label}
              </span>
              {isActive && (
                <div style={{
                  position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)',
                  width: 20, height: 3, borderRadius: 2, background: '#22c55e'
                }} />
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
