import React, { useState } from 'react'
import Checkbox from './components/Checkbox'
import Radio from './components/Radio'
import RadioGroup from './components/RadioGroup'

/* ============================================================
   /app/design-system/checkbox-radio
   Checkbox + Radio + RadioGroup.
   ============================================================ */

const USO_REAL = [
  { label: 'type="checkbox"', valor: 28, sub: 'inputs nativos hoje' },
  { label: 'Radio nativo', valor: 0, sub: 'simulados com button' },
  { label: 'Group multi-status', valor: 1, sub: 'Financeiro filtro' },
  { label: 'Termos/aceito', valor: 6, sub: 'Signup, contratos' },
]

const REGRAS = [
  { titulo: 'Checkbox vs Radio', body: 'Checkbox = N escolhas independentes (tags, permissões, filtros). Radio = 1 escolha exclusiva entre opções.' },
  { titulo: 'Checkbox vs Switch', body: 'Se você pode dizer "marcar/desmarcar item de lista", é Checkbox. Se você pode dizer "ligar/desligar setting", é Switch.' },
  { titulo: 'Radio vs Select', body: '≤ 5 opções com peso similar → Radio (todas visíveis). > 5 opções → Select (economiza espaço).' },
  { titulo: 'Label clicável', body: 'O componente já envelopa label + control num <label> — clicar no texto também checka. Padrão obrigatório de a11y.' },
  { titulo: 'Indeterminate é select-all parcial', body: 'Quando alguns (não todos) itens de uma tabela estão selecionados. Aplica via prop indeterminate={true}, JS faz o resto.' },
  { titulo: 'Description é opt-in', body: 'Em listas curtas (Aceito termos), só label. Quando a escolha tem nuance ("Aluno em turma" vs "Aluno individual"), usar description.' },
  { titulo: 'Use RadioGroup, não Radios soltos', body: 'RadioGroup gerencia value/onChange e gera name automaticamente. Radio solto exige passar name manual.' },
  { titulo: 'Disabled é último recurso', body: 'Se a opção não pode ser escolhida NUNCA, removê-la. Disabled é pra "plano não disponível", "função premium", explicado por tooltip.' },
  { titulo: 'Hover afeta o LABEL inteiro', body: 'Passa o mouse no texto → control fica verde também. Garante que o usuário entende que o texto também é clicável.' },
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

export default function PaginaCheckboxRadio() {
  // Estados pra demos
  const [termos, setTermos] = useState(false)
  const [notifs, setNotifs] = useState({ email: true, whatsapp: false, sms: false })
  const [tipoAluno, setTipoAluno] = useState('turma')
  const [ciclo, setCiclo] = useState('mensal')

  // Select-all demo (indeterminate)
  const [alunos, setAlunos] = useState({
    'joana': true,
    'pedro': false,
    'maria': true,
    'joao': false,
  })
  const totalAlunos = Object.keys(alunos).length
  const selectedAlunos = Object.values(alunos).filter(Boolean).length
  const allSelected = selectedAlunos === totalAlunos
  const someSelected = selectedAlunos > 0 && !allSelected

  function toggleAluno(id) {
    setAlunos(prev => ({ ...prev, [id]: !prev[id] }))
  }
  function toggleAll() {
    const novo = allSelected ? false : true
    setAlunos(prev => Object.fromEntries(Object.keys(prev).map(k => [k, novo])))
  }

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 8 }}>
        <Eyebrow>Átomos · 04</Eyebrow>
        <Selo estado="em-revisao" />
      </div>
      <h1 className="ds-text-h1" style={{ margin: 0 }}>Checkbox & Radio</h1>
      <div style={{ marginTop: 12, marginBottom: 40 }}>
        <P muted>
          Três componentes na mesma página: <code>{'<Checkbox>'}</code>, <code>{'<Radio>'}</code>, <code>{'<RadioGroup>'}</code>.
          Input nativo escondido (a11y preservada) + visual custom verde marca.
        </P>
      </div>

      {/* Uso real */}
      <Bloco>
        <Eyebrow>Uso real no projeto</Eyebrow>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 'var(--space-3)', marginTop: 'var(--space-3-5)' }}>
          {USO_REAL.map(u => <MetricaCard key={u.label} {...u} />)}
        </div>
        <div style={{ marginTop: 'var(--space-3-5)' }}>
          <CardCallout tone="info">
            Hoje: 28 checkboxes nativos com <code>accentColor: #3B82F6</code> (azul, fora da paleta).
            Radios são simulados com <code>{'<button>'}</code> (AgendaNovaCriarModal:166-194 — escolha "tipo de aluno").
            Indeterminate não é usado em lugar nenhum — proposta nova pro DS.
          </CardCallout>
        </div>
      </Bloco>

      {/* Checkbox básico */}
      <Bloco>
        <Eyebrow>Checkbox · estados (ao vivo)</Eyebrow>
        <Card>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 'var(--space-4)' }}>
            <Checkbox
              checked={termos}
              onChange={e => setTermos(e.target.checked)}
              label="Aceito os termos de uso"
              description="Você pode revogar a qualquer momento"
            />
            <Checkbox label="Default desmarcado" />
            <Checkbox defaultChecked label="Default marcado" />
            <Checkbox disabled label="Desabilitado" />
            <Checkbox disabled defaultChecked label="Desabilitado + marcado" />
            <Checkbox
              defaultChecked={false}
              label="Com erro"
              error="Você precisa aceitar pra continuar"
            />
          </div>
        </Card>
      </Bloco>

      {/* Checkbox em grupo (não-exclusivo) */}
      <Bloco>
        <Eyebrow>Checkbox em grupo — N escolhas independentes</Eyebrow>
        <P muted>Filtros multi (Financeiro), permissões, canais de notificação. Cada um pode ser true/false independentemente.</P>
        <Card style={{ marginTop: 'var(--space-4)' }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 'var(--space-3)' }}>Notificar aluno por:</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
            <Checkbox
              checked={notifs.email}
              onChange={e => setNotifs(p => ({ ...p, email: e.target.checked }))}
              label="E-mail"
              description="Mensagem em texto, inclusive cobrança formal"
            />
            <Checkbox
              checked={notifs.whatsapp}
              onChange={e => setNotifs(p => ({ ...p, whatsapp: e.target.checked }))}
              label="WhatsApp"
              description="Lembrete e link de pagamento PIX"
            />
            <Checkbox
              checked={notifs.sms}
              onChange={e => setNotifs(p => ({ ...p, sms: e.target.checked }))}
              label="SMS"
              description="Confirmações rápidas, chega mesmo sem internet"
            />
          </div>
        </Card>
      </Bloco>

      {/* Indeterminate (select-all) */}
      <Bloco>
        <Eyebrow>Indeterminate · select-all parcial</Eyebrow>
        <P muted>Quando alguns (não todos) itens estão selecionados. Pattern de tabela com bulk actions.</P>
        <Card style={{ marginTop: 'var(--space-4)' }}>
          <div style={{ paddingBottom: 'var(--space-2-5)', borderBottom: '1px solid var(--color-border-subtle)' }}>
            <Checkbox
              checked={allSelected}
              indeterminate={someSelected}
              onChange={toggleAll}
              label={
                <span style={{ fontWeight: 700 }}>
                  {allSelected ? 'Todos selecionados' : someSelected ? `${selectedAlunos} de ${totalAlunos} selecionados` : 'Selecionar todos'}
                </span>
              }
            />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2-5)', paddingTop: 'var(--space-3)' }}>
            {Object.entries({ joana: 'Joana Silva', pedro: 'Pedro Costa', maria: 'Maria Santos', joao: 'João Pereira' }).map(([id, nome]) => (
              <Checkbox
                key={id}
                checked={alunos[id]}
                onChange={() => toggleAluno(id)}
                label={nome}
              />
            ))}
          </div>
          <div style={{ marginTop: 'var(--space-3)', fontSize: 11, color: 'var(--color-text-muted)' }}>
            Marque alguns (não todos) pra ver o estado "traço" do header.
          </div>
        </Card>
      </Bloco>

      {/* Radio único */}
      <Bloco>
        <Eyebrow>Radio · uso isolado</Eyebrow>
        <P muted>Radio solto raramente faz sentido — quase sempre você quer RadioGroup. Mostrando aqui pra completude.</P>
        <Card>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
            <Radio name="exemplo-solo" value="m" label="Masculino" />
            <Radio name="exemplo-solo" value="f" label="Feminino" />
            <Radio name="exemplo-solo" value="x" label="Outro" />
            <Radio name="exemplo-solo" value="z" label="Disabled" disabled />
          </div>
        </Card>
      </Bloco>

      {/* RadioGroup vertical com descrição */}
      <Bloco>
        <Eyebrow>RadioGroup · escolha exclusiva (recomendado)</Eyebrow>
        <P muted>Substitui o pattern de "botão simulando radio" do AgendaNovaCriarModal:166-194. Componente gerencia value, name, onChange, a11y.</P>
        <Card style={{ marginTop: 'var(--space-4)' }}>
          <RadioGroup
            label="Tipo de aluno"
            required
            value={tipoAluno}
            onChange={setTipoAluno}
            helper="Define como o agendamento aparece na grade"
            options={[
              {
                value: 'turma',
                label: 'Aluno em turma',
                description: 'Aulas regulares com horário fixo. Compartilha agenda com outros alunos da turma.',
              },
              {
                value: 'individual',
                label: 'Aluno individual',
                description: 'Horário próprio. Não compartilha agenda. Ideal pra personal e aulas particulares.',
              },
              {
                value: 'experimental',
                label: 'Aula experimental',
                description: 'Teste gratuito — não gera cobrança até o aluno confirmar matrícula.',
              },
            ]}
          />
        </Card>
      </Bloco>

      {/* RadioGroup horizontal sem descrição */}
      <Bloco>
        <Eyebrow>RadioGroup horizontal — opções curtas</Eyebrow>
        <P muted>Quando as opções são curtas (≤ 2 palavras) e cabem na linha. Comum em filtros e configs rápidas.</P>
        <Card style={{ marginTop: 'var(--space-4)' }}>
          <RadioGroup
            label="Ciclo de cobrança"
            value={ciclo}
            onChange={setCiclo}
            orientation="horizontal"
            options={[
              { value: 'mensal', label: 'Mensal' },
              { value: 'trimestral', label: 'Trimestral' },
              { value: 'semestral', label: 'Semestral' },
              { value: 'anual', label: 'Anual' },
            ]}
          />
        </Card>
      </Bloco>

      {/* Como fica no código */}
      <Bloco>
        <Eyebrow>Como fica no código — refactor real</Eyebrow>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-4)', marginTop: 'var(--space-3-5)' }}>
          <div>
            <div className="ds-text-eyebrow" style={{ color: 'var(--color-text-muted)', marginBottom: 6 }}>
              Hoje (Signup.js, ~30 linhas)
            </div>
            <CodeBlock>{`<label style={{
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  fontSize: '14px',
  cursor: 'pointer',
}}>
  <input
    type="checkbox"
    checked={aceitouTermos}
    onChange={e =>
      setAceitouTermos(e.target.checked)}
    style={{
      width: '18px',
      height: '18px',
      accentColor: '#3B82F6',  /* fora paleta */
    }}
  />
  <span>
    Aceito os
    <a href="/termos">termos de uso</a>
    e <a href="/privacidade">política</a>
  </span>
</label>
{erro && (
  <span style={{ color: 'red', fontSize: 12 }}>
    {erro}
  </span>
)}`}</CodeBlock>
          </div>
          <div>
            <div className="ds-text-eyebrow" style={{ color: 'var(--mensalli-green-700)', marginBottom: 6 }}>
              Proposta
            </div>
            <CodeBlock tone="proposta">{`<Checkbox
  checked={aceitouTermos}
  onChange={e =>
    setAceitouTermos(e.target.checked)}
  label={
    <>
      Aceito os{' '}
      <a href="/termos">termos de uso</a>
      {' '}e{' '}
      <a href="/privacidade">política</a>
    </>
  }
  error={erro}
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
            <li><strong>3 componentes novos:</strong> <code>{'<Checkbox>'}</code>, <code>{'<Radio>'}</code>, <code>{'<RadioGroup>'}</code> em <code>design-system/components/</code>.</li>
            <li><strong>Cor de marca consistente</strong> — não mais <code>accentColor: #3B82F6</code> (azul fora paleta).</li>
            <li><strong>Indeterminate como cidadão de primeira classe</strong> — feature nova pro app, abre caminho pra bulk actions em tabelas.</li>
            <li><strong>RadioGroup substitui radios simulados com button</strong> (AgendaNovaCriarModal:166-194 — 30 linhas inline viram 8).</li>
            <li><strong>A11y nativa</strong>: keyboard nav, focus ring, aria-invalid, role=radiogroup, role=alert.</li>
            <li><strong>Próxima etapa:</strong> Switch (Átomos · 05 — ligar/desligar setting/feature, diferente de Checkbox que escolhe item de lista).</li>
          </ul>
        </CardCallout>
      </Bloco>
    </div>
  )
}
