import React, { useState } from 'react'
import Switch from './components/Switch'

/* ============================================================
   /app/design-system/switch
   Switch + pattern SettingRow.
   ============================================================ */

const USO_REAL = [
  { label: 'Toggle WhatsApp', valor: 'AgendaCalendario:246', sub: 'Notificar aluno (36×20)' },
  { label: 'Toggle canais', valor: 'WhatsAppConexao', sub: 'Ligar/desligar canal' },
  { label: 'Settings on/off', valor: 'Configuracao', sub: 'múltiplos toggles inline' },
  { label: 'Visual padrão atual', valor: '#16a34a', sub: 'verde + slider branco' },
]

const REGRAS = [
  { titulo: 'Switch vs Checkbox', body: 'Switch = ligar/desligar UMA coisa independente (notificação, IA, dark mode). Checkbox = escolher item de uma lista (tags, permissões).' },
  { titulo: 'Efeito imediato', body: 'Toggle salva na hora. Se precisar de "Salvar", é Checkbox dentro de form. Switch usa-se em settings, preferences, feature flags.' },
  { titulo: 'Sem label = mau cheiro', body: 'Switch sozinho ("um toggle solto") não comunica nada. Sempre tem label imperativa: "Notificar", "Habilitar IA", "Modo escuro".' },
  { titulo: 'Description quando agregar', body: 'Se o nome do toggle não é óbvio ("Modo econômico"), use description explicando o que acontece. Para "Notificações" sozinho não precisa.' },
  { titulo: 'Feedback de erro rápido', body: 'Se a chamada falhar, reverte o toggle visualmente + mostra toast. Nunca deixa o user sem saber se foi.' },
  { titulo: 'labelPosition="left" em settings', body: 'Tela de configurações usa pattern SettingRow: label esquerda, switch direita. Padrão iOS/Android.' },
  { titulo: 'Grupos de switches = sessão', body: 'Vários switches juntos (settings page) agrupa em sessões com header + divider. Não mistura com inputs normais.' },
  { titulo: 'Verde quando ligado, cinza quando desligado', body: 'Cor de sistema (verde marca) só pra "ativo". Desligado fica neutral-300. Não usa vermelho pra OFF — confunde com erro.' },
  { titulo: 'Hover muda o track', body: 'Mouse sobre o label inteiro escurece o track. Garante que o user entende que dá pra clicar no texto também.' },
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
      <div style={{ fontSize: 18, fontWeight: 700, marginTop: 4, color: 'var(--color-text-primary)', fontFamily: 'var(--font-mono)' }}>{valor}</div>
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

export default function PaginaSwitch() {
  const [notif, setNotif] = useState(true)
  const [ia, setIa] = useState(false)
  const [modoEscuro, setModoEscuro] = useState(false)
  const [whatsapp, setWhatsapp] = useState(true)
  const [email, setEmail] = useState(true)
  const [sms, setSms] = useState(false)
  const [autoConfirma, setAutoConfirma] = useState(true)
  const [seguranca, setSeguranca] = useState(false)

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 8 }}>
        <Eyebrow>Átomos · 05</Eyebrow>
        <Selo estado="em-revisao" />
      </div>
      <h1 className="ds-text-h1" style={{ margin: 0 }}>Switch</h1>
      <div style={{ marginTop: 12, marginBottom: 40 }}>
        <P muted>
          Pra LIGAR ou DESLIGAR algo (feature, modo, setting). 3 sizes (sm/md/lg).
          Dimensões md ancoradas no toggle real de AgendaCalendario:246 — 36×20 com slider 16×16.
        </P>
      </div>

      {/* Uso real */}
      <Bloco>
        <Eyebrow>Uso real no projeto</Eyebrow>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 'var(--space-3)', marginTop: 'var(--space-3-5)' }}>
          {USO_REAL.map(u => <MetricaCard key={u.label} {...u} />)}
        </div>
      </Bloco>

      {/* Switch vs Checkbox */}
      <Bloco>
        <Eyebrow>Switch vs Checkbox — quando usar cada</Eyebrow>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-4)', marginTop: 'var(--space-3-5)' }}>
          <Card>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--mensalli-green-700)', marginBottom: 6 }}>Use Switch quando…</div>
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, lineHeight: 1.7, color: 'var(--color-text-secondary)' }}>
              <li>Liga/desliga UMA coisa independente</li>
              <li>Ex.: "Notificações", "Modo escuro", "IA ativa"</li>
              <li>O efeito é imediato (salva sozinho)</li>
              <li>Settings, preferences, feature flags</li>
              <li>Estado binário ligado/desligado, ativo/inativo</li>
            </ul>
            <div style={{ marginTop: 'var(--space-3)' }}>
              <em style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>Teste mental: se você pode dizer "ligar" ou "desligar" algo, é Switch.</em>
            </div>
          </Card>
          <Card>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-text-primary)', marginBottom: 6 }}>Use Checkbox quando…</div>
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, lineHeight: 1.7, color: 'var(--color-text-secondary)' }}>
              <li>Escolhe item de uma LISTA</li>
              <li>Ex.: "Aceito os termos", múltiplos canais de contato</li>
              <li>A seleção é parte de um form que será salvo</li>
              <li>Ficha, preferências dentro de save button</li>
              <li>Estado binário marcado/desmarcado, incluído/não incluído</li>
            </ul>
            <div style={{ marginTop: 'var(--space-3)' }}>
              <em style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>Teste mental: se você pode dizer "marcar" ou "desmarcar" algo de uma lista, é Checkbox.</em>
            </div>
          </Card>
        </div>
      </Bloco>

      {/* Single básico */}
      <Bloco>
        <Eyebrow>Switch · básico (ao vivo)</Eyebrow>
        <Card>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
            <Switch checked={notif} onChange={e => setNotif(e.target.checked)} label="Notificar aluno" />
            <Switch checked={ia} onChange={e => setIa(e.target.checked)} label="Habilitar IA" description="Ativa respostas automáticas no WhatsApp Business" />
            <Switch checked={modoEscuro} onChange={e => setModoEscuro(e.target.checked)} label="Modo escuro" description="Vai chegar em breve" disabled />
          </div>
        </Card>
      </Bloco>

      {/* Sizes */}
      <Bloco>
        <Eyebrow>Sizes — sm (32×18), md (36×20 default), lg (44×24)</Eyebrow>
        <Card>
          <div style={{ display: 'flex', gap: 'var(--space-6)', alignItems: 'center', flexWrap: 'wrap' }}>
            <Switch size="sm" defaultChecked label="Small" />
            <Switch size="md" defaultChecked label="Medium (default)" />
            <Switch size="lg" defaultChecked label="Large" />
          </div>
          <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 'var(--space-3)' }}>
            sm pra toolbar/filtros. md default. lg pra onboarding/mobile.
          </div>
        </Card>
      </Bloco>

      {/* SettingRow pattern */}
      <Bloco>
        <Eyebrow>Pattern · SettingRow (label esquerda, switch direita)</Eyebrow>
        <P muted>Tela de configurações. <code>labelPosition="left"</code> + container com border-top entre rows. Padrão iOS/Android pra configs.</P>
        <Card style={{ marginTop: 'var(--space-4)' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-text-primary)', marginBottom: 'var(--space-3)' }}>
            Canais de notificação
          </div>
          <div>
            <Switch
              labelPosition="left"
              checked={whatsapp}
              onChange={e => setWhatsapp(e.target.checked)}
              label="WhatsApp"
              description="Lembretes e cobranças via Z-API"
              className="ds-setting-row__inline"
              style={{ padding: '14px 0', borderTop: 'none', borderBottom: '1px solid var(--color-border-subtle)' }}
            />
            <Switch
              labelPosition="left"
              checked={email}
              onChange={e => setEmail(e.target.checked)}
              label="E-mail"
              description="Notificações formais e nota fiscal"
              style={{ padding: '14px 0', borderBottom: '1px solid var(--color-border-subtle)' }}
            />
            <Switch
              labelPosition="left"
              checked={sms}
              onChange={e => setSms(e.target.checked)}
              label="SMS"
              description="Confirmações rápidas, custo por mensagem"
              style={{ padding: '14px 0' }}
            />
          </div>
        </Card>

        <Card style={{ marginTop: 'var(--space-4)' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-text-primary)', marginBottom: 'var(--space-3)' }}>
            Avançado
          </div>
          <div>
            <Switch
              labelPosition="left"
              checked={autoConfirma}
              onChange={e => setAutoConfirma(e.target.checked)}
              label="Confirmar presença automaticamente"
              description="Marca como presente se o aluno responder ao lembrete"
              style={{ padding: '14px 0', borderBottom: '1px solid var(--color-border-subtle)' }}
            />
            <Switch
              labelPosition="left"
              checked={seguranca}
              onChange={e => setSeguranca(e.target.checked)}
              label="Autenticação em 2 etapas"
              description="Exige código por SMS no login"
              style={{ padding: '14px 0' }}
            />
          </div>
        </Card>
      </Bloco>

      {/* Como fica no código */}
      <Bloco>
        <Eyebrow>Como fica no código — refactor real</Eyebrow>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-4)', marginTop: 'var(--space-3-5)' }}>
          <div>
            <div className="ds-text-eyebrow" style={{ color: 'var(--color-text-muted)', marginBottom: 6 }}>
              Hoje (AgendaCalendario.js:246-258)
            </div>
            <CodeBlock>{`<div onClick={() => toggle()} style={{
  width: 36,
  height: 20,
  borderRadius: 10,
  backgroundColor: ativo ? '#16a34a' : '#d1d5db',
  position: 'relative',
  cursor: 'pointer',
  transition: 'background 0.2s',
}}>
  <div style={{
    width: 16,
    height: 16,
    borderRadius: '50%',
    background: '#fff',
    position: 'absolute',
    top: 2,
    left: ativo ? 18 : 2,
    transition: 'left 0.2s',
  }} />
</div>`}</CodeBlock>
          </div>
          <div>
            <div className="ds-text-eyebrow" style={{ color: 'var(--mensalli-green-700)', marginBottom: 6 }}>
              Proposta
            </div>
            <CodeBlock tone="proposta">{`<Switch
  checked={ativo}
  onChange={e => toggle(e.target.checked)}
  label="Notificar aluno"
/>`}</CodeBlock>
          </div>
        </div>
        <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 'var(--space-3)' }}>
          18 linhas de inline com estado <code>left</code> calculado manualmente viram 5 linhas. Plus: focus ring keyboard, hover state, a11y (role="switch"), tudo de graça.
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
            <li><strong><code>{'<Switch>'}</code> vira canônico</strong> em <code>design-system/components/Switch.js</code>.</li>
            <li><strong>3 sizes (sm/md/lg)</strong> + dimensões md compatíveis com toggle atual (36×20).</li>
            <li><strong>labelPosition="left" + SettingRow CSS</strong> pra padrão de configurações.</li>
            <li><strong>A11y nativa:</strong> <code>role="switch"</code>, keyboard focus, hover no label inteiro, aria-describedby quando tem description.</li>
            <li><strong>Backward-compat 100%:</strong> nenhum toggle inline atual quebra. Migração gradual.</li>
            <li><strong>Próxima etapa:</strong> Badge (Átomos · 06 — pills/chips/status coloridos).</li>
          </ul>
        </CardCallout>
      </Bloco>
    </div>
  )
}
