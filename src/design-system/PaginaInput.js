import React, { useState } from 'react'
import Input from './components/Input'
import SearchInput from './components/SearchInput'
import PasswordInput from './components/PasswordInput'

/* ============================================================
   /app/design-system/input
   Input canônico + SearchInput + PasswordInput.
   Inventário REAL — 213 inputs + 35 textareas no projeto hoje.
   ============================================================ */

const USO_REAL = [
  { label: '<input> em src/', valor: 213, sub: 'elementos inline' },
  { label: '<textarea> em src/', valor: 35, sub: 'observações, avisos' },
  { label: 'type="text"', valor: 94, sub: 'dominante' },
  { label: 'placeholders', valor: 141, sub: 'em uso hoje' },
]

const NAO_E_INPUT = [
  { padrao: 'DateInput',    onde: 'src/components/DateInput.js',  vai: 'já existe — documentar' },
  { padrao: 'PhoneInput',   onde: 'src/components/PhoneInput.js', vai: 'já existe — documentar' },
  { padrao: 'TagInput',     onde: 'src/components/TagInput.js',   vai: 'Molécula · Tag/Chip' },
  { padrao: 'Checkbox',     onde: '28 ocorrências type="checkbox"', vai: 'Átomo · Checkbox' },
  { padrao: 'Radio',        onde: 'AgendaNovaCriarModal.js etc',  vai: 'Átomo · Radio' },
  { padrao: 'Switch toggle', onde: 'WhatsAppConexao.js, Agenda',   vai: 'Átomo · Switch' },
  { padrao: 'Select',       onde: 'AddInstallmentsModal.js etc',  vai: 'Átomo · Select' },
  { padrao: 'Textarea',     onde: 'AgendaPresencaModal, Avisos',  vai: 'componente separado (próximo)' },
]

const PATTERNS_REAIS = [
  {
    titulo: 'Login form',
    onde: 'Login.js:114-203',
    descricao: 'Label acima + input bg cinza claro + border foco dinâmico. Senha tem eye-toggle inline.',
  },
  {
    titulo: 'Search global no header',
    onde: 'Clientes.js:2056, Financeiro.js:1328',
    descricao: 'icon magnify + input + clear X. Em mobile colapsa pra ícone.',
  },
  {
    titulo: 'Valor monetário (R$)',
    onde: 'AddInstallmentsModal.js:320, CobrancasAvulsas.js',
    descricao: 'Hoje: input text + regex sanitize. Proposta: usar prefix="R$" canônico.',
  },
  {
    titulo: 'Input com erro',
    onde: 'AddInstallmentsModal.js:517-548',
    descricao: 'Border 2px vermelho + bg #ffebee + span vermelho abaixo. Componente assume isso com prop error.',
  },
  {
    titulo: 'Input com helper',
    onde: 'AddInstallmentsModal.js:364-367',
    descricao: 'Span cinza abaixo do input com regra de negócio. Suportado por prop helper.',
  },
  {
    titulo: 'Required (asterisco)',
    onde: 'apenas atributo HTML hoje',
    descricao: 'Nenhum lugar mostra asterisco vermelho visual hoje — só atributo required. Componente expõe required={true} pra mostrar.',
  },
]

const REGRAS = [
  { titulo: 'Label sempre acima', body: 'Mantemos o padrão clássico — não usamos floating label. Mais rápido de escanear, melhor pra densidade.' },
  { titulo: 'Helper é dica, error é correção', body: 'helper diz "vamos enviar confirmação". error diz "email inválido". Mostre UM por vez — error sobrescreve helper.' },
  { titulo: 'required mostra asterisco', body: 'Só atributo HTML não basta — keyboard users e screen readers precisam ver. Asterisco vermelho discreto.' },
  { titulo: 'Prefix/suffix em vez de label inline', body: 'R$ "0,00" usa prefix. NÃO use label "Valor (R$)" — fica redundante e cansa a leitura.' },
  { titulo: 'Clearable pra search e filtros', body: 'X pra limpar SÓ quando faz sentido limpar. Em form normal (nome, email) não usa — distrai.' },
  { titulo: 'Focus ring verde marca', body: 'Foco usa --mensalli-green-500 + ring claro. Acessibilidade obrigatória.' },
  { titulo: 'maxLength + showCounter pra texto longo', body: 'Em observação/descrição, mostra "23/200". Em nome/email não precisa.' },
  { titulo: 'Loading só em validação async', body: 'CEP buscando, slug verificando se existe. NÃO use loading durante request de save (use no Button).' },
  { titulo: 'Não esconda erros — explique', body: 'Mensagem de erro diz O QUE ESTÁ ERRADO E COMO CORRIGIR. "Email inválido" → "Email deve conter @".' },
]

/* ----- Sub-componentes (reuso do padrão Krooa) ----- */

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

export default function PaginaInput() {
  const [valor1, setValor1] = useState('Joana Silva')
  const [valor2, setValor2] = useState('')
  const [busca, setBusca] = useState('Maria')
  const [senha, setSenha] = useState('')
  const [valorMoeda, setValorMoeda] = useState('150,00')
  const [obs, setObs] = useState('')

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 8 }}>
        <Eyebrow>Átomos · 02</Eyebrow>
        <Selo estado="em-revisao" />
      </div>
      <h1 className="ds-text-h1" style={{ margin: 0 }}>Input</h1>
      <div style={{ marginTop: 12, marginBottom: 40 }}>
        <P muted>
          Input canônico do DS. 213 inputs inline hoje viram 1 componente com label, helper, error, affixes, ícones, clearable, loading e contador.
          + SearchInput e PasswordInput como compostos finos.
        </P>
      </div>

      {/* Uso real */}
      <Bloco>
        <Eyebrow>Uso real no projeto</Eyebrow>
        <P muted>Inventário sistemático de inputs e textareas inline.</P>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 'var(--space-3)', marginTop: 'var(--space-3-5)' }}>
          {USO_REAL.map(u => <MetricaCard key={u.label} {...u} />)}
        </div>
      </Bloco>

      {/* Escopo - o que é e o que NÃO é */}
      <Bloco>
        <Eyebrow>Escopo · o que é Input vs o que NÃO é</Eyebrow>
        <P muted>O Input cobre entrada de texto curto, número, email, telefone simples, etc. Outros padrões têm átomos próprios.</P>
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
          {NAO_E_INPUT.map((p, i) => (
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

      {/* Estados básicos */}
      <Bloco>
        <Eyebrow>Estados básicos (ao vivo)</Eyebrow>
        <Card>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 'var(--space-5) var(--space-4)' }}>
            <Input label="Default vazio" placeholder="Digite o nome" />
            <Input label="Preenchido" value={valor1} onChange={e => setValor1(e.target.value)} />
            <Input label="Com helper" helper="Como queira ser chamado" placeholder="Apelido" />
            <Input label="Com erro" error="Email inválido — falta o @" value="joaoexemplo.com" onChange={() => {}} />
            <Input label="Obrigatório" required placeholder="Não pode ficar vazio" />
            <Input label="Desabilitado" value="Não editável" onChange={() => {}} disabled />
            <Input label="Read-only" value="029.873.221-30" onChange={() => {}} readOnly />
            <Input label="Loading" value="meu-slug" onChange={() => {}} loading helper="Verificando disponibilidade…" />
          </div>
        </Card>
      </Bloco>

      {/* Affixes */}
      <Bloco>
        <Eyebrow>Affixes — prefix, suffix, ícones</Eyebrow>
        <Card>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 'var(--space-5) var(--space-4)' }}>
            <Input
              label="Valor mensal"
              prefix="R$"
              value={valorMoeda}
              onChange={e => setValorMoeda(e.target.value.replace(/[^0-9,]/g, ''))}
              placeholder="0,00"
            />
            <Input label="Plano" suffix="/mês" value="30" onChange={() => {}} />
            <Input label="Email" icon="mdi:email-outline" type="email" placeholder="seu@email.com" />
            <Input label="Slug da academia" prefix="mensalli.com.br/" placeholder="sua-academia" />
            <Input label="Limite" suffix="%" value="80" onChange={() => {}} />
            <Input
              label="Buscar inline"
              icon="mdi:magnify"
              clearable
              value={valor2}
              onChange={e => setValor2(e.target.value)}
              placeholder="Filtrar lista"
            />
          </div>
        </Card>
      </Bloco>

      {/* SearchInput composto */}
      <Bloco>
        <Eyebrow>SearchInput — composto sobre Input</Eyebrow>
        <P muted>Equivale a Input com <code>icon="mdi:magnify"</code> + <code>clearable</code> + <code>type="search"</code>. Para o pattern de busca global em headers e toolbars.</P>
        <div style={{ marginTop: 'var(--space-4)', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-4)' }}>
          <Card>
            <P muted>Header desktop (320px width)</P>
            <div style={{ marginTop: 'var(--space-3)', maxWidth: 320 }}>
              <SearchInput
                value={busca}
                onChange={e => setBusca(e.target.value)}
                placeholder="Buscar clientes..."
              />
            </div>
          </Card>
          <Card>
            <P muted>Toolbar grande (lg)</P>
            <div style={{ marginTop: 'var(--space-3)' }}>
              <SearchInput
                size="lg"
                value={busca}
                onChange={e => setBusca(e.target.value)}
                placeholder="Buscar em toda agenda..."
              />
            </div>
          </Card>
        </div>
      </Bloco>

      {/* PasswordInput composto */}
      <Bloco>
        <Eyebrow>PasswordInput — eye-toggle automático</Eyebrow>
        <P muted>Substitui o pattern Login.js:146-203 que tem eye-toggle inline com SVG e cálculo manual de paddingRight.</P>
        <Card style={{ maxWidth: 360 }}>
          <PasswordInput
            label="Senha"
            placeholder="Mínimo 8 caracteres"
            value={senha}
            onChange={e => setSenha(e.target.value)}
            helper="Vai virar criptografada antes de salvar"
          />
        </Card>
      </Bloco>

      {/* Sizes */}
      <Bloco>
        <Eyebrow>Sizes — sm (32), md (40, default), lg (48)</Eyebrow>
        <Card>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
            <Input label="Small (toolbar, tabela)" size="sm" placeholder="Filtro rápido" />
            <Input label="Medium (default — forms normais)" size="md" placeholder="Padrão" />
            <Input label="Large (onboarding, mobile)" size="lg" placeholder="Hero CTA" />
          </div>
        </Card>
      </Bloco>

      {/* Counter */}
      <Bloco>
        <Eyebrow>maxLength + showCounter</Eyebrow>
        <Card style={{ maxWidth: 480 }}>
          <Input
            label="Observação curta"
            placeholder="Máximo 80 caracteres"
            maxLength={80}
            showCounter
            value={obs}
            onChange={e => setObs(e.target.value)}
            helper="Aparece no comprovante de pagamento"
          />
        </Card>
      </Bloco>

      {/* Padrões reais do código */}
      <Bloco>
        <Eyebrow>Patterns reais do Mensalli</Eyebrow>
        <P muted>Como o Input cobre os padrões observados no código atual.</P>
        <div style={{
          marginTop: 'var(--space-4)',
          border: '1px solid var(--color-border-subtle)',
          borderRadius: 'var(--radius-lg)',
          backgroundColor: 'var(--color-bg-surface)',
          overflow: 'hidden',
        }}>
          {PATTERNS_REAIS.map((p, i) => (
            <div key={p.titulo} style={{
              padding: 'var(--space-4) var(--space-5)',
              borderTop: i > 0 ? '1px solid var(--color-border-subtle)' : 'none',
            }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--space-3)', marginBottom: 4 }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--color-text-primary)' }}>{p.titulo}</span>
                <code style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--color-text-muted)' }}>{p.onde}</code>
              </div>
              <div style={{ fontSize: 13, color: 'var(--color-text-secondary)', lineHeight: 1.55 }}>{p.descricao}</div>
            </div>
          ))}
        </div>
      </Bloco>

      {/* Como fica no código */}
      <Bloco>
        <Eyebrow>Como fica no código — exemplo: input valor monetário</Eyebrow>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-4)', marginTop: 'var(--space-3-5)' }}>
          <div>
            <div className="ds-text-eyebrow" style={{ color: 'var(--color-text-muted)', marginBottom: 6 }}>
              Hoje (AddInstallmentsModal.js:320)
            </div>
            <CodeBlock>{`<div>
  <label style={{
    fontSize: '14px',
    fontWeight: 'bold',
    color: '#344848',
    display: 'block',
    marginBottom: '6px'
  }}>
    Valor Mensal
  </label>
  <input
    type="text"
    placeholder="0,00"
    value={valor}
    onChange={e => setValor(
      e.target.value.replace(/[^0-9,]/g, '')
    )}
    style={{
      width: '100%',
      padding: '10px 12px',
      border: '1px solid #ddd',
      borderRadius: '6px',
      fontSize: '14px'
    }}
  />
</div>`}</CodeBlock>
          </div>
          <div>
            <div className="ds-text-eyebrow" style={{ color: 'var(--mensalli-green-700)', marginBottom: 6 }}>
              Proposta
            </div>
            <CodeBlock tone="proposta">{`<Input
  label="Valor Mensal"
  prefix="R$"
  placeholder="0,00"
  value={valor}
  onChange={e => setValor(
    e.target.value.replace(/[^0-9,]/g, '')
  )}
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
            <li><strong>3 componentes novos:</strong> <code>{'<Input>'}</code>, <code>{'<SearchInput>'}</code>, <code>{'<PasswordInput>'}</code> em <code>design-system/components/</code>.</li>
            <li><strong>API rica:</strong> label, helper, error, required, prefix, suffix, icon, iconRight, clearable, loading, maxLength + showCounter, 3 sizes.</li>
            <li><strong>Accessibility:</strong> id auto-gerado, aria-invalid, aria-describedby, aria-required, role=alert no erro.</li>
            <li><strong>Backward-compat 100%:</strong> nenhum <code>{'<input>'}</code> inline atual quebra. <code>DateInput</code>, <code>PhoneInput</code>, <code>TagInput</code> continuam funcionando.</li>
            <li><strong>Próxima etapa:</strong> Select (e talvez Textarea ao mesmo tempo, mesmo escopo de form).</li>
          </ul>
        </CardCallout>
      </Bloco>
    </div>
  )
}
