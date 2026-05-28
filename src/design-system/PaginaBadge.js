import React, { useState } from 'react'
import Badge from './components/Badge'

/* ============================================================
   /app/design-system/badge
   7 variants × 2 fillModes × 3 sizes + dot/icon/remove/custom color.
   ============================================================ */

const USO_REAL = [
  { label: 'Status "pago"', valor: 262, sub: 'sucesso financeiro' },
  { label: 'Status "pendente"', valor: 209, sub: 'aguardando ação' },
  { label: 'Status "atrasado"', valor: 49, sub: 'destrutivo' },
  { label: 'Status "cancelado"', valor: 38, sub: 'neutro' },
  { label: 'borderRadius 999', valor: 23, sub: 'pills (chips/badges)' },
  { label: 'Tags coloridas', valor: 3, sub: 'VIP, custom color' },
]

const VARIANTS = [
  { v: 'default',  label: 'Aguardando',  uso: 'Estado neutro genérico — sem semântica forte' },
  { v: 'primary',  label: 'Plano Premium', uso: 'Destaque de marca — Premium, Pro, Plus' },
  { v: 'success',  label: 'Pago',         uso: 'Confirmação, ativo, completo, presente' },
  { v: 'warning',  label: 'Pendente',     uso: 'Atenção, aguardando ação, vencimento próximo' },
  { v: 'danger',   label: 'Atrasado',     uso: 'Erro, atrasado, cancelado, falta, bloqueado' },
  { v: 'info',     label: 'Em revisão',   uso: 'Informativo, em progresso, status auxiliar' },
  { v: 'outline',  label: 'Rascunho',     uso: 'Contagem, metadata, categorias leves' },
]

const NAO_E_BADGE = [
  { padrao: 'Botão pequeno (quick action)', onde: 'Financeiro.js:1913 — marcar como pago', vai: 'Button variant="ghost" size="xs"' },
  { padrao: 'Chip de Select multi (chips no campo)', onde: 'Select.js — multi-select', vai: 'já é parte do Select' },
  { padrao: 'Card com barra lateral colorida', onde: 'Financeiro.js:1675 (cards de resumo)', vai: 'Molécula Card com prop accentColor' },
  { padrao: 'Tab pill ativa (Todos 42)', onde: 'Krooa pattern, futuro', vai: 'Molécula Tabs (variant=pills)' },
  { padrao: 'Avatar com status (online dot)', onde: 'futuro', vai: 'Átomo Avatar (com prop status)' },
]

const REGRAS = [
  { titulo: 'Um Badge, uma info', body: 'Badge tem que ser escaneável em 1 segundo. "Pendente faturamento 2024" é demais — quebra em vários ou usa label normal.' },
  { titulo: 'Soft default, Solid pra destaque', body: 'Soft (bg pastel + texto escuro) é o padrão — 90% dos casos. Solid (bg chapado + texto branco) quando quiser chamar atenção extra.' },
  { titulo: 'Cor = semântica, não decoração', body: 'success = pago/ativo/presente. danger = atrasado/falta/cancelado. Não escolha pela cor, escolha pelo SIGNIFICADO.' },
  { titulo: 'Máximo 3-4 badges juntos', body: 'Se precisa de mais, reordena. Os 2 primeiros + "+N outros" (usa badge outline pra contador) — pattern de overflow.' },
  { titulo: 'Dot só em status', body: 'Dot comunica "estado ativo/mudando". Em tag ou contador, não faz sentido — vira ruído.' },
  { titulo: 'Pill default, rounded por exceção', body: 'borderRadius full é o padrão (pattern atual do Mensalli — 23 ocorrências). rounded-md só quando o badge é "tag de categoria" estável.' },
  { titulo: 'customColor pra tags do user', body: 'Quando user cria tag escolhendo cor (categoria, etiqueta), usa customColor + customTextColor. Pra tudo mais, variant.' },
  { titulo: 'onRemove vira chip', body: 'Adicionou X = removível. Padrão pra filtros aplicados, tags selecionadas, destinatários. Sem X = só info.' },
  { titulo: 'Ícone reforça, não substitui', body: 'icon="mdi:check" + label "Pago" é bom. icon-only sem label é confuso — perde acessibilidade.' },
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

function MetricaCard({ label, valor, sub }) {
  return (
    <div style={{
      backgroundColor: 'var(--color-bg-surface)',
      border: '1px solid var(--color-border-subtle)',
      borderRadius: 'var(--radius-lg)', padding: 'var(--space-3-5)',
    }}>
      <div className="ds-text-eyebrow" style={{ color: 'var(--color-text-muted)' }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 700, marginTop: 4, color: 'var(--color-text-primary)' }}>{valor}</div>
      <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 4, lineHeight: 1.4 }}>{sub}</div>
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

export default function PaginaBadge() {
  const [tags, setTags] = useState([
    { id: 'vip', label: 'VIP', variant: 'primary' },
    { id: 'anual', label: 'Plano anual', variant: 'success' },
    { id: 'aniv', label: 'Aniversariante', variant: 'warning' },
    { id: 'custom1', label: 'Convênio', customColor: '#8867A1', customTextColor: '#FFFFFF' },
  ])
  function removeTag(id) {
    setTags(prev => prev.filter(t => t.id !== id))
  }

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 8 }}>
        <Eyebrow>Átomos · 06</Eyebrow>
        <Selo estado="em-revisao" />
      </div>
      <h1 className="ds-text-h1" style={{ margin: 0 }}>Badge</h1>
      <div style={{ marginTop: 12, marginBottom: 40 }}>
        <P muted>
          Pill semântico pra status, contadores, tags. 7 variants × 2 fill modes × 3 sizes.
          Plus dot indicator, ícone, X remove, custom color pra tags do usuário.
        </P>
      </div>

      {/* Uso real */}
      <Bloco>
        <Eyebrow>Uso real no projeto</Eyebrow>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 'var(--space-3)', marginTop: 'var(--space-3-5)' }}>
          {USO_REAL.map(u => <MetricaCard key={u.label} {...u} />)}
        </div>
      </Bloco>

      {/* Escopo */}
      <Bloco>
        <Eyebrow>Escopo · o que é Badge vs o que NÃO é</Eyebrow>
        <P muted>Nem todo pill colorido é Badge. Acompanhe os limites — alguns padrões pertencem a outros átomos/moléculas.</P>
        <div style={{
          marginTop: 'var(--space-4)',
          border: '1px solid var(--color-border-subtle)',
          borderRadius: 'var(--radius-lg)',
          backgroundColor: 'var(--color-bg-surface)',
          overflow: 'hidden',
        }}>
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1.2fr 1.2fr 1fr',
            gap: 'var(--space-4)',
            padding: 'var(--space-3) var(--space-5)',
            backgroundColor: 'var(--neutral-50)',
            borderBottom: '1px solid var(--color-border-subtle)',
          }}>
            {['Padrão', 'Onde aparece', 'Vai para'].map(h => (
              <div key={h} className="ds-text-eyebrow" style={{ color: 'var(--color-text-muted)' }}>{h}</div>
            ))}
          </div>
          {NAO_E_BADGE.map((p, i) => (
            <div key={p.padrao} style={{
              display: 'grid',
              gridTemplateColumns: '1.2fr 1.2fr 1fr',
              gap: 'var(--space-4)',
              padding: 'var(--space-3) var(--space-5)',
              borderTop: i > 0 ? '1px solid var(--color-border-subtle)' : 'none',
              fontSize: 12,
              alignItems: 'center',
            }}>
              <span style={{ fontWeight: 600, color: 'var(--color-text-primary)' }}>{p.padrao}</span>
              <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-text-muted)', fontSize: 11 }}>{p.onde}</span>
              <span style={{ color: 'var(--mensalli-green-700)', fontWeight: 600 }}>{p.vai}</span>
            </div>
          ))}
        </div>
      </Bloco>

      {/* 7 variants — soft vs solid */}
      <Bloco>
        <Eyebrow>7 variants · soft (default) vs solid</Eyebrow>
        <P muted>Soft = bg pastel + texto escuro. Solid = bg chapado + texto branco. Default é soft.</P>
        <div style={{
          marginTop: 'var(--space-4)',
          border: '1px solid var(--color-border-subtle)',
          borderRadius: 'var(--radius-lg)',
          backgroundColor: 'var(--color-bg-surface)',
          overflow: 'hidden',
        }}>
          <div style={{
            display: 'grid',
            gridTemplateColumns: '120px 140px 140px 1fr',
            gap: 'var(--space-4)',
            padding: 'var(--space-3) var(--space-5)',
            backgroundColor: 'var(--neutral-50)',
            borderBottom: '1px solid var(--color-border-subtle)',
          }}>
            {['variant', 'soft', 'solid', 'quando usar'].map(h => (
              <div key={h} className="ds-text-eyebrow" style={{ color: 'var(--color-text-muted)' }}>{h}</div>
            ))}
          </div>
          {VARIANTS.map((v, i) => (
            <div key={v.v} style={{
              display: 'grid',
              gridTemplateColumns: '120px 140px 140px 1fr',
              gap: 'var(--space-4)',
              padding: 'var(--space-3) var(--space-5)',
              borderTop: i > 0 ? '1px solid var(--color-border-subtle)' : 'none',
              alignItems: 'center',
            }}>
              <code style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--color-text-secondary)' }}>{v.v}</code>
              <div><Badge variant={v.v}>{v.label}</Badge></div>
              <div><Badge variant={v.v} solid>{v.label}</Badge></div>
              <span style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>{v.uso}</span>
            </div>
          ))}
        </div>
      </Bloco>

      {/* Sizes */}
      <Bloco>
        <Eyebrow>Sizes — xs (18px), sm (22px, default), md (28px)</Eyebrow>
        <Card>
          <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'center', flexWrap: 'wrap' }}>
            <Badge variant="success" size="xs">XS · pago</Badge>
            <Badge variant="success" size="sm">SM · pago</Badge>
            <Badge variant="success" size="md">MD · pago</Badge>
          </div>
          <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 'var(--space-3)' }}>
            xs pra counters/avatares. sm default pra status em tabela. md pra destaques de hero/header.
          </div>
        </Card>
      </Bloco>

      {/* Com dot */}
      <Bloco>
        <Eyebrow>Com dot · indicador de status ativo</Eyebrow>
        <P muted>Bolinha à esquerda comunica "estado atual/ativo". Cor herda do texto da variant.</P>
        <Card>
          <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap', alignItems: 'center' }}>
            <Badge variant="success" dot>Online</Badge>
            <Badge variant="warning" dot>Pendente</Badge>
            <Badge variant="danger" dot>Em atraso</Badge>
            <Badge variant="info" dot>Em revisão</Badge>
            <Badge variant="default" dot>Rascunho</Badge>
          </div>
        </Card>
      </Bloco>

      {/* Com ícone */}
      <Bloco>
        <Eyebrow>Com ícone · reforça o significado</Eyebrow>
        <Card>
          <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap', alignItems: 'center' }}>
            <Badge variant="success" icon="mdi:check-circle">Pago</Badge>
            <Badge variant="warning" icon="mdi:clock-outline">Pendente</Badge>
            <Badge variant="danger" icon="mdi:alert-circle">Atrasado</Badge>
            <Badge variant="info" icon="mdi:information">Em revisão</Badge>
            <Badge variant="default" icon="mdi:cancel">Cancelado</Badge>
            <Badge variant="success" icon="mdi:check-circle" solid>Confirmado</Badge>
          </div>
        </Card>
      </Bloco>

      {/* Chips removíveis */}
      <Bloco>
        <Eyebrow>Chip removível · onRemove ativa o X</Eyebrow>
        <P muted>Tags do cliente, filtros aplicados, destinatários selecionados. Clica no X pra remover.</P>
        <Card>
          <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap', alignItems: 'center' }}>
            {tags.length === 0 ? (
              <span style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>Nenhuma tag — recarrega a página pra ver de novo</span>
            ) : tags.map(t => (
              <Badge
                key={t.id}
                variant={t.variant || 'default'}
                customColor={t.customColor}
                customTextColor={t.customTextColor}
                onRemove={() => removeTag(t.id)}
              >
                {t.label}
              </Badge>
            ))}
          </div>
          <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 'var(--space-3)' }}>
            "Convênio" usa customColor + customTextColor — pra tags com cor escolhida pelo usuário.
          </div>
        </Card>
      </Bloco>

      {/* Shape rounded vs pill */}
      <Bloco>
        <Eyebrow>Shape — pill (default) vs rounded</Eyebrow>
        <P muted>Pill é o padrão (radius full, 23 ocorrências no código). Rounded (radius-md) só quando o badge é "tag de categoria" mais estável visualmente.</P>
        <Card>
          <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap', alignItems: 'center' }}>
            <Badge variant="primary" shape="pill">Pill (default)</Badge>
            <Badge variant="primary" shape="rounded">Rounded</Badge>
            <Badge variant="success" shape="rounded" icon="mdi:tag-outline">Categoria</Badge>
            <Badge variant="info" shape="rounded">Código #42</Badge>
          </div>
        </Card>
      </Bloco>

      {/* Patterns no contexto */}
      <Bloco>
        <Eyebrow>Patterns no contexto · linha de tabela, header, contador</Eyebrow>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', marginTop: 'var(--space-3-5)' }}>
          {/* Tabela */}
          <Card>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--color-text-muted)', marginBottom: 'var(--space-3)' }}>
              Tabela de cobranças
            </div>
            {[
              { nome: 'Joana Silva', valor: 'R$ 150,00', status: 'success', label: 'Pago', icon: 'mdi:check' },
              { nome: 'Pedro Costa', valor: 'R$ 200,00', status: 'warning', label: 'Pendente', icon: 'mdi:clock-outline' },
              { nome: 'Maria Santos', valor: 'R$ 180,00', status: 'danger', label: 'Atrasado 5 dias', icon: 'mdi:alert' },
              { nome: 'João Pereira', valor: 'R$ 100,00', status: 'default', label: 'Cancelado' },
            ].map((row, i) => (
              <div key={row.nome} style={{
                display: 'grid',
                gridTemplateColumns: '1fr 100px 160px',
                gap: 'var(--space-4)',
                padding: 'var(--space-3) 0',
                borderTop: i > 0 ? '1px solid var(--color-border-subtle)' : 'none',
                alignItems: 'center',
                fontSize: 13,
              }}>
                <span>{row.nome}</span>
                <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-text-secondary)' }}>{row.valor}</span>
                <Badge variant={row.status} size="sm" icon={row.icon}>{row.label}</Badge>
              </div>
            ))}
          </Card>

          {/* Pattern de avatar com status */}
          <Card>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--color-text-muted)', marginBottom: 'var(--space-3)' }}>
              Header com badges de status
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
              <div style={{
                width: 40, height: 40, borderRadius: '50%',
                backgroundColor: 'var(--mensalli-dark-600)',
                color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontWeight: 600, fontSize: 13,
              }}>MS</div>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
                  Maria Santos
                  <Badge variant="primary" size="xs">VIP</Badge>
                  <Badge variant="success" size="xs" dot>Ativa</Badge>
                </div>
                <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 2 }}>Plano anual · Mensalidade R$ 150,00</div>
              </div>
            </div>
          </Card>
        </div>
      </Bloco>

      {/* Como fica no código */}
      <Bloco>
        <Eyebrow>Como fica no código — refactor real</Eyebrow>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-4)', marginTop: 'var(--space-3-5)' }}>
          <div>
            <div className="ds-text-eyebrow" style={{ color: 'var(--color-text-muted)', marginBottom: 6 }}>
              Hoje (Financeiro.js:1178)
            </div>
            <CodeBlock>{`<span style={{
  backgroundColor:
    status === 'pago' ? '#4CAF50'
    : status === 'aberto' ? '#2196F3'
    : status === 'atrasado' ? '#f44336'
    : '#9e9e9e',
  color: 'white',
  padding: '3px 10px',
  borderRadius: '12px',
  fontSize: '11px',
  fontWeight: 'bold',
}}>
  {status}
</span>`}</CodeBlock>
          </div>
          <div>
            <div className="ds-text-eyebrow" style={{ color: 'var(--mensalli-green-700)', marginBottom: 6 }}>
              Proposta
            </div>
            <CodeBlock tone="proposta">{`const variantPorStatus = {
  pago: 'success',
  aberto: 'info',
  atrasado: 'danger',
  cancelado: 'default',
}

<Badge variant={variantPorStatus[status]} solid>
  {status}
</Badge>`}</CodeBlock>
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
            <li><strong><code>{'<Badge>'}</code> vira canônico</strong> em <code>design-system/components/Badge.js</code>.</li>
            <li><strong>7 variants × 2 fill modes × 3 sizes</strong> cobrem todos os padrões de status do código.</li>
            <li><strong>Dot, icon, onRemove, customColor</strong> ativam features sem novos componentes.</li>
            <li><strong>Backward-compat 100%:</strong> nenhum span inline atual quebra. Migração é gradual.</li>
            <li><strong>Próxima etapa:</strong> Avatar (Átomos · 07 — fechando os átomos).</li>
          </ul>
        </CardCallout>
      </Bloco>
    </div>
  )
}
