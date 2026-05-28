import React from 'react'
import Avatar from './components/Avatar'
import AvatarGroup from './components/AvatarGroup'

/* ============================================================
   /app/design-system/avatar
   Avatar com iniciais + cor por hash + status + ring + image fallback.
   AvatarGroup com overflow.
   ============================================================ */

const USO_REAL = [
  { label: 'Avatares no app', valor: 'Dashboard, Clientes, CRM, ChatArea', sub: '6 contextos identificados' },
  { label: 'Padrão atual', valor: '#344848 brand-dark', sub: 'todos com mesma cor' },
  { label: 'Status indicator', valor: 'inexistente', sub: 'proposta nova pro DS' },
  { label: 'Ring colorido', valor: 'inexistente', sub: 'proposta nova (status comercial)' },
]

const NOMES_EXEMPLO = [
  'Joana Silva',
  'Pedro Costa',
  'Maria Santos',
  'Ana Mendes',
  'Carlos Lima',
  'João Pereira',
  'Beatriz Souza',
  'Fernanda Oliveira',
]

const SIZES = [
  { size: 'xs', label: 'xs', uso: '24px — listas densas, comentários inline' },
  { size: 'sm', label: 'sm', uso: '32px — tabelas, chips de pessoas' },
  { size: 'md', label: 'md ★', uso: '40px — DEFAULT — cards, conversas' },
  { size: 'lg', label: 'lg', uso: '48px — header de entidade, settings' },
  { size: 'xl', label: 'xl', uso: '64px — perfil, página de cliente' },
  { size: '2xl', label: '2xl', uso: '96px — hero, tela de confirmação' },
]

const REGRAS = [
  { titulo: 'Sempre iniciais, nunca ícone genérico', body: 'Pessoa sem foto = 2 iniciais (primeiro + último nome). Ícone genérico de pessoa carrega o sentimento de impessoalidade.' },
  { titulo: 'Cor pelo nome, não aleatória', body: 'Hash do nome → cor fixa. "Joana" sempre tem a mesma cor em qualquer lugar. Ajuda memória visual.' },
  { titulo: 'Status dot só quando relevante', body: 'Online/offline/busy é útil em chat. Em lista de clientes geral não serve — vira ruído. Use por contexto.' },
  { titulo: 'Ring = status comercial / categoria', body: 'Anel comunica a CATEGORIA (Lead/Prospect/Cliente). Se precisar comunicar outro estado (online), usa badge/chip separado.' },
  { titulo: 'Ring branco em grupo', body: 'AvatarGroup sobrepõe avatares — o ring branco de 2px separa um do outro. Sempre, mesmo quando avatar tá num fundo escuro.' },
  { titulo: 'AvatarGroup máximo 4', body: 'Mais que isso vira ruído. Sempre mostra "+N" pra indicar overflow.' },
  { titulo: 'Imagem + fallback, sempre', body: 'Se tem src, mostra. Se falha (404, lento), cai pras iniciais automaticamente — sem flash de "erro".' },
  { titulo: 'Blocked tira a cor', body: 'Avatar bloqueado fica grayscale + opacity. Comunica "indisponível" sem mostrar X — visual mais limpo.' },
  { titulo: 'onClick vira popover trigger', body: 'Avatar clicável (cursor pointer) é o pattern de "hub de ações do cliente" — abrir status, qualificação, contatos.' },
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
      <div style={{ fontSize: 14, fontWeight: 700, marginTop: 4, color: 'var(--color-text-primary)' }}>{valor}</div>
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

export default function PaginaAvatar() {
  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 8 }}>
        <Eyebrow>Átomos · 07</Eyebrow>
        <Selo estado="em-revisao" />
      </div>
      <h1 className="ds-text-h1" style={{ margin: 0 }}>Avatar</h1>
      <div style={{ marginTop: 12, marginBottom: 40 }}>
        <P muted>
          Último átomo. Iniciais com cor derivada do nome via hash (mesma pessoa = mesma cor).
          Status dot, ring colorido, imagem com fallback automático, AvatarGroup com overflow.
        </P>
      </div>

      {/* Uso real */}
      <Bloco>
        <Eyebrow>Uso real no projeto</Eyebrow>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 'var(--space-3)', marginTop: 'var(--space-3-5)' }}>
          {USO_REAL.map(u => <MetricaCard key={u.label} {...u} />)}
        </div>
        <div style={{ marginTop: 'var(--space-3-5)' }}>
          <CardCallout tone="warning">
            <strong>Hoje:</strong> todos os avatares usam <code>#344848</code> brand-dark — não distingue pessoas em lista de conversas. Status (online/offline) e ring de qualificação comercial não existem.
          </CardCallout>
        </div>
      </Bloco>

      {/* Cor pelo nome */}
      <Bloco>
        <Eyebrow>Cor pelo nome — hash determinístico</Eyebrow>
        <P muted>Mesmo nome = mesma cor. Distingue pessoas instantaneamente em listas de conversas, equipes, comentários.</P>
        <Card>
          <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap', alignItems: 'center' }}>
            {NOMES_EXEMPLO.map(n => (
              <div key={n} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                <Avatar name={n} size="lg" />
                <span style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>{n}</span>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 'var(--space-4)', fontSize: 11, color: 'var(--color-text-muted)' }}>
            8 cores na paleta. Hash do nome → índice. Função em <code>{'iniciaisDe()'}</code> e <code>{'paletaIndex()'}</code> exportadas pra reuso.
          </div>
        </Card>
      </Bloco>

      {/* Sizes */}
      <Bloco>
        <Eyebrow>Sizes — 6 tamanhos canônicos</Eyebrow>
        <Card>
          <div style={{ display: 'flex', gap: 'var(--space-4)', alignItems: 'flex-end', flexWrap: 'wrap' }}>
            {SIZES.map(s => (
              <div key={s.size} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                <Avatar name="Maria Silva" size={s.size} />
                <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--color-text-secondary)' }}>{s.label}</span>
              </div>
            ))}
          </div>
          <div style={{
            marginTop: 'var(--space-5)',
            borderTop: '1px solid var(--color-border-subtle)',
            paddingTop: 'var(--space-3)',
          }}>
            {SIZES.map((s, i) => (
              <div key={s.size} style={{
                display: 'grid', gridTemplateColumns: '60px 100px 1fr', gap: 'var(--space-3)',
                fontSize: 12, padding: '6px 0',
                borderTop: i > 0 ? '1px solid var(--color-border-subtle)' : 'none',
              }}>
                <code style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-text-secondary)' }}>{s.size}</code>
                <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-text-muted)' }}>
                  {s.size === 'xs' ? '24px' : s.size === 'sm' ? '32px' : s.size === 'md' ? '40px' : s.size === 'lg' ? '48px' : s.size === 'xl' ? '64px' : '96px'}
                </span>
                <span style={{ color: 'var(--color-text-secondary)' }}>{s.uso}</span>
              </div>
            ))}
          </div>
        </Card>
      </Bloco>

      {/* Status dot */}
      <Bloco>
        <Eyebrow>Status dot · canto inferior direito</Eyebrow>
        <P muted>Pra chat, atribuição, equipe. Online/Away/Busy/Offline.</P>
        <Card>
          <div style={{ display: 'flex', gap: 'var(--space-4)', alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
              <Avatar name="Joana Silva" size="lg" status="online" />
              <span style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>online</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
              <Avatar name="Pedro Costa" size="lg" status="away" />
              <span style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>away</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
              <Avatar name="Maria Santos" size="lg" status="busy" />
              <span style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>busy</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
              <Avatar name="Ana Mendes" size="lg" status="offline" />
              <span style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>offline</span>
            </div>
          </div>
        </Card>
      </Bloco>

      {/* Ring colorido — status comercial */}
      <Bloco>
        <Eyebrow>Ring · status comercial (Krooa pattern adaptado)</Eyebrow>
        <P muted>Anel externo colorido comunica a CATEGORIA do cliente (Lead/Prospect/Cliente/Bloqueado). User reconhece instantaneamente sem ler o badge.</P>
        <Card>
          <div style={{ display: 'flex', gap: 'var(--space-5)', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
              <Avatar name="Lara Souza" size="lg" ring="warning" />
              <span style={{ fontSize: 11, fontWeight: 600 }}>Lead</span>
              <span style={{ fontSize: 10, color: 'var(--color-text-muted)' }}>âmbar</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
              <Avatar name="Paulo Rodrigues" size="lg" ring="info" />
              <span style={{ fontSize: 11, fontWeight: 600 }}>Prospect</span>
              <span style={{ fontSize: 10, color: 'var(--color-text-muted)' }}>azul</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
              <Avatar name="Carla Lima" size="lg" ring="success" />
              <span style={{ fontSize: 11, fontWeight: 600 }}>Cliente</span>
              <span style={{ fontSize: 10, color: 'var(--color-text-muted)' }}>verde</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
              <Avatar name="Rafael Mota" size="lg" ring="danger" blocked />
              <span style={{ fontSize: 11, fontWeight: 600 }}>Bloqueado</span>
              <span style={{ fontSize: 10, color: 'var(--color-text-muted)' }}>vermelho + grayscale</span>
            </div>
          </div>
          <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 'var(--space-4)' }}>
            <strong>Regra:</strong> cor do anel SEMPRE corresponde ao status comercial. Não usa pra destacar outras coisas (online/offline) — usaria badge/chip separado.
          </div>
        </Card>
      </Bloco>

      {/* Imagem com fallback */}
      <Bloco>
        <Eyebrow>Imagem · com fallback automático</Eyebrow>
        <P muted>Se a imagem carrega, usa. Se falha (404, lento, sem permissão), cai pras iniciais. Sem flash de "erro".</P>
        <Card>
          <div style={{ display: 'flex', gap: 'var(--space-4)', alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
              <Avatar name="Joana Silva" size="lg" src="https://i.pravatar.cc/96?img=5" />
              <span style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>com src válido</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
              <Avatar name="Pedro Costa" size="lg" src="https://imagem-que-nao-existe.com/404.jpg" />
              <span style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>src 404 → fallback iniciais</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
              <Avatar name="Maria Santos" size="lg" />
              <span style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>sem src</span>
            </div>
          </div>
        </Card>
      </Bloco>

      {/* Casos especiais */}
      <Bloco>
        <Eyebrow>Casos especiais</Eyebrow>
        <Card>
          <div style={{ display: 'flex', gap: 'var(--space-4)', alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
              <Avatar name="?" size="lg" />
              <span style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>Nome vazio</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
              <Avatar name="Ana" size="lg" />
              <span style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>1 palavra</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
              <Avatar name="Maria das Dores" size="lg" />
              <span style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>3 palavras</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
              <Avatar name="Carlos" size="lg" blocked />
              <span style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>blocked</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
              <Avatar name="Joana Silva" size="lg" onClick={() => alert('Abriria popover de status / qualificação')} />
              <span style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>clicável (clica!)</span>
            </div>
          </div>
        </Card>
      </Bloco>

      {/* AvatarGroup */}
      <Bloco>
        <Eyebrow>AvatarGroup · sobreposto com overflow</Eyebrow>
        <P muted>Pra listar membros de uma turma, equipe atribuída, ou destinatários. Ring branco entre cada. "+N" pra overflow.</P>
        <Card>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
            <div>
              <div className="ds-text-eyebrow" style={{ color: 'var(--color-text-muted)', marginBottom: 6 }}>3 avatares (sem overflow)</div>
              <AvatarGroup
                size="md"
                avatars={NOMES_EXEMPLO.slice(0, 3).map(name => ({ name }))}
              />
            </div>
            <div>
              <div className="ds-text-eyebrow" style={{ color: 'var(--color-text-muted)', marginBottom: 6 }}>8 avatares, max 4 → mostra "+4"</div>
              <AvatarGroup
                size="md"
                max={4}
                avatars={NOMES_EXEMPLO.map(name => ({ name }))}
              />
            </div>
            <div>
              <div className="ds-text-eyebrow" style={{ color: 'var(--color-text-muted)', marginBottom: 6 }}>Size sm</div>
              <AvatarGroup
                size="sm"
                max={3}
                avatars={NOMES_EXEMPLO.slice(0, 5).map(name => ({ name }))}
              />
            </div>
          </div>
        </Card>
      </Bloco>

      {/* Linha de conversa (pattern composto) */}
      <Bloco>
        <Eyebrow>Pattern · linha de conversa (Mensalli real)</Eyebrow>
        <P muted>Avatar com ring (status comercial) + iniciais (distingue pessoas) + status dot (online) — tudo num lugar.</P>
        <Card>
          {[
            { nome: 'Joana Silva', ring: 'success', status: 'online', preview: 'Pode confirmar 17h então?', tempo: '14:42' },
            { nome: 'Pedro Costa', ring: 'info', status: 'away', preview: 'Vou consultar e te respondo', tempo: '14:15' },
            { nome: 'Maria Santos', ring: 'warning', preview: 'Quero saber sobre o plano anual', tempo: '13:55' },
            { nome: 'Carlos Lima', ring: 'danger', blocked: true, preview: 'Mensagem bloqueada', tempo: 'ontem' },
          ].map((c, i) => (
            <div key={c.nome} style={{
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--space-3)',
              padding: 'var(--space-3) 0',
              borderTop: i > 0 ? '1px solid var(--color-border-subtle)' : 'none',
            }}>
              <Avatar
                name={c.nome}
                size="md"
                ring={c.ring}
                status={c.status}
                blocked={c.blocked}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text-primary)' }}>{c.nome}</div>
                <div style={{ fontSize: 12, color: 'var(--color-text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.preview}</div>
              </div>
              <span style={{ fontSize: 11, color: 'var(--color-text-muted)', flexShrink: 0 }}>{c.tempo}</span>
            </div>
          ))}
        </Card>
      </Bloco>

      {/* Como fica no código */}
      <Bloco>
        <Eyebrow>Como fica no código — refactor real</Eyebrow>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-4)', marginTop: 'var(--space-3-5)' }}>
          <div>
            <div className="ds-text-eyebrow" style={{ color: 'var(--color-text-muted)', marginBottom: 6 }}>
              Hoje (Dashboard.js:363 e similares)
            </div>
            <CodeBlock>{`function iniciais(nome) {
  if (!nome) return '?'
  const p = nome.split(' ')
  return p.length === 1
    ? p[0][0].toUpperCase()
    : (p[0][0] + p[p.length-1][0]).toUpperCase()
}

<div style={{
  width: 40, height: 40,
  borderRadius: '50%',
  backgroundColor: '#344848',  /* sempre igual */
  color: 'white',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: 14,
  fontWeight: 600,
}}>
  {iniciais(cliente.nome)}
</div>`}</CodeBlock>
          </div>
          <div>
            <div className="ds-text-eyebrow" style={{ color: 'var(--mensalli-green-700)', marginBottom: 6 }}>
              Proposta
            </div>
            <CodeBlock tone="proposta">{`<Avatar name={cliente.nome} />

// Com status comercial:
<Avatar
  name={cliente.nome}
  ring={
    cliente.status === 'lead' ? 'warning'
    : cliente.status === 'prospect' ? 'info'
    : 'success'
  }
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
            <li><strong>2 componentes novos:</strong> <code>{'<Avatar>'}</code> e <code>{'<AvatarGroup>'}</code>.</li>
            <li><strong>Cor pelo nome via hash</strong> — distingue pessoas em lista. 8 cores derivadas.</li>
            <li><strong>Ring de status comercial</strong> (warning/info/success/danger) — feature nova pro app, ajuda visualizar funil sem ler badge.</li>
            <li><strong>Status dot</strong> (online/away/busy/offline) — pra ChatArea e atribuição.</li>
            <li><strong>Image fallback automático</strong> — sem flash de "erro" quando src falha.</li>
            <li><strong>Funções utilitárias exportadas</strong>: <code>iniciaisDe(nome)</code> e <code>paletaIndex(nome)</code> pra reuso.</li>
          </ul>
        </CardCallout>
      </Bloco>

      {/* Marco — Átomos completos */}
      <Bloco>
        <Eyebrow>Marco · átomos completos 🎯</Eyebrow>
        <CardCallout tone="info">
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 6 }}>
            7/7 átomos entregues.
          </div>
          <div style={{ fontSize: 13, lineHeight: 1.6 }}>
            Button · Input · Select · Checkbox/Radio · Switch · Badge · Avatar. <br />
            Próxima fase: <strong>Moléculas</strong> — componentes compostos que usam átomos por baixo
            (Card, Modal, Toast, Table, Tabs, Dropdown, Empty State).
          </div>
        </CardCallout>
      </Bloco>
    </div>
  )
}
