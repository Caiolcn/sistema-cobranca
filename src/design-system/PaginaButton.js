import React, { useState } from 'react'
import Button from './components/Button'

/* ============================================================
   /app/design-system/button — Versão completa
   9 variants × 4 sizes × shape × selected × patterns compostos.
   Ancorada em inventário REAL do código (não inventei nada).
   ============================================================ */

const USO_REAL = [
  { label: '<button> em src/', valor: 530, sub: 'elementos inline hoje' },
  { label: 'onClick handlers', valor: 637, sub: 'inclui clicáveis não-button' },
  { label: 'borderRadius: 50%', valor: 134, sub: 'circulares (FAB, avatar, close)' },
  { label: 'border 2px colorida', valor: 11, sub: 'pattern selected (Presente/Falta)' },
]

const VARIANTS = [
  { variant: 'primary',         uso: 'CTA principal. Uma por tela. Salvar, Criar, Confirmar.', exemplo: 'Salvar' },
  { variant: 'secondary',       uso: 'CTA alternativa importante (brand-dark). Pré-visualizar, Duplicar.', exemplo: 'Pré-visualizar' },
  { variant: 'outline',         uso: 'Ação secundária. Cancelar em modal, Voltar em wizard.', exemplo: 'Cancelar' },
  { variant: 'ghost',           uso: 'Ação terciária sem peso. Ícones de toolbar, close X, ações inline em linha de tabela.', exemplo: 'Editar' },
  { variant: 'gray',            uso: 'Chip/filtro neutro. NÃO é CTA. Filtros toggle, tags selecionáveis.', exemplo: 'Exportar' },
  { variant: 'danger',          uso: 'Destrutiva DEFINITIVA. Confirm de delete em modal, fechar conta.', exemplo: 'Excluir' },
  { variant: 'danger-outline',  uso: 'Delete leve em LINHAS DE TABELA. Fundo branco com border vermelha — discreta mas legível.', exemplo: 'Remover' },
  { variant: 'danger-soft',     uso: 'Destrutiva reversível. Remover tag, Desativar, Limpar filtro.', exemplo: 'Desativar' },
  { variant: 'whatsapp',        uso: 'CTA específico do WhatsApp. Conectar canal, abrir conversa.', exemplo: 'Abrir WhatsApp' },
]

const SIZES = [
  { size: 'xs', altura: 24, font: 12, uso: 'Tabelas densas, ações inline' },
  { size: 'sm', altura: 32, font: 13, uso: 'Toolbar, modais compactos' },
  { size: 'md', altura: 40, font: 14, uso: 'DEFAULT — 76% dos casos', destaque: true },
  { size: 'lg', altura: 48, font: 16, uso: 'CTAs principais, onboarding, mobile' },
]

/* O QUE É e O QUE NÃO É Button — categorização baseada no inventário real */
const NAO_E_BUTTON = [
  { padrao: 'Toggle Switch (WhatsApp on/off)',     onde: 'AgendaCalendario.js, WhatsAppConexao.js', vai: 'Átomo Switch' },
  { padrao: 'Segmented control (Dia/Semana/Mês)',  onde: 'AgendaCalendario.js, AgendaNova*.js',     vai: 'Molécula Tabs (variant=segmented)' },
  { padrao: 'Avatar clicável (popover trigger)',   onde: 'Dashboard.js (header), Clientes.js',       vai: 'Átomo Avatar (com onClick)' },
  { padrao: 'Color swatch picker',                  onde: 'Configuracao.js, Despesas.js, CobrancasAvulsas.js', vai: 'Componente ColorPicker (próprio)' },
  { padrao: 'Badge contador (notificações)',        onde: 'Dashboard.js (sino)',                      vai: 'Átomo Badge' },
  { padrao: 'Accordion collapse',                   onde: 'Configuracao.js',                          vai: 'Molécula Accordion' },
  { padrao: 'Select nativo styled',                 onde: 'Dashboard.js, CRM.js (mobile)',            vai: 'Átomo Select' },
]

const PATTERNS_COMPOSTOS = [
  {
    nome: 'Choice pair',
    onde: 'AgendaPresencaModal.js:142-159 (Presente/Falta)',
    descricao: 'Dois Buttons outline lado a lado, mutuamente exclusivos. Um fica selected="success", outro selected="danger".',
  },
  {
    nome: 'FAB (Floating Action Button)',
    onde: 'Dashboard.js:1350-1375 (Admin shield), mobile create',
    descricao: 'Button shape="circle" elevated iconOnly fixed bottom-right. Usado pra "novo X" em mobile e ações flutuantes de admin.',
  },
  {
    nome: 'Close X de modal',
    onde: 'AgendaPresencaModal.js:123-125, AgendaNovaCriarModal.js:161',
    descricao: 'Button variant="ghost" size="xs" iconOnly com mdi:close. Canto superior direito.',
  },
  {
    nome: 'Back link',
    onde: 'AgendaPresencaModal.js:204-216 (Remover horário do aluno)',
    descricao: 'Button variant="ghost" icon="mdi:chevron-left" ou icon de ação. Texto curto, sem peso.',
  },
  {
    nome: 'Action menu trigger',
    onde: 'Clientes.js (3 dots em linha), Dashboard.js',
    descricao: 'Button variant="ghost" size="sm" iconOnly icon="mdi:dots-vertical" que dispara Dropdown.',
  },
  {
    nome: 'Confirm dinâmico',
    onde: 'AgendaPresencaModal.js:186-195 (Registrar verde/vermelho)',
    descricao: 'Variant muda conforme estado: variant={presente ? "primary" : "danger"}. Mesmo Button, prop dinâmica.',
  },
  {
    nome: 'Booking primary com loading',
    onde: 'PortalCliente.js (Agendar/Entrar na fila)',
    descricao: 'Button variant="primary" loading={agendando} disabled={!disponivel}. Estados existem por default no componente.',
  },
  {
    nome: 'Action group',
    onde: 'Toda modal (Cancelar + Salvar)',
    descricao: 'Container flex justify-end gap-2 com Button outline (Cancelar) + Button primary (Salvar). 2 Buttons compondo.',
  },
  {
    nome: 'Navigation button',
    onde: 'Dashboard cards, resumos, "Ver mais"',
    descricao: 'Button outline/ghost/gray + fullWidth + iconRight="mdi:arrow-right". Pattern de "ver alunos/financeiro/histórico". Largo, com setinha à direita.',
  },
]

const REGRAS = [
  { titulo: 'Um primary por tela', body: 'Se tiver 2+ CTAs com mesma importância, algo está errado. Prioriza ou rebaixa pra outline.' },
  { titulo: 'Label imperativo', body: 'Verbo no infinitivo: "Salvar", "Cancelar", "Confirmar". Nunca "OK", "Click here".' },
  { titulo: 'Ícone à esquerda por padrão', body: 'Exceção: navegação (→ à direita em "Avançar"). icon-only quando o ícone é óbvio pelo contexto.' },
  { titulo: 'Loading preserva dimensão', body: 'Botão NÃO muda de tamanho enquanto carrega. LoadingDots entra no lugar do texto. UX estável.' },
  { titulo: 'icon-only precisa aria-label', body: 'Botão só com ícone, sem texto visível, precisa aria-label="Fechar" pra screen readers.' },
  { titulo: 'danger-outline em LINHA, danger em CONFIRM', body: 'Delete inline em tabela = danger-outline. Confirm em modal "Tem certeza?" = danger sólido.' },
  { titulo: 'selected é exclusivo', body: 'Quando 2+ Buttons formam um par/grupo (Presente/Falta), use selected. Pra 1 botão liga/desliga, prefira Switch.' },
  { titulo: 'FAB = circle + elevated + fixed', body: 'Botão flutuante usa shape="circle" elevated iconOnly. CSS de posicionamento (position fixed) é do pai, não do Button.' },
  { titulo: 'type="button" por default', body: 'Componente já seta type="button" — evita submit acidental em forms. Só sobrescreva quando for REALMENTE submit.' },
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
      <div style={{ fontSize: 28, fontWeight: 700, marginTop: 4, color: 'var(--color-text-primary)' }}>{valor}</div>
      <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 4, lineHeight: 1.4 }}>{sub}</div>
    </div>
  )
}

/* ----- Demos interativos dos patterns compostos ----- */

function DemoChoicePair() {
  const [escolha, setEscolha] = useState('presente')
  return (
    <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
      <Button
        variant="outline"
        selected={escolha === 'presente'}
        selectedTone="success"
        icon="mdi:check-circle"
        onClick={() => setEscolha('presente')}
        fullWidth
      >
        Presente
      </Button>
      <Button
        variant="outline"
        selected={escolha === 'falta'}
        selectedTone="danger"
        icon="mdi:close-circle"
        onClick={() => setEscolha('falta')}
        fullWidth
      >
        Falta
      </Button>
    </div>
  )
}

function DemoFAB() {
  return (
    <div style={{
      position: 'relative',
      height: 180,
      backgroundColor: 'var(--neutral-50)',
      borderRadius: 'var(--radius-lg)',
      border: '1px solid var(--color-border-subtle)',
      overflow: 'hidden',
    }}>
      <div style={{ padding: 'var(--space-4)', fontSize: 11, color: 'var(--color-text-muted)' }}>
        (simula viewport mobile)
      </div>
      <div style={{ position: 'absolute', bottom: 'var(--space-4)', right: 'var(--space-4)' }}>
        <Button
          variant="primary"
          size="lg"
          shape="circle"
          iconOnly
          elevated
          icon="mdi:plus"
          aria-label="Novo cliente"
        />
      </div>
    </div>
  )
}

function DemoCloseX() {
  return (
    <div style={{
      backgroundColor: 'var(--color-bg-surface)',
      border: '1px solid var(--color-border-subtle)',
      borderRadius: 'var(--radius-xl)',
      padding: 'var(--space-5)',
      maxWidth: 380,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-3)' }}>
        <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Registrar Presença</h3>
        <Button variant="ghost" size="xs" shape="circle" iconOnly icon="mdi:close" aria-label="Fechar" />
      </div>
      <div style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>
        Conteúdo do modal aqui…
      </div>
    </div>
  )
}

function DemoActionMenuTrigger() {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: 'var(--space-3) var(--space-4)',
      backgroundColor: 'var(--color-bg-surface)',
      border: '1px solid var(--color-border-subtle)',
      borderRadius: 'var(--radius-lg)',
      maxWidth: 380,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
        <div style={{
          width: 36, height: 36, borderRadius: '50%',
          backgroundColor: 'var(--mensalli-dark-600)',
          color: 'white', fontSize: 13, fontWeight: 600,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>MS</div>
        <div>
          <div style={{ fontSize: 14, fontWeight: 600 }}>Maria Santos</div>
          <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>Cliente desde mai/2024</div>
        </div>
      </div>
      <Button variant="ghost" size="sm" iconOnly icon="mdi:dots-vertical" aria-label="Ações" />
    </div>
  )
}

function DemoActionGroup() {
  return (
    <div style={{
      display: 'flex',
      gap: 'var(--space-2)',
      padding: 'var(--space-4)',
      backgroundColor: 'var(--color-bg-surface)',
      border: '1px solid var(--color-border-subtle)',
      borderRadius: 'var(--radius-lg)',
      justifyContent: 'flex-end',
    }}>
      <Button variant="outline">Cancelar</Button>
      <Button variant="primary">Salvar</Button>
    </div>
  )
}

function DemoNavigationButton() {
  return (
    <div style={{
      backgroundColor: 'var(--color-bg-surface)',
      border: '1px solid var(--color-border-subtle)',
      borderRadius: 'var(--radius-lg)',
      padding: 'var(--space-5)',
      maxWidth: 480,
    }}>
      <div style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginBottom: 'var(--space-3)' }}>
        Resumo de alunos · 24 cadastrados
      </div>
      <Button variant="outline" fullWidth iconRight="mdi:arrow-right">
        Ver alunos
      </Button>
      <div style={{ marginTop: 'var(--space-3)' }}>
        <Button variant="ghost" fullWidth iconRight="mdi:arrow-right">
          Ver financeiro
        </Button>
      </div>
      <div style={{ marginTop: 'var(--space-3)' }}>
        <Button variant="gray" fullWidth iconRight="mdi:arrow-right">
          Ver histórico
        </Button>
      </div>
    </div>
  )
}

function DemoBackLink() {
  return (
    <div style={{
      backgroundColor: 'var(--color-bg-surface)',
      border: '1px solid var(--color-border-subtle)',
      borderRadius: 'var(--radius-lg)',
      padding: 'var(--space-3) var(--space-4)',
      maxWidth: 380,
    }}>
      <Button variant="ghost" size="sm" icon="mdi:chevron-left">
        Voltar para clientes
      </Button>
    </div>
  )
}

function DemoDangerOutlineEmLinha() {
  return (
    <div style={{
      backgroundColor: 'var(--color-bg-surface)',
      border: '1px solid var(--color-border-subtle)',
      borderRadius: 'var(--radius-lg)',
      overflow: 'hidden',
      maxWidth: 480,
    }}>
      {['Joana Lima', 'Pedro Costa', 'Ana Mendes'].map((nome, i) => (
        <div key={nome} style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: 'var(--space-2-5) var(--space-4)',
          borderTop: i > 0 ? '1px solid var(--color-border-subtle)' : 'none',
        }}>
          <span style={{ fontSize: 13 }}>{nome}</span>
          <Button variant="danger-outline" size="xs" icon="mdi:trash-can-outline" iconOnly aria-label={`Remover ${nome}`} />
        </div>
      ))}
    </div>
  )
}

/* ----- Página ----- */

export default function PaginaButton() {
  const [loadingDemo, setLoadingDemo] = useState(false)

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 8 }}>
        <Eyebrow>Átomos · 01</Eyebrow>
        <Selo estado="em-revisao" />
      </div>
      <h1 className="ds-text-h1" style={{ margin: 0 }}>Button</h1>
      <div style={{ marginTop: 12, marginBottom: 40 }}>
        <P muted>
          Primeiro componente real do DS. 9 variants × 4 sizes × shape × selected.
          Props ancoradas em padrões REAIS do Mensalli (Presente/Falta, FAB, danger-outline em listas).
        </P>
      </div>

      {/* Uso real */}
      <Bloco>
        <Eyebrow>Uso real no projeto</Eyebrow>
        <P muted>Inventário sistemático do código — 15+ arquivos lidos, padrões categorizados.</P>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 'var(--space-3)', marginTop: 'var(--space-3-5)' }}>
          {USO_REAL.map(u => <MetricaCard key={u.label} {...u} />)}
        </div>
      </Bloco>

      {/* O que é Button vs o que NÃO é */}
      <Bloco>
        <Eyebrow>Escopo · o que é Button vs o que NÃO é</Eyebrow>
        <P muted>Nem todo elemento clicável é Button. Padrões abaixo APARECEM como botão mas pertencem a outros átomos/moléculas do DS.</P>
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
          {NAO_E_BUTTON.map((p, i) => (
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

      {/* Matriz Variants × Sizes - LIVE */}
      <Bloco>
        <Eyebrow>Proposta · 9 variants × 4 sizes (ao vivo)</Eyebrow>
        <P muted>Cada célula é o <code>{'<Button />'}</code> real rodando.</P>
        <div style={{
          marginTop: 'var(--space-4)',
          border: '1px solid var(--color-border-subtle)',
          borderRadius: 'var(--radius-lg)',
          backgroundColor: 'var(--color-bg-surface)',
          padding: 'var(--space-5)',
          overflowX: 'auto',
        }}>
          <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: '12px 16px' }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left' }} />
                {SIZES.map(s => (
                  <th key={s.size} className="ds-text-eyebrow" style={{ color: 'var(--color-text-muted)', textAlign: 'left' }}>
                    {s.size}{s.destaque && ' ★'}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {VARIANTS.map(v => (
                <tr key={v.variant}>
                  <td style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--color-text-secondary)', whiteSpace: 'nowrap' }}>
                    {v.variant}
                  </td>
                  {SIZES.map(s => (
                    <td key={s.size}>
                      <Button variant={v.variant} size={s.size}>{v.exemplo}</Button>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Bloco>

      {/* Quando usar cada variant */}
      <Bloco>
        <Eyebrow>Quando usar cada variant</Eyebrow>
        <div style={{
          marginTop: 'var(--space-4)',
          border: '1px solid var(--color-border-subtle)',
          borderRadius: 'var(--radius-lg)',
          backgroundColor: 'var(--color-bg-surface)',
          overflow: 'hidden',
        }}>
          {VARIANTS.map((v, i) => (
            <div key={v.variant} style={{
              display: 'grid',
              gridTemplateColumns: '180px 1fr',
              gap: 'var(--space-4)',
              padding: 'var(--space-4) var(--space-5)',
              borderTop: i > 0 ? '1px solid var(--color-border-subtle)' : 'none',
              alignItems: 'center',
            }}>
              <Button variant={v.variant} size="sm">{v.exemplo}</Button>
              <span style={{ fontSize: 13, color: 'var(--color-text-secondary)', lineHeight: 1.55 }}>{v.uso}</span>
            </div>
          ))}
        </div>
      </Bloco>

      {/* Dimensões */}
      <Bloco>
        <Eyebrow>Dimensões canônicas</Eyebrow>
        <div style={{
          marginTop: 'var(--space-4)',
          border: '1px solid var(--color-border-subtle)',
          borderRadius: 'var(--radius-lg)',
          backgroundColor: 'var(--color-bg-surface)',
          overflow: 'hidden',
        }}>
          <div style={{
            display: 'grid',
            gridTemplateColumns: '80px 100px 100px 1fr',
            gap: 'var(--space-4)',
            padding: 'var(--space-3) var(--space-5)',
            backgroundColor: 'var(--neutral-50)',
            borderBottom: '1px solid var(--color-border-subtle)',
          }}>
            {['Size', 'Altura', 'Font', 'Uso'].map(h => (
              <div key={h} className="ds-text-eyebrow" style={{ color: 'var(--color-text-muted)' }}>{h}</div>
            ))}
          </div>
          {SIZES.map((s, i) => (
            <div key={s.size} style={{
              display: 'grid',
              gridTemplateColumns: '80px 100px 100px 1fr',
              gap: 'var(--space-4)',
              padding: 'var(--space-3) var(--space-5)',
              borderTop: i > 0 ? '1px solid var(--color-border-subtle)' : 'none',
              alignItems: 'center',
              backgroundColor: s.destaque ? 'var(--mensalli-green-50)' : 'transparent',
            }}>
              <code style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: s.destaque ? 'var(--mensalli-green-700)' : 'var(--color-text-secondary)' }}>
                {s.size}
              </code>
              <span style={{ fontSize: 12, fontFamily: 'var(--font-mono)' }}>{s.altura}px</span>
              <span style={{ fontSize: 12, fontFamily: 'var(--font-mono)' }}>{s.font}px</span>
              <span style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>
                {s.uso}
                {s.destaque && <strong style={{ color: 'var(--mensalli-green-700)', marginLeft: 8 }}>← DEFAULT</strong>}
              </span>
            </div>
          ))}
        </div>
      </Bloco>

      {/* PATTERNS COMPOSTOS - estrela da página */}
      <Bloco>
        <Eyebrow>Patterns compostos — Button no mundo real do Mensalli</Eyebrow>
        <P muted>Cada pattern abaixo é uma combinação de Button(s) que aparece no código hoje. NÃO são novas variants — são USOS.</P>

        {/* Choice pair */}
        <div style={{ marginTop: 'var(--space-5)' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--space-3)', marginBottom: 'var(--space-2-5)' }}>
            <h3 className="ds-text-h3" style={{ margin: 0 }}>Choice pair · Presente/Falta</h3>
            <code style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--color-text-muted)' }}>AgendaPresencaModal.js:142-159</code>
          </div>
          <P muted>2 Buttons outline com <code>selected</code> mutuamente exclusivo. Substitui o pattern atual de border 2px colorida inline. Clica pra alternar.</P>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-4)', marginTop: 'var(--space-3)' }}>
            <DemoChoicePair />
            <CodeBlock tone="proposta">{`<Button
  variant="outline"
  selected={escolha === 'presente'}
  selectedTone="success"
  icon="mdi:check-circle"
  onClick={() => setEscolha('presente')}
  fullWidth
>
  Presente
</Button>`}</CodeBlock>
          </div>
        </div>

        {/* FAB */}
        <div style={{ marginTop: 'var(--space-8)' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--space-3)', marginBottom: 'var(--space-2-5)' }}>
            <h3 className="ds-text-h3" style={{ margin: 0 }}>FAB · Floating Action Button</h3>
            <code style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--color-text-muted)' }}>Dashboard.js:1350</code>
          </div>
          <P muted>Botão circular flutuante. <code>shape="circle"</code> + <code>elevated</code> + <code>iconOnly</code>. Posicionamento é do container.</P>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-4)', marginTop: 'var(--space-3)' }}>
            <DemoFAB />
            <CodeBlock tone="proposta">{`<div style={{
  position: 'fixed',
  bottom: 24,
  right: 24
}}>
  <Button
    variant="primary"
    size="lg"
    shape="circle"
    iconOnly
    elevated
    icon="mdi:plus"
    aria-label="Novo cliente"
  />
</div>`}</CodeBlock>
          </div>
        </div>

        {/* Close X */}
        <div style={{ marginTop: 'var(--space-8)' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--space-3)', marginBottom: 'var(--space-2-5)' }}>
            <h3 className="ds-text-h3" style={{ margin: 0 }}>Close X de modal</h3>
            <code style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--color-text-muted)' }}>AgendaPresencaModal.js:123</code>
          </div>
          <P muted>Botão X discreto no canto superior direito de modais. <code>ghost</code> + <code>shape="circle"</code> + <code>size="xs"</code>.</P>
          <div style={{ marginTop: 'var(--space-3)' }}>
            <DemoCloseX />
          </div>
        </div>

        {/* Action menu trigger */}
        <div style={{ marginTop: 'var(--space-8)' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--space-3)', marginBottom: 'var(--space-2-5)' }}>
            <h3 className="ds-text-h3" style={{ margin: 0 }}>Action menu trigger (3 dots)</h3>
            <code style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--color-text-muted)' }}>Clientes.js, Dashboard.js</code>
          </div>
          <P muted>Botão de 3 pontinhos que abre Dropdown com ações. <code>ghost</code> + <code>iconOnly</code>.</P>
          <div style={{ marginTop: 'var(--space-3)' }}>
            <DemoActionMenuTrigger />
          </div>
        </div>

        {/* Danger outline em linha */}
        <div style={{ marginTop: 'var(--space-8)' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--space-3)', marginBottom: 'var(--space-2-5)' }}>
            <h3 className="ds-text-h3" style={{ margin: 0 }}>Danger-outline em linha de tabela</h3>
            <code style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--color-text-muted)' }}>AgendaPresencaModal.js:173</code>
          </div>
          <P muted>Botão de excluir DISCRETO em listas. Fundo branco + border vermelha clara — visível mas não agressivo. Em modal de confirmação, usar <code>danger</code> sólido.</P>
          <div style={{ marginTop: 'var(--space-3)' }}>
            <DemoDangerOutlineEmLinha />
          </div>
        </div>

        {/* Back link */}
        <div style={{ marginTop: 'var(--space-8)' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--space-3)', marginBottom: 'var(--space-2-5)' }}>
            <h3 className="ds-text-h3" style={{ margin: 0 }}>Back link</h3>
          </div>
          <P muted>Navegação de volta com ícone à esquerda. <code>ghost</code> + <code>size="sm"</code>.</P>
          <div style={{ marginTop: 'var(--space-3)' }}>
            <DemoBackLink />
          </div>
        </div>

        {/* Action group */}
        <div style={{ marginTop: 'var(--space-8)' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--space-3)', marginBottom: 'var(--space-2-5)' }}>
            <h3 className="ds-text-h3" style={{ margin: 0 }}>Action group (Cancelar + Salvar)</h3>
          </div>
          <P muted>Footer padrão de modais. Outline à esquerda, primary à direita. Gap 8px.</P>
          <div style={{ marginTop: 'var(--space-3)' }}>
            <DemoActionGroup />
          </div>
        </div>

        {/* Navigation button — "Ver alunos →" */}
        <div style={{ marginTop: 'var(--space-8)' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--space-3)', marginBottom: 'var(--space-2-5)' }}>
            <h3 className="ds-text-h3" style={{ margin: 0 }}>Navigation button · "Ver alunos →"</h3>
          </div>
          <P muted>
            Botão alongado de navegação. Indica "ir pra outra tela / ver mais detalhes". Não compete com CTAs primários porque usa <code>outline</code>/<code>ghost</code>/<code>gray</code> + <code>fullWidth</code> + <code>iconRight="mdi:arrow-right"</code>.
          </P>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-4)', marginTop: 'var(--space-3)' }}>
            <DemoNavigationButton />
            <CodeBlock tone="proposta">{`<Button
  variant="outline"   // ou ghost / gray
  fullWidth
  iconRight="mdi:arrow-right"
>
  Ver alunos
</Button>

/* Padrão pra:
   - "Ver alunos →"
   - "Ver financeiro →"
   - "Ver histórico →"
   - "Saber mais →" */`}</CodeBlock>
          </div>
        </div>
      </Bloco>

      {/* Lista completa de patterns compostos */}
      <Bloco>
        <Eyebrow>Catálogo de patterns compostos</Eyebrow>
        <P muted>Cada combinação prática de Button(s) usada no código hoje.</P>
        <div style={{
          marginTop: 'var(--space-4)',
          border: '1px solid var(--color-border-subtle)',
          borderRadius: 'var(--radius-lg)',
          backgroundColor: 'var(--color-bg-surface)',
          overflow: 'hidden',
        }}>
          {PATTERNS_COMPOSTOS.map((p, i) => (
            <div key={p.nome} style={{
              padding: 'var(--space-4) var(--space-5)',
              borderTop: i > 0 ? '1px solid var(--color-border-subtle)' : 'none',
            }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--space-3)', marginBottom: 4 }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--color-text-primary)' }}>{p.nome}</span>
                <code style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--color-text-muted)' }}>{p.onde}</code>
              </div>
              <div style={{ fontSize: 13, color: 'var(--color-text-secondary)', lineHeight: 1.55 }}>{p.descricao}</div>
            </div>
          ))}
        </div>
      </Bloco>

      {/* Com ícones */}
      <Bloco>
        <Eyebrow>Com ícones</Eyebrow>
        <P muted>Usa iconify — mesmo system que o resto do app. <code>icon</code> aceita string ou ReactNode.</P>
        <div style={{ display: 'flex', gap: 'var(--space-3)', marginTop: 'var(--space-4)', flexWrap: 'wrap', alignItems: 'center' }}>
          <Button variant="primary" icon="mdi:plus">Novo cliente</Button>
          <Button variant="outline" iconRight="mdi:arrow-right">Avançar</Button>
          <Button variant="ghost" icon="mdi:filter-variant" iconOnly aria-label="Filtrar" />
          <Button variant="danger" icon="mdi:trash-can-outline">Remover</Button>
          <Button variant="whatsapp" icon="mdi:whatsapp">Abrir WhatsApp</Button>
        </div>
      </Bloco>

      {/* Estados */}
      <Bloco>
        <Eyebrow>Estados — clica pra ver loading</Eyebrow>
        <div style={{ display: 'flex', gap: 'var(--space-3)', marginTop: 'var(--space-4)', flexWrap: 'wrap', alignItems: 'center' }}>
          <Button variant="primary">Default</Button>
          <Button variant="primary" disabled>Disabled</Button>
          <Button
            variant="primary"
            loading={loadingDemo}
            onClick={() => {
              setLoadingDemo(true)
              setTimeout(() => setLoadingDemo(false), 2000)
            }}
          >
            {loadingDemo ? 'Salvando…' : 'Clica pra carregar'}
          </Button>
          <Button variant="outline" tabIndex={0}>Foca em mim (Tab)</Button>
        </div>
        <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 'var(--space-3)' }}>
          Loading preserva dimensão. Focus ring verde aparece com Tab.
        </div>
      </Bloco>

      {/* Como fica no código (Presente/Falta - exemplo real) */}
      <Bloco>
        <Eyebrow>Como fica no código · exemplo Presente/Falta</Eyebrow>
        <P muted>Real refactor do AgendaPresencaModal — de inline pra componente.</P>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-4)', marginTop: 'var(--space-3-5)' }}>
          <div>
            <div className="ds-text-eyebrow" style={{ color: 'var(--color-text-muted)', marginBottom: 6 }}>
              Hoje (AgendaPresencaModal.js:142-159)
            </div>
            <CodeBlock>{`<button onClick={() => setPresente(true)} style={{
  flex: 1, padding: '12px',
  borderRadius: '10px', cursor: 'pointer',
  backgroundColor: presente ? '#f0fdf4' : 'white',
  border: presente
    ? '2px solid #16a34a'
    : '1px solid #e5e7eb',
  fontSize: '14px', fontWeight: '600',
  color: presente ? '#16a34a' : '#666',
  display: 'flex', alignItems: 'center',
  justifyContent: 'center', gap: '6px'
}}>
  <Icon icon="mdi:check-circle" width="20" />
  Presente
</button>`}</CodeBlock>
          </div>
          <div>
            <div className="ds-text-eyebrow" style={{ color: 'var(--mensalli-green-700)', marginBottom: 6 }}>
              Proposta
            </div>
            <CodeBlock tone="proposta">{`<Button
  variant="outline"
  selected={presente === true}
  selectedTone="success"
  icon="mdi:check-circle"
  onClick={() => setPresente(true)}
  fullWidth
>
  Presente
</Button>`}</CodeBlock>
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
            <li><strong>9 variants × 4 sizes</strong> + 5 props (<code>selected</code>, <code>selectedTone</code>, <code>shape</code>, <code>elevated</code>, <code>loading</code>) cobrem 17 padrões visuais distintos do código atual.</li>
            <li><strong>8 patterns compostos documentados</strong>: Choice pair, FAB, Close X, Back link, Action menu trigger, Confirm dinâmico, Booking primary, Action group.</li>
            <li><strong>7 padrões classificados como "não-Button"</strong> → vão pra Switch, Tabs, Avatar, Badge, Select, Accordion, ColorPicker.</li>
            <li><strong>Backward-compat 100%:</strong> nenhum <code>{'<button>'}</code> inline atual quebra. Migração é gradual.</li>
            <li><strong>Próxima etapa:</strong> Input (já é canônico no projeto — só formalizar e propor SearchInput).</li>
          </ul>
        </CardCallout>
      </Bloco>
    </div>
  )
}
