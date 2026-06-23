import { useEffect, useState } from 'react'
import {
  MdArrowOutward, MdCardGiftcard, MdLanguage, MdArticle, MdFavorite,
  MdExpandMore
} from 'react-icons/md'
import { FaWhatsapp, FaInstagram } from 'react-icons/fa'

// Paleta clara — fundo "tech" com grid pontilhado + acento verde da marca
const BG = '#f6f7f9'
const PANEL = '#ffffff'
const PANEL2 = '#f4f4f6'
const BORDER = 'rgba(9,9,11,0.08)'
const BORDER_HOVER = 'rgba(34,197,94,0.55)'
const TEXT = '#18181b'
const BODY = '#52525b'
const MUTED = '#a1a1aa'
const GREEN = '#22c55e'
const GREEN_DK = '#16a34a'
const GREEN_SOFT = 'rgba(34,197,94,0.10)'
const ON_GREEN = '#ffffff'

// ── Conteúdo editável ──────────────────────────────────────────────
// Troque os href pelos links reais. Pra esconder um bloco, remova do array.

const PERFIL = {
  nome: 'Mensalli',
  bio: 'Cobranças automáticas no WhatsApp, sem esforço',
}

// Sem redes por enquanto: o link já vive na bio do Instagram, então um botão
// de Instagram aqui seria circular. Repovoe quando houver outras redes.
const SOCIAIS = []

// Mini-FAQ (quebra de objeção). Copy puxada da landing.
const FAQ = [
  {
    q: 'Meus dados estão seguros?',
    a: 'Sim. Usamos criptografia de ponta e nunca compartilhamos dados de clientes. Seus dados financeiros ficam apenas no seu painel.',
  },
  {
    q: 'Como funciona a conexão com o WhatsApp?',
    a: 'Você escaneia um QR Code que vincula seu número. As mensagens saem do seu WhatsApp, mantendo o relacionamento direto.',
  },
  {
    q: 'Posso cancelar quando quiser?',
    a: 'Sim! Sem multa, sem burocracia. Cancela direto no painel e o sistema para de cobrar no próximo ciclo.',
  },
]

const LINKS = [
  {
    icon: MdCardGiftcard,
    titulo: 'Teste 7 dias grátis',
    sub: 'Sem cartão, sem compromisso',
    href: '/signup',
    destaque: true,
  },
  {
    icon: FaWhatsapp,
    titulo: 'Fale com o nosso time',
    sub: 'Tire suas dúvidas no WhatsApp',
    href: 'https://wa.me/5562981618862',
  },
  {
    icon: MdLanguage,
    titulo: 'Conheça o Mensalli',
    sub: 'Acesse nosso site',
    href: '/',
  },
  {
    icon: MdArticle,
    titulo: 'Blog',
    sub: 'Dicas de gestão e cobrança',
    href: '#',
  },
]

// Bloco do Instagram (posts curados). O card inteiro leva ao perfil. Troque
// `img` pelas imagens reais (em /public ou URL). Esconda o bloco deixando vazio.
const INSTAGRAM = {
  handle: '@mensalli',
  perfil: 'https://instagram.com/mensalli',
  posts: [
    { img: '/insta/3.png' },
    { img: '/insta/2.png' },
    { img: '/insta/1.png' },
  ],
}

function isExterno(href) {
  return /^https?:\/\//.test(href)
}

// Tracinho central pra separar seções
function Divisor() {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', margin: '22px 0' }}>
      <div style={{ width: '32px', height: '2px', borderRadius: '2px', background: 'rgba(9,9,11,0.14)' }} />
    </div>
  )
}

export default function LinkInBio() {
  const [faqAberto, setFaqAberto] = useState(null)

  useEffect(() => {
    document.title = `${PERFIL.nome} · Links`
  }, [])

  const cardBase = {
    display: 'flex',
    alignItems: 'center',
    gap: '14px',
    width: '100%',
    padding: '16px 18px',
    borderRadius: '16px',
    background: PANEL,
    border: `1px solid ${BORDER}`,
    color: TEXT,
    textDecoration: 'none',
    transition: 'transform .15s ease, border-color .15s ease, box-shadow .15s ease',
    boxShadow: 'none',
    boxSizing: 'border-box',
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: BG,
      // Grid pontilhado "tech" + glow verde suave no topo
      backgroundImage: `radial-gradient(circle at 50% -8%, ${GREEN_SOFT}, transparent 45%), radial-gradient(rgba(9,9,11,0.07) 1px, transparent 1px)`,
      backgroundSize: 'auto, 22px 22px',
      backgroundPosition: 'center top, center',
      display: 'flex',
      justifyContent: 'center',
      padding: '40px 20px 60px',
      fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
    }}>
      <div style={{
        width: '100%', maxWidth: '480px',
        background: PANEL,
        border: `1px solid ${BORDER}`,
        borderRadius: '28px',
        boxShadow: '0 8px 40px rgba(9,9,11,0.08)',
        padding: '36px 28px 28px',
        boxSizing: 'border-box',
      }}>

        {/* Cabeçalho */}
        <header style={{ textAlign: 'center', marginBottom: '28px' }}>
          <div style={{
            width: '60px', height: '60px', margin: '0 auto 14px',
            borderRadius: '18px', overflow: 'hidden',
            border: `1px solid ${BORDER}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: `0 0 0 3px ${GREEN_SOFT}, 0 4px 12px rgba(9,9,11,0.08)`,
          }}>
            <img
              src="/logo512.png"
              alt={PERFIL.nome}
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
          </div>
          <h1 style={{ margin: '0 0 5px', fontSize: '18px', fontWeight: 700, color: '#1d1d1d' }}>
            {PERFIL.nome}
          </h1>
          <p style={{ margin: 0, fontSize: '13px', color: '#a0a2a7', lineHeight: 1.5 }}>
            {PERFIL.bio}
          </p>

          {/* Redes sociais */}
          {SOCIAIS.length > 0 && (
          <div style={{ display: 'flex', justifyContent: 'center', gap: '10px', marginTop: '18px' }}>
            {SOCIAIS.map((s) => {
              const Icon = s.icon
              return (
                <a
                  key={s.label}
                  href={s.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={s.label}
                  style={{
                    width: '40px', height: '40px', borderRadius: '12px',
                    background: PANEL, border: `1px solid ${BORDER}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: BODY,
                    boxShadow: '0 1px 2px rgba(9,9,11,0.04)',
                    transition: 'color .15s ease, border-color .15s ease',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.color = GREEN_DK; e.currentTarget.style.borderColor = BORDER_HOVER }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = BODY; e.currentTarget.style.borderColor = BORDER }}
                >
                  <Icon size={18} />
                </a>
              )
            })}
          </div>
          )}
        </header>

        {/* Links */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {LINKS.map((link) => {
            const Icon = link.icon
            const externo = isExterno(link.href)
            const style = {
              ...cardBase,
              ...(link.destaque ? {
                background: GREEN_SOFT,
                borderColor: BORDER_HOVER,
              } : {}),
            }
            return (
              <a
                key={link.titulo}
                href={link.href}
                target={externo ? '_blank' : undefined}
                rel={externo ? 'noopener noreferrer' : undefined}
                style={style}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'translateY(-2px)'
                  e.currentTarget.style.borderColor = BORDER_HOVER
                  e.currentTarget.style.boxShadow = '0 8px 24px rgba(34,197,94,0.14)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'translateY(0)'
                  e.currentTarget.style.borderColor = link.destaque ? BORDER_HOVER : BORDER
                  e.currentTarget.style.boxShadow = cardBase.boxShadow
                }}
              >
                <div style={{
                  width: '44px', height: '44px', flexShrink: 0,
                  borderRadius: '12px',
                  background: link.destaque ? GREEN : PANEL2,
                  border: `1px solid ${link.destaque ? 'transparent' : BORDER}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: link.destaque ? ON_GREEN : GREEN_DK,
                }}>
                  <Icon size={20} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ margin: 0, fontSize: '14px', fontWeight: 500, color: '#3f3f46' }}>
                    {link.titulo}
                  </p>
                  {link.sub && (
                    <p style={{ margin: '2px 0 0', fontSize: '12px', color: MUTED }}>
                      {link.sub}
                    </p>
                  )}
                </div>
                <MdArrowOutward size={18} style={{ color: MUTED, flexShrink: 0 }} />
              </a>
            )
          })}
        </div>

        {/* Mini-FAQ */}
        {FAQ.length > 0 && <Divisor />}
        {FAQ.length > 0 && (
          <div style={{
            border: `1px solid ${BORDER}`, borderRadius: '16px',
            background: PANEL, overflow: 'hidden',
          }}>
            {FAQ.map((item, i) => {
              const aberto = faqAberto === i
              return (
                <div key={i} style={{ borderTop: i === 0 ? 'none' : `1px solid ${BORDER}` }}>
                  <button
                    onClick={() => setFaqAberto(aberto ? null : i)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '12px',
                      width: '100%', padding: '14px 16px',
                      background: 'transparent', border: 'none', cursor: 'pointer',
                      textAlign: 'left', font: 'inherit',
                    }}
                  >
                    <span style={{ flex: 1, fontSize: '13px', fontWeight: 500, color: '#3f3f46' }}>
                      {item.q}
                    </span>
                    <MdExpandMore
                      size={20}
                      style={{
                        color: MUTED, flexShrink: 0,
                        transform: aberto ? 'rotate(180deg)' : 'rotate(0deg)',
                        transition: 'transform .2s ease',
                      }}
                    />
                  </button>
                  <div style={{
                    maxHeight: aberto ? '160px' : '0',
                    overflow: 'hidden',
                    transition: 'max-height .25s ease',
                  }}>
                    <p style={{
                      margin: 0, padding: '0 16px 14px',
                      fontSize: '12px', color: BODY, lineHeight: 1.55,
                    }}>
                      {item.a}
                    </p>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* Instagram — card inteiro clicável leva ao perfil */}
        {INSTAGRAM.posts.length > 0 && <Divisor />}
        {INSTAGRAM.posts.length > 0 && (
          <a
            href={INSTAGRAM.perfil}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'block', textDecoration: 'none',
              border: `1px solid ${BORDER}`,
              borderRadius: '16px',
              padding: '16px 16px 18px',
              background: PANEL,
              transition: 'border-color .15s ease, box-shadow .15s ease',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = BORDER_HOVER; e.currentTarget.style.boxShadow = '0 8px 24px rgba(34,197,94,0.12)' }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = BORDER; e.currentTarget.style.boxShadow = 'none' }}
          >
            {/* Cabeçalho do card */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: '12px',
              marginBottom: '14px',
            }}>
              <div style={{
                width: '36px', height: '36px', flexShrink: 0,
                borderRadius: '10px', background: PANEL2,
                border: `1px solid ${BORDER}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: GREEN_DK,
              }}>
                <FaInstagram size={18} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ margin: 0, fontSize: '14px', fontWeight: 500, color: '#3f3f46' }}>
                  Nosso Instagram
                </p>
                <p style={{ margin: '2px 0 0', fontSize: '12px', color: MUTED }}>
                  {INSTAGRAM.handle}
                </p>
              </div>
              <MdArrowOutward size={18} style={{ color: MUTED, flexShrink: 0 }} />
            </div>

            {/* Posts: 2 inteiros + 3º cortado (sugere que há vários) */}
            <div style={{
              display: 'flex', gap: '10px',
              overflow: 'hidden',
              // bleed até a borda direita do card pra o corte ficar limpo
              margin: '0 -16px 0 0', paddingRight: '16px',
              maskImage: 'linear-gradient(to right, #000 78%, transparent 100%)',
              WebkitMaskImage: 'linear-gradient(to right, #000 78%, transparent 100%)',
            }}>
              {INSTAGRAM.posts.map((post, i) => (
                <div
                  key={i}
                  style={{
                    flex: '0 0 40%', aspectRatio: '4 / 5',
                    borderRadius: '14px', overflow: 'hidden',
                    position: 'relative',
                    background: PANEL2,
                    boxShadow: '0 2px 8px rgba(9,9,11,0.08)',
                  }}
                >
                  <img
                    src={post.img}
                    alt={`Post ${i + 1} no Instagram`}
                    loading="lazy"
                    style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                  />
                  {/* gradiente sutil pra dar profundidade */}
                  <div style={{
                    position: 'absolute', inset: 0,
                    background: 'linear-gradient(to top, rgba(9,9,11,0.22), transparent 45%)',
                  }} />
                </div>
              ))}
            </div>
          </a>
        )}

        {/* Rodapé */}
        <footer style={{
          marginTop: '36px', textAlign: 'center',
          fontSize: '12px', color: MUTED,
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px',
        }}>
          Feito com <MdFavorite size={13} style={{ color: GREEN }} /> pela equipe Mensalli
        </footer>
      </div>
    </div>
  )
}
