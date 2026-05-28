import React, { useState } from 'react'
import WizardStepper from './components/WizardStepper'
import Card from './components/Card'
import Button from './components/Button'

function Selo({ estado = 'em-revisao' }) {
  const c = { 'em-revisao': { bg: 'var(--warning-50)', cor: 'var(--warning-700)', label: 'Em revisão' } }[estado]
  return <span style={{ backgroundColor: c.bg, color: c.cor, fontSize: 11, fontWeight: 600, padding: '4px 10px', borderRadius: 999 }}>{c.label}</span>
}
function Eyebrow({ children }) { return <div className="ds-text-eyebrow" style={{ color: 'var(--color-text-muted)', marginBottom: 8 }}>{children}</div> }
function P({ children, muted }) { return <p className="ds-text-body" style={{ margin: 0, color: muted ? 'var(--color-text-secondary)' : 'var(--color-text-primary)' }}>{children}</p> }
function Bloco({ children }) { return <section style={{ marginBottom: 56 }}>{children}</section> }
function CardCallout({ tone = 'info', children }) {
  const bg = { neutral: 'var(--neutral-100)', warning: 'var(--warning-50)', success: 'var(--mensalli-green-50)', info: 'var(--info-50)' }[tone]
  const border = { neutral: 'var(--neutral-200)', warning: '#FFE0B2', success: 'var(--mensalli-green-200)', info: '#BBDEFB' }[tone]
  return <div style={{ backgroundColor: bg, border: `1px solid ${border}`, borderRadius: 'var(--radius-lg)', padding: 'var(--space-3-5) var(--space-5)', fontSize: 13, lineHeight: 1.55 }}>{children}</div>
}

const STEPS_ONBOARDING = [
  { label: 'Dados',  description: 'Nome, CNPJ, endereço' },
  { label: 'Canal',  description: 'Conecte WhatsApp Business ou Z-API' },
  { label: 'Equipe', description: 'Convide colaboradores (opcional)' },
  { label: 'Funil',  description: 'Configure mensagens de boas-vindas' },
]

export default function PaginaWizardStepper() {
  const [current, setCurrent] = useState(1)

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 8 }}>
        <Eyebrow>Padrões Mensalli · 04</Eyebrow>
        <Selo />
      </div>
      <h1 className="ds-text-h1" style={{ margin: 0 }}>WizardStepper</h1>
      <div style={{ marginTop: 12, marginBottom: 40 }}>
        <P muted>
          Indicador de progresso de wizard. 3 layouts (horizontal / vertical / compact) + 5 estados por step (pending/active/done/processing/error).
        </P>
      </div>

      {/* Playground interativo */}
      <Bloco>
        <Eyebrow>Playground · clica nos botões pra simular</Eyebrow>
        <Card>
          <WizardStepper steps={STEPS_ONBOARDING} current={current} layout="horizontal" />
          <div style={{ marginTop: 'var(--space-4)', display: 'flex', gap: 'var(--space-2)' }}>
            <Button variant="outline" size="sm" disabled={current === 0} onClick={() => setCurrent(c => c - 1)} icon="mdi:arrow-left">Voltar</Button>
            <Button variant="primary" size="sm" disabled={current === STEPS_ONBOARDING.length - 1} onClick={() => setCurrent(c => c + 1)} iconRight="mdi:arrow-right">Próximo</Button>
            <Button variant="ghost" size="sm" onClick={() => setCurrent(0)}>Reset</Button>
          </div>
        </Card>
      </Bloco>

      {/* Horizontal default */}
      <Bloco>
        <Eyebrow>layout="horizontal" · default — wizards e modais</Eyebrow>
        <Card>
          <WizardStepper steps={STEPS_ONBOARDING} current={2} layout="horizontal" />
        </Card>
      </Bloco>

      {/* Vertical */}
      <Bloco>
        <Eyebrow>layout="vertical" · onboarding detalhado (com descrição)</Eyebrow>
        <Card>
          <WizardStepper steps={STEPS_ONBOARDING} current={1} layout="vertical" />
        </Card>
      </Bloco>

      {/* Compact */}
      <Bloco>
        <Eyebrow>layout="compact" · header de modal apertado</Eyebrow>
        <Card>
          <WizardStepper steps={STEPS_ONBOARDING} current={1} layout="compact" />
        </Card>
        <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 'var(--space-3)' }}>
          Usa em header de modal pequeno onde não cabe stepper completo. Mostra só "N de M · Step atual".
        </div>
      </Bloco>

      {/* 5 estados ao vivo */}
      <Bloco>
        <Eyebrow>5 estados por step</Eyebrow>
        <Card>
          <WizardStepper
            layout="horizontal"
            steps={[
              { label: 'Dados',     state: 'done' },
              { label: 'Canal',     state: 'done' },
              { label: 'Equipe',    state: 'active' },
              { label: 'Funil',     state: 'pending' },
              { label: 'Conferir',  state: 'pending' },
            ]}
          />
        </Card>
        <div style={{ marginTop: 'var(--space-3)' }}>
          <Card>
            <WizardStepper
              layout="horizontal"
              steps={[
                { label: 'Configurar',   state: 'done' },
                { label: 'Processando',  state: 'processing' },
                { label: 'Conferir',     state: 'pending' },
              ]}
            />
          </Card>
        </div>
        <div style={{ marginTop: 'var(--space-3)' }}>
          <Card>
            <WizardStepper
              layout="horizontal"
              steps={[
                { label: 'Dados',     state: 'done' },
                { label: 'Validação', state: 'error' },
                { label: 'Envio',     state: 'pending' },
              ]}
            />
          </Card>
        </div>
      </Bloco>

      <Bloco>
        <CardCallout>
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 6 }}>
            🎯 DS Mensalli completo
          </div>
          <div>
            <strong>4 fundações</strong> (Cores, Tipografia, Espaço/Sombra, Motion) +{' '}
            <strong>7 átomos</strong> (Button, Input, Select, Checkbox/Radio, Switch, Badge, Avatar) +{' '}
            <strong>7 moléculas</strong> (Card, Modal, Toast, Table, Tabs, Dropdown, EmptyState) +{' '}
            <strong>4 padrões de domínio</strong> (ClienteIdentity, CobrancaStatus, PlanoCard, WizardStepper).{' '}
            <br /><br />
            Tudo importável, ancorado em uso REAL do código, com backward-compat 100%.
            Próxima fase: revisão final + plano de migração gradual dos componentes existentes.
          </div>
        </CardCallout>
      </Bloco>
    </div>
  )
}
