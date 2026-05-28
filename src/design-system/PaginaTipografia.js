import React from 'react'

/* ============================================================
   /app/design-system/tipografia
   Hierarquia tipográfica Mensalli — Manrope canônica,
   ancorada nos tamanhos REAIS encontrados no código.
   ============================================================ */

const USO_REAL = [
  { tamanho: '14px', usos: 508, contexto: 'body padrão (dominante)' },
  { tamanho: '13px', usos: 464, contexto: 'denso (tabelas, forms)' },
  { tamanho: '12px', usos: 351, contexto: 'helper, caption' },
  { tamanho: '11px', usos: 186, contexto: 'eyebrow, timestamp' },
  { tamanho: '16px', usos: 189, contexto: 'iOS input fix + body L' },
  { tamanho: '15px', usos: 112, contexto: '⚠ valor "entre" — ruído' },
]

const PESOS = [
  { peso: 600, usos: 707, label: 'SemiBold — destaques/labels' },
  { peso: 500, usos: 326, label: 'Medium — body com ênfase' },
  { peso: 700, usos: 205, label: 'Bold — headings' },
  { peso: 800, usos: 48,  label: 'ExtraBold — hero/display' },
  { peso: 400, usos: 12,  label: 'Regular — body (implícito)' },
]

const HIERARQUIA = [
  {
    nome: 'Display', classe: 'ds-text-display',
    tamanho: '42px', peso: 800, lh: '1.1', tracking: '-0.025em',
    exemplo: 'Cobre mensalidades',
    uso: 'Hero de landing, onboarding. Raro no app autenticado.',
  },
  {
    nome: 'H1', classe: 'ds-text-h1',
    tamanho: '32px', peso: 700, lh: '1.2', tracking: '-0.02em',
    exemplo: 'Título da página',
    uso: 'Um por página. Dashboard, Clientes, Financeiro.',
  },
  {
    nome: 'H2', classe: 'ds-text-h2',
    tamanho: '24px', peso: 700, lh: '1.25', tracking: '-0.015em',
    exemplo: 'Título de seção',
    uso: 'Blocos dentro de uma página, modais grandes.',
  },
  {
    nome: 'H3', classe: 'ds-text-h3',
    tamanho: '20px', peso: 700, lh: '1.3', tracking: '-0.01em',
    exemplo: 'Título de card',
    uso: 'Cards com protagonismo, formulários seccionados.',
  },
  {
    nome: 'H4', classe: 'ds-text-h4',
    tamanho: '18px', peso: 600, lh: '1.4', tracking: 'normal',
    exemplo: 'Subtítulo',
    uso: 'Grupos dentro de cards, labels de destaque.',
  },
  {
    nome: 'Body L', classe: 'ds-text-body-lg',
    tamanho: '16px', peso: 400, lh: '1.6', tracking: 'normal',
    exemplo: 'Parágrafo em áreas espaçosas, conteúdo confortável.',
    uso: 'Onboarding, empty states, landing.',
  },
  {
    nome: 'Body', classe: 'ds-text-body',
    tamanho: '14px', peso: 400, lh: '1.55', tracking: 'normal',
    exemplo: 'Texto padrão do Mensalli. Denso, legível, produtivo.',
    uso: 'DEFAULT — body em qualquer lugar. 508 usos hoje.',
  },
  {
    nome: 'Body sm', classe: 'ds-text-body-sm',
    tamanho: '13px', peso: 400, lh: '1.5', tracking: 'normal',
    exemplo: 'Body super-denso — tabelas, listas, chat. Densidade máxima.',
    uso: 'Tabelas, listas longas. 464 usos hoje.',
  },
  {
    nome: 'Caption', classe: 'ds-text-caption',
    tamanho: '12px', peso: 500, lh: '1.4', tracking: 'normal',
    exemplo: 'Helper text, metadata, timestamps',
    uso: 'Datas, IDs, "há 3 dias", contadores.',
  },
  {
    nome: 'Eyebrow', classe: 'ds-text-eyebrow',
    tamanho: '11px', peso: 600, lh: '1.4', tracking: '0.08em',
    exemplo: 'NOME DA SEÇÃO',
    uso: 'Microtítulo acima de headers, organiza hierarquia sem gritar.',
  },
]

const REGRAS = [
  { titulo: 'Nunca abaixo de 11px', body: 'Eyebrow é o mínimo legível. Abaixo, questione se o conteúdo é mesmo necessário.' },
  { titulo: 'Peso, não cor', body: 'Pra criar hierarquia, aumente o peso antes de obscurecer com cor. Manrope responde bem.' },
  { titulo: 'tracking negativo em ≥H3', body: 'Títulos grandes ficam "soltos" sem letter-spacing negativo. Aplica -0.01em→-0.025em em H3→Display.' },
  { titulo: 'leading-snug em títulos', body: 'H1/H2/H3 usam line-height 1.2-1.3 (snug). Body mantém 1.5+ (normal). Tudo respira certo.' },
  { titulo: 'Eyebrow acima de H1/H2', body: 'Microtítulo maiúsculo + cinza antes do H1 organiza sem competir visualmente.' },
  { titulo: 'Mono só pra valores', body: 'font-mono é pra hex, IDs, tokens, CPFs em tabela. Nunca pra texto corrido.' },
  { titulo: '15px morre, vira 14 ou 16', body: '112 ocorrências de 15px = sintoma de indecisão. Mais denso → 14. Mais confortável → 16. Sem meio-termo.' },
  { titulo: 'Body sm só em alta densidade', body: '13px usa em tabelas/listas (464 usos). Em forms isolados, prefere Body (14px). Não force densidade.' },
  { titulo: '400 é o default implícito', body: 'No JSX, omitir fontWeight = 400. Não polui o código com `fontWeight: 400`. Especifique só ≥500.' },
]

/* ----- Sub-componentes (reaproveitando padrão da PaginaCores) ----- */

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

function MetricaCard({ label, valor, sub, warning }) {
  return (
    <div style={{
      backgroundColor: warning ? 'var(--warning-50)' : 'var(--color-bg-surface)',
      border: `1px solid ${warning ? '#FFE0B2' : 'var(--color-border-subtle)'}`,
      borderRadius: 8, padding: 14,
    }}>
      <div className="ds-text-eyebrow" style={{ color: 'var(--color-text-muted)' }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 700, marginTop: 4, color: 'var(--color-text-primary)' }}>{valor}</div>
      <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 2 }}>{sub}</div>
    </div>
  )
}

function CardCallout({ tone = 'neutral', children }) {
  const bg = { neutral: 'var(--neutral-100)', warning: 'var(--warning-50)', success: 'var(--mensalli-green-50)', info: 'var(--info-50)' }[tone]
  const border = { neutral: 'var(--neutral-200)', warning: '#FFE0B2', success: 'var(--mensalli-green-200)', info: '#BBDEFB' }[tone]
  return (
    <div style={{
      backgroundColor: bg, border: `1px solid ${border}`,
      borderRadius: 8, padding: '14px 18px',
      fontSize: 13, lineHeight: 1.55, color: 'var(--color-text-primary)',
    }}>{children}</div>
  )
}

function CodeBlock({ children, tone = 'neutral' }) {
  const bg = tone === 'proposta' ? 'var(--mensalli-green-50)' : 'var(--neutral-100)'
  const border = tone === 'proposta' ? 'var(--mensalli-green-200)' : 'var(--neutral-200)'
  return (
    <pre style={{
      backgroundColor: bg, border: `1px solid ${border}`, borderRadius: 8,
      padding: 14, fontSize: 12, fontFamily: 'var(--font-mono)',
      color: 'var(--color-text-primary)', overflowX: 'auto', lineHeight: 1.55, margin: 0,
    }}>{children}</pre>
  )
}

function RegraCard({ titulo, children }) {
  return (
    <div style={{
      backgroundColor: 'var(--color-bg-surface)',
      border: '1px solid var(--color-border-subtle)',
      borderRadius: 8, padding: 16,
    }}>
      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6, color: 'var(--color-text-primary)' }}>{titulo}</div>
      <div style={{ fontSize: 12, lineHeight: 1.55, color: 'var(--color-text-secondary)' }}>{children}</div>
    </div>
  )
}

/* ----- Página ----- */

export default function PaginaTipografia() {
  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 8 }}>
        <Eyebrow>Fundações · 02</Eyebrow>
        <Selo estado="em-revisao" />
      </div>
      <h1 className="ds-text-h1" style={{ margin: 0 }}>Tipografia</h1>
      <div style={{ marginTop: 12, marginBottom: 40 }}>
        <P muted>
          Inter em tudo, hierarquia ancorada no uso REAL. Body é 14px (denso, tipo Linear/Notion),
          não text-base genérico. 25 tamanhos viram 10 canônicos.
        </P>
      </div>

      {/* Uso real */}
      <Bloco>
        <Eyebrow>Uso real no projeto</Eyebrow>
        <P muted>Grep de `fontSize:` em src/ — por isso a escala é otimizada pro que já existe.</P>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 12, marginTop: 14 }}>
          {USO_REAL.map(u => (
            <MetricaCard
              key={u.tamanho}
              label={u.tamanho}
              valor={u.usos}
              sub={u.contexto}
              warning={u.tamanho === '15px'}
            />
          ))}
        </div>
      </Bloco>

      {/* O problema */}
      <Bloco>
        <Eyebrow>O que tá ruim hoje</Eyebrow>
        <CardCallout tone="warning">
          <ul style={{ margin: 0, paddingLeft: 20, lineHeight: 1.7 }}>
            <li><strong>25 tamanhos diferentes em uso</strong> (8 fariam todo o trabalho). Cada tela escolhe o próprio.</li>
            <li><strong>15px (112 usos) e 17px (11 usos)</strong> são valores "entre" — sintoma de indecisão entre 14 e 16.</li>
            <li><strong>Mistura de pesos</strong>: combinações tipo "13px + 600" e "14px + 700" significam a mesma coisa mas geram ruído visual.</li>
            <li><strong>fontSize inline em todo lugar</strong> — 1.500+ ocorrências de <code>fontSize:</code> hard-coded. Trocar fonte ou ajustar escala = revisar arquivo por arquivo.</li>
          </ul>
        </CardCallout>
      </Bloco>

      {/* Família */}
      <Bloco>
        <Eyebrow>Família tipográfica</Eyebrow>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 14 }}>
          <div style={{ border: '1px solid var(--color-border-subtle)', borderRadius: 8, padding: 20, backgroundColor: 'var(--color-bg-surface)' }}>
            <div className="ds-text-eyebrow" style={{ color: 'var(--color-text-muted)' }}>Sans · default</div>
            <div className="ds-text-display" style={{ margin: '8px 0', color: 'var(--color-text-primary)' }}>Inter</div>
            <div className="ds-text-body-sm" style={{ color: 'var(--color-text-secondary)' }}>
              Fonte do sistema premium. Otimizada pra interface densa,
              números legíveis em qualquer tamanho. Já carregada no projeto.
            </div>
            <div className="ds-text-caption" style={{ color: 'var(--color-text-muted)', marginTop: 12 }}>
              Pesos: 300 · 400 · 500 · 600 · 700
            </div>
          </div>
          <div style={{ border: '1px solid var(--color-border-subtle)', borderRadius: 8, padding: 20, backgroundColor: 'var(--color-bg-surface)' }}>
            <div className="ds-text-eyebrow" style={{ color: 'var(--color-text-muted)' }}>Mono · uso específico</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 42, fontWeight: 600, margin: '8px 0', color: 'var(--color-text-primary)' }}>SF Mono</div>
            <div className="ds-text-body-sm" style={{ color: 'var(--color-text-secondary)' }}>
              Só pra valores numéricos: hexes, IDs, CPFs em tabela, tokens.
              Usa stack do sistema — zero request extra.
            </div>
            <div className="ds-text-caption" style={{ color: 'var(--color-text-muted)', marginTop: 12, fontFamily: 'var(--font-mono)' }}>
              #4CAF50 · 029.873.221-30
            </div>
          </div>
        </div>
      </Bloco>

      {/* Hierarquia canônica */}
      <Bloco>
        <Eyebrow>Hierarquia canônica</Eyebrow>
        <P muted>10 variants. Cada uma tem UMA combinação certa. Quando tiver dúvida "qual usar pra X?", consulta essa tabela.</P>
        <div style={{
          marginTop: 16,
          border: '1px solid var(--color-border-subtle)',
          borderRadius: 8,
          backgroundColor: 'var(--color-bg-surface)',
          overflow: 'hidden',
        }}>
          {HIERARQUIA.map((h, i) => (
            <div key={h.nome} style={{
              display: 'grid',
              gridTemplateColumns: '90px 1fr 280px',
              gap: 16,
              padding: '18px 20px',
              borderTop: i > 0 ? '1px solid var(--color-border-subtle)' : 'none',
              alignItems: 'baseline',
            }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-primary)' }}>{h.nome}</div>
                <div className="ds-text-caption" style={{ color: 'var(--color-text-muted)', fontFamily: 'var(--font-mono)' }}>
                  {h.tamanho} · {h.peso}
                </div>
              </div>
              <div className={h.classe} style={{ color: 'var(--color-text-primary)' }}>
                {h.exemplo}
              </div>
              <div>
                <code style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--color-text-muted)', backgroundColor: 'var(--neutral-100)', padding: '2px 6px', borderRadius: 4 }}>
                  .{h.classe}
                </code>
                <div className="ds-text-caption" style={{ color: 'var(--color-text-secondary)', marginTop: 6 }}>
                  {h.uso}
                </div>
              </div>
            </div>
          ))}
        </div>
      </Bloco>

      {/* Pesos */}
      <Bloco>
        <Eyebrow>Pesos em uso (Inter)</Eyebrow>
        <P muted>Contagem real de `fontWeight:` no código. 600 domina porque inline styles destacam — mas 400 está em todo body implícito.</P>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12, marginTop: 14 }}>
          {PESOS.map(p => (
            <div key={p.peso} style={{
              border: '1px solid var(--color-border-subtle)',
              borderRadius: 8, padding: 14,
              backgroundColor: 'var(--color-bg-surface)',
            }}>
              <div style={{ fontSize: 28, fontWeight: p.peso, color: 'var(--color-text-primary)' }}>Aa</div>
              <div className="ds-text-caption" style={{ marginTop: 4, color: 'var(--color-text-muted)', fontFamily: 'var(--font-mono)' }}>{p.peso}</div>
              <div className="ds-text-caption" style={{ marginTop: 4, color: 'var(--color-text-secondary)' }}>{p.label}</div>
              <div className="ds-text-caption" style={{ marginTop: 6, color: 'var(--color-text-muted)' }}>{p.usos} usos</div>
            </div>
          ))}
        </div>
      </Bloco>

      {/* Como fica no código */}
      <Bloco>
        <Eyebrow>Como fica no código</Eyebrow>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 14 }}>
          <div>
            <div className="ds-text-eyebrow" style={{ color: 'var(--color-text-muted)', marginBottom: 6 }}>
              Hoje (inline, sem hierarquia)
            </div>
            <CodeBlock>{`<h1 style={{
  fontSize: 28,
  fontWeight: 700,
  lineHeight: 1.2
}}>Clientes</h1>

<div style={{ fontSize: 15 }}>
  Texto solto qualquer
</div>`}</CodeBlock>
          </div>
          <div>
            <div className="ds-text-eyebrow" style={{ color: 'var(--mensalli-green-700)', marginBottom: 6 }}>
              Proposta (classe canônica)
            </div>
            <CodeBlock tone="proposta">{`<h1 className="ds-text-h1">
  Clientes
</h1>

<p className="ds-text-body">
  Texto solto qualquer
</p>`}</CodeBlock>
          </div>
        </div>
        <div className="ds-text-caption" style={{ color: 'var(--color-text-muted)', marginTop: 10 }}>
          Classes vivem em <code style={{ fontFamily: 'var(--font-mono)' }}>tokens.css</code>. Componentes existentes continuam funcionando — adoção é gradual.
        </div>
      </Bloco>

      {/* Regras de ouro */}
      <Bloco>
        <Eyebrow>Regras de ouro</Eyebrow>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginTop: 14 }}>
          {REGRAS.map(r => (
            <RegraCard key={r.titulo} titulo={r.titulo}>{r.body}</RegraCard>
          ))}
        </div>
      </Bloco>

      {/* O que muda se aprovar */}
      <Bloco>
        <Eyebrow>O que muda se aprovar essa seção</Eyebrow>
        <CardCallout tone="success">
          <ul style={{ margin: 0, paddingLeft: 20, lineHeight: 1.7 }}>
            <li><strong>10 classes viram canônicas:</strong> <code>.ds-text-display</code> a <code>.ds-text-eyebrow</code> + <code>.ds-text-mono</code> em <code>tokens.css</code>.</li>
            <li><strong>Inter continua sendo a fonte oficial</strong> — já carregada com preconnect, melhor pra números densos.</li>
            <li><strong>Migração natural:</strong> componentes novos usam classes. Telas existentes migram quando forem tocadas, sem PR gigante.</li>
            <li><strong>Backward-compat 100%:</strong> nenhum <code>fontSize</code> inline atual quebra.</li>
            <li><strong>Próxima etapa:</strong> Espaço & Sombra (formalizar grid 4pt e radius canônicos).</li>
          </ul>
        </CardCallout>
      </Bloco>
    </div>
  )
}
