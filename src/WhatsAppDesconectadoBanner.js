import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useUser } from './contexts/UserContext'
import { supabase } from './supabaseClient'
import { Icon } from '@iconify/react'

// Canal A do aviso de desconexão: banner in-app.
// Mostra quando o WhatsApp do usuário logado JÁ esteve conectado um dia
// (ultima_conexao != null) mas agora está conectado=false — fonte de
// verdade atualizada pelo health check diário (e pela própria tela de
// conexão). Admin visualizando outro cliente não vê (não é a conta dele).
export default function WhatsAppDesconectadoBanner() {
  const navigate = useNavigate()
  const { userId, adminViewingAs } = useUser()
  const [caido, setCaido] = useState(false)
  const [dispensado, setDispensado] = useState(
    () => sessionStorage.getItem('wpp_desconectado_dismiss') === '1'
  )

  useEffect(() => {
    // Admin espiando outro cliente: não é a conexão dele, não mostra
    if (!userId || adminViewingAs) { setCaido(false); return }
    let ativo = true
    supabase
      .from('mensallizap')
      .select('conectado, ultima_conexao')
      .eq('user_id', userId)
      .maybeSingle()
      .then(({ data }) => {
        if (!ativo) return
        setCaido(!!data && data.conectado === false && !!data.ultima_conexao)
      })
    return () => { ativo = false }
  }, [userId, adminViewingAs])

  if (!caido || dispensado) return null

  const dispensar = () => {
    sessionStorage.setItem('wpp_desconectado_dismiss', '1')
    setDispensado(true)
  }

  return (
    <div style={{
      width: '100%', padding: '10px 20px', backgroundColor: '#fef2f2',
      borderBottom: '2px solid #fca5a5', display: 'flex', alignItems: 'center',
      justifyContent: 'center', gap: '12px', flexShrink: 0, flexWrap: 'wrap',
    }}>
      <Icon icon="mdi:whatsapp" width="20" style={{ color: '#dc2626', flexShrink: 0 }} />
      <span style={{ fontSize: '14px', fontWeight: 600, color: '#991b1b' }}>
        Seu WhatsApp desconectou — suas cobranças e lembretes não estão sendo enviados.
      </span>
      <button
        onClick={() => navigate('/app/whatsapp')}
        style={{
          padding: '6px 18px', backgroundColor: '#dc2626', color: 'white', border: 'none',
          borderRadius: '6px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap',
        }}
        onMouseEnter={(e) => e.target.style.opacity = '0.85'}
        onMouseLeave={(e) => e.target.style.opacity = '1'}
      >
        Reconectar agora
      </button>
      <button
        onClick={dispensar}
        title="Dispensar até o próximo login"
        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', display: 'flex', alignItems: 'center', opacity: 0.5 }}
        onMouseEnter={(e) => e.currentTarget.style.opacity = '1'}
        onMouseLeave={(e) => e.currentTarget.style.opacity = '0.5'}
      >
        <Icon icon="mdi:close" width="18" style={{ color: '#991b1b' }} />
      </button>
    </div>
  )
}
