import React from 'react'
import PlanoCard from './components/PlanoCard'
import { showSuccess } from '../Toast'

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

export default function PaginaPlanoCard() {
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 8 }}>
        <Eyebrow>Padrões Mensalli · 03</Eyebrow>
        <Selo />
      </div>
      <h1 className="ds-text-h1" style={{ margin: 0 }}>PlanoCard</h1>
      <div style={{ marginTop: 12, marginBottom: 40 }}>
        <P muted>
          Card de pricing pra /upgrade, Configurações, página de assinatura. Preço grande, features check/cross, CTA fullWidth, destaque opcional.
        </P>
      </div>

      <Bloco>
        <Eyebrow>3 planos lado a lado (pattern /upgrade)</Eyebrow>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 'var(--space-4)', alignItems: 'start' }}>
          <PlanoCard
            nome="Free"
            preco={0}
            cicloLabel="grátis"
            description="Pra começar"
            features={[
              '3 alunos',
              'WhatsApp manual',
              { label: 'Cobrança automática', included: false },
              { label: 'PDF e CSV', included: false },
            ]}
            atual
          />

          <PlanoCard
            nome="Pro"
            preco={49}
            cicloLabel="por mês"
            description="Pra quem tá crescendo"
            features={[
              'Até 50 alunos',
              'WhatsApp ilimitado',
              'Cobrança automática',
              'PDF e CSV',
              { label: 'IA avançada', included: false },
            ]}
            destaque
            cta="Assinar Pro"
            onCtaClick={() => showSuccess('Assinou Pro!')}
          />

          <PlanoCard
            nome="Business"
            preco={149}
            cicloLabel="por mês"
            description="Operação completa"
            features={[
              'Alunos ilimitados',
              'WhatsApp ilimitado',
              'Cobrança automática',
              'PDF e CSV',
              'IA avançada',
              'Multi-unidade',
              'Suporte prioritário',
            ]}
            cta="Falar com vendas"
            onCtaClick={() => showSuccess('Abriu chat de vendas')}
          />
        </div>
      </Bloco>

      <Bloco>
        <Eyebrow>Plano anual com desconto (preço riscado)</Eyebrow>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 'var(--space-4)' }}>
          <PlanoCard
            nome="Pro Anual"
            preco={490}
            precoAntigo={588}
            cicloLabel="por ano"
            description="Economize 17% no plano anual"
            features={[
              'Tudo do Pro mensal',
              '2 meses grátis',
              'Cancelamento garantido',
            ]}
            destaque
            destaqueLabel="ECONOMIZE 17%"
            cta="Assinar anual"
            onCtaClick={() => showSuccess('Assinou anual!')}
          />
          <PlanoCard
            nome="Business Anual"
            preco={1490}
            precoAntigo={1788}
            cicloLabel="por ano"
            features={[
              'Tudo do Business mensal',
              '2 meses grátis',
              'Setup dedicado',
            ]}
            cta="Falar com vendas"
            onCtaClick={() => showSuccess('Falar com vendas')}
          />
        </div>
      </Bloco>

      <Bloco>
        <CardCallout>
          <strong><code>{'<PlanoCard>'}</code></strong> usa Card (elevated quando destaque) + Button (fullWidth) + Badge (label MAIS POPULAR) + Icon (mdi:check/close nas features). Pricing consistente em todos os pontos do app.
        </CardCallout>
      </Bloco>
    </div>
  )
}
