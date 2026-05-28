import React from 'react'
import { showSuccess, showError, showWarning, showInfo } from '../Toast'
import Button from './components/Button'

/* ============================================================
   /app/design-system/toast
   Sistema de toast já canônico no projeto + helpers nomeados.
   ============================================================ */

const USO_REAL = [
  { label: 'showToast()', valor: '~30 chamadas', sub: 'em formularios, ações' },
  { label: '4 types', valor: 'success/error/warning/info', sub: 'cobertura completa' },
  { label: 'Auto-dismiss', valor: '4s', sub: 'configurável no Toast.js' },
  { label: 'Posição', valor: 'top-end', sub: 'mobile: top-stretch' },
]

const TYPES = [
  { type: 'success', label: 'Sucesso', cor: '#4CAF50', uso: 'Salvou, enviou, criou. Auto-dismiss 4s OK.', exemplo: 'Cliente salvo com sucesso!' },
  { type: 'error',   label: 'Erro',    cor: '#f44336', uso: 'Falhou. Mensagem deve dizer COMO RESOLVER ("Verifique sua conexão").', exemplo: 'Falha ao salvar — verifique sua conexão' },
  { type: 'warning', label: 'Aviso',   cor: '#ff9800', uso: 'Algo a observar, não bloqueante. "Alterações não salvas".', exemplo: 'Você tem alterações não salvas' },
  { type: 'info',    label: 'Info',    cor: '#2196F3', uso: 'Novidade, dica, contexto. Use com parcimônia — vira ruído.', exemplo: 'Nova versão disponível' },
]

const REGRAS = [
  { titulo: 'Mensagem curta + útil', body: 'Toast tem 2-5 palavras de título OU 1 frase. "Erro" sozinho é péssimo — "Falha ao salvar — verifique conexão" ajuda.' },
  { titulo: 'Error diz COMO resolver', body: '"Falhou" é péssimo. "Falha ao salvar — verifique sua conexão e tente novamente" guia o usuário.' },
  { titulo: 'Success curto, não espalha', body: 'Sucesso auto-dismiss 4s. Usuário não quer saber que deu certo, não tem urgência. Não use parágrafo.' },
  { titulo: '1 toast por ação', body: 'Disparar 3 toasts em sequência pela mesma ação polui. Consolida em 1 ou mostra inline.' },
  { titulo: 'Toast ≠ Modal', body: 'Toast é passageiro, some sozinho. Se a info precisa atenção prolongada, use Modal ou inline.' },
  { titulo: 'Nunca toast pra form', body: 'Erro de validação num form (CPF inválido) vai INLINE no campo (Input error prop), nunca em toast.' },
  { titulo: 'Posição fixa, não move', body: 'Top-right desktop, top-stretch mobile. Não mude por contexto — usuário aprende onde olhar.' },
  { titulo: 'Empilha vertical', body: 'Toasts simultâneos empilham gap-2. Mais recente em cima. Auto-dismiss em ordem.' },
  { titulo: 'Z-index 10001 (alto)', body: 'Toast SEMPRE em cima de modal. Modal abre, ação dispara erro — toast precisa aparecer sobre o modal.' },
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
      <div style={{ fontSize: 16, fontWeight: 700, marginTop: 4, color: 'var(--color-text-primary)' }}>{valor}</div>
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

export default function PaginaToast() {
  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 8 }}>
        <Eyebrow>Moléculas · 03</Eyebrow>
        <Selo estado="em-revisao" />
      </div>
      <h1 className="ds-text-h1" style={{ margin: 0 }}>Toast</h1>
      <div style={{ marginTop: 12, marginBottom: 40 }}>
        <P muted>
          Sistema já canônico em <code>src/Toast.js</code> — pub/sub global, auto-dismiss 4s, 4 types.
          Adicionei helpers nomeados (<code>showSuccess</code>, <code>showError</code>, etc) pra ergonomia.
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
            <strong>Bom já existe — só formalizar.</strong> <code>Toast.js</code> tem sistema completo. Mudança proposta:
            adicionar helpers nomeados (<code>showSuccess</code> em vez de <code>showToast(msg, 'success')</code>) +
            documentar boas práticas.
          </CardCallout>
        </div>
      </Bloco>

      {/* 4 types ao vivo */}
      <Bloco>
        <Eyebrow>4 types · clica pra disparar (canto superior direito)</Eyebrow>
        <Card>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 'var(--space-3)' }}>
            <Button variant="primary" icon="mdi:check-circle" onClick={() => showSuccess('Cliente salvo com sucesso!')}>
              showSuccess
            </Button>
            <Button variant="danger" icon="mdi:alert-circle" onClick={() => showError('Falha ao salvar — verifique sua conexão')}>
              showError
            </Button>
            <Button variant="outline" icon="mdi:alert" onClick={() => showWarning('Você tem alterações não salvas')}>
              showWarning
            </Button>
            <Button variant="outline" icon="mdi:information" onClick={() => showInfo('Nova versão disponível em /atualizar')}>
              showInfo
            </Button>
          </div>
          <div style={{ marginTop: 'var(--space-4)', fontSize: 11, color: 'var(--color-text-muted)' }}>
            Pode disparar vários em sequência — empilha vertical, auto-dismiss em 4s cada.
          </div>
        </Card>
      </Bloco>

      {/* Tabela quando usar */}
      <Bloco>
        <Eyebrow>Quando usar cada type</Eyebrow>
        <div style={{
          marginTop: 'var(--space-4)',
          border: '1px solid var(--color-border-subtle)',
          borderRadius: 'var(--radius-lg)',
          backgroundColor: 'var(--color-bg-surface)',
          overflow: 'hidden',
        }}>
          {TYPES.map((t, i) => (
            <div key={t.type} style={{
              display: 'grid',
              gridTemplateColumns: '100px 100px 1fr 1fr',
              gap: 'var(--space-4)',
              padding: 'var(--space-3) var(--space-5)',
              borderTop: i > 0 ? '1px solid var(--color-border-subtle)' : 'none',
              alignItems: 'center',
            }}>
              <code style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--color-text-secondary)' }}>{t.type}</code>
              <span style={{ fontSize: 13, fontWeight: 600, color: t.cor }}>{t.label}</span>
              <span style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>{t.uso}</span>
              <code style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--color-text-muted)' }}>"{t.exemplo}"</code>
            </div>
          ))}
        </div>
      </Bloco>

      {/* Como usar */}
      <Bloco>
        <Eyebrow>Como usar</Eyebrow>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-4)', marginTop: 'var(--space-3-5)' }}>
          <div>
            <div className="ds-text-eyebrow" style={{ color: 'var(--color-text-muted)', marginBottom: 6 }}>
              Hoje (genérico)
            </div>
            <CodeBlock>{`import { showToast } from './Toast'

showToast('Salvou!', 'success')
showToast('Erro', 'error')
showToast('Atenção', 'warning')
showToast('Dica', 'info')

// type como string é fácil de errar
// ('sucess' bug silencioso → vira success default)`}</CodeBlock>
          </div>
          <div>
            <div className="ds-text-eyebrow" style={{ color: 'var(--mensalli-green-700)', marginBottom: 6 }}>
              Proposta · helpers nomeados
            </div>
            <CodeBlock tone="proposta">{`import {
  showSuccess,
  showError,
  showWarning,
  showInfo,
} from './Toast'

showSuccess('Cliente salvo!')
showError('Falha — verifique conexão')
showWarning('Alterações não salvas')
showInfo('Nova versão disponível')

// type é a FUNÇÃO — autocomplete IDE
// Impossível errar como string`}</CodeBlock>
          </div>
        </div>
      </Bloco>

      {/* Pattern composto: error com retry */}
      <Bloco>
        <Eyebrow>Pattern composto · ações que podem retry</Eyebrow>
        <P muted>Pra requests que falharam, toast com mensagem + retry inline é melhor que só showError genérico.</P>
        <Card style={{ marginTop: 'var(--space-3-5)' }}>
          <Button
            variant="primary"
            icon="mdi:cloud-upload"
            onClick={() => {
              showError('Falha ao enviar — tentando novamente em 5s')
              setTimeout(() => showSuccess('Enviado com sucesso!'), 3000)
            }}
          >
            Simular envio com falha + retry automático
          </Button>
          <div style={{ marginTop: 'var(--space-3)', fontSize: 11, color: 'var(--color-text-muted)' }}>
            Mostra error → 3s depois mostra success. Padrão pra integrações async (n8n, WhatsApp, ViaCEP).
          </div>
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

      {/* O que muda */}
      <Bloco>
        <Eyebrow>O que muda se aprovar essa seção</Eyebrow>
        <CardCallout tone="success">
          <ul style={{ margin: 0, paddingLeft: 20, lineHeight: 1.7 }}>
            <li><strong>4 helpers nomeados</strong> em <code>src/Toast.js</code>: <code>showSuccess</code>, <code>showError</code>, <code>showWarning</code>, <code>showInfo</code>.</li>
            <li><strong>showToast(msg, type) continua funcionando</strong> — backward-compat 100%.</li>
            <li><strong>Toast.tsx em si fica intacto</strong> — apenas adicionou 4 funções helpers no fim do arquivo.</li>
            <li><strong>Próxima etapa:</strong> Table (Moléculas · 04 — 17 tabelas no projeto, BulkActions + Skeleton + responsive).</li>
          </ul>
        </CardCallout>
      </Bloco>
    </div>
  )
}
