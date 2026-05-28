import React, { useState } from 'react'
import Tabs from './components/Tabs'

/* ============================================================
   /app/design-system/tabs
   Tabs com 3 variants — underline, pills, segmented.
   ============================================================ */

const REGRAS = [
  { titulo: 'underline pra seções', body: 'Padrão web (GitHub, Linear, Notion). Quando user vai navegar entre seções de uma mesma entidade (Dados / Histórico / Arquivos).' },
  { titulo: 'pills pra filtros de lista', body: 'Lista com contador (Todos 42 / Ativos 28 / Arquivados 6). Verde marca quando ativo, contador interno. Acompanhar quantos itens cada filtro tem.' },
  { titulo: 'segmented pra view switcher', body: 'Quando troca de modo de visualização (Lista / Grade / Kanban, Dia / Semana / Mês). Padrão iOS — container cinza + ativo branco com sombra leve.' },
  { titulo: 'Máximo 5-7 abas', body: 'Mais que isso vira sidebar/dropdown. Tab não é menu principal — é navegação dentro de uma página/entidade.' },
  { titulo: 'Labels 1-2 palavras', body: '"Dados" em vez de "Informações pessoais". Cabe em mobile, scan rápido, sem truncate.' },
  { titulo: 'Filtros → pills verde', body: 'Sublinhado default fica exatamente como hoje. Virou o padrão canônico do app.' },
  { titulo: 'View switcher → segmented', body: '2-4 modos exclusivos. Nunca mistura com filtros — tem propósitos diferentes.' },
  { titulo: 'Deep-linking? Use PageTabs', body: 'Se user vai compartilhar URL de tab específica (bookmark, link de cliente), considera usar router em vez de state local. PageTabs futura.' },
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

function Card({ children, style }) {
  return (
    <div style={{
      backgroundColor: 'var(--color-bg-surface)',
      border: '1px solid var(--color-border-subtle)',
      borderRadius: 'var(--radius-lg)',
      padding: 'var(--space-5)',
      ...style,
    }}>{children}</div>
  )
}

/* ----- Página ----- */

export default function PaginaTabs() {
  const [underTab, setUnderTab] = useState('dados')
  const [pillTab, setPillTab] = useState('todos')
  const [segTab, setSegTab] = useState('dia')
  const [bigTab, setBigTab] = useState('geral')

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 8 }}>
        <Eyebrow>Moléculas · 05</Eyebrow>
        <Selo estado="em-revisao" />
      </div>
      <h1 className="ds-text-h1" style={{ margin: 0 }}>Tabs</h1>
      <div style={{ marginTop: 12, marginBottom: 40 }}>
        <P muted>
          3 variants — underline (seções), pills (filtros com contador), segmented (view switcher).
          Cada uma tem propósito específico. Não misture entre si.
        </P>
      </div>

      {/* Underline */}
      <Bloco>
        <Eyebrow>variant="underline" · seções de página</Eyebrow>
        <P muted>Padrão web (GitHub, Linear, Notion). Quando o user navega entre seções de uma mesma entidade.</P>
        <Card style={{ marginTop: 'var(--space-4)' }}>
          <Tabs
            variant="underline"
            value={underTab}
            onChange={setUnderTab}
            items={[
              { value: 'dados',   label: 'Dados', icon: 'mdi:account-outline' },
              { value: 'hist',    label: 'Histórico' },
              { value: 'arq',     label: 'Arquivos', count: 24 },
              { value: 'fin',     label: 'Financeiro' },
              { value: 'acessos', label: 'Acessos', disabled: true },
            ]}
          />
          <div style={{ marginTop: 'var(--space-4)', fontSize: 13, color: 'var(--color-text-secondary)' }}>
            Conteúdo da aba <strong>{underTab}</strong> aparece aqui.
          </div>
        </Card>
      </Bloco>

      {/* Pills */}
      <Bloco>
        <Eyebrow>variant="pills" · filtros com contador</Eyebrow>
        <P muted>Lista com contagem por filtro. Verde marca quando ativo. Usado em listas de funis, status, leads.</P>
        <Card style={{ marginTop: 'var(--space-4)' }}>
          <Tabs
            variant="pills"
            value={pillTab}
            onChange={setPillTab}
            items={[
              { value: 'todos',     label: 'Todos',      count: 42 },
              { value: 'ativos',    label: 'Ativos',     count: 28 },
              { value: 'pausados',  label: 'Pausados',   count: 8 },
              { value: 'arquivados', label: 'Arquivados', count: 6 },
            ]}
          />
          <div style={{ marginTop: 'var(--space-4)', fontSize: 13, color: 'var(--color-text-secondary)' }}>
            Mostrando filtro: <strong>{pillTab}</strong>
          </div>
        </Card>
      </Bloco>

      {/* Segmented */}
      <Bloco>
        <Eyebrow>variant="segmented" · view switcher</Eyebrow>
        <P muted>Padrão iOS/macOS. Container cinza + ativo branco com sombra. Usado em Agenda (Dia/Semana/Mês), Kanban (Lista/Grade), etc.</P>
        <Card style={{ marginTop: 'var(--space-4)' }}>
          <Tabs
            variant="segmented"
            value={segTab}
            onChange={setSegTab}
            items={[
              { value: 'dia', label: 'Dia' },
              { value: 'semana', label: 'Semana' },
              { value: 'mes', label: 'Mês' },
            ]}
          />
          <div style={{ marginTop: 'var(--space-4)', fontSize: 13, color: 'var(--color-text-secondary)' }}>
            Visualização: <strong>{segTab}</strong>
          </div>
        </Card>

        <div style={{ marginTop: 'var(--space-3)' }}>
          <Card>
            <P muted>Com ícones</P>
            <div style={{ marginTop: 'var(--space-3)' }}>
              <Tabs
                variant="segmented"
                value={bigTab}
                onChange={setBigTab}
                items={[
                  { value: 'geral',   label: 'Geral',   icon: 'mdi:cog-outline' },
                  { value: 'ia',      label: 'IA',      icon: 'mdi:sparkles' },
                  { value: 'cobranca', label: 'Cobrança', icon: 'mdi:cash' },
                  { value: 'equipe', label: 'Equipe',  icon: 'mdi:account-group-outline' },
                ]}
              />
            </div>
          </Card>
        </div>
      </Bloco>

      {/* Sizes */}
      <Bloco>
        <Eyebrow>Sizes — sm / md / lg</Eyebrow>
        <Card>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
            <Tabs variant="pills" size="sm" value="ativos" onChange={() => {}} items={[
              { value: 'todos', label: 'Todos', count: 12 },
              { value: 'ativos', label: 'Ativos', count: 8 },
            ]} />
            <Tabs variant="pills" size="md" value="ativos" onChange={() => {}} items={[
              { value: 'todos', label: 'Todos', count: 12 },
              { value: 'ativos', label: 'Ativos', count: 8 },
            ]} />
            <Tabs variant="pills" size="lg" value="ativos" onChange={() => {}} items={[
              { value: 'todos', label: 'Todos', count: 12 },
              { value: 'ativos', label: 'Ativos', count: 8 },
            ]} />
          </div>
        </Card>
      </Bloco>

      {/* Regras */}
      <Bloco>
        <Eyebrow>Regras de ouro</Eyebrow>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 'var(--space-3)', marginTop: 'var(--space-3-5)' }}>
          {REGRAS.map(r => (
            <RegraCard key={r.titulo} titulo={r.titulo}>{r.body}</RegraCard>
          ))}
        </div>
      </Bloco>

      {/* O que muda */}
      <Bloco>
        <Eyebrow>O que muda se aprovar essa seção</Eyebrow>
        <CardCallout tone="success">
          <ul style={{ margin: 0, paddingLeft: 20, lineHeight: 1.7 }}>
            <li><strong><code>{'<Tabs>'}</code> com 3 variants</strong> em <code>design-system/components/Tabs.js</code>.</li>
            <li><strong>Segmented Control da AgendaCalendario:221-238</strong> (Dia/Semana/Mês) migra pra <code>variant="segmented"</code>.</li>
            <li><strong>Próxima etapa:</strong> Dropdown (Moléculas · 06 — action menu, panel, button menu).</li>
          </ul>
        </CardCallout>
      </Bloco>
    </div>
  )
}
