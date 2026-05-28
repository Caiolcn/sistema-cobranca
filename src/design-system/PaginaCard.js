import React from 'react'
import Card from './components/Card'
import Button from './components/Button'
import Badge from './components/Badge'
import Avatar from './components/Avatar'

/* ============================================================
   /app/design-system/card
   3 elevations × 3 paddings × accent stripe × clickable.
   Sub-componentes: Card.Header / Body / Footer / Divider.
   ============================================================ */

const USO_REAL = [
  { label: 'boxShadow inline', valor: 192, sub: 'cards/superfícies elevadas' },
  { label: 'borderLeft 3px verde', valor: 4, sub: 'Recebido/Sucesso' },
  { label: 'borderLeft 3px azul', valor: 4, sub: 'Em aberto/MRR' },
  { label: 'borderLeft 3px laranja', valor: 4, sub: 'A vencer/Warning' },
  { label: 'borderLeft 3px vermelho', valor: 3, sub: 'Atraso/Danger' },
  { label: 'borderRadius 10-12px', valor: '+/- 200', sub: 'pattern dominante' },
]

const REGRAS = [
  { titulo: 'Flat por default, shadow só com razão', body: 'Um card sem sombra é mais fácil de escalar em grid. Shadow-sm só quando o card realmente "sobe" da página (settings hero, card destaque).' },
  { titulo: 'Hover sutil, sem "pular"', body: 'Card clickable muda bg/border sutil — não levanta com shadow grande. Evita "piscar" em grids/listas.' },
  { titulo: 'Padding consistente', body: 'Use tight/default/spacious — nunca invente p-[17px]. Default (p-4) resolve 80% dos casos.' },
  { titulo: 'Header + Body + Footer pra estrutura', body: 'Se o card tem cabeçalho + conteúdo + ações, use sub-componentes. Divisores cinza-200 separam.' },
  { titulo: 'Accent stripe pra resumos', body: 'Barra lateral colorida (3px) comunica categoria/status do card inteiro. Útil em cards de stats (Recebido, Em aberto, Atrasado).' },
  { titulo: 'Tinted pra reforçar accent', body: 'Quando accent não é suficiente, opt-in <code>tinted</code> aplica bg pastel da mesma cor. Use com parcimônia — pode pesar visualmente.' },
  { titulo: 'Border-radius xl padrão', body: 'Cards são 12px (rounded-xl). Não usa 8 (rounded-lg, é pra inputs/buttons), nem 16 (rounded-2xl, hero only).' },
  { titulo: 'Border subtle, não cinza forte', body: 'border 1px neutral-200 — não compete com conteúdo. Cards SEM border (flat sem accent) ficam só com bg-surface contra page-bg.' },
  { titulo: 'Clickable vira <button>', body: 'A11y correta — keyboard nav, focus ring, role="button". Não usa div+onClick.' },
]

/* ----- Sub-componentes da página ----- */

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
      <div style={{ fontSize: 20, fontWeight: 700, marginTop: 4, color: 'var(--color-text-primary)' }}>{valor}</div>
      <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 4, lineHeight: 1.4 }}>{sub}</div>
    </div>
  )
}

/* ----- Página ----- */

export default function PaginaCard() {
  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 8 }}>
        <Eyebrow>Moléculas · 01</Eyebrow>
        <Selo estado="em-revisao" />
      </div>
      <h1 className="ds-text-h1" style={{ margin: 0 }}>Card</h1>
      <div style={{ marginTop: 12, marginBottom: 40 }}>
        <P muted>
          Container mais usado do DS. 3 elevations × 3 paddings × accent stripe (5 cores) × clickable.
          Sub-componentes Card.Header / Body / Footer / Divider pra estrutura semântica.
        </P>
      </div>

      {/* Uso real */}
      <Bloco>
        <Eyebrow>Uso real no projeto</Eyebrow>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 'var(--space-3)', marginTop: 'var(--space-3-5)' }}>
          {USO_REAL.map(u => <MetricaCard key={u.label} {...u} />)}
        </div>
      </Bloco>

      {/* 3 elevations */}
      <Bloco>
        <Eyebrow>3 elevations (ao vivo)</Eyebrow>
        <P muted>Flat default. Elevated quando precisa "sair" da página. Floating raro — só pra cards que flutuam (modal-like, hero).</P>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 'var(--space-4)', marginTop: 'var(--space-4)' }}>
          <Card elevation="flat">
            <Eyebrow>flat (default)</Eyebrow>
            <div style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>Border 1px subtle, sem shadow. Ideal pra grids/listas densas.</div>
          </Card>
          <Card elevation="elevated">
            <Eyebrow>elevated</Eyebrow>
            <div style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>shadow-sm. Cards de destaque (forms, settings hero).</div>
          </Card>
          <Card elevation="floating">
            <Eyebrow>floating</Eyebrow>
            <div style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>shadow-lg. Cards que flutuam (popover, hero, onboarding).</div>
          </Card>
        </div>
      </Bloco>

      {/* 3 paddings */}
      <Bloco>
        <Eyebrow>3 paddings</Eyebrow>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 'var(--space-4)', marginTop: 'var(--space-4)' }}>
          <Card padding="tight" elevation="flat">
            <Eyebrow>tight (12px)</Eyebrow>
            <div style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>Listagens densas, cards menores.</div>
          </Card>
          <Card padding="default" elevation="flat">
            <Eyebrow>default (16px) ★</Eyebrow>
            <div style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>80% dos casos.</div>
          </Card>
          <Card padding="spacious" elevation="flat">
            <Eyebrow>spacious (24px)</Eyebrow>
            <div style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>Hero, settings, formulários grandes.</div>
          </Card>
        </div>
      </Bloco>

      {/* Accent stripes — pattern de stats */}
      <Bloco>
        <Eyebrow>Accent stripe · cards de resumo financeiro</Eyebrow>
        <P muted>Barra lateral 3px colorida + opcional bg tinted. Pattern direto do Financeiro:1675-1822 (Em atraso / A vencer / Recebido / MRR).</P>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 'var(--space-3)', marginTop: 'var(--space-4)' }}>
          <Card accent="danger" tinted>
            <Eyebrow>Em atraso</Eyebrow>
            <div style={{ fontSize: 24, fontWeight: 700, marginTop: 4, fontFamily: 'var(--font-mono)' }}>R$ 8.2k</div>
            <div style={{ fontSize: 11, color: 'var(--danger-700)', marginTop: 4 }}>12% do MRR</div>
          </Card>
          <Card accent="warning" tinted>
            <Eyebrow>A vencer</Eyebrow>
            <div style={{ fontSize: 24, fontWeight: 700, marginTop: 4, fontFamily: 'var(--font-mono)' }}>R$ 15.4k</div>
            <div style={{ fontSize: 11, color: 'var(--warning-700)', marginTop: 4 }}>próximos 7 dias</div>
          </Card>
          <Card accent="success" tinted>
            <Eyebrow>Recebido</Eyebrow>
            <div style={{ fontSize: 24, fontWeight: 700, marginTop: 4, fontFamily: 'var(--font-mono)' }}>R$ 42.0k</div>
            <div style={{ fontSize: 11, color: 'var(--success-700)', marginTop: 4 }}>+18% vs mês passado</div>
          </Card>
          <Card accent="info" tinted>
            <Eyebrow>MRR ativo</Eyebrow>
            <div style={{ fontSize: 24, fontWeight: 700, marginTop: 4, fontFamily: 'var(--font-mono)' }}>R$ 68.5k</div>
            <div style={{ fontSize: 11, color: 'var(--info-700)', marginTop: 4 }}>184 alunos ativos</div>
          </Card>
        </div>

        <div style={{ marginTop: 'var(--space-5)' }}>
          <Eyebrow>Sem tinted — só stripe</Eyebrow>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 'var(--space-3)', marginTop: 'var(--space-3)' }}>
            <Card accent="danger"><div style={{ fontSize: 13 }}>Em atraso</div></Card>
            <Card accent="warning"><div style={{ fontSize: 13 }}>A vencer</div></Card>
            <Card accent="success"><div style={{ fontSize: 13 }}>Recebido</div></Card>
            <Card accent="info"><div style={{ fontSize: 13 }}>MRR ativo</div></Card>
          </div>
        </div>
      </Bloco>

      {/* Estrutura Header + Body + Footer */}
      <Bloco>
        <Eyebrow>Estrutura · Card.Header + Body + Footer</Eyebrow>
        <P muted>Pra forms, settings, perfis. Sempre padding="none" no Card pra deixar os sub-componentes controlarem o espaçamento.</P>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-4)', marginTop: 'var(--space-4)' }}>
          <Card padding="none" elevation="elevated">
            <Card.Header
              title="Maria Santos"
              subtitle="Cliente desde mai/2024 · Plano anual"
              actions={
                <Button variant="ghost" size="sm" iconOnly icon="mdi:dots-vertical" aria-label="Mais ações" />
              }
            />
            <Card.Body>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', fontSize: 13 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--color-text-muted)' }}>Mensalidade</span>
                  <span style={{ fontFamily: 'var(--font-mono)' }}>R$ 150,00</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--color-text-muted)' }}>Próximo vencimento</span>
                  <span>15 jun</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--color-text-muted)' }}>Tags</span>
                  <span style={{ display: 'inline-flex', gap: 4 }}>
                    <Badge variant="primary" size="xs">VIP</Badge>
                    <Badge variant="success" size="xs">Em dia</Badge>
                  </span>
                </div>
              </div>
            </Card.Body>
            <Card.Footer>
              <Button variant="outline" size="sm">Histórico</Button>
              <Button variant="primary" size="sm">Cobrar agora</Button>
            </Card.Footer>
          </Card>

          <Card padding="none" elevation="flat">
            <Card.Header
              title="Editar perfil"
              subtitle="Suas informações ficam visíveis pros alunos"
            />
            <Card.Body>
              <P muted>Campos do form viriam aqui — Nome, CPF, CNPJ, endereço, etc.</P>
            </Card.Body>
            <Card.Divider />
            <Card.Body padding="tight">
              <P muted>Outra seção do card com padding diferente, separada por Divider.</P>
            </Card.Body>
            <Card.Footer align="between">
              <Button variant="ghost" size="sm" icon="mdi:trash-can-outline">Excluir conta</Button>
              <span style={{ display: 'flex', gap: 8 }}>
                <Button variant="outline" size="sm">Cancelar</Button>
                <Button variant="primary" size="sm">Salvar</Button>
              </span>
            </Card.Footer>
          </Card>
        </div>
      </Bloco>

      {/* Clickable */}
      <Bloco>
        <Eyebrow>Clickable · vira &lt;button&gt;</Eyebrow>
        <P muted>Hover muda bg+border sem "pular" com shadow. Focus ring keyboard. Padrão pra entrar em detalhe.</P>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 'var(--space-3)', marginTop: 'var(--space-4)' }}>
          {[
            { name: 'Joana Silva', desc: '15 cobranças · em dia', ring: 'success' },
            { name: 'Pedro Costa', desc: '8 cobranças · 1 em atraso', ring: 'warning' },
            { name: 'Maria Santos', desc: '22 cobranças · em dia', ring: 'success' },
          ].map(c => (
            <Card key={c.name} clickable elevation="flat" padding="default" onClick={() => alert(`Abriria ${c.name}`)}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
                <Avatar name={c.name} size="md" ring={c.ring} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>{c.name}</div>
                  <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 2 }}>{c.desc}</div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      </Bloco>

      {/* Como fica no código */}
      <Bloco>
        <Eyebrow>Como fica no código — refactor real</Eyebrow>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-4)', marginTop: 'var(--space-3-5)' }}>
          <div>
            <div className="ds-text-eyebrow" style={{ color: 'var(--color-text-muted)', marginBottom: 6 }}>
              Hoje (Financeiro.js:1675-1825)
            </div>
            <CodeBlock>{`<div style={{
  borderLeft: '3px solid #f44336',
  backgroundColor: '#fff5f5',
  padding: '20px',
  borderRadius: '12px',
}}>
  <div style={{
    fontSize: 11,
    fontWeight: 'bold',
    color: '#666',
    textTransform: 'uppercase',
  }}>Em atraso</div>
  <div style={{
    fontSize: 24,
    fontWeight: 'bold',
    marginTop: 4,
  }}>R$ 8.200</div>
  <div style={{
    fontSize: 11,
    color: '#dc2626',
    marginTop: 4,
  }}>12% do MRR</div>
</div>`}</CodeBlock>
          </div>
          <div>
            <div className="ds-text-eyebrow" style={{ color: 'var(--mensalli-green-700)', marginBottom: 6 }}>
              Proposta
            </div>
            <CodeBlock tone="proposta">{`<Card accent="danger" tinted>
  <Eyebrow>Em atraso</Eyebrow>
  <div className="ds-text-h2">
    R$ 8.200
  </div>
  <div style={{
    color: 'var(--danger-700)',
  }}>
    12% do MRR
  </div>
</Card>`}</CodeBlock>
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
            <li><strong><code>{'<Card>'}</code> vira canônico</strong> em <code>design-system/components/Card.js</code>.</li>
            <li><strong>3 elevations × 3 paddings × accent (6 cores) × tinted × clickable</strong> + sub-componentes Header/Body/Footer/Divider.</li>
            <li><strong>14 cards de resumo financeiro</strong> (Em atraso/A vencer/Recebido/MRR) migram pra <code>{'<Card accent="..." tinted>'}</code> — 20 linhas inline viram 3.</li>
            <li><strong>Próxima etapa:</strong> Modal (Moléculas · 02 — sizes mapeados ao conteúdo + Aside + ConfirmDialog).</li>
          </ul>
        </CardCallout>
      </Bloco>
    </div>
  )
}
