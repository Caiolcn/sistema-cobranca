import React from 'react'
import ClienteIdentity from './components/ClienteIdentity'
import Card from './components/Card'
import Button from './components/Button'

function Selo({ estado = 'em-revisao' }) {
  const c = { 'em-revisao': { bg: 'var(--warning-50)', cor: 'var(--warning-700)', label: 'Em revisão' } }[estado]
  return <span style={{ backgroundColor: c.bg, color: c.cor, fontSize: 11, fontWeight: 600, padding: '4px 10px', borderRadius: 999 }}>{c.label}</span>
}
function Eyebrow({ children }) { return <div className="ds-text-eyebrow" style={{ color: 'var(--color-text-muted)', marginBottom: 8 }}>{children}</div> }
function P({ children, muted }) { return <p className="ds-text-body" style={{ margin: 0, color: muted ? 'var(--color-text-secondary)' : 'var(--color-text-primary)' }}>{children}</p> }
function Bloco({ children, style }) { return <section style={{ marginBottom: 56, ...style }}>{children}</section> }
function CardCallout({ tone = 'success', children }) {
  const bg = { neutral: 'var(--neutral-100)', warning: 'var(--warning-50)', success: 'var(--mensalli-green-50)', info: 'var(--info-50)' }[tone]
  const border = { neutral: 'var(--neutral-200)', warning: '#FFE0B2', success: 'var(--mensalli-green-200)', info: '#BBDEFB' }[tone]
  return <div style={{ backgroundColor: bg, border: `1px solid ${border}`, borderRadius: 'var(--radius-lg)', padding: 'var(--space-3-5) var(--space-5)', fontSize: 13, lineHeight: 1.55 }}>{children}</div>
}

const CLIENTES_DEMO = [
  { nome: 'Joana Silva',        status: 'cliente',   telefone: '+55 11 99999-1111', tags: ['VIP', 'Plano anual'] },
  { nome: 'Pedro Costa',        status: 'prospect',  telefone: '+55 11 99999-2222', tags: ['Origem: Indicação'] },
  { nome: 'Maria Santos',       status: 'lead',      telefone: '+55 11 99999-3333', tags: ['Origem: Instagram'] },
  { nome: 'João Pereira',       status: 'cliente',   telefone: '+55 11 99999-4444', tags: ['Em dia'] },
  { nome: 'Carlos Lima Bloqueado', status: 'bloqueado', telefone: '+55 11 99999-5555', tags: [], blocked: true },
]

export default function PaginaClienteIdentity() {
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 8 }}>
        <Eyebrow>Padrões Mensalli · 01</Eyebrow>
        <Selo />
      </div>
      <h1 className="ds-text-h1" style={{ margin: 0 }}>ClienteIdentity</h1>
      <div style={{ marginTop: 12, marginBottom: 40 }}>
        <P muted>
          Bloco visual canônico pra identificar cliente/aluno. Avatar + nome + status comercial (ring) + tags — tudo num só componente.
          3 layouts pela INTENÇÃO da tela.
        </P>
      </div>

      <Bloco>
        <Eyebrow>3 layouts pela intenção</Eyebrow>
        <P muted>Mesma identidade, organização diferente conforme o espaço e o foco da tela.</P>
      </Bloco>

      {/* COMPACT */}
      <Bloco>
        <Eyebrow>layout="compact" · 1 linha (tabela de clientes)</Eyebrow>
        <Card>
          {CLIENTES_DEMO.map((c, i) => (
            <div key={c.nome} style={{ padding: 'var(--space-2-5) 0', borderTop: i > 0 ? '1px solid var(--color-border-subtle)' : 'none' }}>
              <ClienteIdentity cliente={c} layout="compact" />
            </div>
          ))}
        </Card>
      </Bloco>

      {/* STACKED */}
      <Bloco>
        <Eyebrow>layout="stacked" · header de página/modal</Eyebrow>
        <Card>
          <ClienteIdentity
            cliente={{
              nome: 'Maria Santos',
              status: 'cliente',
              telefone: '+55 11 99999-1234',
              tags: ['VIP', 'Plano anual', 'Em dia'],
            }}
            layout="stacked"
            actions={<Button variant="outline" size="sm">Editar</Button>}
          />
        </Card>
        <div style={{ marginTop: 'var(--space-3)' }}>
          <Card>
            <ClienteIdentity
              cliente={{ nome: 'Lara Souza', status: 'lead', telefone: '+55 11 98765-4321', tags: ['Origem: Indicação', 'Aguardando resposta'] }}
              layout="stacked"
              actions={<Button variant="primary" size="sm" icon="mdi:whatsapp">Mandar mensagem</Button>}
            />
          </Card>
        </div>
      </Bloco>

      {/* CONTACT FOCUS */}
      <Bloco>
        <Eyebrow>layout="contact-focus" · chat / atendimento</Eyebrow>
        <P muted>Telefone em destaque. Usado em ChatArea, lista de conversas, comunicação.</P>
        <Card>
          {[
            { nome: 'Ana Mendes',  status: 'prospect',  telefone: '+55 21 97765-5544', tags: ['Primeira mensagem hoje', 'Interessada'] },
            { nome: 'Fred Lisboa', status: 'lead',      telefone: '+55 21 98765-4321', tags: ['Reassuntar'] },
          ].map((c, i) => (
            <div key={c.nome} style={{ padding: 'var(--space-3) 0', borderTop: i > 0 ? '1px solid var(--color-border-subtle)' : 'none' }}>
              <ClienteIdentity cliente={c} layout="contact-focus" />
            </div>
          ))}
        </Card>
      </Bloco>

      <Bloco>
        <CardCallout>
          <strong><code>{'<ClienteIdentity>'}</code></strong> usa Avatar (hash de cor + ring + status dot) + Badge (tags coloridas) internamente. Substitui o padrão atual de render manual de avatar + nome + tags espalhado em 15+ lugares.
        </CardCallout>
      </Bloco>
    </div>
  )
}
