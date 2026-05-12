import { useState, useEffect } from 'react'
import { useNavigate, useLocation, Outlet, Navigate } from 'react-router-dom'
import { supabase } from './supabaseClient'
import { subscribeToWhatsAppStatus, getWhatsAppStatus } from './WhatsAppConexao'
import PerfilUsuario from './PerfilUsuario'
import TrialExpiredModal from './TrialExpiredModal'
import PlanExpirationBanner from './PlanExpirationBanner'
import { useTrialStatus } from './useTrialStatus'
import { useUser } from './contexts/UserContext'
import { usePaymentNotifications } from './hooks/usePaymentNotifications'
import { useAgendamentoNotifications } from './hooks/useAgendamentoNotifications'
import { Icon } from '@iconify/react'
import useWindowSize from './hooks/useWindowSize'
import NotificacoesDropdown, { contarNaoLidas } from './components/NotificacoesDropdown'

export default function Dashboard() {
  const navigate = useNavigate()
  const location = useLocation()
  const [mostrarPerfil, setMostrarPerfil] = useState(false)
  const [whatsappStatus, setWhatsappStatus] = useState(getWhatsAppStatus())
  const [mostrarModalTrial, setMostrarModalTrial] = useState(false)
  const [menuAberto, setMenuAberto] = useState(false)
  const [configSubmenuAberto, setConfigSubmenuAberto] = useState(false)
  const [perfilMenuAberto, setPerfilMenuAberto] = useState(false)
  const [buscaAberta, setBuscaAberta] = useState(false)
  const [buscaTexto, setBuscaTexto] = useState('')
  const [buscaResultados, setBuscaResultados] = useState([])
  const [buscaCarregando, setBuscaCarregando] = useState(false)
  const [notifAberta, setNotifAberta] = useState(false)
  const [notifCount, setNotifCount] = useState(0)

  const { isMobile, isTablet } = useWindowSize()

  // Hook para verificar status do trial
  const { isExpired, diasRestantes, planoPago, loading } = useTrialStatus()
  const { userData, userId, isAdmin, adminViewingAs, setAdminClient, realUserId } = useUser()

  // Admin: lista de clientes para o dropdown
  const [adminClientes, setAdminClientes] = useState([])
  const [adminBarVisivel, setAdminBarVisivel] = useState(true)

  // Notificacoes em tempo real de pagamentos e agendamentos
  usePaymentNotifications(realUserId || userId)
  useAgendamentoNotifications(realUserId || userId)

  // Fechar dropdown de busca ao navegar pra outra tela
  useEffect(() => {
    setBuscaAberta(false)
    setBuscaTexto('')
    setNotifAberta(false)
  }, [location.pathname])

  // Contador de notificações não-lidas (roda a cada 2 min)
  useEffect(() => {
    const uid = adminViewingAs || userId
    if (!uid) return
    let cancelado = false
    const atualizar = async () => {
      try {
        const n = await contarNaoLidas(uid)
        if (!cancelado) setNotifCount(n)
      } catch (_) {}
    }
    atualizar()
    const timer = setInterval(atualizar, 120000)
    return () => {
      cancelado = true
      clearInterval(timer)
    }
  }, [userId, adminViewingAs])

  // Busca ao vivo de alunos (debounce 250ms)
  useEffect(() => {
    const termo = buscaTexto.trim()
    if (termo.length < 2) {
      setBuscaResultados([])
      setBuscaCarregando(false)
      return
    }
    const uid = adminViewingAs || userId
    if (!uid) return
    setBuscaCarregando(true)
    const timer = setTimeout(async () => {
      const { data, error } = await supabase
        .from('devedores')
        .select('id, nome, telefone, foto_url, planos:plano_id(nome)')
        .eq('user_id', uid)
        .or('lixo.is.null,lixo.eq.false')
        .or(`nome.ilike.%${termo}%,telefone.ilike.%${termo}%`)
        .order('nome', { ascending: true })
        .limit(8)
      if (error) console.error('Busca alunos erro:', error)
      setBuscaResultados(data || [])
      setBuscaCarregando(false)
    }, 250)
    return () => clearTimeout(timer)
  }, [buscaTexto, userId, adminViewingAs])

  // Determinar tela ativa pela rota atual
  const telaAtiva = location.pathname.replace('/app/', '') || 'home'

  useEffect(() => {
    // Inscrever-se para atualizações do status do WhatsApp
    const unsubscribe = subscribeToWhatsAppStatus((newStatus) => {
      setWhatsappStatus(newStatus)
    })

    // Limpar inscrição quando o componente desmontar
    return unsubscribe
  }, [])

  // Admin: carregar lista de todos os clientes
  useEffect(() => {
    if (!isAdmin) return

    const carregarClientes = async () => {
      const { data } = await supabase
        .from('usuarios')
        .select('id, email, nome_empresa, nome_completo, plano, plano_pago, plano_vencimento, trial_fim')
        .or('role.neq.admin,role.is.null')
        .order('nome_empresa', { ascending: true, nullsFirst: false })

      if (data) setAdminClientes(data)
    }

    carregarClientes()
  }, [isAdmin])

  // Mostrar modal se trial expirou
  useEffect(() => {
    if (!loading && isExpired && !planoPago) {
      setMostrarModalTrial(true)
    }
  }, [isExpired, planoPago, loading])

  const handleLogout = async () => {
    await supabase.auth.signOut()
    window.location.reload()
  }

  // Onboarding checklist agora é mostrado na Home (não bloqueia mais)
  // A rota /app/onboarding continua funcionando por backward compatibility

  // Se trial expirou, bloquear acesso (admin nunca é bloqueado)
  if (isExpired && !planoPago && !loading && !isAdmin) {
    return (
      <>
        <div style={{ display: 'flex', backgroundColor: '#f5f7fa', height: '100vh', width: '100%', overflow: 'hidden', filter: 'blur(5px)', pointerEvents: 'none' }}>
          {/* Dashboard borrado no fundo */}
        </div>
        <TrialExpiredModal
          diasRestantes={0}
          onClose={() => {}}
          onUpgrade={() => navigate('/app/upgrade')}
        />
      </>
    )
  }

  return (
    <div style={{ display: 'flex', backgroundColor: '#f5f7fa', height: '100vh', width: '100%', overflow: 'hidden' }}>
      {/* Modal de Trial (se estiver expirando mas ainda ativo) */}
      {mostrarModalTrial && diasRestantes > 0 && diasRestantes <= 2 && (
        <TrialExpiredModal
          diasRestantes={diasRestantes}
          onClose={() => setMostrarModalTrial(false)}
          onUpgrade={() => navigate('/app/upgrade')}
        />
      )}
      {/* Overlay para fechar menu em mobile */}
      {isMobile && menuAberto && (
        <div
          onClick={() => setMenuAberto(false)}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            zIndex: 9998
          }}
        />
      )}

      {/* Topbar mobile */}
      {isMobile && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          height: '56px',
          backgroundColor: 'white',
          borderBottom: '1px solid #e5e7eb',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 16px',
          zIndex: 10000,
          boxShadow: '0 1px 3px rgba(0,0,0,0.08)'
        }}>
          <button
            onClick={() => setMenuAberto(!menuAberto)}
            style={{
              width: '40px',
              height: '40px',
              backgroundColor: 'transparent',
              border: 'none',
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              flexShrink: 0
            }}
          >
            {menuAberto ? (
              <Icon icon="mdi:close" width="24" height="24" color="#333" />
            ) : (
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M3 6H21M3 12H21M3 18H21" stroke="#333" strokeWidth="2" strokeLinecap="round"/>
              </svg>
            )}
          </button>
          <img
            src="/logo-f.png"
            alt="Mensalli"
            style={{ height: '28px', objectFit: 'contain' }}
          />
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
            <button
              onClick={() => setBuscaAberta(true)}
              title="Buscar"
              style={{
                width: '40px',
                height: '40px',
                backgroundColor: 'transparent',
                border: 'none',
                borderRadius: '8px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                color: '#333'
              }}
            >
              <Icon icon="fluent:search-20-regular" width="22" height="22" />
            </button>
            <button
              onClick={() => navigate('/app/ajuda')}
              title="Ajuda"
              style={{
                width: '40px',
                height: '40px',
                backgroundColor: 'transparent',
                border: 'none',
                borderRadius: '8px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                color: '#333'
              }}
            >
              <Icon icon="fluent:question-circle-20-regular" width="22" height="22" />
            </button>
          </div>
        </div>
      )}

      {/* Dropdown de busca no mobile */}
      {isMobile && buscaAberta && (
        <>
          <div
            onClick={() => { setBuscaAberta(false); setBuscaTexto('') }}
            style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.35)', zIndex: 10000 }}
          />
          <div style={{
            position: 'fixed',
            top: '64px',
            left: '8px',
            right: '8px',
            maxHeight: 'calc(100vh - 80px)',
            backgroundColor: 'white',
            borderRadius: '12px',
            border: '1px solid #e5e7eb',
            boxShadow: '0 16px 40px rgba(0,0,0,0.18)',
            zIndex: 10001,
            display: 'flex',
            flexDirection: 'column'
          }}>
            <div style={{
              padding: '10px',
              borderBottom: '1px solid #f0f0f0',
              flexShrink: 0
            }}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '8px 12px',
                backgroundColor: '#f5f7fa',
                borderRadius: '8px',
                border: '1px solid #e5e7eb'
              }}>
                <Icon icon="fluent:search-20-regular" width="18" height="18" color="#999" />
                <input
                  autoFocus
                  placeholder="Buscar aluno por nome ou telefone..."
                  value={buscaTexto}
                  onChange={(e) => setBuscaTexto(e.target.value)}
                  style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', fontSize: '16px', color: '#333' }}
                />
                {buscaTexto && (
                  <Icon
                    icon="mdi:close-circle"
                    width="18"
                    height="18"
                    color="#999"
                    style={{ cursor: 'pointer' }}
                    onClick={() => setBuscaTexto('')}
                  />
                )}
              </div>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '8px' }}>
            {buscaTexto.trim().length >= 2 && (
              <>
                <div style={{ padding: '8px 12px 4px', fontSize: '11px', fontWeight: '700', color: '#999', letterSpacing: '0.5px' }}>
                  ALUNOS
                </div>
                {buscaCarregando && (
                  <div style={{ padding: '16px', fontSize: '14px', color: '#999', textAlign: 'center' }}>
                    Buscando...
                  </div>
                )}
                {!buscaCarregando && buscaResultados.length === 0 && (
                  <div style={{ padding: '16px', fontSize: '14px', color: '#999', textAlign: 'center' }}>
                    Nenhum aluno encontrado
                  </div>
                )}
                {!buscaCarregando && buscaResultados.map((aluno) => (
                  <div
                    key={aluno.id}
                    onClick={() => {
                      navigate(`/app/clientes?abrir=${aluno.id}`)
                      setBuscaAberta(false)
                      setBuscaTexto('')
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                      padding: '12px',
                      borderRadius: '8px',
                      cursor: 'pointer'
                    }}
                  >
                    {aluno.foto_url ? (
                      <img src={aluno.foto_url} alt={aluno.nome} style={{ width: '40px', height: '40px', borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
                    ) : (
                      <div style={{ width: '40px', height: '40px', borderRadius: '50%', backgroundColor: '#344848', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px', fontWeight: '600', flexShrink: 0 }}>
                        {(aluno.nome || '?').charAt(0).toUpperCase()}
                      </div>
                    )}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '14px', fontWeight: '600', color: '#111', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {aluno.nome}
                      </div>
                      <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '2px' }}>
                        {aluno.telefone || 'Sem telefone'}{aluno.planos?.nome ? ` · ${aluno.planos.nome}` : ''}
                      </div>
                    </div>
                  </div>
                ))}
                <div style={{ height: '1px', backgroundColor: '#f0f0f0', margin: '8px' }} />
              </>
            )}
            <div style={{ padding: '8px 12px 4px', fontSize: '11px', fontWeight: '700', color: '#999', letterSpacing: '0.5px' }}>
              AÇÕES RÁPIDAS
            </div>
            {[
              { icon: 'fluent:person-add-20-regular', cor: '#3b82f6', bg: '#eff6ff', titulo: 'Novo Aluno', sub: 'Cadastrar aluno e mensalidade', acao: () => navigate('/app/clientes?novo=true') },
              { icon: 'fluent:receipt-add-20-regular', cor: '#ef4444', bg: '#fef2f2', titulo: 'Nova Despesa', sub: 'Registrar uma despesa do mês', acao: () => navigate('/app/financeiro?novadespesa=true') },
              { icon: 'fluent:chat-20-regular', cor: '#f59e0b', bg: '#fffbeb', titulo: 'CRM de Leads', sub: 'Ver conversas e leads do bot', acao: () => navigate('/app/crm') },
              { icon: 'fluent:people-24-regular', cor: '#8b5cf6', bg: '#f5f3ff', titulo: 'Alunos', sub: 'Lista completa de alunos', acao: () => navigate('/app/clientes') },
              { icon: 'fluent:calendar-20-regular', cor: '#ec4899', bg: '#fdf2f8', titulo: 'Horários', sub: 'Grade de aulas da semana', acao: () => navigate('/app/horarios') },
              { icon: 'fluent:money-20-regular', cor: '#059669', bg: '#ecfdf5', titulo: 'Financeiro', sub: 'Cobranças, recebimentos e despesas', acao: () => navigate('/app/financeiro') },
              { icon: 'fluent:settings-20-regular', cor: '#6b7280', bg: '#f3f4f6', titulo: 'Configurações', sub: 'Empresa, plano e integrações', acao: () => navigate('/app/configuracao') },
            ].map((item, idx) => (
              <div
                key={idx}
                onClick={() => { item.acao(); setBuscaAberta(false); setBuscaTexto('') }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  padding: '12px',
                  borderRadius: '8px',
                  cursor: 'pointer'
                }}
              >
                <div style={{
                  width: '40px',
                  height: '40px',
                  borderRadius: '8px',
                  backgroundColor: item.bg,
                  color: item.cor,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0
                }}>
                  <Icon icon={item.icon} width="22" height="22" />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '14px', fontWeight: '600', color: '#111' }}>
                    {item.titulo}
                  </div>
                  <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '1px' }}>
                    {item.sub}
                  </div>
                </div>
              </div>
            ))}
            </div>
          </div>
        </>
      )}

      {/* Menu lateral */}
      <div style={{
        width: isMobile ? '260px' : '70px',
        maxWidth: isMobile ? '85vw' : '70px',
        backgroundColor: 'white',
        borderRight: '1px solid #e0e0e0',
        display: 'flex',
        flexDirection: 'column',
        alignItems: isMobile ? 'flex-start' : 'center',
        justifyContent: 'space-between',
        paddingTop: isMobile ? '64px' : '20px',
        paddingBottom: '20px',
        paddingLeft: isMobile ? '16px' : '0',
        paddingRight: isMobile ? '16px' : '0',
        height: '100vh',
        position: 'fixed',
        left: isMobile ? (menuAberto ? '0' : '-260px') : '0',
        top: 0,
        zIndex: 9999,
        transition: 'left 0.3s ease',
        boxShadow: isMobile && menuAberto ? '4px 0 20px rgba(0,0,0,0.15)' : 'none'
      }}>
        {/* Ícones principais do menu */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: isMobile ? '8px' : '25px', width: isMobile ? '100%' : 'auto' }}>
          {/* Home */}
          <div
            className={!isMobile ? 'sidebar-tooltip' : ''}
            data-tooltip="Início"
            onClick={() => { navigate('/app/home'); if (isMobile) setMenuAberto(false) }}
            style={{
              width: isMobile ? '100%' : '40px',
              height: '40px',
              backgroundColor: telaAtiva === 'home' ? '#333' : 'transparent',
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: isMobile ? 'flex-start' : 'center',
              gap: isMobile ? '12px' : '0',
              paddingLeft: isMobile ? '12px' : '0',
              color: telaAtiva === 'home' ? 'white' : '#666',
              fontSize: '20px',
              cursor: 'pointer',
              transition: 'all 0.2s'
            }}
            onMouseEnter={(e) => {
              if (telaAtiva !== 'home') e.currentTarget.style.backgroundColor = '#f5f5f5'
            }}
            onMouseLeave={(e) => {
              if (telaAtiva !== 'home') e.currentTarget.style.backgroundColor = 'transparent'
            }}
          >
            <Icon icon="material-symbols-light:home-outline-rounded" width="22" height="22" />
            {isMobile && <span style={{ fontSize: '14px', fontWeight: '500' }}>Início</span>}
          </div>

          {/* Horários */}
          <div
            className={!isMobile ? 'sidebar-tooltip' : ''}
            data-tooltip="Horários"
            onClick={() => { navigate('/app/horarios'); if (isMobile) setMenuAberto(false) }}
            style={{
              width: isMobile ? '100%' : '40px',
              height: '40px',
              backgroundColor: telaAtiva === 'horarios' ? '#333' : 'transparent',
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: isMobile ? 'flex-start' : 'center',
              gap: isMobile ? '12px' : '0',
              paddingLeft: isMobile ? '12px' : '0',
              color: telaAtiva === 'horarios' ? 'white' : '#666',
              fontSize: '20px',
              cursor: 'pointer',
              transition: 'all 0.2s'
            }}
            onMouseEnter={(e) => {
              if (telaAtiva !== 'horarios') e.currentTarget.style.backgroundColor = '#f5f5f5'
            }}
            onMouseLeave={(e) => {
              if (telaAtiva !== 'horarios') e.currentTarget.style.backgroundColor = 'transparent'
            }}
          >
            <Icon icon="fluent:calendar-20-regular" width="22" height="22" />
            {isMobile && <span style={{ fontSize: '14px', fontWeight: '500' }}>Horários</span>}
          </div>

          {/* Clientes */}
          <div
            className={!isMobile ? 'sidebar-tooltip' : ''}
            data-tooltip="Alunos"
            onClick={() => { navigate('/app/clientes'); if (isMobile) setMenuAberto(false) }}
            style={{
              width: isMobile ? '100%' : '40px',
              height: '40px',
              backgroundColor: telaAtiva === 'clientes' ? '#333' : 'transparent',
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: isMobile ? 'flex-start' : 'center',
              gap: isMobile ? '12px' : '0',
              paddingLeft: isMobile ? '12px' : '0',
              color: telaAtiva === 'clientes' ? 'white' : '#666',
              fontSize: '20px',
              cursor: 'pointer',
              transition: 'all 0.2s'
            }}
            onMouseEnter={(e) => {
              if (telaAtiva !== 'clientes') e.currentTarget.style.backgroundColor = '#f5f5f5'
            }}
            onMouseLeave={(e) => {
              if (telaAtiva !== 'clientes') e.currentTarget.style.backgroundColor = 'transparent'
            }}
          >
            <Icon icon="fluent:people-24-regular" width="22" height="22" />
            {isMobile && <span style={{ fontSize: '14px', fontWeight: '500' }}>Alunos</span>}
          </div>

          {/* Financeiro */}
          <div
            className={!isMobile ? 'sidebar-tooltip' : ''}
            data-tooltip="Financeiro"
            onClick={() => { navigate('/app/financeiro'); if (isMobile) setMenuAberto(false) }}
            style={{
              width: isMobile ? '100%' : '40px',
              height: '40px',
              backgroundColor: telaAtiva === 'financeiro' ? '#333' : 'transparent',
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: isMobile ? 'flex-start' : 'center',
              gap: isMobile ? '12px' : '0',
              paddingLeft: isMobile ? '12px' : '0',
              color: telaAtiva === 'financeiro' ? 'white' : '#666',
              fontSize: '20px',
              cursor: 'pointer',
              transition: 'all 0.2s'
            }}
            onMouseEnter={(e) => {
              if (telaAtiva !== 'financeiro') e.currentTarget.style.backgroundColor = '#f5f5f5'
            }}
            onMouseLeave={(e) => {
              if (telaAtiva !== 'financeiro') e.currentTarget.style.backgroundColor = 'transparent'
            }}
          >
            <Icon icon="solar:chat-round-money-outline" width="22" height="22" />
            {isMobile && <span style={{ fontSize: '14px', fontWeight: '500' }}>Financeiro</span>}
          </div>

          {/* Relatórios */}
          <div
            className={!isMobile ? 'sidebar-tooltip' : ''}
            data-tooltip="Relatórios"
            onClick={() => { navigate('/app/relatorios'); if (isMobile) setMenuAberto(false) }}
            style={{
              width: isMobile ? '100%' : '40px',
              height: '40px',
              backgroundColor: telaAtiva === 'relatorios' ? '#333' : 'transparent',
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: isMobile ? 'flex-start' : 'center',
              gap: isMobile ? '12px' : '0',
              paddingLeft: isMobile ? '12px' : '0',
              color: telaAtiva === 'relatorios' ? 'white' : '#666',
              fontSize: '20px',
              cursor: 'pointer',
              transition: 'all 0.2s'
            }}
            onMouseEnter={(e) => {
              if (telaAtiva !== 'relatorios') e.currentTarget.style.backgroundColor = '#f5f5f5'
            }}
            onMouseLeave={(e) => {
              if (telaAtiva !== 'relatorios') e.currentTarget.style.backgroundColor = 'transparent'
            }}
          >
            <Icon icon="fluent:chart-multiple-20-regular" width="22" height="22" />
            {isMobile && <span style={{ fontSize: '14px', fontWeight: '500' }}>Relatórios</span>}
          </div>

          {/* WhatsApp */}
          <div
            className={!isMobile ? 'sidebar-tooltip' : ''}
            data-tooltip="WhatsApp"
            onClick={() => { navigate('/app/whatsapp'); if (isMobile) setMenuAberto(false) }}
            style={{
              width: isMobile ? '100%' : '40px',
              height: '40px',
              backgroundColor: telaAtiva === 'whatsapp' ? '#333' : 'transparent',
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: isMobile ? 'flex-start' : 'center',
              gap: isMobile ? '12px' : '0',
              paddingLeft: isMobile ? '12px' : '0',
              color: telaAtiva === 'whatsapp' ? 'white' : '#666',
              fontSize: '20px',
              cursor: 'pointer',
              transition: 'all 0.2s',
              position: 'relative'
            }}
            onMouseEnter={(e) => {
              if (telaAtiva !== 'whatsapp') e.currentTarget.style.backgroundColor = '#f5f5f5'
            }}
            onMouseLeave={(e) => {
              if (telaAtiva !== 'whatsapp') e.currentTarget.style.backgroundColor = 'transparent'
            }}
          >
            <div style={{ position: 'relative' }}>
              <Icon icon="mdi:whatsapp" width="22" height="22" />
              {/* Indicador de status */}
              <div style={{
                position: 'absolute',
                top: '-2px',
                right: '-2px',
                width: '10px',
                height: '10px',
                borderRadius: '50%',
                backgroundColor: whatsappStatus === 'connected' ? '#4CAF50' :
                               whatsappStatus === 'connecting' ? '#ff9800' :
                               '#f44336',
                boxShadow: '0 0 4px rgba(0,0,0,0.3)'
              }} />
            </div>
            {isMobile && <span style={{ fontSize: '14px', fontWeight: '500' }}>WhatsApp</span>}
          </div>

          {/* CRM */}
          <div
            className={!isMobile ? 'sidebar-tooltip' : ''}
            data-tooltip="CRM"
            onClick={() => { navigate('/app/crm'); if (isMobile) setMenuAberto(false) }}
            style={{
              width: isMobile ? '100%' : '40px',
              height: '40px',
              backgroundColor: telaAtiva === 'crm' ? '#333' : 'transparent',
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: isMobile ? 'flex-start' : 'center',
              gap: isMobile ? '12px' : '0',
              paddingLeft: isMobile ? '12px' : '0',
              color: telaAtiva === 'crm' ? 'white' : '#666',
              fontSize: '20px',
              cursor: 'pointer',
              transition: 'all 0.2s'
            }}
            onMouseEnter={(e) => {
              if (telaAtiva !== 'crm') e.currentTarget.style.backgroundColor = '#f5f5f5'
            }}
            onMouseLeave={(e) => {
              if (telaAtiva !== 'crm') e.currentTarget.style.backgroundColor = 'transparent'
            }}
          >
            <Icon icon="fluent:people-team-20-regular" width="22" height="22" />
            {isMobile && <span style={{ fontSize: '14px', fontWeight: '500' }}>CRM</span>}
          </div>

          {/* Gerador de Posts IA — WIP, oculto */}
          {false && (
          <div
            className={!isMobile ? 'sidebar-tooltip' : ''}
            data-tooltip="Gerador IA"
            onClick={() => { navigate('/app/posts'); if (isMobile) setMenuAberto(false) }}
            style={{
              width: isMobile ? '100%' : '40px',
              height: '40px',
              backgroundColor: telaAtiva === 'posts' ? '#333' : 'transparent',
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: isMobile ? 'flex-start' : 'center',
              gap: isMobile ? '12px' : '0',
              paddingLeft: isMobile ? '12px' : '0',
              color: telaAtiva === 'posts' ? 'white' : '#666',
              fontSize: '20px',
              cursor: 'pointer',
              transition: 'all 0.2s'
            }}
            onMouseEnter={(e) => {
              if (telaAtiva !== 'posts') e.currentTarget.style.backgroundColor = '#f5f5f5'
            }}
            onMouseLeave={(e) => {
              if (telaAtiva !== 'posts') e.currentTarget.style.backgroundColor = 'transparent'
            }}
          >
            <Icon icon="mdi:auto-fix" width="22" height="22" />
            {isMobile && <span style={{ fontSize: '14px', fontWeight: '500' }}>Gerador IA</span>}
          </div>
          )}

          {/* Configuração (só no mobile — no desktop fica no ícone de engrenagem da top bar) */}
          {isMobile && (
            /* Mobile: Menu com submenu expansível */
            <div style={{ width: '100%' }}>
              <div
                onClick={() => setConfigSubmenuAberto(!configSubmenuAberto)}
                style={{
                  width: '100%',
                  height: '40px',
                  backgroundColor: telaAtiva === 'configuracao' ? '#333' : 'transparent',
                  borderRadius: '8px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  paddingLeft: '12px',
                  paddingRight: '12px',
                  color: telaAtiva === 'configuracao' ? 'white' : '#666',
                  fontSize: '20px',
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <Icon icon="fluent:settings-20-regular" width="22" height="22" />
                  <span style={{ fontSize: '14px', fontWeight: '500' }}>Configurações</span>
                </div>
                <Icon
                  icon={configSubmenuAberto ? "mdi:chevron-up" : "mdi:chevron-down"}
                  width="20"
                  height="20"
                />
              </div>

              {/* Submenu de Configurações */}
              {configSubmenuAberto && (
                <div style={{
                  marginTop: '4px',
                  marginLeft: '12px',
                  paddingLeft: '12px',
                  borderLeft: '2px solid #e0e0e0'
                }}>
                  {[
                    { id: 'empresa', label: 'Dados da Empresa', icon: 'mdi:office-building-outline' },
                    { id: 'planos', label: 'Planos', icon: 'mdi:package-variant-closed' },
                    { id: 'integracoes', label: 'Integrações', icon: 'mdi:connection' },
                    { id: 'uso', label: 'Uso do Sistema', icon: 'mdi:chart-box-outline' },
                    { id: 'upgrade', label: 'Upgrade de Plano', icon: 'mdi:rocket-launch-outline' },
                    { id: 'agendamento', label: 'Agendamento Online', icon: 'mdi:calendar-cursor' },
                    { id: 'landing', label: 'Site', icon: 'mdi:web' },
                    { id: 'anamnese', label: 'Anamnese', icon: 'mdi:clipboard-text-outline' },
                    { id: 'contratos', label: 'Contratos', icon: 'mdi:file-document-outline' }
                  ].map((item) => (
                    <div
                      key={item.id}
                      onClick={() => {
                        navigate(`/app/configuracao?aba=${item.id}`);
                        setMenuAberto(false);
                        setConfigSubmenuAberto(false);
                      }}
                      style={{
                        padding: '10px 12px',
                        borderRadius: '6px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '10px',
                        cursor: 'pointer',
                        color: '#666',
                        fontSize: '13px',
                        marginBottom: '2px',
                        transition: 'background-color 0.2s'
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f5f5f5'}
                      onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                    >
                      <Icon icon={item.icon} width="18" height="18" />
                      <span>{item.label}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Ícones inferiores: Ajuda, Perfil, Sair */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: isMobile ? '8px' : '15px', alignItems: isMobile ? 'flex-start' : 'center', width: isMobile ? '100%' : 'auto' }}>
          {/* Divisória */}
          <div style={{
            width: isMobile ? '100%' : '30px',
            height: '1px',
            backgroundColor: '#e0e0e0'
          }} />

          {/* Ajuda */}
          <div
            className={!isMobile ? 'sidebar-tooltip' : ''}
            data-tooltip="Ajuda"
            onClick={() => { navigate('/app/ajuda'); if (isMobile) setMenuAberto(false) }}
            style={{
              width: isMobile ? '100%' : '40px',
              height: '40px',
              backgroundColor: telaAtiva === 'ajuda' ? '#333' : 'transparent',
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: isMobile ? 'flex-start' : 'center',
              gap: isMobile ? '12px' : '0',
              paddingLeft: isMobile ? '12px' : '0',
              color: telaAtiva === 'ajuda' ? 'white' : '#666',
              fontSize: '20px',
              cursor: 'pointer',
              transition: 'all 0.2s'
            }}
            onMouseEnter={(e) => {
              if (telaAtiva !== 'ajuda') e.currentTarget.style.backgroundColor = '#f5f5f5'
            }}
            onMouseLeave={(e) => {
              if (telaAtiva !== 'ajuda') e.currentTarget.style.backgroundColor = 'transparent'
            }}
          >
            <Icon icon="fluent:question-circle-20-regular" width="22" height="22" />
            {isMobile && <span style={{ fontSize: '14px', fontWeight: '500' }}>Ajuda</span>}
          </div>

          {/* Perfil */}
          <div style={{ position: 'relative' }}>
            <div
              className={!isMobile && !perfilMenuAberto ? 'sidebar-tooltip' : ''}
              data-tooltip="Meu Perfil"
              onClick={() => {
                if (isMobile) {
                  setMostrarPerfil(true)
                  setMenuAberto(false)
                } else {
                  setPerfilMenuAberto(!perfilMenuAberto)
                }
              }}
              style={{
                width: isMobile ? '100%' : '40px',
                height: '40px',
                borderRadius: '8px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: isMobile ? 'flex-start' : 'center',
                gap: isMobile ? '12px' : '0',
                paddingLeft: isMobile ? '12px' : '0',
                fontSize: '20px',
                cursor: 'pointer',
                transition: 'background-color 0.2s',
                color: '#666',
                backgroundColor: perfilMenuAberto ? '#f5f5f5' : 'transparent'
              }}
              onMouseEnter={(e) => { if (!perfilMenuAberto) e.currentTarget.style.backgroundColor = '#f5f5f5' }}
              onMouseLeave={(e) => { if (!perfilMenuAberto) e.currentTarget.style.backgroundColor = 'transparent' }}
            >
              <Icon icon="material-symbols-light:frame-person-outline-rounded" width="22" height="22" />
              {isMobile && <span style={{ fontSize: '14px', fontWeight: '500' }}>Meu Perfil</span>}
            </div>

            {/* Popup do Perfil - só no desktop */}
            {!isMobile && perfilMenuAberto && (
              <>
                <div
                  style={{ position: 'fixed', inset: 0, zIndex: 199 }}
                  onClick={() => setPerfilMenuAberto(false)}
                />
                <div style={{
                  position: 'absolute',
                  bottom: '0',
                  left: '50px',
                  background: 'white',
                  border: '1px solid #e5e7eb',
                  borderRadius: '10px',
                  boxShadow: '0 4px 16px rgba(0,0,0,0.1)',
                  padding: '6px',
                  minWidth: '160px',
                  zIndex: 200
                }}>
                  <div
                    onClick={() => { setPerfilMenuAberto(false); setMostrarPerfil(true) }}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '10px',
                      padding: '10px 14px', borderRadius: '7px', cursor: 'pointer',
                      fontSize: '14px', color: '#374151', transition: 'background 0.15s'
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f5f5f5'}
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                  >
                    <Icon icon="fluent:person-20-regular" width="18" />
                    Meu Perfil
                  </div>
                  <div style={{ height: '1px', background: '#e5e7eb', margin: '2px 8px' }} />
                  <div
                    onClick={() => { setPerfilMenuAberto(false); handleLogout() }}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '10px',
                      padding: '10px 14px', borderRadius: '7px', cursor: 'pointer',
                      fontSize: '14px', color: '#ef4444', transition: 'background 0.15s'
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#fef2f2'}
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                  >
                    <Icon icon="iconoir:log-out" width="18" />
                    Sair
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Sair - direto no sidebar mobile */}
          {isMobile && (
            <div
              onClick={handleLogout}
              style={{
                width: '100%',
                height: '40px',
                borderRadius: '8px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'flex-start',
                gap: '12px',
                paddingLeft: '12px',
                fontSize: '20px',
                cursor: 'pointer',
                transition: 'background-color 0.2s',
                color: '#ef4444',
                marginBottom: '16px'
              }}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#fef2f2'}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
            >
              <Icon icon="iconoir:log-out" width="22" height="22" />
              <span style={{ fontSize: '14px', fontWeight: '500' }}>Sair</span>
            </div>
          )}
        </div>
      </div>

      {/* Conteúdo principal */}
      <div style={{
        marginLeft: isMobile ? 0 : '70px',
        width: isMobile ? '100%' : 'calc(100% - 70px)',
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        paddingTop: isMobile ? '64px' : '0'
      }}>
        {/* Topbar desktop (estilo Krooa) */}
        {!isMobile && (
          <div style={{
            height: '56px',
            backgroundColor: 'white',
            borderBottom: '1px solid #e5e7eb',
            display: 'flex',
            alignItems: 'center',
            padding: '0 20px',
            gap: '16px',
            flexShrink: 0,
            position: 'relative',
            zIndex: 100
          }}>
            <img
              src="/logo-f.png"
              alt="Mensalli"
              style={{ height: '28px', objectFit: 'contain' }}
            />
            <div style={{ flex: 1, display: 'flex', justifyContent: 'center' }}>
              <div style={{ position: 'relative', width: '100%', maxWidth: '420px' }}>
                {buscaAberta && (
                  <div
                    onClick={() => setBuscaAberta(false)}
                    style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 200 }}
                  />
                )}
                <div
                  onClick={() => setBuscaAberta(true)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '8px 12px',
                    backgroundColor: '#f5f7fa',
                    borderRadius: '8px',
                    border: `1px solid ${buscaAberta ? '#344848' : '#e5e7eb'}`,
                    cursor: 'text',
                    position: 'relative',
                    zIndex: 201
                  }}
                >
                  <Icon icon="fluent:search-20-regular" width="18" height="18" color="#999" />
                  <input
                    placeholder="Buscar aluno por nome ou telefone..."
                    value={buscaTexto}
                    onChange={(e) => { setBuscaTexto(e.target.value); setBuscaAberta(true) }}
                    onFocus={() => setBuscaAberta(true)}
                    style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', fontSize: isMobile ? '16px' : '13px', color: '#333' }}
                  />
                  {buscaTexto ? (
                    <Icon
                      icon="mdi:close-circle"
                      width="16"
                      height="16"
                      color="#999"
                      style={{ cursor: 'pointer' }}
                      onClick={(e) => { e.stopPropagation(); setBuscaTexto('') }}
                    />
                  ) : (
                    <span style={{ fontSize: '11px', color: '#999', backgroundColor: 'white', padding: '2px 6px', borderRadius: '4px', border: '1px solid #e5e7eb' }}>
                      Ctrl K
                    </span>
                  )}
                </div>
                {buscaAberta && (
                  <div style={{
                    position: 'absolute',
                    top: 'calc(100% + 8px)',
                    left: 0,
                    right: 0,
                    backgroundColor: 'white',
                    borderRadius: '12px',
                    border: '1px solid #e5e7eb',
                    boxShadow: '0 12px 32px rgba(0,0,0,0.12)',
                    padding: '8px',
                    zIndex: 202,
                    maxHeight: '420px',
                    overflowY: 'auto'
                  }}>
                    {buscaTexto.trim().length >= 2 && (
                      <>
                        <div style={{ padding: '8px 12px 4px', fontSize: '11px', fontWeight: '700', color: '#999', letterSpacing: '0.5px' }}>
                          ALUNOS
                        </div>
                        {buscaCarregando && (
                          <div style={{ padding: '12px', fontSize: '13px', color: '#999', textAlign: 'center' }}>
                            Buscando...
                          </div>
                        )}
                        {!buscaCarregando && buscaResultados.length === 0 && (
                          <div style={{ padding: '12px', fontSize: '13px', color: '#999', textAlign: 'center' }}>
                            Nenhum aluno encontrado
                          </div>
                        )}
                        {!buscaCarregando && buscaResultados.map((aluno) => (
                          <div
                            key={aluno.id}
                            onClick={() => {
                              navigate(`/app/clientes?abrir=${aluno.id}`)
                              setBuscaAberta(false)
                              setBuscaTexto('')
                            }}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '12px',
                              padding: '10px 12px',
                              borderRadius: '8px',
                              cursor: 'pointer',
                              transition: 'background-color 0.15s'
                            }}
                            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f9fafb'}
                            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                          >
                            {aluno.foto_url ? (
                              <img src={aluno.foto_url} alt={aluno.nome} style={{ width: '36px', height: '36px', borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
                            ) : (
                              <div style={{ width: '36px', height: '36px', borderRadius: '50%', backgroundColor: '#344848', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '13px', fontWeight: '600', flexShrink: 0 }}>
                                {(aluno.nome || '?').charAt(0).toUpperCase()}
                              </div>
                            )}
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: '13px', fontWeight: '600', color: '#111', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {aluno.nome}
                              </div>
                              <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '1px' }}>
                                {aluno.telefone || 'Sem telefone'}{aluno.planos?.nome ? ` · ${aluno.planos.nome}` : ''}
                              </div>
                            </div>
                            <Icon icon="fluent:chevron-right-16-regular" width="16" height="16" color="#999" />
                          </div>
                        ))}
                        <div style={{ height: '1px', backgroundColor: '#f0f0f0', margin: '6px 8px' }} />
                      </>
                    )}
                    <div style={{ padding: '8px 12px 4px', fontSize: '11px', fontWeight: '700', color: '#999', letterSpacing: '0.5px' }}>
                      AÇÕES RÁPIDAS
                    </div>
                    {[
                      { icon: 'fluent:person-add-20-regular', cor: '#3b82f6', bg: '#eff6ff', titulo: 'Novo Aluno', sub: 'Cadastrar aluno e mensalidade', acao: () => navigate('/app/clientes?novo=true') },
                      { icon: 'fluent:receipt-add-20-regular', cor: '#ef4444', bg: '#fef2f2', titulo: 'Nova Despesa', sub: 'Registrar uma despesa do mês', acao: () => navigate('/app/financeiro?novadespesa=true') },
                      { icon: 'fluent:chat-20-regular', cor: '#f59e0b', bg: '#fffbeb', titulo: 'CRM de Leads', sub: 'Ver conversas e leads do bot', acao: () => navigate('/app/crm') },
                      { icon: 'fluent:people-24-regular', cor: '#8b5cf6', bg: '#f5f3ff', titulo: 'Alunos', sub: 'Lista completa de alunos', acao: () => navigate('/app/clientes') },
                      { icon: 'fluent:calendar-20-regular', cor: '#ec4899', bg: '#fdf2f8', titulo: 'Horários', sub: 'Grade de aulas da semana', acao: () => navigate('/app/horarios') },
                      { icon: 'fluent:money-20-regular', cor: '#059669', bg: '#ecfdf5', titulo: 'Financeiro', sub: 'Cobranças, recebimentos e despesas', acao: () => navigate('/app/financeiro') },
                      { icon: 'fluent:settings-20-regular', cor: '#6b7280', bg: '#f3f4f6', titulo: 'Configurações', sub: 'Empresa, plano e integrações', acao: () => navigate('/app/configuracao') },
                    ].map((item, idx) => (
                      <div
                        key={idx}
                        onClick={() => { item.acao(); setBuscaAberta(false) }}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '12px',
                          padding: '10px 12px',
                          borderRadius: '8px',
                          cursor: 'pointer',
                          transition: 'background-color 0.15s'
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f9fafb'}
                        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                      >
                        <div style={{
                          width: '36px',
                          height: '36px',
                          borderRadius: '8px',
                          backgroundColor: item.bg,
                          color: item.cor,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0
                        }}>
                          <Icon icon={item.icon} width="20" height="20" />
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: '13px', fontWeight: '600', color: '#111' }}>
                            {item.titulo}
                          </div>
                          <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '1px' }}>
                            {item.sub}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <div style={{ position: 'relative' }}>
                {notifAberta && (
                  <div
                    onClick={() => setNotifAberta(false)}
                    style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 200 }}
                  />
                )}
                <div
                  title="Notificações"
                  onClick={() => setNotifAberta((v) => !v)}
                  style={{
                    width: '38px',
                    height: '38px',
                    borderRadius: '8px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    color: '#555',
                    position: 'relative',
                    zIndex: 201
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f5f5f5'}
                  onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                >
                  <Icon icon="fluent:alert-20-regular" width="20" height="20" />
                  {notifCount > 0 && (
                    <div style={{
                      position: 'absolute',
                      top: '4px',
                      right: '4px',
                      minWidth: '16px',
                      height: '16px',
                      padding: '0 4px',
                      borderRadius: '999px',
                      backgroundColor: '#ef4444',
                      color: 'white',
                      fontSize: '10px',
                      fontWeight: '700',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      border: '2px solid white',
                      boxSizing: 'content-box'
                    }}>
                      {notifCount > 9 ? '9+' : notifCount}
                    </div>
                  )}
                </div>
                {notifAberta && (
                  <NotificacoesDropdown
                    userId={adminViewingAs || userId}
                    onClose={() => setNotifAberta(false)}
                    onMarcarLidos={() => setNotifCount(0)}
                  />
                )}
              </div>
              <div
                title="Ajuda"
                onClick={() => navigate('/app/ajuda')}
                style={{
                  width: '38px',
                  height: '38px',
                  borderRadius: '8px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  color: '#555'
                }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f5f5f5'}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
              >
                <Icon icon="fluent:question-circle-20-regular" width="20" height="20" />
              </div>
              <div
                title="Configurações"
                onClick={() => navigate('/app/configuracao')}
                style={{
                  width: '38px',
                  height: '38px',
                  borderRadius: '8px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  color: '#555'
                }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f5f5f5'}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
              >
                <Icon icon="fluent:settings-20-regular" width="20" height="20" />
              </div>
              <div
                onClick={() => setMostrarPerfil(true)}
                title="Meu perfil"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  padding: '4px 10px 4px 4px',
                  marginLeft: '6px',
                  borderRadius: '999px',
                  cursor: 'pointer',
                  border: '1px solid #e5e7eb',
                  backgroundColor: '#fafafa'
                }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f0f0f0'}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#fafafa'}
              >
                <div style={{
                  width: '30px',
                  height: '30px',
                  borderRadius: '50%',
                  backgroundColor: '#344848',
                  color: 'white',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '13px',
                  fontWeight: '600'
                }}>
                  {((userData?.nome_completo || userData?.email || 'U')).charAt(0).toUpperCase()}
                </div>
                <span style={{ fontSize: '13px', color: '#333', fontWeight: '500', maxWidth: '140px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {userData?.nome_empresa || userData?.nome_completo || 'Minha conta'}
                </span>
              </div>
            </div>
          </div>
        )}
        {/* Barra Admin: seletor de cliente */}
        {isAdmin && adminBarVisivel && !isMobile && (
          <div style={{
            padding: isMobile ? '8px 12px' : '8px 20px',
            backgroundColor: '#1a1a2e',
            display: 'flex',
            alignItems: 'center',
            gap: isMobile ? '8px' : '12px',
            flexShrink: 0,
            flexWrap: isMobile ? 'wrap' : 'nowrap'
          }}>
            <span style={{ color: '#a0a0b0', fontSize: '13px', fontWeight: '500', whiteSpace: 'nowrap' }}>
              ADMIN
            </span>
            <select
              value={adminViewingAs || ''}
              onChange={(e) => setAdminClient(e.target.value || null)}
              style={{
                flex: 1,
                minWidth: 0,
                maxWidth: isMobile ? '100%' : '400px',
                padding: '6px 10px',
                backgroundColor: '#16213e',
                color: 'white',
                border: '1px solid #2a2a4a',
                borderRadius: '6px',
                fontSize: '13px',
                cursor: 'pointer',
                outline: 'none'
              }}
            >
              <option value="">Minha conta</option>
              {(() => {
                const now = new Date()
                const getStatus = (c) => {
                  if (c.plano_pago) {
                    if (!c.plano_vencimento) return 'pago'
                    return new Date(c.plano_vencimento) > now ? 'pago' : 'expirado'
                  }
                  if (!c.trial_fim) return 'expirado'
                  return new Date(c.trial_fim) > now ? 'trial' : 'expirado'
                }
                const pagos = adminClientes.filter(c => getStatus(c) === 'pago')
                const trial = adminClientes.filter(c => getStatus(c) === 'trial')
                const expirados = adminClientes.filter(c => getStatus(c) === 'expirado')
                const renderOption = (c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome_empresa || c.nome_completo || c.email} ({c.plano}) — ID: {c.id.substring(0, 8)}
                  </option>
                )
                return (
                  <>
                    {pagos.length > 0 && (
                      <optgroup label={`✅ Pagos (${pagos.length})`}>
                        {pagos.map(renderOption)}
                      </optgroup>
                    )}
                    {trial.length > 0 && (
                      <optgroup label={`⏳ Trial ativo (${trial.length})`}>
                        {trial.map(renderOption)}
                      </optgroup>
                    )}
                    {expirados.length > 0 && (
                      <optgroup label={`❌ Expirados (${expirados.length})`}>
                        {expirados.map(renderOption)}
                      </optgroup>
                    )}
                  </>
                )
              })()}
            </select>
            {adminViewingAs && !isMobile && (
              <span style={{ color: '#ffd700', fontSize: '12px', whiteSpace: 'nowrap' }}
                title={adminViewingAs}
                onClick={() => { navigator.clipboard.writeText(adminViewingAs) }}
              >
                ID: {adminViewingAs.substring(0, 8)}... (clique p/ copiar)
              </span>
            )}
            <div
              onClick={() => setAdminBarVisivel(false)}
              style={{ cursor: 'pointer', padding: '6px 8px', borderRadius: '4px', color: '#999', fontSize: '16px', flexShrink: 0 }}
              onMouseEnter={(e) => e.currentTarget.style.color = '#fff'}
              onMouseLeave={(e) => e.currentTarget.style.color = '#999'}
              title="Esconder barra admin"
            >
              <Icon icon="mdi:eye-off-outline" width="18" height="18" />
            </div>
          </div>
        )}
        {/* Botão para reabrir a barra admin (quando escondida) */}
        {isAdmin && !adminBarVisivel && !isMobile && (
          <div
            onClick={() => setAdminBarVisivel(true)}
            style={{
              position: 'fixed',
              bottom: '16px',
              right: '16px',
              width: '36px',
              height: '36px',
              backgroundColor: '#1a1a2e',
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              zIndex: 50,
              boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
              opacity: 0.6,
              transition: 'opacity 0.2s'
            }}
            onMouseEnter={(e) => e.currentTarget.style.opacity = '1'}
            onMouseLeave={(e) => e.currentTarget.style.opacity = '0.6'}
            title="Mostrar barra admin"
          >
            <Icon icon="mdi:shield-crown-outline" width="18" height="18" color="white" />
          </div>
        )}
        <PlanExpirationBanner />
        <div style={{ flex: 1, overflow: 'auto', display: 'flex', alignItems: 'flex-start', backgroundColor: '#ffffff' }}>
          <Outlet />
        </div>
      </div>

      {/* Modal de Perfil */}
      {mostrarPerfil && (
        <PerfilUsuario onClose={() => setMostrarPerfil(false)} />
      )}
    </div>
  )
}