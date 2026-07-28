import { useState } from 'react'
import { Icon } from '@iconify/react'
import { supabase } from '../supabaseClient'
import { dadosModoEspelho, limparModoEspelho } from '../utils/modoEspelho'

/**
 * Tarja do modo espelho.
 *
 * Fica no rodapé, fixa: some do caminho do layout (o app tem telas em 100vh,
 * uma tarja no topo empurraria tudo) mas acompanha qualquer rota, para nunca
 * dar a impressão de que você está na sua própria conta.
 */
export default function BarraModoEspelho() {
  const dados = dadosModoEspelho()
  const [saindo, setSaindo] = useState(false)

  if (!dados) return null

  const sair = async () => {
    setSaindo(true)
    limparModoEspelho()
    await supabase.auth.signOut()
    // Recarrega em vez de navegar: zera todo estado de React que carregou
    // dados do cliente.
    window.location.href = '/login'
  }

  return (
    <div style={{
      position: 'fixed',
      bottom: 0,
      left: 0,
      right: 0,
      zIndex: 99999,
      backgroundColor: '#8a5a00',
      color: '#fff',
      padding: '8px 16px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '12px',
      fontSize: '13px',
      boxShadow: '0 -2px 10px rgba(0,0,0,0.2)',
    }}>
      <Icon icon="mdi:eye-outline" width="18" height="18" />
      <span style={{ fontWeight: 600 }}>MODO ESPELHO</span>
      <span style={{
        opacity: 0.9,
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        maxWidth: '40vw',
      }}>
        vendo como <strong>{dados.conta}</strong> — alterações bloqueadas
      </span>
      <button
        onClick={sair}
        disabled={saindo}
        style={{
          marginLeft: '8px',
          padding: '4px 12px',
          borderRadius: '6px',
          border: '1px solid rgba(255,255,255,0.5)',
          backgroundColor: 'transparent',
          color: '#fff',
          fontSize: '12px',
          fontWeight: 600,
          cursor: saindo ? 'default' : 'pointer',
          flexShrink: 0,
        }}
        // App.css pinta todo button de azul no hover — sobrescreve na mão.
        onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.15)' }}
        onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent' }}
      >
        {saindo ? 'Saindo…' : 'Sair do espelho'}
      </button>
    </div>
  )
}
