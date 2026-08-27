import React, { useState } from 'react'
import StatCard from './components/StatCard'

/* ============================================================
   /app/design-system/statcard
   6 accents × 2 sizes × delta/hint/footer/loading/clickable.
   ============================================================ */

const USO_REAL = [
  { label: 'Admin.js', valor: 14, sub: 'KPIs, retenção, financeiro' },
  { label: 'Financeiro.js', valor: 4, sub: 'cards de resumo com % e link' },
  { label: 'Home.js', valor: 6, sub: 'visão do dia' },
  { label: 'Relatorios.js', valor: 5, sub: 'totais do período' },
  { label: 'Hex cravado', valor: '~29×', sub: 'antes desta peça existir' },
  { label: 'Definições do card', valor: 1, sub: 'agora' },
]

const NAO_E_STATCARD = [
  { padrao: 'Card com título + conteúdo livre', onde: 'Financeiro, Configuração', vai: 'Card (com Card.Header/Body)' },
  { padrao: 'Linha de tabela com número', onde: 'todas as listagens', vai: 'Table com align="right"' },
  { padrao: 'Pill de status ("Pago")', onde: 'listagens', vai: 'Badge / CobrancaStatus' },
  { padrao: 'Gráfico de série temporal', onde: 'Admin financeiro', vai: 'não é card — é gráfico com eixo' },
  { padrao: 'Contador dentro de aba', onde: 'filtros', vai: 'Tabs (prop count)' },
]

const REGRAS = [
  { titulo: 'Um número, um card', body: 'Se o card tem dois números disputando atenção, são dois cards. O valor é o motivo do card existir — tudo mais é apoio.' },
  { titulo: 'Formatação é do chamador', body: 'O card não sabe se são reais, contas ou porcentagem. Passe `value` já formatado ("R$ 4.280", "12%"). Isso evita um formatador escondido dentro do DS.' },
  { titulo: 'direction é direção, tone é juízo', body: 'A seta segue `direction` (o número subiu ou desceu). A cor segue `tone`. Em churn e inadimplência subir é ruim: passe tone="negative" com direction="up". Sem tone, up=verde.' },
  { titulo: 'Delta precisa de referência', body: 'Um "+12%" sozinho não diz nada. Sempre passe `delta.label` ("vs. mês anterior", "últimos 7 dias"). Sem referência, é melhor não mostrar delta.' },
  { titulo: 'Accent é semântica', body: 'success = receita, ativos, saúde. danger = churn, inadimplência, falha. warning = vencendo, atenção. neutral = contagem sem juízo. Não escolha pela cor bonita.' },
  { titulo: 'tinted com moderação', body: 'No máximo um card com fundo pastel por tela — é o que você quer que a pessoa veja primeiro. Uma fileira inteira tinted não destaca nada.' },
  { titulo: 'Clicável leva a algum lugar', body: 'Se o card é clicável, o clique tem que abrir a lista por trás do número. Card clicável que não navega frustra — vira botão morto.' },
  { titulo: 'Loading no card, não na tela', body: 'Use `loading` para o shimmer no lugar do número. A tela inteira piscando em skeleton é pior que a fileira de cards carregando em posição.' },
  { titulo: 'Máximo 6 numa fileira', body: 'Acima disso ninguém lê. Se são mais métricas, agrupe por assunto em seções — ou promova as principais e mande o resto pra uma aba.' },
]

/* ----- Sub-componentes (mesmo padrão das outras páginas de doc) ----- */

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
      <div style={{ fontSize: 24, fontWeight: 700, marginTop: 4, color: 'var(--color-text-primary)' }}>{valor}</div>
      <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 4, lineHeight: 1.4 }}>{sub}</div>
    </div>
  )
}

function Grade({ children, cols = 'repeat(auto-fit, minmax(200px, 1fr))', style }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: cols, gap: 'var(--space-3)', ...style }}>
      {children}
    </div>
  )
}

/* ----- Página ----- */

export default function PaginaStatCard() {
  const [carregando, setCarregando] = useState(false)
  const [clicado, setClicado] = useState(null)

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 8 }}>
        <Eyebrow>Moléculas · StatCard</Eyebrow>
        <Selo estado="em-revisao" />
      </div>
      <h1 className="ds-text-h1" style={{ margin: 0 }}>StatCard</h1>
      <div style={{ marginTop: 12, marginBottom: 40 }}>
        <P muted>
          Cartão de métrica: um número que importa, com contexto opcional. Existia à mão
          em quatro telas, sempre o mesmo desenho e sempre com hex cravado.
          6 accents × 2 sizes, mais delta, hint, footer, loading e modo clicável.
        </P>
      </div>

      {/* Uso real */}
      <Bloco>
        <Eyebrow>Uso real no projeto</Eyebrow>
        <Grade cols="repeat(3, 1fr)" style={{ marginTop: 'var(--space-3-5)' }}>
          {USO_REAL.map(u => <MetricaCard key={u.label} {...u} />)}
        </Grade>
      </Bloco>

      {/* Anatomia */}
      <Bloco>
        <Eyebrow>Anatomia</Eyebrow>
        <P muted>Label em eyebrow, ícone à direita, valor grande, delta, hint. Só o label e o valor são obrigatórios.</P>
        <div style={{ marginTop: 'var(--space-4)', maxWidth: 280 }}>
          <StatCard
            label="Faturamento do mês"
            value="R$ 4.280"
            icon="mdi:cash-multiple"
            accent="success"
            delta={{ value: '+12%', direction: 'up', label: 'vs. mês anterior' }}
            hint="19 pagamentos confirmados"
          />
        </div>
        <div style={{ marginTop: 'var(--space-4)' }}>
          <CodeBlock>{`<StatCard
  label="Faturamento do mês"
  value="R$ 4.280"
  icon="mdi:cash-multiple"
  accent="success"
  delta={{ value: '+12%', direction: 'up', label: 'vs. mês anterior' }}
  hint="19 pagamentos confirmados"
/>`}</CodeBlock>
        </div>
      </Bloco>

      {/* Accents */}
      <Bloco>
        <Eyebrow>Accents · escolha pelo significado</Eyebrow>
        <Grade style={{ marginTop: 'var(--space-4)' }}>
          <StatCard label="Contas ativas" value={25} icon="mdi:account-check" accent="primary" hint="pagantes em dia" />
          <StatCard label="Faturamento" value="R$ 4.280" icon="mdi:cash" accent="success" hint="receita reconhecida" />
          <StatCard label="Vencendo" value={3} icon="mdi:clock-alert-outline" accent="warning" hint="nos próximos 3 dias" />
          <StatCard label="Churn" value={13} icon="mdi:account-off" accent="danger" hint="já pagaram, hoje não" />
          <StatCard label="Em trial" value={0} icon="mdi:flask-outline" accent="info" hint="período de teste" />
          <StatCard label="Total de contas" value={107} icon="mdi:database" accent="neutral" hint="sem juízo de valor" />
        </Grade>
      </Bloco>

      {/* Delta */}
      <Bloco>
        <Eyebrow>Delta · direction é direção, tone é juízo</Eyebrow>
        <P muted>
          A seta segue <code>direction</code>. A cor segue <code>tone</code>. Em churn,
          subir é ruim — a seta continua apontando pra cima, só a cor muda.
        </P>
        <Grade style={{ marginTop: 'var(--space-4)' }}>
          <StatCard
            label="Receita" value="R$ 4.280" accent="success"
            delta={{ value: '+12%', direction: 'up', label: 'vs. mês anterior' }}
            hint="up sem tone → verde"
          />
          <StatCard
            label="Churn" value={13} accent="danger"
            delta={{ value: '+3', direction: 'up', tone: 'negative', label: 'vs. mês anterior' }}
            hint="up + tone negative → vermelho"
          />
          <StatCard
            label="Inadimplência" value="2%" accent="warning"
            delta={{ value: '-1,4pp', direction: 'down', tone: 'positive', label: 'vs. mês anterior' }}
            hint="down + tone positive → verde"
          />
          <StatCard
            label="Mensagens" value="3.052" accent="neutral"
            delta={{ value: 'estável', direction: 'flat', label: 'últimos 7 dias' }}
            hint="flat → cinza"
          />
        </Grade>
        <div style={{ marginTop: 'var(--space-4)' }}>
          <CodeBlock tone="proposta">{`// subir é ruim: seta pra cima, cor vermelha
delta={{ value: '+3', direction: 'up', tone: 'negative', label: 'vs. mês anterior' }}

// descer é bom: seta pra baixo, cor verde
delta={{ value: '-1,4pp', direction: 'down', tone: 'positive', label: 'vs. mês anterior' }}`}</CodeBlock>
        </div>
      </Bloco>

      {/* Tamanhos + tinted + footer */}
      <Bloco>
        <Eyebrow>Size, tinted e footer</Eyebrow>
        <Grade style={{ marginTop: 'var(--space-4)' }}>
          <StatCard size="sm" label="Conectados" value={71} icon="mdi:whatsapp" accent="success" hint="size sm" />
          <StatCard label="MRR" value="R$ 1.240" icon="mdi:repeat" accent="primary" tinted hint="tinted — um por tela" />
          <StatCard
            label="Uso do plano" value="412" accent="info"
            footer={
              <div style={{ height: 6, borderRadius: 999, backgroundColor: 'var(--neutral-200)', overflow: 'hidden' }}>
                <div style={{ width: '68%', height: '100%', backgroundColor: 'var(--info-500)' }} />
              </div>
            }
            hint="68% de 600 mensagens"
          />
        </Grade>
      </Bloco>

      {/* Loading */}
      <Bloco>
        <Eyebrow>Loading</Eyebrow>
        <P muted>Shimmer no lugar do número, com o card em posição — a fileira não pula quando os dados chegam.</P>
        <div style={{ marginTop: 'var(--space-3)', marginBottom: 'var(--space-4)' }}>
          <button
            type="button"
            onClick={() => setCarregando(v => !v)}
            style={{
              fontSize: 13, padding: '6px 14px', borderRadius: 'var(--radius-lg)',
              border: '1px solid var(--color-border-default)',
              backgroundColor: 'var(--color-bg-surface)', cursor: 'pointer',
            }}
          >
            {carregando ? 'Carregar dados' : 'Simular loading'}
          </button>
        </div>
        <Grade>
          <StatCard label="Contas ativas" value={25} accent="primary" loading={carregando} hint="pagantes em dia" />
          <StatCard label="Faturamento" value="R$ 4.280" accent="success" loading={carregando} hint="receita do mês" />
          <StatCard label="Churn" value={13} accent="danger" loading={carregando} hint="ex-pagantes" />
        </Grade>
      </Bloco>

      {/* Clicável */}
      <Bloco>
        <Eyebrow>Clicável · o clique abre a lista por trás do número</Eyebrow>
        <P muted>
          Vira <code>&lt;button&gt;</code>. Só use quando houver mesmo para onde ir —
          card clicável que não navega é botão morto.
        </P>
        <Grade style={{ marginTop: 'var(--space-4)' }}>
          <StatCard label="Contas ativas" value={25} icon="mdi:account-check" accent="primary" onClick={() => setClicado('ativo')} hint="clique para filtrar" />
          <StatCard label="Churn" value={13} icon="mdi:account-off" accent="danger" onClick={() => setClicado('churn')} hint="clique para filtrar" />
          <StatCard label="Inadimplentes" value={2} icon="mdi:alert-circle-outline" accent="warning" onClick={() => setClicado('inadimplente')} hint="clique para filtrar" />
        </Grade>
        {clicado && (
          <div style={{
            marginTop: 'var(--space-3)', fontSize: 13, color: 'var(--color-text-secondary)',
            backgroundColor: 'var(--neutral-100)', border: '1px solid var(--neutral-200)',
            borderRadius: 'var(--radius-lg)', padding: 'var(--space-3)',
          }}>
            Navegaria para a lista de contas filtrada por <strong>{clicado}</strong>.
          </div>
        )}
      </Bloco>

      {/* Escopo */}
      <Bloco>
        <Eyebrow>Escopo · o que é StatCard vs o que NÃO é</Eyebrow>
        <P muted>Nem toda caixa com número é StatCard. Alguns padrões pertencem a outras peças.</P>
        <div style={{
          marginTop: 'var(--space-4)',
          border: '1px solid var(--color-border-subtle)',
          borderRadius: 'var(--radius-lg)',
          backgroundColor: 'var(--color-bg-surface)',
          overflow: 'hidden',
        }}>
          <div style={{
            display: 'grid', gridTemplateColumns: '1.2fr 1.2fr 1fr', gap: 'var(--space-4)',
            padding: 'var(--space-3) var(--space-5)', backgroundColor: 'var(--neutral-50)',
            borderBottom: '1px solid var(--color-border-subtle)',
          }}>
            {['Padrão', 'Onde aparece', 'Vai para'].map(h => (
              <div key={h} className="ds-text-eyebrow" style={{ color: 'var(--color-text-muted)' }}>{h}</div>
            ))}
          </div>
          {NAO_E_STATCARD.map((p, i) => (
            <div key={p.padrao} style={{
              display: 'grid', gridTemplateColumns: '1.2fr 1.2fr 1fr', gap: 'var(--space-4)',
              padding: 'var(--space-3) var(--space-5)', fontSize: 12, lineHeight: 1.5,
              borderBottom: i < NAO_E_STATCARD.length - 1 ? '1px solid var(--color-border-subtle)' : 'none',
            }}>
              <div style={{ color: 'var(--color-text-primary)' }}>{p.padrao}</div>
              <div style={{ color: 'var(--color-text-muted)' }}>{p.onde}</div>
              <div style={{ color: 'var(--color-text-secondary)', fontWeight: 600 }}>{p.vai}</div>
            </div>
          ))}
        </div>
      </Bloco>

      {/* Regras */}
      <Bloco>
        <Eyebrow>Regras de uso</Eyebrow>
        <Grade cols="repeat(auto-fit, minmax(280px, 1fr))" style={{ marginTop: 'var(--space-4)' }}>
          {REGRAS.map(r => <RegraCard key={r.titulo} titulo={r.titulo}>{r.body}</RegraCard>)}
        </Grade>
      </Bloco>
    </div>
  )
}
