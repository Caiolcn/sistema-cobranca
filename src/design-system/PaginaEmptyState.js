import React from 'react'
import EmptyState from './components/EmptyState'
import Button from './components/Button'
import Card from './components/Card'

/* ============================================================
   /app/design-system/empty-state
   5 variants por intenção + 3 sizes.
   ============================================================ */

const CHECKLIST = [
  { pergunta: 'User tem permissão pra ver isso?',     gym: '—',           nao: 'forbidden' },
  { pergunta: 'A chamada de API falhou?',              gym: 'error',       nao: 'próxima pergunta' },
  { pergunta: 'Tem busca ativa?',                      gym: 'no-results',  nao: 'próxima pergunta' },
  { pergunta: 'Tem filtro(s) aplicado(s)?',            gym: 'no-matches',  nao: 'próxima pergunta' },
  { pergunta: 'Tem dependência não resolvida?',        gym: 'requires-setup', nao: 'próxima pergunta' },
  { pergunta: 'Lista sempre esteve vazia?',            gym: 'first-use',   nao: '—' },
]

const REGRAS = [
  { titulo: 'Sempre dá próximo passo', body: 'Vazio sem CTA é beco sem saída. Mesmo no error, o próximo passo é "Tentar novamente" ou "Limpar filtros".' },
  { titulo: 'Título específico, não genérico', body: '"Nenhum funil criado" > "Lista vazia". Quanto mais específico, mais útil. Use o nome do que falta.' },
  { titulo: 'Tom afirmativo, sem desculpa', body: 'Evite "Opa, não encontramos...". Diga o que é ("Nenhum X aqui") e o que fazer.' },
  { titulo: 'First-use ≠ No-matches', body: 'Nunca criou (CTA: criar) é DIFERENTE de filtro zerou (CTA: limpar filtro). Backend precisa diferenciar.' },
  { titulo: 'Erro nunca fica silencioso', body: 'Se carregamento falhou, mostra error state com "Tentar novamente". Nunca pode parecer que a lista tá vazia.' },
  { titulo: 'Proporcional ao espaço', body: 'Compact em cards de widget, default em listagens, large em páginas inteiras de onboarding.' },
  { titulo: 'Cor por intenção', body: 'first-use=verde marca (oportunidade), forbidden=laranja, error=vermelho, requires-setup=azul. Cor conta a história.' },
  { titulo: 'Action ≠ Secondary', body: 'action é o CTA principal verde. secondary é ghost cinza pra alternativa ("Ver tour", "Limpar filtros").' },
  { titulo: '6-line description max', body: 'Descrição explica o estado em 2 linhas. Se precisa mais, é o CTA que precisa ser melhor.' },
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

/* ----- Página ----- */

export default function PaginaEmptyState() {
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 8 }}>
        <Eyebrow>Moléculas · 07</Eyebrow>
        <Selo estado="em-revisao" />
      </div>
      <h1 className="ds-text-h1" style={{ margin: 0 }}>Empty State</h1>
      <div style={{ marginTop: 12, marginBottom: 40 }}>
        <P muted>
          5 variants por INTENÇÃO (não aparência). Escolha pela SITUAÇÃO do user — cada uma tem ícone, cor e tom apropriados.
        </P>
      </div>

      {/* Decisão */}
      <Bloco>
        <Eyebrow>Como escolher o variant</Eyebrow>
        <P muted>Perguntas em ordem — pare na primeira que se aplica.</P>
        <Card padding="none" style={{ marginTop: 'var(--space-4)' }}>
          <div style={{
            display: 'grid', gridTemplateColumns: '1.5fr 1fr 1fr',
            gap: 'var(--space-4)', padding: 'var(--space-3) var(--space-5)',
            backgroundColor: 'var(--neutral-50)', borderBottom: '1px solid var(--color-border-subtle)',
          }}>
            <div className="ds-text-eyebrow" style={{ color: 'var(--color-text-muted)' }}>Pergunta</div>
            <div className="ds-text-eyebrow" style={{ color: 'var(--color-text-muted)' }}>Sim → variant</div>
            <div className="ds-text-eyebrow" style={{ color: 'var(--color-text-muted)' }}>Não → próximo</div>
          </div>
          {CHECKLIST.map((c, i) => (
            <div key={c.pergunta} style={{
              display: 'grid', gridTemplateColumns: '1.5fr 1fr 1fr',
              gap: 'var(--space-4)', padding: 'var(--space-3) var(--space-5)',
              borderTop: i > 0 ? '1px solid var(--color-border-subtle)' : 'none',
              fontSize: 12, alignItems: 'center',
            }}>
              <span style={{ color: 'var(--color-text-secondary)' }}>{c.pergunta}</span>
              <code style={{ fontFamily: 'var(--font-mono)', color: 'var(--mensalli-green-700)' }}>{c.gym}</code>
              <span style={{ color: 'var(--color-text-muted)' }}>{c.nao}</span>
            </div>
          ))}
        </Card>
      </Bloco>

      {/* 6 variants ao vivo */}
      <Bloco>
        <Eyebrow>6 variants (ao vivo)</Eyebrow>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 'var(--space-4)', marginTop: 'var(--space-4)' }}>
          <Card padding="none">
            <EmptyState
              variant="first-use"
              title="Nenhum cliente cadastrado"
              description="Comece cadastrando seu primeiro cliente ou importando uma planilha CSV com seus alunos atuais."
              action={<Button variant="primary" icon="mdi:plus">Cadastrar cliente</Button>}
              secondary={<Button variant="ghost" icon="mdi:file-import-outline">Importar CSV</Button>}
            />
          </Card>
          <Card padding="none">
            <EmptyState
              variant="no-results"
              title='Nenhum resultado para "maria silva"'
              description="Tente outra busca ou verifique se digitou corretamente."
              action={<Button variant="outline">Limpar busca</Button>}
            />
          </Card>
          <Card padding="none">
            <EmptyState
              variant="no-matches"
              title="Nenhum cliente com esses filtros"
              description="Você aplicou 3 filtros. Remover algum pode ajudar."
              action={<Button variant="outline" icon="mdi:filter-off-outline">Limpar filtros</Button>}
            />
          </Card>
          <Card padding="none">
            <EmptyState
              variant="forbidden"
              title="Você não tem acesso a esta seção"
              description="Peça pro administrador da conta liberar a permissão 'Financeiro' pra você."
              action={<Button variant="outline">Falar com admin</Button>}
            />
          </Card>
          <Card padding="none">
            <EmptyState
              variant="requires-setup"
              title="Configure um canal antes de criar cobranças"
              description="Cobranças precisam de pelo menos um canal de comunicação ativo (WhatsApp, e-mail) pra funcionar."
              action={<Button variant="primary" icon="mdi:link-variant">Configurar canal</Button>}
              secondary={<Button variant="ghost">Saber mais</Button>}
            />
          </Card>
          <Card padding="none">
            <EmptyState
              variant="error"
              title="Não foi possível carregar as cobranças"
              description="Verifique sua conexão. Se o problema continuar, fale com o suporte."
              action={<Button variant="primary" icon="mdi:reload">Tentar novamente</Button>}
              secondary={<Button variant="ghost">Falar com suporte</Button>}
            />
          </Card>
        </div>
      </Bloco>

      {/* Sizes */}
      <Bloco>
        <Eyebrow>Sizes — compact (widget) / default / large (página)</Eyebrow>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-4)' }}>
          <Card padding="none">
            <EmptyState
              size="compact"
              variant="no-results"
              title="Sem atividade hoje"
              description="Você aparecerá aqui quando começar a atender."
            />
          </Card>
          <Card padding="none">
            <EmptyState
              size="default"
              variant="first-use"
              title="Nenhum cliente cadastrado"
              description="Comece cadastrando seu primeiro cliente ou importe uma planilha CSV."
              action={<Button variant="primary">Cadastrar cliente</Button>}
            />
          </Card>
        </div>
        <div style={{ marginTop: 'var(--space-4)' }}>
          <Card padding="none">
            <EmptyState
              size="large"
              variant="first-use"
              title="Bem-vindo ao Mensalli"
              description="Vamos configurar sua conta em 3 passos. Em menos de 5 minutos você está pronto pra receber o primeiro pagamento via WhatsApp."
              action={<Button variant="primary" size="lg" iconRight="mdi:arrow-right">Começar agora</Button>}
              secondary={<Button variant="ghost" size="lg">Ver tour rápido</Button>}
            />
          </Card>
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
            <li><strong><code>{'<EmptyState>'}</code> com 6 variants</strong> em <code>design-system/components/EmptyState.js</code>.</li>
            <li><strong>Componente já usado pelo Table</strong> internamente — empty + loading consistentes.</li>
          </ul>
        </CardCallout>
      </Bloco>

      {/* MARCO Moléculas */}
      <Bloco>
        <Eyebrow>Marco · Moléculas completas 🎯</Eyebrow>
        <CardCallout tone="info">
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 6 }}>
            7/7 moléculas entregues.
          </div>
          <div style={{ fontSize: 13, lineHeight: 1.6 }}>
            Card · Modal · Toast · Table · Tabs · Dropdown · Empty State.<br />
            Próxima fase: <strong>Padrões Mensalli</strong> — componentes de domínio
            (DevedorIdentity, CobrancaStatus, PlanoCard, WizardStepper).
          </div>
        </CardCallout>
      </Bloco>
    </div>
  )
}
