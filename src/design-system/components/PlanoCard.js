import React from 'react'
import { Icon } from '@iconify/react'
import Card from './Card'
import Button from './Button'
import Badge from './Badge'

/* ============================================================
   PlanoCard — DS Mensalli (Padrão de domínio)

   Card de plano/pricing. Usado em /upgrade, Configuração de plano,
   página de assinatura.

   Props:
     nome           — string (ex.: "Plano Anual")
     preco          — number (em reais, formato BRL automático)
     precoAntigo    — number (opcional, mostra riscado pra desconto)
     cicloLabel     — string (default "por mês"). Ex.: "por ano", "por aluno"
     features       — Array<string | { label, icon?, included? }>
     destaque       — boolean: gradient/border verde + label "MAIS POPULAR"
     destaqueLabel  — string (default "MAIS POPULAR")
     cta            — string (label do botão CTA principal)
     ctaVariant     — variant do Button (default depende de destaque)
     onCtaClick     — handler
     loading        — boolean: CTA loading
     atual          — boolean: substitui CTA por "Plano atual" desabilitado
     description    — string opcional (curtinha, vira subtitle)

   Exemplo:
     <PlanoCard
       nome="Plano Anual"
       preco={1500}
       precoAntigo={1800}
       cicloLabel="por ano"
       features={['10 alunos', 'WhatsApp ilimitado', 'PDF e CSV', 'Suporte prioritário']}
       destaque
       cta="Assinar plano anual"
       onCtaClick={...}
     />
   ============================================================ */

function formatBRL(v) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 0 })
}

export default function PlanoCard({
  nome,
  preco,
  precoAntigo,
  cicloLabel = 'por mês',
  features = [],
  destaque = false,
  destaqueLabel = 'MAIS POPULAR',
  cta,
  ctaVariant,
  onCtaClick,
  loading = false,
  atual = false,
  description,
  className = '',
  style,
}) {
  const finalCtaVariant = ctaVariant || (destaque ? 'primary' : 'outline')

  return (
    <div style={{ position: 'relative', ...style }} className={className}>
      {destaque && (
        <div style={{
          position: 'absolute',
          top: -10,
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 1,
        }}>
          <Badge variant="primary" solid size="sm" icon="mdi:star">
            {destaqueLabel}
          </Badge>
        </div>
      )}

      <Card
        elevation={destaque ? 'elevated' : 'flat'}
        padding="none"
        style={destaque ? {
          borderColor: 'var(--mensalli-green-500)',
          borderWidth: 2,
        } : undefined}
      >
        <div style={{ padding: 'var(--space-6) var(--space-5) var(--space-4)' }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--color-text-primary)' }}>
            {nome}
          </div>
          {description && (
            <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 4 }}>
              {description}
            </div>
          )}

          <div style={{ marginTop: 'var(--space-4)', display: 'flex', alignItems: 'baseline', gap: 'var(--space-2)' }}>
            <span style={{ fontSize: 36, fontWeight: 800, color: 'var(--color-text-primary)', letterSpacing: '-0.02em', fontFamily: 'var(--font-mono)' }}>
              {formatBRL(preco)}
            </span>
            <span style={{ fontSize: 13, color: 'var(--color-text-muted)', fontWeight: 500 }}>
              {cicloLabel}
            </span>
          </div>

          {precoAntigo && (
            <div style={{ marginTop: 4, fontSize: 12, color: 'var(--color-text-muted)' }}>
              De <span style={{ textDecoration: 'line-through', fontFamily: 'var(--font-mono)' }}>{formatBRL(precoAntigo)}</span>{' '}
              por <strong style={{ color: 'var(--mensalli-green-700)' }}>{formatBRL(preco)}</strong>
            </div>
          )}
        </div>

        {features.length > 0 && (
          <ul style={{
            listStyle: 'none', margin: 0,
            padding: 'var(--space-2) var(--space-5) var(--space-5)',
            display: 'flex', flexDirection: 'column', gap: 'var(--space-2-5)',
          }}>
            {features.map((f, i) => {
              const obj = typeof f === 'string' ? { label: f, included: true } : { included: true, ...f }
              const iconName = obj.icon || (obj.included !== false ? 'mdi:check' : 'mdi:close')
              const iconColor = obj.included !== false ? 'var(--mensalli-green-600)' : 'var(--neutral-400)'
              return (
                <li key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--space-2)' }}>
                  <Icon icon={iconName} width={16} height={16} style={{ color: iconColor, flexShrink: 0, marginTop: 1 }} />
                  <span style={{
                    fontSize: 13,
                    color: obj.included !== false ? 'var(--color-text-primary)' : 'var(--color-text-muted)',
                    textDecoration: obj.included !== false ? 'none' : 'line-through',
                    lineHeight: 1.5,
                  }}>
                    {obj.label}
                  </span>
                </li>
              )
            })}
          </ul>
        )}

        {(cta || atual) && (
          <div style={{ padding: 'var(--space-4) var(--space-5) var(--space-5)' }}>
            {atual ? (
              <Button variant="outline" disabled fullWidth icon="mdi:check">Plano atual</Button>
            ) : (
              <Button variant={finalCtaVariant} fullWidth onClick={onCtaClick} loading={loading}>
                {cta}
              </Button>
            )}
          </div>
        )}
      </Card>
    </div>
  )
}
