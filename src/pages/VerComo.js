import { useEffect, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Icon } from '@iconify/react'
import { supabase } from '../supabaseClient'
import { ativarModoEspelho, limparModoEspelho } from '../utils/modoEspelho'

/**
 * /ver-como/:token — troca o link gerado no /admin por uma sessão real do
 * cliente e entra em modo espelho (leitura, escrita bloqueada).
 *
 * Pensada para navegador anônimo: se rodar numa aba com sessão do admin, o
 * verifyOtp substitui essa sessão pela do cliente. O aviso na tela diz isso.
 */
export default function VerComo() {
  const { token } = useParams()
  const navigate = useNavigate()
  const [erro, setErro] = useState(null)
  const [conta, setConta] = useState(null)
  // StrictMode monta o efeito duas vezes em dev — e o token é de uso único,
  // então a segunda passada queimaria o link e cairia em "já utilizado".
  const jaResgatou = useRef(false)

  useEffect(() => {
    if (jaResgatou.current) return
    jaResgatou.current = true

    async function resgatar() {
      try {
        limparModoEspelho()

        const { data, error } = await supabase.functions.invoke('admin-impersonar-resgatar', {
          body: { token },
        })

        if (error || !data?.hashedToken) {
          setErro(data?.error || 'Link inválido, expirado ou já utilizado.')
          return
        }

        const { error: erroSessao } = await supabase.auth.verifyOtp({
          token_hash: data.hashedToken,
          type: 'magiclink',
        })

        if (erroSessao) {
          setErro(`Não foi possível abrir a sessão: ${erroSessao.message}`)
          return
        }

        // Só liga o espelho depois da sessão existir — a trava de escrita do
        // supabaseClient passa a valer da próxima chamada em diante.
        ativarModoEspelho({
          targetUserId: data.targetUserId,
          conta: data.conta,
          email: data.email,
        })

        setConta(data.conta)
        navigate('/app/home', { replace: true })
      } catch (e) {
        setErro(e.message || 'Erro inesperado ao abrir a sessão.')
      }
    }

    resgatar()
  }, [token, navigate])

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '24px',
      backgroundColor: '#f7f8f8',
    }}>
      <div style={{
        maxWidth: '420px',
        width: '100%',
        backgroundColor: 'white',
        borderRadius: '12px',
        padding: '32px',
        textAlign: 'center',
        boxShadow: '0 2px 12px rgba(0,0,0,0.06)',
      }}>
        {erro ? (
          <>
            <Icon icon="mdi:link-variant-off" width="40" height="40" style={{ color: '#c0392b' }} />
            <h2 style={{ margin: '16px 0 8px', fontSize: '18px', color: '#344848' }}>
              Não deu para abrir
            </h2>
            <p style={{ margin: 0, fontSize: '14px', color: '#666', lineHeight: 1.5 }}>{erro}</p>
            <p style={{ margin: '16px 0 0', fontSize: '13px', color: '#999', lineHeight: 1.5 }}>
              Cada link vale 15 minutos e só pode ser aberto uma vez. Gere outro na barra ADMIN.
            </p>
          </>
        ) : (
          <>
            <Icon icon="mdi:eye-outline" width="40" height="40" style={{ color: '#344848' }} />
            <h2 style={{ margin: '16px 0 8px', fontSize: '18px', color: '#344848' }}>
              Abrindo modo espelho{conta ? ` — ${conta}` : ''}…
            </h2>
            <p style={{ margin: 0, fontSize: '14px', color: '#666', lineHeight: 1.5 }}>
              Você vai ver a conta exatamente como o cliente vê. Alterações ficam bloqueadas.
            </p>
          </>
        )}
      </div>
    </div>
  )
}
