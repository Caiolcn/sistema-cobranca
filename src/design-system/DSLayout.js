import React from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import './tokens.css'

/* Sumário do DS — espelha a estrutura proposta inspirada no Krooa.
   Estado: 'aprovado' | 'em-revisao' | 'nao-revisado'.
   Páginas marcadas como nao-revisado ainda não foram desenhadas. */
const SECOES = [
  {
    grupo: 'Introdução',
    itens: [
      { slug: 'sobre', titulo: 'Sobre o DS', estado: 'em-revisao' },
    ],
  },
  {
    grupo: 'Fundações',
    itens: [
      { slug: 'cores', titulo: 'Cores', estado: 'em-revisao' },
      { slug: 'tipografia', titulo: 'Tipografia', estado: 'em-revisao' },
      { slug: 'espaco-sombra', titulo: 'Espaço & Sombra', estado: 'em-revisao' },
      { slug: 'motion', titulo: 'Motion', estado: 'em-revisao' },
    ],
  },
  {
    grupo: 'Átomos',
    itens: [
      { slug: 'button', titulo: 'Button', estado: 'em-revisao' },
      { slug: 'input', titulo: 'Input', estado: 'em-revisao' },
      { slug: 'select', titulo: 'Select', estado: 'em-revisao' },
      { slug: 'checkbox-radio', titulo: 'Checkbox & Radio', estado: 'em-revisao' },
      { slug: 'switch', titulo: 'Switch', estado: 'em-revisao' },
      { slug: 'badge', titulo: 'Badge', estado: 'em-revisao' },
      { slug: 'avatar', titulo: 'Avatar', estado: 'em-revisao' },
    ],
  },
  {
    grupo: 'Moléculas',
    itens: [
      { slug: 'card', titulo: 'Card', estado: 'em-revisao' },
      { slug: 'modal', titulo: 'Modal', estado: 'em-revisao' },
      { slug: 'toast', titulo: 'Toast', estado: 'em-revisao' },
      { slug: 'table', titulo: 'Table', estado: 'em-revisao' },
      { slug: 'tabs', titulo: 'Tabs', estado: 'em-revisao' },
      { slug: 'dropdown', titulo: 'Dropdown', estado: 'em-revisao' },
      { slug: 'empty-state', titulo: 'Empty State', estado: 'em-revisao' },
    ],
  },
  {
    grupo: 'Padrões Mensalli',
    itens: [
      { slug: 'cliente-identity', titulo: 'ClienteIdentity', estado: 'em-revisao' },
      { slug: 'cobranca-status', titulo: 'CobrancaStatus', estado: 'em-revisao' },
      { slug: 'plano-card', titulo: 'PlanoCard', estado: 'em-revisao' },
      { slug: 'wizard-stepper', titulo: 'WizardStepper', estado: 'em-revisao' },
    ],
  },
]

const corPorEstado = {
  'aprovado':     'var(--mensalli-green-500)',
  'em-revisao':   'var(--warning-500)',
  'nao-revisado': 'var(--neutral-400)',
}

function PontoEstado({ estado }) {
  return (
    <span
      title={estado}
      style={{
        display: 'inline-block',
        width: 8,
        height: 8,
        borderRadius: '50%',
        backgroundColor: corPorEstado[estado],
        marginRight: 10,
        flexShrink: 0,
      }}
    />
  )
}

export default function DSLayout() {
  const location = useLocation()
  const slugAtivo = location.pathname.split('/').pop()

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '260px 1fr',
        minHeight: '100vh',
        backgroundColor: 'var(--color-bg-page)',
        fontFamily: 'var(--font-sans)',
        color: 'var(--color-text-primary)',
      }}
    >
      {/* Sidebar */}
      <aside
        style={{
          backgroundColor: 'var(--color-bg-surface)',
          borderRight: '1px solid var(--color-border-subtle)',
          padding: '24px 16px',
          position: 'sticky',
          top: 0,
          alignSelf: 'start',
          height: '100vh',
          overflowY: 'auto',
        }}
      >
        <div style={{ padding: '0 8px 24px', borderBottom: '1px solid var(--color-border-subtle)', marginBottom: 16 }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--color-text-primary)' }}>
            Mensalli DS
          </div>
          <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 2 }}>
            v0.1 · em construção
          </div>
        </div>

        {SECOES.map((grupo) => (
          <div key={grupo.grupo} style={{ marginBottom: 20 }}>
            <div
              style={{
                fontSize: 10,
                fontWeight: 600,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color: 'var(--color-text-muted)',
                padding: '0 8px 8px',
              }}
            >
              {grupo.grupo}
            </div>
            {grupo.itens.map((item) => {
              const ativo = item.slug === slugAtivo
              const desabilitado = item.estado === 'nao-revisado'
              return (
                <NavLink
                  key={item.slug}
                  to={`/app/design-system/${item.slug}`}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    padding: '7px 8px',
                    borderRadius: 6,
                    fontSize: 13,
                    textDecoration: 'none',
                    color: ativo
                      ? 'var(--color-brand)'
                      : desabilitado
                      ? 'var(--color-text-muted)'
                      : 'var(--color-text-secondary)',
                    backgroundColor: ativo ? 'var(--mensalli-green-50)' : 'transparent',
                    fontWeight: ativo ? 600 : 500,
                    cursor: desabilitado ? 'not-allowed' : 'pointer',
                    transition: 'background-color 150ms ease-out, color 150ms ease-out',
                  }}
                  onClick={(e) => {
                    if (desabilitado) e.preventDefault()
                  }}
                >
                  <PontoEstado estado={item.estado} />
                  {item.titulo}
                </NavLink>
              )
            })}
          </div>
        ))}
      </aside>

      {/* Conteúdo */}
      <main style={{ padding: '40px 56px', maxWidth: 980, margin: '0 auto', width: '100%' }}>
        <Outlet />
      </main>
    </div>
  )
}
