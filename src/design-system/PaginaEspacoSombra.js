import React from 'react'

/* ============================================================
   /app/design-system/espaco-sombra
   Grid 4pt + radius canônicos + 5 níveis de sombra.
   ============================================================ */

const USO_PADDING = [
  { px: '10px', usos: 353, tipo: 'meio-tom' },
  { px: '12px', usos: 219, tipo: 'canônico' },
  { px: '8px',  usos: 157, tipo: 'canônico' },
  { px: '16px', usos: 119, tipo: 'canônico' },
  { px: '14px', usos: 114, tipo: 'meio-tom' },
  { px: '4px',  usos: 111, tipo: 'canônico' },
]

const USO_GAP = [
  { px: '8px',  usos: 259, tipo: 'canônico' },
  { px: '6px',  usos: 157, tipo: 'meio-tom' },
  { px: '12px', usos: 143, tipo: 'canônico' },
  { px: '10px', usos: 134, tipo: 'meio-tom' },
  { px: '4px',  usos:  87, tipo: 'canônico' },
  { px: '16px', usos:  36, tipo: 'canônico' },
]

const ESCALA = [
  { token: '--space-0',    valor: '0',    canonico: true,  uso: 'reset' },
  { token: '--space-0-5',  valor: '2px',  canonico: false, uso: 'micro-ajuste visual (48 usos no projeto)' },
  { token: '--space-1',    valor: '4px',  canonico: true,  uso: 'gap entre chips/ícone inline (111+87)' },
  { token: '--space-1-5',  valor: '6px',  canonico: false, uso: 'padding badges (70 usos)' },
  { token: '--space-2',    valor: '8px',  canonico: true,  uso: 'gap DOMINANTE (259), radius default' },
  { token: '--space-2-5',  valor: '10px', canonico: false, uso: 'padding controles (353 usos — meio-tom valioso)' },
  { token: '--space-3',    valor: '12px', canonico: true,  uso: 'padding cards pequenos (219+143)' },
  { token: '--space-3-5',  valor: '14px', canonico: false, uso: 'desencorajado — prefira 12 ou 16' },
  { token: '--space-4',    valor: '16px', canonico: true,  uso: 'padding cards DEFAULT (119)' },
  { token: '--space-5',    valor: '20px', canonico: true,  uso: 'padding cards médios (91)' },
  { token: '--space-6',    valor: '24px', canonico: true,  uso: 'padding cards grandes, gap seções (56)' },
  { token: '--space-8',    valor: '32px', canonico: true,  uso: 'padding modais' },
  { token: '--space-10',   valor: '40px', canonico: true,  uso: 'container, empty states (39)' },
  { token: '--space-15',   valor: '60px', canonico: true,  uso: 'seções de página (25)' },
]

const PADDING_POR_CONTEXTO = [
  { contexto: 'Badge / Chip',      x: 8,  y: 4,  exemplo: 'chip' },
  { contexto: 'Button xs',         x: 8,  y: 4,  exemplo: 'btn-xs' },
  { contexto: 'Button sm',         x: 12, y: 6,  exemplo: 'btn-sm' },
  { contexto: 'Button md (default)', x: 16, y: 8,  exemplo: 'btn-md' },
  { contexto: 'Button lg',         x: 24, y: 12, exemplo: 'btn-lg' },
  { contexto: 'Input / Select',    x: 12, y: 8,  exemplo: 'input' },
  { contexto: 'Card default',      x: 16, y: 16, exemplo: 'card' },
  { contexto: 'Card spacious',     x: 24, y: 24, exemplo: 'card-spacious' },
  { contexto: 'Modal',             x: 24, y: 24, exemplo: 'modal' },
]

const RADIUS = [
  { token: '--radius-sm',   valor: '4px',     uso: 'divider, badge sutil' },
  { token: '--radius-md',   valor: '6px',     uso: 'ocasional (vai migrar pra lg)' },
  { token: '--radius-lg',   valor: '8px',     uso: 'DEFAULT — cards, inputs, buttons', destaque: true },
  { token: '--radius-xl',   valor: '12px',    uso: 'cards grandes, modais médios' },
  { token: '--radius-2xl',  valor: '16px',    uso: 'modais grandes, hero' },
  { token: '--radius-full', valor: '9999px',  uso: 'chips, avatares, pill badges' },
]

const SHADOWS = [
  { token: '--shadow-sm',  valor: '0 1px 2px rgba(15, 23, 42, 0.06)',  uso: 'botão elevado sutil, card flat+' },
  { token: '--shadow-md',  valor: '0 4px 12px rgba(15, 23, 42, 0.08)', uso: 'card hover, dropdown compacto' },
  { token: '--shadow-lg',  valor: '0 8px 24px rgba(15, 23, 42, 0.10)', uso: 'dropdown, popover, card destacado' },
  { token: '--shadow-xl',  valor: '0 16px 40px rgba(15, 23, 42, 0.14)', uso: 'modal, aside, toast' },
  { token: '--shadow-2xl', valor: '0 24px 56px rgba(15, 23, 42, 0.18)', uso: 'raro — splash, hero' },
]

const REGRAS = [
  { titulo: 'Sempre a escala', body: 'Nada de p-[17px] ou m-[23px]. Se um valor não tá na escala, a decisão é provavelmente errada.' },
  { titulo: 'gap-2 é o default', body: 'Entre elementos inline, comece com 8px (--space-2). Sobe pra 12 quando precisar respirar.' },
  { titulo: 'rounded-lg é o default', body: 'Qualquer superfície interativa (button, input, card pequeno) usa 8px. Sobe pra 12/16 quando o tamanho crescer.' },
  { titulo: 'Padding > margin', body: 'Prefere padding no pai + gap no flex/grid. Margin só quando não tem alternativa (reset de body, etc).' },
  { titulo: 'Shadow tem propósito', body: 'Shadow é "flutuação" — só usa quando um elemento realmente "sobe" (dropdown, modal, card hover). Não decora tudo.' },
  { titulo: 'Meio-tons são válidos', body: 'p-2.5 (10px) e p-1.5 (6px) fazem parte do sistema pra UI densa. Não tente "arredondar pra cima". 10px é canônico via --space-2-5.' },
  { titulo: 'shadow-sm é o default elevado', body: 'Card elevado nunca passa direto pra shadow-lg. Sobe um nível por vez.' },
  { titulo: '60% dos cards são p-4', body: 'Não invente — 16px de padding cobre quase tudo. p-6 (24px) só quando o card é hero.' },
  { titulo: '14px e 18px são ruído', body: 'São valores "entre" sem critério. Sempre vire 12 (mais denso) ou 16 (mais confortável).' },
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

function UsoCard({ px, usos, tipo }) {
  const ehMeio = tipo === 'meio-tom'
  return (
    <div style={{
      backgroundColor: ehMeio ? 'var(--neutral-50)' : 'var(--color-bg-surface)',
      border: `1px solid ${ehMeio ? 'var(--neutral-300)' : 'var(--color-border-subtle)'}`,
      borderRadius: 'var(--radius-lg)', padding: 'var(--space-3-5)',
    }}>
      <div className="ds-text-eyebrow" style={{ color: 'var(--color-text-muted)', fontFamily: 'var(--font-mono)' }}>{px}</div>
      <div style={{ fontSize: 24, fontWeight: 700, marginTop: 4, color: 'var(--color-text-primary)' }}>{usos}</div>
      <div style={{ fontSize: 11, color: ehMeio ? 'var(--warning-700)' : 'var(--mensalli-green-700)', marginTop: 2 }}>
        {ehMeio ? '◐ meio-tom' : '● canônico'}
      </div>
    </div>
  )
}

/* ----- Página ----- */

export default function PaginaEspacoSombra() {
  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 8 }}>
        <Eyebrow>Fundações · 03</Eyebrow>
        <Selo estado="em-revisao" />
      </div>
      <h1 className="ds-text-h1" style={{ margin: 0 }}>Espaço & Sombra</h1>
      <div style={{ marginTop: 12, marginBottom: 40 }}>
        <P muted>
          Grid 4pt como dominante, meio-tons 2pt (6px, 10px) aceitos pra densidade SaaS.
          15 valores em uso viram 14 tokens nomeados — 9 canônicos + 5 meio-tons.
        </P>
      </div>

      {/* Uso real - Padding */}
      <Bloco>
        <Eyebrow>Uso real · padding</Eyebrow>
        <P muted>Top 6 valores de <code>padding:</code> no código. 10px (353!) é o "meio-tom valioso" — não tem como ignorar.</P>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 'var(--space-3)', marginTop: 'var(--space-3-5)' }}>
          {USO_PADDING.map(u => <UsoCard key={u.px} {...u} />)}
        </div>
      </Bloco>

      {/* Uso real - Gap */}
      <Bloco>
        <Eyebrow>Uso real · gap</Eyebrow>
        <P muted>8px (259) é o gap dominante absoluto.</P>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 'var(--space-3)', marginTop: 'var(--space-3-5)' }}>
          {USO_GAP.map(u => <UsoCard key={u.px} {...u} />)}
        </div>
      </Bloco>

      {/* Escala canônica */}
      <Bloco>
        <Eyebrow>Escala canônica · grid 4pt + meio-tons 2pt</Eyebrow>
        <P muted>14 tokens cobrem 99% dos casos. Meio-tons não são "errados" — são parte do sistema pra UI densa.</P>
        <div style={{
          marginTop: 'var(--space-4)',
          border: '1px solid var(--color-border-subtle)',
          borderRadius: 'var(--radius-lg)',
          backgroundColor: 'var(--color-bg-surface)',
          overflow: 'hidden',
        }}>
          {ESCALA.map((s, i) => {
            const valorPx = parseInt(s.valor) || 0
            return (
              <div key={s.token} style={{
                display: 'grid',
                gridTemplateColumns: '140px 60px 1fr 1fr',
                gap: 'var(--space-4)',
                padding: 'var(--space-3) var(--space-5)',
                borderTop: i > 0 ? '1px solid var(--color-border-subtle)' : 'none',
                alignItems: 'center',
              }}>
                <code style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: s.canonico ? 'var(--mensalli-green-700)' : 'var(--warning-700)' }}>
                  {s.token}
                </code>
                <span style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--color-text-muted)' }}>{s.valor}</span>
                <div style={{
                  height: 12,
                  width: Math.min(valorPx * 4, 240),
                  backgroundColor: s.canonico ? 'var(--mensalli-green-400)' : 'var(--warning-500)',
                  borderRadius: 'var(--radius-sm)',
                }} />
                <span style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>{s.uso}</span>
              </div>
            )
          })}
        </div>
      </Bloco>

      {/* Padding por contexto */}
      <Bloco>
        <Eyebrow>Padding por contexto</Eyebrow>
        <P muted>Cada componente escolhe seu padding por intuição hoje. Proposta: contexto → padding fixo.</P>
        <div style={{
          marginTop: 'var(--space-4)',
          border: '1px solid var(--color-border-subtle)',
          borderRadius: 'var(--radius-lg)',
          backgroundColor: 'var(--color-bg-surface)',
          overflow: 'hidden',
        }}>
          <div style={{
            display: 'grid',
            gridTemplateColumns: '200px 100px 100px 1fr',
            gap: 'var(--space-4)',
            padding: 'var(--space-3) var(--space-5)',
            backgroundColor: 'var(--neutral-50)',
            borderBottom: '1px solid var(--color-border-subtle)',
          }}>
            {['Contexto', 'Padding X', 'Padding Y', 'Exemplo'].map(h => (
              <div key={h} className="ds-text-eyebrow" style={{ color: 'var(--color-text-muted)' }}>{h}</div>
            ))}
          </div>
          {PADDING_POR_CONTEXTO.map((p, i) => (
            <div key={p.contexto} style={{
              display: 'grid',
              gridTemplateColumns: '200px 100px 100px 1fr',
              gap: 'var(--space-4)',
              padding: 'var(--space-3) var(--space-5)',
              borderTop: i > 0 ? '1px solid var(--color-border-subtle)' : 'none',
              alignItems: 'center',
            }}>
              <span style={{ fontSize: 13, color: 'var(--color-text-primary)' }}>{p.contexto}</span>
              <code style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--color-text-secondary)' }}>{p.x}px</code>
              <code style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--color-text-secondary)' }}>{p.y}px</code>
              <div>
                <span style={{
                  display: 'inline-block',
                  padding: `${p.y}px ${p.x}px`,
                  backgroundColor: p.exemplo.startsWith('btn') ? 'var(--mensalli-green-500)' : 'var(--neutral-100)',
                  color: p.exemplo.startsWith('btn') ? 'var(--color-text-on-brand)' : 'var(--color-text-primary)',
                  border: p.exemplo === 'input' ? '1px solid var(--neutral-300)' : 'none',
                  borderRadius: 'var(--radius-lg)',
                  fontSize: 12,
                  fontWeight: p.exemplo.startsWith('btn') ? 600 : 400,
                }}>{p.exemplo}</span>
              </div>
            </div>
          ))}
        </div>
      </Bloco>

      {/* Radius */}
      <Bloco>
        <Eyebrow>Radius canônicos</Eyebrow>
        <P muted>8px (rounded-lg) é o DEFAULT absoluto — 388 ocorrências. 6 níveis cobrem tudo.</P>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 'var(--space-3)', marginTop: 'var(--space-4)' }}>
          {RADIUS.map(r => (
            <div key={r.token} style={{
              border: r.destaque ? '2px solid var(--mensalli-green-500)' : '1px solid var(--color-border-subtle)',
              borderRadius: 'var(--radius-lg)',
              padding: 'var(--space-3)',
              backgroundColor: 'var(--color-bg-surface)',
            }}>
              <div style={{
                height: 64,
                backgroundColor: 'var(--neutral-200)',
                borderRadius: r.valor,
                marginBottom: 'var(--space-2)',
              }} />
              <code style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--color-text-muted)' }}>{r.token}</code>
              <div style={{ fontSize: 12, fontWeight: 600, marginTop: 2, color: 'var(--color-text-primary)' }}>{r.valor}</div>
              <div style={{ fontSize: 10, color: 'var(--color-text-secondary)', marginTop: 4, lineHeight: 1.4 }}>{r.uso}</div>
            </div>
          ))}
        </div>
      </Bloco>

      {/* Shadows */}
      <Bloco>
        <Eyebrow>Shadow — 5 níveis</Eyebrow>
        <P muted>Tinta é <code>neutral-900</code> (não preto puro) — matiz frio que combina com os neutros Slate. Cada nível tem uso específico.</P>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 'var(--space-4)', marginTop: 'var(--space-5)', padding: 'var(--space-6) var(--space-4)' }}>
          {SHADOWS.map(s => (
            <div key={s.token}>
              <div style={{
                height: 88,
                backgroundColor: 'var(--color-bg-surface)',
                borderRadius: 'var(--radius-lg)',
                boxShadow: s.valor,
                marginBottom: 'var(--space-3)',
              }} />
              <code style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--color-text-muted)' }}>{s.token}</code>
              <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', marginTop: 4, lineHeight: 1.4 }}>{s.uso}</div>
            </div>
          ))}
        </div>
      </Bloco>

      {/* Como fica no código */}
      <Bloco>
        <Eyebrow>Como fica no código</Eyebrow>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-4)', marginTop: 'var(--space-3-5)' }}>
          <div>
            <div className="ds-text-eyebrow" style={{ color: 'var(--color-text-muted)', marginBottom: 6 }}>
              Hoje (4 paddings diferentes)
            </div>
            <CodeBlock>{`<div style={{
  padding: '15px',
  borderRadius: '10px',
  boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
}}>card</div>

<div style={{
  padding: '17px',  // ⚠ não-canônico
  borderRadius: '14px'
}}>card</div>`}</CodeBlock>
          </div>
          <div>
            <div className="ds-text-eyebrow" style={{ color: 'var(--mensalli-green-700)', marginBottom: 6 }}>
              Proposta (tokens consistentes)
            </div>
            <CodeBlock tone="proposta">{`<div style={{
  padding: 'var(--space-4)',
  borderRadius: 'var(--radius-lg)',
  boxShadow: 'var(--shadow-sm)'
}}>card</div>

<div style={{
  padding: 'var(--space-4)',
  borderRadius: 'var(--radius-lg)'
}}>card</div>`}</CodeBlock>
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
            <li><strong>14 tokens de espaço</strong> + <strong>6 tokens de radius</strong> + <strong>5 tokens de shadow</strong> viram canônicos.</li>
            <li><strong>15px e 17px morrem</strong> — viram 16px (mais confortável) ou 12px (mais denso) caso a caso na migração.</li>
            <li><strong>Padding por contexto</strong> documentado — Button, Input, Card, Modal têm valores fixos.</li>
            <li><strong>Backward-compat 100%:</strong> nenhum <code>padding</code> ou <code>borderRadius</code> inline atual quebra.</li>
            <li><strong>Próxima etapa:</strong> Motion (formalizar durations + easings + reduced-motion).</li>
          </ul>
        </CardCallout>
      </Bloco>
    </div>
  )
}
