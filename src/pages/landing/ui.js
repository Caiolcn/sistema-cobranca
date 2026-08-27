// Primitivas visuais compartilhadas entre as landings publicas (/ e /escolinha).
//
// Ficam fora do design system de proposito: o DS (src/design-system) veste o app
// logado, e as landings tem outra escala tipografica, outra paleta de fundo e
// vivem de efeito (blob, float, gradiente). O que nao pode e' cada landing ter
// a sua copia da paleta e dos botoes — foi pra isso que este arquivo existe.

import { MdDoneAll, MdQrCode2 } from 'react-icons/md'
import { FaWhatsapp } from 'react-icons/fa'

// ---- paleta ----
export const INK = '#0f1115'
export const BODY = '#5b636e'
export const MUTED = '#9aa1ab'
export const BORDER = '#ececf0'
export const BG = '#ffffff'
export const BG_SOFT = '#f7faf8'
export const GREEN = '#16a34a'
export const GREEN_DK = '#15803d'
export const GREEN_BRIGHT = '#22c55e'
export const GREEN_SOFT = '#ecfdf3'
export const DARK = '#0d100e'
export const GRAD = 'linear-gradient(135deg, #22c55e 0%, #0ea372 100%)'
export const GRAD_TEXT = 'linear-gradient(120deg, #16a34a, #0ea372)'

export const gradText = { background: GRAD_TEXT, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }

// ---- CSS compartilhado (keyframes + classes utilitarias) ----
// Renderize uma vez por pagina: <style>{LANDING_CSS}</style>
export const LANDING_CSS = `
  @keyframes lpFadeUp { from { opacity: 0; transform: translateY(18px); } to { opacity: 1; transform: translateY(0); } }
  @keyframes lpFloat { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-12px); } }
  @keyframes lpFloatSlow { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-18px); } }
  @keyframes lpBlob { 0%,100% { transform: translate(0,0) scale(1); } 50% { transform: translate(20px,-20px) scale(1.08); } }
  @keyframes lpTick { 0%,55% { color: #9aa7b0; } 70%,100% { color: #53bdeb; } }
  @keyframes lpMarquee { from { transform: translateX(0); } to { transform: translateX(-50%); } }
  .lp-card { transition: transform .25s ease, box-shadow .25s ease, border-color .25s ease; }
  .lp-card:hover { transform: translateY(-4px); box-shadow: 0 20px 50px rgba(16,24,40,.10); border-color: #d7f0e0 !important; }
  .lp-float { animation: lpFloat 6s ease-in-out infinite; }
  .lp-floatslow { animation: lpFloatSlow 8s ease-in-out infinite; }
  .lp-marquee { animation: lpMarquee 34s linear infinite; }
  @media (prefers-reduced-motion: reduce){ .lp-float,.lp-floatslow,.lp-marquee{ animation:none!important } }
  input::placeholder { color: ${MUTED}; }
`

// ---- helpers ----
export function scrollToId(id) {
  const el = document.getElementById(id)
  if (el) el.scrollIntoView({ behavior: 'smooth' })
}

export function dot(c) { return { width: '11px', height: '11px', borderRadius: '50%', backgroundColor: c } }

export function btnGrad(padding, fontSize) {
  return { padding, fontSize, background: GRAD, color: 'white', border: 'none', borderRadius: '12px', fontWeight: '700', cursor: 'pointer', transition: 'all .2s', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '9px', boxShadow: '0 8px 24px rgba(22,163,74,0.28)' }
}

export function btnGhost(padding, width) {
  return { padding, width, fontSize: '15px', backgroundColor: 'white', color: INK, border: `1px solid ${BORDER}`, borderRadius: '12px', fontWeight: '600', cursor: 'pointer', transition: 'all .2s', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }
}

// ---- componentes ----
export function Blob({ style }) {
  return <div className="lp-float" style={{ position: 'absolute', zIndex: 0, pointerEvents: 'none', borderRadius: '50%', filter: 'blur(60px)', background: 'radial-gradient(circle at 30% 30%, rgba(34,197,94,0.45), rgba(14,163,114,0.25) 45%, rgba(34,197,94,0) 70%)', animation: 'lpBlob 12s ease-in-out infinite', ...style }} />
}

// Mockup de conversa de WhatsApp. As mensagens vem por prop porque cada landing
// fala com um publico diferente — a raiz fala com "cliente", a /escolinha fala
// com o responsavel pelo atleta.
//   mensagens: [{ de: 'nos' | 'eles', texto, hora, anexo?: 'pix', tickAnimado?: bool }]
export function PhoneChat({ isSmall, titulo = 'Mensalli', subtitulo = 'online', mensagens = [] }) {
  const W = isSmall ? 240 : 280
  return (
    <div className="lp-floatslow" style={{ position: 'relative', zIndex: 1, width: W, borderRadius: '38px', border: '10px solid #111', background: '#111', boxShadow: '0 40px 80px rgba(16,24,40,0.3)' }}>
      <div style={{ borderRadius: '28px', overflow: 'hidden', backgroundColor: '#e7ded5' }}>
        <div style={{ background: 'linear-gradient(135deg,#0ea372,#16a34a)', padding: '14px 14px 12px', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ width: '34px', height: '34px', borderRadius: '50%', backgroundColor: 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><FaWhatsapp size={18} color="white" /></span>
          <div style={{ lineHeight: 1.2 }}>
            <p style={{ margin: 0, fontSize: '14px', fontWeight: '700', color: 'white' }}>{titulo}</p>
            <p style={{ margin: 0, fontSize: '11px', color: 'rgba(255,255,255,0.85)' }}>{subtitulo}</p>
          </div>
        </div>
        <div style={{ padding: '18px 14px', display: 'flex', flexDirection: 'column', gap: '10px', minHeight: '300px' }}>
          {mensagens.map((m, i) => {
            const nosso = m.de !== 'eles'
            return (
              <div key={i} style={{
                alignSelf: nosso ? 'flex-end' : 'flex-start',
                maxWidth: nosso ? '85%' : '80%',
                backgroundColor: nosso ? '#d9fdd3' : 'white',
                borderRadius: nosso ? '12px 12px 4px 12px' : '12px 12px 12px 4px',
                padding: '9px 11px',
                boxShadow: '0 1px 1px rgba(0,0,0,0.08)'
              }}>
                <p style={{ margin: 0, fontSize: '13px', color: '#111b21', lineHeight: 1.45 }}>{m.texto}</p>
                {m.anexo === 'pix' && (
                  <div style={{ marginTop: '7px', backgroundColor: 'rgba(0,0,0,0.05)', borderRadius: '8px', padding: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <MdQrCode2 size={20} style={{ color: GREEN_DK }} />
                    <span style={{ fontSize: '12px', fontWeight: '600', color: '#111b21' }}>Link de pagamento</span>
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '3px', marginTop: '4px' }}>
                  <span style={{ fontSize: '10px', color: '#667781' }}>{m.hora}</span>
                  {nosso && <MdDoneAll size={14} style={m.tickAnimado ? { animation: 'lpTick 4s ease-in-out infinite' } : { color: '#53bdeb' }} />}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
