import React, { useState } from 'react'
import Select from './components/Select'

/* ============================================================
   /app/design-system/select
   Select custom (não nativo) — single, multi, search, create inline.
   Ancorado em 19 padrões reais do código.
   ============================================================ */

const USO_REAL = [
  { label: '<select> nativos', valor: 63, sub: 'em src/' },
  { label: '<option> declarations', valor: 165, sub: 'hardcoded ou map' },
  { label: 'Custom dropdowns', valor: 2, sub: 'CountrySelect, TagInput' },
  { label: '"+ Adicionar novo"', valor: 3, sub: 'pattern create inline' },
]

const NAO_E_SELECT = [
  { padrao: 'Toggle Switch (ligar/desligar)', onde: 'WhatsAppConexao, AgendaCalendario',  vai: 'Átomo · Switch' },
  { padrao: 'Tabs / Segmented (Dia/Semana/Mês)', onde: 'AgendaCalendario, CRM',           vai: 'Molécula · Tabs' },
  { padrao: 'Radio buttons (escolha exclusiva visual)', onde: 'AgendaNovaCriarModal',     vai: 'Átomo · Radio' },
  { padrao: 'Date picker', onde: 'src/components/DateInput.js',                            vai: 'já existe — documentar' },
  { padrao: 'Action menu (3 dots)', onde: 'Clientes.js, Dashboard.js',                     vai: 'Molécula · Dropdown' },
  { padrao: 'CountrySelect (telefone)', onde: 'src/components/CountrySelect.js',           vai: 'já existe — documentar' },
  { padrao: 'TagInput (tags coloridas)', onde: 'src/components/TagInput.js',                vai: 'Molécula · TagInput (extensão de Select)' },
]

const STATUS_OPTIONS = [
  { value: 'pendente',  label: 'Pendente',   icon: 'mdi:clock-outline' },
  { value: 'pago',      label: 'Pago',       icon: 'mdi:check-circle' },
  { value: 'atrasado',  label: 'Atrasado',   icon: 'mdi:alert-circle' },
  { value: 'cancelado', label: 'Cancelado',  icon: 'mdi:close-circle' },
]

const FORMA_PAGAMENTO = [
  { value: 'pix',        label: 'PIX',                 icon: 'mdi:qrcode' },
  { value: 'dinheiro',   label: 'Dinheiro',            icon: 'mdi:cash' },
  { value: 'cartao-cre', label: 'Cartão de crédito',   icon: 'mdi:credit-card-outline' },
  { value: 'cartao-deb', label: 'Cartão de débito',    icon: 'mdi:credit-card-check-outline' },
  { value: 'transf',     label: 'Transferência',       icon: 'mdi:bank-transfer' },
  { value: 'boleto',     label: 'Boleto',              icon: 'mdi:barcode' },
]

const CLIENTES_MOCK = [
  { value: '1', label: 'Joana Silva' },
  { value: '2', label: 'Pedro Costa' },
  { value: '3', label: 'Maria Santos' },
  { value: '4', label: 'João Pereira' },
  { value: '5', label: 'Ana Mendes' },
  { value: '6', label: 'Carlos Lima' },
  { value: '7', label: 'Fernanda Oliveira' },
  { value: '8', label: 'Roberto Almeida' },
  { value: '9', label: 'Beatriz Souza' },
  { value: '10', label: 'Marcelo Rocha' },
  { value: '11', label: 'Luiza Castro' },
  { value: '12', label: 'Inativo (não cobrar)', disabled: true },
]

const TAGS_MOCK = [
  { value: 'vip', label: 'VIP' },
  { value: 'novo', label: 'Novo cliente' },
  { value: 'plano-anual', label: 'Plano anual' },
  { value: 'aniversariante', label: 'Aniversariante do mês' },
  { value: 'inadimplente', label: 'Inadimplente' },
]

const REGRAS = [
  { titulo: 'searchable quando lista ≥ 10', body: 'Lista curta (status, forma de pagamento) não precisa search. Lista longa (clientes, professores) PRECISA — caso contrário é inútil.' },
  { titulo: 'multiple só quando faz sentido', body: 'Tags, filtros de status (mostrar ativo+inativo). Em 90% dos casos é single.' },
  { titulo: 'onCreate só pra entidades que o user cria', body: 'Categoria, tag, cliente: faz sentido criar do dropdown. Status (pendente/pago) NÃO — é enum fixo do sistema.' },
  { titulo: 'placeholder específico', body: '"Selecionar status" > "Selecionar". O placeholder deve explicar O QUE selecionar.' },
  { titulo: 'icon na option = significado visual', body: 'Status com bolinha colorida + ícone. PIX com QR. Vira reconhecimento instantâneo na lista.' },
  { titulo: 'disabled é exceção, não regra', body: 'Opção desabilitada vira ruído. Se a opção não pode ser selecionada NUNCA, removê-la da lista. Disabled é pra "cliente bloqueado", "plano fora do contrato".' },
  { titulo: 'keyboard nav é obrigatório', body: '↑/↓ navega, Enter seleciona, Esc fecha. Sem isso, keyboard users não usam. Componente já implementa.' },
  { titulo: 'clearable em filtros, não em forms', body: 'Filtro "Status: pago" tem X pra limpar. Form "Forma de pagamento *" não — usa required + validação.' },
  { titulo: 'Dropdown fecha em single, fica aberto em multi', body: 'Single: seleciona → fecha. Multi: seleciona → mantém aberto pra continuar selecionando.' },
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

export default function PaginaSelect() {
  const [status, setStatus] = useState('pago')
  const [forma, setForma] = useState('')
  const [cliente, setCliente] = useState('')
  const [tags, setTags] = useState(['vip', 'plano-anual'])
  const [filtroStatus, setFiltroStatus] = useState([])
  const [categoria, setCategoria] = useState('')
  const [extraOpts, setExtraOpts] = useState([])

  const categoriasComExtras = [
    { value: 'mensalidade', label: 'Mensalidade', icon: 'mdi:repeat' },
    { value: 'matricula',   label: 'Matrícula',    icon: 'mdi:account-plus-outline' },
    { value: 'avaliacao',   label: 'Avaliação física', icon: 'mdi:dumbbell' },
    ...extraOpts,
  ]

  function handleCreateCategoria(text) {
    if (!text.trim()) {
      // poderia abrir modal aqui
      return
    }
    const slug = text.toLowerCase().replace(/\s+/g, '-')
    setExtraOpts(prev => [...prev, { value: slug, label: text }])
    setCategoria(slug)
  }

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 8 }}>
        <Eyebrow>Átomos · 03</Eyebrow>
        <Selo estado="em-revisao" />
      </div>
      <h1 className="ds-text-h1" style={{ margin: 0 }}>Select</h1>
      <div style={{ marginTop: 12, marginBottom: 40 }}>
        <P muted>
          Dropdown custom (não nativo) — visualmente igual ao Input, mas com options ricas (ícones, cores, badges).
          Single, multi, searchable, create inline — tudo via props opcionais num único componente.
        </P>
      </div>

      {/* Uso real */}
      <Bloco>
        <Eyebrow>Uso real no projeto</Eyebrow>
        <P muted>63 selects nativos + 2 dropdowns custom + pattern de criar inline já existente.</P>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 'var(--space-3)', marginTop: 'var(--space-3-5)' }}>
          {USO_REAL.map(u => <MetricaCard key={u.label} {...u} />)}
        </div>
      </Bloco>

      {/* Por que não nativo */}
      <Bloco>
        <Eyebrow>Por que dropdown custom e não &lt;select&gt; nativo</Eyebrow>
        <CardCallout tone="info">
          <ul style={{ margin: 0, paddingLeft: 20, lineHeight: 1.7 }}>
            <li><strong>Nativo não suporta ícones nas options</strong> — daí CountrySelect e TagInput já são custom.</li>
            <li><strong>Visual inconsistente entre navegadores</strong> — Safari especialmente feio.</li>
            <li><strong>Sem search nativo</strong> — pra listas longas (cliente, professor, categoria) fica inútil.</li>
            <li><strong>Sem multi-select decente</strong> — `multiple` nativo é ruim de usar (Ctrl+click).</li>
            <li><strong>A11y é manual nos dois casos</strong> — então custom não é "mais trabalho", é "trabalho concentrado num componente só".</li>
          </ul>
        </CardCallout>
      </Bloco>

      {/* Escopo */}
      <Bloco>
        <Eyebrow>Escopo · o que é Select vs o que NÃO é</Eyebrow>
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
          {NAO_E_SELECT.map((p, i) => (
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

      {/* Single básico */}
      <Bloco>
        <Eyebrow>Single select (ao vivo)</Eyebrow>
        <P muted>Status e forma de pagamento — listas curtas, sem search, opções com ícone.</P>
        <Card style={{ marginTop: 'var(--space-4)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 'var(--space-4)' }}>
            <Select
              label="Status da cobrança"
              options={STATUS_OPTIONS}
              value={status}
              onChange={setStatus}
              placeholder="Selecionar status"
            />
            <Select
              label="Forma de pagamento"
              options={FORMA_PAGAMENTO}
              value={forma}
              onChange={setForma}
              placeholder="Como vai receber?"
              required
              helper="Aparece no recibo do cliente"
            />
          </div>
        </Card>
      </Bloco>

      {/* Searchable */}
      <Bloco>
        <Eyebrow>Searchable (lista longa)</Eyebrow>
        <P muted>Quando lista &gt; 10 itens. Digita pra filtrar — pode digitar o nome ou parte dele.</P>
        <Card style={{ marginTop: 'var(--space-4)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 'var(--space-4)' }}>
            <Select
              label="Cliente"
              options={CLIENTES_MOCK}
              value={cliente}
              onChange={setCliente}
              placeholder="Buscar cliente..."
              searchable
              clearable
              icon="mdi:account-search-outline"
              helper="Digite o nome do aluno"
            />
            <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', fontSize: 13, color: 'var(--color-text-secondary)' }}>
              <P muted>Substitui o pattern de CobrancasAvulsas.js:1129 (select nativo de cliente sem search — fica inútil quando passa de 20 alunos).</P>
            </div>
          </div>
        </Card>
      </Bloco>

      {/* Multi com chips */}
      <Bloco>
        <Eyebrow>Multi-select (chips no campo)</Eyebrow>
        <P muted>Tags do cliente, filtros que aceitam múltiplos status. Cada selecionado vira chip removível.</P>
        <Card style={{ marginTop: 'var(--space-4)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 'var(--space-4)' }}>
            <Select
              label="Tags do cliente"
              options={TAGS_MOCK}
              value={tags}
              onChange={setTags}
              multiple
              searchable
              placeholder="Adicionar tags..."
              helper="Múltiplas seleções permitidas"
            />
            <Select
              label="Filtrar status"
              options={STATUS_OPTIONS}
              value={filtroStatus}
              onChange={setFiltroStatus}
              multiple
              placeholder="Todos os status"
              helper="Vazio = mostra tudo"
            />
          </div>
        </Card>
      </Bloco>

      {/* Create inline */}
      <Bloco>
        <Eyebrow>Create inline ("+ Adicionar novo")</Eyebrow>
        <P muted>Footer com botão pra criar opção que ainda não existe. Substitui o pattern <code>value="__nova__"</code> de CobrancasAvulsas:1085 e Despesas:821.</P>
        <Card style={{ marginTop: 'var(--space-4)', maxWidth: 480 }}>
          <Select
            label="Categoria"
            options={categoriasComExtras}
            value={categoria}
            onChange={setCategoria}
            placeholder="Selecionar categoria"
            searchable
            onCreate={handleCreateCategoria}
            createLabel="Nova categoria"
            helper="Digite no buscador e clique em + Adicionar"
          />
          <div style={{ marginTop: 'var(--space-3)', fontSize: 11, color: 'var(--color-text-muted)' }}>
            Em produção, <code>onCreate</code> abriria um modal pra coletar nome, cor, ícone. Aqui pra demo, cria direto com o texto digitado.
          </div>
        </Card>
      </Bloco>

      {/* Estados */}
      <Bloco>
        <Eyebrow>Estados</Eyebrow>
        <Card>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 'var(--space-5) var(--space-4)' }}>
            <Select
              label="Default vazio"
              options={STATUS_OPTIONS}
              placeholder="Selecionar..."
            />
            <Select
              label="Com erro"
              options={STATUS_OPTIONS}
              error="Status obrigatório — escolha um"
              required
            />
            <Select
              label="Desabilitado"
              options={STATUS_OPTIONS}
              value="pago"
              disabled
            />
            <Select
              label="Com ícone à esquerda"
              icon="mdi:tag-outline"
              options={STATUS_OPTIONS}
              placeholder="Categoria..."
            />
          </div>
        </Card>
      </Bloco>

      {/* Sizes */}
      <Bloco>
        <Eyebrow>Sizes — sm (32), md (40, default), lg (48)</Eyebrow>
        <Card>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
            <Select size="sm" label="Small (toolbar, filtros)" options={STATUS_OPTIONS} placeholder="Status..." />
            <Select size="md" label="Medium (default — forms)" options={STATUS_OPTIONS} placeholder="Status..." />
            <Select size="lg" label="Large (onboarding, mobile)" options={STATUS_OPTIONS} placeholder="Status..." />
          </div>
        </Card>
      </Bloco>

      {/* Como fica no código */}
      <Bloco>
        <Eyebrow>Como fica no código — substituindo selects nativos</Eyebrow>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-4)', marginTop: 'var(--space-3-5)' }}>
          <div>
            <div className="ds-text-eyebrow" style={{ color: 'var(--color-text-muted)', marginBottom: 6 }}>
              Hoje (CobrancasAvulsas.js:1085)
            </div>
            <CodeBlock>{`<select
  value={categoriaId}
  onChange={e => {
    const v = e.target.value
    if (v === '__nova__') {
      setMostrarModalCategoria(true)
    } else {
      setCategoriaId(v)
    }
  }}
  style={{
    padding: '10px',
    border: '1px solid #ddd',
    borderRadius: '6px',
    fontSize: '14px',
    width: '100%'
  }}
>
  <option value="">Selecionar...</option>
  {categorias.map(c => (
    <option key={c.id} value={c.id}>
      {c.nome}
    </option>
  ))}
  <option
    value="__nova__"
    style={{ color: '#007bff', fontWeight: 'bold' }}
  >
    + Nova categoria
  </option>
</select>`}</CodeBlock>
          </div>
          <div>
            <div className="ds-text-eyebrow" style={{ color: 'var(--mensalli-green-700)', marginBottom: 6 }}>
              Proposta
            </div>
            <CodeBlock tone="proposta">{`<Select
  label="Categoria"
  options={categorias.map(c => ({
    value: c.id,
    label: c.nome,
    icon: c.icone,
  }))}
  value={categoriaId}
  onChange={setCategoriaId}
  placeholder="Selecionar..."
  searchable
  onCreate={() => setMostrarModalCategoria(true)}
  createLabel="Nova categoria"
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
            <li><strong>1 componente <code>{'<Select>'}</code></strong> cobre 19 padrões distintos via props opcionais.</li>
            <li><strong>Features ativadas por prop:</strong> searchable, multiple, clearable, onCreate.</li>
            <li><strong>Keyboard nav nativa:</strong> ↑/↓/Enter/Esc funcionam. <code>aria-listbox</code>, <code>aria-option</code>, <code>aria-expanded</code> automáticos.</li>
            <li><strong>Backward-compat 100%:</strong> 63 selects nativos atuais continuam funcionando. Migração é gradual.</li>
            <li><strong>Próxima etapa:</strong> Checkbox & Radio (e talvez Switch ao mesmo tempo — mesma família).</li>
          </ul>
        </CardCallout>
      </Bloco>
    </div>
  )
}
