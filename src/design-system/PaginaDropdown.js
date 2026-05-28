import React from 'react'
import Dropdown from './components/Dropdown'
import Button from './components/Button'
import Avatar from './components/Avatar'
import { showSuccess } from '../Toast'

/* ============================================================
   /app/design-system/dropdown
   ============================================================ */

const REGRAS = [
  { titulo: 'Action menu = ellipsis vertical', body: '3 dots verticais (mdi:dots-vertical) é o padrão pra ações secundárias em linha de tabela/lista. Universal — usuário reconhece.' },
  { titulo: 'Click outside fecha', body: 'Padrão automático. Esc também fecha. Sem isso, dropdown vira modal não intencional.' },
  { titulo: 'Auto-flip perto da borda', body: 'Se não cabe embaixo, abre em cima. Se não cabe à direita, abre à esquerda. (Próxima versão — TODO)' },
  { titulo: 'Ação destrutiva no final, vermelho', body: 'Excluir, Bloquear, Apagar SEMPRE no fim do menu, cor danger. Separa do resto com Divider.' },
  { titulo: 'Máximo 7 itens', body: 'Mais que isso vira "tela" — considere usar Select ou Modal. Dropdown é pra escolha rápida.' },
  { titulo: 'Tem só 1 ação? Botão direto', body: 'Dropdown com 1 item é overhead visual e de interação. Vira <Button> direto.' },
  { titulo: 'Padding 8×10 nos items', body: 'Compacto mas confortável. Em mobile (tap target), considera size sm com padding maior.' },
  { titulo: 'closeOnSelect=true (default)', body: 'Selecionou um item = menu fecha. Para multi-action menus (raros), passe closeOnSelect={false}.' },
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

export default function PaginaDropdown() {
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 8 }}>
        <Eyebrow>Moléculas · 06</Eyebrow>
        <Selo estado="em-revisao" />
      </div>
      <h1 className="ds-text-h1" style={{ margin: 0 }}>Dropdown</h1>
      <div style={{ marginTop: 12, marginBottom: 40 }}>
        <P muted>
          Menu suspenso com items, divider, grupos. Trigger livre (qualquer botão), click outside + ESC fecham automaticamente.
        </P>
      </div>

      {/* Action menu (3 dots) */}
      <Bloco>
        <Eyebrow>Action menu · 3 dots em linha de tabela</Eyebrow>
        <P muted>Pattern mais comum. Cada linha tem ações secundárias acessíveis pelo "..."</P>
        <Card style={{ marginTop: 'var(--space-4)' }}>
          {[
            { nome: 'Joana Silva', plano: 'Plano anual', status: 'success' },
            { nome: 'Pedro Costa', plano: 'Mensal', status: 'warning' },
            { nome: 'Maria Santos', plano: 'Plano anual', status: 'success' },
          ].map((c, i) => (
            <div key={c.nome} style={{
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--space-3)',
              padding: 'var(--space-3) 0',
              borderTop: i > 0 ? '1px solid var(--color-border-subtle)' : 'none',
            }}>
              <Avatar name={c.nome} size="md" ring={c.status} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 600 }}>{c.nome}</div>
                <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{c.plano}</div>
              </div>
              <Dropdown
                trigger={<Button variant="ghost" size="sm" iconOnly icon="mdi:dots-vertical" aria-label="Ações" />}
                align="end"
              >
                <Dropdown.Item icon="mdi:eye-outline" onClick={() => showSuccess(`Abriu perfil de ${c.nome}`)}>Ver perfil</Dropdown.Item>
                <Dropdown.Item icon="mdi:pencil-outline" onClick={() => showSuccess('Editou')}>Editar</Dropdown.Item>
                <Dropdown.Item icon="mdi:whatsapp" onClick={() => showSuccess('Abriu WhatsApp')}>Mandar mensagem</Dropdown.Item>
                <Dropdown.Divider />
                <Dropdown.Item icon="mdi:archive-outline" onClick={() => showSuccess('Arquivou')}>Arquivar</Dropdown.Item>
                <Dropdown.Item icon="mdi:trash-can-outline" danger onClick={() => showSuccess('Excluído')}>Excluir cliente</Dropdown.Item>
              </Dropdown>
            </div>
          ))}
        </Card>
      </Bloco>

      {/* Button menu */}
      <Bloco>
        <Eyebrow>Button menu · CTA com opções</Eyebrow>
        <P muted>Trigger é um botão de texto (não só ícone). Usado pra "Novo X" com várias opções de tipo.</P>
        <Card style={{ marginTop: 'var(--space-4)' }}>
          <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
            <Dropdown
              trigger={
                <Button variant="primary" iconRight="mdi:chevron-down">
                  Novo
                </Button>
              }
            >
              <Dropdown.Item icon="mdi:account-plus-outline" shortcut="⌘ K">Novo cliente</Dropdown.Item>
              <Dropdown.Item icon="mdi:cash-multiple" shortcut="⌘ N">Cobrança avulsa</Dropdown.Item>
              <Dropdown.Item icon="mdi:account-multiple-plus-outline">Novo lead</Dropdown.Item>
              <Dropdown.Divider />
              <Dropdown.Item icon="mdi:file-import-outline">Importar CSV</Dropdown.Item>
            </Dropdown>

            <Dropdown
              trigger={
                <Button variant="outline" icon="mdi:download" iconRight="mdi:chevron-down">
                  Exportar
                </Button>
              }
              align="start"
            >
              <Dropdown.Group label="Formato">
                <Dropdown.Item icon="mdi:file-document-outline">PDF</Dropdown.Item>
                <Dropdown.Item icon="mdi:file-excel-outline">XLSX</Dropdown.Item>
                <Dropdown.Item icon="mdi:file-delimited-outline">CSV</Dropdown.Item>
              </Dropdown.Group>
            </Dropdown>
          </div>
        </Card>
      </Bloco>

      {/* Avatar trigger */}
      <Bloco>
        <Eyebrow>Avatar trigger · menu de usuário</Eyebrow>
        <P muted>Padrão de header — avatar clicável abre menu de conta.</P>
        <Card style={{ marginTop: 'var(--space-4)' }}>
          <Dropdown
            trigger={<Avatar name="Maria Santos" size="md" ring="success" onClick={() => {}} />}
            width="md"
            align="start"
          >
            <Dropdown.Group label="Maria Santos">
              <Dropdown.Item icon="mdi:account-outline">Meu perfil</Dropdown.Item>
              <Dropdown.Item icon="mdi:cog-outline">Configurações</Dropdown.Item>
              <Dropdown.Item icon="mdi:bell-outline">Notificações</Dropdown.Item>
            </Dropdown.Group>
            <Dropdown.Divider />
            <Dropdown.Item icon="mdi:help-circle-outline">Ajuda</Dropdown.Item>
            <Dropdown.Item icon="mdi:logout" danger>Sair</Dropdown.Item>
          </Dropdown>
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

      <Bloco>
        <Eyebrow>O que muda se aprovar essa seção</Eyebrow>
        <CardCallout tone="success">
          <ul style={{ margin: 0, paddingLeft: 20, lineHeight: 1.7 }}>
            <li><strong><code>{'<Dropdown>'}</code></strong> + <code>Dropdown.Item / Divider / Group</code> em <code>design-system/components/Dropdown.js</code>.</li>
            <li><strong>Última molécula:</strong> Empty State.</li>
          </ul>
        </CardCallout>
      </Bloco>
    </div>
  )
}
