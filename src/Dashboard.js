import { useState, useEffect } from 'react'
import { useNavigate, useLocation, Outlet, Navigate } from 'react-router-dom'
import { supabase } from './supabaseClient'
import { subscribeToWhatsAppStatus, getWhatsAppStatus } from './WhatsAppConexao'
import PerfilUsuario from './PerfilUsuario'
import TrialExpiredModal from './TrialExpiredModal'
import { useTrialStatus } from './useTrialStatus'
import { useUser } from './contexts/UserContext'
import { usePaymentNotifications } from './hooks/usePaymentNotifications'
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

  const { isMobile, isTablet } = useWindowSize()

  // Hook para verificar status do trial
  const { isExpired, diasRestantes, planoPago, loading } = useTrialStatus()
  const { userData, userId } = useUser()

  // Notificacoes em tempo real de pagamentos
  usePaymentNotifications(userId)

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

  // Redirecionar para onboarding se não completou
  if (!loading && userData && userData.onboarding_completed === false) {
    return <Navigate to="/app/onboarding" replace />
  }

  // Se trial expirou, bloquear acesso
  if (isExpired && !planoPago && !loading) {
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
            zIndex: 99
          }}
        />
      )}

      {/* Botão hamburguer - mobile only */}
      {isMobile && (
        <button
          onClick={() => setMenuAberto(!menuAberto)}
          style={{
            position: 'fixed',
            top: '16px',
            left: '16px',
            zIndex: 101,
            width: '44px',
            height: '44px',
            backgroundColor: 'white',
            border: '1px solid #e0e0e0',
            borderRadius: '8px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
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
        paddingTop: isMobile ? '70px' : '20px',
        paddingBottom: '20px',
        paddingLeft: isMobile ? '16px' : '0',
        paddingRight: isMobile ? '16px' : '0',
        height: '100vh',
        position: 'fixed',
        left: isMobile ? (menuAberto ? '0' : '-260px') : '0',
        top: 0,
        zIndex: 100,
        transition: 'left 0.3s ease',
        boxShadow: isMobile && menuAberto ? '4px 0 20px rgba(0,0,0,0.15)' : 'none'
      }}>
        {/* Ícones principais do menu */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: isMobile ? '8px' : '25px', width: isMobile ? '100%' : 'auto' }}>
          {/* Home */}
          <div
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

          {/* Financeiro */}
          <div
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

          {/* Clientes */}
          <div
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
            {isMobile && <span style={{ fontSize: '14px', fontWeight: '500' }}>Clientes</span>}
          </div>

          {/* WhatsApp */}
          <div
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
                  <Icon icon="material-symbols:settings-outline-rounded" width="22" height="22" />
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
              <Icon icon="material-symbols:settings-outline-rounded" width="22" height="22" />
            </div>
          )}
        </div>

        {/* Ícones de perfil e sair (fixos na parte inferior) */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: isMobile ? '8px' : '15px', alignItems: isMobile ? 'flex-start' : 'center', width: isMobile ? '100%' : 'auto' }}>
          {/* Divisória */}
          <div style={{
            width: isMobile ? '100%' : '30px',
            height: '1px',
            backgroundColor: '#e0e0e0'
          }} />

          {/* Perfil */}
          <div
            onClick={() => { setMostrarPerfil(true); if (isMobile) setMenuAberto(false) }}
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
              color: '#666'
            }}
            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f5f5f5'}
            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
          >
            <Icon icon="material-symbols-light:frame-person-outline-rounded" width="22" height="22" />
            {isMobile && <span style={{ fontSize: '14px', fontWeight: '500' }}>Meu Perfil</span>}
          </div>

          {/* Sair */}
          <div
            onClick={handleLogout}
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
              color: '#666'
            }}
            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#ffebee'}
            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
          >
            <Icon icon="iconoir:log-out" width="22" height="22" />
            {isMobile && <span style={{ fontSize: '14px', fontWeight: '500', color: '#f44336' }}>Sair</span>}
          </div>
        </div>
      </div>

      {/* Conteúdo principal */}
      <div style={{
        marginLeft: isMobile ? 0 : '70px',
        width: isMobile ? '100%' : 'calc(100% - 70px)',
        height: '100vh',
        overflow: 'auto',
        display: 'flex',
        paddingTop: isMobile ? '70px' : '0'
      }}>
        <Outlet />
      </div>

      {/* Modal de Perfil */}
      {mostrarPerfil && (
        <PerfilUsuario onClose={() => setMostrarPerfil(false)} />
      )}
    </div>
  )
}