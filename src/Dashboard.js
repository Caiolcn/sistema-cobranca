import { useState, useEffect } from 'react'
import { supabase } from './supabaseClient'
import Home from './Home'
import Financeiro from './Financeiro'
import Clientes from './Clientes'
import WhatsAppConexao, { subscribeToWhatsAppStatus, getWhatsAppStatus } from './WhatsAppConexao'
import PerfilUsuario from './PerfilUsuario'
import { Icon } from '@iconify/react'

export default function Dashboard() {
  const [telaAtiva, setTelaAtiva] = useState('home') // 'home', 'financeiro', 'clientes' ou 'whatsapp'
  const [mostrarPerfil, setMostrarPerfil] = useState(false)
  const [whatsappStatus, setWhatsappStatus] = useState(getWhatsAppStatus())

  useEffect(() => {
    // Inscrever-se para atualizações do status do WhatsApp
    const unsubscribe = subscribeToWhatsAppStatus((newStatus) => {
      setWhatsappStatus(newStatus)
    })

    // Limpar inscrição quando o componente desmontar
    return unsubscribe
  }, [])

  const handleLogout = async () => {
    await supabase.auth.signOut()
    window.location.reload()
  }

  return (
    <div style={{ display: 'flex', backgroundColor: '#f5f7fa', minHeight: '100vh', width: '100%' }}>
      {/* Menu lateral */}
      <div style={{
        width: '70px',
        backgroundColor: 'white',
        borderRight: '1px solid #e0e0e0',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        paddingTop: '20px',
        gap: '25px'
      }}>
        {/* Home */}
        <div
          onClick={() => setTelaAtiva('home')}
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
          onClick={() => setTelaAtiva('financeiro')}
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
          onClick={() => setTelaAtiva('clientes')}
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
          onClick={() => setTelaAtiva('whatsapp')}
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

        {/* Divisória */}
        <div style={{
          width: '30px',
          height: '1px',
          backgroundColor: '#e0e0e0',
          marginTop: 'auto'
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
            marginBottom: '20px',
            transition: 'background-color 0.2s'
          }}
          onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#ffebee'}
          onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
        >
          <Icon icon="iconoir:log-out" width="22" height="22" />
        </div>
      </div>

      {/* Conteúdo principal */}
      {telaAtiva === 'home' ? <Home onNavigate={setTelaAtiva} /> :
       telaAtiva === 'financeiro' ? <Financeiro /> :
       telaAtiva === 'clientes' ? <Clientes /> :
       <WhatsAppConexao />}

      {/* Modal de Perfil */}
      {mostrarPerfil && (
        <PerfilUsuario onClose={() => setMostrarPerfil(false)} />
      )}
    </div>
  )
}