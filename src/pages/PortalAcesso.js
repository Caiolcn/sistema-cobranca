import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Icon } from '@iconify/react'
import Input from '../design-system/components/Input'
import Button from '../design-system/components/Button'
import { FUNCTIONS_URL, SUPABASE_ANON_KEY as ANON_KEY } from '../supabaseClient'

// Link único do portal da escola (/portal/c/:slug). O aluno digita o WhatsApp e
// recebe o link individual dele no número cadastrado — ver portal-solicitar-acesso.
// Quem já abriu o portal neste aparelho (token salvo pelo PortalCliente) e é
// desta escola cai direto no portal, sem passar por aqui de novo.

const HEADERS = { 'apikey': ANON_KEY, 'Authorization': `Bearer ${ANON_KEY}` }

function tokenSalvo() {
  try {
    const local = localStorage.getItem('portal_token')
    if (local) return local
  } catch { /* storage bloqueado */ }
  const m = document.cookie.match(/(?:^|;\s*)portal_token=([^;]+)/)
  return m ? m[1] : ''
}

function mascaraTelefone(v) {
  v = v.replace(/\D/g, '').slice(0, 11)
  if (!v) return ''
  if (v.length <= 2) return `(${v}`
  if (v.length <= 7) return `(${v.slice(0, 2)}) ${v.slice(2)}`
  return `(${v.slice(0, 2)}) ${v.slice(2, 7)}-${v.slice(7)}`
}

const fundo = {
  minHeight: '100vh', background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
  display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, boxSizing: 'border-box'
}

export default function PortalAcesso() {
  const { slug } = useParams()
  const navigate = useNavigate()
  const [empresa, setEmpresa] = useState(null)
  const [erro, setErro] = useState(null)
  const [telefone, setTelefone] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [erroCampo, setErroCampo] = useState(null)
  const [resultado, setResultado] = useState(null) // 'enviado' | 'offline'

  useEffect(() => {
    const token = tokenSalvo()
    fetch(`${FUNCTIONS_URL}/portal-solicitar-acesso?slug=${encodeURIComponent(slug)}&token=${encodeURIComponent(token)}`, { headers: HEADERS })
      .then(r => r.json())
      .then(json => {
        if (json.error) { setErro(json.error); return }
        if (json.token_ok && token) { navigate(`/portal/${token}`, { replace: true }); return }
        setEmpresa(json)
      })
      .catch(() => setErro('Não foi possível carregar. Tente novamente.'))
  }, [slug]) // eslint-disable-line

  const digitos = telefone.replace(/\D/g, '')

  async function pedirLink() {
    if (digitos.length < 10) { setErroCampo('Digite o WhatsApp com DDD'); return }
    setErroCampo(null)
    setEnviando(true)
    try {
      const res = await fetch(`${FUNCTIONS_URL}/portal-solicitar-acesso`, {
        method: 'POST',
        headers: { ...HEADERS, 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug, telefone: digitos })
      })
      const json = await res.json()
      if (json.offline) setResultado('offline')
      else if (json.ok) setResultado('enviado')
      else setErroCampo(json.error || 'Não foi possível enviar. Tente novamente.')
    } catch {
      setErroCampo('Sem conexão. Tente novamente.')
    } finally {
      setEnviando(false)
    }
  }

  if (erro) {
    return (
      <div style={fundo}>
        <div style={{ textAlign: 'center', maxWidth: 400 }}>
          <div style={{
            width: 80, height: 80, borderRadius: '50%', background: 'rgba(239,68,68,0.15)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px'
          }}>
            <Icon icon="mdi:link-off" width="40" style={{ color: '#ef4444' }} />
          </div>
          <h2 style={{ margin: '0 0 8px', fontSize: 24, fontWeight: 800, color: '#fff' }}>Link indisponível</h2>
          <p style={{ margin: 0, color: 'rgba(255,255,255,0.5)', fontSize: 15, lineHeight: 1.5 }}>{erro}</p>
        </div>
      </div>
    )
  }

  if (!empresa) {
    return (
      <div style={fundo}>
        <div style={{
          width: 56, height: 56, borderRadius: '50%',
          border: '3px solid rgba(255,255,255,0.1)', borderTopColor: '#22c55e',
          animation: 'spin 0.8s linear infinite'
        }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      </div>
    )
  }

  const nome = empresa.nome_empresa || 'Portal do aluno'

  return (
    <div style={fundo}>
      <div style={{ width: '100%', maxWidth: 400 }}>
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          {empresa.logo_url ? (
            <div style={{
              width: 72, height: 72, borderRadius: 16, background: '#fff', overflow: 'hidden',
              display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px'
            }}>
              <img src={empresa.logo_url} alt={nome} style={{ width: '100%', height: '100%', objectFit: 'contain', padding: 6 }} />
            </div>
          ) : (
            <div style={{
              width: 72, height: 72, borderRadius: 16, background: 'linear-gradient(135deg, #22c55e, #16a34a)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 28, fontWeight: 800, color: '#fff', margin: '0 auto 16px'
            }}>
              {nome.charAt(0).toUpperCase()}
            </div>
          )}
          <h1 style={{ margin: '0 0 4px', fontSize: 22, fontWeight: 800, color: '#fff' }}>{nome}</h1>
          <p style={{ margin: 0, color: 'rgba(255,255,255,0.55)', fontSize: 14 }}>Portal do aluno</p>
        </div>

        <div style={{ background: '#fff', borderRadius: 16, padding: 24, boxShadow: '0 4px 24px rgba(0,0,0,0.2)' }}>
          {resultado === 'enviado' ? (
            <div style={{ textAlign: 'center' }}>
              <div style={{
                width: 56, height: 56, borderRadius: '50%', background: '#f0fdf4',
                display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px'
              }}>
                <Icon icon="mdi:whatsapp" width="30" style={{ color: '#16a34a' }} />
              </div>
              <h2 style={{ margin: '0 0 8px', fontSize: 18, fontWeight: 700, color: '#0f172a' }}>Confira seu WhatsApp</h2>
              <p style={{ margin: '0 0 20px', fontSize: 14, color: '#64748b', lineHeight: 1.5 }}>
                Se o número {telefone} estiver cadastrado na {nome}, você vai receber o link do seu portal em instantes.
                É só tocar nele pra entrar.
              </p>
              <p style={{ margin: '0 0 16px', fontSize: 13, color: '#94a3b8', lineHeight: 1.5 }}>
                Não chegou em alguns minutos? Fale com a recepção pra conferir o número do seu cadastro.
              </p>
              <Button variant="outline" fullWidth onClick={() => { setResultado(null); setTelefone('') }}>
                Usar outro número
              </Button>
            </div>
          ) : resultado === 'offline' ? (
            <div style={{ textAlign: 'center' }}>
              <div style={{
                width: 56, height: 56, borderRadius: '50%', background: '#fffbeb',
                display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px'
              }}>
                <Icon icon="mdi:store-clock-outline" width="30" style={{ color: '#d97706' }} />
              </div>
              <h2 style={{ margin: '0 0 8px', fontSize: 18, fontWeight: 700, color: '#0f172a' }}>Não deu pra enviar agora</h2>
              <p style={{ margin: 0, fontSize: 14, color: '#64748b', lineHeight: 1.5 }}>
                Fale com a recepção da {nome} pra receber o link do seu portal.
              </p>
            </div>
          ) : (
            <>
              <p style={{ margin: '0 0 16px', fontSize: 14, color: '#475569', lineHeight: 1.5 }}>
                Digite o WhatsApp do seu cadastro (ou do responsável). Vamos te mandar o link de acesso por lá.
              </p>
              <Input
                label="Seu WhatsApp"
                type="tel"
                inputMode="numeric"
                size="lg"
                icon="mdi:whatsapp"
                placeholder="(00) 00000-0000"
                value={telefone}
                onChange={e => { setTelefone(mascaraTelefone(e.target.value)); setErroCampo(null) }}
                onKeyDown={e => e.key === 'Enter' && pedirLink()}
                error={erroCampo}
                autoFocus
              />
              <div style={{ marginTop: 16 }}>
                <Button
                  variant="primary"
                  size="lg"
                  fullWidth
                  loading={enviando}
                  disabled={digitos.length < 10}
                  onClick={pedirLink}
                  icon="mdi:send"
                >
                  Receber link no WhatsApp
                </Button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
