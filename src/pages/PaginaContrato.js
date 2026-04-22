import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { Icon } from '@iconify/react'

const FONTES_ASSINATURA = [
  { nome: 'Dancing Script', fontFamily: "'Dancing Script', cursive" },
  { nome: 'Great Vibes', fontFamily: "'Great Vibes', cursive" },
  { nome: 'Sacramento', fontFamily: "'Sacramento', cursive" },
  { nome: 'Pacifico', fontFamily: "'Pacifico', cursive" }
]

const GOOGLE_FONTS_URL = 'https://fonts.googleapis.com/css2?family=Dancing+Script:wght@700&family=Great+Vibes&family=Sacramento&family=Pacifico&display=swap'

export default function PaginaContrato() {
  const { token } = useParams()

  const [contrato, setContrato] = useState(null)
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState('')

  const [nome, setNome] = useState('')
  const [fonteSelecionada, setFonteSelecionada] = useState(FONTES_ASSINATURA[0].nome)
  const [aceitouTermos, setAceitouTermos] = useState(false)
  const [assinando, setAssinando] = useState(false)

  useEffect(() => {
    if (!document.getElementById('google-fonts-assinatura')) {
      const link = document.createElement('link')
      link.id = 'google-fonts-assinatura'
      link.rel = 'stylesheet'
      link.href = GOOGLE_FONTS_URL
      document.head.appendChild(link)
    }
    document.body.style.margin = '0'
    document.body.style.backgroundColor = '#f3f4f6'
  }, [])

  useEffect(() => {
    async function carregar() {
      const { data, error } = await supabase
        .from('contratos_enviados')
        .select('*')
        .eq('link_token', token)
        .maybeSingle()

      if (error || !data) {
        setErro('Contrato não encontrado ou link inválido.')
      } else {
        setContrato(data)
      }
      setLoading(false)
    }
    carregar()
  }, [token])

  const assinar = async () => {
    if (!nome.trim() || nome.trim().length < 3) {
      alert('Digite seu nome completo pra assinar.')
      return
    }
    if (!aceitouTermos) {
      alert('Você precisa confirmar que leu e concorda com os termos.')
      return
    }
    setAssinando(true)
    try {
      const userAgent = navigator.userAgent?.slice(0, 500) || ''
      const { error } = await supabase
        .from('contratos_enviados')
        .update({
          status: 'assinado',
          assinatura_nome: nome.trim(),
          assinatura_fonte: fonteSelecionada,
          aceitou_termos: true,
          user_agent_assinatura: userAgent,
          assinado_em: new Date().toISOString()
        })
        .eq('link_token', token)
        .eq('status', 'enviado')

      if (error) throw error

      setContrato(prev => ({
        ...prev,
        status: 'assinado',
        assinatura_nome: nome.trim(),
        assinatura_fonte: fonteSelecionada,
        assinado_em: new Date().toISOString()
      }))
    } catch (err) {
      alert('Erro ao assinar: ' + (err.message || 'tente novamente.'))
    } finally {
      setAssinando(false)
    }
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
        <Icon icon="eos-icons:loading" width="40" style={{ color: '#666' }} />
      </div>
    )
  }

  if (erro) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', padding: '20px', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
        <div style={{ textAlign: 'center', maxWidth: '400px' }}>
          <Icon icon="mdi:alert-circle-outline" width="64" style={{ color: '#dc2626' }} />
          <h2 style={{ color: '#1a1a1a', marginTop: '12px' }}>Contrato não encontrado</h2>
          <p style={{ color: '#6b7280' }}>{erro}</p>
        </div>
      </div>
    )
  }

  const jaAssinado = contrato.status === 'assinado'
  const fonteUsada = FONTES_ASSINATURA.find(f => f.nome === (jaAssinado ? contrato.assinatura_fonte : fonteSelecionada))?.fontFamily || FONTES_ASSINATURA[0].fontFamily
  const nomeExibido = jaAssinado ? contrato.assinatura_nome : nome

  return (
    <div style={{ fontFamily: 'system-ui, -apple-system, sans-serif', padding: '20px', maxWidth: '800px', margin: '0 auto' }}>
      <div style={{ backgroundColor: 'white', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', overflow: 'hidden', marginTop: '20px' }}>
        <div style={{ padding: '24px 28px', borderBottom: '1px solid #e5e7eb', backgroundColor: jaAssinado ? '#f0fdf4' : '#f9fafb' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
            {jaAssinado ? (
              <div style={{ padding: '6px 10px', backgroundColor: '#bbf7d0', borderRadius: '6px', color: '#166534', fontSize: '11px', fontWeight: '700', letterSpacing: '0.5px' }}>
                ✓ ASSINADO
              </div>
            ) : (
              <div style={{ padding: '6px 10px', backgroundColor: '#fde68a', borderRadius: '6px', color: '#92400e', fontSize: '11px', fontWeight: '700', letterSpacing: '0.5px' }}>
                AGUARDANDO ASSINATURA
              </div>
            )}
          </div>
          <h1 style={{ margin: 0, fontSize: '22px', fontWeight: '700', color: '#1a1a1a' }}>
            {contrato.titulo}
          </h1>
        </div>

        <div style={{
          padding: '28px',
          fontSize: '15px',
          lineHeight: '1.8',
          color: '#1f2937',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word'
        }}>
          {contrato.conteudo}
        </div>

        {jaAssinado ? (
          <div style={{ padding: '28px', borderTop: '2px solid #e5e7eb', backgroundColor: '#f9fafb' }}>
            <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Assinado digitalmente por
            </div>
            <div style={{
              fontSize: '42px',
              fontFamily: fonteUsada,
              color: '#1a1a1a',
              lineHeight: '1.2',
              marginBottom: '8px',
              borderBottom: '1px solid #9ca3af',
              paddingBottom: '8px',
              display: 'inline-block',
              minWidth: '260px'
            }}>
              {nomeExibido}
            </div>
            <div style={{ fontSize: '12px', color: '#6b7280' }}>
              {contrato.assinatura_nome} · {new Date(contrato.assinado_em).toLocaleString('pt-BR')}
            </div>
          </div>
        ) : (
          <div style={{ padding: '28px', borderTop: '2px solid #e5e7eb', backgroundColor: '#fffbeb' }}>
            <h3 style={{ margin: '0 0 12px', fontSize: '16px', fontWeight: '700', color: '#1a1a1a' }}>
              Assinar contrato
            </h3>

            <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#374151', marginBottom: '6px' }}>
              Seu nome completo
            </label>
            <input
              type="text"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Digite seu nome completo"
              style={{ width: '100%', padding: '12px 14px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '15px', boxSizing: 'border-box', marginBottom: '16px' }}
            />

            <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#374151', marginBottom: '6px' }}>
              Escolha a fonte da sua assinatura
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '8px', marginBottom: '16px' }}>
              {FONTES_ASSINATURA.map(f => (
                <button
                  key={f.nome}
                  onClick={() => setFonteSelecionada(f.nome)}
                  style={{
                    padding: '14px 12px',
                    backgroundColor: fonteSelecionada === f.nome ? '#eef2ff' : 'white',
                    border: '2px solid ' + (fonteSelecionada === f.nome ? '#4f46e5' : '#e5e7eb'),
                    borderRadius: '8px',
                    cursor: 'pointer',
                    fontSize: '24px',
                    fontFamily: f.fontFamily,
                    color: '#1a1a1a',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis'
                  }}
                >
                  {nome.trim() || 'Seu nome'}
                </button>
              ))}
            </div>

            {nome.trim() && (
              <div style={{ padding: '16px', backgroundColor: 'white', border: '1px dashed #d1d5db', borderRadius: '8px', textAlign: 'center', marginBottom: '16px' }}>
                <div style={{ fontSize: '11px', color: '#6b7280', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  Prévia da assinatura
                </div>
                <div style={{
                  fontSize: '38px',
                  fontFamily: FONTES_ASSINATURA.find(f => f.nome === fonteSelecionada)?.fontFamily,
                  color: '#1a1a1a',
                  lineHeight: '1.2'
                }}>
                  {nome}
                </div>
              </div>
            )}

            <label style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', padding: '12px', backgroundColor: 'white', border: '1px solid #e5e7eb', borderRadius: '8px', cursor: 'pointer', marginBottom: '16px' }}>
              <input
                type="checkbox"
                checked={aceitouTermos}
                onChange={(e) => setAceitouTermos(e.target.checked)}
                style={{ marginTop: '3px', cursor: 'pointer' }}
              />
              <span style={{ fontSize: '13px', color: '#374151', lineHeight: '1.5' }}>
                Li e concordo com os termos apresentados acima. Ao assinar, confirmo a veracidade das informações e aceito as condições deste contrato.
              </span>
            </label>

            <button
              onClick={assinar}
              disabled={assinando || !nome.trim() || !aceitouTermos}
              style={{
                width: '100%', padding: '14px', fontSize: '16px', fontWeight: '700',
                backgroundColor: (assinando || !nome.trim() || !aceitouTermos) ? '#9ca3af' : '#4CAF50',
                color: 'white', border: 'none', borderRadius: '8px',
                cursor: (assinando || !nome.trim() || !aceitouTermos) ? 'not-allowed' : 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px'
              }}
            >
              {assinando ? (
                <><Icon icon="eos-icons:loading" width="20" /> Assinando...</>
              ) : (
                <><Icon icon="mdi:draw-pen" width="20" /> Assinar contrato</>
              )}
            </button>
          </div>
        )}
      </div>

      <div style={{ textAlign: 'center', padding: '20px', fontSize: '12px', color: '#9ca3af' }}>
        Assinatura digital sem validade jurídica. Documento registrado em {new Date(contrato.created_at).toLocaleDateString('pt-BR')}.
      </div>
    </div>
  )
}
