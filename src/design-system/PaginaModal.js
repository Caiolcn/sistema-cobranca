import React, { useState } from 'react'
import Modal, { ConfirmDialog } from './components/Modal'
import Button from './components/Button'
import Input from './components/Input'
import Select from './components/Select'
import Badge from './components/Badge'
import Avatar from './components/Avatar'

/* ============================================================
   /app/design-system/modal
   Modal + ConfirmDialog + Aside.
   ============================================================ */

const SIZES = [
  { size: 'sm', max: '400px', uso: 'Confirm, alerta de 1 frase' },
  { size: 'md', max: '560px', uso: 'DEFAULT — form 4-6 campos' },
  { size: 'lg', max: '800px', uso: 'Form longo, preview pequeno' },
  { size: 'xl', max: '1024px', uso: 'Dashboards, comparações' },
  { size: 'fullscreen', max: '95vw', uso: 'Wizards complexos, CSV import' },
]

const FEATURES = [
  { titulo: 'Portal', body: 'Renderizado direto no body — z-index não depende da hierarquia do componente pai.' },
  { titulo: 'Focus trap', body: 'Tab/Shift+Tab cicla SÓ dentro do modal. User não escapa pra a página atrás sem fechar.' },
  { titulo: 'ESC fecha', body: 'Tecla Escape dispara onClose. closeOnEsc={false} desabilita em casos críticos (form com unsaved changes).' },
  { titulo: 'Click backdrop fecha', body: 'Clica fora do painel = fecha. closeOnBackdrop={false} pra "Sticky modal" (Krooa pattern — unsaved changes).' },
  { titulo: 'Scroll lock', body: 'Quando modal abre, body ganha overflow:hidden. Página atrás não scrolla acidentalmente.' },
  { titulo: 'Focus restoration', body: 'Ao fechar, foco volta pro elemento que abriu o modal. Acessibilidade obrigatória.' },
  { titulo: 'Aria-modal + labelledby', body: 'role="dialog" + aria-modal="true" + aria-labelledby aponta pro título. Screen reader anuncia direito.' },
  { titulo: 'Animação ds-slide-in-bottom', body: 'Modal entra com 300ms slide-up + fade. Aside entra com slide-right. Tokens do nosso Motion.' },
  { titulo: 'Auto-header se title', body: 'Passou title? Modal monta o header com X automático. Quer custom? hideHeader + Modal.Header manual.' },
]

const REGRAS = [
  { titulo: 'Modal só pra interromper', body: 'Se user pode continuar trabalhando, use Aside (lateral). Modal é quando ele PRECISA terminar antes.' },
  { titulo: 'Size pelo conteúdo', body: 'Escolhe pelo conteúdo, não pela estética. md vazio é ruim. sm cheio é apertado. Forma simples → sm.' },
  { titulo: 'Título imperativo', body: '"Confirmação de exclusão" → "Excluir cliente?". Pergunta direta da ação clara.' },
  { titulo: 'Botões em lados opostos', body: 'Footer com justify-between → Cancelar (outline) à esquerda, Confirm (primary/danger) à direita. Respira melhor.' },
  { titulo: 'Esc + backdrop fecham', body: 'User esperto isso. Desabilita só quando há perda de dados (closeOnBackdrop={false}).' },
  { titulo: 'Confirm destrutivo = danger', body: 'Excluir, apagar, cancelar conta usam variant="danger" + ícone vermelho. Reforça a gravidade.' },
  { titulo: 'Loading na confirmação', body: 'Quando o user confirma e a chamada async roda, ConfirmDialog tem loading={true} — botão vira LoadingDots, backdrop fica trancado.' },
  { titulo: 'Aside pra fluxos paralelos', body: 'Editar tag enquanto vê a lista, comparar planos, ver detalhes do cliente. Aside mantém contexto, modal interrompe.' },
  { titulo: '1 modal por vez', body: 'Modal abrindo outro modal é mau cheiro. Reconsidera o fluxo — quase sempre dá pra unificar ou virar wizard.' },
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

export default function PaginaModal() {
  const [openSize, setOpenSize] = useState(null)  // qual size está aberto
  const [openCustom, setOpenCustom] = useState(false)
  const [openAside, setOpenAside] = useState(false)
  const [openConfirmDanger, setOpenConfirmDanger] = useState(false)
  const [openConfirmWarning, setOpenConfirmWarning] = useState(false)
  const [openConfirmInfo, setOpenConfirmInfo] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  function handleConfirmDelete() {
    setConfirmingDelete(true)
    setTimeout(() => {
      setConfirmingDelete(false)
      setOpenConfirmDanger(false)
    }, 1500)
  }

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 8 }}>
        <Eyebrow>Moléculas · 02</Eyebrow>
        <Selo estado="em-revisao" />
      </div>
      <h1 className="ds-text-h1" style={{ margin: 0 }}>Modal</h1>
      <div style={{ marginTop: 12, marginBottom: 40 }}>
        <P muted>
          Modal central (sm/md/lg/xl/fullscreen), Aside (drawer lateral) e ConfirmDialog preset.
          Portal, focus trap, scroll lock, ESC, click-outside — tudo automático.
        </P>
      </div>

      {/* 5 sizes ao vivo */}
      <Bloco>
        <Eyebrow>5 sizes · clica pra abrir</Eyebrow>
        <Card>
          <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
            {SIZES.map(s => (
              <Button key={s.size} variant="outline" size="sm" onClick={() => setOpenSize(s.size)}>
                Abrir {s.size}
              </Button>
            ))}
          </div>
          <div style={{ marginTop: 'var(--space-4)' }}>
            <div style={{
              border: '1px solid var(--color-border-subtle)',
              borderRadius: 'var(--radius-lg)',
              overflow: 'hidden',
            }}>
              {SIZES.map((s, i) => (
                <div key={s.size} style={{
                  display: 'grid',
                  gridTemplateColumns: '120px 120px 1fr',
                  gap: 'var(--space-4)',
                  padding: 'var(--space-3) var(--space-5)',
                  borderTop: i > 0 ? '1px solid var(--color-border-subtle)' : 'none',
                  fontSize: 12,
                  alignItems: 'center',
                }}>
                  <code style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-text-secondary)' }}>{s.size}</code>
                  <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-text-muted)' }}>{s.max}</span>
                  <span style={{ color: 'var(--color-text-secondary)' }}>{s.uso}</span>
                </div>
              ))}
            </div>
          </div>
        </Card>

        {/* Modais size — todos renderizados aqui pra abrir conforme botão */}
        {SIZES.map(s => (
          <Modal
            key={s.size}
            isOpen={openSize === s.size}
            onClose={() => setOpenSize(null)}
            title={`Modal size="${s.size}"`}
            subtitle={`Max-width: ${s.max} · ${s.uso}`}
            size={s.size}
          >
            <Modal.Body>
              <P>
                Este modal é <code>size="{s.size}"</code> ({s.max}). Use Tab pra navegar entre os botões — note que o foco fica preso dentro do modal (Shift+Tab no Cancelar volta pro X).
              </P>
              <P muted>{s.uso}.</P>
            </Modal.Body>
            <Modal.Footer align="between">
              <Button variant="outline" onClick={() => setOpenSize(null)}>Cancelar</Button>
              <Button variant="primary" onClick={() => setOpenSize(null)}>OK, entendi</Button>
            </Modal.Footer>
          </Modal>
        ))}
      </Bloco>

      {/* Modal com conteúdo real */}
      <Bloco>
        <Eyebrow>Modal com form real</Eyebrow>
        <P muted>Exemplo de form de criar cobrança — Input, Select, Footer com ações.</P>
        <Card style={{ marginTop: 'var(--space-3-5)' }}>
          <Button variant="primary" icon="mdi:plus" onClick={() => setOpenCustom(true)}>
            Nova cobrança avulsa
          </Button>
        </Card>

        <Modal
          isOpen={openCustom}
          onClose={() => setOpenCustom(false)}
          title="Nova cobrança avulsa"
          subtitle="Será enviada via WhatsApp em até 5 minutos"
          size="md"
        >
          <Modal.Body>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
              <Select
                label="Cliente"
                required
                placeholder="Selecionar..."
                searchable
                options={[
                  { value: '1', label: 'Joana Silva' },
                  { value: '2', label: 'Pedro Costa' },
                  { value: '3', label: 'Maria Santos' },
                ]}
              />
              <Input
                label="Valor"
                required
                prefix="R$"
                placeholder="0,00"
              />
              <Input
                label="Descrição"
                placeholder="Ex: Aula avulsa de quinta"
                helper="Aparece no recibo do cliente"
              />
              <Select
                label="Vencimento"
                placeholder="Hoje"
                options={[
                  { value: 'hoje', label: 'Hoje' },
                  { value: 'amanha', label: 'Amanhã' },
                  { value: '7d', label: 'Em 7 dias' },
                ]}
              />
            </div>
          </Modal.Body>
          <Modal.Footer align="between">
            <Button variant="outline" onClick={() => setOpenCustom(false)}>Cancelar</Button>
            <Button variant="primary" icon="mdi:whatsapp" onClick={() => setOpenCustom(false)}>
              Criar e enviar
            </Button>
          </Modal.Footer>
        </Modal>
      </Bloco>

      {/* Aside */}
      <Bloco>
        <Eyebrow>Aside · drawer lateral direito</Eyebrow>
        <P muted>Quando user pode continuar vendo a lista enquanto edita um item. Slide horizontal da direita.</P>
        <Card style={{ marginTop: 'var(--space-3-5)' }}>
          <Button variant="outline" icon="mdi:account-edit-outline" onClick={() => setOpenAside(true)}>
            Ver detalhes do cliente
          </Button>
        </Card>

        <Modal
          isOpen={openAside}
          onClose={() => setOpenAside(false)}
          title="Maria Santos"
          subtitle="Cliente desde mai/2024"
          position="aside"
          size="md"
        >
          <Modal.Body>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', marginBottom: 'var(--space-5)' }}>
              <Avatar name="Maria Santos" size="lg" ring="success" />
              <div>
                <div style={{ fontSize: 14, fontWeight: 600 }}>Maria Santos</div>
                <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 2 }}>
                  <Badge variant="primary" size="xs">VIP</Badge>
                  {' '}
                  <Badge variant="success" size="xs" dot>Em dia</Badge>
                </div>
              </div>
            </div>
            <Eyebrow>Dados de cobrança</Eyebrow>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
              <Input label="Telefone" defaultValue="+55 11 99999-1234" />
              <Input label="Mensalidade" prefix="R$" defaultValue="150,00" />
              <Input label="Dia de vencimento" defaultValue="15" suffix="de cada mês" />
            </div>
          </Modal.Body>
          <Modal.Footer align="between">
            <Button variant="danger-outline" onClick={() => setOpenAside(false)}>Bloquear</Button>
            <span style={{ display: 'flex', gap: 8 }}>
              <Button variant="outline" onClick={() => setOpenAside(false)}>Cancelar</Button>
              <Button variant="primary" onClick={() => setOpenAside(false)}>Salvar</Button>
            </span>
          </Modal.Footer>
        </Modal>
      </Bloco>

      {/* ConfirmDialog */}
      <Bloco>
        <Eyebrow>ConfirmDialog · preset pra confirmações</Eyebrow>
        <P muted>Substitui o pattern de ConfirmModal.js do projeto. 4 variants (danger/warning/info/success) com ícone central + cor.</P>
        <Card style={{ marginTop: 'var(--space-3-5)' }}>
          <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
            <Button variant="danger" icon="mdi:trash-can-outline" onClick={() => setOpenConfirmDanger(true)}>
              Excluir (com loading)
            </Button>
            <Button variant="primary" icon="mdi:alert" onClick={() => setOpenConfirmWarning(true)}>
              Warning
            </Button>
            <Button variant="outline" icon="mdi:information" onClick={() => setOpenConfirmInfo(true)}>
              Info
            </Button>
          </div>
        </Card>

        <ConfirmDialog
          isOpen={openConfirmDanger}
          onClose={() => !confirmingDelete && setOpenConfirmDanger(false)}
          onConfirm={handleConfirmDelete}
          loading={confirmingDelete}
          variant="danger"
          title="Excluir cliente?"
          description="Maria Santos e todo o histórico de cobranças serão removidos. Esta ação não pode ser desfeita."
          confirmLabel="Excluir cliente"
          cancelLabel="Cancelar"
        />

        <ConfirmDialog
          isOpen={openConfirmWarning}
          onClose={() => setOpenConfirmWarning(false)}
          onConfirm={() => setOpenConfirmWarning(false)}
          variant="warning"
          title="Você tem alterações não salvas"
          description="Se sair agora, vai perder as mudanças feitas no formulário."
          confirmLabel="Sair sem salvar"
          cancelLabel="Continuar editando"
        />

        <ConfirmDialog
          isOpen={openConfirmInfo}
          onClose={() => setOpenConfirmInfo(false)}
          onConfirm={() => setOpenConfirmInfo(false)}
          variant="info"
          title="Habilitar IA neste canal?"
          description="A IA vai responder mensagens automaticamente seguindo o tom configurado nas preferências. Você pode desativar a qualquer momento."
          confirmLabel="Habilitar"
        />
      </Bloco>

      {/* Features sob o capô */}
      <Bloco>
        <Eyebrow>Features automáticas</Eyebrow>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 'var(--space-3)', marginTop: 'var(--space-3-5)' }}>
          {FEATURES.map(f => (
            <RegraCard key={f.titulo} titulo={f.titulo}>{f.body}</RegraCard>
          ))}
        </div>
      </Bloco>

      {/* Como fica no código */}
      <Bloco>
        <Eyebrow>Como fica no código — refactor real</Eyebrow>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-4)', marginTop: 'var(--space-3-5)' }}>
          <div>
            <div className="ds-text-eyebrow" style={{ color: 'var(--color-text-muted)', marginBottom: 6 }}>
              Hoje (AgendaPresencaModal.js)
            </div>
            <CodeBlock>{`{isOpen && (
  <div style={{
    position: 'fixed', inset: 0,
    background: 'rgba(0,0,0,0.5)',
    zIndex: 1000,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  }} onClick={onClose}>
    <div style={{
      width: '100%', maxWidth: 380,
      background: 'white',
      borderRadius: 16, padding: 24,
    }} onClick={e => e.stopPropagation()}>
      <h3>Registrar Presença</h3>
      <button onClick={onClose}>X</button>
      {/* ... 60+ linhas */}
    </div>
  </div>
)}`}</CodeBlock>
          </div>
          <div>
            <div className="ds-text-eyebrow" style={{ color: 'var(--mensalli-green-700)', marginBottom: 6 }}>
              Proposta
            </div>
            <CodeBlock tone="proposta">{`<Modal
  isOpen={isOpen}
  onClose={onClose}
  title="Registrar Presença"
  size="sm"
>
  <Modal.Body>...</Modal.Body>
  <Modal.Footer align="between">
    <Button variant="outline" onClick={onClose}>
      Cancelar
    </Button>
    <Button variant="primary" onClick={salvar}>
      Registrar
    </Button>
  </Modal.Footer>
</Modal>

/* De graça: ESC, click-outside, focus trap,
   scroll lock, portal, a11y, animação */`}</CodeBlock>
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
            <li><strong><code>{'<Modal>'}</code> + <code>{'<ConfirmDialog>'}</code></strong> em <code>design-system/components/Modal.js</code>.</li>
            <li><strong>10+ modais inline</strong> do projeto (AgendaPresencaModal, AgendaNovaCriarModal, CsvImportModal, etc) têm caminho de migração.</li>
            <li><strong>De graça:</strong> portal, focus trap, scroll lock, ESC, click-backdrop, a11y completa, animação, restore foco.</li>
            <li><strong>ConfirmModal.js</strong> existente pode virar wrapper fino sobre ConfirmDialog do DS.</li>
            <li><strong>Próxima etapa:</strong> Toast (Moléculas · 03 — você já tem Toast.js, vou propor formalização com helpers).</li>
          </ul>
        </CardCallout>
      </Bloco>
    </div>
  )
}
