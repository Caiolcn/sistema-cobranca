import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { FaWhatsapp } from 'react-icons/fa'
import { MdArrowForward, MdCheckCircle } from 'react-icons/md'
import { supabase } from '../supabaseClient'
import { showSuccess, showError } from '../Toast'
import useWindowSize from '../hooks/useWindowSize'
import {
  INK, BODY, MUTED, BORDER, BG, BG_SOFT,
  GREEN, GREEN_DK, GREEN_BRIGHT, GREEN_SOFT, GRAD, GRAD_TEXT,
  gradText, LANDING_CSS, scrollToId, btnGrad, btnGhost, Blob
} from './landing/ui'

const NUMEROS = [
  { valor: '2.700+', label: 'alunos gerenciados' },
  { valor: '8.500+', label: 'mensagens enviadas' },
  { valor: 'R$ 490k', label: 'administrados' }
]

export default function LandingNicho({ nicho, titulo, subtitulo, beneficios, cta, imagem }) {
  const navigate = useNavigate()
  const { isMobile, isSmallScreen } = useWindowSize()
  const [email, setEmail] = useState('')
  const [telefone, setTelefone] = useState('')
  const [nome, setNome] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)

    try {
      const params = new URLSearchParams(window.location.search)
      const gclid = params.get('gclid')

      const { error } = await supabase.auth.signUp({
        email,
        password: Math.random().toString(36).slice(-12),
        options: {
          data: {
            nome_completo: nome,
            telefone: telefone.replace(/\D/g, ''),
            plano: 'pro',
            gclid: gclid || null,
            google_lead_source: nicho
          }
        }
      })

      if (error) throw error
      showSuccess('Conta criada! Confira seu email.')
      setTimeout(() => navigate('/app/home'), 2000)
    } catch (erro) {
      showError(erro.message || 'Erro ao criar conta')
    } finally {
      setLoading(false)
    }
  }

  const sectionPad = isSmallScreen ? '64px 22px' : '110px 24px'
  const h2 = { fontSize: isSmallScreen ? '30px' : '44px', fontWeight: '800', letterSpacing: '-1.4px', color: INK, lineHeight: '1.1', margin: '0 0 16px' }
  const eyebrow = { display: 'inline-flex', alignItems: 'center', gap: '7px', fontSize: '13px', fontWeight: '700', color: GREEN_DK, backgroundColor: GREEN_SOFT, padding: '6px 14px', borderRadius: '100px', marginBottom: '18px' }
  const sub = { fontSize: '17px', color: BODY, lineHeight: '1.6', maxWidth: '620px', margin: '0 auto' }

  const navLink = { fontSize: '15px', color: MUTED, background: 'none', border: 'none', cursor: 'pointer', fontWeight: '500', transition: 'color .2s', padding: '8px 14px', borderRadius: '8px', whiteSpace: 'nowrap' }

  return (
    <div style={{ fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif', backgroundColor: BG, color: INK, WebkitFontSmoothing: 'antialiased', overflowX: 'hidden' }}>
      <style>{LANDING_CSS}</style>

      {/* Navbar */}
      <nav style={{ backgroundColor: 'rgba(255,255,255,0.82)', backdropFilter: 'saturate(180%) blur(14px)', WebkitBackdropFilter: 'saturate(180%) blur(14px)', padding: '14px 0', borderBottom: `1px solid ${BORDER}`, position: 'sticky', top: 0, zIndex: 1000 }}>
        <div style={{ maxWidth: '1180px', margin: '0 auto', padding: '0 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <a href="/" style={{ display: 'flex', alignItems: 'center', textDecoration: 'none' }}>
            <img src="/Logo-Full.png" alt="Mensalli" style={{ height: '34px', width: 'auto', cursor: 'pointer' }} />
          </a>
          <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
            {!isMobile && (
              <>
                <button onClick={() => scrollToId('features')} style={{ ...navLink, ':hover': { color: INK } }}>Recursos</button>
                <button onClick={() => scrollToId('cta')} style={navLink}>Começar</button>
                <button onClick={() => navigate('/login')} style={{ ...navLink, color: INK, fontWeight: '600' }}>Entrar</button>
              </>
            )}
            <button onClick={() => navigate('/signup')} style={btnGrad('10px 18px', '14px')} onMouseOver={e => e.currentTarget.style.opacity = '.9'} onMouseOut={e => e.currentTarget.style.opacity = '1'}>
              Teste grátis
            </button>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section style={{ position: 'relative', padding: isSmallScreen ? '52px 22px 0' : '92px 24px 0', overflow: 'hidden', background: 'linear-gradient(180deg, #f3fbf6 0%, #ffffff 60%)' }}>
        <Blob style={{ top: isSmallScreen ? '-100px' : '-60px', right: isSmallScreen ? '-80px' : '-40px', width: '400px', height: '400px' }} />
        <div style={{ maxWidth: '860px', margin: '0 auto', textAlign: 'center', position: 'relative', zIndex: 1 }}>
          <div style={eyebrow}><FaWhatsapp size={14} /> Para {nicho.toLowerCase()}</div>
          <h1 style={{ fontSize: isSmallScreen ? '38px' : '62px', fontWeight: '800', lineHeight: '1.05', letterSpacing: '-2.2px', margin: '0 0 22px' }}>
            {titulo}
          </h1>
          <p style={{ ...sub, fontSize: isSmallScreen ? '17px' : '20px', marginBottom: '32px' }}>
            {subtitulo}
          </p>
          <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexDirection: isSmallScreen ? 'column' : 'row', alignItems: 'center' }}>
            <button onClick={() => document.getElementById('form').scrollIntoView({ behavior: 'smooth' })} style={{ ...btnGrad('15px 30px', '16px'), width: isSmallScreen ? '100%' : 'auto', display: 'flex', gap: '8px' }}
              onMouseOver={e => { e.currentTarget.style.transform = 'translateY(-2px)' }} onMouseOut={e => { e.currentTarget.style.transform = 'translateY(0)' }}>
              Começar agora <MdArrowForward size={18} />
            </button>
          </div>
        </div>
      </section>

      {/* Números */}
      <section style={{ maxWidth: '1180px', margin: '0 auto', padding: sectionPad, display: 'grid', gridTemplateColumns: isSmallScreen ? '1fr' : 'repeat(3, 1fr)', gap: '20px' }}>
        {NUMEROS.map((n, i) => (
          <div key={i} style={{ background: BG, padding: '32px 24px', borderRadius: '14px', textAlign: 'center', boxShadow: '0 2px 12px rgba(16,24,40,0.06)', border: `1px solid ${BORDER}` }}>
            <div style={{ fontSize: isSmallScreen ? '32px' : '42px', fontWeight: '800', color: GREEN_BRIGHT, marginBottom: '8px', lineHeight: 1 }}>
              {n.valor}
            </div>
            <div style={{ fontSize: '14px', color: BODY }}>
              {n.label}
            </div>
          </div>
        ))}
      </section>

      {/* Benefícios */}
      <section id="features" style={{ maxWidth: '1180px', margin: '0 auto', padding: sectionPad }}>
        <h2 style={h2}>
          Por que escolher Mensalli para <span style={gradText}>{nicho}</span>?
        </h2>
        <div style={{ display: 'grid', gridTemplateColumns: isSmallScreen ? '1fr' : 'repeat(2, 1fr)', gap: '20px', marginTop: '32px' }}>
          {beneficios.map((b, i) => (
            <div key={i} className="lp-card" style={{
              background: BG,
              padding: '28px',
              borderRadius: '14px',
              border: `1px solid ${BORDER}`,
              display: 'flex',
              gap: '16px'
            }}>
              <MdCheckCircle size={24} style={{ color: GREEN_BRIGHT, flexShrink: 0, marginTop: '2px' }} />
              <div>
                <div style={{ fontWeight: '600', color: INK, marginBottom: '6px', fontSize: '15px' }}>
                  {typeof b === 'string' ? b.split(' - ')[0] : b.titulo}
                </div>
                {typeof b === 'string' && b.includes(' - ') && (
                  <div style={{ fontSize: '14px', color: BODY }}>
                    {b.split(' - ')[1]}
                  </div>
                )}
                {typeof b === 'object' && b.desc && (
                  <div style={{ fontSize: '14px', color: BODY }}>
                    {b.desc}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* CTA Section */}
      <section id="cta" style={{ maxWidth: '1180px', margin: '0 auto', padding: sectionPad, textAlign: 'center' }}>
        <div style={{ background: `linear-gradient(135deg, ${GREEN_SOFT} 0%, #f7faf8 100%)`, borderRadius: '20px', padding: isSmallScreen ? '48px 24px' : '72px 48px', border: `2px solid ${BORDER}` }}>
          <h2 style={{ ...h2, color: INK, marginBottom: '16px' }}>Pronto para começar?</h2>
          <p style={{ ...sub, marginBottom: '32px' }}>
            7 dias de teste grátis. Sem cartão de crédito, sem compromisso.
          </p>
          <button onClick={() => document.getElementById('form').scrollIntoView({ behavior: 'smooth' })} style={btnGrad('15px 40px', '16px')}
            onMouseOver={e => { e.currentTarget.style.transform = 'translateY(-2px)' }} onMouseOut={e => { e.currentTarget.style.transform = 'translateY(0)' }}>
            Começar trial gratuito
          </button>
        </div>
      </section>

      {/* Formulário */}
      <div id="form" style={{ padding: sectionPad, background: BG_SOFT, borderTop: `1px solid ${BORDER}` }}>
        <div style={{ maxWidth: '480px', margin: '0 auto' }}>
          <div style={{ background: BG, borderRadius: '16px', padding: isSmallScreen ? '32px 24px' : '48px', boxShadow: '0 10px 40px rgba(16,24,40,0.08)' }}>
            <h2 style={{ fontSize: '24px', fontWeight: '700', marginBottom: '8px', color: INK }}>
              Teste Gratuito
            </h2>
            <p style={{ fontSize: '14px', color: BODY, marginBottom: '28px' }}>
              7 dias sem cartão. Cancele quando quiser.
            </p>

            <form onSubmit={handleSubmit}>
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', marginBottom: '6px', color: INK }}>
                  Seu nome *
                </label>
                <input
                  type="text"
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                  placeholder="João Silva"
                  required
                  style={{
                    width: '100%',
                    padding: '11px 14px',
                    border: `1px solid ${BORDER}`,
                    borderRadius: '8px',
                    fontSize: '14px',
                    fontFamily: 'inherit',
                    color: INK,
                    backgroundColor: '#fafbfc'
                  }}
                />
              </div>

              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', marginBottom: '6px', color: INK }}>
                  Email *
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="seu@email.com"
                  required
                  style={{
                    width: '100%',
                    padding: '11px 14px',
                    border: `1px solid ${BORDER}`,
                    borderRadius: '8px',
                    fontSize: '14px',
                    fontFamily: 'inherit',
                    color: INK,
                    backgroundColor: '#fafbfc'
                  }}
                />
              </div>

              <div style={{ marginBottom: '28px' }}>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', marginBottom: '6px', color: INK }}>
                  WhatsApp *
                </label>
                <input
                  type="tel"
                  value={telefone}
                  onChange={(e) => setTelefone(e.target.value)}
                  placeholder="(11) 98765-4321"
                  required
                  style={{
                    width: '100%',
                    padding: '11px 14px',
                    border: `1px solid ${BORDER}`,
                    borderRadius: '8px',
                    fontSize: '14px',
                    fontFamily: 'inherit',
                    color: INK,
                    backgroundColor: '#fafbfc'
                  }}
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                style={{
                  width: '100%',
                  padding: '14px',
                  background: loading ? MUTED : GRAD,
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '15px',
                  fontWeight: '600',
                  cursor: loading ? 'not-allowed' : 'pointer',
                  transition: 'transform 0.2s'
                }}
                onMouseOver={(e) => !loading && (e.target.style.transform = 'translateY(-2px)')}
                onMouseOut={(e) => (e.target.style.transform = 'translateY(0)')}
              >
                {loading ? '⏳ Criando conta...' : cta}
              </button>
            </form>

            <p style={{ fontSize: '12px', color: MUTED, marginTop: '20px', textAlign: 'center' }}>
              Ao se cadastrar, você concorda com nossos<br/>Termos de Uso e Política de Privacidade
            </p>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer style={{ background: INK, color: 'white', textAlign: 'center', padding: '40px 20px', fontSize: '13px', borderTop: `1px solid ${BORDER}` }}>
        <p>© 2026 Mensalli. Todos os direitos reservados.</p>
      </footer>
    </div>
  )
}
