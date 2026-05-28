import React, { useState } from 'react'

/* ============================================================
   /app/design-system/motion
   Durations + easings + loading states + entradas.
   ============================================================ */

const USO_REAL = [
  { label: "transition: 'all 0.2s'", usos: 101, warning: true },
  { label: 'duration 0.2s (total)', usos: 211, warning: false },
  { label: 'duration 0.3s (total)', usos: 67, warning: false },
  { label: 'easing "ease" genérico', usos: 51, warning: true },
  { label: '@keyframes spin (duplicado)', usos: 15, warning: true },
  { label: '@keyframes fadeIn (duplicado)', usos: 9, warning: true },
]

const DURATIONS = [
  { token: '--duration-100', ms: '100ms', uso: 'Feedback instantâneo — ripple, toggle checkbox', destaque: false },
  { token: '--duration-150', ms: '150ms', uso: 'Hover, focus ring — DEFAULT pra feedback', destaque: true },
  { token: '--duration-200', ms: '200ms', uso: 'Transições de cor, borda, sombra (211 usos hoje)', destaque: false },
  { token: '--duration-300', ms: '300ms', uso: 'Tooltip, dropdown, popover entrando', destaque: false },
  { token: '--duration-500', ms: '500ms', uso: 'Modal, aside entrando/saindo', destaque: false },
  { token: '--duration-700', ms: '700ms', uso: 'Raríssimo — hero, animação ilustrativa', destaque: false },
]

const EASINGS = [
  { token: '--ease-out',     curve: 'cubic-bezier(0.22, 1, 0.36, 1)',    uso: 'DEFAULT — desacelera no fim, sensação natural', destaque: true },
  { token: '--ease-in',      curve: 'cubic-bezier(0.64, 0, 0.78, 0)',    uso: 'Saídas — algo desaparecendo, modal fechando' },
  { token: '--ease-in-out',  curve: 'cubic-bezier(0.65, 0, 0.35, 1)',    uso: 'Idas-e-voltas (tab ativa mudando)' },
  { token: '--ease-bounce',  curve: 'cubic-bezier(0.34, 1.56, 0.64, 1)', uso: 'Delight raro (toggle, checkmark)' },
]

const ENTRADAS = [
  { keyframe: 'ds-fade-in',         label: 'Fade in',         uso: 'Overlays, dropdowns, popovers' },
  { keyframe: 'ds-slide-in-right',  label: 'Slide right',     uso: 'Aside, drawer mobile' },
  { keyframe: 'ds-slide-in-bottom', label: 'Slide bottom',    uso: 'Modal mobile, toast' },
  { keyframe: 'ds-slide-in-top',    label: 'Slide top',       uso: 'Banner, notificação' },
  { keyframe: 'ds-scale-in',        label: 'Scale in',        uso: 'Popover (vindo do trigger)' },
]

const REGRAS = [
  { titulo: 'Nunca transition: all', body: 'Sempre especifique a propriedade. transition-all viola performance + previsibilidade. Hoje há 120+ ocorrências — todas problemáticas.' },
  { titulo: 'Duration + ease juntas', body: 'Toda transition tem duration E ease explícitos. Se não tem, herda defaults ruins do navegador.' },
  { titulo: '150ms pra hover', body: 'Feedback precisa ser quase instantâneo. 200ms+ em hover faz parecer "lag". 100ms só pra micro-feedback.' },
  { titulo: 'ease-out pra entrada', body: 'Algo aparecendo usa ease-out (começa rápido, desacelera). Algo saindo usa ease-in.' },
  { titulo: 'Motion tem propósito', body: 'Toda animação responde a uma ação do user ou sinaliza status. Animação decorativa é ruído.' },
  { titulo: 'Respeita reduced-motion', body: 'Users com prefers-reduced-motion desabilitam animações. Skeleton pulse pode continuar; slide/bounce não. Já implementado nas utility classes.' },
  { titulo: 'Spinner está fora de moda', body: 'Spin clássico parece "máquina girou". Use LoadingDots (orgânico, "pensando") ou SkeletonShimmer (conteúdo chegando).' },
  { titulo: 'transform > left/top', body: 'Animação de posição usa transform: translate, nunca left/top. GPU acelera, CPU não.' },
  { titulo: 'opacity nunca sozinha', body: 'Fade puro parece "fundo cinza mal carregou". Combine com translate sutil ou scale pra dar direção.' },
]

/* ----- Sub-componentes ----- */

function Selo({ estado = 'em-revisao' }) {
  const config = {
    'aprovado':     { bg: 'var(--mensalli-green-50)', cor: 'var(--mensalli-green-700)', label: 'Aprovado' },
    'em-revisao':   { bg: 'var(--warning-50)',         cor: 'var(--warning-700)',         label: 'Em revisão' },
    'nao-revisado': { bg: 'var(--neutral-100)',        cor: 'var(--neutral-600)',         label: 'Não revisado' },
  }[estado]
  return (
    <span style={{
      backgroundColor: config.bg, color: config.cor,
      fontSize: 11, fontWeight: 600, padding: '4px 10px',
      borderRadius: 999, letterSpacing: '0.02em',
    }}>{config.label}</span>
  )
}

function Eyebrow({ children }) {
  return <div className="ds-text-eyebrow" style={{ color: 'var(--color-text-muted)', marginBottom: 8 }}>{children}</div>
}

function P({ children, muted }) {
  return <p className="ds-text-body" style={{ margin: 0, color: muted ? 'var(--color-text-secondary)' : 'var(--color-text-primary)' }}>{children}</p>
}

function Bloco({ children, style }) {
  return <section style={{ marginBottom: 56, ...style }}>{children}</section>
}

function CardCallout({ tone = 'neutral', children }) {
  const bg = { neutral: 'var(--neutral-100)', warning: 'var(--warning-50)', success: 'var(--mensalli-green-50)', info: 'var(--info-50)' }[tone]
  const border = { neutral: 'var(--neutral-200)', warning: '#FFE0B2', success: 'var(--mensalli-green-200)', info: '#BBDEFB' }[tone]
  return (
    <div style={{
      backgroundColor: bg, border: `1px solid ${border}`,
      borderRadius: 'var(--radius-lg)', padding: 'var(--space-3-5) var(--space-5)',
      fontSize: 13, lineHeight: 1.55, color: 'var(--color-text-primary)',
    }}>{children}</div>
  )
}

function CodeBlock({ children, tone = 'neutral' }) {
  const bg = tone === 'proposta' ? 'var(--mensalli-green-50)' : 'var(--neutral-100)'
  const border = tone === 'proposta' ? 'var(--mensalli-green-200)' : 'var(--neutral-200)'
  return (
    <pre style={{
      backgroundColor: bg, border: `1px solid ${border}`, borderRadius: 'var(--radius-lg)',
      padding: 'var(--space-3-5)', fontSize: 12, fontFamily: 'var(--font-mono)',
      color: 'var(--color-text-primary)', overflowX: 'auto', lineHeight: 1.55, margin: 0,
    }}>{children}</pre>
  )
}

function RegraCard({ titulo, children }) {
  return (
    <div style={{
      backgroundColor: 'var(--color-bg-surface)',
      border: '1px solid var(--color-border-subtle)',
      borderRadius: 'var(--radius-lg)', padding: 'var(--space-4)',
    }}>
      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6, color: 'var(--color-text-primary)' }}>{titulo}</div>
      <div style={{ fontSize: 12, lineHeight: 1.55, color: 'var(--color-text-secondary)' }}>{children}</div>
    </div>
  )
}

function MetricaCard({ label, valor, warning }) {
  return (
    <div style={{
      backgroundColor: warning ? 'var(--warning-50)' : 'var(--color-bg-surface)',
      border: `1px solid ${warning ? '#FFE0B2' : 'var(--color-border-subtle)'}`,
      borderRadius: 'var(--radius-lg)', padding: 'var(--space-3-5)',
    }}>
      <div className="ds-text-eyebrow" style={{ color: 'var(--color-text-muted)', fontFamily: 'var(--font-mono)', textTransform: 'none', letterSpacing: 0 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 700, marginTop: 6, color: 'var(--color-text-primary)' }}>{valor}</div>
      {warning && <div style={{ fontSize: 11, color: 'var(--warning-700)', marginTop: 4 }}>⚠ problemático</div>}
    </div>
  )
}

/* Botão de hover com transição configurável */
function HoverDemo({ label, transition }) {
  return (
    <button style={{
      padding: 'var(--space-2-5) var(--space-4)',
      borderRadius: 'var(--radius-lg)',
      backgroundColor: 'var(--mensalli-green-500)',
      color: 'var(--color-text-on-brand)',
      border: 'none',
      fontSize: 13,
      fontWeight: 600,
      cursor: 'pointer',
      transition,
    }}
    onMouseEnter={(e) => {
      e.currentTarget.style.backgroundColor = 'var(--mensalli-green-700)'
      e.currentTarget.style.transform = 'translateY(-2px)'
      e.currentTarget.style.boxShadow = 'var(--shadow-md)'
    }}
    onMouseLeave={(e) => {
      e.currentTarget.style.backgroundColor = 'var(--mensalli-green-500)'
      e.currentTarget.style.transform = 'translateY(0)'
      e.currentTarget.style.boxShadow = 'none'
    }}
    >
      {label}
    </button>
  )
}

/* Preview de uma curva de easing como gráfico SVG */
function EasingCurve({ curve, destaque }) {
  // Parse cubic-bezier(x1, y1, x2, y2)
  const match = curve.match(/cubic-bezier\(([-0-9.]+),\s*([-0-9.]+),\s*([-0-9.]+),\s*([-0-9.]+)\)/)
  if (!match) return null
  const [, x1, y1, x2, y2] = match.map(Number)
  const path = `M 0 100 C ${x1 * 100} ${100 - y1 * 100}, ${x2 * 100} ${100 - y2 * 100}, 100 0`
  return (
    <svg viewBox="-5 -5 110 110" width="100" height="100" style={{ overflow: 'visible' }}>
      <rect x="0" y="0" width="100" height="100" fill="var(--neutral-50)" stroke="var(--neutral-200)" />
      <line x1="0" y1="100" x2="100" y2="0" stroke="var(--neutral-300)" strokeDasharray="2 2" />
      <path d={path} stroke={destaque ? 'var(--mensalli-green-500)' : 'var(--neutral-700)'} strokeWidth="2" fill="none" />
    </svg>
  )
}

/* Demo de entrada de superfície com replay */
function EntradaDemo({ keyframe, label }) {
  const [key, setKey] = useState(0)
  return (
    <div style={{
      border: '1px solid var(--color-border-subtle)',
      borderRadius: 'var(--radius-lg)',
      backgroundColor: 'var(--color-bg-surface)',
      padding: 'var(--space-3)',
    }}>
      <div style={{
        height: 100,
        backgroundColor: 'var(--neutral-50)',
        borderRadius: 'var(--radius-md)',
        position: 'relative',
        overflow: 'hidden',
        marginBottom: 'var(--space-2-5)',
      }}>
        <div
          key={key}
          style={{
            position: 'absolute',
            top: '50%', left: '50%',
            transform: 'translate(-50%, -50%)',
            padding: 'var(--space-2-5) var(--space-4)',
            backgroundColor: 'var(--mensalli-green-500)',
            color: 'var(--color-text-on-brand)',
            fontSize: 12,
            fontWeight: 600,
            borderRadius: 'var(--radius-lg)',
            animation: `${keyframe} 500ms var(--ease-out)`,
          }}
        >
          {label}
        </div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <code style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--color-text-muted)' }}>
          {keyframe}
        </code>
        <button
          onClick={() => setKey(k => k + 1)}
          style={{
            fontSize: 11,
            padding: '4px 10px',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--color-border-default)',
            backgroundColor: 'var(--color-bg-surface)',
            color: 'var(--color-text-secondary)',
            cursor: 'pointer',
          }}
          className="ds-transition-colors"
        >
          ▶ replay
        </button>
      </div>
    </div>
  )
}

/* ----- Página ----- */

export default function PaginaMotion() {
  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 8 }}>
        <Eyebrow>Fundações · 04</Eyebrow>
        <Selo estado="em-revisao" />
      </div>
      <h1 className="ds-text-h1" style={{ margin: 0 }}>Motion</h1>
      <div style={{ marginTop: 12, marginBottom: 40 }}>
        <P muted>
          Movimento com propósito. Feedback rápido pra interações (150ms),
          transições suaves pra contexto (200-300ms), entradas marcantes (500ms).
          Nunca <code>transition: all</code>.
        </P>
      </div>

      {/* Uso real */}
      <Bloco>
        <Eyebrow>Uso real no projeto</Eyebrow>
        <P muted>Varredura de <code>transition</code>, <code>animation</code> e <code>@keyframes</code> em src/.</P>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 'var(--space-3)', marginTop: 'var(--space-3-5)' }}>
          {USO_REAL.map(u => <MetricaCard key={u.label} {...u} />)}
        </div>
      </Bloco>

      {/* O problema */}
      <Bloco>
        <Eyebrow>O que tá ruim hoje</Eyebrow>
        <CardCallout tone="warning">
          <ul style={{ margin: 0, paddingLeft: 20, lineHeight: 1.7 }}>
            <li><strong>120+ ocorrências de <code>transition: all</code></strong> — anima TUDO (ruim). Performance + previsibilidade comprometidas.</li>
            <li><strong>15 cópias de <code>@keyframes spin</code></strong> espalhadas — cada componente reinventa. 9 de <code>fadeIn</code>, 5 de <code>slideUp</code>.</li>
            <li><strong>Easing "ease" genérico</strong> em 51 lugares — deveria ser <code>ease-out</code> pra entrada (sensação natural).</li>
            <li><strong>Sem padrão de duration</strong> — 0.15s, 0.2s, 0.3s misturados sem critério de quando usar cada.</li>
          </ul>
        </CardCallout>
      </Bloco>

      {/* Durations */}
      <Bloco>
        <Eyebrow>Durations</Eyebrow>
        <P muted>6 níveis. 150ms e 200ms fazem 80% do trabalho.</P>
        <div style={{
          marginTop: 'var(--space-4)',
          border: '1px solid var(--color-border-subtle)',
          borderRadius: 'var(--radius-lg)',
          backgroundColor: 'var(--color-bg-surface)',
          overflow: 'hidden',
        }}>
          {DURATIONS.map((d, i) => (
            <div key={d.token} style={{
              display: 'grid',
              gridTemplateColumns: '160px 80px 1fr',
              gap: 'var(--space-4)',
              padding: 'var(--space-3) var(--space-5)',
              borderTop: i > 0 ? '1px solid var(--color-border-subtle)' : 'none',
              backgroundColor: d.destaque ? 'var(--mensalli-green-50)' : 'transparent',
              alignItems: 'center',
            }}>
              <code style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: d.destaque ? 'var(--mensalli-green-700)' : 'var(--color-text-secondary)' }}>
                {d.token}
              </code>
              <span style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--color-text-primary)', fontWeight: 600 }}>{d.ms}</span>
              <span style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>
                {d.uso}
                {d.destaque && <strong style={{ color: 'var(--mensalli-green-700)', marginLeft: 8 }}>← DEFAULT</strong>}
              </span>
            </div>
          ))}
        </div>
      </Bloco>

      {/* Easings */}
      <Bloco>
        <Eyebrow>Easings</Eyebrow>
        <P muted>Cada curva tem propósito. <code>ease-out</code> é o default — quase tudo começa rápido e desacelera no fim. Parece natural porque imita física.</P>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 'var(--space-3)', marginTop: 'var(--space-4)' }}>
          {EASINGS.map(e => (
            <div key={e.token} style={{
              border: e.destaque ? '2px solid var(--mensalli-green-500)' : '1px solid var(--color-border-subtle)',
              borderRadius: 'var(--radius-lg)',
              padding: 'var(--space-3)',
              backgroundColor: 'var(--color-bg-surface)',
            }}>
              <EasingCurve curve={e.curve} destaque={e.destaque} />
              <code style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: e.destaque ? 'var(--mensalli-green-700)' : 'var(--color-text-muted)', display: 'block', marginTop: 'var(--space-2)' }}>
                {e.token}
              </code>
              <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', marginTop: 4, lineHeight: 1.4 }}>{e.uso}</div>
            </div>
          ))}
        </div>
      </Bloco>

      {/* Hover demos */}
      <Bloco>
        <Eyebrow>Hover / focus — passa o mouse</Eyebrow>
        <P muted>Compare. O primeiro só anima cor (150ms). O segundo anima cor + transform (200ms). O terceiro anima TUDO (300ms) — é o que queremos EVITAR.</P>
        <div style={{ display: 'flex', gap: 'var(--space-4)', marginTop: 'var(--space-4)', flexWrap: 'wrap' }}>
          <HoverDemo label="hover-colors 150ms" transition="background-color var(--duration-150) var(--ease-out)" />
          <HoverDemo label="hover-scale 200ms" transition="background-color var(--duration-150) var(--ease-out), transform var(--duration-200) var(--ease-out), box-shadow var(--duration-200) var(--ease-out)" />
          <HoverDemo label="hover-all 300ms ⚠" transition="all 0.3s" />
        </div>
        <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 'var(--space-3)', maxWidth: 640, lineHeight: 1.55 }}>
          O primeiro (<code>transition-colors</code> 150ms) é o padrão. O último (<code>transition: all 0.3s</code>) é o que queremos EVITAR — <code>transition-all</code> anima propriedades que você não espera e custa performance.
        </div>
      </Bloco>

      {/* Loading states */}
      <Bloco>
        <Eyebrow>Loading states</Eyebrow>
        <P muted>Propondo trocar o spin clássico por algo mais orgânico (3-dot typing) e o pulse genérico por shimmer — mais vivos, melhor encaixe com o produto.</P>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 'var(--space-4)', marginTop: 'var(--space-4)' }}>
          {/* LoadingDots */}
          <div style={{ border: '1px solid var(--color-border-subtle)', borderRadius: 'var(--radius-lg)', padding: 'var(--space-4)', backgroundColor: 'var(--color-bg-surface)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 60, color: 'var(--mensalli-green-500)' }}>
              <span className="ds-loading-dots"><span /><span /><span /></span>
            </div>
            <div style={{ fontSize: 13, fontWeight: 600, marginTop: 'var(--space-2-5)', color: 'var(--color-text-primary)' }}>LoadingDots</div>
            <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', marginTop: 4, lineHeight: 1.5 }}>
              Primário — substitui spin em botões e requests. 3 dots pulsam em sequência. Parece "pensando", não "máquina girou".
            </div>
            <code style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--color-text-muted)', display: 'block', marginTop: 6 }}>
              .ds-loading-dots
            </code>
          </div>

          {/* SkeletonShimmer */}
          <div style={{ border: '1px solid var(--color-border-subtle)', borderRadius: 'var(--radius-lg)', padding: 'var(--space-4)', backgroundColor: 'var(--color-bg-surface)' }}>
            <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', height: 60, gap: 6 }}>
              <div style={{
                height: 8,
                width: '80%',
                borderRadius: 4,
                background: 'linear-gradient(90deg, var(--neutral-200) 0%, var(--neutral-100) 50%, var(--neutral-200) 100%)',
                backgroundSize: '200% 100%',
                animation: 'ds-shimmer 1.8s linear infinite',
              }} />
              <div style={{
                height: 8,
                width: '50%',
                borderRadius: 4,
                background: 'linear-gradient(90deg, var(--neutral-200) 0%, var(--neutral-100) 50%, var(--neutral-200) 100%)',
                backgroundSize: '200% 100%',
                animation: 'ds-shimmer 1.8s linear infinite',
                animationDelay: '0.2s',
              }} />
            </div>
            <div style={{ fontSize: 13, fontWeight: 600, marginTop: 'var(--space-2-5)', color: 'var(--color-text-primary)' }}>SkeletonShimmer</div>
            <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', marginTop: 4, lineHeight: 1.5 }}>
              Listas e cards carregando. Gradient passa horizontalmente — comunica "chegando", não "parado desbotado". Skeleton.js já existe — usar shimmer nele.
            </div>
            <code style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--color-text-muted)', display: 'block', marginTop: 6 }}>
              animation: ds-shimmer
            </code>
          </div>

          {/* LivePing */}
          <div style={{ border: '1px solid var(--color-border-subtle)', borderRadius: 'var(--radius-lg)', padding: 'var(--space-4)', backgroundColor: 'var(--color-bg-surface)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 60 }}>
              <span className="ds-live-ping" />
            </div>
            <div style={{ fontSize: 13, fontWeight: 600, marginTop: 'var(--space-2-5)', color: 'var(--color-text-primary)' }}>LivePing</div>
            <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', marginTop: 4, lineHeight: 1.5 }}>
              Indicador "ao vivo" — canal conectado, agente online, WhatsApp ligado. Ponto verde fixo + halo pulsando.
            </div>
            <code style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--color-text-muted)', display: 'block', marginTop: 6 }}>
              .ds-live-ping
            </code>
          </div>
        </div>
      </Bloco>

      {/* Entradas de superfície */}
      <Bloco>
        <Eyebrow>Entradas de superfície — clique em ▶ replay</Eyebrow>
        <P muted>5 keyframes canônicos pra modais, asides, toasts, notificações. Cada um tem direção semântica (vem de onde).</P>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 'var(--space-3)', marginTop: 'var(--space-4)' }}>
          {ENTRADAS.map(e => <EntradaDemo key={e.keyframe} {...e} />)}
        </div>
      </Bloco>

      {/* Como fica no código */}
      <Bloco>
        <Eyebrow>Como fica no código</Eyebrow>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-4)', marginTop: 'var(--space-3-5)' }}>
          <div>
            <div className="ds-text-eyebrow" style={{ color: 'var(--color-text-muted)', marginBottom: 6 }}>
              Hoje (sem sistema)
            </div>
            <CodeBlock>{`<button style={{
  transition: 'all 0.2s'
}}>...</button>

@keyframes fadeIn { /* 9x duplicado */
  from { opacity: 0 } to { opacity: 1 }
}`}</CodeBlock>
          </div>
          <div>
            <div className="ds-text-eyebrow" style={{ color: 'var(--mensalli-green-700)', marginBottom: 6 }}>
              Proposta (tokens + utility)
            </div>
            <CodeBlock tone="proposta">{`<button className="ds-transition-colors">
  ...
</button>

/* keyframe canônico em tokens.css */
animation: ds-fade-in
  var(--duration-300) var(--ease-out);`}</CodeBlock>
          </div>
        </div>
      </Bloco>

      {/* Regras de ouro */}
      <Bloco>
        <Eyebrow>Regras de ouro</Eyebrow>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 'var(--space-3)', marginTop: 'var(--space-3-5)' }}>
          {REGRAS.map(r => (
            <RegraCard key={r.titulo} titulo={r.titulo}>{r.body}</RegraCard>
          ))}
        </div>
      </Bloco>

      {/* O que muda se aprovar */}
      <Bloco>
        <Eyebrow>O que muda se aprovar essa seção</Eyebrow>
        <CardCallout tone="success">
          <ul style={{ margin: 0, paddingLeft: 20, lineHeight: 1.7 }}>
            <li><strong>6 durations + 4 easings + 10 keyframes</strong> viram canônicos em <code>tokens.css</code>.</li>
            <li><strong>3 utility classes</strong>: <code>.ds-transition-colors</code>, <code>.ds-transition-transform</code>, <code>.ds-transition-opacity</code>.</li>
            <li><strong>LoadingDots + LivePing</strong> disponíveis como classes (<code>.ds-loading-dots</code>, <code>.ds-live-ping</code>).</li>
            <li><strong>15 cópias duplicadas de <code>@keyframes spin</code></strong> + 9 de fadeIn migram pros canônicos — código mais limpo, menos drift.</li>
            <li><strong>Reduced-motion</strong> já implementado nas utility classes (respeita preferência do user).</li>
            <li><strong>Próxima etapa:</strong> Fim das Fundações. Hora de começar Átomos (Button — o componente mais usado, 100+ inline hoje).</li>
          </ul>
        </CardCallout>
      </Bloco>
    </div>
  )
}
