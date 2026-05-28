import React, { useState } from 'react'
import Table from './components/Table'
import Button from './components/Button'
import Badge from './components/Badge'
import Avatar from './components/Avatar'
import { showSuccess } from '../Toast'

/* ============================================================
   /app/design-system/table
   Table declarativa com columns + data.
   ============================================================ */

const COBRANCAS_MOCK = [
  { id: 1, cliente: 'Joana Silva', valor: 150.00, status: 'pago',      vencimento: '15 mai' },
  { id: 2, cliente: 'Pedro Costa', valor: 200.00, status: 'pendente',  vencimento: '20 mai' },
  { id: 3, cliente: 'Maria Santos', valor: 180.00, status: 'atrasado', vencimento: '10 mai' },
  { id: 4, cliente: 'João Pereira', valor: 100.00, status: 'pago',      vencimento: '12 mai' },
  { id: 5, cliente: 'Ana Mendes', valor: 250.00, status: 'pago',      vencimento: '18 mai' },
  { id: 6, cliente: 'Carlos Lima', valor: 175.00, status: 'pendente',  vencimento: '25 mai' },
]

const STATUS_BADGE = {
  pago:      { variant: 'success', label: 'Pago' },
  pendente:  { variant: 'warning', label: 'Pendente' },
  atrasado:  { variant: 'danger',  label: 'Atrasado' },
  cancelado: { variant: 'default', label: 'Cancelado' },
}

const REGRAS = [
  { titulo: 'Columns declarativas', body: 'Define columns como array de {key, label, render?}. Componente cuida do HTML, props, alinhamento. Nunca escreve <thead><tbody> manual.' },
  { titulo: 'rowKey obrigatório pra selectable', body: 'Identifica linha unique (default "id"). Sem ele, React reclama de keys e selectable quebra.' },
  { titulo: 'render() pra células ricas', body: 'Coluna simples → mostra row[key]. Coluna com Badge, Avatar, formatação → usa render: row => <Badge>...</Badge>.' },
  { titulo: 'onRowClick ≠ buttons internos', body: 'Click na linha não dispara onRowClick se foi em button/input/link interno. Pattern automático — você não precisa stopPropagation.' },
  { titulo: 'BulkActions só com seleção', body: 'Barra de ações em massa aparece SÓ quando selectedKeys.length > 0. Quando volta a zero, esconde. Cara mantém limpo.' },
  { titulo: 'Loading preserva estrutura', body: 'Skeleton shimmer mantém número de colunas + headers. User vê "vai chegar" não "tela quebrada".' },
  { titulo: 'Empty state guia próximo passo', body: 'Não é só "Sem dados". Tem título + descrição + CTA. Ajuda o user a fazer a primeira ação.' },
  { titulo: 'Striped pra listas longas', body: 'Linhas alternadas (zebra) ajudam em listas >10 linhas. Em listas curtas vira ruído — não use por padrão.' },
  { titulo: 'StickyHeader em listas com scroll', body: 'Quando a tabela passa do viewport, header sticky ajuda lembrar das colunas. Padrão em Clientes/Financeiro com muitos registros.' },
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

/* ----- Página ----- */

function formatBRL(v) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export default function PaginaTable() {
  const [selected, setSelected] = useState([])
  const [loading, setLoading] = useState(false)
  const [empty, setEmpty] = useState(false)

  const baseColumns = [
    {
      key: 'cliente',
      label: 'Cliente',
      render: r => (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
          <Avatar name={r.cliente} size="sm" />
          <span style={{ fontWeight: 600 }}>{r.cliente}</span>
        </span>
      ),
    },
    {
      key: 'valor',
      label: 'Valor',
      align: 'right',
      render: r => <span style={{ fontFamily: 'var(--font-mono)' }}>{formatBRL(r.valor)}</span>,
    },
    {
      key: 'vencimento',
      label: 'Vencimento',
      align: 'right',
    },
    {
      key: 'status',
      label: 'Status',
      render: r => {
        const s = STATUS_BADGE[r.status]
        return <Badge variant={s.variant}>{s.label}</Badge>
      },
    },
    {
      key: 'acoes',
      label: '',
      align: 'right',
      width: 60,
      render: () => <Button variant="ghost" size="sm" iconOnly icon="mdi:dots-vertical" aria-label="Ações" />,
    },
  ]

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 8 }}>
        <Eyebrow>Moléculas · 04</Eyebrow>
        <Selo estado="em-revisao" />
      </div>
      <h1 className="ds-text-h1" style={{ margin: 0 }}>Table</h1>
      <div style={{ marginTop: 12, marginBottom: 40 }}>
        <P muted>
          Declarativa: passa <code>columns</code> + <code>data</code> e ela monta. Suporta selectable + bulk actions,
          loading skeleton, empty state, sticky header, striped, hoverable, clickable rows.
        </P>
      </div>

      {/* Básica */}
      <Bloco>
        <Eyebrow>Tabela básica (ao vivo)</Eyebrow>
        <P muted>Hoverable + clickable (clica numa linha). Status via render com Badge.</P>
        <div style={{ marginTop: 'var(--space-4)' }}>
          <Table
            columns={baseColumns}
            data={COBRANCAS_MOCK}
            onRowClick={(r) => showSuccess(`Abriria cobrança de ${r.cliente}`)}
          />
        </div>
        <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 'var(--space-3)' }}>
          Clica numa linha (mas o botão "..." é capturado separadamente — não dispara o onRowClick).
        </div>
      </Bloco>

      {/* Selectable + bulk */}
      <Bloco>
        <Eyebrow>Selectable + bulk actions</Eyebrow>
        <P muted>Marca algumas linhas pra ver a bar de bulk aparecer (animação slide-down). Checkbox no header é indeterminate quando parcial.</P>
        <div style={{ marginTop: 'var(--space-4)' }}>
          <Table
            columns={baseColumns}
            data={COBRANCAS_MOCK}
            selectable
            selectedKeys={selected}
            onSelectionChange={setSelected}
            bulkActions={
              <>
                <Button variant="outline" size="sm" icon="mdi:download">Exportar</Button>
                <Button variant="danger-outline" size="sm" icon="mdi:trash-can-outline" onClick={() => {
                  setSelected([])
                  showSuccess('Itens removidos da lista')
                }}>Excluir {selected.length}</Button>
              </>
            }
          />
        </div>
      </Bloco>

      {/* Loading + Empty */}
      <Bloco>
        <Eyebrow>Estados — loading e empty</Eyebrow>
        <div style={{ display: 'flex', gap: 'var(--space-3)', marginBottom: 'var(--space-4)' }}>
          <Button variant="outline" size="sm" onClick={() => { setLoading(true); setTimeout(() => setLoading(false), 2500) }}>
            Simular loading (2.5s)
          </Button>
          <Button variant="outline" size="sm" onClick={() => setEmpty(e => !e)}>
            {empty ? 'Mostrar data' : 'Simular empty'}
          </Button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-4)' }}>
          <div>
            <div className="ds-text-eyebrow" style={{ color: 'var(--color-text-muted)', marginBottom: 6 }}>Loading (skeleton shimmer)</div>
            <Table
              columns={baseColumns}
              data={loading ? [] : COBRANCAS_MOCK.slice(0, 3)}
              loading={loading}
              loadingRows={3}
            />
          </div>
          <div>
            <div className="ds-text-eyebrow" style={{ color: 'var(--color-text-muted)', marginBottom: 6 }}>Empty com CTA</div>
            <Table
              columns={baseColumns}
              data={empty ? [] : COBRANCAS_MOCK.slice(0, 2)}
              emptyIcon="mdi:cash-multiple"
              emptyTitle="Nenhuma cobrança ainda"
              emptyMessage="Crie sua primeira cobrança avulsa pra começar a receber via WhatsApp."
              emptyAction={
                <Button variant="primary" icon="mdi:plus">Nova cobrança</Button>
              }
            />
          </div>
        </div>
      </Bloco>

      {/* Variantes */}
      <Bloco>
        <Eyebrow>Variantes — striped, sm</Eyebrow>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-4)' }}>
          <div>
            <div className="ds-text-eyebrow" style={{ color: 'var(--color-text-muted)', marginBottom: 6 }}>Striped (zebra)</div>
            <Table
              columns={baseColumns.slice(0, 4)}
              data={COBRANCAS_MOCK}
              striped
            />
          </div>
          <div>
            <div className="ds-text-eyebrow" style={{ color: 'var(--color-text-muted)', marginBottom: 6 }}>Size sm (denso)</div>
            <Table
              columns={baseColumns.slice(0, 4)}
              data={COBRANCAS_MOCK}
              size="sm"
            />
          </div>
        </div>
      </Bloco>

      {/* Como fica no código */}
      <Bloco>
        <Eyebrow>Como fica no código</Eyebrow>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-4)', marginTop: 'var(--space-3-5)' }}>
          <div>
            <div className="ds-text-eyebrow" style={{ color: 'var(--color-text-muted)', marginBottom: 6 }}>Hoje (Clientes.js / Financeiro.js)</div>
            <CodeBlock>{`<table style={{...}}>
  <thead>
    <tr>
      <th>Cliente</th>
      <th>Valor</th>
      <th>Status</th>
    </tr>
  </thead>
  <tbody>
    {clientes.map(c => (
      <tr key={c.id} onClick={...}>
        <td>{c.nome}</td>
        <td>{formatBRL(c.valor)}</td>
        <td>
          <span style={{
            background: c.status === 'pago' ? '#4CAF50' : ...
          }}>{c.status}</span>
        </td>
      </tr>
    ))}
  </tbody>
</table>`}</CodeBlock>
          </div>
          <div>
            <div className="ds-text-eyebrow" style={{ color: 'var(--mensalli-green-700)', marginBottom: 6 }}>Proposta</div>
            <CodeBlock tone="proposta">{`<Table
  columns={[
    { key: 'nome', label: 'Cliente' },
    { key: 'valor', label: 'Valor', align: 'right',
      render: r => formatBRL(r.valor) },
    { key: 'status', label: 'Status',
      render: r => <Badge variant={
        r.status === 'pago' ? 'success' : 'warning'
      }>{r.status}</Badge> },
  ]}
  data={clientes}
  onRowClick={...}
/>`}</CodeBlock>
          </div>
        </div>
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
            <li><strong><code>{'<Table>'}</code> declarativa</strong> em <code>design-system/components/Table.js</code>.</li>
            <li><strong>14 tabelas inline</strong> têm caminho claro de migração — passa columns + data e ganha selectable, loading, empty, sticky de graça.</li>
            <li><strong>BulkActions bar animada</strong> aparece/some conforme seleção.</li>
            <li><strong>Próxima etapa:</strong> Tabs (Moléculas · 05 — pills verde / underline / segmented).</li>
          </ul>
        </CardCallout>
      </Bloco>
    </div>
  )
}
