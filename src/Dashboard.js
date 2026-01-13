import { useState, useEffect } from 'react'
import { useNavigate, useLocation, Outlet } from 'react-router-dom'
import { supabase } from './supabaseClient'
import { subscribeToWhatsAppStatus, getWhatsAppStatus } from './WhatsAppConexao'
import PerfilUsuario from './PerfilUsuario'
import TrialExpiredModal from './TrialExpiredModal'
import { useTrialStatus } from './useTrialStatus'
import { Icon } from '@iconify/react'

export default function Dashboard() {
  const navigate = useNavigate()
  const location = useLocation()
  const [mostrarPerfil, setMostrarPerfil] = useState(false)
  const [whatsappStatus, setWhatsappStatus] = useState(getWhatsAppStatus())
  const [mostrarModalTrial, setMostrarModalTrial] = useState(false)

  // Hook para verificar status do trial
  const { isExpired, diasRestantes, planoPago, loading } = useTrialStatus()

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
      {/* Menu lateral */}
      <div style={{
        width: '70px',
        backgroundColor: 'white',
        borderRight: '1px solid #e0e0e0',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingTop: '20px',
        paddingBottom: '20px',
        height: '100vh',
        position: 'fixed',
        left: 0,
        top: 0,
        zIndex: 100
      }}>
        {/* Ícones principais do menu */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '25px' }}>
          {/* Home */}
          <div
            onClick={() => navigate('/app/home')}
            style={{
              width: '40px',
              height: '40px',
              backgroundColor: telaAtiva === 'home' ? '#333' : 'transparent',
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
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
          </div>

          {/* Financeiro */}
          <div
            onClick={() => navigate('/app/financeiro')}
            style={{
              width: '40px',
              height: '40px',
              backgroundColor: telaAtiva === 'financeiro' ? '#333' : 'transparent',
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
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
            <Icon icon="fluent:receipt-20-regular" width="22" height="22" />
          </div>

          {/* Clientes */}
          <div
            onClick={() => navigate('/app/clientes')}
            style={{
              width: '40px',
              height: '40px',
              backgroundColor: telaAtiva === 'clientes' ? '#333' : 'transparent',
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
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
          </div>

          {/* WhatsApp */}
          <div
            onClick={() => navigate('/app/whatsapp')}
            style={{
              width: '40px',
              height: '40px',
              backgroundColor: telaAtiva === 'whatsapp' ? '#333' : 'transparent',
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
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
            <Icon icon="mdi:whatsapp" width="22" height="22" />
            {/* Indicador de status */}
            <div style={{
              position: 'absolute',
              top: '3px',
              right: '3px',
              width: '10px',
              height: '10px',
              borderRadius: '50%',
              backgroundColor: whatsappStatus === 'connected' ? '#4CAF50' :
                             whatsappStatus === 'connecting' ? '#ff9800' :
                             '#f44336',
              boxShadow: '0 0 4px rgba(0,0,0,0.3)'
            }} />
          </div>

          {/* Configuração */}
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
        </div>

        {/* Ícones de perfil e sair (fixos na parte inferior) */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '15px', alignItems: 'center' }}>
          {/* Divisória */}
          <div style={{
            width: '30px',
            height: '1px',
            backgroundColor: '#e0e0e0'
          }} />

          {/* Perfil */}
          <div
            onClick={() => setMostrarPerfil(true)}
            style={{
              width: '40px',
              height: '40px',
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '20px',
              cursor: 'pointer',
              transition: 'background-color 0.2s'
            }}
            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f5f5f5'}
            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
          >
            <Icon icon="material-symbols-light:frame-person-outline-rounded" width="22" height="22" />
          </div>

          {/* Sair */}
          <div
            onClick={handleLogout}
            style={{
              width: '40px',
              height: '40px',
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '20px',
              cursor: 'pointer',
              transition: 'background-color 0.2s'
            }}
            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#ffebee'}
            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
          >
            <Icon icon="iconoir:log-out" width="22" height="22" />
          </div>
        </div>
      </div>

      {/* Conteúdo principal */}
      <div style={{
        marginLeft: '70px',
        width: 'calc(100% - 70px)',
        height: '100vh',
        overflow: 'auto',
        display: 'flex'
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