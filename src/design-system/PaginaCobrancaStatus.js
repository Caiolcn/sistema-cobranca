import React from 'react'
import CobrancaStatus from './components/CobrancaStatus'
import Card from './components/Card'

function Selo({ estado = 'em-revisao' }) {
  const c = { 'em-revisao': { bg: 'var(--warning-50)', cor: 'var(--warning-700)', label: 'Em revisão' } }[estado]
  return <span style={{ backgroundColor: c.bg, color: c.cor, fontSize: 11, fontWeight: 600, padding: '4px 10px', borderRadius: 999 }}>{c.label}</span>
}
function Eyebrow({ children }) { return <div className="ds-text-eyebrow" style={{ color: 'var(--color-text-muted)', marginBottom: 8 }}>{children}</div> }
function P({ children, muted }) { return <p className="ds-text-body" style={{ margin: 0, color: muted ? 'var(--color-text-secondary)' : 'var(--color-text-primary)' }}>{children}</p> }
function Bloco({ children }) { return <section style={{ marginBottom: 56 }}>{children}</section> }
function CardCallout({ tone = 'success', children }) {
  const bg = { neutral: 'var(--neutral-100)', warning: 'var(--warning-50)', success: 'var(--mensalli-green-50)', info: 'var(--info-50)' }[tone]
  const border = { neutral: 'var(--neutral-200)', warning: '#FFE0B2', success: 'var(--mensalli-green-200)', info: '#BBDEFB' }[tone]
  return <div style={{ backgroundColor: bg, border: `1px solid ${border}`, borderRadius: 'var(--radius-lg)', padding: 'var(--space-3-5) var(--space-5)', fontSize: 13, lineHeight: 1.55 }}>{children}</div>
}
function CodeBlock({ children, tone = 'proposta' }) {
  const bg = tone === 'proposta' ? 'var(--mensalli-green-50)' : 'var(--neutral-100)'
  const border = tone === 'proposta' ? 'var(--mensalli-green-200)' : 'var(--neutral-200)'
  return <pre style={{ backgroundColor: bg, border: `1px solid ${border}`, borderRadius: 'var(--radius-lg)', padding: 'var(--space-3-5)', fontSize: 12, fontFamily: 'var(--font-mono)', overflowX: 'auto', lineHeight: 1.55, margin: 0 }}>{children}</pre>
}

const CENARIOS = [
  { titulo: 'Pago', props: { status: 'pago' } },
  { titulo: 'Em aberto (vence em > 3 dias)', props: { status: 'pendente', diasParaVencer: 10 } },
  { titulo: 'Vence em 2 dias (warning)', props: { status: 'pendente', diasParaVencer: 2 } },
  { titulo: 'Vence amanhã', props: { status: 'pendente', diasParaVencer: 1 } },
  { titulo: 'Vence hoje', props: { status: 'pendente', diasParaVencer: 0 } },
  { titulo: 'Atrasado 1 dia', props: { status: 'atrasado', diasAtraso: 1 } },
  { titulo: 'Atrasado 5 dias', props: { status: 'atrasado', diasAtraso: 5 } },
  { titulo: 'Atrasado 30 dias', props: { status: 'atrasado', diasAtraso: 30 } },
  { titulo: 'Cancelado (com motivo)', props: { status: 'cancelado', motivo: 'Plano cancelado pelo aluno' } },
]

export default function PaginaCobrancaStatus() {
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 8 }}>
        <Eyebrow>Padrões Mensalli · 02</Eyebrow>
        <Selo />
      </div>
      <h1 className="ds-text-h1" style={{ margin: 0 }}>CobrancaStatus</h1>
      <div style={{ marginTop: 12, marginBottom: 40 }}>
        <P muted>
          Badge semântico com regras de negócio embutidas. Você passa o status + meta (dias de atraso, dias pra vencer), o componente decide cor + label.
        </P>
      </div>

      <Bloco>
        <Eyebrow>9 cenários reais (ao vivo)</Eyebrow>
        <Card>
          {CENARIOS.map((c, i) => (
            <div key={c.titulo} style={{
              display: 'grid', gridTemplateColumns: '1fr 200px',
              gap: 'var(--space-4)', padding: 'var(--space-3) 0',
              borderTop: i > 0 ? '1px solid var(--color-border-subtle)' : 'none',
              alignItems: 'center', fontSize: 13,
            }}>
              <span>{c.titulo}</span>
              <CobrancaStatus {...c.props} />
            </div>
          ))}
        </Card>
      </Bloco>

      <Bloco>
        <Eyebrow>Solid variant (pra destaque máximo)</Eyebrow>
        <Card>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
            <CobrancaStatus status="pago" solid />
            <CobrancaStatus status="pendente" diasParaVencer={1} solid />
            <CobrancaStatus status="atrasado" diasAtraso={10} solid />
            <CobrancaStatus status="cancelado" solid />
          </div>
        </Card>
      </Bloco>

      <Bloco>
        <Eyebrow>Como fica no código</Eyebrow>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-4)' }}>
          <div>
            <div className="ds-text-eyebrow" style={{ color: 'var(--color-text-muted)', marginBottom: 6 }}>Hoje (Financeiro.js — repetido)</div>
            <CodeBlock tone="neutral">{`function labelStatus(c) {
  if (c.status === 'pago')
    return { label: 'Pago', cor: '#4CAF50' }
  if (c.status === 'atrasado') {
    const dias = diff(hoje, c.vencimento)
    return {
      label: \`Atrasado \${dias} dia\${dias > 1 ? 's' : ''}\`,
      cor: '#f44336'
    }
  }
  // ... resto do switch espalhado
}`}</CodeBlock>
          </div>
          <div>
            <div className="ds-text-eyebrow" style={{ color: 'var(--mensalli-green-700)', marginBottom: 6 }}>Proposta</div>
            <CodeBlock>{`<CobrancaStatus
  status={c.status}
  diasAtraso={c.diasAtraso}
  diasParaVencer={c.diasParaVencer}
  motivo={c.motivo}
/>

// Toda lógica de label+cor
// dentro do componente`}</CodeBlock>
          </div>
        </div>
      </Bloco>

      <Bloco>
        <CardCallout>
          <strong>Inteligência de domínio centralizada.</strong> Mudar a regra ("atrasado a partir de 1 dia, não 0") = 1 linha no componente, não 17 arquivos.
        </CardCallout>
      </Bloco>
    </div>
  )
}
