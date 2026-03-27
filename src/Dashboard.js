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

export default function Dashboard() {
  const navigate = useNavigate()
  const location = useLocation()
  const [mostrarPerfil, setMostrarPerfil] = useState(false)
  const [whatsappStatus, setWhatsappStatus] = useState(getWhatsAppStatus())
  const [mostrarModalTrial, setMostrarModalTrial] = useState(false)
  const [menuAberto, setMenuAberto] = useState(false)
  const [configSubmenuAberto, setConfigSubmenuAberto] = useState(false)
  const [perfilMenuAberto, setPerfilMenuAberto] = useState(false)

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
        .select('id, email, nome_empresa, nome_completo, plano')
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
          <div style={{ width: '40px', flexShrink: 0 }} />
        </div>
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

          {/* Avisos */}
          <div
            className={!isMobile ? 'sidebar-tooltip' : ''}
            data-tooltip="Avisos"
            onClick={() => { navigate('/app/avisos'); if (isMobile) setMenuAberto(false) }}
            style={{
              width: isMobile ? '100%' : '40px',
              height: '40px',
              backgroundColor: telaAtiva === 'avisos' ? '#333' : 'transparent',
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: isMobile ? 'flex-start' : 'center',
              gap: isMobile ? '12px' : '0',
              paddingLeft: isMobile ? '12px' : '0',
              color: telaAtiva === 'avisos' ? 'white' : '#666',
              fontSize: '20px',
              cursor: 'pointer',
              transition: 'all 0.2s'
            }}
            onMouseEnter={(e) => {
              if (telaAtiva !== 'avisos') e.currentTarget.style.backgroundColor = '#f5f5f5'
            }}
            onMouseLeave={(e) => {
              if (telaAtiva !== 'avisos') e.currentTarget.style.backgroundColor = 'transparent'
            }}
          >
            <Icon icon="fluent:megaphone-20-regular" width="22" height="22" />
            {isMobile && <span style={{ fontSize: '14px', fontWeight: '500' }}>Avisos</span>}
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

          {/* Configuração */}
          {isMobile ? (
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
                    { id: 'uso', label: 'Uso do Sistema', icon: 'mdi:chart-box-outline' },
                    { id: 'upgrade', label: 'Upgrade de Plano', icon: 'mdi:rocket-launch-outline' }
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
          ) : (
            /* Desktop: Item simples */
            <div
              className="sidebar-tooltip"
              data-tooltip="Configurações"
              onClick={() => navigate('/app/configuracao')}
              style={{
                width: '40px',
                height: '40px',
                backgroundColor: telaAtiva === 'configuracao' ? '#333' : 'transparent',
                borderRadius: '8px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: telaAtiva === 'configuracao' ? 'white' : '#666',
                fontSize: '20px',
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
              onMouseEnter={(e) => {
                if (telaAtiva !== 'configuracao') e.currentTarget.style.backgroundColor = '#f5f5f5'
              }}
              onMouseLeave={(e) => {
                if (telaAtiva !== 'configuracao') e.currentTarget.style.backgroundColor = 'transparent'
              }}
            >
              <Icon icon="fluent:settings-20-regular" width="22" height="22" />
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
              {adminClientes.map(c => (
                <option key={c.id} value={c.id}>
                  {c.nome_empresa || c.nome_completo || c.email} ({c.plano}) — ID: {c.id.substring(0, 8)}
                </option>
              ))}
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
        <div style={{ flex: 1, overflow: 'auto', display: 'flex', backgroundColor: '#ffffff' }}>
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