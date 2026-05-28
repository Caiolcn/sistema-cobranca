import React from 'react'

/* ============================================================
   /app/design-system/cores
   Anatomia inspirada no Krooa Design System:
   Header → Uso real → O que tá ruim → Proposta → Código → Regras → Migração
   ============================================================ */

const ESCALA_GREEN = [
  { tom: 50,  hex: '#E8F5E9' },
  { tom: 100, hex: '#C8E6C9' },
  { tom: 200, hex: '#A5D6A7' },
  { tom: 300, hex: '#81C784' },
  { tom: 400, hex: '#66BB6A' },
  { tom: 500, hex: '#4CAF50', marca: true },
  { tom: 600, hex: '#43A047' },
  { tom: 700, hex: '#388E3C' },
  { tom: 800, hex: '#2E7D32' },
  { tom: 900, hex: '#1B5E20' },
  { tom: 950, hex: '#0B3D14' },
]

const ESCALA_DARK = [
  { tom: 50,  hex: '#F0F4F4' },
  { tom: 100, hex: '#DAE2E2' },
  { tom: 200, hex: '#B5C5C5' },
  { tom: 300, hex: '#8FA8A8' },
  { tom: 400, hex: '#6A8B8B' },
  { tom: 500, hex: '#4A6A6A' },
  { tom: 600, hex: '#344848', marca: true },
  { tom: 700, hex: '#2A3A3A' },
  { tom: 800, hex: '#1F2D2D' },
  { tom: 900, hex: '#141F1F' },
  { tom: 950, hex: '#0A1212' },
]

const ESCALA_NEUTRAL = [
  { tom: 0,   hex: '#FFFFFF' },
  { tom: 50,  hex: '#F8FAFC' },
  { tom: 100, hex: '#F1F5F9' },
  { tom: 200, hex: '#E2E8F0' },
  { tom: 300, hex: '#CBD5E1' },
  { tom: 400, hex: '#94A3B8' },
  { tom: 500, hex: '#64748B' },
  { tom: 600, hex: '#475569' },
  { tom: 700, hex: '#334155' },
  { tom: 800, hex: '#1E293B' },
  { tom: 900, hex: '#0F172A' },
  { tom: 950, hex: '#020617' },
]

const SEMANTICAS = [
  { nome: 'success', hex: '#4CAF50', uso: 'Confirmação, status ativo, pago' },
  { nome: 'warning', hex: '#FF9800', uso: 'Atenção, pendente, lembrete' },
  { nome: 'danger',  hex: '#F44336', uso: 'Erro, cancelamento, exclusão' },
  { nome: 'info',    hex: '#2196F3', uso: 'Informativo, dicas, links' },
]

/* ----- Sub-componentes visuais ----- */

function Selo({ estado = 'em-revisao' }) {
  const config = {
    'aprovado':     { bg: 'var(--mensalli-green-50)',  cor: 'var(--mensalli-green-700)', label: 'Aprovado' },
    'em-revisao':   { bg: 'var(--warning-50)',          cor: 'var(--warning-700)',         label: 'Em revisão' },
    'nao-revisado': { bg: 'var(--neutral-100)',         cor: 'var(--neutral-600)',         label: 'Não revisado' },
  }[estado]
  return (
    <span style={{
      backgroundColor: config.bg,
      color: config.cor,
      fontSize: 11,
      fontWeight: 600,
      padding: '4px 10px',
      borderRadius: 999,
      letterSpacing: '0.02em',
    }}>
      {config.label}
    </span>
  )
}

function Eyebrow({ children }) {
  return (
    <div style={{
      fontSize: 11,
      fontWeight: 600,
      letterSpacing: '0.1em',
      textTransform: 'uppercase',
      color: 'var(--color-text-muted)',
      marginBottom: 8,
    }}>
      {children}
    </div>
  )
}

function H1({ children }) {
  return (
    <h1 style={{
      fontSize: 32,
      fontWeight: 700,
      letterSpacing: '-0.02em',
      lineHeight: 1.2,
      margin: 0,
      color: 'var(--color-text-primary)',
    }}>
      {children}
    </h1>
  )
}

function H2({ children }) {
  return (
    <h2 style={{
      fontSize: 20,
      fontWeight: 700,
      margin: '0 0 8px',
      color: 'var(--color-text-primary)',
    }}>
      {children}
    </h2>
  )
}

function P({ children, muted }) {
  return (
    <p style={{
      fontSize: 14,
      lineHeight: 1.55,
      margin: 0,
      color: muted ? 'var(--color-text-secondary)' : 'var(--color-text-primary)',
    }}>
      {children}
    </p>
  )
}

function Bloco({ children, style }) {
  return (
    <section style={{ marginBottom: 56, ...style }}>
      {children}
    </section>
  )
}

function CardCallout({ tone = 'neutral', children }) {
  const bg = {
    neutral: 'var(--neutral-100)',
    warning: 'var(--warning-50)',
    success: 'var(--mensalli-green-50)',
    info: 'var(--info-50)',
  }[tone]
  const border = {
    neutral: 'var(--neutral-200)',
    warning: '#FFE0B2',
    success: 'var(--mensalli-green-200)',
    info: '#BBDEFB',
  }[tone]
  return (
    <div style={{
      backgroundColor: bg,
      border: `1px solid ${border}`,
      borderRadius: 8,
      padding: '14px 18px',
      fontSize: 13,
      lineHeight: 1.55,
      color: 'var(--color-text-primary)',
    }}>
      {children}
    </div>
  )
}

function Swatch({ tom, hex, marca }) {
  return (
    <div style={{
      border: marca ? '2px solid var(--neutral-900)' : '1px solid var(--color-border-subtle)',
      borderRadius: 8,
      overflow: 'hidden',
      backgroundColor: 'var(--color-bg-surface)',
      position: 'relative',
    }}>
      <div style={{
        height: 64,
        backgroundColor: hex,
        position: 'relative',
      }}>
        {marca && (
          <span style={{
            position: 'absolute',
            top: 6, right: 6,
            backgroundColor: 'var(--neutral-900)',
            color: 'var(--neutral-0)',
            fontSize: 9,
            fontWeight: 700,
            padding: '2px 6px',
            borderRadius: 4,
            letterSpacing: '0.05em',
          }}>
            MARCA
          </span>
        )}
      </div>
      <div style={{ padding: '8px 10px' }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-primary)' }}>
          {tom}
        </div>
        <div style={{
          fontSize: 11,
          fontFamily: 'ui-monospace, "SF Mono", Consolas, monospace',
          color: 'var(--color-text-muted)',
          marginTop: 2,
        }}>
          {hex}
        </div>
      </div>
    </div>
  )
}

function GradeEscala({ escala }) {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: `repeat(${escala.length}, 1fr)`,
      gap: 6,
    }}>
      {escala.map(s => <Swatch key={s.tom} {...s} />)}
    </div>
  )
}

function MetricaCard({ label, valor, sub }) {
  return (
    <div style={{
      backgroundColor: 'var(--color-bg-surface)',
      border: '1px solid var(--color-border-subtle)',
      borderRadius: 8,
      padding: 14,
    }}>
      <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--color-text-muted)' }}>
        {label}
      </div>
      <div style={{ fontSize: 24, fontWeight: 700, marginTop: 4, color: 'var(--color-text-primary)' }}>
        {valor}
      </div>
      <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 2 }}>
        {sub}
      </div>
    </div>
  )
}

function RegraCard({ titulo, children }) {
  return (
    <div style={{
      backgroundColor: 'var(--color-bg-surface)',
      border: '1px solid var(--color-border-subtle)',
      borderRadius: 8,
      padding: 16,
    }}>
      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6, color: 'var(--color-text-primary)' }}>
        {titulo}
      </div>
      <div style={{ fontSize: 12, lineHeight: 1.55, color: 'var(--color-text-secondary)' }}>
        {children}
      </div>
    </div>
  )
}

function CodeBlock({ children, tone = 'neutral' }) {
  const bg = tone === 'proposta' ? 'var(--mensalli-green-50)' : 'var(--neutral-100)'
  const border = tone === 'proposta' ? 'var(--mensalli-green-200)' : 'var(--neutral-200)'
  return (
    <pre style={{
      backgroundColor: bg,
      border: `1px solid ${border}`,
      borderRadius: 8,
      padding: 14,
      fontSize: 12,
      fontFamily: 'ui-monospace, "SF Mono", Consolas, monospace',
      color: 'var(--color-text-primary)',
      overflowX: 'auto',
      lineHeight: 1.55,
      margin: 0,
    }}>{children}</pre>
  )
}

/* ----- Página ----- */

export default function PaginaCores() {
  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 8 }}>
        <Eyebrow>Fundações · 01</Eyebrow>
        <Selo estado="em-revisao" />
      </div>
      <H1>Cores</H1>
      <div style={{ marginTop: 12, marginBottom: 40 }}>
        <P muted>
          Do hex único pra escalas completas. Cada cor da marca vira uma família de 11 tons,
          preservando exatamente os hexes canônicos que o Mensalli já usa hoje.
        </P>
      </div>

      {/* Uso real */}
      <Bloco>
        <Eyebrow>Uso real no projeto</Eyebrow>
        <P muted>Hexes encontrados em <code style={{ fontSize: 12 }}>src/</code> via varredura. Cada cor é um único tom — sem variações padronizadas.</P>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginTop: 14 }}>
          <MetricaCard label="#4CAF50" valor="147" sub="Verde Material (telas SaaS)" />
          <MetricaCard label="#16a34a" valor="136" sub="Verde Tailwind (Agenda Nova)" />
          <MetricaCard label="#344848" valor="280" sub="Brand-dark (avatares, header)" />
          <MetricaCard label="#8867A1" valor="20" sub="Roxo — fora da marca" />
        </div>
      </Bloco>

      {/* Por que é um problema */}
      <Bloco>
        <Eyebrow>Por que isso é um problema</Eyebrow>
        <CardCallout tone="warning">
          <strong>Dois verdes coexistem.</strong> O código antigo (Dashboard, Clientes, Financeiro) usa <code>#4CAF50</code>;
          o código novo (Agenda Nova, 7 telas) adotou <code>#16a34a</code>. Visualmente são diferentes — o Material é mais quente,
          o Tailwind mais saturado. Resultado: cada tela tem um verde levemente diferente, sem dark mode comum,
          sem linguagem compartilhada entre devs.
        </CardCallout>
      </Bloco>

      {/* Proposta - Green */}
      <Bloco>
        <Eyebrow>Proposta · Escala Mensalli-Green</Eyebrow>
        <H2>Mensalli-Green 50→950</H2>
        <P muted>11 tons. O hex canônico <code>#4CAF50</code> vira green-500. Nenhum valor da marca muda — só passamos a ter vizinhos padronizados.</P>
        <div style={{ marginTop: 16 }}>
          <GradeEscala escala={ESCALA_GREEN} />
        </div>
      </Bloco>

      {/* Proposta - Dark */}
      <Bloco>
        <Eyebrow>Proposta · Escala Mensalli-Dark</Eyebrow>
        <H2>Mensalli-Dark 50→950</H2>
        <P muted>O <code>#344848</code> (avatares, header, accents) vira dark-600. Cor complementar de marca, escalada igual ao verde.</P>
        <div style={{ marginTop: 16 }}>
          <GradeEscala escala={ESCALA_DARK} />
        </div>
      </Bloco>

      {/* Proposta - Neutros */}
      <Bloco>
        <Eyebrow>Proposta · Neutros (Slate)</Eyebrow>
        <H2>Neutral 0→950</H2>
        <P muted>Cinzas com leve azulado (Slate) pra dar vibe moderna ao SaaS. Substituem o <code>#e5e7eb</code>, <code>#e0e0e0</code>, <code>#f3f4f6</code>, <code>#d1d5db</code>, etc. — todos com 50-230 ocorrências cada hoje.</P>
        <div style={{ marginTop: 16 }}>
          <GradeEscala escala={ESCALA_NEUTRAL} />
        </div>
      </Bloco>

      {/* Proposta - Semânticas */}
      <Bloco>
        <Eyebrow>Proposta · Cores semânticas</Eyebrow>
        <H2>Status & feedback</H2>
        <P muted>Mantém os hexes Material que já estão no código. Zero migração nessas — só ganham nome canônico.</P>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginTop: 16 }}>
          {SEMANTICAS.map(s => (
            <div key={s.nome} style={{
              border: '1px solid var(--color-border-subtle)',
              borderRadius: 8,
              overflow: 'hidden',
              backgroundColor: 'var(--color-bg-surface)',
            }}>
              <div style={{ height: 56, backgroundColor: s.hex }} />
              <div style={{ padding: 10 }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{s.nome}</div>
                <div style={{ fontSize: 11, fontFamily: 'monospace', color: 'var(--color-text-muted)', marginTop: 2 }}>{s.hex}</div>
                <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', marginTop: 6, lineHeight: 1.4 }}>{s.uso}</div>
              </div>
            </div>
          ))}
        </div>
      </Bloco>

      {/* Como fica no código */}
      <Bloco>
        <Eyebrow>Como fica no código</Eyebrow>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 14 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--color-text-muted)', marginBottom: 6 }}>
              Hoje (espalhado, inline)
            </div>
            <CodeBlock>{`background: #4CAF50;
color: #16a34a;     /* mesma intenção,
                       valor diferente */
border: 1px solid #e5e7eb;`}</CodeBlock>
          </div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--mensalli-green-700)', marginBottom: 6 }}>
              Proposta (tokens canônicos)
            </div>
            <CodeBlock tone="proposta">{`background: var(--mensalli-green-500);
color: var(--mensalli-green-600);
border: 1px solid var(--neutral-200);`}</CodeBlock>
          </div>
        </div>
        <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 10, lineHeight: 1.5 }}>
          Tokens vivem em <code>src/design-system/tokens.css</code>. Componentes existentes continuam funcionando — adoção é gradual.
        </div>
      </Bloco>

      {/* Regras de ouro */}
      <Bloco>
        <Eyebrow>Regras de ouro</Eyebrow>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginTop: 14 }}>
          <RegraCard titulo="Marca = 500">
            O hex canônico fica sempre em <code>-500</code>. Outros tons são vizinhos, não substitutos.
          </RegraCard>
          <RegraCard titulo="Um verde só">
            <code>#16a34a</code> migra pra <code>green-600</code>. Sistema inteiro fala a mesma língua.
          </RegraCard>
          <RegraCard titulo="Tokens, não hex">
            Componente novo NUNCA usa hex direto. Sempre <code>var(--...)</code>.
          </RegraCard>
          <RegraCard titulo="Semânticas mantêm Material">
            <code>#FF9800</code>, <code>#F44336</code>, <code>#2196F3</code> ficam — já são canônicos.
          </RegraCard>
          <RegraCard titulo="Aliases > tons crus">
            UI usa <code>--color-brand</code>, não <code>--mensalli-green-500</code>. Trocar a marca = trocar 1 linha.
          </RegraCard>
          <RegraCard titulo="Dark mode = futuro">
            Tons 950 reservados pra dark mode. Não usar em light mode hoje.
          </RegraCard>
        </div>
      </Bloco>

      {/* O que muda se aprovar */}
      <Bloco>
        <Eyebrow>O que muda se aprovar essa seção</Eyebrow>
        <CardCallout tone="success">
          <ul style={{ margin: 0, paddingLeft: 20 }}>
            <li><strong>Tokens viram canônicos:</strong> <code>src/design-system/tokens.css</code> é importado globalmente.</li>
            <li><strong>Migração gradual:</strong> <code>#16a34a</code> (136 usos) → <code>mensalli-green-600</code>. Cinzas variados → <code>neutral-*</code>. Feito componente por componente, sem PR gigante.</li>
            <li><strong>Backward-compat 100%:</strong> hexes diretos continuam funcionando. Nenhum componente atual quebra.</li>
            <li><strong>Próxima etapa:</strong> Tipografia (formalizar hierarquia Inter — Display/H1-4/Body/Caption/Eyebrow).</li>
          </ul>
        </CardCallout>
      </Bloco>
    </div>
  )
}
