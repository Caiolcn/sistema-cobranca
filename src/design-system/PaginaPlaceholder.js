import React from 'react'
import { useParams, Link } from 'react-router-dom'

export default function PaginaPlaceholder() {
  const { slug } = useParams()
  return (
    <div style={{ maxWidth: 540 }}>
      <div style={{
        fontSize: 11,
        fontWeight: 600,
        letterSpacing: '0.1em',
        textTransform: 'uppercase',
        color: 'var(--color-text-muted)',
        marginBottom: 8,
      }}>
        Não revisado
      </div>
      <h1 style={{ fontSize: 32, fontWeight: 700, margin: '0 0 16px' }}>
        {slug ? slug.replace(/-/g, ' ').replace(/^\w/, c => c.toUpperCase()) : 'Seção'}
      </h1>
      <p style={{ fontSize: 14, color: 'var(--color-text-secondary)', lineHeight: 1.55, marginBottom: 24 }}>
        Esta seção ainda não foi desenhada. O DS Mensalli é um museu vivo: cada peça é
        proposta, revisada e aprovada antes de ser considerada canônica.
      </p>
      <Link to="/app/design-system/cores" style={{
        display: 'inline-block',
        padding: '10px 16px',
        borderRadius: 8,
        backgroundColor: 'var(--color-brand)',
        color: 'var(--color-text-on-brand)',
        fontSize: 13,
        fontWeight: 600,
        textDecoration: 'none',
      }}>
        Ver Cores →
      </Link>
    </div>
  )
}
